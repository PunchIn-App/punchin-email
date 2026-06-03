import { describe, it, expect } from 'vitest';
import { getSettings, updateSettings, SETTINGS_KEY } from '../src/settings.js';
import { makeEnv } from './helpers.js';

describe('getSettings', () => {
  it('returns env defaults when nothing is stored, marked as env source', async () => {
    const env = makeEnv();
    const s = await getSettings(env);
    expect(s.forwardTo).toBe('owner@example.com');
    expect(s.allowedAliases).toBe('cla,licensing,cve,abuse');
    expect(s.contactUrl).toBe('https://trackmytime.today');
    expect(s.relayDomain).toBe('trackmytime.today');
    expect(s.source).toEqual({ forwardTo: 'env', allowedAliases: 'env', contactUrl: 'env' });
    expect(s.updatedAt).toBeNull();
  });

  it('layers stored KV values over env defaults', async () => {
    const env = makeEnv();
    env.EMAIL_THREADS.store.set(
      SETTINGS_KEY,
      JSON.stringify({ forwardTo: 'new@example.com', updatedAt: '2026-06-03T00:00:00Z', updatedBy: 'me' })
    );
    const s = await getSettings(env);
    expect(s.forwardTo).toBe('new@example.com'); // from KV
    expect(s.source.forwardTo).toBe('kv');
    expect(s.allowedAliases).toBe('cla,licensing,cve,abuse'); // still env
    expect(s.source.allowedAliases).toBe('env');
    expect(s.updatedBy).toBe('me');
  });

  it('falls back to env on malformed stored JSON', async () => {
    const env = makeEnv();
    env.EMAIL_THREADS.store.set(SETTINGS_KEY, 'not json{');
    const s = await getSettings(env);
    expect(s.forwardTo).toBe('owner@example.com');
  });
});

describe('updateSettings', () => {
  it('validates, persists (no TTL), and records who/when', async () => {
    const env = makeEnv();
    const s = await updateSettings(
      env,
      { forwardTo: 'boss@example.com', allowedAliases: 'CVE, abuse', contactUrl: '' },
      'admin@example.com'
    );

    expect(s.forwardTo).toBe('boss@example.com');
    expect(s.allowedAliases).toBe('abuse,cve'); // normalized
    expect(s.contactUrl).toBe('');
    expect(s.source.forwardTo).toBe('kv');
    expect(s.updatedBy).toBe('admin@example.com');
    expect(s.updatedAt).toBeTruthy();

    // persisted without an expiration TTL
    const put = env.EMAIL_THREADS.puts.find((p) => p.key === SETTINGS_KEY);
    expect(put).toBeTruthy();
    expect(put.options).toBeUndefined();
  });

  it('only changes fields present in the patch', async () => {
    const env = makeEnv();
    await updateSettings(env, { forwardTo: 'a@example.com' }, 'me');
    const s = await updateSettings(env, { contactUrl: 'https://example.com' }, 'me');
    expect(s.forwardTo).toBe('a@example.com'); // preserved
    expect(s.contactUrl).toBe('https://example.com');
  });

  it('rejects an invalid forwarding address', async () => {
    const env = makeEnv();
    await expect(updateSettings(env, { forwardTo: 'nope' }, 'me')).rejects.toThrow(/valid email/);
  });

  it('rejects an invalid alias list and a bad contact URL', async () => {
    const env = makeEnv();
    await expect(updateSettings(env, { allowedAliases: 'cla,relay' }, 'me')).rejects.toThrow(/reserved/);
    await expect(updateSettings(env, { contactUrl: 'ftp://x.y' }, 'me')).rejects.toThrow(/http/);
  });
});
