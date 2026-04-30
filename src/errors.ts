import { isApiError } from "@rendobar/sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { RendobarContext } from "./context.js";

type ToolFn<T> = () => Promise<T>;

export function withErrorMapping<T>(
  ctx: RendobarContext,
  tool: string,
  fn: ToolFn<T>,
): () => Promise<CallToolResult> {
  return async () => {
    const start = Date.now();
    try {
      const data = await fn();
      ctx.logger.info({ tool, durationMs: Date.now() - start, ok: true });
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        structuredContent: data as Record<string, unknown>,
      };
    } catch (e) {
      const durationMs = Date.now() - start;
      if (isApiError(e)) {
        ctx.logger.error({ tool, durationMs, ok: false, errCode: e.code, errMsg: e.message });
        return {
          isError: true,
          content: [{
            type: "text",
            text: JSON.stringify({ error: { code: e.code, message: e.message } }),
          }],
        };
      }
      ctx.logger.error({ tool, durationMs, ok: false, err: String(e) });
      throw e;
    }
  };
}
