# Gap Matrix — packages/{runtime, utils, types, stores, data-layer, routing}

**Scope:** AGI Workforce shared infrastructure packages vs. Anthropic Claude Code's `src/utils/`, `src/state/`, `src/services/`, `src/types/`, and `src/bootstrap/` layers.

**Method:** Read every file in scope (44 source files in our packages totalling 14,756 LOC, including tests). Cross-referenced with reference deep-dives `src-08-services-state.md`, `u1-utils-direct-a-g.md`, `u2-utils-direct-h-n.md`, `u3a-utils-direct-o-t.md`, `u3b-utils-direct-u-z.md`, `u4-permissions-swarm-settings-model.md`, `u5-utils-misc-subdirs.md`, `m6-main-bootstrap.md`, `misc1-skills-tasks-state-memdir.md`, `misc2-keybindings-vim-voice-types.md`. All citations are `file:line` against either our codebase or `~/Desktop/reference/src/`.

**Reference scale (Claude Code):** `bootstrap/state.ts` is **1,758 LOC / 209 exports** (`bootstrap/state.ts:31,259`); `state/AppStateStore.ts` carries **~75 fields** (`AppStateStore.ts:90-452`); `state/store.ts` is a **34-LOC handwritten store**; `services/` has **38 entries**; `utils/` direct files alone exceed **150 files** with named clusters from `abortController` through `zodToJsonSchema`. The codepaths sketched in MEMORY.md note that several of OpenClaw-derived peers (`apply-patch`, `browser-tool`, `mcp`, `skills`, `llm-normalize`) ship **zero tests**; the same is true at the _runtime/utils_ layer for things like in-flight dedup and BufferedWriter.

**Headline:** AGI Workforce ships ~14K LOC across runtime + utils + types + stores + data-layer + routing. Claude Code's equivalent layer — `bootstrap/state.ts` (1.76K LOC) + `services/api/claude.ts` (3.4K LOC) + `state/AppStateStore.ts` (~5K LOC inferred) + `utils/*` direct files (~50K LOC) — sits an order of magnitude beyond. That gap is _not_ a "missing helpers" problem; it is a missing **architecture**: there is no canonical AppState, no `onChangeAppState` choke-point, no AsyncLocalStorage agent context, no buffered async-IO, no priority command queue, no memoize-with-invalidation, no speculation slice, no in-flight dedup. We have a routing layer that is more sophisticated than Claude Code's (Claude Code is single-provider; ours is 27-provider-aware) but the **state plumbing on top of it is one or two orders of magnitude thinner**.

---

## 1. Detection (`isTauri` / `isCloudWeb` / `isTest` / `isServer`)

### Have

- `packages/runtime/src/detect.ts:8-32` exports `RuntimeEnv` enum + `isTauri`, `isTest`, `isServer`, `isCloudWeb`, `getRuntimeEnv()`. Detection probes both `__TAURI_INTERNALS__` and legacy `__TAURI__` window globals. Tests env via `NODE_ENV==='test'` OR `VITEST`.
- `packages/runtime/src/index.ts:11` re-exports the detect surface alongside `command()`/`commandWithWarning()`.

### Partial

- The detection is **module-load-time eager** (`isTauri = ...` at import time, not a function). Reference patterns like `embeddedTools.ts:20` (`embeddedSearchToolsBinaryPath()`) and `bundledMode.ts:7-22` (`isRunningWithBun`, `isInBundledMode`) are deferred function calls so the value can be re-checked after a JIT-mock or worker-thread spawn. Our flat constants will give the wrong answer in any code path that runs before `window.__TAURI_INTERNALS__` is published (e.g., a Vite SSR pre-hydration boundary).
- We do not detect Bun (`typeof Bun !== 'undefined'`) — the reference uses Bun-vs-Node forks at `hash.ts`, `json.ts:42`, `which.ts`, `yaml.ts`. Not strictly required since we don't bundle with Bun, but we should still gate `bundle-mode` features.

### Missing

- **No "fast-path" detector for CLI / VS Code / mobile / extension contexts.** Reference `entrypoints/cli.tsx:37-42` ships a zero-import `--version` fast path; ours requires loading the whole runtime. We have no equivalent of `services/api/client.ts:88` env-var-based provider selection (`CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`).
- **No deferred detection re-check.** Reference `apiPreconnect.ts:31-71` skips when proxy/mTLS/Bedrock — _re-evaluated_ at call time. Ours hard-codes once.
- **No installation-type detector.** Reference `localInstaller.ts` distinguishes `'local'` vs `'global'` vs `'managed'` install paths so the updater knows where to write; ours has nothing.

**Per-axis parity:** ~55%. **Effort to close:** S (1 dev-day to refactor into deferred functions and add bun/installation-type detection).

---

## 2. State management (createStore + onChangeAppState + speculation)

### Have

- `packages/stores/src/index.ts` is a **stub aggregator** — its only contents are a doc comment + commented-out future exports. CLAUDE.md confirms this status ("aggregator/stub"). Per the memory file, AGI uses Zustand stores **scattered across surfaces** (84 stores in apps/desktop alone per MEMORY.md), not a unified `AppStateStore`.

### Partial

- `packages/data-layer/src/types.ts` defines `RealtimeAdapter.subscribe()` + `publish()` (`types.ts:240-251`) — a pub/sub primitive that _could_ host an `onChangeAppState` style fanout if we built the choke point. Today it does not.

### Missing (this is the biggest single gap in the entire matrix)

