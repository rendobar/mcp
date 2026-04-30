import { z } from "zod";
import { promises as fs, createReadStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import path from "node:path";
import { defineTool, type ToolDef, type ToolExtra } from "./util.js";
import { resolveSafe } from "../paths.js";
import type { ZodRawShape } from "zod";
import type { RendobarContext } from "../context.js";

const PROGRESS_THRESHOLD_BYTES = 5 * 1024 * 1024;
const PROGRESS_CHUNK_BYTES = 256 * 1024;

class ProgressTransform extends Transform {
  private bytesSent = 0;
  private nextEmitAt = PROGRESS_CHUNK_BYTES;

  constructor(
    private readonly send: (n: { method: string; params: Record<string, unknown> }) => Promise<void>,
    private readonly token: string | number,
    private readonly total: number,
  ) {
    super();
  }

  override _transform(chunk: Buffer, _enc: BufferEncoding, cb: () => void): void {
    this.bytesSent += chunk.length;
    if (this.bytesSent >= this.nextEmitAt || this.bytesSent >= this.total) {
      this.nextEmitAt = this.bytesSent + PROGRESS_CHUNK_BYTES;
      // Fire-and-forget — don't block streaming on notification ack.
      void this.send({
        method: "notifications/progress",
        params: {
          progressToken: this.token,
          progress: this.bytesSent,
          total: this.total,
        },
      }).catch(() => {
        /* best-effort */
      });
    }
    this.push(chunk);
    cb();
  }
}

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

    // 4. Build the stream chain: file reader → optional progress transform → web stream.
    const reader = createReadStream(resolved);
    const progressToken = readProgressToken(extra);
    const sender = readSendNotification(extra);

    let nodeStream: Readable = reader;
    if (
      sizeBytes >= PROGRESS_THRESHOLD_BYTES &&
      progressToken !== undefined &&
      sender !== undefined
    ) {
      const transform = new ProgressTransform(sender, progressToken, sizeBytes);
      reader.pipe(transform);
      nodeStream = transform;
    }

    // Convert Node Readable → Web ReadableStream for fetch body compatibility.
    // Cast justified: Node @types declares Readable.toWeb returns ReadableStream<any>;
    // the SDK's BodyInit accepts ReadableStream<Uint8Array>. They're structurally the same.
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

    // 5. Upload (signal propagated for cancellation).
    const result = await ctx.sdk.uploads.upload(webStream as unknown as BodyInit, {
      filename: args.filename ?? path.basename(resolved),
      signal: extra.signal,
    });

    ctx.logger.info({ msg: "upload_complete", basename: path.basename(resolved), sizeBytes });

    return { downloadUrl: result.downloadUrl, sizeBytes };
  },
});

// ── Helpers for ToolExtra access ──────────────────────────────
// MCP SDK ToolExtra type isn't exported cleanly across all paths; pull progressToken
// and sendNotification out via runtime checks. This keeps the unit tests easy
// (they pass a plain object as extra) and avoids hairy type imports.

function readProgressToken(extra: ToolExtra): string | number | undefined {
  const meta = (extra as { _meta?: { progressToken?: string | number } })._meta;
  return meta?.progressToken;
}

function readSendNotification(
  extra: ToolExtra,
): ((n: { method: string; params: Record<string, unknown> }) => Promise<void>) | undefined {
  const fn = (
    extra as {
      sendNotification?: (n: {
        method: string;
        params: Record<string, unknown>;
      }) => Promise<void>;
    }
  ).sendNotification;
  return fn;
}

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
