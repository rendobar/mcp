import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@rendobar/sdk";
import { storageTools } from "../../../src/tools/storage.js";
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
});
