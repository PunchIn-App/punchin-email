# PunchIn Email Worker — AI Assistant Guide

**Version:** 1.6.2

This file is the architectural source of truth for the worker. Read it before
making changes, and keep it current (see Documentation Requirements in
[`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md)).

## Project Overview

A Cloudflare Email Worker that gives `trackmytime.today` a set of two-way role
aliases. Inbound mail to `abuse@`, `cla@`, `contact@`, `cve@`, `feedback@`, `licensing@`, `privacy@` (and any
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
  RELEASING.md       versioning rules + release procedure (linked from CONTRIBUTING)
.github/
  CONTRIBUTING.md    contribution workflow + conventions
  workflows/
    ci.yml                    CI: npm test + wrangler dry-run
    project-automation.yml    adds new issues/PRs to the shared PunchIn project board (#1) + sets Labels/Priority/Size/dates; clears assignees on close
    milestone-on-release.yml  on a MINOR/MAJOR release (vX.Y.0): create the vX.Y.0 milestone + assign merged PRs since the last minor/major release (patch releases publish but get no milestone; their PRs roll into the next minor/major)
    notify-status-update.yml  on release: relay to punchin (repository_dispatch: email-release) so it posts a unified, whole-project status update
wrangler.toml        worker config, vars, and bindings
```

## Project board automation

This repo is tracked on the shared **[PunchIn project board](https://github.com/orgs/PunchIn-App/projects/1)** alongside `punchin`. The three project workflows above auto-add and annotate issues/PRs and create release milestones; they run under the `ADD_TO_PROJECT_PAT` secret (Projects + Issues read/write, Contents read/write). **Status** is owned by the project's built-in workflows; **status updates** (the project's "Updates" panel) are posted from `punchin` — this repo's `notify-status-update.yml` just relays its releases there, so every update covers the whole project. See `punchin`'s CLAUDE.md → "Project board automation" for the full description.

### Helpers (`src/lib.js`)

- `generateId(getRandomValues?)` — random 16-char hex thread id (RNG injectable)
- `parseRelayThreadId(address)` — `relay+<id>@…` → `<id>` or `null`
- `baseLocalPart(address)` — local-part minus `+subaddress`, lowercased
- `isAllowedAlias(address, allowed)` — allowlist check against base local-part
- `addressesEqual(a, b)` — case-insensitive address compare (unwraps display names)
- `isAutoSubmitted(headers)` — detects bounces / vacation responders
- `senderDomainOf(address)` — domain part of an address, lowercased
- `relayReplyAuthVerdict(headers, senderDomain)` — `pass`/`fail`/`unknown` from
  Cloudflare's SPF/DKIM/DMARC stamp on the reply, trusting only the
  `mx.cloudflare.net` authserv-id; fail-open (issue #31)
- `isValidEmailAddress(value)` — loose single-address check for admin input
- `normalizeAliasList(input)` — clean/dedupe/sort alias local-parts; throws on an
  invalid or reserved (`relay`) token
- `normalizeContactUrl(value)` — validate the optional contact URL (empty or http(s))
- `rewriteHeaders(rawText, from, to, replyTo?)` — swaps From/To, strips sender-bound
  headers; with the optional `replyTo` it injects a fresh `Reply-To` (the inbound
  path uses this; the relay path omits it to keep the asymmetric model)
- `inboundFromHeader(originalSender, aliasEmail)` — builds the inbound `From`:
  `"<sender> via PunchIn" <alias@RELAY_DOMAIN>` (alias as the address, sender escaped
  into the display name)

## Email Flow

**Inbound** (`handleInbound`): reject non-allowlisted recipients → generate a
thread id → store `{originalSender, aliasEmail, timestamp}` in `EMAIL_THREADS`
(30-day TTL) → rewrite the raw message so it is `From` the alias
(`inboundFromHeader` → `"<sender> via PunchIn" <alias>`), `To` the inbox, with
`Reply-To: relay+<id>@RELAY_DOMAIN`, and **send** it via `EMAIL_SENDING`.

It deliberately does **not** `message.forward()` (the doxxing fix):
`forward()` silently drops the added `Reply-To`, so the owner's reply went
straight to the original sender — leaking the inbox's real address. Sending lets
both the `From` and the `Reply-To` be relay-controlled addresses, so the owner's
reply always re-enters `handleRelay` and is re-masked. Even a client that ignores
`Reply-To` and replies to the `From` only re-enters `handleInbound` (the alias),
never the sender — there is no leak path. (Envelope From is the bare alias, a
verified `RELAY_DOMAIN` address, so DKIM/DMARC align.)

**Relay** (`handleRelay`): reject if `From != FORWARD_TO` → reject if the reply's
SPF/DKIM/DMARC verdict shows it didn't authenticate as the `FORWARD_TO` domain
(`relayReplyAuthVerdict`, fail-open) → reject auto-submitted mail → parse and look
up the thread id → rewrite headers → send via `EMAIL_SENDING` → **refresh the
thread's KV TTL**.

The `email()` entrypoint routes by recipient: `relay+` prefix → relay handler,
everything else → inbound handler. Both handlers read the effective config via
`getSettings(env)` (KV record layered over env defaults), so the forwarding
address / aliases / contact URL can change at runtime.

**Threading model (deliberately asymmetric).** The two directions use the
`relay+<id>` Reply-To differently — on purpose:

- **Inbound → owner** (`handleInbound`) **does** carry `Reply-To:
  relay+<id>@RELAY_DOMAIN`. That is the owner's reply channel: the owner's reply
  lands on `relay+<id>@` → `handleRelay`, gated by `From == FORWARD_TO`, and is
  re-masked out from the alias. Reserving `relay+<id>` for the authenticated owner
  is exactly what makes setting it here safe (a stranger who learned the id can't
  drive the relay — they fail the `From == FORWARD_TO` gate).
- **Relay → original sender** (`handleRelay`) is intentionally **not** given a
  `relay+<id>` `Reply-To` — that address is reserved for the owner, so routing the
  sender's replies through it would only hit the relay-sender gate and bounce.
  Instead the original sender replies to the bare alias, which re-enters
  `handleInbound` and mints a **fresh** thread id; `In-Reply-To`/`References`
  preserve client-side threading. A new thread id per inbound is therefore expected
  behaviour, not a bug (issue #33).

**Thread TTL.** Each mapping is stored with a 30-day TTL (`THREAD_TTL_SECONDS`). A
successful relay **refreshes** that TTL, so an actively used thread never ages out
from under the participants while idle ones still expire 30 days after their last
activity (issue #32). The refresh re-writes the record with a fresh `lastRelayedAt`
stamp (the original `timestamp` field is frozen at creation), so an operator
inspecting a KV entry can distinguish an actively used thread from one idle since
creation (issue #75); routing reads only `aliasEmail` / `originalSender`, so the
added field is diagnostic-only and needs no migration. The refresh is best-effort —
a failed refresh never fails the already-sent relay.

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
app's design system: Noto Sans / Display / Mono typography (self-hosted-or-system
only — **no CDN font links**, per the project font policy; the Noto families
render when installed locally, with `system-ui` / `ui-monospace` fallbacks
otherwise), the dark-slate surface ramp, and the default accent **PunchIn Blue
`#2D5BF5`** (`--accent` — the user-owned token the app repaints from; replaces the
former `#1f6feb`). Card / input / button conventions follow the design system:
white-on-accent primary button, `--radius` (11px) inputs, mono overline badges.
The brand mark is the refreshed **stopwatch** (Lucide `Timer` + `Clock`, white ink)
on a rounded accent square, and the wordmark tints the capital **I** in "PunchIn"
with `--accent`. The canonical tokens live in the `punchin-design-system` project
(`project/colors_and_type.css`); keep this page consistent with it when editing.

## Robustness Guards (do not weaken without rationale)

- **Alias allowlist** (`ALLOWED_ALIASES`) — prevents open forwarding under a
  catch-all route.
- **Relay sender verification** (`From == FORWARD_TO`, plus an SPF/DKIM/DMARC
  alignment check) — prevents alias spoofing / open relay by anyone who learns a
  thread id. The `From` gate trusts the unauthenticated header sender, so the
  relay **also** consults the verdict Cloudflare stamps on the inbound reply
  (`relayReplyAuthVerdict`): a reply that did not authenticate as the
  `FORWARD_TO` domain (`dmarc=pass` aligned to it, or an aligned `dkim=pass`) is
  rejected (issue #31). **Fail-open** — it acts only on Cloudflare's own
  strip-protected authserv-id (`mx.cloudflare.net`, removed if a sender forges it
  per RFC 8601 §5), so an absent / unrecognised verdict still relays and
  legitimate mail is never bounced. *Residual risk:* the check reads a header
  rather than verifying the ARC seal cryptographically, so it is defence-in-depth
  (further mitigated by `FORWARD_TO` being secret and random 64-bit thread ids),
  and it only enforces once Cloudflare's authserv-id matches the trusted value —
  the per-relay verdict is logged (no PII) so that can be confirmed in production.
- **Auto-submitted drop** — prevents mail loops.
- **Sender-header allowlisting** — the rewrite keeps only a fixed *allowlist* of
  headers a recipient needs to render/thread the reply (`Subject`, `Date`,
  `Message-ID`, `In-Reply-To`, `References`, `MIME-Version`, `Content-*`) and
  drops everything else by default — so trace/auth headers that can leak the
  inbox address (`Received`, `Authentication-Results`, `ARC-*`, `X-Google-*`,
  `DKIM-Signature`, `Return-Path`, `Reply-To`, `Sender`, …), including any future
  `X-` header, never survive. Any inbound `Reply-To` is therefore dropped too; the
  fresh `From`/`To` (and, on the inbound path only, a fresh `Reply-To`) are then
  prepended by `rewriteHeaders`. Injecting that inbound `Reply-To` does not weaken
  the guard: its value is the server-minted `relay+<id>@RELAY_DOMAIN`, which
  contains a random 64-bit id and nothing about the inbox address, and the sender's
  own `Reply-To` is still stripped first — so no inbox metadata leaks and the
  injected value is not attacker-controlled (no header-injection vector; CR/LF are
  stripped from it regardless). Cloudflare re-signs DKIM on the outbound send.

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

1. Put new pure logic in `src/lib.js`; keep `index.js` to its `email()` / `fetch()` entrypoints + handlers.
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
