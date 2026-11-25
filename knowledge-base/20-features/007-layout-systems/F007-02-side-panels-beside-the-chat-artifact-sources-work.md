---
id: "F007-02"
type: "feature"
title: "Side panels beside the chat (artifact, sources, work)"
aliases: ["Conversation plus artifact split view", "Conversation plus source-inspector split view", "Resizable right inspector", "Minimum and maximum panel widths", "Secondary panel", "Right slot", "Artifacts panel", "Research panel", "Work session panel (task dock)", "S7.04", "S7.05", "S7.11", "S7.29"]
area: "7 Layout systems"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S7.04", "S7.05", "S7.11", "S7.29"]
depends_on: ["surface:web", "surface:desktop", "surface:vscode", "SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage", "SYS-agents-tools-and-automation", "store:chat-ui-store", "store:agi-ui-store", "file:packages/ui/unified-chat/src/stores/uiStore.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F007-02 Side panels beside the chat (artifact, sources, work)

A panel opens on the right of the conversation for artifacts, research sources or the work session (and project sources). On web and desktop it can be dragged or keyboard resized between 280 and 900 pixels, shares one remembered width, and only one such panel is open at a time. Under 640 or 768 pixels it covers the chat.

Area: [7. Layout systems](README.md). Requirement items: [S7.04](../../10-requirements/capabilities/007-layout-systems.md#s704), [S7.05](../../10-requirements/capabilities/007-layout-systems.md#s705), [S7.11](../../10-requirements/capabilities/007-layout-systems.md#s711), [S7.29](../../10-requirements/capabilities/007-layout-systems.md#s729).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows the thing the answer produced or cited beside the transcript so both stay usable, lets the person resize it, and keeps the conversation taking the rest of the width.

**Why it exists.** Viewing an artifact or checking a source should not mean leaving the conversation. The product contract asks for a transcript plus a resizable artifact or file pane on capable desktop and web surfaces, and a full-screen route on phones (doc: docs/product/experience-contract.md:185, docs/product/experience-contract.md:509, docs/product/experience-contract.md:510).

**Who uses it.** People who generate documents, code or research and want to read them while chatting.

**Problems it solves**

- Switching away from the chat to see a result.
- A panel too narrow for a document or too wide for the chat.
- A panel that covers the chat on a phone with no way back.

**Use cases**

- Open an artifact from a message and tweak it while the chat stays visible.
- Open the research sources next to an answer and check a citation.
- Widen the work session panel to read a long step list.
- Resize a panel with the keyboard only.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): the chat page. Panels are the Artifacts panel (title 'Artifacts'), the Research panel (tabs Sources, Report, Library) and the work session panel (apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:690, apps/web/features/chat/components/research/ResearchPanel.tsx:398, apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:1079).
- Resize bar: a thin vertical separator on the panel's left edge with labels 'Resize artifacts panel', 'Resize research panel' and 'Resize <panel label>' (same lines).
- VS Code: artifacts open as a read-only editor tab through the editor's own layout (apps/extension-vscode/src/features/artifacts/artifactActions.ts:135).
- Mobile: artifacts open full screen (see F007-06); no side panel.
- CLI: no panel (brief marks source inspector missing).

**Before you start**

- A conversation with an artifact, research sources, or a running work session.
- Not in compact embed mode: panels render only when the page is not compact (apps/web/features/chat/pages/WebChatPage.tsx:7844).

**Screens and controls**

- Resize separator: drag with the pointer, or focus it and press Left to widen and Right to narrow by 24 pixels; Home gives the minimum, End the maximum (apps/web/features/chat/components/SidePanelResizeHandle.tsx:10, apps/web/features/chat/components/SidePanelResizeHandle.tsx:45).
- Separator exposes aria-valuenow, valuemin and valuemax (apps/web/features/chat/components/SidePanelResizeHandle.tsx:57).
- Close controls and a dimmed backdrop under the overlay width (apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:681).

**Journey**

1. Open a panel (artifact card, source chip or work toggle).
2. The panel slides in on the right and the conversation narrows.
3. Drag the bar or use arrow keys to set the width.
4. Switch to another panel; it takes the same slot and the same width.
5. Close the panel; the conversation takes the full width again.

**What the person sees and gets**

- Panel width changes live while dragging.
- On phones the panel covers the chat as a dialog (artifacts, research) or a bottom sheet (work session).
- Desktop shell remembers the width across windows and restarts (apps/web/features/desktop-host/hooks/use-shell-layout.ts:21).

**Settings**

- None visible. The width is stored in the chat UI store key 'chat-ui-store' on web (packages/ui/unified-chat/src/stores/uiStore.ts:77).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: one active secondary panel at a time among work, research, artifacts and sources; newly opened research or artifacts takes the slot (apps/web/features/chat/pages/web-chat-layout.ts:19, apps/web/features/chat/pages/WebChatPage.tsx:1203).
- Web: three panels render the shared resize handle only when the layout is wide (apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:690, apps/web/features/chat/components/research/ResearchPanel.tsx:398, apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:1079).
- Width is clamped to 280-900 by one shared function (packages/ui/unified-chat/src/stores/uiStore.ts:6, packages/ui/unified-chat/src/stores/uiStore.ts:10) and persisted with the theme and sidebar flag (packages/ui/unified-chat/src/stores/uiStore.ts:77).
- Pointer drag sets width to window width minus pointer x (apps/web/features/chat/components/SidePanelResizeHandle.tsx:24).
- Overlay: the artifacts and research panels become a modal dialog under 640 pixels (apps/web/features/chat/stores/artifacts-store.ts:38, apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:273); the work panel becomes a bottom sheet under 768 (apps/web/features/chat/hooks/use-overlay-dialog.ts:5, apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:1069).
- Desktop (Electron): the layout hook reads the shell's saved width and sidebar state once on mount and writes each change back (apps/web/features/desktop-host/hooks/use-shell-layout.ts:21, apps/web/features/desktop-host/hooks/use-shell-layout.ts:41, apps/web/features/desktop-host/hooks/use-shell-layout.ts:47).
- VS Code: an artifact opens in a preview editor tab from a read-only content provider (apps/extension-vscode/src/features/artifacts/artifactActions.ts:135).

**Incomplete**

- Desktop stores the width clamped to 220-720 while the page clamps to 280-900, so a width above 720 is stored as 720 (apps/desktop/electron/windowState.ts:42, apps/desktop/electron/windowState.ts:43, apps/desktop/electron/windowState.ts:104).
- The artifacts panel width rule has min 280 and shrink, with md:w-1/2 and lg:w-[480px] classes that the inline width overrides on wide screens (apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:681).

**Present but disconnected or switched off**

- The shared store function openArtifactPanel also collapses the left sidebar (packages/ui/unified-chat/src/stores/uiStore.ts:59). Its callers found are in the internal Tauri desktop code (apps/desktop/src/features/artifacts/openArtifactInChat.ts:60) and a shared hook (packages/ui/unified-chat/src/hooks/useArtifact.ts:11). Web opens the panel through the artifacts store instead, and I did not establish that opening it collapses the left sidebar on web.
- The 'work' dock open flag is not persisted; it re-opens per run (apps/web/shared/stores/layout-store.ts:113).

**Not available**

- Source inspector beside the chat on CLI and VS Code (brief: missing).
- Resizable panels on mobile, CLI, VS Code and Chrome (brief lists resize for web and desktop only).
- Chrome panel width limits: unverified; the browser owns the side panel width [inferred].

## 4. Required behaviour

**Established requirements**

- An artifact opens in its own pane beside the conversation (S7.04). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.04)
- Sources behind an answer open in an inspector pane beside the conversation (S7.05). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.05)
- The right-hand inspector can be resized by drag or keyboard and the conversation reflows (S7.11). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.11)
- Resizable panels enforce minimum and maximum widths so neither the panel nor the conversation collapses (S7.29). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.29)
- Split panes collapse to a full-screen viewer or native stack on phone. (source: doc: docs/product/experience-contract.md:198)
- Viewer contract: resizable split pane on capable desktop and web surfaces, independent transcript and viewer scroll. (source: doc: docs/product/experience-contract.md:509)

