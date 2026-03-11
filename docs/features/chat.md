# Feature: Chat
> The core message exchange pipeline — user types a message, it streams through the Rust LLM router via SSE, and the response renders token-by-token in the React frontend.

## Where It Lives

| Layer | Location |
|-------|----------|
| Frontend Components | `components/UnifiedAgenticChat/index.tsx` (root orchestrator), `ChatInputArea.tsx` (composer), `ChatStream.tsx` (message list), `MessageBubble.tsx` (single message), `ChatMessageList.tsx` (scroll container), `FloatingChat/index.tsx` (overlay variant) |
| Stores | `stores/chat/chatStore.ts` — conversations, messages, streaming state, tool timeline, agentic loop status; `stores/unifiedChatStore.ts` — deprecated wrapper re-exporting sub-stores; `stores/chat/toolStore.ts` — tool executions, approvals, file ops, action log; `stores/chat/agentStore.ts` — agent status, background tasks, action trail |
| Hooks | `hooks/useAgenticEvents.ts` — master event orchestrator (fans to 3 sub-hooks); `hooks/useAgentLoopEvents.ts` — agent loop lifecycle; `hooks/useToolEvents.ts` — tool execution events; `hooks/useFileTerminalEvents.ts` — file/terminal events; `components/UnifiedAgenticChat/useSendMessage.ts` — handleSendMessage logic |
| Lib Utilities | `lib/chatToolUtils.ts` — pure utility functions for tool name normalization and inline data transformations |
| Rust Commands | `sys/commands/chat/send_message.rs` — `chat_send_message` (main); `conversation.rs` — CRUD; `messages.rs` — message CRUD; `control.rs` — stop generation; `search.rs` — FTS search; `export.rs` — export; `cost.rs` — cost tracking; `compaction.rs` — context compaction; `branching.rs` — branch management; `pending.rs` — pending message queue; `attachments.rs` — file/image processing |
| Rust Core | `core/llm/llm_router.rs` — `LLMRouter::send_message_streaming()`, candidate selection, retry; `core/llm/sse_parser.rs` — `SseStreamParser` (provider-specific SSE → `StreamChunk`); `core/llm/provider_adapter.rs` — per-provider request/response mapping |
| Event Channels | `chat:stream-start`, `chat:stream-chunk`, `chat:stream-end`, `chat:stream-error` (streaming lifecycle); `chat:tool-executing`, `chat:tool-result`, `chat:tool-calls` (tool loop); `chat:agent-progress` (iteration counter); `agentic:loop-started/status/ended/message-consumed` (loop lifecycle); `tool:event` (structured Started/Progress/Completed); `chat:skills-injected` (skill names); `automation:permission_required` (accessibility toast) |
| Web API Routes | `apps/web/app/api/chat/conversations/route.ts` — GET/POST; `[id]/route.ts` — GET/PATCH/DELETE; `[id]/messages/route.ts` — GET/POST |
| Database | SQLite (desktop): `conversations` (id, title, user_id, timestamps), `messages` (id, conversation_id, role, content, tokens, cost, provider, model, parent_message_id, branch_id), `messages_fts` (FTS5), `conversations_fts` (FTS5), `conversation_branches`. Supabase (web): mirrors via dual-write `supabase_sync::spawn_sync_conversation/message` |

## Data Flow

1. **User types message** — `ChatInputArea.tsx` captures text and calls `handleSendMessage(content, options)` from `useSendMessage.ts`.

2. **Slash command check** — `parseSlashCommand(content)` is called first. Built-in commands (`/terminal`, `/browser`, etc.) dispatch to `slashCommandHandlers.ts` and return early.

3. **Agentic loop check** — If `agenticLoopStatus?.active` is true, message is queued via `invoke('chat_add_pending_message')` and surfaced as a `PendingMessagesBubble`. Injected mid-loop via `agentic:message-consumed`.

4. **Risk detection** — Pattern matching against `dangerousCommandPatterns`, `promptInjectionPatterns` triggers `confirmRisk()` → `RiskConfirmationDialog`.

5. **Model routing** — `getModelForRequest(model, content, hasImages)` resolves auto-mode to concrete model ID. `resolveKnownModelCapabilities()` produces `modelCapabilitiesDto` for backend tool filtering.

6. **Optimistic UI** — `addMessage({role:'user'})` and `addMessage({role:'assistant', metadata:{streaming:true}})` create placeholders immediately. `setIsLoading(true)`.

7. **IPC invoke** — `invoke('chat_send_message', { request: { content, userId, conversationId, attachments, modelOverride, focusMode, stream: true, enableTools: true, frontendMessageId, customInstructions, thinkingMode, temperature, maxOutputTokens, enableAgentMode, projectFolder, modelCapabilities, incognito } })`. Returns immediately; content arrives via events.

