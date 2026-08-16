import { describe, it, expect } from 'vitest';
import { handleAdminRequest } from '../src/admin.js';
import { getSettings, updateSettings, SETTINGS_KEY } from '../src/settings.js';
import { makeEnv } from './helpers.js';
import pkg from '../package.json' with { type: 'json' };

const ORIGIN = 'https://punchin-email.example.workers.dev';

function req(path, { method = 'GET', body, origin } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (origin) headers['Origin'] = origin;
  return new Request(ORIGIN + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('handleAdminRequest — page', () => {
  it('serves the admin HTML at /', async () => {
    const res = await handleAdminRequest(req('/'), makeEnv(), 'admin@example.com');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(await res.text()).toContain('PunchIn Email');
  });

  it('shows the version from package.json, not a hand-maintained copy', async () => {
    // A duplicated constant drifts silently (it read 1.6.0 on a 1.6.2 worker),
    // and this page is the only place an operator sees which build is live.
    const res = await handleAdminRequest(req('/'), makeEnv(), 'admin@example.com');
    expect(await res.text()).toContain(`<dd>v${pkg.version}</dd>`);
  });
});

describe('handleAdminRequest — GET /api/settings', () => {
  it('returns current settings and identity', async () => {
    const res = await handleAdminRequest(req('/api/settings'), makeEnv(), 'admin@example.com');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.identity).toBe('admin@example.com');
    expect(json.settings.forwardTo).toBe('owner@example.com');
    expect(json.settings.source.forwardTo).toBe('env');
  });
});

describe('handleAdminRequest — PUT /api/settings', () => {
  it('applies a valid update and persists it', async () => {
    const env = makeEnv();
    const res = await handleAdminRequest(
      req('/api/settings', { method: 'PUT', origin: ORIGIN, body: { forwardTo: 'boss@example.com', allowedAliases: 'cla, cve' } }),
      env,
      'admin@example.com'
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.settings.forwardTo).toBe('boss@example.com');
    expect(json.settings.allowedAliases).toBe('cla,cve');

    // really persisted
    const s = await getSettings(env);
    expect(s.forwardTo).toBe('boss@example.com');
    expect(env.EMAIL_THREADS.store.has(SETTINGS_KEY)).toBe(true);
  });

  it('rejects an invalid forwarding address with 400', async () => {
    const res = await handleAdminRequest(
      req('/api/settings', { method: 'PUT', origin: ORIGIN, body: { forwardTo: 'nope' } }),
      makeEnv(),
      'admin@example.com'
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/valid email/);
  });

  it('blocks a cross-origin request with 403', async () => {
    const env = makeEnv();
    const res = await handleAdminRequest(
      req('/api/settings', { method: 'PUT', origin: 'https://evil.example', body: { forwardTo: 'x@example.com' } }),
      env,
      'admin@example.com'
    );
    expect(res.status).toBe(403);
    expect(env.EMAIL_THREADS.store.has(SETTINGS_KEY)).toBe(false);
  });

  it('blocks a PUT with no Origin header at all with 403 (#40)', async () => {
    // A forged / non-browser caller can simply omit Origin. Browsers always
    // attach it on a state-changing fetch, so a missing Origin must be rejected
    // rather than waved through.
    const env = makeEnv();
    const res = await handleAdminRequest(
      req('/api/settings', { method: 'PUT', body: { forwardTo: 'x@example.com' } }),
      env,
      'admin@example.com'
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Cross-origin/);
    expect(env.EMAIL_THREADS.store.has(SETTINGS_KEY)).toBe(false);
  });

  it('rejects a non-JSON body with 400', async () => {
    const bad = new Request(ORIGIN + '/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', Origin: ORIGIN },
      body: 'not json{',
    });
    const res = await handleAdminRequest(bad, makeEnv(), 'admin@example.com');
    expect(res.status).toBe(400);
  });
});

describe('handleAdminRequest — DELETE /api/settings/:field', () => {
  it('clears the field from KV so the deploy default takes over', async () => {
    const env = makeEnv();
    await handleAdminRequest(
      req('/api/settings', { method: 'PUT', origin: ORIGIN, body: { forwardTo: 'boss@example.com' } }),
      env,
      'admin@example.com'
    );
    expect((await getSettings(env)).source.forwardTo).toBe('kv');

    const res = await handleAdminRequest(
      req('/api/settings/forwardTo', { method: 'DELETE', origin: ORIGIN }),
      env,
      'admin@example.com'
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.settings.forwardTo).toBe('owner@example.com');
    expect(json.settings.source.forwardTo).toBe('env');
    expect((await getSettings(env)).forwardTo).toBe('owner@example.com');
  });

  it('blocks a cross-origin or Origin-less reset with 403', async () => {
    const env = makeEnv();
    await updateSettings(env, { forwardTo: 'boss@example.com' }, 'me');

    const cross = await handleAdminRequest(
      req('/api/settings/forwardTo', { method: 'DELETE', origin: 'https://evil.example' }),
      env,
      'admin@example.com'
    );
    expect(cross.status).toBe(403);

    const bare = await handleAdminRequest(
      req('/api/settings/forwardTo', { method: 'DELETE' }),
      env,
      'admin@example.com'
    );
    expect(bare.status).toBe(403);

    // nothing was cleared
    expect((await getSettings(env)).forwardTo).toBe('boss@example.com');
  });

  it('400s an unknown field', async () => {
    const res = await handleAdminRequest(
      req('/api/settings/relayDomain', { method: 'DELETE', origin: ORIGIN }),
      makeEnv(),
      'admin@example.com'
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unknown setting/);
  });

  it('405s a non-DELETE method on the reset path', async () => {
    const res = await handleAdminRequest(
      req('/api/settings/forwardTo', { method: 'GET' }),
      makeEnv(),
      'admin@example.com'
    );
    expect(res.status).toBe(405);
  });

  it('wires a reset control into the admin page for every editable field', async () => {
    // The API is only useful if the UI can reach it — and the existing
    // source:'env' badge is otherwise unreachable once a value is saved.
    const html = await (await handleAdminRequest(req('/'), makeEnv(), 'admin@example.com')).text();
    for (const field of ['forwardTo', 'allowedAliases', 'contactUrl']) {
      expect(html).toContain(`id="${field}Reset"`);
    }
    expect(html).toContain("method:'DELETE'");
  });
});

describe('handleAdminRequest — misc', () => {
  it('404s an unknown path', async () => {
    const res = await handleAdminRequest(req('/nope'), makeEnv(), 'admin@example.com');
    expect(res.status).toBe(404);
  });

  it('405s an unsupported method on the settings API', async () => {
    const res = await handleAdminRequest(req('/api/settings', { method: 'DELETE' }), makeEnv(), 'admin@example.com');
    expect(res.status).toBe(405);
  });
});
