# GAP-D8 — Desktop `apps/desktop/src/{stores,hooks,services,lib,api,utils}` vs Claude Code

> **Mission.** Compare AGI Workforce desktop's non-component subtree (~303 files) against Claude Code's `~/Desktop/reference/src/{services,state,hooks,context,setup.ts,bootstrap,cli,entrypoints,skills,tasks,memdir,migrations,plugins}` reference. **Output only what we are MISSING or PARTIAL.**
>
> **Scope (this team).** `apps/desktop/src/stores/` (102), `hooks/` (38), `lib/` (66), `services/` (20), `api/` (56), `utils/` (18), root (3). Total 303 files / **~93,667 LOC** (zustand store layer ~41K, hooks ~12K, lib ~14K, api ~28K, services ~7K, utils ~3K).
>
> **Reference rev.** `~/Desktop/reference/src/` snapshot 2026-03-31, Claude Code v2.x. Citations against `tasks/research/src-08-services-state.md`, `deep/m4-hooks-system.md`, `deep/misc1-skills-tasks-state-memdir.md`, `deep/m1-cli-print-launchers.md`, `deep/m6-main-bootstrap.md`, `anthropic-claude-suite-may-2026.md`. All citations absolute paths; line numbers 1-indexed.
>
> **What we have.** 102 zustand-create stores (88 use `create<…>` directly, 25 use `subscribeWithSelector`); 38 hand-rolled hooks (zero use `useSyncExternalStore` outside one widget registry); 56 API modules wrapping Tauri/Cloud invokes; 20 service singletons; ~14K LOC of `lib/` glue. Three root files (`App.tsx` 1700+ LOC, `main.tsx`, `vite-env.d.ts`).

---

## 0. Top-line architecture verdict

Claude Code runs **one** React store (`AppStateStore.ts:454`, ~75 fields, hand-rolled `createStore<T>` at `state/store.ts:10-34`) with **`useSyncExternalStore`** for selectors and **`onChangeAppState.ts:43-171`** as the SINGLE choke-point that fans out diffs to CCR/SDK/global-config. Side-effects flow through one diff sink; subsystems never talk to each other directly.

AGI Workforce desktop runs **102 zustand stores** (each its own `create<…>(devtools(persist(subscribeWithSelector(immer(...)))))` stack) plus a parallel `bootstrap/state.ts`-equivalent that does not exist. There is no diff choke-point. Every store wires its own listeners. `logoutCleanup.ts` is the only cross-store coordinator and only fires on signout. The result: 41,408 LOC of state code where Claude Code uses ~5,500 (state/ 6 files + bootstrap/state.ts 1,758 LOC + onChangeAppState 171 LOC + AppStateStore 480 LOC). Our store sprawl is the single largest architectural gap.

---

## 1. STATE MANAGEMENT — gaps

### 1.1 MISSING: `onChangeAppState`-style choke-point sink

**What Claude has.** `state/onChangeAppState.ts:43-171` receives `{newState, oldState}` after every store mutation. Six fan-outs: `toolPermissionContext.mode` → CCR + SDK; `mainLoopModel` → userSettings; `expandedView` → globalConfig; `verbose` → globalConfig; `tungstenPanelVisible` → globalConfig; `settings` change → clear `apiKeyHelperCache` + AWS/GCP cache + reapply env vars. The comment at `state/onChangeAppState.ts:50-64` explains: prior to this block, mode changes were notified by only 2 of 8+ mutation paths.

**What we have.** Zero. Each of our 102 zustand stores notifies its own listeners. Stripe webhook idempotency, settings.json roundtrip, cost rollup, model-change → cache-clear are each scattered across `apps/desktop/src/services/stripe.ts:1-353`, `apps/desktop/src/stores/settingsStore.ts:1-1910`, etc.

**Concrete drop-in.** Add `apps/desktop/src/stores/_choke.ts` mounted by `App.tsx`, subscribing to `useUnifiedAuthStore`, `useSettingsStore`, `useModelStore`, `useUIStore`, `useUnifiedChatStore`. ~250 LOC.

**Effort.** 2 days. **Severity P1** — preventing future bugs of the "8 callsites mutating, 2 notifying" class.

### 1.2 MISSING: `bootstrap/state.ts`-equivalent module-global

**What Claude has.** `~/Desktop/reference/src/bootstrap/state.ts` — 1,758 LOC, 209 exports. Stores everything React doesn't need: per-turn token budgets (`getCurrentTurnTokenBudget`), classifier counts/durations, prompt-cache 1h sticky-latches, beta-header latches (`afkModeHeaderLatched`, `cacheEditingHeaderLatched`), `invokedSkills` map, `slowOperations` array, OTel meter/logger/tracer providers, attributed counters (sessionCounter, locCounter, prCounter, costCounter, tokenCounter, codeEditToolDecisionCounter, activeTimeCounter), `eventLogger`, `agentColorMap`. Test reset hooks `resetStateForTests()` (`bootstrap/state.ts:919`), `resetTotalDurationStateAndCost_FOR_TESTS_ONLY` (`:551`), `setCostStateForRestore` (`:881`).

**What we have.** Some equivalents scattered across stores: `apps/desktop/src/stores/billingUsage.ts:1-1782` for token rollup, `apps/desktop/src/services/analytics.ts:1-391` for events, `apps/desktop/src/stores/modelStore.ts` for model state. None of it is consolidated; none of it has explicit `_FOR_TESTS_ONLY` reset surfaces.

**Effort.** 5 days to consolidate (mostly cut-and-paste from existing stores; the architectural pattern is the missing piece). **Severity P2.**

### 1.3 MISSING: `speculation` slice + `IDLE_SPECULATION_STATE` singleton

**What Claude has.** `state/AppStateStore.ts:52-79` is a discriminated-union slice for speculative pre-execution. When the model is mid-stream and the harness predicts the user will accept the response, it begins next-prompt execution against an overlay filesystem. Mutable refs (`messagesRef`, `writtenPathsRef`, `contextRef`) keep allocations down (per-keystroke). `boundary` records why speculation was finalizable. `timeSavedMs` aggregates into `speculationSessionTimeSavedMs`. The `IDLE_SPECULATION_STATE` singleton avoids reallocation on every keystroke.

**What we have.** Zero — only one `prefetching` feature-flag enum at `apps/desktop/src/services/featureFlags.ts:23` (`PREFETCHING = 'prefetching'`) and one Tauri command stub `chat_prefetch_session_memories` in `lib/tauri-mock.ts:2004`. Neither implements speculative execution.

**Effort.** 10 days (this is the most architecturally interesting slice — port for Pro tier in Phase 2). **Severity P3** until Pro tier launches.

### 1.4 MISSING: Single React store + `useSyncExternalStore` adapter

**What Claude has.** `state/store.ts:10-34` defines a 24-LOC `createStore<T>` with `Object.is`-short-circuit (`store.ts:23`) plus `useSyncExternalStore`-based `useAppState(selector)` (`AppState.tsx:142-163`). One `AppStateProvider` wraps `MailboxProvider` then `VoiceProvider` (`AppState.tsx:94`). Selectors re-render only when their slice changes.

**What we have.** Zustand `create<…>()` × 102. `useSyncExternalStore` appears in exactly **one** file — `components/UnifiedAgenticChat/Widgets/WidgetRegistry.tsx:10, 260` — and that is for widget registration, not state. We are paying selector-registration overhead 102× per render where Claude Code pays it once. Practical cost: 102 `subscribe`/`unsubscribe` registrations per route mount.

**Effort.** Wholesale rewrite would be ~20 days; alternative is mounting the choke-point sink in §1.1 and accepting the zustand surface. **Severity P2.**

### 1.5 MISSING: 75-field unified `AppState` type

**What Claude has.** `state/AppStateStore.ts:89-452` defines a single `DeepImmutable<AppState>` with the shape — 38 top-level + 37 nested fields. Examples we lack the centralized version of: `toolPermissionContext`, `pendingWorkerRequest`, `pendingSandboxRequest`, `workerSandboxPermissions`, `agentNameRegistry`, `foregroundedTaskId`, `viewingAgentTaskId`, `denialTracking`, `fileHistory`, `attribution`, `replBridge*` (13 fields), `tungsten*` (5 fields), `ultraplan*` (5 fields), `bagel*` (3 fields), `replBridgePermissionCallbacks`, `channelPermissionCallbacks`, `pendingPlanVerification`, `remoteAgentTaskSuggestions`, `inbox`, `initialMessage`, `speculation`, `skillImprovement`, `authVersion`.