**Acceptance criteria**

1. Dragging the bar on a 1440 wide window changes the panel width and the chat reflows.
2. Focused bar: Left adds 24 pixels, Right removes 24, Home gives 280, End gives 900.
3. Width never goes below 280 or above 900, even by repeated keys.
4. Opening the research panel while the artifacts panel is open replaces it in the same slot.
5. At 600 wide the artifacts panel is a full-screen dialog with Escape to close; at 700 wide the work panel is a bottom sheet.
6. Resized width is kept when the panel content changes and after reload.
7. The bar has the role separator and a label naming the panel.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A shared single width for every panel is deliberate (one store field) [inferred].
- Desktop stored range should equal the page range, otherwise a wide choice is lost [inferred from the two constants].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the Electron window state use the shared bounds from the shared store.
- [proposed] Provide a source inspector on VS Code and CLI or mark the brief not-applicable.
- [proposed] Decide whether web should also collapse the left sidebar when a panel opens, as the shared store does.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SidePanelResizeHandle | `apps/web/features/chat/components/SidePanelResizeHandle.tsx` | Separator with drag and keyboard resizing; step 24 pixels. |
| store | useUIStore (chat UI) | `packages/ui/unified-chat/src/stores/uiStore.ts` | artifactPanelWidth, bounds 280-900, clamp function, persisted as 'chat-ui-store'. |
| component | ArtifactsPanel | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Artifact panel; overlay dialog under 640; handle at line 690. |
| component | ResearchPanel | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Sources, Report and Library tabs in the right slot. |
| component | WorkSessionPanel | `apps/web/features/chat/components/work-session/WorkSessionPanel.tsx` | Work session dock; bottom sheet under 768. |
| hook | useOverlayLayout and useOverlayDialog | `apps/web/features/chat/hooks/use-overlay-dialog.ts` | Media query switch between beside and covering; focus containment for the covering form. |
| store | artifacts-store | `apps/web/features/chat/stores/artifacts-store.ts` | ARTIFACT_PANEL_OVERLAY_QUERY and panel open state. |
| store | research-panel-store | `apps/web/features/chat/stores/research-panel-store.ts` | Research panel open state and sources. |
| service | resolveSecondaryPanel | `apps/web/features/chat/pages/web-chat-layout.ts` | Chooses which one panel owns the right slot. |
| screen | WebChatPage panel slots | `apps/web/features/chat/pages/WebChatPage.tsx` | Renders the panels (lines 7844-7897). |
| hook | useShellLayout (desktop host) | `apps/web/features/desktop-host/hooks/use-shell-layout.ts` | Syncs panel width and sidebar state with the Electron shell. |
| service | Shell window state | `apps/desktop/electron/windowState.ts` | Stores secondaryPanelWidth, clamped 220-720. |
| service | shellWindowStore | `apps/desktop/electron/shellWindowStore.ts` | Reads and writes the shell layout. |
| service | openArtifactReadOnly | `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | Opens an artifact in a VS Code editor tab. |
| test | SecondaryPanel test | `apps/web/shared/components/layout/__tests__/SecondaryPanel.test.tsx` | Resize, bounds, sheet behaviour. |
| test | uiStore panel width test | `packages/ui/unified-chat/src/stores/__tests__/uiStore.panelWidth.test.ts` | Bounds and clamp. |
| test | ShellLayout test | `apps/web/features/desktop-host/__tests__/ShellLayout.test.tsx` | Desktop shell adoption and write-back. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person opens a panel; the page sets its flag and resolves which single panel owns the right slot. | device | (apps/web/features/chat/pages/web-chat-layout.ts:19) |
| The panel reads the shared width and applies it as inline style when the viewport is wide. | device | (apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:681) |
| A drag or key press calls setArtifactPanelWidth, which clamps to 280-900 and saves it to browser storage. | device | (packages/ui/unified-chat/src/stores/uiStore.ts:63) |
| In the Electron shell the width change is sent to the shell, which stores it in its window state. | device | (apps/web/features/desktop-host/hooks/use-shell-layout.ts:47) |
| The panel content (artifact text, sources) comes from the chat and research features; the artifacts store may sync to the cloud. | device and our servers | (apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:273) the panel reads cloud sync status from the store; details belong to SYS-files-artifacts-and-storage and were not read |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Panel width and sidebar collapsed flag | Web: browser local storage keys 'chat-ui-store' and 'agi-ui-store'. Desktop shell: its window state file. | not synced across devices (no server call found) | Kept until browser storage or shell state is cleared; no delete path found. |

**Models and providers.** The panel layout does not depend on a model or provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Layout needs no account. Artifact and research content needs the features that produce it. |
| Permissions | none found in the code |
| Subscription | none found in the code for the layout itself. Artifacts and research content follow their own plan rules (SYS-subscriptions-entitlements-and-usage). |
| Limits and metering | none found in the code for layout. Width limits 280 and 900 are constants, not plan values (packages/ui/unified-chat/src/stores/uiStore.ts:6). |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Layout works the same in Local mode. Which panel content exists in Local mode (research needs a search route) was not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Phone width | Panels cover the page with a backdrop and dialog semantics; Escape and focus return are handled. | (apps/web/features/chat/hooks/use-overlay-dialog.ts:5) |
| Width out of range | Clamped to 280-900. | (packages/ui/unified-chat/src/stores/uiStore.ts:10) |
| Panel detached in its own window (desktop) | Resize handle is not shown for a detached panel; toggling focuses the detached window. | (apps/web/features/chat/components/research/ResearchPanel.tsx:397, apps/web/features/chat/pages/WebChatPage.tsx:1226) |
| Keyboard use | The bar is focusable, with Home, End and arrows. | (apps/web/features/chat/components/SidePanelResizeHandle.tsx:45) |
| Reduced motion | Hover colour transition is disabled for reduced motion on the handle. | (apps/web/features/chat/components/SidePanelResizeHandle.tsx:64) |
| Shell cannot be read | Page keeps its default layout. | (apps/web/features/desktop-host/__tests__/ShellLayout.test.tsx:123) |
| Pointer released outside the window | not handled in the code beyond a pointerup listener on the window | (apps/web/features/chat/components/SidePanelResizeHandle.tsx:24) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/shared/components/layout/__tests__/SecondaryPanel.test.tsx`: Keyboard resize both ways, drag, min and max, width kept while content changes, close control, full-screen sheet on phone with focus return.
- `packages/ui/unified-chat/src/stores/__tests__/uiStore.panelWidth.test.ts`: Shared bounds and clamping.
- `apps/web/features/chat/components/artifacts/ArtifactsPanel.mobileSheet.test.tsx`: Modal full-screen sheet on phone; docks with resize handle on wide viewport; reopens on the selected artifact.
- `apps/web/features/chat/pages/__tests__/web-chat-layout.test.ts`: Right slot moves to the newly opened panel; automatic work dock does not replace the panel being read.
- `apps/web/features/desktop-host/__tests__/ShellLayout.test.tsx`: Desktop shell adopts and writes layout; no write while adopting.

