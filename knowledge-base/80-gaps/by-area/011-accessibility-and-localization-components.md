---
id: "GAPS-AREA-011"
type: "gap-list"
title: "Gaps: Accessibility and localization components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 11. Accessibility and localization components

84 open gaps that touch this area. Area page: [20-features/011-accessibility-and-localization-components](../../20-features/011-accessibility-and-localization-components/README.md).

## CMP-C604

**Unbind a default shortcut by setting its action to null**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F011-02](../../20-features/011-accessibility-and-localization-components/F011-02-keyboard-operation-of-menus-dialogs-and-focus.md), [F084-07](../../20-features/084-general-and-appearance-settings/F084-07-send-key-and-keyboard-shortcuts.md)
- Detail: ui.keybindings can rebind a fixed set of actions to another key; there is no way to remove a default key.
- Evidence: apps/cli/src/config.rs:171,1480; searched: unbind, null in apps/cli/src/keybindings.rs (0 hits)

## CMP-DP24

**Menus, tray and system dialogs in the app language**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md), [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: The menus, tray, notifications and dialogs are fixed English text and the build keeps English locale files only Hosted pages follow the web language, but the menus, tray, notifications and dialogs are fixed English text and the build keeps English locale files only.
- Evidence: apps/desktop/electron-builder.yml:13-14 (electronLanguages: en); apps/desktop/electron/appMenu.ts (literal English labels)

## CMP-M58

**Language of the app**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md), [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: The app-language picker is switched off, so the app shows English only. English and Spanish catalogs sit behind it.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:36; apps/mobile/src/features/settings/general/index.tsx:107; packages/ui/i18n/src/languages.ts:28

## CMP-MP43

**Interface languages**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md), [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: The app shows English only The app shows English only; the language picker is switched off, with English and Spanish catalogs ready behind it.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:36; packages/ui/i18n/src/languages.ts:28; apps/mobile/src/i18n/index.ts:30

## CMP-WP114

**Interface languages**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md), [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: Two languages (English, Spanish) can be selected Two languages (English, Spanish) can be selected.
- Evidence: packages/ui/i18n/src/languages.ts:28

## CMP-WP252

**Display language**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md), [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: There is no auto-detect option Only English and Spanish can be chosen; there is no auto-detect option.
- Evidence: packages/ui/i18n/src/languages.ts:28; apps/web/features/settings/sections/GeneralSection.tsx:526

## CMP-X22

**Language submenu**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md), [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: Only English ships; no language menu.
- Evidence: apps/extension/_locales (only en); searched: setLocale, language submenu

## GAP-AREA011-LW02

**In-app reduced-motion rule sets animation to 0.01ms with !important on every element, including spinners. The comment next to the spinner rule says a spinner should be slowed, not frozen, and the 3s slow-down only applies under the OS preference because it is not !important. So in-app reduced motion**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-011
- Detail: Area 11. Accessibility and localization components
- Evidence: apps/web/app/globals.css:1928-1935 and apps/web/app/globals.css:1936-1944

## GAP-CAP-settings-04

**Text size and zoom: Chrome extension has no text size control. The web comparison marks both leaders as No for a text-size setting, which differs from the Windows help page; AGI is ahead of Claude on this by the catalogue.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F011-05](../../20-features/011-accessibility-and-localization-components/F011-05-text-size-zoom-and-long-text-layout.md), [F084-03](../../20-features/084-general-and-appearance-settings/F084-03-chat-text-size-interface-density-and-motion.md)
- Requirement items: S11.12, S11.13, S84.05
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-CAP-settings-07

**Interface language: Selectable languages are English and Spanish; leaders offer 11 to about 60. This follows the owner decision but is a competitive gap. Desktop menus and tray stay English (electronLanguages: en). Mobile and Chrome offer no selector.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md), [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Requirement items: S11.25, S84.01
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-settings-11

**Time zone: No time zone setting; locale-aware dates exist (S11.22) except CLI.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F011-11](../../20-features/011-accessibility-and-localization-components/F011-11-locale-aware-dates-numbers-and-money.md), [F084-09](../../20-features/084-general-and-appearance-settings/F084-09-notifications-quiet-hours-and-timezone.md)
- Requirement items: S11.22, S84.02
- Detail: Claude yes, ChatGPT unknown; AGI not built

## GAP-CAP-settings-12