**What we have.** Each is partially in its own store: `agentTaskStore.ts:84-103` (tasks), `mcpStore.ts:39-80` (mcp), `notificationStore.ts` (notifications), `executionStore.ts` (active execution), `auth.ts` (authVersion equivalent absent — we use Supabase session events). No single shape; no single type alias for the whole app.

**Effort.** 4 days to define the type alias and re-export selectors. **Severity P3.**

### 1.6 MISSING: `getDefaultAppState()` + lazy-require for cycle-breaking

**What Claude has.** `state/AppStateStore.ts:456-465` factory function. Lazy-requires `utils/teammate.js` to avoid an import cycle — same pattern as `mcpSkillBuilders.ts:1-44`'s write-once registry. Default-state factory is the integration test foundation.

**What we have.** Each zustand store has its own initial-state object literal inline. No factory. Tests cannot reset to a single canonical default.

**Effort.** 2 days. **Severity P3.**

### 1.7 MISSING: `_resetForTesting()` / `_FOR_TESTS_ONLY` discipline

**What Claude has.** Multiple: `analytics/index.ts:170` `_resetForTesting()`, `bootstrap/state.ts:919` `resetStateForTests()`, `bootstrap/state.ts:551` `resetTotalDurationStateAndCost_FOR_TESTS_ONLY`. Naming convention is enforced.

**What we have.** Most stores have `reset` or `resetOnLogout`, but they conflate test-mode reset with production logout cleanup. No `_FOR_TESTS_ONLY` suffix. Per `apps/desktop/src/stores/logoutCleanup.ts:46-216`, that is also the test-reset path — a smell.

**Effort.** 1 day to split. **Severity P3.**

---

## 2. HOOKS / LIFECYCLE — gaps

### 2.1 MISSING: 16-hook `notifs/` subsystem

**What Claude has.** `~/Desktop/reference/src/hooks/notifs/` — 16 distinct hooks: `useStartupNotification`, `useRateLimitWarningNotification`, `useNpmDeprecationNotification`, `useDeprecationWarningNotification`, `useFastModeNotification`, `useSettingsErrors`, `useMcpConnectivityStatus`, `useLspInitializationNotification`, `useInstallMessages`, `useTeammateShutdownNotification`, etc. Each subscribes to a service-side event or AppState slice and pushes a typed notification. They consume the `Notification` hook event stream from `hooks.ts:3570-3592`.

**What we have.** ONE consolidated `apps/desktop/src/hooks/useNotifications.ts:1-455`. No per-domain push hooks. There is no `useRateLimitWarningNotification`, no `useNpmDeprecationNotification`, no `useMcpConnectivityStatus` even though our MCP store has health data at `mcpStore.ts:46`.

**Effort.** ~600 LOC to port all 16. **Severity P1** — these are the user-visible "your subscription is expiring", "MCP server X is unhealthy", "rate-limit hit at 03:14 PM" toasts.

### 2.2 MISSING: `useExitOnCtrlCD` / `useDoublePress` + 800 ms timer

**What Claude has.** `~/Desktop/reference/src/hooks/useExitOnCtrlCD.ts:46-95+` — Ctrl-C / Ctrl-D double-press exit handling that interacts with `Stop` hooks (Ctrl-C triggers `executeStopHooks`). `useDoublePress.ts` provides the 800 ms timer. The combination means a single Ctrl-C interrupts the model; double Ctrl-C exits.

**What we have.** Zero — `apps/desktop/src/hooks/useKeyboardShortcuts.ts:1-206` handles single keypresses but has no double-press semantic. Closing the desktop app is forced through OS window-close.

**Effort.** 80 LOC port. **Severity P2** — this is the standard chat-cancel UX expected from CLI users.

### 2.3 MISSING: `useReplBridge.tsx` (115K-LOC equivalent)

**What Claude has.** `~/Desktop/reference/src/hooks/useReplBridge.tsx:1-722` — 115K LOC monolith. Wires the agent loop to React. Consumes hook events emitted by `hookEvents.ts`. Sole connector between React-Ink TUI and the agent loop. The `interactiveHelpers.tsx:89` mounts modal dialogs through it.

**What we have.** Partially — `apps/desktop/src/stores/chat/runtimeEventBindings.ts:1-177` plus `apps/desktop/src/hooks/useAgenticEvents.ts:1-1694` plus `apps/desktop/src/stores/chat/agentWorkflowEvents.ts:1-1154` collectively cover ~3,000 LOC of similar bridging. But ours is split across 3 files in 2 directories with no central state machine.

**Effort.** Already implemented at parity — the gap is in **unification**, not features. ~3 days to consolidate. **Severity P3.**

### 2.4 MISSING: `useTypeahead.tsx` (213K-LOC) + `fileSuggestions.ts` (27K-LOC)

**What Claude has.** `~/Desktop/reference/src/hooks/useTypeahead.tsx` — the largest single file in the React tree. Hand-authored typeahead state machine. Plus `fileSuggestions.ts` (27K LOC) for `@filename` references with line ranges. `useArrowKeyHistory.tsx` (34K LOC) for command history.

**What we have.** `apps/desktop/src/hooks/useSlashCommandAutocomplete.ts:1-252` — 252 LOC. Slash-only; no `@file:line` references; no fuzzy file completion; no command history. `apps/desktop/src/hooks/usePromptSuggestions.ts:1-288` for AI suggestions, but not file-system-aware typeahead.

**Effort.** 10 days to reach parity with Claude's typeahead UX. **Severity P1** — `Cmd+Option+K` style file references are core to the IDE-class chat UX competitors all ship.

### 2.5 MISSING: `useCanUseTool.tsx` (40K-LOC unified permission gate)

**What Claude has.** `~/Desktop/reference/src/hooks/useCanUseTool.tsx` — 40K LOC. Single gate consumed by every tool-call site. Reads `AppState.toolPermissionContext` (`AppStateStore.ts:109`), three named handlers in `hooks/toolPermission/handlers/` (`coordinatorHandler.ts`, `interactiveHandler.ts`, `swarmWorkerHandler.ts` — 760 LOC). Logs `tengu_permission_decision` analytics. "Always allow" rules persist via `utils/settings/`.

**What we have.** `apps/desktop/src/hooks/useApprovalActions.ts:1-61` — **61 LOC**. There is no single gate; tool calls in `apps/desktop/src/api/` invoke directly. Permission state is fragmented across `governanceStore.ts:1-321`, `securityStore.ts:1-131`, and `apps/desktop/src/utils/permissions.ts:1-119`. No `tengu_permission_decision` analytics. No coordinator/interactive/swarmWorker triplication.

**Effort.** 8 days for a unified gate + 3-handler split. **Severity P0** — this is the differentiator that prevents tool-permission bypass bugs.

### 2.6 MISSING: `useDynamicConfig` GrowthBook one-line escape hatch

**What Claude has.** `~/Desktop/reference/src/hooks/useDynamicConfig.ts:8` — single-line wrapper around `getDynamicConfig_BLOCKS_ON_INIT` from `services/analytics/growthbook.ts`. Used to drive `tengu_ant_model_override` in `useMainLoopModel.ts:26`.

**What we have.** `apps/desktop/src/services/featureFlags.ts:1-390` exposes a class-based service with periodic refresh. There is no React hook wrapper; consumers must call methods directly. No `BLOCKS_ON_INIT` semantic. No `onGrowthBookRefresh` listener.

**Effort.** 1 day. **Severity P2.**

### 2.7 MISSING: `useMainLoopModel` + `useMainLoopModelForSession` with GrowthBook layering

**What Claude has.** `hooks/useMainLoopModel.ts:13-26` resolves `AppState.mainLoopModel` / `mainLoopModelForSession` via `parseUserSpecifiedModel`. Layers GrowthBook overrides (`tengu_ant_model_override`).

**What we have.** `apps/desktop/src/stores/modelStore.ts:1-1387` is the equivalent but is 1,387 LOC — 50× larger. There is no GrowthBook layering, no per-session override state.

**Effort.** Refactor existing modelStore to extract a `useMainLoopModel` hook. 2 days. **Severity P3.**

### 2.8 MISSING: `useSpecBridge` / `useTeleportResume` / `useDirectConnect`

