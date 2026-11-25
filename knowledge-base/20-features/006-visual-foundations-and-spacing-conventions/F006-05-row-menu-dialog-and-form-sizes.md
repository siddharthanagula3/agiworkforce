---
id: "F006-05"
type: "feature"
title: "Row, menu, dialog and form sizes"
aliases: ["Row, menu, dialog and form sizes", "Sidebar row height", "Menu-item height", "Dialog padding", "Form-field spacing", "coarse pointer rows"]
area: "6 Visual foundations and spacing conventions"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S6.21", "S6.22", "S6.23", "S6.24"]
depends_on: ["SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "F006-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F006-05 Row, menu, dialog and form sizes

Gives sidebar rows, menu items, dialogs, sheets and form fields one set height or padding each. Sidebar rows are 34px with a mouse and 44px on touch. Dialogs and sheets use 24px padding and scroll inside their box so buttons stay reachable on short windows.

Area: [6. Visual foundations and spacing conventions](README.md). Requirement items: [S6.21](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s621), [S6.22](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s622), [S6.23](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s623), [S6.24](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s624).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not stated on this page | built | not seen by a person |
| CLI | not stated on this page | built | not seen by a person |
| VS Code | not stated on this page | built | not seen by a person |
| Chrome | not stated on this page | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shared UI primitives fix sizes: sidebar row h-[34px] and h-11 on coarse pointers (packages/ui/ui/src/sidebar/SessionItem.tsx:199), menu items px-2 py-1.5 text-sm (packages/ui/ui/src/primitives/DropdownMenu.tsx:160), dialog and alert dialog p-6 with an inner scroll (Dialog.tsx:115; AlertDialog.tsx:104) and sheets p-6 (Sheet.tsx:36).

**Why it exists.** So lists, menus and dialogs feel the same everywhere, touch targets are large enough and a dialog never hides its own action buttons on a short window (comment in Dialog.tsx:105-110).

**Who uses it.** Everyone who opens a menu, dialog or form; engineers building screens from shared primitives.

**Problems it solves**

- Tiny touch rows
- Dialog buttons off screen on a landscape phone
- Menus with different padding per screen

**Use cases**

- Click a conversation in the sidebar.
- Open a message's overflow menu.
- Open a feedback dialog on a short screen.
- Fill the extension Options form.

## 2. User experience

**Where to find it**

- Web and desktop: sidebar history, menus and dialogs from packages/ui/ui (SessionItem.tsx, DropdownMenu.tsx, Dialog.tsx, Sheet.tsx).
- Mobile: drawer rows (apps/mobile/src/features/drawer/components/DrawerContent.tsx), modals such as the rename modal (apps/mobile/src/features/conversation-actions/RenameConversationModal.tsx), inputs (apps/mobile/components/ui/input.tsx).
- CLI: theme picker overlay (apps/cli/src/tui/widgets/theme_picker.rs).
- VS Code: sessions sheet and settings form (webviewContent.ts:2353-2456; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts).
- Chrome: side panel and Options page (apps/extension/src/side_panel.ts; options.ts).

**Before you start**

- None.

**Screens and controls**

- Sidebar conversation row, dropdown menu items, dialog, alert dialog, sheet, form fields.

**Journey**

1. Open the sidebar and click a row.
2. Open a menu or dialog.
3. On a short window, scroll inside the dialog to reach its buttons.
4. Fill and submit a form.

**What the person sees and gets**

- Focus background on a highlighted menu item (DropdownMenu.tsx:160).
- Dialog scrim and animation (Dialog.tsx:100-115).

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web sidebar row: h-[34px], pointer-coarse:h-11 (SessionItem.tsx:199).
- Web menu item: px-2 py-1.5 text-sm, focus:bg-accent, disabled at half opacity (DropdownMenu.tsx:160); sub-trigger and label use the same padding (:74,:240).
- Web dialog: width min(96vw,42rem), max-height 100dvh minus 2rem, overflow-y-auto, p-6, rounded-2xl, shadow-e4 (Dialog.tsx:115); alert dialog width 36rem same padding (AlertDialog.tsx:104).
- Web sheet: p-6, shadow-e3, max-h 100dvh, overflow-y-auto (Sheet.tsx:36).
- Web inputs on touch screens use 16px text and coarse-pointer selects get min-h-11 (apps/web/app/globals.css:1086-1090; apps/web/features/settings/components/EmbeddedAccountPage.tsx:29).
- Mobile: button and input components; modal padding uses dialogPadding 24 (apps/mobile/src/ui/theme/tokens.ts, dialogPadding).
- VS Code: control heights 24, 28 and 32px (webviewContent.ts:225-228 region).
- Chrome: control heights 30, 32, 34 and touch 44 (side_panel.css:35-38).

**Incomplete**

- Mobile row, modal and input values: I opened only dialogPadding and sizes in tokens.ts; I did not open DrawerContent, StepUpModal or input.tsx.
- CLI picker padding not read at a located line.

**Present but disconnected or switched off**

- none found

**Not available**

- Brief lists no CLI item for sidebar rows, menu items or form fields.

## 4. Required behaviour

**Established requirements**

- Sidebar and history list rows have one defined row height. (source: S6.21 (brief))
- Menu items share one defined height or padding across menus. (source: S6.22 (brief))
- Dialogs and sheets share one defined inner padding. (source: S6.23 (brief))
- Form fields share a defined label-to-input and field-to-field spacing. (source: S6.24 (brief))
- Responsive and native layouts are visually tested; touch, focus and keyboard are verified. (source: docs/product/experience-contract.md (acceptance list near line 750; W23 at line 796))

**Acceptance criteria**

1. A web sidebar row measures 34px on a mouse device and 44px on a touch device.
2. Every web dropdown item has 8px horizontal and 6px vertical padding.
3. On a 667 by 375 window, a web dialog's Cancel and Send buttons can be reached by scrolling inside the dialog.
4. Dialog, alert dialog and sheet content padding is 24px.
5. Focus returns to the opener when a dialog closes.
6. Form fields on touch screens render at 16px so the page does not zoom.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Form-field spacing has no single web token; fields are spaced by each form's own gap classes [inferred from absence of a shared form primitive in the primitives list].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add one Field primitive that owns label and spacing.
- [proposed] Add tests that measure row, menu and dialog sizes.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SessionItem | `packages/ui/ui/src/sidebar/SessionItem.tsx` | Sidebar row height (:199) |
| component | Sidebar | `packages/ui/ui/src/sidebar/Sidebar.tsx` | Sidebar container |
| component | DropdownMenu | `packages/ui/ui/src/primitives/DropdownMenu.tsx` | Menu item padding (:74,160,240) |
| component | Dialog | `packages/ui/ui/src/primitives/Dialog.tsx` | Dialog box, padding and scroll (:100-115) |
| component | AlertDialog | `packages/ui/ui/src/primitives/AlertDialog.tsx` | Alert dialog box (:104) |
| component | Sheet | `packages/ui/ui/src/primitives/Sheet.tsx` | Side and bottom sheets (:36) |
| config | web touch rules | `apps/web/app/globals.css` | Phone input size and coarse-pointer rules (:1086-1100) |
| component | mobile DrawerContent | `apps/mobile/src/features/drawer/components/DrawerContent.tsx` | Mobile history rows |
| component | mobile Input | apps/mobile/components/ui/input.tsx (not found) | Mobile form field |
| config | mobile dialog padding | `apps/mobile/src/ui/theme/tokens.ts` | dialogPadding 24 and spacing scale |
| component | mobile modals | `apps/mobile/src/features/conversation-actions/RenameConversationModal.tsx` | Modal padding |
| component | CLI theme picker | `apps/cli/src/tui/widgets/theme_picker.rs` | Overlay layout |
| component | VS Code sessions sheet and controls | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | --control-sm, md, lg and sheet rules |
| component | VS Code settings form | `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts` | Settings form spacing |
| config | Chrome control sizes | `apps/extension/src/side_panel.css` | --control-sm to --control-touch (:35-38) |
| component | Chrome Options page | `apps/extension/src/options.ts` | Options form rows |
| test | SessionItem row state test | `packages/ui/ui/src/sidebar/__tests__/SessionItem.rowState.test.tsx` | Row behaviour |
| test | Dialog test | `packages/ui/ui/src/primitives/__tests__/Dialog.test.tsx` | Dialog behaviour |
| test | DropdownMenu test | `packages/ui/ui/src/primitives/__tests__/DropdownMenu.test.tsx` | Menu behaviour |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A primitive renders with fixed utility classes for height and padding. | device | SessionItem.tsx:199; DropdownMenu.tsx:160; Dialog.tsx:115 |
| A media query for coarse pointers raises the row to 44px. | device | SessionItem.tsx:199 (pointer-coarse:h-11) |
| A dialog taller than the window scrolls inside itself. | device | Dialog.tsx:105-115 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data created | none | No | Not applicable |

**Models and providers.** None.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code |
| Local mode | Identical in Local mode; sizes do not depend on account or payment. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Short window | Dialog scrolls inside; x axis hidden to keep corners clipped | Dialog.tsx:105-110 |
| Touch pointer | Sidebar rows 44px; swatch hit areas extended on the appearance page | SessionItem.tsx:199; AppearanceSection.tsx:93,101 |
| Disabled menu item | No pointer events, 50 percent opacity | DropdownMenu.tsx:160 |
| Renaming a row | Row swaps to an inline field with its own padding | SessionItem.tsx:205-207 region |
| Focus after close | Alert dialog restores focus to the opener | AlertDialog.tsx:85-90 (restoreFocus) |
| Loading, offline | not handled in the code for sizing | none found in the files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/sidebar/__tests__/SessionItem.rowState.test.tsx`: Row state (titles not read)
- `packages/ui/ui/src/primitives/__tests__/Dialog.test.tsx`: Dialog behaviour (titles not read)
- `packages/ui/ui/src/primitives/__tests__/DropdownMenu.test.tsx`: Menu behaviour (titles not read)
- `packages/ui/ui/src/primitives/__tests__/Sheet.test.tsx`: Sheet behaviour (titles not read)

**Test scenarios**

- **Row height**
  1. Open web sidebar
  2. Measure a row with a mouse
  3. Emulate touch and measure again
  - Expected: 34px then 44px
- **Short dialog**
  1. Resize window to 667 by 375
  2. Open a dialog with Cancel and Send
  - Expected: Scroll inside the dialog reaches both buttons
- **Menu padding**
  1. Open three different menus
  2. Inspect an item in each
  - Expected: 8px by 6px padding each
- **Mobile modal**
  1. Open the rename modal on a phone
  - Expected: Padding follows dialogPadding 24 (to verify)
- **Chrome form**
  1. Open extension Options
  2. Check row control heights
  - Expected: Uses --control sizes (to verify)

**Where to look when it fails**

- Devtools computed height of the row.
- Dialog max-height rule and overflow.
- Search primitives tests for failing titles.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md)
- Desktop: [70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md)
- Mobile: [70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md)
- CLI: [70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md)
- VS Code: [70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md)
- Chrome: [70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md)

## 10. Gaps and dependencies

- **No test found that measures row, menu, dialog or sheet sizes** Affects: Web, desktop. Evidence: Test list for packages/ui/ui primitives covers behaviour, titles not showing size assertions. Work needed: Add class or computed-style assertions
- **No shared form-field primitive for label and field spacing** Affects: Web, desktop. Evidence: Primitives directory lists Input, Label, Textarea but no Field. Work needed: Add or record the pattern
- **Mobile and extension rows and dialogs not verified from code** Affects: Mobile, VS Code, Chrome. Evidence: Files not opened. Work needed: Read and cite

**Depends on**

- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- F006-06

## Unknown

- Mobile row, modal and input measurements.
- CLI picker padding.
- Whether tests assert the 34/44px row sizes (test titles not read).
- The brief's cited lines for SessionItem.tsx:185, DropdownMenu.tsx:115, Dialog.tsx:110 and AlertDialog.tsx:93 differ from what I read (:199, :160, :115, :104).
- Where Chrome and VS Code dialogs set padding.
