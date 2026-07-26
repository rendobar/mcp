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
  <a href="https://rendobar.com">Website</a> &nbsp;·&nbsp;
  <a href="https://rendobar.com/docs/mcp-server">MCP docs</a> &nbsp;·&nbsp;
  <a href="https://www.npmjs.com/package/@rendobar/mcp">npm</a> &nbsp;·&nbsp;
  <a href="https://discord.gg/kAGqjBzx8N">Discord</a>
</p>
      <p align="center">
       <a href="https://glama.ai/mcp/servers/kwdj3f0u3z">
        <img src="https://glama.ai/mcp/servers/kwdj3f0u3z/badge" alt="Rendobar MCP server on Glama" width="380">
      </a>
      </p>
<p align="center">
  <a href="https://www.npmjs.com/package/@rendobar/mcp"><img src="https://img.shields.io/npm/v/@rendobar/mcp?style=flat-square&color=059669&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@rendobar/mcp"><img src="https://img.shields.io/npm/dm/@rendobar/mcp?style=flat-square&color=059669" alt="npm downloads"></a>
  <img src="https://img.shields.io/npm/l/@rendobar/mcp?style=flat-square&color=059669" alt="MIT license">
  <img src="https://img.shields.io/node/v/@rendobar/mcp?style=flat-square&color=059669" alt="Node version">
</p>