**Keyboard shortcut customization: CLI: no null-unbind. The web comparison says no Claude chat page documents rebinding.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F011-02](../../20-features/011-accessibility-and-localization-components/F011-02-keyboard-operation-of-menus-dialogs-and-focus.md), [F084-07](../../20-features/084-general-and-appearance-settings/F084-07-send-key-and-keyboard-shortcuts.md)
- Requirement items: S11.26, S84.15
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-settings-28

**Screen reader and accessible output mode: Control labels unverified on web, desktop, Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F011-01](../../20-features/011-accessibility-and-localization-components/F011-01-screen-reader-names-labels-and-headings.md), [F011-12](../../20-features/011-accessibility-and-localization-components/F011-12-plain-terminal-output.md)
- Requirement items: S11.01, S11.28
- Detail: Claude yes, ChatGPT unknown; AGI built

## GAP-F011-01-01

**Mobile ApprovalModal and four other modals do not hide the screen behind them from assistive tech.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-01](../../20-features/011-accessibility-and-localization-components/F011-01-screen-reader-names-labels-and-headings.md)
- Detail: Affects: Mobile users with VoiceOver or TalkBack, at tool approval time.. Work needed: Add accessibilityViewIsModal to the five files and empty the pending list.
- Evidence: apps/mobile/__tests__/modal-accessibility-semantics.test.ts:13-19

## GAP-F011-01-02

**No recorded accessibility scan of signed-in chat, settings or approvals on web, desktop or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-01](../../20-features/011-accessibility-and-localization-components/F011-01-screen-reader-names-labels-and-headings.md)
- Detail: Affects: Web, Desktop, Chrome.. Work needed: Run and store an automated and manual sweep of signed-in states.
- Evidence: apps/web/reports/a11y-report.json lists only Home, Sign in, Pricing, Features - Agents, Download; brief S11.01 unverified.

## GAP-F011-01-03

**Announcement and label strings are English literals.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-01](../../20-features/011-accessibility-and-localization-components/F011-01-screen-reader-names-labels-and-headings.md)
- Detail: Affects: Non-English users on all apps.. Work needed: Route through the i18n catalogue and plural rules.
- Evidence: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:369-384; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:1043

## GAP-F011-01-04

**Brief code pointers for S11.01 and S11.09 are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-01](../../20-features/011-accessibility-and-localization-components/F011-01-screen-reader-names-labels-and-headings.md)
- Detail: Affects: Auditors using the brief.. Work needed: Refresh the brief from the implementation map above.
- Evidence: apps/mobile/app/(app)/notifications/index.tsx:93 and webviewContent.ts:44 do not hold labels.

## GAP-F011-01-05

**Approval buttons in the shared ToolCallCard have no aria-label and a 24px height (h-6); their name is the visible text only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-01](../../20-features/011-accessibility-and-localization-components/F011-01-screen-reader-names-labels-and-headings.md)
- Detail: Affects: Touch and screen-magnifier users on web and Desktop.. Work needed: Check touch target size against the product's own target rule; unknown which rule applies.
- Evidence: packages/ui/unified-chat/src/components/ToolCallCard.tsx:412-436

## GAP-F011-01-PARTLY

**Screen-reader names, labels and headings: partly built on Web, Desktop, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Chrome
- Features: [F011-01](../../20-features/011-accessibility-and-localization-components/F011-01-screen-reader-names-labels-and-headings.md)
- Requirement items: S11.01

## GAP-F011-02-01

**VS Code uses its own modifier label (text 'Cmd') rather than the shared helper.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-02](../../20-features/011-accessibility-and-localization-components/F011-02-keyboard-operation-of-menus-dialogs-and-focus.md)
- Detail: Affects: VS Code users on Mac.. Work needed: Share one helper or align the output.
- Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4458

## GAP-F011-02-02

**Mobile focus restoration is unverified and Chrome has no recorded shortcut-notation status.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-02](../../20-features/011-accessibility-and-localization-components/F011-02-keyboard-operation-of-menus-dialogs-and-focus.md)
- Detail: Affects: Mobile screen-reader users; Chrome users.. Work needed: Test on device; decide notation for Chrome.
- Evidence: brief S11.06 and S11.26

## GAP-F011-02-03

