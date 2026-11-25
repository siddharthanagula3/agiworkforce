---
id: "GAPS-AREA-008"
type: "gap-list"
title: "Gaps: Basic interactive elements"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 8. Basic interactive elements

68 open gaps that touch this area. Area page: [20-features/008-basic-interactive-elements](../../20-features/008-basic-interactive-elements/README.md).

## GAP-AREA008-LW01

**The Button loading text is hard-coded English. The chip input in the same folder translates its messages.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-008
- Detail: Area 8. Basic interactive elements
- Evidence: packages/ui/ui/src/primitives/Button.tsx:103 versus packages/ui/ui/src/primitives/ChipInput.tsx:236

## GAP-F008-01-01

**Split button is not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-01](../../20-features/008-basic-interactive-elements/F008-01-action-buttons.md)
- Detail: Affects: All apps except CLI. Work needed: Design and build a shared SplitButton, then use it where an action has alternatives.
- Evidence: Brief S8.05 status missing; no component found in packages/ui/ui/src/primitives listing

## GAP-F008-01-02

**Mobile approval row has no group role**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-01](../../20-features/008-basic-interactive-elements/F008-01-action-buttons.md)
- Detail: Affects: Mobile screen reader users. Work needed: Mark the row as a labelled group (and accessible) and test with VoiceOver and TalkBack.
- Evidence: CloudToolApprovalControls.tsx:326-329 gives a label only

## GAP-F008-01-03

**Mobile Button has no busy state**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-01](../../20-features/008-basic-interactive-elements/F008-01-action-buttons.md)
- Detail: Affects: Mobile screen reader users. Work needed: Add busy to accessibilityState.
- Evidence: button.tsx:131

## GAP-F008-01-04

**Web asChild button skips loading text and fallback name**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-01](../../20-features/008-basic-interactive-elements/F008-01-action-buttons.md)
- Detail: Affects: Web users of link-styled buttons. Work needed: Add the same sr-only text for asChild or document it.
- Evidence: Button.tsx:74-88

## GAP-F008-01-05

**VS Code and Chrome button styles not verified here**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-01](../../20-features/008-basic-interactive-elements/F008-01-action-buttons.md)
- Detail: Affects: VS Code, Chrome. Work needed: Inspect classes for primary, destructive and icon-only buttons and record contrast and names.
- Evidence: Brief says done or unverified; I did not open the style definitions

## GAP-F008-01-NOTBUILT

**Action buttons: not built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F008-01](../../20-features/008-basic-interactive-elements/F008-01-action-buttons.md)
- Requirement items: S8.05
- Detail: Web: S8.05; Desktop: S8.05; Mobile: S8.05; VS Code: S8.05; Chrome: S8.05

## GAP-F008-01-PARTLY

**Action buttons: partly built on Mobile, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F008-01](../../20-features/008-basic-interactive-elements/F008-01-action-buttons.md)
- Requirement items: S8.07
- Detail: Mobile S8.07: The approve and deny row of the tool approval controls (CloudToolApprovalControls.tsx) is not exposed as a labelled button group.

## GAP-F008-02-01

**CLI links cannot be activated in code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-02](../../20-features/008-basic-interactive-elements/F008-02-text-links.md)
- Detail: Affects: CLI. Work needed: Decide whether to add terminal hyperlinks and test.
- Evidence: markdown_renderer.rs:265-278 only styles and prints

## GAP-F008-02-02

**Mobile link colour equals text colour**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-02](../../20-features/008-basic-interactive-elements/F008-02-text-links.md)
- Detail: Affects: Mobile. Work needed: Use a link colour token with contrast check.
- Evidence: MarkdownInline.tsx:145-147

## GAP-F008-02-03

**Desktop, VS Code and Chrome opening not verified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-02](../../20-features/008-basic-interactive-elements/F008-02-text-links.md)
- Detail: Affects: Desktop, VS Code, Chrome. Work needed: Verify by running each app.
- Evidence: No click handler for links found in render.ts; reliance on host not confirmed

## GAP-F008-03-01

**Brief status for mobile code field is out of date**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-03](../../20-features/008-basic-interactive-elements/F008-03-text-fields-and-search.md)
- Detail: Affects: Mobile. Work needed: Verify on device and update the brief.
- Evidence: MobileSignIn.tsx:644-651 vs brief S8.13 unverified

## GAP-F008-03-02

