import { vi, type Mock } from "vitest";
import type { RendobarContext } from "../../../src/context.js";

/** The logger every tool test hands a context. */
export const fakeLogger = (): {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  restoreConsole: Mock;
} => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  restoreConsole: vi.fn(),
});

/** A context around a stub SDK. Only the resources a test touches need to exist on it. */
export const ctx = (sdk: Record<string, unknown>): RendobarContext => ({
  logger: fakeLogger(),
  sdk: sdk as never,
  config: { apiKey: "rb_x", apiBase: "https://api.rendobar.com", logLevel: "info" as const },
  cachedMaxFileSize: null,
});

/** No tool under test reads the MCP request context. */
export const NO_EXTRA = {} as never;

export function pickTool<T extends { name: string }>(tools: readonly T[], name: string): T {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool named ${name}`);
  return tool;
}
