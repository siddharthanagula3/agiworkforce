---
id: "F090-01"
type: "feature"
title: "Saved conversations and messages"
aliases: ["Conversation store (S90.01)", "Turn/message store (S90.02)", "web_conversations and web_messages", "Managed Cloud chat history", "Chats list / chat history", "POST/GET /api/chat/conversations"]
area: "90 Conversation and synchronization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S90.01", "S90.02"]
depends_on: ["SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "SYS-execution-boundaries", "mode:cloud", "table:web_conversations", "table:web_messages", "F090-02", "F090-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F090-01 Saved conversations and messages

The server keeps every Cloud chat and every message of it, scoped to the signed-in user and the active workspace. Apps create, list (paged), open, update and soft-delete chats, and append messages. The mobile app, Chrome side panel, CLI and Tauri desktop reach the same routes. Web and mobile screens differ in how they page.

Area: [90. Conversation and synchronization components](README.md). Requirement items: [S90.01](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9001), [S90.02](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9002).

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

**What it does.** Stores each Cloud chat as a row in web_conversations and each turn (a user question or an assistant answer) as a row in web_messages, and exposes create, list, read, update, soft-delete and message append through server routes (apps/web/app/api/chat/conversations/route.ts:330-331; apps/web/app/api/chat/conversations/[id]/route.ts:590-592; apps/web/app/api/chat/conversations/[id]/messages/route.ts:155-156).

**Why it exists.** So history is durable and the same chat can be listed, opened and continued from any app signed in to the account (doc: knowledge-base/data/area-briefs/090-conversation-and-synchronization-components.md, S90.01 and S90.02; doc: docs/product/experience-contract.md:775 row W02).

**Who uses it.** Signed-in people using Cloud mode on web, mobile, the Chrome side panel, the CLI and the internal Tauri desktop. Engineers and testers use the routes as the contract for chat history.

**Problems it solves**

- History lost when a device or browser tab is closed.
- A chat started on a phone cannot be continued on the web without a shared store.
- Long histories need paging so a list or a chat does not load everything at once.
- Retried saves must not duplicate a message (the insert is idempotent on the client message id: apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts:33-45).

**Use cases**

- Send a first message on web: a chat row is created and the message is saved to it.
- Open the chat list on mobile, tap Load older chats, and older chats append.
- Open a saved chat on web: the client fetches the messages in pages of up to 500 until none are left.
- Delete a chat: it is soft deleted and disappears from the list on every device.

## 2. User experience

**Where to find it**

- Web: the chat list in the sidebar and the chat page at /chat/[id] (apps/web/features/chat/pages/WebChatPage.tsx:7152 passes onLoadMoreSessions; apps/web/shared/components/layout/WebAppShell.tsx:575).
- Web Desktop (Electron) shows this same hosted web app (doc: AGENTS.md section 5).
- Mobile: the chats list screen (apps/mobile/src/features/chat/ChatsListScreen.tsx) with controls labelled Load older chats (:832) and Retry loading chats (:816).
- Chrome side panel: creates Cloud conversations through the shared client (apps/extension/src/side_panel.ts:9080).
- CLI: pushes and pulls chat records through the sync route (apps/cli/src/cloud/chat.rs:13, :294-332).
- Tauri desktop (internal): CloudRuntime lists conversations with the shared client (apps/desktop/src/runtime/CloudRuntime.ts:1737).

**Before you start**

- A signed-in account; every route resolves the user and workspace through getUserScopedDb (apps/web/app/api/chat/conversations/route.ts:36).
- Cloud mode. On the Tauri desktop the Cloud persistence client throws unless the app is in managed Cloud mode with an account session (apps/desktop/src/lib/cloudChatPersistence.ts:49-62).
- For mobile cloud sync: the cloudChat feature flag, cloud app mode and a cloud account (apps/mobile/services/cloudSyncEngine.ts:98-105).

**Screens and controls**

- Sidebar list rows (web) built from the chat store (apps/web/shared/components/layout/sidebar-session-rows.ts:34).
- Mobile list with Load older chats button, Loading chats and Loading older chats indicators (apps/mobile/src/features/chat/ChatsListScreen.tsx:816-874).
- Mobile chat menu: Share, Rename, Pin/Unpin, Move to project, Duplicate, Mark as read/unread, Archive, Delete (apps/mobile/src/features/conversation-actions/useConversationActions.ts:262-300).
- Web conversation title menu opened by the button labelled Conversation options (apps/web/features/chat/components/ConversationTitleMenu.tsx:140).

**Journey**

1. Person types and sends the first message in a new chat.
2. The client creates the chat (POST /api/chat/conversations) with a client-chosen id, title and model, or the server generates an id (apps/web/app/api/chat/conversations/route.ts:275-300).
3. The client saves each turn with POST /api/chat/conversations/[id]/messages; the server inserts the row and moves the visible leaf to it (apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:101-134).
4. The chat appears in the list only after it has at least one live message (apps/web/app/api/chat/conversations/route.ts:82).
5. Later the person opens the list on another device; the first page loads, and older pages load on request.
6. Opening a chat loads its messages in pages until all are read (web: apps/web/lib/hooks/useConversations.ts:729-766).

**What the person sees and gets**

- Mobile list failure text: Chats could not be refreshed. Check your connection and try again. (apps/mobile/stores/chat/chatMessageStore.ts:468-531).
- A chat deleted or no longer owned answers Conversation not found (apps/web/app/api/chat/conversations/[id]/route.ts:123-125).
- On the Free plan a spent daily allowance answers HTTP 429 with a message saying how many chats or messages Free accounts can save a day and that they return after midnight UTC (apps/web/lib/services/tier-unit-quota-service.ts:180-187, :355-381).
- During a planned maintenance window a new chat is refused with New chats are paused for planned maintenance until <time>. Try again after it ends. (apps/web/app/api/chat/conversations/route.ts:202-209).
- Create returns 201 with the conversation; a reused id that now belongs to a deleted or foreign chat returns 409 conversation_unavailable (route.ts:305-323).

**Settings**

- Page sizes are contract constants: default 50, maximum 100 chats per page, maximum 500 messages per conversation read (packages/contracts/cloud-contracts/src/conversations.ts:87-89).
- Title cap comes from conversation-contract.json titleMaxLength (packages/contracts/cloud-contracts/src/conversation-contract.json:2).
- Message content cap 100,000 characters on write and 1,000,000 stored (packages/contracts/cloud-contracts/src/conversations.ts:19-20).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Create chat with idempotent upsert on a client id, scoped to user and workspace (apps/web/app/api/chat/conversations/route.ts:270-300).
- List chats: pinned first then newest, filtered by project, title text (q), archived and deleted filters (route.ts:60-136).
- The list accepts a keyset cursor or an offset and returns nextCursor, nextOffset and hasMore (route.ts:71, :103-106, :154-160).
- Read one chat with messages by limit and offset, with an ETag carrying the server version (apps/web/app/api/chat/conversations/[id]/route.ts:91-168).
- Separate keyset-paged message list route GET /api/chat/conversations/[id]/messages (apps/web/app/api/chat/conversations/[id]/messages/route.ts:45-97).
- Append a message, idempotent on a client id; the assistant role stores the model (messages/lib/message-thread.ts:33-45; persist-message.ts:91-99).
- Soft delete of a chat sets deleted_at, clears the cached compaction summary, revokes shares and published artifacts of that chat and releases the sandbox (apps/web/app/api/chat/conversations/[id]/route.ts:38-50, :533-558, :577).
- Restore route exists for soft-deleted chats (apps/web/app/api/chat/conversations/[id]/restore/route.ts; exact behaviour not opened).
- Mobile lists with a cursor when one is returned, otherwise offset (apps/mobile/stores/chat/chatMessageStore.ts:468-531).
- CLI pushes chat title, model, project and text messages through /api/chat/sync (apps/cli/src/cloud/chat.rs:294-332).

**Incomplete**

- Web paging uses offset only: the sidebar list reads limit and offset (apps/web/lib/hooks/useConversations.ts:196, :552). The brief's keyset paging is therefore only used by mobile among the clients I opened.
- The message-only keyset route GET .../messages has no caller in the web hook I read; web opens a chat through GET .../[id] by offset (useConversations.ts:729-766). Other callers unknown.
- A POST message stores role, content, model (assistant only), metadata and parent; its insert does not write provider or token counts (message-thread.ts:33-45). The read routes return provider and token columns (messages/route.ts:68), so where those are written is not established here (unknown).
- A chat with no live message is hidden from the list (route.ts:82), so a just-created empty chat does not appear until its first message is saved.

**Present but disconnected or switched off**

- Mobile cloud sync engine only runs when the cloudChat feature flag is true, the app is in cloud mode and a cloud account exists (apps/mobile/services/cloudSyncEngine.ts:98-105).
- The Tauri desktop persistence client is blocked in Local and own-key modes by design (apps/desktop/src/lib/cloudChatPersistence.ts:6-12, :49-55).
- The migration headers for the parent column, drafts and star/archive columns still say NOT YET APPLIED (apps/web/db/neon/0156_message_thread_variants.sql:4; 0219_conversation_drafts.sql:3; 0059_conversation_star_archive.sql:13). The routes select those columns, so applied status in each environment is unknown.

**Not available**

- VS Code extension: its managed chat client is used for projects and artifacts clients (apps/extension-vscode/src/features/projects/projectsClient.ts:72; artifactsClient.ts:95); a saved-chat list was not found in the files I opened (unknown).
- Local mode chats are not stored on the server by design; where web Local chats are stored on the device was not opened (unknown).

## 4. Required behaviour

**Established requirements**

- S90.01: conversations are durably stored per user and workspace, created, listed with keyset paging, read, updated and soft-deleted through a server API. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S90.01)
- S90.02: each turn is durably stored against its conversation with role, content, model, usage and metadata, and can be listed and appended. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S90.02)
- Create, send, edit, regenerate, branch, archive, restore and delete must keep conversation and message lineage after reload; double submission or reconnect must not create duplicate turns; failed persistence must be visible and recoverable. (source: doc: docs/product/experience-contract.md:775 (row W02))
- History paging must not skip a row when an item is removed or restored before the next page loads; deleted, temporary, foreign-account and inaccessible-workspace content stays excluded. (source: doc: docs/product/experience-contract.md:780 (row W07))
- Temporary chats are not stored. (source: apps/web/lib/temporary-chat-policy.ts:9 and apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:80)

