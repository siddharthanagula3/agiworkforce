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

- Severity: High
- Files:
  - `apps/desktop/src/constants/llm.ts`
  - `apps/desktop/src/lib/modelRouter.ts`
  - `apps/desktop/src-tauri/src/core/llm/llm_router.rs`
  - `apps/desktop/src-tauri/src/sys/commands/llm.rs`
- Problem:
  - Model IDs and fallback defaults are duplicated across layers.
  - Drift risk causes invalid/stale IDs and inconsistent routing.
- Impact:
  - Wrong model selection, incompatible capabilities, hidden runtime failures.
- Required fix:
  - Add canonical model-ID resolver and remove hardcoded literals in routing paths.

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

## Recently Fixed In This Audit Pass

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
