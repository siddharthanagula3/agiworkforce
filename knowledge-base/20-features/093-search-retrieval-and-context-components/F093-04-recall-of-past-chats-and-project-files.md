---
id: "F093-04"
type: "feature"
title: "Recall of past chats and project files"
aliases: ["Past-chat recall", "Search past chats", "Project knowledge retrieval", "Conversation retrieval", "Project retrieval", "S93.07", "S93.08"]
area: "93 Search, retrieval, and context components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S93.07", "S93.08"]
depends_on: ["SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-inference-providers", "F093-01", "F093-05", "F093-06", "surface:web", "surface:mobile", "mode:cloud", "mode:local", "table:web_messages", "table:retrieval_chunks"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F093-04 Recall of past chats and project files

Recall finds earlier chats and project files that match the current question and adds short passages to the turn. Past chats need the 'Search past chats' switch and are skipped in temporary chats. Project files use the search index for large files and per-request passage picking otherwise. Failures are reported to the model as degraded recall.

Area: [93. Search, retrieval, and context components](README.md). Requirement items: [S93.07](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9307), [S93.08](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9308).

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

**What it does.** Past chats: semantic search over the conversation index with a keyword fallback and a short window of unindexed recent messages (apps/web/lib/services/past-chat-context-service.ts:371-396). Project files: for files over 16,000 characters, asks the index for passages; otherwise picks passages per request (project-context-service.ts:339-350; project-knowledge-retrieval.ts:27-65).

**Why it exists.** So the assistant can use what the person said before and what their project files say, without sending everything every turn; the budget is small (past-chat-context-service.ts:28-43; project-context-service.ts:79-93).

**Who uses it.** People who turn on 'Search past chats' and people who add knowledge files to a project.

**Problems it solves**

- Answering with knowledge from another chat.
- Large files that do not fit in the prompt.
- A silent empty result being mistaken for 'nothing found' (past-chat-context-service.ts:364-370).
- Quoting a stale passage after a file changed (project-knowledge-retrieval.ts:67-72,86-87).

**Use cases**

- Ask 'what did we decide about the pricing page?' and an excerpt from last week's chat is used.
- Ask about a clause in a long contract uploaded to a project.
- In a project, ask about work done in another chat of the same project.
- A scheduled agent reads the last 24 hours of chats (past-chat-context-service.ts:555-587).

## 2. User experience

**Where to find it**

- Web: Settings, Memory, switch 'Search past chats' (MemorySection.tsx:409-416).
- Web: Projects, knowledge files list shows 'Indexing for search', 'Keyword search only', 'Not indexed' and a 'Retry indexing' link (apps/web/features/projects/components/KnowledgeIndexStatus.tsx:28-70).
- Mobile: Memory settings has a past-chats switch (apps/mobile/(app)/settings/memory.tsx, found by search, not opened); in Local mode past chats come from chats stored on the phone (apps/mobile/src/features/memory/services/pastChatContext.ts:109-126).
- Desktop (Electron): shows the hosted web app [inferred].
- CLI, VS Code, Chrome extension: no use found. unknown.

**Before you start**

- Past chats: switch on (default off), memory not disabled, not a temporary chat, non-empty question, surface not 'api' (managed-memory-context-service.ts:278; turn-context-service.ts:128-131).
- Project files: the chat belongs to a project that is not archived (project-context-service.ts:205-209).

**Screens and controls**

- Switch 'Search past chats': 'Let the assistant look up excerpts from your other conversations when answering. Never used in temporary chats.'
- Per-file index status and 'Retry indexing' link (shown only when status is failed).

**Journey**

1. The person turns on 'Search past chats' or adds files to a project.
2. They ask a question.
3. The server pulls matching past-chat excerpts and project passages (turn-context-service.ts:152-174).
4. The engine admits, dedups and caps them (see F093-01).
5. The model answers; citations for past chats and project files are returned with the turn (turn-context-service.ts:219-240).
6. If recall failed the model is told so and does not claim to have checked (past-chat-context-service.ts:45-46).

**What the person sees and gets**

- Past-chat citations and project file citations on the answer.
- Index status text per knowledge file.
- Mobile Local mode: no server citations; excerpts come from the device store.

**Settings**

- capabilities.searchPastChats (user), allowPastChats (workspace)
- Project knowledge files and archive state.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Semantic recall via the shared search provider, kinds ['conversation'], 12 hits, 3 per conversation (past-chat-context-service.ts:272-306).
- Keyword fallback with up to 4 terms and 50 candidates when no index exists (lines 308-362,392).
- Recent unindexed messages (last 2 hours) are also keyword-matched when the index exists (lines 33,380-390).
- Deleted, temporary and Google-user-data chats and deleted messages excluded (lines 253-261,342-350).
- Failed recall reported as degraded (lines 405-428; turn-context-service.ts:225-236).
- Project files: indexed passages are used only when offsets and text still match the stored file (project-knowledge-retrieval.ts:81-90).
- Archived project files not loaded; sibling chats exclude archived chats (project-context-service.ts:208,248).
- Sibling chats ranked by title and excerpt overlap (project-context-service.ts, ranking before line 339).

**Incomplete**

- Past-chat keyword and hydrate queries have no archived filter, while the sibling-chat query does (past-chat-context-service.ts:253-261,342-350 vs project-context-service.ts:248). Index entries for archived chats are removed only if migration 0244 is applied; its header says NOT YET APPLIED (0244:3).
- The index is used for project files only when a file's text exceeds 16,000 characters (project-context-service.ts:82,339-350).

**Present but disconnected or switched off**

- The Free chat path calls project loading with semanticRetrieval false, so no query embedding is paid for there (turn-context-service.ts:357-363).

**Not available**

- No project-file recall in Local mode on web: the local-context response has instructions and memory only (turn-context-service.ts:433-437).
- Mobile Cloud mode relies on the server; the device function's cloud branch is not used in chatExecutionStore.ts:2800-2813 when the server assembles.

## 4. Required behaviour

**Established requirements**

- Past conversations are retrievable by relevance, excluding temporary and deleted chats. (source: S93.07 (brief))
- Project knowledge files are retrievable by relevance for chats in that project. (source: S93.08 (brief))
- An archived resource is not listed, searchable or AI-retrievable but stays restorable. (source: apps/web/db/neon/0244_archived_resources_leave_ai_retrieval.sql:12-17 (cites packages/contracts/types/src/resource-lifecycle.ts))
- A failed recall must be distinguishable from an empty one. (source: past-chat-context-service.ts:364-370)
- Temporary chats never use past chats. (source: MemorySection.tsx:409-411; context-source.ts:204)

**Acceptance criteria**

1. With the switch off, no past-chat text is in the turn.
2. With the switch on, a question matching an earlier chat adds an excerpt and a citation.
3. A deleted or temporary chat never appears.
4. An archived chat never appears, including when the keyword path runs.
5. When recall fails, the model gets the degraded notice and no citations.
6. An edited project file never shows old passages.
7. A project that is archived adds no files.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Archived chats should be excluded in every path, since the lifecycle contract says so [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the archived filter to the keyword and hydrate queries.
- [proposed] Show the person which past chats were used.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | past-chat-context-service | `apps/web/lib/services/past-chat-context-service.ts` | Semantic and keyword recall, degraded notice, loaders. |
| service | project-context-service | `apps/web/lib/services/project-context-service.ts` | Loads project, files, sibling chats; picks passages; budgets. |
| service | project-knowledge-retrieval | `apps/web/lib/services/project-knowledge-retrieval.ts` | Index passages for large files and offset checks. |
| service | turn-context-service | `apps/web/lib/services/turn-context-service.ts` | Decides when recall runs and wires loaders. |
| service | retrieval-search-service | `apps/web/lib/services/retrieval-search-service.ts` | Index search used by both recalls (F093-06). |
| table | web_messages and web_conversations | `apps/web/lib/services/past-chat-context-service.ts` | Keyword and hydration source rows (lines 244-264,333-356). |
| table | project_knowledge_files and user_projects | `apps/web/lib/services/project-context-service.ts` | Project and file rows (lines 205-225). |
| schema | 0244 archive triggers | `apps/web/db/neon/0244_archived_resources_leave_ai_retrieval.sql` | Remove archived chats and project files from the index (draft). |
| component | MemorySection | `apps/web/features/settings/sections/MemorySection.tsx` | Search past chats switch. |
| component | KnowledgeIndexStatus | `apps/web/features/projects/components/KnowledgeIndexStatus.tsx` | Per-file index status and Retry indexing. |
| service | Mobile past-chat recall | `apps/mobile/src/features/memory/services/pastChatContext.ts` | Local mode uses on-device chats; cloud branch calls /api/search. |
| service | Mobile execution store | `apps/mobile/stores/chat/chatExecutionStore.ts` | Skips device recall when the server assembles (line 2800-2813). |
| other | Shared past-chat helpers | `packages/platform/utils/src/pastChatContext.ts` | Term selection, excerpt selection and fencing shared by web and mobile. |
| endpoint | POST reindex knowledge file | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/reindex/route.ts` | Retry indexing for one file. |
| test | past-chat tests | `apps/web/lib/services/__tests__/past-chat-context-service.test.ts` | Scoping, selection, formatting. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server checks switches and builds the past-chat and project loaders. | our servers | turn-context-service.ts:124-174 |
| Past chats: index search; if no index, keyword scan of web_messages; recent unindexed messages also keyword-matched. | our servers | past-chat-context-service.ts:371-396 |
| The index search embeds the question through a managed embedding route (a charged outside call). | outside service | retrieval-search-service.ts:166-175; retrieval-embedding-service.ts:285 |
| Rows are re-read under ownership, deletion and temporary filters before use. | our servers | past-chat-context-service.ts:222-265 |
| Project files: load rows, ask the index for large files, pick passages, render blocks. | our servers | project-context-service.ts:188-350 |
| Engine admits and caps; text goes into the prompt. | our servers | engine.ts:162-321 |
| Mobile Local mode: device store search, no server. | device | pastChatContext.ts:109-126 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No new data; reads chats, messages, files and index chunks | cloud database tables named above | Server only | Follows source retention; index removal on delete or archive via triggers (0202 header; 0244). |

**Models and providers.** Question embedding uses the managed embedding route (slot embedding_default) through provider:vercel-gateway or provider:google harness (retrieval-embedding-service.ts:48,68-73,96-115,146-168). No chat model is used for recall.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; rows are filtered by user_id and workspace (past-chat-context-service.ts:253-255). |
| Permissions | Workspace policy allowPastChats; Google-user-data chats excluded (lines 257,347). |
| Subscription | No plan name read for recall. The query embedding goes through managed compute access and, on the Free plan, a daily cap of 200 vector queries (retrieval-embedding-service.ts:225-249; packages/contracts/types/src/billing-catalog.ts:489,737-739). Over the cap, results use keyword matching. |
| Limits and metering | 12 semantic hits, 3 per chat, 50 keyword candidates, 4 query terms; project: 24 passages, 8 per file; totals in past-chat-context-service.ts:28-43 and project-context-service.ts:79-93. |
| Feature flags | semanticRetrieval option; surface 'api' never uses past chats. |
| Model compatibility | none found in the code |
| Provider restrictions | Embedding needs a credentialed managed route; Google-user-data text only goes to providers that keep inputs out of training (retrieval-embedding-service.ts:215-220). |
| Local mode | Mobile Local: searches chats stored on the phone with no server call (pastChatContext.ts:109-126). Web Local-model turns get no past chats (turn-context-service.ts:433-437). Desktop and others unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty question | No recall. | turn-context-service.ts:131; past-chat-context-service.ts:376 |
| No index yet | Keyword scan of web_messages. | past-chat-context-service.ts:291,392 |
| Recall throws | Degraded notice to the model, no citations. | past-chat-context-service.ts:405-428; turn-context-service.ts:233-236 |
| Past chat older than 90 days | Marked stale by freshness window (dropped only when the loader says so; this loader does not). | past-chat-context-service.ts:36,468 |
| Archived chat via keyword path | Not excluded by these queries. | past-chat-context-service.ts:342-350 |
| File changed after indexing | Hit dropped when text does not match. | project-knowledge-retrieval.ts:86-87 |
| Index lookup fails for project files | Warn and select passages per request. | project-knowledge-retrieval.ts:58-63 |
| Offline | Mobile Local works from device; cloud recall offline behaviour is not handled in this code. | Searched past-chat-context-service.ts and pastChatContext.ts; the cloud branch swallows errors and returns no results (pastChatContext.ts:96-98) but no offline handling exists. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/past-chat-context-service.test.ts`: User scoping, project confinement, no terms, selection and formatting.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.memory.test.ts`: Past chats and sibling chats through resolveInteractiveTurnContext.
- `apps/web/lib/services/__tests__/project-context-service.test.ts`: Project context loading.
- `apps/web/lib/services/__tests__/project-context-knowledge-relevance.test.ts`: Relevance of knowledge passages.
- `apps/web/lib/services/__tests__/project-context-withdrawal.test.ts`: Withdrawn project content.
- `apps/web/lib/services/__tests__/project-knowledge-passages.test.ts`: Passage selection.
- `apps/mobile/__tests__/past-chat-context.test.ts`: Mobile recall.

**Test scenarios**

- **Recall on**
  1. Turn on Search past chats.
  2. Ask about a topic from another chat.
  - Expected: An excerpt and a citation from that chat.
- **Temporary chat**
  1. Open a temporary chat; ask the same.
  - Expected: No excerpt.
- **Archived chat**
  1. Archive the chat.
  2. Ask the same on an account with no index (keyword path).
  - Expected: Should not appear; check whether it does.
- **Degraded recall**
  1. Force the past-chat read to fail.
  - Expected: Model says it could not read recall; no citations.
- **Large project file**
  1. Add a file over 16,000 characters.
  2. Ask about a detail near the end.
  - Expected: The matching passage is in the prompt with a file citation.

**Where to look when it fails**

- Log 'Past-chat recall read failed; the turn is told its recall is degraded'.
- Log '[project-context] indexed knowledge retrieval failed; selecting passages per request'.
- Span memory.past_chats.load with retrieval.mode attribute.
- retrieval_documents.status and last_error for the file.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Archived chats can be recalled on the keyword path and in the 2-hour unindexed window.** Affects: Web Cloud chat.. Evidence: past-chat-context-service.ts:253-261,342-350 have no archive filter; sibling query has one at project-context-service.ts:248.. Work needed: Add coalesce(c.archived,false)=false to both queries and a test.
- **Archive exclusion in the index depends on a migration marked not applied.** Affects: Web.. Evidence: 0244 header line 3.. Work needed: Confirm apply state per environment.
- **Local mode on web has no past chats or project files.** Affects: Web Local-model chats.. Evidence: turn-context-service.ts:433-437.. Work needed: Decide whether a Local source is required; keep consent rules.
- **CLI, VS Code and Chrome extension recall not established.** Affects: Those apps.. Evidence: No matches found.. Work needed: Check each app.
- **The person cannot see which past chats were used except citations.** Affects: All Cloud chat users.. Evidence: No viewer found.. Work needed: Optional: show source list.

**Depends on**

- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-inference-providers
- F093-01
- F093-05
- F093-06
- surface:web
- surface:mobile
- mode:cloud
- mode:local
- table:web_messages
- table:retrieval_chunks

## Unknown

- Whether 0202 and 0244 are applied.
- How desktop (Tauri) Local mode does recall.
- Whether CLI, VS Code and Chrome extension recall past chats.
- Exact UI labels for the temporary chat control.
- The mobile memory settings labels (file not opened).
