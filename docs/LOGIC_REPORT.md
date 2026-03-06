# AGI Workforce — Logic Audit Report

Generated: 2026-03-06
Status: IN PROGRESS (Wave 3)

## What to Look For

- Functions defined but never receive real input (stub/hallucinated logic)
- Agent loops that don't feed tool results back into the next iteration
- Scheduler naming mismatches (\_task vs \_job across 6 commands)
- LLM provider adapters that claim to support streaming but don't
- Tool execution handlers that silently drop errors
- Import statements pointing to files that don't exist

---

## Confirmed Issues

### BATCH-06: UnifiedAgenticChat Deep Audit (Wave 1, Agent 3)

**Audited by**: Wave 1 Agent 3 (UnifiedAgenticChat Deep Auditor)
**Date**: 2026-03-06
**Files**: 130+ files in `apps/desktop/src/components/UnifiedAgenticChat/`
**Key files**: index.tsx (~2709 lines), ChatInputArea.tsx, ChatStream.tsx, MessageBubble/ (12 subcomponents), hooks/useChatSubmit.ts, toolStore.ts (event listener)

#### DATA FLOW: User Input -> Response Render (VERIFIED COMPLETE)

1. User types -> `ChatInputArea.tsx` -> `onSend()` -> `index.tsx:handleSendMessage()`
2. handleSendMessage: slash commands -> execute\*Command(); agentic loop active -> queue pending; normal -> `ipcInvoke('chat_send_message', {request})`
3. Streaming: `chat:stream-start` -> `chat:stream-chunk` (RAF-batched) -> `chat:stream-end`/`chat:stream-error`
4. Tools: `chat:tool-calls` -> `upsertToolArtifact()` + timeout; `chat:tool-result` -> artifact update + inline renderer
5. `tool:event` channel: dispatches to 3 stores (toolStore, chatStore, agentStore)
6. Render: `ChatStream` -> `ChatMessageItem` (memo) -> `MessageBubble` -> subcomponents + `ToolTimeline` + `InlineToolResults`

**VERDICT: Data flow is COMPLETE and UNBROKEN.**

#### Issues Found

| ID      | Severity | Description                                                                                                                                                         |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CHAT-01 | MEDIUM   | `BrowserActivityBadge.tsx` and `PendingMessagesIndicator.tsx` are orphaned (never imported anywhere). Dead code.                                                    |
| CHAT-02 | LOW      | Dual pending-message paths: `useChatSubmit.ts:99` (isQueueMode) and `index.tsx:2016` (agenticLoopStatus). Different scenarios, not a bug, but should be documented. |
| CHAT-03 | VERIFIED | IPC `chat_send_message` parameter casing correct (uses `{request}` wrapper, serde-deserialized).                                                                    |
| CHAT-04 | VERIFIED | ToolCallCard renders status+approval; tool results render via InlineToolResults artifact path.                                                                      |
| CHAT-05 | VERIFIED | MessageBubble handles all 4 roles (user/assistant/tool/system) correctly.                                                                                           |
| CHAT-06 | CLEAN    | Zero TODO/FIXME/HACK comments in 130+ files.                                                                                                                        |
| CHAT-07 | VERIFIED | SSE streaming robust: RAF batching, session tracking, 5-priority message resolution, 120s watchdog.                                                                 |
| CHAT-08 | VERIFIED | tool:event listener dispatches to 3 stores with proper fallback chain.                                                                                              |
| CHAT-09 | VERIFIED | All 130+ files have valid imports. No broken references.                                                                                                            |

#### Verified Clean Logic

1. **Tool event pipeline**: Rust `tool:event` -> `initializeToolEventListener()` in `toolStore.ts` -> `useToolStore` (streams), `useChatStore` (timeline), `useAgentStore` (trail)
2. **Stream buffering**: `queueStreamUpdate()` uses RAF to batch chunks, preventing React saturation
3. **Stream session tracking**: `activeStreamSessionsRef` maps conversation_id -> messageId, 5-priority resolution prevents cross-conversation confusion
4. **Watchdog**: 120s inactivity timeout, extends during active tool executions, properly cleared on stream-end/error/stop
5. **Risk detection**: 3-tier (dangerous commands, prompt injection, shell operators) with custom confirmation dialog
6. **Model routing**: `getModelForRequest()` respects explicit model selection, only routes when auto mode selected
7. **Component architecture**: Well-structured with MessageBubble/ directory (12 subcomponents), lazy-loaded sidecar panels, memoized ChatMessageItem

