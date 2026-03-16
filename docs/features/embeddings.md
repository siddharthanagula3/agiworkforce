# Sub-Feature: Embeddings & RAG

> Two parallel embedding subsystems -- one for code-level semantic search (workspace indexing) and one for memory-level semantic retrieval (conversation/knowledge RAG) -- each with independent storage, providers, and search pipelines that converge in the agent planner and LLM context injection.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Embedding Service (mod) | `core/embeddings/mod.rs` -- `EmbeddingService` facade; `EmbeddingMetadata` struct; `Vector = Vec<f32>` type alias; 8 `#[tauri::command]` handlers defined inline |
| Embedding Generator | `core/embeddings/generator.rs` -- `EmbeddingGenerator` with Ollama API client; `EmbeddingModel` enum (3 models); `EmbeddingConfig`; batch generation |
| Code Chunker | `core/embeddings/chunker.rs` -- `CodeChunker` with 3 strategies (Fixed, Semantic, Hybrid); language-aware parsers for TS/JS, Rust, Python, Go; `ChunkType` enum |
| Similarity Search | `core/embeddings/similarity.rs` -- `SimilaritySearch` with SQLite storage; `cosine_similarity()`; `SearchResult`; model-scoped search; bincode serialization |
| Embedding Cache | `core/embeddings/cache.rs` -- `EmbeddingCache` with in-memory LRU (1000 max) + SQLite metadata; `CacheStats` |
| Incremental Indexer | `core/embeddings/indexer.rs` -- `IncrementalIndexer` with workspace discovery; 15 supported file extensions; 13 ignore patterns; progress tracking |
| Memory Persistence (vectors) | `core/agi/memory_persistence.rs` -- `MemoryStore` with `hybrid_search()`, `vector_search()`, `fts_search()`; `PersistentMemory` with optional `embedding: Option<Vec<f32>>`; FTS5 + vector BLOB storage |
| Conversation Summarizer | `core/agi/conversation_summarizer.rs` -- `HttpSummaryLLM` with 3-tier embedding fallback (Ollama -> OpenAI -> None); `SummaryLLM` trait; `normalize_embedding_dim()` |
| TF-IDF Semantic Search | `core/agi/semantic_search.rs` -- `TfIdfIndex` with sparse vectors, Porter-like stemmer, stopword filtering; `SemanticSearchConfig` (40% keyword / 60% semantic default) |
| RAG System | `core/agent/rag_system.rs` -- `RAGSystem` with `CodeChunk`, `DocChunk`, `Experience` indexes; `RAGContext::to_prompt()` for LLM injection |
| Memory Manager (legacy) | `core/agi/memory_manager.rs` -- `MemoryManager` with `hybrid_search()` using `TfIdfIndex`; two-layer memory (user_memory + daily_logs) |
| Planner Memory Integration | `core/agi/planner_memory_integration.rs` -- `PlannerMemoryIntegration` feeds hybrid search results into AGI planner (decisions, preferences, solutions, patterns) |
| Knowledge Base | `core/agi/knowledge.rs` -- `KnowledgeBase` with separate SQLite store; category-based retrieval |
| LLM Memory Tools | `core/llm/tool_executor/memory_tools.rs` -- `memory_remember`, `memory_recall` tool implementations callable by LLMs |
| IPC Commands (embeddings) | `sys/commands/embeddings.rs` -- re-exports all 8 embedding commands from `core/embeddings/mod.rs`; no wrapper state |
| IPC Commands (code search) | `sys/commands/code_search.rs` -- `grep_search`, `glob_search`, `format_file`, `format_detect` (non-embedding code search) |
| Frontend API | `src/api/embeddings.ts` -- TypeScript wrappers for all 8 embedding IPC commands with timeouts and validation |
| Frontend Hook | `src/hooks/useMemory.ts` -- `useMemory()`, `useMemoryStats()`, `useKnowledgeBase()` hooks for memory CRUD and knowledge base |
| State Registration | `lib.rs` -- `EmbeddingService::new()` with degraded and in-memory degraded fallbacks; managed as `Arc<TokioMutex<EmbeddingService>>` |

