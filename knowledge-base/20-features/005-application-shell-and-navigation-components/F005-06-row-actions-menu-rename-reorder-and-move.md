---
id: "F005-06"
type: "feature"
title: "Row actions: menu, rename, reorder and move"
aliases: ["Row menu", "More options", "Rename conversation", "Move to project", "Conversation actions", "Overflow menu", "S5.20 S5.21 S5.22 S5.23"]
area: "5 Application shell and navigation components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S5.20", "S5.21", "S5.22", "S5.23"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:cloud", "api:PUT /api/chat/conversations/[id]", "api:DELETE /api/chat/conversations/[id]", "SYS-security-and-privacy", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "F005-04", "F005-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F005-06 Row actions: menu, rename, reorder and move

The actions menu on each chat row: Share, Rename, Pin, Mark as unread, Archive, Delete and Move to project. Rename can also be done in place (double-click). Delete asks first. Dragging to reorder or to move into a project is not built on any app. Mobile opens the menu by long press or a button; VS Code has no row menu.

Area: [5. Application shell and navigation components](README.md). Requirement items: [S5.20](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s520), [S5.21](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s521), [S5.22](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s522), [S5.23](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s523).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Offers per-chat actions from a three-dot menu, renames in place, and moves a chat into a project through a sub-menu. (packages/ui/ui/src/sidebar/SessionItem.tsx:285-415)

**Why it exists.** Chats need tidying: pin the useful ones, archive the done ones, delete the unwanted, group them under projects.

**Who uses it.** Anyone managing a chat list.

**Problems it solves**

- Cluttered recents.
- Wrong titles.
- Chats outside their project.

**Use cases**

- Rename an auto-titled chat.
- Pin a chat.
- Move a chat to a project.
- Delete a chat after confirming.

## 2. User experience

**Where to find it**

- Web and Desktop: three-dot button on a row (title 'More options', accessible name 'More options for <title>'), visible on hover, on focus and always on touch devices. (packages/ui/ui/src/sidebar/SessionItem.tsx:271-296)
- Mobile drawer: long-press a row (hint 'Long press for more actions'). Mobile All chats: long-press or the 'More actions for <title>' button. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:510-516) (apps/mobile/src/features/chat/ChatsListScreen.tsx:561, 619-623)
- Chrome: 'More actions for <title>' menu with Pin or Unpin, Rename, Share, Delete chat. (apps/extension/src/side_panel.ts:12690-12801)
- CLI: press r in the sessions picker, or use the rename command. (apps/cli/src/tui/widgets/session_picker.rs:13, 95-101) (apps/cli/src/repl/registry.rs:1031-1051)
- VS Code: row buttons for pin, 'Move to group' and mark read or unread; no rename or delete in the sheet. (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6351-6405)

**Before you start**

- Web actions need a signed-in account and a reachable server.
- Mobile Share and Archive are Cloud-only; Local chats lack both. (apps/mobile/src/features/conversation-actions/useConversationActions.ts:261-263, 277-278)

**Screens and controls**

- Web menu order: Share, Rename, separator, Pin or Unpin, Mark as unread or Mark as read, Archive or Restore, separator, Delete, separator, Move to project sub-menu. (packages/ui/ui/src/sidebar/SessionItem.tsx:316-415) (packages/ui/ui/src/sidebar/__tests__/SessionItem.rowMenu.test.tsx)
- Inline rename field replaces the row. (packages/ui/ui/src/sidebar/SessionItem.tsx:203-235)
- Mobile menu: Share, Rename, Pin, Move to project, Duplicate, Mark as unread, Archive, Delete. (apps/mobile/src/features/conversation-actions/useConversationActions.ts:261-290)
- Delete confirmation dialog on Web; alert 'Delete chat?' on Mobile. (apps/web/shared/components/layout/WebAppShell.tsx:331-340) (apps/mobile/src/features/conversation-actions/useConversationActions.ts:297)

**Journey**

