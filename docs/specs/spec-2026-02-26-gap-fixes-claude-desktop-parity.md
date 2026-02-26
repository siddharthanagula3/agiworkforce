# Specification: Gap Fixes for Claude Desktop Parity

Generated: 2026-02-26T00:00:00Z

## Task Overview

Close the six most impactful feature gaps between AGI Workforce and Claude Desktop.
Three are high priority (inline artifact editing, skill auto-invocation, artifact sharing),
three are medium priority (incognito chat, chat history RAG search, image generation
watchdog timeout). Each fix has been scoped to specific files with interface contracts
so agents can work in parallel without conflicts.

---

## Team Composition

| Agent | Role | Zone |
|-------|------|------|
| Agent A (frontend-engineer) | Zone A -- TypeScript UI components and stores | ZONE-A |
| Agent B (rust-tauri-engineer) | Zone SYSTEM -- Rust backend commands and core logic | ZONE-SYSTEM |
| Agent C (backend-engineer) | Zone B -- TypeScript services, lib, and API wrappers | ZONE-B |

---

## Fix 1: Inline Artifact Editing (HIGH)

### Problem
When the user asks to modify an existing artifact, the entire artifact content is
regenerated from scratch. Claude Desktop computes a targeted diff and applies only
the changed lines, making edits 3-4x faster and preserving user modifications to
non-affected sections.

### Current State

**Artifact Store** (`/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/artifactStore.ts`):
- `updateArtifact(id, content, ...)` replaces the ENTIRE `content` field (line 544).
- Invokes `artifact_update` Tauri command which saves a new version with full content.
- `getVersionDiff(id, fromVersion, toVersion)` already exists (line 787) and invokes
  `artifact_get_diff` -- so diff infrastructure exists on the Rust side.

**Editing Store** (`/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/editingStore.ts`):
- Already defines `DiffHunk`, `LineChange`, `FileDiff` types (lines 5-37).
- Has `generateDiff(filePath, originalContent, modifiedContent)` (line 75).
- Has hunk-level accept/reject (`acceptHunk`, `rejectHunk`) -- lines 61-62.
- This infrastructure is for file editing but can be reused for artifact inline editing.

**ArtifactPanel** (`/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Artifacts/ArtifactPanel.tsx`):
- No "Edit" button or inline editing mode.
- Only has copy, download, version history, pin, archive, delete.

**Rust Backend** (`/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/artifacts.rs`):
- `artifact_update` (line 157) takes full `content: String`.
- No `artifact_apply_diff` or `artifact_patch` command exists.

### Required Changes

#### Agent A (ZONE-A): Frontend Artifact Inline Editing

**Files to modify:**

1. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/artifactStore.ts`
   - Add new action: `applyDiffToArtifact(id: string, diff: ArtifactDiff): Promise<Artifact | null>`
   - Add type:
     ```typescript
     export interface ArtifactDiff {
       hunks: Array<{
         startLine: number;
         endLine: number;
         originalContent: string;
         newContent: string;
       }>;
       changeDescription?: string;
     }
     ```
   - This action calls the new Tauri command `artifact_apply_diff`.
   - Fallback: if the command is not available, compute full content locally by
     applying the hunks to the cached artifact content, then call `artifact_update`.

2. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Artifacts/ArtifactPanel.tsx`
   - Add an "Edit" button (pencil icon) in the toolbar section (after the Copy button, ~line 370).
   - When clicked, switch the `ArtifactRendererView` to an editable mode.
   - For code artifacts: use a CodeMirror or Monaco instance with the artifact content.
   - For document artifacts: use a simple textarea with markdown preview toggle.
   - On save: compute the diff between original and edited content, call `applyDiffToArtifact`.