---

## BATCH-07: Rust LLM Core (`core/llm/`) — Full Audit

**Audited by**: Wave 1 Agent 4 (Rust LLM Core Auditor)
**Date**: 2026-03-06
**Files**: 37 files total (18 source + 12 test + 7 provider/support)
**Lines**: llm_router.rs=2348, tool_executor.rs=8383, provider_adapter.rs=2323, sse_parser.rs=1113

### 1. Module Structure

```
core/llm/
  mod.rs                   -- Types: LLMRequest, LLMResponse, ChatMessage, Provider(12 variants), LLMProvider trait, ToolChoice, ToolCall, ToolDefinition, ContentPart(7 variants), ThinkingParameter
  llm_router.rs            -- LLMRouter: routing, retry, fallback, cost tracking, streaming
  sse_parser.rs            -- SSE stream parsing per provider (OpenAI, Anthropic, Google, Ollama)
  provider_adapter.rs      -- ProviderAdapter trait + adapters: OpenAI, Anthropic, Google, Ollama, DeepSeek, Perplexity, Moonshot, Zhipu, Mistral
  tool_executor.rs         -- ToolExecutor: 40+ tools (file, terminal, browser, git, search, db, cloud, media, email, calendar, document)
  capability_detection.rs  -- Ollama model probing via /api/show (tool/vision/context detection, cached)
  cost_calculator.rs       -- Per-model pricing from models.json, media pricing
  token_counter.rs         -- tiktoken cl100k_base with graceful fallback to char-ratio heuristic
  fallback_chain.rs        -- RateLimitTracker, AggregateError, FallbackChain with circuit breaker
  function_executor.rs     -- FunctionExecutor: wraps ToolExecutor for batch tool execution
  models_config.rs         -- Single-source-of-truth model catalog from models.json (compile-time embedded)
  thinking.rs              -- Extended thinking: ThinkingConfig, ThinkingBudget (Low/Medium/High)
  background_manager.rs    -- Background LLM request queue (submit/poll/cancel)
  memory_integration.rs    -- Memory injection into system prompts, decision detection
  prompt_policy.rs         -- No-XML rule enforcement (prevents XML/tool-tag leakage)
  prompt_tool_injection.rs -- Tool descriptions into system prompt for non-tool-capable models
  server_tools.rs          -- Server-side tool definitions (Anthropic: text_editor, web_search, web_fetch, bash, computer, memory)
  job_autofill_runtime.rs  -- Browser autofill job application evaluation scripts
  providers/
    mod.rs                 -- Provider module
    ollama.rs              -- OllamaProvider: send_message, send_message_streaming, is_available
    http_client.rs         -- HTTP client utilities
    http_client_factory.rs -- HTTP client factory with proxy/CA support
    managed_cloud_provider.rs -- ManagedCloud provider
```

### 2. Supported Providers (12 total)

| Provider     | Enum Variant             | SSE Parser                  | Adapter                  | Default Model (Simple) |
| ------------ | ------------------------ | --------------------------- | ------------------------ | ---------------------- |
| OpenAI       | `Provider::OpenAI`       | `parse_openai_sse`          | `OpenAIAdapter`          | gpt-5-nano             |
| Anthropic    | `Provider::Anthropic`    | `parse_anthropic_sse`       | `AnthropicAdapter`       | claude-haiku-4-5       |
| Google       | `Provider::Google`       | `parse_google_sse`          | `GoogleAdapter`          | gemini-3-flash-preview |
| Ollama       | `Provider::Ollama`       | `parse_ollama_sse`          | `OllamaAdapter`          | llama4-maverick        |
| Perplexity   | `Provider::Perplexity`   | `parse_openai_sse` (reused) | `PerplexityAdapter`      | sonar                  |
| XAI/Grok     | `Provider::XAI`          | `parse_openai_sse` (reused) | `OpenAIAdapter` (reused) | grok-4-fast-reasoning  |
| DeepSeek     | `Provider::DeepSeek`     | `parse_openai_sse` (reused) | `DeepSeekAdapter`        | deepseek-chat          |
| Qwen         | `Provider::Qwen`         | `parse_openai_sse` (reused) | `OpenAIAdapter` (reused) | qwen-max               |
| Moonshot     | `Provider::Moonshot`     | `parse_openai_sse` (reused) | `MoonshotAdapter`        | kimi-k2.5-thinking     |
| Zhipu        | `Provider::Zhipu`        | `parse_openai_sse` (reused) | `ZhipuAdapter`           | glm-4.6v-flash         |
| Mistral      | `Provider::Mistral`      | `parse_openai_sse` (reused) | `OpenAIAdapter` (reused) | mistral-medium-3       |
| ManagedCloud | `Provider::ManagedCloud` | `parse_openai_sse` (reused) | `OpenAIAdapter` (reused) | gpt-5-nano             |

