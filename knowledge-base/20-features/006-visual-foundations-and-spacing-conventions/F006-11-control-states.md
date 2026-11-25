---
id: "F006-11"
type: "feature"
title: "Control states"
aliases: ["Control states", "Selected, focused, hovered, pressed and disabled states", "Interaction states", "Focus ring", "S6.34"]
area: "6 Visual foundations and spacing conventions"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S6.34"]
depends_on: ["SYS-shared-ui-and-design", "F006-10", "F006-08", "file:packages/ui/ui/src/primitives/Button.tsx", "file:apps/mobile/components/ui/PressableBox.tsx", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F006-11 Control states

Buttons, menu items and rows show different looks for hover, keyboard focus, press, selected and disabled so people can tell them apart. Web uses a focus ring, a slight shrink and darken on press, and faded disabled controls. Mobile exposes selected state to screen readers. The CLI marks the cursor row and the active theme.

Area: [6. Visual foundations and spacing conventions](README.md). Requirement items: [S6.34](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s634).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** It makes the state of a control visible: hovered, focused with the keyboard, pressed, selected or disabled. (packages/ui/ui/src/primitives/Button.tsx:9-21)

**Why it exists.** People need to know what is clickable, what has keyboard focus and what is switched off. Keyboard and screen reader users depend on focus and selected cues.

**Who uses it.** Everyone; especially keyboard and assistive technology users.

**Problems it solves**

- Not knowing where keyboard focus is.
- Clicking a disabled control with no feedback.
- Not knowing which option is selected.

**Use cases**

- Tab to a Web button and see a 2px focus ring.
- Press and hold a Web button and it shrinks slightly and darkens.
- Open a Web menu and move focus; the item gets a background.
- On Mobile Appearance, a screen reader announces the selected theme row.

## 2. User experience

**Where to find it**

- Web and Desktop: every Button and menu item from the shared UI package. (Button.tsx; DropdownMenu.tsx:160)
- Mobile: PressableBox rows and buttons, for example the Appearance rows. (apps/mobile/components/ui/PressableBox.tsx; appearance/index.tsx:42-48)
- CLI: theme picker rows. (apps/cli/src/tui/widgets/theme_picker.rs:296-340)
- VS Code: sidebar webview controls with focus outlines. (webviewContent.ts:549,667,968)
- Chrome: side panel controls, for example the pressed state of the archived recents button. (apps/extension/src/side_panel.ts:4616)

**Before you start**

- None.

**Screens and controls**

- Hover, keyboard focus (Tab), press, selected, disabled for each control type.

**Journey**

1. Move the pointer over a control to see hover.
2. Press Tab to move focus and see the focus ring.
3. Press the control to see the pressed look.
4. If disabled, the control is faded and ignores clicks.

**What the person sees and gets**

- Visual and assistive-technology cues only.

**Settings**

- Contrast and theme settings change the strength of focus rings and borders. (globals.css:1271-1320)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web Button: hover variants, active scale 0.98 plus darkening, focus-visible ring 2px with offset, disabled at 50% opacity with no pointer events. (Button.tsx:9-21)
- Web DropdownMenu item: focus background and text, disabled 50% opacity and no pointer events. (DropdownMenu.tsx:160)
- Web Dialog close button: hover, focus ring, 44px touch target on coarse pointers. (Dialog.tsx:129)
- Web Sheet close button: same pattern. (Sheet.tsx:89)
- Web high contrast: focus outline 3px. (globals.css:1295-1296,1318)
- Mobile Appearance rows expose accessibilityRole button, selected state and a label 'Set appearance to <name>'. (appearance/index.tsx:42-48)
- Mobile PressableBox tracks pressed and passes it to function styles; disabled blocks pressed. (PressableBox.tsx:29-52)
- CLI theme picker: cursor row has accent background and bold text, active theme has a filled bullet. (theme_picker.rs:313-340)
- VS Code: focus outlines use the editor focus border colour; hover uses list hover colour. (webviewContent.ts:549,667,968,205-206)
- Repo script name check:ui-buttons exists in the guard chain; script file not opened. (package.json check:llm-operability list)

**Incomplete**

- Mobile Appearance rows pass a fixed style object, so no pressed look is drawn there (only icon colour and check show selection). (appearance/index.tsx:48-56) [inferred]

**Present but disconnected or switched off**

- nothing found

**Not available**

- CLI and VS Code have no pressed state of their own (terminal and host controls). [inferred]

## 4. Required behaviour

**Established requirements**

- Interactive controls show distinct selected, focused, hovered, pressed and disabled states. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S6.34)

**Acceptance criteria**