**No recorded run of keyboard e2e specs in the repository.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-02](../../20-features/011-accessibility-and-localization-components/F011-02-keyboard-operation-of-menus-dialogs-and-focus.md)
- Detail: Affects: All apps.. Work needed: Run and store results.
- Evidence: Specs exist but no result file for them was found (only the a11y report for public pages).

## GAP-F011-02-04

**Hand-rolled keyboard code is duplicated in VS Code and Chrome instead of shared.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-02](../../20-features/011-accessibility-and-localization-components/F011-02-keyboard-operation-of-menus-dialogs-and-focus.md)
- Detail: Affects: Maintenance; drift risk.. Work needed: [proposed] Extract a small shared script for the two webview surfaces.
- Evidence: webviewContent.ts:3833-3856,6112-6123; side_panel.ts:11440-11470,13064-13085

## GAP-F011-02-PARTLY

**Keyboard operation of menus, dialogs and focus: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F011-02](../../20-features/011-accessibility-and-localization-components/F011-02-keyboard-operation-of-menus-dialogs-and-focus.md)
- Requirement items: S11.06

## GAP-F011-03-01

**No audit of reorder-by-drag lists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-03](../../20-features/011-accessibility-and-localization-components/F011-03-touch-and-drag-alternatives.md)
- Detail: Affects: Web, Desktop, VS Code.. Work needed: List every sortable surface and confirm a non-drag path.
- Evidence: No reorder alternative found in the files opened.

## GAP-F011-03-02

**Brief evidence for the artifacts panel resize alternative does not match the cited line.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-03](../../20-features/011-accessibility-and-localization-components/F011-03-touch-and-drag-alternatives.md)
- Detail: Affects: Auditors.. Work needed: Re-cite or build the alternative.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:428 is a dependency array.

## GAP-F011-03-03

**Mobile has no status for these items.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-03](../../20-features/011-accessibility-and-localization-components/F011-03-touch-and-drag-alternatives.md)
- Detail: Affects: Mobile.. Work needed: Decide not-applicable or test.
- Evidence: brief S11.10 and S11.11 list no mobile status

## GAP-F011-03-04

**Tool-card approval buttons are small (h-6).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-03](../../20-features/011-accessibility-and-localization-components/F011-03-touch-and-drag-alternatives.md)
- Detail: Affects: Touch users.. Work needed: Check against touch target rule.
- Evidence: ToolCallCard.tsx:412-436

## GAP-F011-04-01

**Mobile does not announce streamed text.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-04](../../20-features/011-accessibility-and-localization-components/F011-04-screen-reader-announcements-for-finished-work-and.md)
- Detail: Affects: Mobile screen-reader users.. Work needed: Decide if start and outcome is the intended design and update the brief, or add chunking.
- Evidence: MessageList.tsx:246-258 only announces start and outcome; brief S11.08 mobile missing.

## GAP-F011-04-02

**VS Code and Chrome streaming announcements unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-04](../../20-features/011-accessibility-and-localization-components/F011-04-screen-reader-announcements-for-finished-work-and.md)
- Detail: Affects: VS Code and Chrome screen-reader users.. Work needed: Test with a reader and, if needed, reuse StreamAnnouncer logic.
- Evidence: webviewContent.ts:3167; side_panel.ts:6340-6346; brief S11.08.

## GAP-F011-04-03

**Announcement strings are English only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-04](../../20-features/011-accessibility-and-localization-components/F011-04-screen-reader-announcements-for-finished-work-and.md)
- Detail: Affects: Non-English users.. Work needed: Add translations.
- Evidence: ChatMessageList.tsx:1756-1758; MessageList.tsx:164

## GAP-F011-04-04

**No recorded screen-reader run for any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-04](../../20-features/011-accessibility-and-localization-components/F011-04-screen-reader-announcements-for-finished-work-and.md)
- Detail: Affects: All.. Work needed: Run and record.
- Evidence: No result file found.

## GAP-F011-04-NOTBUILT

**Screen-reader announcements for finished work and streaming replies: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F011-04](../../20-features/011-accessibility-and-localization-components/F011-04-screen-reader-announcements-for-finished-work-and.md)
- Requirement items: S11.08
- Detail: Mobile: S11.08

## GAP-F011-04-PARTLY

**Screen-reader announcements for finished work and streaming replies: partly built on VS Code, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F011-04](../../20-features/011-accessibility-and-localization-components/F011-04-screen-reader-announcements-for-finished-work-and.md)
- Requirement items: S11.08