**SSE Parsing Coverage**: COMPLETE. Every provider has a parser. 4 dedicated parsers (OpenAI, Anthropic, Google, Ollama) + 8 providers reuse OpenAI-compatible format. All include tool_call streaming support.

### 3. Key Public Functions

**LLMRouter** (llm_router.rs):

- `new()` / `Default::default()` -- constructor
- `set_provider(provider, instance)` + 11 convenience setters (set_openai, set_anthropic, etc.)
- `set_cache(cache_manager, db_connection)` -- enable response caching
- `set_default_provider(provider)`
- `set_rate_limit_tracker(tracker)` / `rate_limit_tracker()` -- circuit breaker
- `has_provider(provider) -> bool` -- check if provider is configured
- `is_provider_available(provider) -> bool` -- async availability check
- `get_cumulative_cost() -> f64` / `reset_cumulative_cost()` -- session cost tracking
- `suggest_for_context(context) -> RouterSuggestion` -- intelligent routing
- `candidates(request, preferences) -> Vec<RouteCandidate>` -- candidate selection
- `invoke_candidate(candidate, request) -> Result<RouteOutcome>` -- single invocation
- `invoke_with_retry(candidate, request, config) -> Result<RouteOutcome>` -- retry with backoff
- `route_with_retry(request, preferences, config) -> Result<RouteOutcome>` -- full routing + retry + fallback
- `send_message(prompt, preferences) -> Result<String>` -- convenience method
- `send_message_streaming(request, preferences)` -- streaming convenience
- `send_message_streaming_with_retry(request, preferences, config)` -- full streaming routing

**ToolExecutor** (tool_executor.rs):

- `new(registry)` / `with_app_handle(registry, app_handle)`
- `with_conversation_mode(mode)` / `with_project_folder(folder)`
- `execute_tool_call(tool_call) -> Result<ToolResult>` -- main execution entry
- `execute_tool_batch(tool_calls) -> Vec<ToolResult>` -- batch execution
- `get_tool_definitions(filter) -> Vec<ToolDefinition>` -- list available tools

**SSE Parser** (sse_parser.rs):

- `parse_sse_stream(response, provider) -> impl Stream<Item=StreamChunk>` -- main streaming entry
- `parse_sse_event(event, provider) -> Result<StreamChunk>` -- single event parsing
- Per-provider: `parse_openai_sse`, `parse_anthropic_sse`, `parse_google_sse`, `parse_ollama_sse`

**CapabilityDetection** (capability_detection.rs):

- `detect_ollama_capabilities(client, base_url, model) -> ModelCapabilities` -- async with cache
- `default_capabilities(model) -> ModelCapabilities` -- name-based fallback
- `clear_capability_cache()` -- invalidate cache

### 4. SSE Parsing Completeness Assessment

| Provider   | Text Streaming | Tool Call Streaming              | Error Handling        | Usage/Tokens                         | Keepalive           |
| ---------- | -------------- | -------------------------------- | --------------------- | ------------------------------------ | ------------------- |
| OpenAI     | FULL           | FULL (index-based accumulation)  | FULL (error obj)      | FULL                                 | via SseStreamParser |
| Anthropic  | FULL           | FULL (content_block_start/delta) | FULL (event:error)    | FULL (message_start+delta)           | event:ping handled  |
| Google     | FULL           | FULL (functionCall in parts)     | FULL (safety filters) | FULL (usageMetadata)                 | via SseStreamParser |
| Ollama     | FULL           | FULL (message.tool_calls)        | FULL (error field)    | FULL (prompt_eval_count, eval_count) | via SseStreamParser |
| Others (8) | Reuse OpenAI   | Reuse OpenAI                     | Reuse OpenAI          | Reuse OpenAI                         | Reuse OpenAI        |

