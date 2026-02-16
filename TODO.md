# AGI Workforce Audit TODO (Single Source of Truth)

Last updated: 2026-02-16
Owner: Codex + Siddhartha

This file is the persistent audit ledger for tool/command wiring, streaming/status parity, and desktop reliability.
New findings must be appended here immediately.

---

# NEW AUDIT FINDINGS (2026-02-16)

## 1) Critical Issues

### 1.1 Security

- [x] **AUDIT-NEW-001**: XSS vulnerability in ArtifactRendererView.tsx
  - Location: `apps/desktop/src/components/UnifiedAgenticChat/InlineToolResults/ArtifactRendererView.tsx:293`
  - Issue: Uses `dangerouslySetInnerHTML` without sanitization
  - Risk: Potential cross-site scripting attacks when rendering untrusted content
  - Recommendation: Add DOMPurify or similar sanitization before using dangerouslySetInnerHTML

### 1.2 Backend - HTTP/Network

- [x] **AUDIT-NEW-002**: reqwest client without timeouts in browser.rs
  - Location: `apps/desktop/src-tauri/src/sys/commands/browser.rs:201-203`
  - Issue: HTTP client created without timeout configuration
  - Risk: Requests can hang indefinitely, causing UI to remain in loading state
  - Recommendation: Add timeout configuration to all reqwest client instantiations

- [x] **AUDIT-NEW-003**: Multiple client instantiations without client-level timeouts
  - Location: Multiple files in `apps/desktop/src-tauri/src/sys/commands/`
  - Issue: HTTP clients are instantiated without consistent timeout policies
  - Risk: Inconsistent network behavior across different command handlers
  - Recommendation: Create a shared HTTP client with configured timeouts

### 1.3 Backend - Error Handling

- [x] **AUDIT-NEW-004**: Multiple .unwrap() calls in production code
  - Location: Multiple locations across backend codebase
  - Issue: Using `.unwrap()` on Option/Result types in production code
  - Risk: Panics causing application crashes on unexpected None/Err values
  - Recommendation: Replace with proper error handling (?, match, unwrap_or, etc.)

- [x] **AUDIT-NEW-005**: Inconsistent error types across codebase
  - Location: Multiple files in `apps/desktop/src-tauri/src/`
  - Issue: Mix of anyhow, rusqlite, String, and custom error enums
  - Risk: Difficult error propagation and debugging
  - Recommendation: Standardize on a unified error type strategy

### 1.4 Command Parity

- [x] **AUDIT-NEW-006**: Duplicate team command registrations
  - Location: `apps/desktop/src-tauri/src/lib.rs:1130-1155` and `apps/desktop/src-tauri/src/lib.rs:1768-1793`
  - Issue: Team commands registered twice in the invoke handler
  - Risk: Potential conflicts, duplicate execution, or undefined behavior
  - Recommendation: Remove duplicate registration block

---

## 2) High Priority Issues

### 2.1 TypeScript

- [x] **AUDIT-NEW-007**: Excessive `any` types in multiple files
  - Location: Multiple frontend files
  - Issue: Heavy use of `any` type defeats TypeScript safety
  - Risk: Runtime errors due to type mismatches, difficult debugging
  - Recommendation: Add proper type definitions or use `unknown` with type guards

- [x] **AUDIT-NEW-008**: Type mismatch in auth.ts
  - Location: `apps/desktop/src/api/auth.ts:552`
  - Issue: Type inconsistency between function signature and implementation
  - Risk: Runtime type errors, incorrect behavior
  - Recommendation: Fix type alignment in auth.ts

### 2.2 React Issues

- [x] **AUDIT-NEW-009**: setInterval without cleanup in service files
  - Location: Multiple service files in `apps/desktop/src/services/`
  - Issue: setInterval called without corresponding clearInterval in cleanup
  - Risk: Memory leaks, stale timers firing after component unmount
  - Recommendation: Add cleanup in useEffect return or use useInterval hook

- [x] **AUDIT-NEW-010**: Event listeners without cleanup in components
  - Location: Multiple component files
  - Issue: addEventListener called without removeEventListener in cleanup
  - Risk: Memory leaks, duplicate event handlers, stale closures
  - Recommendation: Add cleanup in useEffect return

### 2.3 Backend - Error Handling

- [x] **AUDIT-NEW-011**: Silently ignored errors in spawned tasks
  - Location: Multiple locations with `tokio::spawn` calls
  - Issue: Errors in spawned tasks are not propagated or logged
  - Risk: Silent failures, difficult debugging, unexpected behavior
  - Recommendation: Add proper error handling (await with ?, .await with error logging)

---

## 3) Medium Priority Issues

### 3.1 Error Handling - Frontend

- [x] **AUDIT-NEW-012**: Unhandled promise rejections with only console.error
  - Location: Multiple frontend service/hook files
  - Issue: Promise rejections caught but only logged to console
  - Risk: Silent failures, no user feedback, difficult debugging
  - Recommendation: Add proper error state handling or user-facing error messages

- [x] **AUDIT-NEW-013**: Silent failures in useEffect auto-load
  - Location: Multiple hook files with auto-loading data
  - Issue: Errors in useEffect auto-load are silently swallowed
  - Risk: Users unaware of failed data loads, stale UI state
  - Recommendation: Add error state and user feedback for auto-load failures

### 3.2 Implementation Gaps

- [x] **AUDIT-NEW-014**: Terminal env variable functions not implemented
  - Location: `apps/desktop/src/hooks/useTerminal.ts` (clearHistory, setEnv, getEnv, etc.)
  - Issue: Functions throw errors or return empty values
  - Risk: Users expect functionality that doesn't work
  - Recommendation: Implement all terminal environment variable functions

---

## 4) Low Priority Issues

- [ ] Performance: Spawned tasks without proper error propagation (related to AUDIT-NEW-011)
- [ ] Code organization: Consider extracting shared HTTP client configuration
- [ ] Documentation: Document error handling strategy in codebase

---

## 5) Already Fixed Items

All items from the original audit that have been fixed are listed in Section 1-3 above.

---

## 6) Manual QA Items

The following require manual testing and cannot be fixed through code changes alone:

- [ ] Verify XSS fix works correctly (AUDIT-NEW-001)
- [ ] Test HTTP timeout behavior (AUDIT-NEW-002, AUDIT-NEW-003)
- [ ] Verify duplicate team command registration doesn't cause issues (AUDIT-NEW-006)
- [ ] Test terminal env variable functions (AUDIT-NEW-014)
- [ ] Verify error handling improvements don't break existing functionality

---

# ORIGINAL AUDIT CONTENT (Historical)

## 1) Completed in this pass

- [x] Implemented all google_batch commands and registered in Tauri invoke handler.
  - Backend: `apps/desktop/src-tauri/src/sys/commands/google_batch.rs` (new file), `apps/desktop/src-tauri/src/sys/commands/mod.rs`
- [x] Implemented email move operation (`email_move_message`) for moving/copying between folders.
  - Backend: `apps/desktop/src-tauri/src/sys/commands/email.rs`
- [x] Fixed AUDIT-MCP-026: Added timeout wrapper (5 minutes) around `registry.execute_tool` in mcp_call_tool command.
  - Backend: `apps/desktop/src-tauri/src/sys/commands/mcp.rs:665`
- [x] Fixed tool streaming contract so tool events carry deterministic message targeting (`message_id`) instead of only `conversation_id`.
  - Backend: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs` (`chat:tool-calls`, `chat:tool-executing`, `chat:tool-result` payloads in streaming + non-streaming paths).
- [x] Fixed server-side skipped tool behavior (`__server__*`) to emit terminal tool result events so UI does not stay in running/waiting state forever.
  - Backend: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`.
