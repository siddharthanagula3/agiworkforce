---
id: "F005-03"
type: "feature"
title: "Search and new chat in the sidebar"
aliases: ["Sidebar search", "Search button", "New chat button", "Compose button", "Global search", "S5.07 S5.08"]
area: "5 Application shell and navigation components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S5.07", "S5.08"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-sync-and-continuity", "SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "file:packages/ui/ui/src/sidebar/searchShortcut.ts", "F005-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F005-03 Search and new chat in the sidebar

One-step access to search and to a fresh chat from anywhere in the shell. The sidebar has a Search button (Ctrl/Cmd+Shift+F) that opens a search dialog and a New chat button (Shift+Ctrl/Cmd+O). Mobile puts a search icon and a New chat row in the drawer. CLI, VS Code and Chrome have their own equivalents.

Area: [5. Application shell and navigation components](README.md). Requirement items: [S5.07](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s507), [S5.08](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s508).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Opens the global search dialog and starts a new conversation from the sidebar, the rail, the keyboard or the native menu. (packages/ui/ui/src/sidebar/Sidebar.tsx:597-640) (apps/web/shared/components/layout/WebAppShell.tsx:302-320)

**Why it exists.** Finding an old chat and starting a new one are the two most frequent navigation actions. The search shortcut avoids the command palette key. (packages/ui/ui/src/sidebar/searchShortcut.ts:1-2)

**Who uses it.** Everyone who keeps many chats.

**Problems it solves**

- Scrolling a long list to find a chat.
- Starting new work without hunting for a button.
- Keyboard users reaching both actions without a mouse.

**Use cases**

- Press Ctrl/Cmd+Shift+F, type a few words, open the matching chat.
- Press Shift+Ctrl/Cmd+O to start a new chat while reading another.
- On the phone, tap the search icon at the top of the drawer.
- In the Chrome side panel, search recent chats once there are more than ten.

## 2. User experience

**Where to find it**

- Web and Desktop: 'New Chat' button (SquarePen icon, accessible name 'New chat') and 'Search' button with a shortcut badge in the sidebar header; in the rail, icon buttons 'New chat' and 'Search'. (packages/ui/ui/src/sidebar/Sidebar.tsx:597-640, 510-518)
- Mobile: search icon button labelled by key search at the top of the drawer; row 'New chat' (key drawer.newChat) first in the navigation. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:631, 645)
- CLI: no sidebar; history picker via /history or /resume. (apps/cli/src/repl/slash_commands.rs:177-180)
- VS Code: header buttons 'Sessions', 'Settings' and 'New chat'; the Sessions sheet has a 'Search sessions' box. (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2928-2937, 3040-3046)
- Chrome: button 'New chat' (id sp-new-chat-btn) and a 'Search recent chats' box in the history list. (apps/extension/src/side_panel.ts:11533-11535, 12159-12165)

**Before you start**

- Web global search needs a signed-in user id; it also searches local developer sessions on Desktop. (apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:215, 267)
- Chrome search box appears only when more than 10 chats exist. (apps/extension/src/side_panel.ts:1131, 12974)

**Screens and controls**

- Search shortcut badge: Shift+Ctrl+F or the Shift, Command and F symbols. (packages/ui/ui/src/sidebar/Sidebar.tsx:133-137)
- Search dialog (GlobalSearchDialog) with filters, recent and popular searches. (apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:1-60)
- Mobile: search screen route /(app)/search. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:442-444)

**Journey**

1. Click Search or press Ctrl/Cmd+Shift+F. On a phone browser the drawer closes first, then the dialog opens. (apps/web/shared/components/layout/WebAppShell.tsx:317-319)
2. Type a query; results come from the search service and, on Desktop, local sessions by title. (apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:215-270)
3. Choose a result to open it.
4. New chat: click the button; the app goes to /chat. A temporary chat from the desktop menu first clears the active project. (apps/web/shared/components/layout/WebAppShell.tsx:302-316)

**What the person sees and gets**

- Dialog opens; results list; the new chat route loads with an empty composer.
- Mobile New chat clears the project scope before opening chat. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:422-427)

**Settings**

- Shortcuts are listed in the keyboard shortcuts dialog (open-search, new-conversation). (packages/ui/unified-chat/src/lib/shortcutRegistry.ts:46-76)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Search and New chat controls in the expanded sidebar and the rail. (packages/ui/ui/src/sidebar/Sidebar.tsx:510-518, 597-640)
- Search shortcut Ctrl/Cmd+Shift+F, and new chat Shift+Ctrl/Cmd+O (plain Ctrl/Cmd+N is not used because browsers keep it). (packages/ui/unified-chat/src/lib/shortcutRegistry.ts:46-76)
- The shell answers desktop menu commands open-search and temporary new chat. (apps/web/shared/components/layout/WebAppShell.tsx:224-236, 303-316)
- New chat keeps working while recents are loading or failed. (apps/web/shared/components/layout/WebAppShell.test.tsx:1119-1137)
- Mobile search and New chat in the drawer. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:422-444)
- VS Code and Chrome have their own New chat and session search. (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2934, 3041) (apps/extension/src/side_panel.ts:11533, 12159)

