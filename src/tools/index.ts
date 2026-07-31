import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerToolDef } from "./util.js";
import { accountTools } from "./account.js";
import { jobTools } from "./jobs.js";
import { uploadTools } from "./uploads.js";
import type { RendobarContext } from "../context.js";

// Registration is pure and offline: no tool description depends on live API
// state, so startup makes no network call (cold-start budget, and a registry
// outage can never shape what the server advertises).
export function registerTools(server: McpServer, ctx: RendobarContext): void {
  for (const tool of accountTools()) {
    registerToolDef(server, ctx, tool);
  }
  for (const tool of jobTools()) {
    registerToolDef(server, ctx, tool);
  }
  for (const tool of uploadTools()) {
    registerToolDef(server, ctx, tool);
  }
}
