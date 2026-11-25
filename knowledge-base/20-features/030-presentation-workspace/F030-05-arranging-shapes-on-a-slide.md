---
id: "F030-05"
type: "feature"
title: "Arranging shapes on a slide"
aliases: ["Shapes on a slide", "Shape bar", "Shape label", "Align, group, layer (S30.15-S30.17)"]
area: "30 Presentation workspace"
available_on: ["web"]
implementation: {web: "partial", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S30.15", "S30.16", "S30.17"]
depends_on: ["surface:web", "file:apps/web/features/chat/components/artifacts/presentation/SlideShapes.tsx", "file:apps/web/features/chat/components/artifacts/presentation/deck-shapes.ts", "SYS-files-artifacts-and-storage", "F030-04", "F030-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F030-05 Arranging shapes on a slide

Today the web deck editor lets a person add one of six shapes, drag it or nudge it with arrow keys, label it and remove it. There are no align, group or layer-order controls; stacking follows the order shapes were added. Mobile has no shape editing.

Area: [30. Presentation workspace](README.md). Requirement items: [S30.15](../../10-requirements/capabilities/030-presentation-workspace.md#s3015), [S30.16](../../10-requirements/capabilities/030-presentation-workspace.md#s3016), [S30.17](../../10-requirements/capabilities/030-presentation-workspace.md#s3017).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Provides basic shape placement and movement on a slide. The brief items for arranging them (align, group, layer) are not built.

**Why it exists.** S30.15 to S30.17 ask for aligning, grouping and changing stacking order of slide elements.

**Who uses it.** People drawing simple diagrams on web decks.

**Problems it solves**

- Drawing boxes and arrows by hand
- Moving a shape to a position on the slide
- (Not solved) lining up several shapes

**Use cases**

- Add a rectangle, type a label, drag it
- Add an arrow and nudge it with the keyboard
- Delete a stray shape with Delete or Remove shape

## 2. User experience

**Where to find it**

- Web: in edit mode the toolbar 'Shape' menu (testid deck-shapes-menu), or Insert menu 'Shapes' group with Rectangle, Rounded rectangle, Oval, Diamond, Line, Arrow (PresentationWorkspace.tsx:352-362,447-455)
- Other apps: none found

**Before you start**

- Latest editable version

**Screens and controls**

- Shapes drawn over the slide as SVG; each is a focusable button with label such as 'Rectangle: text' (SlideShapes.tsx:~163)
- Shape bar below the slide: '<Kind> label' text field, hint 'Drag or use arrow keys to move', 'Remove shape' (PresentationWorkspace.tsx:638-668)
- Keyboard: arrows move by 1 percent; Shift 5 percent; Delete or Backspace removes (SlideShapes.tsx:130-155)

**Journey**

1. Insert a shape (selects it and enters edit mode)
2. Drag it or use arrows
3. Type a label
4. Press Done to save

**What the person sees and gets**

- Dashed selection outline
- Shape saved in a fenced shapes block on Done

**Settings**

- None found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Add shape of six kinds with staggered start position (deck-shapes.ts:81-96)
- Drag by pointer and keyboard nudge, clamp 0-100 percent (SlideShapes.tsx:100-155)
- Label up to 200 characters; line and arrow have no label text drawn (SlideShapes.tsx:~215)
- Limit 40 shapes per slide on read (deck-shapes.ts:23,48)
- Shapes use theme surface and accent colours
- Invalid shape JSON gives no shapes; other fields clamped (deck-model.test.ts:53)

**Incomplete**

- No resize handles: width and height fixed at 25 percent on creation [inferred: no resize code in SlideShapes.tsx]
- One shapes block per slide; only the first shapes block is used (deck-model.ts:145-155)

**Present but disconnected or switched off**

- Insert menu 'Shapes' items also work outside edit mode: addShape starts an edit session if none (PresentationWorkspace.tsx:210-223)

**Not available**

- Alignment (S30.15), grouping (S30.16), layer ordering (S30.17): not found on any app
- Mobile, desktop Tauri, Chrome, VS Code, CLI: no shapes editing (mobile renders shapes? not found in PresentationDeckView.tsx, which renders Markdown through renderMarkdown only)

## 4. Required behaviour

**Established requirements**

- The user can align elements on a slide. (source: brief S30.15)
- The user can group and ungroup slide elements. (source: brief S30.16)
- The user can change stacking order of slide elements. (source: brief S30.17)
- Shape or diagram elements can be added. (source: brief S30.14)

**Acceptance criteria**

1. Adding a shape selects it and shows the shape bar
2. Arrow keys move the selected shape; Shift moves 5 times as far
3. Typing in the label updates the shape text
4. Remove shape deletes it and clears selection
5. Shapes never leave 0-100 percent of the slide
6. Cancel discards added shapes
7. Align, group and layer controls exist (currently fail)

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Layering today equals array order inside the block [inferred from SlideShapes map order]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Bring forward/send back commands that reorder the array
- [proposed] Align menu for multi-select

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | deck-shapes | `apps/web/features/chat/components/artifacts/presentation/deck-shapes.ts` | Shape kinds, parse, serialize, new shape |
| component | SlideShapes | `apps/web/features/chat/components/artifacts/presentation/SlideShapes.tsx` | SVG drawing, pointer and keyboard movement |
| component | PresentationWorkspace shapes wiring | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx` | addShape, updateShapes, shape bar |
| service | replaceShapesBlock / shapesSource | `packages/ui/unified-chat/src/lib/deck-model.ts` | Read and write the shapes fence |
| component | SlideView | `apps/web/features/chat/components/artifacts/presentation/SlideView.tsx` | Renders non-editable shapes |
| config | Deck.module.css | `apps/web/features/chat/components/artifacts/presentation/Deck.module.css` | Shape layer styles |
| service | deck-pdf shapes | `apps/web/features/chat/components/artifacts/presentation/deck-pdf.ts` | Draws shapes into the PDF (imports parseShapes) |
| service | deck-html shapes | `apps/web/features/chat/components/artifacts/presentation/deck-html.ts` | Exports slides with shapes |
| test | PresentationWorkspace.test | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx` | Add shape, keyboard move, save on Done (lines 97-112) |
| test | deck-model.test (web) | `apps/web/features/chat/components/artifacts/presentation/deck-model.test.ts` | One shapes block, all kinds, malformed input (lines 30-60) |
| test | deck-export.test | `apps/web/features/chat/components/artifacts/presentation/deck-export.test.ts` | Exports (shape coverage not confirmed) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Shape added to a draft slide's shapes fence | device | PresentationWorkspace.tsx:210-223 |
| Pointer or key events change x, y in the draft | device | SlideShapes.tsx:100-155 |
| Done writes the slide to the deck | device | PresentationWorkspace.tsx:185-191 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Shapes JSON in a fenced block (id, kind, x, y, w, h, text) | In the slide Markdown inside the artifact | unknown | Versioned |

**Models and providers.** None for manual arranging. The assistant may write a shapes block [inferred; not traced].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | Editable latest version only |
| Subscription | none found in the code |
| Limits and metering | 40 shapes per slide; text 200 characters |
| Feature flags | none found in the code |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code |
| Local mode | Fully on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Malformed shapes JSON | Treated as no shapes | deck-shapes.ts:36-42 |
| More than 40 shapes | Extra shapes dropped on read | deck-shapes.ts:48 |
| Pointer drag outside slide | Position clamped | SlideShapes.tsx:102-104 |
| Touch devices | Pointer events used; no dedicated touch handling beyond that found | SlideShapes.tsx |
| Undo of a single shape move | not handled in the code; Cancel discards the whole edit | PresentationWorkspace.tsx:192 |
| Screen readers | Shapes are buttons with aria-pressed and a label when editable; hidden otherwise | SlideShapes.tsx:~163,207 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx`: Add shape, move with keyboard, save on Done
- `apps/web/features/chat/components/artifacts/presentation/deck-model.test.ts`: Shape parse, clamp, round trip

**Test scenarios**

- **Add and move**
  1. Edit mode, Shape, Rectangle
  2. Press ArrowRight 3 times
  - Expected: x increases by 3 percent
- **Label**
  1. Type 'Start' in the label field
  - Expected: Shape shows Start
- **Remove**
  1. Press Delete on the selected shape
  - Expected: Shape removed; selection cleared
- **Clamp**
  1. Drag a shape past the edge
  - Expected: Stays within slide
- **Missing arrange tools**
  1. Add two shapes and look for align, group, layer
  - Expected: Not present (current behaviour)

**Where to look when it fails**

- Inspect ```shapes fence JSON in artifact content
- Not run: no recorded results

**Hands-on test plans**

- Web: [70-qa/test-plans/web/030-presentation-workspace.md](../../70-qa/test-plans/web/030-presentation-workspace.md)

## 10. Gaps and dependencies

- **No alignment** Affects: Web. Evidence: no code. Work needed: Multi-select and align commands
- **No grouping** Affects: Web. Evidence: no code. Work needed: Group model in shapes JSON
- **No layer order control** Affects: Web. Evidence: order = array order only. Work needed: Reorder commands
- **No resize** Affects: Web. Evidence: SlideShapes.tsx has no resize. Work needed: Handles
- **All other apps** Affects: Mobile etc.. Evidence: no code. Work needed: Decision
- Not built on: Desktop, Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- file:apps/web/features/chat/components/artifacts/presentation/SlideShapes.tsx
- file:apps/web/features/chat/components/artifacts/presentation/deck-shapes.ts
- SYS-files-artifacts-and-storage
- F030-04
- F030-02

## Unknown

- Whether mobile renders shapes at all
- Whether PDF and HTML exports draw shapes correctly (code imports parseShapes; test coverage for shapes not confirmed)
- Whether any design for align, group or layer exists outside the brief