3. **NEW FILE**: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Artifacts/InlineArtifactEditor.tsx`
   - Receives: `artifact: Artifact`, `onSave: (diff: ArtifactDiff) => void`, `onCancel: () => void`
   - For `code` type: syntax-highlighted editor with line numbers.
   - For `document` type: rich text / markdown editor.
   - For other types: plain text editor.
   - Computes diff on save using a simple line-by-line comparison utility.

4. **NEW FILE**: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/lib/diffUtils.ts`
   - Export: `computeLineDiff(original: string, modified: string): ArtifactDiff`
   - Export: `applyDiff(original: string, diff: ArtifactDiff): string`
   - Uses a simple LCS (longest common subsequence) or Myers diff algorithm.
   - This is a pure function with no side effects, safe for any agent to implement.

#### Agent B (ZONE-SYSTEM): Rust Diff-Based Update Command

**Files to modify:**

1. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/artifacts.rs`
   - Add new Tauri command: `artifact_apply_diff`
   - Signature:
     ```rust
     #[tauri::command]
     pub async fn artifact_apply_diff(
         id: String,
         hunks: Vec<DiffHunk>,
         change_description: Option<String>,
         state: State<'_, ArtifactState>,
     ) -> ArtifactResponse<Artifact>
     ```
   - Where `DiffHunk` is:
     ```rust
     #[derive(Debug, serde::Deserialize)]
     pub struct DiffHunk {
         pub start_line: usize,
         pub end_line: usize,
         pub original_content: String,
         pub new_content: String,
     }
     ```
   - Implementation: Load current artifact content, split into lines, validate
     each hunk's `original_content` matches the target lines, apply replacements,
     rejoin lines, then call the existing update path to save as a new version.

2. Register command in the Tauri builder (check `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/lib.rs` for the `.invoke_handler()` call).

### Interface Contract (Agent A <-> Agent B)

```typescript
// Frontend calls:
invoke<ArtifactResponse<Artifact>>('artifact_apply_diff', {
  id: string,
  hunks: Array<{
    start_line: number,  // 0-indexed line number
    end_line: number,    // exclusive
    original_content: string,
    new_content: string,
  }>,
  change_description?: string,
})

// Returns: ArtifactResponse<Artifact> with updated artifact (new version created)
```

---

## Fix 2: Skill Auto-Invocation (HIGH)

### Problem
Skills currently require the user to type `/skill-name` manually. Claude Desktop
auto-detects which skills are relevant based on the user's message and injects
them into the system prompt transparently.

### Current State

**Rust Skill Infrastructure:**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/skills/skill.rs`:
  - `Skill` struct has `name`, `description`, `instructions` fields.
  - `to_context_string()` returns formatted skill instructions for injection.
  - Skills can be bundled, workspace-local, or user-managed.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/tools/skill_tool.rs`:
  - `SkillTool` with `list_available_skills() -> Vec<(String, String)>` (name, description pairs).
  - `get_skill_instructions(skill_name) -> Option<String>`.
  - Provides `use_skill` and `list_skills` tools for the LLM to call.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/skills.rs`:
  - `skill_list` (line 119) returns all skills as `SkillInfo` structs.
  - `skill_invoke` (line 186) invokes a skill by name with arguments.
  - `skill_get_instructions` (line 140) returns instructions for a skill.
  - No `skill_match_intent` or `skill_auto_inject` command exists.

**Chat Send Flow:**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`:
  - `chat_send_message` (line 2416) is the main entry point (5,518 lines total file).
  - `detect_user_intent` (line 1439) classifies intent as ActionRequest, Conversation, Stop, Clarification.
  - System prompt is built in the early part of `chat_send_message`.
  - NO skill matching or auto-injection logic exists currently.
  - Skills are only used if the LLM decides to call `use_skill` tool.

**Frontend:**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/index.tsx` (line 2330):
  - Sends `chat_send_message` with content, model, etc.
  - Does NOT send skill hints or matched skills.

### Required Changes

#### Agent B (ZONE-SYSTEM): Rust Skill Auto-Matching

**Files to modify:**

1. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/skills.rs`
   - Add new Tauri command: `skill_match_for_message`
   - Signature:
     ```rust
     #[tauri::command]
     pub fn skill_match_for_message(
         content: String,
         state: State<'_, SkillsState>,
     ) -> Vec<SkillMatchResult>
     ```
   - Where:
     ```rust
     #[derive(Debug, serde::Serialize)]
     pub struct SkillMatchResult {
         pub skill_name: String,
         pub description: String,
         pub relevance_score: f64,
         pub match_reason: String,
     }
     ```
   - Implementation: For each available skill, compute a relevance score by:
     1. Tokenize the user message into keywords (lowercase, strip punctuation).
     2. Tokenize the skill name and description into keywords.
     3. Compute Jaccard similarity between the two keyword sets.
     4. Boost score if the skill name appears as a substring in the message.
     5. Return skills with score above 0.15, sorted descending by score, limit 3.

2. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`
   - In `chat_send_message`, after the system prompt is built and before the first
     LLM invocation, add skill auto-injection:
     1. Call the skill matcher with the user message content.
     2. For each matched skill (up to 2), call `skill.to_context_string()` and
        append it to the system prompt as an additional system message.
     3. Log which skills were auto-injected for debugging.
   - This requires access to `SkillsState` -- add it as a parameter to
     `chat_send_message` if not already available, or access it through the
     app handle.

3. Register `skill_match_for_message` in the Tauri builder.

#### Agent A (ZONE-A): Frontend Skill Match Indicator

**Files to modify:**

1. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/index.tsx`
   - After sending `chat_send_message`, no frontend changes needed for the core
     auto-injection (it happens server-side in Rust).
   - Optional enhancement: Show a subtle badge/indicator in the message header
     when skills were auto-invoked. This can be done by having the Rust backend
     include `matched_skills: Vec<String>` in the streaming event metadata.

2. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/settingsStore.ts`
   - Add to `ChatPreferences`:
     ```typescript
     /** Enable automatic skill injection based on message intent */
     autoInjectSkills: boolean;
     ```
   - Default: `true`.
   - Add setter: `setAutoInjectSkills: (enabled: boolean) => void`.

3. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Settings/AgentsSettings.tsx`
   - Add a toggle for "Auto-inject relevant skills" under the agent settings.

### Interface Contract (Agent A <-> Agent B)

The skill auto-injection is primarily server-side. The frontend contract is:

```typescript
// The chat_send_message request already has all needed fields.
// No new frontend->backend interface needed for the core feature.

// Optional: Backend emits a tauri event with skill injection metadata:
// Event name: "chat:skills-injected"
// Payload: { conversation_id: number, skills: string[] }
```

The `skill_match_for_message` command is exposed for potential frontend preview use:
```typescript
invoke<SkillMatchResult[]>('skill_match_for_message', { content: string })
// Returns: [{ skill_name, description, relevance_score, match_reason }]
```

---

## Fix 3: Artifact Publish/Share (HIGH)

### Problem
No way to share artifacts publicly. Claude Desktop generates shareable public URLs.

### Current State

- Supabase client exists at `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/lib/supabase.ts`.
- Supabase DB types at `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/types/supabase.ts`.
- No `shared_artifacts` or `artifact_shares` table exists.
- `ArtifactToolbar` (`/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Artifacts/ArtifactToolbar.tsx`)
  has copy, download, open-in-panel -- no "Share" button.
- `ArtifactPanel` (`/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Artifacts/ArtifactPanel.tsx`)
  has dropdown with pin/archive/delete -- no "Share" option.
- `ArtifactAction` type in `artifactStore.ts` (line 146) already includes `'share'` as
  a valid action, but it is never implemented.

### Required Changes

#### Strategy: Two-Tier Sharing

1. **Offline / No-Account**: Base64-encode artifact content into a self-contained data URL.
   Generate a shareable link like `https://app.agiworkforce.com/shared?data=<base64>`.
   The web app decodes and renders. No backend required. Limit: ~6KB due to URL length.

2. **Online / With Account**: Upload artifact to Supabase `shared_artifacts` table.
   Generate a short URL like `https://app.agiworkforce.com/shared/<uuid>`.
   Supports arbitrarily large artifacts.

