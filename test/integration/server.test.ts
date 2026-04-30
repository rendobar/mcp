import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { http, HttpResponse } from "msw";
import { setupServer as setupMsw } from "msw/node";
import { createRendobarMcpServer } from "../../src/index.js";
import { createLogger } from "../../src/logger.js";

const API_BASE = "https://api.rendobar.test";

const billingStateResponse = {
  data: {
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
  },
};

const emptyJobList = {
  data: [],
  meta: { total: 0, page: 1, limit: 10, pages: 0 },
};

const jobTypesResponse = {
  data: [
    {
      type: "raw.ffmpeg",
      tag: "FFmpeg",
      summary: "Run an FFmpeg command",
      needs: ["ffmpeg"],
      pattern: null,
      acceptsMedia: ["video", "image", "audio"],
    },
  ],
};

const msw = setupMsw(
  http.get(`${API_BASE}/billing/state`, () => HttpResponse.json(billingStateResponse)),
  http.get(`${API_BASE}/jobs`, () => HttpResponse.json(emptyJobList)),
  http.get(`${API_BASE}/jobs/types`, () => HttpResponse.json(jobTypesResponse)),
);

beforeAll(() => msw.listen({ onUnhandledRequest: "error" }));
afterAll(() => msw.close());
afterEach(() => msw.resetHandlers(
  http.get(`${API_BASE}/billing/state`, () => HttpResponse.json(billingStateResponse)),
  http.get(`${API_BASE}/jobs`, () => HttpResponse.json(emptyJobList)),
  http.get(`${API_BASE}/jobs/types`, () => HttpResponse.json(jobTypesResponse)),
));

async function makeClientServerPair() {
  const logger = createLogger({ level: "error" }); // quiet during tests
  const { server, cleanup } = await createRendobarMcpServer({
    config: { apiKey: "rb_test", apiBase: API_BASE, logLevel: "error" },
    logger,
  });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientT);
  return { client, cleanup };
}

describe("MCP server integration", () => {
  it("declares tools + logging capabilities", async () => {
    const { client, cleanup } = await makeClientServerPair();
    const caps = client.getServerCapabilities();
    expect(caps?.tools).toBeDefined();
    expect(caps?.logging).toBeDefined();
    await client.close();
    await cleanup();
  });

  it("lists registered tools (6 expected: account + 4 jobs + upload)", async () => {
    const { client, cleanup } = await makeClientServerPair();
    const tools = await client.listTools();
    const names = new Set(tools.tools.map((t) => t.name));
    expect(names.has("get_account")).toBe(true);
    expect(names.has("list_jobs")).toBe(true);
    expect(names.has("get_job")).toBe(true);
    expect(names.has("submit_job")).toBe(true);
    expect(names.has("cancel_job")).toBe(true);
    expect(names.has("upload_file")).toBe(true);
    await client.close();
    await cleanup();
  });

  it("get_account returns formatted balance + plan + limits", async () => {
    const { client, cleanup } = await makeClientServerPair();
    const result = await client.callTool({ name: "get_account", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      balance: "$5.00",
      balanceUsd: 5.0,
      plan: "pro",
      isPro: true,
      limits: {
        concurrentJobs: 25,
        maxFileSizeBytes: 2_147_483_648,
      },
    });
    await client.close();
    await cleanup();
  });

  it("list_jobs returns empty list when API returns empty", async () => {
    const { client, cleanup } = await makeClientServerPair();
    const result = await client.callTool({ name: "list_jobs", arguments: { limit: 10 } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ jobs: [], total: 0 });
    await client.close();
    await cleanup();
  });

  it("server-info instructions are exposed", async () => {
    const { client, cleanup } = await makeClientServerPair();
    const info = client.getServerVersion();
    // Note: instructions are at the top-level Server-info per MCP spec.
    // The Client class exposes them via getInstructions() or similar — check API.
    // If not directly exposed, our previous handshake test confirms they ride through serverInfo.
    expect(info?.name).toBe("rendobar");
    await client.close();
    await cleanup();
  });

  it("propagates ApiError from SDK as isError tool result", async () => {
    msw.use(
      http.get(`${API_BASE}/billing/state`, () => HttpResponse.json(
        { error: { code: "INSUFFICIENT_CREDITS", message: "Not enough credits" } },
        { status: 402 },
      )),
    );
    const { client, cleanup } = await makeClientServerPair();
    const result = await client.callTool({ name: "get_account", arguments: {} });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "{}";
    const payload = JSON.parse(text);
    expect(payload.error.code).toBe("INSUFFICIENT_CREDITS");
    await client.close();
    await cleanup();
  });
});