## Architecture Overview

There are **two distinct embedding/search subsystems** that serve different purposes:

### Subsystem 1: Code Embeddings (workspace indexing)

```
File on disk
    |
    v
CodeChunker (Semantic/Hybrid/Fixed strategy)
    |  Parses into CodeChunks by language (TS, Rust, Python, Go)
    v
EmbeddingGenerator (Ollama API: nomic-embed-text -> mxbai-embed-large -> fastembed fallback)
    |  Generates Vec<f32> per chunk
    v
SimilaritySearch (SQLite: embeddings table)
    |  Stores as bincode-serialized BLOB with model_id tagging
    v
EmbeddingCache (in-memory LRU + SQLite metadata)
    |
    v
semantic_search_codebase (Tauri command)
    |  Generates query embedding, cosine similarity search, model-scoped
    v
Frontend (api/embeddings.ts)
```

### Subsystem 2: Memory Embeddings (conversation/knowledge RAG)

```
Conversation content / User input
    |
    v
ConversationSummarizer (HttpSummaryLLM)
    |  LLM extracts memories + generates embeddings
    |  3-tier: Ollama nomic-embed-text -> OpenAI text-embedding-3-small -> None
    v
MemoryStore (SQLite: persistent_memory table)
    |  Stores embedding as BLOB alongside FTS5 index
    |  In-memory FIFO cache (max 1000 embeddings)
    v
hybrid_search() -- 70% vector + 30% FTS5 BM25
    |
    v
PlannerMemoryIntegration / MemoryInjector
    |  Injects relevant memories into LLM system prompt
    v
LLM generates response with RAG context
```

### Subsystem 3: In-Memory TF-IDF (lightweight fallback)

```
MemoryManager (user_memory table)
    |
    v
TfIdfIndex (in-memory sparse vectors)
    |  Tokenize -> stem -> TF-IDF -> cosine similarity
    |  SemanticSearchConfig: 40% keyword + 60% semantic
    v
SemanticSearchResult (combined_score)
```

## Embedding Providers

### Code Embeddings (EmbeddingGenerator)

| Tier | Provider | Model | Dimensions | Endpoint | Fallback Behavior |
|------|----------|-------|------------|----------|-------------------|
| 1 | Ollama (local) | `nomic-embed-text` | 768 | `http://localhost:3000/api/embed` | Primary; tests connection on init |
| 2 | Ollama (local) | `mxbai-embed-large` | 1024 | Same endpoint, different model | Alternative model option |
| 3 | fastembed (local) | `all-MiniLM-L6-v2` | 384 | In-process | **Stub only** -- returns error with install instructions |

The `EmbeddingModel` enum defines three variants, but `generate_fastembed()` is a stub that returns an error directing users to install Ollama. The default model is `OllamaNomicEmbedText`. The Ollama URL defaults to `http://localhost:3000` (note: this differs from the standard Ollama port `11434` used in `HttpSummaryLLM`).

Each embedding is tagged with a `model_id` string (e.g., `"ollama:nomic-embed-text"`) to prevent cross-model vector space contamination. `search_with_model()` filters stored embeddings by `model_id` before computing cosine similarity.

### Memory Embeddings (HttpSummaryLLM)

| Tier | Provider | Model | Dimensions | Endpoint | Fallback Behavior |
|------|----------|-------|------------|----------|-------------------|
| 1 | Ollama (local) | `nomic-embed-text` | 768 | `http://localhost:11434/api/embed` | 5s timeout; pads to 1536-dim |
| 2 | OpenAI (cloud) | `text-embedding-3-small` | 1536 | `https://api.openai.com/v1/embeddings` | Requires API key; 10s timeout |
| 3 | None | -- | -- | -- | Returns `None` (NOT zero vectors); FTS-only search |

The `normalize_embedding_dim()` function pads shorter vectors with zeros or truncates longer ones to `DEFAULT_EMBEDDING_DIM = 1536`. This ensures all stored embeddings have consistent dimensions for cosine similarity.