**Chrome has no sign-in code field found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-03](../../20-features/008-basic-interactive-elements/F008-03-text-fields-and-search.md)
- Detail: Affects: Chrome. Work needed: Confirm how Chrome signs in (sync with web?) and correct the brief.
- Evidence: authInterop.ts:1-9 is detection only

## GAP-F008-03-03

**Composer behaviour not checked**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-03](../../20-features/008-basic-interactive-elements/F008-03-text-fields-and-search.md)
- Detail: Affects: All. Work needed: Read and test Enter versus newline rules.
- Evidence: ChatComposerNew.tsx, ChatInput.tsx not opened

## GAP-F008-03-04

**Chrome masked field is a dev fallback**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-03](../../20-features/008-basic-interactive-elements/F008-03-text-fields-and-search.md)
- Detail: Affects: Chrome. Work needed: Check other secret fields in Chrome.
- Evidence: options.ts:1960-1971

## GAP-F008-03-PARTLY

**Text fields and search: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F008-03](../../20-features/008-basic-interactive-elements/F008-03-text-fields-and-search.md)
- Requirement items: S8.13

## GAP-F008-04-01

**VS Code switches lack switch role**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-04](../../20-features/008-basic-interactive-elements/F008-04-switches-checkboxes-and-toggle-buttons.md)
- Detail: Affects: VS Code. Work needed: Add role switch or document checkbox semantics.
- Evidence: settingsWebviewContent.ts:1407-1414

## GAP-F008-04-02

**VS Code and Chrome have no real radio group or toggle button**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-04](../../20-features/008-basic-interactive-elements/F008-04-switches-checkboxes-and-toggle-buttons.md)
- Detail: Affects: VS Code, Chrome. Work needed: Decide whether menu radios satisfy the requirement.
- Evidence: Brief S8.06, S8.15; only menuitemradio found

## GAP-F008-04-03

**Segmented keys move focus not selection**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-04](../../20-features/008-basic-interactive-elements/F008-04-switches-checkboxes-and-toggle-buttons.md)
- Detail: Affects: Web, desktop. Work needed: Fix the brief or the control.
- Evidence: SegmentedControl.tsx:38-44

## GAP-F008-04-04

**Mobile uses selected, not pressed, for segments and toggles**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-04](../../20-features/008-basic-interactive-elements/F008-04-switches-checkboxes-and-toggle-buttons.md)
- Detail: Affects: Mobile. Work needed: Check platform announcement.
- Evidence: ModeToggle.tsx:70; camera.tsx:331

## GAP-F008-04-05

**RadioGroup test is shallow**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-04](../../20-features/008-basic-interactive-elements/F008-04-switches-checkboxes-and-toggle-buttons.md)
- Detail: Affects: Web. Work needed: Add keyboard and checked-state tests.
- Evidence: RadioGroup.test.tsx line 6 only

## GAP-F008-04-NOTBUILT

**Switches, checkboxes and toggle buttons: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F008-04](../../20-features/008-basic-interactive-elements/F008-04-switches-checkboxes-and-toggle-buttons.md)
- Requirement items: S8.06, S8.15
- Detail: VS Code: S8.06, S8.15; Chrome: S8.15

## GAP-F008-04-PARTLY

**Switches, checkboxes and toggle buttons: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F008-04](../../20-features/008-basic-interactive-elements/F008-04-switches-checkboxes-and-toggle-buttons.md)
- Requirement items: S8.06, S8.17

## GAP-F008-05-01

**No mobile multiselect or chip input**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-05](../../20-features/008-basic-interactive-elements/F008-05-choose-one-or-more-from-a-list.md)
- Detail: Affects: Mobile. Work needed: Build when a mobile screen needs them.
- Evidence: Brief S8.20, S8.21 missing

## GAP-F008-05-02

**Chip input commit keys differ from the draft**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-05](../../20-features/008-basic-interactive-elements/F008-05-choose-one-or-more-from-a-list.md)
- Detail: Affects: Web, desktop. Work needed: Decide whether typed space or semicolon should commit.
- Evidence: ChipInput.tsx:131-135

## GAP-F008-05-03

**Brief cites CodeChangesPanel for multiselect, which shows static chips**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-05](../../20-features/008-basic-interactive-elements/F008-05-choose-one-or-more-from-a-list.md)
- Detail: Affects: Documentation. Work needed: Point the brief to AgentSkillSelection.
- Evidence: CodeChangesPanel.tsx:205-225

## GAP-F008-05-04

**VS Code multiselect exists though brief says missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-05](../../20-features/008-basic-interactive-elements/F008-05-choose-one-or-more-from-a-list.md)
- Detail: Affects: VS Code. Work needed: Update brief.
- Evidence: capabilityManagement.ts:1145

