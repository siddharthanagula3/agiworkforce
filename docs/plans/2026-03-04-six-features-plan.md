# Six Feature Implementation Plan

Date: 2026-03-04

## Feature 1: Conversation Branching/Forking

### Current State

- Messages are flat arrays with no `parent_message_id`
- `editAndRegenerateFromMessage` destructively truncates (in-memory only, desyncs from SQLite)
- `conversation_checkpoints` table exists with `parent_checkpoint_id` and `branch_name` (snapshot-based)
- `GitFork` button exists but is **broken** (passes wrong params to `checkpoint_create`)

### Implementation

**Phase A — Database migration + Rust backend**

1. New migration: add `parent_message_id INTEGER` and `branch_id TEXT DEFAULT 'main'` to `messages` table
2. New `conversation_branches` table: `id TEXT PK, conversation_id INTEGER, parent_branch_id TEXT, fork_point_message_id INTEGER, name TEXT, created_at TEXT`
3. Backfill: set all existing messages to `branch_id = 'main'`, set `parent_message_id` based on chronological order within each conversation
4. New Rust commands:
   - `conversation_fork(conversation_id, message_id, branch_name)` — creates branch, copies messages up to fork point
   - `conversation_list_branches(conversation_id)` — returns all branches
   - `conversation_switch_branch(conversation_id, branch_id)` — returns messages for that branch
   - `conversation_delete_branch(conversation_id, branch_id)` — delete a branch (not 'main')
5. Modify `list_messages` to accept optional `branch_id` filter

**Phase B — Frontend store changes**

1. Add `branchId?: string` and `parentMessageId?: string` to `EnhancedMessage`
2. Add `activeBranchId: string` and `branches: BranchSummary[]` to conversation state
3. Replace destructive `editAndRegenerateFromMessage` with `forkAndRegenerate`:
   - Call `conversation_fork` to create branch
   - Switch to new branch
   - Send new message on the branch
4. Add `switchBranch(conversationId, branchId)` action
5. Add `loadBranches(conversationId)` action

**Phase C — UI: Branch navigator**

1. `BranchNavigator` component: `< 1/3 >` arrows on messages with multiple branches (like Claude Desktop)
2. Render on any message that has sibling branches at that point
3. Show branch name tooltip on hover
4. Wire `GitFork` button correctly (fix broken `invoke` call)

### Files to modify

- `src-tauri/src/data/db/migrations.rs` (new migration)
- `src-tauri/src/data/db/repository.rs` (branch-aware queries)
- `src-tauri/src/data/db/models.rs` (add fields to Message)
- `src-tauri/src/sys/commands/chat/mod.rs` (new branch commands)
- `src-tauri/src/lib.rs` (register commands)
- `src/stores/chat/chatStore.ts` (branch state + actions)
- `src/stores/chat/types.ts` (EnhancedMessage fields)
- `src/components/UnifiedAgenticChat/MessageBubble/MessageBubble.tsx` (fix GitFork, add BranchNavigator)
- `src/components/UnifiedAgenticChat/MessageBubble/MessageActions.tsx` (fix fork button)
- NEW: `src/components/UnifiedAgenticChat/BranchNavigator.tsx`

### Effort: Large (DB migration + backend + store + UI)

---

## Feature 2: Inline Code Execution from Message Code Blocks

### Current State

- `Visualizations/CodeBlock.tsx` already has `enableRun` and `onRun` props — **Run button UI exists but is never activated**
- `MessageContent.tsx` renders code blocks but never passes `enableRun={true}`
- `sandbox.rs` (core/agi) has full sandbox execution: Python, JS/TS, bash, Ruby, Perl, R with security isolation
- `execute_code` Tauri command does NOT exist — `canvasStore` falls back to `terminal_execute`
- Canvas system has a working Run + output display pipeline

### Implementation

**Phase A — Expose sandbox as Tauri command**

1. Create `src-tauri/src/sys/commands/code_execution.rs`:
   ```rust
   #[tauri::command]
   pub async fn execute_code(language: String, code: String, timeout_secs: Option<u64>) -> Result<CodeExecutionResult, String>
   ```
