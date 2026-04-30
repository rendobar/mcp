import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createContext } from "./context.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";
import { registerTools } from "./tools/index.js";
import type { Logger } from "./logger.js";
import type { ResolvedConfig } from "./config.js";

declare const __PACKAGE_VERSION__: string;
const VERSION = typeof __PACKAGE_VERSION__ === "string" ? __PACKAGE_VERSION__ : "0.0.0-dev";

export interface CreateServerOptions {
  config: ResolvedConfig;
  logger: Logger;
}

export interface CreatedServer {
  server: McpServer;
  cleanup: () => Promise<void>;
}

export async function createRendobarMcpServer(opts: CreateServerOptions): Promise<CreatedServer> {
  const ctx = createContext(opts.config, opts.logger);

  const server = new McpServer(
    { name: "rendobar", version: VERSION },
    {
      capabilities: { tools: {}, logging: {} },
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  await registerTools(server, ctx);

  return {
    server,
    cleanup: async () => {
      // SDK has no explicit close — letting GC reclaim fetch instances is fine.
    },
  };
}