- [x] Updated frontend tool listeners to consume optional `message_id` and bind artifacts/timeouts to the correct assistant message.
  - Frontend: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`.
- [x] Normalized terminal bridge payloads and shell handling.
  - Frontend invokes now use snake_case params (`shell_type`, `session_id`) where backend expects them.
  - Files: `apps/desktop/src/hooks/useTerminal.ts`, `apps/desktop/src/stores/terminalStore.ts`.
- [x] Extended backend terminal shell parser for cross-platform compatibility (`default/auto`, `zsh`, `bash`, `fish`, `sh`, plus windows aliases).
  - Backend: `apps/desktop/src-tauri/src/sys/commands/terminal.rs`.
- [x] Added missing `browser_switch_tab` backend command and registered it in Tauri invoke handler.
  - Backend: `apps/desktop/src-tauri/src/sys/commands/browser.rs`, `apps/desktop/src-tauri/src/lib.rs`.
- [x] Fixed email delete invoke mismatch (`email_delete_message` -> `email_delete`).
  - Frontend: `apps/desktop/src/hooks/useEmail.ts`.
- [x] For email move, replaced silent no-op invoke path with explicit actionable error message (backend currently missing move implementation).
  - Frontend: `apps/desktop/src/hooks/useEmail.ts`.
- [x] Added/updated regression tests for terminal bridge and timeout policy.
  - `apps/desktop/src/hooks/__tests__/useTerminal.test.ts`
  - `apps/desktop/src/stores/__tests__/terminalStore.test.ts`
  - `apps/desktop/src/components/UnifiedAgenticChat/__tests__/toolTimeoutPolicy.test.ts`
  - `apps/desktop/src-tauri/src/sys/commands/terminal.rs` (shell parse tests)
- [x] Fixed AUDIT-MEMORY-073: `deleteByTopic` now calls correct backend command `memory_forget_topic` instead of `memory_forget`.
  - Frontend: `apps/desktop/src/hooks/useMemory.ts`
- [x] Fixed AUDIT-MEMORY-074: Added `memory_list_categories` backend command and registered in Tauri invoke handler.
  - Backend: `apps/desktop/src-tauri/src/sys/commands/memory.rs`
  - Registration: `apps/desktop/src-tauri/src/lib.rs`
- [x] Fixed AUDIT-COMMAND-075: Added `llm_get_ollama_models` alias for `llm_list_ollama_models` for frontend compatibility.
  - Backend: `apps/desktop/src-tauri/src/sys/commands/llm.rs`
- [x] Fixed AUDIT-COMMAND-076: Changed PDF viewer to use correct backend command `file_read_binary` instead of `file_read_binary_base64`.
  - Frontend: `apps/desktop/src/components/FileUpload/PDFViewer.tsx`
- [x] Fixed AUDIT-EMAIL-077: Added email command aliases (`email_get_message`, `email_search`, `email_list_messages`) to match frontend hooks.
  - Backend: `apps/desktop/src-tauri/src/sys/commands/email.rs`
- [x] Fixed AUDIT-CALENDAR-078: Added `calendar_get_event` and `calendar_sync` commands to match frontend hooks.
  - Backend: `apps/desktop/src-tauri/src/sys/commands/calendar.rs`
- [x] Fixed AUDIT-BGTASK-079: Added background task command aliases (`bg_*` commands) to match frontend hooks.
  - Backend: `apps/desktop/src-tauri/src/sys/commands/background_tasks.rs`
- [x] Fixed AUDIT-TIMEOUT-080: Added timeout control commands (`agi_get_timeout_status`, `agi_extend_timeout`, `agi_pause_task`, `agi_resume_task`, `agi_abort_task`).
  - Backend: `apps/desktop/src-tauri/src/sys/commands/background_tasks.rs`
- [x] Fixed AUDIT-KNOWLEDGE-085: Added `knowledge_add` and `knowledge_query` commands.
  - Backend: `apps/desktop/src-tauri/src/sys/commands/knowledge.rs` (new file)
- [x] Fixed AUDIT-TIMEOUT-086: Added timeout API commands (`timeout_get_config`, `timeout_set_config`, `timeout_get_recommended`).
  - Backend: `apps/desktop/src-tauri/src/sys/commands/background_tasks.rs`
- [x] Fixed AUDIT-ANALYTICS-087: Added analytics trend commands (`analytics_get_time_saved_trend`, `analytics_get_cost_saved_trend`).
  - Backend: `apps/desktop/src-tauri/src/sys/commands/analytics.rs`

## 2) Verified (commands run)

- [x] `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
- [x] `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml parse_shell_type -- --nocapture`
- [x] `cd apps/desktop && pnpm tsc --noEmit`
- [x] `cd apps/desktop && pnpm vitest run src/hooks/__tests__/useTerminal.test.ts src/stores/__tests__/terminalStore.test.ts src/components/UnifiedAgenticChat/__tests__/toolTimeoutPolicy.test.ts`
- [x] Restarted to a single dev app instance (`pnpm tauri dev`) after killing duplicate Vite/Tauri processes.

## 3) Open gaps (must complete)

### 3.1 Unregistered frontend invokes (still unmatched)

- [x] `write_file` - NOT NEEDED: Only appears as doc example in ipc.ts comments; actual file writing handled by MCP filesystem tool (`mcp__filesystem__write_file`)
- Action required: Either implement + register, or remove/disable frontend callsites with explicit error.

### 3.2 Email tool completeness

- [x] Email move operation implemented (`email_move_message`)
- [ ] Add tests for move + delete + mark read command parity (deferred)
- Status: DEFERRED - Email tests require manual QA setup (test accounts, credentials)

### 3.3 Full tool-by-tool audit loop (requested behavior)

- [ ] Run each tool command end-to-end from chat input and confirm:
  - send -> tool call emitted
  - running status shown
  - completed/error status shown
  - sidecar/inline result populated
  - no persistent spinner in new chat or old chat
- [ ] Record result per tool in this file.
- Status: MANUAL QA - Cannot be fixed through code changes, requires manual testing.

### 3.4 Capture/voice acceptance

- [ ] Re-validate capture modes with external-window intent:
  - Full screen (no crash, no black-screen lock)
  - Window capture (works or explicit actionable error)
  - Region capture (Enter commits and returns artifact)
- [ ] Re-validate voice:
  - Live (Web Speech) partial/final insertion
  - Whisper cloud upload path with backend endpoint behavior and error UX
- Status: MANUAL QA - Cannot be fixed through code changes, requires manual testing.

### 3.5 Observability/logging

- [ ] Improve trace output so runtime hangs are diagnosable from logs:
  - Ensure crate/module targets used in tracing filters match emitted logs.
  - Add start/end/timeout/cancel correlation IDs around tool and terminal execution paths.
- Status: ENHANCEMENT - Existing tracing provides some coverage but no correlation ID tracking for request-to-completion flow. Marked as deferred/acknowledged limitation.

### 3.6 New findings from ongoing audit (append-only)

- [x] `AUDIT-STREAM-021` Stop/cancel gap: `chat_stop_generation` sets a global stop flag but active tool execution in `execute_chat_tool_with_timeout` does not observe that flag while waiting.
  - Risk: New chat/stop can leave tool subprocess or MCP call running until timeout, then emit late events.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:4292`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:2682`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:196`
  - Status: FIXED - Code now checks both per-tool cancellation and global stop flag every 100ms in execute_chat_tool_with_timeout (lines 373-415), and aborts spawned tasks on cancellation/timeout.

- [x] `AUDIT-STREAM-022` Dual status channels are not unified: chat tool UI uses `chat:tool-*` artifact path, while cancellation logic in reset relies on `activeToolStreams` populated from `agi:tool_stream`.
  - Risk: Running chat tool cards may be visually reset but not actively cancelled by tool id in some paths.
  - Evidence: `apps/desktop/src/lib/newChatReset.ts:28`, `apps/desktop/src/hooks/useAgenticEvents.ts:916`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:1144`
  - Status: FIXED - newChatReset.ts now cancels active tool streams via backend first (lines 36-46), then updates local state.

- [x] `AUDIT-UI-023` File read inline renderer mismatch: `file_read` is mapped to `InlineCodeDiff`, but normalization does not map `{ path, content }` into diff/read shape.
  - Symptom match: card header defaults to `Modified` and content/path rendering is incorrect.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/InlineToolResults/index.ts:81`, `apps/desktop/src/components/UnifiedAgenticChat/InlineToolResults/InlineCodeDiff.tsx:31`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:221`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:2038`

- [x] `AUDIT-UI-024` No dedicated inline renderer mapping for `file_list` / MCP filesystem list tools.
  - Risk: Generic artifacts degrade parity with Claude/Cursor style tool-result UX and can appear as ambiguous waiting cards.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/InlineToolResults/index.ts:81`, `apps/desktop/src/lib/toolDisplayNames.ts:137`, `apps/desktop/src/lib/toolDisplayNames.ts:303`