1. Every Web Button shows a visible ring on keyboard focus but not on mouse click.
2. A disabled Web button cannot be clicked and looks faded.
3. Pressing a Web button shows a small scale-down.
4. Each selected Mobile Appearance row is announced as selected.
5. CLI theme picker highlights the cursor row differently from the active one.
6. Under High contrast, focus outline is thicker.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Focus must remain visible against both themes. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a pressed style to Mobile rows that use plain style objects.
- [proposed] Add a test that every Mobile list row exposes a pressed look.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Button | `packages/ui/ui/src/primitives/Button.tsx` | Variant, hover, active, focus-visible and disabled classes. |
| component | DropdownMenu | `packages/ui/ui/src/primitives/DropdownMenu.tsx` | Item focus and disabled states. |
| component | Dialog | `packages/ui/ui/src/primitives/Dialog.tsx` | Close button states. |
| component | AlertDialog actions | `packages/ui/ui/src/primitives/AlertDialog.tsx` | Action and cancel button states (182,202). |
| component | Sheet | `packages/ui/ui/src/primitives/Sheet.tsx` | Close button states. |
| config | web focus ring and contrast | `apps/web/app/globals.css` | Focus ring colour overrides (1271-1320). |
| component | AppearanceSection | `apps/web/features/settings/sections/AppearanceSection.tsx` | Toggle buttons with aria-pressed. |
| component | PressableBox | `apps/mobile/components/ui/PressableBox.tsx` | Pressed state wrapper. |
| screen | Mobile Appearance screen | `apps/mobile/src/features/settings/appearance/index.tsx` | Selected state and labels. |
| component | CLI theme picker | `apps/cli/src/tui/widgets/theme_picker.rs` | Cursor and active styling (313-340). |
| component | VS Code sidebar styles | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Focus outlines, hover, pressed variable (--pressed). |
| component | Chrome side panel styles | `apps/extension/src/side_panel.ts` | aria-pressed styling (4616) and control states. |
| command | check:ui-buttons | `package.json` | Guard script name listed in check:llm-operability; script file not opened. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The browser or app engine matches hover, focus, active and disabled to CSS or style rules. | device | Button.tsx:9-21 |
| Mobile Pressable events set pressed true or false and re-render. | device | PressableBox.tsx:23-52 |
| CLI re-draws the picker rows when the cursor moves. | device | theme_picker.rs:204-211,313-340 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No stored data | Not applicable | No | Not applicable |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found in the code. |
| Permissions | None found in the code. |
| Subscription | None found in the code. |
| Limits and metering | None found in the code. |
| Feature flags | None found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Identical in Local mode; no server involved. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Disabled | Faded to 50% and no pointer events on Web; Mobile blocks pressed look when disabled. | Button.tsx:9; PressableBox.tsx:41-42 |
| Touch devices | Close buttons grow to 44px on coarse pointers. | Dialog.tsx:129 |
| High contrast | Focus outline 3px. | globals.css:1295-1296 |
| Forced colours | VS Code send button uses Highlight system colours. | webviewContent.ts:2788-2792 |
| Loading, error, retry, offline | not handled in the code at this level (per-control loading states are other features). | packages/ui/ui/src/primitives/Button.tsx (no such states) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/AppearanceSection.test.tsx`: Selected theme exposed to assistive technology.
- `apps/web/app/__tests__/high-contrast-css.test.ts`: Focus visibility under high contrast.
- `apps/cli/src/tui/widgets/theme_picker.rs`: Picker snapshot (render_theme_picker_snapshot, line 421).

**Test scenarios**

- **Keyboard focus**
  1. Open Web chat.
  2. Press Tab repeatedly.
  - Expected: Each control shows a clear 2px ring in turn.
- **Disabled**
  1. Find a disabled Web button (for example Send with empty input).
  2. Click it.
  - Expected: Nothing happens and it looks faded.
- **Screen reader on Mobile**
  1. Turn on VoiceOver or TalkBack.
  2. Open Settings, Appearance.
  3. Swipe to a row.
  - Expected: It reads 'Set appearance to Dark' and 'selected' for the active one.
- **CLI picker**
  1. /theme, press Down.
  - Expected: Cursor row has accent background; active theme shows a filled bullet.
- **Press feedback**
  1. Press and hold a Web primary button.
  - Expected: Button shrinks slightly and darkens.

**Where to look when it fails**

- Inspect the element in devtools :focus-visible state.
- Run pnpm check:ui-buttons (script not opened).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md)
- Desktop: [70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md)
- Mobile: [70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md)
- CLI: [70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md)
- VS Code: [70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md)
- Chrome: [70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md)

## 10. Gaps and dependencies

- **Mobile rows with plain style objects do not draw a pressed state.** Affects: Mobile users.. Evidence: appearance/index.tsx:48-56 vs PressableBox.tsx:41. Work needed: Use function style or a shared pressed style.
- **Chrome and VS Code state coverage not verified.** Affects: Chrome, VS Code.. Evidence: Brief says done; only a few lines opened. Work needed: Audit all controls for the five states.
- **No test found that checks pressed and disabled looks on Mobile.** Affects: Mobile.. Evidence: No matching test found in apps/mobile/__tests__ by name. Work needed: Add a test.

**Depends on**

- SYS-shared-ui-and-design
- F006-10
- F006-08
- file:packages/ui/ui/src/primitives/Button.tsx
- file:apps/mobile/components/ui/PressableBox.tsx
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- Whether a guard checks pressed and disabled looks on every shared button (check:ui-buttons not opened).
- Chrome and VS Code control state coverage.
- Whether Desktop Electron has special focus styles.
- Exact hover and pressed colours per theme.
- Whether every Mobile list row uses PressableBox with a function style.
