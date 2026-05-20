# Claude Code: Services, State, Hooks, Context, Bootstrap & Setup

Scope: `~/Desktop/reference/src/{services,state,hooks,context,context.ts,setup.ts,cli,entrypoints,bootstrap}`. Reference revision: `Mar 31 03:19` snapshot, Claude Code v2.x.

Headline architecture: Claude Code does **not** use Zustand/Jotai/MobX. It runs a **handwritten 34-line external store** (`src/state/store.ts`) wired into React via `useSyncExternalStore`, plus a **209-export module-global state container** (`src/bootstrap/state.ts`, 1,758 LOC) for non-React subsystems. There is one canonical React store (`AppStateStore`), nine context modules, ~85 hooks, and a sprawling services tree where every concern (analytics, MCP, OAuth, plugins, LSP, voice, telemetry, rate-limits, compaction) lives behind a fire-and-forget queueing facade so initialization order never blocks.

---

## 1. Services Inventory

`src/services/` has **38 entries** (10 single-file services + 28 subdirectories). The directory is the single biggest concentration of business logic outside `tools/`. Files were sized via `ls -la`; key services were read in full or via `grep -n "^export"`.

### 1.1 Top-level service files

| Service             | File                                                                | Purpose                                               | Key exports                   |
| ------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------- |
| Away summary        | `awaySummary.ts` (2.7K)                                             | Generates "while you were away" summaries             | —                             |
| Claude.ai limits    | `claudeAiLimits.ts` (16.8K) + `claudeAiLimitsHook.ts` (515B)        | Rate-limit fetch + caching for claude.ai subscribers  | quota fetch + reset-time hook |
| Diagnostic tracking | `diagnosticTracking.ts` (12.3K)                                     | Hook-style diagnostic counters & spans                | —                             |
| Internal logging    | `internalLogging.ts` (2.8K)                                         | Internal-only log sink                                | —                             |
| MCP server approval | `mcpServerApproval.tsx` (6.4K)                                      | UI for approving newly-added MCP servers              | dialog + persistence          |
| Mock rate limits    | `mockRateLimits.ts` (29.7K)                                         | Test-time rate-limit simulator                        | —                             |
| Notifier            | `notifier.ts` (4.3K)                                                | OS notification dispatcher                            | —                             |
| Prevent sleep       | `preventSleep.ts` (4.6K)                                            | Cross-platform `caffeinate`/`SetThreadExecutionState` | —                             |
| Rate-limit messages | `rateLimitMessages.ts` (10.9K) + `rateLimitMocking.ts` (4.4K)       | Human-readable 429 explanations                       | —                             |
| Token estimation    | `tokenEstimation.ts` (16.9K)                                        | Pre-API token count estimation                        | —                             |
| VCR                 | `vcr.ts` (12.2K)                                                    | Record/replay HTTP for tests                          | —                             |
| Voice (3 files)     | `voice.ts`, `voiceKeyterms.ts`, `voiceStreamSTT.ts` (~41K combined) | STT + voice mode                                      | —                             |

### 1.2 Service subdirectories

