/**
 * The published version of this package.
 *
 * `tsup.config.ts` replaces `__PACKAGE_VERSION__` with the value from
 * package.json at build time, so this is the real number in a published build
 * and a marker in a dev build. Declared once here rather than in each file that
 * wants it: it was previously duplicated in bin.ts and server.ts, and a third
 * hardcoded copy in this file had drifted to 1.0.0 while the package was at
 * 1.10.0.
 */
declare const __PACKAGE_VERSION__: string;

export const VERSION =
  typeof __PACKAGE_VERSION__ === "string" ? __PACKAGE_VERSION__ : "0.0.0-dev";