**Acceptance criteria**

1. A message POSTed to a chat is returned by the next read of that chat, with the same id when a client id was supplied.
2. Sending the same message id twice leaves one row.
3. A chat with 120 messages opens complete on web; the page loop ends when hasMore is false.
4. The list returns pinned chats first, then newest, and following nextCursor never repeats or skips a chat on mobile.
5. A deleted chat is absent from the list, from a read (404) and from message save.
6. A Free account at its daily chat or message limit receives HTTP 429 with the free_daily_* code; a paid account is not refused by that check.
7. A user cannot read or write another user's or another workspace's chat (404).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The brief's 'platform done' for all apps means the server routes are done; per-app screens were assessed separately above.
- [inferred] A malformed cursor silently restarts from the first page because decodeKeysetCursor returns null for bad input (apps/web/lib/identity/pagination.ts:45-57; route.ts:71).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Move the web list and open-chat hooks to cursor paging, matching the brief and mobile.
- [proposed] Return 400 for a malformed cursor instead of restarting.
- [proposed] Show a visible error when a Free allowance is spent while the composer is sending (not verified how web shows it).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET/POST /api/chat/conversations | `apps/web/app/api/chat/conversations/route.ts` | List with filters and paging; create or upsert a chat. |
| endpoint | GET/PUT/DELETE /api/chat/conversations/[id] | `apps/web/app/api/chat/conversations/[id]/route.ts` | Read chat with messages; update metadata and draft; soft delete. |
| endpoint | GET/POST /api/chat/conversations/[id]/messages | `apps/web/app/api/chat/conversations/[id]/messages/route.ts` | Keyset message list and message append. |
| service | persistConversationMessage | `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts` | Inserts the turn, applies the Free allowance, sets the visible leaf, starts title and artifact indexing. |
| service | message-thread helpers | `apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts` | INSERT_MESSAGE_SQL (idempotent insert), thread lock, parent handling, delete helpers. |
| service | keyset pagination | `apps/web/lib/identity/pagination.ts` | Encodes and decodes cursors; builds the page and keyset SQL. |
| service | assertFreeDailyAllowance | `apps/web/lib/services/tier-unit-quota-service.ts` | Counts today's chat creates and message writes and refuses at the Free cap. |
| schema | Managed Cloud conversation contract | `packages/contracts/cloud-contracts/src/conversations.ts` | Wire schemas, page sizes and paths shared by every app. |
| service | Managed Cloud chat client | `packages/contracts/cloud-contracts/src/managed-cloud-chat-client.ts` | Typed client used by web, mobile, desktop and Chrome. |
| table | web_conversations / web_messages | `apps/web/db/neon/0001_mvp_chat.sql` | Base tables for chats and turns (added to by later migrations such as 0073 for workspace and 0156 for threading). |
| hook | useConversations | `apps/web/lib/hooks/useConversations.ts` | Web list paging, open chat, create, update and delete calls. |
| store | web chat store | `apps/web/shared/stores/web-chat-store.ts` | Web in-memory chat and message state. |
| store | mobile chat message store | `apps/mobile/stores/chat/chatMessageStore.ts` | Mobile list, paging, rename, pin, move, delete for Cloud and on-device chats. |
| service | mobile cloud sync engine | `apps/mobile/services/cloudSyncEngine.ts` | Cursor pull and push of conversations and messages for mobile. |
| screen | ChatsListScreen | `apps/mobile/src/features/chat/ChatsListScreen.tsx` | Mobile chat list with load-older and retry controls. |
| service | CLI hosted chat sync | `apps/cli/src/cloud/chat.rs` | Builds the push of a CLI session and folds pull results. |
| service | Tauri Cloud persistence client | `apps/desktop/src/lib/cloudChatPersistence.ts` | Managed-Cloud-only client factory for the internal desktop. |
| endpoint | POST/GET /api/chat/sync | `apps/web/app/api/chat/sync/route.ts` | Cursor-based pull and versioned push used by mobile and CLI. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client builds a create request (id, title, model, project, temporary flag). | device | packages/contracts/cloud-contracts/src/conversations.ts:176-204 |
| Server checks the user, CSRF, rate limit, maintenance window, project ownership and the Free daily chat allowance, then upserts the row. | our servers | apps/web/app/api/chat/conversations/route.ts:195-300 |
| Client saves each turn; server locks the thread when the chat is branched, inserts the message with a parent and moves the active leaf. | our servers | apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:101-134 |
| After an assistant message is saved, artifact indexing is scheduled in the background. | our servers | persist-message.ts:146-156 |
| A list read runs a scoped SQL query ordered by a pinned-first text key and returns a cursor. | our servers | apps/web/app/api/chat/conversations/route.ts:108-160 |
| The client renders the page and requests the next page from nextCursor (mobile) or nextOffset (web). | device | apps/mobile/stores/chat/chatMessageStore.ts:538-560; apps/web/lib/hooks/useConversations.ts:552 |
| Delete sets deleted_at in one transaction with share and published-artifact revocation, then releases the sandbox session. | our servers | apps/web/app/api/chat/conversations/[id]/route.ts:533-558, :577 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chat row: id, owner, workspace, title, model, route, project, pinned, starred, archived, temporary flag, active leaf, draft, instructions, timestamps, server version, deleted_at | table web_conversations | Yes: read by every app through the routes and the sync pull | Soft delete sets deleted_at; restorable within a recovery window named RESOURCE_RECOVERY_WINDOW_DAYS (apps/web/lib/resources/deletion-policies.ts:74-83); the window length was not read. |
| Message row: id, chat, role, content, model, provider, token counts, metadata, parent | table web_messages | Yes | A single message delete is a hard delete (apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts:370-380); a whole-chat delete is soft. |
| On-device chats in mobile Local mode | mobile app chat store (apps/mobile/stores/chat/chatMessageStore.ts) | No; Local chats never leave the device (apps/mobile/src/features/conversation-actions/useConversationActions.ts:103-106) | Delete from this device cannot be restored (same file, delete alert). |

