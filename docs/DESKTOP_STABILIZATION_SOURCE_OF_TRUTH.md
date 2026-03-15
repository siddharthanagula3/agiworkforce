# Desktop Stabilization Source of Truth

Status: active working reference  
Scope: `apps/desktop` only  
Purpose: prevent duplicate fixes, wrong-file edits, and planning from stale assumptions

Related benchmark plan:

- `docs/DESKTOP_COWORK_COMPETITIVE_PLAN.md`

## Product Intent

AGI Workforce desktop is the flagship native agent runtime of the AGI Workforce suite.

The desktop product is not a narrow chat client. It is the local execution surface for:

- general-purpose chat
- coding and terminal workflows
- filesystem operations
- MCP tools and connectors
- search and deep research
- media generation orchestration
- memory-backed assistance
- autonomous and semi-autonomous agent workflows

The target benchmark set is broader than a single competitor:

- `ChatGPT` for chat, memory, and UX clarity
- `Claude` / `Claude Code` / `Codex` for coding, terminal, and tool use
- `Gemini` for multimodal and media breadth
- `Perplexity` for search and research UX
- agentic desktop products such as `OpenClaw` and `Claude Cowork`

## Planning Rule

For desktop stabilization work:

1. Explore the live runtime first.
2. Identify canonical files actually mounted, registered, or invoked.
3. Patch only canonical files first.
4. Delete duplicates only after proving they are disconnected.
5. Validate after each cleanup slice.

No feature or cleanup plan should be created from memory alone.

## Canonical Desktop Surface

### Frontend

Primary desktop shell:

- `apps/desktop/src/App.tsx`

Primary chat interface:

- `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`

Primary Tauri event bridge for chat/tool streaming:

- `apps/desktop/src/components/UnifiedAgenticChat/useTauriStreamListeners.ts`
- `apps/desktop/src/components/UnifiedAgenticChat/useMessageRuntimeActivity.ts`
- `apps/desktop/src/components/UnifiedAgenticChat/MessageRuntimeActivity.tsx`
- `apps/desktop/src/lib/messageArtifacts.ts`
- `apps/desktop/src/lib/messageActivity.ts`
- `apps/desktop/src/lib/messageLookup.ts`
- `apps/desktop/src/lib/runtimeActivity.ts`
- `apps/desktop/src/lib/streamContentRuntime.ts`
- `apps/desktop/src/lib/streamLifecycle.ts`
- `apps/desktop/src/lib/toolTimelineRuntime.ts`
- `apps/desktop/src/lib/toolStreamRuntime.ts`
- `apps/desktop/src/lib/toolNameEncoding.ts`
- `apps/desktop/src/stores/extensionEventsStore.ts`

Primary inline reasoning render path:

- `apps/desktop/src/components/UnifiedAgenticChat/ChatStream.tsx`
- `apps/desktop/src/components/UnifiedAgenticChat/ThinkingBlock.tsx`
- `apps/desktop/src/components/UnifiedAgenticChat/ReasoningAccordion.tsx`
- `apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/ThinkingMessageBlock.tsx`

Primary inline approval render path:

- `apps/desktop/src/components/UnifiedAgenticChat/ChatStream.tsx`
- `apps/desktop/src/components/UnifiedAgenticChat/MessageApprovals.tsx`
- `apps/desktop/src/components/UnifiedAgenticChat/Cards/ApprovalRequestCard.tsx`

Primary slash-command send flow:

- `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`

### Backend

Primary Rust chat runtime:

- `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`

Active chat submodules declared by the runtime:

- `apps/desktop/src-tauri/src/sys/commands/chat/agent_mode.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/attachments.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/branching.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/browser_context.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/compaction.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/conversation.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/control.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/cost.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/export.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/intent.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/maintenance.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/memory_handler.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/message_context.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/pending.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/persistence.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/provider_access.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/prompt_context.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/search.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/send_message.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/send_message_execution.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/share.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/state.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/stream_runtime.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/tool_config.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/tool_execution.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/tool_events.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/tool_timeouts.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/types.rs`

Primary embedded MCP server runtime:

