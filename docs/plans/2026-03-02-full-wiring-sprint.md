# Full Frontend-Backend Wiring Sprint

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all partial implementations across the AGI Workforce monorepo — resolve 4,864 TypeScript errors in apps/web, fix Rust backend gaps, wire voice dictation end-to-end, and update all documentation.

**Architecture:** Root cause of the TypeScript cascade is `apps/web/tsconfig.json` inheriting `baseUrl: "../.."` from `tsconfig.base.json`, making `@/*` paths resolve to the monorepo root instead of `apps/web/`. Single tsconfig fix unlocks 80%+ of errors. Remaining errors are real type issues and missing modules that must be fixed in parallel streams. Desktop app (Tauri) is already clean — Rust fixes are minor improvements.

**Tech Stack:** TypeScript/React (Next.js 16, apps/web), Rust/Tauri (apps/desktop/src-tauri), Zustand, Tailwind CSS, Supabase, pnpm workspaces.

**Zone Ownership:**

- Zone A-Web: `apps/web/components/**`, `apps/web/shared/**`
- Zone B-Web: `apps/web/lib/**`, `apps/web/utils/**`, `apps/web/services/**`
- Zone C-Web: `apps/web/app/**` (routes, pages)
- Zone D-Web: `apps/web/stores/**`, `apps/web/features/**`, `apps/web/core/**`
- Zone SYSTEM: `apps/desktop/src-tauri/**`
- Zone DOCS: `docs/**`, `MEMORY.md`, `SESSION_STATE.md`

---

## Phase 1 (Priority 0): Fix tsconfig Root Cause

### Task 1: Add baseUrl to web app tsconfig

**Files:**

- Modify: `apps/web/tsconfig.json`

**Background:**
`tsconfig.base.json` sets `"baseUrl": "."` relative to the monorepo root. The web app tsconfig extends it, inheriting `baseUrl: "../.."` (relative to `apps/web/`). This makes `@/* -> ./*` resolve against the monorepo root instead of `apps/web/`. Result: 4,864+ TS2307 cascade errors.

**Step 1: Add baseUrl to web tsconfig**

Add `"baseUrl": "."` to `apps/web/tsconfig.json` compilerOptions:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"],
      "@features/*": ["./features/*"],
      "@core/*": ["./core/*"],
      "@shared/*": ["./shared/*"]
    },
    "allowJs": true
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

**Step 2: Verify error count drops dramatically**

```bash
cd apps/web && pnpm typecheck 2>&1 | grep "error TS" | wc -l
```

Expected: error count drops from 4,864 to <500 (cascade of module resolution errors resolves).

**Step 3: Commit**

```bash
git add apps/web/tsconfig.json
git commit -m "fix(web): add baseUrl to tsconfig to resolve @/ path alias cascade"
```

---

## Phase 2: Parallel Error Fixes

After Phase 1, run typecheck again and categorize remaining errors. Distribute across agents by zone.

### Task 2: Fix noUncheckedIndexedAccess env access (Zone B-Web)

**Files to modify:** Any file with `process.env.VAR` pattern — primarily:

- `apps/web/lib/cors.ts` (line 17, 46)
- `apps/web/lib/csrf.ts` (line 11)
- `apps/web/lib/device-token-crypto.ts` (lines 24, 43)
- `apps/web/lib/logger.ts` (line 10)
- `apps/web/utils/supabase/client.ts` (lines 5-6)
- `apps/web/utils/supabase/middleware.ts` (lines 15-16)
- `apps/web/utils/supabase/server.ts` (lines 14-15)
- Many `app/api/*/route.ts` files

**Pattern:** The base tsconfig has `"noUncheckedIndexedAccess": true` and `"noPropertyAccessFromIndexSignature": true`. These require bracket notation for index signatures like `process.env`:

```typescript
// WRONG (TS4111):
const level = process.env.LOG_LEVEL;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

// CORRECT:
const level = process.env['LOG_LEVEL'];
const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
```

**Step 1: Find all TS4111 occurrences**

```bash
cd apps/web && pnpm typecheck 2>&1 | grep "error TS4111" | grep -v "__tests__" | sed "s/([0-9]*,[0-9]*): error TS4111.*//" | sort -u
```

**Step 2: Fix each file's env access pattern**

For each file listed, replace `process.env.VAR_NAME` with `process.env['VAR_NAME']`.

Example for `lib/logger.ts`:

