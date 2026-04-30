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

describe("get_job", () => {
  it("complete job returns reshaped output with cost, durationMs, outputUrl, output meta", async () => {
    const sdk = {
      jobs: {
        get: vi.fn(async (id: string) => ({
          id, orgId: "org_x", type: "raw.ffmpeg", status: "complete",
          inputs: {}, params: {},
          outputRef: `jobs/${id}/output.mp4`,
          outputUrl: `https://cdn.rendobar.com/${id}/output.mp4`,
          outputMeta: { format: "mp4", width: 1920, height: 1080, durationMs: 60000, fileSize: 5_000_000 },
          errorCode: null, errorMessage: null,
          price: 200_000_000, priceFormatted: "$0.20",
          cost: { total: 0.2, currency: "USD" },
          createdAt: 1000, dispatchedAt: 1100, startedAt: 1200, completedAt: 5000,
          steps: [], outputCategory: "video", mediaType: "video/mp4",
          logsAvailable: true, providerType: "trigger", providerRunId: "run_x", settledAt: 5100,
        })),
      },
    };
    const c = ctx({ jobs: sdk.jobs });
    const tool = jobTools().find((t) => t.name === "get_job");
    const result = await tool!.execute({ jobId: "job_abc" }, c, {} as never) as Record<string, unknown>;
    expect(result).toMatchObject({
      id: "job_abc",
      type: "raw.ffmpeg",
      status: "complete",
      cost: "$0.20",
      durationMs: 4000,
      outputUrl: "https://cdn.rendobar.com/job_abc/output.mp4",
      output: { format: "mp4", resolution: "1920x1080", durationMs: 60000, fileSizeBytes: 5_000_000 },
    });
  });

  it("running job exposes progress + step from typed steps array", async () => {
    const sdk = {
      jobs: {
        get: vi.fn(async () => ({
          id: "job_x", orgId: "org_x", type: "raw.ffmpeg", status: "running",
          inputs: {}, params: {},
          outputRef: null, outputUrl: null, outputMeta: null,
          errorCode: null, errorMessage: null, price: null, priceFormatted: null, cost: null,
          createdAt: 1000, dispatchedAt: 1100, startedAt: 1200, completedAt: null,
          steps: [
            { id: "s1", name: "download", status: "complete" },
            { id: "s2", name: "execute", status: "running" },
            { id: "s3", name: "upload", status: "pending" },
          ],
          outputCategory: "video", mediaType: null,
          logsAvailable: true, providerType: "trigger", providerRunId: "run_x", settledAt: null,
        })),
      },
    };
    const c = ctx({ jobs: sdk.jobs });
    const tool = jobTools().find((t) => t.name === "get_job");
    const result = await tool!.execute({ jobId: "job_x" }, c, {} as never) as Record<string, unknown>;
    expect(result.progress).toBeCloseTo(0.33, 1);
    expect(result.step).toBe("execute");
  });

  it("failed job exposes error", async () => {
    const sdk = {
      jobs: {
        get: vi.fn(async () => ({
          id: "job_x", orgId: "org_x", type: "raw.ffmpeg", status: "failed",
          inputs: {}, params: {},
          outputRef: null, outputUrl: null, outputMeta: null,
          errorCode: "PROVIDER_ERROR", errorMessage: "Provider returned 500",
          price: null, priceFormatted: null, cost: null,
          createdAt: 1000, dispatchedAt: 1100, startedAt: 1200, completedAt: 2000,
          steps: [], outputCategory: "raw", mediaType: null,
          logsAvailable: false, providerType: "trigger", providerRunId: null, settledAt: 2100,
        })),
      },
    };
    const c = ctx({ jobs: sdk.jobs });
    const tool = jobTools().find((t) => t.name === "get_job");
    const result = await tool!.execute({ jobId: "job_x" }, c, {} as never) as Record<string, unknown>;
    expect(result.error).toMatchObject({ code: "PROVIDER_ERROR", message: "Provider returned 500" });
  });
});

describe("submit_job", () => {
  it("returns jobId + status from JobCreatedResponse (no data wrap)", async () => {
    const sdk = {
      jobs: {
        create: vi.fn(async () => ({ id: "job_new", status: "waiting" as const })),
      },
    };
    const c = ctx({ jobs: sdk.jobs });
    const tool = jobTools().find((t) => t.name === "submit_job");
    const result = await tool!.execute(
      { type: "raw.ffmpeg", inputs: { source: "https://x/y.mp4" }, params: { command: "ffmpeg -i input output" } },
      c, {} as never,
    );
    expect(result).toEqual({ jobId: "job_new", status: "waiting" });
    expect(sdk.jobs.create).toHaveBeenCalledWith(expect.objectContaining({
      type: "raw.ffmpeg",
      inputs: { source: "https://x/y.mp4" },
    }));
  });
});

describe("cancel_job", () => {
  it("cancels and returns id + status from full Job response", async () => {
    const sdk = {
      jobs: {
        cancel: vi.fn(async (id: string) => ({
          id, orgId: "org_x", type: "raw.ffmpeg", status: "cancelled",
          inputs: {}, params: {},
          outputRef: null, outputUrl: null, outputMeta: null,
          errorCode: null, errorMessage: null,
          price: null, priceFormatted: null, cost: null,
          createdAt: 1000, dispatchedAt: null, startedAt: null, completedAt: 2000,
          steps: [], outputCategory: "raw", mediaType: null,
          logsAvailable: false, providerType: null, providerRunId: null, settledAt: 2100,
        })),
      },
    };
    const c = ctx({ jobs: sdk.jobs });
    const tool = jobTools().find((t) => t.name === "cancel_job");
    const result = await tool!.execute({ jobId: "job_x" }, c, {} as never);
    expect(result).toEqual({ id: "job_x", status: "cancelled" });
    expect(sdk.jobs.cancel).toHaveBeenCalledWith("job_x");
  });
});
