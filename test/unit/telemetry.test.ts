import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

// telemetry.ts reads HOME to locate ~/.config/rendobar/telemetry.json and reads
// the token from RENDOBAR_TELEMETRY_KEY (build define is empty in tests).
async function freshModule(env: Record<string, string>) {
  const home = await fs.mkdtemp(path.join(tmpdir(), "rb-tel-"));
  const prev = { ...process.env };
  // Clear all telemetry-relevant vars first (delete, not =undefined, which would
  // coerce to the truthy string "undefined").
  for (const k of [
    "RENDOBAR_TELEMETRY_KEY", "RENDOBAR_TELEMETRY_HOST", "DO_NOT_TRACK",
    "RENDOBAR_TELEMETRY", "RENDOBAR_NO_TELEMETRY", "RENDOBAR_DISABLE_TELEMETRY", "CI",
  ]) {
    delete process.env[k];
  }
  process.env.HOME = home;
  Object.assign(process.env, env);
  vi.resetModules();
  const mod = await import("../../src/telemetry.js");
  return { mod, restore: () => { process.env = prev; } };
}

describe("mcp telemetry", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("1"));
  });
  afterEach(() => vi.restoreAllMocks());

  it("captures an anonymous mcp_tool_call with no PII", async () => {
    const { mod, restore } = await freshModule({
      RENDOBAR_TELEMETRY_KEY: "phc_test",
      RENDOBAR_TELEMETRY_HOST: "https://e.rendobar.com",
    });
    mod.captureToolCall("submit_job", true, 42);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://e.rendobar.com/i/v0/e/");
    const body = JSON.parse(init.body as string);
    expect(body.event).toBe("mcp_tool_call");
    expect(body.distinct_id).toMatch(/^mcp_anon_/);
    expect(body.properties.tool).toBe("submit_job");
    expect(body.properties.success).toBe(true);
    expect(body.properties.$process_person_profile).toBe(false);
    // No arguments, files, or credentials anywhere in the payload.
    expect(JSON.stringify(body)).not.toMatch(/rb_|apiKey|api_key.*rb_|Bearer/);
    restore();
  });

  it("no-ops when DO_NOT_TRACK is set", async () => {
    const { mod, restore } = await freshModule({
      RENDOBAR_TELEMETRY_KEY: "phc_test",
      DO_NOT_TRACK: "1",
    });
    expect(mod.telemetryEnabled()).toBe(false);
    mod.captureToolCall("submit_job", true, 1);
    expect(fetchSpy).not.toHaveBeenCalled();
    restore();
  });

  it("no-ops when no token is configured", async () => {
    const { mod, restore } = await freshModule({});
    expect(mod.telemetryEnabled()).toBe(false);
    mod.captureToolCall("x", true, 1);
    expect(fetchSpy).not.toHaveBeenCalled();
    restore();
  });
});