**Verdict**: All 12 providers have COMPLETE SSE parsing. No stubs detected.

### 5. Tool Executor Feedback Loop

The tool executor (`tool_executor.rs`) **does properly parse and return tool results**:

- `execute_tool_call()` returns `ToolResult { success, data, error, retryable, metadata }`
- Results feed back via `FunctionResult::to_message_content()` which serializes data as JSON or formats errors
- `FunctionExecutor::execute_batch()` handles batch tool calls, converting errors to `FunctionResult`
- Tool events are emitted via `emit_tool_started`, `emit_tool_progress`, `emit_tool_completed`, `emit_tool_error` for frontend tracking
- The agentic loop in `sys/commands/chat/` consumes these results and re-injects them into the next LLM iteration

**Verdict**: Tool result feedback loop is FUNCTIONAL.

### 6. Capability Detection Assessment

The `capability_detection.rs` module is **fully implemented and tested** (not stubbed):

- Queries Ollama `/api/show` endpoint with 5-second timeout
- Parses template for tool tokens (`tool_call`, `<tool>`, `{{.ToolCalls}}`, etc.)
- Checks model family against `TOOL_CAPABLE_FAMILIES` (21 families: llama3.1-4, qwen2.5-3, mistral, mixtral, deepseek-v2/v3/r1, phi-3/4, gemma2/3, hermes3, firefunction, nemotron, command-r/r-plus)
- Detects vision support (vision, llava, bakllava, moondream)
- Extracts context_length from `model_info`
- Results cached per `{base_url}:{model}` key
- Graceful fallback to name-based detection if `/api/show` fails
- 17 unit tests covering all scenarios

**Verdict**: Capability detection is COMPLETE and FUNCTIONAL.

### 7. panic!() / unimplemented!() / TODO Audit

**Production code panic!() calls** (severity HIGH):

1. `providers/ollama.rs:626` -- `panic!("Ollama connection FAILED: {}", e)` -- IN TEST CODE ONLY (`#[tokio::test]`), acceptable

**Production code unreachable!() calls**:

1. `sse_parser.rs:939` -- `unreachable!()` in Infallible error conversion -- IN TEST CODE ONLY, safe (Infallible can never occur)

**Test-only panic!() calls** (acceptable -- standard test assertions):

- `sse_parser.rs:956` -- test assertion
- `vision_tests.rs` -- 9 occurrences, all in test pattern matching
- `coderabbit_fix_tests.rs` -- 4 occurrences, all in unwrap_or_else test helpers

**TODO/FIXME/HACK**: NONE found in production code.

**Verdict**: Zero panic!() in production code paths. All instances are in test code.

### 8. Security & Safety Features

- **Session cost safety cap**: `SESSION_COST_SAFETY_CAP = $50.0` enforced in both `invoke_candidate()` and streaming path
- **Streaming cost pre-flight**: Prompt token cost estimated before starting stream, rejected if would exceed cap
- **Cumulative cost tracking**: `cumulative_cost: Arc<parking_lot::Mutex<f64>>` shared across all invocations
- **No-XML rule enforcement**: `prompt_policy::apply_no_xml_rule()` applied to every routed request
- **Tool confirmation**: DANGEROUS_TOOLS list (13 tools) requires user confirmation via `request_tool_confirmation()`
- **Tool safety tiers**: Integration with `ToolSafetyTier` from security module
- **Rate limit circuit breaker**: RateLimitTracker tracks 429s and 5xx errors per provider, skips affected providers
- **Retry with exponential backoff**: Jittered backoff (25% jitter) prevents thundering herd
- **SSE buffer overflow protection**: MAX_BUFFER_SIZE = 1MB limit
- **Prompt tool injection**: For non-tool-capable models, tools injected into system prompt with `<tool_call>` parsing

### 9. Issues Found

**ISSUE LLM-01 (LOW)**: `llm_router.rs:922` -- Hardcoded fallback model `"gpt-5.2"` when `candidate.model == "auto"` and no strategy is set. Should use `models_config::get_default_model()` for resilience against model deprecation.

**ISSUE LLM-02 (LOW)**: `llm_router.rs:2183` -- Same hardcoded `"gpt-5.2"` fallback in streaming path, duplicated from non-streaming path.

