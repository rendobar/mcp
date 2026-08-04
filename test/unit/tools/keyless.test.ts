// What a user sees before they have configured a key.
//
// `list_job_types` answers without one, because GET /jobs/types is public and
// "what can this do" is the first thing both a new user and a directory
// reviewer ask. Answering that with an auth wall made the server look inert.
//
// The second block is the one that matters. Widening the keyless surface is a
// one-word mistake (`getPublicSdk` where `getSdk` belonged) that no type check
// catches and that leaks org-scoped or billable calls to an anonymous client.
// Every other tool is pinned here so that mistake fails a test instead.

import { describe, it, expect, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { jobTools } from "../../../src/tools/jobs.js";
import { accountTools } from "../../../src/tools/account.js";
import { uploadTools } from "../../../src/tools/uploads.js";
import { ConfigError } from "../../../src/config.js";
import type { RendobarContext } from "../../../src/context.js";

const JOB_TYPES = [
  { type: "ffmpeg", tag: "FFmpeg", summary: "Run any FFmpeg command", acceptsMedia: ["video", "audio", "image"] },
  { type: "image.generate", tag: "Generate", summary: "Create an image from a prompt", acceptsMedia: [] },
];

// getPublicSdk builds its own client rather than taking one off the context, so
// the only seam is the SDK factory itself.
const { typesMock } = vi.hoisted(() => ({ typesMock: vi.fn() }));

vi.mock("@rendobar/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@rendobar/sdk")>()),
  createClient: vi.fn(() => ({ jobs: { types: typesMock } })),
}));

const fakeLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  restoreConsole: vi.fn(),
});

/** A server booted with no key from any source: no flag, no env, no creds file. */
const keylessCtx = (): RendobarContext => ({
  logger: fakeLogger(),
  sdk: null,
  config: { apiKey: null, apiBase: "https://api.rendobar.com", logLevel: "info" as const },
  cachedMaxFileSize: null,
});

// `extra` is the MCP request handler context. No tool under test reads it, and
// the existing tool tests pass the same placeholder.
const NO_EXTRA = {} as never;

const allTools = [...jobTools(), ...accountTools(), ...uploadTools()];
const toolNamed = (name: string) => {
  const t = allTools.find((x) => x.name === name);
  if (!t) throw new Error(`no tool named ${name}`);
  return t;
};

describe("without an API key", () => {
  it("list_job_types still answers", async () => {
    typesMock.mockResolvedValueOnce(JOB_TYPES);

    const result = await toolNamed("list_job_types").execute({}, keylessCtx(), NO_EXTRA);

    expect(result).toMatchObject({
      jobTypes: [{ type: "ffmpeg" }, { type: "image.generate" }],
      guidance: expect.stringContaining("submit_job"),
    });
  });

  it("prefers the authed client when the server does have a key", async () => {
    const authed = vi.fn().mockResolvedValue(JOB_TYPES);
    const ctx = { ...keylessCtx(), sdk: { jobs: { types: authed } } as never };

    await toolNamed("list_job_types").execute({}, ctx, NO_EXTRA);

    // A configured user's request must carry their key: rate limits and usage
    // analytics are per-org, and an anonymous call would not be attributed.
    expect(authed).toHaveBeenCalledTimes(1);
  });

  // Minimal arguments, only enough to reach the credential check rather than
  // trip input validation first.
  const OTHERS: ReadonlyArray<[string, unknown]> = [
    ["submit_job", { type: "ffmpeg", inputs: {}, params: {} }],
    ["get_job", { jobId: "job_1" }],
    ["list_jobs", {}],
    ["cancel_job", { jobId: "job_1" }],
    ["get_account", {}],
  ];

  it.each(OTHERS)("%s still requires one", async (name, args) => {
    await expect(toolNamed(name).execute(args as never, keylessCtx(), NO_EXTRA)).rejects.toThrow(ConfigError);
  });

  // Needs a real file: upload_file opens and stats the path before it ever asks
  // for a client, so a made-up path fails on the filesystem and never reaches the
  // check this test is about.
  it("upload_file still requires one", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "rendobar-keyless-"));
    const file = path.join(dir, "clip.mp4");
    await fs.writeFile(file, "not really a video");

    try {
      await expect(
        toolNamed("upload_file").execute({ path: file } as never, keylessCtx(), NO_EXTRA),
      ).rejects.toThrow(ConfigError);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("every tool is accounted for, so a new one cannot skip this check", () => {
    const exercised = new Set(["list_job_types", ...OTHERS.map(([n]) => n), "upload_file"]);
    expect(allTools.map((t) => t.name).filter((n) => !exercised.has(n))).toEqual([]);
  });

  it("the error names a route the reader can actually take", async () => {
    const call = () => toolNamed("get_account").execute({}, keylessCtx(), NO_EXTRA);

    // The old copy offered only a CLI flag, an env var and a creds file, none of
    // which a Claude Desktop user can reach.
    await expect(call()).rejects.toThrow(/extension/);
    await expect(call()).rejects.toThrow(/RENDOBAR_API_KEY/);
    await expect(call()).rejects.toThrow(/\$5/);
  });
});
