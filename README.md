<p align="center">
  <a href="https://rendobar.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://cdn.rendobar.com/assets/brand/logo-mark.svg">
      <img alt="Rendobar" src="https://cdn.rendobar.com/assets/brand/logo-mark-black.svg" width="80">
    </picture>
  </a>
</p>

<h1 align="center">@rendobar/mcp</h1>

<p align="center">
  <strong>Serverless media processing for AI agents.</strong><br>
  The official Model Context Protocol server for Rendobar.
</p>

<p align="center">
  <a href="https://rendobar.com/docs/mcp-server">Docs</a> &nbsp;·&nbsp;
  <a href="https://www.npmjs.com/package/@rendobar/mcp">npm</a> &nbsp;·&nbsp;
  <a href="https://glama.ai/mcp/servers/kwdj3f0u3z">Glama</a> &nbsp;·&nbsp;
  <a href="https://discord.gg/kAGqjBzx8N">Discord</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@rendobar/mcp"><img src="https://img.shields.io/npm/v/@rendobar/mcp?style=flat-square&color=059669&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@rendobar/mcp"><img src="https://img.shields.io/npm/dm/@rendobar/mcp?style=flat-square&color=059669" alt="npm downloads"></a>
  <img src="https://img.shields.io/npm/l/@rendobar/mcp?style=flat-square&color=059669" alt="MIT license">
  <img src="https://img.shields.io/node/v/@rendobar/mcp?style=flat-square&color=059669" alt="Node version">
</p>

