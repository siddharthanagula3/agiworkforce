---
id: "F085-07"
type: "feature"
title: "Archived and deleted chats"
aliases: ["Archived chats", "Recently deleted", "Delete all chats", "Delete all chats in this workspace", "Archive all chats", "Delete all archived", "Delete all cloud chats", "Delete all local chats", "archive_all / delete_all / delete_archived", "Archived sessions (CLI, VS Code)", "S85.17", "S85.18"]
area: "85 Personalization and data settings"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "missing"}
verification: {web: "partly seen (1 of 2)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S85.17", "S85.18"]
depends_on: ["SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-sync-and-continuity", "SYS-security-and-privacy", "SYS-observability-and-operations", "table:web_conversations", "table:shared_sessions", "api:POST /api/chat/conversations/bulk", "api:POST /api/chat/conversations/[id]/restore", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "F085-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F085-07 Archived and deleted chats

A person can list archived chats, restore them or delete them, and can delete every chat in a workspace at once after a confirmation. Cloud deletes are soft: the chat stays in Recently deleted for 30 days and can be restored on the web. Mobile Local chats and CLI or VS Code sessions are separate, device-side stores.

Area: [85. Personalization and data settings](README.md). Requirement items: [S85.17](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8517), [S85.18](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8518).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (1 of 2) |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the person control over chats they no longer want in the sidebar. Archive hides a chat but keeps it. Delete moves it to Recently deleted, where it can be restored for 30 days. A bulk action does this to every chat in the current workspace (apps/web/app/api/chat/conversations/bulk/route.ts:29-31, :58-80). Mobile also has a separate wipe of Local chats on the phone (apps/mobile/src/features/settings/data-controls/deleteLocalChats.ts:11-24).

**Why it exists.** People need a way to clean up history and to undo a mistake. The project decision record says deleted conversations were unreachable and never purged before restore was added (doc: docs/decisions/wire-or-cut.md, row 'Restore deleted conversations'). The founder-facing product definition lists privacy controls including data deletion paths (doc: docs/product/requirements.md:817).

**Who uses it.** Any signed-in person on Web, Desktop (the hosted web app inside Electron), Mobile (Cloud mode and Local mode), and developers on the CLI and VS Code who manage coding sessions.

**Problems it solves**

- Clearing a whole history in one step instead of deleting chats one by one.
- Recovering a chat deleted by mistake, within 30 days.
- Keeping the sidebar short without losing chats (archive).
- Making sure public share links die with the chat (delete revokes shares) (apps/web/app/api/chat/conversations/bulk/route.ts:85-103).

**Use cases**

- On Web a person opens Settings > Privacy, chooses Delete all, reads the count and the 30-day note, and confirms.
- On Mobile a person with a long Cloud history taps Delete all cloud chats and confirms twice.
- A person who deleted the wrong chat opens Settings > Privacy > Recently deleted on the web and restores it.
- A developer runs `agi session list --archived` to see archived local sessions.

## 2. User experience

**Where to find it**

- Web (and Desktop, which shows the hosted web app): Settings > Privacy has rows 'Archived chats' (Manage), 'Recently deleted' (Manage) and the bulk rows 'Archive all chats in this workspace' and 'Delete all chats in this workspace' (apps/web/features/settings/sections/PrivacySection.tsx:641, :671-678; apps/web/features/settings/components/BulkConversationControls.tsx:94-101). The Archived chats page has a 'Delete all archived' button (apps/web/features/settings/sections/ArchivedChatsSection.tsx:226).
- Mobile: Settings data controls has a row 'Archived chats' that opens the screen titled 'Archived Chats', a 'Delete all cloud chats' button, and in Local mode a 'Delete all local chats' button under 'Local chats' (apps/mobile/src/features/settings/data-controls/index.tsx:485, :460, :524; apps/mobile/app/(app)/settings/archived-chats.tsx:397).
- CLI: `agi session list --archived`, `agi session archive <id>`, `agi session unarchive <id>`, `agi session delete <id>` act on local session files (apps/cli/src/lib.rs:1936-1938, :5588-5625, :5760-5790).
- VS Code: command 'Code: Archived Sessions' opens a picker with Restore, Delete and Restore all buttons (apps/extension-vscode/package.json:267-268; apps/extension-vscode/src/features/trees/sessionPickers.ts:145-185).
- Chrome extension: not available (no code found in apps/extension/src for archive or bulk delete; the brief says missing).

**Before you start**

- Cloud actions need a signed-in account; on Mobile the app must be in Cloud mode and Cloud must be unlocked (apps/mobile/src/features/settings/data-controls/index.tsx:255-275).
- Web Delete all is disabled while any chat is streaming (apps/web/features/settings/components/BulkConversationControls.tsx:79, :208-212).
- Restoring from Recently deleted is only offered on the web; the Mobile copy tells the person to restore on the web (apps/mobile/app/(app)/settings/archived-chats.tsx:339, :369).

**Screens and controls**

- Web Archived chats page: heading 'Archived chats', per-row Restore and Delete buttons, 'Load more', 'Delete all archived' (apps/web/features/settings/sections/ArchivedChatsSection.tsx:87, :176-195, :204-212, :216-226).
- Web bulk rows: 'Archive all' / 'Delete all' buttons that show 'Preparing…' then 'Deleting…' (BulkConversationControls.tsx:120-128).
- Web confirmation dialog titled 'Delete all chats in this workspace?' with button 'Delete all chats' (BulkConversationControls.tsx:331-337).
- Mobile two-step alerts: 'Delete all chats?' then 'Are you absolutely sure?' (data-controls/index.tsx:319-345).
- Mobile local alert 'Delete all local chats?' with 'This cannot be undone.' (data-controls/index.tsx:370-372).

**Journey**

1. Web: open Settings > Privacy and scroll to the chat history rows.
2. Choose 'Delete all'. The app reads the chat count from the history stats endpoint while the button says 'Preparing…' (BulkConversationControls.tsx:241-244).
3. Read the dialog: it names the workspace, the number of chats, says they can be restored from Settings > Privacy > Recently deleted for 30 days, and that memories learned from them stay (BulkConversationControls.tsx:51-59).
4. Press 'Delete all chats'. The app posts the action, removes the rows from the sidebar store and returns to /chat (BulkConversationControls.tsx:271-287).
5. See the notice 'Deleted N chats.' (BulkConversationControls.tsx:296-299).
6. To undo: Settings > Privacy > Recently deleted > Restore on a chat (apps/web/features/settings/services/conversation-data-service.ts:133-157).

**What the person sees and gets**

- Web success notice 'Archived N chats.' or 'Deleted N chats.' (BulkConversationControls.tsx:290-299).
- Web errors: 'Finish or stop active replies before deleting all chats.', 'The chat update could not be started. Try again.', 'We could not confirm whether your chats were updated. Check your chat history before starting another bulk action.' (BulkConversationControls.tsx:38, :305-311).
- Archived list failure shows 'Archived chats could not be loaded' with the note that this is not the same as having none, plus Retry (ArchivedChatsSection.tsx:121-129).
- Mobile alerts 'Chats deleted' with a count, or 'Delete outcome unknown' (data-controls/index.tsx:283-310).

**Settings**

- None of these actions is a stored setting. The related stored preference 'Start new chats temporary' is a separate feature in the same Privacy page (apps/web/features/settings/sections/PrivacySection.tsx:700-715 area, see comment on temporary chats).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web bulk route accepts only archive_all, delete_all, delete_archived, is CSRF-protected and rate limited, and soft-deletes by setting deleted_at (apps/web/app/api/chat/conversations/bulk/route.ts:29-31, :36-40, :58-71).
- The delete runs in one transaction that also unpublishes published artifacts and removes shared_sessions rows of the deleted chats, then releases sandboxes (route.ts:88-103, :119-131).
- Single chat delete is a soft delete and also revokes shares (apps/web/app/api/chat/conversations/[id]/route.ts:38-48, :531-558).
- Restore sets deleted_at to null only inside the recovery window (apps/web/app/api/chat/conversations/[id]/restore/route.ts:36-50; apps/web/lib/resources/lifecycle-sql.ts:58-63). The window is 30 days (apps/web/lib/resources/deletion-policies.ts:8, :76-82).
- Web lists archived chats (archived=only) and deleted chats (deleted=only) with paging (apps/web/features/settings/services/conversation-data-service.ts:73-131).
- Mobile: Archived chats list, restore, delete one, delete all archived, archive all, delete all cloud chats, all through the same endpoints (apps/mobile/src/features/archived-chats/service.ts:19-157).
- Mobile Local mode: Delete all local chats removes each local conversation and its draft (apps/mobile/src/features/settings/data-controls/deleteLocalChats.ts:11-24).
- CLI lists archived local sessions and can archive, unarchive and delete them (apps/cli/src/lib.rs:5588-5625, :5760-5790).
- VS Code: archived session picker with Restore, Delete and Restore all (apps/extension-vscode/src/features/trees/sessionPickers.ts:145-185).

**Incomplete**

- The permanent purge of chats after 30 days only runs when SOFT_DELETED_RESOURCE_PURGE_ENABLED is true; the route returns 'Soft-deleted resource purge is disabled' otherwise (apps/web/app/api/cron/purge-soft-deleted-resources/route.ts:14-17, :27-30). Project documents say production does not set it (doc: docs/security/security.md:1184; docs/compliance/soc2-controls.json:652). So today deleted chats are not purged on schedule, while the privacy page says a daily job deletes them (apps/web/app/privacy/page.tsx:734).
- Mobile cannot list or restore Recently deleted chats; it points to the web (apps/mobile/app/(app)/settings/archived-chats.tsx:339, :369).
- CLI: no cloud delete-all and no cloud archived list; its archived listing is of local session files (apps/cli/src/lib.rs:5588-5600).
- VS Code: archived list is the local runtime's threads, not cloud chats (apps/extension-vscode/src/features/trees/conversationTreeProvider.ts:117-145). Whether its Delete is permanent is unknown.

**Present but disconnected or switched off**

- The soft-delete purge cron is scheduled daily at 04:10 but switched off by default (vercel.json:86-87; route.ts:14-17).

**Not available**

- Chrome extension: archived chats and delete all (no code found; brief says missing).
- CLI: delete all chats in the account (brief says missing; no bulk command found in apps/cli/src/lib.rs).

## 4. Required behaviour

**Established requirements**

- The user can list archived chats, restore them and delete them (web, desktop, mobile, CLI, VS Code done; Chrome missing). (source: S85.17 (brief))
- One action deletes every chat (active and archived) after confirmation, and the copy states truthfully whether they can be restored (web, desktop, mobile done; CLI, Chrome missing). (source: S85.18 (brief))
- Delete all uses a soft delete: rows get deleted_at set and are kept for restore. (source: S85.18 (brief); apps/web/app/api/chat/conversations/bulk/route.ts:58-71)
- A deleted chat can be restored for 30 days, then it is permanently deleted with its messages and search index. (source: apps/web/app/privacy/page.tsx:734; apps/web/lib/resources/deletion-policies.ts:8)
- An action a user cannot undo asks first and names the consequence; a chat or session is archived or moved to Recently deleted rather than destroyed. (source: AGENTS.md section 9 (doc: AGENTS.md))

**Acceptance criteria**

1. Delete all on Web with N active and M archived chats in the workspace marks N+M rows deleted_at, returns affectedCount N+M and leaves other workspaces untouched.
2. After Delete all, every deleted chat appears in Recently deleted and Restore brings it back with archived and pinned state unchanged.
3. A chat deleted more than 30 days ago is not restorable (restore returns not found) and, once the purge flag is on, its rows are removed.
4. Delete all is refused or disabled while a reply is streaming and shows 'Finish or stop active replies before deleting all chats.'
5. Deleting a chat that has a share link makes the link stop working.
6. Mobile Delete all cloud chats needs two confirmations and the first one says Web can restore for 30 days.
7. Mobile Delete all local chats removes only Local-mode chats and says it cannot be undone.
8. Cancelling any confirmation changes nothing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop (Electron) behaves exactly as Web because it displays the hosted web app (AGENTS.md section 5) [inferred].
- The purge job should be enabled in production for the 30-day promise on the privacy page to be true [inferred from docs/security/security.md:1184 and apps/web/app/privacy/page.tsx:734].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show Recently deleted on Mobile so restore does not need the web.
- [proposed] Add `agi chats delete-all` for cloud chats with the same confirmation and soft delete.
- [proposed] Turn on SOFT_DELETED_RESOURCE_PURGE_ENABLED or change the copy until it is on.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/chat/conversations/bulk | `apps/web/app/api/chat/conversations/bulk/route.ts` | Soft-deletes or archives all chats of the user in the workspace; revokes shares and published pages in the same transaction. |
| endpoint | GET /api/chat/conversations?archived=only/deleted=only | `apps/web/app/api/chat/conversations/route.ts` | Lists archived and recently deleted chats (deleted filter at lines 57-85). |
| endpoint | POST /api/chat/conversations/[id]/restore | `apps/web/app/api/chat/conversations/[id]/restore/route.ts` | Clears deleted_at inside the 30-day window. |
| endpoint | PUT/DELETE /api/chat/conversations/[id] | `apps/web/app/api/chat/conversations/[id]/route.ts` | Archive toggle and single-chat soft delete with share revocation. |
| service | conversation-data-service | `apps/web/features/settings/services/conversation-data-service.ts` | Web client for list, restore, delete, history stats and bulk actions. |
| component | ArchivedChatsSection | `apps/web/features/settings/sections/ArchivedChatsSection.tsx` | Archived chats page with Restore, Delete and Delete all archived. |
| component | DeletedChatsSection | `apps/web/features/settings/sections/DeletedChatsSection.tsx` | Recently deleted page (registered as section deleted-chats in apps/web/features/settings/components/WebSettingsModal.tsx:288). |
| component | BulkConversationControls | `apps/web/features/settings/components/BulkConversationControls.tsx` | Archive all and Delete all rows, count lookup, confirmation, streaming guard. |
| hook | useManagedChatList | `apps/web/features/settings/hooks/useManagedChatList.ts` | State machine for the archived and deleted lists, with workspace and session ownership checks. |
| service | lifecycle-sql / deletion-policies | `apps/web/lib/resources/lifecycle-sql.ts` | Defines the recoverable window (30 days) used by list and restore SQL; policies in apps/web/lib/resources/deletion-policies.ts. |
| service | shared-session-revocation | `apps/web/lib/services/shared-session-revocation.ts` | Deletes shared_sessions rows of deleted chats. |
| job | purge-soft-deleted-resources cron | `apps/web/app/api/cron/purge-soft-deleted-resources/route.ts` | Daily hard delete after the window; off unless SOFT_DELETED_RESOURCE_PURGE_ENABLED is true. Schedule in vercel.json:86-87. |
| table | web_conversations | `apps/web/lib/resources/deletion-policies.ts` | Holds deleted_at and archived columns; children web_messages and web_artifacts cascade. |
| service | mobile archived-chats service | `apps/mobile/src/features/archived-chats/service.ts` | Mobile calls to list, restore, delete and bulk endpoints. |
| screen | Mobile Archived Chats | `apps/mobile/app/(app)/settings/archived-chats.tsx` | Mobile archived list and Delete all archived. |
| screen | Mobile data controls | `apps/mobile/src/features/settings/data-controls/index.tsx` | Archive all, Delete all cloud chats, Delete all local chats. |
| service | deleteLocalChats | `apps/mobile/src/features/settings/data-controls/deleteLocalChats.ts` | Deletes Local-mode chats on the phone. |
| command | agi session list/archive/unarchive/delete | `apps/cli/src/lib.rs` | Local session archive management (lines 5588-5790). |
| component | VS Code archived session picker | `apps/extension-vscode/src/features/trees/sessionPickers.ts` | Quick pick with Restore, Delete, Restore all. |
| component | ConversationTreeProvider | `apps/extension-vscode/src/features/trees/conversationTreeProvider.ts` | Lists local runtime threads in the tree. |
| test | bulk route test | `apps/web/app/api/chat/conversations/bulk/route.test.ts` | Route-level tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Delete all; the browser asks the server for chat counts. | our servers | apps/web/features/settings/services/conversation-data-service.ts:219-239 |
| Person confirms; the browser posts {action:'delete_all'} with a CSRF token. | device and our servers | conversation-data-service.ts:241-263 |
| Server checks CSRF and rate limit, soft-deletes rows, revokes share rows and published pages in one transaction. | our servers | apps/web/app/api/chat/conversations/bulk/route.ts:36-40, :88-103 |
| Server tries to release each chat's code sandbox; failures are only logged. | outside service | route.ts:119-131 |
| Browser updates its sidebar store for the chats that existed at dispatch and returns to /chat. | device | BulkConversationControls.tsx:279-287 |
| Restore posts to the restore route, which clears deleted_at when still inside 30 days. | our servers | apps/web/app/api/chat/conversations/[id]/restore/route.ts:36-50 |
| Daily cron hard-deletes rows past the window, unless a legal hold covers them or the purge flag is off. | our servers | apps/web/app/api/cron/purge-soft-deleted-resources/route.ts:14-35; apps/web/lib/resources/purge-soft-deleted.ts:118-155 |
| Mobile Local delete runs only against the on-device chat store; no network call. | device | apps/mobile/src/features/settings/data-controls/deleteLocalChats.ts:11-24 |
| CLI archive and delete act on session files in the user config folder. | device | apps/cli/src/lib.rs:5588-5600, :5760-5790 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cloud chat rows and messages (deleted_at, archived flags) | table web_conversations, web_messages on our servers | Yes, across every device on the same account | Soft-deleted for 30 days; hard purge by daily cron only if its flag is on (apps/web/app/api/cron/purge-soft-deleted-resources/route.ts:14-17) |
| Share links and published pages of deleted chats | tables shared_sessions and published_artifacts | Server only | Removed at delete time (bulk/route.ts:94-102) |
| Memories learned from deleted chats | memory store | Yes | Kept; the copy says so (BulkConversationControls.tsx:59) |
| Mobile Local chats | phone database and local chat store | No | Deleted at once, no recovery (data-controls/index.tsx:372) |
| CLI sessions | session files on the computer | No evidence of sync for these files | Archive keeps file; delete removes it after confirmation (apps/cli/src/lib.rs:5790-5800) |

**Models and providers.** No model or provider takes part. The actions are database and file operations.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud actions need a signed-in account (Clerk identity); the bulk route resolves the user and workspace from the request (apps/web/app/api/chat/conversations/bulk/route.ts:34). CLI session archive and VS Code archived sessions need no account (local files and runtime). |
| Permissions | The action acts on the caller's own chats in the active workspace only (route.ts:66-68 filter on user_id and organization_id). CSRF token required (route.ts:36). |
| Subscription | none found in the code. No plan check in the bulk, restore or list routes. |
| Limits and metering | Rate limit bucket 'chat-conversation' per user on the bulk route (route.ts:39). No credit use. |
| Feature flags | SOFT_DELETED_RESOURCE_PURGE_ENABLED controls the 30-day purge (apps/web/app/api/cron/purge-soft-deleted-resources/route.ts:14-17). Mobile requires Cloud unlock (cloudUnlocked) for cloud bulk actions (data-controls/index.tsx:255-275). |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local mode: Delete all local chats works with no sign-in and no payment and deletes only Local chats; the cloud bulk buttons say to switch to AGI Cloud (data-controls/index.tsx:244, :365-395). CLI sessions and VS Code archived sessions are local and need no subscription. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading archived list | Shows 'Loading archived chats…' (ArchivedChatsSection.tsx:119). | apps/web/features/settings/sections/ArchivedChatsSection.tsx:117-120 |
| Empty archived list | Shows 'No archived chats' and 'Chats you archive will appear here.' | ArchivedChatsSection.tsx:130-138 |
| List load failure | Shows an alert with Retry and a note that failure is not the same as none. | ArchivedChatsSection.tsx:94-101, :121-129 |
| Reply streaming | Delete all and per-row Delete are disabled; text says to finish or stop replies. | ArchivedChatsSection.tsx:187, :219, :228-231; BulkConversationControls.tsx:79, :208-212 |
| Cancel | Cancel returns to idle with no write. | BulkConversationControls.tsx:255-257 |
| Network or server error after dispatch | Says it could not confirm and asks the person to check history before trying again; no automatic retry. | BulkConversationControls.tsx:305-311 |
| Workspace or account switch mid-action | The request authority is retired and stale results are dropped. | BulkConversationControls.tsx:173-194; apps/web/features/settings/hooks/useManagedChatList.ts:57-80 |
| Restore after 30 days | Restore returns not found (restorable scope excludes it). | restore/route.ts:36-50, :56-58 |
| Mobile signed out or not in Cloud mode | Alert tells the person to switch chat to AGI Cloud. | apps/mobile/src/features/settings/data-controls/index.tsx:244 |
| Offline | not handled in the code as a distinct state for the web bulk action beyond the generic failure messages. | BulkConversationControls.tsx:301-313 |
| Accessibility | Errors use role=alert and notices role=status on Web; Mobile buttons carry accessibilityLabel. | BulkConversationControls.tsx:350; data-controls/index.tsx:460, :524 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/chat/conversations/bulk/route.test.ts`: Bulk route actions and responses.
- `apps/web/app/api/chat/conversations/[id]/restore/route.test.ts`: Restore route.
- `apps/web/app/api/chat/conversations/route.archived-filter.test.ts`: archived and deleted list filters.
- `apps/web/features/settings/components/BulkConversationControls.test.tsx`: Web bulk controls and confirmation.
- `apps/web/features/settings/hooks/useManagedChatList.test.tsx`: Archived and deleted list state machine.
- `apps/web/features/settings/hooks/useManagedChatList.identity.test.tsx`: Ownership across account and workspace changes.
- `apps/web/lib/resources/__tests__/deletion-semantics.test.ts`: Recoverable-scope SQL and deletion policies.
- `apps/web/lib/resources/__tests__/purge-soft-deleted.test.ts`: Purge behaviour.
- `apps/web/app/api/cron/purge-soft-deleted-resources/route.test.ts`: Purge route and its flag.
- `apps/mobile/__tests__/ArchivedChatsScreen.test.tsx`: Mobile archived chats screen.
- `apps/mobile/__tests__/DataControlsBulkChats.test.tsx`: Mobile bulk archive and delete confirmations.
- `apps/mobile/__tests__/DataControlsLocalChats.test.tsx`: Mobile Delete all local chats.

**Test scenarios**

- **Delete all then restore (Web)**
  1. Create 3 chats and archive one.
  2. Settings > Privacy > Delete all > confirm.
  3. Open Recently deleted and Restore one chat.
  - Expected: 3 rows get deleted_at; restored chat returns to its previous place and archived state; the dialog copy mentioned 30 days.
- **Streaming guard**
  1. Start a long reply.
  2. Open Settings > Privacy and look at Delete all.
  - Expected: Button disabled; message 'Finish or stop active replies before deleting all chats.'
- **Share link dies with chat**
  1. Share a chat and note the URL.
  2. Delete all chats.
  3. Open the URL signed out.
  - Expected: The link no longer shows the chat; shared_sessions row gone.
- **Window expiry**
  1. Set a test row's deleted_at to 31 days ago.
  2. Call restore.
  - Expected: 404 not found. With the purge flag on and the cron run, the row is removed.
- **Mobile two-step delete**
  1. Switch to Cloud mode.
  2. Tap Delete all cloud chats.
  3. Confirm both alerts.
  - Expected: Alert 'Chats deleted' with the count; chat list refreshes empty.
- **Mobile Local wipe of chats**
  1. Switch to Local mode with 2 local chats.
  2. Tap Delete all local chats and confirm.
  - Expected: '2 chats deleted from this device.'; memory and settings remain.

**Where to look when it fails**

- Server log 'Failed to apply bulk conversation action' (bulk/route.ts:115).
- Log '[e2b] failed to release sandbox after bulk conversation delete' (route.ts:125).
- Log events soft_deleted_resources_purge_disabled and soft_deleted_resources_purged from the purge cron.
- Table web_conversations deleted_at column; table shared_sessions.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/085-personalization-and-data-settings.md](../../70-qa/test-plans/web/085-personalization-and-data-settings.md)
- Desktop: [70-qa/test-plans/desktop/085-personalization-and-data-settings.md](../../70-qa/test-plans/desktop/085-personalization-and-data-settings.md)
- Mobile: [70-qa/test-plans/mobile/085-personalization-and-data-settings.md](../../70-qa/test-plans/mobile/085-personalization-and-data-settings.md)
- CLI: [70-qa/test-plans/cli/085-personalization-and-data-settings.md](../../70-qa/test-plans/cli/085-personalization-and-data-settings.md)
- VS Code: [70-qa/test-plans/vscode/085-personalization-and-data-settings.md](../../70-qa/test-plans/vscode/085-personalization-and-data-settings.md)

## 10. Gaps and dependencies

- **The 30-day purge is switched off by default, so deleted chats are not permanently removed on schedule.** Affects: All Cloud users on Web, Desktop, Mobile; the privacy promise.. Evidence: apps/web/app/api/cron/purge-soft-deleted-resources/route.ts:14-17; docs/security/security.md:1184; apps/web/app/privacy/page.tsx:734. Work needed: Owner decision to set the flag in production, or change the public copy.
- **Mobile has no Recently deleted view; people must use the web.** Affects: Mobile Cloud users.. Evidence: apps/mobile/app/(app)/settings/archived-chats.tsx:339, :369. Work needed: Add a deleted list and restore using the same endpoints.
- **CLI has no cloud delete-all or cloud archived list; its archived list is local sessions.** Affects: CLI users.. Evidence: apps/cli/src/lib.rs:5588-5600. Work needed: Decide whether CLI should manage cloud chats; add commands and confirmation.
- **Chrome extension has no archive or delete-all control.** Affects: Chrome users.. Evidence: Brief S85.17 and S85.18 status missing; no code found.. Work needed: Decide scope; link to web settings or add controls.
- **Deleting chats does not remove memories derived from them; the copy says so, but there is no one-click path.** Affects: Privacy-minded users on all Cloud apps.. Evidence: BulkConversationControls.tsx:59. Work needed: Optional: offer a combined delete.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-sync-and-continuity
- SYS-security-and-privacy
- SYS-observability-and-operations
- table:web_conversations
- table:shared_sessions
- api:POST /api/chat/conversations/bulk
- api:POST /api/chat/conversations/[id]/restore
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- F085-08

## Unknown

- Whether VS Code archived Delete is permanent (the runtime method was not read).
- Whether Mobile Cloud bulk actions target the personal workspace only or the active workspace.
- Whether production currently has SOFT_DELETED_RESOURCE_PURGE_ENABLED set; documents say it does not, no deployment was checked.
- Whether the POST restore and bulk routes are exercised by any browser test; only unit tests were listed.