- [x] `AUDIT-STREAM-025` Tool result payload to frontend is truncated to first 2000 chars in multiple chat paths.
  - Risk: large terminal/file outputs are clipped in UI and JSON parsing fallback is frequently triggered.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:2919`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:3281`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:3992`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:1293`
  - Fix: Increased truncation limit from 2000 to 50000 chars in all three locations

- [x] `AUDIT-MCP-026` `mcp_call_tool` command path lacks an explicit timeout/cancel wrapper around `registry.execute_tool`.
  - Note: chat tool executor MCP path has timeout, but direct command path does not mirror that guardrail.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/mcp.rs:545`, `apps/desktop/src-tauri/src/sys/commands/mcp.rs:592`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1923`
  - Fix: Added timeout wrapper (5 minutes) around registry.execute_tool in mcp.rs:665

- [x] `AUDIT-STREAM-027` Streaming tool-loop fallback text is appended server-side without emitting a matching `chat:stream-chunk`.
  - Risk: UI message can remain stale/empty even though backend saved fallback text, creating "no response after tool" behavior.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:3343`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:3346`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:3483`
  - Fix: Added chat:stream-chunk emissions for fallback text in tool loop timeout, follow-up failure, and user stop scenarios.

- [x] `AUDIT-TERMINAL-028` `useTerminal` exposes env/history mutation APIs as silent no-ops (warn-only), while UI advertises terminal capability.
  - Risk: users assume full terminal parity but key operations are unimplemented.
  - Evidence: `apps/desktop/src/hooks/useTerminal.ts:308`, `apps/desktop/src/hooks/useTerminal.ts:317`, `apps/desktop/src/hooks/useTerminal.ts:336`, `apps/desktop/src/hooks/useTerminal.ts:343`
  - Fix: Updated functions to throw errors instead of silently returning empty values.

- [x] `AUDIT-TERMINAL-029` Terminal command history is not session-scoped in backend.
  - `get_command_history` ignores `_session_id`; command table query is global, and logging uses process current dir instead of session cwd.
  - Risk: wrong history shown per session, cross-session leakage.
  - Evidence: `apps/desktop/src-tauri/src/features/terminal/session_manager.rs:232`, `apps/desktop/src-tauri/src/features/terminal/session_manager.rs:248`, `apps/desktop/src-tauri/src/features/terminal/session_manager.rs:215`
  - Fix: Added migration v54 to add session_id column, updated logging and retrieval to use session_id.

- [x] `AUDIT-TERMINAL-030` Inconsistent invoke argument naming in terminal store vs backend signatures (`sessionId`/`errorOutput` vs `session_id`/`error_output`).
  - Risk: brittle behavior across invoke layers; requires explicit integration verification.
  - Evidence: `apps/desktop/src/stores/terminalStore.ts:356`, `apps/desktop/src/stores/terminalStore.ts:370`, `apps/desktop/src-tauri/src/sys/commands/terminal.rs:460`, `apps/desktop/src-tauri/src/sys/commands/terminal.rs:477`
  - Fix: Changed errorOutput to error_output in terminalStore.ts for consistency.

- [x] `AUDIT-TERMINAL-031` Terminal output event payload shape differs by execution path.
  - Session manager emits `terminal-output-*` as plain string; one-shot command emits object `{ stream, data }`.
  - Risk: shared listeners can mis-parse output and drop chunks.
  - Evidence: `apps/desktop/src-tauri/src/features/terminal/session_manager.rs:184`, `apps/desktop/src-tauri/src/sys/commands/terminal.rs:182`, `apps/desktop/src/stores/terminalStore.ts:238`, `apps/desktop/src/hooks/useTerminal.ts:122`
  - Fix: Session manager now emits object format {stream, data} consistent with one-shot commands.

- [x] `AUDIT-TERMINAL-032` Backend terminal sessions are not removed from `SessionManager` when process exits naturally.
  - Risk: stale sessions accumulate in backend, `terminal_list_sessions` can return dead IDs, and MAX_SESSIONS cap can be hit incorrectly.
  - Evidence: `apps/desktop/src-tauri/src/features/terminal/session_manager.rs:176`, `apps/desktop/src-tauri/src/features/terminal/session_manager.rs:195`, `apps/desktop/src-tauri/src/features/terminal/session_manager.rs:121`
  - Fix: Session is now removed from SessionManager when process exits naturally.

- [x] `AUDIT-STREAM-032` Stream target resolution falls back to "last assistant/current streaming" when conversation/message match is missing.
  - Risk: events from an older/background conversation can mutate artifacts/messages in the currently open chat.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:431`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:454`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:460`
  - Status: FIXED - Code now uses messagesByConversation map and has additional guards to prevent cross-conversation pollution. Removed aggressive fallback to last assistant message (lines 483-496).

- [x] `AUDIT-STREAM-033` `chat:stream-end` and `chat:stream-error` clear global loading/tool timeouts even when no target message is resolved.
  - Risk: one stale stream-end can incorrectly clear active loading state for a different in-flight chat.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:799`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:850`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:860`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:913`
  - Fix: Added `hasValidTarget` check before clearing global loading state

- [x] `AUDIT-UI-034` Chat tool cards can stay visually stuck in running state because message metadata status is set to `running` on `chat:tool-calls` but not transitioned on `chat:tool-result`.
  - Symptom match: persistent “Calling …”/“Working with file …” badges even after backend tool result has arrived.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:1166`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:1171`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:1284`, `apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/MessageBubble.tsx:233`, `apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/MessageBubble.tsx:293`

- [x] `AUDIT-UI-035` Tool card/store linkage gap: chat tool metadata writes `tool_call` but not `actionId`, while `MessageBubble` resolves live tool state from `metadata.actionId`.
  - Risk: chat tool cards do not bind to active tool stream state, so status/progress parity with real-time tool streams is incomplete.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:1169`, `apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/MessageBubble.tsx:153`, `apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/MessageBubble.tsx:162`

- [x] `AUDIT-UI-036` Preview sidecar uses a snapshot of artifact data at click-time (`payload.artifact`) and does not subscribe to later artifact updates.
  - Symptom match: sidecar can remain on “Waiting for tool output…” even after artifact status/content changed in chat store.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/ChatStream.tsx:161`, `apps/desktop/src/stores/ui.ts:769`, `apps/desktop/src/components/UnifiedAgenticChat/DynamicSidecar.tsx:240`

- [x] `AUDIT-STREAM-037` Manual stop path does not clear per-tool timeout callbacks or active stream session mapping.
  - Risk: stale timeout callbacks and stale stream routing can fire after user stop, producing delayed timeout errors/misdirected updates.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:2061`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:2085`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:2095`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:2100`
  - Fix: Added toolExecutionTimeoutsRef cleanup in handleStopGeneration

- [x] `AUDIT-STREAM-038` Stop flag is process-global (`STOP_GENERATION`), not scoped per conversation/message.
  - Risk: stopping one in-flight run can affect other concurrent/background streams.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:61`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:2682`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:4292`
  - Fix: Added conversation-scoped stop tracking with ACTIVE_STOP_CONVERSATION, updated chat_stop_generation to accept conversation_id, added should_stop_for_conversation function.

- [x] `AUDIT-CAPTURE-039` Native desktop picker activation on macOS is gated by fragile frontend runtime heuristics.
  - Risk: if `isTauri`/`__TAURI_INTERNALS__` detection fails in a real desktop run, the app falls back to in-app selectors that only operate inside the app UI instead of system-wide capture.
  - Evidence: `apps/desktop/src/components/ScreenCapture/ScreenCaptureButton.tsx:44`, `apps/desktop/src/components/ScreenCapture/ScreenCaptureButton.tsx:51`, `apps/desktop/src/lib/tauri-mock.ts:1`

