---
id: "GAPS-AREA-006"
type: "gap-list"
title: "Gaps: Visual foundations and spacing conventions"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 6. Visual foundations and spacing conventions

52 open gaps that touch this area. Area page: [20-features/006-visual-foundations-and-spacing-conventions](../../20-features/006-visual-foundations-and-spacing-conventions/README.md).

## GAP-AREA006-LW08

**Wrong citation for VS Code reduced motion: this line is subagent row CSS. The real reduced-motion rule is further down.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-006
- Detail: Area 6. Visual foundations and spacing conventions
- Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2055-2058 (real rule at 2774-2781)

## GAP-AREA006-LW09

**Wrong citation for desktop theme: this line is the external-link handler, not theme code. The theme code is at lines 613-617 and 2604-2605.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-006
- Detail: Area 6. Visual foundations and spacing conventions
- Evidence: apps/desktop/electron/main.ts:548-556

## GAP-AREA006-LW11

**Z-index ladder is not shared in VS Code. The sidebar defines its own numbers (dropdown 20, popover 30, overlay 50, sheet 60) and does not use the shared ladder (dropdown 50, popover 350), which contradicts S6.29.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-006
- Detail: Area 6. Visual foundations and spacing conventions
- Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:220-224 vs packages/ui/design-tokens/src/foundation.css:329-336

## GAP-AREA006-LW12

**Z-index ladder is not shared in Chrome: the side panel stylesheet defines its own values (dropdown 10, popover 20, modal 60, modal-raised 61). This contradicts S6.29.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-006
- Detail: Area 6. Visual foundations and spacing conventions
- Evidence: apps/extension/src/side_panel.css:25-36

## GAP-AREA006-LW13

**Icon sizes are not from a small set on mobile: the code uses literal sizes from 10 to 22 across many files, at least 12 distinct values. This contradicts S6.25.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-006
- Detail: Area 6. Visual foundations and spacing conventions
- Evidence: apps/mobile/src/features/settings/appearance/index.tsx:39-60 (size 19, one example; repeated across apps/mobile)

## GAP-AREA006-LW15

**Two button size scales: web names default, xs, sm, lg, icon with heights 40, 28, 36, 44 px; mobile names sm, md, lg with minimum heights 36, 44, 52. There is no shared size scale across apps.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-006
- Detail: Area 6. Visual foundations and spacing conventions
- Evidence: packages/ui/ui/src/primitives/Button.tsx:24-28; apps/mobile/components/ui/button.tsx:21-30

## GAP-AREA006-LW16

**Two heading-3 sizes: chat uses 1.0625rem and the foundation scale uses 1.125rem. Two scales exist for the same role.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-006
- Detail: Area 6. Visual foundations and spacing conventions
- Evidence: packages/ui/design-tokens/src/chat.css:52; packages/ui/design-tokens/src/foundation.css:383

## GAP-F006-01-01

**Light chat surface base and elevated are the same colour**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-01](../../20-features/006-visual-foundations-and-spacing-conventions/F006-01-colour-roles.md)
- Detail: Affects: Web and desktop, light theme. Work needed: Pick a distinct elevated value or point chat cards at --surface-elevated and extend theme-contrast.test.ts
- Evidence: packages/ui/design-tokens/src/chat.css:60-61 (both #ffffff); requirement S6.02

## GAP-F006-01-02

**Dialog and AlertDialog use the page background at 95 percent, not the elevated token**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-01](../../20-features/006-visual-foundations-and-spacing-conventions/F006-01-colour-roles.md)
- Detail: Affects: Web and desktop. Work needed: Switch to the elevated surface role and re-run contrast tests
- Evidence: packages/ui/ui/src/primitives/Dialog.tsx:115; AlertDialog.tsx:104

## GAP-F006-01-03

