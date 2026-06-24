import { EmailMessage } from 'cloudflare:email';
import {
  THREAD_TTL_SECONDS,
  generateId,
  parseRelayThreadId,
  isAllowedAlias,
  addressesEqual,
  isAutoSubmitted,
  relayReplyAuthVerdict,
  senderDomainOf,
  rewriteHeaders,
  inboundFromHeader,
} from './lib.js';
import { getSettings } from './settings.js';
import { authenticateAdmin } from './access.js';
import { handleAdminRequest } from './admin.js';

/**
 * Inbound handler — called for the alias addresses in the effective settings
 * (e.g. cla@, licensing@, cve@, abuse@), including any +subaddress variant.
 *
 * Stores a thread mapping in KV and **sends** the mail to the configured inbox
 * (it does not `forward()` it) with a Reply-To that encodes the thread id, so
 * the relay handler can look it up on the way back out.
 *
 * Why send, not forward (the doxxing fix): `message.forward()`
 * silently drops any added `Reply-To` header, and even on a send path the
 * `rewriteHeaders` allowlist strips an inbound `Reply-To`. With `forward()` the
 * inbox owner's reply therefore went straight to the original sender's own
 * address — exposing the owner's real inbox address to a stranger. Sending lets
 * us set BOTH the From and the Reply-To to relay-controlled addresses:
 *   - From: `"<sender> via PunchIn" <alias@RELAY_DOMAIN>` — the alias the sender
 *     wrote to (sender shown in the display name so the owner still sees who).
 *   - Reply-To: `relay+<id>@RELAY_DOMAIN`.
 * Either way the owner's reply re-enters `handleRelay`, which re-masks it, so
 * the owner's address never reaches the original sender. The `relay+<id>` value
 * leaks nothing about the inbox (it is a server-minted random id, not sender
 * data), so injecting it as a Reply-To is safe. DKIM/DMARC align on
 * `RELAY_DOMAIN` because both the envelope and header From are alias addresses.
 */
export async function handleInbound(message, env) {
  const settings = await getSettings(env);

  // Only forward addresses we actually own. Anything else is rejected at SMTP
  // time (the sender's server gets a bounce) so the worker can't be used as an
  // open forwarder. The reject reason points senders at a real contact URL.
  if (!isAllowedAlias(message.to, settings.allowedAliases)) {
    const contact = settings.contactUrl || `https://${env.RELAY_DOMAIN}`;
    message.setReject(`No such address at ${env.RELAY_DOMAIN}. See ${contact}`);
    return;
  }

  const threadId = generateId();

  await env.EMAIL_THREADS.put(
    threadId,
    JSON.stringify({
      originalSender: message.from, // envelope sender
      aliasEmail: message.to, // full address, preserving +subaddress
      timestamp: Date.now(),
    }),
    { expirationTtl: THREAD_TTL_SECONDS }
  );

  const replyTo = `relay+${threadId}@${env.RELAY_DOMAIN}`;
  const fromHeader = inboundFromHeader(message.from, message.to);

  const rawText = await new Response(message.raw).text();
  const rewritten = rewriteHeaders(rawText, fromHeader, settings.forwardTo, replyTo);

  // Envelope From is the bare alias (a verified RELAY_DOMAIN address); the
  // display name lives only in the rewritten From header.
  await env.EMAIL_SENDING.send(new EmailMessage(message.to, settings.forwardTo, rewritten));
}

/**
 * Relay handler — called when the inbox owner replies and the mail lands on
 * relay+{threadId}@trackmytime.today. This handler:
 *   1. Verifies the reply actually came from the inbox owner
 *   2. Looks up the thread in KV
 *   3. Rewrites From/To so the mail goes out from the alias
 *   4. Sends via Cloudflare Email Sending
 */
