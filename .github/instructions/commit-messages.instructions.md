---
applyTo: "**"
---

# Commit Messages

Commit messages describe **what changed and why** — nothing else.

## Rules

- **Do not mention version numbers** (e.g. `v1.1.1`, `1.2.0`, `Release …`) in commit titles or bodies. Versions belong in **git tags** and in `CHANGELOG.md` / `package.json` only.
- **Title:** a single, concise, imperative sentence summarizing the change (e.g. `Simplify air-direction scoring and switch to fixed buckets`). No prefixes like `Release`, `Bump`, or `vX.Y.Z`.
- **Body (optional):** bullet list of notable changes, each describing user-visible or technical impact. Still no version strings.
- **Tags carry the version.** When releasing, bump `package.json` and update `CHANGELOG.md` in the same commit, then create an annotated tag `vX.Y.Z` pointing at that commit.

## Why

Versioning lives in tags so the commit log stays a clean narrative of *changes*, independent of release cadence. A commit may be re-tagged, cherry-picked, or never released — its message should still make sense.
