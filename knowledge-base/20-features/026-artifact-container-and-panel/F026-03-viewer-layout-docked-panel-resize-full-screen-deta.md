---
id: "F026-03"
type: "feature"
title: "Viewer layout: docked panel, resize, full screen, detached window, tabs, switching"
aliases: ["Artifacts panel", "Docked panel", "Resize artifacts panel", "Expand / Exit fullscreen", "Open in new tab", "Artifact tabs", "ArtifactSwitcher", "Full-screen sheet"]
area: "26 Artifact container and panel"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S26.08", "S26.09", "S26.10", "S26.11", "S26.12", "S26.13", "S26.40"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage", "store:chat-ui-store", "file:packages/ui/unified-chat/src/stores/uiStore.ts", "file:apps/desktop/electron/windowPolicy.ts", "F026-01", "F026-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F026-03 Viewer layout: docked panel, resize, full screen, detached window, tabs, switching

Places the artifact viewer beside the chat on wide web and Desktop windows, as a modal sheet on a phone-width web page, as a full-screen sheet in the phone app, and in a separate window or tab on web and Desktop. Tabs switch between artifacts. CLI and VS Code have no panel.

Area: [26. Artifact container and panel](README.md). Requirement items: [S26.08](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2608), [S26.09](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2609), [S26.10](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2610), [S26.11](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2611), [S26.12](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2612), [S26.13](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2613), [S26.40](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2640).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not stated on this page | built | not seen by a person |
| VS Code | not stated on this page | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Controls where and how big the viewer is: docked and resizable on wide screens, modal on small screens, full screen on demand, detached in its own tab or window, with one tab per artifact (ArtifactsPanel.tsx:674-690,775-804).

**Why it exists.** People want to read an artifact while the chat stays visible, and to enlarge it when reading closely. Phones have no room for a side panel (artifacts-store.ts:33-37).

**Who uses it.** Anyone reading or comparing generated pages, documents and diagrams.

**Problems it solves**

- Chat and artifact visible together
- Phone readers get a usable full-screen view
- Several artifacts can be switched without closing the viewer

**Use cases**

- Read a page beside the chat and drag the edge wider
- Press the expand control to read a document full screen
- Open an HTML page in a separate tab or window
- Switch between three files from the tab strip or the mobile switcher

## 2. User experience

**Where to find it**

- Web and Desktop: the right-hand panel titled 'Artifacts' (ArtifactsPanel.tsx:697); resize handle labelled 'Resize artifacts panel' (ArtifactsPanel.tsx:690); expand control 'Enter fullscreen' / 'Exit fullscreen' with title 'Expand' (ArtifactPreview.tsx:2939-2940); menu item 'Open in new tab' (ArtifactPreview.tsx:2358-2364)
- Mobile: full-screen modal sheet (ArtifactFullScreen.tsx:1278) with an artifact switcher when a conversation has more than one (ArtifactFullScreen.tsx:1536-1538)
- Chrome: panel inside the side panel, only one artifact at a time; Outputs popover lists them (artifactPanel.ts:913-921)
- CLI and VS Code: no panel. VS Code opens a read-only editor tab per artifact (artifactActions.ts:130-135)

**Before you start**

- An artifact to show; wide window for docking; a browser that allows pop-outs for 'Open in new tab'

**Screens and controls**

- Resize handle: a separator with arrow, Home and End keys (SidePanelResizeHandle.tsx:39-52,54-70)
- Tab per artifact with title tooltip, plus a pulsing tab for the one being written (ArtifactsPanel.tsx:61-85,785-801)
- Task dock tabs 'Task dock' and 'Artifacts' when a task dock is open (ArtifactsPanel.tsx:91-113)
- Mobile web: dimmed backdrop and a dialog labelled 'Artifacts' (ArtifactsPanel.tsx:668-680)
- Fullscreen button with Maximize icon (ArtifactPreview.tsx:2933-2943)
- Mobile switcher (ArtifactSwitcher.tsx)

**Journey**

1. Open an artifact from its card
2. On a wide window it docks at the right; drag the edge or use arrow keys to resize
3. Press expand to fill the window; press again or Escape to leave
4. Pick another tab to switch
5. Use the more menu 'Open in new tab' to read it in its own tab or window
6. On a phone open the card; the sheet fills the screen; close it with 'Close'

