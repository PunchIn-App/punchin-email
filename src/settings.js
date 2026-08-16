// Runtime-editable worker settings, stored as a single JSON record in the
// EMAIL_THREADS KV namespace. The email handlers and the admin API both read
// through getSettings(), which layers the stored values over the env defaults
// from wrangler.toml / secrets. This lets the admin UI change the forwarding
// address, the alias allowlist, and the contact URL without a redeploy, while
// still booting from the committed/secret defaults on first run.

import { isValidEmailAddress, normalizeAliasList, normalizeContactUrl } from './lib.js';

// A reserved, non-expiring key. It is not a 16-hex thread id, so it can never
// collide with a relay thread mapping (parseRelayThreadId only matches hex).
export const SETTINGS_KEY = 'settings:v1';

// The settings an admin may override (and therefore reset). Anything else in
// the stored record is bookkeeping (updatedAt / updatedBy) and not editable.
export const EDITABLE_FIELDS = ['forwardTo', 'allowedAliases', 'contactUrl'];

/** Read the stored KV record, tolerating a missing or corrupt one. */
async function readStored(env) {
  try {
    const raw = await env.EMAIL_THREADS.get(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // fall through to the env defaults
  }
  return {};
}

/**
 * Read effective settings: stored KV values layered over env defaults.
 *
 * Precedence is KV-over-env and there is no expiry, so a value saved once
 * shadows `wrangler.toml` / the secret **permanently** — changing the deploy
 * config and redeploying does nothing until the field is cleared with
 * `resetSetting`.
 * @param {object} env worker bindings/vars
 * @returns {Promise<{forwardTo:string, allowedAliases:string, contactUrl:string,
 *   relayDomain:string, updatedAt:(string|null), updatedBy:(string|null), source:object}>}
 */
export async function getSettings(env) {
  const stored = await readStored(env);

  const has = (k) => stored[k] !== undefined && stored[k] !== null;
  const relayDomain = env.RELAY_DOMAIN || '';

  return {
    forwardTo: has('forwardTo') ? stored.forwardTo : (env.FORWARD_TO || ''),
    allowedAliases: has('allowedAliases') ? stored.allowedAliases : (env.ALLOWED_ALIASES || ''),
    contactUrl: has('contactUrl') ? stored.contactUrl : (env.CONTACT_URL || ''),
    relayDomain,
    updatedAt: stored.updatedAt || null,
    updatedBy: stored.updatedBy || null,
    // which fields are currently overridden in KV vs. coming from env defaults
    source: {
      forwardTo: has('forwardTo') ? 'kv' : 'env',
      allowedAliases: has('allowedAliases') ? 'kv' : 'env',
      contactUrl: has('contactUrl') ? 'kv' : 'env',
    },
  };
}

/**
 * Validate and apply a settings update, then persist it. Only the three
 * editable fields are accepted; unknown fields are ignored. Returns the new
 * effective settings.
 * @param {object} env
 * @param {object} patch partial { forwardTo, allowedAliases, contactUrl }
 * @param {string} updatedBy identity that made the change (for audit)
 * @returns {Promise<object>} new settings
 * @throws {Error} with a user-facing message on validation failure
 */
export async function updateSettings(env, patch, updatedBy) {
  const current = await getSettings(env);
  const next = {
    forwardTo: current.forwardTo,
    allowedAliases: current.allowedAliases,
    contactUrl: current.contactUrl,
  };

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'forwardTo')) {
    const fwd = String(patch.forwardTo || '').trim();
    if (!isValidEmailAddress(fwd)) {
      throw new Error('Forwarding address must be a valid email address');
    }
    next.forwardTo = fwd;
  }
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'allowedAliases')) {
    next.allowedAliases = normalizeAliasList(patch.allowedAliases);
  }
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'contactUrl')) {
    next.contactUrl = normalizeContactUrl(patch.contactUrl);
  }

  const record = {
    ...next,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || 'unknown',
  };

  // No expirationTtl: settings must persist indefinitely.
  await env.EMAIL_THREADS.put(SETTINGS_KEY, JSON.stringify(record));

  return getSettings(env);
}

/**
 * Clear one field from the stored KV record so the deploy default (a
 * `wrangler.toml` var, or the `FORWARD_TO` secret) becomes effective again.
 *
 * Without this there is no way back: `getSettings` layers KV over env with no
 * expiry and `updateSettings` always writes all three fields, so the first save
 * pins every setting forever. That is a live-config hazard, not just a wart —
 * removing an alias from `[vars]` and redeploying *looks* like it revoked the
 * address while the KV copy keeps accepting mail for it.
 *
 * The field is deleted from the record (not overwritten with the env value), so
 * the setting genuinely tracks the deploy config from then on. The audit stamp
 * is refreshed so a reset is as attributable as a save; when nothing was stored
 * for the field the call is a no-op and writes nothing.
 * @param {object} env
 * @param {string} field one of EDITABLE_FIELDS
 * @param {string} updatedBy identity that made the change (for audit)
 * @returns {Promise<object>} new effective settings
 * @throws {Error} on a field that is not admin-editable
 */
export async function resetSetting(env, field, updatedBy) {
  if (!EDITABLE_FIELDS.includes(field)) {
    throw new Error(`Unknown setting "${field}"`);
  }

  const stored = await readStored(env);
  if (Object.prototype.hasOwnProperty.call(stored, field)) {
    delete stored[field];
    const record = {
      ...stored,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || 'unknown',
    };
    await env.EMAIL_THREADS.put(SETTINGS_KEY, JSON.stringify(record));
  }

  return getSettings(env);
}
