# Changelog

All notable changes to the PunchIn Email Worker are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