2. Use `SandboxManager::new()` + `execute_code(ExecutionConfig { language, code, timeout_secs, .. })`
3. Register in `lib.rs`
4. Update `tauri-mock.ts` to handle `execute_code` properly

**Phase B — Wire Run button in chat code blocks**

1. In `MessageContent.tsx`, add `handleRunCode` callback:
   - `invoke('execute_code', { language, code })` → get `CodeExecutionResult`
   - Store result in component-local state
2. Pass `enableRun={EXECUTABLE_LANGUAGES.has(language)}` and `onRun` to `CodeBlock`
3. `EXECUTABLE_LANGUAGES = ['python', 'javascript', 'typescript', 'bash', 'sh']`

**Phase C — Inline output display**

1. After code block, render an `InlineCodeOutput` component showing:
   - stdout in a terminal-style panel (dark bg, monospace)
   - stderr in red
   - Exit code badge (green 0, red non-zero)
   - Execution time
   - Collapse/expand toggle
2. Reuse styling from `ArtifactPreview.tsx` terminal output section

### Files to modify

- NEW: `src-tauri/src/sys/commands/code_execution.rs`
- `src-tauri/src/lib.rs` (register command)
- `src/components/UnifiedAgenticChat/MessageBubble/MessageContent.tsx` (wire enableRun + onRun)
- `src/lib/tauri-mock.ts` (update mock)
- NEW: `src/components/UnifiedAgenticChat/InlineCodeOutput.tsx`

### Effort: Medium (Rust command exists, UI button exists, just need wiring + output display)

---

## Feature 3: @-Mention Files for Context

### Current State

- `@skill` mention works via `SkillMentionPicker.tsx` (30 static skills, client-side filter)
- `ContextItem` type hierarchy fully defined in `packages/types/src/context.ts` including `FileContextItem`
- `activeContext: ContextItem[]` in toolStore with `addContextItem`/`removeContextItem`
- `ContextDisplay` renders context items as removable pills
- `dir_list`, `dir_traverse`, `file_read` Tauri commands all exist
- **Gap**: `activeContext` is NOT serialized and sent to Rust backend — `ChatSendMessageRequest` has no `context_items` field

### Implementation

**Phase A — FileMentionPicker component**

1. Create `FileMentionPicker.tsx`:
   - Accept `query: string`, `rootFolder: string | null`, `onSelect`, `onClose`
   - On mount: `invoke('dir_list', { path: rootFolder })` to get file listing
   - Filter results by `query` matching against `entry.name`
   - For deep search: `invoke('dir_traverse', { path: rootFolder, globPattern: '**/*' + query + '*' })`
   - Show file/folder icons (Lucide `File`, `Folder`), path, size
   - Same keyboard nav pattern as `SkillMentionPicker`

**Phase B — Trigger detection + selection handler**

1. In `ChatInputArea.tsx`, extend mention detection:
   - Current: `/@([\w-]*)$/` → SkillMentionPicker
   - New: detect `@file:` prefix OR file-like patterns (containing `/` or `.`)
   - Show `FileMentionPicker` when file pattern detected, `SkillMentionPicker` otherwise
2. Selection handler:
   - Read file: `invoke('file_read', { path: entry.path })`
   - Create `FileContextItem` with content, path, name, size
   - Call `addContextItem(item)` → appears in `ContextDisplay` pills
   - Replace `@query` text with `@filename` in textarea

**Phase C — Wire context to Rust backend**

