---
id: "F011-02"
type: "feature"
title: "Keyboard operation of menus, dialogs and focus"
aliases: ["Keyboard navigation (S11.03)", "Visible focus indicators (S11.04)", "Focus management across dialogs (S11.05)", "Focus restoration (S11.06)", "Platform-specific shortcut notation (S11.26)", "useMenuKeyboard", "useDialogKeyboard", "shortcutLabel"]
area: "11 Accessibility and localization components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "seen failing", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S11.03", "S11.04", "S11.05", "S11.06", "S11.26"]
depends_on: ["surface:web", "surface:desktop", "surface:vscode", "surface:chrome", "surface:cli", "surface:mobile", "file:packages/ui/ui/src/primitives/useMenuKeyboard.ts", "file:packages/ui/ui/src/primitives/useDialogKeyboard.ts", "file:packages/ui/ui/src/platformKeys.ts", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F011-02 Keyboard operation of menus, dialogs and focus

Lets a keyboard-only person reach every control, use arrow keys, Home, End and Escape in menus, keep Tab inside dialogs, get focus back where it was, and see a focus ring. Shortcut hints show Cmd on Apple and Ctrl elsewhere. Web, Desktop, VS Code, Chrome and the CLI have it; Mobile has dialog semantics only.

Area: [11. Accessibility and localization components](README.md). Requirement items: [S11.03](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1103), [S11.04](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1104), [S11.05](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1105), [S11.06](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1106), [S11.26](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1126).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen failing |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Implements the standard keyboard rules for menus and dialogs as shared hooks, draws focus indicators, and computes the right shortcut label for the platform.

**Why it exists.** People who cannot use a mouse need to operate every control; the product lists keyboard-only checks, focus entering and returning from dialogs and menus that stay operable as a release test (doc: docs/product/experience-contract.md:796).

**Who uses it.** Keyboard-only and switch users, screen-reader users, power users, on Web, Desktop, VS Code, Chrome and CLI.

**Problems it solves**

- Arrow keys walking focus out of an open menu into the page behind it.
- Focus lost on the page after a dialog closes.
- A hint that says Ctrl on a Mac.

**Use cases**

- Open the sidebar conversation menu, press Arrow Down, Home, End, Escape; focus returns to the trigger.
- Open a hand-rolled dialog; Tab cycles inside; Escape closes and focus goes back to the button that opened it.
- Read 'Cmd K' vs 'Ctrl K' in the desktop sidebar search hint.
- In the terminal CLI, press Esc to cancel a popup, arrows to move.

## 2. User experience

**Where to find it**

- Web and Desktop: every menu or dialog built with the shared hooks (packages/ui/ui/src/primitives/useMenuKeyboard.ts, useDialogKeyboard.ts); account menu shows the shortcut for '/' via shortcutLabel (apps/web/shared/components/layout/AccountMenuItems.tsx:112); desktop sidebar search hint uses shortcutLabel('K') (apps/desktop/src/features/v3/Sidebar.tsx:432).
- VS Code sidebar: actions menu, plus menu, slash menu, model and controls popovers, sessions sheet (webviewContent.ts:6112-6123,6887,6981-7004).
- Chrome side panel: model dropdown and recents sheet (apps/extension/src/side_panel.ts:11440-11470,13064-13085).
- CLI: command popup hint 'Type to filter ↑↓ navigate Enter select Esc cancel' (apps/cli/src/tui/widgets/command_popup.rs:17); custom keybindings in config (apps/cli/src/keybindings.rs).
- Mobile: modals use accessibilityViewIsModal and onRequestClose (apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx:170-171).

**Before you start**

- A physical keyboard (or a terminal for the CLI).
- On Mobile, a screen reader or hardware keyboard; the app has no keyboard menu code of its own that I found.

**Screens and controls**

- Menus: Arrow Down, Arrow Up, Home, End, Escape, Tab (closes the menu).
- Dialogs: focus enters the first focusable control, Tab and Shift+Tab wrap inside, Escape closes.
- Focus ring: a 2px outline on :focus-visible on web (apps/web/app/globals.css:1233-1236); text fields get an inset border instead (globals.css:1249-1252).
- Resize handles: Arrow Left and Right, Home and End (apps/web/features/chat/components/SidePanelResizeHandle.tsx:44-55).

**Journey**

1. Press Tab until the trigger button has the focus ring.
2. Press Enter or Space to open the menu; the first item is focused.
3. Use arrow keys, Home or End to move; disabled items are skipped by default.
4. Press Escape; the menu closes and focus returns to the trigger.
5. For dialogs: open, Tab around (it wraps), press Escape; focus returns to the opener.

**What the person sees and gets**

- A visible focus ring.
- Shortcut hint text in menus and tooltips.
- CLI popup hint line.

**Settings**

- High contrast toggle in Appearance changes the focus ring colour via data-contrast (apps/web/shared/components/AppearancePreferences.tsx:39-43; apps/web/app/globals.css:1270-1277).
- CLI keybindings configured by name in config (apps/cli/src/keybindings.rs:34-46).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- useMenuKeyboard: capture-phase listener; Escape closes and refocuses the trigger, Tab closes the menu, arrows, Home, End move with wrap, disabled items skipped (packages/ui/ui/src/primitives/useMenuKeyboard.ts:17-88).
- useDialogKeyboard: records the opener, focuses first focusable (or the panel), traps Tab both ways, closes on Escape, restores focus to the opener on close (packages/ui/ui/src/primitives/useDialogKeyboard.ts:29-119).
- shortcutLabel and primaryModifierLabel use userAgentData, then navigator.platform, then userAgent to choose the Apple symbol or Ctrl (packages/ui/ui/src/platformKeys.ts:6-32).
- Web global focus-visible ring and a main-content exception (apps/web/app/globals.css:1233-1239).
- Desktop (Tauri src) uses the hooks in FileTree, ProjectRow, Sidebar, ThemeEditorDialog (apps/desktop/src/features/code/FileTree.tsx:488; features/v3/ProjectRow.tsx:118; features/settings/ThemeEditorDialog.tsx:238) and has a global :focus-visible rule (apps/desktop/src/styles/globals.css:371).
- Web side-panel resize handle is keyboard operable with ARIA separator values (SidePanelResizeHandle.tsx:44-70).
- VS Code: webview has its own Escape, Arrow and focus-restore code for menus and the sessions sheet; focus-visible rules (webviewContent.ts:547-548,6112-6123,6441-6452).
- Chrome: model dropdown handles Escape, Tab, Arrow, Home, End and refocuses the button; recents sheet traps Tab and restores focus to the history button (apps/extension/src/side_panel.ts:11440-11470,13064-13085); focus-visible outlines throughout (side_panel.ts:2061).
- CLI: user-configurable keybindings with validation against keys the composer owns (apps/cli/src/keybindings.rs:191-251); command popup navigation hints (command_popup.rs:17).

**Incomplete**

- VS Code computes its own label (MOD_KEY_LABEL 'Cmd' or 'Ctrl') instead of using the shared helper, and it prints the word 'Cmd' rather than the symbol (webviewContent.ts:4458,5090-5093).
- Mobile focus restoration after panel closure is unverified (brief S11.06 mobile: unverified).
- Chrome and Mobile show no platform shortcut notation I could find; the brief lists no status for them (S11.26).

**Present but disconnected or switched off**

- None found.

**Not available**

- Mobile has no keyboard-menu hook equivalent in the files I opened; hardware keyboard support is not established.
- CLI has no focus ring concept; it draws a cursor marker (command_popup.rs:157-160).

## 4. Required behaviour

**Established requirements**

- Everything can be reached and operated from the keyboard, including menus with arrow keys and Escape. (source: brief S11.03 Should)
- The focused control always shows a clearly visible focus indicator. (source: brief S11.04 Should)
- Opening a dialog moves focus into it, Tab stays inside, Escape closes it. (source: brief S11.05 Should)
- Closing a dialog, menu or panel returns focus to the control that opened it. (source: brief S11.06 Should)
- Shortcut hints use the platform's notation (Cmd symbol on Apple, Ctrl elsewhere). (source: brief S11.26 Should)
- Hover-only actions also appear on keyboard focus. (source: doc: docs/product/experience-contract.md:201)
- No field takes focus when a screen opens on a touch screen, except sign-in. (source: doc: docs/decisions/2026-11-13-founder-decisions.md:207-209)

**Acceptance criteria**

1. Tab order reaches every control in web chat, with a visible ring on each.
2. In any shared menu, Arrow Down from the last item wraps to the first; Home and End jump; Escape closes and focus is on the trigger.
3. In a shared dialog, Shift+Tab on the first control goes to the last; Tab on the last goes to the first; Escape closes; focus returns to the opener.
4. On macOS the hint shows the Apple symbol; on Windows or Linux it shows 'Ctrl+'.
5. In the CLI, Esc closes the command popup and arrows move the cursor.
6. In VS Code and Chrome, Escape closes menus and returns focus to their button.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- VS Code and Chrome should use one shared label helper for notation [inferred from duplicate logic].
- Desktop public behaviour equals web behaviour [inferred, Electron loads hosted web app].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the VS Code webview and Chrome panel use the Apple symbol the same way as web.
- [proposed] Add a mobile hardware-keyboard test pass.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useMenuKeyboard | `packages/ui/ui/src/primitives/useMenuKeyboard.ts` | Menu keyboard contract, capture phase, focus restore to trigger. |
| hook | useDialogKeyboard | `packages/ui/ui/src/primitives/useDialogKeyboard.ts` | Dialog focus entry, trap, Escape, restore to opener. |
| service | platformKeys | `packages/ui/ui/src/platformKeys.ts` | isApplePlatform, primaryModifierLabel, shortcutLabel. |
| component | Sidebar Menu | `packages/ui/ui/src/sidebar/Menu.tsx` | Shared sidebar menu that uses the menu hook (cited by the brief at line 113). |
| component | CommandPaletteProvider | `apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx` | Web command palette keyboard entry (cited by the brief). |
| component | AccountMenuItems | `apps/web/shared/components/layout/AccountMenuItems.tsx` | Shows shortcutLabel('/') in the account menu (line 112). |
| component | SidePanelResizeHandle | `apps/web/features/chat/components/SidePanelResizeHandle.tsx` | Separator with arrow, Home, End resizing. |
| component | WebAppShell | `apps/web/shared/components/layout/WebAppShell.tsx` | Mobile nav drawer sheet with Escape handling and return focus (lines 685-695). |
| config | globals.css focus rules | `apps/web/app/globals.css` | Focus ring, text-field treatment, contrast override (lines 1233-1277). |
| component | Desktop Sidebar | `apps/desktop/src/features/v3/Sidebar.tsx` | Uses shortcutLabel and useMenuKeyboard (lines 45,432). |
| component | Desktop FileTree | `apps/desktop/src/features/code/FileTree.tsx` | useMenuKeyboard for its context menu (line 488). |
| component | Desktop ThemeEditorDialog | `apps/desktop/src/features/settings/ThemeEditorDialog.tsx` | useDialogKeyboard (line 238). |
| config | Desktop globals.css | `apps/desktop/src/styles/globals.css` | Global :focus-visible rule (line 371). |
| component | VS Code webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Menus, popovers, sheets with arrows, Escape and focus restore; MOD_KEY_LABEL (line 4458). |
| component | Chrome side panel | `apps/extension/src/side_panel.ts` | Model dropdown and recents keyboard code, focus rings. |
| service | CLI keybindings | `apps/cli/src/keybindings.rs` | Named actions, parsing, validation, help text. |
| component | CLI command popup | `apps/cli/src/tui/widgets/command_popup.rs` | Popup with keyboard hint and Esc cancel. |
| component | Mobile CompanionDemoWalkthrough | `apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx` | Modal with onRequestClose and accessibilityViewIsModal (lines 170-171). |
| test | useDialogKeyboard.test | `packages/ui/ui/src/primitives/__tests__/useDialogKeyboard.test.tsx` | Hook behaviour tests. |
| test | useMenuKeyboard.test | `packages/ui/ui/src/primitives/__tests__/useMenuKeyboard.test.tsx` | Hook behaviour tests. |
| test | qa-09-menu-keyboard.spec | `apps/web/e2e/qa-09-menu-keyboard.spec.ts` | Browser test of sidebar menu arrows and Escape restore. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A key event is caught by a document capture-phase listener installed by the hook while the menu or dialog is open. | device | packages/ui/ui/src/primitives/useMenuKeyboard.ts:56-85; useDialogKeyboard.ts:90-117 |
| The hook moves focus among focusable items or calls onClose, then focuses the stored opener or trigger. | device | useDialogKeyboard.ts:45-55; useMenuKeyboard.ts:59-62 |
| The shortcut label is computed from navigator at render time. | device | packages/ui/ui/src/platformKeys.ts:6-32 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data is stored; the opener element is held in a ref while a dialog is open. | component memory | no | cleared on close (useDialogKeyboard.ts:47-52) |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found in the code. |
| Permissions | None found in the code. |
| Subscription | None found in the code. |
| Limits and metering | None found in the code. |
| Feature flags | None found in the code. |
| Model compatibility | Not applicable: no model involved. |
| Provider restrictions | None found in the code. |
| Local mode | Works fully in Local mode: all logic is on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Menu with no enabled items | Arrow keys do nothing (list empty returns). | useMenuKeyboard.ts:70-72 |
| Dialog with nothing focusable | Tab is blocked and the panel itself is focused with tabindex -1. | useDialogKeyboard.ts:70-82,100-103 |
| Nested editor needs Escape | closeOnEscape=false leaves Escape to the content. | useDialogKeyboard.ts:33-37 |
| Opener removed from page | Focus is not restored when the opener is no longer in the document. | useDialogKeyboard.ts:50-52 |
| Tab inside a menu | The menu closes and Tab continues normally (focus is not trapped). | useMenuKeyboard.ts:63-66 |
| Mobile focus restore | not handled in the code I found; unverified. | brief S11.06 mobile: unverified |
| Platform detection unavailable (no navigator) | Falls back to Ctrl. | platformKeys.ts:6-8 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/primitives/__tests__/useDialogKeyboard.test.tsx`: Focus on open, Escape, Escape handed to content, focus return, Tab trap both ways, empty panel.
- `packages/ui/ui/src/primitives/__tests__/useMenuKeyboard.test.tsx`: Radio and checkbox items, skipping unavailable items, aria-disabled items reachable by option.
- `apps/web/e2e/qa-09-menu-keyboard.spec.ts`: Arrow keys stay inside the open sidebar menu; Escape restores the trigger; project detail menu matches.
- `apps/web/e2e/model-picker-keyboard.spec.ts`: Keyboard use of the model picker (file exists; content not read in detail).
- `apps/web/e2e/landing-keyboard.spec.ts`: Keyboard use of the landing page (file exists; content not read).
- `apps/web/features/chat/__tests__/account-menu-shortcut-hint.test.ts`: The account menu hint matches the binding the shortcut hook listens for.
- `apps/extension-vscode/src/__tests__/popoverKeyboard.webview.test.ts`: Arrow, Escape behaviour of the two composer popovers in the VS Code webview.
- `apps/extension/__tests__/side-panel-a11y.test.ts`: Keyboard-native menu items and tab roving.
- `apps/desktop/wdio/specs/accessibility.spec.ts`: Tab through composer and sidebar; Escape closes Settings and focus returns.
- `apps/desktop/src/features/v3/__tests__/Sidebar.layoutA11y.test.tsx`: Sidebar account menu in rail, keyboard resize and width limits.
- `apps/cli/src/keybindings.rs`: Rust unit tests inside the file: defaults match terminal events, custom bindings, validation, BackTab forms.

**Test scenarios**

- **Menu loop**
  1. Open web, Tab to a sidebar conversation menu trigger, press Enter.
  2. Press Arrow Down past the last item, then Home, End.
  3. Press Escape.
  - Expected: Focus wraps, jumps, and returns to the trigger.
- **Dialog trap**
  1. Open a dialog that uses useDialogKeyboard (desktop theme editor).
  2. Press Tab repeatedly, then Shift+Tab on the first control.
  3. Press Escape.
  - Expected: Focus never leaves the panel; Escape closes; opener is focused.
- **Apple vs other notation**
  1. Open the account menu on a Mac and on Windows.
  - Expected: Apple symbol on Mac, 'Ctrl+' on Windows.
- **VS Code popovers**
  1. Open the model popover, press Arrow Down, Escape.
  - Expected: Items move; popover closes; model pill focused (webviewContent.ts:6981-6984).
- **CLI popup**
  1. Run the CLI TUI, open the command popup, press Esc.
  - Expected: Popup closes without running a command.

**Where to look when it fails**

- Playwright traces for e2e specs.
- DevTools: document.activeElement after close.
- CLI: validate_config error text for bad keybindings (apps/cli/src/keybindings.rs:191).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/011-accessibility-and-localization-components.md](../../70-qa/test-plans/web/011-accessibility-and-localization-components.md)
- Desktop: [70-qa/test-plans/desktop/011-accessibility-and-localization-components.md](../../70-qa/test-plans/desktop/011-accessibility-and-localization-components.md)
- Mobile: [70-qa/test-plans/mobile/011-accessibility-and-localization-components.md](../../70-qa/test-plans/mobile/011-accessibility-and-localization-components.md)
- CLI: [70-qa/test-plans/cli/011-accessibility-and-localization-components.md](../../70-qa/test-plans/cli/011-accessibility-and-localization-components.md)
- VS Code: [70-qa/test-plans/vscode/011-accessibility-and-localization-components.md](../../70-qa/test-plans/vscode/011-accessibility-and-localization-components.md)
- Chrome: [70-qa/test-plans/chrome/011-accessibility-and-localization-components.md](../../70-qa/test-plans/chrome/011-accessibility-and-localization-components.md)

## 10. Gaps and dependencies

- **VS Code uses its own modifier label (text 'Cmd') rather than the shared helper.** Affects: VS Code users on Mac.. Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4458. Work needed: Share one helper or align the output.
- **Mobile focus restoration is unverified and Chrome has no recorded shortcut-notation status.** Affects: Mobile screen-reader users; Chrome users.. Evidence: brief S11.06 and S11.26. Work needed: Test on device; decide notation for Chrome.
- **No recorded run of keyboard e2e specs in the repository.** Affects: All apps.. Evidence: Specs exist but no result file for them was found (only the a11y report for public pages).. Work needed: Run and store results.
- **Hand-rolled keyboard code is duplicated in VS Code and Chrome instead of shared.** Affects: Maintenance; drift risk.. Evidence: webviewContent.ts:3833-3856,6112-6123; side_panel.ts:11440-11470,13064-13085. Work needed: [proposed] Extract a small shared script for the two webview surfaces.

**Depends on**

- surface:web
- surface:desktop
- surface:vscode
- surface:chrome
- surface:cli
- surface:mobile
- file:packages/ui/ui/src/primitives/useMenuKeyboard.ts
- file:packages/ui/ui/src/primitives/useDialogKeyboard.ts
- file:packages/ui/ui/src/platformKeys.ts
- SYS-shared-ui-and-design

## Unknown

- Whether Mobile supports hardware keyboards for these flows.
- Exact line of focus restoration in Chrome for items beyond the two sheets I read.
- Whether model-picker-keyboard and landing-keyboard specs pass; no result recorded.
- Whether apps/web/features/chat dialogs beyond those with the hook trap focus the same way (Radix dialogs are used elsewhere; not audited).
