---
id: "F093-05"
type: "feature"
title: "Building the search index"
aliases: ["Retrieval index", "Document chunking", "Embedding generation", "Indexing for search", "index-retrieval-documents", "S93.18", "S93.19"]
area: "93 Search, retrieval, and context components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S93.18", "S93.19"]
depends_on: ["SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "SYS-inference-providers", "SYS-model-catalog-and-routing", "SYS-files-artifacts-and-storage", "SYS-execution-boundaries", "mode:cloud", "surface:web", "table:retrieval_documents", "table:retrieval_chunks", "provider:vercel-gateway", "provider:google"]
basis: "code inspection"
second_reader: "8 of 10 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F093-05 Building the search index

The indexer cuts project files, library files, chats, artifacts, reports and developer sessions into overlapping text chunks and stores them with a text-search column and, when possible, an embedding vector. Embedding is a metered call. If it fails, chunks stay keyword-searchable and indexing retries with growing delays. A cron sweep every ten minutes starts the work.

Area: [93. Search, retrieval, and context components](README.md). Requirement items: [S93.18](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9318), [S93.19](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9319).

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

**What it does.** Claims a pending retrieval document, loads its source text, cuts it into 1,400-character windows with 200 overlap (max 400 chunks), embeds the chunks in metered batches, writes chunks and settles the document status in one transaction (apps/web/lib/services/retrieval-index-service.ts:417-436,479-518,658-785; packages/platform/data-layer/src/search/chunk.ts:10-15).

**Why it exists.** Search by meaning and by keyword needs a prepared copy of the content; 0202 says nothing was embedded before so there was no semantic or hybrid retrieval on managed cloud (apps/web/db/neon/0202_retrieval_index.sql:6-10).

**Who uses it.** The platform runs it in the background; people see only index status on project files.

**Problems it solves**

- Large files that cannot be sent whole.
- Search that matched only titles and messages (0202:6-8).
- A failed embedding losing the content: chunks are still stored for keyword (retrieval-index-service.ts:496-512).
- Duplicate work: unchanged text costs nothing (lines 700-717).

**Use cases**

- A new project file is indexed within ten minutes.
- A chat is re-indexed after it changes.
- A failed file is retried by the person with 'Retry indexing'.
- A file restored after deletion is indexed again.

## 2. User experience

**Where to find it**

- Web: Projects, knowledge files list: status 'Indexing for search', 'Keyword search only', 'Not indexed', and 'Retry indexing' for failed files (KnowledgeIndexStatus.tsx:28-70; KnowledgeFilesPanel.tsx:125).
- No status or retry for chats, library files, artifacts or reports was found. unknown.
- Other apps: no indexing control found.

**Before you start**

- A source saved on the Cloud service; for semantic indexing a managed embedding route and managed compute access.

**Screens and controls**

- Index status line per knowledge file; 'Retry indexing' link shown when status is failed (KnowledgeIndexStatus.tsx:56-71).

**Journey**

1. The person adds a project file or chats.
2. A database trigger creates or marks the retrieval document (0202 header lines 26-30).
3. Within about ten minutes the cron sweep reserves it and starts a workflow (vercel.json:62-63; route.ts:25-33).
4. The workflow indexes it (index-retrieval-document.ts:33-50).
5. The file list shows status until indexed; a failed file shows the reason and 'Retry indexing'.
6. The person can press 'Retry indexing', which posts to the reindex route.

**What the person sees and gets**

- Status text and error messages such as 'Semantic indexing needs managed compute on your plan or workspace; keyword search still works.' (retrieval-index-service.ts:104-117).
- 202 response with indexing state and 'dispatched' flag from the reindex route.

**Settings**

- None for the person. Operator: cron route and low-power skip (route.ts:21-22).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Chunking with paragraph and sentence boundary search (chunk.ts:17-47).
- Per-kind source loaders for project files, library files, chats, artifacts, reports and developer sessions (retrieval-index-service.ts:240-410, partly read).
- Metered embedding in batches with reservation and settle (retrieval-embedding-service.ts:204-333).
- Failure keeps chunks and retries: 5-minute base doubling to 24 hours, 6 hours for no route or not entitled, max 5 attempts (retrieval-index-service.ts:39,48-49,452-454,720-724).
- Run fenced to the claiming workflow id, so a stale run writes nothing (lines 520-540,745-753).
- Cron sweep every 10 minutes, 50 documents per sweep, skip on low power (vercel.json:62-63; retrieval-index-service.ts:790-815; route.ts:21-33).
- Retry route and media-asset reindex (lines 868-925).

**Incomplete**

- After five failed attempts the sweep no longer picks the document up; only 'Retry indexing' for project files resets attempts (retrieval-index-service.ts:803-806,868-880). No equivalent control for other kinds was found.
- Embedding entitlement check hardcodes surface 'web' (retrieval-embedding-service.ts:226-234).

**Present but disconnected or switched off**

- The 0202 and 0244 headers still say NOT YET APPLIED but are stale; later migrations are applied past them. Check migration tracking to confirm, but treat as applied (apps/web/db/neon/0202_retrieval_index.sql:4; 0244_archived_resources_leave_ai_retrieval.sql:3; AGENTS.md section 5).

**Not available**

- No on-device indexing: the index is built on our servers for every app. CLI, VS Code and Chrome extension do not build or query it (none found).

## 4. Required behaviour

**Established requirements**

- Documents are split into chunks for indexing. (source: S93.18 (brief))
- Chunks get embeddings generated (metered) for semantic search. (source: S93.19 (brief))
- A chunk written without an embedding is still found by full text. (source: 0202 header lines 20-23)
- Embedding usage is reserved and settled through the managed usage ledger. (source: retrieval-embedding-service.ts:199-203,254-331)
- Sources soft-deleted, temporary or archived leave the index. (source: 0202 header lines 26-28; 0244 header)

**Acceptance criteria**

1. A new project file gets a retrieval_documents row and, after the sweep, status indexed with chunk_count > 0.
2. A document never exceeds 400 chunks.
3. If embedding fails, chunks exist with null embeddings, status failed, last_error set and next_attempt_at in the future.
4. After 5 failures the sweep does not pick it up; 'Retry indexing' resets attempts to 0.
5. Unchanged text and existing embeddings cause no new embedding call.
6. A deleted source removes its document and chunks.
7. Every embedding call writes a reservation and a settlement.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Free accounts index by keyword always and semantically within managed access [inferred from the failure messages].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer retry and status for chats and library files.
- [proposed] Alert when a document hits the attempt limit.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | indexRetrievalDocument | `apps/web/lib/services/retrieval-index-service.ts` | Claim, load, chunk, embed, write, settle (line 658). |
| service | prepareChunks / windowText | `packages/platform/data-layer/src/search/chunk.ts` | Window cutting with offsets. |
| service | embedTextsMetered | `apps/web/lib/services/retrieval-embedding-service.ts` | Billed embedding call (line 204). |
| service | reserveDueRetrievalDocuments | `apps/web/lib/services/retrieval-index-service.ts` | Reserves due documents for the sweep (line 790). |
| job | index-retrieval-documents cron | `apps/web/app/api/cron/index-retrieval-documents/route.ts` | GET every 10 minutes; starts workflows. |
| config | Cron schedule | `vercel.json` | '*/10 * * * *' at line 62-63. |
| job | retrievalIndexWorkflow | `apps/web/lib/workflows/retrieval-index-workflow.ts` | Durable workflow wrapper. |
| job | indexRetrievalDocumentWorkflowStep | `apps/web/lib/workflows/steps/index-retrieval-document.ts` | Step that calls the indexer under a scoped database. |
| endpoint | POST reindex | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/reindex/route.ts` | Owner-triggered re-index of one file. |
| table | retrieval_documents | `apps/web/db/neon/0202_retrieval_index.sql` | Index state per source (lines 48-99). |
| table | retrieval_chunks | `apps/web/db/neon/0202_retrieval_index.sql` | Chunks, tsvector, vector(1536) (lines 116-137). |
| schema | Archive triggers | `apps/web/db/neon/0244_archived_resources_leave_ai_retrieval.sql` | Delete index rows for archived chats and project files. |
| config | embedding_default slot | `apps/web/lib/services/retrieval-embedding-service.ts` | Routing slot for the embedding model (line 48). |
| component | KnowledgeIndexStatus | `apps/web/features/projects/components/KnowledgeIndexStatus.tsx` | Shows status and retry. |
| service | Free daily vector cap | `apps/web/lib/services/tier-unit-quota-service.ts` | Query-embedding allowance (lines 157-160,196-199). |
| test | Index service tests | `apps/web/lib/services/__tests__/retrieval-index-service.test.ts` | Chunking, indexing, retry, fencing. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A trigger on the source table enqueues or marks stale a retrieval document. | our servers | 0202 header 26-30; 0244:26-60 |
| Cron reserves due documents (holds them 15 minutes) and starts index workflows. Only the cron sweep and the reindex route start indexing. A document is dispatch-held for 15 minutes (DISPATCH_HOLD_MINUTES) at reservation, separate from the 10-minute lease, so a failed workflow start waits up to 15 minutes, not 10, for retry. | our servers | route.ts:25-33; retrieval-index-service.ts:50-51,790-815 |
| The step claims the document, loads source text, windows it and hashes it. The workflow step runs under createClaimedUserScopedDb with the owner's userId and organizationId, so organization and workspace policy applies to indexing, not just individual accounts. | our servers | retrieval-index-service.ts:658-700; apps/web/lib/workflows/steps/index-retrieval-document.ts:38-45 |
| Embedding call reserves usage, calls the gateway or Google embeddings, settles the cost. | outside service | retrieval-embedding-service.ts:254-331 |
| One transaction settles the document and rewrites chunks. | our servers | retrieval-index-service.ts:741-753 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| retrieval_documents state and retrieval_chunks (text, offsets, tsvector, 1536-number vector) | cloud database, row-level security by owner | Server only | Cascade delete with the source; deleted when source is soft-deleted or temporary; archive removal via 0244 (header says NOT YET APPLIED but is stale; treat as applied). |
| Embedding usage records (type retrieval_embedding) | managed usage ledger and COGS ledger | Server only | unknown |

**Models and providers.** The embedding model comes from routing slot embedding_default; routes must use the vercel_gateway/embeddings or google/embeddings harness and a credentialed managed provider (retrieval-embedding-service.ts:48,68-73,96-115). Providers: provider:vercel-gateway, provider:google. Google-user-data text is limited to providers that keep inputs out of training (lines 215-220). More generally, a no-training provider filter is applied when the user opted out of side-call training, embedding input is truncated per text (MAX_EMBEDDING_INPUT_CHARS) and each call is capped at MAX_EMBEDDING_INPUTS (retrieval-embedding-service.ts:210-220).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in owner; the workflow runs under a user-scoped database (index-retrieval-document.ts:36-41). |
| Permissions | Owner must own the source (0202:159-207 policies). |
| Subscription | Free plan passes the subscription check for managed compute (managed-compute-access.ts:74), but workspace policy (managed-compute-access.ts:191) can still refuse. Free has a 200 queries/day cap for query embeddings only; document embedding has no daily cap in this code. Paid plans: no cap in this rule (billing-catalog.ts:737-739). Reservation and entitlement can still refuse: code not_entitled or billing_refused. |
| Limits and metering | Max 400 chunks, 200,000 source characters, 400 chat messages, 50 documents per sweep, 5 attempts (retrieval-index-service.ts:39-48). Embedding input is truncated per text (MAX_EMBEDDING_INPUT_CHARS) and each call is capped at MAX_EMBEDDING_INPUTS (retrieval-embedding-service.ts:210-220). A quota read failure lets the call through (tier-unit-quota-service.ts:391-405). |
| Feature flags | Low-power cron skip (route.ts:21-22). |
| Model compatibility | Vector width fixed at 1536; a different width needs a migration and full re-index (types.ts:12-17; 0202:130). |
| Provider restrictions | Needs a managed embedding provider; none means keyword only with message 'Semantic indexing is not configured on this deployment; keyword search still works.' |
| Local mode | No Local indexing exists. Local-mode content is not indexed by this feature; chat and project content saved to Cloud is indexed and embedded on our servers, using managed compute regardless of the chat's mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Embedding refused or failed | Chunks stored without vectors; status failed; retry scheduled. | retrieval-index-service.ts:496-512,720-740 |
| No route or not entitled | Retry in 6 hours. | retrieval-index-service.ts:46,720-722 |
| Source gone | Document deleted, outcome removed. | retrieval-index-service.ts:690-697 |
| Newer run took over | This run writes nothing and skips. | retrieval-index-service.ts:741-748 |
| Chunk write fails | Settled as failed with 'This source could not be indexed. Retry indexing to try again.' | retrieval-index-service.ts:130,754-769 |
| Workflow does not start | Warn; the next sweep retries, but only after the 15-minute dispatch hold (DISPATCH_HOLD_MINUTES) set at reservation, not the 10-minute lease. | apps/web/lib/workflows/start-retrieval-index-workflow.ts:43-46; retrieval-index-service.ts:50-51,790-815 |
| Unchanged text | Settled 'unchanged' with no cost. | retrieval-index-service.ts:700-717 |
| Lease expiry | A stuck 'indexing' document is picked up again after 10 minutes. | retrieval-index-service.ts:50,478-492,806 |
| Offline or cancel | not handled in the code; background job. | Searched retrieval-index-service.ts and the cron route; no cancel path exists, only lease expiry and retry. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/retrieval-index-service.test.ts`: Chunk windows, digest, embed and index, retry on refusal, unchanged cost, deletion, fencing.
- `apps/web/lib/services/__tests__/retrieval-embedding-service.test.ts`: Route resolution, reserve and settle, fingerprint, failure release, no-managed-compute refusal, training policy.
- `apps/web/lib/services/__tests__/retrieval-index-withdrawal.test.ts`: Each source kind leaves the index when its original does.
- `apps/web/app/api/cron/index-retrieval-documents/route.test.ts`: Cron route (name only; contents not read).
- `packages/platform/data-layer/src/__tests__/search-chunk-contract.test.ts`: Chunk contract.

**Test scenarios**

- **New file indexed**
  1. Add a text file to a project.
  2. Wait for the sweep or trigger the cron route with the cron secret.
  3. Read retrieval_documents.
  - Expected: status indexed, chunk_count > 0, embedding_model set.
- **Embedding down**
  1. Remove the embedding credential.
  2. Add a file.
  - Expected: Chunks exist with null embedding; status failed; last_error says keyword search still works; retry in 6 hours.
- **Retry**
  1. Open a failed file and press Retry indexing.
  - Expected: 202 with dispatched true; attempts reset to 0.
- **Edit**
  1. Replace the file text.
  - Expected: Document goes stale, new chunk_version, old chunks replaced.
- **Give up**
  1. Fail embedding five times.
  - Expected: Sweep stops picking it; only manual retry resumes.

**Where to look when it fails**

- Logs '[retrieval] embedding failed; chunks are stored for keyword search only', '[retrieval] chunk write failed', 'Retrieval index sweep failed'.
- retrieval_documents.status, attempts, last_error, next_attempt_at.
- Cron response JSON {due, started, failed}.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Dead-end after 5 failures for chats, library files, artifacts and reports.** Affects: Web users of search over those sources.. Evidence: retrieval-index-service.ts:803-806; only project files have a retry control (KnowledgeFilesPanel.tsx:125).. Work needed: Add retry or a periodic reset; or alert.
- **Index and embedding are Cloud-only, even for Local-mode content saved to Cloud.** Affects: Local users on web, desktop, mobile who also sync.. Evidence: retrieval-embedding-service.ts:215-234.. Work needed: Confirm Local content never reaches the index; document the boundary.
- **Embedding entitlement is evaluated as surface 'web'.** Affects: Users of other apps whose content is indexed.. Evidence: retrieval-embedding-service.ts:226-234.. Work needed: Pass the real surface if rules differ.
- **The 0202 and 0244 headers still say NOT YET APPLIED, a stale comment; later migrations are applied past them, so treat both as applied.** Affects: Header comments mislead readers about indexing availability.. Evidence: Headers at line 4 (0202) and 3 (0244); AGENTS.md section 5 (append-only applied chain).. Work needed: Check migration tracking to confirm; remove the stale header text only through a new migration, since applied files are checksummed.
- **No on-device index for mobile or desktop Local search.** Affects: Mobile and desktop Local mode.. Evidence: Mobile uses string search of stored chats (pastChatContext.ts:37-70).. Work needed: Decide if a local index is required.

**Depends on**

- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- SYS-inference-providers
- SYS-model-catalog-and-routing
- SYS-files-artifacts-and-storage
- SYS-execution-boundaries
- mode:cloud
- surface:web
- table:retrieval_documents
- table:retrieval_chunks
- provider:vercel-gateway
- provider:google

## Unknown

- Whether 0202 and 0244 are applied in every environment (their headers say NOT YET APPLIED but are stale; the applied chain runs well past them).
- Which concrete embedding model and provider route runs in production.
- Retention of usage records for embedding.
- Paid-plan limits on document embedding beyond the reservation check.
- Whether library files, artifacts, reports and developer sessions ever show index status in a UI.

## Second reader's check

A second reader checked 10 statements of this page against the code: 8 correct, 2 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 7):** "Free plan is allowed managed compute (managed-compute-access.ts:55)" The code shows: The Free-tier allow is at line 74 (isFreePlanTier returns SUBSCRIPTION_ALLOWED), not 55. Also this is only the subscription half; evaluateManagedComputeAccess then runs a workspace access check that can still refuse. (apps/web/lib/services/managed-compute-access.ts:74,177-191). **Corrected:** Free plan passes the subscription check (managed-compute-access.ts:74), but workspace policy (:191) can still refuse.
- **Partly wrong (section 3/10):** "0202 header: NOT YET APPLIED, draft only; apply state unknown" The code shows: The header text does say NOT YET APPLIED, but it is a stale comment. Migrations form an applied, append-only checksummed chain far beyond 0202 (production is at 0425 per project notes and AGENTS.md), so 0202 and 0244 are applied in the chain. 'Unknown' and the Gap row 'not established as applied' overstate the doubt. (apps/web/db/neon/0202_retrieval_index.sql:4; apps/web/db/neon/0244_archived_resources_leave_ai_retrieval.sql:3; AGENTS.md section 5). **Corrected:** The 0202/0244 headers still say NOT YET APPLIED but are stale; later migrations are applied past them. Check migration tracking to confirm, but treat as applied.

**Facts the page missed**

- Only the cron sweep (route.ts:25-33) and the reindex route start indexing; the workflow step runs under createClaimedUserScopedDb with the owner's userId and organizationId (apps/web/lib/workflows/steps/index-retrieval-document.ts:38-45), so organization/workspace policy applies to indexing, not just individual accounts.
- Embedding input is truncated per text (MAX_EMBEDDING_INPUT_CHARS) and each call is capped at MAX_EMBEDDING_INPUTS, with a no-training provider filter applied when the user opted out of side-call training (retrieval-embedding-service.ts:210-220); the page mentions only Google user data.
- A document is dispatch-held for 15 minutes (DISPATCH_HOLD_MINUTES) at reservation, separate from the 10-minute lease (retrieval-index-service.ts:50-51,790-815); the page notes both but never explains that a failed workflow start waits up to 15 minutes, not 10, for retry.
