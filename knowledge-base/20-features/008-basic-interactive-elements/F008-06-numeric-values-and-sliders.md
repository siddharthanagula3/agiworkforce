---
id: "F008-06"
type: "feature"
title: "Numeric values and sliders"
aliases: ["Number input", "Numeric stepper", "Slider", "Range slider", "Effort slider", "Speed slider", "Approval timeout slider"]
area: "8 Basic interactive elements"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "n/a", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S8.22", "S8.23", "S8.24"]
depends_on: ["SYS-shared-ui-and-design", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-voice-and-media", "surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F008-06 Numeric values and sliders

Number fields and sliders. Number fields are the browser's native number input on web and VS Code, so plus and minus come from the browser; there are no custom stepper buttons. A single-thumb slider sets one value by drag or arrow keys. A two-thumb range slider exists nowhere.

Area: [8. Basic interactive elements](README.md). Requirement items: [S8.22](../../10-requirements/capabilities/008-basic-interactive-elements.md#s822), [S8.23](../../10-requirements/capabilities/008-basic-interactive-elements.md#s823), [S8.24](../../10-requirements/capabilities/008-basic-interactive-elements.md#s824).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets people set a number. Web and VS Code use native number inputs with min, max and step (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1485-1498, :1905-1915). The shared Slider wraps a Radix slider with one thumb, an accessible name and a spoken value text (packages/ui/ui/src/primitives/Slider.tsx:79-90).

**Why it exists.** Settings such as delays, limits, speed and reasoning effort are numbers or scales.

**Who uses it.** Anyone changing numeric settings or reasoning effort.

**Problems it solves**

- Values stay in range.
- Keyboard and touch can both set a value.
- A slider's value is spoken.

**Use cases**

- Move the web effort slider to choose reasoning effort (ComposerFooter.tsx:1950-1960).
- Set approval timeout on the desktop agent settings between 60 and 600 seconds (apps/desktop/src/features/settings/AgentExecutionSettings.tsx:287-296).
- Adjust voice Speed and Pitch on mobile (apps/mobile/src/features/settings/voice/index.tsx:140-175).
- Type inline completion delay in VS Code (settingsWebviewContent.ts:1905-1915).

## 2. User experience

**Where to find it**

- Web: composer effort control (ComposerFooter.tsx:1950), schedule form number fields (ScheduleForm.tsx:346, :432, :596), usage and policy settings (UsageSection.tsx:649; WorkspacePolicySection.tsx:525, :640).
- Desktop: web app in the public Desktop; the internal Tauri build has its own sliders (AgentExecutionSettings.tsx:287, :356).
- Mobile: voice settings Speed and Pitch sliders (voice/index.tsx:441, :451).
- VS Code: settings page numbers (settingsWebviewContent.ts:1491, :1910, :1926).
- Chrome: options profile field 'Years of experience' of type number (options.ts:1787); how it is drawn was not opened.
- CLI: not applicable.

**Before you start**

- Effort slider shows only when the model supports adaptive reasoning and effort choices exist (ComposerFooter.tsx:1320).

**Screens and controls**

- Web effort slider: min 0, max last step, step 1, thumb label 'Reasoning effort' in AgentControl (AgentControl.tsx:243-255).
- Mobile VoiceSlider: label, value text, accessibilityLabel and accessibilityValue (voice/index.tsx:162-175).
- VS Code numbers: 'setting-context-lines' 0 to 500 step 1; 'setting-inline-delay' 50 to 2000 step 10.

**Journey**

1. 1. Focus the number field or slider.
2. 2. Type a number, use the browser step arrows, or drag the thumb or press arrow keys.
3. 3. Value updates; on web effort slider the change applies immediately and releasing on a gated step asks to upgrade (ComposerFooter.tsx:1956-1959).
4. 4. The value text is shown next to the control.

**What the person sees and gets**

- Value label beside sliders (voice/index.tsx:162-165).
- Desktop timeout label with unit text via formatApprovalSeconds (AgentExecutionSettings.tsx:283-285).

**Settings**

- Effort, voice speed, voice pitch, approval timeout, inline completion delay, context lines.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Shared Slider: one Radix thumb, thumbAriaLabel default 'Slider thumb', aria-valuetext from valueLabel, optional marks (Slider.tsx:20-90).
- Web effort slider with steps, upgrade request on gated step (ComposerFooter.tsx:1950-1960).
- Desktop approval timeout slider 60 to 600 step 30 (AgentExecutionSettings.tsx:287-296).
- Mobile sliders from a community package with accessibility label and value (voice/index.tsx:3, :162-175).
- Web native number inputs in schedule, usage, policy and pricing pages (ScheduleForm.tsx:346; pricing/page.tsx:1121).

**Incomplete**

- No custom plus or minus buttons were found; steppers rely on the browser's native control (grep for stepper found only unrelated files).
- Mobile has no numeric stepper (brief S8.22 missing).

**Present but disconnected or switched off**

- None found.

**Not available**

- Range slider with two thumbs: Slider.tsx renders one Thumb only (Slider.tsx:79-90); brief marks missing everywhere.
- Slider on VS Code and Chrome: brief missing; no range input found in VS Code source (grep).
- Numeric field on mobile: none found.

## 4. Required behaviour

**Established requirements**

- A numeric stepper (number field with increment and decrement) is used in shipped UI. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.22)
- A slider sets one value on a scale by drag or arrow keys. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.23)
- A range slider has two thumbs for a minimum and maximum. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.24)
- Rate limits and quotas are configuration, not constants; do not hardcode what the repository models. (source: (doc: AGENTS.md sections 4 and 8))

