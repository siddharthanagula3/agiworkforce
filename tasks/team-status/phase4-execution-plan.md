# Phase 4 — Execution Plan

Generated: 2026-05-18
Inventory commit: `cdb573362`

## Tool-availability note for the founder

The supervisor in this session has Bash, Read, WebFetch, and WebSearch tools but **does NOT have an `Agent`/`Task`, `SendMessage`, or `AskUserQuestion` tool exposed**. Per the directive, the supervisor would normally delegate batches to `contracts-mover-N` agents and use `SendMessage` hourly. Here, the supervisor will:

- Execute each batch directly (scope-bounded; one batch = one logical change ≤ 5 files; commit explicitly per batch).
- Verify gates after each commit (anchor + provider + desktop + vscode-extension typecheck/test/build green; web/mobile no-worse-than-baseline).
- Surface all open questions for the founder in the **final return message**, not mid-stream.

If the founder prefers true multi-agent delegation, they can re-dispatch the plan in a session where `Agent` is available; the per-batch artifacts here are self-contained.

## Batches (sequential)

Each batch has: scope, files, expected diff, gate, rollback condition.

### Batch 1 — Consolidate PlanTier into packages/types

Scope: Move the **correct** PlanTier union to `packages/types/src/` and replace the stray bad definition in `packages/types/src/tauri.ts` and the canonical definition in `packages/runtime/src/state/AppStateStore.ts` with re-imports. Both packages must continue to re-export PlanTier from their existing barrel paths for backward compatibility.

Files touched:

1. `packages/types/src/plan-tier.ts` (NEW) — canonical `PlanTier` union with 7 entries (`local-only`, `byok`, `hobby`, `pro`, `max`, `enterprise`, plus `free` as legacy alias).
2. `packages/types/src/index.ts` — re-export `PlanTier` from `./plan-tier`.
3. `packages/types/src/tauri.ts` — delete the wrong `PlanTier` union at line 313, replace with `export type { PlanTier } from './plan-tier'` (or just remove the stray definition; the barrel already re-exports it).
4. `packages/runtime/src/state/AppStateStore.ts` — replace `export type PlanTier = ...` at line 56 with `export type { PlanTier } from '@agiworkforce/types'` (re-export for backward compat). All existing imports of `PlanTier` from `@agiworkforce/runtime` continue to work.
5. `packages/runtime/src/state/index.ts` — no change needed (still re-exports `PlanTier`).

Gate: types tests (`pnpm --filter @agiworkforce/types test`) + runtime tests (`pnpm --filter @agiworkforce/runtime test`) + desktop typecheck (`pnpm --filter @agiworkforce/desktop typecheck`) all GREEN.

Risk: LOW. PlanTier consumers across the repo continue to receive an identical union. The semantic change is "tauri.ts no longer has its OWN incorrect PlanTier" — but the barrel already re-exports the canonical one, so consumers were never reading the stray.

Verification: `grep -rn "type PlanTier =" packages/` should show exactly one definition after the batch.

### Batch 2 — Verify ProviderId canonical location

Scope: Read `packages/types/src/provider.ts` and `packages/types/src/design-system/provider-display.ts` to confirm canonical `ProviderId`. If both define it, one must re-export from the other. No file moves.

Files touched (at most):

1. `packages/types/src/design-system/provider-display.ts` — change `export type ProviderId = ...` to `import type { ProviderId } from '../provider'; export type { ProviderId };` (or similar) IF and only IF `packages/types/src/provider.ts` defines the canonical `ProviderId` union.

Gate: types tests + types typecheck GREEN. Consumer typechecks (desktop + vscode-ext) GREEN. Web + mobile no-worse-than-baseline.

Risk: LOW. Pure re-export adjustment within types package.

### Batch 3 — Eliminate ChatMessage drift inside packages/{local-llm,unified-chat}

Scope: `packages/local-llm/src/types.ts` and `packages/unified-chat/src/lib/types.ts` may locally define `ChatMessage` (and ToolCall). Inventory flagged both. Phase 4 scope says **shared packages** are in-scope, so this is appropriate.

Files touched (likely):

1. `packages/local-llm/src/types.ts` — replace local `ChatMessage` with `import type { ChatMessage } from '@agiworkforce/types'`, keep a re-export `export type { ChatMessage }` for downstream compat.
2. `packages/unified-chat/src/lib/types.ts` — same.

Gate: both packages typecheck + test + build GREEN (need to check if they have their own scripts). Anchor + provider + desktop + vscode-ext gates as standard.

