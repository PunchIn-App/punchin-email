import { describe, it, expect, beforeAll } from 'vitest';
import { validateAccessClaims, verifyAccessJwt, authenticateAdmin } from '../src/access.js';

const AUD = 'test-aud-tag';
const TEAM = 'team.cloudflareaccess.test';

function b64url(input) {
  const bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let privateKey;
let jwk; // public key as JWK with a kid

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  privateKey = pair.privateKey;
  jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  jwk.kid = 'kid-1';
  jwk.alg = 'RS256';
});

async function makeToken({ aud = [AUD], teamDomain = TEAM, exp, nbf, email = 'admin@example.com', kid = 'kid-1', alg = 'RS256' } = {}) {
  const header = { alg, typ: 'JWT', kid };
  const payload = { aud, iss: `https://${teamDomain}`, email, exp: exp ?? Math.floor(Date.now() / 1000) + 300 };
  if (nbf != null) payload.nbf = nbf;
  const signingInput = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));
  // Always RSA-sign with the real key: the header `alg` is what we attack with,
  // so a forged `alg` must be rejected on claims grounds *before* the signature
  // is ever checked (alg-confusion defence).
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(signingInput));
  return signingInput + '.' + b64url(new Uint8Array(sig));
}

// JWKS fetch double that simulates the certs endpoint being down.
const jwksFetchFail = (status = 503) => async () => ({ ok: false, status });

const jwksFetch = (keys) => async () => ({ ok: true, json: async () => ({ keys }) });

describe('validateAccessClaims', () => {
  const base = { aud: AUD, teamDomain: TEAM };
  const payload = () => ({ aud: [AUD], iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 300 });
  const header = { alg: 'RS256', kid: 'kid-1' };

  it('passes a well-formed claim set', () => {
    expect(validateAccessClaims(payload(), header, base).ok).toBe(true);
  });
  it('rejects wrong alg, aud, iss, and expiry', () => {
    expect(validateAccessClaims(payload(), { alg: 'HS256' }, base).reason).toMatch(/algorithm/);
    expect(validateAccessClaims(payload(), { alg: 'none' }, base).reason).toMatch(/algorithm/);
    expect(validateAccessClaims({ ...payload(), aud: ['other'] }, header, base).reason).toMatch(/audience/);
    expect(validateAccessClaims({ ...payload(), iss: 'https://evil' }, header, base).reason).toMatch(/issuer/);
    expect(validateAccessClaims({ ...payload(), exp: 1 }, header, base).reason).toMatch(/expired/);
  });

  it('rejects a missing or non-numeric exp (#29)', () => {
    expect(validateAccessClaims({ ...payload(), exp: undefined }, header, base).reason).toMatch(/expired/);
    expect(validateAccessClaims({ ...payload(), exp: '9999999999' }, header, base).reason).toMatch(/expired/);
  });

  it('honours a symmetric clock-skew window on exp (#29)', () => {
    const now = 1_000_000_000_000; // fixed clock so the test is deterministic
    const nowSec = Math.floor(now / 1000);
    const at = (overrides) => validateAccessClaims({ ...payload(), ...overrides }, header, { ...base, now });
    // Expired 30s ago — inside the 60s leeway, still accepted.
    expect(at({ exp: nowSec - 30 }).ok).toBe(true);
    // Expired 120s ago — outside the leeway, rejected.
    expect(at({ exp: nowSec - 120 }).reason).toMatch(/expired/);
    // Expires exactly at the leeway boundary is rejected (<= nowSec - 60).
    expect(at({ exp: nowSec - 60 }).reason).toMatch(/expired/);
  });

  it('honours a symmetric clock-skew window on nbf (#42)', () => {
    const now = 1_000_000_000_000;
    const nowSec = Math.floor(now / 1000);
    const at = (overrides) => validateAccessClaims({ ...payload(), ...overrides }, header, { ...base, now });
    // Not-yet-valid by 30s — inside the 60s leeway, still accepted.
    expect(at({ nbf: nowSec + 30 }).ok).toBe(true);
    // Not-yet-valid by 5 minutes — rejected.
    expect(at({ nbf: nowSec + 300 }).reason).toMatch(/not yet valid/);
    // A non-numeric nbf is ignored (no rejection on that ground).
    expect(at({ nbf: 'soon' }).ok).toBe(true);
  });
});