#### Agent C (ZONE-B): Sharing Service and API

**Files to create:**

1. **NEW FILE**: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/services/artifactSharing.ts`
   ```typescript
   export interface ShareResult {
     url: string;
     shareId: string;
     expiresAt?: string;
     method: 'base64' | 'supabase';
   }

   export async function shareArtifact(artifact: {
     id: string;
     title: string;
     type: string;
     content: string;
     language?: string;
   }): Promise<ShareResult>

   export async function getSharedArtifact(shareId: string): Promise<SharedArtifact | null>

   export async function revokeShare(shareId: string): Promise<boolean>
   ```
   - If content is under 4KB, use base64 encoding into URL.
   - If content is larger or user is logged in, use Supabase.
   - Supabase table: `shared_artifacts` with columns:
     `id (uuid)`, `user_id (uuid)`, `title (text)`, `artifact_type (text)`,
     `content (text)`, `language (text)`, `metadata (jsonb)`, `created_at (timestamptz)`,
     `expires_at (timestamptz)`, `view_count (integer)`.

#### Agent A (ZONE-A): Share UI

**Files to modify:**

1. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Artifacts/ArtifactToolbar.tsx`
   - Add a "Share" button (Share2 icon from lucide) next to the download button (~line 113).
   - On click: call `shareArtifact()` from the sharing service.
   - Show a toast with the shareable URL and a "Copy Link" action.

2. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Artifacts/ArtifactPanel.tsx`
   - Add "Share" option to the dropdown menu (after "Archive", ~line 413).
   - Same behavior: call `shareArtifact()`, show toast with URL.

3. **NEW FILE**: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Artifacts/ShareArtifactDialog.tsx`
   - Dialog that shows the share URL, copy button, expiration options.
   - Toggle: "Expire after 7 days" / "Never expire".
   - Optional: password protection toggle (future enhancement).

### Interface Contract (Agent A <-> Agent C)

```typescript
// Agent A imports from Agent C's service:
import { shareArtifact, revokeShare, ShareResult } from '@/services/artifactSharing';

// shareArtifact takes minimal artifact data, returns a URL
const result: ShareResult = await shareArtifact({
  id: artifact.id,
  title: artifact.title,
  type: artifact.artifact_type,
  content: artifact.content,
  language: (artifact.metadata as any)?.Code?.language,
});
// result.url = "https://app.agiworkforce.com/shared/abc-123"
```

---

## Fix 4: Incognito Chat Mode (MEDIUM)

### Problem
No zero-persistence conversation mode. All messages are saved to SQLite.

### Current State

- Chat messages are saved via `chat_create_message` Tauri command
  (line 2258 of `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`).
- `chat_send_message` (line 2416) always creates conversation and message records in SQLite.
- `ChatState` in `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/chat/types.ts` has no
  incognito flag.
- `ConversationSummary` (line 170 of types.ts) has no `incognito` field.
- Memory system integration happens in `chat_send_message` via `memory_handler.load_project_memories`.

### Required Changes

#### Agent A (ZONE-A): Frontend Incognito Toggle

**Files to modify:**

1. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/chat/types.ts`
   - Add to `ConversationSummary`:
     ```typescript
     /** When true, messages in this conversation are not persisted to disk */
     incognito?: boolean;
     ```

2. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/chat/chatStore.ts`
   - Modify `createConversation` to accept an optional `incognito: boolean` parameter.
   - When `incognito` is true, set `incognito: true` on the `ConversationSummary`.
   - Modify `addMessage`: when the active conversation is incognito, skip the
     `invoke('chat_create_message', ...)` call -- keep messages only in Zustand state.

3. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/index.tsx`
   - In `handleSendMessage` (~line 2330): when the active conversation is incognito,
     pass `incognito: true` in the `chat_send_message` request so the Rust backend
     knows not to persist.
   - Show a visual indicator (EyeOff icon from lucide) next to the conversation title
     when incognito is active.

4. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/ChatInputToolbar.tsx`
   - Add an incognito toggle button (EyeOff icon) that creates a new incognito conversation.

