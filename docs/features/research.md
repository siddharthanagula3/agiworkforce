# Sub-Feature: Research

> Multi-source deep research orchestration with LLM-powered query analysis, parallel search agents, citation tracking, and structured Markdown report generation.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Rust orchestrator | `apps/desktop/src-tauri/src/core/research/orchestrator.rs` |
| Rust types | `apps/desktop/src-tauri/src/core/research/types.rs` |
| Rust agents | `apps/desktop/src-tauri/src/core/research/agents.rs` |
| Rust citations | `apps/desktop/src-tauri/src/core/research/citation.rs` |
| Rust report gen | `apps/desktop/src-tauri/src/core/research/report.rs` |
| Rust web search config | `apps/desktop/src-tauri/src/core/research/web_search_config.rs` |
| Rust module root | `apps/desktop/src-tauri/src/core/research/mod.rs` |
| Rust tests | `apps/desktop/src-tauri/src/core/research/tests.rs` |
| Tauri commands | `apps/desktop/src-tauri/src/sys/commands/research.rs` |
| Search executor (fallback) | `apps/desktop/src-tauri/src/core/agi/executors/search_executor.rs` |
| State registration | `apps/desktop/src-tauri/src/lib.rs` (line ~544) |
| TS store (Zustand) | `apps/desktop/src/stores/researchStore.ts` |
| TS execution store | `apps/desktop/src/stores/executionStore.ts` (researchTasks record) |
| TS types | `apps/desktop/src/types/chat.ts` (`ResearchTask`, `ResearchStep`) |
| Research panel | `apps/desktop/src/components/Research/ResearchPanel.tsx` |
| Progress panel | `apps/desktop/src/components/Research/ResearchProgressPanel.tsx` |
| Report viewer | `apps/desktop/src/components/Research/ResearchReport.tsx` |
| History viewer | `apps/desktop/src/components/Research/ResearchHistory.tsx` |
| Source card | `apps/desktop/src/components/Research/SourceCard.tsx` |
| Source card (live) | `apps/desktop/src/components/Research/ResearchSourceCard.tsx` |
| Deep research (chat embed) | `apps/desktop/src/components/UnifiedAgenticChat/DeepResearchPanel.tsx` |
| Settings UI | `apps/desktop/src/components/Settings/ResearchSettings.tsx` |
| Chat integration | `apps/desktop/src/components/UnifiedAgenticChat/useSendMessage.ts` |
| Event listeners | `apps/desktop/src/components/UnifiedAgenticChat/useTauriStreamListeners.ts` |
| Focus mode entry | `apps/desktop/src/components/UnifiedAgenticChat/FocusModeButtons.tsx` |
| Focus selector | `apps/desktop/src/components/UnifiedAgenticChat/FocusSelector.tsx` |
| Barrel export | `apps/desktop/src/components/Research/index.ts` |

## Architecture Overview

The Research feature implements a multi-phase, multi-agent investigation pipeline inspired by Claude Desktop's research mode. The high-level flow is:

```
User query --> [Focus mode / Panel] --> invoke("research_start")
                                              |
                                   ResearchOrchestrator::research()
                                              |
                        +---------------------+---------------------+
                        |                     |                     |
                Phase 1: LLM           Phase 2: Search       Phase 3: Collect
              analyze_query()        execute_iteration()    deduplicate_results()
                        |                     |                     |
                Phase 4: LLM           Phase 5: Report
            synthesize_findings()    generate_report()
                        |
                   ResearchResult --> frontend via IPC return + events
```

Two entry points exist on the frontend:
1. **Standalone ResearchPanel** -- a dedicated panel with query input, mode selector, live progress, and report tabs.
2. **Chat-embedded deep research** -- triggered when the user selects the "Deep Research" focus mode in the unified chat. A `ResearchTask` is created in `executionStore` and a `DeepResearchPanel` widget renders inline inside the assistant message bubble.

Both paths call the same `research_start` Tauri command and listen to the same event channels.

## Research Orchestrator

