## Summary

<!-- What does this PR do and why? One to three bullet points. -->

-

## Type of change

<!-- Check all that apply -->

- [ ] Bug fix in routing / header rewriting / delivery (→ `PATCH`)
- [ ] New or changed inbound/relay behaviour visible to senders or recipients (→ `MINOR`)
- [ ] New config var or binding, or a newly supported alias category (→ `MINOR`)
- [ ] New robustness / safety guard with no change for normal mail (→ `PATCH`)
- [ ] Internal refactor / dependency update (→ `PATCH`)
- [ ] Test additions only (no version bump)
- [ ] CI / docs only (no version bump)

## Checklist

### Code

- [ ] `npm test` passes
- [ ] `npm run check` (wrangler dry-run) passes
- [ ] New behaviour has a test added alongside it — every new rejection path is covered
- [ ] No secret or personal address added to `wrangler.toml [vars]` (secrets go via `wrangler secret put`)
- [ ] The safety guards (alias allowlist, relay sender verification, auto-submitted drop, header allowlist) are not weakened without a documented rationale

### Version & changelog

- [ ] Version bump not required (tests / CI / docs only) **OR**
- [ ] `package.json` `version` updated
- [ ] `docs/CHANGELOG.md` new section added at the top
- [ ] `README.md` version badge URL updated
- [ ] `CLAUDE.md` `**Version:**` header updated

### Documentation

- [ ] `CLAUDE.md` updated where relevant (Repository Structure / Email Flow / Robustness Guards / Configuration & Bindings)
- [ ] `README.md` updated if behaviour or setup changed
