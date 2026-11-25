---
id: "F005-08"
type: "feature"
title: "Command palette and keyboard shortcut help"
aliases: ["Command palette", "Cmd/Ctrl+K", "Global command palette", "Keyboard shortcuts dialog", "Keyboard shortcut help", "Slash-command popup (CLI)", "KEYBOARD_SHORTCUT_DOCS"]
area: "5 Application shell and navigation components"
available_on: ["web", "desktop", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "seen failing", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S5.26", "S5.27"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "surface:vscode", "surface:chrome", "SYS-shared-ui-and-design", "SYS-model-catalog-and-routing", "file:apps/web/app/AppRuntimeMounts.tsx", "store:web-settings-store"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F005-08 Command palette and keyboard shortcut help

A keyboard-opened box where a person types to find and run commands or jump to chats and screens, plus a Keyboard shortcuts help dialog. Web and Desktop share one palette (Cmd/Ctrl+K). CLI has a slash-command popup, VS Code uses its own command palette, Chrome has its own side-panel palette. Mobile has neither.

Area: [5. Application shell and navigation components](README.md). Requirement items: [S5.26](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s526), [S5.27](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s527).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen failing |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Searches app actions, chats, preferences and model choices from one text box and runs the chosen one. A separate dialog lists the keyboard shortcuts.

**Why it exists.** Keyboard users and power users reach any command without hunting through menus. The brief asks for a keyboard-invoked palette (S5.26) and a shortcut help view reachable from the app (S5.27).

**Who uses it.** Keyboard-first users on Web, Desktop, CLI, VS Code and Chrome.

**Problems it solves**

- Finding a screen or action without remembering where it lives.
- Learning which shortcuts exist.
- Switching model or theme quickly.

**Use cases**

- Press Cmd+K, type 'settings', press Enter to open Settings.
- Press Cmd+K, type a chat title to jump to it.
- Open Account menu > Get help > Keyboard shortcuts to read the list.
- In the CLI type / to filter slash commands and press Enter to run one.

## 2. User experience

**Where to find it**

- Web and Desktop: press Cmd+K or Ctrl+K anywhere (apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx:17-29). Its search box placeholder reads 'Search chats and actions' (CommandPalette.tsx:506).
- Web and Desktop help: Account menu > 'Get help' > 'Keyboard shortcuts', which shows the '/' shortcut hint (apps/web/shared/components/layout/AccountMenuItems.tsx:80-93). Desktop also has a host command 'show-keyboard-shortcuts' (packages/contracts/local-runtime/src/host-bridge.ts:90).
- CLI: slash-command popup titled 'Commands', hint 'Type to filter ↑↓ navigate Enter select Esc cancel' (apps/cli/src/tui/widgets/command_popup.rs:12-14); keybindings include an OpenPalette action (apps/cli/src/keybindings.rs:13-31).
- Chrome extension: side-panel palette opened with Cmd/Ctrl+K (apps/extension/src/side_panel.ts:13634-13642).
- VS Code: its own Command Palette lists the extension's commands (apps/extension-vscode/package.json contributes commands; line citations in the brief were not matched). A 'Keyboard shortcuts' item in the Help menu opens VS Code's keybindings screen (apps/extension-vscode/src/features/help/helpMenu.ts:25-29).
- Mobile: not listed in the brief for either item; none opened.

**Before you start**

- Web and Desktop: the shell is mounted (palette is mounted once from apps/web/app/AppRuntimeMounts.tsx:17).
- Some palette entries depend on workspace policy and sign-in (CommandPalette.tsx imports useDisabledWorkspaceFeatures and useSession).

**Screens and controls**

- Palette dialog with search box, groups such as 'Quick actions', 'Preferences', 'Recents', 'Actions', 'Search results' and a model submenu with 'Filter models…' (CommandPalette.tsx:129-284, 506).
- Empty result text 'No commands found.' (CommandPalette.tsx:567).
- Shortcuts dialog (KeyboardShortcutsDialog) fed by KEYBOARD_SHORTCUT_DOCS (apps/web/shared/components/layout/WebAppShell.tsx:620-624).

**Journey**

1. 1. Press Cmd/Ctrl+K.
2. 2. The palette code is loaded on first press, then the dialog opens.
3. 3. Type to filter; chat search results are fetched through the global search service.
4. 4. Move with arrows and press Enter to run; choosing the model entry opens a model submenu.
5. 5. Press Cmd/Ctrl+K again to close.

**What the person sees and gets**

- The chosen action runs (navigate, change theme, open upgrade, switch model).
- 'No commands found.' when nothing matches.

**Settings**

- Shortcut bindings and disabled shortcut ids are held in the settings store (apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx:204-205).
- CLI keybindings are configurable by name (apps/cli/src/keybindings.rs:193-205).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop palette opens on Cmd/Ctrl+K in capture phase and stops the chat page's own Cmd/Ctrl+K so one shortcut works everywhere (CommandPaletteProvider.tsx:17-29).
- Palette is lazy loaded and only created after the first press (CommandPaletteProvider.tsx:7-10, 31-32).
- Palette offers navigation, theme, upgrade, model switch and chat search (CommandPalette.tsx imports at lines 3-62).
- Shortcuts dialog is opened from the Account menu and rendered by the shell (AccountMenuItems.tsx:88-93; WebAppShell.tsx:620-624).
- CLI popup filters slash commands with fuzzy match, Tab fills the composer (command_popup.rs:1-10).
- Chrome palette with ranked matching and Cmd/Ctrl+K (apps/extension/src/features/side-panel/commandPalette.ts:104-110; side_panel.ts:13634-13642).

**Incomplete**

- Failure state when chat search fails in the palette: not traced.

**Present but disconnected or switched off**

- none found

**Not available**

- Command palette and shortcut help on Mobile (not listed in the brief; no file opened).

## 4. Required behaviour

**Established requirements**

- A global command palette (keyboard-invoked) searches and runs app commands and destinations. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.26)
- A keyboard-shortcut help view lists the available shortcuts and is reachable from the app. (source: S5.27 Should (same brief))

