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
 * The SDK's `ToolCallback` is generic over input args via a union with `undefined`,
 * which makes `Parameters<>` extraction collapse to `never`. We instead declare the
 * structural minimum we depend on; the runtime value is whatever the SDK passes.
 */
export interface ToolExtra {
  signal: AbortSignal;
  sessionId?: string;
  requestId?: string | number;
  _meta?: { progressToken?: string | number } & Record<string, unknown>;
  sendNotification?: (n: {
    method: string;
    params: Record<string, unknown>;
  }) => Promise<void>;
}

export interface ToolDef<I extends ZodRawShape, O extends ZodRawShape> {
  name: string;
  title: string;
  description: string;
  inputSchema: I;
  outputSchema?: O;
  annotations: ToolAnnotations;
  execute: (
    args: z.infer<z.ZodObject<I>>,
    ctx: RendobarContext,
    extra: ToolExtra,
  ) => Promise<unknown>;
}

export function defineTool<I extends ZodRawShape, O extends ZodRawShape>(
  def: ToolDef<I, O>,
): ToolDef<I, O> {
  return def;
}

// Common element type for heterogeneous tool arrays. Each ToolDef preserves
// its precise per-tool input/output shape internally; we widen only at the
// array boundary so iteration with `registerToolDef` works without TS
// trying to unify all the per-tool input schemas into an intersection.
//
// The cast is necessary because `execute` is contravariant in `args` — the
// per-tool args are narrower than `ZodRawShape`'s synthesized object. The SDK
// validates args against the Zod inputSchema before invoking the handler, so
// runtime safety holds; only the TS variance check needs the widening cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDef = ToolDef<ZodRawShape, any>;
export const widen = <I extends ZodRawShape, O extends ZodRawShape>(t: ToolDef<I, O>): AnyToolDef =>
  // Variance escape hatch — see comment above.
  t as unknown as AnyToolDef;

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
      tool.execute(args as z.infer<z.ZodObject<I>>, ctx, extra),
    );
    return wrapped();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(tool.name, definition, handler);
}