- `apps/desktop/src-tauri/src/core/mcp/server/http_server.rs`
- `apps/desktop/src-tauri/src/core/mcp/server/handlers.rs`
- `apps/desktop/src-tauri/src/core/mcp/server/executor.rs`
- `apps/desktop/src-tauri/src/core/mcp/server/tools.rs`
- `apps/desktop/src-tauri/src/sys/commands/mcp_server.rs`

Note: `mcp_server_status` and `mcp_server_list_tools` are defined in `mcp_server.rs` but NOT registered in `lib.rs`. They are unreachable from the frontend.

Primary desktop MCP frontend/runtime surface:

- `apps/desktop/src/api/mcp.ts`
- `apps/desktop/src/stores/mcpStore.ts`
- `apps/desktop/src/stores/mcpbStore.ts`
- `apps/desktop/src/stores/mcpServerStore.ts`
- `apps/desktop/src/stores/mcpAppStore.ts`
- `apps/desktop/src/stores/connectorsStore.ts`
- `apps/desktop/src/stores/settingsStore.ts`
- `apps/desktop/src/components/Settings/MCPToolsSettings.tsx`
- `apps/desktop/src/components/MCP/MCPConnectionStatus.tsx`
- `apps/desktop/src/hooks/useAgenticEvents.ts`
- `apps/desktop/src-tauri/src/sys/commands/mcp.rs`
- `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs`
- `apps/desktop/src-tauri/src/sys/commands/mcp_extensions.rs`
- `apps/desktop/src-tauri/src/sys/commands/mcpb.rs`
- `apps/desktop/src-tauri/src/core/mcp/tool_executor.rs`
- `apps/desktop/src-tauri/src/core/mcp/health.rs`

MCP extension commands NOT registered in lib.rs (defined in `mcp_extensions.rs` but unreachable):

- `extension_get_config`, `extension_set_config`, `extension_validate`
- `extension_list_by_status`, `extension_start_all`, `extension_stop_all`
- `extension_get_directory`

Primary SSE parser:

- `apps/desktop/src-tauri/src/core/llm/sse_parser.rs`

Primary provider normalization:

- `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`

Primary desktop auth/session security runtime:

- `apps/desktop/src-tauri/src/sys/security/auth.rs`
- `apps/desktop/src-tauri/src/sys/security/auth_db.rs`
- `apps/desktop/src-tauri/src/sys/security/oauth.rs`
- `apps/desktop/src-tauri/src/data/db/migrations.rs`

Primary desktop security event / command validation runtime:

- canonical audit event surface: `apps/desktop/src-tauri/src/sys/security/audit_logger.rs`
- canonical shell command validation: `apps/desktop/src-tauri/src/sys/security/command_validator.rs`
- canonical public export boundary: `apps/desktop/src-tauri/src/sys/security/mod.rs`
- frontend-facing secret storage commands (`secret_manager_has`, `secret_manager_set`, `secret_manager_delete`) are owned by `apps/desktop/src-tauri/src/sys/commands/security.rs` and backed by `apps/desktop/src-tauri/src/sys/security/secret_manager.rs`

Dead module: `apps/desktop/src-tauri/src/sys/permissions/` (audit.rs, manager.rs, policy.rs) is NOT imported by any code in the codebase. It is a candidate for removal. The authoritative permissions system lives in `sys/security/` (tool_guard.rs, policy/, policy_integration.rs, rbac.rs, permissions.rs).

Primary desktop managed service-state wiring in `apps/desktop/src-tauri/src/lib.rs`:

- `AGICheckpointState` is managed during startup before the registered `agi_checkpoint_*` commands are exposed
- embeddings are managed as `Arc<tokio::sync::Mutex<EmbeddingService>>`, which is the exact state type requested by the registered embedding commands in `apps/desktop/src-tauri/src/core/embeddings/mod.rs`
- embedding initialization falls back from filesystem-backed service -> degraded service -> in-memory degraded service, so registered embedding commands do not depend on an unmanaged state edge case
- `LLMState` is managed with a live `cache_entries` backing connection via `LLMState::with_cache(...)`, so the canonical `LLMRouter` used by `llm_send_message`, `vision_send_message`, and the desktop chat runtime has request/response caching enabled in production
- `apps/desktop/check-wiring.sh` is the invoke-to-`generate_handler!` guardrail and now ignores `src/__tests__` sentinel invokes while extracting real command names accurately
- `apps/desktop/src/stores/mcpServerStore.ts` is the canonical embedded MCP server state owner, including fetch/start/stop/update error propagation

