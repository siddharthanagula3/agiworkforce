# Phase 5 Desktop — Stores Domain Mapping

Generated: 2026-05-18
Branch: claude/phase5-desktop-2026-05-18

## STOP: Active in-flight migrations — do not move store files

Two parallel tasks own store migration on this codebase:

- **task-w58** — absorbing stores into `windowStore.ts` (shortcutStore, updaterStore,
  notificationStore flagged in windowStore comments)
- **task-1.3** — migrating stores to `packages/runtime/state` (25+ stores have TODO comments)

Moving any store file on this branch creates a 3-way conflict with those tasks.
**Mapping doc only. No file moves for stores.**

---

## Already-structured subdirs (pre-existing, not touched by Phase 5)

| Subdir             | Files                                                                                                                                      | Domain                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `stores/chat/`     | agentStore, agentWorkflowEvents, chatExecutionStore, chatStore, chatStoreRef, chatViewStore, index, runtimeEventBindings, toolStore, types | Active chat surface — DEFERRED |
| `stores/settings/` | chatPrefs, connectors, dialog, thinking, voice                                                                                             | Settings — DEFERRED            |
| `stores/billing/`  | analyticsSlice, budgetSlice, costSlice, subscriptionSlice, usageSlice, index                                                               | Billing — DEFERRED             |
| `stores/mcp/`      | mcpHealthStore, mcpOAuthStore, mcpServersStore, mcpToolsStore                                                                              | MCP — DEFERRED                 |
| `stores/bridge/`   | stateBridge                                                                                                                                | IPC bridge — DEFERRED          |

---

## Flat store files — domain mapping

### Domain: updates (safe — feature migrated, task-w58 targeted)

| Store             | Lines | Status                                           | In-flight task |
| ----------------- | ----- | ------------------------------------------------ | -------------- |
| `updaterStore.ts` | ~250  | task-w58 targets this for windowStore absorption | DO NOT MOVE    |

### Domain: notifications (safe — feature migrated, task-w58 targeted)

| Store                  | Lines | Status                                           | In-flight task |
| ---------------------- | ----- | ------------------------------------------------ | -------------- |
| `notificationStore.ts` | 712   | task-w58 targets this for windowStore absorption | DO NOT MOVE    |

### Domain: analytics (safe — feature migrated, task-1.3 targeted)

| Store               | Lines | Status                                       | In-flight task |
| ------------------- | ----- | -------------------------------------------- | -------------- |
| `analyticsStore.ts` | ~180  | task-1.3 → packages/runtime/state, 0 callers | DO NOT MOVE    |

### Domain: app-shell / window

| Store                     | Lines | 30d commits | In-flight                   |
| ------------------------- | ----- | ----------- | --------------------------- |
| `windowStore.ts`          | 1321  | 1           | Absorbing others (task-w58) |
| `appModeStore.ts`         | ~120  | 1           | —                           |
| `connectionStore.ts`      | ~200  | 2           | task-1.3                    |
| `extensionEventsStore.ts` | ~100  | 1           | —                           |
| `shortcutStore.ts`        | ~180  | 1           | task-w58 → windowStore      |
| `triggerStore.ts`         | ~150  | 2           | —                           |
| `ui.ts`                   | 1118  | 0           | —                           |

### Domain: auth / security (DEFERRED)

| Store                 | Lines | 30d commits | Note               |
| --------------------- | ----- | ----------- | ------------------ |
| `auth.ts`             | 1492  | 2           | Auth — DEFERRED    |
| `authOrchestrator.ts` | ~250  | 0           | Auth — DEFERRED    |
| `securityStore.ts`    | ~300  | 1           | task-1.3, DEFERRED |

### Domain: settings (DEFERRED — 14/30d)

| Store                        | Lines | Note               |
| ---------------------------- | ----- | ------------------ |
| `settingsStore.ts`           | 1937  | DEFERRED           |
| `settingsDialogStore.ts`     | ~200  | DEFERRED           |
| `chatPreferencesStore.ts`    | ~200  | task-1.3, DEFERRED |
| `customInstructionsStore.ts` | ~250  | task-1.3, DEFERRED |

