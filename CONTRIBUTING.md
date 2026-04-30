# Contributing to @rendobar/mcp

Thanks for your interest. This is a small, focused package — please keep PRs scoped.

## Local development

```bash
pnpm install
pnpm dev          # tsup watch
pnpm test:watch   # vitest watch
pnpm inspector    # MCP Inspector against your local build
```

Node 20+ required.

## Conventional commits

We use [Conventional Commits](https://www.conventionalcommits.org/). Examples:

- `feat: add cancel_job tool`
- `fix: handle empty inputs map in submit_job`
- `chore(deps): bump @rendobar/sdk to 1.2.0`
- `docs: clarify Cursor PATH troubleshooting`

The `release-please` bot reads commits to compute version bumps. Non-conventional commits are silently skipped.

## TDD

Every new tool or helper gets a test before the implementation. Run `pnpm test:watch` while iterating.

## House rules

`.claude/rules/` contains operational rules for the codebase. Read them before changing tool registration, error mapping, or transport setup.

## Reporting bugs

Use [GitHub Issues](https://github.com/rendobar/mcp/issues). Include: client name + version, OS, Node version, full server stderr.

## License

By contributing, you agree your contributions are licensed under MIT.