#### Agent B (ZONE-SYSTEM): Rust Incognito Support

**Files to modify:**

1. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`
   - In `chat_send_message`: accept an optional `incognito: Option<bool>` field in the request.
   - When `incognito` is true:
     - Skip `INSERT INTO conversations` and `INSERT INTO messages` SQL calls.
     - Skip memory injection (`load_project_memories`).
     - Skip FTS5 indexing.
     - Still process the LLM call normally and stream results back.
   - The conversation_id for incognito chats should be a negative sentinel value
     (e.g., -1) to distinguish from real DB IDs.

### Interface Contract (Agent A <-> Agent B)

```typescript
// Extended chat_send_message request:
invoke('chat_send_message', {
  request: {
    // ... existing fields ...
    incognito: true,  // NEW: when true, do not persist to SQLite
  }
})
```

---

## Fix 5: Chat History RAG Search (MEDIUM)

### Problem
Only basic FTS5 full-text search exists. Users need natural language semantic search
over past conversations.

### Current State

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`:
  - `search_chat_history` (line 2086) uses FTS5 BM25 ranking.
  - Returns `ChatSearchResult` with `message_id`, `conversation_id`, `content_snippet`,
    `role`, `created_at`, `rank`.
  - Max 100 results, sorted by BM25 relevance.

- Memory system (`/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/memory_manager.rs`):
  - Has `semantic_search` using TF-IDF similarity (line 1384).
  - Already has a hybrid search combining keyword + semantic scores.
  - But this operates on the memory store, NOT on chat messages.

- No embedding model is loaded locally. No vector DB (like SQLite-vec or hnswlib).

### Required Changes

#### Strategy: Hybrid FTS5 + TF-IDF Reranking

Since there is no local embedding model, use a lightweight approach:
1. Use existing FTS5 to get candidate messages (expand to top 50).
2. Apply TF-IDF reranking on the candidates using the user's natural language query.
3. Return top 20 reranked results.

This provides "semantic-like" search without requiring an embedding model.

#### Agent B (ZONE-SYSTEM): Enhanced Search Command

**Files to modify:**

1. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`
   - Add new command: `search_chat_history_semantic`
     ```rust
     #[tauri::command]
     pub fn search_chat_history_semantic(
         query: String,
         limit: Option<i64>,
         db: State<'_, AppDatabase>,
     ) -> Result<Vec<ChatSearchResult>, String>
     ```
   - Implementation:
     1. Expand FTS5 query: split user query into words, join with `OR` for broader recall.
     2. Fetch top 50 candidates via FTS5.
     3. Compute TF-IDF vectors for the query and each candidate's content.
     4. Rerank by cosine similarity of TF-IDF vectors.
     5. Return top `limit` (default 20) results.
   - Register in Tauri builder.

#### Agent A (ZONE-A): Enhanced Search UI

**Files to modify:**

1. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/Sidebar.tsx` (or wherever search is rendered)
   - Change the search handler to call `search_chat_history_semantic` instead of
     `search_chat_history`.
   - Add a toggle: "Smart Search" (uses semantic) vs "Exact Search" (uses FTS5).
   - Display relevance scores as a subtle bar or percentage next to each result.

### Interface Contract

```typescript
// Same response shape as existing search_chat_history:
invoke<ChatSearchResult[]>('search_chat_history_semantic', {
  query: string,  // natural language query
  limit?: number, // default 20, max 100
})
// Returns same ChatSearchResult[] but reranked by TF-IDF similarity
```

---

## Fix 6: stream_watchdog_timeout on Image Generation (MEDIUM)

### Problem
The main chat streaming idle timeout fix (keepalive chunks) works for normal chat,
but image generation via tool calls still triggers the watchdog timeout because the
tool execution path has different timeout handling.