**What Claude has.** `useTeleportResume.tsx`, `useDirectConnect`, `useSSHSession`, `useSessionBackgrounding`, `useSwarmInitialization`, `useFileHistorySnapshotInit`, `useScheduledTasks`, `useInboxPoller.ts` (34K LOC), `useMailboxBridge`. Together these orchestrate session continuity across web↔desktop↔CLI.

**What we have.** `apps/desktop/src/hooks/useSessionPersistence.ts:1-325` covers basic restore. We have no teleport/SSH/swarm equivalent. `useDeepLink.ts:1-225` partially covers `cc://`-style URL handling.

**Effort.** Each is 100-300 LOC; ~5 days for the lot. **Severity P2** for teleport, P3 for the rest.

### 2.9 MISSING: `useInboxPoller` / `useMailboxBridge` (cross-session inbox)

**What Claude has.** `~/Desktop/reference/src/hooks/useInboxPoller.ts` 34K LOC. Polls Anthropic cloud for cross-session messages. Pairs with `useMailboxBridge` and `MailboxProvider` (context). Surface: when a Cowork task completes on another machine, the inbox shows up.

**What we have.** Zero. Mobile has Dispatch (mobile→desktop) but desktop has no listener for it (per MEMORY.md "desktop has zero implementation of `dispatchHmac`/`dispatchSalt`; transitional unsigned-message path expires 2026-06-05").

**Effort.** 10 days including backend wiring. **Severity P0** — this is the dispatch-listener ship-blocker.

### 2.10 MISSING: `useApiKeyVerification` typed states machine

**What Claude has.** `~/Desktop/reference/src/hooks/useApiKeyVerification.ts:24-84+` returns `{status: 'loading'|'valid'|'invalid'|'missing'|'error', reverify, error}`. Unified across BYOK, env-var, OAuth, and helper-script paths.

**What we have.** Spread across `apps/desktop/src/services/supabaseAuth.ts:1-1401` + `apps/desktop/src/api/apiManagement.ts:1-270`. No typed-states return.

**Effort.** 2 days. **Severity P2.**

---

## 3. SERVICES — gaps

### 3.1 MISSING: `services/analytics/index.ts:81-123` queue-on-startup pattern

**What Claude has.** Events queued before the sink attaches at startup; drained on attach via `initSinks()` (called from `setup.ts:371`). Idempotent attach. Comment: payloads cast through the `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = never` (`analytics/index.ts:19`) marker enforces non-PII. Three sinks: Datadog, 1P first-party event proto pipeline, `sinkKillswitch.ts` remote kill.

**What we have.** `apps/desktop/src/services/analytics.ts:1-391` — instantiates `analytics` immediately in module-init. No queue-before-attach. Single sink (Tauri-side). No `_PROTO_*` PII allowlist convention. No remote killswitch.

**Effort.** 3 days. **Severity P1** — early events from auth flow / boot sequence are silently dropped today.

### 3.2 MISSING: `services/api/claude.ts:752, 818, 3063, 3241` LLM transport

**What Claude has.** 3,400+ LOC monolith: `queryModelWithStreaming` at `:752`, `executeNonStreamingRequest` at `:818`, `addCacheBreakpoints` at `:3063`, `queryHaiku` at `:3241`. Plus `client.ts:88` `getAnthropicClient`, `usage.ts:33` `fetchUtilization`, `firstTokenDate.ts`, `withRetry.ts`, `promptCacheBreakDetection.ts:437`, `referral.ts`, `overageCreditGrant.ts`, `ultrareviewQuota.ts`, `metricsOptOut.ts`, `bootstrap.ts`, `dumpPrompts.ts`, `errors.ts` (61 exports — every error class), `errorUtils.ts`, `filesApi.ts`, `grove.ts`, `logging.ts`, `sessionIngress.ts`, `adminRequests.ts`, `emptyUsage.ts`.

**What we have.** Spread across `apps/desktop/src/lib/cloudChatStream.ts:1-148`, `apps/desktop/src/api/cloudApi.ts:1-523`, `apps/desktop/src/lib/streamLifecycle.ts:1-174`, `apps/desktop/src/lib/streamContentRuntime.ts:1-95`. Total ~940 LOC. Missing: prompt-cache breakpoint logic, prompt-cache hit-rate auditing, dump-prompts diagnostic, every error class typed, files API client.

**Effort.** Already partially have this; gap is **prompt-cache discipline** and **typed-error enums**. ~6 days. **Severity P0** for prompt-cache (cost differentiator); P2 for everything else.

### 3.3 MISSING: `services/compact/` (11 files) — context-window compaction pipeline

**What Claude has.** `autoCompact.ts`, `microCompact.ts`, `apiMicrocompact.ts`, `compact.ts`, `compactWarningHook.ts`, `compactWarningState.ts`, `grouping.ts`, `postCompactCleanup.ts`, `prompt.ts`, `sessionMemoryCompact.ts`, `timeBasedMCConfig.ts`. Plus `services/extractMemories/` (2 files) for long-term memory extraction. Plus `services/autoDream/` (4 files) for background memory consolidation.

**What we have.** **ZERO**. Two stub event names at `apps/desktop/src/constants/event-names.ts:39-40` (`COMPACTION_AUTO_TRIGGERED`, `COMPACTION_COMPLETED`) and a settings-side `days_before_compaction` field in `apps/desktop/src/stores/memoryStore.ts:81`. No actual compaction service.

**Effort.** 15 days. **Severity P0** — once a chat exceeds context window, we currently fail; competitors collapse and continue.

### 3.4 MISSING: `services/SessionMemory/` — `initSessionMemory()` + prompts

**What Claude has.** 3 files: `sessionMemory.ts` `initSessionMemory()` called sync from `setup.ts:294`, `prompts.ts`, `sessionMemoryUtils.ts`. Initializes per-session memory.

**What we have.** ZERO under `apps/desktop/src/services/`. `apps/desktop/src/stores/memoryStore.ts:1-1050` covers user-facing memory but does not auto-init per session.

**Effort.** 4 days. **Severity P1.**

### 3.5 MISSING: `services/teamMemorySync/` (5 files) + `secretScanner.ts`

**What Claude has.** `watcher.ts` started under `feature('TEAMMEM')` from `setup.ts:367`; `secretScanner.ts` + `teamMemSecretGuard.ts` (PII guard before sync).

**What we have.** ZERO. `apps/desktop/src/utils/security.ts:1-763` does general security scanning but not memory-sync-specific.

**Effort.** 6 days. **Severity P2** — Team tier feature.

### 3.6 MISSING: `services/policyLimits/` — org-policy gate

**What Claude has.** `services/policyLimits/index.ts:155` `isPolicyAllowed('allow_remote_control')`. Gates features per org policy. Used to gate Bridge / Remote Control.

**What we have.** ZERO. `apps/desktop/src/stores/governanceStore.ts:1-321` is partial but does not check remote-control allowlists.

**Effort.** 3 days. **Severity P2** — Enterprise tier feature.

### 3.7 MISSING: `services/remoteManagedSettings/` (5 files)

**What Claude has.** Anthropic-managed remote settings (subset of org policy): `index.ts`, `securityCheck.tsx`, `syncCache.ts`, `syncCacheState.ts`, `types.ts`. Sync from server; cache to disk; use as overlay over user settings.

**What we have.** ZERO. We have `apps/desktop/src/stores/settingsStore.ts:1-1910` and `apps/desktop/src/services/featureFlags.ts:1-390` — but no Anthropic-side remote-settings push pipeline.

**Effort.** 5 days. **Severity P2.**

### 3.8 MISSING: `services/oauth/` 5-file PKCE flow

**What Claude has.** `index.ts` `OAuthService` class (PKCE + listener), `client.ts` token exchange, `crypto.ts` PKCE primitives, `auth-code-listener.ts` localhost capture, `getOauthProfile.ts` profile fetch.

**What we have.** Supabase OAuth in `apps/desktop/src/services/supabaseAuth.ts:1-1401` (no PKCE — Supabase handles it). MCP OAuth in `apps/desktop/src/stores/mcpStore.ts:746, 1234` partially. **No pure-PKCE service we own** that could front Anthropic-style first-party OAuth.

**Effort.** 4 days. **Severity P2.**

### 3.9 MISSING: `services/lsp/` (7 files) full bridge

**What Claude has.** `LSPClient.ts`, `LSPDiagnosticRegistry.ts`, `LSPServerInstance.ts`, `LSPServerManager.ts`, `manager.ts`, `passiveFeedback.ts`, `config.ts`. Shutdown registered from `entrypoints/init.ts:9` (`shutdownLspServerManager`).

