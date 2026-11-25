---
id: "F008-04"
type: "feature"
title: "Switches, checkboxes and toggle buttons"
aliases: ["Toggles", "Switches", "Toggle buttons", "Checkbox", "Radio group", "Segmented control", "Mode toggle", "Work mode toggle", "aria-pressed button"]
area: "8 Basic interactive elements"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S8.06", "S8.14", "S8.15", "S8.16", "S8.17"]
depends_on: ["SYS-shared-ui-and-design", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "mode:local", "mode:cloud", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F008-04 Switches, checkboxes and toggle buttons

On/off and pick-one controls: switches for settings that apply at once, checkboxes for independent choices, radio groups for one visible choice, toggle buttons with a pressed state, and segmented controls of joined options. Web, desktop, mobile and CLI have all; VS Code and Chrome use styled checkboxes and menu items.

Area: [8. Basic interactive elements](README.md). Requirement items: [S8.06](../../10-requirements/capabilities/008-basic-interactive-elements.md#s806), [S8.14](../../10-requirements/capabilities/008-basic-interactive-elements.md#s814), [S8.15](../../10-requirements/capabilities/008-basic-interactive-elements.md#s815), [S8.16](../../10-requirements/capabilities/008-basic-interactive-elements.md#s816), [S8.17](../../10-requirements/capabilities/008-basic-interactive-elements.md#s817).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** The shared web Switch, Checkbox and RadioGroup wrap Radix components (packages/ui/ui/src/primitives/Switch.tsx:2; Checkbox.tsx:2; RadioGroup.tsx:4). SegmentedControl is a labelled group of buttons with aria-pressed (SegmentedControl.tsx:46-70). Mobile has a Switch that reports checked state (apps/mobile/components/ui/switch.tsx:13-40) and a Local/Cloud ModeToggle (apps/mobile/src/features/chat/components/ModeToggle.tsx:96-135).

**Why it exists.** People need clear on/off and either-or choices that assistive technology can read.

**Who uses it.** Everyone changing settings or modes.

**Problems it solves**

- State is announced (checked, pressed, selected).
- One choice among visible options is clear.
- Mode changes are one tap.

**Use cases**

- Switch between chat and agiwork modes with a pressed button pair on web (ChatComposerNew.tsx:6175-6195).
- Turn the torch on or off in the mobile camera (camera.tsx:322-340).
- Pick Local or Cloud in AGI Mobile chat (ModeToggle.tsx:96-135).
- Enable or disable skills with Space in the CLI (skills_toggle.rs:1-6).

## 2. User experience

**Where to find it**

- Web: composer work-mode pair (ChatComposerNew.tsx:6175), Settings general section segmented control (apps/web/features/settings/sections/GeneralSection.tsx:659), usage section (UsageSection.tsx:1109), onboarding radio choices (OnboardingWizard.tsx:216-239).
- Desktop: same as web in the public Desktop [inferred from doc: AGENTS.md section 5].
- Mobile: chat mode toggle 'Chat execution mode' with 'Local' and 'Cloud' (ModeToggle.tsx:112-135); chat style sheet 'Chat style' radio group (StyleSelector.tsx:151-172); notification switches (apps/mobile/src/features/settings/notifications/index.tsx).
- CLI: skills toggle overlay opened from tui_app.rs:6541-6553; effort picker titled ' Effort ' (effort_picker.rs:172).
- VS Code: settings page toggles such as 'Extended thinking' (settingsWebviewContent.ts:1407-1414).
- Chrome: menu rows with checkboxes in the side panel (side_panel.ts:11146-11154).

**Before you start**

- Mobile Cloud segment needs sign-in; its label reads 'AGI Cloud, sign in required' when locked (ModeToggle.tsx:130-132).

**Screens and controls**

- Web segmented control: group labelled by aria-label, each segment is a button with aria-pressed (SegmentedControl.tsx:46-64).
- Mobile ModeToggle: container role tablist, label 'Chat execution mode' (ModeToggle.tsx:112-116).
- CLI skills toggle: Space toggles, Enter saves, Esc discards (skills_toggle.rs:1-6).

**Journey**

1. 1. Person focuses or taps the control.
2. 2. Click, tap or Space activates it (CLI: Space).
3. 3. In a web segmented control, Left/Right/Up/Down, Home, End move focus with wrap; Enter or click chooses (SegmentedControl.tsx:20-44).
4. 4. The state change is shown and announced via aria-pressed, checked or selected.

**What the person sees and gets**

- Selected segment gets a filled style (SegmentedControl.tsx:62-66).
- Mobile Cloud locked tap opens the cloud access prompt (via test: apps/mobile/__tests__/ModeToggle.test.tsx it at line 46).
- CLI skills: only changed skills are reported after save (skills_toggle.rs test take_result_reports_only_changed_skills_after_save).

**Settings**

- Mobile mode toggle choice (execution mode, chat store); storage not traced.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web SegmentedControl with keyboard focus movement, wrap, Home and End (SegmentedControl.tsx:20-44).
- Web work-mode toggle buttons with aria-pressed, disabled while a turn is active (ChatComposerNew.tsx:6180-6185).
- Mobile Switch passes checked and disabled state to assistive tech (switch.tsx:36-37).
- Mobile radio group for chat style with role radiogroup and radio items (StyleSelector.tsx:151, :172).
- Mobile torch toggle with selected state and a label that flips (camera.tsx:329-332).
- CLI skills toggle wired into the TUI (tui_app.rs:6541-6553).
- Web onboarding RadioGroup with a screen-reader legend (OnboardingWizard.tsx:213-239).
- VS Code and Chrome have radio-style menu items: role menuitemradio (webviewContent.ts:5177; side_panel.ts:10992, :11098).

**Incomplete**

- VS Code switches are native checkboxes drawn as a track, no role switch found (settingsWebviewContent.ts:1407-1414; grep found none).
- Chrome switches are menuitemcheckbox rows, no role switch found (side_panel.ts:11146-11154).
- Mobile segment buttons carry selected state, not pressed (ModeToggle.tsx:70-71).
- Segmented control arrow keys move focus only; selection needs Enter, Space or click (SegmentedControl.tsx:38-44).

**Present but disconnected or switched off**

- None found; skills_toggle.rs has allow(dead_code) but is used (skills_toggle.rs:7; tui_app.rs:6541).

**Not available**

- VS Code toggle button and radio group as a visible group: not found; brief says missing (doc: knowledge-base/data/area-briefs/008-basic-interactive-elements.md S8.06, S8.15).
- Chrome radio group: not found (brief missing).
- CLI segmented control: no status in brief.

## 4. Required behaviour

**Established requirements**

- Toggle button with pressed state announced to assistive tech. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.06)
- Checkboxes expose checked state. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.14)
- Radio group has mutually exclusive visible options with checked state exposed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.15)
- Switches are immediate on/off settings with switch semantics. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.16)
- Segmented control is a small set of mutually exclusive options shown as joined segments. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.17)
- Hover-only actions also appear on keyboard focus and have touch alternatives. (source: (doc: docs/product/experience-contract.md:201))