## GAP-F011-05-01

**No evidence the web text size reaches 200 percent; Large is 17px and px sizes may ignore browser font size.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-05](../../20-features/011-accessibility-and-localization-components/F011-05-text-size-zoom-and-long-text-layout.md)
- Detail: Affects: Web and Desktop low-vision users.. Work needed: Test and, if needed, convert to relative units.
- Evidence: apps/web/app/globals.css:932-937

## GAP-F011-05-02

**400 percent reflow unverified on Chrome, web and desktop at the page level.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-05](../../20-features/011-accessibility-and-localization-components/F011-05-text-size-zoom-and-long-text-layout.md)
- Detail: Affects: Web, Desktop, Chrome.. Work needed: Run an automated reflow check.
- Evidence: brief S11.13

## GAP-F011-05-03

**Translated-copy layout unverified on four apps.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-05](../../20-features/011-accessibility-and-localization-components/F011-05-text-size-zoom-and-long-text-layout.md)
- Detail: Affects: Non-English users.. Work needed: Pseudo-locale test.
- Evidence: brief S11.27

## GAP-F011-05-04

**Brief evidence is stale or mismatched (GeneralSection.tsx:1186, ChatsListScreen.tsx:476).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-05](../../20-features/011-accessibility-and-localization-components/F011-05-text-size-zoom-and-long-text-layout.md)
- Detail: Affects: Auditors.. Work needed: Re-cite.
- Evidence: cited lines are not text size code.

## GAP-F011-05-05

**VS Code and Chrome ignore any in-app text size.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-05](../../20-features/011-accessibility-and-localization-components/F011-05-text-size-zoom-and-long-text-layout.md)
- Detail: Affects: VS Code and Chrome users.. Work needed: None required if intended; confirm.
- Evidence: No setting found; VS Code follows editor font.

## GAP-F011-05-PARTLY

**Text size, zoom and long-text layout: partly built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F011-05](../../20-features/011-accessibility-and-localization-components/F011-05-text-size-zoom-and-long-text-layout.md)
- Requirement items: S11.12, S11.13, S11.27

## GAP-F011-06-01

**No in-app motion option on VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-06](../../20-features/011-accessibility-and-localization-components/F011-06-reduced-motion.md)
- Detail: Affects: VS Code and Chrome users whose OS setting is not applied inside the webview.. Work needed: Confirm the webview inherits the OS setting; add a setting only if required.
- Evidence: Only media queries found (webviewContent.ts:2774; side_panel.ts:4622).

## GAP-F011-06-02

**CLI does not read any OS reduced-motion signal.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-06](../../20-features/011-accessibility-and-localization-components/F011-06-reduced-motion.md)
- Detail: Affects: CLI users who rely on OS settings.. Work needed: Document or add detection.
- Evidence: apps/cli/src/lib.rs:5949-5951 uses flag, environment and config only.

## GAP-F011-06-03

**Brief cites OfflineBanner for reduced motion but it has no hook.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-06](../../20-features/011-accessibility-and-localization-components/F011-06-reduced-motion.md)
- Detail: Affects: Auditors.. Work needed: Re-cite; check its animation if any.
- Evidence: apps/mobile/src/features/edge-cases/components/OfflineBanner.tsx has no useReduceMotion use.

## GAP-F011-06-04

**No recorded run of the reduced-motion tests.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-06](../../20-features/011-accessibility-and-localization-components/F011-06-reduced-motion.md)
- Detail: Affects: All.. Work needed: Run and record.
- Evidence: No result file found.

## GAP-F011-06-05

**Two web reduced-motion hooks exist (shared and support).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-06](../../20-features/011-accessibility-and-localization-components/F011-06-reduced-motion.md)
- Detail: Affects: Maintenance.. Work needed: [proposed] Use one.
- Evidence: packages/ui/unified-chat/src/hooks/useReducedMotion.ts and apps/web/features/support/hooks/usePrefersReducedMotion.ts

## GAP-F011-07-01

**CLI has no live captions or spoken audio; the brief marks captions done**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-07](../../20-features/011-accessibility-and-localization-components/F011-07-voice-captions-and-transcripts.md)
- Detail: Affects: CLI users. Work needed: Correct the brief wording or add a caption concept for the CLI
- Evidence: apps/cli/src/voice.rs:1-9, :204-290; brief cites voice.rs:956 which is the transcribe function

