#!/usr/bin/env node
// Packs the stdio server into an .mcpb bundle (MCP Bundle) for one-click
// install in Claude Desktop and any other host implementing the format.
//
// Why a staging directory instead of `mcpb pack .` at the repo root:
// MCPB resolves dependencies at PACK time, not install time, so node_modules
// ships inside the archive. This repo's node_modules is 145 MB of pnpm symlink
// farm including devDependencies; zipping it would produce a broken, enormous
// bundle. We stage a clean tree with real files and production deps only
// (~28 MB, which level-9 zips down substantially).
//
// Usage: node scripts/build-mcpb.mjs [--skip-install]

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGE = join(ROOT, ".mcpb-build");
const skipInstall = process.argv.includes("--skip-install");

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

// release-please bumps both via extra-files. If they ever diverge, the bundle
// would advertise a version that is not the code inside it.
if (manifest.version !== pkg.version) {
  console.error(
    `manifest.json version "${manifest.version}" != package.json version "${pkg.version}"`,
  );
  process.exit(1);
}

const entry = join(ROOT, "dist", "bin.js");
if (!existsSync(entry)) {
  console.error("dist/bin.js missing - run `pnpm build` first");
  process.exit(1);
}

// ── Stage ─────────────────────────────────────────────────────
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

cpSync(join(ROOT, "dist"), join(STAGE, "dist"), { recursive: true });
for (const f of ["manifest.json", "README.md", "LICENSE"]) {
  cpSync(join(ROOT, f), join(STAGE, f));
}

// Production dependencies only. tsup externalises them (dist/bin.js is ~23 KB),
// so the server genuinely needs node_modules at runtime.
writeFileSync(
  join(STAGE, "package.json"),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      type: "module",
      license: pkg.license,
      dependencies: pkg.dependencies,
    },
    null,
    2,
  ),
);

// ── Icon ──────────────────────────────────────────────────────
// Brand assets live on the CDN (synced from a different repo), same source the
// registry entry's icons point at. Fetch rather than committing a duplicate.
const ICON_URL = "https://cdn.rendobar.com/assets/brand/web-app-manifest-512x512.png";
const iconRes = await fetch(ICON_URL, { signal: AbortSignal.timeout(20_000) });
if (!iconRes.ok) {
  console.error(`icon fetch failed (${iconRes.status}): ${ICON_URL}`);
  process.exit(1);
}
writeFileSync(join(STAGE, "icon.png"), Buffer.from(await iconRes.arrayBuffer()));

// ── Dependencies ──────────────────────────────────────────────
// npm, not pnpm: pnpm installs a symlink farm, and symlinks do not survive the
// zip in a usable form. npm writes real files.
if (!skipInstall) {
  execFileSync("npm", ["install", "--omit=dev", "--no-package-lock", "--no-audit", "--no-fund"], {
    cwd: STAGE,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

// ── Validate + pack ───────────────────────────────────────────
const mcpb = (args) =>
  execFileSync("npx", ["-y", "@anthropic-ai/mcpb", ...args], {
    cwd: STAGE,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

mcpb(["validate", "manifest.json"]);

const out = join(ROOT, `rendobar-mcp-${pkg.version}.mcpb`);
rmSync(out, { force: true });
mcpb(["pack", ".", out]);

const mb = (statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`\n${out}  (${mb} MB)`);
