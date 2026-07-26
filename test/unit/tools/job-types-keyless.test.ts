/**
 * jobToolsAsync reads the live job registry even with no API key.
 *
 * GET /jobs/types is public (rendobar/rendobar#426). Before that, a keyless boot
 * could not reach the registry, so this file used to ship a hardcoded
 * FEATURED_JOB_TYPES list and directory indexers that launch the server just to
 * read tools/list advertised three stale types. These tests pin the replacement
 * behaviour so the fallback cannot quietly come back.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer as setupMsw } from "msw/node";
import { jobToolsAsync } from "../../../src/tools/jobs.js";

const API_BASE = "https://api.rendobar.com";

const LIVE_TYPES = [
  { type: "compose", tag: "Compose", summary: "Render a video from a JSON timeline", acceptsMedia: ["video"] },
  { type: "ffprobe", tag: "FFmpeg", summary: "Run a raw ffprobe command", acceptsMedia: ["video"] },
];

const msw = setupMsw();
beforeAll(() => msw.listen({ onUnhandledRequest: "error" }));
afterEach(() => msw.resetHandlers());
afterAll(() => msw.close());

/** submit_job's description carries the type list the LLM actually reads. */
const submitJobDescription = (tools: readonly { name: string; description: string }[]) => {
  const t = tools.find((x) => x.name === "submit_job");
  if (!t) throw new Error("submit_job not registered");
  return t.description;
};

describe("jobToolsAsync with no API key", () => {
  it("fetches the public registry and lists the live types", async () => {
    msw.use(http.get(`${API_BASE}/jobs/types`, () => HttpResponse.json({ data: LIVE_TYPES })));

    const tools = await jobToolsAsync(null, API_BASE);
    const description = submitJobDescription(tools);

    expect(description).toContain("compose");
    expect(description).toContain("Render a video from a JSON timeline");
    expect(description).toContain("ffprobe");
  });

  it("sends no Authorization header", async () => {
    let seenAuth: string | null = "unset";
    msw.use(
      http.get(`${API_BASE}/jobs/types`, ({ request }) => {
        seenAuth = request.headers.get("Authorization");
        return HttpResponse.json({ data: LIVE_TYPES });
      }),
    );

    await jobToolsAsync(null, API_BASE);
    expect(seenAuth).toBeNull();
  });

  it("does not advertise a hardcoded list when the registry is unreachable", async () => {
    msw.use(http.get(`${API_BASE}/jobs/types`, () => HttpResponse.error()));

    const description = submitJobDescription(await jobToolsAsync(null, API_BASE));

    // The old fallback shipped these three. An outage must not resurrect them.
    expect(description).not.toContain("captions.animate");
    expect(description).not.toContain("Active job types:");
    expect(description).toContain("list_job_types");
  });

  it("still registers every tool when the registry is unreachable", async () => {
    msw.use(http.get(`${API_BASE}/jobs/types`, () => HttpResponse.error()));

    const names = (await jobToolsAsync(null, API_BASE)).map((t) => t.name).sort();
    expect(names).toEqual(["cancel_job", "get_job", "list_job_types", "list_jobs", "submit_job"]);
  });

  it("survives a malformed registry response", async () => {
    msw.use(
      http.get(`${API_BASE}/jobs/types`, () => HttpResponse.json({ data: [{ nope: true }] })),
    );

    const description = submitJobDescription(await jobToolsAsync(null, API_BASE));
    expect(description).toContain("list_job_types");
  });
});

describe("jobToolsAsync with an API key", () => {
  it("uses the SDK and never touches the public endpoint", async () => {
    // onUnhandledRequest: "error" means an unexpected fetch fails this test.
    const sdk = { jobs: { types: async () => LIVE_TYPES } };

    const description = submitJobDescription(await jobToolsAsync(sdk, API_BASE));
    expect(description).toContain("compose");
  });
});