**What the person sees and gets**

- Width changes live and is stored
- Task dock gives a way back when an artifact opens over it
- Escape leaves native full screen and resets the layout flag (ArtifactPreview.tsx:767-789)

**Settings**

- Panel width, 280 to 900 pixels, default 400, kept in the 'chat-ui-store' browser store (uiStore.ts:6-8,46,77-81)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web docked panel and resize by pointer and keyboard (SidePanelResizeHandle.tsx:15-52)
- Width clamped to 280-900 and persisted (uiStore.ts:9-11,63,77-81)
- Phone-width overlay as modal dialog with focus handling (ArtifactsPanel.tsx:652-654,674-680)
- Fullscreen: in-page expanded layout plus a best-effort native Fullscreen API call (ArtifactPreview.tsx:1787-1803)
- Open in new tab: a blob page that frames the artifact in a sandbox without allow-same-origin (ArtifactPreview.tsx:439-441,1743-1750)
- Desktop: an app blob URL is allowed to open a 960x720 window (windowPolicy.ts:225-230,253-261,319-340)
- Tabs and selection fallback to the first artifact (ArtifactsPanel.tsx:388)
- Mobile full-screen sheet and switcher (ArtifactFullScreen.tsx:1278,1536)

**Incomplete**

- Panel width is clamped by shared bounds but the panel also has CSS widths (md:w-1/2, lg:w-[480px]) that apply on narrower layouts (ArtifactsPanel.tsx:686); the stored width applies only to the 'desktop' layout (ArtifactsPanel.tsx:681)
- Chrome panel shows one artifact at a time with no tabs in the code opened (artifactPanel.ts:703-760)

**Present but disconnected or switched off**

- The first draft said a 'pop-out' detached window is desktop only; the code makes it a browser tab or Electron window from window.open of a blob, so it is not desktop-only (ArtifactPreview.tsx:1743-1750)

**Not available**

- Mobile app has no docked panel, resize, tabs or detached window (single full-screen modal, ArtifactFullScreen.tsx:1278)
- CLI and VS Code have no docked panel, resize, full screen or tabs; the brief's CLI and VS Code citations point at publish and read-only open code, not layout code (artifactActions.ts:104-135)

## 4. Required behaviour

**Established requirements**

- The artifact opens in a panel docked beside the conversation so both are visible (S26.08) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.08)
- The user can change the docked panel width by pointer or keyboard and the width is kept (S26.09) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.09)
- Any open artifact can fill the screen and return (S26.10) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.10)
- Where the platform allows, the artifact can pop out into its own window or tab (S26.11) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.11)
- With several artifacts the user can switch without leaving the viewer (S26.12) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.12)
- Open artifacts appear as tabs, one each, including one being written (S26.13) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.13)
- On a phone-sized screen the reader adapts to a full-screen sheet with touch controls (S26.40) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.40)

**Acceptance criteria**