| Dir                      | Files | Notable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Cite                                                                             |
| ------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `analytics/`             | 9     | `index.ts` queues events until sink attaches at startup; `firstPartyEventLogger.ts` + `firstPartyEventLoggingExporter.ts` ship to 1P proto pipeline; `datadog.ts` is the secondary fanout; `growthbook.ts` provides feature-flag dynamic config; `metadata.ts` enriches every event; `sinkKillswitch.ts` blocks the sink remotely                                                                                                                                                                                                                                                                                                                                                                                                                    | `analytics/index.ts:81-123` (queue + idempotent attach)                          |
| `api/`                   | 21    | `claude.ts` is **3,400+ LOC** — the LLM transport & streaming (`queryModelWithStreaming` at :752, `executeNonStreamingRequest` at :818, `addCacheBreakpoints` at :3063, `queryHaiku` at :3241); `client.ts:88` builds the `Anthropic` SDK client; `usage.ts:33` `fetchUtilization` for billing; `firstTokenDate.ts` for cohort tracking; `withRetry.ts` retry policy; `promptCacheBreakDetection.ts:437` audits cache hit-rate; `referral.ts`, `overageCreditGrant.ts`, `ultrareviewQuota.ts`, `metricsOptOut.ts`, `bootstrap.ts`, `dumpPrompts.ts`, `errors.ts` (61 exports — every error class), `errorUtils.ts`, `filesApi.ts`, `grove.ts`, `logging.ts`, `sessionIngress.ts`, `adminRequests.ts`, `emptyUsage.ts`                                | `services/api/claude.ts:752`                                                     |
| `autoDream/`             | 4     | Background "dreaming" memory consolidation. `autoDream.ts`, `config.ts`, `consolidationLock.ts`, `consolidationPrompt.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                |
| `compact/`               | 11    | `autoCompact.ts`, `microCompact.ts`, `apiMicrocompact.ts`, `compact.ts`, `compactWarningHook.ts`, `compactWarningState.ts`, `grouping.ts`, `postCompactCleanup.ts`, `prompt.ts`, `sessionMemoryCompact.ts`, `timeBasedMCConfig.ts` — context-window compaction pipeline                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                                                                                |
| `extractMemories/`       | 2     | `extractMemories.ts`, `prompts.ts` — extract long-term memories from session                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                |
| `lsp/`                   | 7     | `LSPClient.ts`, `LSPDiagnosticRegistry.ts`, `LSPServerInstance.ts`, `LSPServerManager.ts`, `manager.ts`, `passiveFeedback.ts`, `config.ts` — language-server bridge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `entrypoints/init.ts:9` (`shutdownLspServerManager`)                             |
| `MagicDocs/`             | 2     | Auto-generated docs reading                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                |
| `mcp/`                   | 22    | `client.ts` (~2.6K LOC, **41 exports**, `connectToServer` memoized at :595, `fetchToolsForClient` LRU-memoized at :1743); `MCPConnectionManager.tsx:38` is the React glue (`useMcpReconnect`, `useMcpToggleEnabled`); `auth.ts`, `oauthPort.ts`, `xaa.ts`, `xaaIdpLogin.ts` for MCP-OAuth; `channelAllowlist.ts`, `channelNotification.ts`, `channelPermissions.ts` for SDK-injected channels; `claudeai.ts` for proxy; `elicitationHandler.ts` for MCP elicitations; `InProcessTransport.ts`, `SdkControlTransport.ts`, `vscodeSdkMcp.ts` transports; `officialRegistry.ts` curated catalog; `useManageMCPConnections.ts` hook; `config.ts`, `envExpansion.ts`, `headersHelper.ts`, `mcpStringUtils.ts`, `normalization.ts`, `types.ts`, `utils.ts` | `services/mcp/client.ts:595`                                                     |
| `oauth/`                 | 5     | `index.ts` `OAuthService` class (PKCE + listener); `client.ts` token exchange; `crypto.ts` PKCE primitives; `auth-code-listener.ts` localhost capture; `getOauthProfile.ts` profile fetch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `services/oauth/index.ts:21-198`                                                 |
| `plugins/`               | 3     | `PluginInstallationManager.ts:60` `performBackgroundPluginInstallations`; `pluginCliCommands.ts`; `pluginOperations.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                                                                                |
| `policyLimits/`          | 2     | `index.ts` org-policy gate; `types.ts`. Used to gate features like Bridge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `services/policyLimits/index.ts:155` (`isPolicyAllowed('allow_remote_control')`) |
| `PromptSuggestion/`      | 2     | `promptSuggestion.ts`, `speculation.ts` — speculative pre-execution of likely follow-ups                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | —                                                                                |
| `remoteManagedSettings/` | 5     | `index.ts` Anthropic-managed remote settings (subset of org policy); `securityCheck.tsx`; `syncCache.ts`, `syncCacheState.ts`, `types.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `entrypoints/init.ts:14-19`                                                      |
| `SessionMemory/`         | 3     | `sessionMemory.ts` `initSessionMemory()` (called sync from `setup.ts:294`); `prompts.ts`; `sessionMemoryUtils.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `setup.ts:294`                                                                   |
| `settingsSync/`          | 2     | Anthropic→user settings sync                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                |
| `teamMemorySync/`        | 5     | `watcher.ts` started under `feature('TEAMMEM')` from `setup.ts:367`; `secretScanner.ts`, `teamMemSecretGuard.ts` (PII guard before sync); `index.ts`; `types.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `setup.ts:367`                                                                   |
| `tips/`                  | 3     | `tipHistory.ts`, `tipRegistry.ts`, `tipScheduler.ts` — rotating UI tips                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                                                                                |
| `tools/`                 | 4     | `StreamingToolExecutor.ts`, `toolExecution.ts:337` `runToolUse`, `toolHooks.ts`, `toolOrchestration.ts:19` `runTools` async generator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `services/tools/toolOrchestration.ts:19`                                         |
| `toolUseSummary/`        | 1     | `toolUseSummaryGenerator.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                |
| `AgentSummary/`          | 1     | `agentSummary.ts` — sub-agent summarization                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                |

### 1.3 Per-domain answers

3. **Auth**: `services/oauth/index.ts:21` `OAuthService` does PKCE; profile + tokens persist via `installOAuthTokens` in `utils/auth.ts` (mentioned at `services/oauth/index.ts:104-105`). Refresh & API-key resolution live in `utils/auth.ts` (`getAnthropicApiKeyWithSource`, `getApiKeyFromApiKeyHelper`, `clearApiKeyHelperCache`, `clearAwsCredentialsCache`, `clearGcpCredentialsCache` — all referenced from `state/onChangeAppState.ts:2-7`). The `AppState.authVersion` counter (`AppStateStore.ts:401`) is bumped on login/logout to invalidate dependent fetches. `useApiKeyVerification` (`hooks/useApiKeyVerification.ts:24`) wraps `verifyApiKey` from `services/api/claude.ts:530` with `loading`/`valid`/`invalid`/`missing`/`error` states; the helper-key path is deferred until trust dialog passes.

4. **Telemetry / analytics**: `services/analytics/index.ts:81-173` is the public façade. Three sinks: Datadog (`datadog.ts`), 1P first-party event proto pipeline (`firstPartyEventLogger.ts` + `firstPartyEventLoggingExporter.ts`), and a kill-switch (`sinkKillswitch.ts`). GrowthBook (`growthbook.ts`) supplies feature-flag dynamic config (`hooks/useDynamicConfig.ts:8` and the GB refresh signal driving `useMainLoopModel.ts:26`). The `_PROTO_*` key-prefix convention (`analytics/index.ts:33-58`) lets PII-tagged values pass to the 1P pipeline only — `stripProtoFields` runs before Datadog. Type-level enforcement uses `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = never` (line 19) — payloads must be cast through this marker.

5. **Billing / usage**: `services/api/usage.ts:12-33` `RateLimit`/`ExtraUsage`/`Utilization` types + `fetchUtilization()`. `services/claudeAiLimits.ts` has the subscriber-side rate-limit window cache. `services/api/overageCreditGrant.ts` handles credit grants. Cost rollup is module-global in `bootstrap/state.ts`: `addToTotalCostState` (:557), `getTotalCostUSD` (:566), `getModelUsage` (:826), `resetCostState` (:864), persisted to `projectConfig.lastCost` for cross-session restoration (`setup.ts:451-475`).

6. **Config / settings**: layered. Base read/write via `utils/config.ts` (`getGlobalConfig`, `saveGlobalConfig`, `enableConfigs`). React-reactive layer is `utils/settings/` with `applySettingsChange`, `useSettingsChange` hook, `getInitialSettings()`. Storage: `~/.claude/settings.json` (user), project `.claude/settings.json`, plus `remoteManagedSettings/syncCache.ts` for the org-policy overlay. Mutations go through `updateSettingsForSource('userSettings', …)` (`onChangeAppState.ts:100, 110`). The `AppState.settings` field is the single React-reactive copy (`AppStateStore.ts:90`); a file watcher (`utils/hooks/fileChangedWatcher.ts`, init at `setup.ts:172`) pushes disk changes back into AppState via `AppStateProvider`'s `useSettingsChange(applySettingsChange)` (`AppState.tsx:88-91`).

