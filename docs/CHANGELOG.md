# Changelog

All notable changes to the PunchIn Email Worker are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.6.0] — 2026-06-08

Adds a new role alias. A new alias category supported by the worker, so `MINOR`.

### Added

- **`privacy@trackmytime.today` role alias.** Inbound mail to `privacy@` (plus any
  `+subaddress`) now forwards to the inbox and supports the two-way reply relay,
  exactly like the existing aliases. Added to the `ALLOWED_ALIASES` default; the
  live runtime allowlist (KV `settings:v1`) was updated to match. No new Email
  Routing rule is needed — the catch-all already delivers every address to the
  worker, which gates forwarding by the allowlist.

## [1.5.0] — 2026-06-08

A privacy fix to the inbound path. Observable in delivered mail (the `From` of
forwarded mail changes), so `MINOR` per the versioning tiebreaker.

### Security

- **Inbound no longer leaks the inbox address on a reply (the doxxing fix).**
  `handleInbound` previously delivered mail with `message.forward(FORWARD_TO, {
  Reply-To: relay+<id>@ })`. Cloudflare's `forward()` **silently drops** an added
  `Reply-To`, so the forwarded mail kept the original sender's own `From` and no
  working relay `Reply-To` — and the inbox owner's reply went **straight to the
  stranger from the owner's personal address**, exposing it. The inbound path now
  **sends** the mail via the `EMAIL_SENDING` binding (the same mechanism the relay
  already uses) instead of forwarding it, rewritten so that:
  - `From:` is the alias the sender wrote to — `"<sender> via PunchIn"
    <alias@RELAY_DOMAIN>` (the sender is shown in the display name so the owner
    still sees who it is);
  - `Reply-To:` is the working `relay+<id>@RELAY_DOMAIN`.

  Both are relay-controlled, so the owner's reply always re-enters `handleRelay`
  and is re-masked from the alias — the personal address is never exposed in
  either direction. Even a mail client that ignores `Reply-To` and replies to the
  `From` only re-enters `handleInbound` (the alias), never the stranger, so there
  is no leak path. Because the envelope and header `From` are both alias addresses
  on `RELAY_DOMAIN`, the sent mail aligns DKIM/DMARC. `rewriteHeaders` gained an
  optional 4th `replyTo` argument to inject the inbound `Reply-To`; the relay
  direction omits it, preserving the asymmetric threading model.

  Advisory: [GHSA-2ph7-69xm-hmwv](https://github.com/PunchIn-App/punchin-email/security/advisories/GHSA-2ph7-69xm-hmwv)
  (severity Low; CVE requested). Fix: [#66](https://github.com/PunchIn-App/punchin-email/pull/66).

---

## [1.4.0] — 2026-06-07

### Added

- **Inbound** — two new role aliases now forward to the inbox: `contact@`
  (general contact) and `feedback@` (product feedback), joining the existing
  `cla@`, `cve@`, `abuse@`, and `licensing@`. The default `ALLOWED_ALIASES` is
  now `abuse,cla,contact,cve,feedback,licensing`. Because the worker runs behind
  a catch-all route, no new per-address routing rule is needed — mail to the new
  aliases (and any `+subaddress`) is accepted and forwarded like the others, and
  replies relay back out from the alias as usual.

---

## [1.3.1] — 2026-06-04

A security-hardening patch. No change to normal mail flow.

### Security

- **Relay sender authentication** — the reply relay now adds a defence-in-depth
  check on top of the existing `From == FORWARD_TO` gate. That gate trusts the
  unauthenticated header sender; the worker now also consults the SPF/DKIM/DMARC
  verdict that Cloudflare stamps on the inbound reply
  (`ARC-Authentication-Results`, authserv-id `mx.cloudflare.net`) and refuses to
  relay a reply that demonstrably did **not** authenticate as the `FORWARD_TO`
  domain (`dmarc=pass` aligned to it, or an aligned `dkim=pass`). The check is
  conservative and **fail-open**: it only acts on Cloudflare's own
  strip-protected authserv-id, so an absent or unrecognised verdict still relays
  and legitimate mail is never bounced on a header we don't recognise. The
  per-relay verdict (no addresses or body) is logged so the exact header can be
  confirmed in production. Narrows the accepted risk noted at #31. (#31)

---

## [1.3.0] — 2026-06-04

A security- and robustness-hardening release closing the 18 findings of the
June 2026 internal assessment (tracker #45). No new features; several changes are
observable in delivered mail (broader loop protection, long-lived threads, a
fixed body-loss bug), so this is a `MINOR` per the versioning tiebreaker.

### Security

- **Admin CSRF** — `PUT /api/settings` now requires a **present**, same-origin
  `Origin` header. A request that omitted the header entirely was previously
  allowed through; browsers always attach `Origin` on a state-changing fetch, so
  its absence is now treated as a forged / non-browser caller. Defence-in-depth
  behind Cloudflare Access. (#28, #40)
- **Header-injection guard** — `rewriteHeaders` strips CR/LF from the injected
  `From`/`To`, so a crafted alias or sender address can't smuggle extra headers
  into the relayed message. (#27)
- **Access JWT clock skew** — `validateAccessClaims` applies a symmetric
  60-second leeway to the `exp` check (matching the existing `nbf` leeway, via a
  shared `CLOCK_SKEW_SEC` constant), so minor clock drift between the worker and
  Cloudflare's issuer no longer locks out a valid admin. Tokens expired beyond
  the window — and missing / non-numeric `exp` — are still rejected. (#29)

### Fixed

- **LF-only messages lost their body** — header rewriting now normalizes bare-LF
  / bare-CR input to CRLF before splitting headers from body, so a reply that
  uses LF-only line endings no longer drops every header and its body. (#37)
- **Long-lived threads expired mid-conversation** — a successful relay now
  **refreshes** the thread mapping's 30-day KV TTL, so an actively used thread no
  longer ages out and bounces a legitimate reply; idle threads still expire. The
  refresh is best-effort and never fails the already-sent relay. (#32)
- **Opaque handler failures** — a corrupt thread record is rejected with a clear
  reason instead of throwing, and transient KV / send failures propagate so
  Cloudflare retries rather than permanently bouncing legitimate mail. (#34)
- **Relay-id probing** — `parseRelayThreadId` anchors to exactly the 16-hex-char
  id length the worker emits, so an odd-length probe address can't trigger a KV
  lookup. (#36)

### Changed

- **Broader loop protection** — `isAutoSubmitted` now also drops
  `Precedence: auto_replied`, `X-Autoresponder`, and RFC 2369 mailing-list
  headers (`List-Id` / `List-Unsubscribe` / `List-Help` / `List-Post`).
  Person-to-person mail is unaffected. (#35, #43)

### Documentation

- **CLAUDE.md** — documented the deliberately asymmetric threading model (and why
  the outbound carries no `relay+` `Reply-To`), the TTL-refresh behaviour, the
  error-handling policy, and the accepted risk that relay auth trusts the
  unauthenticated SMTP envelope sender (with SPF/DKIM/DMARC as possible future
  hardening). Corrected the header-rewrite guard description to "allowlisting."
  (#30, #31, #33)

### Internal

- **Test fidelity & coverage** — the Email Sending test double now structurally
  validates the rewritten raw (CRLF endings, header/body delimiter,
  address-bearing `From`/`To`), so a malformed rewrite fails the suite instead of
  shipping green. Added coverage for the JWT `alg=none` / unparseable / JWKS-fail
  / `nbf` paths, the missing-`Origin` CSRF case, the TTL refresh, and the handler
  error paths. Suite grew from 65 to 89 tests. (#38, #39, #41, #42, #44)

---

## [1.2.6] — 2026-06-04

### Added
- Admin — an **About this worker** section on the admin page: a plain-language
  summary of what the relay does, plus version, relay domain, auth model, and
  links to the source, changelog, and security policy.
- README — a top-level **About** section summarizing what/for/stack/state/status
  /license at a glance.
- Docs — a **Cutting a release** checklist in `CONTRIBUTING.md` (tag → push →
  `gh release create vX.Y.Z` from the changelog notes → deploy), linked from the
  README Deploy section. (internal)

---

## [1.2.5] — 2026-06-04

### Changed
- Admin — the brand mark now uses the PunchIn app's actual logo geometry (the
  lucide `Clock` icon on a rounded accent square) instead of a hand-drawn
  approximation.

---

## [1.2.4] — 2026-06-04

### Fixed
- Admin — corrected the admin-UI accent to the app's default `#1f6feb`. 1.2.3
  used the amber `--accent-rgb` from the app's `index.css`, but that is only a
  static fallback; the app sets its accent at runtime (default `#1f6feb`).

---

## [1.2.3] — 2026-06-03

### Changed
- Admin — restyled the admin UI to match the main PunchIn app's design system:
  Noto Sans / Noto Sans Display / Noto Sans Mono typography, the app's
  dark-slate palette and amber accent, and its card / input / button
  conventions. The page now loads the Noto family from Google Fonts (with a
  system-font fallback), consistent with the app.

---

## [1.2.2] — 2026-06-03

### Security
- Hardened — replaced the display-name unwrap regex in `normalizeAddress`
  (`src/lib.js`) with linear index scans. The old `/<([^>]+)>/` match re-anchored
  at every `<`, so a crafted `From`/`Reply-To` header value could force
  quadratic backtracking (polynomial ReDoS, CWE-1333) on attacker-influenced
  mail. Address comparison is unchanged for normal mail.
- CI — the GitHub Actions workflow now declares a least-privilege
  `permissions: contents: read` block.

---

## [1.2.1] — 2026-06-03

### Changed
- Admin — wired the Cloudflare Access application by setting `ACCESS_AUD` and
  `ACCESS_TEAM_DOMAIN` in `wrangler.toml`. The admin UI no longer fails closed
  (503); requests are now verified against the configured Access app.
- Docs — the admin-UI auth guidance (README, `src/access.js` comment) now
  describes **Cloudflare account login** as the identity method instead of
  GitHub. The JWT verification itself is identity-provider agnostic and is
  unchanged.

---

## [1.2.0] — 2026-06-03

### Added
- Admin — the worker now serves a small admin UI (and `GET/PUT /api/settings`)
  from a `fetch()` handler, gated by Cloudflare Access (Cloudflare account login).
  From it you can change the forwarding address, the accepted aliases, and the
  contact URL without a redeploy.
- Settings — these three values are now read from a single KV record, layered
  over the `wrangler.toml` / secret defaults; the email handlers read the
  effective settings on each message. `RELAY_DOMAIN` stays static.

### Security
- Admin — the admin handler fails closed: if the `ACCESS_AUD` /
  `ACCESS_TEAM_DOMAIN` vars are unset it returns 503 and serves nothing. When
  configured, every request is verified against the Access JWT (signature + AUD
  + issuer + expiry); mutations also require a same-origin `Origin`.

---

## [1.1.1] — 2026-06-03

### Security
- Tooling — upgraded the `wrangler` dev dependency from v3 to v4, which removes
  the vulnerable transitive packages flagged by `npm audit` (esbuild, undici,
  miniflare, ws). `npm audit` now reports 0 vulnerabilities. These were dev/CLI
  tooling only and never shipped in the deployed worker.

### Changed
- Tooling — wrangler 4 requires Node.js ≥ 22, so the project now declares
  `engines.node >= 22` and CI runs on Node 22. (internal)
- CI — Dependabot now groups all npm updates into a single weekly PR (and all
  GitHub Actions updates into another), instead of one PR per dependency. (internal)

---

## [1.1.0] — 2026-06-03

### Added
- Inbound — mail to an unrecognized address is now rejected with a branded
  reason that points the sender at a contact URL
  (e.g. `No such address at trackmytime.today. See https://trackmytime.today`),
  configurable via the new optional `CONTACT_URL` var (defaults to
  `https://<RELAY_DOMAIN>`). Unknown addresses are still rejected at SMTP time —
  no auto-reply is sent — so there is no backscatter and nothing is stored in KV.

---

## [1.0.1] — 2026-06-03

### Security
- Relay — header rewriting now uses a strict **allowlist** (`Subject`, `Date`,
  `Message-ID`, `In-Reply-To`, `References`, `MIME-Version`, `Content-*`) and
  prepends a fresh `From`/`To`, instead of stripping a fixed denylist. This
  drops the trace and authentication headers Gmail attaches (`Received`,
  `Authentication-Results`, `ARC-*`, `X-Google-*`, `X-Gm-*`, ...), which could
  otherwise carry the relaying inbox's address through to the recipient.

### Changed
- Config — `FORWARD_TO` is no longer stored in `wrangler.toml [vars]`. Because it
  is the personal destination inbox, it is now provided as a secret
  (`wrangler secret put FORWARD_TO`) and kept out of version control. **Operators
  must set this secret and redeploy.**

---

## [1.0.0] — 2026-06-03

### Added
- Inbound — emails to the role aliases `cla@`, `licensing@`, `cve@`, and
  `abuse@` (including any `+subaddress`) are forwarded to the configured inbox,
  with a `Reply-To: relay+<id>@trackmytime.today` that encodes a stored thread.
- Relay — replies to a `relay+<id>@` address are sent back out **from the
  original alias to the original sender**, with `From`/`To` rewritten and
  threading headers preserved.
- Routing — thread mappings (`originalSender`, `aliasEmail`, `timestamp`) are
  stored in the `EMAIL_THREADS` KV namespace under a random 64-bit id with a
  30-day TTL; expired threads are rejected gracefully.

### Security
- Hardened — inbound enforces an alias allowlist (`ALLOWED_ALIASES`) so the
  worker cannot be used as an open forwarder for the whole domain.
- Hardened — the relay only proceeds when the reply's `From` matches
  `FORWARD_TO`, preventing anyone who learns a thread id from sending mail from
  an alias (alias spoofing / open relay).
- Hardened — auto-submitted mail (vacation responders, bounces) is not relayed,
  preventing mail loops.
- Hardened — the now-invalid original `DKIM-Signature` is stripped on rewrite so
  Cloudflare's re-signed signature is the only one present.
