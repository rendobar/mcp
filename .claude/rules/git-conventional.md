---
description: Conventional commits format, bump mapping, and enforcement stack for release-please
globs:
  - ".git/hooks/commit-msg"
  - "lefthook.yml"
  - "commitlint.config.mjs"
  - ".github/workflows/pr-title.yml"
  - ".github/workflows/release-please.yml"
---

# Conventional Commits — Mandatory

Every commit on main MUST follow conventional commits. The release-please workflow parses
commit messages to compute version bumps. Non-conventional commits are silently skipped —
the feature ships but gets no release, no CHANGELOG entry, no version bump.

## Format

`type(scope): subject`

- **type**: `feat | fix | docs | style | refactor | perf | test | build | ci | chore | revert`
- **scope**: optional in this repo. Single-package repo, so bare `feat:` / `fix:` is fine. Use a scope only when the change is clearly localized to one area (e.g. `feat(tools):`, `fix(transport):`, `chore(deps):`).
- **subject**: imperative mood, ≤72 chars, no trailing period
- **`!` after type** or `BREAKING CHANGE:` footer → major version bump
- `Release-As: X.Y.Z` footer → override computed version

## Bump mapping (release-please)

| Commit | Bump |
|---|---|
| `fix(sdk): ...` | patch |
| `feat(sdk): ...` | minor |
| `feat(sdk)!: ...` or `BREAKING CHANGE:` footer | major |
| `chore(sdk): ...`, `docs(sdk): ...`, `test(sdk): ...` | no bump, no CHANGELOG |
| Non-conventional (`wip`, `update`) | silently skipped |

## Examples

Good:
- `feat: add upload_file tool`
- `fix: handle expired tokens on tool call`
- `feat!: rename createRendobarMcpServer factory`
- `chore: bump dependencies`
- `docs: document install instructions`
- `feat(tools): add cancel_job`
- `fix(transport): close stdio on SIGTERM`

Bad (will be rejected or silently skipped):
- `update stuff`
- `fixed bug`
- `Feat: add thing` (wrong case)
- `feat: Added thing.` (wrong mood, trailing period)

## Rules for Claude

1. **NEVER use `git commit --no-verify`** unless the user explicitly asks. The commit-msg
   hook (lefthook) blocks malformed messages.
2. **NEVER push non-conventional commits** to main. Branch protection requires PR; PR title
   check (`pr-title.yml`) blocks bad titles; squash merge turns PR title into the commit msg.
3. **NEVER invent version numbers.** release-please computes them from commit types. To force
   a specific version, use `Release-As: X.Y.Z` footer in a chore commit.
4. **Match existing style.** Run `git log --oneline -20` to see recent commits before writing
   a new one.
5. **Scope is optional in this repo** but recommended when the change is localized. Use
   short, lowercase names (`tools`, `transport`, `config`, `errors`, `deps`).
6. **When unsure about bump type**, prefer conservative: `fix` < `feat` < `feat!`. Never bump
   major without explicit user intent.
7. **If you change unrelated areas in one commit**, prefer splitting into multiple commits
   over picking one scope arbitrarily.

## Enforcement layers (all active)

1. **lefthook commit-msg hook** — local, blocks bad msg at `git commit` time
2. **This rule file** — tells Claude the format
3. **`.github/workflows/pr-title.yml`** — CI required status check on PR titles