7. **MCP**: `services/mcp/client.ts:595` `connectToServer` is `memoize`d so identical configs share one connection. `fetchToolsForClient` (:1743) and `fetchResourcesForClient` (:2000) are LRU-memoized. Connection state lives in `AppState.mcp` (`AppStateStore.ts:172-184`): `clients`, `tools`, `commands`, `resources`, `pluginReconnectKey`. `MCPConnectionManager` (`services/mcp/MCPConnectionManager.tsx:38`) is mounted as a React component that orchestrates connection lifecycle by reading config + AppState. Auth: stdio via `services/mcp/auth.ts` and `oauthPort.ts`; xaa IDP via `xaa.ts`/`xaaIdpLogin.ts`. Channel notifications routed via `channelNotification.ts` + `channelPermissions.ts`. Transports: stdio, SSE, HTTP, WebSocket, in-process, SDK control, VSCode SDK.

8. **Update / version**: `cli/update.ts:30` `update()` runs the binary update flow; `MACRO.VERSION` is build-time inlined and surfaced from `entrypoints/cli.tsx:40` (the `--version` fast path).

9. **Permission / approval**: `hooks/toolPermission/PermissionContext.ts:381` exports `createPermissionContext`, `createPermissionQueueOps`, `createResolveOnce`. Three handlers in `hooks/toolPermission/handlers/`: `coordinatorHandler.ts`, `interactiveHandler.ts`, `swarmWorkerHandler.ts`. Logging at `permissionLogging.ts:237` emits `tengu_permission_decision` analytics. "Always allow" rules live in `AppState.toolPermissionContext` (`AppStateStore.ts:109`, type `ToolPermissionContext` from `Tool.js`); persistent allow-list rules round-trip through `utils/settings/`. `useCanUseTool.tsx` (40K LOC) is the unified gate.

---

## 2. State Management

10. **Library: handwritten.** No Zustand/Jotai/MobX/Redux. `state/store.ts` (34 LOC) defines a 50-line `createStore<T>` with `getState`/`setState`/`subscribe` and an `onChange` callback. `state/AppState.tsx:142-163` adapts it to React via `useSyncExternalStore`.

```
type Store<T> = {
  getState: () => T
  setState: (updater: (prev: T) => T) => void
  subscribe: (listener: Listener) => () => void
}
```

`setState` short-circuits with `Object.is(next, prev)` to avoid no-op renders (`store.ts:23`).

11. **Top-level store.** Exactly one React store: `AppStateStore` (`state/AppStateStore.ts:454`). Schema (the `AppState` type, lines 89-452) is a `DeepImmutable`-wrapped record with **~75 fields**. Highlights:

| Slice             | Field(s)                                                                                                                                                                             | Source                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Settings/config   | `settings`, `verbose`, `mainLoopModel`, `mainLoopModelForSession`, `effortValue`, `fastMode`, `advisorModel`, `agent`, `kairosEnabled`, `thinkingEnabled`, `promptSuggestionEnabled` | :90-540                        |
| Tools/permissions | `toolPermissionContext`, `denialTracking`, `pendingWorkerRequest`, `pendingSandboxRequest`, `workerSandboxPermissions`                                                               | :109, :419, :375-384, :363-372 |
| Tasks/agents      | `tasks`, `agentNameRegistry`, `foregroundedTaskId`, `viewingAgentTaskId`, `agentDefinitions`, `standaloneAgentContext`, `selectedIPAgentIndex`, `coordinatorTaskIndex`               | :160-167, :217, :346-350       |
| Files             | `fileHistory`, `attribution`, `todos`                                                                                                                                                | :218-220                       |
| MCP               | `mcp` (clients, tools, commands, resources, pluginReconnectKey)                                                                                                                      | :172-184                       |
| Plugins           | `plugins` (enabled, disabled, commands, errors, installationStatus, needsRefresh)                                                                                                    | :185-216                       |
| Notifications/UI  | `notifications`, `elicitation`, `activeOverlays`, `expandedView`, `footerSelection`, `viewSelectionMode`, `statusLineText`, `spinnerTip`                                             | :222-228, :421, :104-110       |
| Remote/bridge     | 13 `replBridge*` fields + `remoteSessionUrl`, `remoteConnectionStatus`, `remoteBackgroundTaskCount`, `tungstenActiveSession`, `bagelActive`, `computerUseMcpState`                   | :118-157, :231-298             |
| Inbox/messages    | `inbox`, `initialMessage`, `pendingPlanVerification`, `remoteAgentTaskSuggestions`                                                                                                   | :221, :350-360, :402-417       |
| Speculation       | `speculation`, `speculationSessionTimeSavedMs`, `promptSuggestion`                                                                                                                   | :385-393                       |
| Auth/teams        | `authVersion`, `teamContext`, `agentColorMap` (in bootstrap state)                                                                                                                   | :401, :323-345                 |
| Ultraplan         | `ultraplanLaunching`, `ultraplanSessionUrl`, `ultraplanPendingChoice`, `ultraplanLaunchPending`, `isUltraplanMode`                                                                   | :432-446                       |

`getDefaultAppState()` (:456) is the factory; lazy-requires `utils/teammate.js` to avoid an import cycle (:459-465).

There are **no reducers per slice**. Mutations are arbitrary `(prev) => next` updaters. Coordination by convention only.

12. **Cross-store coordination — `onChangeAppState`.** A single sink (`state/onChangeAppState.ts:43-171`) receives every `{newState, oldState}` diff and fans out:

