---
id: "F010-03"
type: "feature"
title: "Archive and delete"
aliases: ["Archive", "Unarchive", "Delete conversation", "Delete project", "Permanently delete", "Recently deleted", "S10.05", "S10.06", "S10.07"]
area: "10 Modal and dialog inventory"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S10.05", "S10.06", "S10.07"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "api:DELETE /api/chat/conversations/[id]", "api:PATCH /api/chat/conversations/[id]", "api:DELETE /api/projects/[id]", "table:web_conversations", "table:user_projects", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-sync-and-continuity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F010-03 Archive and delete

Hides a chat in Archived with Undo, or removes a chat or project after a confirmation that names it. Delete on web and mobile Cloud is a soft delete, restorable for 30 days from Recently deleted. A separate permanent-delete command with its own modal exists only for VS Code sessions; CLI uses one confirm.

Area: [10. Modal and dialog inventory](README.md). Requirement items: [S10.05](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1005), [S10.06](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1006), [S10.07](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1007).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Archive moves a chat out of the main list and offers Undo and a way to see archived chats. Delete asks first, naming the item and the consequence, then removes it. Project delete moves its chats out and deletes its source files.

**Why it exists.** People tidy their lists but must not lose data by accident. The brief requires confirmation or undo, a named item, and plain wording about what cannot be undone (doc: knowledge-base/data/area-briefs/010-modal-and-dialog-inventory.md, S10.05 to S10.07). AGENTS.md section 9 requires a named consequence and a Trash or archive step before permanent removal (doc: AGENTS.md).

**Who uses it.** All signed-in users on web, Electron desktop, mobile, Chrome, CLI and VS Code.

**Problems it solves**

- Cluttered chat lists.
- Accidental deletion.
- Leftover project files after a project is dropped.

**Use cases**

- Archive a finished chat on web and tap Undo in the toast.
- Delete a chat from the sidebar menu and confirm the named dialog.
- Delete a project and be told its source files are removed.
- Run agi session delete <id> and confirm the prompt.

## 2. User experience

**Where to find it**

- Web sidebar row menu and chat title menu: 'Archive' or 'Unarchive', and 'Delete' (packages/ui/ui/src/sidebar/SessionItem.tsx:378-401; apps/web/features/chat/components/ConversationTitleMenu.tsx:205-225).
- Web settings: Archived chats and 'Recently deleted' with 'Restore' (apps/web/features/settings/sections/DeletedChatsSection.tsx:57-153).
- Mobile: long-press a chat, action sheet items 'Archive' (Cloud chats only) and 'Delete' (apps/mobile/src/features/conversation-actions/useConversationActions.ts:300-330). Archived chats live in Settings, Archived chats.
- Mobile projects: action sheet 'Archive', 'Restore', 'Delete' (apps/mobile/src/features/projects/useProjectActions.ts:115-165).
- CLI: agi session archive|unarchive|delete <id>, agi projects archive|delete, agi history delete <id> (apps/cli/src/lib.rs:5765-5820,3580-3632,4074-4090).
- VS Code: 'Code: Archive Conversation' (command deleteConversation) and 'Code: Permanently Delete Conversation' (apps/extension-vscode/package.json:200-208; apps/extension-vscode/src/core/commandSetup.ts:1402-1450).
- Chrome: recent chats menu 'Archive' with a confirmation, and 'Delete chat' with a confirmation (apps/extension/src/side_panel.ts:12395-12425, 12753; _locales spHistoryArchiveConfirm, spHistoryDeleteConfirmDevice, spHistoryDeleteConfirmAccount).

**Before you start**

- A chat or project to act on.
- Mobile Archive needs a Cloud chat; Local chats have no archive (useConversationActions.ts:78-82).
- Chrome cannot delete the open chat while an answer is streaming (apps/extension/src/side_panel.ts:12625-12635).

**Screens and controls**

