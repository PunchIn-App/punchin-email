# Releasing the PunchIn Email Worker

This is the versioning and release reference for the worker, extracted from
[`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md) (which links here).
Follow it before bumping the version or cutting a release.

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
| `docs/CHANGELOG.md` | New section at the top (see the CHANGELOG Format section of [`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md#changelog-format)) |
| `SECURITY.md` | Update the **Supported Versions** table — set the new `X.Y.x` row to **Yes**, mark prior versions **No** |

Commit message convention: `chore: bump to vX.Y.Z`

## Cutting a release

Once the version-bump PR is merged to `main`, publish the release so the
GitHub sidebar and the version badge line up with the code:

1. Make sure `main` is up to date and green: `git checkout main && git pull`,
   then `npm test` and `npm run check`.
2. Tag the release commit: `git tag -a vX.Y.Z -m "vX.Y.Z"` (annotated tags only).
3. Push the tag: `git push origin vX.Y.Z`.
4. **Create a GitHub release** from the tag, using the matching
   `docs/CHANGELOG.md` section as the notes:

   ```bash
   gh release create vX.Y.Z \
     --title "vX.Y.Z" \
     --notes-file <(sed -n '/## \[X.Y.Z\]/,/^## \[/p' docs/CHANGELOG.md | sed '$d')
   ```

   (Or `gh release create vX.Y.Z --generate-notes` to let GitHub draft the
   notes from merged PRs, then edit to match the changelog.)
5. Deploy: `npm run deploy`.

The tag name (`vX.Y.Z`) must match the `package.json` version exactly. Don't
create a release for a version that isn't yet on `main`.
