import { describe, it, expect } from 'vitest';
import { getSettings, updateSettings, resetSetting, SETTINGS_KEY } from '../src/settings.js';
import { makeEnv } from './helpers.js';

describe('getSettings', () => {
  it('returns env defaults when nothing is stored, marked as env source', async () => {
    const env = makeEnv();
    const s = await getSettings(env);
    expect(s.forwardTo).toBe('owner@example.com');
    expect(s.allowedAliases).toBe('abuse,cla,contact,cve,feedback,licensing,privacy');
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
    expect(s.allowedAliases).toBe('abuse,cla,contact,cve,feedback,licensing,privacy'); // still env
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

describe('resetSetting', () => {
  it('drops the field from KV so the deploy default takes over again', async () => {
    const env = makeEnv();
    await updateSettings(env, { forwardTo: 'saved@example.com' }, 'me');
    expect((await getSettings(env)).source.forwardTo).toBe('kv');

    const s = await resetSetting(env, 'forwardTo', 'admin@example.com');

    expect(s.forwardTo).toBe('owner@example.com'); // back to the env/secret default
    expect(s.source.forwardTo).toBe('env');
    // and it is really gone from the stored record, not just shadowed
    const stored = JSON.parse(env.EMAIL_THREADS.store.get(SETTINGS_KEY));
    expect(Object.prototype.hasOwnProperty.call(stored, 'forwardTo')).toBe(false);
  });

  it('leaves the other saved fields alone and stamps who reset it', async () => {
    const env = makeEnv();
    await updateSettings(env, { forwardTo: 'saved@example.com', contactUrl: 'https://saved.example' }, 'me');

    const s = await resetSetting(env, 'forwardTo', 'admin@example.com');

    expect(s.contactUrl).toBe('https://saved.example');
    expect(s.source.contactUrl).toBe('kv');
    expect(s.updatedBy).toBe('admin@example.com');
    expect(s.updatedAt).toBeTruthy();
  });

  it('un-shadows a revoked alias so a redeploy actually revokes it', async () => {
    // The scenario the reset exists for: an alias list saved once in KV shadows
    // wrangler.toml forever, so dropping an alias from [vars] and redeploying
    // silently does nothing. Resetting the field makes the deploy value live.
    const env = makeEnv();
    await updateSettings(env, { allowedAliases: 'abuse,cla,privacy' }, 'me');
    env.ALLOWED_ALIASES = 'abuse,cla'; // privacy@ revoked in the deploy config
    expect((await getSettings(env)).allowedAliases).toBe('abuse,cla,privacy'); // KV still wins

    const s = await resetSetting(env, 'allowedAliases', 'admin@example.com');

    expect(s.allowedAliases).toBe('abuse,cla');
    expect(s.source.allowedAliases).toBe('env');
  });

  it('is a no-op when the field was never saved', async () => {
    const env = makeEnv();
    const s = await resetSetting(env, 'contactUrl', 'admin@example.com');
    expect(s.contactUrl).toBe('https://trackmytime.today');
    expect(s.source.contactUrl).toBe('env');
    expect(env.EMAIL_THREADS.puts).toHaveLength(0); // nothing to write
  });

  it('rejects a field that is not admin-editable', async () => {
    const env = makeEnv();
    await expect(resetSetting(env, 'relayDomain', 'me')).rejects.toThrow(/Unknown setting/);
    await expect(resetSetting(env, 'updatedBy', 'me')).rejects.toThrow(/Unknown setting/);
    await expect(resetSetting(env, '', 'me')).rejects.toThrow(/Unknown setting/);
  });
});
