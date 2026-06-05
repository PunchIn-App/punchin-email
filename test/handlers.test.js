import { describe, it, expect } from 'vitest';
import worker, { handleInbound, handleRelay } from '../src/index.js';
import { THREAD_TTL_SECONDS } from '../src/lib.js';
import { makeMessage, makeEnv } from './helpers.js';

describe('handleInbound', () => {
  it('stores a thread and forwards allowed aliases with a relay Reply-To', async () => {
    const env = makeEnv();
    const msg = makeMessage({ from: 'partner@corp.com', to: 'cla@trackmytime.today' });

    await handleInbound(msg, env);

    expect(env.EMAIL_THREADS.puts).toHaveLength(1);
    const { key, value, options } = env.EMAIL_THREADS.puts[0];
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    const stored = JSON.parse(value);
    expect(stored.originalSender).toBe('partner@corp.com');
    expect(stored.aliasEmail).toBe('cla@trackmytime.today');
    expect(options.expirationTtl).toBe(2592000);

    expect(msg.calls.forward).toHaveLength(1);
    expect(msg.calls.forward[0].dest).toBe('owner@example.com');
    expect(msg.calls.forward[0].headers.get('Reply-To')).toBe(
      `relay+${key}@trackmytime.today`
    );
    expect(msg.calls.reject).toHaveLength(0);
  });

  it('preserves the +subaddress in the stored alias', async () => {
    const env = makeEnv();
    const msg = makeMessage({ from: 'p@corp.com', to: 'cve+report@trackmytime.today' });

    await handleInbound(msg, env);

    expect(JSON.parse(env.EMAIL_THREADS.puts[0].value).aliasEmail).toBe(
      'cve+report@trackmytime.today'
    );
  });

  it('rejects unknown aliases and never forwards', async () => {
    const env = makeEnv();
    const msg = makeMessage({ from: 'p@corp.com', to: 'nope@trackmytime.today' });

    await handleInbound(msg, env);

    expect(msg.calls.reject).toEqual([
      'No such address at trackmytime.today. See https://trackmytime.today',
    ]);
    expect(msg.calls.forward).toHaveLength(0);
    expect(env.EMAIL_THREADS.puts).toHaveLength(0);
  });

  it('falls back to the relay-domain URL when CONTACT_URL is unset', async () => {
    const env = makeEnv({ CONTACT_URL: undefined, RELAY_DOMAIN: 'example.test' });
    const msg = makeMessage({ from: 'p@corp.com', to: 'nope@example.test' });

    await handleInbound(msg, env);

    expect(msg.calls.reject).toEqual([
      'No such address at example.test. See https://example.test',
    ]);
  });
});

