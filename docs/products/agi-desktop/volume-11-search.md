# AGI Desktop — Volume 11 — Search

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root); `apps/desktop/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon). Grounded in real repo paths: `apps/desktop/src/hooks/useGlobalSearch.ts`, `apps/desktop/src/features/v3/SearchModalCmdK.tsx`, `apps/desktop/src/features/chat/SearchModal.tsx`, `apps/desktop/src/hooks/useSearchModal.ts`, `apps/desktop/src/api/codeSearch.ts`, `apps/desktop/src-tauri/src/sys/commands/code_search.rs`, `apps/desktop/src/features/tools/toolCategories.ts`, `apps/desktop/src/features/chat/InlineToolResults/{InlineSearchResults,InlineDocumentSearch}.tsx`, `apps/desktop/src-tauri/src/core/research/web_search_config.rs`, `apps/desktop/src-tauri/src/core/agi/tools/mod.rs`, `apps/desktop/src/features/memory/MemorySearch.tsx`.

## Overview & stance

Search on AGI Desktop spans two very different worlds that the trust model keeps strictly separate. **Local search** — command palette, conversation, project, and file search — runs entirely on-device against local stores and the local filesystem; it never leaves the host and never crosses a trust boundary. **Web search** is an outbound network capability wired into chat/agent tool execution; it retrieves public content but must never be a covert channel that ships Local chats or files off-device. Desktop is the full-trust surface (Local + BYOK + Managed Cloud), so search results and the tool that produced them must carry the correct visible trust/provider label, and a Local→BYOK fork of a search-heavy session must still pass context selection, secret scan, payload preview, provider label, and consent. Cross-device search over Cloud-synced chats is a Neon delta-sync concern and is explicitly 🔭 here — Local/BYOK rows never sync and are therefore never searchable from another device.

## Web Search

Web search is exposed as an agent/chat tool, `tool_exec_web_search`, declared in `apps/desktop/src/features/tools/toolCategories.ts` (id `web-search`, field `query`, optional `max_results`) and rendered inline via `apps/desktop/src/features/chat/InlineToolResults/InlineSearchResults.tsx`. The backend uses **DuckDuckGo by default (no API key)** with **Perplexity as an optional keyed provider**, per `apps/desktop/src-tauri/src/core/research/web_search_config.rs` (default falls back to DuckDuckGo when no Perplexity key is present). These are non-LLM search engines and are exempt from the `models.json` SSOT rule, but stay grounded in that file rather than re-listed elsewhere. **✅ Built** (`web_search_config.rs`, `toolCategories.ts`). Requirements: the composer web-search toggle (`webSearchEnabled` in `apps/desktop/src/features/chat/ChatInputArea.tsx`) must reflect actual availability; the visible provider label must name the real engine; per-plan gating (Free/Basic $8·₹399/Pro $20/Max $100 & $200/Enterprise) is verified server-side, never by the extension. Per-trust-mode provider selection and result caching are 🔭.

## Conversation Search

Two mechanisms exist. (1) The agent tool `conversation_search` is registered in `apps/desktop/src-tauri/src/core/agi/tools/mod.rs` (query, `limit` default 5, optional `conversation_id` filter) — "matching messages ranked by relevance with conversation titles and timestamps." **✅ Built** (`core/agi/tools/mod.rs`). (2) Interactive search over the conversation list runs client-side in `useGlobalSearch.ts` and `SearchModal.tsx` using Fuse.js over each conversation's `title` and `lastMessage`. **🟡 Partial** — it fuzzy-matches titles and the last-message preview only, not full message bodies; there is no on-device full-text index of all turns yet (`apps/desktop/src/hooks/useGlobalSearch.ts:57`). Requirements: search must scope to the active trust mode's stores; Local conversations must remain searchable offline; Cloud-only synced results appear only when signed in. A local full-text/semantic index over message bodies is 🔭.

## Project Search

Project search is available in both the global palette and the Spotlight modal. `useGlobalSearch.ts` fuzzy-matches active (non-archived) projects on `name` and `description`; `apps/desktop/src/features/chat/SearchModal.tsx` includes a `projects` filter tab and searches chats, projects, and artifacts together via `useSearchModal.ts`. **✅ Built** (`useGlobalSearch.ts:69`, `SearchModal.tsx`). Requirements: archived projects are excluded by default and must be opt-in; project results must show attribution (name + type) and route to the correct project on select. Search _within_ a project's files and artifacts as a unified scope is 🔭 (today file search and project search are separate paths).

## File Search

File search is the Rust-backed code-search layer, callable both as Tauri commands and as agent tools. `apps/desktop/src-tauri/src/sys/commands/code_search.rs` implements `grep_search` (regex content search, `.gitignore`-aware, skips excluded dirs/binaries/files >10 MB, output modes `content` / `files_with_matches` / `count`, case-insensitivity, include-glob, context lines, `limit`/`offset` pagination, `truncated` flag) and `glob_search` (glob file matching, results sorted newest-first by modified time). TS wrappers live in `apps/desktop/src/api/codeSearch.ts`; in-document match rendering is `InlineDocumentSearch.tsx`. **✅ Built** (`code_search.rs`, `api/codeSearch.ts`). Requirements: file search must stay confined to explicitly opened roots — Local files stay local and are never uploaded to BYOK/Cloud as a side effect of search; the 10 MB/500-match/offset caps must be enforced in the backend, not the UI. Content and results are only forwarded to a provider through an explicit, previewed Local→BYOK fork.

## Workspace Search

"Workspace search" means a single unified query fanning across conversations, projects, artifacts, skills, connectors, and settings from one entry point. The command palette (`SearchModalCmdK.tsx` + `useGlobalSearch.ts`, groups: Chats, Projects, Skills, Connectors, Settings) and the Spotlight `SearchModal.tsx` (Chats, Projects, Artifacts) each cover a slice. **🟡 Partial** — two overlapping modals exist rather than one unified surface, and neither joins client-side store search with the Rust file/grep layer. A single workspace index that fuses conversations, projects, artifacts, files, memory, and web into one ranked, trust-labeled result set is 🔭. Cross-device workspace search (over Cloud-synced chats only, via Neon delta-sync) is 🔭 and must never surface Local/BYOK rows from another device.

## Filters

Filtering exists per surface. `SearchModal.tsx` exposes filter tabs (`all` / `chats` / `projects`); `useGlobalSearch.ts` groups results by category and drops archived projects; `grep_search`/`glob_search` accept structural filters — `includePattern` glob, `caseInsensitive`, `outputMode`, `contextLines`, and `limit`/`offset` windows. **🟡 Partial** (`SearchModal.tsx`, `code_search.rs`). Requirements: filters must be consistent across the two modals; a **trust-mode filter** (Local / BYOK / Cloud) and date/provider/type facets that partition results by boundary are 🔭 and are the highest-value gap — results must never mix trust boundaries without a visible label. Memory has its own debounced filter path in `apps/desktop/src/features/memory/MemorySearch.tsx`.

## Ranking

Local interactive ranking is Fuse.js fuzzy scoring (`threshold: 0.4`) over the selected keys, with static category ordering (Chats → Projects → Skills → Connectors → Settings) in `useGlobalSearch.ts`. `glob_search` ranks by modification time (newest first, `code_search.rs`); `grep_search` returns matches in file/line order with pagination rather than a relevance score. `conversation_search` and `web_search` return provider/engine-native relevance ranking. **🟡 Partial** — ranking is per-source and not unified. A cross-source ranker (recency + fuzzy + semantic, with per-trust weighting and no silent cross-boundary blending), plus on-device embeddings for semantic recall, is 🔭. Ranking must be deterministic enough to test and must never rely on a hardcoded model ID.

## Repository map

- `apps/desktop/src/hooks/useGlobalSearch.ts`, `apps/desktop/src/hooks/useSearchModal.ts` — client-side global/palette search.
- `apps/desktop/src/features/v3/SearchModalCmdK.tsx`, `apps/desktop/src/features/chat/SearchModal.tsx` — command-palette + Spotlight modals.
- `apps/desktop/src/api/codeSearch.ts`, `apps/desktop/src-tauri/src/sys/commands/code_search.rs` — file/grep/glob search.
- `apps/desktop/src/features/tools/toolCategories.ts`, `apps/desktop/src/features/chat/InlineToolResults/{InlineSearchResults,InlineDocumentSearch}.tsx` — web/document search tools + inline render.
- `apps/desktop/src-tauri/src/core/research/web_search_config.rs` — web-search provider config.
- `apps/desktop/src-tauri/src/core/agi/tools/mod.rs` — `conversation_search` tool.
- `apps/desktop/src/features/memory/MemorySearch.tsx` — memory search.

## Competitor notes

Claude (conversation/project search, web search tool), ChatGPT (browse + chat history search), and Codex (repo/code search) each present a single-provider, mostly cloud-indexed search. AGI's deliberate divergence: **local-first** file/conversation search that runs on-device with no upload; **multi-provider** web search (DuckDuckGo default, Perplexity optional) instead of one hardwired engine; **per-surface trust** — BYOK/Cloud provider selection only where allowed (Desktop yes; never Web/Mobile keys); and **explicit boundaries** — search never becomes a silent path from Local to BYOK/Cloud. Cross-device search covers Cloud-synced chats only, never Local/BYOK rows.

## Acceptance / Definition of Done

Production-ready when local search is fully offline-capable, trust-labeled, and boundary-safe; web search shows the real provider and respects server-verified plan gating; and results never blend trust modes without a visible label.

- [ ] **Build:** palette + Spotlight + grep/glob searches return correct, paginated, `.gitignore`-aware results; `pnpm --filter @agiworkforce/desktop typecheck test` and `cargo check -p agiworkforce-desktop` pass.
- [ ] **Trust:** Local file/conversation search performs no network I/O; a Local→BYOK fork of a searched session enforces context selection, secret scan, payload preview, provider label, consent.
- [ ] **Security:** grep/glob honor the 10 MB / 500-match / offset caps in Rust; web-search provider label matches the real engine; plan gating verified server-side.

## Anti-patterns

- Routing Local chat/file search hits into a BYOK/Cloud call without an explicit, previewed fork.
- Blending Local, BYOK, and Cloud results in one list with no per-result trust label.
- Making another device's Local/BYOK rows searchable via sync (only Cloud chats sync).
- Faking a semantic/full-text index that is really title-only Fuse matching.
- Hardcoding or inventing an LLM model ID for ranking/reranking (use `packages/contracts/types/src/models.json`).
- Referencing removed tiers ("Plus"/`pro_plus`/"Hobby") or credit top-ups in search paywalls; referencing Supabase; renaming `proxy.ts` back to `middleware.ts`.
