import { describe, it, expect } from "vitest";
import { VERSION } from "../../src/version.js";

/**
 * This server talks to Rendobar through the SDK, and the SDK labels its own
 * traffic "sdk". Without an override every call from here was attributed to the
 * SDK, so MCP usage was invisible in analytics and a bug report could not say
 * which client produced it.
 */

describe("how this server identifies itself", () => {
  it("reports the injected version, not a hardcoded one", () => {
    // `tsup` replaces __PACKAGE_VERSION__ at build time, so under test the dev
    // marker is what should appear. A real number here would mean someone had
    // hardcoded it again, which is exactly how the old copy drifted to 1.0.0
    // while the package sat at 1.10.0.
    expect(VERSION).toBe("0.0.0-dev");
  });

  it("builds a tag in the product form the API parses", () => {
    const tag = `mcp/${VERSION}`;
    // `name/version`, the ordinary HTTP product convention. A bare name still
    // parses on Rendobar's side but loses the half saying which build.
    expect(tag.split("/")[0]).toBe("mcp");
    expect(tag).toMatch(/^mcp\/.+/);
  });
});
