import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerToolDef } from "./util.js";
import { accountTools } from "./account.js";
import { jobToolsAsync } from "./jobs.js";
import type { RendobarContext } from "../context.js";

export async function registerTools(server: McpServer, ctx: RendobarContext): Promise<void> {
  for (const tool of accountTools()) {
    registerToolDef(server, ctx, tool);
  }
  for (const tool of await jobToolsAsync(ctx.sdk)) {
    registerToolDef(server, ctx, tool);
  }
  // upload_file added in Tasks 22-25.
}
