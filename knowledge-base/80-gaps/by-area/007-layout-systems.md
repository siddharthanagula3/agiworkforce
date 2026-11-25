---
id: "GAPS-AREA-007"
type: "gap-list"
title: "Gaps: Layout systems"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 7. Layout systems

68 open gaps that touch this area. Area page: [20-features/007-layout-systems](../../20-features/007-layout-systems/README.md).

## GAP-AREA007-LW01

**Two different panel width ranges. The web store allows 280 to 900, but the desktop shell clamps the saved width to 220 to 720, so a width of 800 chosen on desktop comes back as 720 on the next launch.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-007
- Detail: Area 7. Layout systems
- Evidence: packages/ui/unified-chat/src/stores/uiStore.ts:6-7 and apps/desktop/electron/windowState.ts:57-58, 104-107

## GAP-AREA007-LW02

**The artifact panel carries a fixed `lg:w-[480px]` and `md:w-1/2` class but also an inline width on desktop layout; the inline width wins, so the class widths are only used before the layout is known.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-007
- Detail: Area 7. Layout systems
- Evidence: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:680, 686

## GAP-AREA007-LW03

**The panel sets a `sm:min-w-[280px]` but the overlay cut-off is 639 wide, so between 640 and about 900 a 280 minimum panel leaves very little room for the chat; I saw no check that keeps the conversation above a minimum width.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-007
- Detail: Area 7. Layout systems
- Evidence: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:686

## GAP-CAP-research-10

**Cited report with outline and full-screen reader: No conflicting-evidence display; no attachments; no CLI, VS Code or Chrome reader.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F004-99](../../20-features/004-signed-in-application-destinations/F004-99-other-items.md), [F007-06](../../20-features/007-layout-systems/F007-06-full-screen-readers-and-viewers.md), [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md), [F035-07](../../20-features/035-research-workspace/F035-07-report-reader.md)
- Requirement items: S35.12, S35.13, S35.14, S35.20, S35.21, S35.22, S35.23, S35.24, S4.32, S7.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F007-01-01

**No centred composer with the greeting on mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-01](../../20-features/007-layout-systems/F007-01-start-view-and-reading-column.md)
- Detail: Affects: Mobile users. Work needed: Decide whether the brief's S7.01 needs the composer centred; update the brief or the screen.
- Evidence: (apps/mobile/src/features/chat/components/MessageList.tsx:458)

## GAP-F007-01-02

**CLI start view is left aligned although marked done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-01](../../20-features/007-layout-systems/F007-01-start-view-and-reading-column.md)
- Detail: Affects: CLI users. Work needed: Centre it or correct the brief status.
- Evidence: (apps/cli/src/tui/tui_app.rs:3057)

## GAP-F007-01-03

**Sticky table headers missing on mobile, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-01](../../20-features/007-layout-systems/F007-01-start-view-and-reading-column.md)
- Detail: Affects: Those three apps. Work needed: Add sticky headers or record the reason.
- Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md)

## GAP-F007-01-04

**No full-width data layout found; only the expanded dialog on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-01](../../20-features/007-layout-systems/F007-01-start-view-and-reading-column.md)
- Detail: Affects: Web and Desktop users reading wide tables or charts. Work needed: Confirm S7.03 is met by the dialog, or build a wide layout.
- Evidence: (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:136)

## GAP-F007-01-05

**No tests found for the web column width or sticky header.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-01](../../20-features/007-layout-systems/F007-01-start-view-and-reading-column.md)
- Detail: Affects: Regression risk on web. Work needed: Add a rendering test.
- Evidence: search of apps/web and packages/ui test folders found none by name

## GAP-F007-01-NOTBUILT

**Start view and reading column: not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F007-01](../../20-features/007-layout-systems/F007-01-start-view-and-reading-column.md)
- Requirement items: S7.24
- Detail: Mobile: S7.24; VS Code: S7.24; Chrome: S7.24

## GAP-F007-01-PARTLY

**Start view and reading column: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F007-01](../../20-features/007-layout-systems/F007-01-start-view-and-reading-column.md)
- Requirement items: S7.03

## GAP-F007-02-01

**Desktop stored width range (220-720) differs from the page range (280-900).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-02](../../20-features/007-layout-systems/F007-02-side-panels-beside-the-chat-artifact-sources-work.md)
- Detail: Affects: Desktop users who widen beyond 720 or below 280. Work needed: Use one bound constant for both.
- Evidence: (apps/desktop/electron/windowState.ts:42, packages/ui/unified-chat/src/stores/uiStore.ts:6)