Primary desktop cache/runtime surface:

- runtime cache owner: `apps/desktop/src-tauri/src/core/llm/cache_manager.rs`
- canonical router wiring: `apps/desktop/src-tauri/src/sys/commands/llm.rs`
- managed startup owner: `apps/desktop/src-tauri/src/lib.rs`
- cache commands/analytics: `apps/desktop/src-tauri/src/sys/commands/cache.rs`
- live cache-management UI: `apps/desktop/src/components/Settings/CacheManagement.tsx`, mounted from `apps/desktop/src/components/Settings/SettingsPanel.tsx`
- `apps/desktop/src/components/Settings/MCPServerSettings.tsx` consumes that state with a controlled port input so runtime config refreshes stay visible in the UI
- `apps/desktop/src/stores/llmConfigStore.ts` owns task-routing tier enforcement and now initializes its auth-plan subscription through a guarded one-time async bootstrap path
- `apps/desktop/src/components/MCP/MCPCredentialManager.tsx` owns desktop OAuth credential UI and must validate deep-link state against locally stored CSRF state before invoking the backend callback
- `apps/desktop/src-tauri/src/core/orchestration/workflow_scheduler.rs` owns live cron/runtime scheduling, and `apps/desktop/src-tauri/src/sys/commands/orchestration.rs` starts that scheduler with `WorkflowEngineState`
- `apps/desktop/src-tauri/src/sys/commands/browser.rs` keeps `browser_execute_in_frame` behind the same explicit confirmation boundary used by `browser_evaluate` / `browser_execute_async_js`
- embedded MCP `agi_run_task.max_steps` flows through `apps/desktop/src-tauri/src/core/mcp/server/executor.rs` → `apps/desktop/src-tauri/src/sys/commands/agi.rs` → `apps/desktop/src-tauri/src/core/agi/core.rs`

Primary desktop startup/bootstrap surface:

- `apps/desktop/src/App.tsx`

Primary desktop connector/runtime surface:

- `apps/desktop/src/components/Connectors/ConnectorsGallery.tsx`
- `apps/desktop/src/components/Connectors/connectorDefinitions.ts`
- `apps/desktop/src/stores/connectorsStore.ts`
- `apps/desktop/src/api/mcp.ts`
- `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs`
- shell/root startup work must use guarded async bootstrap paths with cancellation/error handling
- delayed window restore work must register cleanup instead of leaving free-running timers behind

### Registered Tauri Commands

Evidence from `apps/desktop/src-tauri/src/lib.rs` shows these live chat commands are registered:

- `chat_send_message`
- `chat_stop_generation`
- `chat_get_cost_overview`
- `chat_get_cost_analytics`
- `chat_compact_context`
- `search_chat_history`
- `conversation_export`
- `conversation_export_pdf`

Any alternate implementation not wired through these registration paths is not authoritative.

Conversation/message CRUD and stats commands are now owned by:

- `apps/desktop/src-tauri/src/sys/commands/chat/conversation.rs`

## Canonical Runtime Flows

### Send Message

Frontend send entry:

- `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`

Backend command:

- `apps/desktop/src-tauri/src/sys/commands/chat/send_message.rs`

Canonical helper modules behind the command:

- `apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/send_message_execution.rs`

Tauri command name:

- `chat_send_message`

### Inline Reasoning

Provider adapters may expose reasoning content:

- `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`

Streaming reasoning is parsed in:

- `apps/desktop/src-tauri/src/core/llm/sse_parser.rs`

Thinking events are emitted from:

- `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`

Thinking events are consumed in:

- `apps/desktop/src/components/UnifiedAgenticChat/useTauriStreamListeners.ts`

Thinking-event transcript targeting must resolve through:

- `apps/desktop/src/lib/streamLifecycle.ts`

### Browser Extension Runtime State

Canonical browser extension runtime state is owned by:

- `apps/desktop/src/stores/extensionEventsStore.ts`

Browser extension UI consumers must read the shared store via:

- `apps/desktop/src/hooks/useExtensionEvents.ts`
- `apps/desktop/src/components/Agent/BrowserAutomationPanel.tsx`

The extension state path must not auto-open the sidecar.

### Tool Timeline Runtime

Canonical tool timeline label/status shaping is owned by:

- `apps/desktop/src/lib/toolTimelineRuntime.ts`

The live timeline writers are:

- `apps/desktop/src/stores/chat/toolStore.ts`
- `apps/desktop/src/components/UnifiedAgenticChat/useTauriStreamListeners.ts`

`chat:tool-calls`, `chat:tool-executing`, and `chat:tool-result` must update `toolTimelineByMessage` for the target transcript message.

### Browser UI Surfaces

The live browser sidecar visualization path is:

- `apps/desktop/src/components/Browser/BrowserVisualization.tsx`
- `apps/desktop/src/components/Browser/BrowserViewer.tsx`
- `apps/desktop/src/stores/browserStore.ts`

The live browser sidecar contract is:

- preview streaming plus browser action history
- no browser console/network telemetry polling or stub commands in the mounted desktop path until a real CDP-backed capture pipeline exists

The canonical desktop browser backend path is:

- `apps/desktop/src-tauri/src/sys/commands/browser.rs`
- `apps/desktop/src-tauri/src/automation/browser/mod.rs`
- `apps/desktop/src-tauri/src/automation/browser/playwright_bridge.rs`

The canonical CDP endpoint contract is:

- `apps/desktop/src-tauri/src/automation/browser/playwright_bridge.rs` owns `CdpEndpoint`
- `apps/desktop/src-tauri/src/sys/commands/browser.rs` must parse the live frontend `browserType` / `headless` launch payload instead of assuming an `options`-only command contract
- `apps/desktop/src-tauri/src/sys/commands/browser.rs` must open and close browser tabs through `CdpEndpoint`, not hardcoded `127.0.0.1:9222` URLs
- `apps/desktop/src-tauri/src/sys/commands/browser.rs` must route file uploads through the CDP DOM file-input path, not page-side `file://` fetch hacks
- `apps/desktop/src-tauri/src/sys/commands/browser.rs` must route semantic browser commands through `automation/browser/semantic.rs` and live CDP evaluation, not hardcoded stub selectors or null payloads
- `apps/desktop/src-tauri/src/sys/commands/browser.rs` must return structured tab records from `browser_list_tabs`; the desktop browser API contract is richer than a bare list of tab ids
- `apps/desktop/src/lib/browserAutomation.ts` must mirror the live Tauri browser command payloads; wrapper helpers may not invent dead fields like `fullPage`, `timeoutMs`, or `sourceSelector`
- `apps/desktop/src/lib/browserAutomation.ts` imports directly from `@tauri-apps/api/core` instead of the `tauri-mock` shim — this breaks web-mode safety and must be updated to use `../lib/tauri-mock`
- `apps/desktop/src-tauri/src/automation/browser/mod.rs` must resolve per-tab websocket targets through the shared endpoint contract instead of constructing a hardcoded `ws://127.0.0.1:9222/devtools/page/{tab_id}` URL
- `PlaywrightBridge.start_server()` must fail honestly or reuse an already reachable CDP endpoint; it must not report a fake started state
- no live browser command, AGI executor, or tool-executor path may create an internal-only `TabManager.open_tab()` entry when it expects CDP control; no-tab flows must create a real CDP target or fail clearly

The live browser extension status sidecar path is:

- `apps/desktop/src/components/Agent/BrowserAutomationPanel.tsx`
- `apps/desktop/src/stores/extensionEventsStore.ts`

The registered browser close command is:

- `apps/desktop/src-tauri/src/sys/commands/browser.rs`
- `apps/desktop/src-tauri/src/lib.rs`

These browser surfaces were removed because they were not mounted by the live desktop runtime:

- `apps/desktop/src/components/UnifiedAgenticChat/Sidecar/BrowserPreview.tsx`
- `apps/desktop/src/components/Browser/BrowserWorkspace.tsx`
- `apps/desktop/src/components/Browser/BrowserDebugPanel.tsx`
- `apps/desktop/src/components/Browser/BrowserRecorder.tsx`

**Note:** `apps/desktop/src/lib/streamContentRuntime.ts` and `apps/desktop/src/lib/streamLifecycle.ts` are LIVE and canonical — they are imported by `useTauriStreamListeners.ts` and listed in the Canonical Desktop Surface above. They were incorrectly included in this removal list previously.

Reasoning UI is rendered in:

