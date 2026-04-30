import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { resolveSafe } from "../../src/paths.js";

describe("resolveSafe", () => {
  let tmp: string;
  let nested: string;
  let target: string;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(tmpdir(), "rendobar-mcp-paths-"));
    nested = path.join(tmp, "nested");
    await fs.mkdir(nested);
    target = path.join(nested, "video.mp4");
    await fs.writeFile(target, "fake mp4 bytes");
  });

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("resolves a relative path against cwd", async () => {
    const resolved = await resolveSafe("./video.mp4", { cwd: nested });
    expect(resolved).toBe(await fs.realpath(target));
  });

  it("resolves an absolute path", async () => {
    const resolved = await resolveSafe(target, { cwd: tmp });
    expect(resolved).toBe(await fs.realpath(target));
  });

  it("follows symlinks via realpath", async () => {
    const link = path.join(tmp, "link.mp4");
    try { await fs.unlink(link); } catch { /* ignore */ }
    try {
      await fs.symlink(target, link);
    } catch (e) {
      // On Windows, creating symlinks may require elevation. Skip if EPERM.
      const err = e as NodeJS.ErrnoException;
      if (err.code === "EPERM" || err.code === "ENOSYS") {
        return; // skip — not a code bug
      }
      throw e;
    }
    const resolved = await resolveSafe(link, { cwd: tmp });
    expect(resolved).toBe(await fs.realpath(target));
  });

  it("rejects when path is outside roots", async () => {
    const otherTmp = await fs.mkdtemp(path.join(tmpdir(), "rendobar-mcp-other-"));
    try {
      await expect(
        resolveSafe(target, { cwd: tmp, roots: [otherTmp] }),
      ).rejects.toThrow(/outside.*roots/i);
    } finally {
      await fs.rm(otherTmp, { recursive: true, force: true });
    }
  });

  it("accepts when path is inside any root", async () => {
    const resolved = await resolveSafe(target, { cwd: tmp, roots: [tmp] });
    expect(resolved).toBe(await fs.realpath(target));
  });

  it("rejects nonexistent files", async () => {
    await expect(resolveSafe("does-not-exist.mp4", { cwd: tmp })).rejects.toThrow();
  });
});