- `toolPermissionContext.mode` change → `notifySessionMetadataChanged` (CCR/web sync) + `notifyPermissionModeChanged` (SDK status stream). Comment :50-64 explains this is a "single choke point" replacing 8+ scattered notify sites.
- `mainLoopModel` change → `updateSettingsForSource('userSettings', { model })` + `setMainLoopModelOverride` in `bootstrap/state.ts`.
- `expandedView` → persists to `getGlobalConfig()` (`showExpandedTodos`, `showSpinnerTree`).
- `verbose` → persists to global config.
- `tungstenPanelVisible` (ant-only) → global config.
- `settings` change → `clearApiKeyHelperCache` + AWS/GCP cache clears + `applyConfigEnvironmentVariables` if `settings.env` changed.

This is the only cross-cutting coordination point. Subsystems do **not** observe each other directly; they observe AppState via selectors.

13. **Persistence.** Three layers:

- **AppState (React store)** — in-memory only; no autosave. Specific fields write through to disk via `onChangeAppState`.
- **`utils/config.ts`** — JSON files at `~/.claude/config.json`, `~/.claude/settings.json`, project `.claude/`. `getGlobalConfig`/`saveGlobalConfig`/`getCurrentProjectConfig`. `setup.ts:451-476` reads `lastCost`, `lastDuration`, `lastSessionMetrics` from `projectConfig` for `tengu_exit` analytics restoration.
- **`bootstrap/state.ts`** — module-global, never serialized. Pure session-runtime state.

Sessions themselves persist as JSONL under `~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl` (referenced at `bootstrap/state.ts:218` `sessionProjectDir`).

---

## 3. Hooks

`src/hooks/` has **86 files** (top-level + subdirs `notifs/` 16 files + `toolPermission/` 5). Plus **40+ hooks colocated outside** (`services/mcp/useManageMCPConnections.ts`, `services/mcp/MCPConnectionManager.tsx:17` `useMcpReconnect`, `context/*`, etc.).

14. **Inventory by category.**

| Category                  | Hooks                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input/keyboard            | `useTextInput.ts` (17K), `useTypeahead.tsx` (213K — largest), `useGlobalKeybindings.tsx` (31K), `useCommandKeybindings.tsx`, `useArrowKeyHistory.tsx` (34K), `useExitOnCtrlCD`, `useExitOnCtrlCDWithKeybindings`, `useDoublePress`, `useVimInput`, `useInputBuffer`, `usePasteHandler`                                                   |
| Suggestions / completion  | `useTypeahead.tsx`, `unifiedSuggestions.ts`, `fileSuggestions.ts` (27K), `usePromptSuggestion`, `usePromptsFromClaudeInChrome.tsx`, `useSearchInput`, `useHistorySearch`                                                                                                                                                                 |
| Permissions               | `useCanUseTool.tsx` (40K), `useSwarmPermissionPoller`, `toolPermission/PermissionContext.ts`, `toolPermission/permissionLogging.ts`, three handler files                                                                                                                                                                                 |
| LLM lifecycle             | `useMainLoopModel`, `useReplBridge.tsx` (115K — second-largest), `useCancelRequest`, `useApiKeyVerification`, `useDynamicConfig`, `useTasksV2`, `useTaskListWatcher`                                                                                                                                                                     |
| MCP / tools               | `useMergedClients`, `useMergedCommands`, `useMergedTools`, `useManageMCPConnections.ts` (in services/mcp/)                                                                                                                                                                                                                               |
| IDE / IDE diff            | `useIDEIntegration.tsx`, `useIdeAtMentioned`, `useIdeConnectionStatus`, `useIdeLogging`, `useIdeSelection`, `useDiffData`, `useDiffInIDE`, `useTurnDiffs`                                                                                                                                                                                |
| Voice                     | `useVoice.ts` (45K), `useVoiceIntegration.tsx` (99K — third-largest), `useVoiceEnabled`                                                                                                                                                                                                                                                  |
| Notifications             | 16 files in `notifs/` — `useStartupNotification`, `useRateLimitWarningNotification`, `useNpmDeprecationNotification`, `useDeprecationWarningNotification`, `useFastModeNotification`, `useSettingsErrors`, `useMcpConnectivityStatus`, `useLspInitializationNotification`, `useInstallMessages`, `useTeammateShutdownNotification`, etc. |
| Plugins                   | `useManagePlugins`, `usePluginRecommendationBase.tsx`, `useLspPluginRecommendation.tsx`, `useOfficialMarketplaceNotification.tsx`                                                                                                                                                                                                        |
| Recommendations / surveys | `useClaudeCodeHintRecommendation.tsx`, `useSkillImprovementSurvey`, `useSkillsChange`                                                                                                                                                                                                                                                    |
| Session/runtime           | `useRemoteSession.ts` (23K), `useSSHSession`, `useSessionBackgrounding`, `useDirectConnect`, `useSwarmInitialization`, `useTeleportResume.tsx`, `useFileHistorySnapshotInit`, `useScheduledTasks`, `useInboxPoller.ts` (34K), `useMailboxBridge`                                                                                         |
| UI / rendering            | `useVirtualScroll.ts` (35K), `useTerminalSize`, `useBlink`, `useTimeout`, `useElapsedTime`, `useMinDisplayTime`, `useNotifyAfterTimeout`, `useDeferredHookMessages`, `useAfterFirstRender`, `useCopyOnSelect`, `useClipboardImageHint`, `renderPlaceholder`                                                                              |
| State/config              | `useSettings`, `useSettingsChange`, `useUpdateNotification`, `useMemoryUsage`, `useAssistantHistory`, `useAwaySummary`, `useChromeExtensionNotification`, `useBackgroundTaskNavigation`, `usePrStatus`, `useIssueFlagBanner`, `useCommandQueue`, `useQueueProcessor`, `useTeammateViewAutoExit`, `useLogMessages`                        |

15. **Hooks → state vs services.** Most hooks are thin wrappers over **`useAppState(selector)`** (e.g., `useSettings.ts:16` is one line). Hooks that talk to services are explicit: `useApiKeyVerification` calls `services/api/claude.ts:verifyApiKey`; `useDynamicConfig` calls `services/analytics/growthbook.ts:getDynamicConfig_BLOCKS_ON_INIT`; `useMcpReconnect` reads MCP service state. The pattern is one-way: hooks read AppState (sync) or service state (async via Promises). They never write to services other than via dedicated mutator functions exposed by the service.