8. **Rust `chat_send_message`** (`send_message.rs:118`):
   - Validates request, checks billing/budget limits
   - Creates or loads `Conversation` from SQLite (auto-creates with 50-char title if no `conversation_id`)
   - Dual-writes new conversation to Supabase via `spawn_sync_conversation()`
   - Saves user `Message` to SQLite, dual-writes via `spawn_sync_message()`
   - Builds `llm_messages` with system prompt stack: default AGI prompt, memory context, OS context, project folder context, custom instructions, browser page context, auto-injected skills (Jaccard similarity >= 0.15, top 2)
   - Processes multimodal attachments and document attachments (text extraction)
   - Builds tool definitions from MCP state filtered by model capabilities
   - Constructs `LLMRequest` (model, temperature=0.7, max_tokens=4096, stream=true, tools, thinking params)
   - Emits `chat:stream-start`
   - Spawns async task to avoid blocking the command response

9. **Streaming** — `router.send_message_streaming(&llm_request)` returns `Stream<StreamChunk>`. `consume_llm_stream()` loops:
   - 300s idle timeout watchdog per chunk
   - Checks `should_stop_for_conversation()` stop flag
   - Emits `chat:stream-chunk` with `{conversation_id, message_id, delta, content}` per chunk
   - Accumulates tool call deltas into `HashMap<usize, StreamingToolCall>`

10. **Tool loop** — If `tool_calls` non-empty after stream, emits `agentic:loop-started`, iterates up to 25 times:
    - `execute_tool_calls_batch()` → emits `tool:event(Started)`, calls MCP tool, emits `tool:event(Completed)`, emits `chat:tool-result`
    - Context compaction at >20 messages (keeps system + 10 most recent, summarizes middle)
    - Injects pending user messages via `pop_pending_message_for_conversation()`
    - Sends follow-up streaming request with tool results
    - Loop ends on: no more tool calls, `finish_reason="stop"`, iteration limit (25), time limit (600s), user stop
    - Emits `agentic:loop-ended`

11. **Frontend stream events** — `UnifiedAgenticChat/index.tsx` listeners:
    - `chat:stream-start` → creates AbortController, marks session active
    - `chat:stream-chunk` → `queueStreamUpdate(messageId, content)` via rAF batching (one React render per animation frame)
    - `chat:stream-end` → finalizes message, links backend message ID, clears loading state

12. **Tool event listener** — `initializeToolEventListener()` in `toolStore.ts` (runs once at startup):
    - `tool:event(started)` → `toolStore.updateToolStream()` + `chatStore.addToolTimelineEntry()` + `agentStore.addActionTrailEntry()`
    - `tool:event(completed)` → updates stores + schedules `removeToolStream()` after 5s
    - `agentic:loop-started/status/ended` → `chatStore.setAgenticLoopStatus()`

13. **UI re-render** — `ChatStream.tsx` maps `messages` from chatStore. `MessageBubble.tsx` renders each message. `ToolTimeline.tsx` renders `toolTimelineByMessage[messageId]` as collapsible list of `ToolLabel` entries.

## Component Tree

```
AppLayout
├── Sidebar
├── UnifiedAgenticChat (index.tsx)
│   ├── AgenticLoopStatusBar          ("Agent working step N/M")
│   ├── PendingMessagesBubbles        (queued follow-ups during loop)
│   ├── BudgetTracker                 (headless)
│   ├── ChatStream
│   │   └── ChatMessageList
│   │       └── MessageBubble (×N)
│   │           ├── MessageHeader
│   │           ├── MessageAvatar
│   │           ├── MessageAttachments
│   │           ├── ThinkingMessageBlock
│   │           ├── ToolTimeline
│   │           │   └── ToolCallCard (×N)
│   │           │       └── ToolLabel
│   │           ├── ReasoningAccordion
│   │           ├── InlinePanelList → InlinePanelRenderer
│   │           └── SourcesFooter / CitationBadge
│   ├── ChatInputArea
│   │   ├── VoiceInputButton
│   │   ├── SlashCommandMenu
│   │   ├── PromptSuggestionsDropdown
│   │   ├── FocusSelector
│   │   ├── TokenCounter
│   │   └── ContextDisplay
│   ├── ApprovalModal
│   ├── RiskConfirmationDialog
│   └── BudgetAlertsPanel
├── DynamicSidecar
│   └── (TerminalView | BrowserPreview | CodeCanvas | DiffViewer)
└── ArtifactPanel / MemoryPanel / ResearchPanel / AgentTaskPanel
```

## IPC Contracts