## GAP-F011-07-02

**Mobile has no waiting message and no live-region role on captions**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-07](../../20-features/011-accessibility-and-localization-components/F011-07-voice-captions-and-transcripts.md)
- Detail: Affects: Mobile screen-reader users. Work needed: Add a waiting line and decide the announcement policy
- Evidence: LiveVoiceBar.tsx:438-461

## GAP-F011-07-03

**Caption labels are not translated**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-07](../../20-features/011-accessibility-and-localization-components/F011-07-voice-captions-and-transcripts.md)
- Detail: Affects: Web, Desktop and Mobile non-English users. Work needed: Move strings to the catalog
- Evidence: VoiceCaptions.tsx:7-12; LiveVoiceBar.tsx:78-79, :450

## GAP-F011-07-04

**Web caption default is off, Mobile default is on; no stored preference**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-07](../../20-features/011-accessibility-and-localization-components/F011-07-voice-captions-and-transcripts.md)
- Detail: Affects: Web and Mobile users who need captions every time. Work needed: Decide a shared default and remember the choice
- Evidence: VoiceModeSurface.tsx:208; LiveVoiceBar.tsx:214

## GAP-F011-07-05

**Brief code citations are stale: WebChatPage.tsx:4978-5009 does not hold the voice transcript code (now at 6739)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-07](../../20-features/011-accessibility-and-localization-components/F011-07-voice-captions-and-transcripts.md)
- Detail: Affects: Engineers using the brief. Work needed: Refresh brief citations
- Evidence: apps/web/features/chat/pages/WebChatPage.tsx:6739

## GAP-F011-08-01

**Brief says the table alternative is missing on Web and Desktop, but it exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-08](../../20-features/011-accessibility-and-localization-components/F011-08-chart-descriptions-and-data-tables.md)
- Detail: Affects: Brief readers and planners. Work needed: Update the brief and registry status for S11.18
- Evidence: ChartArtifact.tsx:212-240; ChartArtifact.draw.test.tsx:110-120

## GAP-F011-08-02

**Mobile charts have no description or table**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-08](../../20-features/011-accessibility-and-localization-components/F011-08-chart-descriptions-and-data-tables.md)
- Detail: Affects: Mobile screen-reader users. Work needed: Add a summary and a table or list view
- Evidence: apps/mobile/src/features/chat/components/ChartArtifactView.tsx:35

## GAP-F011-08-03

**Summary sentences and 'View chart data' are English only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-08](../../20-features/011-accessibility-and-localization-components/F011-08-chart-descriptions-and-data-tables.md)
- Detail: Affects: Non-English Web and Desktop users. Work needed: Move to the catalog with plural-aware keys
- Evidence: chart-spec.ts:134-183; ChartArtifact.tsx:213

## GAP-F011-08-04

**Truncation note refers to a JSON download that this component does not provide**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-08](../../20-features/011-accessibility-and-localization-components/F011-08-chart-descriptions-and-data-tables.md)
- Detail: Affects: Users with charts above 500 rows. Work needed: Add the control or change the sentence
- Evidence: ChartArtifact.tsx:251

## GAP-F011-08-05

**Two different table labels: 'View chart data' and 'Data table'**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-08](../../20-features/011-accessibility-and-localization-components/F011-08-chart-descriptions-and-data-tables.md)
- Detail: Affects: Consistency for screen-reader users. Work needed: Choose one label
- Evidence: ChartArtifact.tsx:213; answer-ui.ts:10

## GAP-F011-08-NOTBUILT

**Chart descriptions and data tables: not built on Web, Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F011-08](../../20-features/011-accessibility-and-localization-components/F011-08-chart-descriptions-and-data-tables.md)
- Requirement items: S11.18
- Detail: Web: S11.18; Desktop: S11.18

## GAP-F011-09-01

**No right-to-left language is selectable, so S11.19 cannot be reached by a user**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-09](../../20-features/011-accessibility-and-localization-components/F011-09-right-to-left-and-mixed-direction-text-and-typing.md)
- Detail: Affects: All apps that use the shared language list. Work needed: Complete and review a right-to-left catalog, then add its code to the selectable list per the decision
- Evidence: packages/ui/i18n/src/languages.ts:25-34

## GAP-F011-09-02

