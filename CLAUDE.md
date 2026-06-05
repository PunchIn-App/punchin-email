# PunchIn Email Worker — AI Assistant Guide

**Version:** 1.2.6

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
  workflows/
    ci.yml                    CI: npm test + wrangler dry-run
    project-automation.yml    adds new issues/PRs to the shared PunchIn project board (#3) + sets Labels/Priority/Size/dates; clears assignees on close
    milestone-on-release.yml  on release: create the vX.Y.Z milestone + assign merged PRs since the last release
    notify-status-update.yml  on release: relay to punchin (repository_dispatch: email-release) so it posts a unified, whole-project status update
wrangler.toml        worker config, vars, and bindings
```

## Project board automation

This repo is tracked on the shared **[PunchIn project board](https://github.com/orgs/PunchIn-App/projects/3)** alongside `punchin`. The three project workflows above auto-add and annotate issues/PRs and create release milestones; they run under the `ADD_TO_PROJECT_PAT` secret (Projects + Issues read/write, Contents read/write). **Status** is owned by the project's built-in workflows; **status updates** (the project's "Updates" panel) are posted from `punchin` — this repo's `notify-status-update.yml` just relays its releases there, so every update covers the whole project. See `punchin`'s CLAUDE.md → "Project board automation" for the full description.

### Helpers (`src/lib.js`)

- `generateId(getRandomValues?)` — random 16-char hex thread id (RNG injectable)
- `parseRelayThreadId(address)` — `relay+<id>@…` → `<id>` or `null`
- `baseLocalPart(address)` — local-part minus `+subaddress`, lowercased
- `isAllowedAlias(address, allowed)` — allowlist check against base local-part
- `addressesEqual(a, b)` — case-insensitive address compare (unwraps display names)
- `isAutoSubmitted(headers)` — detects bounces / vacation responders
- `isValidEmailAddress(value)` — loose single-address check for admin input
- `normalizeAliasList(input)` — clean/dedupe/sort alias local-parts; throws on an
  invalid or reserved (`relay`) token
- `normalizeContactUrl(value)` — validate the optional contact URL (empty or http(s))
- `rewriteHeaders(rawText, from, to)` — swaps From/To, strips sender-bound headers

## Email Flow

**Inbound** (`handleInbound`): reject non-allowlisted recipients → generate a
thread id → store `{originalSender, aliasEmail, timestamp}` in `EMAIL_THREADS`
(30-day TTL) → `message.forward(FORWARD_TO, { Reply-To: relay+<id>@RELAY_DOMAIN })`.

**Relay** (`handleRelay`): reject if `From != FORWARD_TO` → reject auto-submitted
mail → parse and look up the thread id → rewrite headers → send via
`EMAIL_SENDING` → **refresh the thread's KV TTL**.

The `email()` entrypoint routes by recipient: `relay+` prefix → relay handler,
everything else → inbound handler. Both handlers read the effective config via
`getSettings(env)` (KV record layered over env defaults), so the forwarding
address / aliases / contact URL can change at runtime.

**Threading model (deliberately asymmetric).** The owner's replies leave via
`relay+<id>@RELAY_DOMAIN` → `handleRelay`, gated by `From == FORWARD_TO`. The
outbound to the original sender is intentionally **not** given a `relay+<id>`
`Reply-To`: that address is reserved for the authenticated owner, so routing the
original sender's replies through it would only hit the relay-sender gate and
bounce. Instead the original sender replies to the bare alias, which re-enters
`handleInbound` and mints a **fresh** thread id; `In-Reply-To`/`References`
preserve client-side threading. A new thread id per inbound is therefore expected
behaviour, not a bug (issue #33).

**Thread TTL.** Each mapping is stored with a 30-day TTL (`THREAD_TTL_SECONDS`). A
successful relay **refreshes** that TTL (re-puts the record verbatim), so an
actively used thread never ages out from under the participants while idle ones
still expire 30 days after their last activity (issue #32). The refresh is
best-effort — a failed refresh never fails the already-sent relay.

**Error handling.** Permanent, non-retriable conditions (unknown alias, corrupt
thread record, auto-submitted, malformed relay address) are rejected with
`setReject` and a clear reason. Transient infra failures (KV/send) are left to
**throw** out of `email()` so Cloudflare retries the message, rather than being
turned into a permanent `setReject` bounce that would lose legitimate mail
(issue #34).

## Admin UI (`fetch()`)

The `fetch()` entrypoint serves a small admin page (`/`) and a settings API
(`GET/PUT /api/settings`). Every request is gated by `authenticateAdmin`, which
**fails closed** (503) unless `ACCESS_AUD` + `ACCESS_TEAM_DOMAIN` are set, then
verifies the Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`): signature against
the team JWKS, plus AUD / issuer / expiry. Mutations also require a same-origin
`Origin`. Editable settings live in the `EMAIL_THREADS` KV under
`settings:v1` (no TTL); `RELAY_DOMAIN` is not editable.

The page (`renderAdminPage` in `src/admin.js`) is self-contained HTML/CSS/JS with
no build step. Below the settings form it carries a static **About** section
(worker summary, the `VERSION` constant, relay domain, auth model, and links to
the repo / changelog / security policy). It mirrors the main
[`punchin`](https://github.com/PunchIn-App/punchin)
app's design system: Noto Sans / Display / Mono typography (loaded from Google
Fonts), the app's dark-slate palette and default accent (`#1f6feb` — the app's
runtime default; the amber in its `index.css` is only a static fallback), and its
card / input / button conventions. The brand mark is the app's logo — a lucide
`Clock` (`circle r=10` + `polyline 12 6 12 12 16 14`, dark `#0F1117` ink) on a
rounded accent square. Keep it visually consistent with that app when editing.

## Robustness Guards (do not weaken without rationale)

- **Alias allowlist** (`ALLOWED_ALIASES`) — prevents open forwarding under a
  catch-all route.
- **Relay sender verification** (`From == FORWARD_TO`) — prevents alias spoofing
  / open relay by anyone who learns a thread id. *Accepted risk (issue #31):*
  `From` is the unauthenticated SMTP envelope sender, so a caller who learned
  **both** a live 64-bit thread id **and** the secret `FORWARD_TO` could attempt
  to forge it. Mitigated by Cloudflare's routing, `FORWARD_TO` being a secret,
  and random 64-bit thread ids; additionally consulting Cloudflare's
  SPF/DKIM/DMARC results on the inbound reply is a possible future hardening.
- **Auto-submitted drop** — prevents mail loops.
- **Sender-header allowlisting** — the rewrite keeps only a fixed *allowlist* of
  headers a recipient needs to render/thread the reply (`Subject`, `Date`,
  `Message-ID`, `In-Reply-To`, `References`, `MIME-Version`, `Content-*`) and
  drops everything else by default — so trace/auth headers that can leak the
  inbox address (`Received`, `Authentication-Results`, `ARC-*`, `X-Google-*`,
  `DKIM-Signature`, `Return-Path`, `Reply-To`, `Sender`, …), including any future
  `X-` header, never survive. Cloudflare re-signs DKIM on the outbound send.

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
