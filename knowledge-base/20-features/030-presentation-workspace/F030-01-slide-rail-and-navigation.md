---
id: "F030-01"
type: "feature"
title: "Slide rail and navigation"
aliases: ["Slide rail", "Slide thumbnails", "deck-thumbnails", "Slides nav", "Slide thumbnail rail (S30.02)", "Go to slide dots (mobile)"]
area: "30 Presentation workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "n/a", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S30.02"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "file:apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx", "file:packages/ui/unified-chat/src/lib/deck-model.ts", "SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage", "F030-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F030-01 Slide rail and navigation

Lets a person see every slide of a deck and jump to any one. Web shows a row of small slide previews under the main slide with previous and next arrows. Mobile shows a counter, arrows and a row of dots, not previews. Empty decks say 'No slides found'.

Area: [30. Presentation workspace](README.md). Requirement items: [S30.02](../../10-requirements/capabilities/030-presentation-workspace.md#s3002).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows all slides of an open presentation in order, marks the current slide, and moves to another slide on a click or tap. On web each entry is a real miniature of the slide. On mobile each entry is a dot.

**Why it exists.** A deck is only useful if the person can find and open any slide quickly. The brief item S30.02 asks for a rail of thumbnails where selecting one opens it (brief: S30.02).

**Who uses it.** Anyone who opens a presentation made by the assistant or by themselves in the AGI Workforce web app or the mobile app.

**Problems it solves**

- Finding one slide in a long deck without paging through all of them
- Seeing the shape and order of the whole deck at a glance (web)
- Knowing which slide you are on and how many there are

**Use cases**

- A user opens a 10-slide pitch deck in the web artifact panel and clicks the 7th thumbnail to check the pricing slide
- A user on a phone swipes or taps a dot to jump to slide 3
- A reviewer opens an empty deck artifact and sees 'No slides found'

## 2. User experience

**Where to find it**

- Web: the artifact panel for a presentation artifact; the rail is a nav labelled 'Slides' below the main slide (apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx:717)
- Mobile: the deck viewer in the artifact full-screen view; controls under the slide (apps/mobile/src/features/chat/components/artifact-viewers/presentation/PresentationDeckView.tsx:425-500)
- Desktop (Electron public build): shows the hosted web app, so it gets the web rail [inferred from AGENTS.md section 5, doc: AGENTS.md]
- Chrome extension, VS Code extension, CLI: no deck viewer with a rail found in the code (searched apps/extension/src, apps/extension-vscode/src, apps/cli/src for 'slide'; no presentation code)

**Before you start**

- A presentation artifact exists (Markdown deck, optionally starting with a <!-- deck ... --> line)
- Web: the panel variant of the artifact preview; the compact card variant uses the simpler shared viewer (ArtifactPreview.tsx:1952-1976)

**Screens and controls**

- Web: round 'Previous slide' and 'Next slide' buttons at each end of the rail; a scrolling list of thumbnails, each a button named 'Slide N: <title>' (PresentationWorkspace.tsx:717-770)
- Web: current thumbnail has aria-current and an accent border (PresentationWorkspace.tsx:736-742)
- Mobile: 'Previous slide' and 'Next slide' buttons, a live 'N / total' counter, and one 'Go to slide N' dot button per slide (PresentationDeckView.tsx:425-500)
- Mobile: swiping the slide list also moves between slides (PresentationDeckView.tsx:349-356)

**Journey**

1. Open a presentation artifact
2. Web: look at the thumbnails under the slide; click one, or use the arrows
3. Mobile: tap an arrow, tap a dot, or swipe the slide
4. The main slide changes and the current marker moves

**What the person sees and gets**

- Web: the clicked thumbnail gets the accent border and aria-current='true'
- Web: main slide has accessible name 'Slide N of M' (SlideView.tsx:123)
- Mobile: counter text 'N / total' announced politely (PresentationDeckView.tsx:~440)
- Empty deck: text 'No slides found' on web (PresentationWorkspace.tsx:429-435) and on mobile with a presentation icon (PresentationDeckView.tsx:391-400)

**Settings**

- None found in the code for the rail itself
- The thumbnails use the deck theme chosen in F030-03

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: one thumbnail per slide, the current one marked, click moves to it (PresentationWorkspace.tsx:729-757)
- Web: previous disabled on slide 1, next disabled on the last (PresentationWorkspace.tsx:721,761)
- Web: thumbnail label is the slide's first heading with markup characters stripped, else the first non-empty line, else 'Slide N' (packages/ui/unified-chat/src/lib/deck-model.ts:72-78)
- Web: thumbnails render charts and diagrams as grey placeholders, shapes as real shapes (SlideView.tsx:132-136)
- Mobile: previous/next disabled at ends, dot per slide, counter, swipe sync (PresentationDeckView.tsx:429-500)
- Empty deck message on web and mobile

**Incomplete**

- Mobile has no thumbnail previews, only dots; the brief asks for a rail of thumbnails (brief: S30.02)
- Mobile dots have no slide title; accessibility label is 'Go to slide N' only (PresentationDeckView.tsx:~483)
- Rail has no drag-to-reorder

**Present but disconnected or switched off**

- Web thumbnails and arrows are disabled while a slide is being edited (PresentationWorkspace.tsx:721,733,761)
- The compact (non-panel) web card uses PresentationArtifact, a separate read-only viewer with its own dots and arrows, not this rail (ArtifactPreview.tsx:1976; packages/ui/unified-chat/src/components/artifact-components/PresentationArtifact.tsx)

**Not available**

- Chrome extension, VS Code extension, CLI: no slide rail found
- Desktop Tauri build: no deck viewer found in apps/desktop/src (grep for slide returned only unrelated files); public Electron desktop shows hosted web (doc: AGENTS.md)

## 4. Required behaviour

**Established requirements**

- A rail of slide thumbnails shows every slide and selecting one opens it. (source: brief S30.02)
- Empty deck shows 'No slides found'; previous disabled on first slide, next on last. (source: PresentationWorkspace.tsx:429,721,761 (current code); task draft)

**Acceptance criteria**

1. A 3-slide deck shows 3 thumbnail buttons; the first has aria-current
2. Clicking thumbnail 2 makes the main slide 'Slide 2 of 3'
3. Previous is disabled on slide 1; next is disabled on the last slide
4. A slide with no heading and no text is labelled 'Slide N'
5. An empty deck shows 'No slides found'
6. During text editing the thumbnails and arrows are disabled
7. Mobile: tapping dot N shows slide N and the counter reads 'N / total'

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every app that shows decks should offer a rail or equivalent; only web and mobile do today [inferred]
- Mobile should show thumbnails like web to meet S30.02 [inferred from brief]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add miniature previews or titles to the mobile dots
- [proposed] Show the same rail in the compact web card

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PresentationWorkspace | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx` | Web workspace; renders main slide, rail nav, arrows |
| component | SlideView (thumbnail mode) | `apps/web/features/chat/components/artifacts/presentation/SlideView.tsx` | Draws a slide; thumbnail prop hides footer and swaps charts for placeholders |
| service | slideTitle | `packages/ui/unified-chat/src/lib/deck-model.ts` | Computes the thumbnail label |
| service | parseDeck / splitSlides | `packages/ui/unified-chat/src/lib/presentation-slides.ts` | Splits Markdown into slides on --- lines or on # / ## headings |
| config | Deck.module.css | `apps/web/features/chat/components/artifacts/presentation/Deck.module.css` | Slide and thumbnail styling |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Chooses PresentationWorkspace for the panel and PresentationArtifact for cards (lines 1952-1976) |
| component | PresentationArtifact | `packages/ui/unified-chat/src/components/artifact-components/PresentationArtifact.tsx` | Read-only shared viewer with arrows, dots and keyboard; used by cards and the shared renderer |
| component | PresentationDeckView | `apps/mobile/src/features/chat/components/artifact-viewers/presentation/PresentationDeckView.tsx` | Mobile deck viewer with counter, arrows, dots and swipe list |
| component | ArtifactViewer | `apps/mobile/src/features/chat/components/artifact-viewers/ArtifactViewer.tsx` | Routes a deck artifact to PresentationDeckView (line 46-56) |
| service | isDeckArtifact | `apps/mobile/src/features/chat/components/artifact-viewers/presentation/deckContent.ts` | Detects a Markdown deck on mobile |
| test | PresentationWorkspace.test | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx` | Thumbnail count, aria-current and accessible name |
| test | PresentationDeckView.test | `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PresentationDeckView.test.tsx` | Mobile navigation, dots, swipe, empty deck |
| test | SlideView.test | `apps/web/features/chat/components/artifacts/presentation/SlideView.test.tsx` | Thumbnail hides kpi and insights content |
| test | deck-model.test (shared) | `packages/ui/unified-chat/src/lib/deck-model.test.ts` | slideTitle naming and slide splitting |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Artifact content text is parsed into a deck (meta line plus slide strings) | device | PresentationWorkspace.tsx:~118 useMemo(parseDeck); deck-model.ts:13-25 |
| Each slide string is drawn as a thumbnail; a click sets the current index in React state | device | PresentationWorkspace.tsx:288,729-757 |
| Mobile: tap, arrow or swipe sets the current index and scrolls the list | device | PresentationDeckView.tsx:163-170,349-356 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Current slide index | Component state only | No | Lost when the viewer closes |

**Models and providers.** None. Navigation never calls a model or provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account check found in the presentation files read. Access to the artifact itself follows the chat/artifact rules (SYS-authentication-and-identity). |
| Permissions | The rail is shown for read-only versions too; only editing controls are hidden (PresentationWorkspace.test.tsx:225-235) |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Not applicable; no model is called. |
| Provider restrictions | none found in the code |
| Local mode | Works fully on the device with no network: parsing and drawing are local. No Local-mode rule found in these files. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty deck | 'No slides found' on web and mobile | PresentationWorkspace.tsx:429; PresentationDeckView.tsx:391-400 |
| Current index beyond deck length after delete | Clamped to last slide | PresentationWorkspace.tsx:~120 current = Math.min(index, total-1) |
| Editing a slide | Thumbnails and arrows disabled | PresentationWorkspace.tsx:721,733,761 |
| Slide with no text | Label 'Slide N' | deck-model.ts:77 |
| Loading, retry, offline, timeout | not handled in the code (no network) | searched presentation files |
| Accessibility | Web thumbnails have aria-label and aria-current; mobile dots have accessibilityState selected | PresentationWorkspace.tsx:736; PresentationDeckView.tsx:~480 |
| Orientation change on mobile | Scroll offset re-aligned to current slide | PresentationDeckView.tsx:288-292 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx`: Thumbnail per slide, aria-current, accessible name, read-only mode keyboard navigation in presenting
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PresentationDeckView.test.tsx`: Previous/next, go to slide, stop at last, swipe, empty deck
- `packages/ui/unified-chat/src/lib/deck-model.test.ts`: slideTitle naming
- `apps/web/features/chat/components/artifacts/presentation/SlideView.test.tsx`: Thumbnail content rules

**Test scenarios**

- **Open any slide on web**
  1. Open a 3-slide deck in the artifact panel
  2. Click the second thumbnail
  - Expected: Main slide reads 'Slide 2 of 3'; second thumbnail has the accent border
- **Ends of the deck**
  1. Open slide 1
  2. Check Previous
  3. Go to the last slide and check Next
  - Expected: Previous disabled on 1; Next disabled on last
- **No-heading slide label**
  1. Create a deck with a slide of only '---' neighbours and blank text
  2. Read the thumbnail name
  - Expected: Name is 'Slide N'
- **Empty deck**
  1. Open a presentation artifact with no content
  - Expected: 'No slides found'
- **Mobile dots**
  1. Open a deck on a phone
  2. Tap the 4th dot
  - Expected: Slide 4 shown and counter '4 / total'

**Where to look when it fails**

- No log lines found in these files
- If a thumbnail is blank check SlideView markdown render; if the label is wrong check slideTitle
- Not run: no test results are recorded in the repository for these tests

**Hands-on test plans**

- Web: [70-qa/test-plans/web/030-presentation-workspace.md](../../70-qa/test-plans/web/030-presentation-workspace.md)
- Desktop: [70-qa/test-plans/desktop/030-presentation-workspace.md](../../70-qa/test-plans/desktop/030-presentation-workspace.md)
- Mobile: [70-qa/test-plans/mobile/030-presentation-workspace.md](../../70-qa/test-plans/mobile/030-presentation-workspace.md)

## 10. Gaps and dependencies

- **Mobile has no thumbnail previews** Affects: Mobile users. Evidence: PresentationDeckView.tsx:468-500 uses dots. Work needed: Add thumbnail strip or titles
- **No rail on Chrome, VS Code, CLI; no deck viewer found on Tauri desktop** Affects: those apps. Evidence: grep of app sources. Work needed: Decide whether those apps show decks; reuse unified-chat viewer
- **Compact web card has no thumbnail rail** Affects: Web chat cards. Evidence: ArtifactPreview.tsx:1976. Work needed: Optional
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- file:apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx
- file:packages/ui/unified-chat/src/lib/deck-model.ts
- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage
- F030-03

## Unknown

- Whether Electron desktop mounts the same web ArtifactPreview (relies on AGENTS.md statement, not traced in code)
- Whether Tauri desktop renders decks at all
- Whether the Chrome side panel renders deck artifacts (extension exports PPTX per brief, but no viewer found)