export async function handleRelay(message, env) {
  const settings = await getSettings(env);

  // Only the inbox owner may drive the relay. Without this check, anyone who
  // learned a thread id could send mail *from* an alias to the original
  // sender — an open relay / spoofing vector.
  if (!addressesEqual(message.from, settings.forwardTo)) {
    message.setReject('Unauthorized relay sender');
    return;
  }

  // Defence-in-depth on the From == FORWARD_TO gate (issue #31): that gate trusts
  // the unauthenticated header sender, so additionally consult the SPF/DKIM/DMARC
  // verdict our receiving MX (Cloudflare) stamped on the reply and refuse to
  // relay one that demonstrably did NOT authenticate as the FORWARD_TO domain.
  // Conservative / fail-open: we only act on Cloudflare's own strip-protected
  // authserv-id, so an absent or unrecognised verdict still relays and a header
  // format we don't recognise never bounces legitimate mail. Log only the
  // verdict + authserv-id (never addresses/body) so the exact Cloudflare header
  // can be confirmed from `wrangler tail` (issue #34).
  const auth = relayReplyAuthVerdict(message.headers, senderDomainOf(settings.forwardTo));
  console.log('punchin-email: relay auth verdict:', auth.verdict, auth.authservId || '(none)');
  if (auth.verdict === 'fail') {
    message.setReject('Relay reply failed sender authentication');
    return;
  }

  // Never relay an auto-reply / bounce back out — prevents mail loops.
  if (isAutoSubmitted(message.headers)) {
    message.setReject('Auto-submitted mail is not relayed');
    return;
  }

  const threadId = parseRelayThreadId(message.to);
  if (!threadId) {
    message.setReject('Malformed relay address');
    return;
  }

  const stored = await env.EMAIL_THREADS.get(threadId);
  if (!stored) {
    // Thread expired or never existed — bounce gracefully.
    message.setReject('Thread not found or expired (30-day limit)');
    return;
  }

  let mapping;
  try {
    mapping = JSON.parse(stored);
  } catch {
    // A record that won't parse now will never parse on retry — bounce cleanly
    // with a clear reason instead of throwing into Cloudflare's retry loop on a
    // poison record (issue #34).
    message.setReject('Thread record could not be read');
    return;
  }
  const { aliasEmail, originalSender } = mapping;

  const rawText = await new Response(message.raw).text();
  const rewritten = rewriteHeaders(rawText, aliasEmail, originalSender);

  const outbound = new EmailMessage(aliasEmail, originalSender, rewritten);
  await env.EMAIL_SENDING.send(outbound);

  // Refresh the thread's TTL on each successful relay so an actively used thread
  // never ages out from under the participants; idle threads still expire 30
  // days after their last activity (issue #32). The refresh also stamps
  // `lastRelayedAt` so an operator inspecting the KV record can tell a thread
  // active an hour ago from one idle since creation — the record's `timestamp`
  // is frozen at creation and never moves (issue #75). Routing reads only
  // `aliasEmail` / `originalSender`, so the added field is purely diagnostic and
  // behaviour-neutral; pre-existing records gain it on their next successful
  // relay (no migration). Best-effort: a refresh failure must not fail the
  // already-sent relay (and trigger a retry that double-sends), so it is swallowed.
  try {
    const refreshed = JSON.stringify({ ...mapping, lastRelayedAt: Date.now() });
    await env.EMAIL_THREADS.put(threadId, refreshed, { expirationTtl: THREAD_TTL_SECONDS });
  } catch {
    // ignore — the mapping simply keeps its prior expiry
  }
}

export default {
  async email(message, env) {
    try {
      const to = (message.to || '').toLowerCase();

      if (to.startsWith('relay+')) {
        await handleRelay(message, env);
      } else {
        await handleInbound(message, env);
      }
    } catch (err) {
      // Transient infra failures (KV outage, send quota, network blip) are best
      // resolved by Cloudflare retrying the message — which a thrown error
      // surfaces as a temp-failure. Calling setReject() here would convert a
      // retriable hiccup into a permanent bounce and lose legitimate mail, so we
      // deliberately re-throw rather than swallow. Genuinely permanent
      // conditions (unknown alias, corrupt thread record, auto-submitted, bad
      // relay address) are already rejected inside the handlers with an explicit
      // setReject and never reach here. We log only the error name — never the
      // message, addresses, or body — to avoid leaking PII (issue #34).
      console.error('punchin-email: handler error, re-throwing for retry:', (err && err.name) || 'Error');
      throw err;
    }
  },

  // Admin UI + settings API. Every request is gated by Cloudflare Access
  // (authenticateAdmin fails closed if Access isn't configured).
  async fetch(request, env) {
    const auth = await authenticateAdmin(request, env);
    if (!auth.ok) {
      return new Response(auth.message, {
        status: auth.status,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    return handleAdminRequest(request, env, auth.identity);
  },
};
