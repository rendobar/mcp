#!/usr/bin/env node
// Guards server.json, the registry entry that every MCP aggregator ingests.
//
// The registry publish step in release.yml is continue-on-error, so a malformed
// or unreachable entry does not fail a release - it prints a warning nobody
// reads. These checks run on every PR instead, before the entry can ship.
//
// Deliberately dependency-free: node 20.10+ has fetch, and the failures that
// actually happen here are cross-file drift and dead URLs, not exotic schema
// violations. A genuine schema violation is caught downstream by the
// post-publish verification in release.yml, which fails loudly.
//
// Usage: node scripts/check-registry-entry.mjs [--skip-network]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const skipNetwork = process.argv.includes("--skip-network");

const read = (name) => JSON.parse(readFileSync(join(ROOT, name), "utf8"));

const failures = [];
const fail = (msg) => failures.push(msg);
const ok = (msg) => console.log(`  ok  ${msg}`);

const server = read("server.json");
const pkg = read("package.json");

// ── Cross-file consistency ────────────────────────────────────
// The registry rejects a publish when package.json's mcpName does not match
// server.json's name, and release-please bumps three version fields via
// extra-files. Any of them drifting breaks the publish after npm has already
// gone out.

if (server.name !== pkg.mcpName) {
  fail(`server.json name "${server.name}" != package.json mcpName "${pkg.mcpName}"`);
} else {
  ok(`name matches mcpName (${server.name})`);
}

const versions = {
  "package.json version": pkg.version,
  "server.json version": server.version,
  "server.json packages[0].version": server.packages?.[0]?.version,
};
const distinct = [...new Set(Object.values(versions))];
if (distinct.length !== 1) {
  fail(`version drift: ${JSON.stringify(versions)}`);
} else {
  ok(`all version fields agree (${distinct[0]})`);
}

if (server.packages?.[0]?.identifier !== pkg.name) {
  fail(
    `server.json packages[0].identifier "${server.packages?.[0]?.identifier}" != package.json name "${pkg.name}"`,
  );
} else {
  ok(`package identifier matches (${pkg.name})`);
}

// ── Registry field limits ─────────────────────────────────────
// description maxLength is 100 in the published schema. Going over is a hard
// publish rejection, and it is easy to do when editing copy by hand.

if (typeof server.description !== "string" || server.description.length === 0) {
  fail("description is missing or empty");
} else if (server.description.length > 100) {
  fail(`description is ${server.description.length} chars, max is 100`);
} else {
  ok(`description is ${server.description.length}/100 chars`);
}

if (!server.remotes?.length) {
  fail("no remotes entry - the hosted server would be invisible in the registry");
} else {
  ok(`${server.remotes.length} remote(s): ${server.remotes.map((r) => r.url).join(", ")}`);
}

// ── URL liveness ──────────────────────────────────────────────
// A dead icon or websiteUrl degrades every listing that ingests the registry,
// and nothing else in CI would notice. Icons are the fragile ones: they point
// at the brand CDN, which is synced from a different repo.

const urls = [
  ...(server.icons ?? []).map((i) => ({ what: `icon ${i.sizes ?? ""}`.trim(), url: i.src })),
  ...(server.websiteUrl ? [{ what: "websiteUrl", url: server.websiteUrl }] : []),
  ...(server.repository?.url ? [{ what: "repository", url: server.repository.url }] : []),
];

// Every URL here comes out of server.json, which Renovate and any PR can edit.
// Fetching whatever that file names would let a branch point CI at an arbitrary
// host, so the host is checked against a fixed set rather than just the scheme.
// This is also what CodeQL's js/file-access-to-http flags: file contents
// reaching an outbound request without validation.
const ALLOWED_HOSTS = new Set(["rendobar.com", "cdn.rendobar.com", "github.com"]);

const safeUrls = urls.filter(({ url }) => {
  if (!url.startsWith("https://")) {
    fail(`${url} is not https`);
    return false;
  }
  let hostname;
  try {
    ({ hostname } = new URL(url));
  } catch {
    fail(`${url} is not a parseable URL`);
    return false;
  }
  if (!ALLOWED_HOSTS.has(hostname)) {
    fail(`${url} points at ${hostname}, which is not a Rendobar-controlled host`);
    return false;
  }
  return true;
});

if (skipNetwork) {
  console.log(`  --  skipping liveness for ${safeUrls.length} URL(s) (--skip-network)`);
} else {
  const results = await Promise.all(
    safeUrls.map(async ({ what, url }) => {
      try {
        // Every request needs its own deadline. Without one a hung TLS
        // handshake stalls the whole job until the runner's 6h cap.
        const signal = () => AbortSignal.timeout(15_000);
        // Some hosts reject HEAD (Mintlify answers 405); fall back to a ranged
        // GET rather than pulling the whole asset.
        let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: signal() });
        if (!res.ok) {
          res = await fetch(url, {
            headers: { Range: "bytes=0-0" },
            redirect: "follow",
            signal: signal(),
          });
        }
        return { what, url, status: res.status, ok: res.ok };
      } catch (err) {
        return { what, url, status: `network error: ${err.message}`, ok: false };
      }
    }),
  );

  for (const r of results) {
    if (r.ok) ok(`${r.what} ${r.status} ${r.url}`);
    else fail(`${r.what} unreachable (${r.status}): ${r.url}`);
  }
}

// ── Report ────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`\nserver.json checks failed:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`\nserver.json OK (${safeUrls.length} URLs checked)`);