**What we have.** `apps/desktop/src/api/lsp.ts:1-374` — Tauri-side LSP API wrapper plus `apps/desktop/src/hooks/useLSP.ts:1-460` — Total ~830 LOC. We have basic LSP but no per-server-instance state machine, no diagnostic registry, no passive-feedback channel.

**Effort.** 5 days. **Severity P2.**

### 3.10 MISSING: `services/PromptSuggestion/speculation.ts`

**What Claude has.** Speculative pre-execution of likely follow-ups. Pairs with the `AppState.speculation` slice (§1.3).

**What we have.** ZERO. `apps/desktop/src/hooks/usePromptSuggestions.ts:1-288` is suggestion generation, not speculative pre-execution.

**Effort.** 8 days (depends on §1.3). **Severity P3.**

### 3.11 MISSING: `services/tools/StreamingToolExecutor.ts` + `toolOrchestration.ts:19` `runTools` async generator

**What Claude has.** `services/tools/toolExecution.ts:337` `runToolUse`, `toolHooks.ts` for `PreToolUse`/`PostToolUse` hook integration, `toolOrchestration.ts:19` `runTools` async generator that yields per-tool results.

**What we have.** Tool runtime spread across `apps/desktop/src/lib/toolStreamRuntime.ts:1-151`, `apps/desktop/src/lib/toolTimelineRuntime.ts:1-163`, `apps/desktop/src/lib/toolMatcher.ts:1-669`, `apps/desktop/src/lib/toolDisplayNames.ts:1-649`, `apps/desktop/src/stores/chat/toolStore.ts:1-1455`. Total ~3,000 LOC. Missing: `runTools` async-generator orchestrator that ties hook fanout to per-tool result streaming.

**Effort.** 6 days. **Severity P0** — without a unified orchestrator, hook integration is impossible.

### 3.12 MISSING: `services/MagicDocs/` — auto-generated docs reader

**What Claude has.** 2 files for reading auto-generated docs from MCP servers / connectors.

**What we have.** ZERO.

**Effort.** 3 days. **Severity P3.**

### 3.13 MISSING: `services/notifier.ts` cross-platform OS notification dispatcher

**What Claude has.** 4.3K-LOC dispatcher hiding macOS NSUserNotification / Windows Toast / Linux libnotify behind one API.

**What we have.** Tauri notification API directly invoked from `apps/desktop/src/hooks/useNotifications.ts:1-455`. No fallback path; no priority queue; no de-dup.

**Effort.** 2 days. **Severity P3.**

### 3.14 MISSING: `services/preventSleep.ts` — `caffeinate`/`SetThreadExecutionState`

**What Claude has.** Cross-platform 4.6K-LOC sleep-prevention service. Pairs with the Cowork "Keep your computer awake while Claude works" toggle.

**What we have.** ZERO. Long-running tasks die when the laptop sleeps.

**Effort.** 1 day. **Severity P1** — for any background task UX.

### 3.15 MISSING: `services/awaySummary.ts` — "while you were away"

**What Claude has.** 2.7K LOC. Generates summary of activity that happened while user was idle.

**What we have.** ZERO.

**Effort.** 3 days. **Severity P3.**

### 3.16 MISSING: `services/tokenEstimation.ts` (16.9K LOC) + `services/claudeAiLimits.ts` (16.8K LOC)

**What Claude has.** Pre-API token-count estimation + subscriber-side rate-limit fetch with caching + reset-time hook (`claudeAiLimitsHook.ts`).

**What we have.** `apps/desktop/src/utils/tokenCount.ts:1-201` — basic count, no per-model estimation. `apps/desktop/src/stores/billingUsage.ts:1-1782` covers billing but not pre-API estimation. No reset-time UX.

**Effort.** 6 days. **Severity P1** — users cannot see "your next chat will cost X" prediction.

### 3.17 MISSING: `services/rateLimitMessages.ts` (10.9K LOC) + `rateLimitMocking.ts`

**What Claude has.** Human-readable 429 explanations: which limit hit, when it resets, what to do.

**What we have.** Generic toast on 429 in `apps/desktop/src/lib/friendlyErrors.ts:1-45`. Not per-limit explanatory.

**Effort.** 2 days. **Severity P2.**

### 3.18 MISSING: `services/vcr.ts` (12.2K LOC) — record/replay HTTP for tests

**What Claude has.** Test-time HTTP record/replay harness.

**What we have.** ZERO. We use vitest mocks instead.

**Effort.** 5 days. **Severity P3.**

### 3.19 MISSING: `services/voice.ts` + `voiceKeyterms.ts` + `voiceStreamSTT.ts` (~41K LOC)

**What Claude has.** Native STT + voice mode + key-term boosting.

**What we have.** `apps/desktop/src/hooks/useVoiceTranscription.ts:1-816`, `apps/desktop/src/stores/voiceModeStore.ts:1-1227`, `apps/desktop/src/stores/voiceInputStore.ts:1-310`, `apps/desktop/src/api/voice.ts:1-778`. Total ~3,131 LOC. Reasonable parity at the feature level; we're missing key-term boosting (`voiceKeyterms.ts`) and Anthropic's specific STT model.

**Effort.** 4 days for key-term boosting. **Severity P3.**

### 3.20 MISSING: `services/tips/` (3 files) — rotating UI tips

**What Claude has.** `tipHistory.ts`, `tipRegistry.ts`, `tipScheduler.ts`.

**What we have.** ZERO.

**Effort.** 2 days. **Severity P3.**

### 3.21 MISSING: `services/diagnosticTracking.ts` (12.3K LOC) — counters & spans

**What Claude has.** Hook-style diagnostic counters with OTel spans.

**What we have.** `apps/desktop/src/services/performance.ts:1-371` covers some counters. Spans are scattered.

**Effort.** 3 days. **Severity P2.**

### 3.22 MISSING: `services/internalLogging.ts` — internal-only log sink

**What Claude has.** Sentinel sink for internal-build-only events.

**What we have.** `apps/desktop/src/services/errorReporting.ts:1-266` + `errorTracking.ts:1-349` — overlapping scope, no internal/external separation.

**Effort.** 1 day. **Severity P3.**

---

## 4. CONTEXT (React) — gaps

### 4.1 MISSING: `context/notifications.tsx` priority queue (33K LOC)

**What Claude has.** `useNotifications` (`:38`); priorities + queue helper `getNext` (`:236`); 9-context separation. Toasts/banners with priority lanes.

**What we have.** Single `apps/desktop/src/hooks/useNotifications.ts:132` hook. No priority lanes. No `getNext` queue resolution.

**Effort.** 4 days. **Severity P2.**

### 4.2 MISSING: `MailboxProvider` + `useMailbox` cross-session inbox

**What Claude has.** `context/mailbox.tsx` (3.4K LOC). Cross-session inbox provider. Wired into `AppStateProvider` at `AppState.tsx:94`.

**What we have.** ZERO. Pairs with §2.9.

**Effort.** Already counted in §2.9. **Severity P0** (Dispatch listener).

### 4.3 MISSING: `VoiceProvider` (8.8K LOC) — voice store with `useVoiceState`/`useSetVoiceState`/`useGetVoiceState`

**What Claude has.** Three-hook split for voice: `useVoiceState` (read), `useSetVoiceState` (mutate), `useGetVoiceState` (imperative) at `:55-85`. Gated by `feature('VOICE_MODE')`.

**What we have.** `apps/desktop/src/stores/voiceModeStore.ts` is a single zustand store. Consumers re-render on any voice change.

**Effort.** 2 days to split. **Severity P3.**

### 4.4 MISSING: `StatsProvider` (22K LOC) `useCounter`/`useGauge`/`useTimer`/`useSet`

**What Claude has.** In-process metrics aggregator. Four hook types: `useCounter`, `useGauge`, `useTimer`, `useSet`.

**What we have.** ZERO. Counters scattered as raw numbers in stores.

**Effort.** 3 days. **Severity P2.**

### 4.5 MISSING: `OverlayContext` — escape-key coordination registry

**What Claude has.** `context/overlayContext.tsx` (14K LOC). `useRegisterOverlay`/`useIsOverlayActive`/`useIsModalOverlayActive` (`:38-140`). Centralized escape-key handling so multiple overlays coordinate.

**What we have.** Each modal in `apps/desktop/src/components/` handles its own escape key. Bug: pressing escape with two open modals dismisses both.

