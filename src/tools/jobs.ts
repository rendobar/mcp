import { z } from "zod";
import { defineTool } from "./util.js";

const listJobsTool = defineTool({
  name: "list_jobs",
  title: "List Recent Rendobar Jobs",
  description:
    "List recent jobs. Use to find previous results, check what's running, or re-reference past outputs.",
  inputSchema: {
    status: z
      .enum(["waiting", "dispatched", "running", "complete", "failed", "cancelled"])
      .optional()
      .describe("Filter by status"),
    type: z.string().optional().describe("Filter by job type (e.g. 'raw.ffmpeg')"),
    limit: z.number().int().min(1).max(50).default(10).describe("Number of jobs to return"),
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  execute: async (args, ctx) => {
    const page = await ctx.sdk.jobs.list({
      status: args.status,
      type: args.type,
      limit: args.limit,
    });
    return {
      jobs: page.data.map((j) => {
        const entry: Record<string, unknown> = {
          id: j.id,
          type: j.type,
          status: j.status,
          createdAt: new Date(j.createdAt).toISOString(),
          cost: j.priceFormatted,
        };
        if (j.status === "complete" && j.outputUrl !== null) {
          entry.outputUrl = j.outputUrl;
        }
        return entry;
      }),
      total: page.meta.total,
    };
  },
});

// Return type is inferred so each tool keeps its precise input/output shape.
// `registerToolDef` is generic per-tool, so callers can iterate heterogeneous tools
// via `for...of` without a uniform array element type.
export function jobTools() {
  return [listJobsTool] as const;
  // Tasks 19-21 will add get_job, submit_job, cancel_job here.
}
