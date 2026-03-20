# VS Code Extension: Retrieval Strategy

**Status**: Draft v1 — Wave 1 Q2 2026
**Owner**: SYSTEM zone (VS Code Extension)
**Last updated**: 2026-03-19

---

## 1. Current State (Audit Findings)

### 1.1 Retrieval Components

The extension has **three retrieval components** that operate independently:

| Component | File | What It Provides |
|-----------|------|------------------|
| **WorkspaceIndexer** | `workspaceIndexer.ts` | File paths + top-level symbol names, keyword-scored |
| **ContextBuilder** | `contextBuilder.ts` | Active file, open tabs, diagnostics, git status, workspace tree |
| **ContextPanelProvider** | `contextPanelProvider.ts` | User-pinned files + auto-detected open tabs (UI only, not used in prompts) |

### 1.2 Current Limitations

#### File Count Cap
- `WorkspaceIndexer` indexes a maximum of **100 files** (hard-coded `MAX_FILES = 100`).
- A typical workspace has 500-5000 source files. At 100 files, the indexer covers 2-20% of the codebase.
- Files are returned by `vscode.workspace.findFiles` in arbitrary order — there is no prioritization of "important" files (entry points, configs, frequently edited).

#### Symbol Depth
- Symbols are limited to **top-level only** (kind <= `vscode.SymbolKind.Property`).
- No nested symbols: methods inside classes, functions inside modules, inner types.
- Cap: **5000 total symbols** across all files, **50 symbols per file**.
- Symbol names only — no signatures, no types, no parameter lists.

#### No Semantic Search
- Retrieval is **keyword-based**: the query is split on word boundaries, and each file is scored by how many query words appear in its path + symbol names.
- No embeddings, no TF-IDF, no BM25. A query like "handle authentication errors" will miss files named `auth.ts` with symbols like `verifyToken` unless "auth" appears in the query.
- No cross-reference awareness: if file A imports file B, querying about A's behavior will not surface B.

#### Context Budget
- `WorkspaceIndexer` output is capped at **2000 characters** (`MAX_CONTEXT_CHARS`).
- `ContextBuilder` git diff is capped at **2000 characters**, workspace tree at **1500 characters**, selection at **3000 characters**.
- Total context injected per request: roughly **5000-8500 characters** (~1500-2500 tokens).
- For models with 128k-1M context windows, this uses **0.1-2%** of available context — significantly underutilizing the model's capacity.

#### No File Content in Index
- The workspace index stores only file paths and symbol names, never file content.
- When the agent needs to understand a file, it must issue an `@read` directive, which costs a full round-trip.
- File reads in agent mode are capped at **10,000 characters** per file — insufficient for large files.

#### Stale Cache
- Cache TTL is **1 hour**. During active development, files change every few minutes.
- No incremental updates: a file save does not update the index.
- No file-watcher integration.

#### ContextPanelProvider is Disconnected
- The user can pin files in the Context Panel UI, but `ContextPanelProvider.getContextFiles()` is never called by `ContextBuilder` or `WorkspaceIndexer`. Pinned files are display-only.

---

## 2. Target Architecture: Retrieval v1

### 2.1 Design Principles

1. **Use what VS Code gives us**: VS Code already has language servers, symbol providers, reference providers, and a built-in file watcher. The retrieval layer should compose these APIs, not rebuild them.
2. **Context budget awareness**: Every token of context injected must earn its place. Measure retrieval quality by whether injected context reduces follow-up questions and edit conflicts.
3. **Incremental over batch**: Update the index on file save, not on a timer. Stale context is worse than no context.
4. **Respect the ContextPanel**: If the user pinned files, they are signaling relevance. Pinned files should always be included in context.

