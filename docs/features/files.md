# Feature: Files
> Native filesystem browser and structured document pipeline — raw file I/O with security sandboxing, rich document reading/creation (PDF/Word/Excel), and live filesystem watching.

## Where It Lives

| Layer | Location |
|-------|----------|
| Frontend Components | `apps/desktop/src/components/Document/DocumentWorkspace.tsx` (viewer/search UI), `apps/desktop/src/components/Documents/DocumentGenerator.tsx` (AI-assisted creation UI) |
| Stores | `apps/desktop/src/stores/filesystemStore.ts` (directory navigation, file CRUD, history stack), `apps/desktop/src/stores/documentStore.ts` (rich document read/create/search) |
| Hooks | `apps/desktop/src/hooks/useFileOperations.ts` (full IPC wrapper with watch support), `apps/desktop/src/hooks/useFileTerminalEvents.ts` (Tauri event listener) |
| Rust Commands — File I/O | `apps/desktop/src-tauri/src/sys/commands/file_ops.rs` (all raw file and directory commands) |
| Rust Commands — Watch | `apps/desktop/src-tauri/src/sys/commands/file_watcher.rs` (start/stop/list watchers) |
| Rust Commands — Documents | `apps/desktop/src-tauri/src/sys/commands/document.rs` (document read/search/generate thin layer) |
| Rust Core — Document | `apps/desktop/src-tauri/src/features/document/mod.rs` (DocumentManager, type detection, security guards), `pdf.rs`, `word.rs`, `excel.rs` (format handlers), `create_pdf.rs`, `create_word.rs`, `create_excel.rs` (creators), `edit_pdf.rs`, `edit_word.rs`, `edit_excel.rs` (editors) |
| Rust Core — Filesystem Watch | `apps/desktop/src-tauri/src/sys/filesystem/watcher.rs` (notify-backed FileWatcher), `search.rs`, `mod.rs` |
| Rust Core — Embeddings | `apps/desktop/src-tauri/src/core/embeddings/mod.rs` (EmbeddingService facade), `generator.rs`, `indexer.rs`, `similarity.rs`, `cache.rs`, `chunker.rs` |

## Data Flow

### Raw File Operations (read/write/copy/move/delete)

1. User or agent calls `useFileOperations.read(path)` or `filesystemStore.readFile(path)`, which calls `invoke('file_read', { path })`.

2. The Rust `file_read` command in `file_ops.rs` runs three guards in sequence:
   - `validate_path_security(path)` — null-byte check, length limit (4096 chars), path canonicalization (resolves symlinks before checking), directory traversal detection on the canonical path, and blacklist check (`.ssh`, `.aws`, `/etc/passwd`, system32, etc.).
   - Size guard — rejects files over 100 MB before reading.
   - `check_file_permission(path, Read, db, app_handle)` — loads `SettingsState.allowed_directories` from app-managed state, canonicalizes each, and checks whether the target path falls under any allowed directory. Fails closed if `SettingsState` is unavailable.

3. If all guards pass, `fs::read_to_string(path)` executes and every operation (pass or fail) is written to the `audit_log` SQLite table via `log_file_operation`.

4. The string content returns through the IPC bridge to the frontend and is stored in `filesystemStore.fileContent`.

5. Destructive operations (`file_delete`, `dir_delete` with `recursive: true`) additionally call `request_confirmation_simple` from the ToolGuard confirmation flow before permission is checked, blocking the operation pending user approval.

### Directory Navigation

1. `filesystemStore.navigateTo(path)` calls `invoke('dir_list', { path })`.

2. Rust `dir_list` runs path security validation and permission check, then calls `fs::read_dir(path)` and materializes each entry as a `DirEntry` struct.

3. The store updates `currentPath`, `entries`, and appends to the `history` stack (slice-based undo/redo: `history.slice(0, historyIndex + 1)` then push).

4. `goBack()` / `goForward()` replay history entries by index, calling `dir_list` again on the stored path.

5. `goUp()` computes the parent by splitting on separators and calling `navigateTo` on the parent.

### File Watching

1. `useFileOperations.watch(path, recursive)` calls `invoke('file_watch_start', { path, recursive })`.

2. `file_watcher.rs` locks the `FileWatcherState` Mutex and lazily creates a `FileWatcher` backed by the `notify` crate's `RecommendedWatcher`. The path is registered for OS-level change notifications.

