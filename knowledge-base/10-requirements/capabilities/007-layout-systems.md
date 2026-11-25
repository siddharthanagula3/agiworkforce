---
id: "REQ-AREA-007"
type: "requirements"
title: "Requirement items: Layout systems"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 7. Layout systems

32 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S7.01

**Centered new-chat layout.** An empty new chat shows its start view (greeting, prompt entry or suggestions) centred in the available area rather than an empty transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F007-01 Start view and reading column](../../20-features/007-layout-systems/F007-01-start-view-and-reading-column.md)

## S7.02

**Reading-width conversation layout.** Message text is constrained to a readable column width that stays centred when the window is wide.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F007-01 Start view and reading column](../../20-features/007-layout-systems/F007-01-start-view-and-reading-column.md)

## S7.03

**Full-width data-analysis layout.** Data work (tables, charts, spreadsheets) can be viewed in a layout that uses the full window width instead of the reading column.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Chrome unverified
- Feature: [F007-01 Start view and reading column](../../20-features/007-layout-systems/F007-01-start-view-and-reading-column.md)

## S7.04

**Conversation plus artifact split view.** An artifact opens in its own pane beside the conversation so both are visible and usable at once.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, VS Code done
- Feature: [F007-02 Side panels beside the chat (artifact, sources, work)](../../20-features/007-layout-systems/F007-02-side-panels-beside-the-chat-artifact-sources-work.md)

## S7.05

**Conversation plus source-inspector split view.** Sources behind an answer open in an inspector pane beside the conversation, so the reader can check a source without leaving the transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, VS Code missing
- Feature: [F007-02 Side panels beside the chat (artifact, sources, work)](../../20-features/007-layout-systems/F007-02-side-panels-beside-the-chat-artifact-sources-work.md)

## S7.06

**Conversation plus browser split view.** A live web page is shown beside the conversation, so the user can watch or use the page while chatting about it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome done
- Feature: [F007-08 Browser beside the conversation](../../20-features/007-layout-systems/F007-08-browser-beside-the-conversation.md)

## S7.07

**Conversation plus code workspace.** A coding session shows the conversation alongside the code workspace (changes, diffs, terminal or editor) in one view.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done
- Feature: [F007-03 Code workspace and several sessions at once](../../20-features/007-layout-systems/F007-03-code-workspace-and-several-sessions-at-once.md)

## S7.08

**Multi-session tiled layout.** Two or more live sessions are visible side by side in one window, each independently usable.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, VS Code done
- Feature: [F007-03 Code workspace and several sessions at once](../../20-features/007-layout-systems/F007-03-code-workspace-and-several-sessions-at-once.md)

## S7.09

**Stacked-session layout.** Several live sessions can be stacked one above another in one window, each independently usable.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, VS Code done
- Feature: [F007-03 Code workspace and several sessions at once](../../20-features/007-layout-systems/F007-03-code-workspace-and-several-sessions-at-once.md)

## S7.10

**Resizable left sidebar.** The user can drag (or keyboard-adjust) the width of the left navigation sidebar.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing
- Feature: [F007-04 Collapsible navigation and responsive shell](../../20-features/007-layout-systems/F007-04-collapsible-navigation-and-responsive-shell.md)

## S7.11

**Resizable right inspector.** The right-hand inspector pane can be resized by drag or keyboard, and the conversation reflows.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F007-02 Side panels beside the chat (artifact, sources, work)](../../20-features/007-layout-systems/F007-02-side-panels-beside-the-chat-artifact-sources-work.md)

## S7.12

**Collapsible secondary navigation.** Secondary navigation (conversation list, menus) can be collapsed out of the way and reopened.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F007-04 Collapsible navigation and responsive shell](../../20-features/007-layout-systems/F007-04-collapsible-navigation-and-responsive-shell.md)

## S7.13

**Dockable panels.** Panels can be moved to a different edge or region of the window (docked) and stay there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, VS Code done
- Feature: [F007-03 Code workspace and several sessions at once](../../20-features/007-layout-systems/F007-03-code-workspace-and-several-sessions-at-once.md)

## S7.14

**Detachable desktop panels.** A panel of the desktop app can be torn off into its own OS window and used there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, VS Code done
- Feature: [F007-07 Detachable panels and floating Quick Ask](../../20-features/007-layout-systems/F007-07-detachable-panels-and-floating-quick-ask.md)

## S7.15

**Full-screen editor.** An editor (prompt, document or source) can take over the whole screen for focused editing and return to the chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F007-05 Composer at the bottom, growing and full-screen editing](../../20-features/007-layout-systems/F007-05-composer-at-the-bottom-growing-and-full-screen-edi.md)

## S7.16

**Full-screen report reader.** A long report (e.g. a research report) can be read in a full-screen reading view.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F007-06 Full-screen readers and viewers](../../20-features/007-layout-systems/F007-06-full-screen-readers-and-viewers.md)
- Competitor trace: CAP-research-10

