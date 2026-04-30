# MCP Server Development — Rendobar Rules

> Pinned rules for building and maintaining `@rendobar/mcp`, the local stdio MCP server. Load this file BEFORE editing anything in `src/`, registering tools, or changing transport/auth wiring. These rules synthesize April 2026 research on the official spec, the TypeScript SDK, and production servers (Stripe, Supabase, Azure, GitHub, modelcontextprotocol/servers).

## Triggers — when to load

Load this rule before doing ANY of:
- Editing `src/**` (the local stdio server, `@rendobar/mcp`)
- Adding/removing MCP tools, resources, or prompts
- Touching `@modelcontextprotocol/sdk` imports
- Writing config snippets for Claude Desktop, Cursor, Cline, Windsurf, Zed, VS Code, Claude Code
- Changing the credential resolution chain (env, file, CLI flag)
- Building/releasing the MCP package (tsup, npm publish, DXT/MCPB pack)
- Submitting to MCP registries (official, Smithery, mcp.so)

---

## SECTION 1 — Hard bans

These cause silent or instant failures. They are non-negotiable.

### 1.1 Never write to stdout in stdio servers

`stdout` is reserved for JSON-RPC framing. Any stray byte kills the connection.

- `console.log`, `process.stdout.write`, `print` — banned in `src/**` source code AND in any dependency that ships with it. Audit the bundle.
- Subprocesses (FFmpeg, child_process.spawn, etc.) — pipe stdout to stderr or `/dev/null`.
- Patch the global console at boot so stray third-party `console.log` becomes `console.error`.
- All logs go to **`process.stderr`** (file descriptor 2). Use `pino.destination(2)` to be explicit.

### 1.2 Never silence Zod-version overload errors with `as any`

`@modelcontextprotocol/sdk` 1.23+ uses `zod/v4` internally. If two Zod copies end up in `node_modules`, `registerTool` overloads stop resolving. Symptoms: `TS2589: Type instantiation is excessively deep`.

- **Fix the dependency tree** — `pnpm why zod` should show one version. Add `pnpm.overrides.zod` if needed.
- Import from `zod/v4` in MCP code (matches what the SDK uses internally).
- Defining schemas as plain objects of Zod fields (not `z.object(...)`) and putting them in a separate file with explicit return types avoids deep inference.

### 1.3 Never bind a remote stdio server to `0.0.0.0`

The SDK auto-protects DNS rebinding only when host is `localhost`/`127.0.0.1`. Binding to `0.0.0.0` opens a hole.

### 1.4 Never use `mode: "form"` elicitation for credentials

Spec 2025-06-18 forbids it. Use `mode: "url"` to bounce the user to a browser flow if you must collect a secret at runtime. Better: collect at startup and fail fast if missing.

### 1.5 Never throw raw exceptions from tool handlers (except programmer bugs)

Two failure modes, never conflate:

1. **Protocol error** (JSON-RPC error code) — only for SDK-internal failures or true bugs. Throw `McpError(ErrorCode.InvalidParams, msg)` to raise one.
2. **Tool error** (`{ isError: true, content: [...] }`) — for upstream API failures, validation that escaped Zod, not-found, insufficient credits, rate limits. The LLM sees these as data and can recover.

Default: tools return `{ isError: true }` content. Throw only for programmer bugs that should crash visibly in stderr logs.

### 1.6 Never bypass the cached client

One `@rendobar/sdk` client per process, cached on `ctx`. No tool may construct its own client. No tool may read `process.env` directly — it goes through `parseConfig()` at startup.

### 1.7 Never block MCP cold-start on network IO

Clients (Claude Desktop, Cursor) time out launches. Constructor + `await server.connect(transport)` only. All network/auth-validation work happens lazily on first tool call OR fast (synchronous file read) at boot. Cold-start budget: **<2 seconds** including `npx -y` cache hit.

### 1.8 Never use `--no-verify` or amend-merge to bypass signing

Project-wide rule (`.claude/rules/git-conventional.md`). MCP releases publish to npm with provenance attestations — do not bypass.

---

## SECTION 2 — SDK essentials

