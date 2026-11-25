---
id: "F090-03"
type: "feature"
title: "Pin, star, archive and chat settings"
aliases: ["Pin/archive service (S90.08)", "Conversation metadata service (S90.12)", "Pin, star, archive", "Temporary chat / incognito", "Move to project", "PUT /api/chat/conversations/[id]"]
area: "90 Conversation and synchronization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S90.08", "S90.12"]
depends_on: ["SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-model-catalog-and-routing", "SYS-memory-projects-and-context", "SYS-sync-and-continuity", "F090-01", "F090-05", "table:web_conversations", "mode:cloud", "surface:web", "surface:mobile", "surface:cli"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F090-03 Pin, star, archive and chat settings

One update route changes a chat's title, model, route, project, pinned, starred, archived, temporary flag and visible leaf, and saves each change. A pinned chat sorts first. A stale-version write is refused with 412 when the caller sends If-Match. The star flag exists in the store, but no control that sets it was found.

Area: [90. Conversation and synchronization components](README.md). Requirement items: [S90.08](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9008), [S90.12](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9012).

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

**What it does.** Lets a person organise chats and set per-chat options, and persists each change on the server so every device sees it (apps/web/app/api/chat/conversations/[id]/route.ts:170-514).

**Why it exists.** Long histories need pin and archive to stay usable, and a chat needs its own model, project and temporary state (doc: knowledge-base/data/area-briefs/090-conversation-and-synchronization-components.md, S90.08 and S90.12).

**Who uses it.** Anyone with more than a few chats; workspace members who file chats into projects; people using temporary chats for private questions.

**Problems it solves**

- Important chats buried by newer ones.
- Clutter from old chats without deleting them.
- Losing the chosen model or project on another device.
- Two devices overwriting each other's metadata (guarded by an optional version check).

**Use cases**

- Pin a chat so it stays at the top of the sidebar.
- Archive a finished chat and restore it later from Archived chats.
- Move a chat into a project.
- Turn on a temporary chat so nothing is saved.

## 2. User experience

**Where to find it**

- Web sidebar row menu: Rename, Pin/Unpin, Mark as read/unread, Archive, Restore (archived rows), Delete, Move to project (packages/ui/ui/src/sidebar/SessionItem.tsx:337-420).
- Web chat header menu (button labelled Conversation options): Rename, Add or Edit chat instructions, Move to project or Change project, Share..., Print, Export..., Copy as Markdown, Duplicate as branch, Archive or Unarchive, Delete (apps/web/features/chat/components/ConversationTitleMenu.tsx:140-230).
- Web Settings, Archived chats section and bulk Archive all / Delete all (apps/web/features/settings/sections/ArchivedChatsSection.tsx:87; apps/web/features/settings/components/BulkConversationControls.tsx:95-128).
- Mobile chat menu: Rename, Pin/Unpin, Move to project, Archive (Cloud chats only), Delete (apps/mobile/src/features/conversation-actions/useConversationActions.ts:262-300).
- CLI: the cloud update change set supports rename, model, pin and archive (apps/cli/src/cloud/chat.rs:497-515).
- Temporary chat labels: Temporary chat, Use incognito, Exit incognito (apps/web/lib/temporary-chat-policy.ts:1-5).

**Before you start**

- Cloud chat saved on the server (except Temporary chat, which is chosen at the start).
- Signed-in account.

**Screens and controls**

- Sidebar and header menus listed above.
- Mobile pin shows a pin icon; a starred chat shows a star icon labelled Starred (apps/mobile/src/features/chat/ChatsListScreen.tsx:585-595); the web sidebar shows a star on starred rows (packages/ui/ui/src/sidebar/SessionItem.tsx:144).
- No control that sets starred was found on web or mobile.

**Journey**

1. Person opens a row or header menu and picks Pin.
2. The client updates the store at once and sends PUT with pinned true (web: apps/web/features/chat/pages/WebChatPage.tsx:5369).
3. The server updates the row and returns the conversation and a version in the ETag header.
4. The sidebar re-sorts: pinned first, then newest.
5. Archive: the same PUT with archived true; the server also clears pinned (route.ts:374-378); the row leaves the default list.
6. Restore from Archived chats sends archived false.

**What the person sees and gets**

- Mobile pin failure: the row flips back and an alert says Could not pin conversation or Could not unpin conversation and that the change has been undone (apps/mobile/stores/chat/chatMessageStore.ts:975-990).
- Mobile archive hides the row only after the server confirms, with an Undo action (apps/mobile/src/features/conversation-actions/useConversationActions.ts:121-140).
- Stale version answer: 412 with This conversation changed since you loaded it. Reload it and apply your change again. and the current chat (route.ts:491-496).
- Temporary with project: validation message from TEMPORARY_CHAT_PROJECT_REFUSAL (apps/web/lib/temporary-chat-policy.ts, exact text not read).
- Bulk actions toast: Archived N chats / Deleted N chats (BulkConversationControls.tsx:293-298).

**Settings**

- Chat instructions per chat (Add chat instructions) written by the same route (route.ts:276-288).
- Archive and pin filters on the list: archived include, only or exclude (apps/web/app/api/chat/conversations/route.ts:46-50).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Columns pinned, starred, archived on web_conversations (apps/web/db/neon/0059_conversation_star_archive.sql:22-26) and the update route writes them (route.ts:297-304, :366-430).
- Archiving unpins the chat; unpin with archive false keeps pinned unchanged (route.ts:374-378).
- Pinned chats sort first via the page sort key (apps/web/app/api/chat/conversations/route.ts:123-124).
- Optional optimistic version check through the If-Match header against server_version, answering 412 with the current chat (route.ts:184-188, :388, :475-496; apps/web/lib/http-preconditions.ts:9-29).
- expectedTitle guard so an automatic title never overwrites a changed title (route.ts:389, :433-453).
- Title, model, selectedRouteId (must pair with a model and a route that serves it), project and temporary flag updates; project ownership checked (route.ts:202-207, :315-332).
- Temporary and project cannot combine, enforced in the SQL and by validation (route.ts:312-314, :390-399).
- Marking a chat temporary also marks its image and video jobs temporary (route.ts:501-508).
- Mobile: rename, model, pin, move, archive, delete with rollback on failure (apps/mobile/stores/chat/chatMessageStore.ts:919-1020; archived-chats/service.ts:100-125).
- CLI: rename, model, pin, archive with a required exact revision (apps/cli/src/cloud/chat.rs:497-515).

**Incomplete**

- Sync push applies title, model, project, pinned and delete only; starred, archived and draft are not applied on push (apps/web/app/api/chat/sync/route.ts:608-628), although the pull returns starred and archived (route.ts:127).
- The web client's updateConversation does not send If-Match (no use in apps/web/lib or features); only the CLI sends it (apps/cli/src/cloud/chat.rs:540-549), so web edits are last-write-wins.

**Present but disconnected or switched off**

- No UI control that writes starred was found on web or mobile; the API field and display exist (apps/web/lib/hooks/useConversations.ts:408; packages/ui/ui/src/sidebar/SessionItem.tsx:144).
- Mobile Archive is offered for Cloud chats only; Local chats have no archive (useConversationActions.ts:106-108).

**Not available**

- Pin or archive in the Chrome side panel and VS Code: not found in opened files (unknown).
- Star control on CLI: not in its change set (chat.rs:497-515).

## 4. Required behaviour

**Established requirements**

- S90.08: chats can be pinned, starred and archived through the API, persisted, and reflected in list ordering and filters. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S90.08)
- S90.12: conversation metadata (title, model, project, pin/star/archive, temporary, active branch) is read and updated through one versioned service. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S90.12)
- Archive and restore preserve lineage and a restored chat is reachable at once. (source: doc: docs/product/experience-contract.md:775 (W02))
- An action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Pinning a chat moves it to the top of the list on every device after refresh.
2. Archiving removes it from the default list and from search unless includeArchived is set, and clears its pin.
3. A write with a stale If-Match returns 412 and changes nothing.
4. Setting a project on a temporary chat is refused.
5. Changing the model without a route clears or sets the route consistently; a route that cannot serve the model is refused.
6. The sidebar order does not change when only the visible version changes.
7. A starred chat shows a star on web and mobile.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Because no control writes starred, the brief's 'starred through the API' is met only at the API level.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a Star or Unstar action to the sidebar and mobile menus.
- [proposed] Send If-Match from the web and mobile clients and surface 412 as a reload prompt.
- [proposed] Apply starred and archived on the sync push or document that they use the route only.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | PUT /api/chat/conversations/[id] | `apps/web/app/api/chat/conversations/[id]/route.ts` | Metadata update with version check. |
| schema | ManagedCloudUpdateConversationRequestSchema | `packages/contracts/cloud-contracts/src/conversations.ts` | Allowed update fields. |
| schema | 0059 star and archive migration | `apps/web/db/neon/0059_conversation_star_archive.sql` | Adds starred and archived columns. |
| service | http-preconditions | `apps/web/lib/http-preconditions.ts` | If-Match parsing, ETag, 412 response. |
| config | temporary-chat-policy | `apps/web/lib/temporary-chat-policy.ts` | Temporary chat labels and refusal texts. |
| endpoint | GET /api/chat/conversations (filters, sort) | `apps/web/app/api/chat/conversations/route.ts` | Pinned-first order and archived filter. |
| hook | useConversations.updateConversation | `apps/web/lib/hooks/useConversations.ts` | Web update call. |
| component | SessionItem | `packages/ui/ui/src/sidebar/SessionItem.tsx` | Shared sidebar row and menu. |
| component | ConversationTitleMenu | `apps/web/features/chat/components/ConversationTitleMenu.tsx` | Header menu. |
| screen | WebChatPage handlers | `apps/web/features/chat/pages/WebChatPage.tsx` | Pin and archive handlers at lines 5369-5383. |
| component | ArchivedChatsSection | `apps/web/features/settings/sections/ArchivedChatsSection.tsx` | Archived chats list and restore. |
| component | BulkConversationControls | `apps/web/features/settings/components/BulkConversationControls.tsx` | Archive all and Delete all. |
| hook | useConversationActions | `apps/mobile/src/features/conversation-actions/useConversationActions.ts` | Mobile chat menu. |
| service | archived-chats service | `apps/mobile/src/features/archived-chats/service.ts` | Mobile archive, restore and delete calls. |
| store | mobile chat message store | `apps/mobile/stores/chat/chatMessageStore.ts` | Rename, model, pin and move with rollback. |
| service | CLI update_conversation | `apps/cli/src/cloud/chat.rs` | Rename, model, pin, archive with exact revision. |
| endpoint | POST /api/chat/sync (push) | `apps/web/app/api/chat/sync/route.ts` | Versioned push of title, model, project, pinned and delete. |
| table | web_conversations | `apps/web/db/neon/0001_mvp_chat.sql` | Holds the metadata columns and server_version. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks an action; the client updates its local store first. | device | apps/mobile/stores/chat/chatMessageStore.ts:975-985 |
| Client sends PUT with CSRF; the server checks rate limit, parses If-Match and validates the body. | our servers | apps/web/app/api/chat/conversations/[id]/route.ts:170-207 |
| Server validates the target project and leaf, then runs one UPDATE guarded by version, expected title and the temporary-project rule. | our servers | route.ts:315-430 |
| Server returns the conversation and the new version in the ETag header; on a failed guard it returns 412, the unchanged-title answer, or 404. | our servers | route.ts:432-513 |
| On failure mobile rolls the row back and alerts. | device | apps/mobile/stores/chat/chatMessageStore.ts:982-990 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| pinned, starred, archived, is_temporary, title, model, selected_route_id, project_id, active_leaf_message_id, server_version | table web_conversations | Yes (pull returns pinned, starred, archived, leaf) | Kept with the chat; soft delete with the chat. |
| temporary flag on image and video jobs | tables image_generation_jobs and video_generation_jobs | Server only | Purge behaviour described in TEMPORARY_CHAT_RETENTION_NOTE; the cron was not opened. |

