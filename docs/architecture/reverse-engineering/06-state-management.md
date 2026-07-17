# 6. State Management

Status: Current
Owner: Platform lead
Last updated: 2026-07-15

State is **Zustand** everywhere (with `immer` for complex updates, `persist` for durable slices). The architecture separates **shared chat/model/agent state** (owned by `packages/ui/unified-chat`) from **surface-local state** (per-app stores for platform-specific concerns). This file maps the layers and the consolidation still in flight.

## 6.1 The layering principle

```
packages/ui/unified-chat/src/stores/*   ← shared chat experience state (all app surfaces)
packages/platform/artifacts/src/artifact-store.ts ← shared artifact state w/ injected IO
apps/<surface>/stores/*              ← surface-local state (platform, device, IA, glue)
```

Two rules keep it honest:

1. Shared chat/model/agent concerns belong in `unified-chat` stores; a surface should consume them, not fork them.
2. `packages/platform/artifacts` owns artifact-domain state where **all IO is injected via adapters** (so the same store runs on web/desktop/mobile with different persistence). The generic `packages/stores` compatibility facade was deleted at M8 (2026-07-15).

## 6.2 Shared stores — `packages/ui/unified-chat/src/stores`

The shared chat experience state (consumed by web + desktop, logic-reused by mobile):

| Store                                                            | Owns                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------- |
| `chatStore.ts`                                                   | conversation/message state (persist key `agi-web-chat`) |
| `modelStore.ts`                                                  | selected model + effort + capability-derived controls   |
| `artifactStore.ts`                                               | artifact workbench state                                |
| `agentModeStore.ts`, `agentControlStore.ts`, `agentLoopStore.ts` | Chat vs AGI-Work mode, agent run control, tool loop     |
| `planModeStore.ts`, `budgetStore.ts`, `tierStore.ts`             | plan/effort mode, budget, plan tier gating              |
| `memoryStore.ts`, `projectStore.ts`                              | memory + project context                                |
| `checkpointStore.ts`, `promptStashStore.ts`, `mentionStore.ts`   | checkpoints, stashed prompts, @-mentions                |
| `settingsStore.ts`, `uiStore.ts`                                 | shared settings + shared chat UI state                  |

## 6.3 Shared platform-agnostic artifact store — `packages/platform/artifacts`

`packages/platform/artifacts` owns the **artifact store** (`src/artifact-store.ts`) with IO injected via adapters. It is consumed directly by Desktop/Web/Mobile so artifact persistence differs per surface (Tauri store vs cloud vs sqlite) while logic stays single-sourced. The former `packages/stores` re-export facade was deleted at M8 (2026-07-15); import from `@agiworkforce/artifacts` directly.

## 6.4 Web — `apps/web/stores`

Web has a top-level store set plus a `unified/` set that adapts the shared stores to the web runtime:

- Top-level: `chatStore.ts` (the canonical web chat store, persist key `agiworkforce-web-chat` — persists model selection + sidebar only), `settingsStore.ts`, `mediaStore.ts`, `uiStore.ts`.
- `stores/unified/`: `unifiedChatStore.ts`, `modelStore.ts`, `accountStore.ts`, `auth.ts`, `billingUsage.ts`, `codeStore.ts`, `customInstructionsStore.ts`, `executionStore.ts`, `mediaGenerationStore.ts`, `settingsStore.ts`, plus `desktop-stubs.ts` (stubs desktop-only APIs on web).

Note the web codebase documents multiple distinct chat stores with different shapes and persist keys that must **not** be merged (web `chatStore` vs an MGX-style `shared/stores/chat-store` vs the `unified-chat` package store) — a known area where duplication is deliberately partitioned during the P3 UI consolidation, not yet collapsed.

## 6.5 Desktop — `apps/desktop/src/stores`

By far the largest store set (~50 stores) because desktop is the local compute host: `appModeStore.ts` (the guarded Local/Cloud mode store with `desktopCloudGate` tests), `artifactStore.ts`, `chat/`, `mcp*`, `connectorsStore.ts`, `browserStore.ts`, `computerUseStore.ts`, `filesystemStore.ts`, `executionStore.ts`/`executionSidecarStore.ts`, `agentTaskStore.ts`, `backgroundTaskStore.ts`, `billing*`, `cloudStore.ts`, `customAgentsStore.ts`, `documentStore.ts`, `imageGalleryStore.ts`, `marketplaceStore.ts`, `governanceStore.ts`, `logoutCleanup.ts`, etc. Most are legitimately surface-local (they wrap Tauri/native capabilities); chat/model/agent concerns should route through the shared `unified-chat` stores.

## 6.6 Mobile — `apps/mobile/stores`

Mobile keeps a lean set plus a **tri-store settings split** (the model architecture per decision log R4):

- `chatStore.ts`, `chat/`, `agentStore.ts`, `agentControlStore.ts`, `dispatchStore.ts`, `projects/`, `memory/`, `permissionsStore.ts`, `connectionStore.ts`, `desktopStatusStore.ts`, `notificationPrefsStore.ts`.
- `stores/settings/`: **`localSettingsStore.ts` + `cloudSettingsStore.ts` + `settingsSyncStateStore.ts`** behind a compat facade — device settings local, account settings synced (feeds migration 0042). Mobile enforces trust via a 4-layer guard (`guardedFetch` fail-closed egress, `remoteChatGate` fail-closed).

## 6.7 Guarded mode stores (trust-boundary state)

The two trust-mode toggles (area 1) each drive a **guarded** mode store:

- Desktop `appModeStore` — Local/Cloud, protected by `desktopCloudGate` tests.
- Mobile `stores/chat` mode state — 4-layer enforcement, `remoteChatGate` fails closed.

These stores are the state-level enforcement of "never silently route Local → Cloud." They are intentionally per-surface (they wrap platform trust primitives) but share the mode-state _contract/types_ from `suite-contracts.ts`.

## 6.8 What's fully documented vs flagged

- Store layering, shared vs per-surface split, guarded mode stores, mobile tri-store settings: **fully documented**.
- Web chat-store consolidation (multiple distinct chat stores) is **in progress** (P3): they are partitioned deliberately today, targeted for collapse onto `unified-chat`. Desktop chat/agent stores similarly should migrate onto the shared stores as v3 adopts the shared chat core (master-plan wave 6).