## GAP-F007-02-02

**No source inspector on CLI and VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-02](../../20-features/007-layout-systems/F007-02-side-panels-beside-the-chat-artifact-sources-work.md)
- Detail: Affects: CLI and VS Code users. Work needed: Decide scope per surface.
- Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md)

## GAP-F007-02-03

**Chrome panel width limits unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-02](../../20-features/007-layout-systems/F007-02-side-panels-beside-the-chat-artifact-sources-work.md)
- Detail: Affects: Chrome users. Work needed: Read the extension panel code and test.
- Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md)

## GAP-F007-02-04

**Overlay breakpoints differ: 640 for artifacts and research, 768 for work.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-02](../../20-features/007-layout-systems/F007-02-side-panels-beside-the-chat-artifact-sources-work.md)
- Detail: Affects: Web users between 640 and 767 pixels. Work needed: Confirm intended or align.
- Evidence: (apps/web/features/chat/stores/artifacts-store.ts:38, apps/web/features/chat/hooks/use-overlay-dialog.ts:5)

## GAP-F007-02-05

**No test found that drives the real pointer drag of the handle in a browser.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-02](../../20-features/007-layout-systems/F007-02-side-panels-beside-the-chat-artifact-sources-work.md)
- Detail: Affects: Regression risk. Work needed: Add a browser test.
- Evidence: SecondaryPanel test uses a harness (apps/web/shared/components/layout/__tests__/SecondaryPanel.test.tsx:105)

## GAP-F007-02-NOTBUILT

**Side panels beside the chat (artifact, sources, work): not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F007-02](../../20-features/007-layout-systems/F007-02-side-panels-beside-the-chat-artifact-sources-work.md)
- Requirement items: S7.05
- Detail: CLI: S7.05; VS Code: S7.05

## GAP-F007-02-PARTLY

**Side panels beside the chat (artifact, sources, work): partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F007-02](../../20-features/007-layout-systems/F007-02-side-panels-beside-the-chat-artifact-sources-work.md)
- Requirement items: S7.29

## GAP-F007-03-01

**No test for useCodePanes or the split shortcut.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-03](../../20-features/007-layout-systems/F007-03-code-workspace-and-several-sessions-at-once.md)
- Detail: Affects: Web and Desktop. Work needed: Add unit tests for select, close and limits.
- Evidence: Search found none

## GAP-F007-03-02

**Split is hidden behind a modifier click with no visible control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-03](../../20-features/007-layout-systems/F007-03-code-workspace-and-several-sessions-at-once.md)
- Detail: Affects: Web and Desktop users. Work needed: Add a visible control and hint.
- Evidence: (apps/web/features/code/components/CodeRail.tsx:530)

## GAP-F007-03-03

**Layout not remembered.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-03](../../20-features/007-layout-systems/F007-03-code-workspace-and-several-sessions-at-once.md)
- Detail: Affects: Web and Desktop. Work needed: Persist per window if wanted.
- Evidence: (apps/web/features/code/hooks/use-code-panes.ts:41)

## GAP-F007-03-04

**Dockable panels missing on web and desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-03](../../20-features/007-layout-systems/F007-03-code-workspace-and-several-sessions-at-once.md)
- Detail: Affects: Web and Desktop. Work needed: Product decision.
- Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md)

## GAP-F007-03-05

**Brief lines for VS Code docking (package.json:786, chatSetup.ts:60) do not match what the code shows.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-03](../../20-features/007-layout-systems/F007-03-code-workspace-and-several-sessions-at-once.md)
- Detail: Affects: Documentation accuracy. Work needed: Update the brief.
- Evidence: (apps/extension-vscode/package.json:953)

## GAP-F007-03-NOTBUILT

**Code workspace and several sessions at once: not built on Web, Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F007-03](../../20-features/007-layout-systems/F007-03-code-workspace-and-several-sessions-at-once.md)
- Requirement items: S7.13
- Detail: Web: S7.13; Desktop: S7.13

## GAP-F007-04-01

**Left sidebar cannot be resized on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-04](../../20-features/007-layout-systems/F007-04-collapsible-navigation-and-responsive-shell.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Build or drop the requirement.
- Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md)

## GAP-F007-04-02

