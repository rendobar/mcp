import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const binPath = path.resolve(here, "..", "..", "dist", "bin.js");

describe("stdout-pollution", () => {
  it("server emits only JSON-RPC frames on stdout during initialize handshake", async () => {
    const child = spawn("node", [binPath], {
      env: { ...process.env, RENDOBAR_API_KEY: "rb_test_dummy" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout.on("data", (buf: Buffer) => stdoutChunks.push(buf.toString("utf8")));
    child.stderr.on("data", (buf: Buffer) => stderrChunks.push(buf.toString("utf8")));

    const req = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    };
    child.stdin.write(JSON.stringify(req) + "\n");

    // Wait until at least one full JSON-RPC frame (ending in \n) arrives. Windows
    // CI runners are slow — bump ceiling to 10 s. Local typically responds in <500ms.
    const RESPONSE_TIMEOUT_MS = 10_000;
    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const tick = (): void => {
        const collected = stdoutChunks.join("");
        if (collected.includes("\n")) {
          resolve();
          return;
        }
        if (Date.now() - start > RESPONSE_TIMEOUT_MS) {
          const stderr = stderrChunks.join("");
          reject(new Error(`No JSON-RPC frame on stdout within ${RESPONSE_TIMEOUT_MS}ms.\nstdout: ${collected}\nstderr: ${stderr}`));
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      child.on("exit", () => resolve());
    });

    const stdout = stdoutChunks.join("");
    const stderr = stderrChunks.join("");

    // Every non-empty line on stdout MUST parse as JSON-RPC.
    const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThan(0);

    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (e) {
        throw new Error(`Non-JSON line on stdout: '${line}'\nFull stderr: ${stderr}`);
      }
      const obj = parsed as { jsonrpc?: string };
      expect(obj.jsonrpc).toBe("2.0");
    }

    // Stderr is allowed (logger writes there). It should contain at least the ready log.
    // We don't assert content, just that nothing pollutes stdout.
  }, 20_000);
});