**ISSUE LLM-03 (INFO)**: Provider `Mistral` is listed in `Provider` enum and has `from_string()` support but does not have a dedicated `set_mistral()` convenience method on `LLMRouter` (uses generic `set_provider()`). Minor inconsistency.

**ISSUE LLM-04 (INFO)**: `function_executor.rs:95` -- Empty test module `mod tests {}`. No tests for FunctionExecutor.

**ISSUE LLM-05 (INFO)**: `background_manager.rs` -- `_webhook_url` and `_webhook_secret` parameters are prefixed with underscore (unused). Background manager queues requests but does not actually execute them asynchronously (no tokio::spawn for background processing). The queue is created but processing must be driven externally.

---

## BATCH-04 + BATCH-05: Desktop Components A + B (excluding UnifiedAgenticChat)

**Audited by**: Wave 1 Agent 2 (Desktop Components Discovery Agent)
**Date**: 2026-03-06
**Directories**: 15 component directories under `apps/desktop/src/components/`
**Scope**: AGI, Artifacts, Auth, Canvas, ComputerUse, Connectors, Documents, MCP, Marketplace, Mobile, Research, ROIDashboard, Scheduler, Settings, Updates

### 1. Component Inventory Summary

| Directory     | Files | Exported Components                                                                                                                                | Has index.ts              |
| ------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| AGI/          | 7     | ProgressIndicator, ReflectionInsightCard, IterationProgressPanel, AgentTaskPanel, AgentTaskCreator, AgentTaskMonitor + types                       | Yes                       |
| Artifacts/    | 7     | ArtifactPanel, ArtifactRendererView, ArtifactToolbar, VersionHistoryDialog (InlineArtifactEditor, ShareArtifactDialog NOT exported)                | Yes (incomplete)          |
| Auth/         | 3     | AuthForm, AuthPage                                                                                                                                 | Yes                       |
| Canvas/       | 7     | CanvasWorkspace, CodeEditor, ArtifactPreview, ArtifactList, CanvasPanel, CanvasContainer + types                                                   | Yes                       |
| ComputerUse/  | 3     | ComputerUseMonitor, ScreenPreview, ActionLog                                                                                                       | **No** (missing index.ts) |
| Connectors/   | 6     | ConnectorCard, ConnectorsGallery, ConnectorsDialog, ConnectorOAuthFlow, ConnectorApiKeyDialog + types                                              | No                        |
| Documents/    | 1     | DocumentGenerator                                                                                                                                  | No                        |
| MCP/          | 15    | MCPServerManager, MCPServerBrowser, MCPToolExplorer, MCPConnectionStatus, McpAppRenderer, McpAppSecurityBadge, McpAppCard, McpAppGallery           | Yes                       |
| Marketplace/  | 14    | marketplaceStore (Zustand) + various sub-components                                                                                                | No (store only)           |
| Mobile/       | 4     | MobileCompanionPanel, MobileCompanionWorkspace, QRPairingCard, RemoteApprovalCard                                                                  | No                        |
| Research/     | 8     | Full barrel exports for all components + types                                                                                                     | Yes                       |
| ROIDashboard/ | 12    | roiStore (Zustand) + ROIDashboardPage + sub-components                                                                                             | No (store only)           |
| Scheduler/    | 7     | SchedulerPanel, JobCreationDialog (old); ScheduledTasksPanel, CreateTaskModal, ScheduledTaskCard, TaskScheduleInput (new, NOT exported from index) | Yes (incomplete)          |
| Settings/     | 30    | SettingsPanel + 20+ sub-setting panels                                                                                                             | No                        |
| Updates/      | 3     | UpdateChecker, UpdateDialog                                                                                                                        | Yes                       |

### 2. Direct @tauri-apps Imports (should use tauri-mock wrapper)

These files import directly from `@tauri-apps/*` instead of going through `../../lib/tauri-mock`. This breaks web-mode compatibility:

| File                                    | Import                                                            | Line |
| --------------------------------------- | ----------------------------------------------------------------- | ---- |
| AGI/IterationProgressPanel.tsx          | `import { listen } from '@tauri-apps/api/event'`                  | 8    |
| AGI/ProgressIndicator.tsx               | `import { listen } from '@tauri-apps/api/event'`                  | 2    |
| Documents/DocumentGenerator.tsx         | `import { save } from '@tauri-apps/plugin-dialog'`                | 11   |
| MCP/MCPBundleBrowser.tsx                | `import { listen } from '@tauri-apps/api/event'`                  | 8    |
| ROIDashboard/roiStore.ts                | `import { listen, type UnlistenFn } from '@tauri-apps/api/event'` | 1    |
| Settings/SettingsPanel.tsx              | `import { save } from '@tauri-apps/plugin-dialog'`                | 3    |
| Settings/SettingsPanel.tsx              | `import { writeTextFile } from '@tauri-apps/plugin-fs'`           | 4    |
| Settings/AllowedDirectoriesSettings.tsx | `import { open } from '@tauri-apps/plugin-dialog'`                | 1    |
| Settings/AllowedDirectoriesSettings.tsx | `import { exists } from '@tauri-apps/plugin-fs'`                  | 2    |
| Settings/InstructionFilesSettings.tsx   | `import { homeDir } from '@tauri-apps/api/path'`                  | 10   |
| Settings/SkillsPluginsSettings.tsx      | `import { homeDir } from '@tauri-apps/api/path'`                  | 25   |

**Total**: 11 files with 13 direct @tauri-apps imports.

**Recommendation**: Wrap `listen`, `save`, `open`, `exists`, `writeTextFile`, and `homeDir` in the `tauri-mock` module (or create additional wrappers in `lib/`) so these components degrade gracefully in web mode.

### 3. Scheduler Dual-Naming System (Job vs Task)

Two parallel scheduling systems coexist with no migration path:

**Old system (Job-based)**:

- `Scheduler/SchedulerPanel.tsx` -- Uses `useScheduler` hook, `ScheduledJob` type
- `Scheduler/JobCreationDialog.tsx` -- Uses `useScheduler` hook, `SchedulerActionType` type
- `Scheduler/index.ts` -- Only exports `SchedulerPanel` and `JobCreationDialog`
- Backend: `scheduler_add_job`, `scheduler_remove_job`, `scheduler_list_jobs`, etc.

**New system (Task-based)**:

- `Scheduler/ScheduledTasksPanel.tsx` -- Uses `useScheduledTaskStore`
- `Scheduler/CreateTaskModal.tsx` -- Uses `useScheduledTaskStore`
- `Scheduler/ScheduledTaskCard.tsx` -- Uses `useScheduledTaskStore`
- `Scheduler/TaskScheduleInput.tsx` -- Uses types from `scheduledTaskStore`
- Store: `scheduledTaskStore.ts` with `ScheduledTask` type
- Backend: `scheduler_add_task`, `scheduler_remove_task`, `scheduler_list_tasks`, etc.

**Cross-reference**: `AGI/AgentTaskPanel.tsx` imports `ScheduledTasksPanel` (new system), confirming the new system is the actively used one.

**Issue**: `Scheduler/index.ts` only exports the old Job-based components. The new Task-based components are not barrel-exported, causing inconsistency.

### 4. Missing Barrel Exports

**Artifacts/index.ts**: Exports `ArtifactPanel`, `ArtifactRendererView`, `ArtifactToolbar`, `VersionHistoryDialog` but does NOT export `InlineArtifactEditor` or `ShareArtifactDialog`. These are only used internally by `ArtifactPanel.tsx`, so this is intentional (internal implementation detail), not a bug.

**Scheduler/index.ts**: Only exports `SchedulerPanel` and `JobCreationDialog` (old system). Does NOT export `ScheduledTasksPanel`, `CreateTaskModal`, `ScheduledTaskCard`, or `TaskScheduleInput` (new system). This is a real gap -- consumers import directly from file paths instead of the barrel.