**dir=auto is on the message container, not on each paragraph**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-09](../../20-features/011-accessibility-and-localization-components/F011-09-right-to-left-and-mixed-direction-text-and-typing.md)
- Detail: Affects: Web and Desktop users with mixed-direction messages. Work needed: Verify in a browser; add per-block direction if needed
- Evidence: MessageBubble.tsx:2839, :3212; no dir in markdown folder

## GAP-F011-09-03

**Mobile language choice is off and mixed-direction text is unverified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-09](../../20-features/011-accessibility-and-localization-components/F011-09-right-to-left-and-mixed-direction-text-and-typing.md)
- Detail: Affects: Mobile users. Work needed: Enable after catalogs are ready; test on device
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:36

## GAP-F011-09-04

**VS Code and Chrome have no direction handling**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-09](../../20-features/011-accessibility-and-localization-components/F011-09-right-to-left-and-mixed-direction-text-and-typing.md)
- Detail: Affects: VS Code and Chrome right-to-left users. Work needed: Add dir=auto on composer and message blocks
- Evidence: No dir attribute in webviewContent.ts or side_panel.ts

## GAP-F011-09-05

**Direction test is a source-text check**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-09](../../20-features/011-accessibility-and-localization-components/F011-09-right-to-left-and-mixed-direction-text-and-typing.md)
- Detail: Affects: Test confidence. Work needed: Add a rendered test with mixed text
- Evidence: MessageDirection.test.tsx:5-14

## GAP-F011-09-06

**Brief citations for S11.19 point to citation helper code in MarkdownContent.tsx (:290, :345) that has nothing to do with direction**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-09](../../20-features/011-accessibility-and-localization-components/F011-09-right-to-left-and-mixed-direction-text-and-typing.md)
- Detail: Affects: Engineers. Work needed: Refresh brief citations
- Evidence: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:280-350

## GAP-F011-09-NOTBUILT

**Right-to-left and mixed-direction text, and typing with input methods: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F011-09](../../20-features/011-accessibility-and-localization-components/F011-09-right-to-left-and-mixed-direction-text-and-typing.md)
- Requirement items: S11.19, S11.20
- Detail: VS Code: S11.20; Chrome: S11.19, S11.20

## GAP-F011-09-PARTLY

**Right-to-left and mixed-direction text, and typing with input methods: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F011-09](../../20-features/011-accessibility-and-localization-components/F011-09-right-to-left-and-mixed-direction-text-and-typing.md)
- Requirement items: S11.20

## GAP-F011-10-01

**Mobile errors and most Mobile text are not translated and language choice is off**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md)
- Detail: Affects: Mobile non-English users. Work needed: Route strings through catalogs, review languages, enable the flag
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:36; liveVoiceAvailability.ts:5-16

## GAP-F011-10-02

**CLI has no translation**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md)
- Detail: Affects: CLI non-English users. Work needed: Decide scope; add a catalog layer if required
- Evidence: no i18n code in apps/cli

## GAP-F011-10-03

**Only two languages are selectable**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md)
- Detail: Affects: Web and Desktop users of other languages. Work needed: Review and release catalogs per decision D-2026-09-15-03
- Evidence: languages.ts:25

## GAP-F011-10-04

**Manual singular/plural words in Mobile usage text**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md)
- Detail: Affects: Mobile users in languages with more plural forms. Work needed: Use translatePlural
- Evidence: apps/mobile/src/features/settings/cloud-usage/index.tsx:205

## GAP-F011-10-05

**Chrome ships English only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md)
- Detail: Affects: Chrome users. Work needed: Add reviewed locale folders
- Evidence: apps/extension/_locales contains only en

## GAP-F011-10-06

**Brief says desktop done using apps/desktop/src errorMessages, which is not the public Desktop window**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md)
- Detail: Affects: Accuracy of desktop status. Work needed: Confirm the hosted web path covers desktop errors
- Evidence: apps/desktop/src/constants/errorMessages.ts:45; AGENTS.md section 5

## GAP-F011-10-NOTBUILT

**Languages and translated messages: not built on Mobile, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md)
- Requirement items: S11.25
- Detail: Mobile: S11.25; CLI: S11.25

## GAP-F011-11-01

**Formatting follows the device locale, not the chosen Display Language**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-11](../../20-features/011-accessibility-and-localization-components/F011-11-locale-aware-dates-numbers-and-money.md)
- Detail: Affects: Web, Desktop, Mobile, VS Code users who choose a language different from the device. Work needed: Decide the policy and pass an explicit locale
- Evidence: money-format.ts:21; billing-format.ts:23