### 2.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                  Context Assembler                   │
│  (replaces getRelevantContext + buildFullContext)    │
│                                                      │
│  Inputs:                                             │
│  ├── Query text (user message)                       │
│  ├── Active file + selection                         │
│  ├── Pinned files (from ContextPanelProvider)        │
│  └── Conversation history (recent files mentioned)   │
│                                                      │
│  Sources:                                            │
│  ├── SymbolIndex  (file paths + full symbol tree)    │
│  ├── FileContentCache (recently read file snippets)  │
│  ├── DiagnosticsSnapshot (errors/warnings)           │
│  ├── GitSnapshot (status + recent diff)              │
│  └── ImportGraph (who imports whom)                  │
│                                                      │
│  Output:                                             │
│  └── ContextPayload (structured, budget-aware)       │
└─────────────────────────────────────────────────────┘
```

### 2.3 SymbolIndex (Replaces WorkspaceIndexer)

**What changes from current `WorkspaceIndexer`**:

| Aspect | Current | Target v1 |
|--------|---------|-----------|
| File cap | 100 files | 1000 files |
| Symbol depth | Top-level only | 2 levels (e.g., class.method) |
| Symbol info | Name only | Name + kind + line number |
| Scoring | Keyword substring match | Keyword match + recency + frequency |
| Cache | 1-hour TTL, full rebuild | Incremental (file-watcher based) |
| Update trigger | Manual (`isStale()` check) | `onDidSaveTextDocument` + `onDidCreateFiles` + `onDidDeleteFiles` |

**Implementation**:
- Use `vscode.workspace.createFileSystemWatcher('**/*.{ts,tsx,js,jsx,py,...}')` to watch for changes.
- On file change/create/delete, re-index only that file (not the full workspace).
- Store index in `ExtensionContext.workspaceState` (persists across sessions).
- Initial indexing: background, non-blocking, with progress indicator.

### 2.4 FileContentCache

A bounded LRU cache of recently-read file snippets:
- **Capacity**: 50 files, 500KB total.
- **Entry**: file path, content (or truncated content for large files), last-read timestamp.
- **Population**: populated on `@read` requests and on file opens. Not pre-populated.
- **Eviction**: LRU when capacity is exceeded.
- **Purpose**: avoid re-reading the same file across multiple agent turns.

### 2.5 ImportGraph (Phase 2)

A lightweight directed graph of file imports:
- Parse import/require statements from indexed files.
- When the user asks about file A, include files that A imports and files that import A in the context.
- Scope: TypeScript/JavaScript only in v1 (regex-based parsing). Other languages in v2.

### 2.6 Context Assembler

Replaces the current split between `WorkspaceIndexer.getRelevantContext()` and `ContextBuilder.buildFullContext()`. Single entry point:

```typescript
interface ContextAssemblerOptions {
  query: string;
  maxTokens: number;         // Context budget (default: 4000 tokens)
  includeGit: boolean;       // default: true
  includeDiagnostics: boolean; // default: true
  includeFileContent: boolean; // default: false (agent mode sets true)
}

interface ContextPayload {
  sections: ContextSection[];
  totalTokenEstimate: number;
  truncated: boolean;
}