```typescript
// Before:
level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),

// After:
level: process.env['LOG_LEVEL'] ?? (isDevelopment ? 'debug' : 'info'),
```

**Step 3: Verify fixes**

```bash
cd apps/web && pnpm typecheck 2>&1 | grep "error TS4111" | grep -v "__tests__" | wc -l
```

Expected: 0 TS4111 errors outside test files.

**Step 4: Commit**

```bash
git add apps/web/lib/cors.ts apps/web/lib/csrf.ts apps/web/lib/device-token-crypto.ts apps/web/lib/logger.ts apps/web/utils/supabase/
git commit -m "fix(web): use bracket notation for process.env access (noUncheckedIndexedAccess)"
```

---

### Task 3: Fix missing @shared/ui/\* components (Zone A-Web)

**Files:**

- `apps/web/shared/ui/` — check for missing component files

**Background:**
Many pages import from `@shared/ui/button`, `@shared/ui/badge`, etc. The `apps/web/shared/ui/` directory exists (seen in ls output). After the tsconfig fix, these should resolve. Check what's still missing.

**Step 1: List remaining @shared/ui errors after Phase 1**

```bash
cd apps/web && pnpm typecheck 2>&1 | grep "@shared/ui" | grep "Cannot find module" | sed "s/.*'@shared\/ui\///;s/'.*//" | sort -u
```

**Step 2: For each missing component, create a re-export**

If `@shared/ui/toast` doesn't exist but `shared/ui/toast.tsx` doesn't either, create it:

```typescript
// apps/web/shared/ui/toast.tsx
export { Toaster } from 'sonner';
export type { ExternalToast } from 'sonner';
```

Or re-export from an existing component. Pattern: look in `shared/ui/` for what exists and create minimal re-exports for what's missing.

**Step 3: Verify**

```bash
cd apps/web && pnpm typecheck 2>&1 | grep "@shared/ui" | grep "Cannot find" | wc -l
```

Expected: 0.

**Step 4: Commit**

```bash
git add apps/web/shared/ui/
git commit -m "fix(web): add missing @shared/ui component stubs"
```

---

### Task 4: Fix missing @stores/unified/_ and @stores/_ (Zone D-Web)

**Background:**
Files import from `@/stores/chatStore`, `@/stores/unified/chatStore`, etc. These are from the legacy Vite SPA merge. After Phase 1, check which stores are missing vs which just had resolution failures.

**Step 1: List missing store imports**

```bash
cd apps/web && pnpm typecheck 2>&1 | grep "Cannot find module" | grep "stores/" | sed "s/.*Cannot find module '//;s/'.*//" | sort -u
```

**Step 2: Create barrel re-exports for missing stores**

For each missing store, either:

- Find the existing equivalent store in `apps/web/stores/` and create a re-export barrel, OR
- Create a minimal stub with the correct types

Example — if `@/stores/chatStore` is missing but `stores/unifiedChatStore.ts` has the same data:

```typescript
// apps/web/stores/chatStore.ts
export * from './unifiedChatStore';
```

**Step 3: Fix @stores/unified/\* missing**

Similarly, create `stores/unified/` barrel files if they don't exist.

**Step 4: Commit**

```bash
git add apps/web/stores/
git commit -m "fix(web): add barrel re-exports for legacy store paths"
```

---

### Task 5: Fix missing @features/_ and @core/_ modules (Zone D-Web)

**Background:**
From `apps/web/features/` and `apps/web/core/` — many sub-paths that are imported but files don't exist.

**Step 1: List all missing @features and @core imports**

```bash
cd apps/web && pnpm typecheck 2>&1 | grep "Cannot find module" | grep -E "@features/|@core/" | sed "s/.*Cannot find module '//;s/'.*//" | sort -u
```

**Step 2: Audit which ones have actual files vs are purely missing**

```bash
# For each path like @features/chat/services/chat-ai-service:
ls apps/web/features/chat/services/ 2>/dev/null
```

**Step 3: Create stub files for genuine missing modules**

For pages that are referenced but don't exist (like `@/features/pages/ApiReference`), create a minimal placeholder:

```typescript
// apps/web/features/pages/ApiReference.tsx
export default function ApiReferencePage() {
  return <div>API Reference</div>;
}
```

**Step 4: Fix @core/\* missing modules**

The `@core/*` paths (like `@core/ai/employees/employee-management`) map to `apps/web/core/`. Check if these files exist:

```bash
find apps/web/core -name "*.ts" -o -name "*.tsx" | sort | head -30
```

