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
for (const f of ["README.md", "LICENSE"]) {
  cpSync(join(ROOT, f), join(STAGE, f));
}

// ── Tool declarations ─────────────────────────────────────────
// The manifest spec has a `tools` array, and Claude Desktop shows it in the
// install dialog so a user can see what they are granting before they accept.
// It is NOT hand-written here: a second copy of the tool list is exactly the
// drift that put a stale tool count on four public surfaces. The built server
// is asked instead, so the declaration cannot disagree with what it registers.
function toolsFromServer() {
  const req =
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "mcpb-build", version: "1" },
      },
    })}\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`;

  const out = execFileSync(process.execPath, [join(ROOT, "dist", "bin.js")], {
    input: req,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  });

  for (const line of out.split("\n").filter(Boolean)) {
    const msg = JSON.parse(line);
    if (msg.id === 2) return msg.result.tools;
  }
  throw new Error("server did not answer tools/list");
}

const tools = toolsFromServer();
// First sentence only. The full descriptions run to several hundred characters
// each, which is right for a model choosing a tool and wrong for an install
// dialog a human is reading.
manifest.tools = tools.map((t) => ({
  name: t.name,
  description: `${t.description.split(". ")[0].trim()}.`,
}));
manifest.tools_generated = false;

writeFileSync(join(STAGE, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`  declared ${tools.length} tools from the built server`);

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
// Committed rather than fetched from the brand CDN. Fetching kept the repo free
// of a duplicated asset, but it put a network call in the build and wrote the
// response straight to disk, which CodeQL flags as js/http-to-file-access. A
// 15 KB PNG is not worth either. Refresh from
// cdn.rendobar.com/assets/brand/web-app-manifest-512x512.png if the mark changes.
cpSync(join(ROOT, "assets", "icon.png"), join(STAGE, "icon.png"));

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
