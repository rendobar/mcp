// MCP Analytics — PostHog's official MCP Analytics SDK (`@posthog/mcp`), wired
// the Rendobar way: privacy-first and opt-out.
//
// It captures how AI agents use this server (tool name, success, duration,
// intent, errors) so we can make it better. It does NOT ship your tool
// parameters or responses — those (file URLs, job configs, outputs) are stripped
// in `beforeSend` before anything leaves the process. Events are anonymous: the
// SDK sets `$process_person_profile: false` when there is no identity, and we
// never call identify.
//
// Off switches (any one disables it entirely — no client, no instrumentation):
// DO_NOT_TRACK=1, RENDOBAR_TELEMETRY=0, or a CI environment.

import { PostHog } from "posthog-node";
import { instrument } from "@posthog/mcp";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "./logger.js";

// Public write-only PostHog project token, injected at build (tsup define).
// Empty in dev/source => analytics disabled.
declare const __RB_POSTHOG_KEY__: string;
const KEY =
  process.env.RENDOBAR_TELEMETRY_KEY ??
  (typeof __RB_POSTHOG_KEY__ === "string" ? __RB_POSTHOG_KEY__ : "");
// First-party reverse proxy (forwards to the EU region). Overridable for dev.
const HOST = process.env.RENDOBAR_TELEMETRY_HOST ?? "https://e.rendobar.com";

// Raw tool inputs/outputs — never leave the process. For Rendobar these carry
// user file URLs, job params, and output URLs.
const REDACTED_PROPERTIES = ["$mcp_parameters", "$mcp_response"] as const;

function optedOutByEnv(): boolean {
  if (process.env.DO_NOT_TRACK && process.env.DO_NOT_TRACK !== "0") return true;
  const flag = (process.env.RENDOBAR_TELEMETRY ?? "").toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off" || flag === "no") return true;
  if (process.env.RENDOBAR_NO_TELEMETRY || process.env.RENDOBAR_DISABLE_TELEMETRY) return true;
  if (process.env.CI === "true") return true;
  return false;
}

export function analyticsEnabled(): boolean {
  return KEY.length > 0 && !optedOutByEnv();
}

// Exported for tests: strips the raw parameter/response payloads while keeping
// tool name, duration, success, intent, and error metadata.
export function redactToolPayloads(properties: Record<string, unknown>): Record<string, unknown> {
  for (const key of REDACTED_PROPERTIES) delete properties[key];
  return properties;
}

/**
 * Instrument the MCP server with PostHog MCP Analytics. Returns a cleanup that
 * flushes + shuts the client down, or null when analytics is disabled/opted out.
 */
export function setupMcpAnalytics(
  server: McpServer,
  logger: Logger,
): (() => Promise<void>) | null {
  if (!analyticsEnabled()) return null;

  const posthog = new PostHog(KEY, {
    host: HOST,
    // MCP tool calls are infrequent and the stdio host can exit abruptly, so
    // send each event immediately rather than risk losing a batch on kill.
    flushAt: 1,
    flushInterval: 0,
  });

  instrument(server, posthog, {
    // Never ship raw tool inputs/outputs. The SDK also auto-redacts secret-keyed
    // values and strips API-key patterns; this drops the payloads entirely.
    beforeSend: (event) => {
      event.properties = redactToolPayloads(event.properties);
      return event;
    },
  });

  // One-time transparency line to stderr (never stdout — the MCP channel).
  logger.info({
    msg:
      "Anonymous MCP usage analytics on (tool name, success, duration, intent — " +
      "never your parameters, responses, or credentials). Disable with " +
      "DO_NOT_TRACK=1 or RENDOBAR_TELEMETRY=0.",
  });

  return async () => {
    try {
      await posthog.shutdown();
    } catch {
      /* best-effort flush on exit */
    }
  };
}
