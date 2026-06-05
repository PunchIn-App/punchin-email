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
  if (['bulk', 'list', 'auto_reply', 'junk'].includes(precedence)) return true;

  if (get('X-Autoreply') || get('X-Autorespond')) return true;

  const suppress = get('X-Auto-Response-Suppress');
  if (suppress) return true;

  return false;
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
 * @param {string} rawText
 * @param {string} from
 * @param {string} to
 */
export function rewriteHeaders(rawText, from, to) {
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

  // Strip CR/LF from the injected From/To values so a crafted alias / sender
  // address can't smuggle extra headers into the outbound message (issue #27).
  const safe = (v) => String(v).replace(/[\r\n]/g, '');
  const newHeaders = [`From: ${safe(from)}`, `To: ${safe(to)}`, ...kept].join('\r\n');

  return newHeaders + body;
}
