import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { http, HttpResponse, delay } from "msw";
import { setupServer as setupMsw } from "msw/node";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRendobarMcpServer } from "../../src/index.js";
import { createLogger } from "../../src/logger.js";

const API_BASE = "https://api.rendobar.test";

describe("cancellation", () => {
  let tmp: string;
  let file: string;
  let msw: ReturnType<typeof setupMsw>;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(tmpdir(), "rendobar-mcp-cancel-"));
    file = path.join(tmp, "f.bin");
    await fs.writeFile(file, Buffer.alloc(1024 * 1024)); // 1 MB

    msw = setupMsw(
      http.get(`${API_BASE}/jobs/types`, () => HttpResponse.json({ data: [] })),
      http.get(`${API_BASE}/billing/state`, () =>
        HttpResponse.json({
          data: {
            balance: { amount: 5 },
            plan: {
              slug: "pro",
              name: "Pro",
              price: 9,
              limits: {
                concurrentJobs: 25,
                apiRequestsPerMinute: 300,
                maxJobTimeout: 900_000,
                maxInputFileSize: 999_999_999,
                maxBatchSize: 100,
              },
            },
            subscription: null,
            usage: { currentPeriodSpend: 0, jobCount: 0 },
            isPro: true,
            creditBonusRate: 0.2,
            upgradePlan: null,
          },
        }),
      ),
      http.post(`${API_BASE}/uploads`, async () => {
        await delay(5000);
        return HttpResponse.json({ data: { downloadUrl: "https://x" } }, { status: 201 });
      }),
    );
    msw.listen({ onUnhandledRequest: "error" });
  });

  afterAll(async () => {
    msw.close();
    // Give Windows a moment to release any lingering file handles before removing the
    // tmp dir. Without retries, ENOTEMPTY surfaces on Windows-Server runners even after
    // the upload tool destroys the read stream on abort.
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it("aborting a callTool aborts the SDK upload", async () => {
    const logger = createLogger({ level: "error" });
    const { server } = await createRendobarMcpServer({
      config: { apiKey: "rb_test", apiBase: API_BASE, logLevel: "error" },
      logger,
    });
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientT);

    const ac = new AbortController();
    setTimeout(() => ac.abort(), 100);

    const callPromise = client.callTool(
      { name: "upload_file", arguments: { path: file } },
      undefined,
      { signal: ac.signal },
    );

    await expect(callPromise).rejects.toBeDefined();

    await client.close();
  }, 10_000);
});