Pin: `@modelcontextprotocol/sdk@^1.29.0` (1.x line; v2 is pre-alpha through Q3 2026).

### 2.1 Use `McpServer`, not the raw `Server`

`McpServer` (`@modelcontextprotocol/sdk/server/mcp.js`) auto-infers tool/resource/prompt capabilities, converts Zod → JSON Schema 2020-12, validates `outputSchema` via Ajv. Drop to `mcpServer.server` (the underlying low-level `Server`) only for: `sendLoggingMessage`, `sendResourceUpdated`, `createMessage` (sampling), `elicitInput`, custom `setRequestHandler`.

### 2.2 Tool registration template (copy this verbatim)

```ts
server.registerTool(
  "submit_job",
  {
    title: "Submit Media Processing Job",
    description: "...",  // LLM-facing
    inputSchema: {
      type: z.string().describe("Job type from registry"),
      inputs: z.record(z.string(), z.string()),
      params: z.record(z.string(), z.unknown()).optional(),
    },
    outputSchema: {
      jobId: z.string(),
      status: z.enum(["waiting", "complete", "failed"]),
      url: z.string().url().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,    // when idempotencyKey is provided
      openWorldHint: true,     // hits external API
    },
  },
  withErrorMapping(async (args, extra) => {
    const result = await ctx.sdk.jobs.create(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  }),
);
```

Key points:
- `inputSchema` is a Zod **shape** (object literal of Zod fields), NOT `z.object(...)`. Same for `outputSchema`. The SDK wraps it.
- When `outputSchema` is set, you MUST return `structuredContent` matching it. Ajv validates server-side.
- Set annotations honestly. Mis-tagging a destructive tool as `readOnlyHint: true` gets the server delisted from registries.
- Prefer `registerTool` over the legacy `.tool()` shorthand — the shorthand is removed in v2-alpha.

### 2.3 Tool result content types

```ts
type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }       // base64
  | { type: "audio"; data: string; mimeType: string }       // base64
  | { type: "resource"; resource: { uri; mimeType?; text? | blob? } }
  | { type: "resource_link"; uri: string; name?; mimeType?; description? };
```

Use `resource_link` for any large output (job result URL, log file, etc.) — avoids embedding bytes in the response.

### 2.4 Progress + cancellation

Long-running tools (>5s) MUST:
1. Check `extra.signal.aborted` in every loop iteration.
2. Emit progress notifications when `extra._meta?.progressToken` is set:
   ```ts
   await extra.sendNotification({
     method: "notifications/progress",
     params: { progressToken: extra._meta.progressToken, progress: i, total: n, message: "..." },
   });
   ```

For Rendobar's `wait_for_job` semantics, prefer **resource subscriptions** over polling-with-progress — the API has `OrgHub` WebSocket which the SDK exposes as `client.realtime.subscribeJob()`. Don't reimplement polling.

### 2.5 Capabilities to declare explicitly

`McpServer` infers tools/resources/prompts. You must declare manually:
- `logging: {}` — required to use `sendLoggingMessage`
- `resources: { subscribe: true }` — if any resource supports subscription
- `completions: {}` — if using `completable()` for argument autocomplete

### 2.6 Transports

**Stdio** (this repo):
```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const transport = new StdioServerTransport();
await server.connect(transport);
process.on("SIGINT", async () => { await transport.close(); process.exit(0); });
process.on("SIGTERM", async () => { await transport.close(); process.exit(0); });
```

---

## SECTION 3 — Architecture

This is the canonical layout for `src/` in this repo.