**Effort.** 3 days. **Severity P2.**

### 4.6 MISSING: `ModalContext` — modal sizing + scroll

**What Claude has.** `context/modalContext.tsx` (6.3K LOC). `useIsInsideModal`, `useModalOrTerminalSize`, `useModalScrollRef`.

**What we have.** Inline sizing in each modal.

**Effort.** 2 days. **Severity P3.**

### 4.7 MISSING: `PromptOverlayProvider` — 4-context split

**What Claude has.** `context/promptOverlayContext.tsx` (12K LOC). `PromptOverlayProvider` (`:34`) splits `data` / `setter` / `dialog` / `setDialog` into **four** React contexts to minimize re-renders. Pattern Claude doc explicitly recommends adopting.

**What we have.** ZERO 4-context split anywhere.

**Effort.** 1 day for the pattern. **Severity P2.**

### 4.8 MISSING: `QueuedMessageProvider` (5.6K LOC) `useQueuedMessage`

**What Claude has.** Buffer for user messages typed while model is mid-stream. On next idle, drained.

**What we have.** Partial — `apps/desktop/src/stores/chat/chatStore.ts` has `PendingUserMessage` typing but no centralized queue/drain.

**Effort.** 2 days. **Severity P2.**

### 4.9 MISSING: `FpsMetricsProvider` (3.2K LOC) `useFpsMetrics`

**What Claude has.** Frame-rate getter for dev bar.

**What we have.** ZERO.

**Effort.** 1 day. **Severity P3.**

---

## 5. SUBAGENTS / TOOLS / MCP — gaps

### 5.1 MISSING: `services/mcp/client.ts:595` `connectToServer` memoize + LRU caches

**What Claude has.** `services/mcp/client.ts` ~2,632 LOC, **41 exports**. `connectToServer` is `memoize`d — identical configs share one connection. `fetchToolsForClient` (`:1743`) and `fetchResourcesForClient` (`:2000`) are LRU-memoized. Three-layer cache: process-level memoize, server-cache key invalidation at `clearServerCache`, explicit `reconnectMcpServerImpl`.

**What we have.** `apps/desktop/src/api/mcp.ts:1-1240` is the API wrapper; `apps/desktop/src/stores/mcpStore.ts:1-1445` is the store. Total ~2,685 LOC. There is **no memoization on configHash**; each store-init call hits the Tauri side. There is no LRU on tool/resource fetch.

**Effort.** 3 days. **Severity P0** — repeated stdio traffic on every UI render.

### 5.2 MISSING: `services/mcp/MCPConnectionManager.tsx:38` React glue (`useMcpReconnect`, `useMcpToggleEnabled`)

**What Claude has.** React component orchestrating MCP connection lifecycle by reading config + AppState.

**What we have.** ZERO. Reconnect is a manual store-action call.

**Effort.** 2 days. **Severity P2.**

### 5.3 MISSING: 8 MCP transports

**What Claude has.** `services/mcp/types.ts` defines `McpStdioServerConfig`, `McpSSEServerConfig`, `McpSSEIDEServerConfig`, `McpWebSocketIDEServerConfig`, `McpHTTPServerConfig`, `McpWebSocketServerConfig`, `McpSdkServerConfig`, `McpClaudeAIProxyServerConfig`. Plus transport adapters: `InProcessTransport.ts`, `SdkControlTransport.ts`, `vscodeSdkMcp.ts`.

**What we have.** Per MEMORY.md: "MCP: stdio only." Other transports likely fail silently. `apps/desktop/src/types/mcp.ts` does not surface 8 distinct config types.

**Effort.** 8 days for HTTP + SSE + WebSocket; 12 for full 8. **Severity P0** for HTTP (most modern remote MCPs); P1 for SSE/WS.

### 5.4 MISSING: `services/mcp/auth.ts` + `oauthPort.ts` + `xaa.ts` + `xaaIdpLogin.ts`

**What Claude has.** stdio MCP-OAuth via `auth.ts` and `oauthPort.ts`; xaa IDP login via `xaa.ts` / `xaaIdpLogin.ts`. Channel notifications routed via `channelNotification.ts` + `channelPermissions.ts` + `channelAllowlist.ts`.

**What we have.** Partial OAuth in `apps/desktop/src/stores/mcpStore.ts:746, 1234`. No xaa IDP. No channel allowlist/permissions.

**Effort.** 4 days for non-IDP; 8 for IDP. **Severity P1.**

### 5.5 MISSING: `services/mcp/elicitationHandler.ts` — MCP elicitations

**What Claude has.** `Elicitation` event handler — when an MCP server wants user input (e.g., "which file?"), server sends elicitation, harness shows dialog, user answers, harness sends `ElicitationResult` back.

**What we have.** ZERO. Hook system has no `Elicitation`/`ElicitationResult` event (per `deep/m4-hooks-system.md` §13 our 22 hook events are missing all 5 elicitation-related events).

**Effort.** 5 days. **Severity P1.**

### 5.6 MISSING: `services/mcp/officialRegistry.ts` curated catalog

**What Claude has.** Anthropic's curated catalog of 200+ verified MCP servers. Discovery surface for the `+` menu and Connectors directory.

**What we have.** `apps/desktop/src/stores/mcpStore.ts:48-50` (`registry: McpRegistryPackage[]`) — fetched, but no curated allowlist; users can add any MCP.

**Effort.** 2 days for the curation layer. **Severity P3.**

### 5.7 MISSING: `services/AgentSummary/agentSummary.ts` — sub-agent summarization

**What Claude has.** Per-subagent summarization: when a subagent finishes, summarize its transcript into a compact handoff for the parent.

**What we have.** ZERO.

**Effort.** 4 days. **Severity P1** — without summarization, subagent results blow context window.

### 5.8 MISSING: `services/toolUseSummary/toolUseSummaryGenerator.ts`

**What Claude has.** Compress lengthy tool calls before re-injection.

**What we have.** ZERO.

**Effort.** 2 days. **Severity P2.**

### 5.9 MISSING: `tasks/InProcessTeammateTask` (16K LOC) — multi-agent same-process

**What Claude has.** `tasks/InProcessTeammateTask/InProcessTeammateTask.tsx` (16,381 bytes) + types. Teams have an `identity: { agentId, agentName, teamName, color, planModeRequired, parentSessionId }` shape. `messages?: Message[]` cap at `TEAMMATE_MESSAGES_UI_CAP = 50` because BQ analysis showed 36.8 GB RSS in a 292-agent burst.

**What we have.** `apps/desktop/src/stores/agentTaskStore.ts:1-1068` is the equivalent slot but does not implement teammate identity, color assignment, or RSS-cap discipline.

**Effort.** 6 days. **Severity P1** for team mode.

### 5.10 MISSING: `tasks/RemoteAgentTask` (126K LOC) — Anthropic-cloud session poller

**What Claude has.** `RemoteAgentTask.tsx` 126,389 bytes. `remoteTaskType` enum: `'remote-agent' | 'ultraplan' | 'ultrareview' | 'autofix-pr' | 'background-pr'`. Polls Anthropic cloud every tick. `pollStartedAt` preserved on `--resume`.

**What we have.** Some equivalents in `apps/desktop/src/stores/backgroundTaskStore.ts:1-544`, `apps/desktop/src/stores/executionStore.ts:1-1367`. Missing: cloud session poller, all 5 task types, `--resume` continuity.

**Effort.** 12 days. **Severity P3** — only relevant if we build cloud-CCR equivalent.

### 5.11 MISSING: `tasks/LocalShellTask` stall watchdog

**What Claude has.** `LocalShellTask/LocalShellTask.tsx:32-99` — every 5 seconds, if output hasn't grown for 45 seconds AND tail looks like `(y/n)` prompt (regexes at `:32-38`), enqueue a one-shot `task-notification`. The model can choose to kill+rerun with piped input.

**What we have.** ZERO. Stuck shell tasks block forever.

**Effort.** 1 day. **Severity P1** — universal pain.

### 5.12 MISSING: `tasks/stopTask.ts:38-100` shared stop semantics

**What Claude has.** Shared by `TaskStopTool` (LLM-invoked) and `stop_task` SDK control request. Returns `StopTaskError` with code `'not_found' | 'not_running' | 'unsupported_type'`.

**What we have.** Partial — `apps/desktop/src/stores/agentTaskStore.ts:103` `cancelTask` exists but no typed-error return.

**Effort.** 1 day. **Severity P2.**