**Models and providers.** Changing a chat's model stores a model name and optional provider route; the server checks the route can serve the model (route.ts:202-207) via isConfiguredManagedModelRoute. No model call happens.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; owner and workspace scoped (route.ts:384-387). |
| Permissions | Only the owner changes a chat; projects must be owned and not archived (route.ts:318-324). |
| Subscription | No allowance check on the update route; none found in the code. |
| Limits and metering | Title max 500 characters, instructions max 4000, rate bucket chat-conversation (packages/contracts/cloud-contracts/src/conversations.ts:10-12, :176-204). |
| Feature flags | None found in the code. |
| Model compatibility | The model must be paired with a route that serves it; a route without a model is refused (route.ts:202-207). |
| Provider restrictions | Own-key and Local routes are not part of this route; it validates managed Cloud routes only. |
| Local mode | Mobile Local chats have Pin, Rename, Move to project and Delete on the device but no Archive (useConversationActions.ts:106-108, :290). Own-key and Local metadata on web or desktop: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Stale version | 412 PRECONDITION_FAILED with the current chat and ETag; applied only when If-Match is sent. | apps/web/lib/http-preconditions.ts:20-29; route.ts:475-496 |
| Bad If-Match | Validation error: If-Match must be a conversation version from its ETag. | route.ts:185-187 |
| Missing chat | 404 Conversation not found. | route.ts:498 |
| Unarchive with pin | Archive clears the pin; restoring does not re-pin unless repin is requested by the client (mobile). | route.ts:374-378; apps/mobile/src/features/archived-chats/service.ts:100-107 |
| Rollback | Mobile restores the old pin value after a failed call and alerts. | chatMessageStore.ts:982-990 |
| Offline | Mobile rename and model changes stay optimistic and are marked for the next sync push; pin has no queue (alerts instead). | chatMessageStore.ts:912-932, :956-972 |
| Project to temporary | Refused both ways. | route.ts:312-314, :455-474 |
| Accessibility | Web header menu trigger is labelled Conversation options; mobile star icon has an accessibility label Starred. | ConversationTitleMenu.tsx:140; ChatsListScreen.tsx:593 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/chat/conversations/[id]/route.concurrency.test.ts`: ETag publishing, unconditional update without If-Match, version-guarded update, 412 with current chat, 404 on missing, expected-title guard, bad If-Match.
- `apps/web/app/api/chat/conversations/[id]/route.variants.test.ts`: Active leaf persistence and scoping.
- `apps/web/app/api/chat/conversations/route.archived-filter.test.ts`: Archived filter (file name; contents not opened).
- `apps/web/__tests__/api/chat-conversation-single.test.ts`: Single chat route (file name; contents not opened).
- `apps/web/app/api/chat/conversations/[id]/route.withdrawal.test.ts`: Withdrawal behaviour (file name; contents not opened).
- `apps/mobile/__tests__/ArchiveUndoKeepsMessages.test.ts`: Mobile archive undo (file name; contents not opened).
- `apps/mobile/__tests__/cloud-delete-rename-durability.test.ts`: Mobile rename and delete durability (file name; contents not opened).

**Test scenarios**

- **Pin ordering**
  1. Pin an older chat on web.
  2. Open the list on mobile.
  - Expected: The pinned chat is first.
- **Archive clears pin**
  1. Pin a chat.
  2. Archive it.
  3. Restore it.
  - Expected: After archive it is not in the default list; after restore it is unpinned.
- **Stale write**
  1. GET a chat and note the ETag.
  2. PUT a title change.
  3. PUT another change with the old ETag in If-Match.
  - Expected: 412 with the current chat; nothing changed by the second write.
- **Temporary into project**
  1. Create a temporary chat.
  2. PUT projectId of a project you own.
  - Expected: Validation refusal.
- **Star**
  1. Search both apps' menus for a Star action.
  - Expected: Currently none; record as the gap.

**Where to look when it fails**

- Server logs: Failed to validate conversation project, Failed to validate conversation active leaf, Media jobs were not marked temporary.
- Response code PRECONDITION_FAILED (412).
- Column server_version on web_conversations.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No UI control sets starred on web or mobile.** Affects: All apps with a sidebar or list.. Evidence: packages/ui/ui/src/sidebar/SessionItem.tsx:337-420 (no star item); apps/mobile/src/features/conversation-actions/useConversationActions.ts:262-300. Work needed: Add Star and Unstar actions and a Starred filter, or drop the column.
- **Web and mobile clients do not send If-Match, so concurrent metadata edits overwrite each other.** Affects: People using two devices.. Evidence: no If-Match use in apps/web/lib/hooks/useConversations.ts:892-930 or mobile service; only apps/cli/src/cloud/chat.rs:540-549. Work needed: Send versions and handle 412.
- **Sync push ignores starred, archived.** Affects: Mobile and CLI offline edits.. Evidence: apps/web/app/api/chat/sync/route.ts:608-628. Work needed: Extend the push or state that these use the update route only.
- **Mobile has no Archive for Local chats.** Affects: Mobile Local mode.. Evidence: useConversationActions.ts:106-108. Work needed: Decide if Local needs archive.
- **The draft's 409 conflict for stale versions is wrong: stale version answers 412.** Affects: Documentation and testers.. Evidence: apps/web/lib/http-preconditions.ts:20-29. Work needed: Use 412 in tests and docs; 409 belongs to draft conflicts.

**Depends on**

- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-model-catalog-and-routing
- SYS-memory-projects-and-context
- SYS-sync-and-continuity
- F090-01
- F090-05
- table:web_conversations
- mode:cloud
- surface:web
- surface:mobile
- surface:cli

## Unknown

- Where the web client sets the temporary flag at chat creation (control not opened).
- Exact text of TEMPORARY_CHAT_PROJECT_REFUSAL.
- Pin and archive in Chrome and VS Code.
- Whether any control writes starred.
- Recovery window length for deleted chats.
