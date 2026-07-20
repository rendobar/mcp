import { describe, it, expect, afterEach, vi } from "vitest";

// telemetry.ts reads the token from RENDOBAR_TELEMETRY_KEY (build define empty in
// tests) and env opt-outs. Import fresh per case so module-level KEY re-reads.
async function freshModule(env: Record<string, string>) {
  const prev = { ...process.env };
  for (const k of [
    "RENDOBAR_TELEMETRY_KEY", "DO_NOT_TRACK", "RENDOBAR_TELEMETRY",
    "RENDOBAR_NO_TELEMETRY", "RENDOBAR_DISABLE_TELEMETRY", "CI",
  ]) {
    delete process.env[k];
  }
  Object.assign(process.env, env);
  vi.resetModules();
  const mod = await import("../../src/telemetry.js");
  return { mod, restore: () => { process.env = prev; } };
}

afterEach(() => vi.restoreAllMocks());

describe("mcp analytics guardrails", () => {
  it("strips raw tool parameters and responses, keeps tool metadata", async () => {
    const { mod, restore } = await freshModule({ RENDOBAR_TELEMETRY_KEY: "phc_test" });
    const out = mod.redactToolPayloads({
      $mcp_tool_name: "submit_job",
      $mcp_duration_ms: 42,
      $mcp_is_error: false,
      $mcp_intent: "process a video",
      $mcp_parameters: { url: "https://user-file", params: { secret: "x" } },
      $mcp_response: { output: "https://output-url" },
    });
    expect(out.$mcp_parameters).toBeUndefined();
    expect(out.$mcp_response).toBeUndefined();
    expect(out.$mcp_tool_name).toBe("submit_job");
    expect(out.$mcp_duration_ms).toBe(42);
    expect(out.$mcp_intent).toBe("process a video");
    restore();
  });

  it("is enabled with a token and no opt-out", async () => {
    const { mod, restore } = await freshModule({ RENDOBAR_TELEMETRY_KEY: "phc_test" });
    expect(mod.analyticsEnabled()).toBe(true);
    restore();
  });

  it("no-ops when DO_NOT_TRACK is set", async () => {
    const { mod, restore } = await freshModule({ RENDOBAR_TELEMETRY_KEY: "phc_test", DO_NOT_TRACK: "1" });
    expect(mod.analyticsEnabled()).toBe(false);
    restore();
  });

  it("no-ops when RENDOBAR_TELEMETRY=0", async () => {
    const { mod, restore } = await freshModule({ RENDOBAR_TELEMETRY_KEY: "phc_test", RENDOBAR_TELEMETRY: "0" });
    expect(mod.analyticsEnabled()).toBe(false);
    restore();
  });

  it("no-ops when no token is configured", async () => {
    const { mod, restore } = await freshModule({});
    expect(mod.analyticsEnabled()).toBe(false);
    restore();
  });
});
