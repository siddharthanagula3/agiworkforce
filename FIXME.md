# FIXME (Critical Blockers)

This file tracks implementation blockers that can cause user-visible failures or false assumptions that the system is fully production-ready.

## 1) Extension Bridge Runtime Dependency Risk

- Severity: Low
- Files:
  - `apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs`
- Problem:
  - Bridge transport is now real, with bounded retries, explicit auth ACK/failure handling, and remediation-oriented errors.
  - It still depends on local realtime websocket + valid `.ipc_token`; extended outage remains a hard dependency failure.
- Impact:
  - Tool calls no longer return false success, and broken token/auth setup now returns actionable errors.
  - UX can still degrade during prolonged local realtime-server outages.
- Required fix:
  - Keep retry/backoff + remediation and extend preflight diagnostics to non-tool-stream entrypoints (for example direct extension command invocations outside `agi:tool_stream` lifecycle).

## 2) Extension Orchestration Is Partial

- Severity: Medium
- Files:
  - `apps/desktop/src-tauri/src/sys/commands/extension.rs`
  - `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`
  - `apps/extension/src/background.ts`
  - `apps/extension/src/content.ts`
- Problem:
  - Native extension flow now supports a closed loop (`page_context` -> planned actions -> `task_result`) with timeline/tool-stream and inline chat artifact visibility.
  - It is still not wired into full AGI planner/executor loops and provider-level multi-step planning contracts.
- Impact:
  - Baseline extension automation works, but advanced long-horizon planner continuity can still diverge.
- Required fix:
  - Wire extension context into unified planner/executor and emit full timeline events.

## 3) Model/Router Source-Of-Truth Drift (TS vs Rust)

- Severity: ~~High~~ **RESOLVED** (2026-02-25)
- Files:
  - `apps/desktop/src/constants/llm.ts`
  - `apps/desktop/src/lib/modelRouter.ts`
  - `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`
- Resolution:
  - `AnthropicAdapter::canonicalize_model()` (provider_adapter.rs:1706-1714) explicitly normalizes dot-notation TS IDs (e.g. `claude-opus-4.6`) to hyphen API IDs (e.g. `claude-opus-4-6`) before sending to the API. No functional mismatch.
  - Anthropic server tool names updated to canonical forms (server_tools.rs:84-95).
  - Thinking model gating is family-based substring matching — not hardcoded exact names.
  - MODEL_POOLS (modelRouter.ts) and MODEL_METADATA (llm.ts) are consistent.
- Remaining: TODO #1 (refresh catalog for gpt-5.3-codex, gemini-3.1-pro etc.) is still open.

## 4) Tool Event/Execution Parity Needs Continuous Audit

- Severity: High
- Files:
  - `apps/desktop/src-tauri/src/core/llm/tool_executor.rs`
  - `apps/desktop/src/hooks/useAgenticEvents.ts`
  - `apps/desktop/src/components/UnifiedAgenticChat/*`
- Problem:
  - Tool stream lifecycle and inline artifact status handling are improving, but parity must be enforced for every tool and provider path.
  - Early failure stream termination has been fixed for several paths, but broader provider/tool-family parity remains incomplete.
- Impact:
  - Users may see partial status/action visibility or orphaned tool cards.
- Required fix:
  - Add parity tests and matrix checks per tool family/provider.

## 5) Prompt Injection via Unsanitized Tool Results

- Severity: ~~High~~ **RESOLVED** (2026-02-25)
- Files:
  - `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs`
  - `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`
- Resolution:
  - `ChatToolResult.to_message_content()` now calls `super::escape_xml()` on both the success content and the error string, blocking XML/tag injection from attacker-controlled tool results.
  - The agent execution summary in `mod.rs` is now passed through `sanitize_multiline_for_prompt(&summary, 4096)` before being embedded in the system message.

## 6) Streaming Path Has No Circuit Breaker