**Mobile two-column starts at 1000 points, not at the 768 tablet size.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-04](../../20-features/007-layout-systems/F007-04-collapsible-navigation-and-responsive-shell.md)
- Detail: Affects: Tablets 768 to 999 points wide. Work needed: Confirm intended; align brief or code.
- Evidence: (apps/mobile/src/shared/hooks/useResponsiveLayout.ts:22, apps/mobile/src/shared/hooks/useTabletLayout.ts:5)

## GAP-F007-04-03

**Chrome stacking and collapse unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-04](../../20-features/007-layout-systems/F007-04-collapsible-navigation-and-responsive-shell.md)
- Detail: Affects: Chrome. Work needed: Test in a real browser.
- Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md)

## GAP-F007-04-04

**Misleading Android keyboard comment.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-04](../../20-features/007-layout-systems/F007-04-collapsible-navigation-and-responsive-shell.md)
- Detail: Affects: Maintainers. Work needed: Correct the comment.
- Evidence: (apps/mobile/app/(app)/chat/[id].tsx:2282)

## GAP-F007-04-05

**Mobile drawer state persistence not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-04](../../20-features/007-layout-systems/F007-04-collapsible-navigation-and-responsive-shell.md)
- Detail: Affects: Mobile. Work needed: Check whether needed.
- Evidence: search of the drawer files

## GAP-F007-04-NOTBUILT

**Collapsible navigation and responsive shell: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F007-04](../../20-features/007-layout-systems/F007-04-collapsible-navigation-and-responsive-shell.md)
- Requirement items: S7.10
- Detail: Web: S7.10; Desktop: S7.10; Mobile: S7.10

## GAP-F007-04-PARTLY

**Collapsible navigation and responsive shell: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F007-04](../../20-features/007-layout-systems/F007-04-collapsible-navigation-and-responsive-shell.md)
- Requirement items: S7.25

## GAP-F007-05-01

**Web has no true full-screen editor.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-05](../../20-features/007-layout-systems/F007-05-composer-at-the-bottom-growing-and-full-screen-edi.md)
- Detail: Affects: Web and Desktop. Work needed: Build one or change the requirement.
- Evidence: (apps/web/features/chat/components/Composer/ComposerInput.tsx:54)

## GAP-F007-05-02

**CLI full-screen editing leaves the TUI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-05](../../20-features/007-layout-systems/F007-05-composer-at-the-bottom-growing-and-full-screen-edi.md)
- Detail: Affects: CLI. Work needed: Accept as the CLI form or build an in-TUI editor.
- Evidence: (apps/cli/src/tui/composer_edits.rs:140)

## GAP-F007-05-03

**VS Code editor path unclear.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-05](../../20-features/007-layout-systems/F007-05-composer-at-the-bottom-growing-and-full-screen-edi.md)
- Detail: Affects: VS Code. Work needed: Confirm and document.
- Evidence: (apps/extension-vscode/package.json:93)

## GAP-F007-05-04

**No CLI test found for row clamp or editor errors by name.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-05](../../20-features/007-layout-systems/F007-05-composer-at-the-bottom-growing-and-full-screen-edi.md)
- Detail: Affects: CLI. Work needed: Add tests.
- Evidence: search of tui_app.rs test names

## GAP-F007-05-05

**Chrome transcript scroll container not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-05](../../20-features/007-layout-systems/F007-05-composer-at-the-bottom-growing-and-full-screen-edi.md)
- Detail: Affects: Chrome. Work needed: Read and test.
- Evidence: not read

## GAP-F007-06-01

**No video in any viewer read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-06](../../20-features/007-layout-systems/F007-06-full-screen-readers-and-viewers.md)
- Detail: Affects: All apps. Work needed: Add or narrow the requirement.
- Evidence: Viewers read handle images only

## GAP-F007-06-02

**No test found for the Chrome viewer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-06](../../20-features/007-layout-systems/F007-06-full-screen-readers-and-viewers.md)
- Detail: Affects: Chrome. Work needed: Add a test.
- Evidence: apps/extension/__tests__/side-panel-media.test.ts covers video start, not the viewer

## GAP-F007-06-03

**Report reader missing on CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-06](../../20-features/007-layout-systems/F007-06-full-screen-readers-and-viewers.md)
- Detail: Affects: Those apps. Work needed: Product decision.
- Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md)

## GAP-F007-06-04

**Scroll position after closing not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-06](../../20-features/007-layout-systems/F007-06-full-screen-readers-and-viewers.md)
- Detail: Affects: All with viewers. Work needed: Add scenario tests.
- Evidence: no test found

## GAP-F007-06-05