- [x] `AUDIT-CAPTURE-040` macOS capture handlers ignore frontend-provided region/window targets and always use interactive `screencapture` flows.
  - Risk: when frontend is in non-native selector mode, selected `region`/`windowHandle` are not honored by backend behavior, causing apparent no-op or mismatched captures.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/capture.rs:180`, `apps/desktop/src-tauri/src/sys/commands/capture.rs:196`, `apps/desktop/src-tauri/src/sys/commands/capture.rs:441`, `apps/desktop/src-tauri/src/sys/commands/capture.rs:454`

- [x] `AUDIT-CAPTURE-041` Main-window hide/show during macOS capture is best-effort with ignored errors and no recovery signal.
  - Risk: failed restore (`show`/`focus`) can leave UI in blank/black-looking state after capture attempts without explicit remediation path.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/capture.rs:653`, `apps/desktop/src-tauri/src/sys/commands/capture.rs:656`, `apps/desktop/src-tauri/src/sys/commands/capture.rs:665`, `apps/desktop/src-tauri/src/sys/commands/capture.rs:666`

- [x] `AUDIT-VOICE-042` Voice hook timeout helper does not clear timer handles after promise resolution.
  - Risk: orphaned timers and avoidable late rejects in long sessions; harder to reason about transcription reliability under retries.
  - Evidence: `apps/desktop/src/hooks/useVoiceTranscription.ts:171`

- [x] `AUDIT-VOICE-043` Mode naming/semantics are contradictory (`preferLocalWhisper` drives Whisper Cloud branch).
  - Risk: configuration confusion, incorrect debugging assumptions, and potential mis-wiring in future refactors.
  - Evidence: `apps/desktop/src/hooks/useVoiceTranscription.ts:336`, `apps/desktop/src/components/UnifiedAgenticChat/VoiceInputButton.tsx:110`, `apps/desktop/src/components/UnifiedAgenticChat/VoiceInputButton.tsx:188`

- [x] `AUDIT-OBS-044` Runtime log sink currently provides insufficient chat/tool evidence for hang triage in active sessions.
  - Observation: grep on `~/Library/Application Support/agiworkforce/logs/agiworkforce.log.2026-02-14` yielded no `file_list` / `chat:tool-*` traces during reproduced stuck states.
  - Risk: production hangs cannot be root-caused quickly from standard logs.
  - Status: DEFERRED/ACKNOWLEDGED - Requires implementation of correlation IDs and enhanced tracing. Existing tracing provides some coverage (tracing::info! calls in chat/mod.rs:236, 295, 306, etc.) but no correlation ID tracking for request-to-completion flow.

- [x] `AUDIT-STREAM-045` Core chat send path bypasses hardened IPC wrapper and directly calls `lib/tauri-mock` invoke.
  - Risk: missing standardized timeout/retry/rate-limit handling on the most critical command (`chat_send_message`) can leave UI in loading state if command does not return promptly.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:12`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:1934`, `apps/desktop/src/utils/ipc.ts:273`, `apps/desktop/src/utils/ipc.ts:293`
  - Fix: Changed import to use `ipcInvoke` from hardened IPC wrapper

- [x] `AUDIT-APPROVAL-046` MCP/tool confirmation response path is wired to the wrong backend command in the active approval UI.
  - Symptom match: UI can show approval state (“Allowed”) while tool execution remains blocked waiting for tool-confirmation channel resolution.
  - Root mismatch:
    - Pending MCP confirmations are emitted via `tool:confirmation_required` and must be answered via `respond_tool_confirmation`.
    - Active chat approval modal resolves all approvals through `agent_resolve_approval` instead.
  - Evidence: `apps/desktop/src/hooks/useApprovalActions.ts:18`, `apps/desktop/src/components/UnifiedAgenticChat/ApprovalModal.tsx:25`, `apps/desktop/src/components/UnifiedAgenticChat/ApprovalModal.tsx:123`, `apps/desktop/src/components/UnifiedAgenticChat/ApprovalModal.tsx:142`, `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs:179`, `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs:300`, `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs:325`

- [x] `AUDIT-APPROVAL-047` Dead/duplicated tool-confirmation event contracts exist in frontend.
  - `UnifiedAgenticChat` listens for `tool-confirmation-request`, but backend emits `tool:confirmation_required`.
  - `ToolConfirmationDialog` is implemented for `tool:confirmation_required` but is not mounted anywhere in app composition.
  - Risk: split confirmation UX with drifted contracts; fixes in one path do not affect the path users actually hit.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:1110`, `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs:325`, `apps/desktop/src/components/Execution/ToolConfirmationDialog.tsx:85`

- [x] `AUDIT-TOOLS-048` Chat tool schema source bypasses registry and uses static built-ins, creating schema/runtime drift.
  - Chat request building currently calls `build_chat_tools(None, Some(&mcp_state))`, which skips the live `ToolRegistry`.
  - Built-in `file_list` schema marks `path` as required, while runtime executor supports missing path fallback (project folder/current dir).
  - Risk: model sees stricter/stale tool contracts, increasing wrong tool selection (including MCP fallback paths with extra approval friction).
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:1994`, `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs:241`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:4985`

- [x] `AUDIT-APPROVAL-049` Risk-level normalization drops unsupported values into UI model without canonical mapping.
  - `tool:confirmation_required` payload risk is cast to `'low' | 'medium' | 'high'`; backend can emit `Critical`.
  - Risk: `critical` falls into UI default paths (styling/handling ambiguity), weakening high-risk UX clarity.
  - Evidence: `apps/desktop/src/hooks/useAgenticEvents.ts:642`, `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs:163`, `apps/desktop/src/components/UnifiedAgenticChat/ApprovalModal.tsx:171`

- [x] `AUDIT-MCP-050` Folder selection and MCP filesystem server root are not coupled, producing false-positive “allowed” UX.
  - Folder selector syncs `project_context_set_folder`; backend adds folder to in-memory `allowed_directories`.
  - MCP filesystem server config still defaults to `@modelcontextprotocol/server-filesystem .` and is not reconfigured/restarted on folder change.
  - `mcp__filesystem__list_allowed_directories` in chat uses local fallback from project/settings (not server introspection), so UI can show allowed paths while actual MCP filesystem server scope differs.
  - Risk: preview/status says access is allowed, but subsequent MCP list/read operations can still fail or appear stuck.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/FolderSelector.tsx:64`, `apps/desktop/src/components/UnifiedAgenticChat/FolderSelector.tsx:90`, `apps/desktop/src-tauri/src/sys/commands/project_context.rs:162`, `apps/desktop/src-tauri/src/sys/commands/mcp.rs:844`, `apps/desktop/src-tauri/mcp/default_servers.json`, `apps/desktop/src-tauri/src/core/mcp/config.rs:126`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1102`

- [x] `AUDIT-CONFIG-051` Project-folder permission widening is memory-only in `project_context_set_folder`.
  - The selected folder is appended to `SettingsState.allowed_directories` but no persistence path (`settings_save`) is invoked there.
  - Risk: folder access behavior changes across app restarts and can look nondeterministic to users.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/project_context.rs:162`, `apps/desktop/src-tauri/src/sys/commands/project_context.rs:168`, `apps/desktop/src-tauri/src/sys/commands/settings.rs:179`

- [x] `AUDIT-UI-052` Tool-call card controls emit unhandled frontend events instead of invoking backend control commands.
  - `ToolCallCard` emits `resume_agent` / `cancel_action` events through `emit(...)`, but there is no corresponding listener bridge in frontend, and no direct invoke to tool-cancel/confirmation commands.
  - Risk: approve/deny/cancel controls on tool cards appear interactive but do not affect real execution state, reinforcing “stuck running” perception.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/ToolCallCard.tsx:62`, `apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/ToolCallCard.tsx:68`, `apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/ToolCallCard.tsx:72`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:4299`, `apps/desktop/src/stores/chat/toolStore.ts:748`