- **No `createStore<T>` 34-line external store.** Reference `state/store.ts` is the entire React-state foundation in 34 LOC (`{getState, setState, subscribe, onChange}` + `Object.is` short-circuit). We have no equivalent — every surface owns its own Zustand setup (per MEMORY's "84 stores" count for desktop alone), making cross-surface sync impossible and creating the "dual-store root cause" bug already captured in `memory/dual-store-root-cause.md`.
- **No `AppState` shape (75 fields).** Reference `AppStateStore.ts:89-452` enumerates `settings`, `mainLoopModel`, `mainLoopModelForSession`, `effortValue`, `fastMode`, `advisorModel`, `agent`, `kairosEnabled`, `thinkingEnabled`, `promptSuggestionEnabled`, `toolPermissionContext`, `denialTracking`, `pendingWorkerRequest`, `pendingSandboxRequest`, `workerSandboxPermissions`, `tasks`, `agentNameRegistry`, `foregroundedTaskId`, `agentDefinitions`, `standaloneAgentContext`, `selectedIPAgentIndex`, `coordinatorTaskIndex`, `fileHistory`, `attribution`, `todos`, `mcp.{clients,tools,commands,resources,pluginReconnectKey}`, `plugins.{enabled,disabled,commands,errors,installationStatus,needsRefresh}`, `notifications`, `elicitation`, `activeOverlays`, `expandedView`, `footerSelection`, `viewSelectionMode`, `statusLineText`, `spinnerTip`, `replBridge*` (13 fields), `remoteSessionUrl`, `remoteConnectionStatus`, `remoteBackgroundTaskCount`, `tungstenActiveSession`, `bagelActive`, `computerUseMcpState`, `inbox`, `initialMessage`, `pendingPlanVerification`, `remoteAgentTaskSuggestions`, `speculation`, `speculationSessionTimeSavedMs`, `promptSuggestion`, `authVersion`, `teamContext`, `agentColorMap`, `ultraplanLaunching`, `ultraplanSessionUrl`, `ultraplanPendingChoice`, `ultraplanLaunchPending`, `isUltraplanMode`. AGI has _zero_ of these centralized.
- **No `onChangeAppState` choke point.** Reference `state/onChangeAppState.ts:43-171` is the cross-cutting sink: every diff fans out to (a) settings.json roundtrip, (b) AWS/GCP credential cache invalidation, (c) `applyConfigEnvironmentVariables` if `settings.env` changed, (d) `updateSettingsForSource('userSettings', { model })` on `mainLoopModel` change, (e) `notifySessionMetadataChanged` + `notifyPermissionModeChanged` on permission-mode changes. The comment at `:50-64` documents this as a "single choke point" replacing 8+ scattered notify sites. AGI's equivalent dispersion is the "23 settings, 84 stores" landscape — every callsite owns its own persistence and notify logic.
- **No speculation slice.** Reference `AppStateStore.ts:58-79` defines `speculation: SpeculationState` with abort, mutable refs (`messagesRef`, `writtenPathsRef`), boundary classification (`complete`/`bash`/`edit`/`denied_tool`), pipelined-suggestion handoff. The `IDLE_SPECULATION_STATE` singleton (`AppStateStore.ts:79`) avoids reallocation. Our agentic loop has no equivalent — no speculative pre-execution of the likely next tool call (e.g., expected `Read` after `Grep`) into a scratch overlay. The reference `services/PromptSuggestion/speculation.ts` plus `hooks/usePromptSuggestion` form a complete speculative-execution state machine; we have none of it.
- **No `bootstrap/state.ts` module-global.** Reference `bootstrap/state.ts:1-1758` is the process-singleton state container holding session ID + parent (for plan→implement lineage), originalCwd, projectRoot, cwd, cost/duration/token rollups, OTel `meter`/`loggerProvider`/`meterProvider`/`tracerProvider`, attributed counters (`sessionCounter`, `locCounter`, `prCounter`, `commitCounter`, `costCounter`, `tokenCounter`, `codeEditToolDecisionCounter`, `activeTimeCounter`), `eventLogger`, `agentColorMap`, last API request/messages, classifier requests, in-memory error log, registered hooks, `invokedSkills` map, `slowOperations` array, prompt-cache 1h sticky-latches, beta-header sticky latches (`afkModeHeaderLatched`, `fastModeHeaderLatched`, `cacheEditingHeaderLatched`, `thinkingClearLatched`), `promptId`, plus 60+ feature flags / singletons — **all 209 exports**. AGI has _zero_ equivalent. Our cost rollup, session ID, OTel state are surface-local each.
- **No `_resetForTesting()` convention.** Reference `bootstrap/state.ts:919` `resetStateForTests()`, `:551` `resetTotalDurationStateAndCost_FOR_TESTS_ONLY`, `analytics/index.ts:170` `_resetForTesting()` — explicit test-reset surfaces with the `_FOR_TESTS_ONLY` naming convention that signals to readers / reviewers that it must not be called from production. AGI has none.
- **No `useSyncExternalStore` selector adapter.** Reference `state/AppState.tsx:142-163` adapts `createStore<T>` to React via `useSyncExternalStore`, with a dev-only assertion at `:150` that catches selector-misuse. AGI's React surfaces use Zustand directly (84 stores in desktop), so there's no shared selector pattern.

**Per-axis parity:** ~5%. **Effort to close:** XL (2-4 weeks; would require building `packages/stores/src/createStore.ts` + AppState shape + onChange sink + selector hooks + speculation slice + bootstrap/state.ts equivalent + reset helpers, then porting 84 desktop stores onto it). The "Sprint A Slice 5+6" mentioned in MEMORY's `sprint-2026-05-08-final.md` likely covers part of this.

---

## 3. Types (Message / Tool / Provider / Agent unions, branded IDs)

### Have

- **Branded ID types** via `unique symbol` brand at `packages/types/src/conversation.ts:50-74` — `ConversationId`, `MessageId`, `ActionId`. All are `string & { readonly [__brand]: '...' }`. Pattern matches reference `src/types/ids.ts` from `misc2-keybindings-vim-voice-types.md §6.3`.
- **Provider union** at `packages/types/src/provider.ts:77-105` — 27 string literals (`openai`, `anthropic`, `google`, `ollama`, `xai`, `deepseek`, `qwen`, `moonshot`, `perplexity`, `zhipu`, `managed_cloud`, `mistral`, `groq`, `together`, `fireworks`, `cerebras`, `deepinfra`, `nvidia_nim`, `open_router`, `cohere`, `ai21`, `sambanova`, `azure`, `bedrock`, `ollama_cloud`, `minimax`, `runway`, `lmstudio`). This is **wider than reference** (Claude Code is single-provider).
- **Provider-shape content blocks** at `packages/types/src/provider-adapter.ts:89-127` — `TextBlock`, `ImageBlock`, `ToolUseBlock`, `ToolResultBlock`, `ThinkingBlock` discriminated union. Includes `EphemeralCacheControl` (`:84-87`) for Anthropic-style cache markers.
- **StreamChunk discriminated union** at `provider-adapter.ts:178-244` — `StreamChunkText`, `StreamChunkThinking`, `StreamChunkToolUseStart`, `StreamChunkToolUseDelta`, `StreamChunkToolUseEnd`, `StreamChunkUsage`, `StreamChunkError`, `StreamChunkStop`. `StreamChunkUsage` carries `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`. `StreamChunkError` carries `retryAfterSeconds` parsed from `Retry-After` header.
- **Tool event types** at `packages/types/src/tool-events.ts:54-247` — `ToolEventStarted`, `ToolEventProgress`, `ToolEventCompleted` discriminated union, `AgenticLoopStatus` (`:269-284`), `ToolLabelEntry` (`:318-381`) including `parallelGroup` for grouped tool dispatch.
- **Agent + AgentSession types** at `agent.ts:35-229` and `agent-status.ts:55-150` — `AgentConfig`, `Agent`, `ToolExecution`, `AgentApprovalRequest`, `AgentSession`, `AgentSessionStatus`, `AgentStatusSummary`, `ActiveAgent`, `TaskAssignment`. Two parallel agent-status hierarchies (`AgentLifecycleStatus` 8-state vs. `AgentStatus` 4-state) — minor duplication.
- **MessageRole / MessageKind / MessageStatus / ActionStatus** at `conversation.ts:86-136` — covers `'text'|'image'|'tool_call'|'tool_result'|'system'|'status'|'artifact'`, lifecycle `'pending'|'sending'|'streaming'|'delivered'|'error'`, action `'pending'|'running'|'completed'|'failed'|'cancelled'`.
- **42 type files in packages/types/src/** covering `a2a`, `agent`, `agent-status`, `artifacts`, `audit`, `auth`, `billing-catalog`, `chat`, `command-capabilities`, `context`, `conversation`, `council`, `cross-device`, `customModel`, `database`, `dispatch`, `errors`, `event-triggers`, `mcp-apps`, `memory`, `model-catalog`, `model`, `pairing`, `prompt-enhancement`, `provider-adapter`, `provider`, `research`, `runtime`, `scheduler`, `signaling`, `tauri`, `tool-events`, `user`, `voice`, `web-hooks`, `web-offline`, `webmcp`, `workflow`, `workspace-analytics`, `design-system/{settings-ia, connector-permission, user-identity, effort, provider-display, agent-mode}`. **Total ~11,425 LOC** including tests (4 test files). Per MEMORY this is "53 files" — current count is 42 type source files + 5 test/design files = ~47.

### Partial

- **`AuthMethod` union** at `provider-adapter.ts:33-65` is the right shape (`'api-key'|'oauth'|'oauth-device-code'|'aws-signature'|'gcp-adc'|'none'`) but contains **no per-method credential resolution rules** — reference `utils/auth.ts` (out of M3 scope but the source-of-truth) has `getAnthropicApiKeyWithSource`, `getApiKeyFromApiKeyHelper`, `clearApiKeyHelperCache`, `clearAwsCredentialsCache`, `clearGcpCredentialsCache` — we have `ProviderCredentials` shape but no resolver lifecycle.
- **`MessageBase`** at `conversation.ts:288-315` lacks `tool_calls?:`, `tool_call_id?:`, `cacheControl?:` fields that the OpenAI/Anthropic boundary needs. The provider-shape `ProviderMessage` at `provider-adapter.ts:124-127` _does_ carry rich content blocks, but the UI `ChatMessage` at `chat.ts:51-99` is string-content. The conversion shim is implicit — every surface re-implements it.
- **`Provider` union has 27 entries; `models.json` has fewer; CLI has 12 named + 1 Custom.** MEMORY explicitly flags this drift ("Mistral DROPPED from CLI per `models.rs:310` comment but still in `models.json` providers list + `Provider` union type — drift to reconcile"). The static type cannot be the single source of truth without a runtime check; today there's no validator.

### Missing

- **No `MessageBase`-equivalent of Claude Code's full message content shape.** Reference (per `m2-messages-attachments.md`, summarized in `src-08-services-state.md`) carries 200+ optional fields including `parentUuid`, `cwd`, `version`, `gitBranch`, `userType`, `model`, `usage` (input/output/cache_read/cache_write/output_tokens by tool), tool sub-blocks, etc. AGI's `ChatMessage`/`MessageBase` is a stripped-down ~10-field interface.
- **No "AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS" brand pattern** (referenced at `agentContext.ts:25`, `errors.ts:93-101`, `unaryLogging.ts:29`). The deliberately ugly name forces every callsite to re-affirm at type level that the shipped value contains no PII. AGI's analytics layer (`packages/utils/src/logger.ts`) redacts at runtime via regex but has no compile-time discipline.
- **No `TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS`** subclass (`errors.ts:93-101`). AGI's `AppError` is generic; user-facing messages and telemetry breadcrumbs both extract via `error.message` with no PII gating.
- **No frontmatter type `FrontmatterData`** unifying skill / command / agent / memory frontmatter (reference `frontmatterParser.ts:9-60` covers `allowed-tools, description, type, argument-hint, when_to_use, version, hide-from-slash-command-tool, model, skills, user-invocable, hooks, effort, context: 'inline'|'fork', agent, paths, shell`). AGI's skills package and apps consume frontmatter without a shared type.
- **No `WorkflowKind`/`Hook` discriminated union** matching reference `src/types/{hooks.ts:291, plugin.ts:363, command.ts:215, permissions.ts:442, logs.ts:331}`. AGI has `event-triggers.ts` (326 LOC) but it doesn't model Claude Code's hook/permission ecosystem.
- **No `Workload` AsyncLocalStorage type** matching reference `workloadContext.ts:Workload` single-member union (`'cron'`). The pattern at u3b §12 carries turn-scoped tags through detached agent closures so you can attribute cost/usage per workload. AGI has nothing equivalent.
- **No `AgentContext` discriminated union** matching reference `agentContext.ts:24-179` `SubagentContext | TeammateAgentContext` — used inside `AsyncLocalStorage<AgentContext>` to isolate concurrent backgrounded agents in the same process. AGI's `agent-status.ts:AgentSession` is a stored record, not an in-flight context.
- **No `RuntimeTier` runtime constraint mapping.** `command-capabilities.ts:32` defines `RuntimeTier = 'cloud' | 'desktop-only' | 'desktop-preferred'` but nothing carries the **inverse mapping** (cloud feature → required RLS / required Stripe tier / required model capability). Claude Code's `services/policyLimits/index.ts:155` (`isPolicyAllowed('allow_remote_control')`) shows the right level of detail; we have command-prefix string matching only.

**Per-axis parity:** ~50%. We over-shoot on `Provider` union breadth and content-block discriminants but under-shoot on message-shape richness, frontmatter consolidation, hook/permission types, and PII-safe brand types. **Effort to close:** M (1-2 weeks).

---

## 4. Utils

### Have

- `async.ts`: `sleep`, `sleepWithAbort` (with abort listener, removes listener on natural fire), `debounce`, `throttle`, `retry`, `retryWithStrategy` (4 named strategies: `network`, `database`, `api`, `filesystem`), `makeRetriable`, `withTimeout`, `retryBatch`. ~439 LOC. `RetryError`, `AbortError` classes.
- `errors.ts`: `AppError` class (code+message+statusCode+details), `createError.{unauthorized,forbidden,notFound,validation,conflict,rateLimit,stripe,supabase,internal,serviceUnavailable,timeout,network,payloadTooLarge,badRequest,paymentRequired}` factories, `getFriendlyError(error)` with MCP/network/timeout/auth/rate-limit/payment/server-error pattern matching, `getContextualError(error, context)` operation-aware suggestions for `send_message|save_settings|upload_file|download_file|connect_service|search|tool_execution`, `formatErrorForChat`, `getErrorMessage`, `withErrorHandling` wrapper. ~822 LOC.
- `logger.ts`: 9-pattern secret redaction (`sk-ant-`, `sk-`, `AIzaSy`, `gsk_`, Stripe `sk|pk|rk_test|live_`, AWS `AKIA`, GitHub `gh[ps]_`, GitHub `github_pat_`, xAI `xai-`, generic `Bearer`), 4-level `logger.{debug,info,warn,error}` with prod-mode Sentry breadcrumbs. The Rust mirror (`apps/desktop/src-tauri/src/sys/security/log_redaction.rs`) is referenced.
- `format.ts`: `formatDate`, `formatDateTime`, `formatRelativeTime` (uses `Intl.RelativeTimeFormat`), `formatCurrency`, `formatNumber`, `formatBytes` (KB/MB/GB/TB/PB ladder), `formatDuration` (ms→s→m→h→d), `formatPercent`, `truncate`, `formatFileName` (extension-preserving middle truncate). ~277 LOC.
- `validation.ts`: `validateEmail` (regex), `validateUrl` (with `blockPrivateNetworks` SSRF guard for RFC 1918 + IPv4 link-local + IPv6 ULA), `validateFilePath` (rejects `..`, blocks Windows `C:\Windows|Program Files|ProgramData`, blocks Unix `/etc|/sys|/proc|/dev|/boot|/root` with `==` OR prefix-with-separator match), `validatePassword` (5-rule + strength assessment), `validateApiKey`, `validateJson`, `validateSqlQuery` (5 dangerous patterns), `sanitizeCommandArgs` (single denylist regex stripping shell metacharacters), `checkForInjection` (SQL/Command/XSS pattern detection). ~377 LOC.
- `crypto.ts`: `generateToken` (URL-safe base64, no padding), `generateUUID` (uses `crypto.randomUUID`, fallback for old envs), `sha256`, `sha1`, `generateNumericCode`, `generateShortId`, `hmacSha256`, `timingSafeEqual` (constant-time string compare). ~199 LOC.
- `performance.ts`: `measureAsync`, `measureSync`, `PerformanceTracker` class with `start/end/record/getMetrics/getMetricsFor/reset/resetLabel`, p50/p99/avg/max via nearest-rank percentile. ~253 LOC.
- `voice.ts`: `formatTranscriptionDuration`, `formatVoiceDuration`, `isVoiceSupported`, `normalizeTranscription`, `detectVoiceCommand` (with `VOICE_COMMAND_PREFIXES` 28-entry table), `cleanupVoiceDictation` (filler-word stripper), `meteringToAmplitude`. ~178 LOC.
- `signaling.ts`: `SignalingClient` class wrapping a WebSocket + heartbeat (default 25s interval) + safe JSON parse + role/kind type guards. ~234 LOC.
- `retry.ts`, `debounce.ts`: re-export shims for `async.ts` exports.

### Partial

- **Retry with abort**: `async.ts:50-75` `sleepWithAbort` does abort-on-signal. But neither `retry()` nor `retryWithStrategy()` accept an `AbortSignal` parameter — a pending retry cycle cannot be cancelled mid-sleep. Reference `combinedAbortSignal.ts:15-46` is the right primitive (combine 2 signals + optional timeout, returns `{signal, cleanup}`).
- **Logger sentryGlobal lookup**: `logger.ts:88-95` lazily reads `window.Sentry` or `globalThis.__AGIWORKFORCE_SENTRY__` per-call; reference `analytics/index.ts:81-123` queues events until sink attaches, then drains atomically. Our pattern would silently drop pre-init warn/error events because Sentry isn't yet attached — no in-memory queue.
- **`AppError`**: covers `AppError` + `createError` factories but no `MalformedCommandError`, `AbortError`, `ConfigParseError`, `ShellError`, `TeleportOperationError` subclasses (reference `errors.ts:111-238`). Our `AbortError` only lives in `async.ts:29` — not exported from the error taxonomy.
- **Validation `validateUrl`**: blocks private networks but does _not_ DNS-resolve the hostname before checking — an attacker-controlled `evil.com` that resolves to `127.0.0.1` would slip through. Reference does the same so this is acceptable, but worth flagging.

### Missing — these are the biggest practical gaps

- **`abortController.ts`** (50 LOC, ref `u1` §1): `createAbortController(maxListeners=50)` (suppresses `MaxListenersExceededWarning`), `createChildAbortController(parent, ...)` using `WeakRef<AbortController>` on both directions and `{once:true}` listeners + module-level `propagateAbort`/`removeAbortHandler` `bind`-time arg passing to avoid per-call closure allocation. AGI's `sleepWithAbort` is a stand-alone consumer; we have no parent/child abort tree, and any long-running session deriving child signals (per-tool, per-stream) leaks listeners.
- **`combinedAbortSignal.ts`**: combines up to 2 signals + optional timeout. Critical detail at `:11`: explicit `setTimeout`+`clearTimeout` instead of `AbortSignal.timeout(ms)` because under Bun the latter "timers are finalized lazily and accumulate in native memory until they fire (~2.4KB/call)". We would inherit that bug if we used `AbortSignal.timeout`.
- **`cleanupRegistry.ts`**: global `Set<()=>Promise<void>>`, `registerCleanup(fn)` returning unregister fn, `runCleanupFunctions()` running all in parallel via `Promise.all`. Decoupled from `gracefulShutdown.ts` to avoid circular deps. AGI has no shutdown coordination; each surface owns its own teardown ad hoc.
- **`gracefulShutdown.ts`**: synchronous terminal restoration via `writeSync(1, ...)` with hard-coded escape sequences. Not strictly required for non-TUI surfaces but the registration pattern (`gracefulShutdownSync` for hard exits, `cleanupRegistry` for per-subsystem cleanups) is universal.
- **`memoize.ts` (269 LOC, ref `u2` §3.4)**: `memoizeWithTTL` (sync, write-through stale-while-refresh, identity-guarded refresh), `memoizeWithTTLAsync` (adds `inFlight: Map<key, Promise>` for cold-miss dedup so concurrent callers don't each spawn `aws sso login`), `memoizeWithLRU` over fixed-size window via `lru-cache`. **The async in-flight dedup is the textbook fix for the dual-store / mock-drift issues called out in MEMORY.md** (`feedback-stop-building.md`, `dual-store-root-cause.md`). AGI has zero memoization helpers.
- **`bufferedWriter.ts` (full file in u1 §9)**: `createBufferedWriter({writeFn, flushIntervalMs=1000, maxBufferSize=100, maxBufferBytes=Infinity, immediateMode=false})`. Two flush modes: `flush()` synchronous drain; `flushDeferred()` detaches buffer synchronously into `pendingOverflow`, schedules `setImmediate(() => writeFn(...))` so caller never waits on writeFn even for `appendFileSync`. Critical for hot paths (e.g., errorLogSink, asciicast recording) where blocking on a sync write inside React render would stall the UI. AGI has _no_ buffered async-IO primitive — every log call hits the underlying sink synchronously.
- **`agentContext.ts` AsyncLocalStorage** (ref `u1` §5): `AsyncLocalStorage<AgentContext>` with `SubagentContext | TeammateAgentContext` discriminated union, `consumeInvokingRequestId()` sparse-edge semantics. The "WHY" comment at `:17-22` is the dominant pattern for our concurrent-conversation infrastructure: "When agents are backgrounded (ctrl+b), multiple agents can run concurrently in the same process. AppState is a single shared state that would be overwritten… AsyncLocalStorage isolates each async execution chain." AGI has 1,483 `#[tauri::command]` handlers and zero ALS — the desktop chat layer cannot safely run more than one agentic loop in the same process without state contamination.
- **`workloadContext.ts` AsyncLocalStorage** (ref `u3b` §12): turn-scoped workload tag (`'cron'`). Subtle fix: `runWithWorkload(undefined, fn)` always calls `.run()`, not pass-through, to prevent sticky leakage when REPL re-renders capture ALS at scheduling time. We need this for our cron / scheduled-task / dispatch surfaces.
- **`backgroundHousekeeping.ts`** (ref `u1` §1): `startBackgroundHousekeeping()` schedules `runVerySlowOps` 10 minutes after start, defers if `getLastInteractionTime() > now - 60s`, runs every 24h via `setInterval(...).unref()`. Pattern: `unref()` everywhere so housekeeping never holds the loop. AGI's per-surface housekeeping (cleanup of stale sessions, old logs) is ad hoc and frequently blocks shutdown.
- **`fileStateCache.ts` / `fileReadCache.ts`** (ref `u1` §2): LRU-by-size-1000 keyed on file path; cache invalidation by `stats.mtimeMs` equality. `FileState` carries `isPartialView?: boolean` flag so callers know "what model saw" differs from "raw disk bytes". AGI has nothing equivalent.
- **`generatedFiles.ts`** (ref `u1` §2): `EXCLUDED_FILENAMES`, `EXCLUDED_EXTENSIONS`, `EXCLUDED_DIRECTORIES`, `EXCLUDED_FILENAME_PATTERNS` regex list with `isGeneratedFile(path)` returning true for vendored/generated content. Our `apps/desktop/src-tauri/src/sys/...` may have a Rust equivalent but nothing in `packages/utils/`.
- **`fingerprint.ts`** (ref `u1` §5): `FINGERPRINT_SALT = '59cf53e54c78'` (hardcoded, must match backend), `computeFingerprint(messageText, version)` computes `SHA256(SALT + msg[4] + msg[7] + msg[20] + version).slice(0,3)` — 3-character attribution fingerprint sent on every API request. Cross-provider fingerprinting (if we want one) would need our own salt + server-side validator.
- **`activityManager.ts`** (ref `u1` §5): singleton tracker for user vs CLI active time, with deduplication. 5-second user activity timeout. `trackOperation(opId, fn)` convenience wrapper. Prevents double-counting overlapping operations.
- **`fpsTracker.ts`**: minimal frame-time tracker; `low1PctFps` uses `p99FrameTimeMs`. Drop-in for React render perf tracking.
- **`CircularBuffer.ts`** (84 LOC): fixed-capacity ring buffer with `add/addAll/getRecent/toArray/clear`. Drop-in for event-stream rolling windows (e.g., last-100-errors in `bootstrap/state.ts`).
- **`crossProjectResume.ts`-equivalent**: gating "resume from another project" decision. Our session-resume story is per-surface ad hoc.
- **`displayTags.ts`** (ref `u1` §11): `XML_TAG_BLOCK_PATTERN = /<([a-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>\n?/g`. Lowercase-only regex so user prose mentioning JSX/HTML components passes through. Strips system-injected tags from titles/UI without an ever-growing allowlist.
- **`hash.ts`** Bun.hash + sha256 wrappers; `hashContent`, `hashPair` (`hash.ts:7,19,34`). Our `crypto.ts` has SHA-256 only via `subtle.digest`.
- **`json.ts`** (ref `u2`): `safeParseJSON` (LRU-memoized over PARSE_CACHE_MAX_KEY_BYTES = 8 KiB), `safeParseJSONC`, `parseJSONL` (Bun.JSONL.parseChunk fast-path + Buffer/String fallbacks), `readJSONLFile` with 100 MB tail cap, `addItemToJSONCArray` (preserves comments). AGI's `validation.ts:256-266` `validateJson` uses `JSON.parse` directly with no caching.
- **`mailbox.ts`** (ref `u2`): generic mailbox primitive — `send`, `poll`, `receive(predicate)`, `subscribe`. Used for inter-agent messaging in `teamDiscovery.ts` and skills.
- **`messageQueueManager.ts`** (547 LOC, ref `u2` §2.5): module-level priority command queue, `useSyncExternalStore`-compatible signal, FIFO-within-priority dequeue (`now > next > later`), `popAllEditable` reconstruction with PastedContent ids preserved for imageStore lookups. **AGI has no priority command queue across surfaces — this is the highest-value missing port.** Today every surface implements its own ad hoc "send message" pipeline.
- **`mtls.ts`** (ref `u2`): `CLAUDE_CODE_CLIENT_CERT/KEY/PASSPHRASE` env reads, returns `https.Agent` + `tls.ConnectionOptions` + `undici.Dispatcher` for fetch. `lazy require('undici')` inside `getTLSFetchOptions` defers ~1.5 MB undici load. Required for any enterprise-on-prem Hobby/Pro deployment.
- **`http.ts` user-agent** (ref `u2` §H): `getAuthHeaders` (OAuth bearer vs `x-api-key`), `withOAuth401Retry` clock-drift recovery, `getWebFetchUserAgent`. Our `packages/runtime/src/http.ts` is **65 LOC, no auth-header helpers, no 401-retry** — just a single `routeToCloud` POST with `Authorization: Bearer ${token}`.
- **`headlessProfiler.ts`** (178 LOC, ref `u2` §H): `performance.mark` checkpoints for `-p` headless mode; logs `tengu_headless_latency` with TTFT, query-overhead, time-to-system-message. AGI's CLI has the same headless-mode shape (per `apps/cli/`) but no equivalent profiler primitive.
- **`xml.ts`** (ref `u3b` §16): `escapeXml(s)` (text-content) and `escapeXmlAttr(s)` (adds `" '`). Used for system-prompt construction. AGI has nothing.
- **`yaml.ts`**: Bun fast-path + lazy `require('yaml')`. AGI has no YAML parser; relies on `js-yaml` ad hoc per-package.
- **`zodToJsonSchema.ts`**: WeakMap caching by schema identity. Tool registry should adopt — WeakMap auto-GCs, no manual invalidation. Hot path: `toolToAPISchema()` runs 60-250×/turn per ref §13.
- **`uuid.ts`** (ref `u3b` §6): `^[0-9a-f]{8}-...$` validation returning branded `UUID | null`; `createAgentId(label?)` minting `a${label?-}${randomBytes(8).toString('hex')}`. AGI has `generateUUID` but no validator + no branded `AgentId` type at the runtime layer (only structurally in `types`).
- **`words.ts` (801 LOC)**: random-word slug generator (`generateWordSlug` adj-verb-noun, `generateShortWordSlug` adj-noun) with crypto-quality random and ~228 ADJECTIVES + ~109 VERBS + ~340 NOUNS. Useful for ephemeral session names, worktree slugs, agent IDs.
- **`worktree.ts` (1,519 LOC)**: full `EnterWorktree`/`ExitWorktree` machinery — runs Claude in `<repoRoot>/.claude/worktrees/<slug>`. Provider-agnostic, can be ported verbatim. AGI has nothing (worktree feature missing entirely from the deferred-tool list).
- **`xdg.ts`**: XDG Base Directory spec resolver — `getXDGStateHome`, `getXDGCacheHome`, `getXDGDataHome`, `getUserBinDir`. Drop-in for `~/.agiworkforce/` install layout (referenced in `comp-dotfile-architectures.md`).
- **`warningHandler.ts` (122 LOC, ref `u3b` §7)**: process-level Node warning handler with dedup (`Map<key,count>` capped at 1000), idempotent install, classname-only redaction for external users.
- **`http.ts withOAuth401Retry`**: OAuth-aware retry that handles clock-drift (token says expired but server says valid). Critical for any OAuth-backed provider (Anthropic Claude.ai subscriber, Google Gemini OAuth).
- **`embeddedTools.ts`** (29 LOC, ref `u1` §13): `EMBEDDED_SEARCH_TOOLS` env var + `embeddedSearchToolsBinaryPath() = process.execPath`. Lets the bun-binary shadow find/grep with native Rust ripgrep. AGI's CLI has embedded ripgrep (per CLI MEMORY) but no shared discovery shim.
- **`directMemberMessage.ts`**: `parseDirectMemberMessage(input)` matches `^@([\w-]+)\s+(.+)$/s`. Routes user input "starts with @name" to a teammate without sending to model. Useful for our team-chat surface.
- **`userPromptKeywords.ts`** (ref `u3b` §5): `matchesNegativeKeyword` (rage detection: `wtf`, `wth`, `ffs`), `matchesKeepGoingKeyword` (`continue`, `keep going`, `go on`). Allocation-free regex classifier; useful for chat-composer rage-detection / auto-continue UX.
- **`extraUsage.ts` (23 LOC)**: `isBilledAsExtraUsage(model, isFastMode, isOpus1mMerged)`. Pricing-edge logic in 23 lines. Patterns matter; values must read from `models.json` per locked rule.
- **`generatedFiles.ts`** (already mentioned).

**Per-axis parity:** ~25%. Of the 50+ named util primitives in the reference, AGI has solid coverage for `format/validation/retry/error/crypto/voice/signaling/performance/logger`, but **zero coverage** for the "framework-shaped" primitives: AsyncLocalStorage agent context, AsyncLocalStorage workload context, BufferedWriter, AbortController parent/child tree, memoize-with-TTL/LRU/in-flight-dedup, cleanupRegistry, mailbox, messageQueueManager, fileStateCache, fingerprint, AnalyticsMetadata brand, XDG dirs, generated-files filter, displayTags, hash, json (LRU-cached), worktree, words. **Effort to close:** L (3-4 weeks) for the framework-shaped primitives.

---

## 5. Data layer (4 adapter interfaces)

### Have

- `packages/data-layer/src/types.ts` defines the four target interfaces:
  - **`DatabaseAdapter`** (`types.ts:75-119`): `query<T>(sql, params)`, `execute(sql, params)`, `transaction<T>(fn)`, `withUser(jwt)` (returns NEW adapter — does not mutate; original remains usable for service-context Stripe webhooks/cron), `dispose()`.
  - **`AuthAdapter`** (`types.ts:159-171`): `verifyJwt(token)` (returns null on bad sig/expired/revoked, throws on transient infra failure), `refreshToken(refreshToken)`.
  - **`StorageAdapter`** (`types.ts:198-223`): `put(bucket, key, data)`, `get(bucket, key)`, `delete(bucket, key)`, `signedUrl(bucket, key, ttlSeconds)` (adapters MAY clamp TTL — S3 caps at 7 days, Supabase at 1 year — and MUST throw rather than silently extend).
  - **`RealtimeAdapter`** (`types.ts:239-252`): `subscribe(channel, onMessage)` returning unsub fn, `publish(channel, payload)`.
- `factory.ts:111-279` provides `createDatabaseClient`, `createAuthClient`, `createStorageClient`, `createRealtimeClient` env-driven factories. ENV vars are documented (`AGI_DATABASE_PROVIDER`, `AGI_AUTH_PROVIDER`, `AGI_STORAGE_PROVIDER`, `AGI_REALTIME_PROVIDER`, `AGI_DATABASE_URL`, `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Three concrete database adapters: `SupabaseDatabaseAdapter`, `NeonDatabaseAdapter` (skeleton), `PostgresDatabaseAdapter` (skeleton). One auth/storage/realtime adapter (`Supabase*`).
- `NotImplementedError` (`types.ts:312-322`) and `DataLayerConfigError` (`types.ts:325-330`) error classes — clear diagnostic for skeleton adapters.
- 3 test files (`__tests__/{supabase-adapter,neon-adapter,factory}.test.ts`) — partial coverage.

### Partial

- The 4-adapter shape is **provider-portable but not feature-complete**. Key gaps:
  - `DatabaseAdapter.transaction` doesn't expose savepoint nesting depth or retry-on-serialization-failure (Postgres-shaped concern).
  - `AuthAdapter` doesn't include `revokeToken(refreshToken)` or `signOut(allDevices?)` — required for security-critical "sign out everywhere" flows.
  - `StorageAdapter` lacks `head(bucket, key)` to check object existence without a full `get` (saves bandwidth on 100MB+ blobs).
  - `RealtimeAdapter` doesn't surface "presence" semantics that Supabase Realtime provides (`channel.track({ user_id })`); switching to Pusher/Ably would silently drop the feature.
- Per MEMORY: "supabase has TWO migration directories — architectural debt to reconcile." Canonical is 27 files; legacy is 50; the data-layer adapter has no opinion on which one matches production.
- Auth0/Clerk/Cognito adapters throw `NotImplementedError` at `factory.ts:191-198`; SCALING.md has a documented migration path but no code.

### Missing

- **`QueueAdapter`**: durable queue interface (BullMQ / SQS / Cloud Tasks). The `RealtimeAdapter` JSDoc explicitly notes "Not durable — for durable queues use a separate adapter (TODO: add `QueueAdapter` when we ship background jobs)" (`types.ts:230`). Required for any background-job feature (web search, large research tasks, scheduled reports).
- **`CacheAdapter`**: KV / Redis. Currently every cache is reinvented per-surface (Rust `moka` LRU in CLI, `lru-cache` ad-hoc in web).
- **`SearchAdapter`**: full-text search (PostgreSQL `tsvector` vs. Algolia vs. Meilisearch). All three are documented in `docs/SCALING.md` but no adapter ships.
- **`VectorAdapter`**: pgvector / Pinecone / Weaviate / Qdrant. Required for semantic memory and RAG flows.
- **`TelemetryAdapter`**: OTel collector / Datadog / Honeycomb. Reference `services/analytics/index.ts` has 3-sink fanout; AGI's logger has only Sentry.
- **`PolicyAdapter`**: org-policy gate. Reference `services/policyLimits/index.ts:155` has `isPolicyAllowed('allow_remote_control')`. AGI's billing-tier check is scattered across `apps/web/middleware`, `apps/desktop/src/store/auth`, etc.
- **`FileSystemAdapter`** (= reference `fsOperations.ts:23-105`): the cleanest small-surface fs abstraction in Claude Code (sync + promise variants of stat/readdir/unlink/rmdir/mkdir/readFile/copyFileSync/symlinkSync/realpathSync/createWriteStream + `safeResolvePath` returning `{resolvedPath, isSymlink}`). AGI's apply-patch + browser-tool packages use Node `fs` directly and have already taken P0 path-traversal CVEs (per MEMORY's `FINAL_AUDIT §2-§8`).

**Per-axis parity:** ~50% (4 of 7 reasonable interfaces present; 3 of 4 present interfaces complete; supabase + neon-skeleton + postgres-skeleton ship). **Effort to close:** M for the missing interfaces (1-2 weeks per).

---

## 6. Routing

### Have

- `packages/routing/src/index.ts` exports `applyConversationContext`, `classifyTaskLocally`, `estimateTokens`, `detectIndicScript`, `DEFAULT_INDIC_RATIO_THRESHOLD`, plus the type re-exports `ClassifierResult`, `ConversationContext`, `RoutingAttachment`, `RoutingMessage`, `RoutingTaskType`.
- `classify.ts:159-224` priority-ordered heuristic classifier (10 buckets, `js-hoist-regexp` + `js-early-exit` + `js-length-check-first` discipline). All regexes module-scoped.
- `classify.ts:262-300` 5-turn sticky-pivot logic (computes mode of last 3 task types; +0.1 confidence boost if matches; ≥0.85 confidence allowed to override mode).
- `classify.ts:110-140` per-tokenizer estimates: GPT 1/3.8, Claude 1/3.5, **Claude Opus 4.7** 1/3.5 × 1.18 (the 35% inflation under thinking-mode payloads is documented in `tasks/lessons.md`), Gemini 1/4.0, DeepSeek 1/3.4, default 1/3.5.
- `indic.ts` Pool C language gate.
- 1 test file (`__tests__/classify.test.ts`).
- `RoutingTaskType` taxonomy at `runtime.ts:74-85` is **11 entries** — `coding`, `reasoning`, `general`, `agentic`, `multimodal`, `research`, `computer-use`, `image_generation`, `creative_writing`, `long_context`, `simple_chat`. Spec at `tasks/auto-routing-spec.md` confirms.
- `RoutingDecision` shape at `runtime.ts:87-99` — `routedModelId`, `taskType`, `reason`, `wasRouted`, `timestamp`.

### Partial

- The classifier **exists; the _router_-on-top-of-classifier is partial.** Per MEMORY's `auto-routing-spec-2026-05-07.md` and `sprint-2026-05-08-final.md`, this is the locked spec but Phase A Slices 5+6+B+C+D+E remain pending.
- `classify.ts` is heuristics-only; the LLM fallback (`Gemini 3.1 Flash-Lite call wired in a higher layer when confidence < 0.6`) is not in this package.

### Missing

- **No `ProviderPool` selector.** Reference `services/api/client.ts:88` does Bedrock/Vertex/Foundry env routing inside the SDK client. AGI's `command-capabilities.ts:32` `RuntimeTier` is the **command** routing, not the **provider** routing — when classifier says `task='coding'`, what routes that to GPT-5.4 vs Claude Opus 4.7 vs DeepSeek-Coder?
- **No `CapabilityGate`.** Reference `betas.ts:142-195` (`modelSupportsX` boolean fans for Structured Outputs, Auto Mode, ISP, Context Management, Web Search, 1M context) is the type-safe model-capability check. AGI's `model-catalog.ts` has the data but no gate functions.
- **No `RouterPolicy`.** Reference (per MEMORY) `services/policyLimits/index.ts` enforces org policy on top of routing. AGI has no equivalent.
- **No `ModelOverride` chain.** Reference `useMainLoopModel.ts:13` resolves `AppState.mainLoopModel` / `mainLoopModelForSession` and layers in `tengu_ant_model_override` GrowthBook overrides. AGI has the capability via `customModel.ts` but no resolution chain.

**Per-axis parity:** ~40%. Classifier itself is on par; provider routing + capability gate + policy gate above the classifier are missing. **Effort to close:** M.

---

## Surface percentage (weighted)

| Axis                                                               | Parity | Weight | Weighted |
| ------------------------------------------------------------------ | -----: | -----: | -------: |
| Detection                                                          |    55% |   0.05 |    2.75% |
| State (AppStateStore + onChangeAppState + speculation + bootstrap) |     5% |   0.30 |     1.5% |
| Types                                                              |    50% |   0.20 |      10% |
| Utils (frameworks + leaf primitives)                               |    25% |   0.25 |    6.25% |
| Data layer (4 adapter interfaces)                                  |    50% |   0.10 |       5% |
| Routing                                                            |    40% |   0.10 |       4% |
| **Surface total (runtime/state/utils/types)**                      |        |        | **~30%** |

Weighting reflects practical importance: state architecture is the long-pole because everything else (caching, command queue, speculation, agent context, settings sync, cost rollup) lives on top of it. We are sitting at ~30% of Anthropic's runtime/state/utils maturity.

## Top porting priorities (ranked by leverage)

**Week 1 (S effort, high leverage):**

1. `packages/utils/src/abort/{abortController,combinedAbortSignal}.ts` — parent/child abort tree (50 LOC total, ref `u1` §1).
2. `packages/utils/src/lifecycle/cleanupRegistry.ts` — drop-in (full file in u1).
3. `packages/utils/src/io/bufferedWriter.ts` — drop-in (full file in u1).
4. `packages/utils/src/memoize.ts` — `memoizeWithTTL`, `memoizeWithTTLAsync` (with `inFlight: Map`), `memoizeWithLRU`. Directly fixes dual-store mock-drift (per MEMORY's `dual-store-root-cause.md`).
5. `packages/utils/src/errors/{ClaudeError,MalformedCommandError,AbortError,ConfigParseError,ShellError,TelemetrySafeError_I_VERIFIED_…}.ts` — error taxonomy expansion.
6. `packages/runtime/src/http.ts` — add `getAuthHeaders`, `withOAuth401Retry` clock-drift recovery.

**Week 2-3 (M effort, structural):**

7. `packages/runtime/src/agent-context.ts` — `AsyncLocalStorage<AgentContext>` for concurrent backgrounded agents (ref `u1` §5). Fixes the latent contamination risk in our 1,483 Tauri command surface.
8. `packages/runtime/src/workload-context.ts` — `AsyncLocalStorage<Workload>` for cron / scheduled-task tagging (ref `u3b` §12).
9. `packages/utils/src/messageQueueManager.ts` — priority command queue (547 LOC, ref `u2` §2.5). **Single highest-leverage missing port** because it directly touches every `chat send` callsite across all 6 surfaces.

**Week 4-6 (L/XL effort, foundational):**

10. `packages/stores/src/createStore.ts` — 34-LOC handwritten external store (`{getState, setState, subscribe}` + `Object.is`). Build before AppState.
11. `packages/stores/src/AppState.ts` — define the 75-field `AppState` shape with `getDefaultAppState()` factory.
12. `packages/stores/src/onChangeAppState.ts` — single choke-point for cross-cutting persistence side-effects (settings.json roundtrip, cost rollup, AWS/GCP credential cache invalidation, GrowthBook config refresh hand-off, Stripe webhook idempotency).
13. `packages/runtime/src/bootstrap-state.ts` — process-singleton state container with `_FOR_TESTS_ONLY`-suffixed reset helpers.
14. `packages/stores/src/speculation.ts` — speculation slice + `IDLE_SPECULATION_STATE` singleton (ref `AppStateStore.ts:58-79`). Fixes p50 turn latency by pre-executing likely follow-ups.

**Pre-paid-tier:**

15. `packages/data-layer/src/queue.ts` + adapter — durable queue (BullMQ / SQS / Cloud Tasks).
16. `packages/data-layer/src/policy.ts` — org-policy gate.
17. `packages/utils/src/billing.ts` — pattern-match for Hobby/Pro/Pro+/Max role checks (ref `u1` §4 `billing.ts`).

— end gap matrix
