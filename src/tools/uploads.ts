import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { defineTool, type ToolDef, type ToolExtra } from "./util.js";
import { resolveSafe } from "../paths.js";
import type { ZodRawShape } from "zod";
import type { RendobarContext } from "../context.js";

async function ensureCachedMaxFileSize(ctx: RendobarContext): Promise<number> {
  if (ctx.cachedMaxFileSize !== null) return ctx.cachedMaxFileSize;
  const state = await ctx.sdk.billing.state();
  ctx.cachedMaxFileSize = state.plan.limits.maxInputFileSize;
  return ctx.cachedMaxFileSize;
}

const uploadFileTool = defineTool({
  name: "upload_file",
  title: "Upload Local File to Rendobar",
  description:
    "Read a local file and upload it to Rendobar. Returns a downloadUrl to use as input in submit_job. If the file is already at a public HTTPS URL, skip this and pass the URL directly to submit_job.",
  inputSchema: {
    path: z.string().describe("Absolute or working-dir-relative path to the file"),
    filename: z
      .string()
      .optional()
      .describe("Filename hint sent to Rendobar (defaults to basename of path)"),
  },
  outputSchema: {
    downloadUrl: z.string().url(),
    sizeBytes: z.number(),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  execute: async (args, ctx, extra) => {
    // 1. Resolve path safely.
    const resolved = await resolveSafe(args.path, { cwd: process.cwd() });

    // 2. Stat — must be a regular file with size we can check.
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      throw new Error(`Path is not a regular file: ${path.basename(resolved)}`);
    }
    const sizeBytes = stat.size;

    // 3. Pre-stream size gate. Lazily fetch the limit if cold.
    const maxFileSize = await ensureCachedMaxFileSize(ctx);
    if (sizeBytes > maxFileSize) {
      throw new Error(
        `File size (${sizeBytes} bytes) exceeds plan limit (${maxFileSize} bytes). ` +
          `Upgrade your plan for larger uploads.`,
      );
    }

    ctx.logger.debug({ msg: "upload_start", basename: path.basename(resolved), sizeBytes });

    // 4. Read into memory and upload as a Blob.
    //
    // Streaming via Readable.toWeb(...) hit "RequestInit: duplex option is required
    // when sending a body" because Node's fetch requires duplex:'half' for stream
    // bodies and the SDK request layer doesn't set it. Buffering avoids that
    // entirely — Blob is a fully-buffered BodyInit and works everywhere.
    //
    // Memory bound: maxInputFileSize (free=100MB, pro=2GB) — same ceiling the
    // pre-stream gate enforces. v2 candidate: patch SDK to set duplex, then
    // restore streaming + ProgressTransform for files >5MB.
    const buffer = await fs.readFile(resolved);
    const blob = new Blob([buffer]);

    const result = await ctx.sdk.uploads.upload(blob, {
      filename: args.filename ?? path.basename(resolved),
      signal: extra.signal,
    });

    ctx.logger.info({ msg: "upload_complete", basename: path.basename(resolved), sizeBytes });

    return { downloadUrl: result.downloadUrl, sizeBytes };
  },
});

// Reuse the widen pattern from jobs.ts so tool arrays can be iterated by registerToolDef
// without TS attempting to unify per-tool input shapes into an intersection.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDef = ToolDef<ZodRawShape, any>;
const widen = <I extends ZodRawShape, O extends ZodRawShape>(t: ToolDef<I, O>): AnyToolDef =>
  // Variance escape hatch — see jobs.ts for full rationale.
  t as unknown as AnyToolDef;

export function uploadTools(): readonly AnyToolDef[] {
  return [widen(uploadFileTool)];
}