**Acceptance criteria**

1. Cmd/Ctrl+K opens the palette on Web from any page, including chat, and a second press closes it.
2. Typing filters entries; Enter runs the highlighted one.
3. A search with no match shows 'No commands found.'
4. Account menu > Get help > Keyboard shortcuts opens the list.
5. The shortcut list shows the person's current bindings.
6. In the CLI, typing / opens the popup, a typo shows '(no matching commands)', Esc cancels.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The palette should hide entries the workspace has switched off [inferred from useDisabledWorkspaceFeatures import].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer a palette or shortcut help on Mobile only if the owner wants it; none is required by the brief.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CommandPaletteProvider | `apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx` | Global Cmd/Ctrl+K listener and lazy mount |
| component | CommandPalette | `apps/web/shared/components/CommandPalette/CommandPalette.tsx` | Palette dialog, groups, search, model submenu |
| component | AppRuntimeMounts | `apps/web/app/AppRuntimeMounts.tsx` | Mounts the palette once |
| component | KeyboardShortcutsDialog | `apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx` | Shortcut list dialog |
| component | AccountMenuItems | `apps/web/shared/components/layout/AccountMenuItems.tsx` | Menu entry that opens shortcut help |
| component | WebAppShell | `apps/web/shared/components/layout/WebAppShell.tsx` | Renders the dialog with KEYBOARD_SHORTCUT_DOCS |
| hook | use-keyboard-shortcuts | `apps/web/features/chat/hooks/use-keyboard-shortcuts.ts` | Chat keyboard shortcut handling (contents not read) |
| service | globalSearchService | `apps/web/features/chat/services/global-search-service.ts` | Chat search for the palette (imported by CommandPalette.tsx:55-59) |
| other | nav items | `apps/web/shared/components/layout/app-nav-items.ts` | Destinations the palette reuses |
| config | host shortcuts | `packages/contracts/local-runtime/src/host-bridge.ts` | Desktop host shortcut ids including show-keyboard-shortcuts |
| component | CommandPopup | `apps/cli/src/tui/widgets/command_popup.rs` | CLI slash-command popup |
| config | KeybindingAction | `apps/cli/src/keybindings.rs` | CLI bindings including OpenPalette |
| component | buildCommandPalette | `apps/extension/src/features/side-panel/commandPalette.ts` | Chrome side-panel palette |
| component | showHelpMenu | `apps/extension-vscode/src/features/help/helpMenu.ts` | VS Code help menu with keyboard shortcuts item |
| test | CommandPaletteProvider test | `apps/web/shared/components/CommandPalette/CommandPaletteProvider.test.tsx` | Provider behaviour |
| test | command palette e2e | `apps/web/e2e/command-palette-global-shortcut.spec.ts` | Global shortcut end to end |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Key press is caught on the document in capture phase and toggles the palette | device | CommandPaletteProvider.tsx:14-29 |
| Palette code is loaded on first use | device | CommandPaletteProvider.tsx:7-10 |
| Typed text filters local command entries; chat results come from the global search service (may call our servers) | device and our servers | CommandPalette.tsx:55-59 imports globalSearchService; server call itself not traced |
| The chosen action runs: navigation via the router, theme via next-themes, upgrade via the app command | device | CommandPalette.tsx:3-4, 62 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Open and requested flags | component memory only | no | lost on reload |
| Shortcut bindings and disabled ids | settings store (apps/web/shared/stores/web-settings-store) | unknown | unknown |