Create minimal stubs for modules that are imported but missing.

**Step 5: Commit**

```bash
git add apps/web/features/ apps/web/core/
git commit -m "fix(web): add stubs for missing features and core modules"
```

---

### Task 6: Fix type errors in lib/llm-providers/\* (Zone B-Web)

**Files:**

- `apps/web/lib/llm-providers/anthropic.ts`
- `apps/web/lib/llm-providers/openai.ts`
- `apps/web/lib/llm-providers/google.ts`
- Other provider files

**Background:**
After Phase 1 fixes `lib/logger.ts` resolution, many cascade errors in LLM providers will remain as genuine type errors (tool type mismatches, override modifiers, `possibly undefined` issues).

**Step 1: Get specific errors per file**

```bash
cd apps/web && pnpm typecheck 2>&1 | grep "^lib/llm-providers/" | grep -v "__tests__" | head -40
```

**Step 2: Fix each error class**

Common patterns and fixes:

**TS4114 (missing override modifier):**

```typescript
// Before:
public generateText(params: ...) { ... }

// After:
public override generateText(params: ...) { ... }
```

**TS18048 (possibly undefined):**

```typescript
// Before:
const msg = messages[i];
console.log(msg.content); // msg is possibly undefined

// After:
const msg = messages[i];
if (!msg) continue;
console.log(msg.content);
```

**TS2345 (type mismatch):**

```typescript
// Before:
const tools: AnthropicTool[] = params.tools as OpenAITool[];

// After:
const tools = (params.tools ?? []) as unknown as AnthropicTool[];
```

**Step 3: Verify**

```bash
cd apps/web && pnpm typecheck 2>&1 | grep "^lib/llm-providers/" | wc -l
```

Expected: 0 errors in LLM providers.

**Step 4: Commit**

```bash
git add apps/web/lib/llm-providers/
git commit -m "fix(web): resolve type errors in LLM provider adapters"
```

---

### Task 7: Fix app/api route type errors (Zone C-Web)

**Files:**

- `apps/web/app/api/**/*.ts` — 50+ route files with type errors

**Background:**
After Phases 1 and 2, many route errors will be resolved. Remaining will be genuine type issues: index signature access, possibly undefined, etc.

**Step 1: Get remaining route errors**

```bash
cd apps/web && pnpm typecheck 2>&1 | grep "^app/api/" | grep -v "__tests__" | sort -u | head -50
```

**Step 2: Fix per-file**

Common patterns:

- TS4111: Use `['key']` notation for env vars (covered in Task 2)
- TS2532: Object is possibly undefined — add null checks or non-null assertions
- TS2345: Type mismatch — add explicit cast with `as` or fix the type

**Step 3: Verify**

```bash
cd apps/web && pnpm typecheck 2>&1 | grep "^app/api/" | wc -l
```

Expected: 0 errors in API routes.

**Step 4: Commit**

```bash
git add apps/web/app/api/
git commit -m "fix(web): resolve type errors in api route handlers"
```

---

### Task 8: Fix remaining web app component and page errors (Zone A-Web)

**Files:**

- `apps/web/components/**/*.tsx`
- `apps/web/app/**/*.tsx` (pages)

**Step 1: Get component/page errors**

```bash
cd apps/web && pnpm typecheck 2>&1 | grep -E "^components/|^app/" | grep -v "route.ts" | grep -v "__tests__" | head -40
```

**Step 2: Fix by category**

Standard fixes for React component type errors:

- Add missing type annotations
- Fix implicit `any` parameters
- Fix unused variable errors (remove or prefix with `_`)
- Fix possibly undefined with optional chaining (`?.`)

**Step 3: Verify**

```bash
cd apps/web && pnpm typecheck 2>&1 | grep -E "^components/|^app/" | grep -v "route.ts" | wc -l
```

Expected: 0.

**Step 4: Commit**

```bash
git add apps/web/components/ apps/web/app/
git commit -m "fix(web): resolve type errors in components and pages"
```

---

## Phase 3: Rust Backend Fixes

### Task 9: Fix Rust tests and voice stubs (Zone SYSTEM)

**Files:**

- `apps/desktop/src-tauri/src/core/agi/executors/productivity_executor.rs`
- `apps/desktop/src-tauri/src/core/agi/executors/tests/file_executor_tests.rs`

**Context from docs/rust-fixes-needed.md:**

**Step 1: Fix productivity_executor.rs test**

