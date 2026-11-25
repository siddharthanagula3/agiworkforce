---
id: "F007-06"
type: "feature"
title: "Full-screen readers and viewers"
aliases: ["Full-screen report reader", "Full-screen media viewer", "Sticky artifact toolbar", "Image lightbox", "Research report view", "S7.16", "S7.17", "S7.23"]
area: "7 Layout systems"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S7.16", "S7.17", "S7.23"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "SYS-files-artifacts-and-storage", "SYS-voice-and-media", "SYS-shared-ui-and-design", "file:apps/web/features/chat/components/ImageLightbox.tsx", "file:apps/web/features/chat/components/research/ResearchReportView.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F007-06 Full-screen readers and viewers

Long reports, images and artifacts open in views that cover the screen. Web has a full-screen report reader, an image lightbox with zoom and paging, and an artifact toolbar that stays above the scrolling content. Mobile has report screens, a full-screen image viewer and a full-screen artifact view. Chrome has an image viewer. Video viewing was not found.

Area: [7. Layout systems](README.md). Requirement items: [S7.16](../../10-requirements/capabilities/007-layout-systems.md#s716), [S7.17](../../10-requirements/capabilities/007-layout-systems.md#s717), [S7.23](../../10-requirements/capabilities/007-layout-systems.md#s723).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives long or detailed content the whole screen, with controls that stay visible and a clear way back to the chat.

**Why it exists.** Reports and images are hard to use inside a narrow column. On phones the contract wants a full-screen viewer or native route (doc: docs/product/experience-contract.md:198, doc: docs/product/experience-contract.md:510).

**Who uses it.** People reading research reports, checking generated images, and reviewing artifacts.

**Problems it solves**

- Reports cramped in a side panel.
- Tiny images in a message.
- Losing the copy, download and close controls while scrolling an artifact.

**Use cases**

- Read a long research report full screen with a contents list.
- Zoom into a generated image and page through several.
- Scroll a long document artifact on a phone with Close always reachable.
- View a picture in the Chrome side panel.

## 2. User experience

**Where to find it**

- Web and Desktop: research report toolbar button 'Read report full screen' (becomes 'Exit full screen') (apps/web/features/chat/components/research/ResearchReportView.tsx:442); click an image in a message to open the lightbox (apps/web/features/chat/components/messages/MessageBubble.tsx:3187); artifact toolbar at the top of the Artifacts panel (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2580).
- Mobile: report screens (apps/mobile/src/features/research/ReportsScreen.tsx:115), full-screen image modal (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:606) and artifact modal (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1278).
- Chrome: tapping an answer image opens the side panel viewer (apps/extension/src/features/side-panel/mediaViewer.ts:11).
- CLI, VS Code: no report reader (brief: missing).

**Before you start**

- A research report, image or artifact in the conversation.

**Screens and controls**

- Web reader dialog named after the report title with the same toolbar (apps/web/features/chat/components/research/ResearchReportView.tsx:699).
- Lightbox dialog 'Image preview': zoom out, zoom in with percent, previous and next, download, close; keys arrow left and right, plus, minus, zero (apps/web/features/chat/components/ImageLightbox.tsx:48, apps/web/features/chat/components/ImageLightbox.tsx:104).
- Mobile artifact header: title, 'Download artifact', share, copy, 'More artifact actions', version chip (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1339).
- Chrome viewer: close button, Escape, click outside (apps/extension/src/features/side-panel/mediaViewer.ts:11).

**Journey**

1. Open the content from the message.
2. The viewer covers the screen with its controls.
3. Scroll or zoom; the toolbar stays in place.
4. Close with the button, Escape, a backdrop click or a swipe down (mobile image).
5. Return to the chat; focus goes back to the control that opened it on web and Chrome.

**What the person sees and gets**

- Zoom percent in the lightbox, image count 'n of m'.
- Report export and save actions in the reader toolbar (apps/web/features/chat/components/research/ResearchReportView.tsx:442).

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web report reader: a toggle opens a portal dialog covering the window (fixed inset-0) with focus handling and body scroll lock; closing returns focus to the toggle (apps/web/features/chat/components/research/ResearchReportView.tsx:240, apps/web/features/chat/components/research/ResearchReportView.tsx:699, apps/web/features/chat/components/research/ResearchReportView.tsx:704).
- Web lightbox: dialog with zoom range 0.5 to 3, step 0.25, arrow paging with wrap, backdrop click and Escape close, body scroll lock (apps/web/features/chat/components/ImageLightbox.tsx:23, apps/web/features/chat/components/ImageLightbox.tsx:48, apps/web/features/chat/components/ImageLightbox.tsx:104).
- Web artifact toolbar is a non-shrinking row above the scrolling preview, so it stays visible; it does not use CSS 'sticky' (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2580).
- Mobile image viewer: modal with pan-to-dismiss and zoom gestures (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:381, apps/mobile/src/features/chat/components/ImageFullScreen.tsx:606).
- Mobile artifact viewer: modal whose header sits under the status bar outside the content (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1278, apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1296).
- Chrome viewer: modal dialog with Escape, focus trap on the close button, click-away close and focus restore (apps/extension/src/features/side-panel/mediaViewer.ts:11).

**Incomplete**

- Mobile report reading is a screen with a back arrow rather than a distinct full-screen mode (apps/mobile/src/features/research/ReportsScreen.tsx:115) [inferred from the header read].
- Video viewing: every viewer opened handles images; S7.17 says image or video. Unknown.
- Closing returns to the chat with scroll position kept: not verified.

**Present but disconnected or switched off**

- The internal Tauri desktop code has its own research page; it is not the public Desktop and was not used as evidence.

**Not available**

- Report reader on CLI, VS Code, Chrome (brief: missing; not searched by me).
- Sticky artifact toolbar on Chrome: unverified (brief).

## 4. Required behaviour

**Established requirements**

- A long report can be read in a full-screen reading view (S7.16). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.16)
- An image or video can be opened full screen and dismissed back to the chat (S7.17). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.17)
- The artifact toolbar (copy, download, view toggles, close) stays visible while the content scrolls (S7.23). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.23)
- On phones a viewer is a full-screen or native route. (source: doc: docs/product/experience-contract.md:510)

