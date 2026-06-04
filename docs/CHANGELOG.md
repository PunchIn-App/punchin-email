# Changelog

All notable changes to the PunchIn Email Worker are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

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