- Severity: ~~Medium~~ **RESOLVED** (2026-02-25)
- Files:
  - `apps/desktop/src-tauri/src/core/llm/llm_router.rs` (`invoke_streaming_with_retry()`)
- Resolution:
  - `invoke_streaming_with_retry()` now calls `tracker.record_success()` on successful stream connection and `tracker.record_server_error()` on final non-retryable 5xx failures.
  - Circuit breaker state is now consistent between streaming and non-streaming paths.

## 7) Cost Cap Not Enforced in LLMRouter Hot Path

- Severity: ~~Medium~~ **RESOLVED** (2026-02-25)
- Files:
  - `apps/desktop/src-tauri/src/core/llm/llm_router.rs` (`invoke_candidate()`)
- Resolution:
  - Added `SESSION_COST_SAFETY_CAP = 50.0` constant.
  - `invoke_candidate()` now returns an error when accumulated session cost exceeds `$50`, providing defense-in-depth for all callers that bypass `AutonomousAgent`.

## 8) Ollama `is_available()` Not Wired Into Routing

- Severity: ~~Low~~ **RESOLVED** (2026-02-25)
- Files:
  - `apps/desktop/src-tauri/src/core/llm/mod.rs` (`LLMProvider` trait)
  - `apps/desktop/src-tauri/src/core/llm/providers/ollama.rs`
  - `apps/desktop/src-tauri/src/core/llm/llm_router.rs`
- Resolution:
  - Added `async fn is_available(&self) -> bool { true }` default method to the `LLMProvider` trait.
  - `OllamaProvider` overrides it via `impl LLMProvider`, delegating to its struct-level health-ping.
  - Both `route_with_retry()` and `send_message_streaming_with_retry()` now pre-filter candidates using `is_available()`, skipping unreachable providers immediately.

## Recently Fixed In This Audit Pass (2026-02-25 Release Readiness Audit)

- **FIXME #5 RESOLVED**: Applied `escape_xml()` to `ChatToolResult.to_message_content()` and `sanitize_multiline_for_prompt()` to agent summary injection (tools.rs, mod.rs)
- **FIXME #6 RESOLVED**: Wired `RateLimitTracker.record_success()` / `record_server_error()` into `invoke_streaming_with_retry()` (llm_router.rs)
- **FIXME #7 RESOLVED**: Added `SESSION_COST_SAFETY_CAP = $50` enforcement in `invoke_candidate()` as defense-in-depth (llm_router.rs)
- **FIXME #8 RESOLVED**: Added `is_available()` to `LLMProvider` trait; `OllamaProvider` implements it; both routing entry-points pre-filter unreachable providers (mod.rs, ollama.rs, llm_router.rs)
- Added Ollama health check `is_available()` method (ollama.rs) — pings localhost:11434 before routing can use it
- Added 402/billing/credit non-retryable guard to both `is_retryable_error()` functions (llm_router.rs, fallback_chain.rs) — prevents retry loops on credit exhaustion
- Added tilde expansion unit test for `expand_tilde_in_args()` (tool_executor.rs)
- Added 503 Supabase outage guards to 8 catch blocks across admin routes (security/route.ts, sso/route.ts, directory-sync/route.ts)
- Auto-formatted 13 files with Prettier (pnpm format)
- Verified FIXME #3 resolved: Rust `canonicalize_model()` handles dot-to-hyphen normalization
- Verified FIXME #4 tool stream lifecycle: all paths emit started/completed/error correctly (9 error points, 0 silent exits)
- Verified TOOLCHAIN Bug #1 (requestId camelCase) confirmed fixed
- Verified TOOLCHAIN Bug #2 (tilde expansion) confirmed fixed + unit test added
- Verified H8 (CSRF anon session regeneration) appears fixed via `getOrCreateAnonSession()` + cookie
- Verified H10 (credit double-spend) appears fixed via `SELECT ... FOR UPDATE` + idempotency keys
- Confirmed remaining NEEDS_HUMAN: H9 (device poll legacy no-fingerprint path open at device/poll/route.ts:97-103)