**Mobile has no in-app contrast control and no accent control outside a separate screen**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-01](../../20-features/006-visual-foundations-and-spacing-conventions/F006-01-colour-roles.md)
- Detail: Affects: Mobile. Work needed: Decide whether the Appearance requirement applies to mobile; add Contrast if so
- Evidence: apps/mobile/src/features/settings/appearance/index.tsx lists theme rows only

## GAP-F006-01-04

**No accent control on CLI, VS Code or Chrome, and no account sync of theme on those apps**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-01](../../20-features/006-visual-foundations-and-spacing-conventions/F006-01-colour-roles.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Record intent in the surface matrix or add controls
- Evidence: theme_picker.rs, appearance-section.ts and webviewContent.ts show no accent control

## GAP-F006-01-05

**Disabled web buttons dim with opacity 50 percent**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-01](../../20-features/006-visual-foundations-and-spacing-conventions/F006-01-colour-roles.md)
- Detail: Affects: Web, desktop. Work needed: Confirm disabled controls are exempt from the no-opacity rule, or use a disabled token (text-disabled exists at foundation.css:188 region)
- Evidence: packages/ui/ui/src/primitives/Button.tsx:9

## GAP-F006-02-01

**No in-app text-size or chat font control on mobile, VS Code, Chrome or CLI**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-02](../../20-features/006-visual-foundations-and-spacing-conventions/F006-02-type-scale-and-fonts.md)
- Detail: Affects: Those four apps. Work needed: Decide if parity is required (doc: docs/product/requirements.md lists them for web Appearance) and add or record the difference
- Evidence: Only AppearanceSection.tsx (web) has the controls; mobile follows OS (TextScaleBoundary.tsx)

## GAP-F006-02-02

**Chat heading 3 size is a literal**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-02](../../20-features/006-visual-foundations-and-spacing-conventions/F006-02-type-scale-and-fonts.md)
- Detail: Affects: Web, desktop. Work needed: Use the h3 token
- Evidence: chat.css --chat-type-heading-3-size 1.0625rem

## GAP-F006-02-03

**Chrome side panel sets sizes at 14px in its own stylesheet instead of the shared type tokens**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-02](../../20-features/006-visual-foundations-and-spacing-conventions/F006-02-type-scale-and-fonts.md)
- Detail: Affects: Chrome. Work needed: Consume the shared roles or document the reason
- Evidence: apps/extension/src/side_panel.css:44-62

## GAP-F006-03-01

**Duplicate paragraph rules on web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-03](../../20-features/006-visual-foundations-and-spacing-conventions/F006-03-reply-content-spacing.md)
- Detail: Affects: Web, desktop. Work needed: Remove or merge so one rule owns paragraph gaps
- Evidence: globals.css:813 and :1117

## GAP-F006-03-02

**Spacing constants are literals on mobile and VS Code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-03](../../20-features/006-visual-foundations-and-spacing-conventions/F006-03-reply-content-spacing.md)
- Detail: Affects: Mobile, VS Code. Work needed: Name them in the shared tokens or a local constants file
- Evidence: MessageContentRenderer.tsx:1095,1207; webviewContent.ts:1417,1436

## GAP-F006-03-03

**No tests assert paragraph, list, code padding or table padding values**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-03](../../20-features/006-visual-foundations-and-spacing-conventions/F006-03-reply-content-spacing.md)
- Detail: Affects: All apps except CLI table output. Work needed: Add computed-style tests
- Evidence: Search of tests in apps/web/shared/components/__tests__ listed none for these rules

## GAP-F006-04-01

**Chat column does not step with width**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-04](../../20-features/006-visual-foundations-and-spacing-conventions/F006-04-chat-layout-spacing.md)
- Detail: Affects: Web, desktop. Work needed: Confirm intent; if stepping is required, add sm and lg gutters
- Evidence: globals.css:843 uses px-gutter-compact only; S6.20

## GAP-F006-04-02

**No named toolbar-distance token**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-04](../../20-features/006-visual-foundations-and-spacing-conventions/F006-04-chat-layout-spacing.md)
- Detail: Affects: Web, mobile, VS Code. Work needed: Share one token
- Evidence: messageActionRow.ts has sizes only; VS Code has --message-actions-gap (webviewContent.ts:247)

