---
id: "F030-09"
type: "feature"
title: "Presenting full screen"
aliases: ["Presenting full screen", "Present", "Presentation mode", "Stop presenting", "Toggle fullscreen", "S30.26"]
area: "30 Presentation workspace"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S30.26"]
depends_on: ["surface:web", "surface:mobile", "SYS-shared-ui-and-design", "file:apps/web/features/chat/hooks/use-overlay-dialog.ts", "file:packages/ui/unified-chat/src/components/artifact-components/PresentationArtifact.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F030-09 Presenting full screen

A person shows a deck full screen, one slide at a time. On web the toolbar 'Present' button opens a full-screen overlay with keyboard and click navigation and a 'Stop presenting' button. A shared read-only viewer has its own keys and a 'Toggle fullscreen' button. Mobile has a presenting screen locked to landscape. No notes or timer.

Area: [30. Presentation workspace](README.md). Requirement items: [S30.26](../../10-requirements/capabilities/030-presentation-workspace.md#s3026).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows the deck's slides large, one at a time, so the person can present them. (apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx:771-806)

**Why it exists.** The brief wants the user to present a deck full screen, advancing slide by slide (S30.26).

**Who uses it.** Anyone who has a deck open on web or mobile.

**Problems it solves**

- Showing a deck to a room without exporting it
- Reading a deck without toolbar clutter

**Use cases**

- Click 'Present' on web and press the right arrow to move on.
- Tap the screen to advance.
- On mobile, tap 'Present', the screen turns landscape, tap Stop presenting to leave.

## 2. User experience

**Where to find it**

- Web: icon-only toolbar button with aria-label 'Present' (PresentationWorkspace.tsx:531-540).
- Web inline preview: shared viewer with 'Toggle fullscreen' (packages/ui/unified-chat/src/components/artifact-components/PresentationArtifact.tsx:172-179).
- Mobile: button with accessibilityLabel 'Present' (PresentationDeckView.tsx:526).
- Desktop (Electron): hosted web app (doc: AGENTS.md section 5). Chrome, VS Code, CLI: none found in the code.

**Before you start**

- A deck with at least one slide; with zero slides the page says 'No slides found' (PresentationWorkspace.tsx:429-435).
- The presenting button is in the non-editing toolbar (PresentationWorkspace.tsx:530-540); it is not shown while editing a slide.

**Screens and controls**

- Web overlay: dialog 'Presenting {title}'; slide fills the width up to 16:9; X button 'Stop presenting' (PresentationWorkspace.tsx:771-805).
- Keys: ArrowRight, Space, PageDown next; ArrowLeft, PageUp previous (779-786). Click anywhere advances (788).
- Shared viewer keys: ArrowLeft, ArrowRight, Home, End (PresentationArtifact.tsx:30-54); dots, previous, next, 'Toggle fullscreen'.
- Mobile: presenting modal with previous and next buttons, 'Stop presenting' (PresentationDeckView.tsx:327,332,373).

**Journey**

1. Open the deck.
2. Click or tap 'Present'.
3. The page asks the browser for full screen and locks page scroll (PresentationWorkspace.tsx:270-286).
4. Move with keys, click or the controls.
5. End with 'Stop presenting', Escape or leaving full screen.

**What the person sees and gets**

- The slide with title footer and slide numbers is drawn by SlideView (PresentationWorkspace.tsx:792).
- Mobile switches to landscape while presenting (PresentationDeckView.tsx:155).

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web overlay with focus, modal dialog semantics and Escape close through useOverlayDialog (PresentationWorkspace.tsx:267-268; apps/web/features/chat/hooks/use-overlay-dialog.ts:42-67).
- Full screen is requested; if the request fails it is ignored and the overlay still works (line 276).
- Leaving full screen sets presenting false (277-281).
- Body scroll locked while presenting and restored after (274-285).
- Navigation clamps at first and last slide (288).
- Shared PresentationArtifact: keys, dots (max 16), fullscreen toggle, 'No slides found' empty state (PresentationArtifact.tsx:13,70-80,125-180).
- Mobile: presenting modal, landscape lock, system back stops presenting (PresentationDeckView.test.tsx:156-199).

**Incomplete**

- No speaker view, notes or timer while presenting (S30.27/S30.19 belong to other features); the overlay has no such controls.

**Present but disconnected or switched off**

- Brief gives web, desktop, mobile 'n/a' style status for S30.26 while code exists on web and mobile; brief says only VS Code and Chrome are missing. Treat the brief as partly stale.

**Not available**

- VS Code and Chrome extension: no presenting view found.
- CLI: not applicable (terminal).
- Desktop Tauri: no deck viewer found.

## 4. Required behaviour

**Established requirements**

- The user can present a deck full screen, advancing slide by slide (S30.26). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S30.26)

**Acceptance criteria**

1. Clicking 'Present' on web opens a dialog named 'Presenting {title}' and requests full screen.
2. ArrowRight, Space and PageDown go forward; ArrowLeft and PageUp go back; neither goes past the ends.
3. Clicking the slide advances; clicking 'Stop presenting' does not advance.
4. Escape or leaving full screen ends presenting and page scroll returns.
5. The page behind does not scroll while presenting.
6. Mobile 'Present' shows one slide in landscape; system back ends it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Browsers that refuse full screen should still present in the overlay [inferred from line 276 ignoring the failure].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Home and End keys to the web overlay to match the shared viewer.
- [proposed] Add a speaker view with notes and timer (S30.27) before calling presenting complete.
- [proposed] Make the two web viewers share one navigation helper.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PresentationWorkspace presenting overlay | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx` | Overlay, fullscreen effect, key handling (267-286,771-806). |
| hook | useOverlayDialog | `apps/web/features/chat/hooks/use-overlay-dialog.ts` | Focus containment and Escape close. |
| component | SlideView | `apps/web/features/chat/components/artifacts/presentation/SlideView.tsx` | Draws the slide with theme. |
| component | PresentationArtifact | `packages/ui/unified-chat/src/components/artifact-components/PresentationArtifact.tsx` | Shared read-only viewer with keys and fullscreen toggle. |
| service | splitSlides | `packages/ui/unified-chat/src/lib/presentation-slides.ts` | Splits content into slides for the shared viewer. |
| component | ArtifactRenderer | `packages/ui/unified-chat/src/components/ArtifactRenderer.tsx` | Chooses PresentationArtifact for presentation artifacts. |
| component | ArtifactPreview selection | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Chooses workspace (panel) or shared viewer (inline) at lines 1952-1977. |
| component | PresentationDeckView | `apps/mobile/src/features/chat/components/artifact-viewers/presentation/PresentationDeckView.tsx` | Mobile presenting modal and controls. |
| hook | useLandscapeWhileOpen | `apps/mobile/src/shared/hooks/useLandscapeWhileOpen.ts` | Locks landscape while presenting (imported at PresentationDeckView.tsx:~36). |
| test | PresentationDeckView.test.tsx | `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PresentationDeckView.test.tsx` | Presenting tests at lines 156,179. |
| test | ArtifactComponents.test.tsx | `packages/ui/unified-chat/src/components/__tests__/ArtifactComponents.test.tsx` | Mentions PresentationArtifact (grep match); exact cases not read. |
| test | LandscapeWhileOpen.test.tsx | `apps/mobile/__tests__/LandscapeWhileOpen.test.tsx` | Landscape lock behaviour (file matched the presentation search). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Button sets presenting true; effect focuses the overlay, hides page scroll, asks the browser for full screen. | device | PresentationWorkspace.tsx:270-286 |
| Keys and clicks change the slide index in page state. | device | PresentationWorkspace.tsx:288,779-788 |
| Ending presenting restores scroll and exits full screen. | device | PresentationWorkspace.tsx:282-285 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Current slide index | React state in the page | No | Lost when the view closes |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for presenting itself; the deck must be open in an app that needs sign-in. |
| Permissions | none found in the code (read-only view works for older versions too; the Present button is outside the editable check, line 530). |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Not model related. |
| Provider restrictions | none found in the code |
| Local mode | Presenting runs fully on the device with no network call in the code read. It needs the deck content already on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No slides | Workspace shows 'No slides found'; shared viewer shows the same text with an icon | PresentationWorkspace.tsx:429-435; PresentationArtifact.tsx:70-80 |
| Full screen refused by browser | Request failure ignored; overlay still shown | PresentationWorkspace.tsx:276 |
| User exits full screen with browser key | Presenting ends | PresentationWorkspace.tsx:277-281 |
| Last or first slide | Index clamped; shared viewer disables buttons | PresentationWorkspace.tsx:288; PresentationArtifact.tsx:129,163 |
| Accessibility | Dialog role, aria-modal, aria-label; Stop button labelled; shared viewer has region and slide roles | PresentationWorkspace.tsx:775-777,801; PresentationArtifact.tsx:92-94,109-111 |
| Loading, retry, offline, timeout | not handled in the code (not needed; local only) | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PresentationDeckView.test.tsx`: Presenting full screen and stopping; Stop presenting below the status bar; system back stops presenting.
- `packages/ui/unified-chat/src/components/__tests__/ArtifactComponents.test.tsx`: Shared artifact components including the presentation viewer (cases not read).
- `packages/ui/unified-chat/src/components/__tests__/ArtifactRenderingParity.test.tsx`: Artifact rendering parity (matched the presentation search; cases not read).

**Test scenarios**

- **Present on web**
  1. Open a 5-slide deck
  2. Click 'Present'
  3. Press ArrowRight 6 times
  - Expected: Full-screen overlay; stops on slide 5; no scroll on the page behind.
- **Leave with Escape**
  1. Present
  2. Press Escape
  - Expected: Overlay closes; scroll and focus return.
- **Leave full screen with browser key**
  1. Present
  2. Exit full screen with the browser
  - Expected: Presenting ends.
- **Mobile present**
  1. Open a deck in the mobile viewer
  2. Tap 'Present'
  3. Rotate and tap next
  4. Press system back
  - Expected: Landscape single slide; back ends presenting.
- **Shared viewer**
  1. Open a deck in the inline preview
  2. Focus it and press Home, End, then use 'Toggle fullscreen'
  - Expected: Moves to first and last slide; fullscreen toggles.

**Where to look when it fails**

- No log lines; check the browser console for fullscreen errors (swallowed in code).
- data-testid 'deck-presenting' marks the web overlay (PresentationWorkspace.tsx:789).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Web presenting has no Home/End keys while the shared viewer does** Affects: Web users. Evidence: PresentationWorkspace.tsx:779-786 vs PresentationArtifact.tsx:41-48. Work needed: Share one key map.
- **No presenting view in Chrome extension, VS Code extension** Affects: Those apps. Evidence: Brief marks them missing; no code found. Work needed: Decide scope or mark not applicable.
- **No speaker view, notes or timer** Affects: Presenters on all apps. Evidence: Overlay has only the slide and Stop (PresentationWorkspace.tsx:791-804). Work needed: Build S30.27 and S30.19 features.
- **No browser-level test of presenting on web** Affects: Verification. Evidence: Presenting is not among the cases listed in PresentationWorkspace.test.tsx. Work needed: Add a component or Playwright test for fullscreen and Escape.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- SYS-shared-ui-and-design
- file:apps/web/features/chat/hooks/use-overlay-dialog.ts
- file:packages/ui/unified-chat/src/components/artifact-components/PresentationArtifact.tsx

## Unknown

- Whether the web presenting overlay has any automated test (none found in PresentationWorkspace.test.tsx case list).
- Whether the Electron desktop allows requestFullscreen inside its window (not run).
- What exact cases ArtifactComponents.test.tsx runs for the presentation viewer.
