#!/usr/bin/env node
// Catches directory listings that have silently drifted away from what we shipped.
//
// This exists because the Glama claim REVERTED on its own between 2026-06 and
// 2026-08. Nothing in the repo changed, nobody was notified, and the listing sat
// unclaimed with a decaying tool list for weeks. Registry and listing state is
// external, mutable, and nothing here watches it.
//
// Scope is deliberately narrow. Only two directories publish a machine-readable
// record: the official MCP registry and Glama. Every other listing (mcp.so,
// Smithery, LobeHub, awesome-* lists) is HTML only, and scraping them would rot
// faster than it would catch anything. Those are one-time submissions anyway.
//
// Usage: node scripts/check-listings.mjs [--json]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const asJson = process.argv.includes("--json");

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const server = JSON.parse(readFileSync(join(ROOT, "server.json"), "utf8"));

// Indexing is not instant, and npm publish lands before any directory sees it.
// Alerting inside that window would page us for normal propagation, so a fresh
// release is not drift yet.
// Overridable so the drift path itself can be exercised without waiting two days.
const GRACE_HOURS = Number(process.env.LISTING_GRACE_HOURS ?? 48);

const findings = [];
const drift = (what, detail) => findings.push({ level: "drift", what, detail });
const info = (what, detail) => findings.push({ level: "info", what, detail });

const get = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// ── Official MCP registry ─────────────────────────────────────
// The one hard check. Every aggregator downstream ingests this, so a stale or
// missing entry propagates everywhere.

async function checkRegistry() {
  const url = `https://registry.modelcontextprotocol.io/v0/servers?search=${encodeURIComponent(server.name)}`;
  let entries;
  try {
    entries = (await get(url)).servers ?? [];
  } catch (err) {
    drift("registry", `unreachable: ${err.message}`);
    return;
  }

  const meta = (e) => e._meta?.["io.modelcontextprotocol.registry/official"] ?? {};
  const ours = entries.filter((e) => e.server?.name === server.name);

  if (ours.length === 0) {
    drift("registry", `${server.name} is not listed at all`);
    return;
  }

  const latest = ours.find((e) => meta(e).isLatest);
  if (!latest) {
    drift("registry", `${server.name} has no entry flagged isLatest`);
    return;
  }

  const publishedAt = meta(latest).publishedAt ?? meta(latest).updatedAt;
  const ageHours = publishedAt ? (Date.now() - Date.parse(publishedAt)) / 3.6e6 : Infinity;

  if (latest.server.version !== pkg.version) {
    if (ageHours < GRACE_HOURS) {
      info("registry", `serving ${latest.server.version}, we shipped ${pkg.version} (within ${GRACE_HOURS}h grace)`);
    } else {
      drift("registry", `serving ${latest.server.version}, we shipped ${pkg.version}`);
    }
  } else {
    info("registry", `${latest.server.version} matches package.json`);
  }

  if (meta(latest).status !== "active") {
    drift("registry", `latest entry status is "${meta(latest).status}", expected "active"`);
  }

  // A second namespace serving a different version is what sent mcpcentral.io to
  // io.github.rendobar/mcp@1.5.0 while com.rendobar was on 1.8.3.
  const otherActive = entries.filter(
    (e) => e.server?.name !== server.name && meta(e).status === "active",
  );
  if (otherActive.length > 0) {
    const names = [...new Set(otherActive.map((e) => e.server.name))].join(", ");
    drift("registry", `another namespace is still active and will be mirrored: ${names}`);
  }
}

// ── Glama ─────────────────────────────────────────────────────
// Soft checks only. Glama's HTML page and its public API are separate data
// paths: after the 2026-08-04 re-claim the page listed all 7 tools while the API
// still returned an empty array. Asserting a tool count here would fire on every
// run, so this only catches the listing disappearing or losing its license.

async function checkGlama() {
  let data;
  try {
    data = await get("https://glama.ai/api/mcp/v1/servers/rendobar/mcp");
  } catch (err) {
    drift("glama", `unreachable: ${err.message}`);
    return;
  }

  if (!data?.id) {
    drift("glama", "listing returned no id, it may have been delisted");
    return;
  }
  if (!data.spdxLicense?.name) {
    drift("glama", "no license detected, this gates the License grade and installability");
  }

  const tools = data.tools?.length ?? 0;
  info("glama", `id ${data.id}, license ${data.spdxLicense?.name ?? "none"}, API reports ${tools} tools (API tool list is known-unreliable, not asserted)`);
}

// ── Report ────────────────────────────────────────────────────

await Promise.all([checkRegistry(), checkGlama()]);

const drifted = findings.filter((f) => f.level === "drift");

if (asJson) {
  console.log(JSON.stringify({ version: pkg.version, drifted: drifted.length, findings }, null, 2));
} else {
  for (const f of findings) {
    console.log(`${f.level === "drift" ? "DRIFT" : " ok  "}  ${f.what.padEnd(9)} ${f.detail}`);
  }
}

if (drifted.length > 0) {
  console.error(`\n${drifted.length} listing(s) drifted from ${pkg.version}`);
  process.exit(1);
}