**File:** `core/research/orchestrator.rs` (~1039 lines)

### ResearchSession

Tracks per-research state:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `String` | UUID-prefixed session ID (`research_<short-uuid>`) |
| `query` | `ResearchQuery` | Analyzed query with strategies |
| `progress` | `ResearchProgress` | Live progress for event emission |
| `results` | `Vec<SearchResult>` | Accumulated raw results |
| `citation_tracker` | `CitationTracker` | Dedup and number citations |
| `started_at` | `Instant` | Wall-clock start |
| `cancelled` | `Arc<AtomicBool>` | Cancellation flag (checked between phases) |

### Five-Phase Pipeline

| Phase | Method | Progress % | Description |
|-------|--------|-----------|-------------|
| 1. Analyzing Query | `analyze_query()` | 5% | Sends query to LLM, extracts topics, related terms, constraints, time windows, and 3-5 `SearchStrategy` objects (each specifying an `AgentType` and search terms). Falls back to a single web search strategy if LLM parsing fails. |
| 2. Searching | `execute_iteration()` x N | 10-70% | Iterates `mode.max_iterations()` times. Each iteration dispatches strategies to matching agents. Later iterations append `related_terms` for query expansion. Breaks early for Quick mode when >= 10 results. Checks timeout between iterations. |
| 3. Collecting | `deduplicate_results()` | 70% | URL-based and normalized-title-based deduplication. Keeps higher-relevance score on collision. Sorts by relevance descending. |
| 4. Synthesizing | `synthesize_findings()` | 80% | Sends top 20 results (truncated to 500 chars each) to LLM with a structured JSON prompt. Extracts summary, 5 key findings, 3-5 sections with per-section confidence, and overall confidence. |
| 5. Report Gen | `generate_report()` | 90% | Uses `ResearchReportGenerator` builder: sets summary, key findings, confidence, converts synthesis sections to `ReportSection` objects, adds citations from search results, computes sources-by-type breakdown. Calls `.build()` then `.render()` to produce final Markdown. |

Cancellation is cooperative -- checked via `session.is_cancelled()` between phases and iterations. On cancel, returns partial `ResearchResult` with `ConfidenceLevel::VeryLow` and a warning.

### Step Budgets by Mode

| Mode | max_iterations | max_sources_per_agent | Timeout | Duration Range |
|------|---------------|-----------------------|---------|----------------|
| Quick | 1 | 5 | 2 min | 30s - 2 min |
| Standard | 3 | 10 | 10 min | 2 - 10 min |
| Deep | 5 | 20 | 30 min | 5 - 30 min |
| Exhaustive | 10 | 50 | 60 min | 15 - 60 min |

## Search Agents

**File:** `core/research/agents.rs`

Five agent types implement the `SearchAgent` trait:

```rust
#[async_trait]
pub trait SearchAgent: Send + Sync {
    fn agent_type(&self) -> AgentType;
    fn is_available(&self) -> bool;
    fn name(&self) -> &str;
    async fn search(
        &self,
        strategy: &SearchStrategy,
        time_constraint: Option<&TimeConstraint>,
        max_results: usize,
    ) -> Result<SearchAgentResult, ResearchError>;
}
```

| Agent | `is_available()` | Implementation Status |
|-------|-----------------|----------------------|
| `WebSearchAgent` | Always `true` | **Functional.** Two paths: (1) If `.configure()` called with endpoint + API key, POSTs to that endpoint. (2) Otherwise, falls back to `SearchExecutor` which uses Perplexity API (if `PERPLEXITY_API_KEY` env var set) or DuckDuckGo/Brave HTML scraping. |
| `DocumentSearchAgent` | `true` if `search_paths` non-empty | **Functional but limited.** Walks directories (max depth 5), matches filenames against search terms. Returns `file://` URLs. No content extraction (PDF/DOCX parsing not wired). |
| `EmailSearchAgent` | `false` by default (needs `set_connected(true)`) | **Stub.** Returns empty results with a warning directing user to Settings > Integrations. Gmail/IMAP connectors are on roadmap. |
| `CalendarSearchAgent` | `false` by default | **Stub.** Same pattern as email -- returns empty with guidance. Google Calendar/Outlook connectors on roadmap. |
| `MemorySearchAgent` | `true` by default | **Stub.** Memory search backend not yet wired to persistent store. Returns empty with warning, degrades gracefully. |

