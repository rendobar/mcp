/**
 * Regression: submit_job used to bake the active job type list into its static
 * description, from a single registry read at startup. A server booted before a
 * job type launched served that stale list for its whole lifetime, so an agent
 * asked for a live capability read the description, concluded Rendobar did not
 * have it, and never called list_job_types. These tests pin the replacement:
 * nothing about the registry is embedded anywhere static, discovery is
 * list_job_types, and an unknown type fails loudly at the API instead of being
 * silently refused up front.
 */
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "@rendobar/sdk";
import { jobTools } from "../../../src/tools/jobs.js";
import { SERVER_INSTRUCTIONS } from "../../../src/instructions.js";
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

const tool = (name: string) => {
  const t = jobTools().find((x) => x.name === name);
  if (!t) throw new Error(`${name} not registered`);
  return t;
};

const LIVE_TYPES = [
  { type: "ffmpeg", tag: "FFmpeg", summary: "Execute FFmpeg command", acceptsMedia: ["video"] },
  { type: "image.generate", tag: "Generate", summary: "Generate an image from a text prompt", acceptsMedia: [] },
];

// Types that shipped after an old build would have snapshotted its list, plus
// the marker of the enumeration itself.
const POST_SNAPSHOT_TYPES = ["image.generate", "image.edit", "compose", "compress.target", "ffprobe"];

describe("submit_job description", () => {
  const description = tool("submit_job").description;

  it("does not enumerate job types", () => {
    expect(description).not.toContain("Active job types:");
    for (const type of POST_SNAPSHOT_TYPES) {
      expect(description).not.toContain(type);
    }
  });

  it("sends the caller to list_job_types and says the list changes", () => {
    expect(description).toContain("list_job_types");
    expect(description).toMatch(/never tell a user rendobar cannot do something/i);
  });

  it("tells the caller on the type field itself where the current list lives", () => {
    // inputSchema is widened to ZodRawShape on the tool array, so narrow back to
    // a ZodType before reading the field's description. Same pattern as jobs.test.ts.
    const typeField = tool("submit_job").inputSchema.type;
    if (!(typeField instanceof z.ZodType)) throw new Error("type field missing");
    expect(typeField.description).toContain("list_job_types");
  });

  it("reads no registry to build the tool list", () => {
    // Registration is pure: a fetch here would be a startup snapshot returning
    // by another name, and it is what went stale in the first place.
    const spy = vi.spyOn(globalThis, "fetch");
    jobTools();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("server instructions", () => {
  it("does not enumerate job types", () => {
    expect(SERVER_INSTRUCTIONS).not.toContain("Active job types:");
    for (const type of POST_SNAPSHOT_TYPES) {
      expect(SERVER_INSTRUCTIONS).not.toContain(type);
    }
  });

  it("claims no capability gap that the registry contradicts", () => {
    // The old text asserted "Generate video from text or images (no diffusion
    // models)" while image.generate and image.edit were live in production.
    expect(SERVER_INSTRUCTIONS).not.toMatch(/diffusion/i);
    expect(SERVER_INSTRUCTIONS).not.toMatch(/generate .*image/i);
  });

  it("makes list_job_types the way to answer a capability question", () => {
    expect(SERVER_INSTRUCTIONS).toContain("list_job_types");
    expect(SERVER_INSTRUCTIONS).toMatch(/never tell\s+a user rendobar cannot do something/i);
  });
});

describe("submit_job type handling", () => {
  it("submits without consulting the registry first", async () => {
    const create = vi.fn(async () => ({ id: "job_new", status: "waiting" as const }));
    const types = vi.fn();
    const result = await tool("submit_job").execute(
      { type: "image.generate", inputs: {}, params: { prompt: "a cat" } },
      ctx({ jobs: { create, types } }),
      {} as never,
    );
    expect(result).toEqual({ jobId: "job_new", status: "waiting" });
    // A type absent from any snapshot must still submit. The API is the
    // authority: it also accepts aliases (raw.ffmpeg) and draft types that
    // GET /jobs/types never lists.
    expect(types).not.toHaveBeenCalled();
  });

  it("submits when the registry is unreachable", async () => {
    const create = vi.fn(async () => ({ id: "job_new", status: "waiting" as const }));
    const types = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await tool("submit_job").execute(
      { type: "ffmpeg", inputs: {}, params: { command: "ffmpeg -i in out" } },
      ctx({ jobs: { create, types } }),
      {} as never,
    );
    expect(result).toEqual({ jobId: "job_new", status: "waiting" });
  });

  it("attaches the live types to an unknown-type rejection", async () => {
    const create = vi.fn(async () => {
      throw new ApiError(
        "INVALID_JOB_TYPE",
        400,
        'Unknown job type "img.gen". Call list_job_types for the current list.',
      );
    });
    const types = vi.fn(async () => LIVE_TYPES);
    const err = await tool("submit_job")
      .execute({ type: "img.gen", inputs: {} }, ctx({ jobs: { create, types } }), {} as never)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    const apiError = err as ApiError;
    expect(apiError.code).toBe("INVALID_JOB_TYPE");
    expect(apiError.statusCode).toBe(400);
    expect(apiError.message).toBe(
      'Unknown job type "img.gen". Call list_job_types for the current list. ' +
        "Live types right now: ffmpeg, image.generate.",
    );
  });

  it("names the discovery tool even when the registry read also fails", async () => {
    const create = vi.fn(async () => {
      // An API message that does not mention the discovery tool itself: the
      // rejection must still tell the agent where to look.
      throw new ApiError("INVALID_JOB_TYPE", 400, 'Unknown job type "img.gen".');
    });
    const types = vi.fn(async () => {
      throw new Error("network down");
    });
    const err = await tool("submit_job")
      .execute({ type: "img.gen", inputs: {} }, ctx({ jobs: { create, types } }), {} as never)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("INVALID_JOB_TYPE");
    expect((err as ApiError).message).toBe(
      'Unknown job type "img.gen". Call list_job_types for the current list.',
    );
  });

  it("leaves every other API error untouched", async () => {
    const create = vi.fn(async () => {
      throw new ApiError("INSUFFICIENT_CREDITS", 402, "Not enough credits");
    });
    const types = vi.fn();
    const err = await tool("submit_job")
      .execute({ type: "ffmpeg", inputs: {} }, ctx({ jobs: { create, types } }), {} as never)
      .catch((e: unknown) => e);

    expect((err as ApiError).code).toBe("INSUFFICIENT_CREDITS");
    expect((err as ApiError).message).toBe("Not enough credits");
    expect(types).not.toHaveBeenCalled();
  });
});
