# Contributing to PunchIn Email Worker

Thanks for your interest in contributing!

## License of Contributions

This project is licensed under the [Apache License 2.0](../LICENSE). Per section
5 of that license, any contribution you intentionally submit for inclusion in
the project is provided under the same license, with no additional terms — no
separate CLA to sign.

## Reporting Security Vulnerabilities

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report them privately by emailing
[cve@trackmytime.today](mailto:cve@trackmytime.today) or using GitHub's private
advisory system:
**[Report a vulnerability →](https://github.com/PunchIn-App/punchin-email/security/advisories/new)**

See [SECURITY.md](../SECURITY.md) for the full policy, supported versions, and response timeline.

## Code of Conduct

This project follows a [Code of Conduct](../CODE_OF_CONDUCT.md). By participating, you
agree to uphold it. Report unacceptable behavior privately to
[abuse@trackmytime.today](mailto:abuse@trackmytime.today).

---

## Getting Started

```bash
git clone https://github.com/PunchIn-App/punchin-email.git
cd punchin-email
npm install
npm test          # run the Vitest suite once
npm run test:watch
npm run check     # wrangler deploy --dry-run (bundles, no upload)
npm run dev       # wrangler dev (local worker)
```

A build is considered passing when **both** of the following succeed:

```bash
npm test
npm run check
```

CI enforces this on every push to `main` and on every PR.

---

## Deployment & secrets

The worker is deployed with `npm run deploy` (`wrangler deploy`). Mail is routed
to it via Cloudflare Email Routing — see the **Email Routing setup** section of
[`README.md`](../README.md).

Configuration lives in `wrangler.toml`:

- **Non-secret vars** (`RELAY_DOMAIN`, `ALLOWED_ALIASES`) go in the `[vars]`
  block. These are committed to the repo, so **never put a secret or personal
  address here.**
- **`FORWARD_TO`** is the personal destination inbox (PII), so it is **not** in
  `[vars]`. Set it as a secret with `wrangler secret put FORWARD_TO` and read it
  from `env.FORWARD_TO` at runtime. Any other secret follows the same rule.

Bindings (`EMAIL_THREADS` KV, `EMAIL_SENDING`) are declared in `wrangler.toml`;
changing a binding name requires updating both the config and `src/index.js`.

---

## Workflow

1. Fork the repo and create a branch from `main`
2. Make your changes — see [`CLAUDE.md`](../CLAUDE.md) for architecture conventions
3. Add or update tests under `test/` and run `npm test`
4. Run `npm run check` to confirm the worker still bundles
5. Follow the **versioning**, **documentation**, and **testing** requirements below
6. Open a pull request with a clear description

---

## Versioning

The worker uses **semantic versioning** (`MAJOR.MINOR.PATCH`).

### What triggers each increment

| Change type | Increment |
|---|---|
| Change to inbound/relay behavior visible to senders or recipients | `MINOR` |
| New configurable var or binding | `MINOR` |
| New alias category or routing rule supported by the worker | `MINOR` |
| Bug fix in routing, header rewriting, or delivery | `PATCH` |
| New safety/robustness guard with no behavior change for normal mail | `PATCH` |
| Internal refactor (no behavior change) | `PATCH` |
| Dependency update (no behavior change) | `PATCH` |
| Test additions only | no bump |
| CI / workflow config change only | no bump |
| Documentation-only change | no bump |

**Tiebreaker:** if a sender or recipient would observe the change in delivered
mail, it's at least `MINOR`.

### When a version bump is required

A version bump commit must update **all** of the following in the same PR:

| File | What to change |
|---|---|
| `package.json` | `"version"` field — source of truth |
| `README.md` | Version badge URL |
| `CLAUDE.md` | `**Version:**` in the header |
| `docs/CHANGELOG.md` | New section at the top (see format below) |
| `SECURITY.md` | Update the **Supported Versions** table — set the new `X.Y.x` row to **Yes**, mark prior versions **No** |

Commit message convention: `chore: bump to vX.Y.Z`

---

## Documentation Requirements

Every PR that changes code must update the relevant documentation in the **same
PR**. This is not optional — stale docs are treated as a bug.

| What changed in your PR | `CLAUDE.md` | `README.md` | `docs/CHANGELOG.md` |
|---|---|---|---|
| New helper in `src/lib.js` | Add to Repository Structure | — | — |
| New/changed routing or guard | Update the relevant section | ✓ if behavior changes | ✓ |
| New config var or binding | Update Configuration & Bindings | Update Configuration table | ✓ |
| New alias category | Update Email Flow | Update alias list | ✓ |
| Version bump | Update `**Version:**` header | Update version badge | Add new section |

---

## CHANGELOG Format

Add a new section at the very top of `docs/CHANGELOG.md`. Follow
[Keep a Changelog](https://keepachangelog.com/):

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Added
- Relay — short description of a new capability

### Changed
- Inbound — what changed and how it differs from before

### Fixed
- Relay — what was broken and what it does now

### Security
- Hardened — what was tightened and why
```

Rules:
- Omit sections that have no entries
- Write from the operator's / correspondent's perspective, not the diff's
- Start each bullet with the area: `Inbound — `, `Relay — `, `Routing — `, etc.
- Internal refactors with no observable effect go under `Changed` with an `(internal)` suffix

---

## Testing

- Run `npm test` before opening a PR
- Pure logic lives in `src/lib.js` and must be covered by `test/lib.test.js`
- Handler behavior (including every rejection path) is covered by
  `test/handlers.test.js` using the mocked message / KV / send doubles in
  `test/helpers.js`
- Do not remove or weaken existing tests

---

## Code Conventions

The full conventions are in [`CLAUDE.md`](../CLAUDE.md). Key rules:

- **Keep logic pure where possible** — runtime-agnostic helpers go in
  `src/lib.js` (no `cloudflare:email` import) so they can be unit-tested under
  plain Node. `src/index.js` holds only the `email()` entrypoint and the two
  handlers, which are exported for testing.
- **Never weaken the safety guards** — the alias allowlist (inbound), the relay
  sender verification (`From == FORWARD_TO`), and the auto-submitted drop exist
  to prevent open forwarding, alias spoofing, and mail loops. Changes that relax
  them need an explicit rationale in the PR.
- **Preserve threading** — when rewriting headers, keep `Subject`, `Message-ID`,
  `In-Reply-To`, and `References`; only strip sender-bound headers.
- **Protect PII** — thread mappings and email content contain personal data.
  Never log full message bodies, sender addresses, or KV values; keep the 30-day
  TTL on stored threads.
- **No secrets in `[vars]`** — see Deployment & secrets above.
- **Reject, don't silently drop** — unexpected/unauthorized mail should call
  `message.setReject()` with a clear reason rather than disappearing.