### Domain: chat / agentic (DEFERRED — active surface)

| Store                      | Note                                  |
| -------------------------- | ------------------------------------- |
| `unifiedChatStore.ts`      | DEFERRED                              |
| `agentTaskStore.ts`        | DEFERRED                              |
| `executionStore.ts`        | DEFERRED                              |
| `executionSidecarStore.ts` | task-1.3, DEFERRED                    |
| `backgroundTaskStore.ts`   | DEFERRED                              |
| `thinkingStore.ts`         | 0 commits, but active chat — DEFERRED |
| `promptStashStore.ts`      | DEFERRED                              |

### Domain: models / providers

| Store           | Lines | 30d commits | Note           |
| --------------- | ----- | ----------- | -------------- |
| `modelStore.ts` | 1404  | 3           | Active — defer |
| `cacheStore.ts` | ~200  | 1           | task-1.3       |

### Domain: mcp / connectors (DEFERRED)

| Store                | Note                          |
| -------------------- | ----------------------------- |
| `mcpStore.ts`        | task-w58 re-exports, DEFERRED |
| `mcpbStore.ts`       | task-1.3, DEFERRED            |
| `mcpServerStore.ts`  | DEFERRED                      |
| `mcpAppStore.ts`     | task-1.3, DEFERRED            |
| `connectorsStore.ts` | 3 commits, DEFERRED           |

### Domain: billing / cloud (DEFERRED)

| Store             | Note                           |
| ----------------- | ------------------------------ |
| `billingUsage.ts` | task-1.3, 3 commits — DEFERRED |
| `cloudStore.ts`   | task-1.3, DEFERRED             |
| `teamStore.ts`    | task-1.3, DEFERRED             |
| `roiStore.ts`     | DEFERRED                       |

### Domain: content / document

| Store                     | Lines | 30d commits | task     |
| ------------------------- | ----- | ----------- | -------- |
| `artifactStore.ts`        | 672   | 1           | task-1.3 |
| `documentStore.ts`        | ~400  | 1           | task-1.3 |
| `editingStore.ts`         | 1444  | 2           | —        |
| `imageGalleryStore.ts`    | ~200  | 1           | task-1.3 |
| `mediaGenerationStore.ts` | ~200  | 1           | —        |
| `templateStore.ts`        | ~200  | 1           | task-1.3 |

### Domain: projects / memory

| Store                   | Lines | 30d commits | task |
| ----------------------- | ----- | ----------- | ---- |
| `projectStore.ts`       | 623   | 1           | —    |
| `projectMemoryStore.ts` | ~300  | 1           | —    |
| `memoryStore.ts`        | 1174  | 1           | —    |
| `planningStore.ts`      | ~200  | 1           | —    |

### Domain: research / intelligence

| Store                | Lines | 30d commits | task     |
| -------------------- | ----- | ----------- | -------- |
| `researchStore.ts`   | ~400  | 1           | task-1.3 |
| `councilStore.ts`    | ~200  | 1           | —        |
| `governanceStore.ts` | ~200  | 1           | —        |

### Domain: tools / automation

| Store                      | Lines | 30d commits | task     |
| -------------------------- | ----- | ----------- | -------- |
| `browserStore.ts`          | 1222  | 1           | task-1.3 |
| `computerUseStore.ts`      | 634   | 2           | task-1.3 |
| `filesystemStore.ts`       | ~300  | 1           | —        |
| `terminalStore.ts`         | 584   | 1           | task-1.3 |
| `codeStore.ts`             | ~400  | 1           | task-1.3 |
| `codingCheckpointStore.ts` | ~200  | 1           | —        |
| `workflowStore.ts`         | ~200  | 1           | —        |
| `schedulerStore.ts`        | 949   | 1           | task-1.3 |
| `schedulesStore.ts`        | ~300  | 1           | task-1.3 |

### Domain: comms / voice / media

| Store                | Lines | 30d commits | task     |
| -------------------- | ----- | ----------- | -------- |
| `voiceInputStore.ts` | ~300  | 2           | —        |
| `calendarStore.ts`   | ~300  | 1           | task-1.3 |
| `databaseStore.ts`   | 765   | 1           | —        |