interface ContextSection {
  label: string;            // e.g., "Active File", "Related Files", "Diagnostics"
  content: string;
  tokenEstimate: number;
  priority: number;         // 1 = highest. Sections are included in priority order.
}
```

**Priority order**:
1. Active file context (path, language, selection) — always included.
2. Pinned files (from ContextPanelProvider) — always included.
3. Diagnostics (errors first, then warnings) — included if budget allows.
4. Relevant symbols from SymbolIndex — scored by query relevance.
5. Related file content from FileContentCache — if budget allows.
6. Git status — included if budget allows.
7. Workspace structure — lowest priority, included only with remaining budget.

---

## 3. Phased Delivery

### Phase 1: Ship in 2 Weeks (Wave 2)

**Goal**: Fix the worst limitations without architectural changes.

1. **Raise file cap to 500**: Change `MAX_FILES` from 100 to 500. The `findFiles` call is fast; the bottleneck is `executeDocumentSymbolProvider` per file, so batch symbol requests with a concurrency limit of 10.

2. **Wire ContextPanelProvider into context assembly**: In `agentModeProvider.ts` and `chatParticipant.ts`, call `contextPanelProvider.getContextFiles()` and include pinned file paths + symbols in the context. This is a 10-line change.

3. **Raise context budget to model-aware**: Instead of a fixed 2000-char cap, compute the budget based on the selected model's context window. Use 3% of context window as the default budget (e.g., 3840 tokens for 128k, 30k tokens for 1M).

4. **Add file watcher for incremental updates**: Register `onDidSaveTextDocument` to re-index the saved file. Remove the 1-hour TTL staleness check.

5. **Increase file read cap**: Raise the 10,000-character cap in `readFiles()` to 50,000 characters, and add a truncation indicator in the message so the LLM knows content was cut.

**Estimated effort**: 3-4 days.

### Phase 2: Ship in 4 Weeks (Wave 3)

**Goal**: Implement the ContextAssembler with structured output.

1. **Build ContextAssembler class**: Single entry point replacing `getRelevantContext()` + `buildFullContext()`. Budget-aware section assembly.

2. **2-level symbol indexing**: Index class methods and nested function declarations. Store `name + kind + lineNumber`.

3. **Recency scoring**: Boost files that were recently opened, edited, or mentioned in conversation. Track "mention history" in the agent session.

4. **FileContentCache**: LRU cache of recently-read snippets. Pre-populate with pinned files on session start.

5. **Import graph (TypeScript/JavaScript)**: Regex-based import parsing. Include direct imports of the active file in context automatically.

**Estimated effort**: 2 weeks.

### Phase 3: Ship in 8 Weeks (Wave 4-5)

**Goal**: Semantic retrieval.

1. **Local embedding index**: Use a lightweight embedding model (e.g., `all-MiniLM-L6-v2` via ONNX runtime or the desktop bridge) to embed file chunks. Store embeddings in `workspaceState`.

2. **Semantic search**: On each query, embed the query and retrieve top-k similar chunks. Inject as "Related Code" context section.

3. **Cross-language import graph**: Extend import parsing to Python, Go, Rust.

4. **Workspace-level summarization**: Generate and cache a 500-token workspace summary (tech stack, entry points, key patterns) that is always included in the system prompt.

**Estimated effort**: 4-6 weeks.

---

## 4. Context Budget Specification

### 4.1 Budget Calculation

```
contextBudget = modelContextWindow * budgetPercent
```

| Model | Context Window | Budget (3%) | Budget (5%) |
|-------|---------------|-------------|-------------|
| claude-haiku-4.5 | 200k | 6000 tokens | 10000 tokens |
| claude-sonnet-4.6 | 200k | 6000 tokens | 10000 tokens |
| claude-opus-4.6 | 1M | 30000 tokens | 50000 tokens |
| gpt-5-nano | 128k | 3840 tokens | 6400 tokens |
| gpt-5.2 | 128k | 3840 tokens | 6400 tokens |
| gpt-5-pro | 256k | 7680 tokens | 12800 tokens |
| gemini-3-flash | 1M | 30000 tokens | 50000 tokens |
| gemini-3-pro | 2M | 60000 tokens | 100000 tokens |

**Default**: 3% for chat/inline commands, 5% for agent mode (where richer context reduces round-trips).

**User override**: `agiWorkforce.contextBudgetPercent` setting (1-20%).

### 4.2 Token Estimation

Use the 4-chars-per-token heuristic (already used in `tokenCounter.ts`). For more accurate estimation in Phase 3, integrate a fast tokenizer (tiktoken-compatible).

### 4.3 Budget Allocation Per Section

| Section | Priority | Min Budget | Max Budget |
|---------|----------|-----------|-----------|
| Active file context | 1 | 200 tokens | 500 tokens |
| Pinned files | 2 | 0 tokens | 2000 tokens |
| Diagnostics | 3 | 0 tokens | 500 tokens |
| Relevant symbols | 4 | 500 tokens | 3000 tokens |
| Related file content | 5 | 0 tokens | remaining budget |
| Git status | 6 | 0 tokens | 500 tokens |
| Workspace structure | 7 | 0 tokens | 400 tokens |

Sections are filled in priority order. Each section gets at least its minimum (if budget allows) before any section gets more than its minimum.

---

## 5. Quality Metrics

### 5.1 Metrics to Track

| Metric | Definition | Target |
|--------|-----------|--------|
| **Context hit rate** | % of agent turns where injected context was referenced in the LLM response | > 60% |
| **Read round-trips** | Average `@read` directives per agent session | < 3 (currently ~5-8) |
| **Patch conflict rate** | % of patches that fail due to stale/wrong context | < 5% |
| **Context budget utilization** | % of budget actually used | 50-90% |
| **Index freshness** | Average age of index entries at query time | < 5 minutes |
| **Index coverage** | % of workspace source files in the index | > 80% |
| **User pin rate** | % of sessions where user pins at least 1 file | Track for v1 baseline |

### 5.2 Measurement Approach

**Phase 1 (automated)**:
- Log `@read` counts per session via telemetry (already have `telemetry.ts`).
- Log context payload size (tokens) per request.
- Log patch success/failure counts.

**Phase 2 (heuristic)**:
- After each LLM response, scan for references to injected file paths. If the response mentions a file that was in the context, count as a "hit."
- Track cache hit rate in FileContentCache.

**Phase 3 (user signal)**:
- Add a thumbs-up/thumbs-down on context quality in the agent mode UI.
- Track correlation between context quality rating and patch success rate.

### 5.3 Alerting

- If `context hit rate` drops below 40% for a rolling 7-day window, surface a warning in the extension's output channel.
- If `read round-trips` averages above 8 per session, log a suggestion to increase context budget.

---

## 6. Integration Points

### 6.1 Agent Mode (`agentModeProvider.ts`)

- Replace `this.indexer.getRelevantContext(text)` and `getContextBuilder().buildFullContext()` with a single `contextAssembler.assemble(options)` call.
- Pass `includeFileContent: true` and `maxTokens: modelBudget * 0.05` (5% for agent mode).
- Include pinned files from ContextPanelProvider.

### 6.2 Chat Participant (`chatParticipant.ts`)

- Replace `getContextBuilder().buildFullContext()` with `contextAssembler.assemble(options)`.
- Pass `includeFileContent: false` (chat is conversational, not edit-focused) and `maxTokens: modelBudget * 0.03`.

### 6.3 Inline Commands (`extension.ts` → `runInlineCommand`)

- Currently injects no workspace context (only the selected text).
- Add lightweight context: active file path, diagnostics for the active file, 3 most relevant symbols.
- Budget: 500 tokens max.

### 6.4 Inline Completions (`inlineCompletionProvider.ts`)

- Currently uses no retrieval context.
- Phase 2: inject the 5 most relevant symbol names + the active file's import list.
- Budget: 200 tokens max (completions must be fast).

### 6.5 Desktop Bridge

- When the desktop bridge is connected, prefer its richer index (the desktop app has full-codebase embedding search).
- The extension should send its query to the bridge and receive context back, rather than building context locally.
- Fallback: if bridge is disconnected, use local retrieval.

---

## 7. Non-Goals

- **Full-text search**: VS Code already has `Ctrl+Shift+F`. The retrieval layer focuses on smart, query-relevant context assembly, not general search.
- **Language server replacement**: We use VS Code's built-in symbol providers. We do not implement our own language analysis.
- **Embedding model distribution**: In Phase 3, embeddings may come from the desktop bridge or an API. We do not ship an embedding model inside the extension.
- **Multi-root workspace support**: v1 targets single-root workspaces only.