### 5.13 MISSING: `tasks/pillLabel.ts` footer-pill rules

**What Claude has.** `pillLabel.ts:10-67` renders the footer pill text. Special-cases ultraplan: `◇` open diamond when running/needs-input, `◆` filled when ExitPlanMode is awaiting approval.

**What we have.** ZERO standardized footer pill UX. `apps/desktop/src/stores/backgroundTaskStore.ts` has running tasks but no pill renderer.

**Effort.** 1 day. **Severity P3.**

### 5.14 MISSING: `tasks/DreamTask` — auto-dream subagent

**What Claude has.** `DreamTask.ts` 158 LOC. Background "dreaming" memory consolidation runs as a background task with `notified: true` (system-message-only).

**What we have.** ZERO.

**Effort.** 5 days. **Severity P2** (Pro tier).

---

## 6. SKILLS / WORKFLOW — gaps

### 6.1 MISSING: `skills/loadSkillsDir.ts` — 1,087-LOC discovery + dedup + conditional + dynamic

**What Claude has.** `~/Desktop/reference/src/skills/loadSkillsDir.ts:78-94` four-source discovery (managed/user/project/plugin) plus `--add-dir` plus legacy `commands/` fallback. Realpath-based dedup (`:118-124, 728-769`) using `realpath()` instead of inode (filesystem-agnostic). `--bare` mode skips dedup.

**What we have.** `apps/desktop/src/lib/skillLoader.ts:1-298` (298 LOC) reads bundled skill `.md` files via Vite `import.meta.glob`. **No filesystem-discovery layer at all.** No 4-source priority. No realpath dedup. No `--add-dir`.

**Effort.** 8 days. **Severity P0** — without filesystem discovery, user-authored skills cannot ship.

### 6.2 MISSING: 16-field SKILL.md frontmatter

**What Claude has.** `parseSkillFrontmatterFields()` at `loadSkillsDir.ts:185-265`: `name, description, when_to_use, model, effort, allowed-tools, argument-hint, arguments, version, disable-model-invocation, user-invocable, hooks, context, agent, paths, shell` (16 fields).

**What we have.** Per `apps/desktop/src/lib/skillLoader.ts:14-37`: `id, name, description, category, tools, model, expertise, systemPrompt, avatar, price` (10 fields). Missing: `when_to_use`, `effort`, `argument-hint`, `arguments`, `version`, `disable-model-invocation`, `user-invocable`, `hooks`, `context: 'fork'`, `agent`, `paths`, `shell`. Has extras (`category`, `expertise`, `avatar`, `price`).

**Effort.** 3 days. **Severity P1.**

### 6.3 MISSING: `paths` gitignore-glob conditional activation

**What Claude has.** `loadSkillsDir.ts:997-1058` `activateConditionalSkillsForPaths(filePaths, cwd)` runs whenever model touches a file. Build `ignore().add(skill.paths)`; for each absolute file path, `relative(cwd, filePath)`, reject paths that escape cwd. If `skillIgnore.ignores(relativePath)`: move from `conditionalSkills` to `dynamicSkills`. Fires `tengu_dynamic_skills_changed`.

**What we have.** ZERO. All bundled skills are loaded eagerly.

**Effort.** 3 days. **Severity P0** — this is THE pattern that makes 200+ skills scale without prompt bloat.

### 6.4 MISSING: `skills/bundled/` skill registry pattern

**What Claude has.** 17 bundled skills, registered via `bundled/index.ts:24-79`. Always-registered (10) + feature-gated (7). `process.env.USER_TYPE !== 'ant'` early-return for internal-only skills.

**What we have.** Bundled `.md` files in `apps/desktop/src/skills/` (per `skillLoader.ts`) but no programmatic registration with `feature()` gating.

**Effort.** 2 days. **Severity P2.**

### 6.5 MISSING: `mcpSkillBuilders.ts` write-once registry pattern

**What Claude has.** `mcpSkillBuilders.ts:1-44` — write-once registry to break import cycles. Comment explains: variable-specifier dynamic imports pass dep-cruiser but fail at runtime in bunfs binaries. Solution: types-only module + eager static-import registration at module-init.

**What we have.** Not applicable as a pattern — but the underlying problem (cycle between MCP loader and skill loader) does not exist for us yet because filesystem skill loading is absent.

**Effort.** 0 days now; revisit when §6.1 ships. **Severity P3.**

### 6.6 MISSING: Bundled skill safe-extraction (`safeWriteFile` `O_NOFOLLOW | O_EXCL | 0o600`)

**What Claude has.** `bundledSkills.ts:131-167` — skills with `files: { '<rel>': '<content>' }` extract to disk on first invocation. `safeWriteFile` uses `O_NOFOLLOW | O_EXCL | 0o600` (POSIX) or `'wx'` flag (Windows). Per-process nonce as primary defense against pre-created symlinks/dirs.

**What we have.** ZERO file-write skill extraction.

**Effort.** 2 days. **Severity P2.**

### 6.7 MISSING: 22→27 hooks events (per `deep/m4-hooks-system.md` §10)

**What Claude has.** 27 distinct hook events; we have 22 in `apps/cli/src/hooks.rs` (this team is desktop, but hooks-store side is `apps/desktop/src/stores/extensionEventsStore.ts:1-128` which does not expose hook events at all).

**What we have.** No `apps/desktop/src/stores/hooksStore.ts`. Hook config lives only on the CLI side. Desktop UI cannot read or write user hooks.

**Effort.** 8 days for desktop UI parity. **Severity P0** — Cowork/Code-tab is differentiator.

### 6.8 MISSING: 4 advanced hook handlers (`HTTP`, `prompt`, `agent`, `function`)

**What Claude has.** Per `deep/m4-hooks-system.md` §3: 5 handler types implemented. `HTTP` (URL allowlist + SSRF guard at `services/mcp/ssrfGuard.ts:1-294`), `prompt` (small-fast-model evaluation), `agent` (subagent spawn, max 50 turns), `function` (in-memory JS callback), `callback` (SDK-injected).

**What we have.** ZERO from desktop side.

**Effort.** 18 days for all 4. **Severity P0** — Slack/PagerDuty/sentry hooks via HTTP.

### 6.9 MISSING: `AsyncHookRegistry.ts:1-309` async hooks

**What Claude has.** `pendingHooks: Map<processId, PendingAsyncHook>`. `registerPendingAsyncHook` default `timeout = 15000ms`. `checkForAsyncHookResponses` polled by agent loop.

**What we have.** ZERO.

**Effort.** 6 days. **Severity P1.**

### 6.10 MISSING: `services/extractMemories/` (2 files) + `prompts.ts`

**What Claude has.** Long-term memory extraction from sessions.

**What we have.** ZERO. `apps/desktop/src/api/memory.ts:1-1053` covers memory CRUD but not session-level extraction.

**Effort.** 5 days. **Severity P1.**

### 6.11 MISSING: `services/autoDream/` (4 files)

**What Claude has.** Background memory consolidation: `autoDream.ts`, `config.ts`, `consolidationLock.ts`, `consolidationPrompt.ts`.

**What we have.** ZERO.

**Effort.** 6 days (depends on §6.10 + §3.3). **Severity P2.**

### 6.12 MISSING: `memdir/` (8 files) — file-based memory

**What Claude has.** `paths.ts` with auto-memory-dir resolution (rejecting `projectSettings.autoMemoryDirectory` because malicious-repo case at `:172-176`); `memdir.ts:34-38` `MEMORY.md` cap (200 lines / 25 KB) with `truncateEntrypointContent`; `memoryTypes.ts:14-21` 4-type taxonomy (`user / feedback / project / reference`); `findRelevantMemories.ts:39-75` Sonnet-ranked recall (5 max); `memoryAge.ts:33-53` staleness flag for >1 day old; `teamMemPaths.ts:84-86` team subdirectory.

**What we have.** `apps/desktop/src/stores/memoryStore.ts:1-1050`. Single store. No filesystem layer. No 4-type taxonomy at this granularity. No staleness flag. No `MEMORY.md` cap.

**Effort.** 8 days. **Severity P0** — Memory parity is one of Anthropic's four pillars (per `anthropic-claude-suite-may-2026.md` §1.6).

### 6.13 MISSING: `migrations/` (11 files) — imperative migration layer

