---
id: "F008-10"
type: "feature"
title: "Menus"
aliases: ["Dropdown menu", "Context menu", "Nested menu", "Submenu", "Right-click menu", "Long-press menu", "Conversation options", "S8.34", "S8.35", "S8.36"]
area: "8 Basic interactive elements"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S8.34", "S8.35", "S8.36"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-shared-ui-and-design", "file:packages/ui/ui/src/primitives/DropdownMenu.tsx", "file:packages/ui/ui/src/primitives/useMenuKeyboard.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F008-10 Menus

Menus that open a list of actions: dropdowns from a button, context menus on right-click or long-press, and submenus. Web has dropdowns and a submenu but no custom context menu. Mobile uses long-press action sheets. The retained desktop code has a right-click file menu. VS Code and Chrome use host menus.

Area: [8. Basic interactive elements](README.md). Requirement items: [S8.34](../../10-requirements/capabilities/008-basic-interactive-elements.md#s834), [S8.35](../../10-requirements/capabilities/008-basic-interactive-elements.md#s835), [S8.36](../../10-requirements/capabilities/008-basic-interactive-elements.md#s836).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Offers actions for an item without cluttering the screen: rename a chat, move it to a project, create or delete a file.

**Why it exists.** The brief requires menus with proper keyboard behaviour (arrow keys, Escape and return of focus) and context actions where the platform expects them (doc: knowledge-base/data/area-briefs/008-basic-interactive-elements.md S8.34 to S8.36).

**Who uses it.** Everyone managing chats, projects and files.

**Problems it solves**

- Many actions in little space.
- Keyboard users reaching actions.
- Touch users reaching actions with long-press.

**Use cases**

- Open 'Conversation options' on web, choose Rename.
- Open 'Move to project' submenu and pick a project.
- Long-press a project on mobile to see its actions.
- Right-click a file in the retained desktop file tree.

## 2. User experience

**Where to find it**

- Web: button 'Conversation options' with items Rename, 'Edit chat instructions' or 'Add chat instructions', and a submenu 'Move to project' or 'Change project' (apps/web/features/chat/components/ConversationTitleMenu.tsx:137-175).
- Desktop public (Electron): hosted web, same menus (doc: AGENTS.md section 5). Retained Tauri code: right-click file menu with New file, New folder, Rename, Delete (apps/desktop/src/features/code/FileTree.tsx:582-660) and tab context menu (apps/desktop/src/features/code/CodeWorkspace.tsx:279,601).
- Mobile: long-press a project card opens project actions (apps/mobile/app/(app)/(tabs)/projects.tsx:149-154,401); filter menu 'Show projects' (projects.tsx:176-188); audio route picker (apps/mobile/src/features/voice/components/AudioRoutePicker.tsx).
- CLI: slash popup opened by typing / and @ popup (apps/cli/src/tui/widgets/command_popup.rs, mention_popup.rs).
- VS Code: editor right-click group 'agi-workforce' with commands such as explain, fix, refactor (apps/extension-vscode/package.json:980-1032).
- Chrome: browser right-click items from chrome.contextMenus: ask, explain, translate, rewrite, ask about page, summarize page, add to tab group (apps/extension/src/background.ts:7455-7488).

**Before you start**

- Web submenu appears only when a move handler exists and the person has projects (ConversationTitleMenu.tsx:153).

**Screens and controls**

- Web trigger with aria-label 'Conversation options' and a chevron (ConversationTitleMenu.tsx:141-148).
- Desktop menu panel role=menu with role=menuitem rows, clamped inside the window (FileTree.tsx:449-466,588).
- Mobile actions list with labels, a selected mark and a close function (projects.tsx:176-188).
- CLI popup rows with Up, Down, Enter, Tab, Esc (command_popup.rs:185-200).

**Journey**

1. Open the menu (click, right-click, long-press or type / or @).
2. Move through items with arrow keys or touch.
3. Press Enter or tap to run an item; Esc or an outside click closes.
4. Focus returns to the trigger (web hook).

**What the person sees and gets**

- Item runs its action; menu closes.
- Web submenu opens beside the parent item.

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Shared DropdownMenu wrapper includes sub-menu parts (packages/ui/ui/src/primitives/DropdownMenu.tsx:17,56-69).
- Web ConversationTitleMenu uses it with a submenu (ConversationTitleMenu.tsx:148-175).
- useMenuKeyboard gives hand-built menus ArrowUp, ArrowDown, Home, End and Escape handling in the capture phase (packages/ui/ui/src/primitives/useMenuKeyboard.ts:5-50).
- Retained desktop FileTree context menu opens at the pointer, is kept in the window, closes on click or another context menu, and uses useMenuKeyboard (FileTree.tsx:449-490).
- Mobile long-press opens an actions list (projects.tsx:149-154).
- VS Code contributes editor context menu entries (package.json:980-1032) and Chrome registers browser context items (background.ts:7455-7488).

**Incomplete**

- Brief says desktop context menu is missing; the retained Tauri code has one (FileTree.tsx), but Electron Desktop shows web, which has no custom context menu (search found only a default-prevent in SlackSection.tsx:657).
- Nested menus exist on web only in the files read; mobile, CLI, VS Code and Chrome show none, matching the brief.

**Present but disconnected or switched off**

- Web SlackSection onContextMenu only blocks the default menu on a disabled link (SlackSection.tsx:657-659); it is not a context menu.

**Not available**

- Custom context menu on web chat items.
- Nested menus on mobile, CLI, VS Code, Chrome.

## 4. Required behaviour

**Established requirements**

- Dropdown menus open a list of actions with menu keyboard behaviour (arrows move, Escape closes, focus returns). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.34)
- Context menus open on the item under the pointer, keep it in view, and close on click or Escape. (source: S8.35 in the same brief)
- A nested menu has an item that opens a submenu. (source: S8.36 in the same brief)

