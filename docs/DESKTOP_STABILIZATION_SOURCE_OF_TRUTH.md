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
- `apps/desktop/src/lib/toolStreamRuntime.ts`
- `apps/desktop/src/lib/toolNameEncoding.ts`

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

Primary SSE parser:

- `apps/desktop/src-tauri/src/core/llm/sse_parser.rs`

Primary provider normalization:

- `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`

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
- `apps/desktop/src/lib/streamContentRuntime.ts`
- `apps/desktop/src/lib/streamLifecycle.ts`

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

Rule:

- new Rust chat submodules must import or re-export these from `state.rs`, not recreate local copies

### Rust Search Commands

Chat-history search commands now have a real live submodule boundary instead of living inline in the monolith.

Canonical search module:

- `apps/desktop/src-tauri/src/sys/commands/chat/search.rs`

Owned commands/types:

- `search_chat_history`
- `search_chat_history_semantic`
- `ChatSearchResult`

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
