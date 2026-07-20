// Anonymous, opt-out telemetry for the Rendobar MCP server.
//
// What it is: one anonymous event per tool call (which tool, success, duration,
// server version, OS). It exists so we can see which tools agents actually use
// and make the server better.
//
// What it is NOT: it never sends tool arguments, file names or contents, URLs,
// API keys, or account identity. The identifier is a random per-machine id, not
// tied to your account.
//
// Off switches (any one disables it): DO_NOT_TRACK=1, RENDOBAR_TELEMETRY=0, or a
// CI environment (skipped automatically).
//
// Kept self-contained per the cross-repo rule (the MCP package can't import
// @rendobar/shared). Mirrors the platform's snake_case event convention.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";

// Public write-only PostHog project token, injected at build (tsup define).
// Empty in dev/source => telemetry disabled.
declare const __RB_POSTHOG_KEY__: string;
declare const __PACKAGE_VERSION__: string;

const KEY =
  process.env.RENDOBAR_TELEMETRY_KEY ??
  (typeof __RB_POSTHOG_KEY__ === "string" ? __RB_POSTHOG_KEY__ : "");
const VERSION =
  typeof __PACKAGE_VERSION__ === "string" ? __PACKAGE_VERSION__ : "0.0.0-dev";
// First-party reverse proxy host (same one the dashboard uses). Overridable.
const HOST = process.env.RENDOBAR_TELEMETRY_HOST ?? "https://e.rendobar.com";
const TIMEOUT_MS = 1500;

function rendobarDir(): string {
  if (platform() === "win32") {
    const appData = process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming");
    return path.join(appData, "rendobar");
  }
  return path.join(homedir(), ".config", "rendobar");
}

function statePath(): string {
  return path.join(rendobarDir(), "telemetry.json");
}

interface TelemetryState {
  anonymousId: string;
  enabled: boolean;
}

// The state file doesn't change during a server's lifetime, so read it once and
// cache. Avoids a disk read on every tool call (telemetryEnabled + capture).
let cachedState: TelemetryState | null = null;

function readState(): TelemetryState {
  if (cachedState) return cachedState;
  try {
    const raw: unknown = JSON.parse(readFileSync(statePath(), "utf8"));
    if (raw && typeof raw === "object") {
      const r = raw as Record<string, unknown>;
      cachedState = {
        anonymousId:
          typeof r.anonymousId === "string" ? r.anonymousId : `mcp_anon_${randomUUID()}`,
        enabled: r.enabled !== false,
      };
      return cachedState;
    }
  } catch {
    /* missing/corrupt -> fresh */
  }
  const fresh: TelemetryState = { anonymousId: `mcp_anon_${randomUUID()}`, enabled: true };
  try {
    const dir = rendobarDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(statePath(), JSON.stringify(fresh, null, 2));
  } catch {
    /* best-effort */
  }
  cachedState = fresh;
  return fresh;
}

function optedOutByEnv(): boolean {
  if (process.env.DO_NOT_TRACK && process.env.DO_NOT_TRACK !== "0") return true;
  const flag = (process.env.RENDOBAR_TELEMETRY ?? "").toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off" || flag === "no") return true;
  if (process.env.RENDOBAR_NO_TELEMETRY || process.env.RENDOBAR_DISABLE_TELEMETRY) return true;
  if (process.env.CI === "true") return true;
  return false;
}

export function telemetryEnabled(): boolean {
  if (!KEY) return false;
  if (optedOutByEnv()) return false;
  return readState().enabled;
}

let noticeShown = false;
/** One-time transparency line to stderr (never stdout — that's the MCP channel). */
export function maybeLogNotice(log: (msg: string) => void): void {
  if (noticeShown || !telemetryEnabled()) return;
  noticeShown = true;
  log(
    "Anonymous usage telemetry is on (tool name, success, duration — never args, " +
      "files, or credentials). Disable with DO_NOT_TRACK=1 or RENDOBAR_TELEMETRY=0.",
  );
}

/**
 * Capture one anonymous tool-call event. Fire-and-forget: the MCP server is
 * long-lived so the request completes on the event loop without blocking the
 * tool response. Never throws.
 */
export function captureToolCall(
  tool: string,
  success: boolean,
  durationMs: number,
): void {
  if (!telemetryEnabled()) return;
  const { anonymousId } = readState();

  const body = {
    api_key: KEY,
    event: "mcp_tool_call",
    distinct_id: anonymousId,
    properties: {
      tool,
      success,
      duration_ms: durationMs,
      mcp_version: VERSION,
      os: platform(),
      arch: process.arch,
      // Keep this an anonymous event (no person profile for the machine id).
      $process_person_profile: false,
    },
    timestamp: new Date().toISOString(),
  };

  void fetch(`${HOST}/i/v0/e/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => {
    // Never surface a telemetry error.
  });
}