## GAP-F006-04-03

**CLI and Chrome spacing for turns, toolbar and composer not located**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-04](../../20-features/006-visual-foundations-and-spacing-conventions/F006-04-chat-layout-spacing.md)
- Detail: Affects: CLI, Chrome. Work needed: Locate and cite current lines or record n/a
- Evidence: Brief lines did not match code I opened

## GAP-F006-05-01

**No test found that measures row, menu, dialog or sheet sizes**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-05](../../20-features/006-visual-foundations-and-spacing-conventions/F006-05-row-menu-dialog-and-form-sizes.md)
- Detail: Affects: Web, desktop. Work needed: Add class or computed-style assertions
- Evidence: Test list for packages/ui/ui primitives covers behaviour, titles not showing size assertions

## GAP-F006-05-02

**No shared form-field primitive for label and field spacing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-05](../../20-features/006-visual-foundations-and-spacing-conventions/F006-05-row-menu-dialog-and-form-sizes.md)
- Detail: Affects: Web, desktop. Work needed: Add or record the pattern
- Evidence: Primitives directory lists Input, Label, Textarea but no Field

## GAP-F006-05-03

**Mobile and extension rows and dialogs not verified from code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-05](../../20-features/006-visual-foundations-and-spacing-conventions/F006-05-row-menu-dialog-and-form-sizes.md)
- Detail: Affects: Mobile, VS Code, Chrome. Work needed: Read and cite
- Evidence: Files not opened

## GAP-F006-06-01

**Two icon families on web, a third on mobile and a fourth in Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-06](../../20-features/006-visual-foundations-and-spacing-conventions/F006-06-buttons-and-icons.md)
- Detail: Affects: All apps. Work needed: Plan migration and add a lint guard; align Chrome stroke
- Evidence: 273 lucide-react files versus 116 @agiworkforce/icons files; mobile 677 lucide-react-native files; Chrome icons.ts uses stroke 1.75 (icons.ts:3)

## GAP-F006-06-02

**Button sizes differ in name and scale per app**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-06](../../20-features/006-visual-foundations-and-spacing-conventions/F006-06-buttons-and-icons.md)
- Detail: Affects: Mobile, VS Code, Chrome. Work needed: Document the mapping or share a token set
- Evidence: Button.tsx:23-27 vs button.tsx:21-25 vs --control-*

## GAP-F006-06-03

**Appearance page uses raw buttons and a non-shared icon family**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-06](../../20-features/006-visual-foundations-and-spacing-conventions/F006-06-buttons-and-icons.md)
- Detail: Affects: Web, desktop. Work needed: Use Button and the shared icons
- Evidence: AppearanceSection.tsx:4,49-70

## GAP-F006-06-04

**Disabled opacity 50 percent**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-06](../../20-features/006-visual-foundations-and-spacing-conventions/F006-06-buttons-and-icons.md)
- Detail: Affects: Web, desktop. Work needed: Confirm acceptable for disabled controls
- Evidence: Button.tsx:9

## GAP-F006-07-01

**VS Code and Chrome use private z ladders with different numbers from the web ladder.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-07](../../20-features/006-visual-foundations-and-spacing-conventions/F006-07-corners-shadows-and-stacking.md)
- Detail: Affects: VS Code and Chrome extension users (low risk; separate webviews).. Work needed: Decide whether to generate these from shared tokens, or document why they are separate.
- Evidence: webviewContent.ts:220-224; side_panel.css:29-36

## GAP-F006-07-02

**Chrome options page has a raw z-index: 20.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-07](../../20-features/006-visual-foundations-and-spacing-conventions/F006-07-corners-shadows-and-stacking.md)
- Detail: Affects: Chrome extension options page.. Work needed: Replace with a named rung and extend the guard to this file.
- Evidence: apps/extension/src/options.ts:1060

