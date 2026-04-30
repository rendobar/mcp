type Level = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(obj: Record<string, unknown>): void;
  info(obj: Record<string, unknown>): void;
  warn(obj: Record<string, unknown>): void;
  error(obj: Record<string, unknown>): void;
  restoreConsole(): void;
}

interface LoggerOptions {
  level: Level;
  name?: string;
  patchConsole?: boolean;
}

let savedConsole: Pick<Console, "log" | "info" | "warn" | "debug"> | null = null;

export function createLogger(opts: LoggerOptions): Logger {
  const minRank = LEVEL_RANK[opts.level];

  const emit = (level: Level, obj: Record<string, unknown>): void => {
    if (LEVEL_RANK[level] < minRank) return;
    const entry: Record<string, unknown> = { level, time: Date.now(), ...obj };
    if (opts.name !== undefined) entry.name = opts.name;
    process.stderr.write(JSON.stringify(entry) + "\n");
  };

  if (opts.patchConsole === true && savedConsole === null) {
    savedConsole = {
      // eslint-disable-next-line no-console
      log: console.log.bind(console),
      // eslint-disable-next-line no-console
      info: console.info.bind(console),
      // eslint-disable-next-line no-console
      warn: console.warn.bind(console),
      // eslint-disable-next-line no-console
      debug: console.debug.bind(console),
    };
    const redirect = (level: Level) => (...args: unknown[]): void => {
      const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
      emit(level, { msg, source: "console" });
    };
    // eslint-disable-next-line no-console
    console.log = redirect("info");
    // eslint-disable-next-line no-console
    console.info = redirect("info");
    // eslint-disable-next-line no-console
    console.warn = redirect("warn");
    // eslint-disable-next-line no-console
    console.debug = redirect("debug");
  }

  return {
    debug: (obj) => emit("debug", obj),
    info: (obj) => emit("info", obj),
    warn: (obj) => emit("warn", obj),
    error: (obj) => emit("error", obj),
    restoreConsole: () => {
      if (savedConsole !== null) {
        // eslint-disable-next-line no-console
        console.log = savedConsole.log;
        // eslint-disable-next-line no-console
        console.info = savedConsole.info;
        // eslint-disable-next-line no-console
        console.warn = savedConsole.warn;
        // eslint-disable-next-line no-console
        console.debug = savedConsole.debug;
        savedConsole = null;
      }
    },
  };
}
