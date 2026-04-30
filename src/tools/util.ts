import type { z, ZodRawShape } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { withErrorMapping } from "../errors.js";
import type { RendobarContext } from "../context.js";

/**
 * MCP server passes a second `extra` arg to handlers carrying:
 *   - signal: AbortSignal for cancellation
 *   - sendNotification: emit notifications/progress, etc.
 *   - _meta: client-supplied metadata (includes progressToken when set)
 *   - sessionId, requestId, etc.
 *
 * We don't depend on the exact internal shape — handlers receive the same value the SDK would.
 */
export type ToolExtra = Parameters<Parameters<McpServer["registerTool"]>[2]>[1];

export interface ToolDef<I extends ZodRawShape, O extends ZodRawShape> {
  name: string;
  title: string;
  description: string;
  inputSchema: I;
  outputSchema?: O;
  annotations: ToolAnnotations;
  execute: (
    args: z.objectOutputType<I, z.ZodTypeAny>,
    ctx: RendobarContext,
    extra: ToolExtra,
  ) => Promise<unknown>;
}

export function defineTool<I extends ZodRawShape, O extends ZodRawShape>(
  def: ToolDef<I, O>,
): ToolDef<I, O> {
  return def;
}

/**
 * Register a single ToolDef on the McpServer with the standard error-mapping wrapper.
 *
 * The `as any` cast on `server.registerTool` is the documented workaround for the
 * Zod-version overload trap in @modelcontextprotocol/sdk@1.x — see issue #1180 and
 * .claude/rules/mcp.md §1.2. Runtime behavior is correct; only TS overload resolution
 * fails when Zod's generic depth bumps into the SDK's internal `zod/v4` import path.
 */
export function registerToolDef<I extends ZodRawShape, O extends ZodRawShape>(
  server: McpServer,
  ctx: RendobarContext,
  tool: ToolDef<I, O>,
): void {
  const definition: Record<string, unknown> = {
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  };
  if (tool.outputSchema !== undefined) {
    definition.outputSchema = tool.outputSchema;
  }

  const handler = async (args: unknown, extra: ToolExtra): Promise<CallToolResult> => {
    const wrapped = withErrorMapping(ctx, tool.name, () =>
      // SDK validates `args` against our Zod inputSchema before invoking the handler,
      // so this cast only narrows the already-validated shape from `unknown`.
      tool.execute(args as z.objectOutputType<I, z.ZodTypeAny>, ctx, extra),
    );
    return wrapped();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(tool.name, definition, handler);
}