### Domain: marketplace / skills

| Store                      | Lines | 30d commits | task     |
| -------------------------- | ----- | ----------- | -------- |
| `marketplaceStore.ts`      | ~200  | 1           | —        |
| `skillMarketplaceStore.ts` | ~200  | 1           | task-1.3 |
| `customAgentsStore.ts`     | ~200  | 1           | task-1.3 |
| `productivityStore.ts`     | ~200  | 1           | —        |

### Domain: infra / lifecycle

| Store              | Lines | 30d commits | note                 |
| ------------------ | ----- | ----------- | -------------------- |
| `logoutCleanup.ts` | ~80   | 2           | utility, not a store |

---

## Target shape (future — after task-1.3 and task-w58 complete)

```
src/data/
  app-shell/    windowStore, appModeStore, connectionStore, ui
  auth/         auth, authOrchestrator, securityStore
  chat/         (already structured in stores/chat/)
  models/       modelStore, cacheStore
  projects/     projectStore, projectMemoryStore, memoryStore
  content/      artifactStore, documentStore, editingStore
  tools/        browserStore, computerUseStore, filesystemStore, terminalStore
  comms/        voiceInputStore, calendarStore
  billing/      (already structured in stores/billing/)
  mcp/          (already structured in stores/mcp/)
```

After task-1.3 and task-w58 complete, the remaining flat stores can be
organized into this `src/data/` structure cleanly without 3-way conflicts.

---

## Hooks domain mapping (for Session 3 reference)

| Hook                       | Lines | 30d commits | Callers (non-test)                               | Classification                              |
| -------------------------- | ----- | ----------- | ------------------------------------------------ | ------------------------------------------- |
| `useUpdater.ts`            | ~120  | 0           | 3: features/updates/\* + Settings/UpdateSettings | Feature-local (updates) — MOVEABLE          |
| `useToast.ts`              | ~100  | 0           | 2: ui/Toaster + features/updates/UpdateChecker   | Cross-cutting (primitive) — KEEP            |
| `useNotifications.ts`      | ~80   | 0           | 3: Settings/\* only                              | Settings-local — DEFER                      |
| `useWindowManager.ts`      | ~150  | 0           | many                                             | Cross-cutting — KEEP                        |
| `useReducedMotion.ts`      | ~20   | 0           | unknown                                          | Cross-cutting — KEEP                        |
| `useKeyboardShortcuts.ts`  | ~100  | 0           | unknown                                          | Cross-cutting — KEEP                        |
| `useMemory.ts`             | ~80   | 0           | unknown                                          | Domain: memory — not yet migrated           |
| `useGit.ts`                | ~60   | 0           | unknown                                          | Domain: git tools — not yet migrated        |
| `useScheduler.ts`          | ~60   | 0           | unknown                                          | Domain: scheduler — not yet migrated        |
| `useBackgroundTasks.ts`    | ~80   | 0           | unknown                                          | Domain: background tasks — not yet migrated |
| `useCheckpoints.ts`        | ~60   | 0           | unknown                                          | Domain: checkpoints — not yet migrated      |
| `useApprovalActions.ts`    | ~80   | 0           | unknown                                          | Domain: execution — not yet migrated        |
| `useAgenticEvents.ts`      | ~100  | 0           | unknown                                          | Domain: agent — DEFERRED                    |
| `useDeepLink.ts`           | ~60   | 0           | unknown                                          | App-shell — KEEP                            |
| `useCreditRefresh.ts`      | ~60   | 0           | unknown                                          | Billing — DEFERRED                          |
| `useTierBridge.ts`         | ~80   | 0           | unknown                                          | Billing — DEFERRED                          |
| `useSessionPersistence.ts` | ~80   | 0           | unknown                                          | Cross-cutting — KEEP                        |
| `useModelCapabilities.ts`  | ~80   | 0           | unknown                                          | Cross-cutting — KEEP                        |
| All others                 | —     | —           | —                                                | Audit in next session                       |