## GAP-F008-05-05

**Skill multiselect has no remove control**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-05](../../20-features/008-basic-interactive-elements/F008-05-choose-one-or-more-from-a-list.md)
- Detail: Affects: Web. Work needed: Add removable selected list.
- Evidence: No remove in AgentSkillSelection.tsx

## GAP-F008-05-NOTBUILT

**Choose one or more from a list: not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F008-05](../../20-features/008-basic-interactive-elements/F008-05-choose-one-or-more-from-a-list.md)
- Requirement items: S8.19, S8.20, S8.21
- Detail: Mobile: S8.20, S8.21; VS Code: S8.20, S8.21; Chrome: S8.19, S8.20, S8.21

## GAP-F008-06-01

**Range slider not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-06](../../20-features/008-basic-interactive-elements/F008-06-numeric-values-and-sliders.md)
- Detail: Affects: All apps. Work needed: Extend Slider to two values when needed.
- Evidence: Slider.tsx:79-90 single Thumb; brief S8.24

## GAP-F008-06-02

**No custom stepper and no mobile number field**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-06](../../20-features/008-basic-interactive-elements/F008-06-numeric-values-and-sliders.md)
- Detail: Affects: Mobile (and consistency). Work needed: Create a NumberStepper.
- Evidence: No stepper found; brief S8.22

## GAP-F008-06-03

**Brief citations for steppers and sliders pointed at unrelated lines**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-06](../../20-features/008-basic-interactive-elements/F008-06-numeric-values-and-sliders.md)
- Detail: Affects: Documentation. Work needed: Correct brief lines.
- Evidence: ScheduleForm.tsx:262 is a select; personalization/index.tsx:123 is an option chooser

## GAP-F008-06-04

**Slider missing in VS Code and Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-06](../../20-features/008-basic-interactive-elements/F008-06-numeric-values-and-sliders.md)
- Detail: Affects: VS Code, Chrome. Work needed: Add if a feature needs it.
- Evidence: Brief S8.23; no range input found in VS Code source

## GAP-F008-06-NOTBUILT

**Numeric values and sliders: not built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F008-06](../../20-features/008-basic-interactive-elements/F008-06-numeric-values-and-sliders.md)
- Requirement items: S8.22, S8.23, S8.24
- Detail: Web: S8.24; Desktop: S8.24; Mobile: S8.22, S8.24; VS Code: S8.23, S8.24; Chrome: S8.23, S8.24

## GAP-F008-07-01

**Retained desktop schedule form has no zone picker.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-07](../../20-features/008-basic-interactive-elements/F008-07-date-time-zone-and-colour-pickers.md)
- Detail: Affects: Desktop Tauri code only; Electron Desktop shows web. Work needed: Confirm which desktop code ships, then add the picker or fix the brief.
- Evidence: apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:108-111,163

## GAP-F008-07-02

**Brief says Chrome has no date, time or zone picker but code has them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-07](../../20-features/008-basic-interactive-elements/F008-07-date-time-zone-and-colour-pickers.md)
- Detail: Affects: Chrome extension, brief accuracy. Work needed: Update brief statuses.
- Evidence: apps/extension/src/features/side-panel/schedulesSection.ts:515-524

## GAP-F008-07-03

**No date, time, zone or colour picker in VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-07](../../20-features/008-basic-interactive-elements/F008-07-date-time-zone-and-colour-pickers.md)
- Detail: Affects: VS Code. Work needed: Decide whether VS Code needs them; if not mark n/a.
- Evidence: search of apps/extension-vscode/src found no such input

## GAP-F008-07-04

**Custom project colour snaps to a preset.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-07](../../20-features/008-basic-interactive-elements/F008-07-date-time-zone-and-colour-pickers.md)
- Detail: Affects: Web. Work needed: State this in the UI or store exact colours.
- Evidence: page.tsx:891-897

## GAP-F008-07-05

**Brief code references for date picker point at files with no date input.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-07](../../20-features/008-basic-interactive-elements/F008-07-date-time-zone-and-colour-pickers.md)
- Detail: Affects: Documentation. Work needed: Re-point brief to ScheduleForm.tsx.
- Evidence: GlobalSearchDialog.tsx and apps/web/app/chat/page.tsx contain none

## GAP-F008-07-NOTBUILT