**Acceptance criteria**

1. A number field refuses values outside min and max or marks them invalid.
2. The slider thumb is reachable by Tab and moves by arrow keys.
3. The slider announces its name and value text.
4. Releasing the web effort slider on a gated step opens the upgrade request.
5. Voice speed and pitch sliders change the sample voice setting and persist.
6. No screen claims a range slider unless two thumbs exist.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Whether native number controls count as a stepper is a decision; the draft's 'one per click' is browser behaviour, not repository code [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build a shared NumberStepper with labelled plus and minus buttons for mobile.
- [proposed] Extend Slider to accept two values for a range slider when a feature needs one.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Slider | `packages/ui/ui/src/primitives/Slider.tsx` | Single-thumb slider with name and value text |
| component | ComposerFooter effort control | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Effort slider and chips, upgrade request on gated step |
| component | AgentControl | `packages/ui/unified-chat/src/components/AgentControl.tsx` | Shared effort slider with thumb label |
| component | AgentExecutionSettings | `apps/desktop/src/features/settings/AgentExecutionSettings.tsx` | Desktop sliders for approval timeout |
| component | AgentsSettings | `apps/desktop/src/features/settings/AgentsSettings.tsx` | Desktop slider use (grep match) |
| component | Voice settings | `apps/mobile/src/features/settings/voice/index.tsx` | Speed and Pitch sliders |
| component | ScheduleForm | `apps/web/features/schedules/components/ScheduleForm.tsx` | Native number fields |
| component | UsageSection | `apps/web/features/settings/sections/UsageSection.tsx` | Native number field |
| component | WorkspacePolicySection | `apps/web/features/settings/sections/WorkspacePolicySection.tsx` | Native number fields |
| component | VS Code settings webview | `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts` | Number inputs with min max step |
| component | Chrome options | `apps/extension/src/options.ts` | Profile field of number type |
| component | Personalization settings | `apps/mobile/src/features/settings/personalization/index.tsx` | Brief cites it for sliders; the lines read show a labelled option chooser |
| test | Slider test | `packages/ui/ui/src/primitives/__tests__/Slider.test.tsx` | Thumb name and aria-valuetext |
| test | ScheduleForm web test | `apps/web/features/schedules/components/ScheduleForm.test.tsx` | Schedule form (contents not opened) |
| test | VoiceSettings test | `apps/mobile/__tests__/VoiceSettings.test.tsx` | Mobile voice settings (contents not opened) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Drag, arrow key or typing changes the value in component state. | device | Slider.tsx:39-55 |
| Effort change calls handleEffortChip and stores effort for the conversation; releasing on a gated step calls onUpgradeRequest. | device | ComposerFooter.tsx:1950-1960; AgentControl.tsx:243-250 (setEffort) |
| The chosen effort is sent with the next turn; how it reaches the model was not traced. | our servers | not traced (SYS-chat-turn-pipeline) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Effort per conversation | conversation settings store via setEffort(conversationId, effort) | unknown | unknown |
| Voice speed and pitch | unknown (mobile settings) | unknown | unknown |

