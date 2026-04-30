import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { parseConfig, ConfigError } from "../../src/config.js";

describe("parseConfig", () => {
  let tmp: string;
  let credsFile: string;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(tmpdir(), "rendobar-mcp-config-"));
    credsFile = path.join(tmp, "credentials.json");
  });

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // reset creds file each test
    try { await fs.unlink(credsFile); } catch { /* noop */ }
  });

  it("prefers --api-key flag over env and file", async () => {
    await fs.writeFile(credsFile, JSON.stringify({ apiKey: "rb_file", apiBase: "https://file" }));
    const cfg = await parseConfig({
      argv: ["--api-key=rb_flag"],
      env: { RENDOBAR_API_KEY: "rb_env" },
      credsPath: credsFile,
    });
    expect(cfg.apiKey).toBe("rb_flag");
  });

  it("env wins over file (when no flag)", async () => {
    await fs.writeFile(credsFile, JSON.stringify({ apiKey: "rb_file" }));
    const cfg = await parseConfig({
      argv: [],
      env: { RENDOBAR_API_KEY: "rb_env" },
      credsPath: credsFile,
    });
    expect(cfg.apiKey).toBe("rb_env");
  });

  it("loads from credentials file when no flag and no env", async () => {
    await fs.writeFile(credsFile, JSON.stringify({ apiKey: "rb_filekey", apiBase: "https://file.api" }));
    const cfg = await parseConfig({
      argv: [],
      env: {},
      credsPath: credsFile,
    });
    expect(cfg.apiKey).toBe("rb_filekey");
    expect(cfg.apiBase).toBe("https://file.api");
  });

  it("--api-base flag overrides file's apiBase", async () => {
    await fs.writeFile(credsFile, JSON.stringify({ apiKey: "rb_x", apiBase: "https://prod" }));
    const cfg = await parseConfig({
      argv: ["--api-base=https://staging"],
      env: {},
      credsPath: credsFile,
    });
    expect(cfg.apiBase).toBe("https://staging");
  });

  it("uses default apiBase when none in any source", async () => {
    const cfg = await parseConfig({
      argv: [],
      env: { RENDOBAR_API_KEY: "rb_x" },
      credsPath: "/no/such/file",
    });
    expect(cfg.apiBase).toBe("https://api.rendobar.com");
  });

  it("rejects invalid api key prefix", async () => {
    await expect(
      parseConfig({ argv: ["--api-key=garbage"], env: {}, credsPath: "/no/such/file" }),
    ).rejects.toThrow(ConfigError);
  });

  it("throws ConfigError when no key in any source", async () => {
    await expect(
      parseConfig({ argv: [], env: {}, credsPath: "/no/such/file" }),
    ).rejects.toThrow(ConfigError);
  });

  it("respects RENDOBAR_LOG_LEVEL env", async () => {
    const cfg = await parseConfig({
      argv: [],
      env: { RENDOBAR_API_KEY: "rb_x", RENDOBAR_LOG_LEVEL: "debug" },
      credsPath: "/no/such/file",
    });
    expect(cfg.logLevel).toBe("debug");
  });

  it("rejects invalid RENDOBAR_LOG_LEVEL", async () => {
    await expect(
      parseConfig({
        argv: [],
        env: { RENDOBAR_API_KEY: "rb_x", RENDOBAR_LOG_LEVEL: "verbose" },
        credsPath: "/no/such/file",
      }),
    ).rejects.toThrow(ConfigError);
  });

  it("supports --api-key as space-separated argv form", async () => {
    const cfg = await parseConfig({
      argv: ["--api-key", "rb_spaced"],
      env: {},
      credsPath: "/no/such/file",
    });
    expect(cfg.apiKey).toBe("rb_spaced");
  });
});
