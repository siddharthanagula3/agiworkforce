# Feature: Memory

> Cross-session persistent memory -- the "Memory" feature that makes AGI Workforce remember users across conversations, with automatic LLM context injection, importance scoring, temporal decay, compaction, and a full management UI.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Rust Commands (core CRUD) | `sys/commands/memory.rs` -- all `#[tauri::command]` handlers; owns `MemoryState` and `ConversationSummarizerState` |
| Rust Commands (chat integration) | `sys/commands/chat_memory_integration.rs` -- chat-specific memory commands (load project memories, detect/save decisions, configure injection, log milestones/actions) |
| Rust Commands (chat handler) | `sys/commands/chat/memory_handler.rs` -- `ChatMemoryHandler` that bridges `MemoryManager` with `MemoryInjector` |
| Rust Commands (project memory) | `sys/commands/project_memory.rs` -- project-scoped memory commands (save/get project context, coding styles, architectural decisions) |
| Rust Core -- Manager | `core/agi/memory_manager.rs` -- SQLite-backed `MemoryManager`; two-layer: `user_memory` + `daily_logs`; decay, compaction, hybrid search, import/export |
| Rust Core -- In-Memory | `core/agi/memory.rs` -- `AGIMemory` volatile working memory (VecDeque, max 1000 entries, not persisted) |
| Rust Core -- LLM Integration | `core/llm/memory_integration.rs` -- `MemoryInjector`, `MemoryInjectionConfig`, decision regex detection, `format_memories()` |
| Rust Core -- Planner Integration | `core/agi/planner_memory_integration.rs` -- `PlannerMemoryIntegration` feeds memories into AGI planner prompts |
| Rust Core -- Summarizer | `core/agi/conversation_summarizer.rs` -- `ConversationSummarizer<HttpSummaryLLM>` auto-summarizes conversations; embedding 3-tier fallback |
| Rust Core -- Persistence | `core/agi/memory_persistence.rs` -- `MemoryStore` (separate SQLite store with vector embeddings, FTS5 hybrid search, project scoping) |
| Rust Core -- Search | `core/agi/semantic_search.rs` -- `TfIdfIndex` for in-memory semantic similarity (cosine similarity over sparse TF-IDF vectors) |
| Rust Core -- Tool Executor | `core/llm/tool_executor/memory_tools.rs` -- LLM tool implementations for `memory_remember`, `memory_recall`, `memory_search`, `memory_forget` |
| Store | `stores/memoryStore.ts` -- Zustand + Persist v2; `memories[]`, all CRUD actions, `buildMemoryContext()`, derived selectors, `pruneMemories()` |
| Hooks | `hooks/useMemory.ts` -- full CRUD + knowledge base + stats; auto-load on mount |
| Hooks | `hooks/useMemoryIntegration.ts` -- chat-focused: `saveChatMemory`, `saveArchitecturalDecision`, `getContextMemories`, `formatMemoriesForPrompt` |
| Components | `components/Memory/MemoryPanel.tsx` (Settings tab: enable/disable, auto-inject, token budget) |
| Components | `components/Memory/MemoryManager.tsx` (full CRUD list with search/sort/tabs) |
| Components | `components/Memory/MemoryCard.tsx` (single entry with inline importance editing) |
| Components | `components/Memory/MemorySearch.tsx` (debounced search with local/API modes) |
| Components | `components/Memory/CreateMemoryDialog.tsx` (creation form with category, topic, content, importance) |
| Components | `components/Memory/MemorySidebar.tsx` (compact chat widget showing important memories) |
| Components | `components/Memory/MemoryBrowserModal.tsx` (full-screen modal) |
| Components | `components/Memory/SaveToMemoryButton.tsx` (chat message action button) |
| Components | `components/Memory/MemoryBadge.tsx` (inline badge on saved messages) |
| Components | `components/Memory/MemoryImportanceIndicator.tsx` (visual importance indicator) |
| Components | `components/Memory/MemoryViewer.tsx` (alternative viewer) |
| Inline Chat Result | `components/UnifiedAgenticChat/InlineToolResults/InlineMemoryCard.tsx` (renders memory tool results inline in chat) |
| DB Migrations | `data/db/migrations.rs` -- migration v46 (create `user_memory` + `daily_logs`), migration v48 (add `last_accessed` column) |

## Data Flow

### 1. Storing a Memory (Manual, from UI)