**Critical invariant**: Tier 3 returns `None`, never zero vectors. Zero vectors would corrupt similarity search by yielding 0.0 cosine similarity for all comparisons, making them invisible garbage in the index.

### Memory Extraction LLM

`HttpSummaryLLM::extract_memories()` also uses a 2-tier LLM fallback for the actual extraction:
1. Ollama local (`llama3.2`, `/api/chat`, JSON format, 60s timeout)
2. OpenAI cloud (`gpt-4o-mini`, `/v1/chat/completions`, JSON response format, 30s timeout)

## Storage

### Code Embeddings Database

Location: `{workspace_root}/.agi/embeddings.db` (or temp dir for degraded mode)

**Schema** (`embeddings` table):
```sql
CREATE TABLE embeddings (
    id TEXT PRIMARY KEY,          -- "{file_path}:{chunk_index}:{start_line}"
    file_path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    language TEXT NOT NULL,
    symbol_name TEXT,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    embedding BLOB NOT NULL,      -- bincode-serialized Vec<f32>
    dimensions INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    model_id TEXT                  -- migration-added; e.g. "ollama:nomic-embed-text"
);
-- Indexes: idx_embeddings_file_path, idx_embeddings_language, idx_embeddings_model_id
```

**Cache Database** (`embedding_cache.db`):
```sql
CREATE TABLE cache_metadata (
    key TEXT PRIMARY KEY,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
```

The in-memory cache holds up to 1000 `CachedEmbedding` entries with LRU eviction.

### Memory Embeddings Database

Location: Application data directory (via `MemoryStore`)

**Schema** (`persistent_memory` table):
```sql
CREATE TABLE persistent_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    embedding BLOB,               -- little-endian f32 array (4 bytes per float)
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    project_id TEXT,
    summary TEXT,
    category TEXT NOT NULL DEFAULT 'context',
    importance INTEGER NOT NULL DEFAULT 5,
    topic TEXT NOT NULL DEFAULT '',
    source TEXT,
    last_accessed TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE persistent_memory_fts USING fts5(
    content, topic, summary,
    content=persistent_memory,
    content_rowid=id,
    tokenize='porter unicode61'
);
-- Indexes: idx_persistent_memory_project, idx_persistent_memory_category
```

Embeddings are serialized with `f32::to_le_bytes()` (4 bytes per float) and deserialized with `f32::from_le_bytes()`. A `MEM-010` fix validates blob length is a multiple of 4 bytes before deserialization.

The in-memory embedding cache (`embedding_cache: RwLock<HashMap<i64, Vec<f32>>>`) uses FIFO eviction (MEM-015 fix) with a `cache_order: RwLock<VecDeque<i64>>` tracking insertion order. Max size: 1000 entries.

### RAG System Storage

`RAGSystem` uses in-memory `HashMap` indexes (not persisted):
- `code_index: HashMap<String, CodeChunk>`
- `doc_index: HashMap<String, DocChunk>`
- `experience_index: HashMap<String, Experience>`

### Knowledge Base

Location: `{data_dir}/agiworkforce/knowledge.db`

Separate SQLite database for structured knowledge entries with category, importance, and access tracking.

## Semantic Search

### Code Search (SimilaritySearch)

1. **Query embedding**: `EmbeddingGenerator.generate(query)` produces a `Vec<f32>`.
2. **Model scoping**: `search_with_model()` filters the `embeddings` table by `model_id` to avoid cross-model comparisons.
3. **Brute-force scan**: All matching rows are loaded, each embedding is deserialized from bincode BLOB, and cosine similarity is computed against the query vector.
4. **Ranking**: Results are sorted by similarity (descending) and truncated to `limit` (default 10).
5. **File-scoped search**: `search_in_file()` restricts to a single file path.

Cosine similarity formula:
```
similarity = dot(a, b) / (||a|| * ||b||)
```
Returns 0.0 for mismatched dimensions or zero-norm vectors.

### Memory Hybrid Search (MemoryStore)

`hybrid_search()` combines two signals with configurable weights:

1. **FTS5 search** (30% weight, `FTS_SEARCH_WEIGHT = 0.30`):
   - Uses SQLite FTS5 with `BM25` scoring and `porter unicode61` tokenizer.
   - Query words are quoted and joined with `OR` for broad matching.
   - BM25 scores are normalized to [0, 1] by dividing by the max score.
   - MEM-017 fix: Uses absolute value of BM25 score for cross-version SQLite compatibility.

2. **Vector search** (70% weight, `VECTOR_SEARCH_WEIGHT = 0.70`):
   - Loads all rows where `embedding IS NOT NULL` (capped at `MAX_VECTOR_SEARCH_CANDIDATES = 10,000` -- MEM-016 fix).
   - Pre-filters by `importance DESC, updated_at DESC` as a relevance proxy.
   - Computes cosine similarity for each embedding against the query vector.
   - Filters out similarity <= 0.0.
   - Clears embeddings from returned results to reduce memory.

3. **Merge**:
   - Results from both sources are merged by memory `id`.
   - Combined score = `fts_score * 0.30 + vector_score * 0.70`.
   - Final sort by `combined_score` descending, truncated to `limit`.

### TF-IDF In-Memory Search (MemoryManager)

`TfIdfIndex` provides a lightweight fallback for the `MemoryManager` (user_memory layer):

1. **Tokenization**: Lowercase, split on non-alphanumeric, filter stopwords (99 English stopwords), simple Porter-like suffix stripping (28 suffix rules).
2. **Indexing**: Augmented TF (0.5 + 0.5 * tf/max_tf) * smoothed IDF (ln((N+1)/(df+1)) + 1).
3. **Sparse vectors**: `SparseVector` with sorted `(term_index, weight)` pairs and pre-computed L2 norm.
4. **Search**: Query vectorized with same pipeline; merge-style iteration for sparse cosine similarity.
5. **Hybrid scoring**: `SemanticSearchConfig` defaults to 40% keyword + 60% semantic weight, with min similarity threshold of 0.1.

## Code Embeddings

### Chunking Strategies

The `CodeChunker` supports three strategies:

| Strategy | Description | Used By |
|----------|-------------|---------|
| `Fixed { size, overlap }` | Sliding window over lines | Fallback for unknown languages |
| `Semantic` | Language-aware parsing using regex (function/class/struct/impl boundaries) | `generate_code_embeddings` command |
| `Hybrid { max_size }` | Semantic first, then splits oversized chunks with Fixed(max_size, overlap=10) | `IncrementalIndexer` (max_size=100) |

Language-specific parsers:
- **TypeScript/JavaScript**: Detects `function`, `class`, `const fn`, arrow functions; tracks brace depth.
- **Rust**: Detects `fn`, `struct`, `impl`; tracks brace depth.
- **Python**: Detects `def`, `class`; uses indentation level for scope detection.
- **Go**: Detects `func` (with receiver), `type struct`; tracks brace depth.
- **Other**: Falls back to `Fixed { size: 50, overlap: 10 }`.

The `count_braces()` helper handles string literal awareness (skips braces inside `"..."` or `'...'`).

### Workspace Indexing

`IncrementalIndexer` provides full workspace and incremental file indexing:

- **File discovery**: `walkdir` traversal, respecting 13 ignore patterns (node_modules, .git, target, dist, build, .next, .vscode, .idea, __pycache__, .pytest_cache, coverage, .turbo, .agi).
- **Supported extensions**: ts, tsx, js, jsx, rs, py, go, java, cpp, c, cs, rb, php, swift, kt (15 languages).
- **Re-indexing**: `on_file_changed()` deletes existing embeddings for the file, then re-chunks and re-embeds.
- **Deletion**: `on_file_deleted()` removes all embeddings for the file path.
- **Progress tracking**: `IndexingProgress { total_files, indexed_files, current_file, is_complete }`.

## Rust Commands (IPC)

All embedding commands are registered in `lib.rs` and re-exported via `sys/commands/embeddings.rs`.