1. Hover a row and click the three dots, or open it with the keyboard.
2. Choose Rename (or double-click the row): the title becomes a text field with the text selected. (packages/ui/ui/src/sidebar/SessionItem.tsx:90-98, 252)
3. Type a new title; Enter saves; Escape cancels and returns focus to the row; clicking away also saves. (packages/ui/ui/src/sidebar/SessionItem.tsx:203-222)
4. Choose Move to project and pick a project; the row moves on success and a toast says so on failure.
5. Choose Delete: a confirmation names the chat and then deletes. (apps/web/shared/components/layout/WebAppShell.tsx:331-342)

**What the person sees and gets**

- Failure toasts such as 'Could not rename this conversation'. (apps/web/shared/components/layout/sidebar-session-actions.ts:21-27)
- Archive toast with an Undo path to the archived view. (apps/web/shared/components/layout/WebAppShell.tsx:361-372)
- Mobile toasts 'Moved to <project>', 'Chat duplicated', alerts on failure. (apps/mobile/src/features/conversation-actions/useConversationActions.ts:198-215)

**Settings**

- none found for row actions.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop row menu, inline rename, Move to project sub-menu, pin, archive and restore, mark unread, share and delete. (packages/ui/ui/src/sidebar/SessionItem.tsx) (apps/web/shared/components/layout/WebAppShell.tsx:331-382)
- Rename saves on Enter and on blur; an empty or unchanged title is not saved; Escape cancels. (packages/ui/ui/src/sidebar/SessionItem.tsx:110-117, 211-222)
- Escape in the rename field cancels only the rename and lets the drawer take the next Escape. (packages/ui/ui/src/sidebar/__tests__/SessionItem.renameEscape.test.tsx)
- Delete asks first on Web: confirmDestructive with conversation copy. (apps/web/shared/components/layout/WebAppShell.tsx:331-342)
- Row action failures show a toast. (apps/web/shared/components/layout/sidebar-session-actions.ts:38-45)
- Mobile menu with rename, pin, move, duplicate, unread, archive, delete; delete confirms and states what is lost. (apps/mobile/src/features/conversation-actions/useConversationActions.ts:261-312)
- Chrome menu: pin, rename, share, delete with confirmation. (apps/extension/src/side_panel.ts:12736-12801, 12399)
- CLI rename through the picker. (apps/cli/src/tui/widgets/session_picker.rs:95-101)

**Incomplete**

- Draft said Chrome rename is missing and brief says the same; code has a rename editor and menu item. (apps/extension/src/side_panel.ts:12283-12300, 12756) Brief also says Chrome has no pin; code has it. (apps/extension/src/side_panel.ts:12736)
- Draft said VS Code has no menu and no rename in the Sessions sheet: confirmed for rename and delete, but the rows have pin, Move to group and mark read or unread buttons. A rename for cloud runs exists in the run detail, not in the sheet. (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6351-6405) (apps/extension-vscode/src/core/commandSetup.ts:2712)
- Draft said the menu item is called 'Move'; it is 'Move to project'. It is only shown when projects exist. (packages/ui/ui/src/sidebar/SessionItem.tsx:402-415)
- Row-menu Delete in the shared SessionItem calls onDelete with no confirmation of its own; the host must confirm. Web hosts do. (packages/ui/ui/src/sidebar/SessionItem.tsx:395-399) (apps/web/shared/components/layout/WebAppShell.tsx:331-342)
- Mobile Local chats cannot be archived or shared; Local delete cannot be restored. (apps/mobile/src/features/conversation-actions/useConversationActions.ts:277-278, 301-304)

**Present but disconnected or switched off**

- The shared row menu hides most items in 'simple' mode. (packages/ui/ui/src/sidebar/SessionItem.tsx:316-400)
- Custom-instructions button shows only when the host supplies a handler; WebAppShell does not pass one. (packages/ui/ui/src/sidebar/SessionItem.tsx:259-270) [inferred from the shared props list in WebAppShell.tsx:561-600]

**Not available**

- Drag to reorder rows or pins: not built on any app; no drag code found. (doc: brief S5.22)
- Drag a chat onto a project: not built; Move to project is the only way. (doc: brief S5.23)
- Row menu on VS Code (delete, archive, share, rename). (doc: brief S5.20 S5.21)

## 4. Required behaviour

