---
id: "F104-07"
type: "feature"
title: "Search and stored knowledge"
aliases: ["Search and stored knowledge", "Global search (Search your workspace)", "Search dialog", "Hybrid retrieval", "Private knowledge search", "retrieval index", "vector index", "S104.13", "S104.14"]
area: "104 Named technology options-not claims about competitor internals"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S104.13", "S104.14"]
depends_on: ["surface:web", "surface:mobile", "mode:cloud", "SYS-data-model-and-migrations", "SYS-memory-projects-and-context", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-files-artifacts-and-storage", "table:retrieval_chunks", "table:retrieval_documents", "table:search_history", "api:GET /api/search", "file:apps/web/lib/services/retrieval-search-service.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F104-07 Search and stored knowledge

Web search over a person's own chats, projects, files and indexed documents, backed by Neon Postgres. Chat titles and messages match by substring; indexed documents (uploaded knowledge, artifacts, reports) match by full text plus a meaning (vector) search, merged by rank. No separate search engine exists. Mobile calls the same API only in Cloud mode.

Area: [104. Named technology options-not claims about competitor internals](README.md). Requirement items: [S104.13](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10413), [S104.14](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10414).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a signed-in person find past chats, projects, files, schedules and indexed documents from one search box, and lets the chat pipeline pull relevant passages from uploaded knowledge and past chats into a turn. Chat, project and file rows are matched with case-insensitive substring tests (route.ts:321,339,356,372). Indexed documents are matched by Postgres full text and by vector distance, then fused (retrieval-search-service.ts:187-260; rank.ts:24-30).

**Why it exists.** The brief requires conversations and messages to be searched through an indexed search engine behind a search API (S104.13) and knowledge chunks to carry embeddings in a vector index queried by cosine distance (S104.14). The code answers both inside the database instead of a separate engine (doc: knowledge-base/data/area-briefs/104-named-technology-options-not-claims-about-competitor-interna.md).

**Who uses it.** Signed-in web users (and mobile users in Cloud mode) who search their history, and the chat server code that retrieves knowledge passages for a question.

**Problems it solves**

- Finding an old chat or message without scrolling.
- Answering from long uploaded files whose text does not fit the prompt, by retrieving only the best passages (project-knowledge-retrieval.ts:1-40).
- Matching a question to a passage that uses different words, through the vector leg (retrieval-search-service.ts:187-260).
- Keeping results private to the owner and the active workspace (retrieval-search-service.ts:187-205).

**Use cases**

- Press the search control on web, type a chat title word, open the matching chat.
- Ask a question in a project that has uploaded files; the answer draws on retrieved passages.
- Ask 'what did we decide last week' and have past-chat excerpts retrieved by meaning, with a keyword fallback (past-chat-context-service.ts:365-392).
- Filter search by message role or date range.

## 2. User experience

**Where to find it**

- Web: the global search dialog titled 'Search' with the input 'Search your workspace' (GlobalSearchDialog.tsx:475-500).
- Web: category tabs All, Artifacts, Sessions, Code, Projects, Scheduled (global-search-categories.ts:1-8).
- Mobile: chat search in the chat view store calls /api/search only in Cloud mode with a Clerk session (chatViewStore.ts:244-262).
- Desktop, CLI, VS Code, Chrome: no caller of /api/search found in .ts/.tsx files under apps and packages; the Rust CLI sources were not searched, so unknown.

**Before you start**

- A signed-in account (route uses getUserScopedDb, route.ts:248).
- Search must be allowed for the workspace data region, otherwise the route refuses (route.ts:154-170).
- The meaning leg needs indexed documents, an embedding route and managed compute access (retrieval-search-service.ts:152-175; retrieval-embedding-service.ts:226-248).

**Screens and controls**

- Search input, category tabs, role filter 'All messages', date range, include-archived toggle, recent and popular searches, clear history (GlobalSearchDialog.tsx:134-183,568; global-search-service.ts:321-370).
- API also accepts mode (strategy), kind, limit up to 100, type=recent|popular|suggestions (route.ts:41-42,262-300,392-412).

**Journey**

1. Open the search dialog and type a query.
2. The page calls GET /api/search with the query, category and filters (global-search-service.ts:189).
3. The server returns chat and message rows, projects, files, schedules and indexed documents with a semantic state (route.ts:618-630).
4. The person opens a result; the query is recorded in search history unless track=false or the request is cross-site (route.ts:600-615).

**What the person sees and gets**

- Result lists per category with highlighted matches (GlobalSearchDialog.tsx:402).
- Stats of chat, message, project, file and document matches (route.ts:590-600).
- 'Search unavailable / Something went wrong. Please close and try again.' on dialog failure (GlobalSearchDialog.tsx:445-452).
- In chat, a notice when past-chat retrieval degrades (past-chat-context-service.ts:45-54).

**Settings**

- Search history can be cleared (route.ts:660-681).
- Temporary chats are excluded from search (route.ts:322-327; retrieval-search-service.ts:240-250).
- Per-workspace data region decides whether search is served (route.ts:154-170).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web GET /api/search is rate limited, scoped to user and organization, and bounded: default 50 and maximum 100 results (route.ts:41-42,246-260).
- Chat titles, project names and descriptions, file names and prompts, and message content are matched with ilike on trigram indexes (route.ts:321,339,356,372; 0101_sync_and_search_indexes.sql:80-100). Message query is capped at 100 rows (route.ts:466).
- Indexed documents are searched in 'hybrid' strategy by default: full text (ts_rank_cd over a stored tsvector, simple config) and vector (cosine distance operator over a 1536-dimension embedding with an HNSW index), fused by reciprocal rank and re-scored (types.ts:177; 0202_retrieval_index.sql:120-148; rank.ts:5-70).
- Candidates are min(100, limit x 4); at most 3 hits per source on the search route (retrieval-search-service.ts:41-45,330-390; route.ts:406-415).
- The query embedding is metered: entitlement check, daily 'vector_queries' allowance, usage reservation and settle (retrieval-embedding-service.ts:204-330).
- If embedding is refused or fails, search falls back to full text only and logs it (retrieval-search-service.ts:177-183).
- Chunks are indexed by a cron every 10 minutes that dispatches workflows (vercel.json:61-64; index-retrieval-documents/route.ts:15-37); an embedding failure stores chunks for keyword search and retries (retrieval-index-service.ts:118,511).
- Past-chat and project-knowledge retrieval reuse the same provider (past-chat-context-service.ts:278-291; project-knowledge-retrieval.ts:1-40).
- Row level security is forced on retrieval tables (0202_retrieval_index.sql:150-156).

**Incomplete**

- The indexed-document leg is skipped when a role or date filter is set or the category is Scheduled, so those searches use substring rows only (route.ts:398-401).
- Mobile reads only 'results' and 'projects' from the response, so indexed documents are not shown there [inferred] (chatViewStore.ts:250-262).
- Mobile past-chat cloud search sends only the first query term (pastChatContext.ts:75-82).

**Present but disconnected or switched off**

- Meaning search is off for an account with no embedded chunks ('no_index') or no embedding route (retrieval-search-service.ts:155-166; retrieval-embedding-service.ts:140-146).

**Not available**

- No standalone search engine; none found in the code (retrieval-search-service.ts:187-260).
- Desktop, CLI, VS Code and Chrome do not call /api/search: not found in .ts/.tsx; Rust not searched.

## 4. Required behaviour

**Established requirements**

- Conversations and messages are searched through an indexed search engine behind a search API. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.13)
- Knowledge chunks carry embeddings in a vector index queried by cosine distance. (source: S104.14 (same brief))
- Data lives in PostgreSQL (Neon) reached through the data-layer adapter. (source: S104.T11 (same brief))
- Queries are scoped to the user. (source: retrieval-search-service.ts:187-205)
- ChatGPT and Claude search of chat history are product references; verify current pages before material changes. (source: doc: AGENTS.md section 10; docs/product/competitive-guidance.md)

