# @rendobar/mcp

> Local stdio MCP server. Single ESM bundle. ~6 tools. Public, MIT.

## CRITICAL RULES

### 1. NEVER write to stdout

stdout is reserved for JSON-RPC framing. Any byte kills the connection.

- `console.log`, `process.stdout.write`, `print` — banned.
- Pipe subprocess stdout to stderr or `/dev/null`.
- The boot-time global `console.*` patch redirects to stderr (see `src/logger.ts`). Don't disable it.

`--help` and `--version` are the ONLY commands that write to stdout. Both exit before the MCP transport is wired.

### 2. NEVER silence Zod-version overload errors with `as any`

`@modelcontextprotocol/sdk` 1.x uses `zod/v4` internally. Two Zod copies break `registerTool` overloads.
Fix: `pnpm why zod` shows one version. `pnpm.overrides.zod` pinned. Don't reach for `as any`.

### 3. Use `registerTool`, not `.tool()` shorthand

The legacy shorthand is removed in v2-alpha of the SDK. `registerTool` is the only one in v2.

### 4. Tool errors via `isError: true`, not throws

Recoverable failures (bad credits, rate limit, not found) → `{ isError: true, content: [...] }`.
Programmer bugs → throw, surface in stderr as `-32603 InternalError`.

The `withErrorMapping` wrapper in `src/errors.ts` handles this. Use it for every tool.

### 5. Cold-start budget < 2 s

CI asserts `time node dist/bin.js --version < 2000ms`. No network calls at module load.
Lazy SDK init in tools, not at boot.

### 6. Bundle budget < 100 KB

CI asserts `dist/bin.js < 100KB`. If pino blows the budget, swap to the 30-line custom logger.

## Build & test

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm inspector   # interactive MCP testing
```

## Layout

```
src/
├── bin.ts          # entry: parse args, init logger + sdk, connect StdioServerTransport
├── server.ts       # createRendobarMcpServer factory
├── config.ts       # parseConfig: --flag → env → creds.json → fail
├── context.ts      # RendobarContext type
├── logger.ts       # JSON to stderr
├── errors.ts       # withErrorMapping using ApiError from @rendobar/sdk
├── paths.ts        # resolveSafe (realpath + roots check)
├── instructions.ts # SERVER_INSTRUCTIONS string
├── version.ts      # built-time injected
└── tools/
    ├── index.ts    # registerTools(server, ctx)
    ├── util.ts     # defineTool helper
    ├── uploads.ts  # upload_file
    ├── jobs.ts     # submit_job, get_job, list_jobs, cancel_job
    └── account.ts  # get_account
```

## Auth chain

`--api-key` flag → `RENDOBAR_API_KEY` env → `~/.config/rendobar/credentials.json` (CLI-written) → fail.

## Conventions

- Conventional commits — release-please reads them.
- TDD — test before implementation for new tools.
- One tool file per resource. Tools are pure objects via `defineTool()`.
- Reshape SDK responses to drop fields the LLM doesn't read. Token cost is real cost.
- Honest annotations — destructive tools must declare `destructiveHint: true`.
- Trust Zod-validated inputs. Don't double-validate inside handlers.
- Errors flow through `withErrorMapping`. Never `try/catch` and swallow.

## Don't

- Don't reach for `pino` if it blows the bundle budget. Use the 30-line custom logger.
- Don't add `--debug-stdio`, `--toolsets`, `--read-only` flags. Those are deferred until customers ask.
- Don't add OAuth flow. The CLI handles auth (`rb login` writes the creds file).
- Don't bundle MCPB (`.mcpb`) in v1. Deferred to v1.1.
- Don't open PRs without running `pnpm typecheck && pnpm test && pnpm build` clean locally.