1. User opens Settings -> Memory tab -> `MemoryPanel` renders. User clicks "Add Memory" to open `CreateMemoryDialog`.

2. User fills: category (preference / fact / decision / context), topic (max 100 chars), content (max 2000 chars), importance (1--10 slider, default 5), optional source.

3. `CreateMemoryDialog` calls `useMemory({ autoLoad: false }).store({ category, topic, content, importance, source })`.

4. `useMemory.store` calls `invoke('memory_store', { category, topic, content, importance, source })`.

5. Rust `memory_store` (alias for `memory_remember`) calls `parse_category(category)` to convert the string to `MemoryCategory` enum, then delegates to `MemoryManager.remember()`.

6. `MemoryManager.remember()` executes:
   ```sql
   INSERT INTO user_memory (category, topic, content, importance, source, updated_at)
   VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
   ON CONFLICT(category, topic) DO UPDATE SET
       content = excluded.content,
       importance = excluded.importance,
       source = excluded.source,
       updated_at = datetime('now')
   ```
   An existing memory with the same `(category, topic)` pair is replaced in-place. Returns the SQLite row ID as `i64`.

7. After the insert, the store calls `memoryStore.loadAll()` -> `invoke('memory_list_all')` -> `MemoryManager.export_all()` -> `SELECT * FROM user_memory ORDER BY category, topic`. The result is run through `pruneMemories()` before writing to Zustand state.

8. `pruneMemories()` enforces two caps: max 100 entries (oldest by `created_at` pruned first), max 1 MB total (UTF-16 estimate: `JSON.stringify(entry).length * 2`). Older entries are evicted first.

9. Sonner toast fires. `MemoryManager` (component) re-renders with the updated list.

### 2. Saving a Memory from Chat (`SaveToMemoryButton`)

1. Each assistant message in the chat UI shows `SaveToMemoryButton` in its action toolbar.

2. On click, the button calls `useMemoryStore.remember('context', firstSentence, content, 6)` directly -- `firstSentence` is `content.split(/[.!?\n]/)[0]?.slice(0, 80)`. This goes to `invoke('memory_remember', ...)`.

3. The button transitions to saved state (blue `BrainCog` icon) permanently for the component lifetime. Sonner toast fires "Saved to memory".

### 3. Memory Injection into LLM Context

Two parallel injection paths exist. The frontend path is active; the Rust path is built but not yet wired to the default chat pipeline.

**Path A -- Frontend (`buildMemoryContext`) [ACTIVE]:**

1. Before sending a chat message, `useSendMessage.ts` reads `readMemoryPanelSettings()` from `localStorage["agi-memory-panel-settings"]` (synchronous, no Zustand dependency).

2. If `isEnabled && autoInject`, `buildMemoryContext(memories, maxTokens)` is called:
   - Filters to `importance >= 5`
   - Sorts by importance descending
   - Greedily formats `- [category] topic: content` lines until the token budget is exhausted
   - Token estimate: `text.length / 4` (~4 chars per token)
   - Default budget: 500 tokens

3. The resulting string -- prefixed with `[User Memory -- from previous conversations]` -- is prepended to `mergedCustomInstructions` before the API call. This goes into the system prompt.

**Path B -- Rust (`MemoryInjector`) [AVAILABLE BUT NOT DEFAULT]:**

1. `MemoryInjector.load_project_memories(manager, project_path)` loads memories above `min_importance` (default 5), optionally supplements with project-name search results, deduplicates by ID, sorts by importance, and truncates to `max_memories` (default 10).

2. `format_memories()` groups by category in priority order (Decision -> Preference -> Fact -> Context) and formats a Markdown block with importance indicators (Critical/High/Medium/Low based on score ranges).

3. `build_system_prompt_enhancement()` builds a natural-language preamble referencing decisions, preferences, and facts.

4. Decision detection: `detect_decision(message)` applies two `LazyLock<Regex>` patterns to detect decision language (e.g., "decided to", "let's use", "architecture") and assigns importance 8--9.

**Path C -- Planner Integration (`PlannerMemoryIntegration`):**

1. `analyze_goal_memories(goal)` performs hybrid search against the goal string.
2. Categorizes results into `referenced_decisions`, `style_preferences`, `previous_solutions`, `architecture_patterns`.
3. `build_planner_system_prompt(goal)` generates a complete system prompt section with these memories.
4. `find_previous_solution(problem)` checks if a similar problem was solved before.
5. `save_solution(problem, solution)` persists new solutions as Fact memories for reuse.