- `apps/desktop/src/components/UnifiedAgenticChat/ChatStream.tsx`
- `apps/desktop/src/components/UnifiedAgenticChat/ThinkingBlock.tsx`
- `apps/desktop/src/components/UnifiedAgenticChat/ReasoningAccordion.tsx`

### Inline Activity Ownership

Action-trail entries must resolve to a transcript message so that inline status can render against a concrete assistant or system message.

Canonical ownership resolver:

- `apps/desktop/src/lib/runtimeMessageOwnership.ts`
- adopted by `apps/desktop/src/stores/unifiedChatStore.ts`
- adopted by `apps/desktop/src/hooks/useAgenticEvents.ts`
- adopted by `apps/desktop/src/components/UnifiedAgenticChat/useTauriStreamListeners.ts`

Ownership precedence:

1. explicit `metadata.messageId`
2. current streaming message for the active conversation
3. latest assistant message in the active conversation
4. latest system message in the active conversation

### Transcript Runtime Selectors

Transcript runtime readers must not hand-roll message-owned activity filters in multiple components.

Canonical per-message runtime selectors:

- `apps/desktop/src/lib/messageActivity.ts`
- `apps/desktop/src/components/UnifiedAgenticChat/useMessageRuntimeActivity.ts`
- `apps/desktop/src/components/UnifiedAgenticChat/MessageRuntimeActivity.tsx`

These selectors own message-scoped reads for:

- action trail
- action log
- approvals
- tool timeline
- thinking content

### Backend State Ownership

Backend chat state types and stop-flag helpers must not be redefined inside `chat/mod.rs`.

Canonical backend state owner:

- `apps/desktop/src-tauri/src/sys/commands/chat/state.rs`

Current exported state surface:

- `AppDatabase`
- `reset_stop_flag`
- `should_stop_for_conversation`
- `should_stop_generation` (tests)

`AppDatabase` is also the canonical SQLite owner for desktop analytics commands in `apps/desktop/src-tauri/src/sys/commands/analytics.rs`; analytics/reporting code must clone the managed connection instead of opening a second database handle.

Rule:

- new Rust chat submodules must import or re-export these from `state.rs`, not recreate local copies
- analytics/reporting commands must reuse the managed `AppDatabase` connection, not derive a second SQLite writer from a filesystem path

### Rust Search Commands

Chat-history search commands now have a real live submodule boundary instead of living inline in the monolith.

Canonical search module:

- `apps/desktop/src-tauri/src/sys/commands/chat/search.rs`

Owned commands/types:

- `search_chat_history`
- `search_chat_history_semantic`
- `ChatSearchResult`

Chat search now normalizes user input into literal quoted FTS terms before issuing `MATCH`, so reserved operators like `NOT` or `NEAR` are treated as text rather than executable query syntax.

Semantic chat search now computes document cosine magnitude across the full document TF-IDF vector, so long noisy matches no longer outrank concise relevant messages.

### Rust Cost Commands

Chat cost and budget commands now have a real live submodule boundary instead of living inline in the monolith.

Canonical cost module:

- `apps/desktop/src-tauri/src/sys/commands/chat/cost.rs`

Owned commands:

- `chat_get_cost_overview`
- `chat_get_cost_analytics`
- `chat_set_monthly_budget`

### Rust Control Commands

Chat stop/cancel control commands now have a real live submodule boundary instead of living inline in the monolith.

Canonical control module:

- `apps/desktop/src-tauri/src/sys/commands/chat/control.rs`

Owned commands:

- `chat_stop_generation`
- `cancel_tool_execution`
- `chat_handle_stop`

### Rust Agent Mode / Intent Commands

Agent-mode selection and intent classification now have dedicated canonical modules instead of living inline in the transport/runtime file.

Canonical modules:

- `apps/desktop/src-tauri/src/sys/commands/chat/agent_mode.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/intent.rs`

Owned helpers:

- `is_explicit_model_selection`
- `detect_agent_mode`
- `detect_user_intent`
- `matches_stop_intent`
- `should_attach_screen_context`
- `detect_agentic_intent`

Owned commands:

- `chat_detect_intent`
- `chat_is_stop_command`

Intent rule:

- explicit action verbs win over clarification phrases, so follow-on execution requests like `please open the file and then summarize it` stay classified as `ActionRequest` instead of falling back to `Clarification`