**ComputerUse/**: No `index.ts` exists at all. Components are imported directly by file path.

### 5. Potentially Dead Components

| Component                | File                                | Evidence                                   |
| ------------------------ | ----------------------------------- | ------------------------------------------ |
| ConnectorsDialog         | Connectors/ConnectorsDialog.tsx     | Not imported by any other file in codebase |
| MobileCompanionWorkspace | Mobile/MobileCompanionWorkspace.tsx | Not imported by any other file in codebase |
| ROIDashboardPage         | ROIDashboard/ROIDashboardPage.tsx   | Not imported by any other file in codebase |

**Note**: These may be conditionally loaded via lazy imports or route definitions not captured by static grep. Verify with runtime testing before removing.

### 6. Direct invoke() Calls in Components

Most components correctly delegate to Zustand stores for `invoke()` calls. The following components call `invoke()` directly (imported from `tauri-mock`, which is acceptable but worth noting):

- `Documents/DocumentGenerator.tsx` -- `invoke('write_file_content', ...)` for file saving
- `Connectors/ConnectorsGallery.tsx` -- `invoke('connector_connect', ...)`, `invoke('connector_disconnect', ...)`
- Various Settings sub-panels -- `invoke()` for settings read/write

These are acceptable since they use the `tauri-mock` wrapper, but ideally would go through dedicated stores for consistency.

### 7. @/ Alias Usage

Several components use the `@/` path alias (maps to `src/`):

- `Artifacts/ArtifactPanel.tsx`, `ArtifactRendererView.tsx`, `ArtifactToolbar.tsx`, `InlineArtifactEditor.tsx`, `ShareArtifactDialog.tsx`
- `Research/ResearchProgressPanel.tsx`, `ResearchReport.tsx`
- `Settings/SettingsPanel.tsx` and sub-panels
- `Scheduler/SchedulerPanel.tsx`, `JobCreationDialog.tsx`

This is consistent within the codebase (configured in tsconfig) and not an issue.

### 8. Issues Found

**ISSUE COMP-01 (MEDIUM)**: 11 files with 13 direct `@tauri-apps` imports bypass the `tauri-mock` wrapper, breaking web-mode compatibility. These need wrapper functions added to `lib/tauri-mock.ts` for `listen`, `save`, `open`, `exists`, `writeTextFile`, and `homeDir`.

**ISSUE COMP-02 (MEDIUM)**: Scheduler dual-naming system (Job vs Task) with no migration path. `Scheduler/index.ts` only exports old Job-based components while the actively used system is Task-based. The barrel export should be updated.

**ISSUE COMP-03 (LOW)**: ComputerUse directory has no `index.ts` barrel export file, unlike most other component directories.

**ISSUE COMP-04 (LOW)**: 3 potentially dead components (ConnectorsDialog, MobileCompanionWorkspace, ROIDashboardPage) found with no import references.

**ISSUE COMP-05 (INFO)**: Artifacts/index.ts intentionally omits InlineArtifactEditor and ShareArtifactDialog (internal to ArtifactPanel). Not a bug.

---

## Clean Logic (verified working)

(Agents append here)

### BATCH-07: Verified Clean Logic

1. **LLM Routing**: Complete 12-provider routing with intelligent intent-based routing, plan-tier awareness (free/hobby/pro/max), 7 strategies (Auto, AutoEconomy, AutoBalanced, AutoPremium, CostOptimized, LatencyOptimized, LocalFirst), and dynamic model resolution based on token count.

2. **SSE Streaming**: All 4 dedicated parsers (OpenAI, Anthropic, Google, Ollama) fully implemented with tool call streaming, error detection, keepalive handling, and token usage extraction. 8 other providers correctly reuse OpenAI-compatible parser.

3. **Retry & Fallback**: Exponential backoff with jitter, rate limit detection (429), server error detection (5xx), circuit breaker integration, availability pre-check (skips unreachable providers). Both streaming and non-streaming paths have consistent retry behavior.

4. **Cost Tracking**: Session cost safety cap ($50) enforced on both invocation paths. Pre-flight cost estimation for streaming. Pricing loaded from centralized models.json catalog.

5. **Ollama Capability Detection**: Real /api/show probing with template analysis, family matching, vision detection, context length extraction. Results cached. Graceful fallback to name-based heuristic.

6. **Tool Execution**: 40+ tools with per-tool timeout configuration (fast/medium/slow/very_slow), dangerous tool confirmation, argument normalization/aliasing, ToolGuard security integration, real-time event streaming to frontend.

7. **Model Catalog**: Single source of truth in `models.json`, embedded at compile time via `include_str!`. Shared between Rust and TypeScript. Provides pricing, capabilities, task routing, canonicalization, SSE delimiters.

8. **Extended Thinking**: ThinkingConfig with budget levels (Low=10K, Medium=32K, High=128K tokens), triggered by keywords ("think", "think hard", "ultrathink"). Model support detection for Claude, o3, Gemini.