**Acceptance criteria**

1. A screen reader announces a switch as on or off.
2. Toggle buttons announce pressed or not pressed.
3. In a radio group only one option can be checked and arrows move between them.
4. Segmented control: Left/Right moves focus with wrap, Home/End jump to first/last, Enter chooses.
5. Mobile Local/Cloud toggle announces the selected side.
6. VS Code and Chrome switch rows announce on/off.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Brief claim that arrow keys move selection in a segmented control does not match the code; they move focus [inferred from SegmentedControl.tsx:38-44].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add role switch to VS Code toggle inputs.
- [proposed] Decide whether segmented arrow keys should also select.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Switch | `packages/ui/ui/src/primitives/Switch.tsx` | Web switch on a Radix switch |
| component | Checkbox | `packages/ui/ui/src/primitives/Checkbox.tsx` | Web checkbox on a Radix checkbox |
| component | RadioGroup | `packages/ui/ui/src/primitives/RadioGroup.tsx` | Web radio group on Radix |
| component | SegmentedControl | `packages/ui/ui/src/primitives/SegmentedControl.tsx` | Joined segments with aria-pressed and focus keys |
| component | ChatComposerNew work mode buttons | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | aria-pressed chat/agiwork pair |
| component | GeneralSection | `apps/web/features/settings/sections/GeneralSection.tsx` | Uses SegmentedControl |
| component | OnboardingWizard | `apps/web/features/onboarding/components/OnboardingWizard.tsx` | Radio choices |
| component | Switch (mobile) | apps/mobile/components/ui/switch.tsx (not found) | Native switch with state |
| component | ModeToggle | `apps/mobile/src/features/chat/components/ModeToggle.tsx` | Local and Cloud segments |
| component | StyleSelector | `apps/mobile/src/features/chat/components/StyleSelector.tsx` | Radio group for chat style |
| component | Camera screen | `apps/mobile/app/(app)/camera.tsx` | Torch toggle |
| component | SkillsToggleView | `apps/cli/src/tui/widgets/skills_toggle.rs` | CLI checkbox list |
| component | EffortPicker | `apps/cli/src/tui/widgets/effort_picker.rs` | CLI one-of-seven choice |
| component | TUI app wiring | `apps/cli/src/tui/tui_app.rs` | Opens the skills toggle overlay |
| component | VS Code settings webview | `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts` | Toggle checkboxes |
| component | VS Code sidebar webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | menuitemradio rows |
| component | Chrome side panel menus | `apps/extension/src/side_panel.ts` | menuitemcheckbox and menuitemradio rows |
| test | SegmentedControl test | `packages/ui/ui/src/primitives/__tests__/SegmentedControl.test.tsx` | Group, pressed, arrows |
| test | ModeToggle test | `apps/mobile/__tests__/ModeToggle.test.tsx` | Local default, locked cloud |
| test | SwitchContrast test | `apps/mobile/__tests__/SwitchContrast.test.tsx` | Switch track and thumb contrast |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person activates control; it calls onValueChange / onChange with the new value. | device | SegmentedControl.tsx:57-58; switch.tsx:25-27 |
| Owner screen stores the value (settings store or chat store) and may call the server; not traced per control. | device | StyleSelector.test.tsx it 'tapping an option changes selection in chatStore' (line 128) |
| Mobile Cloud tap opens the cloud access prompt when locked. | device and our servers | ModeToggle.tsx:130-134; sign-in itself not traced |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chat style | chatStore (mobile) | unknown | unknown |
| CLI enabled skills | unknown; result read by caller after save | unknown | unknown |