```
src/
├─ index.ts                  # public lib export: createRendobarMcpServer()
├─ bin.ts                    # #!/usr/bin/env node — stdio entry
├─ server.ts                 # createRendobarMcpServer(opts) -> { server, cleanup }
├─ config.ts                 # parseConfig(): args + env + ~/.config/rendobar/credentials.json
├─ context.ts                # RendobarContext { sdk, logger, options }
├─ logger.ts                 # pino → stderr (fd 2)
├─ errors.ts                 # withErrorMapping wrapper, ApiError → CallToolResult
├─ tools/
│  ├─ index.ts               # registerTools(server, ctx)
│  ├─ util.ts                # defineTool helpers, injectableTool() (Supabase pattern)
│  ├─ uploads.ts             # upload_file(path)  ← THE killer feature
│  ├─ jobs.ts                # submit_job, get_job, list_jobs, cancel_job, probe_media
│  ├─ account.ts             # get_account
│  └─ webhooks.ts            # (optional v2)
└─ types.ts

test/
├─ unit/                     # vitest, mock SDK with vi.fn()
└─ integration/              # in-memory Client+Server via InMemoryTransport
```

Mirror Supabase's one-file-per-resource layout. Mirror the reference `everything` server's `bin.ts` (transport-only) + `server.ts` (factory) split — makes in-memory testing trivial.

### 3.1 Tool factory pattern (steal `injectableTool` from Supabase)

```ts
// tools/util.ts
export type ToolDef<I, O> = {
  name: string;
  title: string;
  description: string;
  inputSchema: I;       // Zod shape
  outputSchema?: O;
  annotations: ToolAnnotations;
  execute: (args: ZodInferShape<I>, ctx: RendobarContext, extra: ToolExtra) => Promise<O extends undefined ? unknown : ZodInferShape<O>>;
};

export function defineTool<I, O>(def: ToolDef<I, O>): ToolDef<I, O> { return def; }
```

Each tool file:

```ts
// tools/uploads.ts
export function uploadTools(ctx: RendobarContext) {
  return [
    defineTool({
      name: "upload_file",
      title: "Upload Local File to Rendobar",
      description: "Read a local file and upload it. Returns a URL to use as input in submit_job.",
      inputSchema: {
        path: z.string().describe("Absolute or working-dir-relative path to the file"),
        filename: z.string().optional().describe("Filename hint, defaults to basename of path"),
      },
      outputSchema: { downloadUrl: z.string().url() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      execute: async ({ path, filename }) => {
        const resolved = resolveSafe(path);            // path validation per §6.2
        const stream = fs.createReadStream(resolved);
        const result = await ctx.sdk.uploads.upload(stream, { filename: filename ?? basename(resolved) });
        return { downloadUrl: result.downloadUrl };
      },
    }),
  ];
}
```

A central `tools/index.ts` registers all of them, applies `--read-only` filter, applies `--toolsets` filter:

```ts
export function registerTools(server: McpServer, ctx: RendobarContext) {
  const all = [...uploadTools(ctx), ...jobTools(ctx), ...accountTools(ctx)];
  for (const t of all) {
    if (ctx.options.readOnly && t.annotations.readOnlyHint === false) continue;
    if (ctx.options.toolsets && !ctx.options.toolsets.includes(t.toolset)) continue;
    server.registerTool(t.name, {
      title: t.title, description: t.description,
      inputSchema: t.inputSchema, outputSchema: t.outputSchema,
      annotations: t.annotations,
    }, withErrorMapping(ctx, (args, extra) => t.execute(args, ctx, extra)));
  }
}
```

### 3.2 Error mapping wrapper

```ts
// errors.ts
import { ApiError, isApiError } from "@rendobar/sdk";

export function withErrorMapping<T>(ctx: RendobarContext, fn: (args: unknown, extra: ToolExtra) => Promise<T>) {
  return async (args: unknown, extra: ToolExtra): Promise<CallToolResult> => {
    const start = Date.now();
    try {
      const data = await fn(args, extra);
      ctx.logger.info({ tool: extra.toolName, durationMs: Date.now() - start, ok: true });
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
      };
    } catch (e) {
      ctx.logger.error({ tool: extra.toolName, durationMs: Date.now() - start, err: e });
      if (isApiError(e)) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: { code: e.code, message: e.message, retryable: e.statusCode === 429 } }) }],
        };
      }
      throw e; // unknown errors → MCP protocol -32603, surface as bug
    }
  };
}
```

Map `ApiError.code` straight through. The LLM benefits from stable codes (`INSUFFICIENT_CREDITS`, `JOB_NOT_FOUND`, `RATE_LIMITED`).

