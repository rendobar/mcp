import { createClient, type RendobarClient } from "@rendobar/sdk";
import { ConfigError } from "./config.js";
import type { Logger } from "./logger.js";
import type { ResolvedConfig } from "./config.js";
import { VERSION } from "./version.js";

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
      : createClient({
          apiKey: config.apiKey,
          baseUrl: config.apiBase,
          // Without this the SDK labels every call "sdk", so traffic from this
          // server was indistinguishable from somebody using the SDK directly
          // and never showed up as MCP in usage or in a bug report.
          client: `mcp/${VERSION}`,
        });
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
    throw new ConfigError(MISSING_KEY_MESSAGE);
  }
  return ctx.sdk;
}

/**
 * Resolve a client for an endpoint that does not require auth, preferring the
 * authed one when the server has it so a configured user's requests still carry
 * their key (rate limits and analytics are per-org).
 *
 * Only for genuinely public endpoints. Everything org-scoped or billable goes
 * through `getSdk`, and a test pins that split so this cannot quietly widen.
 */
export function getPublicSdk(ctx: RendobarContext): RendobarClient {
  // Not cached on the context: createClient allocates a plain object of closures
  // with no network, no pool and no handshake, and the caller is about to make an
  // HTTP request anyway. Caching it would cost a required context field that
  // every test fixture has to carry, to save nothing measurable.
  return ctx.sdk ?? createClient({ baseUrl: ctx.config.apiBase });
}

/**
 * Renders inside a chat message, not a terminal, so it stays three short lines.
 *
 * The routes are self-selecting rather than detected. There is no reliable
 * signal for how the server was installed: `getClientVersion()` reports the host
 * (Claude Desktop), not the install, and the same host covers both an extension
 * with a settings field and a hand-written config without one. A reader knows
 * which they did, so a conditional sentence beats a wrong instruction, and beats
 * a manifest-to-config marker that has to be kept in sync to earn it.
 *
 * The previous version listed only the flag, the env var and the CLI creds file.
 * All three are unreachable from Claude Desktop, which is where most installs
 * now land.
 */
const MISSING_KEY_MESSAGE =
  `No Rendobar API key configured. If you installed the Rendobar extension, paste your key ` +
  `in its settings. Otherwise set RENDOBAR_API_KEY, or run 'rb login' with the Rendobar CLI.\n\n` +
  `Get a key at https://app.rendobar.com/settings/api-keys. New accounts start with $5 of ` +
  `free credit and no card.\n\n` +
  `If Rendobar does not need to read files off this machine, add https://api.rendobar.com/mcp ` +
  `as a connector instead and sign in through your browser. There is no key to manage.`;
