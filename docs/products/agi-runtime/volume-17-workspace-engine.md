# AGI Runtime — Volume 17 — Workspace Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/desktop/AGENTS.md`; `apps/cli/AGENTS.md`. Grounded in real repo code: `apps/desktop/src-tauri/src/core/codebase/{mod.rs,indexer.rs}`, `apps/desktop/src-tauri/src/data/cache/{codebase.rs,watcher_integration.rs}`, `apps/desktop/src-tauri/src/sys/filesystem/watcher.rs`, `apps/desktop/src-tauri/src/sys/commands/{lsp.rs,cache.rs}`, `apps/desktop/src-tauri/src/lib.rs`, `apps/cli/src/project_scope.rs`, `crates/agiworkforce-utils-cache/src/lib.rs`.

## Overview & stance

The Workspace Engine is the AGI Runtime capability that turns a directory on disk into a queryable model — repository root, languages, dependencies, a symbol index, live change signals, and a cache of all of the above. It is **internal shared infrastructure**, not a user surface, consumed today by the code-facing surfaces (Desktop, CLI, VS Code) that have a real filesystem workspace.

Trust framing is decisive here: **the Workspace Engine lives entirely inside the Local trust boundary.** It reads on-device files, and its derived artifacts (the SQLite index at `<root>/.agi/codebase.db`, the app-data cache DB) stay on-device. Local workspace rows **never** flow to Neon delta-sync — cross-device sync is Managed-Cloud chats only; Local/BYOK rows never sync. BYOK never touches raw indexing (the index is Local; a BYOK model may later _read_ an excerpt only through an explicit fork with consent). Web and Mobile have no local workspace, so this engine is N/A there; Chrome is task-scoped with no workspace. Any handoff of workspace context into an app chat is explicit and redacted, never automatic.

## Repository discovery

Resolve the workspace root deterministically from any starting path by walking ancestors for a VCS marker.

- ✅ Built (CLI): `apps/cli/src/project_scope.rs::resolve_project_scope()` canonicalizes the input, walks `ancestors()` for a `.git` marker, returns the nearest match, and falls back to the canonical/original path when no repo is found. Unit-tested for both branches.
- ✅ Built (Desktop): `CodebaseServiceState::new(workspace_root)` accepts a root and provisions `<root>/.agi/codebase.db` (`apps/desktop/src-tauri/src/core/codebase/mod.rs`, initialized in `apps/desktop/src-tauri/src/lib.rs:835`).
- 🔭 Planned: monorepo / multi-root member enumeration (e.g. `pnpm-workspace.yaml`, Cargo `[workspace]` members), nested-root disambiguation, and non-Git VCS markers. Requirement: discovery must be idempotent, must respect `.gitignore`/ignore rules, and must never traverse outside the resolved root.

## Language detection

Classify each file so the right extractor and language server are selected.

- 🟡 Partial: `apps/desktop/src-tauri/src/core/codebase/indexer.rs::extract_symbols()` routes by file extension — `.ts/.tsx/.js/.jsx` → TypeScript, `.rs` → Rust, `.py` → Python, `.go` → Go; every other extension yields no symbols. The Desktop LSP host also carries a per-language `LSPServer{ language, command, args }` record (`apps/desktop/src-tauri/src/sys/commands/lsp.rs`). Gap: four language families only, extension-only (no shebang/content detection), and no per-repo language statistics.
- 🔭 Planned: linguist-grade detection (content sniffing, shebangs, vendored/generated exclusion), a broad language table, and per-workspace language-share stats. Requirement: unknown files degrade to "plain text," never a crash, and detection is a pure function of path + a bounded content prefix.

## Dependency analysis

Parse manifests into a dependency model (direct/transitive, versions, workspace links).

- 🔭 Planned: there is **no manifest parser today**. `SymbolKind::Import` exists in `indexer.rs` but is never populated, and `CacheType::Dependencies` (`"deps"`, 3600s TTL) is a reserved cache slot in `apps/desktop/src-tauri/src/data/cache/codebase.rs` with no producer. Requirement (target): parse `package.json`, `Cargo.toml`/`Cargo.lock`, `go.mod`, and `requirements.txt`/`pyproject.toml`; record direct vs transitive edges and workspace-local links; write results only into the Local `Dependencies` cache; never fetch a registry without explicit consent, and never leak lockfile contents across the trust boundary.

## Symbol indexing — build symbol graph

Index declarations so any surface can jump-to, search, and reason over structure.

- 🟡 Partial: `CodebaseIndexer` (`apps/desktop/src-tauri/src/core/codebase/indexer.rs`) persists a SQLite `symbols` table (name, kind, file, line, column, signature, doc) plus a `files` table (`content_hash`, `last_indexed`), with name/file indexes; it exposes `index_file`, `search_symbols` (LIKE), `get_file_symbols`, and `get_stats`, wired through Tauri commands `index_workspace_file` / `search_symbols` / `get_file_symbols` / `get_index_stats` (`core/codebase/mod.rs`). Extraction is line/regex-based. The Desktop LSP host (`sys/commands/lsp.rs`) independently offers `workspace/symbol`, document symbols, and go-to-definition/references via real language servers.
- Gaps making this Partial, not Built: it is a flat symbol **table**, not a **graph** — there are no edges (defines / references / calls / imports); regex extraction misses arrow functions, nested/overloaded declarations, and always reports `column: 0`; and CLI/VS Code have no equivalent persisted index.
- 🔭 Planned: a true symbol graph with cross-file reference edges (ideally tree-sitter or LSP-backed extraction), incremental rebuilds keyed on `content_hash`, and parity across Desktop/CLI/VS Code. Requirement: the graph is a Local artifact; queries return within interactive latency on a mid-size repo.