## GAP-F006-07-03

**Mobile elevation is not different per theme.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-07](../../20-features/006-visual-foundations-and-spacing-conventions/F006-07-corners-shadows-and-stacking.md)
- Detail: Affects: Mobile users in dark theme.. Work needed: Add a dark elevation set and choose by isDark.
- Evidence: apps/mobile/src/ui/theme/tokens.ts:144-171

## GAP-F006-07-04

**DropdownMenu does not use the dropdown rung, so that rung may be unused on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-07](../../20-features/006-visual-foundations-and-spacing-conventions/F006-07-corners-shadows-and-stacking.md)
- Detail: Affects: Web engineers.. Work needed: Confirm which components use z-dropdown; remove or use it.
- Evidence: DropdownMenu.tsx:104 vs foundation.css:329

## GAP-F006-07-05

**CLI has no entry, and the brief marks no status.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-07](../../20-features/006-visual-foundations-and-spacing-conventions/F006-07-corners-shadows-and-stacking.md)
- Detail: Affects: CLI.. Work needed: Mark as not applicable in the brief.
- Evidence: (doc: area brief S6.27-S6.29)

## GAP-F006-08-01

**Web spinner may be frozen under in-app Reduced and may not slow under the OS rule.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-08](../../20-features/006-visual-foundations-and-spacing-conventions/F006-08-motion-and-reduced-motion.md)
- Detail: Affects: Web and Desktop users who ask for reduced motion.. Work needed: Run the real page, confirm, then make the spinner rule win (important) and cover both OS and in-app cases with a test.
- Evidence: globals.css:1373-1388,1928-1942 vs apps/desktop/src/styles/globals.css:1318-1324

## GAP-F006-08-02

**No in-app motion control on Mobile, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-08](../../20-features/006-visual-foundations-and-spacing-conventions/F006-08-motion-and-reduced-motion.md)
- Detail: Affects: Users who want less motion in one app only.. Work needed: Decide if needed; add a setting and test.
- Evidence: No motion setting found in those apps

## GAP-F006-08-03

**CLI reduced motion uses a still dot, while web wants a slowed spinner.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-08](../../20-features/006-visual-foundations-and-spacing-conventions/F006-08-motion-and-reduced-motion.md)
- Detail: Affects: CLI users.. Work needed: None required if accepted; document the difference.
- Evidence: tui/motion.rs:6

## GAP-F006-08-04

**CLI --plain and AGI_PLAIN switch reduced motion on without a separate message.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-08](../../20-features/006-visual-foundations-and-spacing-conventions/F006-08-motion-and-reduced-motion.md)
- Detail: Affects: CLI users.. Work needed: Consider documenting in help text.
- Evidence: tui_app.rs:7122-7124

## GAP-F006-09-01

**CLI persists the theme only per project.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-09](../../20-features/006-visual-foundations-and-spacing-conventions/F006-09-light-dark-and-system-themes.md)
- Detail: Affects: CLI users who want one theme everywhere.. Work needed: Confirm and, if needed, persist at user level.
- Evidence: config.rs:1263-1266

## GAP-F006-09-02

**Mobile Local theme does not sync, by design; Cloud theme syncs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-09](../../20-features/006-visual-foundations-and-spacing-conventions/F006-09-light-dark-and-system-themes.md)
- Detail: Affects: Mobile users who switch modes.. Work needed: None required; document that theme is per mode.
- Evidence: localSettingsStore.ts:91; cloudSettingsStore.ts:86

## GAP-F006-09-03

**Web invalid-value fallback is dark, not the System default.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-09](../../20-features/006-visual-foundations-and-spacing-conventions/F006-09-light-dark-and-system-themes.md)
- Detail: Affects: Web users with corrupt storage.. Work needed: Decide if System is better; change constant and test.
- Evidence: ThemeConstants.ts:7,9

## GAP-F006-09-04

