---
description: "TypeScript testing for AGI Workforce (Vitest + Playwright)"
globs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]
alwaysApply: false
---
# TypeScript/JavaScript Testing

> Extends the common testing rule with TypeScript/JavaScript specifics for AGI Workforce.

## Unit Testing: Vitest

```bash
cd apps/desktop && pnpm test                         # All tests
cd apps/desktop && pnpm test src/__tests__/foo.test.ts  # Single file
cd apps/desktop && pnpm test:coverage                # With coverage
```

## E2E Testing: Playwright

```bash
cd apps/desktop && pnpm test:e2e
```

## Tauri Mock Testing

Use `src/lib/tauri-mock.ts` for testing Tauri IPC in web mode:

```typescript
import { invoke } from '@/lib/tauri-mock'
```

Key gotcha: `tauri-mock.listen` is a SEPARATE `vi.fn()` from `@tauri-apps/api/event.listen`.
IPC param names must match exactly (camelCase).

## Web App Testing

```bash
cd apps/web && pnpm test
```

## API Gateway Testing

```bash
cd services/api-gateway && pnpm test
```