**Test scenarios**

- **Drag resize**
  1. Open an artifact on web at 1440 wide.
  2. Drag the left edge bar to the left.
  - Expected: Panel widens, chat narrows, width stops at 900.
- **Keyboard resize**
  1. Tab to the separator.
  2. Press Left three times, then End, then Home.
  - Expected: Width grows 72 pixels, then 900, then 280.
- **Panel swap**
  1. Open artifacts.
  2. Open research sources.
  - Expected: Only research shows, in the same slot and width.
- **Phone overlay**
  1. Set window to 600 wide.
  2. Open an artifact.
  - Expected: Full-screen dialog; Escape closes and focus returns.
- **Desktop memory**
  1. In the desktop app set a panel width.
  2. Quit and reopen.
  - Expected: Width restored, but values above 720 come back as 720.

**Where to look when it fails**

- Local storage keys chat-ui-store and agi-ui-store hold the web values.
- Electron window state file holds secondaryPanelWidth (apps/desktop/electron/windowState.ts:104).
- No log lines or error names found for resizing.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/007-layout-systems.md](../../70-qa/test-plans/web/007-layout-systems.md)
- Desktop: [70-qa/test-plans/desktop/007-layout-systems.md](../../70-qa/test-plans/desktop/007-layout-systems.md)
- Mobile: [70-qa/test-plans/mobile/007-layout-systems.md](../../70-qa/test-plans/mobile/007-layout-systems.md)
- VS Code: [70-qa/test-plans/vscode/007-layout-systems.md](../../70-qa/test-plans/vscode/007-layout-systems.md)
- Chrome: [70-qa/test-plans/chrome/007-layout-systems.md](../../70-qa/test-plans/chrome/007-layout-systems.md)

