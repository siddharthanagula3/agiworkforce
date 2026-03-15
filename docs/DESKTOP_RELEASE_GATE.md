# Desktop Release Gate

Status: active  
Scope: `apps/desktop`

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

## 8. Week 1 Gate Status (2026-03-15)

### Provider Fidelity Fixes Applied

- SSE parser tool call index corruption: **fixed** — fallback now logs error/debug appropriately
- Gemini multimodal format: **fixed** — `GoogleAdapter` now converts to native Gemini parts
- OpenAI Responses API detection: **fixed** — covers all March 2026 model families
- Streaming idle timeout: **fixed** — 90s per-chunk timeout in SSE parser

### Runtime Normalization Progress

- Tool event processing: canonical path consolidated in `toolStore.ts`
- Duplicate action trail entries from `useTauriStreamListeners.ts`: eliminated
- Legacy `chat:tool-executing`/`chat:tool-result` deferred to canonical `tool:event` for timeline/trail

### Remaining Blockers (Unresolved from Audit)

- Bedrock provider stub (#25-26): routes to OpenAI adapter — blocks AWS users
- Two parallel tool execution paths (#19): `agi/executors/` AND `llm/tool_executor/`
- MCP credential injection (#14-15): OAuth tokens unrecoverable
- Browser command test mocks: 51 commands missing from `tauri-mock.ts`

## 9. Week 2 Gate Status (2026-03-15)

### Provider Fidelity & Cache-Aware Costing

- Cache token extraction: **fixed** — SSE parser extracts `cache_read_tokens` and `cache_creation_tokens` from Anthropic, OpenAI (Chat + Responses API), and Gemini
- Cost calculation undercounting: **fixed** — streaming persistence now includes input tokens (was passing 0)
- Cache-aware costing: **fixed** — `calculate_with_cache()` used when cache tokens present (Anthropic 0.1x/1.25x, OpenAI 0.5x)
- OpenAI Responses API cache tokens: **fixed** — extracts `input_tokens_details.cached_tokens`
- Gemini `functionResponse.name` bug: **fixed** — now uses actual function name instead of tool call ID via lookup table
- Frontend usage type: **updated** — `chat:stream-end` listener includes `cache_read_tokens` and `cache_creation_tokens`

### Transcript Trust (Assessed — No Changes Needed)

- Architecture already transcript-first: `MessageRuntimeDecorators` renders tool timeline + thinking inline
- `MessageRuntimeInlineActivity` renders status trail + action log + approvals
- MCP tools are first-class in the transcript with Claude Code-style display names

### Security Review

- No new security boundaries crossed by month's changes
- ToolGuard remains untouched and functional
- Shared type exports contain no credentials or secrets
- Cost and cache token changes are informational only

## 10. Week 3 Gate Status (2026-03-15)

### Shared Contracts Established

- Workflow types consolidated: `packages/types/src/workflow.ts` eliminates exact desktop/web duplicate
- Model catalog types defined: `packages/types/src/model-catalog.ts` with Provider, ModelMetadata, ModelCapabilities
- Conversation contracts defined: `packages/types/src/conversation.ts` with MessageRole, ArtifactType, ApprovalRequestBase
- Desktop and web `workflow.ts` re-export from shared package
- TypeScript typecheck passes for both desktop and web

### Cross-Surface Contract Map

- Created `docs/CROSS_SURFACE_CONTRACT_MAP.md` documenting:
  - Capability ownership for 11 categories
  - Bridge contract risks (critical: hardcoded ports, native host names)
  - Provider parity matrix across all 5 surfaces
  - Shared vs. local contract boundaries
  - Data flow diagrams

### Bridge Alignment Risks Identified

- CRITICAL: Extension native messaging host name hardcoded
- CRITICAL: Extension bridge WebSocket URL hardcoded at 8787
- HIGH: Mobile signaling server URL in env var
- Recommended mitigations documented for next month

## 11. Week 4 Gate Status (2026-03-15)

### Provider Adapter Audit Fixes

- Gemini thinking block extraction: **fixed** — `GoogleAdapter::adapt_response()` now detects `thought: true` parts and collects into `reasoning_content`
- Gemini reasoning tokens: **fixed** — extracts `thoughtsTokenCount` from usage into `reasoning_tokens`
- Gemini model field fallback: **fixed** — tries `modelVersion` then falls back to `model` field
- OpenAI Responses API cache tokens: **verified** — `cache_read_input_tokens` extracted from `input_tokens_details.cached_tokens`

### Remaining Known Issues (Deferred)

- Bedrock provider stub (#25-26): still routes to OpenAI adapter — blocks AWS users
- Two parallel tool execution paths (#19): `agi/executors/` AND `llm/tool_executor/`
- MCP credential injection (#14-15): OAuth tokens unrecoverable
- Browser command test mocks: 51 commands missing from `tauri-mock.ts`
- Cargo check blocked in CI by missing `libgtk-3-dev` system dependency