### Search Executor (Web Fallback)

**File:** `core/agi/executors/search_executor.rs`

The `SearchExecutor` is the real web search engine used when `WebSearchAgent` is unconfigured. It supports five `SearchType` variants, each mapping to a Perplexity model:

| SearchType | Perplexity Model | Domain Filters |
|-----------|-----------------|----------------|
| General | Sonar | None |
| Code | SonarPro | github.com, stackoverflow.com, docs.rs, etc. |
| Academic | SonarReasoning | arxiv.org, scholar.google.com, pubmed, etc. |
| News | Sonar | reuters.com, bbc.com, techcrunch.com, etc. |
| Research | SonarDeepResearch | None |

Fallback chain: Perplexity API (if key available) --> Brave HTML scraping --> DuckDuckGo.

### Web Search Configuration

**File:** `core/research/web_search_config.rs`

Provides `WebSearchProvider` enum (`DuckDuckGo` | `Perplexity`) and `WebSearchConfig` struct. `create_web_search_agent()` and `configure_web_search_agent()` wire provider selection. Default is DuckDuckGo (no API key required). If Perplexity is selected without a key, falls back to DuckDuckGo with a warning.

## Citation System

**File:** `core/research/citation.rs`

### SourceType Enum

10 source types: `WebPage`, `Document`, `Email`, `CalendarEvent`, `Memory`, `AcademicPaper`, `NewsArticle`, `SocialMedia`, `CodeRepository`, `Unknown`. Each has a display string (`as_str()`) and a short prefix for citation IDs (`prefix()`).

### Citation Struct

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | Auto-generated as `{prefix}_{number}_{uuid}` |
| `number` | `usize` | Sequential citation number |
| `source_type` | `SourceType` | |
| `title` | `String` | |
| `url` | `Option<String>` | |
| `author` | `Option<String>` | |
| `date` | `Option<String>` | ISO format |
| `organization` | `Option<String>` | |
| `description` | `Option<String>` | |
| `relevance_score` | `f32` | 0.0-1.0 |
| `confidence` | `f32` | 0.0-1.0 |
| `cited_in_sections` | `Vec<String>` | Section IDs that reference this citation |
| `excerpt` | `Option<String>` | Raw content snippet |

Builder pattern: `Citation::new().with_url().with_author().with_date()...`

### CitationFormat

Four rendering formats:
- `Numbered`: `[1]`, `[2]` (default)
- `AuthorDate`: `(Smith, 2024)`
- `Footnote`: `^1`, `^2`
- `InlineLink`: `[title](url)`

### CitationTracker

Manages deduplication via two indexes:
- **URL index**: `HashMap<String, String>` (URL -> citation ID). Exact match.
- **Title index**: `HashMap<String, String>` (normalized title -> citation ID). Normalization: lowercase, strip non-alphanumeric except spaces, collapse whitespace.

On duplicate, updates `relevance_score` if the new citation has higher relevance but returns the existing marker. `next_number` is an `AtomicUsize` for safe sequential assignment.

Key methods: `add_citation()`, `all_citations()`, `by_relevance()`, `by_source_type()`, `cite_in_section()`, `generate_reference_list()`, `source_summary()`.

## Report Generation

**File:** `core/research/report.rs`

### ReportSection

Recursive structure supporting subsections:

```rust
pub struct ReportSection {
    id: String,
    heading: String,
    content: String,           // Markdown
    confidence: ConfidenceLevel,
    citations: Vec<String>,    // Citation IDs
    subsections: Vec<ReportSection>,
    order: usize,
}
```

Renders to Markdown with heading depth control (max `######`). Optionally appends confidence indicators like `[+]` (High) or `[=]` (Medium).