**Models and providers.** Local/Cloud toggle picks the execution mode; it does not choose a model by itself. Effort picker and work-mode buttons set options sent with turns (not traced).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Mobile Cloud segment says sign in required when locked (ModeToggle.tsx:130-132). Other switches: none found. |
| Permissions | Web work-mode buttons are disabled while a turn is active (ChatComposerNew.tsx:6182). |
| Subscription | none found in ModeToggle.tsx or the primitives; unlock logic comes from the caller via cloudUnlocked (ModeToggle.tsx:11). |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code read. |
| Model compatibility | none found. |
| Provider restrictions | none found. |
| Local mode | Mobile Local segment is selectable without sign-in in the toggle component (ModeToggle.tsx:121-128); chat Local mode runs on the device [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Disabled switch | Mobile Switch dims to 65 percent and reports disabled | switch.tsx:32-37 |
| Locked Cloud | Label 'AGI Cloud, sign in required' | ModeToggle.tsx:131 |
| Read-only Local segment | Local is a tab when no handler, button when handler present | ModeToggle.tsx:127 |
| Wrap at ends | Focus wraps from last segment to first | SegmentedControl.tsx:36 |
| Touch | Larger hit area on coarse pointers | SegmentedControl.tsx:62 |
| Offline, retry, timeout | not handled in the controls | not handled in the code (looked in SegmentedControl.tsx and switch.tsx) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/primitives/__tests__/SegmentedControl.test.tsx`: Labelled group with pressed segment; reports chosen value; arrow keys move focus with wrap
- `packages/ui/ui/src/primitives/__tests__/RadioGroup.test.tsx`: Renders items (one test)
- `apps/mobile/__tests__/ModeToggle.test.tsx`: Default local, locked cloud prompt, sign in framing, unlocked cloud, equal halves, same selected pill
- `apps/mobile/__tests__/StyleSelector.test.tsx`: Four style options, default Normal, selection updates chat store
- `apps/mobile/__tests__/SwitchContrast.test.tsx`: Switch track and thumb contrast per theme
- `apps/mobile/__tests__/SettingsSwitchRowLargeText.test.tsx`: Settings switch row at large text (contents not opened)
- `apps/cli/src/tui/widgets/skills_toggle.rs`: In-file tests: initial state, Space toggles, navigate, Enter saves, only changed reported

**Test scenarios**

- **Segmented keyboard**
  1. On web Settings General tab to the segmented control.
  2. Press Right, End, Home, then Enter.
  - Expected: Focus moves with wrap and ends; Enter selects; aria-pressed updates.
- **Switch announcement**
  1. Open a mobile notification setting.
  2. Use VoiceOver on the switch.
  - Expected: Announced with name and on/off.
- **Cloud locked**
  1. Sign out in AGI Mobile and tap Cloud in the mode toggle.
  - Expected: Cloud access prompt opens; Local stays selected.
- **CLI skills**
  1. Open the skills overlay in the CLI.
  2. Space on a skill, Enter.
  - Expected: Changed skills are saved.
- **VS Code switch**
  1. Open VS Code settings, toggle 'Extended thinking' with the keyboard and a screen reader.
  - Expected: Expected: announced as on/off; current code uses a checkbox, verify.

**Where to look when it fails**

- Web: aria-pressed in the accessibility tree.
- Mobile: Jest tests in apps/mobile/__tests__.
- CLI: cargo tests in skills_toggle.rs.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/008-basic-interactive-elements.md](../../70-qa/test-plans/web/008-basic-interactive-elements.md)
- Desktop: [70-qa/test-plans/desktop/008-basic-interactive-elements.md](../../70-qa/test-plans/desktop/008-basic-interactive-elements.md)
- Mobile: [70-qa/test-plans/mobile/008-basic-interactive-elements.md](../../70-qa/test-plans/mobile/008-basic-interactive-elements.md)
- CLI: [70-qa/test-plans/cli/008-basic-interactive-elements.md](../../70-qa/test-plans/cli/008-basic-interactive-elements.md)
- VS Code: [70-qa/test-plans/vscode/008-basic-interactive-elements.md](../../70-qa/test-plans/vscode/008-basic-interactive-elements.md)
- Chrome: [70-qa/test-plans/chrome/008-basic-interactive-elements.md](../../70-qa/test-plans/chrome/008-basic-interactive-elements.md)

## 10. Gaps and dependencies

- **VS Code switches lack switch role** Affects: VS Code. Evidence: settingsWebviewContent.ts:1407-1414. Work needed: Add role switch or document checkbox semantics.
- **VS Code and Chrome have no real radio group or toggle button** Affects: VS Code, Chrome. Evidence: Brief S8.06, S8.15; only menuitemradio found. Work needed: Decide whether menu radios satisfy the requirement.
- **Segmented keys move focus not selection** Affects: Web, desktop. Evidence: SegmentedControl.tsx:38-44. Work needed: Fix the brief or the control.
- **Mobile uses selected, not pressed, for segments and toggles** Affects: Mobile. Evidence: ModeToggle.tsx:70; camera.tsx:331. Work needed: Check platform announcement.
- **RadioGroup test is shallow** Affects: Web. Evidence: RadioGroup.test.tsx line 6 only. Work needed: Add keyboard and checked-state tests.

**Depends on**

- SYS-shared-ui-and-design
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- mode:local
- mode:cloud
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- How cloudUnlocked is computed.
- Where chat execution mode and style are saved and whether they sync.
- Whether VS Code and Chrome announce their toggles as switches.
- Checkbox usage lines on web, mobile, CLI and Chrome: not opened.
- CLI effort picker keyboard keys.
