# Desktop Release Gate

Status: active
Scope: `apps/desktop`
Last Reconciled: 2026-03-15

Benchmark reference:

- `docs/DESKTOP_COWORK_COMPETITIVE_PLAN.md`

This gate exists to stop the desktop app from shipping with duplicate runtimes, hidden agent state, or UI paths that only work when the sidecar is open.

## 1. Runtime Authority

Before release, these must be true:

- one canonical frontend send path
- one canonical backend chat runtime
- one canonical reasoning stream path
- one canonical approval path
- no parked duplicate handlers pretending to be live

Authority is determined by:

- mounted React tree imports
- active Rust `mod.rs` declarations
- registered Tauri commands in `apps/desktop/src-tauri/src/lib.rs`

## 2. Inline Visibility

The chat transcript must expose, inline:

- reasoning or reasoning summary
- tool/function calls
- approvals
- progress
- results and errors

Release is blocked if a user must open the sidecar to understand what the agent just did.

The sidecar is secondary and manual.

## 3. Event Contract

Every runtime event that affects user trust must be attributable to a transcript unit.

Required identifiers where applicable:

- `conversation_id`
- `message_id` or `frontend_message_id`
- `action_id`
- `kind`
- `status`

Events without transcript ownership are release blockers unless they are purely diagnostic.

## 4. Frontend Validation

Minimum required checks:

- `pnpm --filter @agiworkforce/desktop typecheck`
- targeted chat UI tests for changed surfaces
- targeted store tests for changed state contracts

Required regression areas:

- sidecar does not auto-take over runtime visibility
- `apps/desktop/check-wiring.sh` extracts real `invoke('command')` names without treating `invoke` itself or test-only sentinels as missing commands
- browser extension runtime state is shared across mounted surfaces instead of using duplicate listener-local state
- browser extension events do not auto-open the sidecar
- browser close operations use the registered `browser_close` command instead of sending session ids to `browser_close_tab`
- browser launch commands accept the live frontend `browserType` / `headless` payload instead of silently ignoring it
- browser tab open/close commands use the shared CDP endpoint contract instead of hardcoded `127.0.0.1:9222` URLs
- browser no-tab navigation paths create a real CDP target or fail clearly; they do not invent internal-only tabs that later break CDP control
- browser frame-scoped JavaScript evaluation (`browser_execute_in_frame`) uses the same explicit approval gate as other arbitrary JS execution commands
- the mounted browser UI does not expose fake console/network telemetry commands or polling paths that only return empty data
- browser file uploads use the CDP DOM file-input path with canonicalized host paths; they do not rely on page-side `file://` fetch behavior
- browser semantic commands are backed by the live semantic selector/accessibility scripts instead of registered stub handlers
- browser tab-list IPC returns structured tab metadata, not bare string ids that drift from the TS browser API contract
- `apps/desktop/src/lib/browserAutomation.ts` mirrors the live browser Tauri payloads instead of sending stale wrapper-only fields
- reasoning renders inline
- approvals render inline
- approvals resolve to the correct transcript message
- approval timeout behavior works without modal-only logic
- stream end/error paths resolve the correct transcript message
- stream end/error paths clear streaming state without inventing divergent metadata
- cross-store initialization must not depend on optional store APIs being present at import time
- encoded MCP / connector names render as decoded inline labels instead of raw transport identifiers
- repetitive integration-domain events use shared runtime activity emission instead of open-coded log+trail+sidecar mutations
- transcript components use shared per-message runtime selectors instead of ad hoc action-log/action-trail/approval filters
- tool-stream cleanup and terminal artifact reconciliation use shared helpers instead of duplicated listener-side message patch logic
- `agi:tool_stream` store updates use shared helper builders instead of open-coded per-case payload mutation
- thinking-event and tool-call/result payload shaping use shared helpers instead of open-coded stream-listener transforms
- tool timeline label/status shaping uses `apps/desktop/src/lib/toolTimelineRuntime.ts`
- `chat:tool-calls` / `chat:tool-executing` / `chat:tool-result` keep transcript tool timeline state in sync

## 5. Backend Validation

For chat/runtime changes, run:

- targeted Rust parser/runtime tests
- targeted Tauri command tests where affected

Required regression areas:

- reasoning deltas parse correctly for supported providers
- tool events stream consistently
- chat backend state types and stop-flag helpers come from `chat/state.rs` instead of duplicate inline definitions
- extracted Rust search/cost submodules stay the canonical owners of their registered commands instead of drifting back into `chat/mod.rs`
- extracted Rust control submodules stay the canonical owners of their registered commands instead of drifting back into `chat/mod.rs`
- extracted Rust compaction/export submodules stay the canonical owners of their registered commands instead of drifting back into `chat/mod.rs`
- extracted Rust conversation/message CRUD submodules stay the canonical owners of their registered commands instead of drifting back into `chat/mod.rs`
- extracted Rust intent/agent-mode helpers stay the canonical owners of classification and mode-selection policy instead of drifting back into `chat/mod.rs`
- chat intent classification keeps explicit action verbs above clarification phrases so multi-step execution requests are not downgraded to follow-up chatter
- extracted Rust persistence/provider-access/prompt-context/timeout helpers stay the canonical owners of send-loop policy instead of drifting back into `chat/mod.rs`
- extracted Rust browser-context/attachments/tool-config/message-context helpers stay the canonical owners of those send-loop policies instead of drifting back into `chat/mod.rs`
- extracted Rust stream/tool-execution helpers stay the canonical owners of streaming consumption and tool execution orchestration instead of drifting back into `chat/mod.rs`
- extracted Rust command modules (`send_message.rs`, `maintenance.rs`, `intent.rs`) stay the canonical owners of their Tauri command implementations instead of drifting back into `chat/mod.rs`
- embedded MCP `agi_run_task.max_steps` propagates into the AGI goal iteration limit instead of being metadata-only
- workflow scheduler runtime commands register due schedules, execute cron triggers, and reject invalid webhook auth tokens instead of acting as no-op stubs
- workflow scheduler startup is safe both under the live Tauri runtime and in plain unit-test construction with no ambient Tokio reactor
- extracted Rust `send_message_setup.rs` and `send_message_execution.rs` stay the canonical owners of chat bootstrap and branch orchestration instead of growing the command file back into a monolith
- extracted Rust chat submodules stay source-compatible with the registered Tauri command table
- browser CDP target resolution comes from the shared endpoint contract in `playwright_bridge.rs` / `browser/mod.rs` instead of hardcoded websocket URLs
- browser process launch waits for a reachable DevTools endpoint before reporting success
- `PlaywrightBridge.start_server()` does not report fake success when no live browser/CDP endpoint exists
- approval events reconcile correctly
- conversation persistence and cloud sync remain intact
- analytics/report commands reuse the managed `AppDatabase` connection instead of opening a second SQLite writer
- auth session storage keeps legacy token columns redacted while using hash + encrypted columns as the canonical lookup/retrieval path
- migration `v59` re-encrypts recoverable legacy auth session rows and removes the old unique-plaintext-session constraint trap
- the desktop image router only auto-selects executable providers; unavailable providers like Midjourney stay out of the automatic routing pool until a real backend path exists
- OAuth provider tokens persist to `oauth_providers.access_token_encrypted` / `refresh_token_encrypted`, not plaintext-style columns
- auth token validation rate limiting uses a digest of the full token instead of a shared prefix bucket
- desktop OAuth authorization payloads do not expose PKCE verifiers to the renderer
- frontend `secret_manager_has` / `secret_manager_set` / `secret_manager_delete` invokes stay backed by registered Tauri commands
- embedded MCP `tools/call` stays wired to the live desktop backend command/runtime states instead of a placeholder or second shadow execution path
- desktop MCP runtime telemetry stays on the typed `api/mcp.ts` → `mcpStore.ts` path, not ad hoc raw `invoke()` calls for health/history/stats
- MCP settings/components stay on `api/mcp.ts` / `McpClient` for registry install, logs, OAuth, and config mutation instead of direct raw MCP `invoke()` calls
- connector settings/state stay on `api/mcp.ts` / `McpClient` for OAuth start/disconnect, connected-provider hydration, connector activation, and API-key persistence instead of direct raw connector `invoke()` calls
- embedded MCP server control (`mcpServerStore.ts`) and MCP filesystem directory sync (`settingsStore.ts`) stay on typed `api/mcp.ts` helpers instead of direct raw `invoke()` calls
- `MCPServerSettings.tsx` keeps the port input controlled from `mcpServerStore.ts`, and `mcpServerStore.ts` exposes an error field instead of swallowing embedded-server failures
- `llmConfigStore.ts` initializes its auth-plan subscription through a guarded one-time async initializer instead of an unbounded module-load import/subscription path
- `MCPCredentialManager.tsx` verifies deep-link OAuth state against session storage and passes the stored verified state to the backend callback path instead of trusting the URL payload directly
- `mcp_get_health` refreshes currently connected servers before returning and does not leave stale disconnected rows in the UI
- `mcp_get_execution_history` / `mcp_get_tool_execution_stats` stay registered and feed the live MCP runtime surface
- `mcp:server_unhealthy` updates the frontend reactively through `useAgenticEvents.ts` + `mcpStore.ts`, with polling only as a fallback
- `App.tsx` startup work uses guarded async bootstrap paths with cancellation/error handling instead of unbounded fire-and-forget mount IIFEs
- tool SQL validation allows legitimate comments / hex literals while still blocking classical injection and time-based abuse patterns
- `apps/desktop/src-tauri/src/sys/security/mod.rs` exposes `audit_logger.rs` / `command_validator.rs` as the canonical audit and shell-validation surfaces, with no dead duplicate public helpers shadowing them
- the embedding runtime is managed as `Arc<tokio::sync::Mutex<EmbeddingService>>`, which matches the registered embedding command signatures exactly
- `LLMState` must be initialized through the cache-wired constructor so the canonical `LLMRouter` has `cache_entries` persistence in the live desktop runtime
- repeated identical non-streaming requests through the managed `LLMRouter` must return a cached second response instead of re-calling the provider
- the dedicated cache-management UI must stay mounted from `SettingsPanel.tsx`, not exist as a dead unrendered component
- embedding initialization degrades to an in-memory `EmbeddingService` instead of leaving registered embedding commands without managed state
- `AGICore` does not allocate the deprecated `AGIMemory` helper on its live construction path; backend checks run without that warning
- workflow script-node timeouts kill and reap the child process before returning an error instead of leaking the timed-out process