| Command | Parameters | Return | Description |
|---------|-----------|--------|-------------|
| `generate_code_embeddings` | `filePath: string, content: string` | `number` (chunks generated) | Chunk file semantically, generate embeddings, store in SimilaritySearch |
| `semantic_search_codebase` | `query: string, limit?: number` | `SearchResult[]` | Generate query embedding, model-scoped cosine similarity search |
| `get_embedding_stats` | -- | `EmbeddingStats` | Total embeddings count + cache hit/miss/size stats |
| `index_workspace` | -- | `void` | Full workspace indexing via IncrementalIndexer |
| `index_file` | `filePath: string` | `void` | Single file indexing |
| `get_indexing_progress` | -- | `IndexingProgress` | Current indexing status |
| `on_file_changed` | `filePath: string` | `void` | Re-index a changed file |
| `on_file_deleted` | `filePath: string` | `void` | Remove embeddings for a deleted file |

**Non-embedding code search commands** (in `sys/commands/code_search.rs`):

| Command | Parameters | Return | Description |
|---------|-----------|--------|-------------|
| `grep_search` | `pattern, root?, includePattern?, caseInsensitive?` | `GrepSearchResult` | Regex search across files (max 500 matches) |
| `glob_search` | `pattern, root?, limit?` | `GlobSearchResult` | Glob file matching (max 1000, sorted by mtime) |
| `format_file` | `path, projectRoot?` | `FormatResult` | Auto-format a file by extension |
| `format_detect` | `path, projectRoot?` | `FormatterInfo` | Detect which formatter would be used |

### Frontend API (`src/api/embeddings.ts`)

TypeScript wrappers with timeout guards:

| Function | Timeout | Validation |
|----------|---------|------------|
| `semanticSearchCodebase(query, limit?)` | 30s | Non-empty query; positive integer limit |
| `generateCodeEmbeddings(filePath, content)` | 120s | Non-empty path; no control chars; content <= 10MB |
| `getEmbeddingStats()` | 30s | -- |
| `indexWorkspace()` | 600s (10min) | -- |
| `indexFile(filePath)` | 120s | Path validation |
| `getIndexingProgress()` | 30s | -- |
| `onFileChanged(filePath)` | 120s | Path validation |
| `onFileDeleted(filePath)` | 30s | Path validation |

## Key Patterns

### 1. Graceful Degradation

The `EmbeddingService` initializes with a staged fallback when the primary service is unavailable:
- First tries the normal filesystem-backed service.
- Falls back to `new_degraded()` with temp-dir SQLite databases.
- Falls back again to `new_in_memory_degraded()` if even the degraded filesystem path cannot be created.
- Registered in `lib.rs` as `Arc<TokioMutex<EmbeddingService>>`, which matches the Tauri command signatures exactly.
- Pattern mirrors other degraded states (`MemoryState::degraded()`, `MasterPasswordState::degraded()`, etc.).

### 2. Model-Scoped Vector Spaces

Each embedding is tagged with `model_id` (e.g., `"ollama:nomic-embed-text"`). The `search_with_model()` method filters by model before computing similarity. This prevents comparing 768-dim Ollama vectors against 384-dim fastembed vectors.

Migration: The `model_id` column is added via `ALTER TABLE` in `init_schema()` for databases created before model tracking was introduced.

### 3. Never Zero Vectors

`HttpSummaryLLM::generate_embedding()` returns `Option<Vec<f32>>`:
- `Some(vec)` when an embedding provider succeeds.
- `None` when all providers fail.
- **Never** a zero vector (all 0.0 floats), which would silently corrupt similarity search.

### 4. Dimension Normalization

`normalize_embedding_dim()` pads shorter vectors with zeros or truncates longer ones to `DEFAULT_EMBEDDING_DIM = 1536`. This allows mixing Ollama 768-dim embeddings with OpenAI 1536-dim embeddings in the same `persistent_memory` table. (Note: zero-padding reduces effective similarity but maintains dimensional compatibility.)

### 5. Batch Processing

`EmbeddingGenerator::generate_batch()` processes texts sequentially (no parallelism). Each call makes an HTTP request to Ollama's `/api/embed` endpoint.

