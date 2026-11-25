---
id: "F090-06"
type: "feature"
title: "Search, export and import"
aliases: ["Conversation search index (S90.09)", "Transcript export (S90.10)", "Import and migration adapters (S90.22)", "Global search", "Export Chat History", "Import memory from other AI providers", "GET /api/search", "POST /api/memory/import"]
area: "90 Conversation and synchronization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S90.09", "S90.10", "S90.22"]
depends_on: ["SYS-data-model-and-migrations", "SYS-memory-projects-and-context", "SYS-security-and-privacy", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "SYS-api-and-contracts", "F090-01", "mode:cloud", "mode:local", "table:web_messages", "table:web_conversations", "table:user_memories"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F090-06 Search, export and import

Three separate functions. Search finds words in chat titles and messages on the server (web) or on the phone (mobile). Export builds Markdown, JSON, HTML, PDF or Word files in the browser from an open chat. Import adds text memories from pasted ChatGPT, Claude or similar output; it does not import chats.

Area: [90. Conversation and synchronization components](README.md). Requirement items: [S90.09](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9009), [S90.10](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9010), [S90.22](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9022).

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

**What it does.** Search: substring match on titles and message text, plus an index search for artifacts, code sessions and projects, through GET /api/search (apps/web/app/api/search/route.ts:245-626). Export: turns the open chat into a downloaded file in the browser (apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:94-168). Import: a two-step dry run and commit that writes memory items, not chats (apps/web/app/api/memory/import/route.ts:55-195).

**Why it exists.** People must find old conversations, take a transcript out of the product, and bring what other assistants know about them (doc: docs/product/experience-contract.md:780 row W07; doc: knowledge-base/data/area-briefs/090-conversation-and-synchronization-components.md S90.09, S90.10, S90.22).

**Who uses it.** People with long histories; people leaving or backing up a chat; people moving from other assistants.

**Problems it solves**

- Finding a past answer.
- Keeping a copy outside the product.
- Starting with a personal context instead of an empty memory.

**Use cases**

- Search for a phrase and jump to the message with it highlighted.
- Export a chat to Word.
- Paste the reply of another assistant listing what it knows, preview, and save selected items as memories.

## 2. User experience

**Where to find it**

- Web: the Search dialog (title Search; input Search your workspace; empty text No results found) (apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:474-495, :775).
- Web: chat header menu Export... opens the dialog titled Export Chat History (ConversationTitleMenu.tsx; EnhancedExportDialog.tsx:39 of the dialog body).
- Web: Settings, Memory, dialog titled Import memory from other AI providers (apps/web/features/settings/components/ImportMemoryDialog.tsx:333).
- Mobile: search box labelled Search chats, projects, files, library, and artifacts (apps/mobile/src/features/chat/ChatsListScreen.tsx:931); memory import in settings (apps/mobile/src/features/memory/services/memoryImport.ts).
- Desktop (Electron): the same hosted web app (doc: AGENTS.md section 5).
- Export and chat search on CLI, Chrome and VS Code: not found (unknown).

**Before you start**

- Signed in for server search and import.
- An open chat with messages for export.
- Search is refused outside the allowed data region (apps/web/app/api/search/route.ts:155-170).

**Screens and controls**

- Search: text box, category buttons (group labelled Search category), role and date filters, includeArchived option, recent and popular searches.
- Export: format list Markdown, PDF, Word Document, HTML, JSON; optional Filename; checkboxes Include metadata (title, date, message count) and Include message timestamps; Export button.
- Import: source choice ChatGPT, Claude, Gemini, Copilot, Other; text box or file (.txt, .json); preview list with selection; commit.

**Journey**

1. Search: open the dialog, type; results appear grouped; selecting a message opens /chat/[id]?highlightMessage=<id> and scrolls to it.
2. Export: open the header menu, choose Export..., pick a format and options, press Export; the browser downloads the file; a toast says Exported as <format>.
3. Import: copy the offered prompt to the other assistant, paste its reply, preview, deselect items, commit; a message says Imported N memories from <source>.

**What the person sees and gets**

- Search: Searching workspace... spinner; No results found; snippets around the match.
- Export: Exporting... on the button; toast Exported as <name> or Export failed. Please try again.; No session selected if nothing is open (EnhancedExportDialog.tsx:103-165).
- Import: counts of inserted, duplicate, blocked and excluded items (route.ts:156-169).

**Settings**

- Search limit default 50, maximum 100 (route.ts:41-42).
- Import: text up to 200000 characters, at most 500 items (packages/contracts/types/src/memory-import.ts:3-4).
- Export options: metadata and timestamps.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Search over chat titles and message content with ILIKE, excluding deleted and temporary chats, excluding archived unless includeArchived is true, scoped to user and workspace (route.ts:318-326, :369-379).
- Trigram indexes serve queries of three or more characters; shorter queries scan (apps/web/db/neon/0101_sync_and_search_indexes.sql:76-88).
- Index search for artifacts, code sessions and projects, with semantic result flag, skipped when role or date filters apply (route.ts:392-426, :626).
- Recent, popular and suggestion queries (route.ts:262-295); track and clear history (route.ts:637-665).
- Snippets cut around the match (route.ts:214-243).
- Export of Markdown, JSON, HTML in the browser; PDF and Word built in the browser (apps/web/features/chat/services/conversation-export.ts:84-152; document-export-service.ts:30-61).
- Expiring storage links are replaced by [expiring link removed from export] in sources, JSON attachments and metadata (conversation-export.ts:20-35, :46-67, :143-144).
- Memory import: dry run parses and previews, commit checks exclusions and write policy, then inserts with source provenance (apps/web/app/api/memory/import/route.ts:55-164).
- Mobile search uses chats and messages already on the device (apps/mobile/src/features/search/mobileGlobalSearch.ts:56-78).

**Incomplete**

- Message body text in exports is written as stored; only sources, attachments and metadata pass the expiring-link stripping (conversation-export.ts:98-116, :143-144) [inferred].
- Which messages the export contains (visible path or all variants) was not established; the page passes exportMessages (WebChatPage.tsx:7934-7939).
- Search index covers rows from the retrieval index for non-conversation kinds; message search is a live ILIKE, not a stored full-text index (route.ts:369-380).

**Present but disconnected or switched off**

- None found.

**Not available**

- Importing conversations from ChatGPT, Claude or Gemini as chats: no such route or code found. Search run: listed apps/web/app/api/chat (conversations, sync only) and the whole app/api folder, and grepped for chat export formats; only the memory import route exists (apps/web/app/api/memory/import/route.ts:13-34).
- Export on mobile, CLI, Chrome and VS Code: only a mobile local/cloud sync data-control service was found (apps/mobile/src/features/settings/data-controls/localCloudSyncService.ts); chat transcript export there is unknown.
- Server-side export of a chat: none; export is done entirely in the browser.

## 4. Required behaviour

**Established requirements**

- S90.09: conversation titles and message text are indexed so the search API finds matches quickly across the user's history. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S90.09)
- S90.10: a conversation transcript can be exported to a file (Markdown, JSON, HTML, PDF, DOCX) from the conversation. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S90.10)
- S90.22: conversation history exported from another product (ChatGPT, Claude, Gemini) or an older local store can be imported as conversations. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S90.22)
- Search covers permitted conversations, messages, projects and files with pagination and filters; deleted, temporary, foreign-account and inaccessible-workspace content stays excluded; a stale response cannot replace newer results; selecting a result opens the right message. (source: doc: docs/product/experience-contract.md:780 (W07))
- A global search UI must not imply an index that breaks Local separation. (source: doc: docs/product/experience-contract.md:569)
- Memory import persists and affects the next applicable turn; temporary chats neither read nor write memory. (source: doc: docs/product/experience-contract.md:779 (W06))