### ConfidenceLevel

Five levels with numeric scores and text indicators:

| Level | Score | Indicator |
|-------|-------|-----------|
| VeryLow | 0.2 | `[?]` |
| Low | 0.4 | `[~]` |
| Medium | 0.6 | `[=]` |
| High | 0.8 | `[+]` |
| VeryHigh | 1.0 | `[!]` |

`from_score()` maps numeric thresholds: >= 0.9 = VeryHigh, >= 0.7 = High, >= 0.5 = Medium, >= 0.3 = Low, else VeryLow.

### ResearchReportGenerator (Builder)

Builder pattern for constructing `ResearchReport`:

```rust
ResearchReportGenerator::new(query, mode)
    .with_summary(...)
    .with_key_findings(...)
    .with_confidence(...)
    .show_confidence_indicators(true)
    .with_duration(...)
    .with_sources_examined(...)
    .with_iterations(...)
    .add_section(...)
    .add_citation(...)
    .with_sources_by_type(...)
    .build()  // -> Result<ResearchReport>
```

`build()` sorts sections by order, recalculates overall confidence as average of section confidences, collects all citations from the tracker, and returns `ResearchReport`. The report's `render(show_confidence)` method produces the final Markdown string with: title, metadata header, confidence indicator, summary, key findings bullets, sections, sources list, and methodology footer.

## Rust Commands (IPC)

**File:** `sys/commands/research.rs`

### Managed State

`ResearchState` is `app.manage()`d at startup in `lib.rs`:

```rust
pub struct ResearchState {
    pub config: RwLock<ResearchConfig>,
    pub active_sessions: RwLock<HashMap<String, Arc<AtomicBool>>>,
}
```

### Commands

| Command | Signature | Description |
|---------|-----------|-------------|
| `research_start` | `(app, state, llm_state, request: ResearchRequest) -> Result<ResearchResponse, String>` | Main entry point. Validates query, merges config overrides, creates `ResearchOrchestrator` with shared `LLMRouter`, runs `research()`, emits `research:finding_added` and `research:source_added` per-item events, then returns `ResearchResponse`. |
| `research_cancel` | `(state, session_id) -> Result<bool, String>` | Sets the `AtomicBool` for the given session. Returns `true` if found. |
| `research_get_config` | `(state) -> Result<ResearchConfig, String>` | Returns current config. |
| `research_set_config` | `(state, config) -> Result<(), String>` | Updates config. |
| `research_get_modes` | `() -> Vec<Value>` | Returns static mode descriptions (not registered in lib.rs). |
| `research_quick` | `(app, state, llm_state, query) -> Result<ResearchResponse, String>` | Convenience wrapper: calls `research_start` with Quick mode. Not registered in lib.rs. |
| `research_check_availability` | `(state) -> Result<Value, String>` | Returns JSON with per-source availability (enabled + status). |

**Registered in lib.rs** (line ~1642): `research_start`, `research_cancel`, `research_get_config`, `research_set_config`, `research_check_availability`. Note: `research_get_modes` and `research_quick` are defined but **not registered** in the Tauri command list.

### ResearchRequest

```rust
pub struct ResearchRequest {
    pub query: String,
    pub mode: ResearchModeInput,        // quick | standard | deep | exhaustive
    pub config_overrides: Option<ResearchConfigOverrides>,
    pub task_id: Option<String>,        // alias "taskId" for frontend correlation
}
```

### ResearchResponse (returned to frontend)

```rust
pub struct ResearchResponse {
    pub session_id: String,
    pub query: String,
    pub mode: String,
    pub report: String,          // Full Markdown report
    pub summary: String,
    pub key_findings: Vec<String>,
    pub citations_count: usize,
    pub confidence: String,      // "high", "medium", etc.
    pub duration_secs: u64,
    pub sources_examined: usize,
    pub sources_cited: usize,
}
```

### Error Translation

