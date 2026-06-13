# Changelog

## [1.3.0](https://github.com/rendobar/mcp/compare/v1.2.2...v1.3.0) (2026-06-13)


### Features

* document optional ffmpeg compute (gpu) param in submit_job ([#43](https://github.com/rendobar/mcp/issues/43)) ([1352a55](https://github.com/rendobar/mcp/commit/1352a55b4f5ec84eb8f617c18a5068096b048d1e))

## [1.2.2](https://github.com/rendobar/mcp/compare/v1.2.1...v1.2.2) (2026-06-10)


### Bug Fixes

* adopt @rendobar/sdk v3 upload API ([#41](https://github.com/rendobar/mcp/issues/41)) ([e5e3d38](https://github.com/rendobar/mcp/commit/e5e3d38493ea0f84fe7324bca0c7c5530698a489))

## [1.2.1](https://github.com/rendobar/mcp/compare/v1.2.0...v1.2.1) (2026-06-08)


### Bug Fixes

* align advertised job types and resolve CodeQL alerts ([#39](https://github.com/rendobar/mcp/issues/39)) ([62dac73](https://github.com/rendobar/mcp/commit/62dac73030529e75f9c75097cc7cdd260edc171c))

## [1.2.0](https://github.com/rendobar/mcp/compare/v1.1.0...v1.2.0) (2026-06-06)


### Features

* boot without an API key + Glama listing fixes ([#28](https://github.com/rendobar/mcp/issues/28)) ([6fcf70c](https://github.com/rendobar/mcp/commit/6fcf70c5e9df363c0001f50d08bb6ab68a55c5a3))

## [1.1.0](https://github.com/rendobar/mcp/compare/v1.0.6...v1.1.0) (2026-06-06)


### Features

* align ffmpeg input sources and served output ([#26](https://github.com/rendobar/mcp/issues/26)) ([10a96cf](https://github.com/rendobar/mcp/commit/10a96cfe204d4aeefc8f40ebf0f34c93eb1f5153))

## [1.0.6](https://github.com/rendobar/mcp/compare/v1.0.5...v1.0.6) (2026-06-01)


### Bug Fixes

* **registry:** add required per-package transport to server.json ([#23](https://github.com/rendobar/mcp/issues/23)) ([40920b4](https://github.com/rendobar/mcp/commit/40920b4f5ed6b81def6a6afe0a0a2a047f7e3918))

## [1.0.5](https://github.com/rendobar/mcp/compare/v1.0.4...v1.0.5) (2026-06-01)


### Bug Fixes

* **registry:** correct server.json schema for MCP registry publish ([#20](https://github.com/rendobar/mcp/issues/20)) ([9d823eb](https://github.com/rendobar/mcp/commit/9d823eb1f10b528158b1e3614a3eb14f55340a5e))

## [1.0.4](https://github.com/rendobar/mcp/compare/v1.0.3...v1.0.4) (2026-06-01)


### Bug Fixes

* **ci:** smoke test broken on npm 11 — install + run bin directly ([#18](https://github.com/rendobar/mcp/issues/18)) ([660407b](https://github.com/rendobar/mcp/commit/660407bf5edf2ca708b419e076ed4707e30420be))

## [1.0.3](https://github.com/rendobar/mcp/compare/v1.0.2...v1.0.3) (2026-05-31)


### Bug Fixes

* **ci:** smoke retry defeated by errexit; make npm publish idempotent ([#14](https://github.com/rendobar/mcp/issues/14)) ([d285c88](https://github.com/rendobar/mcp/commit/d285c8842b9747033603401809165c6d6820d22a))

## [1.0.2](https://github.com/rendobar/mcp/compare/v1.0.1...v1.0.2) (2026-05-31)


### Bug Fixes

* **ci:** mcp-publisher is a Go binary from GH Releases, not npm ([c32d5b1](https://github.com/rendobar/mcp/commit/c32d5b157aef1884012db65c19c286b32cefe32e))
* **ci:** smoke test — pass --version through npx unambiguously, log exit + raw output ([653d3e0](https://github.com/rendobar/mcp/commit/653d3e0dc458c5a026103f6b301d7e36b99afb0b))

## [1.0.1](https://github.com/rendobar/mcp/compare/v1.0.0...v1.0.1) (2026-05-01)


### Bug Fixes

* upload_file Blob body, jobTimeoutMin seconds, instructions only raw.ffmpeg ([1d4666f](https://github.com/rendobar/mcp/commit/1d4666f44af7fa99ac60989775cff7075d7eb000))

## [1.0.0](https://github.com/rendobar/mcp/compare/v1.0.0...v1.0.0) (2026-04-30)


### Features

* add JSON-to-stderr logger with console patching ([9a49496](https://github.com/rendobar/mcp/commit/9a4949656a5ae66e805dcf55f59c6f34de385f2e))
* add parseConfig with flag-env-file priority chain ([d0ca0f1](https://github.com/rendobar/mcp/commit/d0ca0f126c7fa5d4d1de57145a832588f4639182))
* add resolveSafe with realpath and roots enforcement ([6ab9511](https://github.com/rendobar/mcp/commit/6ab9511c0b1bb347480d728241173d6f59223200))
* add server bones — context, instructions, McpServer factory, stdio bin ([7a30eaa](https://github.com/rendobar/mcp/commit/7a30eaa0b42dc9824bb34981e59aba2e9bfdde7a))
* add withErrorMapping wrapper backed by ApiError ([6ebe836](https://github.com/rendobar/mcp/commit/6ebe8365c82bbd4c990845c47a9d6baea6557d62))
* **tools:** add defineTool helper and registerToolDef wrapper ([5ead016](https://github.com/rendobar/mcp/commit/5ead016b4faa430386e632dcb7e5407f8053c45c))
* **tools:** add get_account and list_jobs read-only tools + wire registerTools ([861207c](https://github.com/rendobar/mcp/commit/861207c00df5095c75c0b6201fb116e901ae9176))
* **tools:** add get_job, submit_job, cancel_job with active-types snapshot ([9c0ea81](https://github.com/rendobar/mcp/commit/9c0ea818cf53fb20fc4fc9881c4425f0f534ddd0))
* **tools:** add upload_file with size gate, cancellation, progress notifications ([56cd505](https://github.com/rendobar/mcp/commit/56cd505a7f2fddf34d3db0db7e847db029b35ef0))


### Bug Fixes

* **test:** wait for full JSON-RPC frame, bump ceiling to 10s for slow Windows CI ([f61a51e](https://github.com/rendobar/mcp/commit/f61a51e844b82bc2dfccb0be8c529349d342fda2))
* **test:** widen durationMs timing tolerance for fast CI runners ([1918ff5](https://github.com/rendobar/mcp/commit/1918ff53e802e4ba89ad1adad4accc4e182653ff))
* **tools:** destroy read stream on abort to release Windows file handles ([1402768](https://github.com/rendobar/mcp/commit/140276856c4939b34626b5ae136c3260520be5c6))

## Changelog