**Incomplete**

- Draft said CLI and VS Code have the same key bindings; they were not compared. CLI search or new-chat keys were not found: the brief's CLI line numbers no longer match tui_app.rs.
- Chrome history search is hidden under 10 chats. (apps/extension/src/side_panel.ts:1131)

**Present but disconnected or switched off**

- nothing found

**Not available**

- Search inside the CLI list of sessions: not traced (unknown).
- The command palette key Ctrl/Cmd+K is intentionally not used for sidebar search. (packages/ui/ui/src/sidebar/searchShortcut.ts:1-2)

## 4. Required behaviour

**Established requirements**

- The navigation sidebar has a search entry that filters or searches conversations. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.07)
- A persistent New chat action starts a fresh conversation from anywhere in the shell. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.08)

**Acceptance criteria**

1. Clicking Search opens the dialog; pressing Ctrl/Cmd+Shift+F does the same from any shell route.
2. Ctrl/Cmd+K never opens the sidebar search dialog.
3. New chat opens an empty chat from /chat, from Code and from a settings route.
4. On a phone browser the drawer closes before the dialog or new chat appears.
5. With the conversation list failed, New chat still works.
6. Mobile search icon opens the search screen; New chat row opens an empty chat with no project scope.
7. Chrome: with 11 or more chats the history search filters the list.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Search results should respect the active workspace. [inferred] no check was done.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a test that compares key bindings between Web, CLI and VS Code and records the differences.
- [proposed] Show search empty-result copy and failure copy in one tested place.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Sidebar search and New chat buttons | `packages/ui/ui/src/sidebar/Sidebar.tsx` | Buttons, badge and rail variants |
| config | OPEN_SEARCH_SHORTCUT | `packages/ui/ui/src/sidebar/searchShortcut.ts` | Defines Shift plus Ctrl or Meta plus F |
| config | CHAT_SHORTCUTS | `packages/ui/unified-chat/src/lib/shortcutRegistry.ts` | open-search and new-conversation definitions |
| hook | useKeyboardShortcuts | `apps/web/features/chat/hooks/use-keyboard-shortcuts.ts` | Maps shortcuts to handlers |
| component | WebAppShell handlers | `apps/web/shared/components/layout/WebAppShell.tsx` | handleNewChat, handleOpenSearch, app commands |
| component | GlobalSearchDialog | `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx` | The search dialog |
| service | globalSearchService | `apps/web/features/chat/services/global-search-service.ts` | Runs the search; path from import, file not opened |
| service | app-commands | `apps/web/shared/lib/app-commands.ts` | Native menu command bus including toggle-sidebar and open-search |
| component | DrawerContent search and New chat | `apps/mobile/src/features/drawer/components/DrawerContent.tsx` | Header search button and New chat row |
| screen | Search screen | `apps/mobile/app/(app)/search` (not found) | Mobile search route target (directory not opened) |
| service | clearNewChatProjectScope | `apps/mobile/stores/projects/newChatProjectScope.ts` | Resets project scope for a new chat |
| component | VS Code header buttons and Sessions sheet | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | newChatBtn, sessionsBtn, sessionsSearch |
| component | Chrome side panel new chat and history search | `apps/extension/src/side_panel.ts` | sp-new-chat-btn and sp-drawer-history-search |
| command | CLI /history and /resume | `apps/cli/src/repl/slash_commands.rs` | Open the Sessions picker |
| component | SessionPickerView | `apps/cli/src/tui/widgets/session_picker.rs` | CLI sessions list overlay |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Click or shortcut calls onOpenSearch; the shell closes any drawer then sets the dialog open. | device | apps/web/shared/components/layout/WebAppShell.tsx:317-319 |
| Dialog debounces the query and calls the search service with the user id and filters. | device and our servers | apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:267 |
| On Desktop it also lists local developer sessions by title. | device | apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:215 |
| New chat navigates to /chat; the chat page creates a conversation on first send. | device | apps/web/shared/components/layout/WebAppShell.tsx:302 |
| Mobile New chat closes the drawer, clears project scope, pushes the chat tab. | device | apps/mobile/src/features/drawer/components/DrawerContent.tsx:422-427 |
| Chrome and VS Code filter the list of chats held in the extension. | device | apps/extension/src/side_panel.ts:12823-12830 [inferred: filterConversations runs locally] |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Search queries and recent searches | Handled by the search service; storage location not opened | unknown | unknown (dialog offers delete icon for recent searches) |
| New conversation record | Created on first send in the managed chat store | Yes in Cloud | See SYS-chat-turn-pipeline |