**Chrome artifact toolbar unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-06](../../20-features/007-layout-systems/F007-06-full-screen-readers-and-viewers.md)
- Detail: Affects: Chrome. Work needed: Read artifactPanel.ts and test.
- Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md)

## GAP-F007-06-NOTBUILT

**Full-screen readers and viewers: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F007-06](../../20-features/007-layout-systems/F007-06-full-screen-readers-and-viewers.md)
- Requirement items: S7.16
- Detail: CLI: S7.16; VS Code: S7.16; Chrome: S7.16

## GAP-F007-06-PARTLY

**Full-screen readers and viewers: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F007-06](../../20-features/007-layout-systems/F007-06-full-screen-readers-and-viewers.md)
- Requirement items: S7.23

## GAP-F007-07-01

**No message when the pop-up is blocked.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-07](../../20-features/007-layout-systems/F007-07-detachable-panels-and-floating-quick-ask.md)
- Detail: Affects: Desktop users when a window cannot open. Work needed: Show a notice when detachPanel returns false.
- Evidence: apps/web/features/desktop-host/lib/panel-windows.ts:115-116

## GAP-F007-07-02

**Detached window size and position are not remembered.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-07](../../20-features/007-layout-systems/F007-07-detachable-panels-and-floating-quick-ask.md)
- Detail: Affects: Desktop users who detach often. Work needed: Store the frame per panel in the shell window state.
- Evidence: panel-windows.ts:13; no persistence code found

## GAP-F007-07-03

**Only two panels can be detached.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-07](../../20-features/007-layout-systems/F007-07-detachable-panels-and-floating-quick-ask.md)
- Detail: Affects: Desktop. Work needed: Extend the panel type to Artifacts and Sources if wanted by the owner.
- Evidence: panel-windows.ts:5

## GAP-F007-07-04

**No test found for panel-windows.ts, use-detachable-panels.ts or the agi-panel window policy path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-07](../../20-features/007-layout-systems/F007-07-detachable-panels-and-floating-quick-ask.md)
- Detail: Affects: Desktop. Work needed: Add unit tests for these three.
- Evidence: no matching test files found by name; windowPolicy.test.ts has no agi-panel reference

## GAP-F007-07-05

**docs/decisions/wire-or-cut.md:706 says Quick Ask has no preload but the code gives it one.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-07](../../20-features/007-layout-systems/F007-07-detachable-panels-and-floating-quick-ask.md)
- Detail: Affects: Maintainers reading the doc. Work needed: Update the document, and confirm that the sender trust check still limits what Quick Ask can call.
- Evidence: quickAsk.ts:17-23, 72; main.ts:2702-2708

## GAP-F007-07-06

**Quick Ask behaviour in Local mode, own key and per plan is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-07](../../20-features/007-layout-systems/F007-07-detachable-panels-and-floating-quick-ask.md)
- Detail: Affects: Desktop. Work needed: Trace the compact route through the chat pipeline and record it.
- Evidence: quickAsk.ts loads the hosted page; no mode code in these files

## GAP-F007-07-07

**Brief line pointers are out of date.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-07](../../20-features/007-layout-systems/F007-07-detachable-panels-and-floating-quick-ask.md)
- Detail: Affects: Anyone following the brief. Work needed: Refresh the brief.
- Evidence: windowPolicy.ts and manifest.json line numbers differ

## GAP-F007-07-NOTBUILT

**Detachable panels and floating Quick Ask: not built on VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code
- Features: [F007-07](../../20-features/007-layout-systems/F007-07-detachable-panels-and-floating-quick-ask.md)
- Requirement items: S7.14, S7.18, S7.19
- Detail: VS Code: S7.14, S7.18, S7.19

## GAP-F007-08-01

**No live page beside the chat on Web, Desktop, Mobile or VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-08](../../20-features/007-layout-systems/F007-08-browser-beside-the-conversation.md)
- Detail: Affects: Those four apps. Work needed: Owner decision on whether each app needs it, then design per surface.
- Evidence: Brief S7.06 status; no code found

## GAP-F007-08-02

**Toolbar open failures are logged but not shown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-08](../../20-features/007-layout-systems/F007-08-browser-beside-the-conversation.md)
- Detail: Affects: Chrome users. Work needed: Show a visible notice.
- Evidence: background.ts:7677-7681

## GAP-F007-08-03

**Brief line pointers are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-08](../../20-features/007-layout-systems/F007-08-browser-beside-the-conversation.md)
- Detail: Affects: Readers of the brief. Work needed: Refresh the brief.
- Evidence: manifest.json side_panel is at :83