### 4. LLM Tool Access to Memory

The LLM can directly read/write memories via tool calls (defined in `memory_tools.rs`):

| Tool | Function | Description |
|------|----------|-------------|
| `memory_remember` | `execute_memory_remember_tool` | Stores a memory; accepts both `key/value` (simple) and `category/topic/content` (full) formats |
| `memory_recall` | `execute_memory_recall_tool` | Recalls a specific memory by category+topic or key |
| `memory_search` | `execute_memory_search_tool` | Searches memories by query text, returns up to `limit` results |
| `memory_forget` | `execute_memory_forget_tool` | Deletes a memory by ID or by category+topic |

### 5. Searching Memories

Two search approaches:

**Frontend local search** (default in `MemoryManager` component):
- `MemorySearch.tsx` debounces input by 300 ms
- Filters `memories.filter(m => topic|content|category includes query)` -- no IPC call

**Backend search** (when `useApiSearch=true`):
- `invoke('memory_search', { query, limit })` -> `MemoryManager.search()` -> SQL `LIKE` search on `content` and `topic` columns, ordered by `importance DESC, updated_at DESC`

**TF-IDF semantic search** (via `MemoryManager.hybrid_search()`):
- `TfIdfIndex` builds sparse TF-IDF vectors from all memories (topic + content + category)
- Tokenization: lowercase, remove punctuation, filter stopwords, suffix-stripping stemmer
- Cosine similarity between query vector and document vectors
- Hybrid scoring: configurable blend of keyword weight (default 40%) and semantic weight (default 60%)
- Used by `PlannerMemoryIntegration.analyze_goal_memories()`

### 6. Memory Decay

1. `memory_run_decay` delegates to `MemoryManager.decay_memories()`.

2. Reads `DecayConfig` (defaults: enabled, 10% decay rate, 7-day period, min importance 1, access boost +1).

3. For each memory where `days_since_last_access >= decay_period_days`:
   - Decay amount = `importance * decay_rate * periods` (periods = days_since / period_days)
   - Capped so importance never drops below `min_importance`

4. Accessing a memory via `memory_recall_with_boost` or `memory_boost_on_access` increases importance by `access_boost` (capped at 10).

5. `last_accessed` column tracks access time (added in migration v48).

6. **Note:** Decay runs on-demand only -- no background scheduler is wired.

### 7. Memory Compaction (Daily Logs -> Long-term)

1. Daily log entries are appended via `memory_log_context` to the `daily_logs` table with types: Context / Action / Note / Milestone.

2. After 7+ days (configurable), `memory_get_compaction_candidates` identifies eligible dates.

3. `memory_get_extraction_prompt` builds an LLM prompt from logs in the date range.

4. An external LLM call (not managed by this feature) processes the prompt and returns `ExtractedMemory[]`, submitted via `memory_promote_extracted` -> `MemoryManager.promote_to_long_term()`.

5. `memory_archive_compacted_logs` marks or deletes processed daily logs.

6. **Note:** `memory_compact_old_logs` currently returns `MemoryCompactionResult { memories_created: 0, ... }` -- the LLM extraction step is a **stub**.

### 8. Conversation Summarization

1. `ConversationSummarizer<L: SummaryLLM>` wraps `MemoryStore` and an LLM backend.

2. `HttpSummaryLLM` implements `SummaryLLM` with 3-tier fallback for embeddings: Ollama local (nomic-embed-text, 768-dim) -> OpenAI cloud (text-embedding-3-small, 1536-dim) -> None.

3. `run_summarization(project_id)` finds conversations needing summarization, calls `extract_memories()` on each, and stores extracted memories in `persistent_memory` table via `MemoryStore.store()`.

4. Default extraction prompt instructs the LLM to return JSON with memories (topic, content, importance, category) and a summary.

5. Runs every 24 hours (configurable). Managed by `ConversationSummarizerState` in app state.

6. **Note:** `HttpSummaryLLM::extract_memories` returns empty -- needs full LLM wiring (documented as deferred in MEMORY.md).

### 9. Hydration on App Start

1. `useMemoryStore` uses Zustand Persist middleware (localStorage key `"agiworkforce-memory"`, version 2). Only `memories[]` is serialized via `partialize`.

2. On app boot, the persisted array is rehydrated. The v2 `migrate` function applies `pruneMemories()` to enforce limits on existing data.