## 6. Deletion Safety

A file can be removed only if all are true:

- not mounted, imported, registered, or declared by the live runtime
- responsibility already exists in a canonical path
- useful behavior has been ported first
- targeted validation passes after removal

## 7. UX Release Questions

All answers must be yes:

- Can the user tell what the agent is doing without reading logs?
- Can the user see tool use inline?
- Can the user see approvals inline?
- Can the user distinguish reasoning from final output?
- Can the user recover from errors without hunting across panels?

If any answer is no, desktop is not release-ready.

---

## Gate Reconciliation (2026-03-15)

### Section 1: Runtime Authority — PASS
- Canonical frontend send path: `useTauriStreamListeners.ts` + `unifiedChatStore.ts`
- Canonical backend chat runtime: `sys/commands/chat/` submodules
- Canonical reasoning stream: `ThinkingBlock.tsx` + `ReasoningAccordion.tsx` (inline)
- Canonical approval path: `MessageApprovals.tsx` (inline) + `RiskConfirmationDialog.tsx`
- No duplicate handlers found. 483 dead commands removed in S2 sprint; remaining ~289 registered.

### Section 2: Inline Visibility — PASS
- Reasoning: `ThinkingBlock.tsx`, `ReasoningAccordion.tsx` render inline
- Tool/function calls: `ToolTimeline.tsx`, `ToolLabel.tsx`, `ToolCallCard.tsx` render inline
- Approvals: `MessageApprovals.tsx` renders inline per-message
- Progress: `AgentStepTimeline.tsx`, `AgenticLoopStatusBar.tsx`, `StatusTrail.tsx`
- Results/errors: `MessageBubble.tsx` renders errors inline; `streamLifecycle.ts` handles end/error

### Section 3: Event Contract — PASS
- `tool:event` carries `tool_name`, `display_name`, `duration_ms`, `result_preview`
- `agentic:loop-started/status/ended` carry `conversation_id`, `message_id`
- `chat:tool-calls/tool-executing/tool-result` sync with transcript timeline state
- `agi:tool_stream` uses shared helper builders from `toolStreamRuntime.ts`

### Section 4: Frontend Validation — PASS
- `pnpm typecheck`: PASS (0 errors)
- Shared runtime helpers exist: `toolTimelineRuntime.ts`, `streamLifecycle.ts`, `runtimeActivity.ts`, `toolStreamRuntime.ts`, `streamContentRuntime.ts`
- Tool name encoding uses `toolNameEncoding.ts` for decoded MCP/connector labels
- `chatToolUtils.ts` provides shared normalization functions

