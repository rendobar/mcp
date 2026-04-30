# Changelog

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
