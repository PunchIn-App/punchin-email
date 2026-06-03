// Cloudflare Access authentication for the admin UI.
//
// The admin route sits behind a Cloudflare Access self-hosted application.
// Access authenticates the user (GitHub login) at the edge and injects a signed
// JWT in the `Cf-Access-Jwt-Assertion` header. We verify that JWT here against
// the team's JWKS and the application's AUD so the worker is safe even if the
// route is reached directly — and we FAIL CLOSED if Access isn't configured.

const _jwksCache = new Map();
const JWKS_TTL_MS = 60 * 60 * 1000; // re-fetch keys hourly

function b64urlToBytes(s) {
  let t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const pad = t.length % 4;
  if (pad) t += '='.repeat(4 - pad);
  const bin = atob(t);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToString(s) {
  return new TextDecoder().decode(b64urlToBytes(s));
}

/**
 * Validate the claims of an Access JWT (everything except the signature).
 * Pure and synchronous so it can be unit-tested without crypto.
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
export function validateAccessClaims(payload, header, { aud, teamDomain, now = Date.now() } = {}) {
  if (!header || header.alg !== 'RS256') return { ok: false, reason: 'unexpected token algorithm' };
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'no token payload' };
  if (!aud) return { ok: false, reason: 'server AUD not configured' };

  const audList = Array.isArray(payload.aud) ? payload.aud : payload.aud != null ? [payload.aud] : [];
  if (!audList.includes(aud)) return { ok: false, reason: 'audience mismatch' };

  if (payload.iss !== `https://${teamDomain}`) return { ok: false, reason: 'issuer mismatch' };

  const nowSec = Math.floor(now / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return { ok: false, reason: 'token expired' };
  if (typeof payload.nbf === 'number' && payload.nbf > nowSec + 60) return { ok: false, reason: 'token not yet valid' };

  return { ok: true };
}

/** Fetch (and cache) the team's Access signing keys. */
export async function fetchJwks(teamDomain, fetchImpl = fetch) {
  const cached = _jwksCache.get(teamDomain);
  if (cached && Date.now() - cached.at < JWKS_TTL_MS) return cached.keys;

  const res = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res || !res.ok) throw new Error('JWKS fetch failed: ' + (res && res.status));
  const body = await res.json();
  const keys = Array.isArray(body.keys) ? body.keys : [];
  _jwksCache.set(teamDomain, { keys, at: Date.now() });
  return keys;
}

async function verifyRs256(signingInput, signatureB64url, jwk) {
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(signatureB64url),
    new TextEncoder().encode(signingInput)
  );
}

/**
 * Fully verify an Access JWT: claims + RS256 signature against the JWKS.
 * @returns {Promise<{ok:true, identity:string|null, payload:object}|{ok:false, reason:string}>}
 */
export async function verifyAccessJwt(token, { aud, teamDomain, fetchImpl = fetch, now = Date.now() } = {}) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'missing token' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' };

  let header, payload;
  try {
    header = JSON.parse(b64urlToString(parts[0]));
    payload = JSON.parse(b64urlToString(parts[1]));
  } catch {
    return { ok: false, reason: 'unparseable token' };
  }

  const claims = validateAccessClaims(payload, header, { aud, teamDomain, now });
  if (!claims.ok) return claims;

  let jwks;
  try {
    jwks = await fetchJwks(teamDomain, fetchImpl);
  } catch {
    return { ok: false, reason: 'could not fetch signing keys' };
  }
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: 'signing key not found' };

  let valid = false;
  try {
    valid = await verifyRs256(parts[0] + '.' + parts[1], parts[2], jwk);
  } catch {
    return { ok: false, reason: 'signature verification error' };
  }
  if (!valid) return { ok: false, reason: 'invalid signature' };

  return { ok: true, identity: payload.email || payload.sub || null, payload };
}

/**
 * Gate an incoming admin request. Fails closed when Access env vars are unset.
 * @returns {Promise<{ok:true, identity:string|null}|{ok:false, status:number, message:string}>}
 */
export async function authenticateAdmin(request, env, opts = {}) {
  const aud = env.ACCESS_AUD;
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  if (!aud || !teamDomain) {
    return { ok: false, status: 503, message: 'Admin is not configured (Cloudflare Access is not set up).' };
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) {
    return { ok: false, status: 403, message: 'Forbidden: requests must arrive through Cloudflare Access.' };
  }

  const result = await verifyAccessJwt(token, {
    aud,
    teamDomain,
    fetchImpl: opts.fetchImpl,
    now: opts.now,
  });
  if (!result.ok) {
    return { ok: false, status: 403, message: 'Forbidden: ' + result.reason };
  }
  return { ok: true, identity: result.identity };
}
