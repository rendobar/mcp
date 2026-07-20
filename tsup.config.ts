import { defineConfig } from "tsup";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: ["esm"],
  target: "es2022",
  platform: "node",
  splitting: false,
  clean: true,
  dts: { entry: { index: "src/index.ts" } },
  sourcemap: false,
  minify: true,
  banner: ({ format }) => format === "esm" ? { js: "#!/usr/bin/env node" } : {},
  define: {
    "__PACKAGE_VERSION__": JSON.stringify(pkg.version),
    // Public write-only PostHog project token for anonymous telemetry. Injected
    // from RB_POSTHOG_KEY at release build; empty otherwise (telemetry disabled).
    "__RB_POSTHOG_KEY__": JSON.stringify(process.env.RB_POSTHOG_KEY ?? ""),
  },
  onSuccess: process.platform === "win32" ? undefined : "chmod +x dist/bin.js",
});