## 10. Gaps and dependencies

- **Desktop stored width range (220-720) differs from the page range (280-900).** Affects: Desktop users who widen beyond 720 or below 280. Evidence: (apps/desktop/electron/windowState.ts:42, packages/ui/unified-chat/src/stores/uiStore.ts:6). Work needed: Use one bound constant for both.
- **No source inspector on CLI and VS Code.** Affects: CLI and VS Code users. Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md). Work needed: Decide scope per surface.
- **Chrome panel width limits unverified.** Affects: Chrome users. Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md). Work needed: Read the extension panel code and test.
- **Overlay breakpoints differ: 640 for artifacts and research, 768 for work.** Affects: Web users between 640 and 767 pixels. Evidence: (apps/web/features/chat/stores/artifacts-store.ts:38, apps/web/features/chat/hooks/use-overlay-dialog.ts:5). Work needed: Confirm intended or align.
- **No test found that drives the real pointer drag of the handle in a browser.** Affects: Regression risk. Evidence: SecondaryPanel test uses a harness (apps/web/shared/components/layout/__tests__/SecondaryPanel.test.tsx:105). Work needed: Add a browser test.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:vscode
- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage
- SYS-agents-tools-and-automation
- store:chat-ui-store
- store:agi-ui-store
- file:packages/ui/unified-chat/src/stores/uiStore.ts

## Unknown

- Whether opening an artifact on web collapses the left sidebar (the shared store does, web path not established).
- How the VS Code artifact tab is placed beyond the default editor group.
- Chrome side panel width behaviour and the Chrome artifact panel layout.
- Whether the 640 versus 768 overlay breakpoint split is intentional.
- Cloud sync of panel width: none found, but not searched on the server.
