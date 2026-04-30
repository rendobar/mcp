import { describe, it, expect, vi } from "vitest";
import { jobTools } from "../../../src/tools/jobs.js";
import type { RendobarContext } from "../../../src/context.js";

const fakeLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  restoreConsole: vi.fn(),
});

const ctx = (sdk: Record<string, unknown>): RendobarContext => ({
  logger: fakeLogger(),
  sdk: sdk as never,
  config: { apiKey: "rb_x", apiBase: "https://api.rendobar.com", logLevel: "info" as const },
  cachedMaxFileSize: null,
});

describe("list_jobs", () => {
  it("returns jobs with outputUrl on complete only", async () => {
    const sdk = {
      jobs: {
        list: vi.fn(async () => ({
          data: [
            {
              id: "job_1",
              type: "raw.ffmpeg",
              status: "complete",
              createdAt: 1714560000000,
              priceFormatted: "$0.10",
              outputUrl: "https://cdn.rendobar.com/job_1/output.mp4",
            },
            {
              id: "job_2",
              type: "raw.ffmpeg",
              status: "failed",
              createdAt: 1714560100000,
              priceFormatted: null,
              outputUrl: null,
            },
          ],
          meta: { total: 2, page: 1, limit: 10, pages: 1 },
        })),
      },
    };
    const c = ctx(sdk);
    const tool = jobTools().find((t) => t.name === "list_jobs");
    const result = (await tool!.execute({ limit: 10 }, c, {} as never)) as {
      jobs: Record<string, unknown>[];
      total: number;
    };
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs[0]).toMatchObject({
      id: "job_1",
      status: "complete",
      cost: "$0.10",
      outputUrl: "https://cdn.rendobar.com/job_1/output.mp4",
    });
    expect(result.jobs[1]?.outputUrl).toBeUndefined();
    expect(result.total).toBe(2);
  });

  it("passes filters through to SDK", async () => {
    const list = vi.fn(async () => ({ data: [], meta: { total: 0, page: 1, limit: 5, pages: 0 } }));
    const c = ctx({ jobs: { list } });
    const tool = jobTools().find((t) => t.name === "list_jobs");
    await tool!.execute({ status: "complete", type: "raw.ffmpeg", limit: 5 }, c, {} as never);
    expect(list).toHaveBeenCalledWith({ status: "complete", type: "raw.ffmpeg", limit: 5 });
  });
});
