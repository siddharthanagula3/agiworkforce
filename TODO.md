# TODO

## 1. Refresh Provider Model Catalogs (as of February 2026)

- [ ] Update OpenAI model registry entries to latest API models:
  - `gpt-5.3-codex`
  - `gpt-5.2-pro`
  - `gpt-5.2-codex`
  - keep/verify `gpt-5.2`, `gpt-5-nano`
- [ ] Update Anthropic model registry entries to latest API model IDs:
  - Sonnet 4.6 (dated ID format)
  - Opus 4.6 (dated ID format)
  - keep/verify Haiku 4.5
- [ ] Update Google Gemini model registry entries:
  - `gemini-3.1-pro`
  - `gemini-3.1-flash`
- [ ] Ensure model IDs, labels, capabilities, and router defaults are consistent across TS + Rust layers.

### Target files

- `apps/desktop/src/constants/llm.ts`
- `apps/desktop/src/lib/modelRouter.ts`
- `apps/desktop/src-tauri/src/core/llm/llm_router.rs`
- `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`
- `apps/desktop/src-tauri/src/sys/commands/llm.rs`

## 2. Align OpenAI Tool Mapping With Current API

- [x] Update `OpenAIServerTool` mapping to current tool IDs.
- [x] Add/align support for:
  - `computer_use_preview`
  - `local_shell`
  - current `mcp` config fields
  - current `web_search` option fields
  - current `code_interpreter` option fields
- [x] Remove or gate non-standard fields if unsupported (for example `validate_before_apply` if not API-supported).
- [x] Ensure built-in tool response parsing handles updated tool `type` values.
- [x] Parse Responses API top-level tool-call output items (`function_call`, `*_call`) in addition to nested message content.
- [x] Prefix server-executed OpenAI built-in tool calls with `__server__` so chat loop does not attempt local re-execution.

### Target files

- `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`
- `apps/desktop/src-tauri/src/core/llm/provider_adapter_tests.rs`

## 3. Align Anthropic Server Tool Names and Versions

- [x] Fix tool name mapping mismatch:
  - from `tool_search_regex` -> `tool_search_tool_regex`
  - from `tool_search_bm25` -> `tool_search_tool_bm25`
- [x] Update versioned tool `type` strings to latest supported API versions.
- [x] Ensure `ANTHROPIC_SERVER_TOOL_NAMES` and `build_server_tool_definition()` stay in sync.
- [x] Ensure serde serialization of `ServerTool` variants uses explicit API `type` strings where needed.
- [x] Update/expand tests to prevent regressions.

### Target files

- `apps/desktop/src-tauri/src/core/llm/server_tools.rs`
- `apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs`
- `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`

## 4. Harden Managed Cloud Tool Routing

- [x] Replace fragile Claude detection (`model contains "claude"`) with robust provider/model-family detection.
- [x] Verify Anthropic-specific fields (`thinking`, `cache_control`, `effort`) are always preserved for Anthropic requests.
- [x] Verify OpenAI requests always use correct nested tool format for built-in vs function tools.
- [x] Re-check special-casing for `gpt-5-nano` temperature behavior against current API.

### Target files

- `apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs`

## 5. Keep UI/Display Tool Names in Sync

- [x] Add display mappings for renamed/new tool IDs (OpenAI + Anthropic).
- [x] Ensure MCP/inline result rendering still matches updated tool IDs.

### Target files

- `apps/desktop/src/lib/toolDisplayNames.ts`
- `apps/desktop/src/components/UnifiedAgenticChat/*` (as needed)

## 6. Validation and Test Pass

