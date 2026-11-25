---
id: "F008-01"
type: "feature"
title: "Action buttons"
aliases: ["Buttons", "Primary, secondary and destructive buttons", "Icon buttons", "Button group", "Split button", "Toggle button (pressed button)", "isLoading button", "Approval choices (CLI)", "Decision row (mobile tool approval)"]
area: "8 Basic interactive elements"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S8.01", "S8.02", "S8.03", "S8.04", "S8.05", "S8.07"]
depends_on: ["SYS-shared-ui-and-design", "SYS-agents-tools-and-automation", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "file:packages/ui/ui/src/primitives/Button.tsx", "file:apps/mobile/components/ui/button.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F008-01 Action buttons

Clickable actions in all six apps: a filled main button, quieter outline and ghost buttons, a red destructive style, icon-only buttons with a spoken name, and grouped buttons. The web and desktop button also has a busy state. A split button (main action plus menu) is not built anywhere.

Area: [8. Basic interactive elements](README.md). Requirement items: [S8.01](../../10-requirements/capabilities/008-basic-interactive-elements.md#s801), [S8.02](../../10-requirements/capabilities/008-basic-interactive-elements.md#s802), [S8.03](../../10-requirements/capabilities/008-basic-interactive-elements.md#s803), [S8.04](../../10-requirements/capabilities/008-basic-interactive-elements.md#s804), [S8.05](../../10-requirements/capabilities/008-basic-interactive-elements.md#s805), [S8.07](../../10-requirements/capabilities/008-basic-interactive-elements.md#s807).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | not stated on this page | partly built | not seen by a person |
| Chrome | not stated on this page | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives every app a consistent way to start an action. The shared web Button has six looks (default, destructive, outline, secondary, ghost, link) and five sizes, can be disabled, and can show a busy state that tells screen readers 'Loading, please wait' (packages/ui/ui/src/primitives/Button.tsx:8-36, :72, :80, :103). Mobile has its own Button with five looks (apps/mobile/components/ui/button.tsx:16-21). The CLI shows approval choices as a row of buttons in a terminal box (apps/cli/src/tui/widgets/approval_overlay.rs:153-160).

**Why it exists.** People must tell the main action from side actions and from risky ones, and people using keyboards or screen readers must be able to use every button. The project contract says every icon-only control has an accessible name (doc: docs/product/experience-contract.md:168) and that touch targets follow platform guidance with a 40 px pointer minimum (doc: docs/product/experience-contract.md:174).

**Who uses it.** Every person on every app (Web, Desktop, Mobile, CLI, VS Code, Chrome). Engineers reuse the shared Button; testers check look, keyboard and screen reader behaviour.

**Problems it solves**

- The main action is easy to find.
- Risky actions look different from safe ones.
- Icon-only buttons are not silent to a screen reader.
- A busy button cannot be pressed twice.

**Use cases**

- On web, Continue in onboarding is a default button and Skip for now is a ghost button (apps/web/features/onboarding/components/OnboardingWizard.tsx:199-209).
- On mobile, a tool approval row offers Allow once, session and always choices (apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:326-345).
- In the CLI, a tool approval box offers Yes, No, Allow Session, Always Allow, Deny All, Allow All (apps/cli/src/tui/widgets/approval_overlay.rs:153-160).
- On web, a dictation strip groups cancel and send buttons under one label (apps/web/features/chat/components/Composer/DictationStrip.tsx:87-95).

## 2. User experience

**Where to find it**

- Web: everywhere in the chat app, for example the onboarding form buttons Continue and Skip for now (apps/web/features/onboarding/components/OnboardingWizard.tsx:199-209).
- Desktop: the public Desktop shows the hosted web app, so it shows the web buttons (doc: AGENTS.md section 5). The internal Tauri build re-exports the same Button (apps/desktop/src/ui/Button.tsx:1).
- Mobile: sign-in and settings screens use apps/mobile/components/ui/button.tsx; the tool approval row sits under a tool call in chat.
- CLI: the approval box that appears when a tool needs permission, hint line 'Enter confirm Tab note Esc = No' (apps/cli/src/tui/widgets/approval_overlay.rs:173-176).
- VS Code and Chrome: sidebar and side panel buttons. Their button styles were not opened in detail; the brief marks them done (doc: knowledge-base/data/area-briefs/008-basic-interactive-elements.md S8.01-S8.04).

**Before you start**

- None for the buttons themselves. Tool approval controls appear only when an agent asks to run a tool.

**Screens and controls**

- Web Button looks: default, destructive, outline, secondary, ghost, link; sizes default, xs, sm, lg, icon (Button.tsx:12-29).
- Mobile Button looks: primary, secondary, outline, ghost, destructive; sizes sm, md, lg (apps/mobile/components/ui/button.tsx:16-29).
- Mobile approval row: one button per scope, label '<scope label>: <summary>' (CloudToolApprovalControls.tsx:340-345), plus a 'Raw JSON' disclosure button (CloudToolApprovalControls.tsx:258-264).
- CLI approval buttons in the order Yes, No, Allow Session, Always Allow, Deny All, Allow All (approval_overlay.rs:153-160).

**Journey**

1. 1. The person sees a view with one filled main button and quieter side buttons.
2. 2. They click, tap, or press Enter or Space on the focused button. Space/Enter activation is native button behaviour [inferred from the use of a real button element at Button.tsx:93].
3. 3. If the action takes time, the web button turns inert and reports busy (Button.tsx:72, :80, :103).
4. 4. In the CLI, they press Left or Right to move the highlight, Enter to confirm, Esc to answer No (approval_overlay.rs:173-176, :244-252).
5. 5. On mobile, a light haptic tap fires when haptics are enabled (apps/mobile/components/ui/button.tsx:57-62).

**What the person sees and gets**

- Web: pressed look (active:scale-[0.98]), focus ring, dimmed when disabled (Button.tsx:9).
- Mobile: pressed colour change; half-opacity when disabled or loading (button.tsx:76-104, :121); label changes to 'Loading...' (button.tsx:135).
- CLI: the highlighted choice and a note line; an allowing answer pressed before the detail was read is refused (approval_overlay.rs:259-262).

**Settings**

- Mobile: haptics on/off (useSettingsStore hapticsEnabled, apps/mobile/components/ui/button.tsx:54).
- None found for web, CLI, VS Code or Chrome in the files read.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/shared Button with variants, sizes, disabled dimming, loading state with aria-busy and screen-reader text 'Loading, please wait', and a hidden 'Button' fallback name when a non-link button has no text and no aria-label (packages/ui/ui/src/primitives/Button.tsx:8-36, :72, :90-105).
- Desktop Tauri build re-exports the shared Button (apps/desktop/src/ui/Button.tsx:1).
- Mobile Button with five looks, 44 point minimum touch target through hit slop, disabled state and haptics (apps/mobile/components/ui/button.tsx:23-34, :54-62, :124-131).
- Mobile tool approval row: each button has role button, a label and a selected/disabled state; the row container has an accessibilityLabel 'Decision for <summary>' (CloudToolApprovalControls.tsx:326-345).
- Web dictation strip is a labelled group (DictationStrip.tsx:87-95).
- CLI approval overlay with six ordered choices, default highlight on Yes, Esc always answers No (approval_overlay.rs:153-176, :244-252).
- Contrast: a test file checks that destructive tokens serve both text and solid fills (apps/web/shared/components/__tests__/theme-contrast.test.ts:360-361).

**Incomplete**

- Mobile approval row has a label on its container but no group role found in the file (CloudToolApprovalControls.tsx:326-329); brief item S8.07 calls it partial (doc: knowledge-base/data/area-briefs/008-basic-interactive-elements.md S8.07).
- Mobile loading button sets only the disabled state, not a busy state, and shows the text 'Loading...' (button.tsx:131, :135).
- Web Button rendered with asChild adds no 'Loading, please wait' text and no fallback name (Button.tsx:74-88).
- Mobile destructive button is a tinted surface with border and error-coloured text, not a solid red fill (button.tsx:92-97, :111).

**Present but disconnected or switched off**

- None found in the files read.

**Not available**

- Split button (main action plus attached menu): no component found on any app; the brief marks it missing for web, desktop, mobile, VS Code and Chrome (doc: knowledge-base/data/area-briefs/008-basic-interactive-elements.md S8.05). I did not search every app folder by hand [inferred from brief].
- Icon-only buttons in the CLI: not applicable to a terminal; the brief gives CLI no status for S8.04.

## 4. Required behaviour

**Established requirements**

- Main action uses an emphasised primary style whose label meets contrast on its fill. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.01)
- A less prominent secondary (outline or ghost) style exists and sits beside primary actions. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.02)
- Irreversible actions use a destructive style whose label meets contrast. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.03)
- Icon-only buttons carry an accessible name. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.04)
- A split button should exist in shipped UI. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.05)
- Related buttons are grouped into a labelled group. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.07)
- An action a user cannot undo asks first and names the consequence; a mutation fired straight from onClick is a defect. (source: (doc: AGENTS.md section 9))
- Minimum pointer hit target is 40 px; native touch targets follow platform guidance. (source: (doc: docs/product/experience-contract.md:174))

