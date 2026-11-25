---
id: "F093-06"
type: "feature"
title: "Searching your indexed content"
aliases: ["Hybrid retrieval", "Vector index", "Lexical index", "Reranking", "Permission-aware retrieval", "Search your workspace", "/api/search", "S93.20", "S93.21", "S93.22", "S93.23", "S93.24"]
area: "93 Search, retrieval, and context components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S93.20", "S93.21", "S93.22", "S93.23", "S93.24"]
depends_on: ["F093-05", "SYS-data-model-and-migrations", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-inference-providers", "SYS-security-and-privacy", "surface:web", "surface:mobile", "mode:cloud", "table:retrieval_chunks", "table:retrieval_documents", "provider:vercel-gateway", "provider:google"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F093-06 Searching your indexed content

This is search over a person's own indexed content. It merges keyword matches from a full-text index with meaning matches from a vector index, re-scores the merged list, and returns passages. It is used by the chat server for recall and by the web 'Search your workspace' dialog. Without vectors it answers by keyword alone and says so.

Area: [93. Search, retrieval, and context components](README.md). Requirement items: [S93.20](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9320), [S93.21](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9321), [S93.22](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9322), [S93.23](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9323), [S93.24](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9324).

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

**What it does.** Builds a full-text query and, when an index with embeddings exists, a query vector; runs both inside the caller's user and workspace; merges ranks (reciprocal rank), re-scores on term coverage, exact phrase and title, removes near-duplicates and caps hits per source (apps/web/lib/services/retrieval-search-service.ts:444-529; packages/platform/data-layer/src/search/rank.ts:5-95).

**Why it exists.** Keyword search misses meaning and vector search misses exact terms; combining them gives better passages for chat and for the search dialog (0202 header lines 6-10).

**Who uses it.** The chat server (past chats, project files, attached files, research file sources) and web users of the global search dialog.

**Problems it solves**

- Finding content by meaning and by exact words.
- Returning only the caller's own content, not deleted or temporary chats (retrieval-search-service.ts:266-273).
- Not paying for an embedding when nothing is embedded (lines 155-165).
- A region mismatch serving data from the wrong place (lines 118-144; residency.ts:23-59).

**Use cases**

- Type a phrase in 'Search your workspace' and find a chat passage.
- Chat recall of past chats (F093-04).
- Large project file passages.
- Attached chat files searched by keyword (lines 415-438).

## 2. User experience

**Where to find it**

- Web: global search dialog, placeholder 'Search your workspace', categories All, Artifacts, Sessions, Code, Projects, Scheduled (GlobalSearchDialog.tsx:492-496; global-search-categories.ts:1-8).
- Mobile: Cloud history search calls GET /api/search with the first query term (pastChatContext.ts:72-100; chatViewStore.ts, found by search).
- Desktop (Electron): hosted web app [inferred].
- CLI, VS Code, Chrome extension: no use found. unknown.

**Before you start**

- Signed in; the content must be indexed (F093-05); the workspace region must match the serving region.

**Screens and controls**

- Search box 'Search your workspace'; category group 'Search category'; role filter 'All messages'; clear button 'Clear search'.
- States: 'Search unavailable', 'Search could not be completed', spinner 'Searching workspace...'.

**Journey**

1. The person opens the search dialog and types at least one word.
2. The browser calls GET /api/search (rate-limited) (route.ts:245-256).
3. The server checks the region and runs session, project, file and message queries plus the index search in parallel (route.ts:384-430).
4. Results are grouped; index results become one per source with a snippet and link (retrieval-search-results.ts:61-81).
5. The person opens a result.

**What the person sees and gets**

- Results, projects, files, schedules, documents, and fields 'semantic' (used, no_index or unavailable) and 'strategy' (route.ts:620-630).
- Refusal text naming the region when the region does not match (route.ts:154-168).

**Settings**

- Query param 'mode' picks keyword, semantic or hybrid; default hybrid (types.ts:173-177; route.ts:396-397).
- includeArchived applies to row queries, not to the index search (route.ts:307,326-378,401-418).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Full-text index (GIN on weighted tsvector) and vector index (HNSW cosine, 1536 numbers) (0202:131-143).
- Hybrid merge and rerank (rank.ts:24-95).
- Owner and workspace filter, deleted artifact, origin and asset exclusion, temporary exclusion, Google user data exclusion unless allowed (retrieval-search-service.ts:266-273).
- Health space documents hidden unless included (lines 277-300).
- Keyword-only result when no index, embedding refused, or Free cap reached; the response carries semantic state (lines 146-188,467-469).
- Returns nothing when there are no terms and no vector (line 469).
- Residency check before any query (lines 451-459).
- Read a whole indexed source in order (lines 327-413).

**Incomplete**

- Index search is skipped when role or date filters apply, and for the 'scheduled' category (route.ts:399-401).
- includeArchived does not reach the index search; archived exclusion for indexed chats depends on migration 0244, marked NOT YET APPLIED (0244:3).
- Rerank is a rule-based re-score, not a model (rank.ts:10-15,66-70).

**Present but disconnected or switched off**

- Search modes other than private_knowledge and product are declared but this provider refuses them (retrieval-search-service.ts:106-112).

**Not available**

- Search over the index in Local mode, and on CLI, VS Code and Chrome extension: none found.

## 4. Required behaviour

**Established requirements**

- Embeddings are stored in a vector index queried by similarity. (source: S93.20 (brief))
- A lexical index serves keyword retrieval. (source: S93.21 (brief))
- Retrieval fuses lexical and vector candidates. (source: S93.22 (brief))
- Candidates are re-ranked before being returned. (source: S93.23 (brief))
- Retrieval returns only content the user may see (tenant, owner, deleted, temporary, archived exclusions). (source: S93.24 (brief))
- An archived resource is not AI-retrievable. (source: 0244 header lines 12-17)

**Acceptance criteria**

1. A query matching one chunk by words and another by meaning returns both, ranked above single-list hits.
2. User B never sees user A's chunks, nor chunks of another workspace.
3. A deleted or temporary chat never appears.
4. An archived chat or project file never appears in index results.
5. With no embeddings, results come from keyword and the response says semantic 'no_index' or 'unavailable'.
6. A query with no searchable terms returns an empty list without error.
7. A workspace pinned to another region gets a refusal that names the region.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Members of a shared project may not see each other's indexed files because the filter is c.user_id = caller [inferred from retrieval-search-service.ts:204-206; policy 0202:209-222 allows project knowledge visible through the file].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass includeArchived and role/date filters into the index search or hide the index results when they cannot apply.
- [proposed] Add a measured quality test set for ranking.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | createPostgresSearchProvider | `apps/web/lib/services/retrieval-search-service.ts` | Hybrid search provider (line 444). |
| service | candidateSql / queryEmbedding / buildTsQuery | `apps/web/lib/services/retrieval-search-service.ts` | SQL for lexical and vector candidates, query vector, query parser (lines 87,146,190). |
| service | rerankCandidates | `packages/platform/data-layer/src/search/rank.ts` | Fusion, rescoring, near-duplicate removal, per-source cap. |
| schema | Search types and modes | `packages/platform/data-layer/src/search/types.ts` | Source kinds, modes, strategies (default hybrid), vector width. |
| service | Search residency | `packages/platform/data-layer/src/search/residency.ts` | Region refusal rules. |
| endpoint | GET /api/search | `apps/web/app/api/search/route.ts` | Product search endpoint with index documents. |
| service | toSearchDocumentResults | `apps/web/lib/services/retrieval-search-results.ts` | One result per source with snippet and link. |
| component | GlobalSearchDialog | `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx` | Web search dialog. |
| service | global-search-service | `apps/web/features/chat/services/global-search-service.ts` | Client call to /api/search. |
| table | retrieval_chunks indexes | `apps/web/db/neon/0202_retrieval_index.sql` | GIN full-text and HNSW vector indexes (lines 139-143). |
| service | Past-chat and project callers | `apps/web/lib/services/past-chat-context-service.ts` | Use the provider for recall (line 278). |
| service | File search tool | `apps/web/lib/server/tools/file-search-tool.ts` | Uses the provider (found by search; not opened). |
| service | Mobile history search | `apps/mobile/src/features/memory/services/pastChatContext.ts` | Calls /api/search from the phone (line 72). |
| service | Free daily vector cap | `apps/web/lib/services/tier-unit-quota-service.ts` | Limits query embeddings for Free. |
| test | Search service tests | `apps/web/lib/services/__tests__/retrieval-search-service.test.ts` | Fusion, keyword fallback, region refusals. |
| test | Rank tests | `packages/platform/data-layer/src/__tests__/search-rank.test.ts` | Fusion and rerank. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client sends the query (web dialog or mobile history search or chat server internal call). | device and our servers | global-search-service.ts; route.ts:245 |
| Server checks the workspace region against the serving region. | our servers | retrieval-search-service.ts:451-459; route.ts:154-168 |
| Server checks whether any embedded chunk exists in scope; if so, embeds the query through a managed route (metered, Free daily cap). | outside service | retrieval-search-service.ts:155-175; retrieval-embedding-service.ts:238-249 |
| One SQL runs lexical and vector candidate lists and joins origin checks. | our servers | retrieval-search-service.ts:190-275,490 |
| Candidates are fused and reranked in code and returned. | our servers | retrieval-search-service.ts:520-526; rank.ts:49-95 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Search history row via track_search (query text and count) | cloud database function track_search | Server only | unknown; skipped when track=false or cross-site (route.ts:603-616). |

**Models and providers.** Query embedding uses slot embedding_default through provider:vercel-gateway or provider:google; ranking itself uses no model (rank.ts).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; scoped to user and workspace (retrieval-search-service.ts:204-206). |
| Permissions | Row-level security on both tables plus explicit user_id and organization filters (0202:154-222; retrieval-search-service.ts:204-206,266-267). |
| Subscription | Free plan: 200 query embeddings per day (billing-catalog.ts:489); after that keyword results until midnight UTC (tier-unit-quota-service.ts:196-199). Other plans: no cap in this rule; managed compute access and reservation still apply (retrieval-embedding-service.ts:225-280). |
| Limits and metering | Candidates min(100, limit x 4), 16 terms, 2,000 query characters; /api/search default 50 and max 100 results (retrieval-search-service.ts:45-48; route.ts:41-42). Each vector query also records an infrastructure cost event (lines 491-497). |
| Feature flags | none found in the code |
| Model compatibility | Embeddings must be 1536 wide; other widths are refused (retrieval-index-service.ts:441-445). |
| Provider restrictions | Needs a credentialed managed embedding route; queries carrying Google user data use only providers that keep inputs out of training (retrieval-search-service.ts:174; retrieval-embedding-service.ts:215-220). |
| Local mode | none found in the code: no Local index or Local search of this kind. Mobile Local mode searches only on-device chats with a simple matcher (pastChatContext.ts:109-117). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No index for the account | semantic 'no_index'; keyword only. | retrieval-search-service.ts:165 |
| Query embedding refused | Info log; keyword only; semantic 'unavailable'. | retrieval-search-service.ts:180-187 |
| No terms and no vector | Empty hits. | retrieval-search-service.ts:469 |
| Region mismatch or unreadable | Refused with capability-unavailable message. | route.ts:154-168; residency.ts:23-59 |
| Kind not declared | Filtered out. | retrieval-search-service.ts:449,500 |
| Role or date filter used | Index search skipped. | route.ts:399-401 |
| Search fails in the dialog | Shows 'Search could not be completed'. | GlobalSearchDialog.tsx:762 |
| Mobile cloud search fails | Returns no remote results silently. | pastChatContext.ts:96-98 |
| Loading | Spinner 'Searching workspace...'. | GlobalSearchDialog.tsx:670 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/retrieval-search-service.test.ts`: Query parsing, fusion in scope, keyword-only fallback, no paid embedding when nothing embedded, region refusals.
- `packages/platform/data-layer/src/__tests__/search-rank.test.ts`: Reciprocal rank, rerank promotion, near-duplicate drop, per-source cap, term and window helpers.
- `apps/web/app/api/search/__tests__/search-residency-and-scope.test.ts`: Region rules and owner/workspace scope of every statement.
- `apps/web/app/api/search/__tests__/indexed-search.test.ts`: Indexed search results (name only).
- `packages/platform/data-layer/src/__tests__/search-residency.test.ts`: Residency decisions.
- `apps/web/lib/services/__tests__/retrieval-index-withdrawal.test.ts`: Index follows source deletion.

**Test scenarios**

- **Hybrid hit**
  1. Index two chats, one with the exact phrase and one with the same meaning in other words.
  2. Search the phrase in 'Search your workspace'.
  - Expected: Both appear, with response semantic 'used'.
- **No embeddings**
  1. Use an account with only keyword chunks.
  2. Search.
  - Expected: Results by keyword; semantic 'no_index'.
- **Other user**
  1. Search from account B for a unique word only in account A's chat.
  - Expected: No results.
- **Archived chat**
  1. Archive a chat.
  2. Wait for the trigger.
  3. Search for its words.
  - Expected: Not returned (needs 0244 applied).
- **Free cap**
  1. Use a Free account past 200 semantic queries in one UTC day.
  - Expected: Keyword results only; no error.
- **Region mismatch**
  1. Use a workspace pinned to another region.
  - Expected: Refusal naming the region.

**Where to look when it fails**

- Log '[retrieval] query embedding unavailable; ranking by full text only'.
- Response fields semantic and strategy.
- Error SearchResidencyError and message 'Search for this workspace is served only from its data region'.
- Cost event recordVectorQuery.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Archived exclusion for index search depends on a migration marked not applied; the search SQL itself has no archived filter.** Affects: Web, mobile history search.. Evidence: retrieval-search-service.ts:266-273; 0244:3.. Work needed: Confirm apply state or add the filter to the SQL.
- **Role and date filters switch off index results silently.** Affects: Web search dialog.. Evidence: route.ts:399-401.. Work needed: Tell the person or apply the filters to the index.
- **Brief says users do not run a search; they do through the web dialog and mobile history search.** Affects: Documentation.. Evidence: GlobalSearchDialog.tsx:492-496.. Work needed: Treat it as a user feature.
- **No Local or on-device hybrid search.** Affects: Mobile and desktop Local mode.. Evidence: pastChatContext.ts:109-117.. Work needed: Decide the local requirement.
- **No ranking quality evidence beyond unit tests.** Affects: All.. Evidence: Tests use fixed fixtures (search-rank.test.ts).. Work needed: Build a labelled retrieval evaluation.

**Depends on**

- F093-05
- SYS-data-model-and-migrations
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-inference-providers
- SYS-security-and-privacy
- surface:web
- surface:mobile
- mode:cloud
- table:retrieval_chunks
- table:retrieval_documents
- provider:vercel-gateway
- provider:google

## Unknown

- Whether 0202 and 0244 are applied.
- How desktop and the extensions search their own content.
- Which embedding model and route production uses.
- Search history retention for track_search.
- Whether the file-search tool and research file sources add rules beyond this provider (not opened).