**What Claude has.** 11 imperative TypeScript migrations: `migrateAutoUpdatesToSettings.ts`, `migrateBypassPermissionsAcceptedToSettings.ts`, `migrateEnableAllProjectMcpServersToSettings.ts`, `migrateFennecToOpus.ts`, `migrateLegacyOpusToCurrent.ts`, `migrateOpusToOpus1m.ts`, `migrateReplBridgeEnabledToRemoteControlAtStartup.ts`, `migrateSonnet1mToSonnet45.ts`, `migrateSonnet45ToSonnet46.ts`, `resetAutoModeOptInForDefaultOffer.ts`, `resetProToOpusDefault.ts`. Each emits `tengu_migrate_*` events. Idempotency via completion flags or rewrite-the-same-source.

**What we have.** `apps/desktop/src/api/migration.ts:1-178` — a single file. No imperative pattern, no tier-gated migrations, no `tengu_migrate_*` events.

**Effort.** 4 days. **Severity P1** — every `models.json` retire becomes a 50-LOC file.

### 6.14 MISSING: `plugins/builtinPlugins.ts` (160 LOC) — built-in plugin registry

**What Claude has.** `BUILTIN_PLUGINS: Map<string, BuiltinPluginDefinition>`. `registerBuiltinPlugin(definition)`. `getBuiltinPlugins()` reads `settings.enabledPlugins[pluginId]` and partitions into enabled/disabled. Built-ins differ from bundled skills in that they appear in the `/plugin` UI under a 'Built-in' section, are user-toggleable, and can provide multiple components (skills, hooks, MCP servers).

**What we have.** ZERO — `apps/desktop/src/stores/marketplaceStore.ts:1-454` covers the marketplace but does not have a built-in registry.

**Effort.** 2 days. **Severity P2.**

### 6.15 MISSING: `services/plugins/PluginInstallationManager.ts:60` `performBackgroundPluginInstallations`

**What Claude has.** Background plugin installation manager. Plus `pluginCliCommands.ts` and `pluginOperations.ts`.

**What we have.** Partial — `apps/desktop/src/stores/marketplaceStore.ts:1-454` and `apps/desktop/src/api/marketplace.ts:1-541`. No background installation manager; installs are foreground.

**Effort.** 3 days. **Severity P2.**

---

## 7. IPC / API — gaps

### 7.1 MISSING: `cli/structuredIO.ts` (28.7K LOC) `StructuredIO` class

**What Claude has.** `cli/structuredIO.ts:135` `StructuredIO` class. Stream-json transport for SDK consumers. `SANDBOX_NETWORK_ACCESS_TOOL_NAME` constant at `:62`.

**What we have.** ZERO. `apps/desktop/src/utils/ipc.ts:1-299` is Tauri-side IPC; no stream-json output for headless / SDK callers.

**Effort.** 6 days. **Severity P2** for headless mode.

### 7.2 MISSING: 8 transport classes

**What Claude has.** `cli/transports/`: `ccrClient.ts`, `HybridTransport.ts`, `SerialBatchEventUploader.ts`, `SSETransport.ts`, `WebSocketTransport.ts`, `WorkerStateUploader.ts`, `transportUtils.ts`.

**What we have.** `apps/desktop/src/services/websocketClient.ts:1-235` — WebSocket only. No SSE; no batch event uploader; no hybrid; no CCR.

**Effort.** 10 days. **Severity P2** for non-WS transports.

### 7.3 PARTIAL: `cli/handlers/` 6 subcommand handlers — desktop-side equivalents

**What Claude has.** `cli/handlers/`: `agents.ts`, `auth.ts`, `autoMode.ts`, `mcp.tsx`, `plugins.ts`, `util.tsx`.

**What we have.** Desktop equivalents partial: `apps/desktop/src/api/agent.ts:1-230`, `apps/desktop/src/services/supabaseAuth.ts:1-1401`, `apps/desktop/src/api/mcp.ts:1-1240`, `apps/desktop/src/api/marketplace.ts:1-541`. We are missing `autoMode.ts` entirely — there is no auto-mode classifier UX on desktop.

**Effort.** 6 days for autoMode. **Severity P0** for autoMode (Cowork-class permission model).

### 7.4 MISSING: `entrypoints/init.ts:57` `init = memoize(async () => …)` per-process idempotent init

**What Claude has.** Per `tasks/research/src-08-services-state.md` §22: `enableConfigs()`, `applySafeConfigEnvironmentVariables()`, `applyExtraCACertsFromConfig()`, `setupGracefulShutdown()`, lazy-init 1P event logging + GrowthBook, `applyConfigEnvironmentVariables()`, `configureGlobalAgents()` (proxy), `configureGlobalMTLS()`, JetBrains detection, scratchpad dir, telemetry attributes, repo detection, OAuth account hydration, kicks off remote-managed-settings + policy-limits loading promises, registers shutdown for LSP.

**What we have.** Boot logic spread across `apps/desktop/src/App.tsx:1-1700` + `apps/desktop/src/main.tsx`. No single memoized `init()`. Several of these (extra CA certs, mTLS, JetBrains detection) are absent.

**Effort.** 4 days. **Severity P1.**

### 7.5 MISSING: `setup.ts` 478-LOC orchestrator — 20-step boot

**What Claude has.** Single `setup(...)` async function that runs 20 enumerated steps including UDS messaging server, teammate snapshot, terminal backup restoration, `setCwd`, hook config snapshot, file-changed watcher, worktree creation, session memory init, plugin prefetch, ant-only repo classification, attribution hooks, session-file-access hooks, TEAMMEM watcher, `initSinks()`, `tengu_started` event, API key pre-fetch, release-notes/recent-activity fetch, bypass-permissions safety gate, last-session cost restore.

**What we have.** Boot logic in `apps/desktop/src/App.tsx` + `apps/desktop/src/stores/authOrchestrator.ts:1-462`. Missing: hook-config snapshot, file-changed watcher, plugin prefetch, ant-only logic, attribution hooks, session-file-access hooks, TEAMMEM watcher, `tengu_started` event, last-session cost restore.

**Effort.** 5 days. **Severity P1.**

### 7.6 MISSING: `entrypoints/cli.tsx:37-42` `--version` zero-import fast path

**What Claude has.** `--version` is **zero imports beyond cli.tsx**. Sub-100ms cold start. Other fast paths: `--dump-system-prompt`, `--claude-in-chrome-mcp`, `--chrome-native-host`, `--computer-use-mcp`, `--daemon-worker`, `daemon`, `remote-control` aliases (`rc`/`remote`/`sync`/`bridge`), `ps`/`logs`/`attach`/`kill`, `new`/`list`/`reply` template subcommands, `environment-runner`, `self-hosted-runner`, `--worktree --tmux` exec, `--update`/`--upgrade` redirects.

**What we have.** Tauri loads the entire bundle. No fast paths.

**Effort.** 3 days for `--version`; 12 days for the full set. **Severity P2.**

### 7.7 MISSING: `entrypoints/mcp.ts:6.3K` — expose Claude tools as MCP server

**What Claude has.** `startMCPServer(cwd, debug, verbose)` exposes the harness's tools as an MCP server (stdio). Re-uses `getTools(toolPermissionContext)` and `findToolByName`.

**What we have.** ZERO. We are MCP-client only; we do not expose ourselves as an MCP server.

**Effort.** 8 days. **Severity P2** — interoperability with other agentic harnesses.

### 7.8 MISSING: SDK control protocol Zod schemas

**What Claude has.** `entrypoints/sdk/{controlSchemas,coreSchemas,coreTypes}.ts` — Zod schemas for the agent-SDK control protocol.

**What we have.** Type-only `apps/desktop/src/types/`. No runtime Zod validation.

**Effort.** 4 days. **Severity P3.**

---

## 8. PARTIAL implementations

### 8.1 PARTIAL: MCP — present but stdio-only

`apps/desktop/src/api/mcp.ts:1-1240` + `stores/mcpStore.ts:1-1445` cover MCP **client** integration. Per MEMORY.md "MCP: stdio only." We are missing all 7 other transports plus the memoization layer (§5.1) plus elicitation (§5.5) plus channels (§5.4) plus official-registry curation (§5.6).

**Coverage:** ~30% of Claude Code MCP surface.

### 8.2 PARTIAL: Hooks — partially exposed

Desktop has `apps/desktop/src/stores/extensionEventsStore.ts:1-128` and `apps/desktop/src/api/automation.ts:1-406` which surface SOME hook-like events to the chrome extension. There is no in-app hook editor, no UI for `/hooks`, no `disableAllHooks` / `allowManagedHooksOnly` policy gates.

