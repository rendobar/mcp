# AGENTS.md — @rendobar/mcp

Guide for agents and humans working on the Rendobar MCP server. Companion to the monorepo guide at [rendobar/rendobar](https://github.com/rendobar/rendobar). Dev rules, build/test commands, and the MCP-specific hard bans live in [CLAUDE.md](./CLAUDE.md) — read it before changing code.

## TL;DR

- **What this is**: the local stdio Model Context Protocol server for Rendobar. Single ESM bundle, ~6 tools, public, MIT.
- **SDK source**: lives in the [rendobar/rendobar](https://github.com/rendobar/rendobar) monorepo under `packages/sdk/`. Consumed here as `@rendobar/sdk` from npm.
- **Release**: conventional commits → release-please → npm publish with provenance + `.mcpb` GitHub Release asset + official MCP registry.
- **No manual tags, no manual version bumps.** release-please owns them.

## The rules that bite (full detail in CLAUDE.md)

- **Never write to stdout.** It is reserved for JSON-RPC framing; one stray byte kills the connection. Logs go to stderr.
- **Recoverable tool failures return `{ isError: true }`, not throws.** Throw only for programmer bugs.
- **Cold-start budget < 2 s, bundle < 100 KB.** CI asserts both. No network calls at module load.
- **One Zod version.** The SDK uses `zod/v4`; two copies break `registerTool`. Fix the dep tree, never `as any`.

## Cross-repo brand consistency

This repo is part of the broader Rendobar platform. The canonical reference for brand strings, URLs, and metadata across every rendobar repo is the apex monorepo's `.claude/rules/brand-consistency.md`:

https://github.com/rendobar/rendobar/blob/main/.claude/rules/brand-consistency.md

### Canonical brand strings (must match apex)

| Field | Value |
|---|---|
| Display name | `Rendobar` |
| Slogan | `Media processing API for developers and agents` |
| Apex URL | `https://rendobar.com` |
| Apex page URLs | `https://rendobar.com/<path>/` (always trailing slash) |
| API URL | `https://api.rendobar.com` |
| Dashboard URL | `https://app.rendobar.com` |
| CDN URL | `https://cdn.rendobar.com` |
| Twitter handle | `@rendobar` |
| Discord | `https://discord.gg/kAGqjBzx8N` |

**Forbidden variants**: `Rendobar.com`, `rendobar` (lowercase except in URLs / package names), `https://www.rendobar.com`, `http://rendobar.com`, apex page links without a trailing slash.

**Entity model**: Rendobar is a media-processing **platform**. The FFmpeg API is one product on it. Write "Rendobar's FFmpeg API", never "Rendobar is an FFmpeg API".

### Writing style (README, package.json description, docs prose)

No em-dash (`—`) and no semicolons in reader-facing prose. They read as AI-generated. Use a period or a comma. Sentence case, declarative, specific numbers over vague claims. Code blocks are exempt.

### No AI attribution in commits / PRs

Never add `Co-Authored-By: Claude`, `🤖 Generated with [Claude Code]`, or any AI attribution in commit messages or PR descriptions. Strip them silently if a template injects them.

## For agents

1. Confirm the build and tests are green before touching anything (commands in [CLAUDE.md](./CLAUDE.md)).
2. Branch off `main`: `git checkout -b feat/short-name`.
3. Make the change plus a test.
4. Commit with a conventional message. Never use `git commit --no-verify` — fix the hook failure instead.
5. `git push -u origin <branch>` and open a PR. Wait for CI green, merge.
6. Walk away. release-please handles the version, tag, npm publish, and registry.

**Do not**: push to `main` directly, push tags manually, edit `CHANGELOG.md` or the `version` field, or add AI attribution to commits.