3. `onRehydrateStorage` callback sets `_hasHydrated: true`. The exported `waitForMemoryHydration()` utility returns a Promise that resolves when this flag is set.

4. After hydration, the component lifecycle calls `loadAll()` to fetch fresh data from SQLite, overwriting the localStorage cache.

## SQLite Schema

### `user_memory` table (migration v46)

```sql
CREATE TABLE IF NOT EXISTS user_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK(category IN ('Preference', 'Fact', 'Decision', 'Context')),
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    importance INTEGER NOT NULL DEFAULT 5 CHECK(importance >= 1 AND importance <= 10),
    source TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_accessed TEXT DEFAULT CURRENT_TIMESTAMP,  -- added in v48
    UNIQUE(category, topic)
);
```

Indexes: `idx_user_memory_category`, `idx_user_memory_importance` (DESC), `idx_user_memory_updated` (DESC), `idx_user_memory_last_accessed`.

### `daily_logs` table (migration v46)

```sql
CREATE TABLE IF NOT EXISTS daily_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    entry_type TEXT NOT NULL DEFAULT 'context' CHECK(entry_type IN ('context', 'action', 'note', 'milestone')),
    content TEXT NOT NULL,
    metadata TEXT
);
```

Indexes: `idx_daily_logs_date`, `idx_daily_logs_type`.

### `persistent_memory` table (used by `MemoryStore` / summarizer)

```sql
CREATE TABLE IF NOT EXISTS persistent_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    embedding BLOB,                -- serialized Vec<f32>
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    project_id TEXT,               -- NULL = global memory
    summary TEXT,
    category TEXT NOT NULL DEFAULT 'context',
    importance INTEGER NOT NULL DEFAULT 5,
    topic TEXT NOT NULL DEFAULT '',
    source TEXT,
    last_accessed TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS persistent_memory_fts USING fts5(
    content, topic, summary,
    content=persistent_memory, content_rowid=id,
    tokenize='porter unicode61'
);
```

Indexes: `idx_persistent_memory_project`, `idx_persistent_memory_category`.

### `project_memories` table (used by `ProjectMemoryManager`)

```sql
CREATE TABLE IF NOT EXISTS project_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_folder TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    content TEXT NOT NULL,
    importance INTEGER NOT NULL DEFAULT 5,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_accessed TEXT,
    UNIQUE(project_folder, memory_type)
);
```

## Rust Commands (IPC)

### Core CRUD (`memory.rs`)

| Command | TS invoke name | Key Params | Return |
|---------|----------------|------------|--------|
| `memory_remember` | `memory_remember` | `category, topic, content: String; importance?: i32; source?: String` | `Result<i64>` (row ID) |
| `memory_store` | `memory_store` | same as above | `Result<i64>` (alias) |
| `memory_recall` | `memory_recall` | `category: String, topic: String` | `Result<Option<MemoryEntry>>` |
| `memory_recall_with_boost` | `memory_recall_with_boost` | `category: String, topic: String` | `Result<Option<MemoryEntry>>` (boosts importance) |
| `memory_search` | `memory_search` | `query: String, limit?: usize` | `Result<Vec<MemoryEntry>>` |
| `memory_get_by_category` | `memory_get_by_category` | `category: String, limit?: usize` | `Result<Vec<MemoryEntry>>` |
| `memory_get_important` | `memory_get_important` | `minImportance?: i32` (default 7) | `Result<Vec<MemoryEntry>>` |
| `memory_forget` | `memory_forget` | `memoryId: i64` | `Result<bool>` |
| `memory_forget_topic` | `memory_forget_topic` | `category: String, topic: String` | `Result<bool>` |
| `memory_delete` | `memory_delete` | `memoryId: i64` | `Result<bool>` (alias) |
| `memory_list_all` | `memory_list_all` | -- | `Result<Vec<MemoryEntry>>` |
| `memory_export_all` | `memory_export_all` | -- | `Result<Vec<MemoryEntry>>` |
| `memory_list_categories` | `memory_list_categories` | -- | `Result<Vec<String>>` (static: preference, fact, decision, context) |
| `memory_get_session_context` | `memory_get_session_context` | -- | `Result<String>` (recent logs + important memories) |
| `memory_get_stats` | `memory_get_stats` | -- | `Result<MemoryStats>` |

### Daily Logs