1. Web at 1280 px wide: opening an artifact leaves the chat visible beside the panel
2. Dragging the handle or pressing ArrowLeft/ArrowRight changes width within 280 to 900 px; Home and End jump to the limits
3. After reload the chosen width is still used
4. At 639 px or less wide the panel is a dialog labelled 'Artifacts' with a backdrop that closes it
5. Press 'Enter fullscreen' then 'Exit fullscreen' and the layout returns
6. 'Open in new tab' opens the rendered page in a new tab (web) or a 960x720 window (Desktop)
7. The tab strip shows one tab per artifact and a pulsing tab while one is being written
8. Opening '?artifact=<unknown id>' does nothing

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's CLI and VS Code 'built' status does not mean a panel exists; their layout controls do not apply [inferred from the code opened]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a keyboard shortcut hint for the resize handle
- [proposed] Add tabs to the Chrome panel if more than one artifact is common

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactsPanel | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Panel container, overlay layout, tabs, deep link |
| component | SidePanelResizeHandle | `apps/web/features/chat/components/SidePanelResizeHandle.tsx` | Pointer and keyboard resize |
| store | useUIStore (unified-chat) | `packages/ui/unified-chat/src/stores/uiStore.ts` | artifactPanelWidth, bounds 280-900, persisted as 'chat-ui-store' |
| store | artifacts-store panel actions | `apps/web/features/chat/stores/artifacts-store.ts` | selectArtifact, setPanelOpen, togglePanel, autoOpenPanel, overlay query |
| hook | useOverlayDialog | `apps/web/features/chat/hooks/use-overlay-dialog.ts` | Dialog focus handling for the phone overlay [inferred from import; file not opened] |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Fullscreen, Open in new tab, header controls |
| screen | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Mounts ArtifactsPanel (line 7894) and toggle (lines 7489,7531) |
| config | windowPolicy (Electron) | `apps/desktop/electron/windowPolicy.ts` | Allows app blob URLs to open in a detached window |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile full-screen sheet |
| component | ArtifactSwitcher | `apps/mobile/src/features/chat/components/ArtifactSwitcher.tsx` | Mobile switch between artifacts |
| component | artifactPanel (Chrome) | `apps/extension/src/features/side-panel/artifactPanel.ts` | Side-panel viewer with close on Escape |
| service | openArtifactReadOnly | `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | Opens an artifact as a read-only editor document |
| test | ArtifactsPanel.mobileSheet.test | `apps/web/features/chat/components/artifacts/ArtifactsPanel.mobileSheet.test.tsx` | Layout tests |
| test | artifact-card-panel.spec | `apps/web/e2e/artifact-card-panel.spec.ts` | Browser layout spec |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A media query for 639 px decides overlay or desktop layout | device | artifacts-store.ts:38; ArtifactsPanel.tsx:265-281 |
| Pointer or key events call setArtifactPanelWidth, which clamps and stores the width | device | SidePanelResizeHandle.tsx:15-52; uiStore.ts:63 |
| Fullscreen sets a layout flag and asks the browser for native full screen; a rejected request is ignored | device | ArtifactPreview.tsx:1787-1803 |
| Open in new tab builds a blob page that frames the artifact in a sandbox iframe and opens it with noopener | device | ArtifactPreview.tsx:439-441,1743-1750 |
| In Electron the app's window-open handler allows an app blob URL as a child window and locks navigation inside it | device | windowPolicy.ts:253-261,293-300,319-340 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Panel width | Browser localStorage 'chat-ui-store' (uiStore.ts:77-81) | No | Kept until browser data is cleared |
| Selected artifact id | Persisted with the artifact list (artifacts-store.ts:608-613) | Not as a field in the sync push [inferred] | Reset to the first artifact when it no longer exists (ArtifactsPanel.tsx:388) |

**Models and providers.** Not involved. Layout does not call a model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the layout code |
| Permissions | Pop-outs need the browser to allow window.open; Electron allows app blob URLs only (windowPolicy.ts:253-261). |
| Subscription | none found in the code in the layout files opened |
| Limits and metering | Width bounds 280 and 900 px (uiStore.ts:6-7) |
| Feature flags | none found |
| Model compatibility | Not applicable |
| Provider restrictions | none found |
| Local mode | Layout works the same in Local mode because it runs on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Phone-width web | Dialog overlay with backdrop; clicking the backdrop closes; panel width is not applied | ArtifactsPanel.tsx:668-681 |
| Native full screen refused | The in-page expanded layout still applies; the rejection is swallowed | ArtifactPreview.tsx:1787-1803 |
| Escape from native full screen | The layout flag resets | ArtifactPreview.tsx:767-775 |
| Selected artifact missing | The first artifact is shown | ArtifactsPanel.tsx:388 |
| Artifact written by an abandoned reply variant | Hidden from the list unless named by a deep link | ArtifactsPanel.tsx:375-386 |
| Pop-up blocked | not handled in the code; the window.open result is not checked | ArtifactPreview.tsx:1749 |
| Accessibility | Separator with aria-valuenow/min/max and keyboard control; overlay is aria-modal; reduced-motion respected on the handle | SidePanelResizeHandle.tsx:54-70 |
| Mobile app | One artifact in a modal; a switcher shows only when there are two or more | ArtifactFullScreen.tsx:1536 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactsPanel.mobileSheet.test.tsx`: Modal sheet on a phone viewport; docked with a resize handle on wide; reopen on selected artifact
- `apps/web/features/chat/components/artifacts/ArtifactsPanel.shortcut.test.tsx`: Panel toggle keyboard shortcut [inferred from name]
- `apps/web/e2e/artifact-card-panel.spec.ts`: Panel stays closed on phone width, no sideways scroll
- `apps/web/features/chat/components/artifacts/ArtifactsPanel.test.tsx`: Fallback to first artifact when selection is stale, header sizing to the panel
- `apps/mobile/__tests__/ChatListArtifactFullscreen.snapshot.test.tsx`: Mobile full-screen artifact snapshot [inferred from name]

