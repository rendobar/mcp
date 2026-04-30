import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { createLogger } from "../../src/logger.js";

describe("logger", () => {
  let stderrSpy: MockInstance;
  let stdoutSpy: MockInstance;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it("writes JSON to stderr only", () => {
    const log = createLogger({ level: "info" });
    log.info({ tool: "x", durationMs: 42, ok: true });
    expect(stderrSpy).toHaveBeenCalledOnce();
    expect(stdoutSpy).not.toHaveBeenCalled();
    const written = stderrSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(written.trim());
    expect(parsed).toMatchObject({ level: "info", tool: "x", durationMs: 42, ok: true });
    expect(typeof parsed.time).toBe("number");
  });

  it("filters by level — info logger drops debug", () => {
    const log = createLogger({ level: "info" });
    log.debug({ msg: "noisy" });
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("filters by level — debug logger emits all", () => {
    const log = createLogger({ level: "debug" });
    log.debug({ msg: "fine" });
    log.info({ msg: "informational" });
    log.warn({ msg: "warning" });
    log.error({ msg: "broken" });
    expect(stderrSpy).toHaveBeenCalledTimes(4);
  });

  it("includes name when provided", () => {
    const log = createLogger({ level: "info", name: "rendobar-mcp" });
    log.info({ msg: "hi" });
    const parsed = JSON.parse((stderrSpy.mock.calls[0]![0] as string).trim());
    expect(parsed.name).toBe("rendobar-mcp");
  });

  it("patches global console to redirect to stderr", () => {
    const log = createLogger({ level: "info", patchConsole: true });
    /* eslint-disable no-console -- intentionally exercising console patch */
    console.log("oops");
    console.info("info");
    console.warn("warn");
    /* eslint-enable no-console */
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalled();
    log.restoreConsole();
  });
});
