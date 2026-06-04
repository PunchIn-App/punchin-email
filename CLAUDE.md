# PunchIn Email Worker — AI Assistant Guide

**Version:** 1.2.1

This file is the architectural source of truth for the worker. Read it before
making changes, and keep it current (see Documentation Requirements in
[`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md)).

## Project Overview

A Cloudflare Email Worker that gives `trackmytime.today` a set of two-way role
aliases. Inbound mail to `cla@`, `licensing@`, `cve@`, `abuse@` (and any
`+subaddress`) is forwarded to a personal inbox; replies from that inbox go back
out **from the original alias to the original sender**, with no manual "From"
selection. It is the infrastructure behind the contact addresses referenced in
the main [`punchin`](https://github.com/PunchIn-App/punchin) project's governance
docs (CLA → `cla@`, security → `cve@`, conduct → `abuse@`).

## Repository Structure

```
src/
  index.js    email() + fetch() entrypoints; handleInbound / handleRelay
  lib.js      pure, runtime-agnostic helpers (no cloudflare:email import)
  settings.js KV-backed settings (getSettings / updateSettings) over env defaults
  access.js   Cloudflare Access JWT verification (authenticateAdmin), fails closed
  admin.js    admin UI page + JSON settings API (handleAdminRequest)
test/
  lib.test.js        unit tests for the helpers + validators
  handlers.test.js   email handler + routing tests using mocked bindings
  settings.test.js   getSettings / updateSettings over mocked KV
  access.test.js     Access claim + JWT signature verification
  admin.test.js      admin router (GET/PUT /api/settings) tests
  helpers.js         test doubles (KV, message, env)
  mocks/             stub for the cloudflare:email module
docs/
  CHANGELOG.md       Keep a Changelog history
.github/
  CONTRIBUTING.md    contribution workflow + conventions
  workflows/ci.yml   CI: npm test + wrangler dry-run
wrangler.toml        worker config, vars, and bindings
```

### Helpers (`src/lib.js`)

- `generateId(getRandomValues?)` — random 16-char hex thread id (RNG injectable)
- `parseRelayThreadId(address)` — `relay+<id>@…` → `<id>` or `null`
- `baseLocalPart(address)` — local-part minus `+subaddress`, lowercased
- `isAllowedAlias(address, allowed)` — allowlist check against base local-part
- `addressesEqual(a, b)` — case-insensitive address compare (unwraps display names)
- `isAutoSubmitted(headers)` — detects bounces / vacation responders
- `rewriteHeaders(rawText, from, to)` — swaps From/To, strips sender-bound headers

## Email Flow

**Inbound** (`handleInbound`): reject non-allowlisted recipients → generate a
thread id → store `{originalSender, aliasEmail, timestamp}` in `EMAIL_THREADS`
(30-day TTL) → `message.forward(FORWARD_TO, { Reply-To: relay+<id>@RELAY_DOMAIN })`.

**Relay** (`handleRelay`): reject if `From != FORWARD_TO` → reject auto-submitted
mail → parse and look up the thread id → rewrite headers → send via
`EMAIL_SENDING`.

The `email()` entrypoint routes by recipient: `relay+` prefix → relay handler,
everything else → inbound handler. Both handlers read the effective config via
`getSettings(env)` (KV record layered over env defaults), so the forwarding
address / aliases / contact URL can change at runtime.

## Admin UI (`fetch()`)

The `fetch()` entrypoint serves a small admin page (`/`) and a settings API
(`GET/PUT /api/settings`). Every request is gated by `authenticateAdmin`, which
**fails closed** (503) unless `ACCESS_AUD` + `ACCESS_TEAM_DOMAIN` are set, then
verifies the Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`): signature against
the team JWKS, plus AUD / issuer / expiry. Mutations also require a same-origin
`Origin`. Editable settings live in the `EMAIL_THREADS` KV under
`settings:v1` (no TTL); `RELAY_DOMAIN` is not editable.

## Robustness Guards (do not weaken without rationale)

- **Alias allowlist** (`ALLOWED_ALIASES`) — prevents open forwarding under a
  catch-all route.
- **Relay sender verification** (`From == FORWARD_TO`) — prevents alias spoofing
  / open relay by anyone who learns a thread id.
- **Auto-submitted drop** — prevents mail loops.
- **Sender-header stripping** — removes `Reply-To`/`Return-Path`/`Sender` and the
  now-invalid `DKIM-Signature`; Cloudflare re-signs outbound.

## Development Workflow

```bash
npm install
npm test          # vitest run
npm run check     # wrangler deploy --dry-run
npm run dev       # wrangler dev
npm run deploy    # wrangler deploy
```

`cloudflare:email` is aliased to `test/mocks/cloudflare-email.js` in
`vitest.config.js` so the worker imports cleanly under Node.

## Configuration & Bindings

Vars (`wrangler.toml [vars]`, non-secret, committed):

- `RELAY_DOMAIN` — domain used in the generated `relay+<id>@…` Reply-To (static)
- `ALLOWED_ALIASES` — default base local-parts allowed to forward (admin-editable)
- `CONTACT_URL` — optional default URL shown in the bounce for unrecognized
  addresses (admin-editable; falls back to `https://<RELAY_DOMAIN>`)
- `ACCESS_AUD` / `ACCESS_TEAM_DOMAIN` — Cloudflare Access app AUD + team domain
  for admin-UI auth. Blank → admin UI fails closed (email still runs).

`ALLOWED_ALIASES`, `CONTACT_URL`, and `FORWARD_TO` are **defaults**: the admin UI
can override them in KV (`settings:v1`). The env/secret values are the bootstrap
used until something is saved.

Secret (`wrangler secret put`, never committed):

- `FORWARD_TO` — destination inbox; also the only address allowed to drive the
  relay. Kept out of `[vars]` because it is personal data.

Bindings:

- `EMAIL_THREADS` — KV namespace for thread mappings
- `EMAIL_SENDING` — Email Sending binding (unrestricted, so the relay can send to
  arbitrary original senders)

## Adding Features — Checklist

1. Put new pure logic in `src/lib.js`; keep `index.js` to entrypoint + handlers.
2. Add/extend tests in `test/` (cover every new rejection path).
3. Run `npm test` and `npm run check`.
4. Update this file, `README.md`, and `docs/CHANGELOG.md` as required.
5. Bump the version across all files listed in CONTRIBUTING if behavior changes.

## What NOT to Do

- Do not log full message bodies, sender addresses, or KV values (PII).
- Do not put secrets in `[vars]`; use `wrangler secret put`.
- Do not relax the allowlist, relay sender check, or auto-submitted drop without
  an explicit, documented reason.
- Do not strip threading headers (`Subject`, `Message-ID`, `In-Reply-To`,
  `References`) during rewrite.
- Do not silently drop unexpected mail — reject with a clear reason.