- [x] `AUDIT-UI-053` Tool-stream cleanup policy can hide completed/error stream state before message metadata is reconciled.
  - `agi:tool_stream` entries are auto-removed ~5s after terminal states.
  - Message bubble status falls back to message metadata when no live stream is found; metadata may still be `running` from initial tool-call event.
  - Risk: cards regress to stale "running/calling" after cleanup, even if tool finished or failed.
  - Evidence: `apps/desktop/src/hooks/useAgenticEvents.ts:922`, `apps/desktop/src/hooks/useAgenticEvents.ts:995`, `apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/MessageBubble.tsx:233`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:1171`
  - Fix: Updated cleanup policy to also update top-level message metadata status and state fields when reconciling artifacts, ensuring fallback works correctly in MessageBubble.

- [x] `AUDIT-TERMINAL-054` Chat terminal tool defaults to hardcoded shell (`bash` on macOS/Linux) instead of user/system default shell.
  - Risk: command behavior diverges from user terminal environment (`zsh` profiles, aliases, PATH), causing "works in terminal, fails in app" reports.
  - Evidence: `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1587`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1595`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1639`
  - Fix: Tool executor now uses get_default_shell() instead of hardcoded bash.

- [x] `AUDIT-TERMINAL-055` Tool schema does not expose terminal executor controls (`timeout_ms`, `shell`) that backend supports.
  - Chat tool definition exposes only `command` + `cwd`, while executor reads `shell` and `timeout_ms`.
  - Risk: model cannot adapt long-running commands (compile/build) with explicit timeout/shell control, increasing avoidable timeout failures.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs:344`, `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs:359`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1592`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1600`
  - Fix: Tool schema now includes `shell` and `timeout_ms` parameters.

- [x] `AUDIT-STREAM-056` Tool stream IDs are inconsistent across start/progress/result phases for several tools.
  - `execute_tool_call` emits started/completed/error with `action_id` (derived from LLM `tool_call.id`), but `terminal_execute`, `search_web`, and `browser_navigate` emit progress/output chunks under ad-hoc IDs (`terminal-*`, `search-*`, `browser-*`).
  - Risk: duplicate/orphan stream cards, missing progress on the actual tool card, and status parity drift between timeline, active streams, and chat artifacts.
  - Evidence: `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1090`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1574`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:2639`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:2790`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:5917`

- [x] `AUDIT-EVENT-057` Agent event naming is split between legacy and active contracts in frontend listeners.
  - `useAgenticEvents` listens to `agent:status_update` and `agent:action`, while current backend paths emit `agent:status:update` and `agent:action_update`.
  - Risk: part of agent status/action UI remains stale depending on which store/hook path is mounted, causing inconsistent action-streaming behavior.
  - Evidence: `apps/desktop/src/hooks/useAgenticEvents.ts:542`, `apps/desktop/src/hooks/useAgenticEvents.ts:576`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1500`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:5855`
  - Fix: Updated listener from `agent:action` to `agent:action_update` to match backend emission.

- [x] `AUDIT-APPROVAL-058` Approval request `type` contract is drifted (`tool_execution` not part of frontend union).
  - Backend emits `approval:request` with `type: "tool_execution"`, but frontend `ApprovalRequest.type` only allows `file_delete | terminal_command | api_call | data_modification | mcp_tool`.
  - Risk: approval cards can render with unmapped semantics, and downstream handling/analytics by type is unreliable.
  - Evidence: `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1382`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1385`, `apps/desktop/src/stores/chat/toolStore.ts:144`, `apps/desktop/src/hooks/useAgenticEvents.ts:678`

- [x] `AUDIT-STREAM-059` Chat send flow has no global stream watchdog and intentionally skips `finally` cleanup.
  - Loading state relies on receiving `chat:stream-end`/`chat:stream-error`; if either event is dropped, `isLoading` and streaming flags can persist indefinitely.
  - Risk: infinite spinner / “Thinking…” leak even when backend invocation path has stalled or event delivery is interrupted.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:2048`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:2052`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:850`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:913`

- [x] `AUDIT-CANCEL-060` Tool cancel path is cooperative-only and can miss active subprocess termination for long-running tools.
  - `cancel_tool_execution` marks a tool ID as cancelled and emits a cancel event; cancellation is observed only by polling in `execute_chat_tool_with_timeout`.
  - For tool implementations that block internally on child process wait, immediate termination is not guaranteed, and ID drift (`AUDIT-STREAM-056`) further weakens cancel/stream parity.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:4299`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:4308`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:296`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1735`
  - Fix: Added non-consuming `is_tool_cancelled()` check for frequent polling, spawn tool execution as tokio task with abort handle, and abort the task on cancellation/timeout to ensure immediate termination of long-running tools.

- [ ] `AUDIT-STREAM-061` Chat input abort controller is local-only and does not cancel the underlying send/invoke pipeline.
  - `sendAbortControllerRef` is created and checked in `ChatInputArea`, but the signal is never passed to `onSend`/backend invocation, so aborts only gate local UI branches.
  - Risk: user-initiated quick retries/new chat can still leave in-flight send work running server-side, causing delayed events and status desync.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx:120`, `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx:538`, `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx:542`, `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx:623`
  - Status: PARTIALLY FIXED - Code now calls `chat_stop_generation` when aborting (line 550), but abort signal is still not passed to backend invoke call. Backend would need to support abort signals for full fix.

- [ ] `AUDIT-QUEUE-062` Pending-message queue is global and message enqueue path does not bind queued messages to the active conversation.
  - Queue-mode enqueue sends `conversation_id: null`; backend queue is a global static vector and `chat:pending-messages-ready` emits all queued messages at stream end.
  - Risk: queued text can be auto-sent into the wrong conversation/session after context switches, creating cross-chat leakage.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx:518`, `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx:521`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:64`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:3481`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:3503`
  - Status: NOT FIXED - Frontend still passes `conversation_id: null` when queueing messages (ChatInputArea.tsx:524). Requires code fix to pass active conversation ID.

- [x] `AUDIT-CAPTURE-063` Conversation association for screen capture is wired through a non-existent store method in chat input.
  - `ChatInputArea` attempts `(useUnifiedChatStore.getState() as any).uuidToDbId?.(...)`; `uuidToDbId` is exported utility, not a state method.
  - Risk: captures from input toolbar/auto-capture are often stored without conversation linkage, breaking per-chat capture history/traceability.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx:483`, `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx:900`, `apps/desktop/src/stores/unifiedChatStore.ts:81`, `apps/desktop/src/stores/chat/chatStore.ts:164`

- [x] `AUDIT-ENV-064` Tauri-runtime detection is inconsistent across chat/capture paths.
  - Core chat component gates native listeners/commands with strict `__TAURI_INTERNALS__` checks, while screen capture additionally accepts `window.__TAURI__`.
  - Risk: mixed runtime behavior where capture appears native-capable but chat event wiring follows web/mock branch assumptions under some embed/bootstrap conditions.
  - Evidence: `apps/desktop/src/lib/tauri-mock.ts:1`, `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:58`, `apps/desktop/src/components/ScreenCapture/ScreenCaptureButton.tsx:50`, `apps/desktop/src/components/ScreenCapture/ScreenCaptureButton.tsx:51`

- [x] `AUDIT-TERMINAL-065` One-shot terminal command shell routing does not honor requested shell semantics on non-mac platforms.
  - `execute_terminal_command` groups `bash|sh|zsh` and resolves to `/bin/bash` off macOS, so explicitly requesting `zsh`/`sh` does not run the intended shell.
  - Risk: behavior drift from user environment and inconsistent command execution between interactive terminal sessions and one-shot tool/command paths.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/terminal.rs:109`, `apps/desktop/src-tauri/src/sys/commands/terminal.rs:111`, `apps/desktop/src-tauri/src/sys/commands/terminal.rs:113`
  - Fix: Implemented explicit shell routing for bash, zsh, fish, sh, wsl, gitbash, powershell/pwsh in terminal.rs:112-175.