**Date, time, zone and colour pickers: not built on VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code
- Features: [F008-07](../../20-features/008-basic-interactive-elements/F008-07-date-time-zone-and-colour-pickers.md)
- Requirement items: S8.25, S8.26, S8.28
- Detail: VS Code: S8.25, S8.26, S8.28

## GAP-F008-08-01

**Web drop overlay is not announced to assistive technology.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-08](../../20-features/008-basic-interactive-elements/F008-08-files-and-drop-areas.md)
- Detail: Affects: Web screen reader users. Work needed: Add a status or dialog role and label.
- Evidence: DragDropOverlay.tsx:75-109 has no role or aria

## GAP-F008-08-02

**CLI has no device file chooser, only a workspace @ list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-08](../../20-features/008-basic-interactive-elements/F008-08-files-and-drop-areas.md)
- Detail: Affects: CLI. Work needed: Confirm that is the intended design and document it.
- Evidence: mention_popup.rs:1-9

## GAP-F008-08-03

**Brief code line references are stale (for example tui_app.rs:2830 is unrelated; ChatComposerNew.tsx:5230 is not the input).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-08](../../20-features/008-basic-interactive-elements/F008-08-files-and-drop-areas.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: tui_app.rs:2820-2840; ChatComposerNew.tsx:5222-5245

## GAP-F008-08-04

**Retained desktop composer drop zone not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-08](../../20-features/008-basic-interactive-elements/F008-08-files-and-drop-areas.md)
- Detail: Affects: Desktop Tauri code. Work needed: Verify or mark n/a.
- Evidence: only ProjectSettingsDialog.tsx and CodeWorkspace.tsx matched a drop search

## GAP-F008-09-01

**Web research tabs lack arrow-key handling and tab panels.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-09](../../20-features/008-basic-interactive-elements/F008-09-tabs-accordions-and-disclosure.md)
- Detail: Affects: Web keyboard and screen reader users. Work needed: Adopt useTablistKeyboard and add role tabpanel with aria-controls.
- Evidence: ResearchPanel.tsx:403-440

## GAP-F008-09-02

**Brief marks accordion missing on CLI, VS Code and Chrome and lists CLI tabs and disclosure as done; the CLI tab and disclosure code exists but not an accordion.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-09](../../20-features/008-basic-interactive-elements/F008-09-tabs-accordions-and-disclosure.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Decide if accordion applies there.
- Evidence: S8.32; screen_renderers.rs; tui_app.rs:4056

## GAP-F008-09-03

**Brief line references stale (for example tui_app.rs:2605).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-09](../../20-features/008-basic-interactive-elements/F008-09-tabs-accordions-and-disclosure.md)
- Detail: Affects: Documentation. Work needed: Refresh.
- Evidence: brief S8.33

## GAP-F008-09-04

**Open or selected state is not remembered.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-09](../../20-features/008-basic-interactive-elements/F008-09-tabs-accordions-and-disclosure.md)
- Detail: Affects: All apps. Work needed: Only if product wants persistence [proposed].
- Evidence: state is local to components

## GAP-F008-09-NOTBUILT

**Tabs, accordions and disclosure: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F008-09](../../20-features/008-basic-interactive-elements/F008-09-tabs-accordions-and-disclosure.md)
- Requirement items: S8.32
- Detail: CLI: S8.32; VS Code: S8.32; Chrome: S8.32

## GAP-F008-10-01

**No custom context menu on web chat or sidebar items.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-10](../../20-features/008-basic-interactive-elements/F008-10-menus.md)
- Detail: Affects: Web and Electron Desktop. Work needed: Add one or mark n/a.
- Evidence: search for onContextMenu in apps/web found only SlackSection.tsx:657

## GAP-F008-10-02

**Retained desktop FileTree menu has no test and the brief says missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-10](../../20-features/008-basic-interactive-elements/F008-10-menus.md)
- Detail: Affects: Desktop Tauri code. Work needed: Add tests, correct the brief.
- Evidence: no FileTree test file in apps/desktop/src/features/code

## GAP-F008-10-03

**Context menu has no keyboard open path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-10](../../20-features/008-basic-interactive-elements/F008-10-menus.md)
- Detail: Affects: Keyboard users. Work needed: Add Shift+F10 or menu key.
- Evidence: FileTree.tsx:449 opens only on a mouse event

## GAP-F008-10-04

**Brief code references are stale (background.ts:4526, commandSetup.ts:965).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-10](../../20-features/008-basic-interactive-elements/F008-10-menus.md)
- Detail: Affects: Documentation. Work needed: Refresh.
- Evidence: background.ts:4520-4535 is message handling

