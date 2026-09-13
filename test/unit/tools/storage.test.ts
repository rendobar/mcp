import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "@rendobar/sdk";
import { withErrorMapping } from "../../../src/errors.js";
import { storageTools, withStorageScopeHint } from "../../../src/tools/storage.js";
import { ctx, NO_EXTRA, pickTool } from "./helpers.js";

const tool = (name: string) => pickTool(storageTools(), name);
const noScope = () => new ApiError("INSUFFICIENT_SCOPE", 403, "This endpoint requires the storage:read scope.");

const CONNECTIONS = [
  { id: "prod-media", provider: "s3", bucket: "acme-prod-media", region: "eu-west-1", endpoint: "https://s3.eu-west-1.amazonaws.com", pathStyle: false, defaultDestination: true, createdAt: 1, updatedAt: 2 },
  { id: "raw-archive", provider: "r2", bucket: "raw", region: "auto", endpoint: "https://acct.r2.cloudflarestorage.com", pathStyle: true, access: "read", createdAt: 1, updatedAt: 2 },
  { id: "new-aws", provider: "s3", bucket: "incoming", region: "us-east-1", endpoint: "https://s3.us-east-1.amazonaws.com", pathStyle: false, pending: true, createdAt: 1, updatedAt: 2 },
];

const listing = (data: unknown[]) => ({ storage: { list: vi.fn(async () => ({ data, meta: { total: data.length } })) } });

describe("list_storage", () => {
  it("returns each connection's id, provider, bucket and what it can be used for", async () => {
    const out = await tool("list_storage").execute({}, ctx(listing(CONNECTIONS)), NO_EXTRA);
    expect(out).toEqual({
      storage: [
        { id: "prod-media", provider: "s3", bucket: "acme-prod-media", access: "deliver", defaultDestination: true, pending: false },
        { id: "raw-archive", provider: "r2", bucket: "raw", access: "read", defaultDestination: false, pending: false },
        { id: "new-aws", provider: "s3", bucket: "incoming", access: "deliver", defaultDestination: false, pending: true },
      ],
      note: expect.stringContaining("storage://<id>/<path>"),
    });
  });

  it("does not hand the agent endpoints or regions it has no use for", async () => {
    const text = JSON.stringify(await tool("list_storage").execute({}, ctx(listing(CONNECTIONS)), NO_EXTRA));
    expect(text).not.toContain("amazonaws.com");
    expect(text).not.toContain("eu-west-1");
  });

  it("says where to connect a bucket when there are none", async () => {
    const out = await tool("list_storage").execute({}, ctx(listing([])), NO_EXTRA);
    expect(out).toEqual({ storage: [], note: expect.stringContaining("https://app.rendobar.com/storage") });
  });

  it("turns a key without storage access into the step that fixes it", async () => {
    const sdk = { storage: { list: vi.fn(async () => { throw noScope(); }) } };
    await expect(tool("list_storage").execute({}, ctx(sdk), NO_EXTRA)).rejects.toMatchObject({
      code: "INSUFFICIENT_SCOPE",
      message: expect.stringContaining("new API key"),
    });
  });

  it("keeps a connection the API sent with explicit false/deliver defaults", async () => {
    const explicit = [
      { id: "explicit-defaults", provider: "s3", bucket: "explicit", access: "deliver", pending: false, defaultDestination: false, createdAt: 1, updatedAt: 2 },
    ];
    const out = await tool("list_storage").execute({}, ctx(listing(explicit)), NO_EXTRA);
    expect(out).toEqual({
      storage: [
        { id: "explicit-defaults", provider: "s3", bucket: "explicit", access: "deliver", pending: false, defaultDestination: false },
      ],
      note: expect.stringContaining("storage://<id>/<path>"),
    });
  });

  it("keeps valid connections and drops only the malformed one when the list mixes both", async () => {
    const mixed = [
      { id: "good", provider: "s3", bucket: "good-bucket", createdAt: 1, updatedAt: 2 },
      // Missing bucket: fails connectionSchema and must not sink the whole page.
      { id: "bad", provider: "s3", createdAt: 1, updatedAt: 2 },
    ];
    const out = await tool("list_storage").execute({}, ctx(listing(mixed)), NO_EXTRA);
    expect(out).toEqual({
      storage: [
        { id: "good", provider: "s3", bucket: "good-bucket", access: "deliver", defaultDestination: false, pending: false },
      ],
      note: expect.stringContaining("storage://<id>/<path>"),
    });
  });
});