- [x] Run Rust validation:
  - `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
- [x] Fix unrelated pre-existing test failure in terminal executor tests:
  - `validate_command` signature usage in tests
- [x] Run targeted tests for provider/tool mapping:
  - provider adapter tests
  - server tools tests
  - managed cloud transform tests
- [x] Run full relevant suites after fixes.

### Known blocker to resolve during this phase

- Resolved: terminal executor tests now pass with updated `validate_command` usage.

## 7. Documentation/Comment Hygiene

- [ ] Update stale date-stamped comments/capability claims tied to old model/tool versions.
- [ ] Add concise doc note for source-of-truth links and refresh cadence for model/tool catalogs.

### Target files

- `apps/desktop/src/constants/llm.ts`
- `docs/*` (new or existing integration docs)

## 8. Reality-Based Stabilization (Project Is Not Fully Complete)

- [ ] Add a top-level status note in docs that this project is under active stabilization and not all flows are production-ready.
- [ ] Create and maintain a domain health matrix (chat, tools, auth, credits, retries, extension, UI layout).
- [ ] For every major subsystem, define:
  - known failures
  - current workaround
  - owner file(s)
  - test coverage status

### Target files

- `TODO.md` (source of truth)
- `docs/agent-session-state.md`
- `docs/specs/*` (or a new `docs/stabilization.md`)

## 9. Model Behavior Normalization (Claude Thinking + OpenAI Reasoning)

- [ ] Implement model-family capability maps instead of ad-hoc model-name checks.
- [x] Patch thinking support gate so GPT-5 reasoning-capable models are recognized (while excluding `gpt-5-nano`).
- [x] Remove stale bare `gpt-5` fallback IDs in Rust router and align fallback/default to `gpt-5.2`.
- [ ] Claude:
  - [ ] enforce valid `thinking` behavior by model family/version
  - [ ] keep tool-use compatibility constraints explicit
  - [ ] preserve reasoning continuity rules for tool loops
- [ ] OpenAI:
  - [ ] normalize `reasoning.effort` by model family (GPT-5, GPT-5.1+, pro/codex variants)
  - [ ] enforce parameter compatibility (`temperature`, `top_p`, etc.) by reasoning mode
  - [ ] prevent invalid parameter/model combinations before request dispatch
- [ ] Add unit tests for capability map validation and request-shaping guards.

### Target files

- `apps/desktop/src/constants/llm.ts`
- `apps/desktop/src/lib/modelRouter.ts`
- `apps/desktop/src-tauri/src/core/llm/llm_router.rs`
- `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`
- `apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs`

## 10. Unified Multi-Agent Wrapper Architecture

- [ ] Define a provider-agnostic agent contract covering:
  - planning/reasoning state
  - tool call lifecycle
  - action/status timeline events
  - approvals and retries
- [ ] Map each provider/runtime to the contract:
  - OpenAI-style agents
  - Anthropic-style agents
  - Gemini-style flows
  - Perplexity/comet/web-search-first flows
- [ ] Ensure all adapters emit a consistent event taxonomy consumed by `UnifiedAgenticChat`.
- [ ] Add compatibility test fixtures for equivalent tool-call scenarios across providers.

### Target files

- `apps/desktop/src-tauri/src/core/llm/*`
- `apps/desktop/src-tauri/src/core/agi/*`
- `apps/desktop/src/hooks/useAgenticEvents.ts`
- `apps/desktop/src/components/UnifiedAgenticChat/*`

## 11. Extension Track (Dedicated Workstream)

- [x] Audit extension architecture, permissions, and transport lifecycle.
- [x] Replace placeholder extension bridge transport:
  - `apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs` now sends authenticated realtime native-message requests and propagates real success/error responses.
- [x] Replace realtime native-message echo path with real payload parsing + execution:
  - `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` now executes supported native/browser commands and returns explicit errors for unsupported/invalid payloads.
- [x] Implement baseline desktop↔extension task wiring for page context:
  - `apps/desktop/src-tauri/src/sys/commands/extension.rs` now plans deterministic actions for `extension_page_context` and emits `extension:page-context` events.
- [x] Register extension integration commands in Tauri invoke handler:
  - `extension_page_context`, `extension_analyze_forms`, `extension_task_result`, `extension_status` are now exported and invokable.
- [x] Remove false-positive extension connectivity fallback:
  - `apps/extension/src/background.ts` now relies on native messaging ping/reconnect instead of non-existent HTTP `/health` checks.
- [x] Define extension parity goals with desktop chat workflows:
  - parity goal A: every extension-native request emits visible lifecycle states (`started`/`running`/`completed|failed`) in chat timeline.
  - parity goal B: planner-originated extension tasks (`page_context` -> action execution -> `task_result`) must surface inline chat artifacts with terminal status.
  - parity goal C: extension connection state (`connected`/`disconnected`) must be visible in action timeline and recover with bounded reconnect/backoff.
  - parity goal D: extension failures must return explicit error payloads (no silent success fallback paths).
- [x] Connect extension-originated tool/action/status events into the same unified timeline model:
  - `apps/desktop/src/hooks/useAgenticEvents.ts` now listens for `extension:page-context` and `extension:task-result` and writes browser action entries to the unified action log/timeline.
- [x] Surface extension native task events directly in inline chat tool cards:
  - `apps/desktop/src/hooks/useAgenticEvents.ts` now upserts `extension_page_context` and `extension_task_result` artifacts onto active chat messages (with running/completed/failed states).
  - `apps/desktop/src/components/UnifiedAgenticChat/InlineToolResults/index.ts` now maps extension artifact tool names to inline renderers.
- [x] Emit extension native requests through the standard tool-stream lifecycle:
  - `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` now emits `agi:tool_stream` started/completed/error events for `NativeMessage` requests, enabling shared progress/status rendering with other tools.
- [x] Validate auth/session/credential handoff between extension and desktop:
  - extension background now performs bounded reconnect/backoff on native disconnect/connect/ping failures and retries on-demand before request failures.
  - realtime/native layer now emits `extension:connection-status` events on connect/disconnect for timeline visibility.
- [x] Add explicit realtime auth ACK/failure protocol and bridge remediation messaging:
  - `RealtimeEvent` now includes `authenticated` and `authentication_failed` events.
  - extension bridge now waits for auth acknowledgement before dispatching native requests.
  - missing/empty `.ipc_token`, websocket-unavailable, and auth-mismatch failures now return actionable user-facing remediation text.
- [x] Add extension transport preflight diagnostics:
  - `extension_status` now reports realtime token path/health, native connection state, extension ID, and actionable recommendations.
  - command status now returns `degraded` when token/transport preconditions are not met.
- [x] Auto-run extension preflight in chat timeline before extension-native tool execution:
  - `useAgenticEvents` now calls `extension_status` on first `extension_native_*` tool-stream start.
  - degraded preflight state is surfaced in action log/action trail with recommendations.
- [x] Keep extension preflight and reconnect flow resilient after disconnect/degraded states:
  - extension page-context sync no longer hard-fails before native reconnect attempts.
  - `GET_CONNECTION_STATUS` now triggers reconnect attempts and schedules bounded backoff on ping failure.
  - chat preflight state resets on disconnect/degraded status so follow-up extension-native tools re-check transport health.
- [x] Validate baseline auth/session handoff between extension and desktop transport:
  - extension native handshake now sends `connect` with `extension_id`
  - realtime/native layer stores connected extension metadata
  - extension suspend emits `disconnect` intent to host for cleaner session transitions
- [x] Add extension-specific error/retry/backoff handling and observability (baseline):
  - extension background worker:
    - pending native requests are rejected on disconnect
    - ping/connect handshake checks fail fast when native host responds with `success: false`
  - desktop extension bridge:
    - realtime native transport now has bounded retry/backoff for transient transport failures
    - explicit non-retry behavior for command-level native response errors
  - native messaging host:
    - now matches responses by request ID and buffers out-of-order replies
    - returns timeout errors instead of hanging indefinitely when desktop realtime transport fails
    - fails fast on missing/empty `.ipc_token` with explicit startup errors instead of silent unauthenticated loops
- [x] Fix extension screenshot capture API mismatch:
  - `apps/extension/src/background.ts` now passes `windowId` (not `tabId`) to `chrome.tabs.captureVisibleTab` for both on-demand capture and keyboard-shortcut page capture.
  - screenshot/content-script forwarding now falls back to the active tab/window when `sender.tab` is unavailable (popup/shortcut contexts), reducing hard `No tab ID` failures.
- [x] Wire extension page-context sync and action execution end-to-end over native messaging:
  - `apps/extension/src/content.ts` now emits `TAB_READY` and `SYNC_PAGE_CONTEXT`, and can execute planner-returned `RUN_PAGE_ACTIONS`.
  - `apps/extension/src/background.ts` now forwards `page_context` to desktop, dispatches returned actions to the content script, and reports `task_result` back to desktop.
  - `apps/desktop/src-tauri/src/integrations/native_messaging/mod.rs` now supports `page_context` and `task_result` native message types.
  - `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` now routes `page_context`/`task_result` through shared extension handlers and keeps tool stream lifecycle parity.
  - `apps/desktop/src-tauri/src/sys/commands/extension.rs` now exposes shared processing helpers used by both Tauri commands and realtime native-message execution.

### Target files

- `apps/extension/*`
- `apps/desktop/src-tauri/src/sys/commands/extension.rs`
- `apps/desktop/src-tauri/src/core/mcp/*`
- `apps/desktop/src/components/UnifiedAgenticChat/*`

## 12. Reliability Hardening Matrix (High Priority)

- [ ] UI overlap/layout issues:
  - [ ] inventory and fix overlap regressions in chat + sidecar + media lab layouts
  - [ ] add visual regression checks for critical views
  - [ ] Tool usage/function calling:
  - [ ] ensure every exposed tool is routable + returns user-visible status + terminal state
  - [ ] guarantee streaming IDs are consistent start/progress/output/completed/error
  - [x] fixed agent status event contract mismatch in chat listeners:
    - `apps/desktop/src/hooks/useAgenticEvents.ts` now accepts both nested and flat
      `agent:status:update` payloads, normalizes non-standard statuses
      (`awaiting_confirmation`/`awaiting_approval`), and keeps unified agent status visible.
  - [x] added tool argument alias normalization to reduce false validation failures:
    - `apps/desktop/src-tauri/src/core/llm/tool_executor.rs` now promotes common argument aliases
      (for example `cmd` -> `command`, `file_path` -> `path`, `uri` -> `url`,
      `text` -> `prompt`, `destination`/`path` variants for upload/download/document tools)
      before required-parameter checks.
  - [x] fixed early tool-failure stream termination:
    - `apps/desktop/src-tauri/src/core/llm/tool_executor.rs` now emits explicit `agi:tool_stream` error events for early blocked/approval/missing-param/tool-not-found exits so tool cards do not stay stuck in `running`.
    - added regression tests:
      - `test_unknown_tool_returns_failed_result`
      - `test_missing_required_parameter_returns_failed_result`
  - [x] fixed premature agent completion on per-tool result updates:
    - `apps/desktop/src/components/UnifiedAgenticChat/index.tsx` no longer marks agent status `completed/failed` on every `chat:tool-result`; it now updates `currentStep` while preserving long-running agent workflows.
  - [x] removed false-success native tool path:
    - realtime `NativeMessage` no longer echoes placeholder success; it now returns real execution results or explicit errors.
  - [x] added extension native closed-loop task orchestration:
    - extension `page_context` requests now return planned actions to the browser extension.
    - extension-executed action results are now reported back as `task_result` and surfaced in timeline/tool streams.
  - [x] surfaced extension page-context/task-result states in inline chat artifacts:
    - extension events now update active chat message artifacts with explicit running/completed/failed status and structured metadata for browser tasks.
  - [x] strengthened generic tool-stream parity for action log visibility:
    - `useAgenticEvents` now upserts action-log entries for every `agi:tool_stream` started/completed/error/cancelled event.
    - this ensures users see status/action progression even when a path emits tool-stream events without separate `agent:action_update` events.
  - [x] fixed malformed-tool-arguments visibility gap:
    - `tool_executor` now emits explicit failed action/tool-stream terminal state when tool-call JSON arguments are invalid (instead of returning early with no lifecycle events).
- [ ] Model usage:
  - [ ] provider-specific request validation with actionable error messages
  - [ ] fallback strategy for unsupported model/tool combos
- [ ] Auth + credits:
  - [ ] standardize error surfaces and retry behavior
  - [ ] prevent silent failures on quota/credit updates
  - [ ] Error handling + retries:
  - [ ] unify retry policies and timeout policies
  - [ ] expose retry decisions to timeline events
  - [x] reduced frontend false timeout failures for long-running tools:
    - `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs` now uses less aggressive fast-metadata tool/follow-up timeouts
      (tool timeout 45s, follow-up budgets increased) to avoid premature tool-loop failures.
    - `apps/desktop/src/components/UnifiedAgenticChat/toolTimeoutPolicy.ts` now uses longer hard timeouts
      (45s fast metadata, 180s default, 600s long-running) and avoids automatic generation aborts.
    - `apps/desktop/src/components/UnifiedAgenticChat/index.tsx` now marks non-abort timeout cases
      as "still running / waiting" warnings instead of immediate failed terminal states.
  - [x] improved tool-stream retryability signals:
    - `tool_executor` now classifies deterministic validation/permission/tool-not-found failures as non-retryable instead of always marking errors retryable.
  - [x] hardened MCP transport shutdown terminal states (stdio + http/sse):
    - cleanup loops now stop on shutdown
    - pending requests are explicitly failed during shutdown
    - child-process health checks now detect exited processes (avoid false `alive`).
  - [x] raised MCP timeout floor for slow but valid tool calls:
    - `tool_executor` MCP fallback timeout increased to 120s.
    - MCP stdio request/response timeout aligned to 120s in transport layer to reduce false timeouts.

### Target files

- `apps/desktop/src/components/UnifiedAgenticChat/*`
- `apps/desktop/src/hooks/useAgenticEvents.ts`
- `apps/desktop/src/stores/*`
- `apps/desktop/src-tauri/src/core/llm/*`
- `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`

## 13. Internet-Verified Change Protocol

- [ ] For provider/model/tool behavior changes, always verify from official docs/repos first.
- [ ] Add source links and verification date in PR notes or update logs.
- [ ] Maintain a small “provider compatibility ledger” with:
  - model/tool capability assumptions
  - last verified date
  - official source links

### Target files

- `TODO.md`
- `docs/specs/*` (new `provider-compatibility-ledger.md` recommended)

## 14. Model ID Indirection (Reduce Future Churn)

- [ ] Introduce a single source of truth for provider model IDs with alias indirection:
  - example shape: `MODEL_IDS[provider][family][tier] = "<api-model-id>"`
  - example resolver: `resolveModelId(uiModelKey) -> apiModelId`
- [ ] Migrate hardcoded model literals in Rust + TS routers/adapters/UI selectors to resolver usage.
- [ ] Add tests ensuring all routed model IDs exist in the canonical registry and no stale IDs are emitted.
- [ ] Ensure UI labels hide date suffixes by default while preserving exact dated IDs for API calls.

### Target files

- `apps/desktop/src/constants/llm.ts`
- `apps/desktop/src/lib/modelRouter.ts`
- `apps/desktop/src-tauri/src/core/llm/llm_router.rs`
- `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`
- `apps/desktop/src/components/UnifiedAgenticChat/*`