**Acceptance criteria**

1. A query matching a chat title returns that chat in Sessions for its owner and never for another user.
2. A query for a phrase present only in an uploaded document returns the document in 'documents' with semantic state 'used' when embeddings exist.
3. With the embedding route unavailable, the same query still returns full-text hits and semantic state 'unavailable'.
4. limit above 100 is rejected or bounded; default is 50.
5. A role, startDate or endDate filter returns message rows and no indexed documents.
6. Temporary chats and deleted chats never appear.
7. Free account at its daily vector-query allowance still gets keyword results.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile Local mode searches only on-device data and sends nothing to /api/search [inferred] (chatViewStore.ts:244-250).
- Substring search over messages is the only path for chat messages; the vector index covers documents, artifacts and reports, not every message [inferred] (route.ts:372; retrieval-search-service.ts:240-250).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show indexed-document hits in the mobile Cloud search UI.
- [proposed] Tell the person when a filter turned meaning search off.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET/POST/DELETE /api/search | `apps/web/app/api/search/route.ts` | Search, track, suggestions, recent, popular, clear history. |
| service | retrieval-search-service | `apps/web/lib/services/retrieval-search-service.ts` | Postgres search provider: full text, vector, fusion, scope, residency. |
| service | retrieval-embedding-service | `apps/web/lib/services/retrieval-embedding-service.ts` | Metered embedding calls through the embedding_default routing slot. |
| service | retrieval-index-service | `apps/web/lib/services/retrieval-index-service.ts` | Chunking, embedding, storing, reindex and due-document reservation. |
| service | project-knowledge-retrieval | `apps/web/lib/services/project-knowledge-retrieval.ts` | Passages from indexed project files for a chat turn. |
| service | past-chat-context-service | `apps/web/lib/services/past-chat-context-service.ts` | Semantic then keyword past-chat excerpts. |
| service | rank.ts | `packages/platform/data-layer/src/search/rank.ts` | Reciprocal rank fusion, rerank, near-duplicate drop, per-source cap. |
| config | search types and defaults | `packages/platform/data-layer/src/search/types.ts` | Default strategy hybrid and default private-knowledge mode. |
| schema | 0202_retrieval_index.sql | `apps/web/db/neon/0202_retrieval_index.sql` | retrieval_documents, retrieval_chunks, tsvector, HNSW index, RLS. |
| schema | 0101_sync_and_search_indexes.sql | `apps/web/db/neon/0101_sync_and_search_indexes.sql` | Trigram indexes for substring search. |
| table | search_history | `apps/web/db/neon/0020_functions.sql` | Search history and track_search function. |
| job | index-retrieval-documents cron | `apps/web/app/api/cron/index-retrieval-documents/route.ts` | Reserves due documents and starts index workflows. |
| job | retrieval index workflow | `apps/web/lib/workflows/retrieval-index-workflow.ts` | Durable workflow that indexes one document. |
| component | GlobalSearchDialog | `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx` | Web search UI. |
| service | global-search-service | `apps/web/features/chat/services/global-search-service.ts` | Web client for /api/search. |
| store | chatViewStore search | `apps/mobile/stores/chat/chatViewStore.ts` | Mobile Cloud search through /api/search. |
| service | mobile pastChatContext | `apps/mobile/src/features/memory/services/pastChatContext.ts` | Mobile past-chat excerpts from cloud search. |
| service | NeonDatabaseAdapter | `packages/platform/data-layer/src/adapters/neon.ts` | Postgres adapter used by all queries. |
| service | file-search-tool | `apps/web/lib/server/tools/file-search-tool.ts` | Model-facing file search and open tools over indexed text. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web sends GET /api/search with q, category and filters. | device | global-search-service.ts:189 |
| Server rate limits, resolves user, organization and region, and refuses if the region cannot be served. | our servers | route.ts:246-250,154-170 |
| Substring queries run against chats, messages, projects and files in Postgres. | our servers | route.ts:321-372,426-481 |
| Unless a filter forbids it, the indexed-document search starts in hybrid mode: checks the account has embedded chunks. | our servers | route.ts:398-415; retrieval-search-service.ts:155-166 |
| The query text (first 2000 characters) is embedded through the managed embedding route after entitlement, allowance and reservation checks. | outside service | retrieval-search-service.ts:168-176; retrieval-embedding-service.ts:204-330 |
| One SQL statement runs a full-text leg and a vector leg, merges them, then the code reranks, removes near-duplicates and caps hits per source. | our servers | retrieval-search-service.ts:187-260; rank.ts:49-100 |
| Response returns rows, documents, semantic state and stats; the query is logged to search history. | our servers | route.ts:600-630 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chunks, embeddings, tsvector | retrieval_documents and retrieval_chunks in Neon Postgres | Server only; created by cron indexing, not by device sync | Deleted with the source document by cascade; deleted-chat and temporary-chat sources are filtered at query time (0202_retrieval_index.sql:120-135; retrieval-search-service.ts:240-250). Retention window: unknown. |
| Search history | search_history table via track_search | Server only | Cleared by DELETE /api/search (route.ts:660-681). |
| Query embedding usage | managed usage ledger via reserveManagedUsageRequest | Server only | Per usage policy; unknown beyond that. |