## File watching

Detect filesystem changes and drive incremental re-index / cache invalidation.

- ✅ Built (primitive): `apps/desktop/src-tauri/src/sys/filesystem/watcher.rs` implements `FileWatcher` on the `notify` 6.1 `RecommendedWatcher` (recursive mode), emitting a `FileEvent` (`Created` / `Modified` / `Deleted` / `Renamed`) to the Tauri webview.
- ✅ Built (handlers): `apps/desktop/src-tauri/src/data/cache/watcher_integration.rs` provides `handle_file_change` / `handle_file_delete` / `handle_directory_change`, which call `CodebaseCache::invalidate_file` / `invalidate_project`.
- 🟡 Partial — the wiring gap: the watcher and the invalidation handlers are **not connected**. `handle_file_change` has no caller, so filesystem events do not yet trigger symbol re-index or cache invalidation. Requirement to reach Built: subscribe the codebase index + cache to the `FileWatcher` stream (debounced, ignore-aware), scoped to the resolved root.
- 🔭 Planned: CLI and VS Code watchers.

## Workspace cache — cache analysis

Cache derived analysis so repeated queries are cheap and invalidation is correct.

- 🟡 Partial: `apps/desktop/src-tauri/src/data/cache/codebase.rs` implements `CodebaseCache` with typed slots `CacheType::{FileTree (24h), Symbols (1h), Dependencies (1h), FileMetadata (24h)}`, SHA-256 content hashing, and per-file / per-project invalidation; stats (hits, misses, hit-rate, size, savings) surface via `sys/commands/cache.rs` (`CacheStats.codebase_cache`) and the `codebase_cache_calculate_hash` command + `CodebaseCacheState` registered in `lib.rs:853-855`.
- ✅ Built (primitive): `crates/agiworkforce-utils-cache/src/lib.rs` `BlockingLruCache` — a Tokio-guarded LRU with SHA-1 keying, reusable by any Runtime consumer.
- Gaps: the `Dependencies` slot has no producer, and invalidation is not yet watcher-driven (see File watching).
- 🔭 Planned: a unified, TTL- and hash-aware workspace cache shared across Desktop/CLI/VS Code, with explicit cache-analysis reporting. Requirement: the cache is a **Local** artifact — it must never be written to Neon or any cloud store.

## Repository map

- `apps/desktop/src-tauri/src/core/codebase/{mod.rs,indexer.rs}` — SQLite symbol index + Tauri commands.
- `apps/desktop/src-tauri/src/data/cache/{codebase.rs,watcher_integration.rs}` — typed workspace cache + invalidation handlers.
- `apps/desktop/src-tauri/src/sys/filesystem/watcher.rs` — `notify`-based FS watcher.
- `apps/desktop/src-tauri/src/sys/commands/{lsp.rs,cache.rs}` — LSP host, cache stats/commands.
- `apps/desktop/src-tauri/src/lib.rs` — service registration (`~835`, `~853`, `~2448`).
- `apps/cli/src/project_scope.rs` — Git-root repository discovery.
- `crates/agiworkforce-utils-cache/src/lib.rs` — shared LRU cache primitive.

## Competitor notes

Claude Code, ChatGPT, and Codex build workspace context implicitly, on a single first-party provider, and lean toward cloud-run sessions for heavy indexing. AGI's deliberate divergence: the Workspace Engine is **local-first** — the index and cache are on-device Local artifacts and never sync to Neon; it is **multi-provider and per-surface** — the same index feeds Local, BYOK (Desktop/CLI/VS Code only), or Managed Cloud without silently promoting Local files across a trust boundary; and remote control keeps compute on the host (a phone/web client is a window, not a data path). Indexing a repository never implies uploading it.

## Acceptance / Definition of Done

The domain is production-ready when discovery, detection, indexing, watching, and caching are wired end-to-end on at least one surface, the watcher drives incremental invalidation, and every artifact provably stays Local.

- [ ] Build: `resolve_project_scope` root feeds a watcher-driven incremental index; `FileWatcher` events invalidate `CodebaseCache` (close the `handle_file_change` no-caller gap); `get_index_stats` and cache hit-rate observable.
- [ ] Trust: index/cache confirmed Local-only — no Neon/cloud write path; no automatic handoff of workspace content into cloud chat (handoff is explicit + redacted).
- [ ] Security: watcher and indexer never traverse outside the resolved root; ignore rules honored; symbol extraction cannot execute file contents; degraded-init state returns clear errors (`new_degraded`), never panics.

## Anti-patterns

- Do not sync any workspace index, cache, or dependency graph to Neon or cloud — Local/BYOK rows never sync.
- Do not silently feed Local files to a BYOK or Managed-Cloud model; Local→BYOK is an explicit fork (context selection, secret scan, payload preview, visible provider label, consent).
- Do not claim a live-watching index without wiring the `FileWatcher` to invalidation — today that link is absent; keep it labeled 🟡.
- Do not describe the symbol table as a symbol "graph"; it has no edges yet (🔭).
- Do not invent model IDs, routes, env vars, or command names; non-LLM engine identifiers must be grounded in real repo code, not listed from memory.
- Do not reference Supabase (fully migrated to Clerk + Neon + Stripe) or reintroduce removed tiers (Plus/pro_plus/Hobby) or credit top-ups. CLI examples use the `agi` binary.