### 3.3 Response shape — strip noise

LLM context is expensive. Don't return the raw SDK response object; reshape to what the LLM actually uses (Supabase's `database-operation-tools.ts` is the reference). Prune: internal IDs the LLM won't reference, timestamps as ms when ISO strings serve, fields the SDK includes for caller convenience.

Rule of thumb: a `get_job` complete response should be <1KB JSON in steady state.

---

## SECTION 4 — Auth & credentials

### 4.1 Resolution chain (priority order)

1. CLI: `--api-key=rb_...`
2. Env: `RENDOBAR_API_KEY`
3. File: `~/.config/rendobar/credentials.json` (written by `rb login` from the CLI). On Windows: `%APPDATA%\rendobar\credentials.json`.
4. **Fail at startup with explicit message naming all three sources.** Exit code 1. Log to stderr, not stdout.

### 4.2 Validation at boot

- Verify the key starts with `rb_` (Stripe-style prefix check).
- Optional: ping `GET /v1/me` once at startup to validate. Cache result; do not repeat per-tool.
- Do NOT prompt interactively — stdio servers have no TTY in client contexts.

### 4.3 Credential file format

```json
{
  "default": {
    "apiKey": "rb_...",
    "apiBase": "https://api.rendobar.com"
  },
  "staging": {
    "apiKey": "rb_...",
    "apiBase": "https://staging.api.rendobar.com"
  }
}
```

Pick environment via `RENDOBAR_PROFILE` env (default: `default`). The CLI's `rb login` and `rb login --profile=staging` write this file.

### 4.4 No keychain

`keytar` breaks `npx` cold-starts on Windows (native binary). Plain JSON file with `chmod 600` (`0o600` on Unix) is the standard for `npx`-distributed MCP servers.

### 4.5 Optional `RENDOBAR_API_BASE` override

Env var, useful for staging without rewriting the credentials file. Resolves AFTER the file's `apiBase`.

---

## SECTION 5 — Logging & observability

### 5.1 Logger setup

```ts
import pino from "pino";
export const logger = pino(
  { level: process.env.RENDOBAR_LOG_LEVEL ?? "info" },
  pino.destination(2),    // stderr, fd 2
);
```

JSON in production. `pino-pretty` pipe optional in dev. Default level `info`.

### 5.2 Per-tool log line

Every tool call logs exactly one line on completion:
```
{"level":"info","tool":"submit_job","durationMs":423,"ok":true,"jobId":"job_abc"}
```

On error:
```
{"level":"error","tool":"submit_job","durationMs":423,"ok":false,"errCode":"INSUFFICIENT_CREDITS"}
```

### 5.3 MCP `logging/setLevel`

Declare `logging: {}` capability. The SDK respects client-set log level — when the client sends `logging/setLevel`, internal log filtering kicks in for `mcpServer.server.sendLoggingMessage()` calls.

### 5.4 Stdio framing debug

Behind `--debug-stdio` flag, mirror GitHub's `IOLogger` pattern: log every byte read/written through the transport. <50 LOC. Lifesaver when MCP framing breaks.

### 5.5 Telemetry (deferred)

No external telemetry in v1. If we add it later, OpenTelemetry over OTLP/HTTP — but never to stdout.

---

## SECTION 6 — File handling (the seamless-upload feature)

### 6.1 The `upload_file` tool is the reason this package exists

It is what a remote HTTP MCP cannot do. Treat it as the centerpiece. Streaming, fast, no base64.

### 6.2 Path validation (defense in depth)

```ts
import path from "node:path";
import fs from "node:fs/promises";

export async function resolveSafe(input: string): Promise<string> {
  const resolved = path.resolve(process.cwd(), input);  // resolves .. and relative
  const real = await fs.realpath(resolved);             // resolves symlinks
  // Optional: enforce within a roots allowlist (MCP roots protocol, §6.4)
  return real;
}
```

Always resolve user-supplied paths. Reject if real path escapes any configured root. Windows backslashes handled by `path.normalize`.

### 6.3 Streaming upload

