# Phase 4 — Drift Report

Generated: 2026-05-18
Worktree: `/Users/siddhartha/Desktop/agiworkforce-phase4-contracts`

## Definition of drift

A drift cluster is a conceptual type whose definition appears in **two or more files** with non-trivial divergence, instead of being imported from `@agiworkforce/types`. Drift causes contract violations to be silent (the compiler accepts each definition independently) and is the primary problem Phase 4 must reduce.

## Cluster 1 — `PlanTier` (six definitions)

Canonical: `packages/types/src/tauri.ts:313` says `'free' | 'hobby' | 'pro' | 'max' | 'enterprise' | 'none'` — but this is **wrong against the locked 6-tier list**.

| File                                                      | Definition                                                                                            | Status                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/runtime/src/state/AppStateStore.ts:56`          | `'local-only' \| 'byok' \| 'hobby' \| 'pro' \| 'max' \| 'enterprise' \| 'free'` (free = legacy alias) | Matches locked tier list (correct) but lives in the wrong package |
| `packages/types/src/tauri.ts:313`                         | `'free' \| 'hobby' \| 'pro' \| 'max' \| 'enterprise' \| 'none'`                                       | Missing `local-only` + `byok`; has stray `none`                   |
| `apps/desktop/src/lib/supabase.ts:198`                    | Local re-definition                                                                                   | Drift                                                             |
| `apps/web/lib/supabase.ts:75`                             | `'hobby' \| 'free' \| 'pro' \| 'max' \| 'enterprise'`                                                 | Drift, missing `local-only`/`byok`                                |
| `apps/web/lib/validations/checkout.ts:13`                 | Derived from `PlanTierSchema` (zod)                                                                   | Drift, but schema-shape; OK to keep                               |
| `apps/web/features/billing/components/Billing/types.ts:4` | `(typeof VALID_PLANS)[number]`                                                                        | Drift, derives from local const                                   |

**Phase 4 action:** Move the **correct** definition (the runtime one with all 6 + `free` alias) to `packages/types/src/billing-catalog.ts` (or a new `packages/types/src/plan-tier.ts`). Replace the stray `tauri.ts:313` and `apps/web/lib/supabase.ts:75` and `apps/desktop/src/lib/supabase.ts:198` definitions with `import type { PlanTier } from '@agiworkforce/types'`. Keep the runtime barrel re-exporting it for backward compat. Web zod-derived form stays (it's a schema, not a drift cluster) but should match the canonical union.

**Risk:** Medium. PlanTier is referenced in tier-policies + billing-catalog + auth code paths. Test coverage in `packages/types/src/__tests__/tier-policies.test.ts` is the safety net.

## Cluster 2 — `ChatMessage` (18 definitions)

Canonical: `packages/types/src/chat.ts:51` is `export interface ChatMessage { ... }`. There's also a JSDoc-shape reference in `packages/types/src/conversation.ts:281` (`@example interface ChatMessage extends MessageBase`).

Local drift in:

- `apps/extension-vscode/src/__tests__/api.test.ts`
- `apps/extension/src/side_panel.ts`
- `apps/mobile/types/chat.ts`
- `apps/web/features/chat/components/Main/MultiAgentChatInterface.tsx`
- `apps/web/features/chat/stores/chat-store.ts`
- `apps/web/lib/llm-providers/context-management.ts`
- `apps/web/shared/hooks/index.ts` and `apps/web/shared/hooks/useChatState.ts`
- `apps/web/shared/stores/index.ts` and `apps/web/shared/stores/multi-agent-chat-store.ts`
- `apps/web/shared/types/common.ts`, `apps/web/shared/types/complete-ai-employee.ts`, `apps/web/shared/types/index.ts`
- `apps/web/shared/utils/validation-schemas.ts`
- `packages/local-llm/src/types.ts`
- `packages/unified-chat/src/lib/types.ts`

**Phase 4 action:** OUT OF SCOPE. Phase 4 limits changes to `packages/{types,llm-normalize,providers,runtime,mcp}`. Consumer-surface `ChatMessage` drift falls in Phases 5-6 (web, desktop, CLI, extensions). The Phase 4 deliverable here is: ensure `packages/types/src/chat.ts` is the single authoritative `ChatMessage` and `packages/unified-chat`/`packages/local-llm` (both Phase 4-adjacent) import from it instead of defining their own.

**Phase 4 in-scope:** verify `packages/local-llm` and `packages/unified-chat` are not redefining `ChatMessage` in a way that drifts from `@agiworkforce/types`; if they are, replace with an import.

## Cluster 3 — `ProviderId` (two definitions)

| File                                                     | Definition                                                                       | Status                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/types/src/design-system/provider-display.ts:7` | Canonical, lives under design-system                                             | OK location? Note: design-system seems wrong package for the cross-cutting `ProviderId` |
| `packages/types/src/provider.ts`                         | (separate provider type definitions)                                             | Need to read                                                                            |
| `apps/web/app/chat-multi/page.tsx:22`                    | Local inline `type ProviderId = 'anthropic' \| 'openai' \| 'ollama' \| 'google'` | DRIFT; missing 6 providers (deepseek, lmstudio, perplexity, xai, mock, custom)          |

