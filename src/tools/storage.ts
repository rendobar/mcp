import { z, type ZodRawShape } from "zod";
import { ApiError, isApiError } from "@rendobar/sdk";
import { defineTool } from "./util.js";
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
  access: z.literal("read").optional(),
  pending: z.literal(true).optional(),
  defaultDestination: z.literal(true).optional(),
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

export function storageTools() {
  return [listStorageTool];
}
