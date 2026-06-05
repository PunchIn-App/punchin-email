// Shared test doubles for the worker handler tests.

/**
 * Structural validity check that models what the real Cloudflare Email Sending
 * binding requires of an outbound message before it parses, validates, and
 * re-signs (DKIM) it: a complete RFC-822 stream with a header/body delimiter,
 * CRLF line endings, and address-bearing From/To headers. The mock can't
 * re-sign, but it *can* reject a structurally malformed rewrite so a bad
 * `rewriteHeaders` change fails the test instead of shipping green (issue #39).
 * @param {unknown} raw
 */
export function assertSendableRaw(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('EMAIL_SENDING.send: raw message must be a non-empty string');
  }
  // SMTP requires CRLF; flag any bare LF (a regression in line-ending handling).
  if (/(^|[^\r])\n/.test(raw)) {
    throw new Error('EMAIL_SENDING.send: raw message must use CRLF line endings');
  }
  const sep = raw.indexOf('\r\n\r\n');
  if (sep === -1) {
    throw new Error('EMAIL_SENDING.send: raw message has no header/body delimiter');
  }
  const headerLines = raw.slice(0, sep).split('\r\n');
  const value = (name) => {
    const line = headerLines.find((l) => new RegExp(`^${name}:\\s*`, 'i').test(l));
    return line ? line.replace(new RegExp(`^${name}:\\s*`, 'i'), '') : null;
  };
  const from = value('From');
  const to = value('To');
  if (!from || !from.includes('@')) {
    throw new Error('EMAIL_SENDING.send: missing or invalid From header');
  }
  if (!to || !to.includes('@')) {
    throw new Error('EMAIL_SENDING.send: missing or invalid To header');
  }
}

/** In-memory stand-in for a Workers KV namespace. */
export function makeKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  const puts = [];
  return {
    store,
    puts,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value, options) {
      store.set(key, value);
      puts.push({ key, value, options });
    },
  };
}

/** Build a fake inbound/relay EmailMessage. */
export function makeMessage({ from, to, headers = {}, raw = '' } = {}) {
  const headerMap = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  const calls = { forward: [], reject: [] };
  return {
    from,
    to,
    headers: { get: (k) => (headerMap.has(k.toLowerCase()) ? headerMap.get(k.toLowerCase()) : null) },
    raw: new Response(raw).body,
    forward(dest, h) {
      calls.forward.push({ dest, headers: h });
    },
    setReject(reason) {
      calls.reject.push(reason);
    },
    calls,
  };
}

/** Build a fake env with an EMAIL_SENDING binding that records sends. */
export function makeEnv(overrides = {}) {
  const sent = [];
  return {
    FORWARD_TO: 'owner@example.com',
    RELAY_DOMAIN: 'trackmytime.today',
    ALLOWED_ALIASES: 'cla,licensing,cve,abuse',
    CONTACT_URL: 'https://trackmytime.today',
    EMAIL_THREADS: makeKV(),
    EMAIL_SENDING: {
      sent,
      async send(msg) {
        // Model the real binding's parse/validate step so a structurally
        // malformed rewrite fails the test rather than shipping green (#39).
        assertSendableRaw(msg && msg.raw);
        sent.push(msg);
      },
    },
    ...overrides,
  };
}