3. When the OS fires a file event (create/modify/remove), the notify callback maps it to a `FileEvent` enum and calls `app_handle.emit("file-event", &file_event)`.

4. **Event name mismatch**: The `useFileOperations` hook listens via `@tauri-apps/api/event.listen("file:change", ...)`, but Rust emits `"file-event"` (not `"file:change"`). This means `useFileOperations.watch()` will never receive file change notifications. The `FileTree.tsx` component correctly listens on `"file-event"` and does receive events. See Known Issues below.

### Document Processing (read rich documents)

1. `DocumentWorkspace.tsx` renders an "Open Document" button that calls `@tauri-apps/plugin-dialog.open()` with filters for `.pdf`, `.docx`, `.xlsx`.

2. On selection, `documentStore.readDocument(filePath)` calls `invoke('document_read', { filePath })`.

3. Rust `document_read` delegates to `DocumentState.manager.read_document(path)`:
   - `validate_file_size` — rejects files over 100 MB (DOC-010 fix).
   - `detect_type` — maps extension to `DocumentType` enum (`docx` → Word, `xlsx`/`xls` → Excel, `pdf` → PDF; legacy `.doc` is explicitly rejected with a helpful message).
   - `validate_magic_number` — reads the first 8 bytes and checks against known magic signatures (`%PDF-` for PDF, `PK..` ZIP header for DOCX/XLSX, OLE compound header for legacy XLS). Prevents renamed-binary attacks (DOC-012 fix).
   - Dispatches to `WordHandler`, `ExcelHandler`, or `PdfHandler` which parse and return `DocumentContent { text, metadata }`.

4. The frontend receives `DocumentContent` and renders it in a three-tab layout: Content (extracted text), Search (full-text search within the document), Metadata (title, author, page count, word count, timestamps).

### Document Generation

1. `DocumentGenerator.tsx` collects format (PDF/Word/Excel), title, content text, and calls `@tauri-apps/plugin-dialog.save()` to get the output path.

2. `documentStore.generatePdf/Word/Excel` splits content by newlines into paragraphs and calls the appropriate `invoke('document_create_*_simple', ...)` command.

3. `document.rs` runs `resolve_output_path` — handles `~/`, bare filenames (saved to Documents by default), and friendly aliases `Desktop`, `Documents`, `Downloads` resolved via the `dirs` crate. Then instantiates the appropriate creator and calls `create_simple`.

4. On success, `documentStore` updates `lastGenerated` and a Sonner toast fires.

### Code Embedding / Semantic Indexing

1. `index_workspace` triggers `IncrementalIndexer` which walks workspace files, passes each to `CodeChunker` (semantic chunking), and calls `EmbeddingGenerator.generate(chunk.content)`.

2. `EmbeddingGenerator` tries Ollama first (`/api/embed` with `nomic-embed-text` at localhost:3000). The `fastembed` fallback path is a stub that returns an error explaining how to install Ollama.

3. Embeddings are stored in `SimilaritySearch` (SQLite-backed vector store at `.agi/embeddings.db`) tagged with `model_id` to prevent cross-model vector space contamination.

4. `semantic_search_codebase` generates a query embedding and calls `search_with_model`, filtering results to the current model space.

## Rust Commands (IPC)

### Raw File Commands (`file_ops.rs`)

| Command | TS invoke name | Key Params | Return |
|---------|----------------|------------|--------|
| `file_read` | `file_read` | `path: String` | `Result<String, String>` |
| `file_write` | `file_write` | `path: String, content: String` | `Result<(), String>` |
| `file_delete` | `file_delete` | `path: String` | `Result<(), String>` — requires user confirmation |
| `file_rename` | `file_rename` | `oldPath: String, newPath: String` | `Result<(), String>` |
| `file_copy` | `file_copy` | `src: String, dest: String` | `Result<(), String>` |
| `file_move` | `file_move` | `src: String, dest: String` | `Result<(), String>` |
| `file_exists` | `file_exists` | `path: String` | `Result<bool, String>` |
| `file_metadata` | `file_metadata` | `path: String` | `Result<FileMetadata, String>` |
| `file_open_with_default_app` | `file_open_with_default_app` | `path: String` | `Result<(), String>` |
| `file_read_binary` | `file_read_binary` | `filePath: String` | `Result<String, String>` (base64) |
| `file_write_binary` | `file_write_binary` | `filePath: String, base64Content: String` | `Result<(), String>` |
| `dir_list` | `dir_list` | `path: String` | `Result<Vec<DirEntry>, String>` |
| `dir_create` | `dir_create` | `path: String` | `Result<(), String>` |
| `dir_delete` | `dir_delete` | `path: String, recursive: bool` | `Result<(), String>` — recursive requires confirmation |
| `dir_traverse` | `dir_traverse` | `path: String, globPattern: String` | `Result<Vec<String>, String>` — max 10,000 results |