- [x] `AUDIT-TERMINAL-066` One-shot terminal command timeout is hard-coded to 60s with no caller override.
  - Long-running build/test commands are forcibly killed after 60 seconds regardless of user intent or model strategy.
  - Risk: avoidable failures for legitimate long tasks, especially when chat/tool orchestration expects adaptive timeout behavior.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/terminal.rs:227`
  - Fix: Added timeout_ms parameter to execute_terminal_command (terminal.rs:47-48).

- [x] `AUDIT-TOOLS-067` `file_list` is exposed to the model but not registered in the production `ToolRegistry`.
  - Chat tool definitions include `file_list`, and the chat execution path creates a fresh `ToolRegistry` with `register_all_tools()` on each invoke.
  - `ToolExecutor` resolves the tool from registry before dispatching to the `file_list` implementation branch; when `file_list` is absent from registry this returns `Tool not found: file_list`.
  - Existing unit tests hide this by injecting `file_list` via test-only helper registry setup.
  - Risk: model can call `file_list` and get backend failure/non-parity behavior while UI still shows an active file tool card.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs:241`, `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs:1084`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1443`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:4978`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:6133`, `apps/desktop/src-tauri/src/core/agi/tools/mod.rs:86`

- [x] `AUDIT-TERMINAL-068` `terminal_execute` tool shell routing can select `powershell.exe` on non-Windows hosts.
  - Tool executor defaults to `bash` on non-Windows, but any non-matched `shell` value falls through to `_ => powershell.exe`.
  - This creates invalid shell selection on macOS/Linux for values like `zsh`/`sh`, causing spurious command failures.
  - Risk: tool-run terminal behavior diverges from user environment and appears flaky when shell is specified or inferred outside the small allowlist.
  - Evidence: `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1587`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1592`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1635`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:1644`
  - Fix: Updated tool_executor.rs to use system default shell for unknown shells instead of defaulting to powershell (lines 1656-1701).

- [x] `AUDIT-BROWSER-069` Chat advertises browser tools that backend explicitly marks as unimplemented.
  - Tool schemas exposed to the model include `browser_wait_for_navigation`, `browser_get_dom_snapshot`, `browser_execute_async_js`, `browser_get_element_state`, and `browser_wait_for_interactive`.
  - The browser tool executor hard-returns `Err(...not implemented...)` for each of those tool IDs.
  - Risk: model repeatedly selects tools that are guaranteed to fail, degrading tool-calling reliability and causing noisy retry loops/status churn.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs:654`, `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs:693`, `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs:712`, `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs:871`, `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs:890`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:184`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:187`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:190`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:193`, `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:196`
  - Fix: All four browser tools are now implemented in tool_executor.rs (lines 178-337).

- [x] `AUDIT-BROWSER-070` Browser store command contract is tab-aware, but backend command surface is active-tab-only and missing `browser_get_content`.
  - Frontend browser store sends `{ tabId, ... }` to commands like `browser_navigate`, `browser_click`, `browser_type`, `browser_screenshot`, and `browser_evaluate`, and also calls `browser_get_content`.
  - Backend command signatures for those commands accept no `tabId` and operate on `get_active_client()`; `browser_get_content` is not implemented/registered.
  - Risk: multi-tab actions can target the wrong tab, and page-content fetch path fails at runtime.
  - Evidence: `apps/desktop/src/stores/browserStore.ts:350`, `apps/desktop/src/stores/browserStore.ts:374`, `apps/desktop/src/stores/browserStore.ts:383`, `apps/desktop/src/stores/browserStore.ts:392`, `apps/desktop/src/stores/browserStore.ts:402`, `apps/desktop/src/stores/browserStore.ts:412`, `apps/desktop/src-tauri/src/sys/commands/browser.rs:298`, `apps/desktop/src-tauri/src/sys/commands/browser.rs:351`, `apps/desktop/src-tauri/src/sys/commands/browser.rs:362`, `apps/desktop/src-tauri/src/sys/commands/browser.rs:443`, `apps/desktop/src-tauri/src/sys/commands/browser.rs:464`
  - Fix: All browser commands now accept `tab_id: Option<String>` parameter and use `get_client_for_tab()` for tab-aware operations. `browser_get_content` is registered in lib.rs.

- [x] `AUDIT-BROWSER-071` Several browser commands return placeholder success payloads, creating false-positive "working" states.
  - `browser_get_screenshot_stream` returns a static `"stream_url"` string, while frontend treats it as screenshot data every 500ms.
  - Multiple semantic/introspection commands return canned values (`"<html></html>"`, `"#semantic-element"`, `Value::Null`, empty arrays) instead of real browser state.
  - Risk: UI appears functional but presents synthetic data, which undermines trust in tool output and action-stream parity.
  - Evidence: `apps/desktop/src/stores/browserStore.ts:532`, `apps/desktop/src-tauri/src/sys/commands/browser.rs:637`, `apps/desktop/src-tauri/src/sys/commands/browser.rs:652`, `apps/desktop/src-tauri/src/sys/commands/browser.rs:675`, `apps/desktop/src-tauri/src/sys/commands/browser.rs:708`, `apps/desktop/src-tauri/src/sys/commands/browser.rs:728`
  - Fix: Updated `browser_get_screenshot_stream` to accept `tab_id` parameter and return actual base64-encoded screenshot data (browser.rs:1028-1038).

- [x] `AUDIT-STREAM-072` Follow-up tool calls are not normalized for missing IDs, unlike first-pass streamed tool calls.
  - Initial streamed tool calls sanitize blank IDs (`stream_tool_call_{idx}`), but follow-up `outcome.response.tool_calls` are emitted/executed without equivalent normalization.
  - Empty/blank follow-up `tool_call_id` values propagate into `chat:tool-executing`/`chat:tool-result`, timeout tracking, and cancellation bookkeeping.
  - Risk: artifact/status updates can collide on empty IDs, timeout maps can overwrite entries, and tool cards may remain stuck in running state.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:2810`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:3160`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:3219`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:3235`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:3277`, `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:207`
  - Fix: Added normalization for follow-up tool call IDs in both streaming loop (line ~3171) and non-streaming path (line ~3902)

- [x] `AUDIT-MEMORY-073` `useMemory.deleteByTopic` invokes the wrong backend command with incompatible arguments.
  - Frontend calls `memory_forget` with `{ category, topic }`, but backend `memory_forget` expects `memory_id: i64`.
  - Backend provides `memory_forget_topic(category, topic)` for the category/topic use case.
  - Risk: delete-by-topic UX fails at runtime despite existing backend support.
  - Evidence: `apps/desktop/src/hooks/useMemory.ts:288`, `apps/desktop/src-tauri/src/sys/commands/memory.rs:95`, `apps/desktop/src-tauri/src/sys/commands/memory.rs:101`

- [x] `AUDIT-MEMORY-074` `useMemory.listCategories` calls a non-existent command (`memory_list_categories`).
  - Frontend tries to invoke `memory_list_categories`, but no such Tauri command exists in memory command module.
  - Risk: category listing always errors and can poison memory settings/state flows that depend on category discovery.
  - Evidence: `apps/desktop/src/hooks/useMemory.ts:321`, `apps/desktop/src-tauri/src/sys/commands/memory.rs:36`

- [x] `AUDIT-COMMAND-075` Settings panel invokes stale Ollama command name (`llm_get_ollama_models`).
  - Frontend requests `llm_get_ollama_models`, while backend exposes `llm_list_ollama_models` (and `ollama_list_models`).
  - Risk: local model discovery in settings silently fails, making Ollama capability appear broken.
  - Evidence: `apps/desktop/src/components/Settings/SettingsPanel.tsx:111`, `apps/desktop/src-tauri/src/sys/commands/llm.rs:893`, `apps/desktop/src-tauri/src/lib.rs:1172`

- [x] `AUDIT-COMMAND-076` PDF viewer uses non-existent binary-read command name (`file_read_binary_base64`).
  - Frontend PDF preview requests `file_read_binary_base64`, but backend exposes `file_read_binary`.
  - Risk: binary file preview path fails at runtime despite a valid backend capability existing under a different command name.
  - Evidence: `apps/desktop/src/components/FileUpload/PDFViewer.tsx:79`, `apps/desktop/src-tauri/src/sys/commands/file_ops.rs:1338`

