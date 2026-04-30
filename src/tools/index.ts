import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RendobarContext } from "../context.js";

// Real registration lands in Task 17 (after individual tool tasks 14-16, 19-22).
export async function registerTools(_server: McpServer, _ctx: RendobarContext): Promise<void> {
  // intentionally empty for v1 bones
}