- Web delete dialog: title 'Delete conversation?', body names the chat in quotes (or 'This conversation'), confirm button 'Delete conversation' (apps/web/shared/components/layout/sidebar-session-actions.ts:100-110).
- Web project delete: title 'Delete project?', confirm 'Delete project' (sidebar-session-actions.ts:118-128; ProjectSettingsDialog.tsx:226-233).
- Web archive toast 'Chat archived' with Undo and View archived (sidebar-session-actions.ts:62-80).
- Mobile alert 'Delete chat?' with Cancel and Delete; project alert 'Delete project?' (useConversationActions.ts:300-325; useProjectActions.ts:140-160).
- CLI prompts with y/N, or --yes to skip (apps/cli/src/lib.rs:2580-2596).
- Chrome inline confirmation row with an action button (side_panel.ts:12395-12425).

**Journey**

1. 1. Person opens the row or chat menu.
2. 2. Archive: takes effect at once on web, with a toast offering Undo and View archived; on mobile it hides the row after the server accepts and shows 'Chat archived. Find it in Settings, Archived chats.' with Undo.
3. 3. Delete: a dialog names the item and the consequence.
4. 4. Person confirms with the red button or cancels.
5. 5. The row disappears; on failure it stays and an error shows.

**What the person sees and gets**

- Web toast 'Chat archived' with Undo and View archived; failure toasts such as 'Could not delete this conversation' (sidebar-session-actions.ts:18-80).
- Mobile toast 'Chat archived. Find it in Settings, Archived chats.' with Undo; 'Deleting chat…' and 'Chat deleted' for Cloud chats; alerts on failure (useConversationActions.ts:100-160,318-324).
- CLI lines 'archive:', 'delete:' and 'Aborted. Session ... was not deleted.' (apps/cli/src/lib.rs:5765-5820).
- Chrome status 'Chat deleted.' (apps/extension/_locales/en/messages.json spHistoryDeleted).

**Settings**

- Settings, Archived chats and Settings, Privacy, Recently deleted on web (BulkConversationControls.tsx:40-62; DeletedChatsSection.tsx:57-60).
- Retention window of 30 days is stated in the UI text (DeletedChatsSection.tsx:60); the setting that drives it: unknown.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web delete confirm copy is written from checked server behaviour: the chat is stamped deleted_at, messages go with it, generated images and videos stay in the Library (sidebar-session-actions.ts:84-110; apps/web/app/api/chat/conversations/[id]/route.ts:38-50).
- Web delete is soft: Settings shows 'Deleted chats stay here for 30 days. Restoring puts one back where it was.' (DeletedChatsSection.tsx:60). A restore route exists (apps/web/app/api/chat/conversations/[id]/restore/route.ts).
- Web archive: toggleConversationArchive runs the action, shows toast with Undo that also restores the pin, and a 'View archived' action (sidebar-session-actions.ts:56-80).
- Web project delete confirm names the project, says files added as sources are deleted and chats move to All Chats, and says it cannot be undone (sidebar-session-actions.ts:118-128). The server stamps deleted_at on the project and erases source bytes (sidebar-session-actions.ts:112-117 comment); a test named delete-purges-knowledge-files exists.
- Web bulk 'Archive all' and 'Delete all chats' have confirmation text that names the 30-day restore window (apps/web/features/settings/components/BulkConversationControls.tsx:40-62).
- Mobile archive waits for the server before hiding the row, offers Undo that restores pin and messages, and shows an alert on failure (useConversationActions.ts:100-160).
- Mobile delete alert distinguishes Cloud ('removed from every device; restore it from Recently deleted on the web') and Local ('deleted from this device and cannot be restored') (useConversationActions.ts:300-315).
- CLI session delete confirms with 'Permanently delete session ... This cannot be undone.' and refuses non-interactive deletion without --force (apps/cli/src/lib.rs:5786-5820). Project delete says its files go with it and it cannot be undone (lib.rs:3580-3600).
- VS Code archive uses a modal; permanent delete is a separate command with a modal that says 'This cannot be undone. Archive the session instead to keep it.' and a 'Delete Permanently' button (commandSetup.ts:1402-1450).
- Chrome delete asks, deletes from the account queue when the chat is mirrored, and reports 'Chat deleted.' (side_panel.ts:12595-12670).

**Incomplete**

- No path read has a separate second confirmation for permanent delete. Each flow has one confirm. VS Code has a separate permanent command with its own modal; CLI uses one prompt (see gaps).
- Web delete copy says 'This cannot be undone' while the same chat can be restored from Recently deleted for 30 days (sidebar-session-actions.ts:100-110 against DeletedChatsSection.tsx:60). Mobile Cloud copy says it can be restored from the web.
- Mobile project Cloud delete says it cannot be restored from the app (useProjectActions.ts:145-150).
- Mobile Archive hides on Local chats (useConversationActions.ts:78-82).

