---
id: "F005-05"
type: "feature"
title: "Conversation and task rows"
aliases: ["Session item", "Conversation row", "Task row", "Running dot", "Needs you dot", "Unread dot", "S5.13 S5.15 S5.16 S5.17 S5.18 S5.19"]
area: "5 Application shell and navigation components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (1 of 6)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S5.13", "S5.15", "S5.16", "S5.17", "S5.18", "S5.19"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "table:cloud_agent_runs", "table:web_conversations", "store:agi.sidebar.unreadConversationIds", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "F005-04", "F005-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F005-05 Conversation and task rows

One row in the sidebar for each chat or task. It shows the title, which row is open, whether it is a Work task, whether a reply is running, whether it needs the person, and whether it was marked unread. On Web the unread mark is set by hand and stored in the browser; on Mobile it clears when the chat is opened.

Area: [5. Application shell and navigation components](README.md). Requirement items: [S5.13](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s513), [S5.15](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s515), [S5.16](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s516), [S5.17](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s517), [S5.18](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s518), [S5.19](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s519).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (1 of 6) |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Draws each conversation with state markers and opens it on click or tap. (packages/ui/ui/src/sidebar/SessionItem.tsx:125-200)

**Why it exists.** People run several chats and tasks at once and need to see which one is running, which is waiting for them, and which they have not read.

**Who uses it.** Everyone with more than one chat; people who start long Work tasks.

**Problems it solves**

- Missing a task that waits for approval.
- Losing track of a running reply in another chat.
- Telling a task from a chat (colour alone is not enough, the accessible name says 'Work').

**Use cases**

- Start a task, switch chats, see a pulsing dot on the task row.
- See a warning dot where the agent needs approval.
- Mark a chat as unread to come back to it.
- Ctrl-click a row to open it in a new tab.

## 2. User experience

**Where to find it**

- Web and Desktop: each row under Pinned, date groups or a project. (packages/ui/ui/src/sidebar/SessionItem.tsx)
- Mobile: drawer rows and All chats rows; unread dot, pin icon and star only. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:501-556) (apps/mobile/src/features/chat/ChatsListScreen.tsx:582-600)
- VS Code: Sessions sheet rows with title, age and pinned or unread note. (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6275-6320)
- Chrome: history rows with title, date and an active highlight. (apps/extension/src/side_panel.ts:12845-12850, 5315-5316)
- CLI: picker rows with a cursor and the label. (apps/cli/src/tui/widgets/session_picker.rs:55-75)

**Before you start**

- Run state needs a reply in flight in this browser; needs-you needs a cloud agent run waiting; task mark needs a run with work mode.

**Screens and controls**

- Row link (anchor) or button; the active row has a filled background and aria-current page. (packages/ui/ui/src/sidebar/SessionItem.tsx:239, 251-257)
- Running: pulsing primary dot with hidden text 'Running'; stops pulsing under reduced motion. (packages/ui/ui/src/sidebar/SessionItem.tsx:144-152)
- Needs you: warning-colour dot. (packages/ui/ui/src/sidebar/SessionItem.tsx:154-160)
- Work task: small primary dot. (packages/ui/ui/src/sidebar/SessionItem.tsx:161-167)
- Unread: bold title and a small info-colour dot at the right edge; the dot hides on hover. (packages/ui/ui/src/sidebar/SessionItem.tsx:168-182)
- Starred rows show a star; untitled rows show 'Untitled'; rows in a project name it in the tooltip. (packages/ui/ui/src/sidebar/SessionItem.tsx:122-126, 143)

**Journey**

1. Look at the sidebar: markers sit left of the title.
2. Click or tap a row: the app opens that chat. A modifier or middle click is left to the browser. (packages/ui/ui/src/sidebar/SessionItem.tsx:127-142)
3. Use Up and Down, Home, End to move; Enter opens. (packages/ui/ui/src/sidebar/Sidebar.tsx:360-405)
4. Open a row marked unread: on Web the dot stays until you choose 'Mark as read' (the draft said opening clears it; it does not).
5. On Mobile, opening the chat clears unread. (apps/mobile/app/(app)/chat/[id].tsx:573)

**What the person sees and gets**

