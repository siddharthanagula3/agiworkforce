# AGI Web — Volume 09 — Search

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/web/AGENTS.md`, and the real repo paths grounded below: `apps/web/app/api/search/route.ts`, `apps/web/app/api/memory/search/route.ts`, `apps/web/features/chat/services/global-search-service.ts`, `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx`, `apps/web/core/integrations/web-search-handler.ts`, `apps/web/db/neon/0020_functions.sql`, `apps/web/db/neon/0001_mvp_chat.sql`, `apps/web/db/neon/0035_project_knowledge_file_lifecycle.sql`, and provider facts from `packages/contracts/types/src/models.json`.

## Overview & stance

Search on AGI Web spans two distinct axes: **internet search** (an in-chat tool that fetches live web results) and **product search** (finding the user's own chats, projects, files, and memories). AGI Web is the **cloud-only** surface — no BYOK, no Local mode — so every product-search query runs against **Managed-Cloud** rows in Neon Postgres, scoped by Clerk-authenticated `userId` and RLS. There are no local indexes to consult and no user-supplied provider keys; internet search flows through **server-side authenticated proxies** so no API key ever reaches the client (`apps/web/core/integrations/web-search-handler.ts`). Because Web is a sync target for the Neon delta-sync APIs, product search naturally spans a user's Web ↔ Mobile ↔ Desktop Managed-Cloud chats — but only those rows; Local/BYOK data never enters this index by construction.

**Global search across chats + projects + artifacts + files + settings is a P0 gap.** Today's "global" search is really **conversation-scoped**. Each subsection below labels reality per the canon.

## Web Search — internet search integration

Live web search is a chat tool, not product navigation. `apps/web/core/integrations/web-search-handler.ts` implements a provider fallback chain — Perplexity → Google Custom Search → DuckDuckGo — behind authenticated proxies, returning normalized `{title, url, snippet, source, publishedDate, favicon}` results plus an optional cited answer. The Perplexity model is resolved via `requireProviderDefaultModel('perplexity')` from `packages/contracts/types/src/models.json` (never hardcoded). UI surfaces exist: `apps/web/features/chat/v3/WebSearchModalCmdK.tsx`, `features/chat/components/search/{SearchResults,SearchResultCard}.tsx`, `features/chat/components/InlineToolResults/InlineSearchResults.tsx`, and a deep-research panel (`features/chat/components/research/ResearchPanel.tsx`, `features/chat/stores/research-panel-store.ts`).

- 🟡 **Built, with a deployment gap.** The handler posts to `/.netlify/functions/llm-proxies/*`, but Web deploys on **Vercel** (`apps/web/vercel.json`). The Netlify proxy path is stale and must be repointed to Vercel-hosted route handlers before this is production-clean. Track as a reconciliation gap.
- Requirement: internet search must require auth, redact nothing outbound beyond the query, label the provider used, and cite source URLs. No client-side keys — ever.

## Conversation Search

Finding text inside the user's own chats is the most complete capability. `apps/web/app/api/search/route.ts` runs a case-insensitive `ilike` over `web_conversations.title` and `web_messages.content`, both scoped to the caller's `userId`, returning session and message hits with a ±50-char context window (`extractMatch`). The client wrapper is `features/chat/services/global-search-service.ts`; the UI is `features/chat/components/dialogs/GlobalSearchDialog.tsx` and inline `features/chat/components/messages/MessageSearch.tsx`. Search history, recent/popular queries, and suggestions are backed by real SQL functions and a `search_history` table (`apps/web/db/neon/0020_functions.sql`: `track_search`, `get_recent_searches`, `get_popular_searches`, `get_search_suggestions`, `clear_search_history`).

- ✅ **Built** — `apps/web/app/api/search/route.ts`; history/suggestions in `apps/web/db/neon/0020_functions.sql`.
- Requirements: rate-limited (`chat-conversation` bucket), CSRF-guarded on POST/DELETE, results strictly user-scoped, `deleted_at` respected unless `includeArchived`, and tracking fire-and-forget (never blocks results).

## Project Search

Projects and their knowledge files exist (`apps/web/db/neon/0006_projects.sql`, `0035_project_knowledge_file_lifecycle.sql`, `apps/web/app/api/projects/[id]/knowledge-files/route.ts`), but there is **no project-scoped search endpoint** and the global dialog does not query projects.

- 🔭 **Planned.** Target: a project filter/scope that searches project titles, descriptions, project chats, and attached knowledge, user-scoped, reusing the `/api/search` shape. No path proves this yet — mark unknown, do not claim it.

## File Search

Knowledge-file lifecycle (upload, list, delete) is real (`apps/web/app/api/projects/[id]/knowledge-files/route.ts`, migration `0035`), but there is **no content search** over file text and no extraction index.

- 🔭 **Planned.** Target: index extracted file text (chunk + FTS, later embeddings) and expose filename + in-file matches. Until an index exists, file search must not be advertised as available.

## Ranking

Current ranking is **recency, not relevance**: results are ordered `updated_at desc` and sliced to the limit (`apps/web/app/api/search/route.ts`). The only GIN index on messages covers `web_messages.metadata`, not `content` (`apps/web/db/neon/0001_mvp_chat.sql`), so message search is a sequential `ilike` scan without BM25/`ts_rank` scoring. Suggestions carry a `score` from `get_search_suggestions` (recency/frequency blend), which is separate from result ranking.

- 🟡 **Partial** — recency ordering built (`apps/web/app/api/search/route.ts`); no relevance ranking.
- 🔭 **Planned** — Postgres full-text (`to_tsvector`/`websearch_to_tsquery` + `ts_rank`) on chat content, then optional vector re-rank. Any move to relevance ranking needs a real FTS or vector index migration first; do not claim ranked relevance until that index ships.

## Filters

The route reads and applies: `q`, `limit` (capped at 100), `role` (`user`/`assistant`/`system`), `startDate`, `endDate`, and `includeArchived`. Memory search (`apps/web/app/api/memory/search/route.ts`) is a parallel `ilike` scan (self-noted as upgradeable to vector later) and escapes `%_\` wildcards.

- ✅ **Built** — role/date/archived/limit in `apps/web/app/api/search/route.ts`.
- 🟡 **Partial** — `SearchFilters.sessionIds` exists in `features/chat/services/global-search-service.ts` but the route never reads it, so per-session scoping is a dead filter to wire or remove. The full-text route should also escape `ilike` wildcards the way the memory route does.

## Repository map

- `apps/web/app/api/search/route.ts` — conversation search + history/suggestions API.
- `apps/web/app/api/memory/search/route.ts` — memory text search.
- `apps/web/features/chat/services/global-search-service.ts` — client search service.
- `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx`, `features/chat/components/messages/MessageSearch.tsx` — search UI.
- `apps/web/features/chat/v3/WebSearchModalCmdK.tsx`, `features/chat/components/search/*`, `features/chat/components/InlineToolResults/InlineSearchResults.tsx`, `features/chat/components/research/ResearchPanel.tsx` — internet-search UI.
- `apps/web/core/integrations/web-search-handler.ts` — internet-search provider chain.
- `apps/web/db/neon/0020_functions.sql` — `search_history` + search SQL functions; `0001_mvp_chat.sql` — chat schema/indexes; `0006_projects.sql`, `0035_project_knowledge_file_lifecycle.sql` — projects/knowledge.

## Competitor notes

Claude and ChatGPT ship a global search over conversations plus an in-chat web-search/research tool; ChatGPT and Codex also search project/workspace files. AGI's deliberate divergence: **per-surface trust**. Web is cloud-only, so search never touches Local/BYOK data — a boundary competitors don't draw. Internet search is **multi-provider** (Perplexity/Google/DuckDuckGo fallback) instead of a single vendor, and all keys stay server-side. Where rivals present one seamless "search everything," AGI is honest that only conversation search is built and project/artifact/file/settings search are 🔭.

## Acceptance / Definition of Done

Production-ready when internet search runs through Vercel-hosted authenticated proxies (no Netlify path, no client keys), conversation search is user-scoped/rate-limited/CSRF-guarded with relevance ranking backed by a real index, and global search truthfully covers whatever scopes are wired (with 🔭 scopes hidden, not faked).

- [ ] Build: `/api/search` and `/api/memory/search` typecheck, test, and return user-scoped results; wildcard escaping applied on both.
- [ ] Trust: no BYOK/Local affordance anywhere in search; internet search holds no client keys; results limited to Managed-Cloud rows.
- [ ] Security: Clerk auth + RLS enforced, rate limits on all search reads, CSRF on POST/DELETE, no cross-user leakage in ranking or suggestions.

## Anti-patterns

- Do not surface a "search projects/artifacts/files/settings" control while those scopes are unimplemented — mark 🔭, don't fake availability.
- Do not add a BYOK or Local search source to Web, or route internet-search keys to the client.
- Do not hardcode the Perplexity (or any) model ID — resolve via `packages/contracts/types/src/models.json`.
- Do not reference Supabase, `middleware.ts`, removed tiers ("Plus"/`pro_plus`/"Hobby"), or credit top-ups.
- Do not claim relevance ranking without a real FTS/vector index migration, and do not leave dead filters (`sessionIds`) wired to nothing.
