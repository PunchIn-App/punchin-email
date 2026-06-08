// Pure, runtime-agnostic helpers for the PunchIn email worker.
//
// Nothing in this file imports Workers-only modules (e.g. `cloudflare:email`),
// so it can be unit-tested directly under plain Node/Vitest.

export const THREAD_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Headers preserved on a relayed reply. This is an *allowlist*: only these
// headers survive the rewrite, and `From`/`To` are then prepended fresh. Using
// an allowlist (rather than stripping a denylist) guarantees that the relaying
// inbox's address and routing metadata never leak — Gmail attaches trace and
// authentication headers (`Received`, `Authentication-Results`, `ARC-*`,
// `X-Google-*`, `X-Gm-*`, `DKIM-Signature`, `Return-Path`, ...) that can carry
// the inbox's full address, and an allowlist drops all of them by default,
// including any future `X-` header we haven't seen yet.
//
// Kept: the headers a recipient's client needs to render and thread the reply.
const KEPT_HEADER_RE =
  /^(Subject|Date|Message-ID|In-Reply-To|References|MIME-Version|Content-Type|Content-Transfer-Encoding|Content-Disposition|Content-ID|Content-Description|Content-Language):/i;

/**
 * Generate a random 64-bit hex thread id (16 chars).
 * @param {(arr: Uint8Array) => Uint8Array} [getRandomValues] injectable for tests
 */
