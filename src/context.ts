import type { Logger } from "./logger.js";
import type { RendobarClient } from "@rendobar/sdk";

export interface RendobarContext {
  logger: Logger;
  sdk: RendobarClient;
  config: {
    apiKey: string;
    apiBase: string;
    logLevel: "debug" | "info" | "warn" | "error";
  };
  cachedMaxFileSize: number | null;
}