| Command | TS invoke name | Key Params | Return |
|---------|----------------|------------|--------|
| `memory_log_context` | `memory_log_context` | `content: String, entryType?: String, metadata?: String` | `Result<i64>` |
| `memory_get_daily_logs` | `memory_get_daily_logs` | `date: String` (YYYY-MM-DD) | `Result<Vec<DailyLogEntry>>` |
| `memory_cleanup_logs` | `memory_cleanup_logs` | `keepDays?: i32` (default 30) | `Result<usize>` (deleted count) |

### Decay Commands

| Command | TS invoke name | Key Params | Return |
|---------|----------------|------------|--------|
| `memory_run_decay` | `memory_run_decay` | -- | `Result<DecayResult>` |
| `memory_get_decay_config` | `memory_get_decay_config` | -- | `Result<DecayConfig>` |
| `memory_set_decay_config` | `memory_set_decay_config` | `enabled, decayRate, decayPeriodDays, minImportance, accessBoost` | `Result<()>` |
| `memory_get_decay_candidates` | `memory_get_decay_candidates` | -- | `Result<Vec<DecayCandidate>>` |
| `memory_boost_on_access` | `memory_boost_on_access` | `memoryId: i64` | `Result<i32>` (new importance) |
| `memory_decay_single` | `memory_decay_single` | `memoryId: i64, decayAmount: i32` | `Result<i32>` (new importance) |

### Compaction Commands

| Command | TS invoke name | Key Params | Return |
|---------|----------------|------------|--------|
| `memory_get_compaction_candidates` | `memory_get_compaction_candidates` | `config?: CompactionConfig` | `Result<Vec<CompactionCandidate>>` |
| `memory_get_logs_in_range` | `memory_get_logs_in_range` | `startDate?: String, endDate?: String` | `Result<Vec<DailyLogEntry>>` |
| `memory_compact_old_logs` | `memory_compact_old_logs` | `startDate?: String, endDate?: String` | `Result<MemoryCompactionResult>` (**stub**) |
| `memory_promote_extracted` | `memory_promote_extracted` | `memories: Vec<ExtractedMemory>` | `Result<usize>` |
| `memory_archive_compacted_logs` | `memory_archive_compacted_logs` | `dates: Vec<String>, deleteCompacted: bool` | `Result<usize>` |
| `memory_get_extraction_prompt` | `memory_get_extraction_prompt` | `startDate?, endDate?, config?: CompactionConfig` | `Result<String>` |
| `memory_get_compaction_stats` | `memory_get_compaction_stats` | -- | `Result<serde_json::Value>` |

### Export / Import

| Command | TS invoke name | Key Params | Return |
|---------|----------------|------------|--------|
| `memory_export_json` | `memory_export_json` | `path?: String` | `Result<serde_json::Value>` |
| `memory_export_markdown` | `memory_export_markdown` | `path?: String` | `Result<String>` |
| `memory_import_json` | `memory_import_json` | `path: String, strategy?: String` (skip/replace/merge) | `Result<ImportResult>` |
| `memory_import_json_string` | `memory_import_json_string` | `json: String, strategy?: String` | `Result<ImportResult>` |

### Dashboard Commands

| Command | TS invoke name | Key Params | Return |
|---------|----------------|------------|--------|
| `memory_get_dashboard_stats` | `memory_get_dashboard_stats` | -- | `Result<serde_json::Value>` (memory_stats + compaction_stats) |
| `memory_get_project_memories` | `memory_get_project_memories` | `projectName?: String, limit?: usize` | `Result<Vec<MemoryEntry>>` |
| `memory_get_usage_trends` | `memory_get_usage_trends` | -- | `Result<serde_json::Value>` |
| `memory_suggest_important` | `memory_suggest_important` | -- | `Result<Vec<MemoryEntry>>` (importance >= 9) |

### Chat Memory Integration (`chat_memory_integration.rs`)