describe('handleRelay', () => {
  const setupThread = (env) => {
    env.EMAIL_THREADS.store.set(
      '0123456789abcdef',
      JSON.stringify({
        originalSender: 'partner@corp.com',
        aliasEmail: 'cla@trackmytime.today',
        timestamp: Date.now(),
      })
    );
  };

  it('sends from the alias to the original sender for an authorized reply', async () => {
    const env = makeEnv();
    setupThread(env);
    const msg = makeMessage({
      from: 'owner@example.com',
      to: 'relay+0123456789abcdef@trackmytime.today',
      raw: 'From: owner@example.com\r\nTo: relay+0123456789abcdef@trackmytime.today\r\nSubject: Re: hi\r\n\r\nbody',
    });

    await handleRelay(msg, env);

    expect(env.EMAIL_SENDING.sent).toHaveLength(1);
    const out = env.EMAIL_SENDING.sent[0];
    expect(out.from).toBe('cla@trackmytime.today');
    expect(out.to).toBe('partner@corp.com');
    expect(out.raw).toContain('From: cla@trackmytime.today');
    expect(out.raw).toContain('To: partner@corp.com');
    expect(msg.calls.reject).toHaveLength(0);
  });

  it('rejects relays from anyone other than the inbox owner', async () => {
    const env = makeEnv();
    setupThread(env);
    const msg = makeMessage({
      from: 'attacker@evil.com',
      to: 'relay+0123456789abcdef@trackmytime.today',
      raw: 'Subject: x\r\n\r\nhi',
    });

    await handleRelay(msg, env);

    expect(msg.calls.reject).toEqual(['Unauthorized relay sender']);
    expect(env.EMAIL_SENDING.sent).toHaveLength(0);
  });

  it('checks sender authorization before the auto-submitted drop (#44)', async () => {
    // An auto-submitted header from an *unauthorized* sender must still be
    // rejected as unauthorized — the From==FORWARD_TO gate runs first, so the
    // auto-submitted reason never leaks to a sender who has no business here.
    const env = makeEnv();
    setupThread(env);
    const msg = makeMessage({
      from: 'attacker@evil.com',
      to: 'relay+0123456789abcdef@trackmytime.today',
      headers: { 'Auto-Submitted': 'auto-replied' },
      raw: 'Subject: x\r\n\r\nhi',
    });

    await handleRelay(msg, env);

    expect(msg.calls.reject).toEqual(['Unauthorized relay sender']);
    expect(env.EMAIL_SENDING.sent).toHaveLength(0);
  });

  it('rejects auto-submitted mail to prevent loops', async () => {
    const env = makeEnv();
    setupThread(env);
    const msg = makeMessage({
      from: 'owner@example.com',
      to: 'relay+0123456789abcdef@trackmytime.today',
      headers: { 'Auto-Submitted': 'auto-replied' },
      raw: 'Subject: ooo\r\n\r\nhi',
    });

    await handleRelay(msg, env);

    expect(msg.calls.reject).toEqual(['Auto-submitted mail is not relayed']);
    expect(env.EMAIL_SENDING.sent).toHaveLength(0);
  });

  it('rejects a malformed relay address', async () => {
    const env = makeEnv();
    const msg = makeMessage({
      from: 'owner@example.com',
      to: 'relay+@trackmytime.today',
      raw: 'Subject: x\r\n\r\nhi',
    });

    await handleRelay(msg, env);

    expect(msg.calls.reject).toEqual(['Malformed relay address']);
  });

  it('bounces gracefully when the thread is missing or expired', async () => {
    const env = makeEnv();
    const msg = makeMessage({
      from: 'owner@example.com',
      to: 'relay+beefbeefbeefbeef@trackmytime.today',
      raw: 'Subject: x\r\n\r\nhi',
    });

    await handleRelay(msg, env);

    expect(msg.calls.reject).toEqual(['Thread not found or expired (30-day limit)']);
    expect(env.EMAIL_SENDING.sent).toHaveLength(0);
  });

  it('refreshes the thread TTL on a successful relay (#32)', async () => {
    const env = makeEnv();
    setupThread(env);
    const msg = makeMessage({
      from: 'owner@example.com',
      to: 'relay+0123456789abcdef@trackmytime.today',
      raw: 'Subject: hi\r\n\r\nbody',
    });

    await handleRelay(msg, env);

    expect(env.EMAIL_SENDING.sent).toHaveLength(1);
    const refresh = env.EMAIL_THREADS.puts.find((p) => p.key === '0123456789abcdef');
    expect(refresh).toBeTruthy();
    expect(refresh.options.expirationTtl).toBe(THREAD_TTL_SECONDS);
    // The mapping is re-stored verbatim — only the expiry is extended.
    expect(JSON.parse(refresh.value).aliasEmail).toBe('cla@trackmytime.today');
  });

  it('still relays if the TTL refresh itself fails (best-effort) (#32)', async () => {
    const env = makeEnv();
    setupThread(env);
    // Make the post-send refresh put throw; the relay was already sent, so it
    // must not bounce or double-send. (get still reads from the in-memory store.)
    env.EMAIL_THREADS.put = async () => {
      throw new Error('KV write failed');
    };
    const msg = makeMessage({
      from: 'owner@example.com',
      to: 'relay+0123456789abcdef@trackmytime.today',
      raw: 'Subject: hi\r\n\r\nbody',
    });

    await handleRelay(msg, env);

    expect(env.EMAIL_SENDING.sent).toHaveLength(1);
    expect(msg.calls.reject).toHaveLength(0);
  });

  it('bounces cleanly when the stored thread record is corrupt (#34)', async () => {
    const env = makeEnv();
    env.EMAIL_THREADS.store.set('0123456789abcdef', 'not json{');
    const msg = makeMessage({
      from: 'owner@example.com',
      to: 'relay+0123456789abcdef@trackmytime.today',
      raw: 'Subject: x\r\n\r\nhi',
    });

    await handleRelay(msg, env);

    expect(msg.calls.reject).toEqual(['Thread record could not be read']);
    expect(env.EMAIL_SENDING.sent).toHaveLength(0);
  });
});