## Previously Fixed

- Patched GPT-5 reasoning support detection mismatch:
  - `apps/desktop/src-tauri/src/core/llm/thinking.rs`
- Removed stale bare `gpt-5` router fallbacks:
  - `apps/desktop/src-tauri/src/core/llm/llm_router.rs`
- Improved OpenAI tool-call parsing + server-tool skip behavior:
  - `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`
  - `apps/desktop/src-tauri/src/core/llm/provider_adapter_tests.rs`
- Replaced realtime native-message echo with real command execution + explicit error responses:
  - `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`
- Activated extension command module and command registration in Tauri:
  - `apps/desktop/src-tauri/src/sys/commands/mod.rs`
  - `apps/desktop/src-tauri/src/lib.rs`
- Added deterministic page-context action planning + event emission:
  - `apps/desktop/src-tauri/src/sys/commands/extension.rs`
- Removed extension false-positive `/health` fallback and tightened native disconnect behavior:
  - `apps/extension/src/background.ts`
- Replaced mocked extension bridge transport with authenticated realtime native-message transport:
  - `apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs`
- Wired extension page/task events into unified chat timeline action log:
  - `apps/desktop/src/hooks/useAgenticEvents.ts`
- Added extension connect/disconnect session metadata handoff:
  - `apps/extension/src/background.ts`
  - `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`
- Fixed early tool-failure stream termination to avoid stuck running cards:
  - `apps/desktop/src-tauri/src/core/llm/tool_executor.rs`
  - tests:
    - `test_unknown_tool_returns_failed_result`
    - `test_missing_required_parameter_returns_failed_result`
- Fixed premature agent status completion on per-tool result events:
  - `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`
  - `chat:tool-result` handling now updates `currentStep` without forcing global agent status to completed/failed.
- Wired extension native task execution into standard tool stream lifecycle:
  - `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`
  - emits `agi:tool_stream` started/completed/error for native extension requests.
- Fixed extension screenshot capture window targeting:
  - `apps/extension/src/background.ts`
  - now uses active-tab/window fallback when `sender.tab` is missing, reducing popup/shortcut routing failures.
- Added extension native page-context/task-result closed loop:
  - `apps/desktop/src-tauri/src/integrations/native_messaging/mod.rs`
  - `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`
  - `apps/desktop/src-tauri/src/sys/commands/extension.rs`
  - `apps/extension/src/background.ts`
  - `apps/extension/src/content.ts`
  - extension now syncs page context to desktop, executes returned page actions in-content, and reports task results back to desktop with unified tool stream/timeline visibility.
- Surfaced extension events in inline chat artifacts:
  - `apps/desktop/src/hooks/useAgenticEvents.ts`
  - `apps/desktop/src/components/UnifiedAgenticChat/InlineToolResults/index.ts`
  - extension `page_context`/`task_result` updates now appear directly in chat as running/completed/failed tool cards, not only in the action log/timeline.
- Hardened extension native reconnect/session status flow:
  - `apps/extension/src/background.ts`
  - `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`
  - extension now performs bounded reconnect/backoff and on-demand reconnect waits for native requests.
  - desktop now emits `extension:connection-status` on connect/disconnect, and chat timeline consumes it via `useAgenticEvents`.
- Added explicit realtime auth ACK/failure protocol and bridge remediation:
  - `apps/desktop/src-tauri/src/integrations/realtime/events.rs`
  - `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`
  - `apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs`
  - realtime websocket now emits `authenticated` and `authentication_failed`; extension bridge waits for auth ACK and returns actionable remediation for missing token, auth mismatch, and websocket outages.