Risk: LOW IF the local definitions are structurally identical to the canonical. MEDIUM IF they diverge — in which case the batch is split or postponed.

PRE-FLIGHT CHECK: read both files and compare to `packages/types/src/chat.ts:51` before executing.

### Batch 4 — Verify packages/api Session/Conversation re-imports

Scope: `packages/api/src/chat.ts` defines `Session`/`Conversation`-shaped types. Verify it imports from `@agiworkforce/types` rather than redeclaring.

Files touched (at most):

1. `packages/api/src/chat.ts` — replace local definition with import.

Gate: typecheck the entire repo (anchor + providers + apps).

Risk: LOW.

### Batch 5 — Runtime split (Path Y, per inventory proposal)

**HELD FOR FOUNDER OK.** See `reference-index/phase4-runtime-split-proposal.md` § "Open question for founder". Path X (originally directed) vs Path Y (revised based on grep evidence) is a structural decision the founder owns.

If/when founder approves Path Y:

1. Create `packages/runtime/src/node.ts` (NEW) — exports ONLY `agentContext` symbols.
2. Modify `packages/runtime/src/index.ts` — remove the `agentContext` re-exports (the 8 entries between "Per-command async context isolation" and "Central state architecture").
3. Update `packages/runtime/package.json` `"exports"` map to add `"./node": "./src/node.ts"`.
4. Delete `apps/mobile/lib/polyfills/async_hooks.cjs`.
5. Edit `apps/mobile/metro.config.js` to remove the resolver branch that maps `node:async_hooks`.

Two desktop consumers (`apps/desktop/src/lib/skillLoader.ts`, `apps/desktop/src/stores/bridge/stateBridge.ts`) do NOT need migration under Path Y because `appStateStore` stays in the universal barrel.

Gate (Path Y): full anchor gates GREEN; mobile bundle (`npx expo export --platform ios`) succeeds with NO polyfill; mobile typecheck no-worse-than-baseline; desktop typecheck GREEN; web build GREEN; vscode-extension build GREEN; chrome-extension build GREEN.

Risk: LOW under Path Y. MEDIUM under Path X (requires migrating 2 desktop files).

## What this plan does NOT do

- Does not move `packages/types/src/models.json` (locked).
- Does not move `packages/types/src/model-catalog.ts` (locked).
- Does not modify any file in `packages/llm-normalize/` (OpenClaw-attributed; explicit founder gate).
- Does not modify any provider adapter beyond verifying tests stay green.
- Does not move/rename `packages/types/src/tauri.ts` (touches consumers across surfaces — Phase 5+).
- Does not touch `apps/cli/`, `apps/desktop/`, `apps/web/`, `apps/mobile/`, `apps/extension/`, `apps/extension-vscode/` source files **except** the 2 desktop files and 1 mobile metro config under Batch 5 (and only if founder approves).
- Does not push to remote. Does not open a PR.

## Final-state expectations after batches 1-4 (without Step 5)

- `grep -rn "type PlanTier =" packages/` → 1 result (the canonical one).
- `grep -rn "interface ChatMessage" packages/{local-llm,unified-chat}/` → 0 results.
- All anchor + provider + desktop + vscode-ext gates GREEN.
- All web + mobile typecheck no-worse-than-baseline.

## Per-batch verification template

```
1. Pre: cd worktree; git status (must be clean except for current batch staging)
2. Read each file to be touched; confirm exactly what changes
3. Edit the file(s) — ≤5 per batch
4. Run all batch-relevant gates:
   - pnpm --filter @agiworkforce/types test
   - pnpm --filter @agiworkforce/llm-normalize test
   - pnpm --filter @agiworkforce/runtime test
   - pnpm --filter @agiworkforce/mcp test
   - pnpm --filter '@agiworkforce/providers-*' typecheck
   - pnpm --filter @agiworkforce/desktop typecheck
   - pnpm --filter agi-workforce typecheck
   - pnpm --filter @agiworkforce/extension build
   - pnpm --filter @agiworkforce/web typecheck → compare error set to baseline
   - pnpm --filter @agiworkforce/mobile typecheck → compare error set to baseline
5. If any anchor/provider/desktop/vscode/extension gate regresses → ROLLBACK the batch (`git restore .`)
6. If gates green → git add <explicit paths>; git commit with conventional message
7. Append result to tasks/team-status/phase4-supervisor-status.md
```