**Acceptance criteria**

1. Web: 'Read report full screen' covers the window; Escape returns and focus is back on the toggle.
2. Web: tapping an image opens the lightbox; arrow keys page; zoom stays between 50 and 300 percent; Escape closes.
3. Scrolling a long artifact on web and mobile leaves copy, download and close in place.
4. Mobile: Close is at least a 44 point target and the system back closes the viewer.
5. Mobile: dragging an image down closes it.
6. Chrome: Escape closes the viewer and focus returns to the image.
7. Closing any viewer leaves the chat scroll position unchanged (to verify).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The artifact toolbar requirement is satisfied by structure, not by CSS sticky [inferred].
- Video support is required by S7.17 wording.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add video playback to the viewers or change S7.17 to images only.
- [proposed] Add a test for chat scroll position after closing a viewer.
- [proposed] Decide whether CLI, VS Code and Chrome should get a report reader.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ResearchReportView | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Report view, reader toggle and full-screen portal dialog. |
| component | ImageLightbox | `apps/web/features/chat/components/ImageLightbox.tsx` | Image viewer with zoom and paging. |
| component | MessageBubble lightbox opener | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Opens ImageLightbox (line 3187). |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Panel variant with the non-scrolling toolbar row. |
| component | ArtifactsPanel | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Hosts ArtifactPreview in the right slot. |
| hook | useDialogKeyboard | `packages/ui/ui/src/primitives/useDialogKeyboard.ts` | Focus containment and Escape for dialogs. |
| screen | ReportsScreen | `apps/mobile/src/features/research/ReportsScreen.tsx` | Mobile reports list and reader. |
| component | ImageFullScreen | `apps/mobile/src/features/chat/components/ImageFullScreen.tsx` | Mobile full-screen image with gestures. |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile full-screen artifact with fixed header. |
| component | mediaViewer | `apps/extension/src/features/side-panel/mediaViewer.ts` | Chrome image viewer overlay. |
| config | Chrome viewer styles | `apps/extension/src/side_panel.ts` | .sp-media-viewer CSS (line 2553). |
| test | ImageLightbox test | `apps/web/features/chat/components/__tests__/ImageLightbox.test.tsx` | Lightbox paging and zoom. |
| test | ResearchReportView test | `apps/web/features/chat/components/research/ResearchReportView.test.tsx` | Report rendering and export. |
| test | ArtifactFullScreen viewing test | `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.viewing.test.tsx` | Mobile artifact viewer layout and Close target. |
| test | ReportsScreen test | `apps/mobile/src/features/research/__tests__/ReportsScreen.test.tsx` | Mobile report list paging and reading column. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person presses the toggle or the image; component state opens the viewer. | device | (apps/web/features/chat/components/research/ResearchReportView.tsx:442, apps/web/features/chat/components/messages/MessageBubble.tsx:3187) |
| The viewer renders in a portal or modal over the screen and locks body scroll. | device | (apps/web/features/chat/components/ImageLightbox.tsx:104) |
| Download or export actions run from the viewer; report export uses the shared export service. | device | (apps/web/features/chat/components/research/ResearchReportView.test.tsx:87) the test describes the export call; the service was not read |
| Closing unmounts the viewer and returns focus to the opener. | device | (apps/web/features/chat/components/research/ResearchReportView.tsx:240) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Downloaded image or exported report file | The user's download location | no | Not managed by the app |