**Models and providers.** Embeddings use the embedding_default routing slot over managed routes only, from the gateway or Google harness; the person's own key is not used (retrieval-embedding-service.ts:44,68-110). Accounts that opted out of training get only no-training providers (retrieval-embedding-service.ts:226-232).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required (route.ts:248). |
| Permissions | Scoped to the caller's user and organization; scheduled category needs workspace access (route.ts:292-296); retrieval tables use forced row level security (0202_retrieval_index.sql:150-156). |
| Subscription | Substring search has no plan check found. The meaning leg calls managed compute access with the account's entitlement (retrieval-embedding-service.ts:226-236). |
| Limits and metering | Result limit 50 default, 100 max (route.ts:41-42); daily vector_queries allowance and metered embedding cost (retrieval-embedding-service.ts:238-262); rate limit bucket chat-conversation (route.ts:246). |
| Feature flags | none found in the code for search itself. |
| Model compatibility | Search is independent of the chat model; only the embedding slot model matters (retrieval-embedding-service.ts:44). |
| Provider restrictions | Managed embedding routes only; no-training filter when the account or Google user data requires it (retrieval-embedding-service.ts:226-232; retrieval-search-service.ts:168-176). |
| Local mode | Web search is always server-side. On mobile Local mode the cloud search is not called and local data only is searched (chatViewStore.ts:244-250); the local search code itself was not read, so its details are unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty query | Validation error 'q query param required for search'; suggestions need at least 2 characters. | route.ts:262-300 |
| No indexed chunks | Semantic state 'no_index'; substring and full-text results still return; past-chat falls back to keyword scan. | retrieval-search-service.ts:155-166; past-chat-context-service.ts:278-291 |
| Embedding refused (no route, not entitled, billing, provider failure, daily limit) | Logged; ranking by full text only. | retrieval-embedding-service.ts:80-86; retrieval-search-service.ts:177-183 |
| Region not served | Capability-unavailable error with message about data region. | route.ts:154-170 |
| Offline | not handled in the code for the web dialog beyond the generic failure message (GlobalSearchDialog.tsx:275); mobile search failure flag exists (chatViewStore.ts:245). | GlobalSearchDialog.tsx:275 |
| Accessibility | Input has an aria-label; error state has a hidden dialog title; tests cover a11y. | GlobalSearchDialog.tsx:495-500,440-447 |
| Short queries | Queries under three characters cannot use the trigram index and scan, protected only by rate limit. | 0101_sync_and_search_indexes.sql:80-86 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/search/__tests__/indexed-search.test.ts`: Indexed-document leg of the search route.
- `apps/web/app/api/search/__tests__/message-search-scoping.test.ts`: Message search scoping to user and workspace.
- `apps/web/app/api/search/__tests__/search-residency-and-scope.test.ts`: Region refusal and scope.
- `apps/web/app/api/search/__tests__/plain-snippets.test.ts`: Snippet text building.
- `apps/web/app/api/search/__tests__/popular-searches.test.ts`: Popular searches.
- `apps/web/lib/services/__tests__/retrieval-search-service.test.ts`: Search provider SQL and fusion.
- `apps/web/lib/services/__tests__/retrieval-embedding-service.test.ts`: Metered embedding and refusal codes.
- `apps/web/lib/services/__tests__/retrieval-index-service.test.ts`: Indexing and keyword-only fallback.
- `apps/web/lib/services/__tests__/past-chat-context-service.test.ts`: Past-chat retrieval modes.
- `packages/platform/data-layer/src/__tests__/search-rank.test.ts`: Reciprocal rank fusion and rerank.
- `apps/web/features/chat/components/dialogs/__tests__/GlobalSearchDialog.behaviour.test.tsx`: Dialog behaviour.
- `apps/web/features/chat/components/dialogs/__tests__/GlobalSearchDialog.a11y.test.tsx`: Dialog accessibility.

**Test scenarios**

- **Substring chat search**
  1. Sign in with a seeded account that has a chat titled with a unique word.
  2. Open Search, type the word.
  3. Open the result.
  - Expected: The chat appears under Sessions; a second account never sees it.
- **Meaning search over an uploaded file**
  1. Upload a file to a project and wait until indexing finishes.
  2. Search with a paraphrase that shares no words with the file.
  3. Check the response 'semantic' field.
  - Expected: Document hit returned with semantic 'used'.
- **Embedding unavailable**
  1. Run with no embedding route configured.
  2. Search for a word in an indexed document.
  - Expected: Document still found by full text; semantic is 'unavailable'.
- **Filtered search**
  1. Search with role=user and a date range.
  - Expected: Only message rows; documents list empty.
- **Free daily limit**
  1. Exhaust the daily vector_queries allowance on a Free account.
  2. Search again.
  - Expected: Keyword results still returned; no error shown.

**Where to look when it fails**

- Log line '[retrieval] query embedding unavailable; ranking by full text only' with a failure code.
- Error class RetrievalEmbeddingError codes: no_route, not_entitled, billing_refused, provider_failed, daily_limit.
- Tables retrieval_documents (status, attempts, embedding_model) and retrieval_chunks; 'search history write failed' warning.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Chat messages are matched by substring, not by meaning; the brief calls for an indexed search engine for conversations and messages.** Affects: Web and mobile Cloud users searching old chats.. Evidence: route.ts:372; 0101_sync_and_search_indexes.sql:80-100. Work needed: Decide whether messages should be chunked into the retrieval index, or adjust the brief to say substring search.
- **Filters switch off document and meaning search silently.** Affects: Web users using role or date filters.. Evidence: route.ts:398-401. Work needed: Support filters in the retrieval query or tell the person.
- **Mobile ignores indexed documents in search results.** Affects: Mobile Cloud users.. Evidence: chatViewStore.ts:250-262. Work needed: Render the documents array.
- **No search on desktop, CLI, VS Code or Chrome found.** Affects: Those apps.. Evidence: No /api/search caller in .ts/.tsx outside web and mobile. Work needed: Confirm per app whether parity is required; Rust CLI not searched.
- **Meaning search is always managed-cloud; no own-key or local embedding path.** Affects: Own-key and Local users.. Evidence: retrieval-embedding-service.ts:68-110. Work needed: Decide the trust-boundary rule for embeddings in own-key mode.

**Depends on**

- surface:web
- surface:mobile
- mode:cloud
- SYS-data-model-and-migrations
- SYS-memory-projects-and-context
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-files-artifacts-and-storage
- table:retrieval_chunks
- table:retrieval_documents
- table:search_history
- api:GET /api/search
- file:apps/web/lib/services/retrieval-search-service.ts

## Unknown

- Retention period of retrieval chunks after the source is kept.
- How mobile Local mode searches on-device data.
- Whether the Rust CLI calls /api/search.
- Index statistics such as chunk size and overlap were not read.
- Whether any search result is shown when the hybrid fusion is disabled by mode parameter in the UI.