- Hardened native host request/response reliability under transport instability:
  - `apps/desktop/src-tauri/src/integrations/native_messaging/host.rs`
  - `apps/desktop/src-tauri/src/bin/native_messaging_host.rs`
  - native host now waits per-request with timeout, matches responses by request id, buffers out-of-order responses, emits immediate request-scoped errors when websocket send fails, and fails fast when realtime `.ipc_token` is missing/empty.
- Added extension transport preflight diagnostics to status command:
  - `apps/desktop/src-tauri/src/sys/commands/extension.rs`
  - `extension_status` now reports realtime token validity/path, native connection state, extension id, and remediation recommendations with `ok/degraded` status.
- Added automatic chat preflight surfacing for extension-native tools:
  - `apps/desktop/src/hooks/useAgenticEvents.ts`
  - first `extension_native_*` tool-stream start now triggers `extension_status`; diagnostics are surfaced in action log and action trail before/alongside tool execution.
- Hardened extension reconnect + preflight lifecycle:
  - `apps/extension/src/background.ts`
  - `apps/desktop/src/hooks/useAgenticEvents.ts`
  - page-context sync now allows reconnect attempts through native request flow; status ping failures schedule reconnect; preflight is re-checkable after disconnect/degraded states.
- Improved generic tool timeline parity for user-visible status:
  - `apps/desktop/src/hooks/useAgenticEvents.ts`
  - `agi:tool_stream` start/completed/error/cancelled now consistently upsert action-log entries (not only action-trail/tool-stream state), reducing hidden/orphaned tool progress.
- Improved tool-stream retryability correctness:
  - `apps/desktop/src-tauri/src/core/llm/tool_executor.rs`
  - deterministic validation/permission/not-found failures are now emitted as non-retryable tool errors, reducing misleading retry UX.
- Fixed malformed tool-call argument lifecycle gap:
  - `apps/desktop/src-tauri/src/core/llm/tool_executor.rs`
  - invalid JSON tool arguments now emit explicit failed action + tool-stream error terminal state instead of failing before status/timeline emission.
- Hardened native host auth and forwarding terminal states:
  - `apps/desktop/src-tauri/src/bin/native_messaging_host.rs`
  - `apps/desktop/src-tauri/src/integrations/native_messaging/host.rs`
  - host now blocks on auth ACK with timeout, fails fast on auth send failure, and always returns an explicit error response when forwarding channel is unavailable.
- Fixed MCP transport lifecycle leaks and health false-positives:
  - `apps/desktop/src-tauri/src/core/mcp/transport.rs`
  - stale-request cleanup tasks now terminate on shutdown; stdio transport health checks now detect exited child processes instead of reporting stale "alive" status.
  - stdio and HTTP/SSE shutdown now mark transport as shutdown immediately and drain pending requests with explicit terminal errors.
- Reduced false MCP timeout failures for long-running valid requests:
  - `apps/desktop/src-tauri/src/core/llm/tool_executor.rs`
  - `apps/desktop/src-tauri/src/core/mcp/transport.rs`
  - MCP execution timeouts are now aligned to 120s across executor + stdio transport paths.
- Reduced tool-call validation failures from argument-shape drift:
  - `apps/desktop/src-tauri/src/core/llm/tool_executor.rs`
  - added pre-execution argument alias normalization (for terminal/file/browser/search/media/api/cloud/document tools) so common alias keys map to canonical parameter names before required-parameter checks.
- Hardened agent status event compatibility in chat listeners:
  - `apps/desktop/src/hooks/useAgenticEvents.ts`
  - `agent:status:update` now supports both nested (`{ agent: ... }`) and flat payload shapes, normalizes status/progress/timestamps, and updates active agent state consistently.
- Reduced frontend false timeout regressions for long-running tools:
  - `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`
  - `apps/desktop/src/components/UnifiedAgenticChat/toolTimeoutPolicy.ts`
  - `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`
  - chat/tool loop timeout policy now uses longer fast-metadata budgets and non-abort timeout warnings for most tool families, preventing premature failed states during valid long-running executions.