**Acceptance criteria**

1. A word in a message returns that chat's message with a snippet; a deleted or temporary chat never appears.
2. An archived chat appears only when includeArchived is true.
3. Export in each of five formats downloads a file that opens and contains the messages.
4. A signed storage link in a source line is replaced by the placeholder.
5. Import dry run writes nothing; commit writes only selected items and reports duplicates.
6. More than 200000 characters pasted is refused with an error; more than 500 items are refused on commit.
7. Searching from one workspace does not return another workspace's chats.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] S90.22 asks for conversation import; the shipped feature is memory import, so the requirement is not met.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a chat history import (ChatGPT, Claude and Gemini export files) that creates chats through the existing save route with the Free allowance applied.
- [proposed] Move message search to a stored full-text or semantic index.
- [proposed] Add transcript export to mobile and the CLI.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET/POST/DELETE /api/search | `apps/web/app/api/search/route.ts` | Search, recent, popular, suggestions, track and clear history. |
| schema | 0101 trigram indexes | `apps/web/db/neon/0101_sync_and_search_indexes.sql` | Indexes for title and message text ILIKE. |
| service | global-search-service | `apps/web/features/chat/services/global-search-service.ts` | Web client for /api/search. |
| component | GlobalSearchDialog | `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx` | Search dialog. |
| service | retrieval-search-service | `apps/web/lib/services/retrieval-search-service.ts` | Index search provider and residency. |
| service | mobileGlobalSearch | `apps/mobile/src/features/search/mobileGlobalSearch.ts` | On-device search over loaded chats. |
| service | ChatExportService | `apps/web/features/chat/services/conversation-export.ts` | Markdown, JSON, HTML builders and expiring-link stripping. |
| service | document-export-service | `apps/web/features/chat/services/document-export-service.ts` | Markdown, PDF and Word downloads. |
| service | export-pdf and export-docx | `apps/web/features/chat/services/export-pdf.ts` | Renderers for PDF and Word (export-docx.ts alongside). |
| component | EnhancedExportDialog | `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx` | Export dialog. |
| endpoint | POST /api/memory/import | `apps/web/app/api/memory/import/route.ts` | Dry run and commit of memory items. |
| service | memory-import contract | `packages/contracts/types/src/memory-import.ts` | Parsing, caps and preview building. |
| service | import-store | `apps/web/lib/memory/import-store.ts` | Persists imported memories. |
| component | ImportMemoryDialog | `apps/web/features/settings/components/ImportMemoryDialog.tsx` | Web import UI. |
| service | mobile memoryImport | `apps/mobile/src/features/memory/services/memoryImport.ts` | Mobile import; cloud scope calls the route, local scope writes on the device. |
| screen | ChatsListScreen search | `apps/mobile/src/features/chat/ChatsListScreen.tsx` | Mobile search box and results. |
| table | web_messages and web_conversations (search source) | `apps/web/db/neon/0101_sync_and_search_indexes.sql` | Searched columns. |
| table | user_memories | `apps/web/lib/memory/import-store.ts` | Target of import. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Search: the dialog calls /api/search with the query and filters. | device | apps/web/features/chat/services/global-search-service.ts:189 |
| Server rate-limits, checks the data region and runs ILIKE queries on chats and messages, and the index search. | our servers | apps/web/app/api/search/route.ts:245-250, :369-426 |
| Results return with snippets; the page opens the chat with highlightMessage. | device and our servers | route.ts:214-243; WebChatPage.tsx:5089-5092 |
| Export: the browser builds the file from the chat in memory and saves it; no server call. | device | EnhancedExportDialog.tsx:107-161; document-export-service.ts:62-69 |
| Import dry run: server parses the pasted text, drops duplicates and shows a preview without writing. | our servers | apps/web/app/api/memory/import/route.ts:55-83 |
| Import commit: server filters excluded content, applies the write policy and inserts memories. | our servers | route.ts:107-165 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Search history (recent, popular) | database functions get_recent_searches and get_popular_searches (tables behind them not opened) | Server only | Cleared by DELETE /api/search. |
| Exported file | the person's device downloads | No | Under the person's control. |
| Imported memories | table user_memories with an imported source value | Yes through memory sync | By memory controls (SYS-memory-projects-and-context). |