**Present but disconnected or switched off**

- Desktop internal Tauri ConversationRow has its own confirm with 'Delete this archived chat permanently?' for archived chats (apps/desktop/src/features/v3/ConversationRow.tsx:170-177); not the public window.

**Not available**

- A distinct permanent-delete (purge) action for a web chat, beyond the soft delete, was not found in the web files searched; a retention cron route exists but was not read (apps/web/app/api/cron/enforce-billing-retention/route.ts).
- Chrome: no standalone archive-undo toast was found; a confirmation precedes archive instead.

## 4. Required behaviour

**Established requirements**

- Archiving asks to confirm, or confirms afterwards with a way to undo, and says where archived items can be found. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.05)
- Deleting asks for confirmation that names the item before anything is removed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.06)
- An irreversible delete says plainly that it cannot be undone and needs an explicit second confirmation. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.07)
- An action a user cannot undo asks first and the question names the consequence; an agent never destroys data on its own; chats are archived or moved to Recently deleted; permanent removal needs an explicit user action naming what is lost. (source: (doc: AGENTS.md section 9))
- Chat lifecycle: archive, restore and delete preserve lineage after reload; failed persistence is visible and recoverable. (source: (doc: docs/product/experience-contract.md, row W02))

**Acceptance criteria**

1. Delete never starts without a dialog that names the chat or project, with a plain fallback phrase when untitled.
2. Cancel leaves the item untouched.
3. Archive hides the chat, shows Undo and a way to open archived chats, and Undo restores the chat (and its pin).
4. Deleting a project moves its chats to All Chats and removes its source files, and the copy says so.
5. On failure the row stays and an error is shown.
6. Deleted web chats appear in Recently deleted and Restore puts them back within 30 days.
7. Wording of every delete states the real recoverability (soft or permanent) accurately.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because web delete is soft, a second confirmation is only needed for a true purge, which was not found [inferred from DELETE_CONVERSATION_SQL and DeletedChatsSection.tsx:60].
- The web 'cannot be undone' wording conflicts with the 30-day restore window [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Align web delete copy with the 30-day restore window, or add a distinct 'Delete forever' action in Recently deleted with a typed or second confirm.
- [proposed] Give CLI and mobile Local deletes a Trash step as AGENTS.md section 9 asks.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | sidebar-session-actions | `apps/web/shared/components/layout/sidebar-session-actions.ts` | Delete copy, archive toast with Undo, failure toasts |
| component | WebAppShell | `apps/web/shared/components/layout/WebAppShell.tsx` | handleDeleteSession, handleArchiveSession, handleProjectDelete using confirmDestructive |
| screen | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Same delete and archive wiring in the chat shell |
| component | SessionItem | `packages/ui/ui/src/sidebar/SessionItem.tsx` | Row menu Archive and Delete items |
| component | ConversationTitleMenu | `apps/web/features/chat/components/ConversationTitleMenu.tsx` | Archive/Unarchive and Delete in the title menu |
| endpoint | DELETE /api/chat/conversations/[id] | `apps/web/app/api/chat/conversations/[id]/route.ts` | Soft delete by deleted_at and clearing compaction summary |
| endpoint | POST /api/chat/conversations/[id]/restore | `apps/web/app/api/chat/conversations/[id]/restore/route.ts` | Restores a deleted conversation (route file exists; method not read) |
| component | DeletedChatsSection | `apps/web/features/settings/sections/DeletedChatsSection.tsx` | Recently deleted list and Restore |
| component | BulkConversationControls | `apps/web/features/settings/components/BulkConversationControls.tsx` | Archive all and Delete all chats with confirm |
| component | ProjectSettingsDialog | `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | Project delete confirm via useConfirmAction |
| endpoint | DELETE /api/projects/[id] | `apps/web/app/api/projects/[id]/route.ts` | Project soft delete and source erasure (route file exists; handler read through comments only) |
| hook | useConversationActions | `apps/mobile/src/features/conversation-actions/useConversationActions.ts` | Mobile archive, undo, delete alerts |
| hook | useProjectActions | `apps/mobile/src/features/projects/useProjectActions.ts` | Mobile project archive, restore, delete alert |
| command | agi session archive/delete | `apps/cli/src/lib.rs` | CLI session archive and permanent delete with confirm |
| command | agi projects delete/archive | `apps/cli/src/lib.rs` | CLI project delete with consequence prompt and archive |
| command | agi-workforce.deleteConversation and permanentlyDeleteConversation | `apps/extension-vscode/src/core/commandSetup.ts` | VS Code archive and permanent delete modals |
| component | Chrome history confirm rows | `apps/extension/src/side_panel.ts` | confirmHistoryArchive and deleteHistoryEntry |
| table | web_conversations | `apps/web/app/api/chat/conversations/[id]/route.ts` | archived and deleted_at columns |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person chooses Delete; the shell opens the named confirmation dialog. | device | apps/web/shared/components/layout/WebAppShell.tsx:295-306 |
| On confirm the client calls deleteConversation; the server sets deleted_at, clears the cached compaction summary and returns. | our servers | apps/web/app/api/chat/conversations/[id]/route.ts:38-50 |
| A false result produces a toast 'Could not delete this conversation' and the row stays. | device | sidebar-session-actions.ts:18-42 |
| Archive writes archived=true through PATCH; the toast offers Undo that restores and re-pins. | device and our servers | sidebar-session-actions.ts:56-80; route.ts:301-302 |
| CLI session delete resolves the id, confirms, then removes the local session files. | device | apps/cli/src/lib.rs:5786-5820 |
| Chrome delete queues an account deletion message to the background worker and deletes the local copy. | device and our servers | apps/extension/src/side_panel.ts:12620-12650 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Deleted conversation (messages kept for restore) | web_conversations with deleted_at | Yes across clients | Shown in Recently deleted for 30 days (apps/web/features/settings/sections/DeletedChatsSection.tsx:60); final purge job: unknown |
| Generated images and videos from the chat | media_assets (conversation_id set null) | Yes | Survive the chat (sidebar-session-actions.ts:84-98 comment) |
| Project and source files | user_projects and knowledge storage | Yes | Project row retained with deleted_at, source bytes erased (sidebar-session-actions.ts:112-117 comment) |
| CLI session | local managed session store | No | Removed on permanent delete; archived kept on disk (lib.rs:1959) |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud archive and delete need sign-in. CLI session and VS Code session actions work on local data. |
| Permissions | Owner-scoped queries (user_id, organization_id) in the delete SQL (route.ts:38-50). |
| Subscription | none found in the code |
| Limits and metering | Rate limits on conversation routes: not read for delete. Others: none found. |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Mobile Local chats can be deleted from the device with an irreversible warning and cannot be archived (useConversationActions.ts:78-82,300-315). CLI sessions are local by nature. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Untitled item | Dialog falls back to 'This conversation' or 'This project'. | sidebar-session-actions.ts:96-100 |
| Delete fails | Row stays; web toast, mobile no explicit alert for failed delete was seen. | sidebar-session-actions.ts:18-42; useConversationActions.ts:318-324 |
| Archive fails (mobile) | Alert 'Could not archive'; row stays visible. | useConversationActions.ts:150-155 |
| Undo after archive fails (mobile) | Alert 'Could not unarchive'. | useConversationActions.ts:135-146 |
| Non-interactive CLI delete | Refused with a message to pass --force or --yes. | apps/cli/src/lib.rs:2584-2596,5792-5798 |
| Deleting the open chat | Web resets to the root route; Chrome refuses while streaming and cancels the stream otherwise. | WebChatPage.tsx:4821-4835; side_panel.ts:12625-12635 |
| Delete all chats | Confirmation names the 30-day restore window. | BulkConversationControls.tsx:55-61 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- apps/web/shared/components/layout/__tests__/sidebar-session-actions.test.ts (not found) (not found): Delete copy and archive helper (inferred from file name)
- `apps/web/app/api/chat/conversations/[id]/route.delete.test.ts`: Conversation DELETE route (inferred)
- `apps/web/app/api/projects/[id]/__tests__/delete-purges-knowledge-files.test.ts`: Project delete purges knowledge files (inferred from file name)
- `apps/web/features/settings/sections/ConversationDataSections.test.tsx`: Archived and deleted chat sections (inferred)
- `apps/mobile/__tests__/ArchivedChatsScreen.test.tsx`: Mobile archived chats screen (inferred)
- `apps/mobile/__tests__/ArchiveUndoKeepsMessages.test.ts`: Undo keeps messages after archive (inferred)
- `apps/desktop/src/features/v3/__tests__/ConversationRow.exportDelete.test.tsx`: Internal desktop row delete confirm (inferred)
- `apps/cli/src/lib.rs`: Inline tests for confirm_destructive_when (lib.rs:9929-9937) and projects delete --yes parsing (lib.rs:10118-10127)

**Test scenarios**

- **Delete and restore a chat on web**
  1. Delete a titled chat from the sidebar and read the dialog.
  2. Confirm.
  3. Open Settings, Recently deleted, press Restore.
  - Expected: Dialog names the chat; it leaves the list; Restore brings it back.
- **Cancel delete**
  1. Open the delete dialog.
  2. Cancel.
  - Expected: Nothing changes.
- **Archive with Undo**
  1. Archive a pinned chat.
  2. Press Undo in the toast.
  - Expected: Chat returns with its pin.
- **Delete a project**
  1. Open project delete.
  2. Read copy; confirm.
  - Expected: Copy states chats move to All Chats and sources are deleted; chats are still listed; sources gone.
- **Failure path**
  1. Go offline.
  2. Delete a chat.
  - Expected: Row stays, error toast shows.
- **CLI permanent delete**
  1. Run agi session delete <id> in a terminal; answer n.
  2. Run non-interactively without --force.
  - Expected: Aborted with no deletion; second run refuses.

**Where to look when it fails**

- Toasts 'Could not delete this conversation' and 'Could not archive this conversation'.
- web_conversations.deleted_at and archived.
- CLI messages 'Nothing was deleted: this run cannot ask for confirmation.'
- Chrome status strings spHistoryDeleteFailed and spHistoryDeleted.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/web/010-modal-and-dialog-inventory.md)
- Desktop: [70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md)
- Mobile: [70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md)
- CLI: [70-qa/test-plans/cli/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/cli/010-modal-and-dialog-inventory.md)
- VS Code: [70-qa/test-plans/vscode/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/vscode/010-modal-and-dialog-inventory.md)
- Chrome: [70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md)

## 10. Gaps and dependencies

- **No second explicit confirmation exists for any permanent delete path read; the brief expects one.** Affects: All apps. Evidence: sidebar-session-actions.ts:100-110; apps/cli/src/lib.rs:5800-5812; commandSetup.ts:1426-1450. Work needed: Decide the real model (soft delete only vs true purge) and add a second confirm where purge exists.
- **Web delete copy says it cannot be undone while the chat is restorable for 30 days; mobile Cloud copy says it is restorable.** Affects: Web and desktop (Electron) users. Evidence: sidebar-session-actions.ts:100-110; DeletedChatsSection.tsx:60. Work needed: Make copy match the soft-delete behaviour.
- **CLI and local mobile deletes remove data without a Trash step.** Affects: CLI, mobile Local. Evidence: apps/cli/src/lib.rs:5814-5818; useConversationActions.ts:310-315; doc: AGENTS.md section 9. Work needed: Route removals through a recoverable step.
- **Chrome has no Undo toast on archive (confirmation first instead) and brief marks Chrome archive missing though it exists.** Affects: Chrome. Evidence: apps/extension/src/side_panel.ts:12400-12425. Work needed: Update the brief; optionally add undo.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- api:DELETE /api/chat/conversations/[id]
- api:PATCH /api/chat/conversations/[id]
- api:DELETE /api/projects/[id]
- table:web_conversations
- table:user_projects
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-sync-and-continuity

## Unknown

- Whether any job purges deleted chats after 30 days (retention cron not read).
- Whether any web or mobile path performs a true permanent delete with a second confirm.
- Method of web project delete handler body (comments in sidebar-session-actions.ts describe it; route not read).
- Test contents (only names seen).
- Whether mobile shows an alert when a Cloud chat delete fails.