### Rust Command Surface Modules

The live command surface is now split into dedicated modules and re-exported by `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`.

Canonical modules:

- `apps/desktop/src-tauri/src/sys/commands/chat/send_message.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/maintenance.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/send_message_execution.rs`

Owned commands:

- `chat_send_message`
- `clear_local_database`

`clear_local_database` now performs one transactional table wipe before clearing the in-memory pending queue, so the reset path cannot leave the local desktop database half-cleared.

Owned helper boundaries under `chat_send_message`:

- request flag/provider/model resolution
- conversation/user-message/bootstrap preparation
- prompt/context/tool-request assembly
- streaming branch orchestration
- non-streaming branch orchestration

### Rust Conversation Commands

Conversation/message CRUD and stats now have a real live module boundary instead of living inline in the monolith.

Canonical conversation module:

- `apps/desktop/src-tauri/src/sys/commands/chat/conversation.rs`

Owned commands:

- `chat_create_conversation`
- `chat_get_conversations`
- `chat_get_conversation`
- `chat_update_conversation`
- `chat_delete_conversation`
- `chat_create_message`
- `chat_get_messages`
- `chat_update_message`
- `chat_delete_message`
- `chat_get_conversation_stats`

### Rust Compaction Commands

Context compaction now has a real live submodule boundary instead of living inline in the monolith.

Canonical compaction module:

- `apps/desktop/src-tauri/src/sys/commands/chat/compaction.rs`

Owned commands/types:

- `chat_compact_context`

Compaction now persists locally by deleting the compacted older messages inside one transaction and inserting a replacement system summary message. Message listing order is stabilized by `created_at, id` in `apps/desktop/src-tauri/src/data/db/repository.rs`.

- `ContextCompactionResponse`

### Rust Export Commands

Conversation export commands now have a real live submodule boundary instead of living inline in the monolith.

Canonical export module:

- `apps/desktop/src-tauri/src/sys/commands/chat/export.rs`

Owned commands:

- `conversation_export`
- `conversation_export_pdf`

### Rust Send-Message Setup / Execution Helpers

The live send path now has explicit setup/execution module boundaries instead of one monolithic `send_message.rs` implementation.

Canonical modules:

- `apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/send_message_execution.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/persistence.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/tool_timeouts.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/provider_access.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/prompt_context.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/browser_context.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/attachments.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/tool_config.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/message_context.rs`

Owned setup helpers:

- `resolve_request_flags`
- `resolve_provider_and_model`
- `build_router_preferences`
- `prepare_send_message`

Owned execution helpers:

- `handle_streaming_message`
- `handle_nonstreaming_message`

Owned supporting helpers:

- `save_or_skip_assistant_message`
- `compute_or_skip_stats`
- `resolve_tool_execution_timeout_secs`
- `resolve_followup_invoke_timeout_secs`
- `resolve_followup_total_timeout_secs`
- `resolve_streaming_tool_loop_max_secs`
- `resolve_streaming_tool_loop_max_iterations`
- `check_billing_and_budget`
- `ensure_managed_cloud_provider`
- `sanitize_for_prompt`
- `sanitize_multiline_for_prompt`
- `build_os_context`
- `build_project_context_message`
- `escape_xml`
- `model_likely_supports_vision`
- `inject_browser_page_context`
- `process_multimodal_attachments`
- `process_document_attachments`
- `extract_text_from_attachments`
- `convert_attachments_to_content_parts`
- `build_tool_definitions`
- `normalize_tool_calls`
- `append_history_messages`
- `inject_memory_context`
- `emit_stream_failure`
- `consume_llm_stream`
- `execute_tool_calls_batch`
- `execute_chat_tool_with_timeout`

### Current `chat/mod.rs` Role

`apps/desktop/src-tauri/src/sys/commands/chat/mod.rs` is now the backend module surface:

- declares live chat submodules
- re-exports registered command modules
- hosts targeted module-level regression tests

It is no longer the canonical implementation file for `chat_send_message`, `clear_local_database`, or the send-loop setup/execution policies.

### Tool / MCP Naming

Inline tool, MCP, and connector labels must come from one decode/display pipeline so encoded runtime names do not leak into the transcript.

Canonical naming helpers:

- `apps/desktop/src/lib/toolNameEncoding.ts`
- `apps/desktop/src/lib/chatToolUtils.ts`
- `apps/desktop/src/lib/toolDisplayNames.ts`

Rules:

1. decode encoded `b64_` segments before display
2. preserve exact decoded connector/tool names when no explicit display map exists
3. prefer explicit display-map labels when a known tool has a curated name

### Approvals

Approval events are funneled through:

- `apps/desktop/src/components/UnifiedAgenticChat/useTauriStreamListeners.ts`
- `apps/desktop/src/stores/chat/toolStore.ts`

Primary inline approval render:

- `apps/desktop/src/components/UnifiedAgenticChat/ChatStream.tsx`
- `apps/desktop/src/components/UnifiedAgenticChat/MessageApprovals.tsx`
- `apps/desktop/src/components/UnifiedAgenticChat/Cards/ApprovalRequestCard.tsx`

Approval ownership precedence:

1. explicit `approval.messageId`
2. explicit `approval.details.messageId`
3. current streaming message for the active conversation
4. latest assistant message in the active conversation
5. latest system message in the active conversation

Primary inline persisted activity render:

- `apps/desktop/src/components/UnifiedAgenticChat/ActionLogTimeline.tsx`

### Tool Stream Terminal Reconciliation

Tool-stream completion, failure, and cancellation must reconcile the owning message through shared helpers instead of open-coded artifact patch logic.

Canonical tool-stream runtime helpers:

- `apps/desktop/src/lib/toolStreamRuntime.ts`
- adopted by `apps/desktop/src/hooks/useAgenticEvents.ts`
- adopted by `apps/desktop/src/components/UnifiedAgenticChat/useTauriStreamListeners.ts`

### Stream Content Normalization

Thinking-event content plans and tool-call/result artifact payload shaping must be shared helpers, not repeated inline in the live stream listener.

Canonical stream-content helpers:

- `apps/desktop/src/lib/streamContentRuntime.ts`
- adopted by `apps/desktop/src/components/UnifiedAgenticChat/useTauriStreamListeners.ts`

### Sidecar Visibility

Runtime events may update sidecar context, but they must not auto-open the sidecar.
Runtime events must not mutate sidecar section while the sidecar is closed.

The sidecar is manual, secondary, and detail-oriented.

Inline chat is the primary execution transcript for:

- reasoning
- tool activity
- approvals
- progress
- results

## Single-Source-of-Truth Rules

When multiple files appear to implement the same feature, the canonical source is the one that is:

1. imported by a mounted React tree, or
2. declared as a Rust submodule from the active `mod.rs`, or
3. registered in `src-tauri/src/lib.rs`, or
4. referenced by the live send/stream path

If a file fails all four checks, it is a candidate orphan and must not be edited until verified.

## Deletion Rule

Delete only when all conditions hold:

1. no live import, module declaration, or command registration
2. same responsibility exists in the canonical live path
3. any missing useful behavior has already been ported
4. targeted validation passes after removal

## Current Evidence-Based Goals

Immediate stabilization goals for desktop:

1. keep one real chat send path
2. keep one real reasoning event/render path
3. keep one real approval path
4. keep one real persistence and cloud-sync path
5. remove disconnected duplicates only after proof

## Validation Baseline

Desktop package scripts:

- `pnpm --filter @agiworkforce/desktop test`
- `pnpm --filter @agiworkforce/desktop typecheck`

Rust validation:

- `cargo test -p agiworkforce-desktop ...`

For chat/runtime changes, prefer targeted validation first:

- chat UI tests
- store tests
- SSE parser tests
- Rust stream tests

## Listener Map

For the current live listener split and the next consolidation target:

- `docs/DESKTOP_EVENT_INGESTION_MAP.md`

## Week 1 Updates (2026-03-15)

### Audit Re-baseline

The following FULL_AUDIT.md items were re-baselined against live code:

| Item                    | Previous Status           | Current Status                | Notes                                                                   |
| ----------------------- | ------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| #1 (RateLimitTracker)   | HIGH — not consulted      | **Stale** — already connected | Consulted at `llm_router.rs:1309-1319` in `route_with_retry()`          |
| #27 (SSE tool index)    | HIGH — corrupts streaming | **Fixed**                     | Improved fallback logging; error-level for multi-tool, debug for single |
| #28 (Responses API)     | HIGH — fragile detection  | **Fixed**                     | Now covers gpt-5*, gpt-4.1*, o3*, o4*, gpt-oss*, codex-*                |
| #34 (streaming timeout) | MEDIUM — no idle timeout  | **Fixed**                     | Per-chunk 90s timeout in `SseStreamParser::poll_next()`                 |
| #46 (Gemini multimodal) | HIGH — raw ChatMessage    | **Fixed**                     | `GoogleAdapter::convert_messages_to_gemini_format()` with proper parts  |

### Runtime Normalization

Tool event processing consolidated:

- **Canonical path**: `tool:event` listener in `toolStore.ts` — handles timeline, action trail, stream state
- **Legacy path**: `chat:tool-executing` / `chat:tool-result` in `useTauriStreamListeners.ts` — now defers to canonical path for timeline creation and action trail updates; retained for artifact handling, message metadata, and timeout scheduling

### Authority Cross-Check

| Domain   | Status              | Key Finding                                                                         |
| -------- | ------------------- | ----------------------------------------------------------------------------------- |
| MCP      | Canonical           | All paths verified live and registered                                              |
| Browser  | Canonical with gaps | 51 browser commands missing test mocks; `extension_bridge.rs` hardcodes port 8787   |
| Security | Clean               | All 24 submodules verified; `guardrails.rs` is empty/dead (1 byte) — safe to remove |

## Week 2 Updates (2026-03-15)

### Provider Fidelity & Cost Accounting

| Fix                                              | Files                        | Impact                                                               |
| ------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------- |
| Cache token extraction (Anthropic/OpenAI/Gemini) | `sse_parser.rs`, `mod.rs`    | Token usage now includes cache_read/cache_creation tokens            |
| Cost undercounting fix                           | `send_message_execution.rs`  | Input tokens included in streaming cost calculation (was 0)          |
| Cache-aware costing                              | `send_message_execution.rs`  | Uses `calculate_with_cache()` when cache tokens detected             |
| OpenAI Responses API cache                       | `provider_adapter.rs`        | Extracts `input_tokens_details.cached_tokens`                        |
| Gemini functionResponse.name                     | `provider_adapter.rs`        | Fixed: now resolves function name from tool-call ID via lookup table |
| Frontend usage types                             | `useTauriStreamListeners.ts` | Updated to include cache token fields                                |

### Assessment Results (No Changes Needed)

- **Transcript trust**: Architecture already transcript-first — `MessageRuntimeDecorators`, `MessageRuntimeInlineActivity`
- **MCP/browser visibility**: MCP tools first-class in transcript with Claude Code-style display names

## Week 3 Updates (2026-03-15)

### Shared Type Contracts

New shared types in `packages/types/src/`:

| File               | Types                                                        | Previously                       |
| ------------------ | ------------------------------------------------------------ | -------------------------------- |
| `workflow.ts`      | WorkflowDefinition, nodes, edges, triggers                   | Exact duplicate in desktop + web |
| `model-catalog.ts` | Provider, ModelMetadata, ModelCapabilities, ProviderConfig   | Desktop-local types only         |
| `conversation.ts`  | MessageRole, ArtifactType, ArtifactBase, ApprovalRequestBase | Surface-local definitions        |

Desktop and web `workflow.ts` now re-export from shared package.

### Cross-Surface Documentation

- Created `docs/CROSS_SURFACE_CONTRACT_MAP.md` — capability ownership, bridge risks, data flow
- Desktop and web typecheck clean after shared type adoption

## Week 4 Updates (2026-03-15)

### Provider Adapter Audit Fixes

| Fix                     | File                  | Detail                                      |
| ----------------------- | --------------------- | ------------------------------------------- |
| Gemini thinking blocks  | `provider_adapter.rs` | `thought: true` parts → `reasoning_content` |
| Gemini reasoning tokens | `provider_adapter.rs` | `thoughtsTokenCount` → `reasoning_tokens`   |
| Gemini model field      | `provider_adapter.rs` | `modelVersion` fallback to `model`          |

### Release Gate Reconciliation

- Week 4 gate status added to `DESKTOP_RELEASE_GATE.md`
- Remaining blockers documented (Bedrock stub, dual tool execution, MCP credentials, browser mocks)