- Screen-reader name joins the title with 'Work', 'Needs you', 'Running', 'Unread'. (packages/ui/ui/src/sidebar/SessionItem.tsx:189-199)
- Rail toggle shows an unread dot when the list is hidden. (packages/ui/ui/src/sidebar/Sidebar.tsx:489-505)

**Settings**

- none found for row markers.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web rows: active, running, needs-you, task, unread, starred, untitled, project note. (packages/ui/ui/src/sidebar/SessionItem.tsx:122-200)
- Running comes from loading or streaming conversation ids in the chat store. (apps/web/shared/components/layout/WebAppShell.tsx:264-269)
- Needs-you comes from the server: a conversation with a cloud agent run in state awaiting_input, awaiting_approval or paused. (apps/web/lib/server/neon-chat.ts:64-70)
- Task mark comes from the run work mode or a local chat-store mode. (apps/web/lib/server/neon-chat.ts:54-62) (apps/web/shared/components/layout/WebAppShell.tsx:276-281)
- Mobile rows: active (bold plus background), pin, unread dot; the unread flag clears on opening the chat. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:501-556) (apps/mobile/app/(app)/chat/[id].tsx:573)
- VS Code rows show unread (bold title, 'Unread' note) and pinned notes. (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2478, 6307-6313)

**Incomplete**

- Web unread is a manual mark stored in the browser, not a 'new result' flag. It does not clear on opening and does not follow the person across devices. (apps/web/shared/stores/unread-conversations-store.ts:1-10) (apps/web/shared/hooks/use-unread-conversations.ts:11-19)
- Mobile drawer and All chats rows show no running, needs-you or task markers; tasks live on the tasks screen. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:501-556) [inferred: AGI Work opens the runs list (apps/mobile/src/features/drawer/components/DrawerContent.tsx:137-143)]
- The row title, the 'Work' name and the Needs you dot cannot be read by colour alone: the dot is aria-hidden but the name carries the state. (packages/ui/ui/src/sidebar/SessionItem.tsx:154-199)
- CLI, VS Code and Chrome rows were seen only in outline; brief line references do not match current code.

**Present but disconnected or switched off**

- Task rows on Web are chats flagged by work mode; there is no separate task list in the sidebar. (packages/ui/ui/src/sidebar/types.ts:27-31)

**Not available**

- Unread-result indicator on CLI, VS Code (manual mark only) and Chrome. (doc: brief S5.19)
- Resource-type icon beyond the dot marker on rows: the icons exist in the command palette and mobile search, not in sidebar rows. (apps/web/shared/components/CommandPalette/CommandPalette.tsx:81) (apps/mobile/src/features/chat/ChatsListScreen.tsx:89-97)

## 4. Required behaviour

**Established requirements**

- Each conversation row shows its title, indicates the active one, and opens the conversation. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.13)
- Background work appears as rows marked as tasks with state, and opens on selection. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.15)
- Rows in mixed lists carry a marker telling the resource type apart visually and for assistive tech. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.16)
- Navigation marks items whose task or response is still running, visually and for screen readers. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.17)
- Navigation marks items blocked waiting for the user. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.18)
- Items with new results are marked unread (visually and for assistive tech) and clear when opened. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.19)

**Acceptance criteria**