**Models and providers.** Layout is model independent. Report content comes from the research feature, which may use a model and a search route (not read).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for the viewers |
| Permissions | none found in the code |
| Subscription | none found in the code for the viewers; research report creation has its own rules (SYS-subscriptions-entitlements-and-usage). |
| Limits and metering | Zoom range 50 to 300 percent on web (apps/web/features/chat/components/ImageLightbox.tsx:23). |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Viewers are device-side and work in Local mode for content that exists locally; whether Local mode can produce research reports was not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty image set | Lightbox renders nothing. | (apps/web/features/chat/components/__tests__/ImageLightbox.test.tsx:104) |
| Out-of-range index | Clamped. | (apps/web/features/chat/components/__tests__/ImageLightbox.test.tsx:98) |
| Single image | No paging controls. | (apps/web/features/chat/components/__tests__/ImageLightbox.test.tsx:38) |
| Image fails to load (mobile) | A 'Retry loading this image' control is shown. | (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:381) |
| Reports list fails (mobile) | Retry controls with the list kept. | (apps/mobile/src/features/research/__tests__/ReportsScreen.test.tsx:154) |
| Interrupted report | Shown with its honest error text. | (apps/web/features/chat/components/research/ResearchReportView.test.tsx:125) |
| Tab key in the Chrome viewer | Focus stays on the close button. | (apps/extension/src/features/side-panel/mediaViewer.ts:11) |
| Offline | not handled in the code for the viewers | Viewer files read contain no offline handling (apps/extension/src/features/side-panel/mediaViewer.ts:11) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/__tests__/ImageLightbox.test.tsx`: Plain image view, opening on the clicked image, paging forward and back with wrap, arrow keys, zoom reset on change, clamped index, empty set.
- `apps/web/features/chat/components/research/ResearchReportView.test.tsx`: Report rendering, citations, export, interrupted report; reader toggle coverage not shown by titles.
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.viewing.test.tsx`: Reading column for documents, Close as a 44 point target under the status bar, running preview and source switch, diagrams.
- `apps/mobile/src/features/research/__tests__/ReportsScreen.test.tsx`: Report paging, reading column on wide panes, retries.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.presentation.test.tsx`: Artifact preview presentation (detail not read).

**Test scenarios**

- **Report reader**
  1. Open a research report on web.
  2. Click 'Read report full screen'.
  3. Press Escape.
  - Expected: Report covers the window; Escape closes it and focus returns to the toggle.
- **Lightbox**
  1. Click an image in a message.
  2. Press plus twice, right arrow, Escape.
  - Expected: Zoom 150 percent, next image, viewer closed.
- **Artifact toolbar**
  1. Open a 200-line artifact.
  2. Scroll to the bottom.
  - Expected: Toolbar buttons remain visible.
- **Mobile image dismiss**
  1. Tap an image.
  2. Drag it down.
  - Expected: Viewer closes and the chat is where it was.
- **Chrome viewer**
  1. Click an answer image in the side panel.
  2. Press Tab then Escape.
  - Expected: Focus stays on close; Escape closes and focus returns to the image.

**Where to look when it fails**

- No log lines or error names found for these viewers.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/007-layout-systems.md](../../70-qa/test-plans/web/007-layout-systems.md)
- Desktop: [70-qa/test-plans/desktop/007-layout-systems.md](../../70-qa/test-plans/desktop/007-layout-systems.md)
- Mobile: [70-qa/test-plans/mobile/007-layout-systems.md](../../70-qa/test-plans/mobile/007-layout-systems.md)
- Chrome: [70-qa/test-plans/chrome/007-layout-systems.md](../../70-qa/test-plans/chrome/007-layout-systems.md)

## 10. Gaps and dependencies

- **No video in any viewer read.** Affects: All apps. Evidence: Viewers read handle images only. Work needed: Add or narrow the requirement.
- **No test found for the Chrome viewer.** Affects: Chrome. Evidence: apps/extension/__tests__/side-panel-media.test.ts covers video start, not the viewer. Work needed: Add a test.
- **Report reader missing on CLI, VS Code, Chrome.** Affects: Those apps. Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md). Work needed: Product decision.
- **Scroll position after closing not verified.** Affects: All with viewers. Evidence: no test found. Work needed: Add scenario tests.
- **Chrome artifact toolbar unverified.** Affects: Chrome. Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md). Work needed: Read artifactPanel.ts and test.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- SYS-files-artifacts-and-storage
- SYS-voice-and-media
- SYS-shared-ui-and-design
- file:apps/web/features/chat/components/ImageLightbox.tsx
- file:apps/web/features/chat/components/research/ResearchReportView.tsx

## Unknown

- Whether any viewer supports video.
- Whether scroll position is kept on close.
- What the reader toggle test coverage is (titles only read).
- Chrome artifact toolbar layout.
- Whether CLI, VS Code and Chrome have any report view (not searched).
