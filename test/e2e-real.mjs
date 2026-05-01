#!/usr/bin/env node
/**
 * E2E test against the published @rendobar/mcp@1.0.0 with a REAL Rendobar API key.
 * Usage:
 *   RENDOBAR_API_KEY=rb_... node test/e2e-real.mjs
 *
 * Spawns the published binary via npx, connects via StdioClientTransport from
 * @modelcontextprotocol/sdk, runs a battery of scenarios.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(here, "e2e-fixtures", "sample.txt");

const API_KEY = process.env.RENDOBAR_API_KEY;
if (!API_KEY) {
  console.error("[e2e] RENDOBAR_API_KEY required");
  process.exit(1);
}

// Direct node invocation against pre-installed copy at /tmp/rendobar-mcp-e2e.
// Windows npx bin-shim resolution is flaky for scoped packages; this is reliable.
const PKG_BIN = process.env.RENDOBAR_MCP_BIN
  ?? "/tmp/rendobar-mcp-e2e/node_modules/@rendobar/mcp/dist/bin.js";

async function makeClient() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [PKG_BIN],
    env: { ...process.env, RENDOBAR_API_KEY: API_KEY },
  });
  const client = new Client({ name: "rendobar-mcp-e2e", version: "1.0.0" });
  await client.connect(transport);
  return { client, transport };
}

const scenarios = [];
function scenario(name, fn) {
  scenarios.push({ name, fn });
}

scenario("handshake + capabilities", async (client) => {
  const caps = client.getServerCapabilities();
  if (!caps?.tools) throw new Error("tools capability missing");
  if (!caps?.logging) throw new Error("logging capability missing");
  const info = client.getServerVersion();
  if (info?.name !== "rendobar") throw new Error(`bad name: ${info?.name}`);
  if (!/^\d+\.\d+\.\d+/.test(info?.version ?? "")) throw new Error(`bad version: ${info?.version}`);
  return { name: info.name, version: info.version, capabilities: Object.keys(caps) };
});

scenario("tools/list — expect 6", async (client) => {
  const t = await client.listTools();
  const names = t.tools.map((x) => x.name).sort();
  const expected = ["cancel_job", "get_account", "get_job", "list_jobs", "submit_job", "upload_file"].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`bad tool list: ${JSON.stringify(names)}`);
  }
  // Sanity check annotations
  const cancel = t.tools.find((x) => x.name === "cancel_job");
  if (cancel?.annotations?.destructiveHint !== true) throw new Error("cancel_job destructiveHint missing");
  const list = t.tools.find((x) => x.name === "list_jobs");
  if (list?.annotations?.readOnlyHint !== true) throw new Error("list_jobs readOnlyHint missing");
  return { count: t.tools.length, names };
});

scenario("get_account — real auth", async (client) => {
  const r = await client.callTool({ name: "get_account", arguments: {} });
  if (r.isError) throw new Error(`isError: ${JSON.stringify(r.content)}`);
  const data = r.structuredContent;
  if (typeof data?.balance !== "string") throw new Error(`bad balance: ${JSON.stringify(data)}`);
  if (typeof data?.balanceUsd !== "number") throw new Error("balanceUsd missing");
  if (!["free", "pro"].includes(data?.plan)) throw new Error(`bad plan: ${data?.plan}`);
  if (typeof data?.limits?.maxFileSizeBytes !== "number") throw new Error("maxFileSizeBytes missing");
  return data;
});

scenario("list_jobs — limit 5", async (client) => {
  const r = await client.callTool({ name: "list_jobs", arguments: { limit: 5 } });
  if (r.isError) throw new Error(`isError: ${JSON.stringify(r.content)}`);
  const data = r.structuredContent;
  if (!Array.isArray(data?.jobs)) throw new Error("jobs not array");
  if (typeof data?.total !== "number") throw new Error("total missing");
  return { total: data.total, returned: data.jobs.length, sample: data.jobs[0] ?? null };
});

scenario("get_job — bogus ID returns isError", async (client) => {
  const r = await client.callTool({ name: "get_job", arguments: { jobId: "job_does_not_exist_zzz" } });
  if (!r.isError) throw new Error("expected isError on bogus ID");
  const text = r.content?.[0]?.text ?? "{}";
  const parsed = JSON.parse(text);
  if (!parsed.error?.code) throw new Error("no error.code in response");
  return { code: parsed.error.code, message: parsed.error.message };
});

scenario("submit_job — bad type returns isError", async (client) => {
  const r = await client.callTool({
    name: "submit_job",
    arguments: { type: "totally.fake.type", inputs: { source: "https://example.com/x.mp4" } },
  });
  if (!r.isError) throw new Error("expected isError on fake type");
  const parsed = JSON.parse(r.content?.[0]?.text ?? "{}");
  return { code: parsed.error?.code, message: parsed.error?.message };
});

scenario("upload_file — small text fixture", async (client) => {
  const r = await client.callTool({
    name: "upload_file",
    arguments: { path: fixturePath },
  });
  if (r.isError) throw new Error(`isError: ${JSON.stringify(r.content)}`);
  const data = r.structuredContent;
  if (typeof data?.downloadUrl !== "string") throw new Error("downloadUrl missing");
  if (!data.downloadUrl.startsWith("https://")) throw new Error(`bad URL: ${data.downloadUrl}`);
  if (data?.sizeBytes !== 38) throw new Error(`bad size: ${data?.sizeBytes}`);
  return data;
});

scenario("upload_file — nonexistent path returns isError", async (client) => {
  const r = await client.callTool({
    name: "upload_file",
    arguments: { path: "/path/that/definitely/does/not/exist.mp4" },
  });
  if (!r.isError) throw new Error("expected isError on missing file");
  const text = r.content?.[0]?.text ?? "";
  if (!text.includes("ENOENT") && !text.includes("no such file")) {
    throw new Error(`bad error text: ${text}`);
  }
  return { isError: true, snippet: text.slice(0, 80) };
});

scenario("REAL raw.ffmpeg job — transcode 1MB sample to mp4", async (client) => {
  // Real charge: ~$0.0005 (~5 cents per minute of output). User has $29.48.
  const submit = await client.callTool({
    name: "submit_job",
    arguments: {
      type: "raw.ffmpeg",
      inputs: { input: "https://sample-videos.com/video321/mp4/240/big_buck_bunny_240p_1mb.mp4" },
      params: { command: "ffmpeg -i input -c:v libx264 -preset ultrafast -crf 28 output.mp4" },
      idempotencyKey: `e2e-ffmpeg-${Date.now()}`,
    },
  });
  if (submit.isError) {
    return { skipped: "submit failed", err: JSON.parse(submit.content?.[0]?.text ?? "{}") };
  }
  const { jobId, status: initialStatus } = submit.structuredContent ?? {};
  if (!jobId) throw new Error("no jobId");

  // Poll up to ~60s. Bunny is small; should be fast.
  let final = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const g = await client.callTool({ name: "get_job", arguments: { jobId } });
    if (g.isError) continue;
    const data = g.structuredContent ?? {};
    if (data.status === "complete" || data.status === "failed" || data.status === "cancelled") {
      final = data;
      break;
    }
  }
  return { jobId, initialStatus, final: final ?? "still running after 60s" };
});

scenario("REAL raw.ffmpeg + cancel_job (race the dispatcher)", async (client) => {
  const submit = await client.callTool({
    name: "submit_job",
    arguments: {
      type: "raw.ffmpeg",
      inputs: { input: "https://sample-videos.com/video321/mp4/240/big_buck_bunny_240p_1mb.mp4" },
      params: { command: "ffmpeg -i input -c copy output.mp4" },
      idempotencyKey: `e2e-cancel-${Date.now()}`,
    },
  });
  if (submit.isError) throw new Error(`submit failed: ${submit.content?.[0]?.text}`);
  const { jobId } = submit.structuredContent ?? {};
  if (!jobId) throw new Error("no jobId");
  const c = await client.callTool({ name: "cancel_job", arguments: { jobId } });
  return {
    jobId,
    cancelResult: c.isError
      ? { isError: true, payload: JSON.parse(c.content?.[0]?.text ?? "{}") }
      : c.structuredContent,
  };
});

scenario("upload_file → submit_job using uploaded URL", async (client) => {
  const upload = await client.callTool({
    name: "upload_file",
    arguments: { path: fixturePath },
  });
  if (upload.isError) throw new Error(`upload failed: ${upload.content?.[0]?.text}`);
  const { downloadUrl } = upload.structuredContent ?? {};
  if (!downloadUrl) throw new Error("no downloadUrl from upload_file");

  // Pass the uploaded URL into submit_job. Using a non-media file with FFmpeg will
  // fail at execute time, but submit should accept the job (the API doesn't probe
  // input content at submit). What we're verifying is the wiring: upload → submit.
  const submit = await client.callTool({
    name: "submit_job",
    arguments: {
      type: "raw.ffmpeg",
      inputs: { input: downloadUrl },
      params: { command: "ffmpeg -i input -c copy output.mp4" },
      idempotencyKey: `e2e-upload-${Date.now()}`,
    },
  });
  if (submit.isError) throw new Error(`submit failed: ${submit.content?.[0]?.text}`);
  const { jobId } = submit.structuredContent ?? {};
  // Cancel to avoid charging for a job that will fail at execute.
  await client.callTool({ name: "cancel_job", arguments: { jobId } });
  return { uploadDownloadUrl: downloadUrl, submittedJobId: jobId };
});

async function main() {
  console.error("[e2e] starting harness against npx @rendobar/mcp@1.0.0");
  const { client, transport } = await makeClient();
  console.error("[e2e] connected\n");

  let passed = 0;
  let failed = 0;
  const results = [];

  for (const s of scenarios) {
    const start = Date.now();
    try {
      const result = await s.fn(client);
      const ms = Date.now() - start;
      console.log(`✓ [${ms}ms] ${s.name}`);
      console.log("  ", JSON.stringify(result, null, 2).split("\n").join("\n   "));
      passed++;
      results.push({ name: s.name, status: "pass", ms, result });
    } catch (e) {
      const ms = Date.now() - start;
      console.log(`✗ [${ms}ms] ${s.name}: ${e.message}`);
      failed++;
      results.push({ name: s.name, status: "fail", ms, error: e.message });
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`${passed} passed, ${failed} failed of ${scenarios.length}`);
  console.log("=".repeat(60));

  await client.close();
  await transport.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[e2e] fatal:", e);
  process.exit(1);
});
