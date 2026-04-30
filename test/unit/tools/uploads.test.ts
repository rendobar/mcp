import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { uploadTools } from "../../../src/tools/uploads.js";
import type { RendobarContext } from "../../../src/context.js";

const fakeLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  restoreConsole: vi.fn(),
});

const ctx = (overrides: Partial<RendobarContext>): RendobarContext => ({
  logger: fakeLogger(),
  sdk: {} as never,
  config: { apiKey: "rb_x", apiBase: "https://api.rendobar.com", logLevel: "info" as const },
  cachedMaxFileSize: null,
  ...overrides,
});

const billingState = (maxFileSize: number) => ({
  balance: { amount: 5 },
  plan: {
    slug: "pro",
    name: "Pro",
    price: 9,
    limits: {
      concurrentJobs: 25,
      apiRequestsPerMinute: 300,
      maxJobTimeout: 900_000,
      maxInputFileSize: maxFileSize,
      maxBatchSize: 100,
    },
  },
  subscription: null,
  usage: { currentPeriodSpend: 0, jobCount: 0 },
  isPro: true,
  creditBonusRate: 0.2,
  upgradePlan: null,
});

describe("upload_file", () => {
  let tmp: string;
  let small: string;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(tmpdir(), "rendobar-mcp-upload-"));
    small = path.join(tmp, "small.txt");
    await fs.writeFile(small, "hello world");
  });

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("uploads a small file and returns downloadUrl + sizeBytes", async () => {
    const upload = vi.fn(async () => ({ downloadUrl: "https://api.rendobar.com/uploads/dl/abc" }));
    const sdk = {
      uploads: { upload },
      billing: { state: vi.fn(async () => billingState(999_999_999)) },
    };
    const c = ctx({ sdk: sdk as never });

    const tool = uploadTools().find((t) => t.name === "upload_file");
    expect(tool).toBeDefined();
    const result = await tool!.execute(
      { path: small },
      c,
      { signal: new AbortController().signal } as never,
    );
    expect(result).toMatchObject({
      downloadUrl: "https://api.rendobar.com/uploads/dl/abc",
      sizeBytes: 11, // "hello world"
    });
    expect(upload).toHaveBeenCalledOnce();
  });

  it("respects custom filename", async () => {
    const upload = vi.fn(async () => ({ downloadUrl: "https://x" }));
    const sdk = {
      uploads: { upload },
      billing: { state: vi.fn(async () => billingState(999_999_999)) },
    };
    const c = ctx({ sdk: sdk as never });
    const tool = uploadTools().find((t) => t.name === "upload_file");
    await tool!.execute(
      { path: small, filename: "renamed.txt" },
      c,
      { signal: new AbortController().signal } as never,
    );
    expect(upload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ filename: "renamed.txt" }),
    );
  });

  it("rejects oversize files using cached limit", async () => {
    const upload = vi.fn();
    const sdk = {
      uploads: { upload },
      billing: { state: vi.fn() }, // should NOT be called — cache is set
    };
    const c = ctx({ sdk: sdk as never, cachedMaxFileSize: 5 });
    const tool = uploadTools().find((t) => t.name === "upload_file");
    await expect(
      tool!.execute({ path: small }, c, { signal: new AbortController().signal } as never),
    ).rejects.toThrow(/exceeds.*limit/i);
    expect(upload).not.toHaveBeenCalled();
    expect(sdk.billing.state).not.toHaveBeenCalled();
  });

  it("populates limit cache via billing.state when cold", async () => {
    const upload = vi.fn(async () => ({ downloadUrl: "https://x" }));
    const billingStateFn = vi.fn(async () => billingState(100));
    const sdk = {
      uploads: { upload },
      billing: { state: billingStateFn },
    };
    const c = ctx({ sdk: sdk as never });
    const tool = uploadTools().find((t) => t.name === "upload_file");
    await tool!.execute(
      { path: small },
      c,
      { signal: new AbortController().signal } as never,
    );
    expect(billingStateFn).toHaveBeenCalledOnce();
    expect(c.cachedMaxFileSize).toBe(100);
  });
});