1. Add `context_items: Option<Vec<serde_json::Value>>` to `ChatSendMessageRequest` in `types.rs`
2. In `chat_send_message` handler: serialize file context items into system prompt messages:
   ````
   ## Attached file: {name}
   ```{language}
   {content}
   ````
   ```

   ```
3. Update frontend `onSend` to include `context: activeContext` in the Tauri invoke payload

### Files to modify

- NEW: `src/components/UnifiedAgenticChat/FileMentionPicker.tsx`
- `src/components/UnifiedAgenticChat/ChatInputArea.tsx` (trigger detection + handler)
- `src-tauri/src/sys/commands/chat/types.rs` (add context_items field)
- `src-tauri/src/sys/commands/chat/mod.rs` (serialize context into LLM messages)

### Effort: Medium (types exist, commands exist, need picker UI + backend wiring)

---

## Feature 4: Global Search Across All Chats (Cmd+K)

### Current State

- **Two competing CommandPalette components** both listening to Cmd+K
- `Layout/CommandPalette.tsx` — cmdk-based command launcher (6 hardcoded actions)
- `UnifiedAgenticChat/CommandPalette.tsx` — search-focused with Fuse.js + FTS5 dual search
- `Sidebar.tsx` also registers a third Cmd+K handler
- **All three fire simultaneously** — no `stopPropagation()`
- FTS5 backend exists: `search_chat_history` with BM25 ranking, porter stemming
- `search_chat_history_semantic` exists but is unreachable from frontend
- **Critical bug**: FTS result `conversation_id` (i64) doesn't match store `conv.id` (UUID) — navigation fails

### Implementation

**Phase A — Consolidate Cmd+K handlers**

1. Remove Cmd+K listener from `App.tsx` (DesktopShell)
2. Remove Cmd+K listener from `Sidebar.tsx`
3. Keep only `AppLayout.tsx` Cmd+K handler
4. Migrate to `useKeyboardShortcuts` hook instead of raw `addEventListener`

**Phase B — Unify CommandPalette into one component**

1. Merge into a single `CommandPalette.tsx` with two modes:
   - Default: shows recent conversations + command actions (from Layout version)
   - On typing: switches to search mode with Fuse.js + FTS5 (from UnifiedAgenticChat version)
2. Fix conversation_id matching: use `uuidToDbId` or store the DB integer ID alongside UUID
3. Add keyboard navigation: arrow keys, Enter to select, Escape to close
4. Add message-level navigation: when selecting a message result, scroll to that message in the conversation

**Phase C — Enhance search results**

1. Add date grouping: "Today", "Yesterday", "This week", "Older"
2. Add role badges (user/assistant) on message results
3. Wire `search_chat_history_semantic` as fallback when FTS5 returns < 3 results
4. Add search filters: date range picker, role filter (user/assistant/all)

### Files to modify

- `src/App.tsx` (remove Cmd+K handler)
- `src/components/UnifiedAgenticChat/Sidebar.tsx` (remove Cmd+K handler)
- `src/components/UnifiedAgenticChat/AppLayout.tsx` (keep single Cmd+K)
- MERGE: `src/components/UnifiedAgenticChat/CommandPalette.tsx` + `src/components/Layout/CommandPalette.tsx`
- `src/stores/unifiedChatStore.ts` (add search actions, fix ID matching)

### Effort: Medium (infrastructure exists, main work is consolidation + bug fixes)

---

## Feature 5: Share Conversation as PDF

### Current State

- `ShareConversationDialog.tsx` exists but only supports Markdown export
- `conversation_export` Tauri command only supports `format: "markdown"`
- `PdfDocumentCreator` exists in `features/document/create_pdf.rs` with full PDF generation (printpdf crate)
- **Pagination is broken** in create_pdf.rs — overflow handler resets y without creating new pages
- No Markdown-to-PDF parser — content would render as plain text

### Implementation

**Phase A — Fix PDF generation + add conversation PDF command**

1. Fix pagination in `create_pdf.rs`: actually create new pages on overflow
2. Add `conversation_export_pdf` Tauri command:
   - Load messages from SQLite for the conversation
   - Build `PdfContent` elements: conversation title as H1, each message as a section
   - User messages: H3 "You" + Paragraph content
   - Assistant messages: H3 "Assistant ({model})" + Paragraph content
   - Code blocks: monospace font section
   - Timestamps as small text
   - Save to user-selected path via file dialog
3. Register in `lib.rs`

**Phase B — Frontend export dialog**

1. Add "Export as PDF" button in `ShareConversationDialog.tsx`:
   - New button alongside "Copy as Markdown" and "Save as File"
   - Call `invoke('conversation_export_pdf', { conversationId })`
   - Show loading spinner during generation
   - Use `@tauri-apps/plugin-dialog` save dialog with `.pdf` filter
2. Also add to sidebar context menu as a direct action

### Files to modify

- `src-tauri/src/features/document/create_pdf.rs` (fix pagination)
- `src-tauri/src/sys/commands/chat/mod.rs` (new `conversation_export_pdf` command)
- `src-tauri/src/lib.rs` (register command)
- `src/components/UnifiedAgenticChat/ShareConversationDialog.tsx` (add PDF button)
- `src/components/UnifiedAgenticChat/Sidebar.tsx` (add PDF export to context menu)

### Effort: Medium (PDF infra exists, needs pagination fix + new command + button)

---

## Feature 6: Image Generation from Chat

### Current State

- `media_generate_image` Tauri command fully works
- `MediaExecutor` handles `image_generate` tool in agentic mode — **already works when agent mode is on**
- `InlineMediaGeneration` components render images inline in chat messages
- `InlineImageGeneration` registered in `TOOL_RENDERERS` for `image_generate` tool name
- Intent classifier detects `image-gen` from keywords like "generate an image", "draw", "create a picture"
- `multiModalRouter.ts` routes `image-gen` to best image model — **but nothing consumes the routing result**
- **No `/imagine` slash command** exists
- MediaLab panel exists as standalone UI but is not bridged to chat

### Implementation

**Phase A — Add `/imagine` slash command**

1. Add `'imagine'` to `useSlashCommands.ts` valid commands
2. Add autocomplete suggestion in `useSlashCommandAutocomplete.ts`:
   ```typescript
   { command: '/imagine', description: 'Generate an image', icon: '🎨' }
   ```
3. Add handler in `slashCommandHandlers.ts`:
   ```typescript
   export async function executeImagineCommand(prompt: string): Promise<SlashCommandResult> {
     const result = await generateImage({ prompt, provider: 'google_imagen', count: 1 });
     return { type: 'media', images: result };
   }
   ```
4. In the submit flow: detect `/imagine` prefix, extract prompt, call handler, inject result as assistant message with image attachment

**Phase B — Wire intent detection to auto-generate**

1. In `ChatInputArea.tsx`: when `image-gen` intent is detected with high confidence AND user submits:
   - Instead of sending to chat LLM, directly call `media_generate_image`
   - Use `multiModalRouter.ts` to select the best image model for the user's tier
   - Show `MediaGenerationProgress` inline while generating
   - Render result via `InlineImageGeneration` component
2. Add a "Generate Image" mode tag that the user can dismiss if they don't want auto-generation

**Phase C — Inline rendering improvements**

1. Add "Regenerate" button on generated images
2. Add "Edit prompt" to modify and regenerate
3. Add "Save to gallery" action

### Files to modify

- `src/hooks/useSlashCommands.ts` (add 'imagine')
- `src/hooks/useSlashCommandAutocomplete.ts` (add suggestion)
- `src/handlers/slashCommandHandlers.ts` (add handler)
- `src/components/UnifiedAgenticChat/ChatInputArea.tsx` (slash command routing + intent wiring)
- `src/components/UnifiedAgenticChat/index.tsx` (handle imagine command result)

### Effort: Small-Medium (all backend infra exists, just need slash command + intent wiring)

---

## Execution Order (by effort/impact ratio)

| Priority | Feature                         | Effort | Impact                                           |
| -------- | ------------------------------- | ------ | ------------------------------------------------ |
| 1        | **Inline Code Execution** (#2)  | Medium | High — Run button UI already exists              |
| 2        | **Image Gen from Chat** (#6)    | Small  | High — backend fully working, just needs trigger |
| 3        | **Global Search Cmd+K** (#4)    | Medium | High — FTS5 exists, fix bugs + consolidate       |
| 4        | **@-Mention Files** (#3)        | Medium | High — types + commands exist, need picker       |
| 5        | **Share as PDF** (#5)           | Medium | Medium — PDF infra exists, needs fixes           |
| 6        | **Conversation Branching** (#1) | Large  | High — requires DB migration + new data model    |

## Parallel Agent Assignment

These can be parallelized into 4 workstreams:

- **Workstream A (Rust)**: Code execution command (#2A) + PDF export command (#5A) + Branch migration (#1A)
- **Workstream B (Frontend-1)**: Inline code output (#2B-C) + Image gen slash command (#6A-B)
- **Workstream C (Frontend-2)**: FileMentionPicker (#3A-B) + CommandPalette consolidation (#4A-B)
- **Workstream D (Full-stack)**: Conversation branching store + UI (#1B-C) + Context wiring (#3C)