**CLI label is 'Ansi' not 'ANSI'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-09](../../20-features/006-visual-foundations-and-spacing-conventions/F006-09-light-dark-and-system-themes.md)
- Detail: Affects: Documentation only.. Work needed: Use the exact label in docs.
- Evidence: theme_picker.rs:61-71

## GAP-F006-10-01

**No in-app high-contrast control on Mobile or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-10](../../20-features/006-visual-foundations-and-spacing-conventions/F006-10-high-contrast.md)
- Detail: Affects: Users whose device setting is off or unsupported.. Work needed: Add a setting if wanted.
- Evidence: No control found in apps/mobile or apps/extension options

## GAP-F006-10-02

**Web contrast rules duplicated in two blocks.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-10](../../20-features/006-visual-foundations-and-spacing-conventions/F006-10-high-contrast.md)
- Detail: Affects: Engineers; risk of drift.. Work needed: Keep in sync; the test covers some parity.
- Evidence: globals.css:1271-1320

## GAP-F006-10-03

**Whether the web High values meet a numeric contrast ratio is not tested.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-10](../../20-features/006-visual-foundations-and-spacing-conventions/F006-10-high-contrast.md)
- Detail: Affects: Web users.. Work needed: Add computed-ratio test.
- Evidence: high-contrast-css.test.ts checks shape (test titles lines 9-22)

## GAP-F006-11-01

**Mobile rows with plain style objects do not draw a pressed state.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-11](../../20-features/006-visual-foundations-and-spacing-conventions/F006-11-control-states.md)
- Detail: Affects: Mobile users.. Work needed: Use function style or a shared pressed style.
- Evidence: appearance/index.tsx:48-56 vs PressableBox.tsx:41

## GAP-F006-11-02

**Chrome and VS Code state coverage not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-11](../../20-features/006-visual-foundations-and-spacing-conventions/F006-11-control-states.md)
- Detail: Affects: Chrome, VS Code.. Work needed: Audit all controls for the five states.
- Evidence: Brief says done; only a few lines opened

## GAP-F006-11-03

**No test found that checks pressed and disabled looks on Mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-11](../../20-features/006-visual-foundations-and-spacing-conventions/F006-11-control-states.md)
- Detail: Affects: Mobile.. Work needed: Add a test.
- Evidence: No matching test found in apps/mobile/__tests__ by name

## GAP-F006-12-01

**Desktop packaging has only a macOS icon entry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-12](../../20-features/006-visual-foundations-and-spacing-conventions/F006-12-brand-marks-and-app-icons.md)
- Detail: Affects: Windows and Linux Desktop builds, if shipped.. Work needed: Confirm which platforms ship; add icons or document.
- Evidence: electron-builder.yml (no win or linux key)

## GAP-F006-12-02

**CLI has no brand asset or mark found, but the brief says done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-12](../../20-features/006-visual-foundations-and-spacing-conventions/F006-12-brand-marks-and-app-icons.md)
- Detail: Affects: CLI.. Work needed: Verify or correct the brief.
- Evidence: Brief S6.35 lists no CLI code

## GAP-F006-12-03

**No test checks the Desktop or Mobile icon files exist and have correct sizes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-12](../../20-features/006-visual-foundations-and-spacing-conventions/F006-12-brand-marks-and-app-icons.md)
- Detail: Affects: Desktop, Mobile releases.. Work needed: Add tests.
- Evidence: No matching test files found

## GAP-F006-12-04

**Mobile config name is 'Mobile'; displayed name unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F006-12](../../20-features/006-visual-foundations-and-spacing-conventions/F006-12-brand-marks-and-app-icons.md)
- Detail: Affects: Mobile.. Work needed: Check the native app name on a device.
- Evidence: app.config.js:143

## GAP-F006-12-NOTBUILT

**Brand marks and app icons: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F006-12](../../20-features/006-visual-foundations-and-spacing-conventions/F006-12-brand-marks-and-app-icons.md)
- Requirement items: S6.35
- Detail: CLI: S6.35