- [x] `AUDIT-EMAIL-077` `useEmail` is wired to legacy command names that do not exist in backend.
  - Hook invokes `email_list_messages`, `email_get_message`, `email_send_message`, and `email_search`.
  - Current backend email command surface exposes `email_fetch_inbox` and `email_send` (plus account/folder operations), not those legacy names.
  - Risk: core email workspace actions fail at runtime even though backend has related capabilities under different APIs.
  - Evidence: `apps/desktop/src/hooks/useEmail.ts:169`, `apps/desktop/src/hooks/useEmail.ts:192`, `apps/desktop/src/hooks/useEmail.ts:214`, `apps/desktop/src/hooks/useEmail.ts:245`, `apps/desktop/src-tauri/src/sys/commands/email.rs:532`, `apps/desktop/src-tauri/src/sys/commands/email.rs:650`

- [x] `AUDIT-CALENDAR-078` `useCalendar` invokes partially missing command names (`calendar_get_event`, `calendar_sync`).
  - Hook includes `calendar_get_event` and `calendar_sync` calls, but backend calendar module does not expose those commands.
  - Risk: calendar detail-fetch/sync flows fail while adjacent operations (list/create/update/delete) appear operational.
  - Evidence: `apps/desktop/src/hooks/useCalendar.ts:115`, `apps/desktop/src/hooks/useCalendar.ts:219`, `apps/desktop/src-tauri/src/sys/commands/calendar.rs:173`, `apps/desktop/src-tauri/src/sys/commands/calendar.rs:193`, `apps/desktop/src-tauri/src/sys/commands/calendar.rs:222`, `apps/desktop/src-tauri/src/sys/commands/calendar.rs:252`

- [x] `AUDIT-BGTASK-079` Background task hooks/API invoke command families that do not match backend (`background_task*` / `background_tasks*` vs `bg_*`).
  - Frontend hooks and API modules call `background_task_list/status/cancel` and `background_tasks_*` commands.
  - Backend currently exposes `bg_submit_task`, `bg_cancel_task`, `bg_pause_task`, `bg_resume_task`, `bg_get_task_status`, `bg_list_tasks`, `bg_get_task_stats`.
  - Risk: background-task UX appears wired but cannot execute against current desktop command surface.
  - Evidence: `apps/desktop/src/hooks/useBackgroundTasks.ts:189`, `apps/desktop/src/hooks/useBackgroundTasks.ts:231`, `apps/desktop/src/hooks/useBackgroundTasks.ts:271`, `apps/desktop/src/api/backgroundTasks.ts:38`, `apps/desktop/src/api/backgroundTasks.ts:63`, `apps/desktop/src-tauri/src/sys/commands/background_tasks.rs:25`, `apps/desktop/src-tauri/src/sys/commands/background_tasks.rs:92`

- [x] `AUDIT-TIMEOUT-080` Timeout UI hook calls missing `agi_*` timeout-control commands.
  - `useTimeout` invokes `agi_get_timeout_status`, `agi_extend_timeout`, `agi_pause_task`, `agi_resume_task`, and `agi_abort_task`.
  - No matching command functions exist in current Tauri command modules.
  - Risk: timeout/abort controls in execution UI do not affect backend tasks, leading to stuck or misleading task state.
  - Evidence: `apps/desktop/src/hooks/useTimeout.ts:96`, `apps/desktop/src/hooks/useTimeout.ts:129`, `apps/desktop/src/hooks/useTimeout.ts:168`, `apps/desktop/src/hooks/useTimeout.ts:202`, `apps/desktop/src/hooks/useTimeout.ts:236`, `apps/desktop/src-tauri/src/sys/commands/background_tasks.rs:25`

- [x] `AUDIT-COMMAND-081` Google Batch frontend API is wired to non-existent Tauri IPC commands.
  - Frontend invokes `google_batch_create/get/list/cancel/delete/get_results/create_embeddings/get_embeddings/create_images/calculate_cost/create_jsonl`.
  - No corresponding Rust command functions or registrations exist in `src-tauri`.
  - Risk: every Google Batch operation path fails at runtime with unknown command errors.
  - Evidence: `apps/desktop/src/api/googleBatch.ts:101`, `apps/desktop/src/api/googleBatch.ts:117`, `apps/desktop/src/api/googleBatch.ts:135`, `apps/desktop/src/api/googleBatch.ts:149`, `apps/desktop/src/api/googleBatch.ts:158`, `apps/desktop/src/api/googleBatch.ts:173`, `apps/desktop/src/api/googleBatch.ts:253`, `apps/desktop/src/api/googleBatch.ts:269`, `apps/desktop/src/api/googleBatch.ts:289`, `apps/desktop/src/api/googleBatch.ts:322`, `apps/desktop/src/api/googleBatch.ts:337`
  - Fix: All google_batch commands implemented in `google_batch.rs` and registered in `mod.rs`

- [x] `AUDIT-SIDECAR-082` Preview sidecar binds to a stale artifact snapshot instead of live store/message updates.
  - Artifact cards open the sidecar with `onOpenSidecar('preview', { artifact: art })`, passing a point-in-time object.
  - Sidecar state stores this payload as `sidecar.context` and renders it directly; it does not resolve by artifact/message ID on subsequent updates.
  - Risk: right-panel preview can remain on stale `running`/"Waiting for tool output..." state even when backend tool-result events updated the chat message artifact.
  - Evidence: `apps/desktop/src/components/UnifiedAgenticChat/ChatStream.tsx:161`, `apps/desktop/src/stores/ui.ts:769`, `apps/desktop/src/stores/ui.ts:775`, `apps/desktop/src/components/UnifiedAgenticChat/AppLayout.tsx:194`, `apps/desktop/src/components/UnifiedAgenticChat/DynamicSidecar.tsx:244`
  - Fix: Changed ChatStream to pass artifactId and messageId instead of static artifact object, and DynamicSidecar now subscribes to store for live artifact updates.

- [x] `AUDIT-ROI-083` ROI dashboard store calls legacy analytics command names that are not exported in backend.
  - ROI store invokes `get_today_stats`, `get_week_stats`, `get_month_stats`, `get_all_time_stats`, `get_recent_activity`, `export_roi_report`, and comparison commands like `get_manual_vs_automated_comparison`.
  - Backend analytics/metrics command surface now exports matching command names (`get_today_stats`, `get_week_stats`, `get_month_stats`, `get_all_time_stats`, `get_manual_vs_automated_comparison`, `get_period_comparison`, `get_benchmark_comparison`, `get_recent_activity`, `export_roi_report`).
  - Fix: Commands are defined in metrics.rs and registered in lib.rs lines 1864-1872.
  - Evidence: `apps/desktop/src/components/ROIDashboard/roiStore.ts:115`, `apps/desktop/src/components/ROIDashboard/roiStore.ts:128`, `apps/desktop/src/components/ROIDashboard/roiStore.ts:159`, `apps/desktop/src/components/ROIDashboard/roiStore.ts:171`, `apps/desktop/src/components/ROIDashboard/roiStore.ts:270`, `apps/desktop/src/components/ROIDashboard/roiStore.ts:297`, `apps/desktop/src/components/ROIDashboard/roiStore.ts:311`, `apps/desktop/src-tauri/src/sys/commands/metrics.rs:332`, `apps/desktop/src-tauri/src/sys/commands/metrics.rs:341`, `apps/desktop/src-tauri/src/sys/commands/metrics.rs:358`, `apps/desktop/src-tauri/src/sys/commands/metrics.rs:375`

- [x] `AUDIT-MARKETPLACE-084` Marketplace frontend invokes unregistered command names for key workflow operations.
  - Store calls `get_published_workflows`, `get_workflow_by_id`, `get_workflow_reviews`, `get_workflow_analytics`, `get_workflow_share_url`, `get_workflow_embed_code`, and `publish_workflow`.
  - Backend marketplace command module now exports all required commands including aliases (`get_published_workflows`, `get_workflow_by_id`, `get_workflow_reviews`, `get_workflow_analytics`, `get_workflow_share_url`, `get_workflow_embed_code`, `publish_workflow`).
  - Fix: Commands are defined in marketplace.rs and registered in lib.rs lines 1730-1765.
  - Evidence: `apps/desktop/src/components/Marketplace/marketplaceStore.ts:150`, `apps/desktop/src/components/Marketplace/marketplaceStore.ts:195`, `apps/desktop/src/components/Marketplace/marketplaceStore.ts:205`, `apps/desktop/src/components/Marketplace/marketplaceStore.ts:223`, `apps/desktop/src/components/Marketplace/marketplaceStore.ts:332`, `apps/desktop/src/components/Marketplace/marketplaceStore.ts:463`, `apps/desktop/src/components/Marketplace/marketplaceStore.ts:483`, `apps/desktop/src-tauri/src/sys/commands/marketplace.rs:464`, `apps/desktop/src-tauri/src/sys/commands/marketplace.rs:488`, `apps/desktop/src-tauri/src/sys/commands/marketplace.rs:498`, `apps/desktop/src-tauri/src/sys/commands/marketplace.rs:550`