**Models and providers.** The palette lists AVAILABLE_MODELS from the model store and lets the person pick one, grouped by provider (CommandPalette.tsx:284). It does not itself call a model. Which models are shown depends on the model catalog [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The palette mounts for all Web pages in AppRuntimeMounts; signed-in state affects some entries (useSession import). Exact signed-out contents: unknown. |
| Permissions | Entries follow workspace-disabled features (useDisabledWorkspaceFeatures import, CommandPalette.tsx:46). |
| Subscription | An 'upgrade' command exists (CommandPalette.tsx:62 imports openUpgrade); the palette does not itself check a plan. |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Model entries come from the model store; availability by plan is not decided in the palette file read. |
| Provider restrictions | none found in the code |
| Local mode | The palette and shortcut help run on the device; navigation entries work offline. Chat search likely needs the server [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| empty results | 'No commands found.' | CommandPalette.tsx:567 |
| shortcut clash with chat page search | Palette wins; event stopped | CommandPaletteProvider.tsx:17-25 |
| first open | Nothing renders until first press | CommandPaletteProvider.tsx:31 |
| search failure | not traced | CommandPalette.tsx search flow not read |
| loading chat results | not traced | CommandPalette.tsx search flow not read |
| CLI no match | '(no matching commands)' | command_popup.rs:13 |
| accessibility | Dialog has title and description ('Search commands, navigate the app, change preferences, and switch AI models.'); Chrome palette has role=dialog, aria-modal | CommandPalette.tsx:478; commandPalette.ts:115-120 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/shared/components/CommandPalette/CommandPalette.test.tsx`: Palette behaviour
- `apps/web/shared/components/CommandPalette/CommandPaletteProvider.test.tsx`: Provider and shortcut
- `apps/web/shared/components/CommandPalette/CommandPalette.shortcut-hints.test.tsx`: Shortcut hints
- `apps/web/shared/components/CommandPalette/CommandPalette.legibility.test.tsx`: Legibility
- `apps/web/e2e/command-palette-global-shortcut.spec.ts`: Global shortcut in a browser
- `apps/web/features/chat/components/dialogs/__tests__/KeyboardShortcutsDialog.registry.test.tsx`: Shortcut registry in the dialog
- `apps/web/features/chat/components/dialogs/__tests__/KeyboardShortcutsDialog.narrow-layout.test.tsx`: Narrow layout
- `apps/web/features/chat/__tests__/account-menu-shortcut-hint.test.ts`: Hint in the account menu

**Test scenarios**

- **Open and close**
  1. Open Web chat
  2. Press Cmd/Ctrl+K twice
  - Expected: Palette opens then closes; chat search dialog does not open
- **Run a command**
  1. Open palette
  2. Type 'settings'
  3. Press Enter
  - Expected: Settings opens
- **No match**
  1. Open palette
  2. Type random letters
  - Expected: 'No commands found.'
- **Shortcut help**
  1. Open Account menu
  2. Get help > Keyboard shortcuts
  - Expected: Dialog lists shortcuts
- **CLI popup**
  1. Start the CLI
  2. Type /pl
  3. Press Enter
  - Expected: Matching command runs; Tab fills the composer instead

**Where to look when it fails**

- Browser console on the Web page for the dynamic import of the palette.
- Run the e2e spec named above.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/web/005-application-shell-and-navigation-components.md)
- Desktop: [70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md)
- CLI: [70-qa/test-plans/cli/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/cli/005-application-shell-and-navigation-components.md)
- VS Code: [70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md)
- Chrome: [70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md)

## 10. Gaps and dependencies

- **Palette search failure and empty-loading states not traced** Affects: Web, Desktop. Evidence: not found in the code read. Work needed: Read CommandPalette.tsx search flow and test failure
- **No palette or shortcut help on Mobile** Affects: Mobile. Evidence: Brief lists no mobile status. Work needed: Decide if required

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- surface:vscode
- surface:chrome
- SYS-shared-ui-and-design
- SYS-model-catalog-and-routing
- file:apps/web/app/AppRuntimeMounts.tsx
- store:web-settings-store

## Unknown

- Mobile: whether any palette exists.
- Signed-out palette contents.
- Palette search failure behaviour.
- Whether shortcut bindings sync across devices.
- Exact CLI keybinding for OpenPalette (default not read).
- VS Code command palette entries were not opened beyond the help menu.
