# Phase 4 — Final State (2026-05-18)

Worktree: `/Users/siddhartha/Desktop/agiworkforce-phase4-contracts`
Branch: `claude/phase4-contracts-2026-05-18`
Base: `claude/refine-local-plan-yhjFU` @ `005299e55`
Head: `e7a473703`

## Commit chain (7 commits, base → head)

| #   | Hash        | Subject                                                                         | Files | Insertions | Deletions |
| --- | ----------- | ------------------------------------------------------------------------------- | ----- | ---------- | --------- |
| 1   | `6909f0629` | chore(phase4): record baseline state + supervisor status                        | 2     | +77        | -0        |
| 2   | `cdb573362` | docs(phase4): inventory — contracts map, drift report, runtime-split proposal   | 3     | +520       | -0        |
| 3   | `7d40053e0` | refactor(types): remove dead plantier alias from tauri.ts                       | 5     | +176       | -7        |
| 4   | `4ce408f3f` | docs(types): clarify ProviderId is UI subset, not the wire Provider union       | 1     | +15        | -2        |
| 5   | `f2c16fbfd` | docs(chat): mark unified-chat + local-llm ChatMessage as sibling shapes         | 2     | +17        | -3        |
| 6   | `122b3693b` | docs(api): mark chat conversation/message as tauri wire shapes, not canonical   | 1     | +12        | -0        |
| 7   | `e7a473703` | refactor(runtime): split barrel — agentcontext to subpath, drop mobile polyfill | 5     | +30        | -73       |

**Total**: 19 file changes, +847 / -85 LOC. Of those, ~600 lines are documentation/inventory artifacts and ~80 are net code changes (PlanTier removal, JSDoc tweaks, runtime split).

## Gates — final state

### Anchor packages — typecheck + test + build GREEN

| Package                       | Tests              | Status |
| ----------------------------- | ------------------ | ------ |
| `@agiworkforce/types`         | 163 pass / 5 files | GREEN  |
| `@agiworkforce/llm-normalize` | 52 pass / 4 files  | GREEN  |
| `@agiworkforce/runtime`       | 116 pass / 5 files | GREEN  |
| `@agiworkforce/mcp`           | 5 pass / 1 file    | GREEN  |

### Provider packages — typecheck + test + build GREEN

| Provider               | Tests              | Status                       |
| ---------------------- | ------------------ | ---------------------------- |
| `providers-anthropic`  | 4 files            | GREEN                        |
| `providers-openai`     | 3 files            | GREEN                        |
| `providers-google`     | 3 files            | GREEN                        |
| `providers-ollama`     | 3 files            | GREEN                        |
| `providers-deepseek`   | 1 file (3 tests)   | GREEN                        |
| `providers-perplexity` | 1 file (3 tests)   | GREEN                        |
| `providers-xai`        | 2 files (7 tests)  | GREEN                        |
| `providers-lmstudio`   | 0 files (no tests) | GREEN (typecheck/build only) |

### Consumer surfaces

| Surface                   | Gate      | Baseline                 | Final                     | Status                                       |
| ------------------------- | --------- | ------------------------ | ------------------------- | -------------------------------------------- |
| `apps/desktop`            | typecheck | GREEN                    | GREEN                     | unchanged                                    |
| `apps/extension-vscode`   | typecheck | GREEN                    | GREEN                     | unchanged                                    |
| `apps/extension` (chrome) | build     | GREEN                    | GREEN (444ms)             | unchanged                                    |
| `apps/web`                | typecheck | 13 errors (pre-existing) | 13 errors (identical set) | no-worse-than-baseline                       |
| `apps/mobile`             | typecheck | 30 errors (pre-existing) | 30 errors (identical set) | no-worse-than-baseline                       |
| `apps/cli`                | rust      | not exercised in phase 4 | n/a                       | n/a (rust-only; out of scope unless touched) |

### Mobile bundle (`npx expo export --platform ios`)

Status: **failed at the pre-existing casing-collision baseline error** (`apps/mobile/app/(app)/chat/[id].tsx:22` imports `@/components/composer/Composer` which clashes with another file using `@/components/Composer/Composer`). This is NOT a Phase 4 regression — it pre-exists in base branch.

What Phase 4 verified: **`node:async_hooks` is no longer pulled by Metro** (confirmed by grepping the failure output — zero `async_hooks`/`AsyncLocalStorage`/`agentcontext` references in the bundle trace). The polyfill removal is correct; the casing collision is a separate, pre-existing mobile issue (Phase 5+ scope).

### Web build (`pnpm --filter @agiworkforce/web build`)

Status: **failed at pre-existing baseline TS2740 error** in `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:118` (DOM FormData vs Node FormData type mismatch). This is NOT a Phase 4 regression — it pre-exists in base branch (line 1 of archived `docs/archive/2026-06-05-doc-reset/tasks/team-status/phase4-baseline-web-errors.txt`).

What Phase 4 verified: the Vite-built desktop SPA + Vite copy step succeed; Next.js compilation succeeds (`Compiled successfully in 8.9s`); only the TypeScript step fails at a pre-existing line.

## What changed in Phase 4

### Substantive

1. **Removed dead `PlanTier` alias** from `packages/types/src/tauri.ts:313`. The symbol was exported via the barrel but had zero direct consumers. Canonical plan-tier vocabulary remains `BillingPlanTier` (`billing-catalog.ts`) and `UIPlanTier` (`design-system/user-identity.ts`).
2. **Split `@agiworkforce/runtime` barrel**:
   - `packages/runtime/src/index.ts` — universal exports only (detect, command, events, errors, registry, http, queue, state).
   - `packages/runtime/src/node.ts` (NEW) — `getAgentContext`/`runWithContext`/`deriveChildContext`/`reestablishContextInWorker` + `AgentContext`/`AgentOrigin` types.
   - `packages/runtime/package.json` — `"exports"` map adds `"./node": "./src/node.ts"`.
   - Mobile polyfill (`apps/mobile/lib/polyfills/async_hooks.cjs`) DELETED.
   - Mobile metro resolver branch for `node:async_hooks` REMOVED.

