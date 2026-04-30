import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerToolDef } from "./util.js";
import { accountTools } from "./account.js";
import { jobTools } from "./jobs.js";
import type { RendobarContext } from "../context.js";

export async function registerTools(server: McpServer, ctx: RendobarContext): Promise<void> {
  for (const tool of accountTools()) {
    registerToolDef(server, ctx, tool);
  }
  for (const tool of jobTools()) {
    registerToolDef(server, ctx, tool);
  }
}
