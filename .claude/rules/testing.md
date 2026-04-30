---
description: Testing strategy, test pyramid, validation workflow, test locations
globs:
  - "**/__tests__/**"
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "vitest.config.*"
---

# Testing Strategy

## Philosophy: Validate-Then-Test

Every feature follows this cycle:
1. **Build** -- Implement the feature
2. **Validate** -- Verify it works (manual smoke via MCP Inspector, log review)
3. **Test** -- Write automated tests for the validated behavior
4. **Commit** -- Feature + tests committed together

## Test Pyramid

```
   /-----------------\
  /   Integration     \   Vitest -- MCP Client+Server in-memory (10-20)
 /----------------------\
/      Unit Tests        \  Vitest -- tool execute() bodies, schemas, helpers (50+)
/--------------------------\
```

No E2E tier. The MCP Inspector smoke (manual) covers the cross-process layer before release.

## When to Write What

| After completing... | Validation | Tests to write |
|---------------------|-----------|----------------|
| Single helper (config parser, path resolver) | Run vitest on it | Unit test |
| New tool `execute` body | Mock SDK + run unit | Unit test for execute, integration via in-memory client |
| Error mapping change | Run unit | Unit test for `withErrorMapping` |
| New transport / lifecycle code | Manual smoke via Inspector | Integration test through `InMemoryTransport` |
| Auth/credential resolution change | Run with fake env + file | Unit test for resolution chain priority |

## Test File Locations

```
src/__tests__/                          # Unit (co-located): pure helpers, schema parsing
test/unit/                              # Unit: tool execute() bodies with mocked SDK
test/integration/                       # Integration: full MCP Client+Server in-memory
test/integration/server.test.ts         # MCP Client+Server in-memory via InMemoryTransport
```

## Core Test Scenarios (must always pass)

### Unit (Vitest)
- Every Zod schema validates good input and rejects bad input
- `parseConfig()` resolves correctly from CLI args, env, file (priority order)
- `resolveSafe()` rejects path traversal, follows symlinks, normalizes Windows paths
- `withErrorMapping()` converts SDK ApiError → CallToolResult with `isError: true`
- Each tool's `execute()` produces the expected `structuredContent` shape
- Logger writes to stderr (fd 2), never stdout

### Integration (Vitest, in-memory)
- `createRendobarMcpServer()` connects via `InMemoryTransport.createLinkedPair()`
- Client receives tool list with correct annotations
- `upload_file` streams a real fixture file end-to-end (mocked SDK)
- `submit_job` round-trips: client.callTool → SDK mock → response with structuredContent
- Error path: SDK throws ApiError → client receives `isError: true` content
- `--read-only` filter actually hides destructive tools from the listing

## Test Configuration

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
  },
});
```

## Validation Commands

```bash
# Run all tests
pnpm test

# Run specific file
pnpm vitest run test/integration/server.test.ts

# Watch mode during development
pnpm vitest

# Manual smoke (before release)
npx @modelcontextprotocol/inspector node dist/bin.js
```