`translate_research_error()` maps each `ResearchError` variant to a user-friendly string. Logs details via `tracing::warn`/`tracing::error` before returning the sanitized message.

## Store Schema

### researchStore.ts (Zustand + Immer + Persist)

```typescript
interface ResearchState {
  activeSession: {
    id: string | null;
    query: string;
    mode: ResearchModeId;
    status: 'idle' | 'researching' | 'complete' | 'error';
    progress: ResearchProgress | null;
    result: ResearchResponse | null;
    error: string | null;
    startedAt: number | null;
  };
  history: ResearchHistoryEntry[];     // Persisted, max 50 entries
  config: ResearchConfig | null;
  availability: ResearchAvailability | null;
  isConfigLoading: boolean;
  isHistoryLoading: boolean;
}
```

**Actions:** `startResearch()`, `cancelResearch()`, `resetSession()`, `updateProgress()`, `setError()`, `addToHistory()`, `clearHistory()`, `removeFromHistory()`, `loadConfig()`, `updateConfig()`, `checkAvailability()`, `initialize()`.

**Persistence:** Only `history` array is persisted (localStorage, version 1). Active session state is transient.

**Selectors:** `selectActiveSession`, `selectHistory`, `selectConfig`, `selectAvailability`, `selectIsResearching`, `selectHasResult`.

### executionStore.ts (Chat-Embedded Research)

```typescript
researchTasks: Record<string, ResearchTask>;
addResearchTask(task: ResearchTask): void;
updateResearchTask(id: string, updates: Partial<ResearchTask>): void;
```

The `ResearchTask` type (`types/chat.ts`):

```typescript
interface ResearchTask {
  id: string;
  query: string;
  progress: number;
  status: 'running' | 'completed' | 'failed';
  steps: ResearchStep[];
  findings: string[];
  sources: { title: string; url: string; domain?: string }[];
  timeElapsed?: string;
  timeRemaining?: string;
}

interface ResearchStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp?: number;
  details?: string;
}
```

## Component Tree

```
ResearchPanel (standalone, full-page)
  |-- Input + Select (mode picker)
  |-- Tabs
  |     |-- Progress tab
  |     |     |-- ProgressOverview (card with progress bar, sources count, iterations, elapsed)
  |     |     |-- ActiveAgents (badge per running agent with spinner)
  |     |-- Report tab
  |           |-- ResearchReport (summary card, confidence badge, key findings, collapsible full report)
  |-- IdlePlaceholder (when idle)
  |-- Error display

DeepResearchPanel (chat-embedded, inside MessageBubble)
  |-- Header (query, status badge, time elapsed, progress bar)
  |-- Current step indicator (animated)
  |-- Tabs
  |     |-- Process (step timeline with status circles and connector lines)
  |     |-- Findings (live list of findings as they arrive)
  |     |-- Sources (clickable source cards with favicon, domain, external link)

ResearchProgressPanel (alternative live progress widget)
  |-- Animated header with cancel button
  |-- Progress bar with source count + elapsed time
  |-- LiveSourceRow list (favicon, title, relevance dot)
  |-- Active agent badges

ResearchHistory (history browser)
  |-- Search input
  |-- HistoryCard list (query, summary, mode badge, confidence badge, date)
  |-- Detail dialog (full entry view with "Use This Research" action)

SourceCard (detailed source display)
  |-- Collapsible card with status icon, type icon, title, domain
  |-- RelevanceBadge (color-coded percentage)
  |-- Expandable: snippet, key points, "Open source" link

ResearchSourceCard (compact live source card)
  |-- Favicon + domain, title, snippet, relevance badge, external link

ResearchReport (standalone report viewer)
  |-- Summary card with confidence badge, action buttons (Copy, Export PDF, New Research)
  |-- Key findings list
  |-- Full Markdown report (react-markdown + remark-gfm)
  |-- Citations count footer

ResearchSettings (Settings panel section)
  |-- Perplexity API key input (SecretManager-backed)
  |-- Research mode selector
  |-- Max sources slider (1-20)
  |-- Show citations toggle
```

