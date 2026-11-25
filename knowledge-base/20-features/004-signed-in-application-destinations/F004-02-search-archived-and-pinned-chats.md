---
id: "F004-02"
type: "feature"
title: "Search, archived and pinned chats"
aliases: ["Conversation search", "Global search", "Search your workspace", "Archived chats", "Pinned chats", "Recently deleted (restore target)", "S4.03", "S4.04", "S4.05", "GlobalSearchDialog", "ArchivedChatsSection", "/settings/archived"]
area: "4 Signed-in application destinations"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "partly seen (2 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S4.03", "S4.04", "S4.05"]
depends_on: ["SYS-data-model-and-migrations", "SYS-memory-projects-and-context", "SYS-sync-and-continuity", "SYS-security-and-privacy", "table:web_conversations", "table:web_messages", "table:scheduled_tasks", "api:GET /api/search", "api:POST /api/chat/conversations/bulk", "api:PUT /api/chat/conversations/{id}"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F004-02 Search, archived and pinned chats

Find a chat by words from its title or messages, move old chats out of sight into Archived and bring them back, and keep chats you pinned at the top of the list. Web has a search dialog and a Settings page; mobile has a search screen and an Archived chats page; CLI has --search and session pin and archive.

Area: [4. Signed-in application destinations](README.md). Requirement items: [S4.03](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s403), [S4.04](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s404), [S4.05](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s405).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (2 of 3) |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built (this page lists unfinished parts) | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets people find past chats (and projects, files and scheduled tasks on web), hide chats without deleting them, and keep important chats first.

**Why it exists.** Chat history grows; people need search, a way to tidy the list, and a way to keep key chats on top, as in ChatGPT and Claude [inferred from product context].

**Who uses it.** Every signed-in person with many chats, on Web, Desktop, Mobile and CLI; Chrome and VS Code have partial versions.

**Problems it solves**

- Finding an old answer without scrolling.
- Clearing the sidebar without losing chats.
- Reaching key chats fast.

**Use cases**

- Press the search shortcut, type 'invoice', open the matching chat.
- Archive a finished chat, later restore it from Settings > Archived chats.
- Pin a chat so it stays in the Pinned group.
- Run 'agi --search deploy' to find CLI sessions.

## 2. User experience

**Where to find it**

- Web: sidebar 'Search' button showing the shortcut label (packages/ui/ui/src/sidebar/Sidebar.tsx:641-650); the code comment says Cmd+K also works (WebChatPage.tsx:1708); /chat?search=true opens the dialog and removes the parameter (WebChatPage.tsx:1673-1683).
- Web: Settings > Archived chats at /settings/archived, which redirects into the settings modal section 'archived' (apps/web/app/settings/archived/page.tsx:5; apps/web/features/settings/components/WebSettingsModal.tsx:200). The sidebar also shows 'Archived (N)' when there are archived chats (Sidebar.tsx:672-694).
- Web: pinned chats are listed first in the sidebar (Sidebar.tsx:263).
- Mobile: drawer 'Search' icon opens /(app)/search, which is the chats list in search mode (apps/mobile/app/(app)/search.tsx:1-5); filters 'All chats', 'Pinned', 'Unread' (ChatsListScreen.tsx FILTER_LABELS); Settings > Archived chats (apps/mobile/app/(app)/settings/archived-chats.tsx).
- CLI: 'agi --search <QUERY>'; 'agi session list [--archived]', 'pin', 'unpin', 'archive', 'unarchive' (apps/cli/src/lib.rs:262,1931-1975).
- VS Code: tree of conversations with refresh, delete and fork; no pin or archive command found (commandSetup.ts:1392-1478).
- Chrome: no archived list (brief); search of browsing history exists but that is a different feature (side_panel.ts:237-241).

**Before you start**

- Web and mobile Cloud mode: signed in.
- Web search of the 'scheduled' category requires a workspace access check (apps/web/app/api/search/route.ts:283-289).
- Search is refused if the workspace data region cannot be confirmed (search/route.ts:130-146).

**Screens and controls**

- Search dialog: text box 'Search your workspace', category group 'Search category' with All, Artifacts, Sessions, Code, Projects, Scheduled (apps/web/features/chat/lib/global-search-categories.ts:1-8), a role filter 'All messages', 'Clear search' button, 'No results found' text.
- Archived chats page: heading 'Archived chats', rows with 'Restore' and 'Delete', 'Load more', 'Delete all archived', 'Retry' on error.
- Mobile chats list: search box, recent searches, groups Pinned, Today, Yesterday, This Week, Older.

**Journey**

1. 1. Person opens the search dialog (button, shortcut or ?search=true).
2. 2. Types words; the dialog calls the search service, which requests /api/search with q, limit and optional category, includeArchived, role and dates (global-search-service.ts:150-165).
3. 3. Results are grouped; the person opens one; the app goes to /chat/<id>?highlightMessage=<id> (WebChatPage.tsx:5089 comment).
4. 4. To archive, the person uses the chat's menu (archive action; PUT sets archived true and clears pinned).
5. 5. To restore, open Settings > Archived chats and click 'Restore'; the chat returns to the sidebar.
6. 6. To remove, click 'Delete' or 'Delete all archived'; a confirm dialog names the consequence; deleted chats move to Recently deleted.

**What the person sees and gets**

- Loading text 'Loading archived chats…'; error text with 'Retry'; load failure text 'Archived chats could not be loaded' that says it is not the same as having none; empty text 'No archived chats' and 'Chats you archive will appear here.' (ArchivedChatsSection.tsx:98-133).
- Status notice line after actions (role=status).
- Search spinner 'Searching workspace…' and 'No results found' (GlobalSearchDialog.tsx:670,775).
- Mobile toast 'Chat archived. Find it in Settings, Archived chats.' with 'Undo' (useConversationActions.ts:136).

**Settings**

- Archived chats page is under the Privacy settings area (a '← Privacy' link, ArchivedChatsSection.tsx).
- Mobile recent searches are kept per mode and account (apps/mobile/src/features/search; ChatsListScreen.tsx:243-247).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/search matches chat titles with a case-insensitive contains match (ilike '%q%') and message text the same way, and also returns projects, files and schedules by name (apps/web/app/api/search/route.ts:316-380,470-480).
- Archived chats are left out unless includeArchived=true (search/route.ts:326,343,378).
- Search also uses an index of documents (indexed search) beside the contains match (search/route.ts:21-31,457-460) [inferred from imports and an 'indexSearch' promise].
- The route applies a rate limit named chat-conversation and a region residency check (search/route.ts:246-250).
- Conversation list route supports archived=include|only|exclude, deleted=exclude|only, title filter q, cursor paging and pinned-first ordering (apps/web/app/api/chat/conversations/route.ts:53-61,92-100,122-124).
- Archiving one chat via PUT sets archived and clears pinned in the same update (apps/web/app/api/chat/conversations/[id]/route.ts:374-380).
- Bulk route supports archive_all, delete_all, delete_archived; archive_all clears pinned; deletes are soft and revoke published artifacts and shares (apps/web/app/api/chat/conversations/bulk/route.ts:30-33,59-77,92-115).
- Web Archived chats page lists, restores, deletes one or all, with confirmation text that names the 30-day recovery (ArchivedChatsSection.tsx:41-58).
- Web sidebar groups pinned first and offers an archived view (Sidebar.tsx:242-290,672-694).
- Mobile search runs on the server in Cloud mode and on the device in Local mode (apps/mobile/stores/chat/chatViewStore.ts:244-330).
- Mobile archive page lists archived=only with paging and search (apps/mobile/src/features/archived-chats/service.ts:44-84).
- CLI search covers titles and message text and PR links, archived sessions stay findable; CLI supports pin, unpin, archive, unarchive (apps/cli/src/sessions.rs:919-940,1707; lib.rs:5646-5648,5765-5776).

**Incomplete**

- The brief says CLI pinned is missing, but the CLI has 'agi session pin' and 'unpin' and lists pinned sessions first (apps/cli/src/lib.rs:1940-1945,5586-5600). The brief is stale on this point.
- The brief says archived chats can be opened; the web archived page offers only Restore and Delete, no Open button (ArchivedChatsSection.tsx:176-195).
- User-typed % and _ in the search text are placed inside the ilike pattern without escaping, so they act as wildcards (search/route.ts:316 builds `%${q}%`) [inferred effect].
- Mobile search results for Local mode never reach the server and cover only on-device chats (chatViewStore.ts:279-330).

**Present but disconnected or switched off**

- Mobile Settings > Archived chats needs Cloud mode and sign-in; the screen reads appMode and sign-in state (archived-chats.tsx:60-66); the exact message when not signed in was not read.

**Not available**

- Mobile Local chats cannot be archived: 'archived is a column on web_conversations, so archiving only exists for Cloud chats' (useConversationActions.ts:109-112).
- Pinned list on VS Code and Chrome: not found in code.
- Archived list on Chrome: not found (brief says missing).

## 4. Required behaviour

**Established requirements**

- A search destination takes a keyword and returns past conversations matching titles or message text and opens one. (source: S4.03 Should)
- A destination lists archived conversations and lets the user open, restore or delete them. (source: S4.04 Should)
- Pinned conversations are shown together in a pinned section or filter and open from there. (source: S4.05 Should)
- An agent never destroys user data; chats are archived or moved to Recently deleted; permanent removal only from an explicit user action naming what is lost. (source: AGENTS.md section 9)
- A user action that cannot be undone asks first and names the consequence. (source: AGENTS.md section 9)

**Acceptance criteria**

1. Searching a word that appears only in a message body returns that chat with a snippet.
2. Searching a word only in an archived chat returns nothing, and returns it when includeArchived is set.
3. Archive a pinned chat on web: it leaves the sidebar and, after restore, is not pinned.
4. Archived chats page shows 'No archived chats' when empty, an error with Retry when the request fails.
5. Delete from the archived page shows a confirmation naming Recently deleted and 30 days, and the chat appears under deleted=only after confirming.
6. Pinned chats appear first in the sidebar and in the mobile 'Pinned' group.
7. 'agi session archive <id>' hides the session from 'agi session list' and 'agi session list --archived' shows it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Search text with % or _ should match literally [inferred from user expectation; code does not escape].
- Search results must be limited to the owner and organization scope (scoped DB and clauses at search/route.ts:316-380).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Escape % and _ in the contains pattern.
- [proposed] Add an 'Open' action to archived rows or update the brief.
- [proposed] Decide whether archived chats should be findable by search in the web UI with a toggle, as the CLI already does.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | Search | `apps/web/app/api/search/route.ts` | GET search across chats, messages, projects, files, schedules, documents; POST tracks, DELETE clears history |
| service | global-search-service | `apps/web/features/chat/services/global-search-service.ts` | Client of /api/search; maps results |
| component | GlobalSearchDialog | `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx` | Search dialog UI |
| config | Search categories | `apps/web/features/chat/lib/global-search-categories.ts` | All, Artifacts, Sessions, Code, Projects, Scheduled |
| component | Sidebar | `packages/ui/ui/src/sidebar/Sidebar.tsx` | Search button, pinned group, archived view toggle |
| component | SessionItem | `packages/ui/ui/src/sidebar/SessionItem.tsx` | Row actions including pin (brief cites line 329) |
| screen | Archived chats section | `apps/web/features/settings/sections/ArchivedChatsSection.tsx` | List, Restore, Delete, Delete all archived |
| hook | useManagedChatList | `apps/web/features/settings/hooks/useManagedChatList.ts` | Paging, restore, delete, confirmation for archived and deleted lists |
| service | conversation-data-service | `apps/web/features/settings/services/conversation-data-service.ts` | listArchivedConversations, restoreArchivedConversation, bulk action |
| screen | Archived settings route | `apps/web/app/settings/archived/page.tsx` | Redirects into the settings modal section |
| endpoint | Conversation list | `apps/web/app/api/chat/conversations/route.ts` | archived and deleted filters, q title filter, pinned-first keyset paging |
| endpoint | Conversation update | `apps/web/app/api/chat/conversations/[id]/route.ts` | PUT pinned and archived; archive clears pin |
| endpoint | Bulk conversation action | `apps/web/app/api/chat/conversations/bulk/route.ts` | archive_all, delete_all, delete_archived |
| endpoint | Restore deleted conversation | `apps/web/app/api/chat/conversations/[id]/restore/route.ts` | Restores from Recently deleted |
| service | lifecycle-sql | `apps/web/lib/resources/lifecycle-sql.ts` | restorableScopeSql recovery window |
| table | web_conversations | `apps/web/app/api/search/route.ts` | Columns title, archived, pinned, deleted_at, is_temporary |
| table | web_messages | `apps/web/app/api/search/route.ts` | Message text searched with ilike |
| screen | Mobile chats list and search | `apps/mobile/src/features/chat/ChatsListScreen.tsx` | Search, filters All chats, Pinned, Unread |
| store | chatViewStore search | `apps/mobile/stores/chat/chatViewStore.ts` | Debounced search: server in Cloud mode, device in Local mode |
| service | mobile archived service | `apps/mobile/src/features/archived-chats/service.ts` | List archived, restore, archive, bulk |
| screen | Mobile archived screen | `apps/mobile/app/(app)/settings/archived-chats.tsx` | Archived chats page |
| hook | useConversationActions | `apps/mobile/src/features/conversation-actions/useConversationActions.ts` | Archive with Undo, pin, rename |
| command | CLI search and session actions | `apps/cli/src/lib.rs` | --search; session list, pin, archive |
| service | CLI sessions | `apps/cli/src/sessions.rs` | search_sessions, set_session_pinned |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types in the search dialog; the client calls GET /api/search. | device | global-search-service.ts:150-165 |
| Server checks rate limit, identity, workspace data region, then runs ilike queries on conversations, messages, projects, files, scheduled tasks, plus an indexed document search. | our servers | apps/web/app/api/search/route.ts:245-250,316-380,457-480 |
| Server returns results with snippets; the client groups them. | our servers | search/route.ts:480-520 [inferred from response shape]; global-search-service.ts:166-230 |
| Archive or restore sends PUT to the conversation route; archive sets archived and clears pinned. | our servers | [id]/route.ts:374-380 |
| Delete moves the chat to Recently deleted by setting deleted_at; shares and published artifacts are revoked. | our servers | bulk/route.ts:92-115 |
| Mobile Local mode scans on-device messages and titles. | device | chatViewStore.ts:279-330 |
| CLI reads session files and filters by title and message text. | device | apps/cli/src/sessions.rs:919-940 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Search query tracking and recent/popular searches | database functions get_recent_searches, get_popular_searches, get_search_suggestions | Server-side per user and organization | POST tracks (TrackSearchSchema), DELETE exists; retention rule unknown (search/route.ts:48-58,250-280,637-681) |
| archived and pinned flags | table:web_conversations columns archived, pinned | Yes across web, desktop, mobile cloud | Persist until changed; archive clears pin |
| Deleted chats | table:web_conversations deleted_at | Yes | Restorable inside a recovery window set per table by resourceDeletionPolicy; UI says 30 days (ArchivedChatsSection.tsx:47-48); value not read in code |
| Recent searches on mobile | device storage keyed by mode and owner | No | clearRecentSearches exists (ChatsListScreen.tsx imports) |

**Models and providers.** No model or provider takes part. Search is plain database matching. The documents index (indexed search) may use embeddings, which would involve a provider; this was not read, so unknown (SYS-memory-projects-and-context).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web search and archived page need a signed-in account (getUserScopedDb). Mobile Cloud search needs sign-in; mobile Local search needs none. CLI search needs none. |
| Permissions | Results limited to the user's own rows in the active organization scope (search/route.ts:316-330). Archived page lists the workspace's own archived chats. |
| Subscription | Search, archive and pin are not plan gated in the code I read. The 'scheduled' category requires workspace access check (search/route.ts:283-289) and schedule results are dropped if listing is denied (search/route.ts:482-486). |
| Limits and metering | Search limit default 50, max 100 (search/route.ts:36-37). Rate limit class chat-conversation. Archived list page size is MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE (mobile service.ts:12). Message search returns up to 100 message rows (search/route.ts:~470 'limit 100'). |
| Feature flags | None found for search or archive on web. |
| Model compatibility | None; no model involved. |
| Provider restrictions | None found. |
| Local mode | Mobile Local mode: search runs on the device, pinned works on device chats [inferred], archive does not exist. Web and Desktop: no Local mode. CLI: sessions are local; search, pin and archive all work offline from files. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Archived list loading | 'Loading archived chats…' | ArchivedChatsSection.tsx:119 |
| Archived list error | Alert with message and Retry; separate text says it is not the same as none | ArchivedChatsSection.tsx:93-130 |
| Archived list empty | 'No archived chats' | ArchivedChatsSection.tsx:133 |
| Reply streaming | Delete is disabled for a chat with a reply in progress; 'Delete all archived' disabled with the note 'Finish or stop active replies before deleting archived chats.' | ArchivedChatsSection.tsx:150-230 |
| Search with empty query | Server rejects: 'q query param required for search' | search/route.ts:282 |
| Invalid category, role or dates | Validation error | search/route.ts:284-300 |
| Region cannot be confirmed | Search refused with a region message | search/route.ts:130-146 |
| Search failure | Service throws 'Search failed: ...'; mobile Cloud falls back to on-device results and sets searchFailed | global-search-service.ts:155-160; chatViewStore.ts:266-271 |
| Mobile archive fails | Row is kept until the server confirms | useConversationActions.ts:125-131 |
| Account switch on mobile | Results dropped when the account epoch changes | chatViewStore.ts:233-237 |
| Offline on web search | not handled in the code beyond the thrown error | global-search-service.ts:155-160 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/search/__tests__/message-search-scoping.test.ts`: Scoping of message search (name only)
- `apps/web/app/api/search/__tests__/search-residency-and-scope.test.ts`: Data-region gate and scope (name only)
- `apps/web/app/api/search/__tests__/indexed-search.test.ts`: Indexed document search (name only)
- `apps/web/app/api/search/__tests__/plain-snippets.test.ts`: Plain text snippets (name only)
- `apps/web/app/api/search/__tests__/new-chat-entry-points.test.ts`: New-chat links from results (name only)
- `apps/web/features/chat/services/__tests__/global-search-service.test.ts`: Search service client
- `apps/web/app/api/chat/conversations/route.archived-filter.test.ts`: archived filter of the list route
- `apps/web/app/api/chat/conversations/bulk/route.test.ts`: bulk archive and delete route
- `apps/web/features/settings/hooks/useManagedChatList.test.tsx`: Archived and deleted list manager
- `apps/web/features/settings/sections/ConversationDataSections.test.tsx`: Archived and deleted settings sections
- `apps/cli/src/sessions.rs`: Inline tests: search_and_stats_use_managed_sessions (1645), search_returns_every_match (1677), archived session stays findable (1707), stale pin write (1599)

**Test scenarios**

- **Find by message text**
  1. Create a chat containing the word 'zebra' in a reply
  2. Open the search dialog and type 'zebra'
  - Expected: The chat appears with a snippet; opening it jumps to the message
- **Archive and restore a pinned chat**
  1. Pin a chat
  2. Archive it
  3. Open Settings > Archived chats
  4. Click Restore
  - Expected: Chat is back in the sidebar, unpinned
- **Delete from archive**
  1. Click Delete on an archived row
  2. Read the dialog
  3. Confirm
  - Expected: Dialog names Recently deleted and 30 days; chat leaves the list and appears under Recently deleted
- **Archived list failure**
  1. Block /api/chat/conversations in the network tool
  2. Open the page
  - Expected: Error alert with Retry and the 'could not be loaded' message
- **Mobile Local search**
  1. Switch to Local mode
  2. Search a word from a local chat
  - Expected: Local chat found with no network call to /api/search
- **CLI archive**
  1. agi session archive <id>
  2. agi session list
  3. agi --search <word>
  - Expected: Not in the list, still found by search

**Where to look when it fails**

- Server log 'Failed to apply bulk conversation action'
- Log '[GlobalSearch] Search failed:'
- API error 'Invalid search category' or 'Invalid role query param'
- Table web_conversations (archived, pinned, deleted_at)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/004-signed-in-application-destinations.md](../../70-qa/test-plans/web/004-signed-in-application-destinations.md)
- Desktop: [70-qa/test-plans/desktop/004-signed-in-application-destinations.md](../../70-qa/test-plans/desktop/004-signed-in-application-destinations.md)
- Mobile: [70-qa/test-plans/mobile/004-signed-in-application-destinations.md](../../70-qa/test-plans/mobile/004-signed-in-application-destinations.md)
- CLI: [70-qa/test-plans/cli/004-signed-in-application-destinations.md](../../70-qa/test-plans/cli/004-signed-in-application-destinations.md)
- VS Code: [70-qa/test-plans/vscode/004-signed-in-application-destinations.md](../../70-qa/test-plans/vscode/004-signed-in-application-destinations.md)

## 10. Gaps and dependencies

- **Brief says CLI pin is missing but the CLI implements it.** Affects: CLI. Evidence: apps/cli/src/lib.rs:1940-1945,5646-5647. Work needed: Correct the brief; confirm the TUI also shows pins
- **Archived rows cannot be opened from the web archived page.** Affects: Web, Desktop. Evidence: ArchivedChatsSection.tsx:176-195. Work needed: Add Open or change the requirement
- **Search wildcards from user input are not escaped.** Affects: Web, Desktop, mobile Cloud. Evidence: search/route.ts:316. Work needed: Escape % and _ and add a test
- **Local-mode mobile chats cannot be archived.** Affects: Mobile Local. Evidence: useConversationActions.ts:109-112. Work needed: Decide whether Local needs an archive set
- **No pin or archive in VS Code or Chrome.** Affects: VS Code, Chrome. Evidence: No pin or archive command found in commandSetup.ts; brief marks them missing. Work needed: Decide scope per app
- **Whether the indexed search uses a model provider is unknown.** Affects: All with web search. Evidence: search/route.ts:21-31 imports retrieval search. Work needed: Read retrieval-search-service
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-data-model-and-migrations
- SYS-memory-projects-and-context
- SYS-sync-and-continuity
- SYS-security-and-privacy
- table:web_conversations
- table:web_messages
- table:scheduled_tasks
- api:GET /api/search
- api:POST /api/chat/conversations/bulk
- api:PUT /api/chat/conversations/{id}

## Unknown

- Exact search shortcut keys (OPEN_SEARCH_SHORTCUT value not opened).
- Value of the recovery window (UI says 30 days; policy number not read).
- Whether the indexed document search uses a model provider.
- Retention of tracked search history.
- Whether the TUI shows pinned sessions.
- Mobile message shown when archived page is opened signed out.