`fs.createReadStream(path)` → pass directly to `ctx.sdk.uploads.upload(stream, { filename })`. The SDK's `uploads.upload(file: BodyInit)` already accepts `ReadableStream`/`Blob`/`Buffer`. No buffering in memory.

### 6.4 MCP roots protocol (optional v2)

Spec 2025-06-18 has `roots/list` — clients expose filesystem boundaries. If the client supports `roots`, restrict `upload_file` to paths within declared roots. Implementation: subscribe to `notifications/roots/list_changed`, cache roots, validate path against cache in `resolveSafe`. Skip in v1 — informational only and adds complexity for limited security gain (the MCP host already gates which dirs it'll spawn the server in).

### 6.5 Size limits

Read `maxInputFileSize` from the `get_account` response on first call, cache it, reject larger files at the tool boundary. The API also enforces — but failing client-side saves the upload bandwidth.

---

## SECTION 7 — Build & distribution

### 7.1 `package.json` shape

```json
{
  "name": "@rendobar/mcp",
  "version": "1.0.0",
  "type": "module",
  "bin": { "rendobar-mcp": "./dist/bin.js" },
  "files": ["dist", "README.md"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "engines": { "node": ">=20.10" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "@rendobar/sdk": "^1.0.0",
    "pino": "^9.5.0",
    "zod": "^3.25.0"
  }
}
```

- `bin` entry required for `npx -y @rendobar/mcp`.
- First line of `dist/bin.js`: `#!/usr/bin/env node`. Add via tsup banner. `chmod +x` post-build.
- `type: "module"`, ESM only. Bundled by tsup → single file → `npx` cold-start ~1s.
- Engine: Node 20+ (matches SDK).

### 7.2 tsup config

```ts
import { defineConfig } from "tsup";
import pkg from "./package.json";
export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: ["esm"],
  target: "es2022",
  platform: "node",
  splitting: false,
  clean: true,
  dts: true,
  banner: { js: "#!/usr/bin/env node" },     // bin only — see tsup docs for per-entry
  define: { "process.env.PACKAGE_VERSION": JSON.stringify(pkg.version) },
});
```

`prebuild: tsc --noEmit` (Supabase pattern — catches errors esbuild silently passes).

Bundle target: <100KB. Strip sourcemaps in production.

### 7.3 Distribution channels

| Channel | What we publish | Auth |
|---|---|---|
| **npm** (`@rendobar/mcp`) | tsup bundle | npm provenance attestations |
| **MCPB / DXT** (`.mcpb` file) | bundled Node + manifest.json + `user_config` for API key | github release asset |
| **Official MCP Registry** | metadata only | `mcp-publisher publish` after `npm publish` |
| **Smithery** | metadata, link to npm | GitHub repo connection |

### 7.4 MCPB manifest skeleton

```json
{
  "manifest_version": "0.3",
  "name": "rendobar",
  "version": "1.0.0",
  "description": "Rendobar — serverless media processing for AI agents",
  "author": { "name": "Rendobar" },
  "server": {
    "type": "node",
    "entry_point": "server/dist/bin.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/dist/bin.js"],
      "env": { "RENDOBAR_API_KEY": "${user_config.api_key}" }
    }
  },
  "user_config": {
    "api_key": { "type": "string", "title": "Rendobar API Key", "sensitive": true, "required": true }
  },
  "compatibility": { "claude_desktop": ">=0.7.0" }
}
```

Build with `npx @anthropic-ai/mcpb pack`. Attach to GitHub release in CI.

### 7.5 Versioning

- release-please-managed (consistent with SDK + CLI release flow).
- Independent semver — bump major on tool removal/rename, minor on tool addition, patch on fixes.
- Document supported MCP spec version in README (whichever the pinned SDK negotiates).

---

## SECTION 8 — Testing

### 8.1 Unit tests (vitest)

- Mock `@rendobar/sdk` client with `vi.fn()`.
- Test each tool's `execute` function in isolation.
- Test `withErrorMapping` for ApiError → CallToolResult conversion.
- Test path resolution (`resolveSafe` with `..`, symlinks, absolute paths).

### 8.2 Integration tests (vitest, in-memory)

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createRendobarMcpServer } from "../src/server.js";

