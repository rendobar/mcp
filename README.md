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

`@rendobar/mcp` is the official Model Context Protocol server for [Rendobar](https://rendobar.com), a serverless media processing API. The server runs locally over stdio and reads files straight from your disk, so an AI agent can take a file off your machine, process it on Rendobar's infrastructure, and hand back a hosted URL.

Rendobar covers both sides of media work.

**Transform what you have.** Run any FFmpeg command against video, audio or images the way you would write it locally. Inspect a file and get a normalized summary plus the full ffprobe report. Compose video from a declarative JSON timeline. Compress to a target size or quality, where the encoder searches candidate encodes and returns the smallest file that clears the bar. Burn in subtitles from SRT, VTT or ASS, or let it transcribe when none is given.

**Generate what you do not.** Create an image from a text prompt on hosted open-weight diffusion models. Edit up to four reference images from a written instruction, no masks and no coordinates. Upscale on a one-step diffusion restoration model that reconstructs detail rather than only sharpening. The same model-backed layer drives the transcription and keyword highlighting behind animated captions, so this is not an image-only capability.

The job list grows over time, so this README names families rather than types. `list_job_types` reads the current set live from the registry on every call.

Published to npm as `@rendobar/mcp` and to the [official MCP Registry](https://registry.modelcontextprotocol.io) as `com.rendobar/mcp`.

## Without it

> **You:** Mute the first 3 seconds of `intro.mp4`.

The agent tells you to install FFmpeg. Then you go looking for how to gate a
filter on a timestamp, land on `volume=enable='lt(t,3)'`, and lose another few
minutes to quote escaping in your shell. Nobody remembers that syntax, which is
the problem.

## With it

> **You:** Mute the first 3 seconds of `intro.mp4`.

```jsonc
upload_file  { "path": "~/clips/intro.mp4" }
// → { "downloadUrl": "https://cdn.rendobar.com/u/abc123/intro.mp4", "sizeBytes": 4821004 }

submit_job   { "type": "ffmpeg",
               "inputs": { "intro.mp4": "https://cdn.rendobar.com/u/abc123/intro.mp4" },
               "params": { "command": "-i intro.mp4 -af \"volume=enable='lt(t,3)':volume=0\" -c:v copy out.mp4" } }
// → { "jobId": "job_9f2a", "status": "waiting" }

get_job      { "jobId": "job_9f2a", "wait": true }
// → complete · $0.01 · https://cdn.rendobar.com/o/job_9f2a/out.mp4
```

The agent writes the filter. Rendobar runs it. Nothing gets installed on your
machine, and `-c:v copy` means the video stream is never re-encoded.

## Two more things to ask for

**Hit a size budget.**

> **You:** Get `demo.mov` under 25 MB so I can email it.

```jsonc
upload_file  { "path": "~/recordings/demo.mov" }
// → { "downloadUrl": "https://cdn.rendobar.com/u/7c1e/demo.mov", "sizeBytes": 251658240 }

submit_job   { "type": "compress.target",
               "inputs": { "source": "https://cdn.rendobar.com/u/7c1e/demo.mov" },
               "params": { "for": "web", "target": { "maxSize": "25MB" } } }
// → { "jobId": "job_4b8d", "status": "waiting" }

get_job      { "jobId": "job_4b8d", "wait": true }
// → complete · https://cdn.rendobar.com/o/job_4b8d/out.mp4 · 23.8 MB
```

You give it the ceiling, not a bitrate. The encoder searches candidate encodes
and returns the smallest file that still clears the quality bar, so you are not
guessing at CRF values to land under a mail server's limit.

**Generate an image.**

> **You:** Make a 1920x1080 title card for a video about deep sea diving.

```jsonc
submit_job   { "type": "image.generate",
               "inputs": {},
               "params": { "model": "standard",
                           "prompt": "Title card for a deep sea diving documentary. Shafts of light through deep blue water, small diver silhouette, empty space across the upper third for a title.",
                           "width": 1920, "height": 1080 } }
// → { "jobId": "job_2fa7", "status": "waiting" }

get_job      { "jobId": "job_2fa7", "wait": true }
// → complete · https://cdn.rendobar.com/o/job_2fa7/out.png
```

`inputs` is empty because nothing is being transformed. Ask for a tier
(`economy`, `standard`, `premium`) and the platform picks the model, or pin an
exact model id to reach its own controls. Requested dimensions are snapped to
what the chosen model can actually render.

## The rest of the surface

Four more tools, and the prompts that reach them.

> **You:** What can Rendobar actually do?

```jsonc
list_job_types {}
// → { "jobTypes": [ { "type": "compose", "tag": "Compose",
//                     "summary": "Render a video from a declarative JSON timeline",
//                     "acceptsMedia": ["video", "image", "audio"] }, ... ],
//     "guidance": "..." }
```

Read live from the job registry on every call, which is why nothing in this
README enumerates job types. A new one appears here without a release.

> **You:** How much credit is left?

```jsonc
get_account {}
// → { "balance": "$4.86", "balanceUsd": 4.86, "plan": "free", "isPro": false,
//     "limits": { "concurrentJobs": 1, "maxFileSize": "500 MB", "jobTimeoutMin": 5 } }
```

Worth a call before submitting something expensive.

> **You:** What did I run this morning?

```jsonc
list_jobs { "status": "complete", "limit": 5 }
// → { "jobs": [ { "id": "job_9f2a", "type": "ffmpeg", "status": "complete",
//                 "createdAt": "2026-08-04T09:12:00Z", "cost": "$0.01",
//                 "output": { "url": "https://cdn.rendobar.com/o/job_9f2a/out.mp4" } } ] }
```

The compact row is enough to find a result you lost. Call `get_job` when you
need the full output.

> **You:** Stop that one, I picked the wrong file.

```jsonc
cancel_job { "jobId": "job_9f2a" }
// → { "id": "job_9f2a", "status": "cancelled" }
```

Works on `waiting`, `dispatched` and `running` jobs. A running job's upstream
execution is stopped too, so you are not billed for work you cancelled.

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

Same block for all four. Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows). Cursor: `~/.cursor/mcp.json` on every OS. Windsurf: `~/.codeium/windsurf/mcp_config.json` on every OS. Cline: MCP panel → Configure.

On Linux, use Cursor, Windsurf, Cline, Zed, VS Code or Continue. Claude Desktop has no Linux build, so it is the one client on this list you cannot use there. The server itself runs fine on Linux.

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

Runs on **macOS, Linux and Windows**. Every release is tested on all three in CI. There are no native dependencies, so architecture does not matter: x64 and arm64 both work. Needs Node 20.10 or later, and the server checks at startup and exits with a clear message on older versions.

## Tools

| Tool | Purpose |
|---|---|
| `upload_file` | Upload a local file. Returns a URL to use in `submit_job`. |
| `list_job_types` | Every active job type, read live. Call this first. |
| `submit_job` | Submit a job of any type. |
| `get_job` | Status and result. Pass `wait: true` to long-poll for ~50s. |
| `list_jobs` | Recent jobs. |
| `cancel_job` | Cancel a waiting, dispatched or running job. |
| `get_account` | Balance, plan limits, active job count. |

## Job types

**`ffmpeg`** is the one to reach for first. It takes a command the way you would
write it locally, runs it on hosted infrastructure, and hands back a URL:
transcode, trim, mux, filter, concat, whatever the flags allow. Pass
`params.compute` as `gpu` to force NVENC encoding (Pro plan), or leave it on
`auto` and Rendobar routes CUDA commands to a GPU and everything else to CPU.

Beyond that there are purpose-built types for
[timeline composition](https://rendobar.com/docs/jobs/compose),
[compression to a size budget](https://rendobar.com/docs/jobs/compress),
[subtitle burn-in](https://rendobar.com/docs/jobs/captions/burn),
[animated captions](https://rendobar.com/docs/jobs/captions/animate),
[media inspection](https://rendobar.com/docs/jobs/ffprobe),
[image generation](https://rendobar.com/docs/jobs/image-generate),
[image editing](https://rendobar.com/docs/jobs/image-edit), and
[image upscaling](https://rendobar.com/docs/jobs/image-upscale).

Full reference: **[rendobar.com/docs/jobs](https://rendobar.com/docs/jobs)**. Or
call `list_job_types`, which reads the registry live and is always current. This
README deliberately does not enumerate them, so it cannot go stale.

### Chaining

A `submit_job` input can point at a previous job's output, so a multi-step edit never round-trips through your disk. For `ffmpeg` inputs, pass `{ job: "job_..." }`. For other types, read the output URL from `get_job` and pass that.

## Authentication

Three sources, first match wins:

1. `--api-key=<key>` flag
2. `RENDOBAR_API_KEY` environment variable
3. `~/.config/rendobar/credentials.json` on Unix, `%APPDATA%\rendobar\credentials.json` on Windows, written by `rb login` (Rendobar CLI 1.1+)

Installed as a `.mcpb` extension, the key goes in the extension's own settings field and none of the three above apply.

The server starts without a key so clients and directories can list its tools, and it makes no network call at startup. Nothing it advertises depends on the registry, so the job type list can never be baked into a build. `list_job_types` reads it live instead, and because `GET /jobs/types` is public it answers without a key at all. Every other tool returns a clear error until a key is set.

If you do not need Rendobar to read files off your machine, the hosted server at `https://api.rendobar.com/mcp` signs you in through the browser and there is no key to manage. The local server exists for disk access, and the key is the price of it.

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

## Privacy Policy

Full policy: **[rendobar.com/privacy](https://rendobar.com/privacy/)**. What this server does specifically:

**Collected.** Your API key, read from the flag, the environment, or the credentials file. Job inputs you pass to a tool, and files you point `upload_file` at, are sent to the Rendobar API to run the job you asked for. Anonymous telemetry covers the tool name, whether it succeeded, how long it took, and the agent's stated intent.

**Not collected.** Tool parameters and responses. File URLs, job configs, and outputs are stripped before any telemetry leaves the process. Telemetry carries no account identity and builds no person profile. Nothing is read from your disk except the file paths you explicitly pass to `upload_file`.

**Storage.** Uploaded inputs and job outputs live in Rendobar's storage and are removed on the retention schedule for your plan. Telemetry goes to PostHog. The server keeps nothing on your machine beyond the credentials file the CLI writes.

**Third parties.** Rendobar (job execution and storage) and PostHog (anonymous telemetry). Opt out of telemetry entirely with `DO_NOT_TRACK=1` or `RENDOBAR_TELEMETRY=0`.

**Contact.** [support@rendobar.com](mailto:support@rendobar.com), or open an issue on this repo.

## Security

Reporting a vulnerability: see [SECURITY.md](./SECURITY.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). For AI-assisted development, [AGENTS.md](./AGENTS.md) and [CLAUDE.md](./CLAUDE.md).

## License

MIT
