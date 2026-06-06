import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
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
  it("surfaces file output url + cost on complete; null cost and no output otherwise", async () => {
    const sdk = {
      jobs: {
        list: vi.fn(async () => ({
          data: [
            {
              id: "job_1",
              type: "raw.ffmpeg",
              status: "complete",
              createdAt: 1714560000000,
              cost: { amount: 100_000_000, currency: "USD", formatted: "$0.10" },
              output: {
                kind: "file",
                url: "https://cdn.rendobar.com/job_1/output.mp4",
                poster: null,
                meta: {},
              },
            },
            {
              id: "job_2",
              type: "raw.ffmpeg",
              status: "failed",
              createdAt: 1714560100000,
              cost: null,
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
      output: { kind: "file", url: "https://cdn.rendobar.com/job_1/output.mp4" },
    });
    expect(result.jobs[1]?.output).toBeUndefined();
    expect(result.jobs[1]?.cost).toBeNull();
    expect(result.total).toBe(2);
  });

  it("surfaces stream output (url + fileCount) for multi-file complete jobs", async () => {
    const sdk = {
      jobs: {
        list: vi.fn(async () => ({
          data: [
            {
              id: "job_hls",
              type: "ffmpeg",
              status: "complete",
              createdAt: 1714560000000,
              cost: { amount: 100_000_000, currency: "USD", formatted: "$0.10" },
              output: {
                kind: "stream",
                url: "https://api.rendobar.com/v/job_hls/tok/index.m3u8",
                manifest: "hls",
                baseUrl: "https://api.rendobar.com/v/job_hls/tok/",
                fileCount: 6,
                manifestUrl: "https://api.rendobar.com/v/job_hls/tok/_manifest.json",
              },
            },
          ],
          meta: { total: 1, page: 1, limit: 10, pages: 1 },
        })),
      },
    };
    const c = ctx(sdk);
    const tool = jobTools().find((t) => t.name === "list_jobs");
    const result = (await tool!.execute({ limit: 10 }, c, {} as never)) as {
      jobs: Record<string, unknown>[];
    };
    expect(result.jobs[0]?.output).toMatchObject({
      kind: "stream",
      url: "https://api.rendobar.com/v/job_hls/tok/index.m3u8",
      fileCount: 6,
    });
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
  it("complete file job returns reshaped output with cost, durationMs, url + meta", async () => {
    const sdk = {
      jobs: {
        get: vi.fn(async (id: string) => ({
          id, orgId: "org_x", type: "raw.ffmpeg", status: "complete",
          inputs: {}, params: {},
          output: {
            kind: "file",
            url: `https://cdn.rendobar.com/${id}/output.mp4`,
            expiresAt: 9000,
            poster: null,
            meta: { format: "mp4", width: 1920, height: 1080, durationMs: 60000, sizeBytes: 5_000_000 },
          },
          cost: { amount: 200_000_000, currency: "USD", formatted: "$0.20" },
          createdAt: 1000, dispatchedAt: 1100, startedAt: 1200, completedAt: 5000,
          steps: [], outputCategory: "video",
          logsAvailable: true, settledAt: 5100,
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
      output: {
        kind: "file",
        url: "https://cdn.rendobar.com/job_abc/output.mp4",
        format: "mp4",
        resolution: "1920x1080",
        durationMs: 60000,
        sizeBytes: 5_000_000,
      },
    });
  });

  it("running job exposes progress + step from typed steps array", async () => {
    const sdk = {
      jobs: {
        get: vi.fn(async () => ({
          id: "job_x", orgId: "org_x", type: "raw.ffmpeg", status: "running",
          inputs: {}, params: {},
          cost: null,
          createdAt: 1000, dispatchedAt: 1100, startedAt: 1200, completedAt: null,
          steps: [
            { id: "s1", name: "download", status: "complete" },
            { id: "s2", name: "execute", status: "running" },
            { id: "s3", name: "upload", status: "pending" },
          ],
          outputCategory: "video",
          logsAvailable: true, settledAt: null,
        })),
      },
    };
    const c = ctx({ jobs: sdk.jobs });
    const tool = jobTools().find((t) => t.name === "get_job");
    const result = await tool!.execute({ jobId: "job_x" }, c, {} as never) as Record<string, unknown>;
    expect(result.progress).toBeCloseTo(0.33, 1);
    expect(result.step).toBe("execute");
  });

  it("failed job exposes error with code, message, detail, retryable", async () => {
    const sdk = {
      jobs: {
        get: vi.fn(async () => ({
          id: "job_x", orgId: "org_x", type: "ffmpeg", status: "failed",
          inputs: {}, params: {},
          error: {
            code: "PROVIDER_ERROR",
            message: "Provider returned 500",
            detail: "Conversion failed!\n[libx264 @ 0x..] missing pps",
            retryable: true,
          },
          cost: null,
          createdAt: 1000, dispatchedAt: 1100, startedAt: 1200, completedAt: 2000,
          steps: [], outputCategory: "raw",
          logsAvailable: false, settledAt: 2100,
        })),
      },
    };
    const c = ctx({ jobs: sdk.jobs });
    const tool = jobTools().find((t) => t.name === "get_job");
    const result = await tool!.execute({ jobId: "job_x" }, c, {} as never) as Record<string, unknown>;
    expect(result.error).toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Provider returned 500",
      detail: "Conversion failed!\n[libx264 @ 0x..] missing pps",
      retryable: true,
    });
  });

  it("stream output surfaces url + fileCount + manifestUrl", async () => {
    const sdk = {
      jobs: {
        get: vi.fn(async (id: string) => ({
          id, orgId: "org_x", type: "ffmpeg", status: "complete",
          inputs: {}, params: {},
          output: {
            kind: "stream",
            url: "https://api.rendobar.com/v/job_hls/tok/index.m3u8",
            manifest: "hls",
            baseUrl: "https://api.rendobar.com/v/job_hls/tok/",
            expiresAt: 9000,
            fileCount: 6,
            files: [{ path: "index.m3u8", url: "https://api.rendobar.com/v/job_hls/tok/index.m3u8", size: 200 }],
            manifestUrl: "https://api.rendobar.com/v/job_hls/tok/_manifest.json",
          },
          cost: { amount: 100_000_000, currency: "USD", formatted: "$0.10" },
          createdAt: 1000, dispatchedAt: 1100, startedAt: 1200, completedAt: 5000,
          steps: [], outputCategory: "video",
          logsAvailable: true, settledAt: 5100,
        })),
      },
    };
    const c = ctx({ jobs: sdk.jobs });
    const tool = jobTools().find((t) => t.name === "get_job");
    const result = await tool!.execute({ jobId: "job_hls" }, c, {} as never) as Record<string, unknown>;
    expect(result.output).toMatchObject({
      kind: "stream",
      url: "https://api.rendobar.com/v/job_hls/tok/index.m3u8",
      manifest: "hls",
      fileCount: 6,
      manifestUrl: "https://api.rendobar.com/v/job_hls/tok/_manifest.json",
    });
  });

  it("set output surfaces baseUrl + fileCount instead of a url", async () => {
    const sdk = {
      jobs: {
        get: vi.fn(async (id: string) => ({
          id, orgId: "org_x", type: "ffmpeg", status: "complete",
          inputs: {}, params: {},
          output: {
            kind: "set",
            baseUrl: "https://api.rendobar.com/v/job_set/tok/",
            expiresAt: 9000,
            fileCount: 12,
            files: [{ path: "frame_0001.png", url: "https://api.rendobar.com/v/job_set/tok/frame_0001.png", size: 5000 }],
            manifestUrl: "https://api.rendobar.com/v/job_set/tok/_manifest.json",
          },
          cost: { amount: 100_000_000, currency: "USD", formatted: "$0.10" },
          createdAt: 1000, dispatchedAt: 1100, startedAt: 1200, completedAt: 5000,
          steps: [], outputCategory: "image",
          logsAvailable: true, settledAt: 5100,
        })),
      },
    };
    const c = ctx({ jobs: sdk.jobs });
    const tool = jobTools().find((t) => t.name === "get_job");
    const result = await tool!.execute({ jobId: "job_set" }, c, {} as never) as Record<string, unknown>;
    expect(result.output).toMatchObject({
      kind: "set",
      baseUrl: "https://api.rendobar.com/v/job_set/tok/",
      fileCount: 12,
      manifestUrl: "https://api.rendobar.com/v/job_set/tok/_manifest.json",
    });
    expect((result.output as Record<string, unknown>).url).toBeUndefined();
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

  it("forwards polymorphic inputs (string | {url} | {content} | {ref}) verbatim", async () => {
    const create = vi.fn(async () => ({ id: "job_poly", status: "waiting" as const }));
    const c = ctx({ jobs: { create } });
    const tool = jobTools().find((t) => t.name === "submit_job");
    const inputs = {
      "video.mp4": "https://x/y.mp4",
      "clip.mp4": { url: "https://x/z.mp4" },
      "subs.srt": { content: "1\n00:00:00,000 --> 00:00:01,000\nhi" },
      "logo.png": { ref: "uploads/org_a/logo" },
    };
    await tool!.execute(
      { type: "raw.ffmpeg", inputs, params: { command: "ffmpeg ..." } },
      c, {} as never,
    );
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ inputs }));
  });
});

describe("submit_job inputs schema — polymorphic ffmpeg sources", () => {
  const inputsSchema = (() => {
    const tool = jobTools().find((t) => t.name === "submit_job");
    if (!tool) throw new Error("submit_job tool not registered");
    const inputs = tool.inputSchema.inputs;
    if (!(inputs instanceof z.ZodType)) throw new Error("inputs schema missing");
    return inputs;
  })();

  it("accepts URL string, {url}, {content}, {ref}, and a mixed map", () => {
    expect(inputsSchema.safeParse({ a: "https://x/y.mp4" }).success).toBe(true);
    expect(inputsSchema.safeParse({ a: { url: "https://x/y.mp4" } }).success).toBe(true);
    expect(inputsSchema.safeParse({ a: { content: "file 'a.mp4'" } }).success).toBe(true);
    expect(inputsSchema.safeParse({ a: { ref: "uploads/org/asset" } }).success).toBe(true);
    expect(
      inputsSchema.safeParse({
        v: "https://x/y.mp4",
        s: { content: "subs" },
        l: { ref: "uploads/org/logo" },
      }).success,
    ).toBe(true);
  });

  it("rejects an unsupported source shape", () => {
    expect(inputsSchema.safeParse({ a: { urls: ["https://x/y.mp4"] } }).success).toBe(false);
  });
});

describe("cancel_job", () => {
  it("cancels and returns id + status from full Job response", async () => {
    const sdk = {
      jobs: {
        cancel: vi.fn(async (id: string) => ({
          id, orgId: "org_x", type: "raw.ffmpeg", status: "cancelled",
          inputs: {}, params: {},
          cost: null,
          createdAt: 1000, dispatchedAt: null, startedAt: null, completedAt: 2000,
          steps: [], outputCategory: "raw",
          logsAvailable: false, settledAt: 2100,
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