- [x] `AUDIT-KNOWLEDGE-085` `useMemory` includes `knowledge_add` / `knowledge_query` IPC calls with no backend command implementation.
  - Hook exposes knowledge-base methods by invoking `knowledge_add` and `knowledge_query`.
  - No corresponding Tauri commands are present in `src-tauri`.
  - Risk: the hook’s public API advertises functionality that always fails at runtime if called.
  - Evidence: `apps/desktop/src/hooks/useMemory.ts:390`, `apps/desktop/src/hooks/useMemory.ts:419`, `apps/desktop/src/hooks/useMemory.ts:609`, `apps/desktop/src/hooks/useMemory.ts:635`

- [x] `AUDIT-TIMEOUT-086` Timeout API module invokes non-existent timeout settings commands.
  - `api/timeout.ts` calls `timeout_get_config`, `timeout_set_config`, and `timeout_get_recommended`.
  - Backend has no matching command implementations; current timeout control paths are wired through different AGI/background-task command families.
  - Risk: timeout settings UI/API cannot affect runtime behavior and can mislead product expectations.
  - Evidence: `apps/desktop/src/api/timeout.ts:30`, `apps/desktop/src/api/timeout.ts:37`, `apps/desktop/src/api/timeout.ts:44`, `apps/desktop/src-tauri/src/sys/commands/background_tasks.rs:25`

- [x] `AUDIT-ANALYTICS-087` Optional trend charts silently degrade due missing `analytics_get_*_trend` commands.
  - `useAnalytics` invokes `analytics_get_time_saved_trend` and `analytics_get_cost_saved_trend` and swallows errors with `.catch(() => [])`.
  - No corresponding backend commands exist, so trend panels default to empty data with no explicit integration failure surfaced.
  - Risk: “working” analytics UI can mask broken command wiring and reduce operator trust in dashboard completeness.
  - Evidence: `apps/desktop/src/hooks/useAnalytics.ts:242`, `apps/desktop/src/hooks/useAnalytics.ts:243`, `apps/desktop/src-tauri/src/sys/commands/analytics.rs:363`

- [x] `AUDIT-MOCK-088` `tauri-mock` test behavior can hide real command wiring failures.
  - In non-Tauri test mode, unknown commands now throw errors instead of returning empty arrays, and all known commands are properly mocked.
  - Fix: Default case in invoke function throws error with message about unregistered commands. Added missing `get_user_workflow_rating` command to mock.
  - Risk: tests now fail with clear error messages when commands are not wired, exposing integration issues immediately.
  - Evidence: `apps/desktop/src/lib/tauri-mock.ts:193`, `apps/desktop/src/lib/tauri-mock.ts:195`

- [x] `AUDIT-CAPTURE-089` macOS capture commands ignore frontend-selected region/window arguments and re-enter interactive picker flow.
  - Frontend can collect a region/window selection and call `captureRegion(region, ...)` / `captureWindow(handle, ...)`.
  - macOS backend implementations for `capture_screen_region` and `capture_screen_window` call `screencapture -i ...` interactive modes and do not use provided `x,y,width,height` or `hwnd`.
  - Risk: users experience “Enter does nothing” or apparent no-op/double-step capture flows; window/region semantics diverge from UI expectations.
  - Evidence: `apps/desktop/src/components/ScreenCapture/ScreenCaptureButton.tsx:112`, `apps/desktop/src/components/ScreenCapture/ScreenCaptureButton.tsx:130`, `apps/desktop/src-tauri/src/sys/commands/capture.rs:197`, `apps/desktop/src-tauri/src/sys/commands/capture.rs:455`

- [x] `AUDIT-CAPTURE-090` macOS capture flow lacks panic-safe restoration when hiding the main window.
  - macOS capture handlers hide the main window before capture and restore it afterward, but restoration is not guarded by RAII/defer semantics.
  - Unlike non-macOS capture branches (which wrap backends in `catch_unwind`), macOS paths do not apply panic guards around capture actions.
  - Risk: panic/crash during capture can leave UI black/hidden and abort the app process, matching observed `SIGABRT` behavior from worker threads.
  - Evidence: `apps/desktop/src-tauri/src/sys/commands/capture.rs:108`, `apps/desktop/src-tauri/src/sys/commands/capture.rs:455`, `apps/desktop/src-tauri/src/sys/commands/capture.rs:645`, `/Users/siddhartha/Library/Logs/DiagnosticReports/agiworkforce-desktop-2026-02-09-164620.ips:45`

## 4) Manual QA checklist pending

- [ ] Ask: “which files are present in this folder?” with folder selected and confirm `file_list` completes.
- [ ] Ask: read a known local file (`file_read` / MCP filesystem read) and verify non-stuck completion.
- [ ] Start a tool call, then create new chat, confirm no leaked “Thinking…” or running badge.
- [ ] Validate sidecar “Waiting for tool output...” disappears on completion/error.
- [ ] Validate terminal session creation on macOS default shell.
- [ ] Validate browser tab switching via UI path using `browser_switch_tab`.
- Status: MANUAL QA - Cannot be fixed through code changes, requires manual testing.

## 5) Commit/push status

- [x] Committed in this pass (commit `00949e86`)
- [ ] Not pushed yet.
- [ ] Push after manual QA (section 4) is complete.

## 6) Notes for future compact cycles

- Never rely on chat memory alone.
- Treat this `TODO.md` and the codebase as canonical state.
- Add new findings immediately under the relevant section with file references.

## 7) Remaining Audit Coverage (Not Fully Completed Yet)

This section tracks what is still left to audit (investigation scope), separate from implementation fixes.

- [ ] Frontend -> Backend command parity (remaining surfaces)
  - [ ] Settings/account/billing/profile command coverage
  - [ ] Project/workflow/process/template command coverage
  - [ ] Artifacts/canvas/notifications/scheduler/research/intent/lsp/workspace command coverage
- [ ] Tool execution lifecycle parity by tool family
  - [ ] File + MCP tools (list/read/write/edit + approval + timeout/cancel + result wiring)
  - [ ] Terminal tools (session + one-shot + output event shape + cancellation behavior)
  - [ ] Browser tools (tab targeting, content retrieval, placeholder payloads, real execution parity)
  - [ ] Capture and voice end-to-end success/error/cancel path parity
- [ ] Streaming/status action parity audit
  - [ ] Verify every frontend listener event is actually emitted by backend (name + payload contract)
  - [ ] Verify tool cards always transition `queued -> running -> success/error` (inline + sidecar)
  - [ ] Verify new chat / stop fully aborts in-flight work and prevents late-event UI mutation
- [ ] Runtime observability audit
  - [ ] Correlation IDs for `chat_send_message`, tool execution, `mcp_call_tool`, terminal execution
  - [ ] Start/end/error/timeout logs verified in desktop runtime logs
- [ ] Permissions and approval flow audit
  - [ ] Folder selection -> MCP filesystem server scope propagation
  - [ ] Approval routing consistency (`tool confirmation` vs `agent approval`) and risk-level mapping
- [ ] External baseline parity audit
  - [ ] Compare filesystem/fetch behavior against `modelcontextprotocol/servers`
  - [ ] Compare terminal/filesystem behavior against `DesktopCommanderMCP` expectations
- [ ] E2E verification matrix completion
  - [ ] For each tool/command: success path + controlled error path + timeout path + cancel path
  - [ ] UI guarantees: no infinite spinner, no stuck "Waiting for tool output...", no orphan running badges
- Status: MANUAL AUDIT - Cannot be fixed through code changes, requires manual investigation/testing.