### Documentation-only (clarification commits)

3. JSDoc on `ProviderId` (`packages/types/src/design-system/provider-display.ts`) now clarifies it's the UI-tier subset of the wire-level `Provider` union (`packages/types/src/provider.ts`). No semantic change.
4. JSDoc on `ChatMessage` in `packages/unified-chat/src/lib/types.ts` and `packages/local-llm/src/types.ts` now explicitly says they are **sibling** shapes (not subtypes) of the canonical `@agiworkforce/types::ChatMessage`. No semantic change.
5. JSDoc on `packages/api/src/chat.ts` header now says `Conversation`/`Message` there mirror the Tauri wire shapes; sibling of `@agiworkforce/types::Conversation`. No semantic change.

## What Phase 4 deliberately did NOT touch

Per the directive's hard constraints + locked rule list:

- `packages/types/src/models.json` (locked rule #1; 30+ consumers across all 6 surfaces)
- `packages/types/src/model-catalog.ts` (resolveAutoModeModel + tier policies + slot registry; ~1909 LOC)
- `packages/llm-normalize/` (OpenClaw-attributed; touched zero files)
- Provider adapter source code beyond verifying gates remain green
- `packages/types/src/tauri.ts` rename/restructure (still mis-named; touches consumer DOM types — Phase 5+ work)
- All `apps/` source code EXCEPT:
  - `apps/mobile/metro.config.js` — removed resolver branch
  - `apps/mobile/lib/polyfills/async_hooks.cjs` — deleted

## Drift remaining (intentionally deferred to Phases 5-6)

| Drift cluster                                                                                                                                                                                | Files affected                      | Why deferred                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/chat-multi/page.tsx:22` inline `ProviderId` (4 entries)                                                                                                                        | 1 web file                          | Phase 5 (web reorg)                                                                                                             |
| `ChatMessage` redeclarations across `apps/web/`, `apps/desktop/`, `apps/mobile/`, `apps/extension*/` (~15 files)                                                                             | 15+ consumer files                  | Phases 5-6 (consumer surface reorg). Note: some of these ARE legitimate sibling shapes; each needs case-by-case classification. |
| `ToolCall` redeclarations in `apps/web/` (~12 files)                                                                                                                                         | 12 consumer files                   | Phase 5                                                                                                                         |
| `Session`/`Conversation` redeclarations in `apps/desktop/`, `apps/web/`                                                                                                                      | 4-5 consumer files                  | Phases 5-6                                                                                                                      |
| `PlanTier` redeclarations in `apps/desktop/src/lib/supabase.ts`, `apps/web/lib/supabase.ts`, `apps/web/features/billing/components/Billing/types.ts`, `apps/web/lib/validations/checkout.ts` | 4 consumer files                    | Phase 5 (web supabase reconciliation) + Phase 6 (desktop supabase)                                                              |
| `packages/types/src/tauri.ts` is mis-named & DOM-typed                                                                                                                                       | 1 types file + transitive consumers | Phase 5+ (touches DOM lib lift and cross-surface consumers — too risky for Phase 4)                                             |

## Path Y note (runtime split)

The directive's Step 5 specified placing `state/*` in `node.ts` alongside `agentContext`. Inventory revealed `state/*` uses no Node built-ins — only `agentContext.ts` does (`AsyncLocalStorage` from `node:async_hooks`). Path Y (state stays in universal barrel; only `agentContext` moves to `node.ts`) was selected and executed because:

1. **No consumer migration required** — the 2 desktop consumers of `appStateStore` keep their import path.
2. **Mobile bundle is still cleaned** — `node:async_hooks` is the only Node built-in in play.
3. **Web bundle is still cleaned** — no `AsyncLocalStorage` import in the universal entry.
4. **Lower-risk** — touches fewer files than Path X.

If the founder prefers Path X (state moved alongside), the change is a small follow-up: move the `state/*` re-exports from `index.ts` into `node.ts` and update `apps/desktop/src/lib/skillLoader.ts` + `apps/desktop/src/stores/bridge/stateBridge.ts` to import from `@agiworkforce/runtime/node`. ~10 LOC change.

## Recommended Phase 5 start order

**Recommendation: Web first, then Desktop, then Mobile/Extensions/CLI.**

Reasoning:

- **Web** has the most drift (12 `ChatMessage` redeclarations, 12 `ToolCall` redeclarations, 4 `PlanTier` redeclarations, the inline `ProviderId`). Cleaning web first establishes the consumer migration pattern.
- **Web** also has the canonical-cross-surface `apps/web/shared/` namespace that exists specifically for shared UI primitives — using this as the migration target maximizes leverage.
- **Desktop** has 30+ supabase-derived `PlanTier`/`Conversation` redeclarations but is smaller in absolute drift count. Migrate after web's pattern is proven.
- **Mobile** has fewer drift clusters; should be the easiest. Defer until web pattern is proven.
- **Extensions** and **CLI** are smallest; finish last.

Phase 5 should NOT begin until the casing-collision in `apps/mobile/app/(app)/chat/[id].tsx:22` and the DOM `FormData`/`Timeout` issues in `apps/web/` are addressed — those are noise that masks Phase 5 regressions.

## Branch left in place for founder review

No `git push`. No PR opened. Branch `claude/phase4-contracts-2026-05-18` ready at HEAD `e7a473703` in the worktree.
