import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { homedir, platform } from "node:os";
import path from "node:path";
import { createLogger } from "./logger.js";
import { parseConfig, ConfigError, type ResolvedConfig } from "./config.js";
import { createRendobarMcpServer } from "./server.js";

declare const __PACKAGE_VERSION__: string;
const VERSION = typeof __PACKAGE_VERSION__ === "string" ? __PACKAGE_VERSION__ : "0.0.0-dev";

const HELP_TEXT = `@rendobar/mcp v${VERSION}
Local stdio Model Context Protocol server for Rendobar.

Usage:
  rendobar-mcp [options]

Options:
  --api-key=<key>     API key (overrides env and credentials file)
  --api-base=<url>    API base URL (default: https://api.rendobar.com)
  --help              Show this help and exit
  --version           Print version and exit

Auth resolution (first match wins):
  1. --api-key=<key>
  2. RENDOBAR_API_KEY environment variable
  3. credentials file (~/.config/rendobar/credentials.json on Unix,
                      %APPDATA%\\rendobar\\credentials.json on Windows)

Get an API key: https://app.rendobar.com/settings/api-keys
Docs: https://rendobar.com/docs/mcp/
Issues: https://github.com/rendobar/mcp/issues
`;

function getCredsPath(): string {
  if (platform() === "win32") {
    const appData = process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming");
    return path.join(appData, "rendobar", "credentials.json");
  }
  return path.join(homedir(), ".config", "rendobar", "credentials.json");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // --help / --version short-circuit BEFORE any MCP transport init.
  // These are the ONLY commands that write to stdout.
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }
  if (argv.includes("--version") || argv.includes("-V")) {
    process.stdout.write(VERSION + "\n");
    process.exit(0);
  }

  // Node version check BEFORE importing the SDK fully.
  const majorStr = process.versions.node.split(".")[0];
  const major = majorStr !== undefined ? parseInt(majorStr, 10) : 0;
  if (major < 20) {
    process.stderr.write(`@rendobar/mcp requires Node.js 20 or later. Found: ${process.versions.node}\n`);
    process.exit(1);
  }

  // Parse config FIRST (before logger init — logger needs logLevel from config).
  let config: ResolvedConfig;
  try {
    config = await parseConfig({
      argv,
      env: process.env,
      credsPath: getCredsPath(),
    });
  } catch (e) {
    if (e instanceof ConfigError) {
      process.stderr.write(e.message + "\n");
      process.exit(1);
    }
    throw e;
  }

  // Logger from config.
  const logger = createLogger({
    level: config.logLevel,
    name: "rendobar-mcp",
    patchConsole: true,
  });

  // Build server.
  const { server, cleanup } = await createRendobarMcpServer({ config, logger });

  // Wire signals.
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ msg: "shutdown", signal });
    try { await cleanup(); } catch { /* swallow */ }
    process.exit(0);
  };
  process.on("SIGINT", () => { void shutdown("SIGINT"); });
  process.on("SIGTERM", () => { void shutdown("SIGTERM"); });

  // Connect transport.
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info({ msg: "ready", version: VERSION });
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
