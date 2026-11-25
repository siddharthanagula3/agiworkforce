---
id: "F034-02"
type: "feature"
title: "Global search dialog and chat history search"
aliases: ["Global search", "Search dialog", "Search your workspace", "Chat history search", "Conversation history search", "Recent searches", "Search suggestions", "S34.02", "S34.03", "S34.15", "S34.20", "S34.23", "S34.32", "/sessions search", "agi --search", "Search recent chats", "Search sessions"]
area: "34 Search experiences"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (3 of 6)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S34.02", "S34.03", "S34.15", "S34.20", "S34.23", "S34.32"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "api:GET /api/search", "api:POST /api/search", "api:DELETE /api/search", "table:search_history", "SYS-data-model-and-migrations", "SYS-authorization-and-workspaces", "SYS-sync-and-continuity", "SYS-files-artifacts-and-storage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F034-02 Global search dialog and chat history search

One place to search past work. Web and Desktop open a Search dialog that finds chats by title and message text, plus projects, files, artifacts, code sessions and scheduled tasks, with filters and recent searches. Mobile, CLI, VS Code and Chrome each search their own chat history only, with fewer filters.

Area: [34. Search experiences](README.md). Requirement items: [S34.02](../../10-requirements/capabilities/034-search-experiences.md#s3402), [S34.03](../../10-requirements/capabilities/034-search-experiences.md#s3403), [S34.15](../../10-requirements/capabilities/034-search-experiences.md#s3415), [S34.20](../../10-requirements/capabilities/034-search-experiences.md#s3420), [S34.23](../../10-requirements/capabilities/034-search-experiences.md#s3423), [S34.32](../../10-requirements/capabilities/034-search-experiences.md#s3432).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (3 of 6) |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Finds earlier chats (by title and by what was said) and, on Web and Desktop, also projects, library files, artifacts, code sessions, project sources and scheduled tasks. Each result shows a title, a snippet with the matched words and a type label, and opens when chosen.

**Why it exists.** Leader products let people search their chat history; the project says to follow them (doc: AGENTS.md section 10).

**Who uses it.** Everyone with more than a few chats; Desktop users also look for local code sessions.

**Problems it solves**

- Finding a chat when the title is forgotten
- Finding an old project, file or artifact from one box
- Repeating a search without retyping

**Use cases**

- Web user types 'invoice' and filters to their own messages after a date
- Mobile user searches the chats tab and sees chats, projects, files and artifacts in groups
- CLI user runs agi --search 'rust' --output-format json to script over all matching sessions

## 2. User experience

**Where to find it**

- Web and Desktop: the Search dialog opens from the sidebar or from the 'open-search' shortcut (apps/web/features/chat/pages/WebChatPage.tsx:1711; packages/ui/unified-chat/src/lib/shortcutRegistry.ts:47). The text-box label is 'Search your workspace'.
- Mobile: the 'Search' box on the chats list; accessibility label 'Search chats, projects, files, library, and artifacts' (apps/mobile/src/features/chat/ChatsListScreen.tsx:930-931).
- CLI: '/sessions search <query>' in the line chat (apps/cli/src/repl/registry.rs:968), '/sessions' then search in the full-screen chat (apps/cli/src/tui/tui_app.rs:5998), or 'agi --search <query>' (apps/cli/src/lib.rs:7848).
- VS Code: the 'Search sessions' box in the sidebar and a session picker with a search box (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3043; apps/extension-vscode/src/features/trees/sessionPickers.ts:70-110).
- Chrome: 'Search recent chats' box in the side-panel Recents drawer (apps/extension/_locales/en/messages.json:950).

**Before you start**

- Web and Desktop: signed in; a workspace whose data region can be confirmed (apps/web/app/api/search/route.ts:130-150).
- Type at least 2 characters (GlobalSearchDialog.tsx:297; VS Code picker MIN_SEARCH_LENGTH = 2).
- Mobile Cloud search needs a signed-in Cloud account; Local mode searches the phone only (apps/mobile/stores/chat/chatViewStore.ts:233-246).
- Chrome: the box appears only when the drawer holds more than 10 chats (apps/extension/src/side_panel.ts:1131, :12821).

**Screens and controls**

- Web/Desktop category chips (group 'Search category'): All, Artifacts, Sessions, Code, Projects, Scheduled; Desktop adds 'Local Code' (apps/web/features/chat/lib/global-search-categories.ts:1-8; GlobalSearchDialog.tsx:119-121).
- Filters (shown for All and Sessions only): 'Message Type' (All messages, My messages, AI responses, System messages), 'From Date', 'To Date' with a calendar, 'Include archived conversations', 'Clear Filters' (GlobalSearchDialog.tsx:556-650).
- Before typing: 'Recent Searches' chips with a 'Clear' button and 'Your frequent searches' chips with a count (GlobalSearchDialog.tsx:672-730).
- Clear confirmation titled 'Clear search history?' (GlobalSearchDialog.tsx:190).
- Result type labels: Project, File, Title, Artifact, Report, Code session, Project source, Scheduled (GlobalSearchDialog.tsx:79-88).
- Mobile groups: Chats, Go to, Projects, Files, Library, Artifacts; Recent searches (up to 5) and Recent chats before typing (ChatsListScreen.tsx:372-405).

**Journey**

1. Open Search (shortcut or sidebar). Before typing, recent and frequent searches are shown; click one to run it.
2. Pick a category chip and, for All or Sessions, optionally open filters.
3. Type 2 or more characters; after a short pause (300 ms) the search runs and a spinner 'Searching workspace' shows.
4. Read the results (title, snippet with the matched words marked, type label) and click one; the dialog closes and the chat, project, file, artifact or session opens. A message result opens its chat with the message highlighted.
5. Mobile: type in the chats search box; results appear in groups; tapping a recent search runs it; clearing recent searches asks first.
6. CLI: run agi --search 'text' and read the id, title, model, message count and matching snippets.

**What the person sees and gets**

- Spinner 'Searching workspace'.
- Empty: 'No results found' and 'Try different keywords or clear filters' (Local Code: 'Try a different session title') (GlobalSearchDialog.tsx:775-780).
- Failure: 'Search could not be completed' with a Retry button (role alert) (GlobalSearchDialog.tsx:757-770).
- A crash of the dialog shows 'Search unavailable' (GlobalSearchDialog.tsx:445-452).
- Region problem: an error naming the data region, or 'Search is unavailable because this workspace's data region could not be confirmed.' (route.ts:135-148).
- Mobile after a failed Cloud call: 'Search could not be completed. Showing matches already on this device.' (ChatsListScreen.tsx:791).
- CLI: 'No sessions matching "<q>".' and, for more than 50 matches, a notice to narrow the query or use JSON (apps/cli/src/sessions.rs:944-950).

**Settings**

- Web/Desktop: shortcut 'open-search' can be switched off in Settings (GlobalSearchDialog.tsx:422).
- Mobile: recent searches are not recorded in a temporary chat (ChatsListScreen.tsx:408-412).
- Server history: clearable from the dialog (DELETE /api/search).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop: GET /api/search returns session titles, message hits (up to 100), project rows, library file rows (All only), scheduled task names, and indexed documents, scoped to the user and workspace, skipping deleted and temporary chats and archived ones unless asked (apps/web/app/api/search/route.ts:299-480).
- Web/Desktop: role, start date and end date filters are applied to rows; setting any of them turns off the indexed-document search (route.ts:398-411).
- Search history: recorded unless track=false or the request is cross-site (route.ts:604-620); recent and popular lists read from SQL functions; DELETE clears (route.ts:262-283, :660-680).
- Region guard: refuses with a clear message if the data region cannot be confirmed or is not served by this deployment (route.ts:130-150).
- Web/Desktop dialog: debounce, abort of old requests, result labels, empty/failed states, confirm-before-clear (GlobalSearchDialog.tsx:202-345).
- Desktop adds a 'Local Code' category that searches code session titles through the desktop host on the device (GlobalSearchDialog.tsx:119-121, :207-250).
- Mobile: Cloud mode tries GET /api/search?q=&limit=50 first and falls back to on-device messages with searchFailed set; Local mode searches the phone only (apps/mobile/stores/chat/chatViewStore.ts:233-345). Recent searches (5, per mode and per account) are kept in device storage (apps/mobile/src/features/search/recentSearches.ts:3-12).
- CLI: search_sessions matches title or any message text, normalises text, also matches GitHub pull-request URLs and shorthand, and includes archived sessions; display limit 50 (apps/cli/src/sessions.rs:919-950).
- VS Code: sidebar and picker search through the local runtime per workspace folder, with a 250 ms debounce and a 2 character minimum (apps/extension-vscode/src/features/trees/conversationTreeProvider.ts:323-345; sessionPickers.ts:14-15).
- Chrome: Recents drawer filter matches every typed word against the title and message text of saved chats (apps/extension/src/features/background/conversation-history.ts:1597-1618).

**Incomplete**

- Mobile has recent searches but no date filter and no frequent-search chips (apps/mobile/src/features/search/recentSearches.ts; ChatsListScreen.tsx:372-405).
- CLI and VS Code search chats only: no projects, files or preview beyond snippets (apps/cli/src/sessions.rs:919).
- Mobile Cloud search sends no category or filters, so only default chats and projects from the server are used (chatViewStore.ts:251-266).
- Message hits are capped at 100 rows before the overall limit (route.ts:466).

**Present but disconnected or switched off**

- Server suggestions: GET /api/search?type=suggestions exists and calls get_search_suggestions (route.ts:285-293), but no client calls it; the dialog shows recent and frequent searches only. Found by searching apps and packages for 'suggestions' callers: only the route and its test.

**Not available**

- Date filters on Mobile, CLI, VS Code, Chrome (doc: area brief S34.15).
- Search suggestions on Mobile beyond recent searches, and on CLI, VS Code, Chrome (doc: area brief S34.20).
- Result preview on CLI and VS Code (doc: area brief S34.23).

## 4. Required behaviour

**Established requirements**

- The user can search past conversations by title and message text and open a match; only conversations the user can see in history are returned. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.02)
- The user can search Projects by name or description and open a match. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.03)
- The user can limit a search to a date range and get only results inside it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.15)
- Before or while typing the user is offered suggested queries and can pick one. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.20)
- Results show a preview (title, snippet or matched text) before opening. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.23)
- Empty and unavailable searches show a clear state, not silence. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.32)
- Only the user's own, non-deleted, non-temporary chats are searched; archived are excluded unless asked; search is blocked with a message when the data region cannot be confirmed. (source: apps/web/app/api/search/route.ts:130-150, :320-345)
- Unsupported or incomplete capabilities are hidden or clearly unavailable, never presented as working. (source: doc: docs/decisions/2026-09-15-founder-decisions.md (D-2026-09-15 rule on capabilities))