| Command | TS invoke name | Key Params | Return |
|---------|----------------|------------|--------|
| `chat_load_project_memories` | `chat_load_project_memories` | -- (reads project context from state) | `Result<LoadProjectMemoriesResponse>` |
| `chat_detect_and_save_decision` | `chat_detect_and_save_decision` | `message: String` | `Result<Option<SaveDecisionResponse>>` |
| `chat_save_decision` | `chat_save_decision` | `message: String` | `Result<SaveDecisionResponse>` |
| `chat_configure_memory_injection` | `chat_configure_memory_injection` | `enabled: bool, maxMemories: usize, minImportance: i32` | `Result<()>` |
| `chat_get_memory_dashboard` | `chat_get_memory_dashboard` | -- | `Result<serde_json::Value>` |
| `chat_suggest_memories_for_review` | `chat_suggest_memories_for_review` | -- | `Result<serde_json::Value>` |
| `chat_prefetch_session_memories` | `chat_prefetch_session_memories` | -- | `Result<String>` |
| `chat_log_milestone` | `chat_log_milestone` | `description: String, metadata?: Value` | `Result<i64>` |
| `chat_log_action` | `chat_log_action` | `action: String, metadata?: Value` | `Result<i64>` |
| `chat_recall_memory` | `chat_recall_memory` | `category: String, topic: String, boostImportance?: bool` | `Result<Option<MemoryEntry>>` |
| `chat_search_memories` | `chat_search_memories` | `query: String, limit?: usize` | `Result<Vec<MemoryEntry>>` |

### Project Memory Commands (`project_memory.rs`)

| Command | TS invoke name | Key Params | Return |
|---------|----------------|------------|--------|
| `save_project_context` | `save_project_context` | `SaveProjectContextRequest` | `Result<i64>` |
| `get_project_context` | `get_project_context` | `projectFolder: String` | `Result<Option<ProjectContext>>` |
| `save_coding_style` | `save_coding_style` | `SaveCodingStyleRequest` | `Result<i64>` |
| `get_coding_styles` | `get_coding_styles` | `projectFolder: String` | `Result<Vec<CodingStyle>>` |
| `save_architectural_decision` | `save_architectural_decision` | `SaveArchitecturalDecisionRequest` | `Result<i64>` |
| `get_architectural_decisions` | `get_architectural_decisions` | `projectFolder: String, status?: String` | `Result<Vec<ArchitecturalDecision>>` |
| `get_project_memories` | `get_project_memories` | `projectFolder: String` | `Result<Vec<ProjectMemory>>` |
| `search_project_memories` | `search_project_memories` | `SearchMemoriesRequest` | `Result<Vec<ProjectMemory>>` |
| `update_memory_importance` | `update_memory_importance` | `memoryId: i64, importance: i32` | `Result<()>` |
| `delete_project_memory` | `delete_project_memory` | `memoryId: i64` | `Result<bool>` |
| `clear_project_memories` | `clear_project_memories` | `projectFolder: String` | `Result<usize>` |
| `get_project_memory_stats` | `get_project_memory_stats` | `projectFolder: String` | `Result<serde_json::Value>` |
| `auto_save_decision` | `auto_save_decision` | `projectFolder, decision, rationale: String` | `Result<i64>` |

## Store Schema

### `memoryStore.ts` (`useMemoryStore`)

Persisted to `localStorage["agiworkforce-memory"]` (version 2). Only `memories[]` is serialized via `partialize`.

```typescript
interface MemoryState {
  // Data
  memories: MemoryEntry[];
  isLoading: boolean;
  error: string | null;

  // Hydration tracking
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;

  // Actions
  remember: (category, topic, content, importance?) => Promise<number>;
  recall: (category, topic) => Promise<MemoryEntry | null>;
  search: (query, limit?) => Promise<MemoryEntry[]>;
  forget: (category, topic) => Promise<boolean>;
  getByCategory: (category) => Promise<MemoryEntry[]>;
  getImportant: (minImportance?) => Promise<MemoryEntry[]>;
  getSessionContext: () => Promise<string>;
  loadAll: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

interface MemoryEntry {
  id: number;
  category: 'preference' | 'fact' | 'decision' | 'context';
  topic: string;
  content: string;
  importance: number;  // 1-10
  source?: string;
  created_at: string;
  updated_at: string;
}
```

**Derived selectors:**
- `selectMemories` / `selectMemoryLoading` / `selectMemoryError` / `selectMemoryHasHydrated`
- `selectMemoriesByCategory(category)`
- `selectImportantMemories(minImportance)`
- `selectPreferences` / `selectFacts` / `selectDecisions` / `selectContextMemories`

**`buildMemoryContext(memories, maxTokens)`** -- standalone export for system prompt injection:
- Filters to `importance >= 5`, sorts descending
- Formats `- [category] topic: content` lines within token budget
- Returns `''` if nothing qualifies

**`readMemoryPanelSettings()`** -- reads from `localStorage["agi-memory-panel-settings"]`:
```typescript
interface MemoryPanelSettings {
  isEnabled: boolean;    // default true
  autoInject: boolean;   // default true
  maxTokens: number;     // default 500
}
```