**Models and providers.** Effort choices are filtered by what the selected model supports (ComposerFooter.tsx:1311-1338); the control does not name models.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for plain sliders and numbers. |
| Permissions | none found in the code. |
| Subscription | Web effort slider: steps beyond the allowed list are gated and releasing on one calls onUpgradeRequest (ComposerFooter.tsx:1311-1320, :1956-1959). |
| Limits and metering | Gated effort steps; other limits none found. |
| Feature flags | none found in the code. |
| Model compatibility | Effort control shows only when the model supports adaptive reasoning (ComposerFooter.tsx:1320). |
| Provider restrictions | none found. |
| Local mode | Sliders and number fields work on the device. Whether effort steps are gated in mode:local was not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Disabled slider | Radix thumb dims when disabled | Slider.tsx:82 |
| Gated effort step | Calls upgrade request on commit | ComposerFooter.tsx:1956-1959 |
| Out of range number | Browser min and max attributes; no custom message found | settingsWebviewContent.ts:1491-1496 |
| Touch | touch-none on slider root | Slider.tsx:42 |
| Offline, retry, timeout | not handled in these controls | not handled in the code (looked in Slider.tsx) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/primitives/__tests__/Slider.test.tsx`: Thumb has an accessible name; valueLabel becomes aria-valuetext; control-specific name
- `apps/web/features/schedules/components/ScheduleForm.test.tsx`: Web schedule form; contents not opened
- `apps/mobile/__tests__/VoiceSettings.test.tsx`: Mobile voice settings; contents not opened

**Test scenarios**

- **Slider keys**
  1. Open web composer effort control.
  2. Tab to the thumb; press Right and Left.
  - Expected: Effort changes one step and the label updates.
- **Gated step**
  1. On a free plan drag the effort thumb to the top step and release.
  - Expected: Upgrade request appears.
- **Number bounds**
  1. In VS Code settings enter 9999 in the inline delay field.
  - Expected: Value is rejected or clamped by the field limits (unverified).
- **Mobile slider reader**
  1. Open AGI Mobile voice settings, swipe on Speed with VoiceOver.
  - Expected: Name and value text read; swipe up adjusts.
- **No range slider**
  1. Search the apps for a minimum and maximum slider.
  - Expected: None found, matching the brief.

**Where to look when it fails**

- Web: aria-valuenow and aria-valuetext in the accessibility tree.
- Not found: log names.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/008-basic-interactive-elements.md](../../70-qa/test-plans/web/008-basic-interactive-elements.md)
- Desktop: [70-qa/test-plans/desktop/008-basic-interactive-elements.md](../../70-qa/test-plans/desktop/008-basic-interactive-elements.md)
- Mobile: [70-qa/test-plans/mobile/008-basic-interactive-elements.md](../../70-qa/test-plans/mobile/008-basic-interactive-elements.md)
- VS Code: [70-qa/test-plans/vscode/008-basic-interactive-elements.md](../../70-qa/test-plans/vscode/008-basic-interactive-elements.md)
- Chrome: [70-qa/test-plans/chrome/008-basic-interactive-elements.md](../../70-qa/test-plans/chrome/008-basic-interactive-elements.md)

## 10. Gaps and dependencies

- **Range slider not built** Affects: All apps. Evidence: Slider.tsx:79-90 single Thumb; brief S8.24. Work needed: Extend Slider to two values when needed.
- **No custom stepper and no mobile number field** Affects: Mobile (and consistency). Evidence: No stepper found; brief S8.22. Work needed: Create a NumberStepper.
- **Brief citations for steppers and sliders pointed at unrelated lines** Affects: Documentation. Evidence: ScheduleForm.tsx:262 is a select; personalization/index.tsx:123 is an option chooser. Work needed: Correct brief lines.
- **Slider missing in VS Code and Chrome** Affects: VS Code, Chrome. Evidence: Brief S8.23; no range input found in VS Code source. Work needed: Add if a feature needs it.

**Depends on**

- SYS-shared-ui-and-design
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-voice-and-media
- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- mode:cloud

## Unknown

- How the Chrome number field is drawn and whether it has stepper controls.
- Whether effort steps are gated in mode:local.
- Where voice speed, pitch and effort are persisted or synced.
- Mobile personalization screen slider (brief line did not show one).
- Contents of ScheduleForm.test.tsx and VoiceSettings.test.tsx.
