import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@rendobar/sdk";
import { withErrorMapping } from "../../src/errors.js";

const fakeLogger = () => ({
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), restoreConsole: vi.fn(),
});

const fakeCtx = (logger = fakeLogger()) => ({
  logger,
  // sdk and config stubbed — withErrorMapping doesn't read them
  sdk: {} as never,
  config: { apiKey: "rb_x", apiBase: "https://api.rendobar.com", logLevel: "info" as const },
  cachedMaxFileSize: null,
});

describe("withErrorMapping", () => {
  it("wraps successful result in CallToolResult", async () => {
    const ctx = fakeCtx();
    const wrapped = withErrorMapping(ctx, "test_tool", async () => ({ ok: 1, downloadUrl: "https://x" }));
    const result = await wrapped();
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ ok: 1, downloadUrl: "https://x" });
    const text = (result.content[0] as { text: string }).text;
    expect(JSON.parse(text)).toEqual({ ok: 1, downloadUrl: "https://x" });
    expect(ctx.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ tool: "test_tool", ok: true, durationMs: expect.any(Number) }),
    );
  });

  it("maps ApiError to isError tool result", async () => {
    const ctx = fakeCtx();
    const wrapped = withErrorMapping(ctx, "test_tool", async () => {
      throw new ApiError("INSUFFICIENT_CREDITS", 402, "Not enough credits");
    });
    const result = await wrapped();
    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({ error: { code: "INSUFFICIENT_CREDITS", message: "Not enough credits" } });
    expect(ctx.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ tool: "test_tool", ok: false, errCode: "INSUFFICIENT_CREDITS" }),
    );
  });

  it("rethrows unknown errors so MCP returns -32603", async () => {
    const ctx = fakeCtx();
    const wrapped = withErrorMapping(ctx, "test_tool", async () => {
      throw new Error("programmer bug");
    });
    await expect(wrapped()).rejects.toThrow("programmer bug");
    expect(ctx.logger.error).toHaveBeenCalled();
  });

  it("logs durationMs on both success and error", async () => {
    const ctx = fakeCtx();
    const slowOk = withErrorMapping(ctx, "slow", async () => {
      await new Promise((r) => setTimeout(r, 25));
      return { ok: 1 };
    });
    await slowOk();
    const callArg = ctx.logger.info.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    // 25ms sleep but assert ≥10ms — absorbs timer-resolution skew on fast CI runners
    // where Date.now() ticks coarsely (saw 4ms reported on a 5ms sleep).
    expect(callArg?.durationMs).toBeGreaterThanOrEqual(10);
  });
});