test("upload_file streams a real file", async () => {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const { server, cleanup } = createRendobarMcpServer({ apiKey: "rb_test", apiBase: mockServerUrl });
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientT);
  const result = await client.callTool({ name: "upload_file", arguments: { path: "./fixtures/video.mp4" } });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toMatchObject({ downloadUrl: expect.stringContaining("/uploads/dl/") });
  await cleanup();
});
```

No subprocesses, no real network, full SDK behavior including capability negotiation.

### 8.3 Manual smoke

```bash
npx @modelcontextprotocol/inspector node dist/bin.js
```

Document this in README. Run before every release.

### 8.4 CI

- typecheck (`tsc --noEmit`)
- lint
- unit + integration tests
- bundle size budget check (<100KB)
- attest provenance on publish

---

## SECTION 9 — Cross-platform gotchas

### 9.1 Windows + npx

- npx resolves to `npx.cmd`. Some older client configs need `"command": "npx.cmd"` — document the workaround in the troubleshooting page.
- Forward slashes in JSON config args work everywhere; backslashes need escaping. Recommend forward slashes in docs.

### 9.2 macOS + Cursor + nvm

Cursor launched from the Dock has the GUI PATH, not the shell PATH. If the user installed Node via nvm, `npx` may not be found. Detect at startup → write a clear stderr error pointing to the docs section: "Cursor cannot find npx. Set the absolute path to npx in your mcp.json command field, or use the rb-mcp installer."

### 9.3 Path handling

- All user-supplied paths through `path.resolve` then `fs.realpath`.
- Never `path.join` raw user input.
- Compare paths after `realpath` for symlink-aware checks.

### 9.4 Shell escaping

Docs show JSON values, not shell commands. MCP clients invoke via `spawn` (no shell), so `&`, quotes, `$` in env values are safe.

### 9.5 Node version

Lock to Node 20+. If launched on older Node, `process.versions.node` check at boot, exit with clear stderr message + docs link. Do this BEFORE importing the SDK (which may use Node 20-only APIs).

---

## SECTION 10 — Client config snippets (canonical)

Maintain these in `docs/configs/` as the source of truth. Generate the per-client docs page from them at build time.

### Claude Desktop / Cursor / Cline / Windsurf — `mcpServers` schema

```json
{
  "mcpServers": {
    "rendobar": {
      "command": "npx",
      "args": ["-y", "@rendobar/mcp"],
      "env": { "RENDOBAR_API_KEY": "rb_..." }
    }
  }
}
```

Locations:
- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (mac) / `%APPDATA%\Claude\claude_desktop_config.json` (Win)
- Cursor: `~/.cursor/mcp.json` or `<project>/.cursor/mcp.json`
- Cline: `cline_mcp_settings.json` via Cline's "Configure" button
- Windsurf: `~/.codeium/windsurf/mcp_config.json`

### Zed — `context_servers` (different key)

```json
{ "context_servers": { "rendobar": { "source": "custom", "command": "npx", "args": ["-y", "@rendobar/mcp"], "env": { "RENDOBAR_API_KEY": "rb_..." } } } }
```

### VS Code 1.101+ — `servers` (different key, supports `inputs`)

```json
{
  "servers": {
    "rendobar": {
      "command": "npx",
      "args": ["-y", "@rendobar/mcp"],
      "env": { "RENDOBAR_API_KEY": "${input:rendobarKey}" }
    }
  },
  "inputs": [{ "id": "rendobarKey", "type": "promptString", "password": true, "description": "Rendobar API Key" }]
}
```

### Claude Code — CLI command

```bash
claude mcp add rendobar -s user --env RENDOBAR_API_KEY=rb_... -- npx -y @rendobar/mcp
```

### Continue — YAML

```yaml
# .continue/mcpServers/rendobar.yaml
type: stdio
command: npx
args: ["-y", "@rendobar/mcp"]
env:
  RENDOBAR_API_KEY: rb_...