## GAP-F011-11-02

**CLI has no locale formatting and shows credits, not currency**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-11](../../20-features/011-accessibility-and-localization-components/F011-11-locale-aware-dates-numbers-and-money.md)
- Detail: Affects: CLI users. Work needed: Re-state the brief or add formatting
- Evidence: apps/cli/src/cost_ledger.rs:50-52; agents.rs:1365-1368

## GAP-F011-11-03

**Mobile plan prices are not formatted by the shared money helper**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-11](../../20-features/011-accessibility-and-localization-components/F011-11-locale-aware-dates-numbers-and-money.md)
- Detail: Affects: Mobile users. Work needed: Verify price labels against locale or use the helper
- Evidence: apps/mobile/src/features/settings/plans/index.tsx:89, :118

## GAP-F011-11-04

**Billing helper words are English literals**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-11](../../20-features/011-accessibility-and-localization-components/F011-11-locale-aware-dates-numbers-and-money.md)
- Detail: Affects: Non-English billing users. Work needed: Move to catalog
- Evidence: billing-format.ts:32-48

## GAP-F011-11-05

**Chrome date and money formatting is marked unverified although code uses Intl**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-11](../../20-features/011-accessibility-and-localization-components/F011-11-locale-aware-dates-numbers-and-money.md)
- Detail: Affects: Brief accuracy. Work needed: Verify and update the brief
- Evidence: apps/extension/src/side_panel.ts:1133, :11669

## GAP-F011-11-06

**No unit test found for money-format.ts itself**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-11](../../20-features/011-accessibility-and-localization-components/F011-11-locale-aware-dates-numbers-and-money.md)
- Detail: Affects: Test coverage. Work needed: Add tests for digits, trim, and fallback
- Evidence: search for formatBillingMoney in test files found only indirect tests

## GAP-F011-11-NOTBUILT

**Locale-aware dates, numbers and money: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F011-11](../../20-features/011-accessibility-and-localization-components/F011-11-locale-aware-dates-numbers-and-money.md)
- Requirement items: S11.22
- Detail: CLI: S11.22

## GAP-F011-11-PARTLY

**Locale-aware dates, numbers and money: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F011-11](../../20-features/011-accessibility-and-localization-components/F011-11-locale-aware-dates-numbers-and-money.md)
- Requirement items: S11.22

## GAP-F011-12-01

**The code does not show that the full-screen TUI colours honour NO_COLOR; only icons do**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-12](../../20-features/011-accessibility-and-localization-components/F011-12-plain-terminal-output.md)
- Detail: Affects: CLI users who set only NO_COLOR. Work needed: Verify in a terminal and add a test
- Evidence: apps/cli/src/tui/icons.rs:33-35; no other NO_COLOR use outside output.rs

## GAP-F011-12-02

**detect_color_level is not called outside its module**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-12](../../20-features/011-accessibility-and-localization-components/F011-12-plain-terminal-output.md)
- Detail: Affects: Maintainers. Work needed: Remove or wire it
- Evidence: search of apps/cli/src found no external caller

## GAP-F011-12-03

**Misleading comment on the screen reader environment function**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-12](../../20-features/011-accessibility-and-localization-components/F011-12-plain-terminal-output.md)
- Detail: Affects: Maintainers. Work needed: Correct the comment
- Evidence: apps/cli/src/output.rs:81-85

## GAP-F011-12-04

**Brief cites apps/cli/src/lib.rs:4887, which holds model-listing code, not plain mode**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-12](../../20-features/011-accessibility-and-localization-components/F011-12-plain-terminal-output.md)
- Detail: Affects: Engineers using the brief. Work needed: Refresh the citation
- Evidence: apps/cli/src/lib.rs:4870-4905; plain code at lib.rs:5943-5951

## GAP-F011-12-05

**A prior audit register recorded that the CLI TUI ignored --plain; current code sets reduced motion from plain mode**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F011-12](../../20-features/011-accessibility-and-localization-components/F011-12-plain-terminal-output.md)
- Detail: Affects: Audit accuracy. Work needed: Update the register
- Evidence: audit/doc-corrections/contradictions-register.md S6.31 row; apps/cli/src/tui/tui_app.rs:7122-7124