`@rendobar/mcp` is the official Model Context Protocol server for [Rendobar](https://rendobar.com), a serverless media processing API. The server runs locally over stdio, reads files straight from your disk, and gives an AI agent six job types: raw FFmpeg commands, timeline composition, compression to a target size, subtitle burn-in, animated captions, and media inspection. Jobs run on Rendobar's infrastructure and return a hosted URL.

Published to npm as `@rendobar/mcp` and to the [official MCP Registry](https://registry.modelcontextprotocol.io) as `com.rendobar/mcp`.

## Without it

> **You:** Compress `talk.mp4` to under 50 MB.

The agent tells you to install FFmpeg. You look up whether to use CRF or two-pass, guess a number, wait, check the size, guess again. Twenty minutes later you have a file and no idea if the quality was worth it.

## With it

> **You:** Compress `talk.mp4` to under 50 MB.

```jsonc
upload_file  { "path": "~/talks/talk.mp4" }
submit_job   { "type": "compress.target",
               "inputs": { "source": "https://cdn.rendobar.com/u/abc123/talk.mp4" },
               "params": { "target": { "maxSize": "50mb" } } }
get_job      { "jobId": "job_9f2a", "wait": true }
// → complete · $0.01 · https://cdn.rendobar.com/o/job_9f2a/out.mp4
```

No FFmpeg on your machine. No guessing at flags. The agent reports what it actually achieved.

## Install

Rendobar has two MCP servers. Pick by whether the agent needs your filesystem.

| | `@rendobar/mcp` (this package) | Hosted (`api.rendobar.com/mcp`) |
|---|---|---|
| Transport | stdio, spawned by your client | Streamable HTTP |
| Reads local files | Yes. That is the reason it exists | No. The server has no disk |
| Auth | API key | OAuth in the browser, or a Bearer key |
| Best for | Claude Desktop, Cursor, Cline, Zed | claude.ai, ChatGPT, hosted gateways |

**Hosted, no API key**, one command:

```bash
claude mcp add --transport http rendobar https://api.rendobar.com/mcp
```

**Local**, for filesystem access. Get a key at [app.rendobar.com](https://app.rendobar.com) → Settings → API Keys, then:

```bash
claude mcp add rendobar -s user --env RENDOBAR_API_KEY=rb_... -- npx -y @rendobar/mcp
```

Already ran `rb login` with the Rendobar CLI? Drop `--env`. The server finds the credentials file.

<details>
<summary><strong>Claude Desktop, Cursor, Cline, Windsurf</strong></summary>

Same block for all four. Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows). Cursor: `~/.cursor/mcp.json`. Windsurf: `~/.codeium/windsurf/mcp_config.json`. Cline: MCP panel → Configure.

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

Restart the client afterwards.
</details>

<details>
<summary><strong>Zed, VS Code, Continue</strong></summary>

Zed uses `context_servers` instead of `mcpServers`, in `~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "rendobar": {
      "source": "custom",
      "command": "npx",
      "args": ["-y", "@rendobar/mcp"],
      "env": { "RENDOBAR_API_KEY": "rb_..." }
    }
  }
}
```

VS Code 1.101+, in `.vscode/mcp.json`, prompts for the key instead of storing it:

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

Continue, in `.continue/mcpServers/rendobar.yaml`:

```yaml
type: stdio
command: npx
args: ["-y", "@rendobar/mcp"]
env:
  RENDOBAR_API_KEY: rb_...
```
</details>

Needs Node 20.10 or later. The server checks at startup and exits with a clear message on older versions.

## Tools

| Tool | Purpose |
|---|---|
| `upload_file` | Upload a local file. Returns a URL to use in `submit_job`. |
| `list_job_types` | Every active job type, read live. Call this first. |
| `submit_job` | Submit a job of any type. |
| `get_job` | Status and result. Pass `wait: true` to long-poll for ~50s. |
| `list_jobs` | Recent jobs. |
| `cancel_job` | Cancel a waiting or dispatched job. |
| `get_account` | Balance, plan limits, active job count. |

## Job types

| `type` | Accepts | What it does |
|---|---|---|
| `ffmpeg` | video | Any FFmpeg command: transcode, trim, mux, filter, concat. |
| `ffprobe` | video, image, audio | Read codec, resolution, duration, rotation before committing to parameters. |
| `compose` | video | Render from a JSON timeline: clips, transitions, text overlays, keyframes, multi-track audio. |
| `compress.target` | video, image, audio | Hit a size or quality budget and report what it achieved. |
| `caption.burn` | video | Burn an SRT, VTT, or ASS file into the video, or transcribe when none is given. |
| `captions.animate` | video | Word-level animated captions. Eleven presets including Hormozi, MrBeast, TikTok, karaoke. |

That table is a snapshot of this release. `list_job_types` reads the registry on every call, so it never goes stale. Prefer it.

### Chaining

A `submit_job` input can point at a previous job's output, so a multi-step edit never round-trips through your disk. For `ffmpeg` inputs, pass `{ job: "job_..." }`. For other types, read the output URL from `get_job` and pass that.

## Authentication

Three sources, first match wins:

1. `--api-key=<key>` flag
2. `RENDOBAR_API_KEY` environment variable
3. `~/.config/rendobar/credentials.json` on Unix, `%APPDATA%\rendobar\credentials.json` on Windows, written by `rb login` (Rendobar CLI 1.1+)

The server starts without a key so clients and directories can list its tools, and it reads the job registry unauthenticated, so the type list is live rather than baked into the build. Calls that reach the API return a clear error until a key is set.

## Telemetry

The server reports anonymous usage through PostHog's MCP Analytics SDK: tool name, success, duration, and the agent's stated intent.

It never sends your parameters or responses. File URLs, job configs, and outputs are stripped before anything leaves the process. Events carry no account identity and build no person profile. It is off in CI automatically.

```bash
DO_NOT_TRACK=1        # or RENDOBAR_TELEMETRY=0
```

## Troubleshooting

<details>
<summary><strong>Common problems</strong></summary>

**Cursor on macOS can't find `npx`.** Launched from the Dock, Cursor gets the GUI PATH rather than your shell PATH. Use an absolute path: `"command": "/Users/you/.nvm/versions/node/v20.x/bin/npx"`.

**Windows can't find `npx`.** Use `"command": "npx.cmd"` if your client doesn't resolve it.

**Tools appear but calls fail with "No Rendobar API key configured".** Expected with no key set. The server advertises tools so clients can list them, but calls need credentials. Set `RENDOBAR_API_KEY`, pass `--api-key`, or run `rb login`. Startup logs a `no_api_key` warning to stderr.

**The server won't start.** It writes JSON lines to stderr. Check your client's output panel for entries with `level: "error"`.
</details>

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). For AI-assisted development, [AGENTS.md](./AGENTS.md) and [CLAUDE.md](./CLAUDE.md).

## License

MIT