16. **Top-5 most used hooks (grep counts).** `useAppState` shows up in **94 files** (`grep -rln useAppState`). `useSettings` (and adjacent: `useNotifications`, `useStats`, `useMailbox`, `useOverlay`, `usePromptOverlay`) collectively touch **60 files**. Without enumerating each, the dominant pattern is: most components subscribe to AppState slices directly via `useAppState(s => s.someField)`, and the Tier-2 hooks (`useMainLoopModel`, `useCanUseTool`, `useGlobalKeybindings`, `useReplBridge`, `useSettings`) are built on top of it.

---

## 4. Context

17. **`src/context.ts`** — NOT a React Provider. It exports `getSystemContext` (`:116`) and `getUserContext` (`:155`), both `memoize`d, that build the system & user prompt prelude (git status, CLAUDE.md, current date, optional cache-breaker injection). Plus `getGitStatus()` (`:36`), `getSystemPromptInjection()` / `setSystemPromptInjection()` (`:25-34`). These are pure async functions called once per conversation and cached. Cache invalidation: `setSystemPromptInjection` calls `getUserContext.cache.clear?.()` and `getSystemContext.cache.clear?.()` (`:31-33`).

18. **`src/context/`** — 9 React contexts:

| File                              | Provider                                                                                                    | Purpose                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `notifications.tsx` (33K)         | `useNotifications` (`:38`); priorities + queue helper `getNext` (`:236`)                                    | Toast/banner queue                             |
| `mailbox.tsx` (3.4K)              | `MailboxProvider` (`:8`), `useMailbox` (`:31`)                                                              | Cross-session message inbox                    |
| `voice.tsx` (8.8K)                | `VoiceProvider` (`:23`), `useVoiceState/useSetVoiceState/useGetVoiceState` (`:55-85`)                       | Voice UI store (gated `feature('VOICE_MODE')`) |
| `stats.tsx` (22K)                 | `StatsProvider` (`:104`), `useStats` (`:157`), `useCounter`/`useGauge`/`useTimer`/`useSet` (`:164-206`)     | In-process metrics aggregator                  |
| `overlayContext.tsx` (14K)        | `useRegisterOverlay`/`useIsOverlayActive`/`useIsModalOverlayActive` (`:38-140`)                             | Escape-key coordination registry               |
| `modalContext.tsx` (6.3K)         | `ModalContext` (`:27`), `useIsInsideModal`, `useModalOrTerminalSize`, `useModalScrollRef`                   | Modal sizing + scroll                          |
| `promptOverlayContext.tsx` (12K)  | `PromptOverlayProvider` (`:34`) — split data/setter/dialog/setDialog into 4 contexts to minimize re-renders | Modal prompt dialog stack                      |
| `QueuedMessageContext.tsx` (5.6K) | `QueuedMessageProvider` (`:20`), `useQueuedMessage` (`:11`)                                                 | Queued user-message buffer                     |
| `fpsMetrics.tsx` (3.2K)           | `FpsMetricsProvider` (`:10`), `useFpsMetrics` (`:27`)                                                       | Frame-rate getter for dev bar                  |

`AppStateProvider` itself wraps `MailboxProvider` then `VoiceProvider` (`AppState.tsx:94`). Other contexts are mounted by the REPL screen.

19. **Context vs state.** Convention is explicit:

- **AppState (single store via context-as-pipe)**: long-lived, semantically-shared application state — settings, model, plugins, MCP connections, tasks, permissions, file history, attribution.
- **Per-feature React context**: ephemeral UI state with a clear boundary — modal stack, voice store, FPS getter, mailbox bridge, notification queue, overlay registry.
- **`bootstrap/state.ts` (module global)**: process-singleton runtime state that non-React code needs synchronously — telemetry counters, session ID, cwd, cost rollup, OTel meters/loggers, hook registry, model usage, OAuth profile, prompt cache headers.

The author comment "DO NOT ADD MORE STATE HERE — BE JUDICIOUS WITH GLOBAL STATE" (`bootstrap/state.ts:31`) and "ALSO HERE — THINK THRICE BEFORE MODIFYING" (`:259`) reflect deliberate friction against module-global creep — but the module still has **209 exported functions** and **1,758 LOC**.

---

## 5. Bootstrap & Setup

20. **`setup.ts`** — 478 LOC, single `setup(cwd, permissionMode, allowDangerouslySkipPermissions, worktreeEnabled, worktreeName, tmuxEnabled, customSessionId?, worktreePRNumber?, messagingSocketPath?)` async function. Order:
1. Diagnostic log `setup_started` (:67).
1. **Node version gate** — exit if <18 (:69-79).
1. `switchSession(asSessionId(customSessionId))` if provided (:82-84).
1. **UDS messaging server** under `feature('UDS_INBOX')` and not bare mode (:89-102).
1. **Teammate snapshot** under `isAgentSwarmsEnabled()` (:105-110).
1. **Terminal backup restoration** (iTerm2 + Terminal.app) for interactive sessions (:115-158).
1. `setCwd(cwd)` (:161) — must precede everything cwd-dependent.
1. `captureHooksConfigSnapshot()` (:166) — snapshot hooks config so they can't be hot-modified.
1. `initializeFileChangedWatcher(cwd)` (:172).
1. **Worktree creation** if requested (:176-285) — creates git worktree, tmux session, and chdirs into it.
1. **Session memory init** (`initSessionMemory()`) and `feature('CONTEXT_COLLAPSE')` init (:294-301).
1. `lockCurrentVersion()` background-fired (:303).
1. **Plugin prefetch** — `getCommands(getProjectRoot())`, `loadPluginHooks` + hot-reload (:315-329).
1. **Background bookkeeping** under non-bare: ant-only repo classification, attribution hooks, session-file-access hooks, `feature('TEAMMEM')` watcher (:336-369).
1. `initSinks()` — drains queued analytics events (:371).
1. `logEvent('tengu_started', {})` (:378).
1. **Pre-fetch API key from helper** (gated on trust) (:380).
1. **Release notes + recent activity** for logo render (:386-393).
1. **Bypass-permissions safety gate** — Docker/Bubblewrap/sandbox + no-internet check, root/sudo block (:395-442).
1. **Restore last-session cost** by emitting `tengu_exit` for previous session metrics (:449-476).