**Models and providers.** The sidebar search itself calls no model. A new chat later uses the model chosen in the composer; that choice is outside this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web search needs a signed-in user. Mobile Local search covers on-device chats. |
| Permissions | none found in the code for the buttons. |
| Subscription | none found; no plan gate on search or New chat. |
| Limits and metering | Search debounce constant SEARCH_INPUT_DEBOUNCE_MS; no usage metering found. (apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:5) |
| Feature flags | none found for these controls. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Mobile Local mode lists only on-device chats in the drawer and New chat starts an on-device chat. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:450-456) Web has no Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| List still loading | New chat works; test titled 'keeps New chat working while the recents list is still loading'. | apps/web/shared/components/layout/WebAppShell.test.tsx:1119 |
| List failed | New chat works. | apps/web/shared/components/layout/WebAppShell.test.tsx:1128 |
| Search with no results or error | Not traced in this feature (belongs to the dialog). | apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx |
| Phone drawer open | Drawer closes, then the dialog or route opens. | apps/web/shared/components/layout/WebAppShell.tsx:167-172 |
| Key clash | Ctrl/Cmd+K reserved for the command palette; test checks the badge never shows bare Ctrl/Cmd+K. | packages/ui/ui/src/sidebar/__tests__/Sidebar.searchShortcut.test.tsx |
| Touch | Controls grow to 44px minimum on coarse pointers. | packages/ui/ui/src/sidebar/Sidebar.tsx:599-603 |
| Offline, timeout, cancel | not handled in the shell; any handling is inside the search dialog (not read). | apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/sidebar/__tests__/Sidebar.searchShortcut.test.tsx`: Shortcut badge beside Search; never advertises bare Ctrl/Cmd+K
- `packages/ui/ui/src/sidebar/__tests__/Sidebar.behaviour.test.tsx`: Sidebar leads with brand, collapse, New chat, Search
- `apps/web/shared/components/layout/WebAppShell.test.tsx`: Search opens the same dialog as the chat page (line 1068); New chat while loading or failed
- `apps/web/features/chat/pages/__tests__/WebChatPage.shortcuts.test.tsx`: Chat page shortcuts (contents not read)
- `apps/mobile/__tests__/DrawerContent.test.tsx`: Drawer structure and New chat (contents partly read)
- `apps/mobile/__tests__/ChatsListScreen.test.tsx`: Mobile chat list and search (contents not read)
- `apps/extension/__tests__/side-panel-history-resume.test.ts`: Chrome history resume (contents not read)

**Test scenarios**

- **Keyboard search**
  1. Open any /chat or settings route.
  2. Press Ctrl/Cmd+Shift+F.
  - Expected: Search dialog opens.
- **Palette key**
  1. Press Ctrl/Cmd+K.
  - Expected: Command palette, not the sidebar search.
- **New chat everywhere**
  1. From /chat/projects and a settings route click New chat.
  - Expected: An empty chat opens.
- **Phone drawer**
  1. At 390px open navigation, tap Search.
  - Expected: Drawer closes and the dialog opens.
- **Mobile**
  1. Open drawer, tap the search icon, then New chat.
  - Expected: Search screen opens; New chat opens an empty chat.
- **Chrome threshold**
  1. Hold 10 chats, then 11.
  - Expected: Search box appears only at 11.

**Where to look when it fails**

- Shortcut definitions in shortcutRegistry.ts for binding clashes.
- GlobalSearchDialog toast errors (the file imports sonner).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/web/005-application-shell-and-navigation-components.md)
- Desktop: [70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md)
- Mobile: [70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md)
- CLI: [70-qa/test-plans/cli/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/cli/005-application-shell-and-navigation-components.md)
- VS Code: [70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md)
- Chrome: [70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md)

## 10. Gaps and dependencies

- **Key bindings across apps not compared** Affects: CLI and VS Code users. Evidence: Draft said differences unchecked; brief code lines stale. Work needed: Trace and tabulate bindings
- **Search empty and failure states not documented for the dialog** Affects: All apps. Evidence: Not in the shell code. Work needed: Document and test in the dialog
- **CLI search of past sessions not found** Affects: CLI users. Evidence: Only /history and /resume picker found. Work needed: Confirm or build
- **Chrome search hidden below 10 chats** Affects: Chrome users with few chats. Evidence: apps/extension/src/side_panel.ts:1131. Work needed: Likely intended; confirm

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-sync-and-continuity
- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- file:packages/ui/ui/src/sidebar/searchShortcut.ts
- F005-01

## Unknown

- Where recent searches are stored.
- Whether results filter by active workspace.
- CLI and VS Code keys for search and new chat.
- Search empty and failure copy.
- What apps/mobile/app/(app)/search contains.