describe("list_storage_files", () => {
  const objects = (page: unknown) => ({ storage: { listObjects: vi.fn(async () => page) } });
  const page = {
    folders: ["raw/2026/"],
    objects: [
      { key: "raw/clip.mp4", size: 18_400_000, lastModified: 1_757_000_000_000 },
      { key: "raw/notes.txt", size: 800, lastModified: null },
    ],
    cursor: "tok",
  };

  it("lists one level under a folder and gives every entry its storage URI", async () => {
    const sdk = objects(page);
    const out = await tool("list_storage_files").execute({ storageId: "prod-media", prefix: "raw/" }, ctx(sdk), NO_EXTRA);
    // Omitted limit sends the 100-entry default page size, not the API's own
    // 1000-entry default: a full page costs ~55K tokens, and the cursor still
    // reaches every file at 100.
    expect(sdk.storage.listObjects).toHaveBeenCalledWith("prod-media", { prefix: "raw/", cursor: undefined, limit: 100 });
    expect(out).toEqual({
      folders: [{ prefix: "raw/2026/", uri: "storage://prod-media/raw/2026/" }],
      files: [
        { key: "raw/clip.mp4", size: 18_400_000, lastModified: new Date(1_757_000_000_000).toISOString(), uri: "storage://prod-media/raw/clip.mp4" },
        { key: "raw/notes.txt", size: 800, lastModified: null, uri: "storage://prod-media/raw/notes.txt" },
      ],
      cursor: "tok",
    });
  });

  it("escapes %, ? and # in a key's uri but leaves the key field and a plain key's uri alone", async () => {
    const sdk = objects({
      folders: [],
      objects: [
        { key: "a%b?c#d.mp4", size: 10, lastModified: null },
        { key: "raw/clip.mp4", size: 20, lastModified: null },
      ],
      cursor: null,
    });
    const out = await tool("list_storage_files").execute({ storageId: "prod-media" }, ctx(sdk), NO_EXTRA);
    expect(out).toEqual({
      folders: [],
      files: [
        { key: "a%b?c#d.mp4", size: 10, lastModified: null, uri: "storage://prod-media/a%25b%3Fc%23d.mp4" },
        { key: "raw/clip.mp4", size: 20, lastModified: null, uri: "storage://prod-media/raw/clip.mp4" },
      ],
      cursor: null,
    });
  });

  it("passes the cursor and limit through for the next page", async () => {
    const sdk = objects({ folders: [], objects: [], cursor: null });
    await tool("list_storage_files").execute({ storageId: "prod-media", cursor: "tok", limit: 50 }, ctx(sdk), NO_EXTRA);
    expect(sdk.storage.listObjects).toHaveBeenCalledWith("prod-media", { prefix: undefined, cursor: "tok", limit: 50 });
  });

  it("adds the scope hint when the key cannot read storage", async () => {
    const sdk = { storage: { listObjects: vi.fn(async () => { throw noScope(); }) } };
    await expect(tool("list_storage_files").execute({ storageId: "prod-media" }, ctx(sdk), NO_EXTRA)).rejects.toMatchObject({
      message: expect.stringContaining("new API key"),
    });
  });

  it("rejects a limit above the API's own page-size cap", () => {
    const limit = tool("list_storage_files").inputSchema.limit;
    if (!(limit instanceof z.ZodType)) throw new Error("limit schema missing");
    expect(limit.safeParse(1001).success).toBe(false);
    expect(limit.safeParse(1000).success).toBe(true);
  });

  it("passes a non-scope error through unchanged and surfaces it as isError with the original message", async () => {
    const notFound = new ApiError("NOT_FOUND", 404, 'Storage "unknown" not found.');
    expect(withStorageScopeHint(notFound)).toBe(notFound);

    const sdk = { storage: { listObjects: vi.fn(async () => { throw notFound; }) } };
    const wrapped = withErrorMapping(ctx(sdk), "list_storage_files", () =>
      tool("list_storage_files").execute({ storageId: "unknown" }, ctx(sdk), NO_EXTRA),
    );
    const result = await wrapped();
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "{}";
    expect(JSON.parse(text)).toMatchObject({
      error: { code: "NOT_FOUND", message: 'Storage "unknown" not found.' },
    });
  });
});