### Memory Limits (AUDIT-006-024)

```typescript
const MEMORY_LIMITS = {
  maxEntries: 100,
  maxTotalSizeBytes: 1024 * 1024, // 1MB
};
```

`pruneMemories()` enforces both limits. Applied on `loadAll()` and during persist migration v2.

## Component Tree

```
SettingsPanel
  └── MemoryPanel                    -- Settings > Memory tab
        ├── Switch (isEnabled)
        ├── Switch (autoInject)
        ├── Slider (maxTokens)
        └── MemoryManager            -- Full CRUD list
              ├── MemorySearch       -- Debounced search input
              ├── Tabs (all/preference/fact/decision/context)
              ├── Select (sort options)
              ├── CreateMemoryDialog -- "Add" button opens dialog
              └── MemoryCard[]       -- Individual entries
                    ├── Badge (category)
                    ├── ImportanceStars (interactive editing)
                    ├── HighlightedText
                    └── ConfirmDialog (delete confirmation)

UnifiedAgenticChat
  ├── MessageBubble
  │     └── MessageActions
  │           └── SaveToMemoryButton -- Brain icon to save message
  ├── MemoryBadge                    -- Shown on saved messages
  ├── ToolTimeline
  │     └── InlineMemoryCard         -- Inline result when LLM uses memory tools
  └── InlinePanel
        └── MemorySidebar            -- Sidebar widget showing important memories
              └── CreateMemoryDialog

MemoryBrowserModal                   -- Full-screen modal (standalone)
```

## Key Patterns

### Importance Scoring (1-10)

| Range | Label | Indicator |
|-------|-------|-----------|
| 9-10 | Critical | Red |
| 7-8 | High | Yellow |
| 5-6 | Medium | Green |
| 1-4 | Low | Gray |

Default importance: 5 for manual entries, 6 for chat saves, 8 for detected decisions, 9 for architecture decisions.

### Importance Decay

Configurable via `DecayConfig`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `enabled` | `true` | Whether decay is active |
| `decay_rate` | `0.1` | 10% per period |
| `decay_period_days` | `7` | Days between decay applications |
| `min_importance` | `1` | Floor (memories never fully forgotten) |
| `access_boost` | `1` | Importance increase on access |

Formula: `decay_amount = importance * decay_rate * periods_since_access`

Access boost: `new_importance = min(current + access_boost, 10)`

### Search Architecture

Three tiers, from lightest to heaviest:

1. **Frontend local filter** -- substring match on `topic|content|category`, no IPC
2. **SQL `LIKE` search** -- `MemoryManager.search()` via `invoke('memory_search')`
3. **TF-IDF semantic search** -- `MemoryManager.hybrid_search()` using `TfIdfIndex`:
   - Tokenize: lowercase, remove punctuation, filter 100+ stopwords, suffix-stripping stemmer
   - Build sparse TF-IDF vectors per document
   - Cosine similarity for ranking
   - Hybrid blend: 40% keyword + 60% semantic (configurable via `SemanticSearchConfig`)

Additionally, `MemoryStore` (persistence layer) supports:
4. **Vector embedding search** -- `persistent_memory` table stores optional `embedding BLOB` (Vec<f32>)
5. **FTS5 full-text search** -- `persistent_memory_fts` virtual table with Porter tokenizer
6. **Hybrid search** -- 70% vector + 30% FTS (constants: `VECTOR_SEARCH_WEIGHT`, `FTS_SEARCH_WEIGHT`)

### Context Injection Budget

- Default token budget: 500 tokens
- User-configurable: 100-2000 tokens via slider in MemoryPanel
- Token estimation: `text.length / 4` (~4 chars per token)
- Memories sorted by importance, greedily packed until budget exhausted
- Only memories with `importance >= 5` are eligible

### Decision Detection (Regex)

Two patterns applied to chat messages:

1. Action verbs: `(decided|decided to|we'll|let's|I'll|use|implement|adopt|switch to|migrate to|prefer|choose)`
2. Architecture keywords: `(architecture|tech stack|technology stack|style guide|coding standard|convention|pattern)`

Match on pattern 1 -> importance 8. Match on "architecture"/"design"/"pattern" -> importance 9.

### Degraded State Pattern