## GAP-F007-08-04

**Side panel chat model, mode and plan behaviour not documented here.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-08](../../20-features/007-layout-systems/F007-08-browser-beside-the-conversation.md)
- Detail: Affects: Testers. Work needed: Trace side_panel.ts to the chat pipeline and record it.
- Evidence: not traced

## GAP-F007-08-NOTBUILT

**Browser beside the conversation: not built on Web, Desktop, Mobile, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code
- Features: [F007-08](../../20-features/007-layout-systems/F007-08-browser-beside-the-conversation.md)
- Requirement items: S7.06
- Detail: Web: S7.06; Desktop: S7.06; Mobile: S7.06; VS Code: S7.06

## GAP-F007-09-01

**Open panels are not restored although the brief asks for them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-09](../../20-features/007-layout-systems/F007-09-layout-memory-and-window-restoration.md)
- Detail: Affects: Web and Desktop. Work needed: Owner decision, then persist which panel is open.
- Evidence: Only sidebarCollapsed and width are persisted (layout-store.ts:112-114; uiStore.ts:79-81; windowState.ts:27-37)

## GAP-F007-09-02

**No live move back on screen when a monitor is removed while the app runs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-09](../../20-features/007-layout-systems/F007-09-layout-memory-and-window-restoration.md)
- Detail: Affects: Desktop. Work needed: Listen for display changes and re-clamp the window.
- Evidence: No display-change listener in apps/desktop/electron (other than skillCapture)

## GAP-F007-09-03

**Sidebar flag is stored twice on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-09](../../20-features/007-layout-systems/F007-09-layout-memory-and-window-restoration.md)
- Detail: Affects: Web. Work needed: Pick one owner and remove the copy, after tracing readers.
- Evidence: layout-store.ts:112-114 and uiStore.ts:79-81

## GAP-F007-09-04

**Legacy preferences frame is still written beside the new store.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-09](../../20-features/007-layout-systems/F007-09-layout-memory-and-window-restoration.md)
- Detail: Affects: Desktop. Work needed: Remove once the seed is no longer needed.
- Evidence: main.ts:1020

## GAP-F007-09-05

**Brief line pointers are stale for the window frame code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-09](../../20-features/007-layout-systems/F007-09-layout-memory-and-window-restoration.md)
- Detail: Affects: Readers of the brief. Work needed: Refresh the brief.
- Evidence: main.ts:945-1040 vs actual 943-1062 and 1089-1146

## GAP-F007-09-06

**No setting to reset the layout.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-09](../../20-features/007-layout-systems/F007-09-layout-memory-and-window-restoration.md)
- Detail: Affects: All users. Work needed: Optional; decide with the owner.
- Evidence: none found

## GAP-F007-10-01

**Desktop print is not backed by any Electron code or test; it relies on the hosted page's window.print.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-10](../../20-features/007-layout-systems/F007-10-printing.md)
- Detail: Affects: Desktop users. Work needed: Verify in the real app, then add a test or a native print call if it fails.
- Evidence: No print call in apps/desktop/electron

## GAP-F007-10-02

**Unused onExpand and waitMs options.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-10](../../20-features/007-layout-systems/F007-10-printing.md)
- Detail: Affects: Maintainers. Work needed: Remove or use.
- Evidence: print-conversation.ts:2-3; WebChatPage.tsx:7407

## GAP-F007-10-03

**Brief text about mobile and about where expansion happens does not match the code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-10](../../20-features/007-layout-systems/F007-10-printing.md)
- Detail: Affects: Readers of the brief. Work needed: Correct the brief.
- Evidence: fileCreation.ts:821-830; ChatMessageList.tsx:2110

## GAP-F007-10-04

**No print for research reports found, although S7.32 mentions reports.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-10](../../20-features/007-layout-systems/F007-10-printing.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Check report views and add print if missing.
- Evidence: no print code in research components found by searching for print-conversation and data-print-scope

## GAP-F007-10-05

**Print CSS hides every aside and nav element.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-10](../../20-features/007-layout-systems/F007-10-printing.md)
- Detail: Affects: Web and Desktop. Work needed: Scope to app shell elements.
- Evidence: globals.css:1865-1869

## GAP-F007-10-06

**No test of the print stylesheet itself.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F007-10](../../20-features/007-layout-systems/F007-10-printing.md)
- Detail: Affects: Web and Desktop. Work needed: Add a browser test with print media emulation.
- Evidence: tests found cover only the function
