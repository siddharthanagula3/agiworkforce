---
id: "F030-06"
type: "feature"
title: "Speaker notes and speaker view"
aliases: ["Slide notes", "Presenter notes", "Speaker view", "Presentation mode", "S30.18", "S30.19", "S30.27"]
area: "30 Presentation workspace"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S30.18", "S30.19", "S30.27"]
depends_on: ["surface:web", "surface:mobile", "file:packages/ui/unified-chat/src/lib/deck-model.ts", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "F030-01", "F030-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F030-06 Speaker notes and speaker view

Not built. No slide has a notes field and no presenter or speaker view with notes, next slide or timer exists on any app. What does exist is a plain presenting mode on web and mobile that shows one slide full screen and advances it.

Area: [30. Presentation workspace](README.md). Requirement items: [S30.18](../../10-requirements/capabilities/030-presentation-workspace.md#s3018), [S30.19](../../10-requirements/capabilities/030-presentation-workspace.md#s3019), [S30.27](../../10-requirements/capabilities/030-presentation-workspace.md#s3027).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would give each slide private notes and show them to the presenter next to the next slide and a timer. Today only the plain presenting mode exists.

**Why it exists.** Briefs S30.18, S30.19 and S30.27 require notes that can be viewed and edited, presenter notes while presenting, and a speaker view.

**Who uses it.** People giving a talk from a deck.

**Problems it solves**

- (Not solved yet) remembering what to say per slide
- (Not solved yet) seeing the next slide while presenting

**Use cases**

- Presenter reads notes on a second screen
- Assistant writes speaker notes for each slide
- A rehearsal timer

## 2. User experience

**Where to find it**

- Web: toolbar 'Present' button (play icon) starts full-screen presenting (PresentationWorkspace.tsx:~551-560, 770-810); shows only the slide
- Mobile: 'Present' button; landscape-while-open; 'Stop presenting' and counter (PresentationDeckView.tsx:125-127,280-380)
- Notes and speaker view: none on any app

**Before you start**

- A deck with at least one slide

**Screens and controls**

- Web presenting dialog: slide at 16:9, click or Right/Space/PageDown next, Left/PageUp previous, 'Stop presenting' button, Escape closes via overlay hook
- Mobile presenting: left/right tap zones, swipe, 'Previous slide', 'Next slide', 'Stop presenting', counter 'N / total'

**Journey**

1. Open deck
2. Press Present
3. Advance with keys, taps or swipes
4. Stop presenting

**What the person sees and gets**

- Full-screen slide; dialog named 'Presenting <title>'
- No notes shown

**Settings**

- None found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web present mode: dialog, requests browser fullscreen, hides page scroll, keyboard and click navigation, leaves when fullscreen ends (PresentationWorkspace.tsx:259-286,770-808)
- Mobile present mode with landscape lock while open and gestures (PresentationDeckView.tsx:161,294-347)

**Incomplete**

- Present mode is not in the three brief items but is the nearest feature; speaker view (S30.27) shows no next slide or timer

**Present but disconnected or switched off**

- nothing found

**Not available**

- Slide notes (S30.18): no notes field in the deck format; parseDeck keeps only meta and slide text (deck-model.ts:8-25); search for 'notes' and 'speaker' in the presentation code found nothing
- Presenter notes (S30.19) and speaker view (S30.27): not found on any app
- Desktop, Chrome, VS Code, CLI: no presenting code found

## 4. Required behaviour

**Established requirements**

- Each slide can carry notes the user can view and edit. (source: brief S30.18)
- While presenting, the presenter sees each slide's notes. (source: brief S30.19)
- While presenting, a speaker view shows notes, next slide and timer. (source: brief S30.27)

**Acceptance criteria**

1. A notes field exists per slide and survives save and reload
2. Notes are not drawn on the slide or in the audience view
3. Presenter view shows notes, next slide and elapsed time
4. Notes are included or deliberately left out of exports, and the choice is documented
5. Mobile and web both show notes when presenting
6. Current present mode still works without notes

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Notes need a place in the deck Markdown, such as a fenced block or a comment line, so the format stays one text file [inferred]
- Exports must not leak notes unless chosen [inferred; privacy rule AGENTS.md section 6 spirit]

**Proposed improvements** (suggestions, not requirements)

- [proposed] ```notes fence handled like other visual blocks
- [proposed] Second-window speaker view on web using a separate window
- [proposed] Assistant writes notes when asked

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PresentationWorkspace presenting dialog | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx` | Current web present mode |
| hook | useOverlayDialog | apps/web/features/chat/hooks/use-overlay-dialog (not found) (not found) | Escape and focus handling for the present dialog |
| component | PresentationDeckView presenting modal | `apps/mobile/src/features/chat/components/artifact-viewers/presentation/PresentationDeckView.tsx` | Current mobile present mode |
| hook | useLandscapeWhileOpen | apps/mobile/src/shared/hooks/useLandscapeWhileOpen (not found) (not found) | Rotates to landscape while presenting |
| service | parseDeck / slideSegments | `packages/ui/unified-chat/src/lib/deck-model.ts` | Deck format with no notes field; VisualKind lists chart, mermaid, shapes, kpi, insights only (line 80) |
| component | PresentationArtifact | `packages/ui/unified-chat/src/components/artifact-components/PresentationArtifact.tsx` | Read-only viewer with fullscreen toggle; no notes |
| service | deck-request | `packages/ui/unified-chat/src/lib/deck-request.ts` | Builds assistant edit requests; has no notes instruction |
| service | deck-html export | `apps/web/features/chat/components/artifacts/presentation/deck-html.ts` | Export would need to decide about notes |
| service | deck-pdf export | `apps/web/features/chat/components/artifacts/presentation/deck-pdf.ts` | Same |
| test | PresentationWorkspace.test | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx` | Present mode keyboard test (lines 225-235) |
| test | PresentationDeckView.test | `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PresentationDeckView.test.tsx` | Present full screen, stop, back (lines 156-198) |
| test | ArtifactComponents.test | `packages/ui/unified-chat/src/components/__tests__/ArtifactComponents.test.tsx` | Shared presentation artifact |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Present sets a flag; the web dialog requests browser fullscreen | device | PresentationWorkspace.tsx:270-286 |
| Key or tap changes the current index | device | PresentationWorkspace.tsx:778-788 |
| Notes: no step exists | device | no code found |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Notes | Not stored; no notes data exists | No | Not applicable |

**Models and providers.** None today. Assistant-written notes would use whichever model is selected [proposed].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | Present is available on read-only versions too (PresentationWorkspace.test.tsx:225-235) |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code |
| Local mode | Present mode runs on the device without network. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Fullscreen refused by browser | Ignored; dialog still shows | PresentationWorkspace.tsx:277 catch |
| User exits fullscreen with Escape | Presenting ends | PresentationWorkspace.tsx:279-281 |
| Mobile system back | Stops presenting | PresentationDeckView.test.tsx:179 |
| Notes, timer, second screen | not handled in the code | searched |
| Accessibility | Dialog has aria-modal and label; Stop control 44 px | PresentationWorkspace.tsx:~790-808 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx`: Present mode keyboard navigation and Escape
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PresentationDeckView.test.tsx`: Present, stop, system back

**Test scenarios**

- **Present on web**
  1. Click Present
  2. Press Right then Escape
  - Expected: Slide 2 of N shown; presenting closes
- **Present on mobile**
  1. Tap Present
  2. Tap right half
  - Expected: Next slide; counter updates
- **Notes absent**
  1. Look for notes field in editor and present mode
  - Expected: None (current behaviour)
- **Future: notes round trip**
  1. Add notes to slide 2
  2. Reload
  - Expected: Notes remain (to be built)
- **Future: audience view hides notes**
  1. Present with notes
  - Expected: Audience view shows no notes (to be built)

**Where to look when it fails**

- No notes data to inspect
- Not run: no recorded results

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No slide notes** Affects: All apps. Evidence: deck-model.ts has no notes concept. Work needed: Format, editor, storage
- **No presenter notes** Affects: Web, mobile. Evidence: present dialogs show only slide. Work needed: Presenter UI
- **No speaker view with next slide and timer** Affects: Web. Evidence: no code. Work needed: Second window or split layout
- **No presenting on Chrome, VS Code, desktop Tauri, CLI** Affects: those apps. Evidence: grep. Work needed: Brief marks Chrome and VS Code missing for S30.26
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- file:packages/ui/unified-chat/src/lib/deck-model.ts
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- F030-01
- F030-04

## Unknown

- Whether any design exists for notes outside the brief
- How notes should behave in exports and shared viewers
- Whether Electron desktop presents through the web dialog (inferred only)
