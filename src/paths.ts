import { promises as fs } from "node:fs";
import path from "node:path";

export interface ResolveOptions {
  cwd: string;
  /**
   * Optional MCP roots from the client. When provided, the resolved (realpath'd)
   * path must be inside at least one root. When omitted, any local path is allowed
   * — the user trusts whichever directory they spawned the server in.
   */
  roots?: string[];
}

export async function resolveSafe(input: string, opts: ResolveOptions): Promise<string> {
  const absolute = path.resolve(opts.cwd, input);
  const real = await fs.realpath(absolute);

  if (opts.roots !== undefined && opts.roots.length > 0) {
    const realRoots = await Promise.all(
      opts.roots.map((r) => fs.realpath(r).catch(() => null)),
    );
    const inAnyRoot = realRoots.some(
      (r) => r !== null && (real === r || real.startsWith(r + path.sep)),
    );
    if (!inAnyRoot) {
      throw new Error(`Path is outside the allowed MCP roots: ${real}`);
    }
  }
  return real;
}