**Test scenarios**

- **Resize**
  1. Open an artifact on a 1280 px browser
  2. Drag the edge to the left
  3. Focus the handle and press ArrowRight, then Home
  4. Reload
  - Expected: Width follows drag, shrinks by 24 px per ArrowRight, jumps to 280 on Home, and is the same after reload
- **Phone width**
  1. Resize the window to 600 px
  2. Click Open on a card
  - Expected: A dialog labelled Artifacts covers the screen; backdrop click closes
- **Full screen**
  1. Press expand
  2. Press Escape
  - Expected: Viewer fills the window then returns
- **Desktop pop-out**
  1. In the Electron Desktop window open an HTML artifact
  2. Choose 'Open in new tab'
  - Expected: A separate window shows the rendered page and cannot navigate away inside itself
- **Switch**
  1. Make two artifacts in one chat
  2. Click the second tab
  3. On mobile use the switcher
  - Expected: Viewer changes without closing

**Where to look when it fails**

- Check 'chat-ui-store' in browser storage for artifactPanelWidth
- Check matchMedia '(max-width: 639px)' for overlay mode (artifacts-store.ts:38)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/026-artifact-container-and-panel.md](../../70-qa/test-plans/web/026-artifact-container-and-panel.md)
- Desktop: [70-qa/test-plans/desktop/026-artifact-container-and-panel.md](../../70-qa/test-plans/desktop/026-artifact-container-and-panel.md)
- Mobile: [70-qa/test-plans/mobile/026-artifact-container-and-panel.md](../../70-qa/test-plans/mobile/026-artifact-container-and-panel.md)
- CLI: [70-qa/test-plans/cli/026-artifact-container-and-panel.md](../../70-qa/test-plans/cli/026-artifact-container-and-panel.md)
- VS Code: [70-qa/test-plans/vscode/026-artifact-container-and-panel.md](../../70-qa/test-plans/vscode/026-artifact-container-and-panel.md)
- Chrome: [70-qa/test-plans/chrome/026-artifact-container-and-panel.md](../../70-qa/test-plans/chrome/026-artifact-container-and-panel.md)

## 10. Gaps and dependencies

- **The first draft said keyboard resize was not found; it exists (arrows, Home, End)** Affects: Web, Desktop. Evidence: SidePanelResizeHandle.tsx:39-52. Work needed: None; correct the draft
- **Mobile has no docked, tabbed or detached view (brief: missing for S26.08, S26.11, S26.13)** Affects: Mobile. Evidence: ArtifactFullScreen.tsx:1278. Work needed: Likely by design on a phone; confirm
- **Chrome has no tab strip** Affects: Chrome. Evidence: artifactPanel.ts:703-760 shows one selected artifact. Work needed: Decide if needed
- **No pop-up blocked message on web** Affects: Web, Desktop. Evidence: ArtifactPreview.tsx:1749. Work needed: Check the return value and tell the user
- **The brief marks CLI and VS Code layout items 'built' but cites unrelated code** Affects: CLI, VS Code. Evidence: artifactActions.ts:104-135 is a read-only open; CLI has no layout. Work needed: Correct the brief statuses to not applicable

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage
- store:chat-ui-store
- file:packages/ui/unified-chat/src/stores/uiStore.ts
- file:apps/desktop/electron/windowPolicy.ts
- F026-01
- F026-04

## Unknown

- Whether there is a test for Electron windowPolicy artifact blobs
- How the Tauri retained desktop lays out artifacts
- Whether the stored width applies on tablet widths between 640 and 1023 px given the fixed CSS widths
- Whether popups are blocked in Electron for non-blob URLs from the artifact page