**Established requirements**

- Each row has an overflow menu with its actions (share, rename, pin, archive, move, delete). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.20)
- A row can be renamed in place (Enter to save, Escape to cancel) and the new title persists. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.21)
- The user can drag rows to reorder them and the order persists. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.22)
- The user can drag a conversation onto a project to move it there. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.23)
- An action a user cannot undo asks first, naming the consequence; a mutation fired straight from onClick is a defect. (source: doc: AGENTS.md section 9)
- An agent never destroys user data on its own; chats are archived or moved to Recently deleted. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. The three-dot menu lists Share, Rename, Pin, Mark as unread, Archive, Delete in that order and Move to project last, with no Star or Copy link.
2. Double-click or Rename shows a field; Enter saves; Escape cancels with no save; blank is not saved.
3. After rename the new title shows in the list and after reload.
4. Delete shows a confirmation naming the chat and cancel leaves it.
5. Move to project moves the row under that project; a failed move shows 'Could not move this conversation'.
6. Pin moves the row to Pinned without opening it.
7. Mobile: long-press opens the menu; Local chat menu has no Share or Archive.
8. Chrome: Rename saves a custom title.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Blur-saves-rename means a click away commits an edit; a user who wants to abandon must press Escape. [inferred] from SessionItem.tsx:211.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide if drag reorder and drag to project are required; if so build with a keyboard alternative (the menu already is one).
- [proposed] Add a Mobile drawer row button so the menu is not long-press only.
- [proposed] Make the shared SessionItem delete ask by itself so a host cannot forget.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SessionItem menu and rename | `packages/ui/ui/src/sidebar/SessionItem.tsx` | Menu items, inline rename, move sub-menu |
| component | Menu primitives | `packages/ui/ui/src/sidebar/Menu.tsx` | Menu, MenuItem, MenuSubmenu, keyboard handling |
| service | escape-guard | `packages/ui/ui/src/sidebar/escape-guard.ts` | Marks inline edits so Escape cancels only the edit |
| service | sidebar-session-actions | `apps/web/shared/components/layout/sidebar-session-actions.ts` | Failure toasts, archive undo helper, delete confirm copy |
| component | WebAppShell row handlers | `apps/web/shared/components/layout/WebAppShell.tsx` | Delete confirm, rename, pin, archive, move, share, mark unread |
| hook | useConversations updateConversation and deleteConversation | `apps/web/lib/hooks/useConversations.ts` | PUT and DELETE on the conversation path |
| endpoint | PUT /api/chat/conversations/[id] | `apps/web/app/api/chat/conversations/[id]/route.ts` | Updates title, pinned, archived, projectId |
| endpoint | DELETE /api/chat/conversations/[id] | `apps/web/app/api/chat/conversations/[id]/route.ts` | Deletes a conversation |
| config | managedCloudConversationPath | `packages/contracts/cloud-contracts/src/conversations.ts` | Builds the per-conversation URL |
| hook | useConfirmAction | `packages/ui/ui/src` | Destructive confirm dialog used by the shell (import from @agiworkforce/ui) |
| hook | useConversationActions | `apps/mobile/src/features/conversation-actions/useConversationActions.ts` | Mobile menu actions and rename state |
| component | RenameConversationModal and InlineRenameField | `apps/mobile/src/features/conversation-actions/RenameConversationModal.tsx` | Mobile rename UI |
| store | chatMessageStore | `apps/mobile/stores/chat/chatMessageStore.ts` | rename, pin, move, delete, mark unread |
| component | Chrome history menu | `apps/extension/src/side_panel.ts` | Pin, Rename, Share, Delete menu and rename editor |
| component | VS Code row actions | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Pin, Move to group, mark unread buttons |
| command | CLI rename | `apps/cli/src/repl/registry.rs` | handle_rename and rename_session_for_display |
| service | rename_session | `apps/cli/src/sessions.rs` | Persists a new title |
| component | CLI SessionPickerView | `apps/cli/src/tui/widgets/session_picker.rs` | r key starts a rename |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Row menu action calls the handler passed by the shell; the shell calls updateConversation. | device | apps/web/shared/components/layout/WebAppShell.tsx:343-382 |
| The hook sends a PUT with a validated body to the conversation path and updates the local store with the reply. | our servers | apps/web/lib/hooks/useConversations.ts:906-927 |
| A false result raises a toast naming the failed action. | device | apps/web/shared/components/layout/sidebar-session-actions.ts:38-45 |
| Delete first opens the confirmation; only on confirm does it send DELETE. | device and our servers | apps/web/shared/components/layout/WebAppShell.tsx:331-342; apps/web/lib/hooks/useConversations.ts:954-958 |
| Mobile Cloud actions go to the cloud conversation store; Local actions change on-device storage. | device and our servers | apps/mobile/src/features/conversation-actions/useConversationActions.ts:261-312 |
| Chrome rename stores a custom title on the history entry and syncs to the cloud conversation where one exists. | device and our servers | apps/extension/src/side_panel.ts:12195-12215, 12297 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation title, pinned, archived, project link | Managed chat database (Cloud); on-device store (Mobile Local, Chrome local history, CLI session file) | Cloud yes; Local no | Delete removes it; Mobile says Cloud delete is recoverable from Recently deleted on the web, Local delete is not (apps/mobile/src/features/conversation-actions/useConversationActions.ts:299-304) |
| Manual unread mark (Web) | Browser storage | No | Until toggled |