## S7.17

**Full-screen media viewer.** An image or video in the conversation can be opened in a full-screen viewer and dismissed back to the chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome done
- Feature: [F007-06 Full-screen readers and viewers](../../20-features/007-layout-systems/F007-06-full-screen-readers-and-viewers.md)

## S7.18

**Floating companion window.** A small always-on-top companion window can float over other apps or pages and be summoned without switching to the main app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Chrome done
- Feature: [F007-07 Detachable panels and floating Quick Ask](../../20-features/007-layout-systems/F007-07-detachable-panels-and-floating-quick-ask.md)

## S7.19

**Compact companion mode.** A compact companion mode shows a reduced chat UI (no sidebar or side panels) sized for quick questions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Chrome done
- Feature: [F007-07 Detachable panels and floating Quick Ask](../../20-features/007-layout-systems/F007-07-detachable-panels-and-floating-quick-ask.md)

## S7.20

**Persistent bottom composer.** The composer stays anchored at the bottom of the chat while the transcript scrolls above it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F007-05 Composer at the bottom, growing and full-screen editing](../../20-features/007-layout-systems/F007-05-composer-at-the-bottom-growing-and-full-screen-edi.md)

## S7.21

**Composer expansion for long prompts.** The composer grows (or opens a larger editor) as a long prompt is typed, instead of staying one line.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F007-05 Composer at the bottom, growing and full-screen editing](../../20-features/007-layout-systems/F007-05-composer-at-the-bottom-growing-and-full-screen-edi.md)

## S7.22

**Scrollable transcript independent from side panels.** The transcript scrolls in its own region, so scrolling it does not move side panels, header or composer (and vice versa).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F007-05 Composer at the bottom, growing and full-screen editing](../../20-features/007-layout-systems/F007-05-composer-at-the-bottom-growing-and-full-screen-edi.md)

## S7.23

**Sticky artifact toolbar.** The artifact toolbar (copy, download, view toggles, close) stays visible while the artifact content scrolls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome unverified
- Feature: [F007-06 Full-screen readers and viewers](../../20-features/007-layout-systems/F007-06-full-screen-readers-and-viewers.md)

## S7.24

**Sticky table headers.** Table headers stay pinned while a long table scrolls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing, Chrome missing
- Feature: [F007-01 Start view and reading column](../../20-features/007-layout-systems/F007-01-start-view-and-reading-column.md)

## S7.25

**Responsive panel stacking.** On narrow windows, side panels stop sitting beside the conversation and stack over it (overlay or sheet), then return beside it when wide.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome unverified
- Feature: [F007-04 Collapsible navigation and responsive shell](../../20-features/007-layout-systems/F007-04-collapsible-navigation-and-responsive-shell.md)

## S7.26

**Mobile bottom-sheet adaptation.** On phone-sized screens, menus and pickers open as bottom sheets instead of desktop popovers.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Mobile done
- Feature: [F007-04 Collapsible navigation and responsive shell](../../20-features/007-layout-systems/F007-04-collapsible-navigation-and-responsive-shell.md)

## S7.27

**Tablet two-column adaptation.** On tablet widths the app shows two columns (navigation plus content) instead of the phone single column.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Mobile done
- Feature: [F007-04 Collapsible navigation and responsive shell](../../20-features/007-layout-systems/F007-04-collapsible-navigation-and-responsive-shell.md)

## S7.28

**Safe-area and virtual-keyboard accommodation.** Content and the composer stay clear of notches/home indicators, and the layout adjusts when the on-screen keyboard opens.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Mobile done
- Feature: [F007-04 Collapsible navigation and responsive shell](../../20-features/007-layout-systems/F007-04-collapsible-navigation-and-responsive-shell.md)

## S7.29

**Minimum and maximum panel widths.** Resizable or responsive panels enforce minimum and maximum widths so neither the panel nor the conversation collapses.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome unverified
- Feature: [F007-02 Side panels beside the chat (artifact, sources, work)](../../20-features/007-layout-systems/F007-02-side-panels-beside-the-chat-artifact-sources-work.md)

## S7.30

**Layout restoration between visits.** Layout choices the user made (sidebar collapsed, panel widths, open panels) come back on the next visit.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, VS Code done
- Feature: [F007-09 Layout memory and window restoration](../../20-features/007-layout-systems/F007-09-layout-memory-and-window-restoration.md)

## S7.31

**Window-size and monitor-change restoration.** The desktop window reopens at its last size and position, and stays on screen when the monitor arrangement changes.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F007-09 Layout memory and window restoration](../../20-features/007-layout-systems/F007-09-layout-memory-and-window-restoration.md)

## S7.32

**Print-specific layouts.** Printing a conversation or report produces a print-specific layout: no app chrome, the whole content, paper-friendly colours and sensible page breaks.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F007-10 Printing](../../20-features/007-layout-systems/F007-10-printing.md)