describe('email() routing', () => {
  it('routes relay+ addresses to the relay handler', async () => {
    const env = makeEnv();
    env.EMAIL_THREADS.store.set(
      '0123456789abcdef',
      JSON.stringify({ originalSender: 'p@corp.com', aliasEmail: 'cla@trackmytime.today' })
    );
    const msg = makeMessage({
      from: 'owner@example.com',
      to: 'relay+0123456789abcdef@trackmytime.today',
      raw: 'Subject: x\r\n\r\nhi',
    });

    await worker.email(msg, env);

    expect(env.EMAIL_SENDING.sent).toHaveLength(1);
    expect(msg.calls.forward).toHaveLength(0);
  });

  it('routes alias addresses to the inbound handler', async () => {
    const env = makeEnv();
    const msg = makeMessage({ from: 'p@corp.com', to: 'abuse@trackmytime.today' });

    await worker.email(msg, env);

    expect(msg.calls.forward).toHaveLength(1);
    expect(env.EMAIL_SENDING.sent).toHaveLength(0);
  });

  it('is case-insensitive about the relay+ prefix', async () => {
    const env = makeEnv();
    env.EMAIL_THREADS.store.set(
      '0123456789abcdef',
      JSON.stringify({ originalSender: 'p@corp.com', aliasEmail: 'cla@trackmytime.today' })
    );
    const msg = makeMessage({
      from: 'owner@example.com',
      to: 'Relay+0123456789abcdef@trackmytime.today',
      raw: 'Subject: x\r\n\r\nhi',
    });

    await worker.email(msg, env);

    expect(env.EMAIL_SENDING.sent).toHaveLength(1);
  });

  it('re-throws (for Cloudflare retry) when sending fails, rather than swallowing (#34)', async () => {
    const env = makeEnv({
      EMAIL_SENDING: {
        sent: [],
        async send() {
          throw new Error('send quota exceeded');
        },
      },
    });
    env.EMAIL_THREADS.store.set(
      '0123456789abcdef',
      JSON.stringify({ originalSender: 'p@corp.com', aliasEmail: 'cla@trackmytime.today' })
    );
    const msg = makeMessage({
      from: 'owner@example.com',
      to: 'relay+0123456789abcdef@trackmytime.today',
      raw: 'Subject: x\r\n\r\nhi',
    });

    // Propagates so Cloudflare can retry; a transient send failure must not be
    // turned into a permanent setReject bounce.
    await expect(worker.email(msg, env)).rejects.toThrow(/quota/);
    expect(msg.calls.reject).toHaveLength(0);
  });

  it('re-throws when the inbound KV put fails (#34)', async () => {
    const env = makeEnv({
      EMAIL_THREADS: {
        store: new Map(),
        puts: [],
        async get() {
          return null;
        },
        async put() {
          throw new Error('KV unavailable');
        },
      },
    });
    const msg = makeMessage({ from: 'p@corp.com', to: 'cla@trackmytime.today' });

    await expect(worker.email(msg, env)).rejects.toThrow(/KV/);
  });
});
