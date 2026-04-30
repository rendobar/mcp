import { promises as fs } from "node:fs";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface ResolvedConfig {
  apiKey: string;
  apiBase: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

export interface ParseConfigOptions {
  argv: string[];
  env: Record<string, string | undefined>;
  credsPath: string;
}

interface CredsFile {
  apiKey?: string;
  apiBase?: string;
}

const DEFAULT_API_BASE = "https://api.rendobar.com";
const VALID_LEVELS = new Set(["debug", "info", "warn", "error"]);

export async function parseConfig(opts: ParseConfigOptions): Promise<ResolvedConfig> {
  const flagKey = parseFlag(opts.argv, "--api-key");
  const flagBase = parseFlag(opts.argv, "--api-base");

  let fileCreds: CredsFile = {};
  try {
    const raw = await fs.readFile(opts.credsPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object") {
      fileCreds = parsed as CredsFile;
    }
  } catch {
    // file missing or unparseable — silent fallback
  }

  const apiKey = flagKey ?? opts.env.RENDOBAR_API_KEY ?? fileCreds.apiKey;
  const apiBase = flagBase ?? fileCreds.apiBase ?? DEFAULT_API_BASE;

  if (apiKey === undefined || apiKey === "") {
    throw new ConfigError(
      `No Rendobar API key found. Provide one via:\n` +
      `  1. --api-key=<key> command-line flag\n` +
      `  2. RENDOBAR_API_KEY environment variable\n` +
      `  3. credentials file at ${opts.credsPath} (written by 'rb login' from CLI v1.1+)\n\n` +
      `Get an API key at https://app.rendobar.com/settings/api-keys`,
    );
  }
  if (!apiKey.startsWith("rb_")) {
    throw new ConfigError(
      `Invalid Rendobar API key: must start with 'rb_' (got '${apiKey.slice(0, 4)}...').`,
    );
  }

  const logLevelRaw = opts.env.RENDOBAR_LOG_LEVEL ?? "info";
  if (!VALID_LEVELS.has(logLevelRaw)) {
    throw new ConfigError(
      `Invalid RENDOBAR_LOG_LEVEL='${logLevelRaw}'. Use one of: debug, info, warn, error.`,
    );
  }

  return {
    apiKey,
    apiBase,
    logLevel: logLevelRaw as ResolvedConfig["logLevel"],
  };
}

function parseFlag(argv: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === name) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) return next;
    }
  }
  return undefined;
}
