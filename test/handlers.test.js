import { describe, it, expect } from 'vitest';
import worker, { handleInbound, handleRelay } from '../src/index.js';
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
      'abc123',
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
      to: 'relay+abc123@trackmytime.today',
      raw: 'From: owner@example.com\r\nTo: relay+abc123@trackmytime.today\r\nSubject: Re: hi\r\n\r\nbody',
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
      to: 'relay+abc123@trackmytime.today',
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
      to: 'relay+abc123@trackmytime.today',
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
      to: 'relay+deadbeef@trackmytime.today',
      raw: 'Subject: x\r\n\r\nhi',
    });

    await handleRelay(msg, env);

    expect(msg.calls.reject).toEqual(['Thread not found or expired (30-day limit)']);
    expect(env.EMAIL_SENDING.sent).toHaveLength(0);
  });
});

describe('email() routing', () => {
  it('routes relay+ addresses to the relay handler', async () => {
    const env = makeEnv();
    env.EMAIL_THREADS.store.set(
      'abc123',
      JSON.stringify({ originalSender: 'p@corp.com', aliasEmail: 'cla@trackmytime.today' })
    );
    const msg = makeMessage({
      from: 'owner@example.com',
      to: 'relay+abc123@trackmytime.today',
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
      'abc123',
      JSON.stringify({ originalSender: 'p@corp.com', aliasEmail: 'cla@trackmytime.today' })
    );
    const msg = makeMessage({
      from: 'owner@example.com',
      to: 'Relay+abc123@trackmytime.today',
      raw: 'Subject: x\r\n\r\nhi',
    });

    await worker.email(msg, env);

    expect(env.EMAIL_SENDING.sent).toHaveLength(1);
  });
});