**Acceptance criteria**

1. On Web, typing 1 character shows no search; 2 or more runs one after a short pause.
2. A chat that only matches in a message body appears as a message result with the matched words marked; a chat that only matches in its title appears with the label 'Title'.
3. Setting 'My messages' or a From date removes document-index results and filters message rows.
4. Archived chats appear only when 'Include archived conversations' is on; deleted and temporary chats never appear.
5. 'Clear' next to Recent Searches asks 'Clear search history?' and, on confirm, empties the list.
6. With the network blocked, the dialog shows 'Search could not be completed' and Retry runs the search again.
7. Mobile in Cloud mode with the server failing still lists on-device matches and shows the failure sentence.
8. CLI agi --search 'term' --output-format json prints every matching session; the text form shows 50 and a notice when more exist.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Suggestions should include completions as the brief says (recent, popular or completions); only recent and frequent are shown today [inferred].
- A search result should honour workspace scope the same way on Mobile as on Web [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Connect the existing suggestions endpoint to the dialog as query completions, or remove it.
- [proposed] Give Mobile a date filter and frequent-search chips only if the leaders ship them on phones.
- [proposed] Let CLI search include a project name filter once projects are searchable offline.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | GlobalSearchDialog | `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx` | The Search dialog: categories, filters, recents, results, empty/failed states. |
| service | globalSearchService | `apps/web/features/chat/services/global-search-service.ts` | Client calls to /api/search for search, recent, popular and clear; builds result links (globalSearchResultHref). |
| config | GLOBAL_SEARCH_CATEGORIES | `apps/web/features/chat/lib/global-search-categories.ts` | Category chip ids and labels. |
| endpoint | GET/POST/DELETE /api/search | `apps/web/app/api/search/route.ts` | Search, record history, clear history; residency check; rate limit chat-conversation. |
| service | createPostgresSearchProvider | `apps/web/lib/services/retrieval-search-service.ts` | Indexed document search over retrieval documents. |
| table | search_history | `apps/web/db/neon/0020_functions.sql` | Stores each tracked query and result count; track_search redefined with workspace scope in 0110_active_workspace_content_scope.sql:75. |
| table | web_conversations / web_messages | `apps/web/app/api/search/route.ts` | Rows queried for titles and message text (lines 428-470). |
| hook | open-search shortcut | `packages/ui/unified-chat/src/lib/shortcutRegistry.ts` | Registers 'open-search' (line 47); WebChatPage.tsx:1711 opens the dialog. |
| service | runSearch / searchConversations | `apps/mobile/stores/chat/chatViewStore.ts` | Mobile debounce, Cloud-first search with on-device fallback. |
| service | buildMobileGlobalSearchGroups | `apps/mobile/src/features/search/mobileGlobalSearch.ts` | Groups chats, projects, files, library images and artifacts for the mobile list. |
| store | recentSearches | `apps/mobile/src/features/search/recentSearches.ts` | Per-mode, per-account recent search list (limit 5) in device storage. |
| screen | ChatsListScreen | `apps/mobile/src/features/chat/ChatsListScreen.tsx` | Mobile search box, sections, failure and empty text. |
| command | search_sessions | `apps/cli/src/sessions.rs` | CLI local session search; SEARCH_DISPLAY_LIMIT 50; overflow notice. |
| command | agi --search | `apps/cli/src/lib.rs` | Flag handler at line 7848 with text and JSON output. |
| command | /sessions search | `apps/cli/src/repl/registry.rs` | Line-chat command (line 968). |
| service | searchThreads | `apps/extension-vscode/src/features/trees/conversationTreeProvider.ts` | VS Code search across workspace folders via the local runtime (line 323). |
| service | _searchSessions | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Handles the sidebar searchSessions message (line 2649). |
| service | filterConversations | `apps/extension/src/features/background/conversation-history.ts` | Chrome saved-chat filter (line 1597). |
| screen | Recents drawer search | `apps/extension/src/side_panel.ts` | Chrome search input (line 12159), shown above 10 chats (line 12821). |
| service | desktop-host listDeveloperSessions | `apps/web/features/desktop-host` | Desktop-only source for the Local Code category (imported at GlobalSearchDialog.tsx:60). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web/Desktop: input is debounced (300 ms), earlier requests are aborted, and the dialog calls GET /api/search with q, category, limit 50 and filters. | device | GlobalSearchDialog.tsx:202-311; packages/platform/utils/src/interactionTimings.ts:2 |
| The server rate-limits, resolves the user and workspace, and checks the data region. | our servers | apps/web/app/api/search/route.ts:245-252 |
| Row queries run on titles, messages, projects, files and scheduled tasks; if no role/date filter applies, the document index is also searched with semantic matching on. | our servers | route.ts:393-480 |
| Results are built with snippets and links; the query and result count are written to search history unless track=false. | our servers | route.ts:604-620 |
| The dialog merges rows and index documents, removing duplicates, and shows them. | device | global-search-service.ts:237-262 |
| Desktop Local Code: the desktop host lists code sessions on the machine and titles are filtered locally. | device | GlobalSearchDialog.tsx:207-250 |
| Mobile Cloud: GET /api/search; on error, scan messages in the on-device store and mark searchFailed. Local mode: scan the device store only. | device and our servers | chatViewStore.ts:233-345 |
| CLI: read session files from the local folder, match, print. | device | apps/cli/src/sessions.rs:919-940 |
| VS Code: ask the local runtime per workspace folder for thread matches. | device | conversationTreeProvider.ts:323-340 |
| Chrome: filter saved conversations held by the extension. | device | conversation-history.ts:1597-1618 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Search history rows (query, result count, time) | table:search_history in the account database | Server-side per user and workspace | Cleared by the 'Clear' action through DELETE /api/search (route.ts:660-680); retention period not found |
| Mobile recent searches (up to 5) | store:mmkv key prefix recent-searches:v1 (device storage) | No | Cleared by 'Clear recent searches?' alert; not recorded in temporary chats |
| Searched content (chats, messages, projects, files) | web_conversations, web_messages, user_projects, media_assets, scheduled_tasks, retrieval index tables | Already server data | Not copied by search |

**Models and providers.** No chat model is called. Indexed search can use semantic matching, which calls an embedding provider through the retrieval embedding service (apps/web/lib/services/retrieval-search-service.ts:27-30); which provider is unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, Desktop, Mobile Cloud: signed-in account required (route.ts via getUserScopedDb). CLI, VS Code, Chrome: search runs on local data and needs no account for the search itself. |
| Permissions | Rows are filtered by user and workspace; the Scheduled category is refused when the workspace denies schedules (route.ts:296-304). Region policy can block search. |
| Subscription | none found in the code for chat search; Scheduled depends on workspace access policy. |
| Limits and metering | Limit default 50, max 100 (route.ts:41-43); message rows 100; rate limit group chat-conversation (route.ts:246); history list 10 recent and 10 frequent over 7 days (GlobalSearchDialog.tsx:149-150). CLI shows 50. Mobile recent searches 5. |
| Feature flags | none found in the code for search itself. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local mode searches only the phone and records recent searches under a local scope. CLI and VS Code search local files. Desktop Local Code category is on-device; the rest of the dialog needs our servers. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Searching workspace'. | GlobalSearchDialog.tsx:668-671 |
| Empty | 'No results found' with advice. | GlobalSearchDialog.tsx:775-780 |
| Error and retry | 'Search could not be completed' plus Retry. | GlobalSearchDialog.tsx:757-770 |
| Component crash | 'Search unavailable' dialog. | GlobalSearchDialog.tsx:437-452 |
| Cancel / stale request | Older request aborted; results from a replaced request are ignored. | GlobalSearchDialog.tsx:202-215, :268-280 |
| Region unavailable | Request refused with a region message. | route.ts:130-150 |
| Mobile account switch | Results from an earlier account epoch are dropped. | chatViewStore.ts:233-241 |
| Chrome fewer than 11 chats | Search box hidden. | side_panel.ts:12821 |
| Offline | Web shows the failure state; Mobile Cloud falls back to on-device messages; CLI, VS Code and Chrome work offline. | GlobalSearchDialog.tsx:268-280; chatViewStore.ts:268-273 |
| Accessibility | Main content is hidden from assistive tools while the dialog is open; category group and clear button labelled. | GlobalSearchDialog.tsx:90-103, :541 |
| Timeout | not handled in the code beyond abort and generic failure. | global-search-service.ts:187-195 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/search/__tests__/indexed-search.test.ts`: Indexed results with links, scoping to caller and kinds, Code category, schedule search and denial.
- `apps/web/app/api/search/__tests__/message-search-scoping.test.ts`: Message and session scoping, deleted and archived rules, date qualification, workspace scope.
- `apps/web/app/api/search/__tests__/search-residency-and-scope.test.ts`: Region refusal on every method, scoped statements, result kinds and shape.
- `apps/web/app/api/search/__tests__/popular-searches.test.ts`: Recent and popular history scoping, track and clear.
- `apps/web/app/api/search/__tests__/plain-snippets.test.ts`: Plain-text snippets.
- `apps/web/app/api/search/__tests__/new-chat-entry-points.test.ts`: New-chat links for each result kind.
- `apps/web/features/chat/components/dialogs/__tests__/GlobalSearchDialog.behaviour.test.tsx`: Dialog behaviour (file named for behaviour; contents not read).
- `apps/web/features/chat/components/dialogs/__tests__/GlobalSearchDialog.a11y.test.tsx`: Dialog accessibility (contents not read).
- `apps/web/features/chat/components/dialogs/__tests__/GlobalSearchDialog.shortcut-hint.test.tsx`: Shortcut hint shown in the dialog (contents not read).
- `apps/mobile/__tests__/mobile-global-search.test.ts`: Grouping of chat, project, library and artifact matches, blank query, attachments, server rows added.
- `apps/mobile/__tests__/chat-view-search.test.ts`: Mobile chat view search store (contents not read).
- `apps/extension/__tests__/conversation-history.test.ts`: Chrome conversation history including filter (file references filterConversations).
- `apps/cli/src/sessions.rs`: In-file tests: search over managed sessions, display-limit notice, archived stays findable, pull request shorthand.

**Test scenarios**

- **Filter by role and date**
  1. Web: open Search, type 'invoice', choose My messages and a From date.
  - Expected: Only your messages on or after that date; no document-index results.
- **Archived toggle**
  1. Search a word that only occurs in an archived chat; then tick Include archived conversations.
  - Expected: Not shown first, shown after ticking.
- **Clear history**
  1. Open Search with empty text; press Clear and confirm.
  - Expected: Recent and frequent lists disappear; a toast says how many were cleared.
- **Failure and retry**
  1. Block the network, type a query, restore the network, press Retry.
  - Expected: 'Search could not be completed' then results.
- **Mobile Cloud failure**
  1. Sign in to Cloud, turn the server off, search a word in a loaded chat.
  - Expected: On-device match shown with the failure sentence.
- **CLI overflow**
  1. Create 60 sessions mentioning 'release', run agi --search release, then add --output-format json.
  - Expected: 50 listed and a notice; JSON lists all 60.

**Where to look when it fails**

- Server log line 'search history write failed' (route.ts:612).
- Errors: capabilityUnavailable for region; validation errors 'Invalid search category', 'Invalid role query param'.
- Tables: search_history, web_conversations, web_messages, retrieval_documents.
- Mobile: searchFailed flag in chatViewStore.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/034-search-experiences.md](../../70-qa/test-plans/web/034-search-experiences.md)
- Desktop: [70-qa/test-plans/desktop/034-search-experiences.md](../../70-qa/test-plans/desktop/034-search-experiences.md)
- Mobile: [70-qa/test-plans/mobile/034-search-experiences.md](../../70-qa/test-plans/mobile/034-search-experiences.md)
- CLI: [70-qa/test-plans/cli/034-search-experiences.md](../../70-qa/test-plans/cli/034-search-experiences.md)
- VS Code: [70-qa/test-plans/vscode/034-search-experiences.md](../../70-qa/test-plans/vscode/034-search-experiences.md)
- Chrome: [70-qa/test-plans/chrome/034-search-experiences.md](../../70-qa/test-plans/chrome/034-search-experiences.md)

## 10. Gaps and dependencies

- **Suggestions endpoint is not connected to any client.** Affects: Web and Desktop users expecting query completions. Evidence: route.ts:285-293; no client call found. Work needed: Wire into the dialog or remove the endpoint.
- **Mobile has no date filter or frequent searches; CLI, VS Code and Chrome search chats only.** Affects: Mobile, CLI, VS Code, Chrome. Evidence: doc: area brief S34.15, S34.20; ChatsListScreen.tsx:372-405. Work needed: Decide per app which filters the leaders ship, then build them.
- **Brief says Mobile has no suggestions, but recent searches exist.** Affects: Documentation accuracy. Evidence: apps/mobile/src/features/search/recentSearches.ts. Work needed: Update the brief row.
- **Chrome search box hidden until more than 10 chats.** Affects: Chrome users with a few chats. Evidence: side_panel.ts:1131, :12821. Work needed: Decide whether the threshold is intended.
- **Message hits capped at 100 rows before the limit; Code category searches the index only.** Affects: Heavy users. Evidence: route.ts:466, :393. Work needed: Check ranking and cap with real data.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- api:GET /api/search
- api:POST /api/search
- api:DELETE /api/search
- table:search_history
- SYS-data-model-and-migrations
- SYS-authorization-and-workspaces
- SYS-sync-and-continuity
- SYS-files-artifacts-and-storage

## Unknown

- Which provider embeds queries for semantic matching.
- Retention period of search_history rows.
- Contents of the three GlobalSearchDialog tests and chat-view-search test (names only).
- What the VS Code local runtime searches (titles only or message text).
- Whether Mobile Local mode records anything on any server: none found.
- Exact label of the Filters toggle button.