`MemoryState::new_degraded()` creates an in-memory SQLite backend:
- All commands function normally but data is lost on restart
- `injection_config` disabled (`enabled: false, max_memories: 0, min_importance: 10`)
- Used when the real database path fails to initialize
- Same pattern used for `ConversationSummarizerState::new_degraded()` and `ProjectMemoryState::new_degraded()`

### Memory Categories

| Category | Enum Value | Use Case |
|----------|------------|----------|
| Preference | `MemoryCategory::Preference` | User preferences, style choices, likes/dislikes |
| Fact | `MemoryCategory::Fact` | Factual information, project details, technical facts |
| Decision | `MemoryCategory::Decision` | Architectural decisions, tool choices, design patterns |
| Context | `MemoryCategory::Context` | Conversational context, saved chat excerpts |

The `persistent_memory` system extends this with two additional categories:
- `Summary` -- summarized conversation content
- `Skill` -- learned patterns or techniques

### Export/Import Formats

**JSON export** (`MemoryExport`):
```json
{
  "version": "1.0",
  "exported_at": "2026-03-09T00:00:00Z",
  "memory_count": 42,
  "log_count": 128,
  "memories": [...],
  "daily_logs": [...]
}
```

**Markdown export**: Organized by category with importance indicators.

**Import strategies**:
- `skip` (default): Keep existing, skip duplicates
- `replace`: Overwrite existing with imported
- `merge`: Update only if imported is newer

## Known Issues / Tech Debt

1. **Compaction LLM step is a stub**: `memory_compact_old_logs` returns `memories_created: 0`. The extraction prompt is built but never sent to an LLM. The full pipeline requires wiring `memory_get_extraction_prompt` -> LLM call -> `memory_promote_extracted`.

2. **`HttpSummaryLLM::extract_memories` returns empty**: The conversation summarizer's LLM backend is implemented but `extract_memories` is not fully wired to parse LLM responses. Documented as deferred.

3. **Decay is on-demand only**: No background scheduler triggers `memory_run_decay`. It must be called explicitly by the frontend or a future scheduler integration.

4. **Two parallel storage systems**: `MemoryManager` (uses `user_memory` table) and `MemoryStore` (uses `persistent_memory` table with embeddings and FTS5) coexist but are not unified. The `MemoryManager` powers all frontend CRUD; `MemoryStore` powers the summarizer. This creates potential confusion about which system stores what.

5. **`AGIMemory` (working memory) is separate and volatile**: `core/agi/memory.rs` maintains a simple in-memory `VecDeque<MemoryEntry>` with max 1000 entries. This is used by the AGI runtime for within-session context but is completely separate from persistent memory. It has no IPC commands and is not surfaced in the UI.

6. **Frontend-only context injection**: The active memory injection path is JavaScript-only (`buildMemoryContext` in `useSendMessage.ts`). The Rust `MemoryInjector` and `PlannerMemoryIntegration` are implemented but not wired into the default chat send pipeline.

7. **`useMemory` hook `recall` method has signature mismatch**: The hook's `recall` expects `{ query, category?, limit? }` but the Rust `memory_recall` command expects `category + topic`. The hook invocation would fail for the `recall` path as written (it passes `query` where `category` is expected).

8. **No frontend UI for decay/compaction**: Decay configuration, decay execution, compaction candidates, and log archiving are all available as IPC commands but have no corresponding UI. These features are accessible only programmatically.

9. **`MemoryPanel` settings are in localStorage, not in Zustand**: The `isEnabled`/`autoInject`/`maxTokens` settings bypass the Zustand store entirely, stored in a separate localStorage key (`"agi-memory-panel-settings"`). This means they are not available to other stores or services without reading localStorage directly.

10. **Project memory is a third system**: `ProjectMemoryManager` (via `project_memory.rs`) uses a `project_memories` table separate from both `user_memory` and `persistent_memory`. It stores project context, coding styles, and architectural decisions per-project-folder. This adds a third memory system with its own schema.

11. **BUG-09 schema detection cached at construction**: `MemoryManager` probes `pragma_table_info` once at construction to check for `last_accessed` and `compacted` columns. If the schema changes at runtime (migration runs after `MemoryManager` is constructed), the cached flags would be stale. In practice this is safe because migrations run before state initialization.

12. **No cap on `user_memory` table size**: The Zustand store caps at 100 entries via `pruneMemories()`, but the SQLite `user_memory` table has no row limit. If many memories are created via Rust-only paths (e.g., LLM tool calls, auto-detection), the table can grow unbounded.
