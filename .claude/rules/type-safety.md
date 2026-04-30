# Type Safety — Zero Escape Hatches

TypeScript's value is erased the moment you bypass it. These rules are non-negotiable.

## BANNED (never in production code)

### `as any` — NEVER

`as any` turns off the type system entirely. It propagates untyped values through call chains and makes refactors silently dangerous.

```typescript
// BANNED
const data = response as any;
const items: any[] = result.items;
function handle(data: any) { ... }

// DO THIS INSTEAD
const data: unknown = response;
const parsed = schema.parse(data);  // Zod narrows to exact type
function handle(data: unknown) {
  const validated = schema.parse(data);
}
```

**The only exception**: Test files that intentionally pass malformed data to verify error handling. Even then, prefer `as unknown`.

### `@ts-ignore` — NEVER

Use `@ts-expect-error` instead (it fails when the error is fixed, so it won't silently persist). But even `@ts-expect-error` is restricted (see below).

---

## RESTRICTED (requires justification)

### `as` type assertions (except `as const`)

Every `as` (except `as const`) must have an inline comment explaining:
1. Why the compiler can't infer the type
2. What invariant guarantees safety

```typescript
// BAD — no explanation
const pair = Object.values(wsPair) as [WebSocket, WebSocket];

// ACCEPTABLE — justified
// SDK always returns exactly 2 sockets in the pair
const [client, server] = Object.values(wsPair) as [WebSocket, WebSocket];
```

**Prefer these alternatives to `as`:**

| Instead of `as` | Use |
|---|---|
| `data as MyType` | `schema.parse(data)` (Zod at boundary) |
| `obj as Config` | `obj satisfies Config` (for literals) |
| `event.payload as X` | Discriminated union + switch (auto-narrows) |
| `value as string` | Type guard: `if (typeof value === "string")` |
| `result as unknown as T` | Fix the generic constraint — double assertion means your types are fundamentally wrong |

**If a file has more than 2 type assertions (excluding `as const`), the types need restructuring, not more assertions.**

### `!` non-null assertions

Every `!` must have a visible control flow reason within 3 lines (a preceding `if`, `throw`, `assert`, or guard), OR a comment explaining the invariant.

```typescript
// BAD — nothing guarantees this
const tool = map.get(toolName)!;

// GOOD — guard + throw
const tool = map.get(toolName);
if (!tool) throw new Error(`Tool ${toolName} not registered`);
// tool is now narrowed to non-undefined

// ACCEPTABLE — invariant documented
// parseConfig() guarantees apiKey exists after validation
const apiKey = ctx.options.apiKey!;
```

**Prefer throwing on null over asserting non-null.** A crash with a clear error message is infinitely better than a crash with `Cannot read properties of undefined`.

### `@ts-expect-error`

Must include a comment explaining the specific bug and ideally a link to the upstream issue:

```typescript
// @ts-expect-error — @modelcontextprotocol/sdk Zod overload regression, see issue #1180
const tool = server.registerTool(name, def, handler);
```

---

## DISCOURAGED (signals a design problem)

### Deep optional chaining (`?.` more than 2 levels)

If you need `a?.b?.c?.d`, your data model doesn't reflect your invariants.

```typescript
// DISCOURAGED — 3+ levels of ?.
const limit = ctx?.options?.toolsets?.length ?? 0;

// GOOD — validate at boundary, use guaranteed types internally
interface RendobarContext {
  sdk: RendobarClient;
  logger: Logger;
  options: { toolsets: string[]; readOnly: boolean };
}
// After parseConfig(), context guarantees all fields exist
const limit = ctx.options.toolsets.length;
```

**When `?.` IS appropriate:**
- Genuinely optional data (optional MCP `_meta` field, optional progress token)
- External/untrusted data before validation boundary
- Third-party API responses you don't control

### `??` on fields guaranteed by validation

If Zod `.parse()` ran and the schema has `.default()`, the parsed type is non-optional. Adding `??` is redundant and hides bugs.

```typescript
// DISCOURAGED — apiBase is guaranteed by schema after parse
const baseUrl = config.apiBase ?? "https://api.rendobar.com";

// GOOD — let the schema handle defaults
const schema = z.object({ apiBase: z.string().default("https://api.rendobar.com") });
const config = schema.parse(raw);
config.apiBase; // string, always present

// OK — environment variables with documented defaults
const logLevel = process.env.RENDOBAR_LOG_LEVEL ?? "info";
```

---

## REQUIRED PRACTICES

### 1. Parse at boundaries, trust internally

Every system boundary (tool input arguments, config file, env vars, SDK responses we don't control) must parse with Zod. After parsing, trust the types — no re-checking, no assertions, no optional chaining on guaranteed fields.

```
Tool args in -> Zod .parse() -> typed data -> tool execute (fully typed, zero assertions)
```

### 2. Discriminated unions for state modeling

When an object can be in N states, model it as a union on a literal field:

```typescript
// BAD — optional fields allow impossible states
interface Job { status: string; result?: Result; error?: string }

// GOOD — each state has exactly the fields it needs
type Job =
  | { status: "waiting" }
  | { status: "running"; startedAt: number }
  | { status: "complete"; result: Result; completedAt: number }
  | { status: "failed"; error: string; failedAt: number };
```

### 3. Exhaustive switch with `never`

Every switch on a discriminated union must have a `default: never` case:

```typescript
function handle(event: JobEvent): void {
  switch (event.type) {
    case "job.created": /* ... */ break;
    case "job.completed": /* ... */ break;
    default: {
      const _exhaustive: never = event;
      throw new Error(`Unhandled: ${(_exhaustive as JobEvent).type}`);
    }
  }
}
// Adding a new event type without handling it = compile error
```

### 4. `satisfies` over `as` for object literals

```typescript
// BAD
const config = { timeout: 5000 } as Config;

// GOOD — checks shape AND preserves literal types
const config = { timeout: 5000 } satisfies Config;
```

### 5. `unknown` over `any` in function signatures

If a function accepts arbitrary data, type it as `unknown` and narrow inside:

```typescript
// BAD
function process(data: any) { ... }

// GOOD
function process(data: unknown) {
  const validated = schema.parse(data);
}
```

### 6. Return types that make impossible states unrepresentable

```typescript
// BAD — both present? both absent? who knows
function fetch(): { data?: T; error?: string }

// GOOD — exactly one is present
function fetch(): { data: T } | { error: string }
```
