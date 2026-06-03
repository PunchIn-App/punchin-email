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

/**
 * Read effective settings: stored KV values layered over env defaults.
 * @param {object} env worker bindings/vars
 * @returns {Promise<{forwardTo:string, allowedAliases:string, contactUrl:string,
 *   relayDomain:string, updatedAt:(string|null), updatedBy:(string|null), source:object}>}
 */
export async function getSettings(env) {
  let stored = {};
  try {
    const raw = await env.EMAIL_THREADS.get(SETTINGS_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {
    stored = {};
  }

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