**Acceptance criteria**

1. On web, opening 'Conversation options' and pressing Down focuses Rename; Escape closes and focus returns to the trigger.
2. On web, 'Move to project' opens a submenu listing projects and choosing one moves the chat.
3. In the retained desktop file tree, right-click near the window edge keeps the whole menu visible.
4. In the retained desktop tree, pressing Escape closes the menu.
5. On mobile, long-pressing a project opens its actions and Close dismisses them.
6. In VS Code, selecting code and right-clicking shows the agi-workforce group.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A context menu must also be reachable by keyboard (Shift+F10 or a menu key) [inferred from WAI-ARIA practice; not found in code].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a context menu to web chat list items, or mark it n/a for web.
- [proposed] Test the retained desktop FileTree menu; no test file exists beside it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | DropdownMenu primitives | `packages/ui/ui/src/primitives/DropdownMenu.tsx` | Radix menu wrappers including Sub |
| hook | useMenuKeyboard | `packages/ui/ui/src/primitives/useMenuKeyboard.ts` | Keyboard contract for hand-built menus |
| component | ConversationTitleMenu | `apps/web/features/chat/components/ConversationTitleMenu.tsx` | Dropdown with submenu |
| component | FileTree | `apps/desktop/src/features/code/FileTree.tsx` | Right-click file menu (retained Tauri) |
| component | CodeWorkspace | `apps/desktop/src/features/code/CodeWorkspace.tsx` | Tab context menu |
| screen | Mobile projects tab | `apps/mobile/app/(app)/(tabs)/projects.tsx` | Long-press actions and filter menu |
| component | AudioRoutePicker | `apps/mobile/src/features/voice/components/AudioRoutePicker.tsx` | Mobile menu-like picker |
| component | command_popup | `apps/cli/src/tui/widgets/command_popup.rs` | Slash command popup |
| component | mention_popup | `apps/cli/src/tui/widgets/mention_popup.rs` | @ file popup |
| config | VS Code menus | `apps/extension-vscode/package.json` | Menu contributions (editor/context, view/title) |
| service | commandSetup | `apps/extension-vscode/src/core/commandSetup.ts` | Registers the commands |
| service | Chrome context menu items | `apps/extension/src/background.ts` | chrome.contextMenus.create |
| test | DropdownMenu.test | `packages/ui/ui/src/primitives/__tests__/DropdownMenu.test.tsx` | Dropdown tests |
| test | useMenuKeyboard.test | `packages/ui/ui/src/primitives/__tests__/useMenuKeyboard.test.tsx` | Keyboard contract tests |
| test | conversation-actions-menu.test | `apps/mobile/__tests__/conversation-actions-menu.test.ts` | Mobile actions menu |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Trigger click, right-click, long-press or key opens a menu with a state flag. | device | FileTree.tsx:449-466; projects.tsx:149 |
| Arrow keys move focus among items; Escape closes. | device | useMenuKeyboard.ts:5-50 |
| Choosing an item runs its handler (for example rename or move to project), which may call the server. | device and our servers | ConversationTitleMenu.tsx:149-165 handlers; server call not traced |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Menu open state | Component memory | No | Discarded on close |