**Models and providers.** Saving and listing chats calls no model. The assistant message stores the model name it was given. Which model answers is decided elsewhere (SYS-chat-turn-pipeline). Free plan allowance counting is a database count, not a provider call.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in account is required on every route; rows are scoped to user_id and the active workspace (organization_id) (apps/web/app/api/chat/conversations/route.ts:78-80). |
| Permissions | Owner-only: every query filters on user_id and workspace. A foreign or missing chat answers 404. The sync route also passes a workspace policy gate named chat_sync (apps/web/app/api/chat/sync/route.ts:551; apps/web/lib/managed-compute-gate.ts:262-282). |
| Subscription | The Free plan has a hard daily cap on chat creates and message writes; other plans have no hard limit from this check (apps/web/lib/services/tier-unit-quota-service.ts:389-390). Entitlement is resolved from the plan tier (same file:523-537). Linked to SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | Free daily caps: 1000 message writes and 100 conversation creates per UTC day (packages/contracts/types/src/billing-catalog.ts:485-486); counted from the tables, not a separate meter (tier-unit-quota-service.ts:131-148). If the count cannot be read the write is allowed (tier-unit-quota-service.ts:391-404). Rate limits use named buckets chat-conversation-list, chat-conversation-read, chat-conversation, chat-message. |
| Feature flags | Mobile: FEATURES.cloudChat (apps/mobile/services/cloudSyncEngine.ts:100). Server: maintenance window for new chats (route.ts:202). No flag found for the web routes. |
| Model compatibility | None found in the code: storage does not depend on the model. |
| Provider restrictions | None found in the code for storage. Creating a chat with a selected route checks that the route can serve the model (route.ts:215-217). |
| Local mode | Local mode chats are not sent to these routes. Mobile keeps them in an on-device store and says they cannot be restored after delete (useConversationActions.ts:103-106). On web, a chat answered by a model on the device is held back from draft sync and title generation (apps/web/features/chat/hooks/use-conversation-draft-sync.ts:73-83). On the Tauri desktop, Local and own-key chats use the Rust runtime, not these routes (apps/desktop/src/lib/cloudChatPersistence.ts:6-12). Where web Local chats are stored on disk: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Mobile shows Loading chats and Loading older chats indicators. | apps/mobile/src/features/chat/ChatsListScreen.tsx:846, :874 |
| Empty | A chat without a live message is not listed by the server. Empty-state wording on web and mobile screens: not opened (unknown). | apps/web/app/api/chat/conversations/route.ts:82 |
| Error | Mobile sets a load error and shows Retry loading chats. Web throws a user-safe Failed to fetch conversations. | apps/mobile/stores/chat/chatMessageStore.ts:511-531; apps/web/app/api/chat/conversations/route.ts:163-165 |
| Retry | Message POST is idempotent on the client id; a retried save re-asserts content but never changes parent. | apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts:21-45 |
| Pagination did not advance | Web and mobile throw an error rather than loop forever. | apps/web/lib/hooks/useConversations.ts:747-757; apps/mobile/stores/chat/chatMessageStore.ts:484-486 |
| Bad cursor | A malformed cursor is treated as absent and the first page is returned. | apps/web/lib/identity/pagination.ts:45-57 |
| Temporary chat | Saving a message answers a conflict: Messages in a temporary chat are not saved. The list also hides temporary chats. | persist-message.ts:80; route.ts:81 |
| Offline | Mobile marks conversations dirty and retries on push; offline queueing is covered by F090 sync features, not traced here. | apps/mobile/stores/chat/chatMessageStore.ts:919-932 |
| Account change mid-request | Mobile discards results if the cloud account epoch changed; Chrome throws ManagedCloudOwnerChangedError. | apps/mobile/stores/chat/chatMessageStore.ts:480-486; apps/extension/src/features/cloud-bridge/managedCloudChatClient.ts:12-16 (path as imported by conversationSyncClient.ts; file not opened) |
| Accessibility | Mobile list buttons carry accessibility labels. Web list accessibility not opened (unknown). | apps/mobile/src/features/chat/ChatsListScreen.tsx:816, :832 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/chat/conversations/route.keyset-pagination.test.ts`: Cursor names the last row, hides the sort key, pinned-first total order, paging from a cursor stops sending an offset, bound parameters.
- `apps/web/app/api/chat/conversations/route.archived-filter.test.ts`: Archived filter (file name; contents not opened).
- `apps/web/app/api/chat/conversations/route.deleted-filter.test.ts`: Deleted filter (file name; contents not opened).
- `apps/web/app/api/chat/conversations/route.empty-filter.test.ts`: Hiding chats with no messages (file name; contents not opened).
- `apps/web/app/api/chat/conversations/route.organization-scope.test.ts`: Workspace scoping (file name; contents not opened).
- `apps/web/app/api/chat/conversations/route.temporary-history.test.ts`: Temporary chats in history (file name; contents not opened).
- `apps/web/app/api/chat/conversations/route.maintenance-window.test.ts`: Maintenance refusal on create (file name; contents not opened).
- `apps/web/app/api/chat/conversations/[id]/messages/route.pagination.test.ts`: Message keyset paging (file name; contents not opened).
- `apps/web/app/api/chat/conversations/[id]/route.delete.test.ts`: Soft delete (file name; contents not opened).
- `apps/web/__tests__/api/chat-conversations.test.ts`: Conversation list and create (file name; contents not opened).
- `apps/web/__tests__/api/chat-messages.test.ts`: Message routes (file name; contents not opened).
- `apps/web/__tests__/api/chat-tenant-isolation.test.ts`: Tenant isolation (file name; contents not opened).
- `apps/web/lib/services/tier-unit-quota-service.test.ts`: Free daily allowance logic (file name; contents not opened).
- `apps/mobile/__tests__/cloud-sync-engine.test.ts`: Mobile sync engine (file name; contents not opened).

**Test scenarios**

- **First message creates and saves**
  1. Sign in on web in Cloud mode.
  2. Send a message in a new chat.
  3. Reload and open the chat from the sidebar.
  - Expected: The chat appears with the message and its title; the message count matches.
- **Paging on mobile**
  1. Use an account with more than one page of chats.
  2. Open the mobile chats list.
  3. Tap Load older chats.
  - Expected: Older chats append in order with no repeats; the button disappears at the end.
- **Free daily cap**
  1. Use a Free test account at the daily message cap (value in billing catalog).
  2. Send another message.
  - Expected: HTTP 429 with code free_daily_message_limit_reached; the message is not stored.
- **Delete across devices**
  1. Delete a chat on web.
  2. Refresh the list on mobile.
  - Expected: The chat is gone from the list and a read answers not found.
- **Cross-account read**
  1. Take a chat id from account A.
  2. Request GET /api/chat/conversations/[id] as account B.
  - Expected: 404 Conversation not found.

**Where to look when it fails**

- Server log lines: Failed to fetch conversations, Failed to create conversation, Failed to save message, Failed to fetch messages.
- Free cap event: free_daily_cap_unreadable (allowed on read failure).
- Error codes: conversation_unavailable (409), free_daily_message_limit_reached and free_daily_conversation_limit_reached (429).
- Tables: web_conversations, web_messages.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Web lists chats and opens a chat by offset, not by the keyset cursor the brief requires.** Affects: Web, Electron desktop; members with long histories.. Evidence: apps/web/lib/hooks/useConversations.ts:196, :552, :729-766. Work needed: Switch the hooks to nextCursor and keep offset only for older clients.
- **Message provider and token usage are not written by the POST message insert, though S90.02 asks for usage.** Affects: All apps that save through POST /messages.. Evidence: apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts:33-45 versus messages/route.ts:68. Work needed: Trace the writer of these columns (likely the completions path) and record it, or write them here.
- **A malformed cursor silently returns page one.** Affects: Any client with a corrupt cursor; may show duplicates.. Evidence: apps/web/lib/identity/pagination.ts:45-57. Work needed: Return a validation error.
- **Daily allowance check fails open when the count cannot be read.** Affects: Free users (cap can be exceeded during a database fault).. Evidence: apps/web/lib/services/tier-unit-quota-service.ts:391-404. Work needed: Decide if fail-open is intended and document or change it.
- **Per-app screens for the list on VS Code, Chrome, CLI and Tauri desktop were not established.** Affects: VS Code, Chrome, CLI.. Evidence: files listed in the implementation map; no list screens opened. Work needed: Open each app's history screen and record labels and states.

**Depends on**

- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- SYS-execution-boundaries
- mode:cloud
- table:web_conversations
- table:web_messages
- F090-02
- F090-03

## Unknown

- Whether migrations 0059, 0156 and 0219 are applied in each environment (headers say not yet applied).
- Length of the recovery window for deleted chats (constant name only).
- Who writes provider and token counts on message rows.
- Where web Local-model chats are stored on the device.
- Whether VS Code shows a saved-chat list.
- Empty-state wording on web and mobile lists.
- Callers of the keyset message list route.