**Acceptance criteria**

1. Every screen has at most one filled primary button for its main action.
2. A destructive button label is readable (contrast at least the project's measured limit) in light and dark themes.
3. With a screen reader, each icon-only button is announced with a meaningful name, not 'Button'.
4. While a web button is loading, clicking it does nothing, aria-busy is true and the reader says 'Loading, please wait'.
5. A disabled button cannot be activated and is visibly dimmed.
6. On mobile the approval row is announced as a group named 'Decision for <summary>' with each button reachable in order.
7. In the CLI approval box, Esc answers No and the default highlighted choice is Yes.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile loading buttons should report a busy state like the web button [inferred from Button.tsx:80 vs button.tsx:131].
- The asChild path of the web Button should also announce loading [inferred from Button.tsx:74-88 lacking the text at :103].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build one SplitButton in packages/ui/ui and use it for an action with alternatives, for example Send with Send later.
- [proposed] Give the mobile approval row an explicit group role so it is announced as one set.
- [proposed] Add accessibilityState busy to the mobile Button when loading.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Button (web, shared) | `packages/ui/ui/src/primitives/Button.tsx` | Variants, sizes, disabled, loading, fallback accessible name |
| component | Button (desktop re-export) | `apps/desktop/src/ui/Button.tsx` | Re-exports the shared Button for the internal Tauri build |
| component | Button (web shared ui) | `apps/web/shared/ui/Button.test.tsx` | Test file sitting beside web shared ui; component source not opened |
| component | Button (mobile) | apps/mobile/components/ui/button.tsx (not found) | Mobile button with five looks, haptics, touch target |
| component | PressableBox | `apps/mobile/components/ui/PressableBox.tsx` | Pressable wrapper used for icon and approval buttons |
| component | CloudToolApprovalControls | `apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx` | Mobile tool approval button row and Raw JSON disclosure |
| component | DictationStrip | `apps/web/features/chat/components/Composer/DictationStrip.tsx` | Labelled button group for dictation cancel and send |
| component | ApprovalOverlay (CLI) | `apps/cli/src/tui/widgets/approval_overlay.rs` | Terminal approval buttons, key handling and layout |
| component | EditableMessage buttons | `apps/web/features/chat/components/messages/EditableMessage.tsx` | Save and cancel buttons for editing a message (brief item S8.01) |
| component | ShareConversationDialog | `apps/web/features/chat/components/share/ShareConversationDialog.tsx` | Dialog with a destructive stop-sharing style button (brief item S8.03) |
| component | Camera icon buttons | `apps/mobile/app/(app)/camera.tsx` | Icon-only buttons with accessibility labels, for example the torch button |
| component | VS Code sidebar webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Sidebar markup and styles for buttons |
| component | Chrome side panel | `apps/extension/src/side_panel.ts` | Side panel buttons, for example notice dismiss and action buttons |
| test | theme contrast test | `apps/web/shared/components/__tests__/theme-contrast.test.ts` | Checks contrast of theme tokens including destructive |
| test | Button primitive test | `packages/ui/ui/src/primitives/__tests__/Button.test.tsx` | Loading, icon-only naming, text detection |
| test | CloudToolApprovalReview test | `apps/mobile/__tests__/CloudToolApprovalReview.test.tsx` | Mobile approval controls, scopes, raw JSON disclosure |
| config | hapticsEnabled setting | `apps/mobile/stores/settingsStore.ts` | Imported by the mobile Button to switch haptics (import at button.tsx:12; file not opened) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person clicks, taps or presses Enter/Space on a button; the button's own handler runs. | device | packages/ui/ui/src/primitives/Button.tsx:93-101 (real button element passes props through) |
| On mobile, an optional light haptic fires, then the caller's onPress runs. | device | apps/mobile/components/ui/button.tsx:57-62 |
| If the caller sets isLoading or disabled, the web button becomes inert. | device | packages/ui/ui/src/primitives/Button.tsx:72 |
| For tool approval, the chosen scope is passed to onResolve or a grant callback; where that decision is sent was not traced. | device | apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:145-148, :152-162 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Haptics preference | mobile settings store (store:settingsStore) | unknown | unknown |
| Unsent approval guidance text draft | in-memory draft keyed by tool call id (setToolApprovalGuidanceDraft) | not synced in the code read | cleared when read for sending (CloudToolApprovalControls.tsx:140-143) |

**Models and providers.** The button itself uses no model or provider. Tool approval buttons answer a request raised by an agent turn; which model raised it is not decided here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account is needed for a button. Tool approval buttons exist only inside a chat turn that asks for approval (CloudToolApprovalControls.tsx:112-126). |
| Permissions | Mobile approval buttons are disabled when there is no onResolve handler or a decision was already made (CloudToolApprovalControls.tsx:127). Always-allow and session scopes are offered only when the server review lists them (CloudToolApprovalControls.tsx:163-166). |
| Subscription | none found in the code for the buttons (searched Button.tsx, button.tsx, CloudToolApprovalControls.tsx). |
| Limits and metering | none found in the code for the buttons. |
| Feature flags | none found in the code for the buttons. |
| Model compatibility | none found in the code for the buttons. |
| Provider restrictions | none found in the code for the buttons. |
| Local mode | Buttons work the same in mode:local; they run on the device. Mobile approval row text refers to Cloud tool approval (component name CloudToolApprovalControls); whether Local turns use it is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading (web) | Inert, aria-busy, hidden text 'Loading, please wait'; not for asChild | Button.tsx:72-105 |
| Loading (mobile) | Disabled, half opacity, label 'Loading...'; no busy state | apps/mobile/components/ui/button.tsx:121-135 |
| Disabled | No pointer events and 50 percent opacity on web | Button.tsx:9 |
| Icon-only without a name (web) | Hidden text 'Button' is added as a fallback | Button.tsx:104 |
| CLI answer before reading all detail | An allowing answer is refused until the detail was drawn to its end | approval_overlay.rs:259-262 |
| Destructive scope on mobile approval | An extra confirmation alert with Cancel appears before session or always allow | CloudToolApprovalControls.tsx:152-163 |
| Offline, retry, timeout | not handled in the code read for the button primitives | not handled in the code (looked in Button.tsx and button.tsx) |
| Reduced motion | not handled in Button.tsx (it has active:scale transform class) | Button.tsx:9 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/primitives/__tests__/Button.test.tsx`: Plain button, loading state via aria-busy plus disabled plus hidden message, aria-label as the name, fallback hidden name, text nested in a wrapper (it names at lines 6, 14, 22, 31, 40)
- `apps/web/shared/components/__tests__/theme-contrast.test.ts`: Contrast ratios of theme tokens; section 'destructive tokens carry both roles' (line 360)
- `apps/mobile/__tests__/CloudToolApprovalReview.test.tsx`: Parameter rows, raw JSON behind a disclosure, risk tier, scopes offered only if server reviewed, missing review treated as high risk
- `apps/cli/src/tui/widgets/approval_overlay.rs`: In-file tests: open defaults cursor to Yes, long command wraps, terminal escapes stripped
- `apps/web/shared/ui/Button.test.tsx`: A web shared ui button test; contents not opened

**Test scenarios**

- **Web loading button**
  1. Open a web form that uses isLoading.
  2. Submit it.
  3. Inspect the button with a screen reader or the accessibility tree.
  - Expected: Button is disabled, aria-busy is true, text 'Loading, please wait' is read.
- **Icon-only name**
  1. Open the web chat, tab to a message action icon.
  2. Read its name with a screen reader.
  - Expected: A real action name is spoken, not 'Button'.
- **Mobile approval row**
  1. Trigger a tool needing approval in AGI Mobile cloud chat.
  2. Swipe through with VoiceOver or TalkBack.
  - Expected: Each choice is announced as '<label>: <summary>' and the row is announced as a group (known gap: group role).
- **CLI approval keys**
  1. Run the CLI so a tool asks permission.
  2. Press Right twice, then Enter.
  3. Repeat and press Esc.
  - Expected: Enter confirms the highlighted choice; Esc answers No.
- **Destructive contrast**
  1. Open a destructive dialog on web in light and dark themes.
  2. Measure label against fill.
  - Expected: Label meets contrast on the red fill.

**Where to look when it fails**

- Web: browser accessibility tree for aria-busy and names.
- CLI: ratatui snapshot tests in apps/cli/src/tui/widgets/snapshots.
- Mobile: Jest tests in apps/mobile/__tests__.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/008-basic-interactive-elements.md](../../70-qa/test-plans/web/008-basic-interactive-elements.md)
- Desktop: [70-qa/test-plans/desktop/008-basic-interactive-elements.md](../../70-qa/test-plans/desktop/008-basic-interactive-elements.md)
- Mobile: [70-qa/test-plans/mobile/008-basic-interactive-elements.md](../../70-qa/test-plans/mobile/008-basic-interactive-elements.md)
- CLI: [70-qa/test-plans/cli/008-basic-interactive-elements.md](../../70-qa/test-plans/cli/008-basic-interactive-elements.md)
- VS Code: [70-qa/test-plans/vscode/008-basic-interactive-elements.md](../../70-qa/test-plans/vscode/008-basic-interactive-elements.md)
- Chrome: [70-qa/test-plans/chrome/008-basic-interactive-elements.md](../../70-qa/test-plans/chrome/008-basic-interactive-elements.md)

## 10. Gaps and dependencies

- **Split button is not built** Affects: All apps except CLI. Evidence: Brief S8.05 status missing; no component found in packages/ui/ui/src/primitives listing. Work needed: Design and build a shared SplitButton, then use it where an action has alternatives.
- **Mobile approval row has no group role** Affects: Mobile screen reader users. Evidence: CloudToolApprovalControls.tsx:326-329 gives a label only. Work needed: Mark the row as a labelled group (and accessible) and test with VoiceOver and TalkBack.
- **Mobile Button has no busy state** Affects: Mobile screen reader users. Evidence: button.tsx:131. Work needed: Add busy to accessibilityState.
- **Web asChild button skips loading text and fallback name** Affects: Web users of link-styled buttons. Evidence: Button.tsx:74-88. Work needed: Add the same sr-only text for asChild or document it.
- **VS Code and Chrome button styles not verified here** Affects: VS Code, Chrome. Evidence: Brief says done or unverified; I did not open the style definitions. Work needed: Inspect classes for primary, destructive and icon-only buttons and record contrast and names.

**Depends on**

- SYS-shared-ui-and-design
- SYS-agents-tools-and-automation
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- file:packages/ui/ui/src/primitives/Button.tsx
- file:apps/mobile/components/ui/button.tsx

## Unknown

- Where a mobile or CLI approval decision is sent and stored (not traced).
- Whether Local mode turns use the mobile approval row.
- Exact primary, destructive and icon-only button styles and names in VS Code and Chrome.
- Whether the CLI hint line is the only keyboard help for buttons; Tab moves to the note, not between buttons (approval_overlay.rs:173-176).
- Content of apps/web/shared/ui/Button.test.tsx.