export function generateId(getRandomValues = (a) => crypto.getRandomValues(a)) {
  return Array.from(getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Extract the thread id from a relay recipient address.
 * `relay+<id>@domain` -> `<id>`, otherwise `null`.
 * @param {string} address
 * @returns {string | null}
 */
export function parseRelayThreadId(address) {
  if (!address) return null;
  // Anchor to exactly 16 hex chars — the length generateId emits — so a probe
  // with an other-length id can't match and trigger a KV lookup (issue #36).
  const match = String(address).match(/relay\+([a-f0-9]{16})@/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Return the base local-part of an address, lowercased and with any
 * `+subaddress` removed. `Cla+Foo@Example.com` -> `cla`.
 * @param {string} address
 */
export function baseLocalPart(address) {
  if (!address) return '';
  const local = String(address).split('@')[0];
  return local.split('+')[0].toLowerCase();
}

/**
 * Decide whether an inbound recipient is one of our allowed aliases.
 * `allowed` is a comma/space separated list of base local-parts.
 * @param {string} address full recipient address
 * @param {string} [allowed] e.g. "cla,licensing,cve,abuse"
 */
export function isAllowedAlias(address, allowed) {
  const set = new Set(
    String(allowed || '')
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  if (set.size === 0) return false;
  return set.has(baseLocalPart(address));
}

/**
 * Case-insensitive comparison of two email addresses (local + domain only,
 * ignoring display names and surrounding angle brackets).
 * @param {string} a
 * @param {string} b
 */
export function addressesEqual(a, b) {
  return normalizeAddress(a) === normalizeAddress(b) && normalizeAddress(a) !== '';
}

function normalizeAddress(value) {
  if (!value) return '';
  const s = String(value);
  // Pull the address out of "Display Name <addr@host>" if present. Use index
  // scans rather than a regex: matching `<([^>]+)>` re-anchors at every `<`, so
  // a crafted header value (e.g. "<<<<<…") forces O(n^2) backtracking — a
  // polynomial-ReDoS vector on attacker-influenced header data. indexOf is O(n).
  const lt = s.indexOf('<');
  const gt = lt === -1 ? -1 : s.indexOf('>', lt + 1);
  const inner = gt > lt + 1 ? s.slice(lt + 1, gt) : s;
  return inner.trim().toLowerCase();
}

/**
 * Detect auto-generated mail (bounces, vacation responders, list traffic).
 * Used as defence-in-depth so the relay never bounces a robot back out.
 * @param {Headers | Map<string,string> | {get:(k:string)=>string|null}} headers
 */
export function isAutoSubmitted(headers) {
  const get = (k) => (headers && typeof headers.get === 'function' ? headers.get(k) : null);

  const autoSubmitted = (get('Auto-Submitted') || '').toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return true;

  const precedence = (get('Precedence') || '').toLowerCase();
  if (['bulk', 'list', 'auto_reply', 'auto_replied', 'junk'].includes(precedence)) return true;

  if (get('X-Autoreply') || get('X-Autorespond') || get('X-Autoresponder')) return true;

  if (get('X-Auto-Response-Suppress')) return true;

  // Mailing-list traffic (RFC 2369 List-* headers) is machine-generated; never
  // relay it back out (issue #35).
  if (get('List-Id') || get('List-Unsubscribe') || get('List-Help') || get('List-Post')) return true;

  return false;
}

// --- Relay sender authentication (defence-in-depth over From == FORWARD_TO) --

// authserv-id(s) we trust in an Authentication-Results / ARC-Authentication-
// Results header: our receiving MX (Cloudflare Email Routing) stamps its verdict
// under `mx.cloudflare.net`, and per RFC 8601 §5 a boundary MTA strips any
// inbound copy bearing its *own* authserv-id, so a sender can't forge this one.
// Only ids Cloudflare actually strip-protects belong here — never the customer
// (relay) domain, which a sender *could* spoof.
const TRUSTED_AUTHSERV_IDS = ['mx.cloudflare.net'];

/**
 * Domain part of an email address, lowercased: `Me@Gmail.com` -> `gmail.com`.
 * Tolerates a `Display <addr>` wrapper by trimming at the first `>`/space.
 * @param {string} address
 * @returns {string}
 */
export function senderDomainOf(address) {
  const at = String(address || '').lastIndexOf('@');
  if (at === -1) return '';
  let domain = String(address).slice(at + 1).trim().toLowerCase();
  // Cut at the first '>' or whitespace (a `Display <addr>` wrapper). Search for a
  // single character — no `.*` quantifier — so this can't be a ReDoS vector on a
  // value with many leading whitespace chars (CodeQL js/polynomial-redos).
  const cut = domain.search(/[>\s]/);
  return cut === -1 ? domain : domain.slice(0, cut);
}

// Split one Authentication-Results / ARC-Authentication-Results value into its
// authserv-id and the remaining result text. ARC values lead with an `i=<n>;`
// instance tag, which is stripped first.
function parseAuthResultsValue(value) {
  let s = String(value || '').trim();
  if (!s) return null;
  const arc = /^i=\d+\s*;\s*/i.exec(s);
  if (arc) s = s.slice(arc[0].length);
  const semi = s.indexOf(';');
  const idPart = (semi === -1 ? s : s.slice(0, semi)).trim();
  const authservId = idPart.split(/\s+/)[0].toLowerCase(); // drop an optional version number
  const body = semi === -1 ? '' : s.slice(semi + 1);
  return { authservId, body };
}

// Does a trusted auth-results body show an SPF/DKIM/DMARC pass that aligns with
// `dom` (the FORWARD_TO domain)? Parsed with linear string splits — never a
// dynamic regex over the attacker-influenced header — so it can't be a ReDoS
// vector. Each `;`-separated resinfo leads with `method=result`; we accept a
// `dmarc=pass` whose `header.from` is the sender domain, or a `dkim=pass` whose
// `header.d` is the sender domain or a subdomain of it.
function bodyShowsAlignedPass(body, dom) {
  for (const segment of String(body).split(';')) {
    const tokens = segment.trim().split(/\s+/);
    const [method, result] = (tokens[0] || '').toLowerCase().split('=');
    if (result !== 'pass') continue;
    if (method === 'dmarc') {
      if (tokens.some((t) => t.toLowerCase() === `header.from=${dom}`)) return true;
    } else if (method === 'dkim') {
      const aligned = tokens.some((t) => {
        const tl = t.toLowerCase();
        if (!tl.startsWith('header.d=')) return false;
        const d = tl.slice('header.d='.length);
        return d === dom || d.endsWith(`.${dom}`);
      });
      if (aligned) return true;
    }
  }
  return false;
}

/**
 * Decide whether a relay reply genuinely authenticated as `senderDomain` (the
 * FORWARD_TO domain), using the SPF/DKIM/DMARC verdict our receiving MX stamped
 * on it (issue #31). Defence-in-depth over the `From == FORWARD_TO` gate, which
 * trusts the unauthenticated envelope sender.
 *
 * Conservative and **fail-open**: we only act on a result set whose authserv-id
 * is one Cloudflare strip-protects (`TRUSTED_AUTHSERV_IDS`). A reply is `pass`
 * when that set shows `dmarc=pass` aligned to the sender domain (`header.from`)
 * or a `dkim=pass` whose `header.d` aligns; `fail` when the trusted set shows
 * neither; and `unknown` when no trusted set is present — in which case the
 * caller still relays, so legitimate mail is never bounced on a header we
 * didn't recognise.
 *
 * @param {{get:(k:string)=>string|null}} headers
 * @param {string} senderDomain the FORWARD_TO domain the reply must authenticate as
 * @param {string[]} [trusted] override the trusted authserv-id list (tests)
 * @returns {{ verdict: 'pass'|'fail'|'unknown', authservId: string|null }}
 */
export function relayReplyAuthVerdict(headers, senderDomain, trusted = TRUSTED_AUTHSERV_IDS) {
  const get = (k) => (headers && typeof headers.get === 'function' ? headers.get(k) : null);
  const dom = String(senderDomain || '').toLowerCase();
  if (!dom) return { verdict: 'unknown', authservId: null };

  const candidates = [get('Authentication-Results'), get('ARC-Authentication-Results')].filter(Boolean);
  for (const value of candidates) {
    const parsed = parseAuthResultsValue(value);
    if (!parsed || !trusted.includes(parsed.authservId)) continue;

    if (bodyShowsAlignedPass(parsed.body, dom)) return { verdict: 'pass', authservId: parsed.authservId };
    return { verdict: 'fail', authservId: parsed.authservId };
  }
  return { verdict: 'unknown', authservId: null };
}

// --- Validation helpers for the admin settings API -------------------------

/**
 * Loose RFC-5321-ish check that a string looks like a single email address.
 * Not a full parser — just enough to reject obviously bad input from the UI.
 * @param {string} value
 */
export function isValidEmailAddress(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v.length === 0 || v.length > 254 || /\s/.test(v)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(v);
}

/**
 * Normalize a list of allowed alias local-parts. Accepts an array or a
 * comma/space-separated string; returns a cleaned, de-duplicated, sorted
 * comma string of valid local-parts. Throws on an invalid token so the API
 * can report it.
 *
 * Rules: lowercase; only `a-z 0-9 . _ -`; no `+` (subaddressing is stripped
 * at match time); `relay` is reserved for the reply path and rejected.
 * @param {string|string[]} input
 * @returns {string}
 */
export function normalizeAliasList(input) {
  const tokens = Array.isArray(input) ? input : String(input || '').split(/[,\s]+/);
  const out = [];
  for (const tok of tokens) {
    const t = String(tok).trim().toLowerCase();
    if (t === '') continue;
    if (t === 'relay') throw new Error('"relay" is reserved for the reply path');
    if (!/^[a-z0-9._-]+$/.test(t)) {
      throw new Error(`Invalid alias "${tok}" (allowed: letters, digits, . _ -)`);
    }
    if (!out.includes(t)) out.push(t);
  }
  if (out.length === 0) throw new Error('At least one alias is required');
  return out.sort().join(',');
}

/**
 * Validate an optional contact URL. Empty is allowed (the worker falls back to
 * https://<RELAY_DOMAIN>). Non-empty must be a well-formed http(s) URL.
 * @param {string} value
 * @returns {string} the trimmed URL, or '' for empty
 */
export function normalizeContactUrl(value) {
  const v = String(value || '').trim();
  if (v === '') return '';
  let url;
  try {
    url = new URL(v);
  } catch {
    throw new Error('Contact URL must be a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Contact URL must be http(s)');
  }
  return v;
}

/**
 * Rewrite a raw RFC 2822 message for relaying: keep only the allowlisted
 * headers in KEPT_HEADER_RE (Subject, Message-ID, In-Reply-To, References,
 * Content-*, ... — enough to render and thread the reply), then prepend a
 * fresh From/To. Everything else, including the trace/authentication headers
 * that can leak the relaying inbox's address, is dropped.
 * Optionally inject a fresh `Reply-To` (the inbound path uses this to point the
 * inbox owner's reply back at `relay+<id>@RELAY_DOMAIN`). When `replyTo` is
 * omitted the rewrite adds no Reply-To at all — the relay (owner → original
 * sender) direction deliberately stays Reply-To-less so the original sender
 * replies to the bare alias and re-enters `handleInbound` (the documented
 * asymmetric threading model).
 * @param {string} rawText
 * @param {string} from
 * @param {string} to
 * @param {string} [replyTo] when set, a `Reply-To: <replyTo>` is added after To
 */
export function rewriteHeaders(rawText, from, to, replyTo) {
  // Normalize line endings to CRLF first so a message using bare LF (or CR)
  // separators parses the same as a CRLF one. Without this the `\r\n\r\n` split
  // misses on an LF-only message, every header is dropped, and the body is lost
  // (issue #37).
  const text = String(rawText).replace(/\r\n|\r|\n/g, '\r\n');

  const splitIdx = text.indexOf('\r\n\r\n');
  const headerBlock = splitIdx !== -1 ? text.slice(0, splitIdx) : text;
  const body = splitIdx !== -1 ? text.slice(splitIdx) : '\r\n\r\n';

  // Fold multi-line (continuation) headers into single lines before filtering
  // so a dropped header can't leave an orphaned continuation line behind.
  const unfolded = headerBlock.replace(/\r\n[ \t]+/g, ' ');

  const kept = unfolded
    .split('\r\n')
    .filter((line) => KEPT_HEADER_RE.test(line));

  // Strip CR/LF from the injected From/To/Reply-To values so a crafted alias /
  // sender address can't smuggle extra headers into the outbound message
  // (issue #27).
  const safe = (v) => String(v).replace(/[\r\n]/g, '');
  const replyToLines = replyTo ? [`Reply-To: ${safe(replyTo)}`] : [];
  const newHeaders = [`From: ${safe(from)}`, `To: ${safe(to)}`, ...replyToLines, ...kept].join('\r\n');

  return newHeaders + body;
}

/**
 * Build the `From` header for an inbound relay (original sender → inbox owner).
 *
 * The address is the **alias the sender wrote to** (e.g. `abuse@trackmytime.today`)
 * — a relay-controlled address — so that even a mail client that ignores the
 * `Reply-To` and replies to the From can never reach the original sender (it
 * just re-enters the relay). The original sender is carried in the display name
 * so the owner still sees who it is. The sender is attacker-influenced data, so
 * it is escaped before going inside the quoted-string (and `rewriteHeaders`
 * additionally strips CR/LF from the whole value).
 *
 * @param {string} originalSender envelope sender of the inbound mail
 * @param {string} aliasEmail full alias address the sender wrote to (keeps +subaddress)
 * @returns {string} an RFC 5322 `Display Name <addr>` From value
 */
export function inboundFromHeader(originalSender, aliasEmail) {
  const name = (String(originalSender || '').trim() || 'unknown sender').replace(/[\\"]/g, '\\$&');
  return `"${name} via PunchIn" <${aliasEmail}>`;
}
