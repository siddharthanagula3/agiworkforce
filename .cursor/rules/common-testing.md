---
description: "Testing: coverage targets, TDD workflow, test types"
alwaysApply: true
---
# Testing Requirements

IMPORTANT: Do NOT run tests unless explicitly asked.

## Test Types

1. **Unit Tests** - Individual functions, utilities, components
   - Desktop: Vitest (`cd apps/desktop && pnpm test`)
   - Rust: `cargo test` (from repo root)
   - Web: `cd apps/web && pnpm test`
2. **Integration Tests** - API endpoints, database operations
3. **E2E Tests** - Critical user flows
   - Desktop: Playwright (`cd apps/desktop && pnpm test:e2e`)

## Running Specific Tests

```bash
# Single TypeScript test file
cd apps/desktop && pnpm test src/__tests__/foo.test.ts

# Single Rust test
cargo test -p agiworkforce-desktop -- module::test_name
```

## Test-Driven Development (when requested)

MANDATORY workflow:
1. Write test first (RED)
2. Run test - it should FAIL
3. Write minimal implementation (GREEN)
4. Run test - it should PASS
5. Refactor (IMPROVE)

## Common Gotchas

- Async state in tests needs `waitFor`
- `getByText` fails on duplicates — be specific
- Tauri mock: `tauri-mock.listen` is a SEPARATE `vi.fn()` from `@tauri-apps/api/event.listen`
- IPC param names must match exactly (camelCase)
- Fake timers vs `Date.now()` conflicts