```

### ChatGPT Apps / Connectors

**Stdio not supported.** Use the remote HTTP server at `https://api.rendobar.com/mcp` OR `mcp-remote` bridge.

### Installer command (CLI repo)

`rb mcp install [--client=<name>]` lives in `github.com/rendobar/cli`. Detects OS, finds the right config file, merges (does not overwrite) the `mcpServers` block, prints diff, prompts for API key if missing. Supports: claude-desktop, cursor, cline, windsurf, zed, vscode, claude-code, all.

---

## SECTION 11 — House style

Every PR adding or changing a tool MUST:

1. Define `inputSchema` AND `outputSchema` as Zod shapes; tool def `as const satisfies ToolDef`.
2. Annotate `readOnlyHint` / `destructiveHint` / `idempotentHint` / `openWorldHint` honestly.
3. Reshape SDK responses to strip fields the LLM never reads (token cost is real cost).
4. Map every `ApiError.code` to a stable string the user-facing docs list. Never invent new codes inside MCP code — codes belong to `@rendobar/sdk`.
5. Add one happy-path and one error-path test (vitest, in-memory).
6. Update README's tool table.
7. No `any` in tool signatures.
8. No `try/catch` that swallows without logging to stderr.
9. No SDK calls that bypass the cached client on `ctx`.
10. No `process.env` reads inside a tool — config goes through `parseConfig()`.
11. If `execute` exceeds 80 lines, the logic belongs in `@rendobar/sdk`, not in the MCP server.
12. Conventional Commit scope: bare `feat:` / `fix:` (this repo has a single concern, so scope is optional). Examples: `feat: add upload_file`, `fix: handle 429 retryable in error mapping`.

---

## SECTION 12 — Anti-patterns observed in the wild (don't copy)

- **Stripe re-throws every error** instead of using `isError: true`. We don't. GitHub's `isError` pattern is right for our shape (data the LLM can recover from).
- **Filesystem reference server is monolithic** (~700 LOC, one file). Don't inherit. Use Supabase/`everything` modular layout.
- **Azure's `BindOptions(ParseResult)`/`RegisterOptions(Command)` ceremony** is a System.CommandLine artifact — don't port to TS, Zod handles it.
- **`as any` to silence Zod 4 overloads** — fix the dep tree.
- **Per-tool credential params** — footgun. One client, cached, on `ctx`.
- **Polling-with-progress for job completion** — Rendobar has WebSockets. Use them.

---

## SECTION 13 — Spec & SDK references (cite when in doubt)

- MCP spec (current stable): https://modelcontextprotocol.io/specification/2025-06-18
- TS SDK source: https://github.com/modelcontextprotocol/typescript-sdk (use `v1.x` branch)
- Reference servers: https://github.com/modelcontextprotocol/servers — `everything` is the canonical TS template
- MCPB / DXT format: https://github.com/anthropics/dxt
- Official registry: https://modelcontextprotocol.io/registry, publish via `mcp-publisher`
- Zod-version overload issue: https://github.com/modelcontextprotocol/typescript-sdk/issues/1180
- Inspector: `npx @modelcontextprotocol/inspector node dist/bin.js`

Production servers worth reading source of:
- Stripe: https://github.com/stripe/agent-toolkit/tree/main/typescript/src/modelcontextprotocol
- Supabase: https://github.com/supabase-community/supabase-mcp/tree/main/packages/mcp-server-supabase
- Azure: https://github.com/Azure/azure-mcp
- GitHub: https://github.com/github/github-mcp-server (Go, but the toolset/error/io-logger patterns transfer)

---

## SECTION 14 — When this rule changes

If you change MCP architecture (transport, auth chain, tool registration pattern, error mapping):

1. Update this file IN THE SAME PR as the code change.
2. Bump the README version table.
3. If the change affects user config (env var name, command name, file path), update:
   - All snippets in §10
   - The CLI's `rb mcp install` command in `github.com/rendobar/cli`
   - The MCPB manifest in `manifest.json`
   - The official registry `server.json`
4. If the change is breaking, semver-major the package.

This rule is the contract. Drift kills users.