**Models and providers.** None.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Menu actions follow the account rules of the action (for example moving a chat needs a signed-in account); not traced. |
| Permissions | VS Code editor entries use 'when' conditions such as editorHasSelection (package.json:983). |
| Subscription | None found in the menu code. |
| Limits and metering | None found. |
| Feature flags | None found. |
| Model compatibility | None. |
| Provider restrictions | None. |
| Local mode | Menus work on the device in Local mode; actions behind them follow their own rules. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Menu near the window edge | Retained desktop menu is clamped using fixed width 200 and height values | FileTree.tsx:451-466 |
| Disabled items | useMenuKeyboard skips disabled items by default | useMenuKeyboard.ts:35-41 |
| No projects | Web submenu is hidden | ConversationTitleMenu.tsx:153 |
| Scope change on mobile | Long-press is ignored if the scope is no longer current | projects.tsx:151 |
| Escape on context menu | Handled by useMenuKeyboard onClose in FileTree | FileTree.tsx:488-492 |
| Loading, offline, retry | Not handled in the menu code | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/primitives/__tests__/DropdownMenu.test.tsx`: Shared dropdown
- `packages/ui/ui/src/primitives/__tests__/useMenuKeyboard.test.tsx`: Keyboard behaviour for hand-built menus
- `apps/mobile/__tests__/conversation-actions-menu.test.ts`: Mobile conversation actions
- `apps/mobile/__tests__/LibraryActionMenus.test.tsx`: Mobile library action menus
- `apps/mobile/__tests__/ProjectsListErgonomics.test.tsx`: Projects list interactions (content not opened)

**Test scenarios**

- **Web dropdown keyboard**
  1. Tab to 'Conversation options', press Enter.
  2. Press Down, Escape.
  - Expected: Items focus in order; menu closes; focus returns to the trigger.
- **Web submenu**
  1. Open the menu, open 'Move to project', choose a project.
  - Expected: Chat moves and menu closes.
- **Desktop tree edge**
  1. Right-click a file at the bottom-right of the window.
  - Expected: Menu fully visible, items New file or Rename listed.
- **Mobile long-press**
  1. Long-press a project in the Projects tab.
  - Expected: Action list opens.
- **VS Code editor menu**
  1. Select text in an editor, right-click.
  - Expected: AGI group items appear.
- **Chrome page menu**
  1. Select text on a page, right-click.
  - Expected: AGI items for selection appear.

**Where to look when it fails**

- Chrome logs 'contextMenus.create(<id>) failed' on a bad item (background.ts:7491).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/008-basic-interactive-elements.md](../../70-qa/test-plans/web/008-basic-interactive-elements.md)
- Desktop: [70-qa/test-plans/desktop/008-basic-interactive-elements.md](../../70-qa/test-plans/desktop/008-basic-interactive-elements.md)
- Mobile: [70-qa/test-plans/mobile/008-basic-interactive-elements.md](../../70-qa/test-plans/mobile/008-basic-interactive-elements.md)
- CLI: [70-qa/test-plans/cli/008-basic-interactive-elements.md](../../70-qa/test-plans/cli/008-basic-interactive-elements.md)
- VS Code: [70-qa/test-plans/vscode/008-basic-interactive-elements.md](../../70-qa/test-plans/vscode/008-basic-interactive-elements.md)
- Chrome: [70-qa/test-plans/chrome/008-basic-interactive-elements.md](../../70-qa/test-plans/chrome/008-basic-interactive-elements.md)

## 10. Gaps and dependencies

- **No custom context menu on web chat or sidebar items.** Affects: Web and Electron Desktop. Evidence: search for onContextMenu in apps/web found only SlackSection.tsx:657. Work needed: Add one or mark n/a.
- **Retained desktop FileTree menu has no test and the brief says missing.** Affects: Desktop Tauri code. Evidence: no FileTree test file in apps/desktop/src/features/code. Work needed: Add tests, correct the brief.
- **Context menu has no keyboard open path.** Affects: Keyboard users. Evidence: FileTree.tsx:449 opens only on a mouse event. Work needed: Add Shift+F10 or menu key.
- **Brief code references are stale (background.ts:4526, commandSetup.ts:965).** Affects: Documentation. Evidence: background.ts:4520-4535 is message handling. Work needed: Refresh.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-shared-ui-and-design
- file:packages/ui/ui/src/primitives/DropdownMenu.tsx
- file:packages/ui/ui/src/primitives/useMenuKeyboard.ts

## Unknown

- Whether the Electron Desktop adds any native context menu (electron/appMenu.ts exists, not read).
- Exact chrome menu labels in English (they use translation keys).
- What the mobile long-press list contains per item.
- Whether the VS Code view/item menus exist beyond the lines read.
