import { describe, it, expect, vi } from "vitest";
import { accountTools } from "../../../src/tools/account.js";
import type { RendobarContext } from "../../../src/context.js";

const fakeLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  restoreConsole: vi.fn(),
});

const fakeBillingState = (overrides: Record<string, unknown> = {}) => ({
  balance: { amount: 5.0 },
  plan: {
    slug: "pro",
    name: "Pro",
    price: 9,
    limits: {
      concurrentJobs: 25,
      apiRequestsPerMinute: 300,
      maxJobTimeout: 900_000,
      maxInputFileSize: 2_147_483_648,
      maxBatchSize: 100,
    },
  },
  subscription: null,
  usage: { currentPeriodSpend: 0, jobCount: 0 },
  isPro: true,
  creditBonusRate: 0.2,
  upgradePlan: null,
  ...overrides,
});

const ctx = (sdkOverrides: Record<string, unknown> = {}): RendobarContext => ({
  logger: fakeLogger(),
  sdk: { billing: { state: vi.fn(async () => fakeBillingState()) }, ...sdkOverrides } as never,
  config: { apiKey: "rb_x", apiBase: "https://api.rendobar.com", logLevel: "info" as const },
  cachedMaxFileSize: null,
});

describe("get_account", () => {
  it("returns balance, plan, limits", async () => {
    const c = ctx();
    const tool = accountTools().find((t) => t.name === "get_account");
    expect(tool).toBeDefined();
    const result = await tool!.execute({}, c, {} as never);
    expect(result).toMatchObject({
      balance: "$5.00",
      balanceUsd: 5.0,
      plan: "pro",
      isPro: true,
      limits: {
        concurrentJobs: 25,
        maxFileSize: "2.0 GB",
        maxFileSizeBytes: 2_147_483_648,
        jobTimeoutMin: 15,
      },
    });
  });

  it("caches max file size on context", async () => {
    const c = ctx();
    const tool = accountTools().find((t) => t.name === "get_account");
    await tool!.execute({}, c, {} as never);
    expect(c.cachedMaxFileSize).toBe(2_147_483_648);
  });
});
