import { z } from "zod";
import { defineTool } from "./util.js";
import { getSdk } from "../context.js";
import type { ZodRawShape } from "zod";

function formatBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(0)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

const getAccountTool = defineTool({
  name: "get_account",
  title: "Get Rendobar Account",
  description:
    "Get the authenticated account's credit balance, plan, and limits. Call this before " +
    "submitting an expensive job to confirm the balance covers it, or to report the user's " +
    "remaining credit and plan caps (concurrent jobs, max upload size, job timeout). Takes no " +
    "arguments. Read-only and idempotent — it never spends credit or changes anything. Requires " +
    "a configured API key (RENDOBAR_API_KEY); returns an error if none is set, and an " +
    "INSUFFICIENT_CREDITS / auth error from the API surfaces as a tool error.",
  inputSchema: {} as ZodRawShape,
  outputSchema: {
    balance: z.string(),
    balanceUsd: z.number(),
    plan: z.string(),
    isPro: z.boolean(),
    limits: z.object({
      concurrentJobs: z.number(),
      maxFileSize: z.string(),
      maxFileSizeBytes: z.number(),
      jobTimeoutMin: z.number(),
    }),
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  execute: async (_args, ctx) => {
    const state = await getSdk(ctx).billing.state();

    // Cache the max file size for upload_file's pre-stream gate.
    ctx.cachedMaxFileSize = state.plan.limits.maxInputFileSize;

    return {
      balance: `$${state.balance.amount.toFixed(2)}`,
      balanceUsd: state.balance.amount,
      plan: state.plan.slug,
      isPro: state.isPro,
      limits: {
        concurrentJobs: state.plan.limits.concurrentJobs,
        maxFileSize: formatBytes(state.plan.limits.maxInputFileSize),
        maxFileSizeBytes: state.plan.limits.maxInputFileSize,
        // API returns seconds; convert to minutes.
        jobTimeoutMin: Math.floor(state.plan.limits.maxJobTimeout / 60),
      },
    };
  },
});

// Return type inferred to preserve precise per-tool input/output shape.
export function accountTools() {
  return [getAccountTool] as const;
}