## GAP-F008-10-NOTBUILT

**Menus: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F008-10](../../20-features/008-basic-interactive-elements/F008-10-menus.md)
- Requirement items: S8.35, S8.36
- Detail: Web: S8.35; Desktop: S8.35; Mobile: S8.36; CLI: S8.36; VS Code: S8.36; Chrome: S8.36

## GAP-F008-11-01

**No dedicated hover card; preview is a tooltip.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-11](../../20-features/008-basic-interactive-elements/F008-11-hints-tags-and-status-markers.md)
- Detail: Affects: Web. Work needed: Decide if rich hover card behaviour (keeps open on hover) is wanted.
- Evidence: CitationChip.tsx:150

## GAP-F008-11-02

**Web author marker is invisible text only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-11](../../20-features/008-basic-interactive-elements/F008-11-hints-tags-and-status-markers.md)
- Detail: Affects: Sighted users. Work needed: Optional visible marker.
- Evidence: MessageBubble.tsx:2588

## GAP-F008-11-03

**Mobile, CLI tooltip and mobile popover status unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-11](../../20-features/008-basic-interactive-elements/F008-11-hints-tags-and-status-markers.md)
- Detail: Affects: Mobile, CLI. Work needed: Verify or mark n/a.
- Evidence: brief has no status

## GAP-F008-11-04

**Chrome badges and tags unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-11](../../20-features/008-basic-interactive-elements/F008-11-hints-tags-and-status-markers.md)
- Detail: Affects: Chrome. Work needed: Check and record.
- Evidence: brief

## GAP-F008-11-05

**Badge has no status semantics.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-11](../../20-features/008-basic-interactive-elements/F008-11-hints-tags-and-status-markers.md)
- Detail: Affects: Screen reader users. Work needed: Callers must add text or role.
- Evidence: Badge.tsx:28-30

## GAP-F008-11-NOTBUILT

**Hints, tags and status markers: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F008-11](../../20-features/008-basic-interactive-elements/F008-11-hints-tags-and-status-markers.md)
- Requirement items: S8.39
- Detail: VS Code: S8.39; Chrome: S8.39

## GAP-F008-11-PARTLY

**Hints, tags and status markers: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F008-11](../../20-features/008-basic-interactive-elements/F008-11-hints-tags-and-status-markers.md)
- Requirement items: S8.40, S8.41

## GAP-F008-12-01

**Progress has no default accessible name.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-12](../../20-features/008-basic-interactive-elements/F008-12-progress-loading-and-feedback-messages.md)
- Detail: Affects: All apps using the primitive. Work needed: Require aria-label.
- Evidence: Progress.tsx:25-31

## GAP-F008-12-02

**No toast on Chrome, no skeleton on VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-12](../../20-features/008-basic-interactive-elements/F008-12-progress-loading-and-feedback-messages.md)
- Detail: Affects: Chrome, VS Code. Work needed: Add or mark n/a.
- Evidence: brief S8.44, S8.45

## GAP-F008-12-03

**Mobile toast announcement not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-12](../../20-features/008-basic-interactive-elements/F008-12-progress-loading-and-feedback-messages.md)
- Detail: Affects: Mobile screen reader users. Work needed: Confirm and add a live announcement.
- Evidence: Toast.tsx lines 1-110 read

## GAP-F008-12-04

**Brief code references are stale (for example WebChatPage.tsx:5569).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-12](../../20-features/008-basic-interactive-elements/F008-12-progress-loading-and-feedback-messages.md)
- Detail: Affects: Documentation. Work needed: Refresh.
- Evidence: WebChatPage.tsx:5560-5640 is edit handling

## GAP-F008-12-05

**Pagination on VS Code and Chrome unclear.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F008-12](../../20-features/008-basic-interactive-elements/F008-12-progress-loading-and-feedback-messages.md)
- Detail: Affects: VS Code, Chrome. Work needed: Verify.
- Evidence: brief

## GAP-F008-12-NOTBUILT

**Progress, loading and feedback messages: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F008-12](../../20-features/008-basic-interactive-elements/F008-12-progress-loading-and-feedback-messages.md)
- Requirement items: S8.44, S8.45, S8.48
- Detail: VS Code: S8.44, S8.48; Chrome: S8.44, S8.45

## GAP-F008-12-PARTLY

**Progress, loading and feedback messages: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F008-12](../../20-features/008-basic-interactive-elements/F008-12-progress-loading-and-feedback-messages.md)
- Requirement items: S8.48