1. **`bootstrap/state.ts`** — process-singleton state container, 1,758 LOC, **209 exports**. Stores everything that doesn't fit React: session ID + parent (for plan→implement lineage), originalCwd, projectRoot, cwd, cost/duration/token rollups (`totalCostUSD`, `totalAPIDuration`, `totalToolDuration`, `turnHookDurationMs` etc.), `modelUsage` map, model overrides, OTel `meter`/`loggerProvider`/`meterProvider`/`tracerProvider`, OTel attributed counters (`sessionCounter`, `locCounter`, `prCounter`, `commitCounter`, `costCounter`, `tokenCounter`, `codeEditToolDecisionCounter`, `activeTimeCounter`), `eventLogger`, `agentColorMap`/`agentColorIndex`, last API request/messages, classifier requests, in-memory error log, registered hooks (`registeredHooks`), `invokedSkills` map, `slowOperations` array, prompt-cache 1h allowlist + eligibility latches, beta-header sticky latches (`afkModeHeaderLatched`, `fastModeHeaderLatched`, `cacheEditingHeaderLatched`, `thinkingClearLatched`), `promptId`, plus 60+ feature flags / singletons. Test reset: `resetStateForTests()` (:919). Cost restore: `setCostStateForRestore` (:881).

1. **`entrypoints/`** — 5 entry points + `sdk/` subdirectory:

- `cli.tsx` (39K) — main bootstrap. Fast paths for `--version`, `--dump-system-prompt` (ant-only), `--claude-in-chrome-mcp`, `--chrome-native-host`, `--computer-use-mcp` (ant-only), `--daemon-worker`, `daemon`, `remote-control` aliases (`rc`/`remote`/`sync`/`bridge`), `ps`/`logs`/`attach`/`kill` background-session subcommands, `new`/`list`/`reply` template subcommands, `environment-runner`, `self-hosted-runner`, `--worktree --tmux` exec, `--update`/`--upgrade` redirects. Otherwise dynamically imports `../main.js` `main` (`cli.tsx:289`).
- `init.ts` (13.8K) — `init = memoize(async () => …)` (`init.ts:57`). Per-process idempotent. Steps: `enableConfigs()`, `applySafeConfigEnvironmentVariables()`, `applyExtraCACertsFromConfig()` (TLS cert store warming pre-handshake), `setupGracefulShutdown()`, lazy-init 1P event logging + GrowthBook, `applyConfigEnvironmentVariables()` (full env), `configureGlobalAgents()` (proxy), `configureGlobalMTLS()`, JetBrains detection, scratchpad dir, telemetry attributes, repo detection, OAuth account hydration if needed, kicks off remote-managed-settings + policy-limits loading promises, registers shutdown for LSP. `init()` is called from `main()` before `setup()`.
- `mcp.ts` (6.3K) — `startMCPServer(cwd, debug, verbose)` exposes Claude Code's tools as an MCP server (stdio). Re-uses `getTools(toolPermissionContext)` and `findToolByName`. Uses `getDefaultAppState()` to construct a synthetic ToolUseContext (no live AppState).
- `agentSdkTypes.ts` + `sandboxTypes.ts` — type-only exports for SDK + sandbox.
- `sdk/{controlSchemas,coreSchemas,coreTypes}.ts` — Zod schemas for the agent-SDK control protocol.

23. **`cli/`** — runtime helpers, NOT argv parsing (Commander lives in `main.tsx`):

- `print.ts` (213K — largest single file) — headless / `-p` mode flow including SIGINT abort and `gracefulShutdown` orchestration, custom `setAppState` wrapper for SDK mode sync.
- `update.ts` (14.5K) — `update()` runs the binary update.
- `exit.ts` (1.3K) — `cliError`/`cliOk` clean exits.
- `ndjsonSafeStringify.ts` — NDJSON encoder.
- `remoteIO.ts` (10K) — remote/stream-json IO bridge.
- `structuredIO.ts` (28.7K) — `StructuredIO` class (:135) for stream-json and SDK transports; `SANDBOX_NETWORK_ACCESS_TOOL_NAME` constant (:62).
- `handlers/` — six subcommand handlers: `agents.ts`, `auth.ts`, `autoMode.ts`, `mcp.tsx`, `plugins.ts`, `util.tsx`.
- `transports/` — eight transports: `ccrClient.ts`, `HybridTransport.ts`, `SerialBatchEventUploader.ts`, `SSETransport.ts`, `WebSocketTransport.ts`, `WorkerStateUploader.ts`, `transportUtils.ts` plus a `.DS_Store`.

---

## 6. Lifecycle

24. **Startup → main loop → shutdown** orchestration is in **`src/main.tsx`** (4,683 LOC). The `main()` function (`main.tsx:585`) is the post-cli.tsx orchestrator. Order (inferred from grep `main.tsx`):

- Set `NoDefaultCurrentDirectoryInExePath = '1'` (Windows DLL-hijack guard).
- Init warning handler, register `process.on('exit', resetCursor)`, conditional `SIGINT` handler.
- Handle `cc://` direct-connect URL rewrite (line 619), `--handle-uri` deep links (line 651-ish).
- Parse `--settings`, `-p`/`--print`, `--init-only`, `--bare`, mode flags early (line 499-851).
- `await init()` (line 916) → from `entrypoints/init.ts:57`.
- Resolve commands, agents, worktree options, sessionId, channels.
- `await setup(...)` (line 1903-1927) → from `setup.ts:56`.
- Resolve model after setup (line 2018) so trust dialog has run.
- Mount Ink TUI with `<AppStateProvider>` wrapping the REPL screen (in `interactiveHelpers.tsx:89` for dialogs; main TUI mount path in `main.tsx` — lazy lookup).
- REPL hands input to `useReplBridge` (115K LOC) — main interaction loop.
- Shutdown via `setupGracefulShutdown()` (registered in `init.ts`); `gracefulShutdownSync` for hard exits; `cleanupRegistry` collects per-subsystem cleanups (LSP shutdown registered in `init.ts:9`).