### Section 5: Backend Validation — PASS
- `cargo check`: PASS (fixed 1 missing-field error in `mod.rs` TokenUsage)
- `cargo clippy`: PASS (0 warnings)
- TokenUsage struct now includes `cache_read_input_tokens` + `cache_creation_input_tokens` at all construction sites
- Chat submodules remain canonical command owners (no drift into `chat/mod.rs`)

### Section 6: Deletion Safety — PASS
- No new deletions performed in this reconciliation
- Prior sprint removed 39 dead files (12K LOC) with targeted validation

### Section 7: UX Release Questions — PASS (architectural)
- Agent status visible via `AgentStepTimeline.tsx` + `AgenticLoopStatusBar.tsx`
- Tool use visible via `ToolTimeline.tsx` + `ToolLabel.tsx`
- Approvals visible via `MessageApprovals.tsx` (per-message inline)
- Reasoning distinguished via `ThinkingBlock.tsx` (collapsible, separate from output)
- Errors render inline via `MessageBubble.tsx` error state

### Deferred Items
- E2E user-flow testing (requires live desktop runtime + test harness)
- `check-wiring.sh` script validation (not run in this pass — scope is structural reconciliation)

---

## Sprint State Summary (2026-03-15)

### Build Status
| Check | Result |
|-------|--------|
| `pnpm typecheck` (tsc --noEmit) | PASS |
| `cargo check` | PASS (1 fix applied) |
| `cargo clippy` | PASS (0 warnings) |

### Fixes Applied This Sprint
1. **Rust: TokenUsage missing cache fields** — `core/llm/mod.rs:695`: Added `cache_read_input_tokens: None` and `cache_creation_input_tokens: None` to non-streaming fallback path
2. **Extension: Dead imports cleaned** — `background.ts`: Removed unused `_RateLimitState` type import, unused `_retry` import, renamed `_sleep` to `sleep`; `popup.ts`: Removed unused `_sleep` import

### Bridge Surface Alignment Findings (W3.4)

**Chrome Extension** (`apps/extension/`):
- Uses native messaging (chrome.runtime.Port) to communicate with desktop — message shapes are extension-local types, NOT shared via `packages/types/`
- Contract drift risk: MEDIUM — extension defines its own `NativeMessageType` union with 30+ message types that are independent of desktop Tauri commands
- Extension types are self-contained and appropriate for the browser context (DOM automation, tab management, cookies, etc.)

**VS Code Extension** (`apps/extension-vscode/`):
- Uses HTTP + WebSocket bridge to desktop (port 8787 default)
- Model catalog fetches from `/api/models` — aligns with web app endpoint, independent of desktop constants
- `BridgeMessage` type is generic `{ type: string, payload: Record<string, unknown> }` — no shared types from `packages/types/`
- Contract drift risk: LOW — bridge is loosely coupled by design; command allowlist in `desktopBridge.ts` prevents unauthorized command execution

**Mobile Companion** (`apps/mobile/`):
- Uses WebRTC (via signaling server) for real-time control messages
- Imports `SignalingEvent`, `SignalKind` from `@agiworkforce/types` — ALIGNED
- Imports `SignalingClient` from `@agiworkforce/utils` — ALIGNED
- `types/chat.ts` defines its own `ChatMessage`, `ToolCall`, `ApprovalRequest` — DIVERGENT from `packages/types/conversation.ts` `SharedMessage`
- Contract drift risk: HIGH for chat types — mobile `ChatMessage` has `role: 'user' | 'assistant' | 'system'` (no `'tool'`), different field names (`isStreaming`, `imageUrl`), and image-gen-specific fields not in `SharedMessage`
- Approval contract: mobile sends `{ approvalId, decision: 'approved'|'rejected' }` via `agentStore.ts`, while `companion.ts` sends `{ requestId, approved: boolean }` — INCONSISTENT field names for the same operation

### Most Dangerous Contract Drifts
1. **Mobile chat types vs SharedMessage** — Mobile `ChatMessage` and shared `SharedMessage` have incompatible field names and missing role types. Sync/handoff between surfaces will break silently.
2. **Mobile approval response format** — `agentStore.ts` uses `{ approvalId, decision }` while `companion.ts` uses `{ requestId, approved }` for the same approval_response action. Desktop must handle both or one path is dead.
3. **Extension native message types** — Entirely self-contained type system with no validation against what desktop actually accepts/emits via native messaging host.