**Coverage:** ~20% of Claude Code hook surface.

### 8.3 PARTIAL: Notifications — single hook, no priority

`apps/desktop/src/hooks/useNotifications.ts:1-455` exists but is monolithic. Missing: 16-hook `notifs/` per-domain split (§2.1), priority queue (§4.1), `getNext` queue resolution.

**Coverage:** ~25% of Claude Code notifications surface.

### 8.4 PARTIAL: Voice — feature parity, missing key-term boost

`apps/desktop/src/hooks/useVoiceTranscription.ts:1-816` + `stores/voiceModeStore.ts:1-1227` + `stores/voiceInputStore.ts:1-310` + `api/voice.ts:1-778` total ~3,131 LOC. Missing: `voiceKeyterms.ts` boost and Anthropic-specific STT model.

**Coverage:** ~80% of Claude Code voice surface.

### 8.5 PARTIAL: Agent tasks — present, missing teammate identity + RSS cap

`apps/desktop/src/stores/agentTaskStore.ts:1-1068` + `stores/backgroundTaskStore.ts:1-544` + `stores/executionStore.ts:1-1367` + `hooks/useBackgroundTasks.ts:1-391`. Missing: `InProcessTeammateTask` 16K LOC + identity shape + 50-message UI cap + color assignment + `RemoteAgentTask` poller + `LocalShellTask` stall watchdog.

**Coverage:** ~60% of Claude Code task surface.

### 8.6 PARTIAL: LSP — wrappers present, no full bridge

`apps/desktop/src/api/lsp.ts:1-374` + `apps/desktop/src/hooks/useLSP.ts:1-460` total ~830 LOC. Missing: per-server-instance state machine, diagnostic registry, passive-feedback channel.

**Coverage:** ~50% of Claude Code LSP surface.

### 8.7 PARTIAL: Cloud chat / SSE — partial, no batch event uploader

`apps/desktop/src/lib/cloudChatStream.ts:1-148` + `apps/desktop/src/api/cloudApi.ts:1-523` + `apps/desktop/src/services/cloudChat.ts:1-122` total ~793 LOC. Missing: SSE transport, hybrid transport, batch event uploader.

**Coverage:** ~40% of Claude Code transport surface.

### 8.8 PARTIAL: Memory — store-only, no filesystem layer

`apps/desktop/src/stores/memoryStore.ts:1-1050` + `apps/desktop/src/api/memory.ts:1-1053` + `apps/desktop/src/api/projectMemory.ts:1-316` + `apps/desktop/src/hooks/useMemory.ts:1-681` total ~3,100 LOC. Missing: file-based `~/.agiworkforce/projects/<slug>/memory/` layout, MEMORY.md cap, 4-type taxonomy, staleness flag, Sonnet-ranked recall, team-memory dir.

**Coverage:** ~35% of Claude Code memory surface.

### 8.9 PARTIAL: Settings sync — local only

`apps/desktop/src/stores/settingsStore.ts:1-1910` is comprehensive locally. Missing: Anthropic-managed remote settings (§3.7), org-policy gate (§3.6), team memory sync (§3.5).

**Coverage:** ~70% of Claude Code settings surface.

### 8.10 PARTIAL: Auth — Supabase + Stripe wired, no PKCE OAuth service

`apps/desktop/src/services/supabaseAuth.ts:1-1401` + `apps/desktop/src/services/stripe.ts:1-353` + `apps/desktop/src/services/subscriptionService.ts:1-360`. Missing: own PKCE OAuth service (§3.8), JetBrains-detection, AWS/GCP credential cache clearing on settings change.

**Coverage:** ~75% of Claude Code auth surface.

---

## 9. PER-AXIS PERCENTAGE COVERAGE

| Axis                                    | Estimated coverage vs Claude Code | Headline gap                                                                                                                                                               |
| --------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **State management**                    | ~25%                              | Zustand × 102 vs handwritten single store + onChangeAppState choke-point + bootstrap/state.ts module global                                                                |
| **Hooks / lifecycle**                   | ~30%                              | Missing 16 notifs hooks, useExitOnCtrlCD, useCanUseTool unified gate, useInboxPoller (Dispatch listener), useDynamicConfig                                                 |
| **Services**                            | ~25%                              | Missing compact pipeline (11 files), SessionMemory, teamMemorySync, policyLimits, remoteManagedSettings, oauth, lsp full bridge, speculation, AgentSummary, toolUseSummary |
| **Context (React)**                     | ~10%                              | Missing notifications priority queue, Mailbox, Voice, Stats, Overlay, Modal, PromptOverlay, QueuedMessage, FpsMetrics                                                      |
| **IPC / API**                           | ~50%                              | Have Tauri wrappers; missing structuredIO, 8 transports, init memoize, setup orchestrator                                                                                  |
| **Tools**                               | ~35%                              | Have tool runtime; missing runTools async generator, tool-permission unified gate, tool-use summary                                                                        |
| **MCP**                                 | ~30%                              | Stdio only; missing 7 transports, memoization, MCPConnectionManager, elicitation, official registry, channels                                                              |
| **Subagents**                           | ~25%                              | Missing InProcessTeammateTask, RemoteAgentTask, AgentSummary, color assignment, RSS-cap discipline                                                                         |
| **Skills**                              | ~15%                              | Missing filesystem discovery, 16-field frontmatter, conditional `paths` activation, bundled-extract, mcpSkillBuilders                                                      |
| **Workflow / hooks**                    | ~20%                              | 22→27 events; 1→5 handler types; no async registry, no SSRF guard, no permission decision schema, no precedence rules, no migrations layer                                 |
| **Memory**                              | ~35%                              | Missing memdir filesystem layer, MEMORY.md cap, 4-type taxonomy, staleness flag, Sonnet recall, autoDream, extractMemories                                                 |
| **Bootstrap**                           | ~30%                              | Missing init memoize, 20-step setup, fast-path entrypoints, last-session cost restore                                                                                      |
| **OVERALL desktop non-component layer** | **~28%**                          | Largely a state-architecture gap, then a services gap                                                                                                                      |

---

## 10. Top 8 missing items (state/hooks/services-level architectural gaps)

1. **`onChangeAppState` choke-point sink** (§1.1) — single largest preventive-bug architectural gap. 2 days. P1.
2. **Filesystem skill discovery + 16-field frontmatter + conditional `paths` activation** (§6.1, §6.2, §6.3) — without this, our Skills story is stuck at bundled-only. Anthropic's Memory + Skills are the differentiators. 14 days. P0.
3. **memdir/ filesystem memory layer with MEMORY.md cap, 4-type taxonomy, staleness flag, Sonnet recall** (§6.12) — Memory is one of Anthropic's four locked pillars; we are at ~35%. 8 days. P0.
4. **Compaction pipeline (`services/compact/` 11 files + `extractMemories/` + `autoDream/`)** (§3.3, §6.10, §6.11) — once chats exceed context window we fail; Claude collapses and continues. 25 days. P0.
5. **Unified `useCanUseTool` permission gate + 3 handler split (coordinator/interactive/swarmWorker) + `tengu_permission_decision` analytics** (§2.5) — bypass-bug class. 8 days. P0.
6. **MCP — 7 missing transports + `connectToServer` memoize + `MCPConnectionManager` + elicitation + channels** (§5.1, §5.2, §5.3, §5.4, §5.5) — single largest interop gap; 770+ MCP servers exist but our stdio-only client cannot reach most. 25 days. P0/P1.
7. **Mailbox + `useInboxPoller` (Dispatch listener)** (§4.2, §2.9) — desktop has no listener for mobile-initiated Dispatch tasks; transitional unsigned-message path expires 2026-06-05 per MEMORY.md. 10 days. P0 (ship-blocker).
8. **Hook system — desktop UI + 22→27 events + 4 handler types (HTTP, prompt, agent, function) + AsyncHookRegistry + SSRF guard + permission decision schema + precedence rules + migrations layer** (§6.7, §6.8, §6.9, §6.13) — Claude's hooks are 5,022 LOC plus 17 helpers; our stub UI is unusable. 32 days. P0/P1.

**Total tier-1 effort to close the eight items above: ~124 engineer-days (~6 months at 1 FTE).** With three engineers in parallel, ~7 weeks.

---

## 11. Output file path

`/Users/siddhartha/Desktop/agiworkforce/tasks/research/gap-matrix/d8-desktop-stores-hooks-services-api.md`

End of GAP-D8.