### File Watcher Commands (`file_watcher.rs`)

| Command | TS invoke name | Key Params | Return |
|---------|----------------|------------|--------|
| `file_watch_start` | `file_watch_start` | `path: String, recursive: bool` | `Result<(), String>` |
| `file_watch_stop` | `file_watch_stop` | `path: String` | `Result<(), String>` |
| `file_watch_list` | `file_watch_list` | — | `Result<Vec<String>, String>` |
| `file_watch_stop_all` | `file_watch_stop_all` | — | `Result<(), String>` |

Watcher emits `"file-event"` Tauri event with payload `FileEvent` (Created / Modified / Deleted / Renamed). **Note:** `useFileOperations.ts` incorrectly listens on `"file:change"` instead of `"file-event"` — see Known Issues.

### Document Commands (`document.rs`)

| Command | TS invoke name | Key Params | Return |
|---------|----------------|------------|--------|
| `document_read` | `document_read` | `filePath: String` | `Result<DocumentContent>` |
| `document_extract_text` | `document_extract_text` | `filePath: String` | `Result<String>` |
| `document_get_metadata` | `document_get_metadata` | `filePath: String` | `Result<DocumentMetadata>` |
| `document_search` | `document_search` | `filePath: String, query: String` | `Result<Vec<SearchResult>>` |
| `document_detect_type` | `document_detect_type` | `filePath: String` | `Result<String>` |
| `document_create_pdf_simple` | `document_create_pdf_simple` | `outputPath, title?, author?, paragraphs: Vec<String>` | `Result<String>` (saved path) |
| `document_create_word_simple` | `document_create_word_simple` | `outputPath, title?, author?, paragraphs: Vec<String>` | `Result<String>` |
| `document_create_excel_simple` | `document_create_excel_simple` | `outputPath, sheetName, headers, rows: Vec<Vec<String>>` | `Result<String>` |
| `document_create_word` | `document_create_word` | `outputPath, config: WordDocumentConfig, contents: Vec<WordContent>` | `Result<String>` |
| `document_create_excel` | `document_create_excel` | `outputPath, config: ExcelDocumentConfig, sheets: Vec<ExcelSheet>` | `Result<String>` |
| `document_create_excel_numbers` | `document_create_excel_numbers` | `outputPath, sheetName, headers, rows: Vec<Vec<f64>>` | `Result<String>` |
| `document_create_pdf` | `document_create_pdf` | `outputPath, config: PdfDocumentConfig, contents: Vec<PdfContent>` | `Result<String>` |

### Embedding Commands (`core/embeddings/mod.rs`)

| Command | TS invoke name | Key Params | Return |
|---------|----------------|------------|--------|
| `generate_code_embeddings` | `generate_code_embeddings` | `filePath: String, content: String` | `Result<usize, String>` (chunk count) |
| `semantic_search_codebase` | `semantic_search_codebase` | `query: String, limit?: number` | `Result<Vec<SearchResult>, String>` |
| `get_embedding_stats` | `get_embedding_stats` | — | `Result<EmbeddingStats, String>` |
| `index_workspace` | `index_workspace` | — | `Result<(), String>` |
| `index_file` | `index_file` | `filePath: String` | `Result<(), String>` |
| `get_indexing_progress` | `get_indexing_progress` | — | `Result<IndexingProgress, String>` |
| `on_file_changed` | `on_file_changed` | `filePath: String` | `Result<(), String>` |
| `on_file_deleted` | `on_file_deleted` | `filePath: String` | `Result<(), String>` |

## Store Schema

### `filesystemStore.ts` (`useFilesystemStore`)

Not persisted. Pure in-memory navigation state.

---

## Known Issues

### File Watcher Event Name Mismatch

The Rust `FileWatcher` in `watcher.rs` emits events on channel `"file-event"`, but `useFileOperations.ts` listens on `"file:change"`. This means any code using `useFileOperations.watch()` will never receive file change callbacks. The `FileTree.tsx` component correctly listens on `"file-event"` and works as expected. Either the Rust emission or the hook listener needs to be updated to use a consistent event name.