**Phase 4 action:** Audit `packages/types/src/design-system/provider-display.ts` vs `packages/types/src/provider.ts`. If `ProviderId` lives in design-system, that's structurally wrong: the canonical provider ID union is cross-cutting and should live in `provider.ts`. Move/consolidate as part of Phase 4.

## Cluster 4 — `ToolCall` (14 definitions)

Mostly in `apps/web/` and `apps/desktop/` consumer code. None in `packages/types/`. There's a canonical type embedded inside `packages/types/src/chat.ts` and `packages/types/src/tool-events.ts`. Consumer drift falls in Phase 5+. Phase 4 in-scope: make sure `packages/types/src/tool-events.ts` is the single source.

## Cluster 5 — `Session` / `Conversation` (11 definitions)

Canonical: `packages/types/src/conversation.ts` (`Conversation`, `MessageBase`, etc.). `packages/types/src/chat.ts` overlaps with `ChatMessage` and conversation references. Other definitions in consumer code and `packages/api`, `packages/unified-chat`, `packages/local-llm`.

**Phase 4 in-scope:** verify `packages/api/src/chat.ts`, `packages/unified-chat/src/lib/types.ts`, `packages/local-llm/src/types.ts` re-import the canonical `Conversation`/`MessageBase` rather than defining their own.

## Cluster 6 — Hardcoded model ID literals (suspect)

| Surface        | File                                                              | Concern            |
| -------------- | ----------------------------------------------------------------- | ------------------ |
| Web            | `apps/web/features/pages/ApiReference.tsx:41`                     | doc example — OK   |
| Web            | `apps/web/core/ai/llm/providers/google-gemini.ts:410`             | comment — OK       |
| Desktop (Rust) | `apps/desktop/src-tauri/src/core/llm/sse_parser.rs:1223+`         | test fixtures — OK |
| Desktop (Rust) | `apps/desktop/src-tauri/src/core/llm/provider_adapter_tests.rs:*` | test fixtures — OK |

Conclusion: **no model ID hardcoding violations** in the TS source — all matches are tests or doc examples. Locked rule #1 (no hardcoded model IDs) is not currently violated.

## Cluster 7 — Runtime barrel pulling node:async_hooks (real, fixable in Phase 4)

`packages/runtime/src/index.ts` re-exports `agentContext` (uses `node:async_hooks`) and `state/*` (uses no Node built-ins but is bundled together). Mobile bundle requires the polyfill at `apps/mobile/lib/polyfills/async_hooks.cjs` resolved via `apps/mobile/metro.config.js`.