25. **Hot reload / watch mode.** Plugins hot-reload via `loadPluginHooks` + `setupPluginHookHotReload` (`setup.ts:324-329`). Hook config snapshot watcher: `initializeFileChangedWatcher(cwd)` (`setup.ts:172`) + `updateHooksConfigSnapshot()` after worktree chdir (`setup.ts:284`). Settings hot-reload through `useSettingsChange(applySettingsChange)` (`AppState.tsx:88-91`). Team-memory file watcher (`services/teamMemorySync/watcher.ts`) under `feature('TEAMMEM')`. No webpack-style HMR — these are filesystem watchers driving in-process state updates.

---

## 7. Cross-References

26. **Services called from tools/commands/screens.**

- **All tools** access AppState via `ToolUseContext.{getAppState, setAppState}` (`entrypoints/mcp.ts:126-127` shows the constructor pattern).
- **`tools/`** invoke `services/api/*` (LLM streaming), `services/mcp/client.ts` (MCP tool calls), `services/tools/{toolExecution,toolOrchestration}.ts` (orchestration).
- **`commands/`** — `commands/review.ts` re-imported by `entrypoints/mcp.ts:11`. Commands typically read `AppState`, mutate via `useSetAppState()`, and call services for side effects.
- **`screens/`** — read AppState, render. e.g. `screens/Doctor.tsx`, `screens/ResumeConversation.tsx` (in `useAppState` grep).
- **`hooks/notifs/*`** consume `services/`: `useMcpConnectivityStatus.tsx` ↔ MCP service, `useLspInitializationNotification.tsx` ↔ LSP, `useRateLimitWarningNotification.tsx` ↔ usage/rate-limit services.

27. **Provider routing decision.** Three intersecting layers:

- `services/api/client.ts:88` `getAnthropicClient` builds the `Anthropic` SDK client. Anthropic-only — no provider switching at this layer.
- `utils/auth.ts` resolves API key vs OAuth token vs Bedrock/Vertex (`getAnthropicApiKeyWithSource`, AWS + GCP credential caches).
- Model selection lives in `AppState.mainLoopModel` / `mainLoopModelForSession` (`AppStateStore.ts:92-93`); `hooks/useMainLoopModel.ts:13` resolves them via `parseUserSpecifiedModel` from `utils/model/model.ts`. GrowthBook overrides (`tengu_ant_model_override`) are layered in via `onGrowthBookRefresh` (`useMainLoopModel.ts:26`).
- Bedrock/Vertex routing: `client.ts:88` reads env (`CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`) at client construction; `state/onChangeAppState.ts:158-160` clears AWS + GCP credential caches when settings change.

There is **no provider abstraction layer** — Claude Code is single-provider. This is the single largest divergence from our `packages/providers/` adapter model.

---

## 8. Comparison Hooks

28. **What's more sophisticated than our `apps/cli/`.**

- **The `bootstrap/state.ts` 209-export module global.** Our Rust CLI has `apps/cli/src/state.rs`-equivalent module-level state but with a fraction of these surfaces. Specifically, Claude Code tracks per-turn token budgets (`getCurrentTurnTokenBudget`, `snapshotOutputTokensForTurn`, `getBudgetContinuationCount`), per-turn classifier counts/durations, prompt-cache 1h sticky-latches (TTL preservation across mid-session GrowthBook flips), beta-header latches that prevent prompt-cache busting on toggle, and an `invokedSkills` map keyed `${agentId ?? ''}:${skillName}` to survive compaction. Our CLI's compaction story is far thinner.
- **`onChangeAppState` as a single choke-point** for fanning out state diffs to multiple subscribers (CCR + SDK + analytics + global config). Avoids the "8 callsites mutating state, 2 of them notifying" bug class. Our Rust CLI's tokio-channel fan-out is similar in spirit but lacks the explicit diff-pattern.
- **The MCP service's `connectToServer` memoize + `fetchToolsForClient`/`fetchResourcesForClient`/`fetchCommandsForClient` LRU-memoize.** Three-layer cache (process-level memoize, server-cache key invalidation at `clearServerCache`, and `reconnectMcpServerImpl` for explicit reconnect) makes MCP tool surfacing reactive without repeated stdio traffic.
- **`hooks/toolPermission/`** — three named handlers (coordinator/interactive/swarmWorker) sharing one `PermissionContext`, with `permissionLogging.ts` emitting `tengu_permission_decision` analytics. Our `useCanUseTool`-equivalent doesn't have this Rust-side handler triplication or the analytics integration depth.
- **`AppState.speculation` (`AppStateStore.ts:58-79`)** — full speculative-execution state machine with abort, mutable refs (`messagesRef`, `writtenPathsRef`), boundary classification (`complete`/`bash`/`edit`/`denied_tool`), pipelined-suggestion handoff. The `IDLE_SPECULATION_STATE` singleton (`:79`) avoids reallocation. Our agentic loop has no equivalent — no speculative pre-execution of likely follow-ups.
- **`PromptOverlayProvider` (4-context split)** — splits `data`/`setData`/`dialog`/`setDialog` into four React contexts so consumers only re-render on the slice they care about. Pattern we should adopt anywhere we have heavy modal stacks.
- **`useSyncExternalStore` + selector + `Object.is` short-circuit on selectors** is dramatically more efficient than our typical Zustand-plus-shallow-equals stacks; combined with the `setState` no-op short-circuit (`store.ts:23`), it makes large-tree re-renders cheap.

29. **What we should mimic in Rust + TS surfaces.**