### Current State

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`:
  - `STREAM_CHUNK_IDLE_TIMEOUT_SECS = 300` (line 42) -- 5 minutes for stream idle.
  - `FOLLOWUP_INVOKE_TIMEOUT_SECS = 120` (line 45) -- 2 minutes for follow-up after tool.
  - `resolve_tool_execution_timeout_secs("image_generate")` returns `LONG_RUNNING_TOOL_TIMEOUT_SECS` (line 974-977).
  - `LONG_RUNNING_TOOL_TIMEOUT_SECS` is used for image/video generation tool timeouts.
  - The streaming loop at line ~3412 has the idle timeout that fires when no bytes arrive.
  - Keepalive chunks from SSE parser DO reset this timeout for normal streaming.
  - BUT: after a tool call completes (e.g., `image_generate`), the FOLLOWUP model
    invocation has its own timeout (`FOLLOWUP_INVOKE_TIMEOUT_SECS = 120s`) which may
    be too short for image generation models that take 30-60s to generate and then
    another 30-60s for the follow-up model to describe the result.

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/sse_parser.rs`:
  - Keepalive detection works correctly (line 37-41, 122-128).
  - `keepalive` field on `StreamChunk` (line 41).

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/llm_router.rs`:
  - `send_message_streaming` has a 30s connection timeout (line 2186).
  - Streaming connection timeout + idle timeout are separate concerns.

### Required Changes

#### Agent B (ZONE-SYSTEM): Extended Timeouts for Image Generation Path

**Files to modify:**

1. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`
   - Find the `FOLLOWUP_INVOKE_TIMEOUT_SECS` constant (line 45) and add a new constant:
     ```rust
     /// Extended followup timeout for image/video generation tools.
     /// These tools produce large outputs that take 30-120s, and the followup
     /// model invocation needs additional time to process the result.
     const MEDIA_FOLLOWUP_INVOKE_TIMEOUT_SECS: u64 = 300;
     ```
   - Find the followup invocation logic (around line 1010-1024, the
     `resolve_followup_timeout_secs` function or equivalent). Modify it to check
     whether the most recent tool call was an image/video generation tool, and if
     so, use `MEDIA_FOLLOWUP_INVOKE_TIMEOUT_SECS` instead of `FOLLOWUP_INVOKE_TIMEOUT_SECS`.
   - Add a helper:
     ```rust
     fn is_media_generation_tool(tool_name: &str) -> bool {
         let normalized = tool_name.to_lowercase();
         normalized == "image_generate"
             || normalized == "media_generate_image"
             || normalized == "video_generate"
             || normalized == "media_generate_video"
     }
     ```
   - In the streaming tool loop, after a media generation tool completes, emit a
     keepalive-like event to the frontend so the user sees a "Processing image..."
     indicator rather than a frozen UI. Use the existing Tauri event system:
     ```rust
     app_handle.emit("chat:tool-progress", serde_json::json!({
         "conversation_id": conversation_id,
         "tool_name": tool_name,
         "status": "processing_result",
         "message": "Processing generated image..."
     }));
     ```

2. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/llm_router.rs`
   - In `send_message_streaming` (line ~2186), the 30-second connection timeout is fine
     for initial connections. No change needed here.
   - However, ensure that for non-streaming `send_message` calls (used in tool follow-up),
     the timeout respects the caller's specified duration rather than a hardcoded default.
     Check `invoke_with_retry` (line 1060) and `route_with_retry` (line 1118) for
     hardcoded timeouts.

#### Agent A (ZONE-A): Tool Progress Indicator

**Files to modify:**

1. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/index.tsx`
   - Add an event listener for `chat:tool-progress`.
   - When received with `status: "processing_result"`, show a subtle progress message
     in the streaming message area (e.g., "Processing generated image...").
   - This prevents the user from thinking the app is frozen.

---

## File Allocation Summary

### Agent A (frontend-engineer, ZONE-A)

