import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "..", "dist", "bin.js");
const root = path.resolve(here, "..");

export default function setup(): void {
  if (!existsSync(dist)) {
    process.stderr.write("[test setup] Building dist/ for integration tests...\n");
    execSync("pnpm build", { stdio: "inherit", cwd: root });
  }
}