- **Single-store + onChange fan-out pattern.** For our `apps/desktop/src/store/` + `packages/stores/`, consolidate cross-cutting persistence side-effects (Stripe webhook idempotency, settings.json roundtrip, cost rollup) behind one `onChangeAppState`-style sink instead of scattered subscribers.
- **Service-side event queue + idempotent `attach` (`analytics/index.ts:81-123`)** — events collected before sink attaches are drained on attach. Eliminates startup-order coupling. Our analytics pipeline currently drops or panics on early events.
- **Memoized service connections** (`connectToServer` + tools/resources LRU). Our `packages/mcp/` doesn't appear to memoize on configHash; verify.
- **Module-global with `DO NOT ADD MORE STATE HERE` discipline.** `bootstrap/state.ts:31, 259` is a model. We should add the same comments to our Rust singleton state and TS `packages/runtime/`.
- **Speculation slice + IDLE singleton.** Adapt to Rust agentic loop: pre-execute the likely next tool call (e.g., expected `Read` after `Grep`) into a scratch overlay, discard if user diverges, commit if user proceeds. Could meaningfully reduce p50 turn latency.
- **`useDynamicConfig`** (`hooks/useDynamicConfig.ts:8`) — one-line GrowthBook escape hatch for any feature flag with default fallback during init. We should ship this in `packages/runtime/`.
- **CLI fast-paths** in `entrypoints/cli.tsx`: `--version` is **zero imports beyond cli.tsx** (line 37-42). Sub-100ms cold start for `--version`. Our CLI currently loads the full Rust binary; consider equivalent fast paths for `--version`, `--help`, `--whoami`, `mcp`, `update`.
- **Test reset hooks** — `_resetForTesting()` (`analytics/index.ts:170`), `resetStateForTests()` (`bootstrap/state.ts:919`), `resetTotalDurationStateAndCost_FOR_TESTS_ONLY` (`bootstrap/state.ts:551`). Shipping explicit test-reset surfaces with the `_FOR_TESTS_ONLY` naming convention is something we should mirror in `apps/cli/src/lib.rs` where module-globals exist.

---

## 9. Open Questions

1. **No reducer pattern — is co-located mutation tracked anywhere?** Every callsite of `setAppState(prev => …)` is unique; there's no central log of "what fields are mutated where." How does Claude Code maintain code review confidence on a 75-field store with 94+ subscribers and no enum of mutation actions? Is there tooling in `utils/debug.ts` (referenced at `AppState.tsx:6`) we missed that traces mutations?

2. **Concurrency between bootstrap/state.ts module globals and AppState.** Both `setMainLoopModelOverride` (`bootstrap/state.ts:846`) and `AppState.mainLoopModel` (`AppStateStore.ts:92`) hold the same data. `onChangeAppState.ts:101, 111` writes from React → bootstrap. But what writes from bootstrap → React? If a non-React subsystem (e.g., a background task) sets the override directly, AppState consumers re-render only after the next AppState mutation. Is there a sync-back path we missed, or is this a known eventual-consistency corner?

3. **Why is `services/api/claude.ts` 3,400+ LOC monolithic?** With 41 exports, three streaming generators (`queryModelWithStreaming`, `queryModelWithoutStreaming`, `executeNonStreamingRequest`), and embedded cache-breakpoint logic + system prompt builder + Haiku query, this file dwarfs `services/mcp/client.ts` (2,632). Why hasn't it been split? Is there a structural reason (single-source-of-truth for cache header order? single retry policy?) or is it tech-debt that we should not replicate in our `packages/providers/anthropic/`?

4. **Provider abstraction is absent.** `services/api/client.ts:88` returns a hard-typed `Anthropic` instance. Our differentiator #1 is multi-provider; this means we **cannot** lift the `services/api/` layer wholesale. Confirm: is there any abstraction layer above `getAnthropicClient` that survives Bedrock/Vertex/direct-Anthropic, or are the env-flags handled inside the SDK?

5. **`hooks/useReplBridge.tsx` is 115K LOC and `hooks/useTypeahead.tsx` is 213K LOC.** Are these megafiles or compiled-with-helpers-bundled? If hand-authored, what dictates their size? If they're hand-authored REPL/typeahead state machines, lifting either to our codebase is a multi-week task — verify before scoping.

6. **No state versioning / migration scaffolding.** AppState shape is in-memory only and `getDefaultAppState()` is the source of truth, but `getCurrentProjectConfig` + `getGlobalConfig` (which DO persist) have no visible migration path in the read sample. How does Claude Code handle settings.json schema upgrades across versions? Is there a `utils/settings/migrations.ts` we missed?

7. **`feature()` from `bun:bundle` is build-time DCE.** Many subsystems (voice, computer-use MCP, BYOC, daemons, BG_SESSIONS, TEMPLATES, BRIDGE_MODE, COMMIT_ATTRIBUTION, TEAMMEM, CHICAGO_MCP) are conditionally compiled out for external builds. Our equivalent (`feature` flags in Rust + Vite `import.meta.env`) needs the same DCE rigor — verify that our `feature('xxx')` style guards actually fall through to dead-code elimination in our build pipeline.

8. **MCP `stdio only` claim in MEMORY.md vs reality.** `services/mcp/types.ts` defines schemas for `McpStdioServerConfig`, `McpSSEServerConfig`, `McpSSEIDEServerConfig`, `McpWebSocketIDEServerConfig`, `McpHTTPServerConfig`, `McpWebSocketServerConfig`, `McpSdkServerConfig`, `McpClaudeAIProxyServerConfig`. Eight transport configs. Our MEMORY says CLI MCP is "stdio only." Confirm whether our gap is config-only or also runtime-only.

9. **The `print.ts` 213K monolith.** The single largest file in the repo. Headless mode plus SDK control protocol bridge plus stream-json IO. How is it tested? Is there an analog we should preserve to keep `apps/cli` headless-mode behavior parity?

10. **`useSyncExternalStore` selector returning the original state throws** (`AppState.tsx:150`, gated `if (false && state === selected)`). The check is dead code in external builds. Is there a runtime-safety story for selector misuse, or is this a development-only assertion that ships disabled?