## Tauri Events

All events are emitted by the `ResearchOrchestrator` via `app.emit()`:

| Event Name | Payload | Emitter | Listener |
|-----------|---------|---------|----------|
| `research:progress` | `ResearchProgress` + `task_id` + `time_elapsed` + `time_remaining` | `emit_progress()` in orchestrator | `researchStore.initialize()`, `useTauriStreamListeners.ts` |
| `research:step_started` | `{ task_id, step_id, step_index, description }` | `emit_step_started()` | `useTauriStreamListeners.ts` (updates step to `running`) |
| `research:step_completed` | `{ task_id, step_id, step_index, success, details }` | `emit_step_completed()` | `useTauriStreamListeners.ts` (updates step to `completed`/`failed`) |
| `research:finding_added` | `{ task_id, finding }` | `research_start` command (post-completion) | `useTauriStreamListeners.ts` (appends to `findings[]`) |
| `research:source_added` | `{ task_id, source: { title, url, domain } }` | `research_start` command (post-completion) | `useTauriStreamListeners.ts` (appends to `sources[]`) |
| `research:complete` | `{ session_id, task_id, query, confidence, sources_count, duration_secs, time_elapsed, success }` | `emit_research_complete()` | (not explicitly listened in current frontend) |
| `research:completed` | Same payload as `research:complete` | `emit_research_complete()` (emits both) | `useTauriStreamListeners.ts` (sets all steps to completed, updates timeElapsed) |
| `research:error` | `{ task_id, query, error }` | `research_start` command (on error) | `researchStore.initialize()`, `ResearchPanel.tsx` |

**Note:** `research:finding_added` and `research:source_added` are emitted **after** the orchestrator returns (in the `research_start` command handler), iterating over the completed result's findings and citations. This means they arrive after `research:complete` -- the frontend accumulates them into the already-existing `ResearchTask`.

## Chat Integration Flow

When the user selects the "Deep Research" focus mode:

1. **FocusSelector.tsx** sets `focusMode = 'deep-research'` and enables `autonomousMode`.
2. **ChatInputArea.tsx** adds a "Deep Research" mode tag to the input area.
3. **useSendMessage.ts** (on submit):
   - Detects `focusMode === 'deep-research'`.
   - Generates a `researchTaskId` (`research-{timestamp}-{random}`).
   - Creates initial `ResearchTask` with 5 pre-defined steps: "Analyzing query and planning research strategy", "Searching for relevant sources", "Extracting key information", "Synthesizing findings", "Compiling final report".
   - Calls `executionStore.addResearchTask(task)`.
   - Adds `research_task_id: researchTaskId` to the IPC `metadata` sent with the chat message.
   - Creates assistant message with `metadata.type = 'deep-research-task'` and `metadata.taskId`.
4. **MessageBubble.tsx** checks `message.metadata?.type === 'deep-research-task'`, looks up the task from `executionStore.researchTasks`, and renders `DeepResearchPanel` inline.
5. **useTauriStreamListeners.ts** listens on all `research:*` events and updates the task in `executionStore` in real-time.

## Settings

**File:** `components/Settings/ResearchSettings.tsx`

Three user preferences stored via `set_user_preference` / `get_user_preference` IPC:
- `research_mode`: quick / standard / deep / comprehensive
- `research_max_sources`: 1-20 (slider)
- `research_citations`: boolean (show/hide citations toggle)

Perplexity API key stored via `secret_manager_set` / `secret_manager_has` / `secret_manager_delete` (encrypted via SecretManager -- Argon2id + AES-GCM, never plaintext).

## Key Patterns

### LLM-Powered Query Analysis
The orchestrator sends the raw query to the LLM with a structured JSON prompt requesting: refined query, topics, related terms, constraints, time constraints, and 3-5 search strategies with agent type, search terms, priority, and expected relevance. Falls back to a single web search strategy if parsing fails.

### Result Deduplication
Two-pass deduplication: (1) URL exact match, (2) normalized title match. On collision, keeps the entry with higher relevance score. Final results sorted by relevance descending.

