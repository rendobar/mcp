import { z, type ZodRawShape } from "zod";
import { ApiError, isApiError } from "@rendobar/sdk";
import { defineTool, type ToolDef } from "./util.js";
import { getSdk } from "../context.js";

/**
 * The fields of a connection an agent acts on. The API also sends the endpoint,
 * region, path template and delivery rollup, which help a person on the Storage
 * page and only cost an agent context. Parsed here because the SDK does not
 * validate responses at runtime.
 */
const connectionSchema = z.object({
  id: z.string(),
  provider: z.string(),
  bucket: z.string(),
  access: z.string().optional(),
  pending: z.boolean().optional(),
  defaultDestination: z.boolean().optional(),
});

const SCOPE_HINT =
  "Create a new API key in the Rendobar dashboard, where Storage access is on by default, and configure this server with it.";

/**
 * Keys made before storage shipped carry no storage scope, and the API's 403
 * names the scope but not the way out. Adds the way out and keeps the code.
 */
export function withStorageScopeHint(e: unknown): unknown {
  if (!isApiError(e) || e.code !== "INSUFFICIENT_SCOPE") return e;
  return new ApiError(e.code, e.statusCode, `${e.message} ${SCOPE_HINT}`, e.details, e.retryAfter);
}

const listStorageTool = defineTool({
  name: "list_storage",
  title: "List Connected Storage",
  description:
    "List the buckets the user has connected on the Rendobar dashboard's Storage page. " +
    "Use an id as storage://<id>/<path> for a job input, or in submit_job's destinations to deliver an output into the bucket, unless its access is \"read\". " +
    "A pending connection is still being set up and cannot be used yet. " +
    "Credentials are never returned. Read-only. Requires a configured API key with storage access.",
  // A bare `{}` would infer as the empty-object type, not ZodRawShape, which defineTool expects.
  inputSchema: {} as ZodRawShape,
  outputSchema: {
    storage: z.array(
      z.object({
        id: z.string(),
        provider: z.string(),
        bucket: z.string(),
        access: z.enum(["read", "deliver"]),
        defaultDestination: z.boolean().describe("Jobs that name no destinations deliver here"),
        pending: z.boolean(),
      }),
    ),
    note: z.string(),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  execute: async (_args, ctx) => {
    try {
      const page = await getSdk(ctx).storage.list();
      const storage = page.data.flatMap((raw) => {
        const c = connectionSchema.safeParse(raw);
        if (!c.success) return [];
        return [
          {
            id: c.data.id,
            provider: c.data.provider,
            bucket: c.data.bucket,
            access: c.data.access === "read" ? ("read" as const) : ("deliver" as const),
            defaultDestination: c.data.defaultDestination === true,
            pending: c.data.pending === true,
          },
        ];
      });
      return {
        storage,
        note:
          storage.length === 0
            ? "No storage connected. The user connects a bucket at https://app.rendobar.com/storage."
            : "Reference a file as storage://<id>/<path> in any job input, or deliver an output with destinations: [\"storage://<id>\"].",
      };
    } catch (e) {
      throw withStorageScopeHint(e);
    }
  },
});

// Page size sent when limit is omitted, a token-cost default rather than a cap, since the cursor still reaches every file.
const DEFAULT_STORAGE_LIST_LIMIT = 100;

const objectsPageSchema = z.object({
  folders: z.array(z.string()),
  objects: z.array(z.object({ key: z.string(), size: z.number(), lastModified: z.number().nullable() })),
  cursor: z.string().nullable(),
});

const listStorageFilesTool = defineTool({
  name: "list_storage_files",
  title: "List Files in Connected Storage",
  description:
    "List the folders and files directly under a folder in one of the user's connected buckets, to find the path for a storage://<id>/<path> job input. " +
    "Every entry carries its ready-made uri. Pass a folder's prefix to go one level deeper, and the returned cursor to read the next page. " +
    "Read-only: it never changes the bucket. Requires a configured API key with storage access.",
  inputSchema: {
    storageId: z.string().describe("Connection id from list_storage, e.g. 'prod-media'"),
    prefix: z.string().optional().describe("Folder to list, ending in '/', e.g. 'raw/2026/'. Omit for the top of the bucket."),
    cursor: z.string().optional().describe("The cursor from the previous page"),
    limit: z
      .number()
      .int()
      .positive()
      .max(1000)
      .optional()
      .describe("Entries per page, up to 1000. Defaults to 100. Use the returned cursor to fetch the next page."),
  },
  outputSchema: {
    folders: z.array(z.object({ prefix: z.string(), uri: z.string() })),
    files: z.array(
      z.object({
        key: z.string(),
        size: z.number().describe("Bytes"),
        lastModified: z.string().nullable().describe("ISO 8601"),
        uri: z.string(),
      }),
    ),
    cursor: z.string().nullable().describe("Pass back as cursor for the next page. Null on the last page."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  execute: async (args, ctx) => {
    try {
      const raw = await getSdk(ctx).storage.listObjects(args.storageId, {
        prefix: args.prefix,
        cursor: args.cursor,
        limit: args.limit ?? DEFAULT_STORAGE_LIST_LIMIT,
      });
      const page = objectsPageSchema.parse(raw);
      const uri = (key: string) => `storage://${args.storageId}/${key}`;
      return {
        folders: page.folders.map((prefix) => ({ prefix, uri: uri(prefix) })),
        files: page.objects.map((o) => ({
          key: o.key,
          size: o.size,
          lastModified: o.lastModified === null ? null : new Date(o.lastModified).toISOString(),
          uri: uri(o.key),
        })),
        cursor: page.cursor,
      };
    } catch (e) {
      throw withStorageScopeHint(e);
    }
  },
});

// Reuse the widen pattern from jobs.ts/uploads.ts so tool arrays can be iterated
// by registerToolDef without TS attempting to unify per-tool input/output shapes
// into an intersection.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDef = ToolDef<ZodRawShape, any>;
const widen = <I extends ZodRawShape, O extends ZodRawShape>(t: ToolDef<I, O>): AnyToolDef =>
  // Variance escape hatch — see jobs.ts for full rationale.
  t as unknown as AnyToolDef;

export function storageTools(): readonly AnyToolDef[] {
  return [widen(listStorageTool), widen(listStorageFilesTool)];
}