describe('verifyAccessJwt', () => {
  it('verifies a correctly signed token', async () => {
    const token = await makeToken({ teamDomain: 'verify-ok.test' });
    const res = await verifyAccessJwt(token, { aud: AUD, teamDomain: 'verify-ok.test', fetchImpl: jwksFetch([jwk]) });
    expect(res.ok).toBe(true);
    expect(res.identity).toBe('admin@example.com');
  });

  it('rejects a tampered signature', async () => {
    const token = await makeToken({ teamDomain: 'verify-tamper.test' });
    const tampered = token.slice(0, -3) + (token.slice(-3) === 'AAA' ? 'BBB' : 'AAA');
    const res = await verifyAccessJwt(tampered, { aud: AUD, teamDomain: 'verify-tamper.test', fetchImpl: jwksFetch([jwk]) });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/signature/);
  });

  it('rejects a wrong audience before checking the signature', async () => {
    const token = await makeToken({ teamDomain: 'verify-aud.test', aud: ['someone-else'] });
    const res = await verifyAccessJwt(token, { aud: AUD, teamDomain: 'verify-aud.test', fetchImpl: jwksFetch([jwk]) });
    expect(res).toMatchObject({ ok: false, reason: 'audience mismatch' });
  });

  it('rejects when the signing key is missing from the JWKS', async () => {
    const token = await makeToken({ teamDomain: 'verify-nokey.test' });
    const res = await verifyAccessJwt(token, { aud: AUD, teamDomain: 'verify-nokey.test', fetchImpl: jwksFetch([]) });
    expect(res.reason).toMatch(/signing key not found/);
  });

  it('rejects malformed and missing tokens', async () => {
    expect((await verifyAccessJwt('', { aud: AUD, teamDomain: TEAM })).ok).toBe(false);
    expect((await verifyAccessJwt('a.b', { aud: AUD, teamDomain: TEAM })).reason).toMatch(/malformed/);
  });

  it('rejects an alg=none token before touching the signature (#38)', async () => {
    // alg-confusion attack: the token is actually RSA-signed, but its header
    // claims `none`. We must reject on the algorithm, never on the signature.
    const token = await makeToken({ teamDomain: 'verify-algnone.test', alg: 'none' });
    const res = await verifyAccessJwt(token, {
      aud: AUD,
      teamDomain: 'verify-algnone.test',
      fetchImpl: jwksFetch([jwk]),
    });
    expect(res).toMatchObject({ ok: false, reason: 'unexpected token algorithm' });
  });

  it('rejects a token whose header/payload is unparseable (#41)', async () => {
    // Three parts, but the base64url segments are not valid JSON.
    const token = b64url('not json') + '.' + b64url('also not json') + '.' + b64url('sig');
    const res = await verifyAccessJwt(token, { aud: AUD, teamDomain: TEAM });
    expect(res).toMatchObject({ ok: false, reason: 'unparseable token' });
  });

  it('fails closed when the JWKS endpoint is unreachable (#41)', async () => {
    const token = await makeToken({ teamDomain: 'verify-jwksdown.test' });
    const res = await verifyAccessJwt(token, {
      aud: AUD,
      teamDomain: 'verify-jwksdown.test',
      fetchImpl: jwksFetchFail(503),
    });
    expect(res).toMatchObject({ ok: false, reason: 'could not fetch signing keys' });
  });

  it('rejects a token that is not yet valid end-to-end (#42)', async () => {
    const token = await makeToken({
      teamDomain: 'verify-nbf.test',
      nbf: Math.floor(Date.now() / 1000) + 600, // 10 minutes out, past the leeway
    });
    const res = await verifyAccessJwt(token, {
      aud: AUD,
      teamDomain: 'verify-nbf.test',
      fetchImpl: jwksFetch([jwk]),
    });
    expect(res).toMatchObject({ ok: false, reason: 'token not yet valid' });
  });

  it('accepts a token that expired within the clock-skew window (#29)', async () => {
    const token = await makeToken({
      teamDomain: 'verify-expskew.test',
      exp: Math.floor(Date.now() / 1000) - 30, // expired 30s ago, inside the 60s leeway
    });
    const res = await verifyAccessJwt(token, {
      aud: AUD,
      teamDomain: 'verify-expskew.test',
      fetchImpl: jwksFetch([jwk]),
    });
    expect(res.ok).toBe(true);
    expect(res.identity).toBe('admin@example.com');
  });
});

describe('authenticateAdmin', () => {
  const reqWith = (token) =>
    new Request('https://x.workers.dev/api/settings', { headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} });

  it('fails closed (503) when Access is not configured', async () => {
    const res = await authenticateAdmin(reqWith('x'), {});
    expect(res).toMatchObject({ ok: false, status: 503 });
  });

  it('403s when no Access token is present', async () => {
    const res = await authenticateAdmin(reqWith(null), { ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: TEAM });
    expect(res).toMatchObject({ ok: false, status: 403 });
  });

  it('authenticates a valid token and returns identity', async () => {
    const token = await makeToken({ teamDomain: 'auth-ok.test' });
    const res = await authenticateAdmin(reqWith(token), { ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: 'auth-ok.test' }, { fetchImpl: jwksFetch([jwk]) });
    expect(res).toMatchObject({ ok: true, identity: 'admin@example.com' });
  });
});
