import { createClient, type RendobarClient } from "@rendobar/sdk";
import type { Logger } from "./logger.js";
import type { ResolvedConfig } from "./config.js";

export interface RendobarContext {
  logger: Logger;
  sdk: RendobarClient;
  config: ResolvedConfig;
  /** Cached value populated lazily on first need. Plan limits don't change mid-session. */
  cachedMaxFileSize: number | null;
}

export function createContext(config: ResolvedConfig, logger: Logger): RendobarContext {
  const sdk = createClient({
    apiKey: config.apiKey,
    baseUrl: config.apiBase,
  });
  return { logger, sdk, config, cachedMaxFileSize: null };
}