**Models and providers.** No model is called by row actions. Auto-generated titles come from the chat pipeline and are then editable here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account on Web and Mobile Cloud; Local chats on Mobile need none for rename and delete. |
| Permissions | Server enforces ownership and workspace scope on PUT and DELETE; route tests exist for organisation scope. (apps/web/app/api/chat/conversations/__tests__/route.organization-scope.test.ts) |
| Subscription | none found for rename, pin, move, archive or delete. |
| Limits and metering | none found. |
| Feature flags | Share and Move appear only if the host passes handlers or projects exist. (packages/ui/ui/src/sidebar/SessionItem.tsx:316-322, 402) |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Mobile Local: rename, pin, move, duplicate, unread, delete; no Share or Archive; delete is permanent. (apps/mobile/src/features/conversation-actions/useConversationActions.ts:261-304) Web: no Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty title | Not saved; the old title stays. | packages/ui/ui/src/sidebar/SessionItem.tsx:110-117 |
| Unchanged title | No request is sent. | packages/ui/ui/src/sidebar/SessionItem.tsx:112 |
| Input method composing | Enter during composition does not save. | packages/ui/ui/src/sidebar/SessionItem.tsx:213 |
| Escape in rename | Cancels the edit, returns focus to the row, does not close the drawer. | packages/ui/ui/src/sidebar/SessionItem.tsx:218-222; packages/ui/ui/src/sidebar/__tests__/SessionItem.renameEscape.test.tsx |
| Row menu open and Escape pressed | Menu closes first; drawer stays open. | apps/web/shared/components/layout/WebAppShell.test.tsx:798 |
| Server failure | Toast; row stays as it was. | apps/web/shared/components/layout/sidebar-session-actions.ts:38-45 |
| Archive undo | Undo restores the chat and its pin on Mobile; Web hands back the pin. | apps/web/shared/components/layout/sidebar-session-actions.ts:47-50; apps/mobile/__tests__/conversation-actions-menu.test.ts |
| Account changes during an action | Mobile ignores late results when the account changed. | apps/mobile/src/features/conversation-actions/useConversationActions.ts:206-215 |
| Offline | Surfaces as the failure toast or alert; no queue. | apps/web/shared/components/layout/sidebar-session-actions.ts:38-45 |
| Accessibility | Menu button has a named label; touch targets 44px; menu items keyboard navigable. | packages/ui/ui/src/sidebar/SessionItem.tsx:277-290; packages/ui/ui/src/sidebar/__tests__/Menu.keyboard.test.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/sidebar/__tests__/SessionItem.rowMenu.test.tsx`: Menu order, no Star or Copy link, pin and archive without opening, mark unread and read
- `packages/ui/ui/src/sidebar/__tests__/SessionItem.renameEscape.test.tsx`: Escape cancels only the rename
- `packages/ui/ui/src/sidebar/__tests__/Menu.keyboard.test.tsx`: Menu keyboard use
- `packages/ui/ui/src/sidebar/__tests__/Menu.drawerEscape.test.tsx`: Escape claimed by a menu inside the drawer
- `packages/ui/ui/src/sidebar/__tests__/Menu.semantics.test.tsx`: Menu semantics
- `packages/ui/ui/src/sidebar/__tests__/Menu.placement.test.tsx`: Menu placement
- `apps/web/shared/components/layout/sidebar-session-actions.test.ts`: Row action failure messages and helpers
- `apps/mobile/__tests__/conversation-actions-menu.test.ts`: Mobile menu items, delete confirm text, pin label, archive Undo
- `apps/web/app/api/chat/conversations/[id]/route.delete.test.ts`: Server delete route
- `apps/web/app/api/chat/conversations/[id]/route.variants.test.ts`: Server conversation route variants (contents not read)

**Test scenarios**

- **Rename with Enter**
  1. Double-click a row.
  2. Type 'Budget notes'.
  3. Press Enter.
  4. Reload.
  - Expected: Title shows 'Budget notes' before and after the reload.
- **Rename cancel**
  1. Start rename.
  2. Type text.
  3. Press Escape.
  - Expected: Old title stays; focus returns to the row; drawer (if open) stays open.
- **Blur saves**
  1. Start rename, type, click elsewhere.
  - Expected: New title is saved (documents the blur behaviour).
- **Delete confirm**
  1. Row menu, Delete.
  2. Cancel.
  3. Repeat and confirm.
  - Expected: Cancel changes nothing; confirm removes the chat.
- **Move to project**
  1. Row menu, Move to project, pick a project.
  - Expected: Chat appears under the project; failure shows a toast.
- **No drag**
  1. Drag a row onto a project or another row.
  - Expected: Nothing happens (confirms the gap).

**Where to look when it fails**

- Toast strings in sidebar-session-actions.ts.
- PUT and DELETE /api/chat/conversations/<id> in the network log.
- Mobile alerts 'Could not move chat', 'Could not archive'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/web/005-application-shell-and-navigation-components.md)
- Desktop: [70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md)
- Mobile: [70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md)
- CLI: [70-qa/test-plans/cli/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/cli/005-application-shell-and-navigation-components.md)
- VS Code: [70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md)
- Chrome: [70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md)

## 10. Gaps and dependencies

- **Drag to reorder not built** Affects: All apps. Evidence: No drag handlers in packages/ui/ui/src/sidebar; brief S5.22. Work needed: Decide and build or retire
- **Drag a chat onto a project not built** Affects: All apps. Evidence: Move to project sub-menu only; brief S5.23. Work needed: Decide and build or retire
- **VS Code Sessions sheet has no rename, archive, share or delete** Affects: VS Code users. Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6351-6405. Work needed: Add row menu or confirm out of scope
- **Brief marks Chrome rename and pin missing but code has them** Affects: Docs. Evidence: apps/extension/src/side_panel.ts:12736, 12756. Work needed: Correct the brief
- **Shared row Delete has no confirmation of its own** Affects: Any new host of SessionItem. Evidence: packages/ui/ui/src/sidebar/SessionItem.tsx:395-399. Work needed: Move confirm into the shared component or add a test that each host confirms
- **Mobile drawer menu reachable only by long press** Affects: Mobile users and assistive tech. Evidence: apps/mobile/src/features/drawer/components/DrawerContent.tsx:510-516. Work needed: Add a visible control or a custom accessibility action

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:cloud
- api:PUT /api/chat/conversations/[id]
- api:DELETE /api/chat/conversations/[id]
- SYS-security-and-privacy
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- F005-04
- F005-05

## Unknown

- Whether Chrome and Mobile rename also saves on blur.
- Exact server validation of the PUT body (schema ManagedCloudUpdateConversationRequestSchema not opened).
- What the CLI rename command arguments accept beyond id and title.
- Whether VS Code rename exists for local sessions elsewhere.
- How Recently deleted works on the web (referred to by the Mobile alert, not traced).