**Allowed Files:**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/artifactStore.ts` (add `applyDiffToArtifact`)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/chat/types.ts` (add `incognito` field)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/chat/chatStore.ts` (incognito logic)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/settingsStore.ts` (add `autoInjectSkills`)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Artifacts/ArtifactPanel.tsx` (edit + share buttons)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Artifacts/ArtifactToolbar.tsx` (share button)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Settings/AgentsSettings.tsx` (skill toggle)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/index.tsx` (incognito + tool-progress)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/ChatInputToolbar.tsx` (incognito toggle)

**New Files (Agent A creates):**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Artifacts/InlineArtifactEditor.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Artifacts/ShareArtifactDialog.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/lib/diffUtils.ts`

### Agent B (rust-tauri-engineer, ZONE-SYSTEM)

**Allowed Files:**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/artifacts.rs` (add `artifact_apply_diff`)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/skills.rs` (add `skill_match_for_message`)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/chat/mod.rs` (skill injection, incognito, timeouts, semantic search)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/lib.rs` (register new commands)

### Agent C (backend-engineer, ZONE-B)

**Allowed Files (new):**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/services/artifactSharing.ts`

---

## DO NOT TOUCH Sections

These files must NOT be modified by any agent in this task:

| File | Reason |
|------|--------|
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/main.rs` | Core entry point |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/sse_parser.rs` | Keepalive mechanism is working correctly -- do not alter |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/skills/skill.rs` | Skill struct is stable -- add matching logic in commands layer, not here |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/tools/skill_tool.rs` | Tool definitions are stable |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/db/` | Database schema migrations need separate planning |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/editingStore.ts` | Used for file editing -- artifact editing should use its own types |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/types/chat.ts` | Shared chat types -- only modify via `chat/types.ts` for new fields |
| `/Users/siddhartha/Desktop/agiworkforce/packages/types/` | Shared package types -- modifications need consensus |
| `/Users/siddhartha/Desktop/agiworkforce/CLAUDE.md` | Project constitution |
| `/Users/siddhartha/Desktop/agiworkforce/MEMORY.md` | Persistent memory |

---

## Dependencies and Implementation Order

```
Phase 1 (No dependencies, can run in parallel):
  - Fix 6: Image gen timeout (Agent B only, self-contained)
  - Fix 4: Incognito mode (Agent A: types + store, Agent B: chat command)
  - Fix 3: Artifact sharing service (Agent C creates service)

Phase 2 (Depends on Phase 1 completion):
  - Fix 1: Inline artifact editing
    - Agent B creates artifact_apply_diff command first
    - Agent A builds UI and diffUtils after command is ready
    - Agent A adds Share button (depends on Agent C's service from Phase 1)

Phase 3 (Depends on Phase 1):
  - Fix 2: Skill auto-invocation
    - Agent B adds skill_match_for_message + injects into chat_send_message
    - Agent A adds settings toggle after Agent B's command exists

Phase 4 (Independent, can start anytime):
  - Fix 5: Chat history RAG search
    - Agent B adds search_chat_history_semantic
    - Agent A updates search UI
```

**Critical path**: Fix 6 (timeout) and Fix 4 (incognito) have NO cross-agent
dependencies and can start immediately. Fix 1 (inline editing) has the longest
chain: Agent B -> Agent A.

---

## Verification Checklist

- [x] All file paths verified to exist in the codebase
- [x] All interface contracts use types compatible with existing Tauri invoke patterns
- [x] No circular dependencies between agent scopes
- [x] DO NOT TOUCH sections clearly defined
- [x] New files are in appropriate directories per zone ownership
- [x] ArtifactDiff type is defined in artifactStore.ts (Agent A) and consumed as DiffHunk in artifacts.rs (Agent B)
- [x] Incognito flag uses `Option<bool>` in Rust and `boolean?` in TypeScript for backwards compatibility
- [x] Skill matching uses existing SkillsState -- no new Rust state objects needed
- [x] FTS5 semantic search extension reuses existing ChatSearchResult type for backwards compatibility
- [x] Image gen timeout fix only adds new constants and conditional logic -- no structural changes