### Citation Deduplication
`CitationTracker` prevents duplicate citations via URL and normalized-title indexes. On duplicate, updates relevance score if the new one is higher but reuses the existing citation number and marker.

### Confidence Aggregation
Overall report confidence is the average of all section confidence scores, mapped through `ConfidenceLevel::from_score()`. Individual section confidence comes from the LLM synthesis response.

### Error Recovery
- Each agent search is wrapped in a match -- failures produce `SearchAgentResult::failed()` with a warning but do not abort the pipeline.
- Only `AllAgentsFailed` (when every agent returns an error) terminates research.
- Timeout is checked between iterations; on timeout, the orchestrator proceeds to synthesis with whatever results are available.
- `translate_research_error()` converts all error variants to user-friendly messages, logging details server-side.

### Graceful Cancellation
Cancellation is cooperative via `Arc<AtomicBool>`. The session checks `is_cancelled()` between every phase and iteration. On cancel, returns partial results with `ConfidenceLevel::VeryLow` and a "Research was cancelled" warning.

### Event Correlation
The `task_id` field threads through the entire pipeline: it is set by the frontend (as `researchTaskId`), passed through `ResearchRequest.task_id`, attached to all emitted events via `orchestrator.with_task_id()`, and used by the frontend event listeners to update the correct `ResearchTask` in `executionStore`.

### Export
- **Markdown export** (ResearchPanel): Constructs a Markdown string and triggers browser download via `Blob` + `URL.createObjectURL`.
- **PDF export** (ResearchReport component): Imports `documentStore` lazily and calls `generatePdf()`.
- **Clipboard copy** (ResearchReport component): Uses `navigator.clipboard.writeText()` with toast feedback.

## Known Issues / Tech Debt

1. **`research_get_modes` and `research_quick` not registered.** Both commands are defined in `sys/commands/research.rs` but are not included in the `generate_handler!` macro in `lib.rs`. They are unreachable from the frontend.

2. **Email and Calendar agents are stubs.** `EmailSearchAgent` and `CalendarSearchAgent` always return empty results. The Gmail/IMAP and Google Calendar/Outlook connectors are on the roadmap but not yet implemented.

3. **MemorySearchAgent not wired.** Despite `available: true`, it logs a warning and returns empty results. Needs integration with the persistent memory store.

4. **DocumentSearchAgent is filename-only.** Matches search terms against filenames but does not extract or search file contents (PDF text extraction, DOCX parsing, etc.). Also, `search_paths` is never populated from user configuration -- the agent defaults to an empty path list, making `is_available()` return `false` unless explicitly configured.

5. **Finding/source events emitted post-completion.** `research:finding_added` and `research:source_added` are emitted in a loop *after* the orchestrator returns, not in real-time during search. This means the `DeepResearchPanel` sources and findings tabs only populate after research completes, not progressively.

6. **Sequential agent execution.** Despite the comment about "parallel using agent type", agents are executed sequentially in `execute_iteration()` due to lifetime constraints on the `SearchAgent` trait objects. True concurrent execution would require `Arc<dyn SearchAgent>` or spawning tasks.

7. **ResearchSettings mode mismatch.** The settings UI offers "comprehensive" as a mode name, while the backend uses "exhaustive". These are semantically equivalent but the naming is inconsistent.

8. **No research history persistence on backend.** Research history is only stored in the frontend Zustand store (localStorage). There is no SQLite-backed history on the Rust side, so history is lost on localStorage clear.

9. **Duplicate type definitions.** `ResearchProgress`, `ResearchResponse`, and `ResearchModeId` are defined in both `researchStore.ts` and `ResearchPanel.tsx`. The panel has its own local copies rather than importing from the store.

10. **LLM model not configurable at runtime.** `ResearchConfig` has `synthesis_model` and `analysis_model` fields, but `analyze_query()` and `synthesize_findings()` use `router.send_message()` which routes to the user's currently selected model, ignoring these fields.
