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
  <a href="https://rendobar.com/docs/mcp/">MCP docs</a> &nbsp;·&nbsp;
  <a href="https://www.npmjs.com/package/@rendobar/mcp">npm</a> &nbsp;·&nbsp;
  <a href="https://discord.gg/kAGqjBzx8N">Discord</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@rendobar/mcp"><img src="https://img.shields.io/npm/v/@rendobar/mcp?style=flat-square&color=059669&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@rendobar/mcp"><img src="https://img.shields.io/npm/dm/@rendobar/mcp?style=flat-square&color=059669" alt="npm downloads"></a>
  <img src="https://img.shields.io/npm/l/@rendobar/mcp?style=flat-square&color=059669" alt="MIT license">
  <img src="https://img.shields.io/node/v/@rendobar/mcp?style=flat-square&color=059669" alt="Node version">
</p>

---

`@rendobar/mcp` is the official Model Context Protocol server for [Rendobar](https://rendobar.com). It lets AI agents in Claude Desktop, Cursor, Cline, Windsurf, Zed, VS Code, Claude Code, and Continue submit Rendobar jobs and upload local files in a single tool call.

The difference from the hosted MCP at `api.rendobar.com`: this server runs locally, so it can read and upload files straight from your machine. An agent can take a video on your disk, run an FFmpeg job on it, and hand back the result without you touching a browser.

## Install

You don't install it. Configure your MCP client to spawn it via `npx`.

### Get an API key

Sign up at [app.rendobar.com](https://app.rendobar.com) → Settings → API Keys.

### Configure your client

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

#### Claude Code (terminal)

```bash
claude mcp add rendobar -s user --env RENDOBAR_API_KEY=rb_... -- npx -y @rendobar/mcp
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
| `submit_job` | Submit any Rendobar job. Description lists active job types. |
| `get_job` | Poll job status, fetch result. |
| `list_jobs` | List recent jobs. |
| `cancel_job` | Cancel a waiting/dispatched job. |
| `get_account` | Check balance, plan limits, active job count. |

## Local vs hosted MCP

| | `@rendobar/mcp` (this package) | Hosted MCP (`api.rendobar.com`) |
|---|---|---|
| Transport | stdio, spawned by your client | Streamable HTTP |
| Local file upload | Yes, the whole point | No, server has no disk |
| Setup | `npx` line in a config file | Bearer API key over HTTP |
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

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). For AI-assisted development, see [AGENTS.md](./AGENTS.md) and [CLAUDE.md](./CLAUDE.md).

## License

MIT