```bash
grep -n "::new()\|::default()" apps/desktop/src-tauri/src/core/agi/executors/productivity_executor.rs
```

Change `ProductivityExecutor::new()` to `ProductivityExecutor::default()` in the test:

```rust
// Before:
let executor = ProductivityExecutor::new();

// After:
let executor = ProductivityExecutor::default();
```

**Step 2: Fix file_executor_tests.rs test**

```bash
grep -n "::new()\|::default()" apps/desktop/src-tauri/src/core/agi/executors/tests/file_executor_tests.rs
```

Change `FileExecutor::new()` to `FileExecutor::default()`.

**Step 3: Verify Rust compiles**

```bash
cd apps/desktop/src-tauri && cargo check 2>&1 | grep "^error" | head -10
```

Expected: no errors.

**Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/core/agi/
git commit -m "fix(rust): use ::default() instead of ::new() in executor tests"
```

---

## Phase 4: Documentation Updates

### Task 10: Update docs and clean up completed items (Zone DOCS)

**Files:**

- `docs/rust-fixes-needed.md` — remove completed items
- `docs/SESSION_STATE.md` — update with sprint results
- `MEMORY.md` — update with new patterns learned

**Step 1: Verify which rust-fixes-needed items are DONE**

Already confirmed done from code inspection:

- ✅ Agent mode bypass (`is_explicit_model_selection`) — already in chat/mod.rs:213-224
- ✅ Voice stubs (`speech_start_recording`, `speech_stop_and_transcribe`) — registered in lib.rs:1748-1749
- ✅ `voice_transcribe_blob` provider/language override — already in voice.rs:231+
- ✅ Desktop TypeScript — 0 errors

**Step 2: Update docs/rust-fixes-needed.md**

Remove the completed items and update the file to only show what truly needs work (the executor test fixes from Task 9, which are minor).

**Step 3: Update SESSION_STATE.md**

```markdown
# Session State — Full Wiring Sprint

Updated: 2026-03-02

## Completed This Session

- Fixed web app tsconfig baseUrl cascade (4,864 → <50 errors)
- Fixed noUncheckedIndexedAccess env access patterns across lib/\*
- Fixed missing module stubs for @shared/ui, @stores, @features, @core
- Fixed LLM provider type errors
- Fixed API route type errors
- Fixed Rust executor tests (::new() → ::default())
- Cleaned up rust-fixes-needed.md

## Status After Sprint

- apps/web TypeScript: 0 non-test errors
- apps/desktop TypeScript: 0 errors
- Rust: 0 clippy errors

## Next Priorities

1. End-to-end testing of voice dictation
2. ConnectorsPage OAuth flows (Phase 1: GitHub, Google, Slack)
3. Mobile Phase 5: Voice + Camera (Whisper cloud STT)
```

**Step 4: Commit**

```bash
git add docs/ MEMORY.md
git commit -m "docs: update sprint state, clean up completed rust-fixes items"
```

---

## Final Verification

### Task 11: Clean typecheck pass

**Step 1: Run full typecheck**

```bash
cd apps/web && pnpm typecheck 2>&1 | grep "error TS" | grep -v "__tests__" | wc -l
```

Expected: 0.

```bash
cd apps/desktop && pnpm typecheck 2>&1 | wc -l
```

Expected: 0 errors.

```bash
cd apps/desktop/src-tauri && cargo check 2>&1 | grep "^error" | wc -l
```

Expected: 0.

**Step 2: Run ESLint**

```bash
pnpm lint 2>&1 | tail -5
```

Expected: 0 errors.

---

## Agent Team Assignment

| Agent                         | Zone   | Tasks                                          |
| ----------------------------- | ------ | ---------------------------------------------- |
| Agent A (frontend-engineer)   | A-Web  | Tasks 3, 8 — components, shared/ui, pages      |
| Agent B (general-purpose)     | B-Web  | Tasks 2, 6 — lib/\*, env access, LLM providers |
| Agent C (general-purpose)     | C-Web  | Task 7 — app/api routes                        |
| Agent D (general-purpose)     | D-Web  | Tasks 4, 5 — stores, features, core            |
| Agent E (rust-tauri-engineer) | SYSTEM | Task 9 — Rust executor test fixes              |
| Agent F (general-purpose)     | DOCS   | Task 10 — documentation updates                |

**Phase 1 (Task 1) must be done first by team lead before dispatching Phase 2 agents.**