`@rendobar/mcp` is the official Model Context Protocol server for [Rendobar](https://rendobar.com). It lets AI agents in Claude Desktop, Cursor, Cline, Windsurf, Zed, VS Code, Claude Code, and Continue submit Rendobar jobs and upload local files in a single tool call.

The difference from the hosted MCP at `api.rendobar.com`: this server runs locally, so it can read and upload files straight from your machine. An agent can take a video on your disk, run an FFmpeg job on it, and hand back the result without you touching a browser.

Published to npm as `@rendobar/mcp` and to the [official MCP Registry](https://registry.modelcontextprotocol.io) as `com.rendobar/mcp`, which is where most MCP directories pick it up from.

## Install

### Fastest: Claude Code, no API key

Claude Code can connect to Rendobar's hosted MCP over OAuth. No key to copy, no config file to edit — your browser opens once to approve:

```bash
claude mcp add --transport http rendobar https://api.rendobar.com/mcp
```

The hosted server cannot read files on your disk. If you want an agent to upload local files (the reason this package exists), use the local stdio server below instead.

### Local stdio server (this package)

You don't install it. Configure your MCP client to spawn it via `npx`.

#### Get an API key

Sign up at [app.rendobar.com](https://app.rendobar.com) → Settings → API Keys.

#### Claude Code (terminal)

```bash
claude mcp add rendobar -s user --env RENDOBAR_API_KEY=rb_... -- npx -y @rendobar/mcp
```

Already ran `rb login` with the Rendobar CLI? Drop the `--env` part — the server reads the credentials file automatically.

#### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Restart Claude Desktop.

#### Cursor

Edit `~/.cursor/mcp.json` or `<project>/.cursor/mcp.json`. Same schema as Claude Desktop.

#### Cline (VS Code extension)

Open Cline's MCP panel → Configure → paste the same `mcpServers` block.

#### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`. Same schema.

#### Zed

Edit `~/.config/zed/settings.json`:

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

#### VS Code (1.101+)

Edit `.vscode/mcp.json`:

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

#### Continue

Create `.continue/mcpServers/rendobar.yaml`:

```yaml
type: stdio
command: npx
args: ["-y", "@rendobar/mcp"]
env:
  RENDOBAR_API_KEY: rb_...
```

## Tools

| Tool | Purpose |
|---|---|
| `upload_file` | Upload a local file. Returns a download URL to use in `submit_job`. |
| `list_job_types` | List every active job type with its summary and accepted media kinds. Call first when starting a media task. |
| `submit_job` | Submit any Rendobar job. Its description lists the active job types. |
| `get_job` | Fetch job status + result. Pass `wait: true` to long-poll until the job finishes (~50s cap, then returns a snapshot). |
| `list_jobs` | List recent jobs. |
| `cancel_job` | Cancel a waiting/dispatched job. |
| `get_account` | Check balance, plan limits, active job count. |

### Chaining jobs

A `submit_job` input can reference a previous job's output directly, instead of downloading and
re-uploading an intermediate result. For `ffmpeg` inputs, pass `{ job: "job_..." }` with a
completed job's ID. For every other job type, call `get_job` on the completed job, take its
output URL, and pass that URL as the input instead.

### Job types

`submit_job` takes a `type`. The active types, as of this release:

| `type` | Accepts | What it does |
|---|---|---|
| `ffmpeg` | video | Run any FFmpeg command (transcode, trim, mux, filter, concat). |
| `ffprobe` | video, image, audio | Inspect codec, resolution, duration, rotation before deciding parameters. |
| `compose` | video | Render a video from a JSON timeline: multiple clips, transitions, text overlays, keyframes, multi-track audio. |
| `compress.target` | video, image, audio | Compress to a target size or quality and report what it achieved. |
| `caption.burn` | video | Burn static styled subtitles from an SRT/VTT/ASS file, or auto-transcribe when none is given. |
| `captions.animate` | video | Burn animated word-level captions onto a video. Eleven presets, including Hormozi, MrBeast, TikTok, and karaoke. |

This table is a snapshot. `list_job_types` reads the registry live on every
call, so it is always current — prefer it over this list.

### Example

A typical exchange once the server is configured in your client:

> **You:** Mute the first 3 seconds of `~/clips/intro.mp4` and save it.

The agent runs, in order:

```jsonc
// 1. Stage the local file → returns a hosted download URL
upload_file { "path": "~/clips/intro.mp4" }
// → { "downloadUrl": "https://cdn.rendobar.com/u/abc123/intro.mp4", "sizeBytes": 4821004 }

// 2. Submit an FFmpeg job that references it
submit_job {
  "type": "ffmpeg",
  "inputs": { "intro.mp4": "https://cdn.rendobar.com/u/abc123/intro.mp4" },
  "params": { "command": "-i intro.mp4 -af \"volume=enable='lt(t,3)':volume=0\" -c:v copy out.mp4" }
}
// → { "jobId": "job_9f2a", "status": "waiting" }

// 3. Poll until done
get_job { "jobId": "job_9f2a" }
// → { "status": "complete", "cost": "$0.01", "output": { "file": { "url": "https://cdn.rendobar.com/o/job_9f2a/out.mp4", "type": "video" } } }
```

> **Agent:** Done — muted the first 3 seconds. Output: https://cdn.rendobar.com/o/job_9f2a/out.mp4

Auto-caption a clip with animated word-level captions — no subtitle file needed:

```jsonc
submit_job {
  "type": "captions.animate",
  "inputs": { "clip.mp4": "https://cdn.rendobar.com/u/abc123/clip.mp4" },
  "params": { "preset": "hormozi" }
}
// → { "jobId": "job_7c1b", "status": "waiting" }
```

The server starts without an API key, so clients and directories can list its
tools before anyone has signed up. It reads the job registry unauthenticated
too, so the type list above is live rather than a snapshot baked into the
build. Calls that need the API return a clear error until `RENDOBAR_API_KEY`
is set.

## Local vs hosted MCP

| | `@rendobar/mcp` (this package) | Hosted MCP (`api.rendobar.com`) |
|---|---|---|
| Transport | stdio, spawned by your client | Streamable HTTP |
| Local file upload | Yes, the whole point | No, server has no disk |
| Setup | `npx` line in a config file | OAuth in the browser (`claude mcp add --transport http`), or a Bearer API key |
| Best for | Claude Desktop, Cursor, Cline, Zed, local agents | claude.ai web, ChatGPT, hosted gateways |

## Authentication

Three sources, first match wins:

1. `--api-key=<key>` flag
2. `RENDOBAR_API_KEY` environment variable
3. `~/.config/rendobar/credentials.json` (Unix) / `%APPDATA%\rendobar\credentials.json` (Windows), written by Rendobar CLI's `rb login` (CLI v1.1+)

## Troubleshooting

### Cursor on macOS (Dock launch) can't find npx

Cursor launched from the Dock has the GUI PATH, not the shell PATH. Use the absolute path to `npx` in your `mcp.json`:

```json
"command": "/Users/you/.nvm/versions/node/v20.x/bin/npx"
```

### Windows: `npx` not found

Use `"command": "npx.cmd"` instead of `"command": "npx"` if your client doesn't auto-resolve.

### Server fails to start

Check logs in your client's output panel. The server writes JSON lines to stderr. Look for entries with `level: "error"`.

### Tools list but calls fail with "No Rendobar API key configured"

Expected when no key is set — the server starts and advertises its tools so clients can list them, but tool calls need an API key. Set `RENDOBAR_API_KEY` (or `--api-key`, or run `rb login`). On startup without a key the server logs a `no_api_key` warning to stderr.

## Telemetry

The server sends anonymous usage analytics (via PostHog's MCP Analytics SDK) so we can see how agents use it and make it better. Each tool call reports the tool name, whether it succeeded, how long it took, and the agent's stated intent.

It does not send your tool parameters or responses. Those (file URLs, job configs, outputs) are stripped before anything leaves the process. Events are anonymous: no account identity, no person profile.

It is off in CI automatically. To turn it off anywhere, set an environment variable:

```bash
DO_NOT_TRACK=1        # or RENDOBAR_TELEMETRY=0
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). For AI-assisted development, see [AGENTS.md](./AGENTS.md) and [CLAUDE.md](./CLAUDE.md).

## License

MIT
