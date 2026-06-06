import { createClient, type RendobarClient } from "@rendobar/sdk";
import { ConfigError } from "./config.js";
import type { Logger } from "./logger.js";
import type { ResolvedConfig } from "./config.js";

export interface RendobarContext {
  logger: Logger;
  /**
   * `null` when the server booted without an API key. Tools are still registered
   * and listable; they call `getSdk(ctx)` at execute time, which throws a clear
   * error when the key is missing. Never read `ctx.sdk` directly in a tool.
   */
  sdk: RendobarClient | null;
  config: ResolvedConfig;
  /** Cached value populated lazily on first need. Plan limits don't change mid-session. */
  cachedMaxFileSize: number | null;
}

export function createContext(config: ResolvedConfig, logger: Logger): RendobarContext {
  const sdk =
    config.apiKey === null
      ? null
      : createClient({ apiKey: config.apiKey, baseUrl: config.apiBase });
  return { logger, sdk, config, cachedMaxFileSize: null };
}

/**
 * Resolve the SDK client for a tool execution, or throw a user-facing error when
 * the server was started without credentials. Keeping the key check here (rather
 * than at boot) is what lets the server advertise its tools to hosts that list
 * before configuring auth.
 */
export function getSdk(ctx: RendobarContext): RendobarClient {
  if (ctx.sdk === null) {
    throw new ConfigError(
      `No Rendobar API key configured. Provide one via:\n` +
        `  1. --api-key=<key> command-line flag\n` +
        `  2. RENDOBAR_API_KEY environment variable\n` +
        `  3. credentials file (written by 'rb login' from the Rendobar CLI)\n\n` +
        `Get an API key at https://app.rendobar.com/settings/api-keys`,
    );
  }
  return ctx.sdk;
}