1. The open chat's row has a filled background and aria-current.
2. A chat with a reply in flight shows a pulsing dot and the name includes 'Running'.
3. A chat whose cloud run waits for approval shows the Needs you dot after the list reloads.
4. A Work chat shows the small dot and the name includes 'Work'.
5. A chat marked unread shows a bold title and a dot; Mark as read removes it.
6. An untitled chat reads 'Untitled'.
7. Ctrl-click opens in a new tab; plain click stays in the app.
8. On Mobile, opening an unread chat removes its dot.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief wants unread to clear on open; the Web code does not do this and appears to implement a different idea (manual mark). [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a real unread-result flag from the server so it follows the person and clears on open.
- [proposed] Show running, needs-you and task marks on Mobile drawer rows.
- [proposed] Test that Needs you refreshes without a full reload.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SessionItem | `packages/ui/ui/src/sidebar/SessionItem.tsx` | The row: markers, active state, open, rename field, menu |
| config | SidebarSession type | `packages/ui/ui/src/sidebar/types.ts` | runState, agiWork, unread, needsYou fields |
| service | toSidebarSessions | `apps/web/shared/components/layout/sidebar-session-rows.ts` | Builds rows with isUnread and decorations |
| component | WebAppShell row decoration | `apps/web/shared/components/layout/WebAppShell.tsx` | Adds running, work mode and needsYou |
| component | WebChatPage row decoration | `apps/web/features/chat/pages/WebChatPage.tsx` | Same for the chat route (lines 6963-6990) |
| store | unread-conversations-store | `apps/web/shared/stores/unread-conversations-store.ts` | Manual unread ids in browser storage under agi.sidebar.unreadConversationIds |
| hook | useUnreadConversations | `apps/web/shared/hooks/use-unread-conversations.ts` | Reads and toggles unread ids; connects cross-tab sync |
| service | conversation select SQL | `apps/web/lib/server/neon-chat.ts` | CONVERSATION_WORK_MODE_SELECT and CONVERSATION_NEEDS_YOU_SELECT |
| table | cloud_agent_runs | `apps/web/lib/server/neon-chat.ts` | Source of work_mode and needs_you states |
| store | web-chat-store | `apps/web/shared/stores/web-chat-store.ts` | loadingConversationIds, streamingConversationIds, workModeByConversation |
| component | Sidebar keyboard list | `packages/ui/ui/src/sidebar/Sidebar.tsx` | Roving focus, arrow keys, rail unread dot |
| component | DrawerContent row | `apps/mobile/src/features/drawer/components/DrawerContent.tsx` | Mobile row with unread dot |
| store | chatMessageStore unread | `apps/mobile/stores/chat/chatMessageStore.ts` | markConversationRead and markConversationUnread |
| screen | Mobile chat screen | `apps/mobile/app/(app)/chat/[id].tsx` | Clears unread when opened |
| component | VS Code session row | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Row with unread and pinned notes |
| component | Chrome history item | `apps/extension/src/side_panel.ts` | History row with active highlight |
| component | CLI SessionPickerView | `apps/cli/src/tui/widgets/session_picker.rs` | Terminal list of sessions |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Chat store marks conversations as loading or streaming while a reply runs; the shell turns that into runState running. | device | apps/web/shared/components/layout/WebAppShell.tsx:264-281 |
| The conversation list query computes needs_you and work_mode per row from cloud agent runs. | our servers | apps/web/lib/server/neon-chat.ts:51-70 |
| The browser reads manual unread ids from local storage and listens for other tabs' changes. | device | apps/web/shared/stores/unread-conversations-store.ts:12-47 |
| Row click calls onSelect which routes to the chat URL. | device | apps/web/shared/components/layout/WebAppShell.tsx:327-330 |
| Mobile open of chat/[id] calls markConversationRead, which flips unread locally or in the cloud store. | device | apps/mobile/app/(app)/chat/[id].tsx:573; apps/mobile/stores/chat/chatMessageStore.ts:400-408 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Manual unread ids (Web) | Browser localStorage key agi.sidebar.unreadConversationIds | No, per browser (comment in the store) | Until toggled or storage cleared |
| needs_you and work_mode | Derived from table cloud_agent_runs on read | Server truth | Follows run retention |
| Mobile unread flag | Local chat store or cloud conversation patch | Cloud store patch is local state; server sync unknown | unknown |

**Models and providers.** No model is called to draw rows. Running state reflects whichever model or provider is answering.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; rows list the account's conversations. |
| Permissions | none found at the row level; list scoping is by workspace on the server. |
| Subscription | Needs-you and task marks only appear where the plan allows Work runs; Mobile gates AGI Work on plan and capability. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:340-346) |
| Limits and metering | none found for row markers. |
| Feature flags | none found for row markers. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Mobile Local chats are listed with the unread dot and pin; no running or task markers. Web has no Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Untitled | Shows 'Untitled' (Mobile 'Untitled chat'). | packages/ui/ui/src/sidebar/SessionItem.tsx:122; apps/mobile/src/features/drawer/components/DrawerContent.tsx:544 |
| Incognito | A faint purple ring on the row. | packages/ui/ui/src/sidebar/SessionItem.tsx:241 |
| Unknown run state | Left unmarked rather than claimed idle. | packages/ui/ui/src/sidebar/types.ts:18-25 |
| Reduced motion | Running dot stops pulsing. | packages/ui/ui/src/sidebar/SessionItem.tsx:148 |
| Keyboard focus | Focus ring on the row; row buttons use a roving tab stop. | packages/ui/ui/src/sidebar/Sidebar.tsx:331-348 |
| Touch device | Menu button always visible; row height 44px. | packages/ui/ui/src/sidebar/SessionItem.tsx:200-205, 254 |
| Storage blocked | Unread toggle works for the session but is lost on reload. | apps/web/shared/stores/unread-conversations-store.ts:25-34 |
| Failure to load needs-you | not handled in the code beyond list failure. | apps/web/lib/server/neon-chat.ts:64-70 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/sidebar/__tests__/SessionItem.rowState.test.tsx`: Title, untitled placeholder, project note, current-page mark, opening a row
- `packages/ui/ui/src/sidebar/__tests__/Sidebar.runState.test.tsx`: Running mark present or absent
- `packages/ui/ui/src/sidebar/__tests__/Sidebar.agiWorkBadge.test.tsx`: Work task mark
- `packages/ui/ui/src/sidebar/__tests__/Sidebar.unreadRailDot.test.tsx`: Unread dot on rail toggle
- `apps/web/shared/stores/unread-conversations-store.test.ts`: Unread store
- `apps/web/shared/hooks/use-unread-conversations.test.ts`: Unread hook
- `apps/mobile/__tests__/DrawerContent.test.tsx`: Drawer rows (renders projects and recents)
- `apps/mobile/__tests__/ChatsListScreen.test.tsx`: All chats rows (contents not read)

**Test scenarios**

- **Running**
  1. Send a long message.
  2. Switch to another chat.
  - Expected: Original row shows a pulsing dot and 'Running' in its name.
- **Needs you**
  1. Start a Work run that asks for approval.
  2. Reload the list.
  - Expected: Row shows the warning dot; accessible name includes 'Needs you'.
- **Unread (Web)**
  1. Row menu, Mark as unread.
  2. Reload.
  3. Open the chat.
  - Expected: Dot persists across reload and does not clear on open; Mark as read clears it.
- **Unread (Mobile)**
  1. Long-press a chat, Mark as unread.
  2. Open it.
  - Expected: Dot appears, then clears on open.
- **New tab**
  1. Ctrl-click a row.
  - Expected: Opens in a new tab; the current tab does not navigate.
- **Reduced motion**
  1. Enable reduced motion and view a running row.
  - Expected: No pulse.

**Where to look when it fails**

- Test ids session-running-<id>, session-needs-you-<id>, session-agi-work-<id>, session-unread-<id>.
- Table cloud_agent_runs state values awaiting_input, awaiting_approval, paused.
- Browser storage key agi.sidebar.unreadConversationIds.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/web/005-application-shell-and-navigation-components.md)
- Desktop: [70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md)
- Mobile: [70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md)
- CLI: [70-qa/test-plans/cli/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/cli/005-application-shell-and-navigation-components.md)
- VS Code: [70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md)
- Chrome: [70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md)

## 10. Gaps and dependencies

- **Web unread is manual and local; brief wants new-result unread that clears on open** Affects: Web and Desktop users. Evidence: apps/web/shared/stores/unread-conversations-store.ts:1-10. Work needed: Server flag set on new assistant output, cleared on open
- **Mobile drawer rows lack running, needs-you and task markers** Affects: Mobile users. Evidence: apps/mobile/src/features/drawer/components/DrawerContent.tsx:501-556. Work needed: Pass run state to rows
- **No unread indicator on CLI and Chrome** Affects: CLI and Chrome users. Evidence: doc: brief S5.19. Work needed: Decide scope
- **Resource-type icons not on sidebar rows** Affects: All apps. Evidence: Icons only in palette and mobile search. Work needed: Optional
- **Brief code references for CLI, VS Code and Chrome rows are stale** Affects: Docs. Evidence: tui_app.rs and side_panel.ts lines do not match. Work needed: Re-trace

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- table:cloud_agent_runs
- table:web_conversations
- store:agi.sidebar.unreadConversationIds
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- F005-04
- F005-06

## Unknown

- Whether the Web unread mark was ever meant to clear on open (no code does it).
- Mobile unread persistence to the server.
- Exact CLI picker label contents.
- Whether Chrome marks active or unread beyond the active highlight.
- How task rows appear in the VS Code sheet.