| Frontend Call | Rust Handler | Params (camelCase) | Returns |
|---|---|---|---|
| `invoke('chat_send_message', {request})` | `chat_send_message` | `request: { content, userId, conversationId?, modelOverride?, focusMode?, stream, enableTools, frontendMessageId, customInstructions?, thinkingMode?, temperature?, maxOutputTokens?, enableAgentMode?, projectFolder?, modelCapabilities?, incognito? }` | `ChatSendMessageResponse` (streaming: returns immediately, content via events) |
| `invoke('chat_create_conversation', {request})` | `chat_create_conversation` | `request: { title, userId }` | `Conversation` |
| `invoke('chat_get_conversations', {userId})` | `chat_get_conversations` | `userId: string` | `Conversation[]` |
| `invoke('chat_get_conversation', {id, userId})` | `chat_get_conversation` | `id: number, userId: string` | `Conversation` |
| ~~`invoke('chat_update_conversation', {id, request})`~~ | `chat_update_conversation` | `id: number, request: { title, userId }` | `void` | **NOT REGISTERED** in `generate_handler![]` — function exists in `conversation.rs` but is not wired as an IPC command |
| ~~`invoke('chat_delete_conversation', {id, userId})`~~ | `chat_delete_conversation` | `id: number, userId: string` | `void` | **NOT REGISTERED** in `generate_handler![]` — function exists in `conversation.rs` but is not wired; frontend `deleteConversation` operates on local store only |
| `invoke('chat_add_pending_message', {request})` | `chat_add_pending_message` | `request: { content, conversationId? }` | `PendingUserMessage` |
| `invoke('chat_stop_generation', {conversationId})` | `chat_stop_generation` | `conversationId: number` | `void` |
| `invoke('chat_get_messages', {conversationId, userId})` | `chat_get_messages` | `conversationId: number, userId: string` | `Message[]` |
| `invoke('search_chat_history', {query, userId})` | `search_chat_history` | `query: string, userId: string` | `SearchResult[]` |
| `invoke('cancel_tool_execution', {toolId})` | `cancel_tool_execution` | `toolId: string` | `void` |
| `invoke('conversation_delete_branch', {conversationId, branchId})` | `conversation_delete_branch` | `conversationId: number, branchId: string` | `void` |

## Dependencies

- **Requires**: `mcpState` (tool definitions), `settingsStore` (LLM config, temperature, max tokens), `modelStore` (selected provider/model, thinking mode), `memoryState` (memory injection), `billingState` (cost check), `projectContextState` (folder scoping), `skillsState` (auto-inject), `supabaseAuth` (userId), `customInstructionsStore` (merged instructions)
- **Required by**: Agentic Mode (uses `chat_send_message` with `enableAgentMode: true`), Deep Research (uses `focusMode: 'deep-research'`), FloatingChat (wraps `UnifiedAgenticChat`)

## Known Gaps

- `unifiedChatStore.ts` is marked `DEPRECATED` at line 5 but is still widely imported — migration to direct sub-store imports is incomplete
- `agenticLoopStatus` lives in `chatStore` (not `agentStore`) despite being agent lifecycle data — architectural mismatch
- `useSendMessage.ts` was extracted from `index.tsx` but `index.tsx` still contains duplicate slash command dispatch code
- Deep research path returns `Message::default()` as `assistant_message` in the synchronous response — actual content only arrives via events. Code reading `response.assistant_message.content` directly gets empty string
- `chat:pending-context-available` event is emitted but no frontend listener consumes it
- `chat_update_conversation` and `chat_delete_conversation` exist as Rust functions in `conversation.rs` but are NOT registered in `lib.rs` `generate_handler![]` — any frontend `invoke()` call to them will fail silently
- Context compaction uses simple concatenated text summary — no semantic compression

## Design Decisions

- **Return-immediately pattern**: `chat_send_message` spawns `tauri::async_runtime::spawn` and returns a sentinel response immediately. Prevents IPC timeout on long streaming sessions. All content arrives via Tauri events.
- **rAF stream batching**: `processStreamBuffer` coalesces multiple `chat:stream-chunk` events per animation frame to avoid React state update saturation during rapid token emission.
- **Dual-write to Supabase**: All conversations/messages fire-and-forget synced to Supabase. SQLite is always authoritative; Supabase is best-effort for cross-device sync.
- **Frontend UUID / backend integer ID mapping**: Frontend generates UUIDs for React keys; `dbIdToUuid()`/`uuidToDbId()` maintain bidirectional cache in localStorage (1000 entries cap). `linkConversationId()` called on stream-end.
- **Incognito mode**: When `incognito: true`, no conversation/message written to SQLite, memory injection/saving skipped. Sentinel conversation with `id = -1`.
- **Tool loop compaction**: At >20 follow-up messages, middle collapsed to summary to prevent unbounded context growth, snapping to nearest `assistant` message boundary to keep tool_use/tool_result pairs intact.
