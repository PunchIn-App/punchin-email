// Shared test doubles for the worker handler tests.

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
    EMAIL_THREADS: makeKV(),
    EMAIL_SENDING: {
      sent,
      async send(msg) {
        sent.push(msg);
      },
    },
    ...overrides,
  };
}
