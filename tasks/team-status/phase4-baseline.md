# Phase 4 — Baseline State (2026-05-18)

Worktree: `/Users/siddhartha/Desktop/agiworkforce-phase4-contracts`
Branch: `claude/phase4-contracts-2026-05-18`
Off: `claude/refine-local-plan-yhjFU` @ `005299e55` (fix(mobile): make Metro bundle the full app — 4 fixes + lint config)

## Anchor packages (Phase 4 scope)

| Package                              | typecheck | test               | build |
| ------------------------------------ | --------- | ------------------ | ----- |
| `@agiworkforce/types`                | GREEN     | 163 pass / 5 files | GREEN |
| `@agiworkforce/llm-normalize`        | GREEN     | 52 pass / 4 files  | GREEN |
| `@agiworkforce/runtime`              | GREEN     | 116 pass / 5 files | GREEN |
| `@agiworkforce/mcp`                  | GREEN     | 5 pass / 1 file    | GREEN |
| `@agiworkforce/providers-anthropic`  | GREEN     | (see all)          | GREEN |
| `@agiworkforce/providers-openai`     | GREEN     | (see all)          | GREEN |
| `@agiworkforce/providers-google`     | GREEN     | (see all)          | GREEN |
| `@agiworkforce/providers-ollama`     | GREEN     | (see all)          | GREEN |
| `@agiworkforce/providers-deepseek`   | GREEN     | 3 pass / 1 file    | GREEN |
| `@agiworkforce/providers-lmstudio`   | GREEN     | 0 (no tests)       | GREEN |
| `@agiworkforce/providers-perplexity` | GREEN     | 3 pass / 1 file    | GREEN |
| `@agiworkforce/providers-xai`        | GREEN     | 7 pass / 2 files   | GREEN |

## Consumer surfaces (typecheck)

| Surface                 | Status             | Notes                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop`          | GREEN              | `tsc --noEmit` passes cleanly                                                                                                                                                                                                                                          |
| `apps/web`              | RED (pre-existing) | 7× TS2322 `number` vs `Timeout` errors in `lib/offline/offlineSync.ts`, `shared/lib/cache.ts`, `shared/lib/websocket.ts`, `shared/ui/ai-prompt-box.tsx`. Unrelated to Phase 4 contracts.                                                                               |
| `apps/mobile`           | RED (pre-existing) | 7× TS2307 cannot-find-module errors for files (`./customInstructions`, `./settingsDb`, `./telemetry`, `./db`, `./types`, `@/components/chat/PerformanceChip`) that exist as untracked WIP in main worktree but are not in base branch. Unrelated to Phase 4 contracts. |
| `apps/cli`              | N/A                | Rust-only; `cargo check --workspace` not yet exercised in this worktree                                                                                                                                                                                                |
| `apps/extension`        | GREEN              | No `typecheck` script; `pnpm build` produces dist/ cleanly                                                                                                                                                                                                             |
| `apps/extension-vscode` | GREEN              | `tsc --noEmit` passes cleanly                                                                                                                                                                                                                                          |

## Implication for Phase 4 gates

For consumer surface verification during Phase 4 batches we treat the **baseline-RED** errors in web + mobile as exempt — they pre-exist and are out of scope. Any **new** error introduced by a Phase 4 batch must be reverted. Tracked as known-bad in this baseline file so subagents do not chase them.

Concretely, Phase 4 batches must satisfy: after each commit

- The four anchor packages (`types`, `llm-normalize`, `runtime`, `mcp`) typecheck + test + build GREEN.
- All 8 provider packages typecheck + test + build GREEN.
- `apps/desktop` and `apps/extension-vscode` typecheck GREEN.
- `apps/extension` build GREEN.
- `apps/web` and `apps/mobile` typecheck **no worse** than baseline (same error set, same count).

## Notes for inventory phase

- `packages/runtime/src/index.ts` currently re-exports `agentContext` which depends on Node `AsyncLocalStorage` — known root cause of mobile bundle issues that `apps/mobile/lib/polyfills/async_hooks.cjs` mitigates. Phase 4 Step 5 splits this barrel.
- `packages/llm-runtime` (NOTE: separate from `runtime`) is an additional shared package not in the originally listed Phase 4 scope; inventory should determine whether it carries contract drift that needs normalization.
- `packages/types/src/tauri.ts` references DOM globals (`PerformanceEntry`, `Node`, `DOMRectReadOnly`) — typechecks fine when DOM lib is present but is structurally Tauri/web-only; flag during inventory.
