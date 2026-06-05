import { describe, it, expect } from 'vitest';
import { handleAdminRequest } from '../src/admin.js';
import { getSettings, SETTINGS_KEY } from '../src/settings.js';
import { makeEnv } from './helpers.js';

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
