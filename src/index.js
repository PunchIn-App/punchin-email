import { EmailMessage } from 'cloudflare:email';
import {
  THREAD_TTL_SECONDS,
  generateId,
  parseRelayThreadId,
  isAllowedAlias,
  addressesEqual,
  isAutoSubmitted,
  rewriteHeaders,
} from './lib.js';

/**
 * Inbound handler — called for the alias addresses listed in
 * env.ALLOWED_ALIASES (e.g. cla@, licensing@, cve@, abuse@), including
 * any +subaddress variant.
 *
 * Stores a thread mapping in KV and forwards to your Gmail with a Reply-To
 * that encodes the thread id, so the relay handler can look it up on the way
 * back out.
 */
export async function handleInbound(message, env) {
  // Only forward addresses we actually own. Anything else is rejected at SMTP
  // time (the sender's server gets a bounce) so the worker can't be used as an
  // open forwarder. The reject reason points senders at a real contact URL.
  if (!isAllowedAlias(message.to, env.ALLOWED_ALIASES)) {
    const contact = env.CONTACT_URL || `https://${env.RELAY_DOMAIN}`;
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

  await message.forward(env.FORWARD_TO, new Headers({ 'Reply-To': replyTo }));
}

/**
 * Relay handler — called when you reply in Gmail and the mail lands on
 * relay+{threadId}@trackmytime.today. This handler:
 *   1. Verifies the reply actually came from the inbox owner
 *   2. Looks up the thread in KV
 *   3. Rewrites From/To so the mail goes out from your alias
 *   4. Sends via Cloudflare Email Sending
 */
export async function handleRelay(message, env) {
  // Only the inbox owner may drive the relay. Without this check, anyone who
  // learned a thread id could send mail *from* your alias to the original
  // sender — an open relay / spoofing vector.
  if (!addressesEqual(message.from, env.FORWARD_TO)) {
    message.setReject('Unauthorized relay sender');
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

  const { aliasEmail, originalSender } = JSON.parse(stored);

  const rawText = await new Response(message.raw).text();
  const rewritten = rewriteHeaders(rawText, aliasEmail, originalSender);

  const outbound = new EmailMessage(aliasEmail, originalSender, rewritten);
  await env.EMAIL_SENDING.send(outbound);
}

export default {
  async email(message, env) {
    const to = (message.to || '').toLowerCase();

    if (to.startsWith('relay+')) {
      await handleRelay(message, env);
    } else {
      await handleInbound(message, env);
    }
  },
};