### 6. FIFO Cache Eviction (MEM-015)

The `MemoryStore` embedding cache uses a `VecDeque<i64>` to track insertion order. When the cache exceeds 1000 entries, the oldest entry (front of deque) is evicted. Both `cache_embedding()` and `remove_from_cache()` maintain cache + order consistency.

### 7. FTS5 Query Escaping

`escape_fts_query()` strips special characters and wraps each word in quotes joined by `OR`:
- Input: `"hello world"` -> Output: `"hello" OR "world"`
- This prevents FTS5 operator injection while providing broad matching.

### 8. RAG Context Injection

`RAGContext::to_prompt()` formats retrieved code chunks as markdown code blocks under a `## Relevant Code Examples` header. The `PlannerMemoryIntegration` categorizes retrieved memories into decisions, preferences, solutions, and architecture patterns, weighted by similarity confidence.

## Known Issues / Tech Debt

1. **Port mismatch**: `EmbeddingConfig::default()` uses `http://localhost:3000` for Ollama, while `HttpSummaryLLM::new()` uses `http://localhost:11434` (the standard Ollama port). The code embedding subsystem may fail to connect if Ollama runs on the standard port.

2. **Fastembed stub**: `generate_fastembed()` is unimplemented -- it returns an error with install instructions. The `EmbeddingModel::FastembedAllMiniLM` variant exists but cannot produce embeddings. If Ollama is unavailable and fallback is enabled, the stub error is the final result.

3. **No ANN index**: Both `SimilaritySearch` and `MemoryStore.vector_search()` use brute-force linear scan with cosine similarity. This is O(n) per query. `MemoryStore` caps candidates at 10,000 (MEM-016) but `SimilaritySearch` has no such cap -- it loads all rows for the given model.

4. **Dimension mixing in MemoryStore**: `normalize_embedding_dim()` zero-pads 768-dim Ollama embeddings to 1536-dim to match OpenAI. Zero-padded dimensions contribute nothing to dot product but dilute the L2 norms, reducing effective similarity scores. Embeddings from different providers stored together may have degraded comparison quality.

5. **Sequential batch generation**: `generate_batch()` processes texts one at a time via individual HTTP requests. Ollama's `/api/embed` endpoint supports batch input, but the code sends single texts. Large workspace indexing is slower than necessary.

6. **Cache SQL typo**: `EmbeddingCache::get_top_accessed()` has a SQL column name typo: `access_coun` instead of `access_count` on line 168 of `cache.rs`. This query will fail at runtime.

7. **No embedding for code search TF-IDF path**: The `TfIdfIndex` in `semantic_search.rs` operates on `MemoryEntry` (from `memory_manager.rs`), not on code chunks. Code search and memory search use completely separate indexing pipelines with no cross-referencing.

8. **RAGSystem is basic**: The `RAGSystem` in `rag_system.rs` uses simple substring matching (`content.to_lowercase().contains(query)`) rather than embeddings for retrieval. Its `embedding: Option<Vec<f32>>` fields on `CodeChunk`, `DocChunk`, and `Experience` are always `None` -- embeddings are never generated or used for similarity.

9. **HttpSummaryLLM::extract_memories**: The `extract_memories()` method makes LLM calls but may return empty in certain conditions. Full LLM wiring for reliable extraction is deferred.

10. **Two cosine_similarity implementations**: `similarity.rs` (code embeddings) and `memory_persistence.rs` (memory embeddings) each have their own `cosine_similarity()` function. They are functionally identical but not shared. There is also a sparse-vector cosine similarity in `semantic_search.rs`.

11. **No embedding versioning/migration**: If the embedding model changes (e.g., upgrading from nomic-embed-text to a newer model), existing embeddings in `SimilaritySearch` become stale. The `model_id` tag prevents cross-model search, but there is no mechanism to re-embed existing data when the model changes. Old embeddings simply become unreachable.

12. **canvasStore embedding reference**: `stores/canvasStore.ts` references embedding concepts but is not wired to the embedding service -- it appears to be for future artifact embedding support.