**Models and providers.** Search: the index search may be semantic and reports a semantic status; the embedding provider was not opened (unknown). Export and import parsing call no model. Memory import uses a prompt the person sends to another assistant outside our service.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in for search and import; export works on the open chat the account can see. |
| Permissions | Owner and workspace scope; schedules category checks workspace access policy (route.ts:299-305). |
| Subscription | No plan gate found in search or import code; semantic search on Free is described elsewhere as a daily cap named vector_queries in the quota service (apps/web/lib/services/tier-unit-quota-service.ts:158-161); how this route applies it was not opened. |
| Limits and metering | Search 50 default, 100 max; query under 3 characters scans; rate bucket chat-conversation; import 200000 characters and 500 items. |
| Feature flags | None found in the code. |
| Model compatibility | None found in the code. |
| Provider restrictions | Data residency check blocks search outside the allowed region (route.ts:155-170). |
| Local mode | Mobile search runs on the phone over loaded chats (mobileGlobalSearch.ts:56-78). Mobile memory import in the local scope writes on the device and uploads nothing (apps/mobile/__tests__/memory-import-commit.test.ts:70). Web export is local to the browser. Web search of device-only chats: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Searching workspace spinner; Exporting... on the button. | GlobalSearchDialog.tsx:668-670; EnhancedExportDialog.tsx:278-281 |
| Empty | No results found. | GlobalSearchDialog.tsx:775 |
| Error | Search dialog falls back to Search unavailable with Something went wrong. Please close and try again. Export shows Export failed. Please try again. | GlobalSearchDialog.tsx:436-447; EnhancedExportDialog.tsx:165 |
| Short query | Suggestions need two characters; trigram speed needs three. | route.ts:285-287; 0101_sync_and_search_indexes.sql:76-81 |
| Stale search | A search request is aborted when a newer one starts. | GlobalSearchDialog.tsx:209-280 (searchAbortRef) |
| Invalid filters | Validation errors for bad role, category or dates. | route.ts:297-316 |
| Import too large | Validation error from ImportTextTooLargeError; commit over 500 items refused. | route.ts:63-70, :86-92 |
| Import duplicates | Flagged in preview and skipped on commit. | route.ts:80-83; route.test.ts:67 |
| Accessibility | Search input has an aria-label; category group has a role group label; spinners carry labels. | GlobalSearchDialog.tsx:492, :541, :670 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/search/__tests__/message-search-scoping.test.ts`: Message scoping through the chat join, deleted exclusion, date qualification, workspace scope, archive clause.
- `apps/web/app/api/search/__tests__/indexed-search.test.ts`: Index results with links, scoping, Code category, schedules and workspace denial, row filters skipping the index.
- `apps/web/app/api/search/__tests__/plain-snippets.test.ts`: Snippets (file name; contents not opened).
- `apps/web/app/api/search/__tests__/search-residency-and-scope.test.ts`: Residency and scope (file name; contents not opened).
- `apps/web/features/chat/services/conversation-export.test.ts`: HTML escaping of title and content, timestamps and metadata options.
- `apps/web/features/chat/components/dialogs/EnhancedExportDialog.test.tsx`: Metadata option in the downloaded Markdown.
- `apps/web/app/api/memory/import/__tests__/route.test.ts`: Dry run duplicates, no writes on dry run, empty text refusal, default mode, commit counts and expiry.
- `apps/mobile/__tests__/memory-import-commit.test.ts`: Mobile local import semantics and cancellation.
- `apps/web/e2e/chat-search-stop-label.spec.ts`: A search-related end-to-end spec (file name; contents not opened).

**Test scenarios**

- **Find a message**
  1. Send a message with a rare word.
  2. Open Search and type the word.
  - Expected: The chat and the message with a snippet appear; selecting opens the chat at that message.
- **Exclusions**
  1. Delete one chat and archive another that contain the word.
  2. Search with and without includeArchived.
  - Expected: Deleted never shows; archived shows only with the option.
- **Export five formats**
  1. Open a chat with a source link.
  2. Export in each format.
  - Expected: Five files open; expiring links show the placeholder.
- **Memory import**
  1. Paste three lines, one duplicate of an existing memory.
  2. Preview, commit.
  - Expected: Preview marks the duplicate; commit inserts two and reports one skipped.
- **Chat import absent**
  1. Look for a way to import a ChatGPT conversation export as chats.
  - Expected: None exists; record as the gap.

**Where to look when it fails**

- Server errors: Invalid search category, Invalid role query param, startDate must not be after endDate.
- Import errors: Pasted or uploaded memory text is required, No more than 500 memories can be imported at once, Failed to import memories.
- Toasts: Export failed. Please try again.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Conversation import (S90.22) is missing; only memory text import exists.** Affects: All apps; people migrating from other assistants.. Evidence: apps/web/app/api/memory/import/route.ts:13-34; no conversation import route under apps/web/app/api. Work needed: Design chat-history import, parsers for each vendor file, quota and trust rules.
- **Message search is a live substring scan, not a stored text index; short queries scan.** Affects: All users with large histories.. Evidence: apps/web/app/api/search/route.ts:369-380; 0101_sync_and_search_indexes.sql:76-81. Work needed: Measure and consider full-text search.
- **Export and chat search exist on web (and search on mobile); CLI, Chrome, VS Code not found.** Affects: CLI, Chrome, VS Code, mobile export.. Evidence: no matching code in opened files. Work needed: Confirm and decide scope.
- **Export of message body text does not strip expiring links.** Affects: People sharing exported files.. Evidence: apps/web/features/chat/services/conversation-export.ts:98-116. Work needed: Confirm with a test and strip if needed.

**Depends on**

- SYS-data-model-and-migrations
- SYS-memory-projects-and-context
- SYS-security-and-privacy
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- SYS-api-and-contracts
- F090-01
- mode:cloud
- mode:local
- table:web_messages
- table:web_conversations
- table:user_memories

## Unknown

- Whether export contains only the visible version path or every variant.
- How the index search applies the vector_queries cap.
- Embedding provider used for semantic search.
- Tables behind recent and popular search functions.
- Chat transcript export on mobile, CLI, Chrome and VS Code.
- Whether web search covers chats held only on the device.