Consumer audit (current):

- **Zero TS consumers** import `getAgentContext`/`runWithContext`/`AgentContext`/`AgentOrigin` from `@agiworkforce/runtime` (the Rust side has its own `tokio::task_local!`).
- Only **2 desktop files** consume `appStateStore` and friends (`apps/desktop/src/lib/skillLoader.ts`, `apps/desktop/src/stores/bridge/stateBridge.ts`).
- All other consumers import only universal symbols (`command`, `routeToCloud`, `listen`, queue helpers, etc.).

**Phase 4 Step 5 action:** Split the barrel:

- `packages/runtime/src/index.ts` — universal exports (detect, command, events, errors, registry, queue, http) — no Node built-ins
- `packages/runtime/src/node.ts` (NEW) — Node/Tauri-only exports (agentContext + state singleton)
- Add `"./node": "./src/node.ts"` to `packages/runtime/package.json` `"exports"` map
- Update the 2 desktop consumers to import from `@agiworkforce/runtime/node`
- Delete `apps/mobile/lib/polyfills/async_hooks.cjs` and its `metro.config.js` alias

**Risk:** Low — only 2 desktop files need migration, and they are co-located in `apps/desktop/src/`. Mobile bundle improves. Web is unaffected.

## Cluster 8 — `packages/types/src/tauri.ts` is mis-named & mis-scoped

The file contains DOM-typed contracts (`PerformanceEntry`, `Node`, `DOMRectReadOnly`) plus the **bad PlanTier** definition, and is exported via the universal `index.ts` barrel. Its name suggests Tauri-only but its content is web-DOM only.

**Phase 4 action:** Out of scope for the renaming itself (Phase 5+ work), but the PlanTier issue inside it (Cluster 1) is in-scope.

## Cluster 9 — `packages/llm-runtime` exists separately from `packages/runtime`

`packages/llm-runtime` (not in the originally scoped list) consumes `@agiworkforce/types` heavily and has fallback logic. Inventory only — not in Phase 4 move plan unless it duplicates types from `packages/types/`.

Inspected: `packages/llm-runtime/src/__tests__/fallback.test.ts` and `packages/llm-runtime/src/fallback.ts` are the entry points. They consume `models.json`/`model-catalog` from `@agiworkforce/types` — appears to be a healthy consumer, not a drift source.

## Summary — drift items the Phase 4 supervisor will action

| #   | Cluster                                                             | Action                                                                                                               | Risk | Batch target |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---- | ------------ |
| A   | PlanTier drift across types/runtime                                 | Move canonical to `packages/types/src/plan-tier.ts`, replace bad `tauri.ts` PlanTier, runtime re-exports for compat  | Med  | 1            |
| B   | Runtime barrel pulls node:async_hooks                               | Split into `index.ts` (universal) + `node.ts` (Node/Tauri-only); migrate 2 desktop consumers; delete mobile polyfill | Low  | 5 (Step 5)   |
| C   | ProviderId in design-system vs provider.ts                          | Verify canonical location; re-export from design-system if needed                                                    | Low  | 2            |
| D   | `packages/local-llm/src/types.ts` ChatMessage drift                 | If it duplicates types/src/chat.ts, replace with import                                                              | Low  | 3            |
| E   | `packages/unified-chat/src/lib/types.ts` ChatMessage/ToolCall drift | Same — import from `@agiworkforce/types`                                                                             | Low  | 3            |
| F   | `packages/api/src/chat.ts` Session/Conversation overlap             | Verify and import from types                                                                                         | Low  | 4            |

**Out of scope** (Phases 5-6):

- `apps/web/app/chat-multi/page.tsx` local ProviderId
- Consumer-surface ChatMessage / ToolCall / PlanTier duplications in apps/{web,desktop,mobile,extension\*}
- The `packages/types/src/tauri.ts` rename/restructure (touches consumers across surfaces)
