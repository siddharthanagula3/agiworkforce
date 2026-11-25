---
id: "F030-04"
type: "feature"
title: "Slide content editing and layout"
aliases: ["Edit slide", "SlideTextEditor", "Insert menu", "Chart data editor", "Edit chart data", "Image placement", "Table placement", "Shape and diagram elements", "Slide layout selection", "S30.07", "S30.10-S30.14"]
area: "30 Presentation workspace"
available_on: ["web", "mobile"]
implementation: {web: "partial", desktop: "missing", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S30.07", "S30.10", "S30.11", "S30.12", "S30.13", "S30.14"]
depends_on: ["surface:web", "surface:mobile", "file:apps/web/features/chat/components/artifacts/presentation/SlideTextEditor.tsx", "file:packages/ui/unified-chat/src/lib/deck-model.ts", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "F030-02", "F030-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F030-04 Slide content editing and layout

Edits what is on a slide. On web, 'Edit slide' opens an in-place text editor; Done saves, Cancel discards. The Insert menu adds an image, table, chart, diagram or shape. Charts have a data grid. Mobile edits plain slide text from its action sheet. There is no layout picker.

Area: [30. Presentation workspace](README.md). Requirement items: [S30.07](../../10-requirements/capabilities/030-presentation-workspace.md#s3007), [S30.10](../../10-requirements/capabilities/030-presentation-workspace.md#s3010), [S30.11](../../10-requirements/capabilities/030-presentation-workspace.md#s3011), [S30.12](../../10-requirements/capabilities/030-presentation-workspace.md#s3012), [S30.13](../../10-requirements/capabilities/030-presentation-workspace.md#s3013), [S30.14](../../10-requirements/capabilities/030-presentation-workspace.md#s3014).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person change slide text and place images, tables, charts, diagrams and shapes without asking the assistant. Everything is saved as Markdown in the deck.

**Why it exists.** Briefs S30.10 to S30.14 require direct text editing and placing images, charts, tables and shapes; S30.07 wants layout selection.

**Who uses it.** People polishing a deck on web or mobile.

**Problems it solves**

- Fixing a typo without a new assistant turn
- Adding a picture or a chart by hand
- Correcting chart numbers

**Use cases**

- Edit a bullet on slide 3 and press Done
- Insert a table and fill it in
- Add a bar chart then edit its values in the grid
- Place a company logo image
- On mobile, edit a slide's text and keep its diagram

## 2. User experience

**Where to find it**

- Web: toolbar 'Edit slide' (pencil) (PresentationWorkspace.tsx:~462); 'Insert' menu with items Image, Table, Chart, Diagram and a 'Shapes' group (lines 327-362)
- Web chart: button 'Edit chart data' (or 'Edit chart data N') under the slide when a chart exists (lines 668-690)
- Mobile: 'Slide N actions' then 'Edit slide' opens a full-screen text editor with 'Cancel editing' and 'Save the slide' (PresentationDeckView.tsx:196-260)
- Other apps: none found

**Before you start**

- Latest editable version
- Image: PNG, JPEG, GIF or WebP
- Mobile: onSave present

**Screens and controls**

- Web edit mode toolbar: 'Shape' menu, 'Cancel', 'Done'; a formatting toolbar and rich editor over the slide, or a Markdown source editor if the slide cannot round-trip (SlideTextEditor.tsx:80-106)
- Shape bar with label field, 'Remove shape' (F030-05)
- ChartDataEditor: chart type select (Bar, Line, Pie), Title, grid, add/remove, Apply, Remove, Cancel
- Hidden file input for images (accept png, jpeg, gif, webp)
- Mobile: multiline text input; discard prompt 'Discard your edits?'

**Journey**

1. Web text: click Edit slide, type, press Done (saves) or Cancel (discards)
2. Web insert: Insert, pick Table or Chart or Diagram; the starter block is appended to the slide and saved immediately
3. Web image: Insert, Image, choose file; it is resized and embedded; toast 'Image placed on the slide'
4. Web chart: click Edit chart data, change cells, Apply
5. Mobile: actions, Edit slide, change text, Save

**What the person sees and gets**

- Toast 'Image placed on the slide' on success; errors: 'That image could not be read.', 'Choose a PNG, JPEG, GIF or WebP image.', 'SVG files cannot be placed on a slide. Use PNG, JPEG, GIF or WebP.', 'This browser cannot resize the image.', 'That image is too large to place. Try a smaller one.' (image-embed.ts:7-13)
- Slide re-renders with the block
- New version saved

**Settings**

- Image size caps: longest edge 1600 px, up to 600,000 characters of data URL (image-embed.ts:1-3)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web text editing keeps the draft until Done; Cancel drops it (PresentationWorkspace.tsx:185-196)
- Visual blocks (chart, mermaid, shapes, kpi, insights) are separated from text during editing and put back after (deck-model.ts:157-172)
- Table inserts a 3-column Markdown table (lines 69-74); Chart appends a starter bar chart fence; Diagram appends a flowchart in a mermaid fence (lines 76-81, 327-362)
- Image becomes a data URL inside Markdown image syntax, resized to fit caps (image-embed.ts:40-72)
- Chart data editor edits rows and keeps axis labels, colours, legend, donut (chart-block.ts; chart-block.test.ts)
- Six shape kinds: rectangle, rounded rectangle, oval, diamond, line, arrow, stored in a fenced shapes block, max 40 shapes (deck-shapes.ts:1-23)
- Mobile edits slide text only, keeps visuals, asks before discarding (PresentationDeckView.tsx:258-280)
- Remote images need a click 'Load image' before loading (SlideView.tsx:43-66)

**Incomplete**

- Insert Image/Table/Chart/Diagram save immediately and appear at the end of the slide, with no position choice (appendToSlide)
- Mobile cannot insert images, tables, charts or shapes; only text; brief draft said AI rewrite only, but a text editor exists
- SVG images refused
- Image stored inline makes the deck text large [inferred]

**Present but disconnected or switched off**

- Edit chart data buttons shown only when not editing and chart is editable; if the chart JSON cannot be parsed the editor does not open (readEditableChart returns null, line ~420)

**Not available**

- Layout selection (S30.07): no layout field or menu found in web or mobile (grep for layout found only the Slide menu icon and an unrelated PPTX text)
- Other apps: none

## 4. Required behaviour

**Established requirements**

- The user can pick a layout for a slide. (source: brief S30.07)
- The user can edit slide text directly. (source: brief S30.10)
- The user or assistant can place an image on a slide. (source: brief S30.11)
- Charts, tables, shapes and diagram elements can be placed. (source: brief S30.12, S30.13, S30.14)
- No silent failures; user-facing errors say why. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Edit slide then Done saves the changed text as the slide; Cancel leaves the deck unchanged
2. Insert Table appends a 3-column table to the current slide
3. Insert Chart appends a chart; Edit chart data opens a grid and Apply updates the fence
4. Placing a 5 MB photo shrinks it or shows 'too large'
5. Placing an SVG shows the SVG message
6. Editing text keeps existing chart and shapes
7. Mobile edit keeps the diagram and asks before discarding changes
8. Layout picker exists (currently fails)

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A layout picker would need a layout key in slide Markdown or the deck header [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Insert at a chosen position
- [proposed] Mobile insert for image and table

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PresentationWorkspace | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx` | Edit state, Insert menu, image handler, chart edit wiring |
| component | SlideTextEditor | `apps/web/features/chat/components/artifacts/presentation/SlideTextEditor.tsx` | Rich text editor or Markdown source fallback |
| component | ChartDataEditor | `apps/web/features/chat/components/artifacts/presentation/ChartDataEditor.tsx` | Grid for chart data |
| service | chart-block | `apps/web/features/chat/components/artifacts/presentation/chart-block.ts` | Chart read, serialize, starter chart |
| service | image-embed | `apps/web/features/chat/components/artifacts/presentation/image-embed.ts` | Resize and encode images, error copy |
| service | deck-shapes | `apps/web/features/chat/components/artifacts/presentation/deck-shapes.ts` | Shape model, parse, serialize, clamp |
| component | SlideShapes | `apps/web/features/chat/components/artifacts/presentation/SlideShapes.tsx` | Draw and drag shapes |
| service | splitSlideForEditing / joinEditedSlide / replaceVisualBlock | `packages/ui/unified-chat/src/lib/deck-model.ts` | Separate text from visual blocks |
| component | SlideView | `apps/web/features/chat/components/artifacts/presentation/SlideView.tsx` | Renders markdown, charts, mermaid, kpi, insights, remote image gate |
| component | ArtifactCodeEditor | apps/web/features/chat/components/artifacts/ArtifactCodeEditor (not found) (not found) | Source editor fallback for slides that do not round-trip |
| service | document-editor-markdown | apps/web/features/chat/components/artifacts/document-editor-markdown (not found) (not found) | Rich-editor extensions and round-trip check |
| component | PresentationDeckView edit sheet | `apps/mobile/src/features/chat/components/artifact-viewers/presentation/PresentationDeckView.tsx` | Mobile text editor (lines 196-260) |
| test | PresentationWorkspace.test | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx` | Insert, shape, text edit, chart edit tests (lines 81-146) |
| test | chart-block.test | `apps/web/features/chat/components/artifacts/presentation/chart-block.test.ts` | Chart edits keep display settings |
| test | deck-model.test (web) | `apps/web/features/chat/components/artifacts/presentation/deck-model.test.ts` | Shapes block round trip and clamp |
| test | PresentationDeckView.test | `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PresentationDeckView.test.tsx` | Mobile edit keeps diagram; discard prompt |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Edit starts: current slide copied into a draft; editor shows text only, visuals held aside | device | PresentationWorkspace.tsx:~175-184,590-610 |
| Done joins text and visuals and saves via onSave | device | PresentationWorkspace.tsx:185-191 |
| Image file is read, resized on a canvas and inlined as a data URL | device | image-embed.ts:40-63 |
| Charts and diagrams render in the browser; no server call found | device | SlideView.tsx:137-157 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Slide text, chart JSON, shapes JSON, inline image data | Inside the deck Markdown, in the artifact store | unknown | Versioned in artifact history |

**Models and providers.** None for manual editing. The assistant can also write these blocks when it generates or edits a deck (see F030-06 neighbours); not traced here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for editing |
| Permissions | Editing needs the latest stored version; remote image host needs a click to load |
| Subscription | none found in the code |
| Limits and metering | Image 1600 px / 600,000 characters; 40 shapes; shape text 200 characters; no subscription limit found |
| Feature flags | none found in the code |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code |
| Local mode | All editing runs on the device with no network; no mode check found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Image unreadable, not image, SVG, too large, no canvas | Error toast with specific copy | image-embed.ts:7-13; PresentationWorkspace.tsx:225-238 |
| Slide cannot round-trip through rich editor | Falls back to Markdown source editor | SlideTextEditor.tsx:81-106 |
| Cancel | Draft dropped (web, no prompt); mobile asks if changed | PresentationWorkspace.tsx:192-196; PresentationDeckView.tsx:270-280 |
| Content changes externally while editing | Draft cleared | PresentationWorkspace.tsx:156-160 |
| Chart JSON invalid | No editor offered | readEditableChart null path |
| Offline, retry, timeout | not handled in the code (local operations) | no network calls in these files |
| Accessibility | Editor has aria-label 'Slide N text'; touch targets 44 px on small screens | SlideTextEditor.tsx:40; PresentationWorkspace.tsx:643 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx`: Insert table, chart, diagram; add shape; in-place text edit; chart grid edit
- `apps/web/features/chat/components/artifacts/presentation/chart-block.test.ts`: Chart round trip
- `apps/web/features/chat/components/artifacts/presentation/deck-model.test.ts`: Shapes block
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PresentationDeckView.test.tsx`: Mobile edit, discard
- `packages/ui/unified-chat/src/lib/deck-model.test.ts`: Split and join of visual blocks

**Test scenarios**

- **Edit and cancel**
  1. Edit slide, type text, Cancel
  2. Edit slide, type text, Done
  - Expected: Cancel leaves slide; Done saves
- **Insert table**
  1. Insert, Table
  - Expected: Table appended and saved
- **Image limits**
  1. Insert PNG 4000x3000
  2. Insert SVG
  3. Insert text file renamed .png
  - Expected: First resized; SVG and bad file show their messages
- **Chart data**
  1. Insert Chart
  2. Edit chart data
  3. Change Q2 to 30, Apply
  - Expected: Chart shows 30 and fence updated
- **Mobile edit**
  1. Slide actions, Edit slide, change text, Save the slide
  - Expected: Text saved; diagram unchanged
- **Layout**
  1. Look for a layout control
  - Expected: None (current behaviour; fails S30.07)

**Where to look when it fails**

- ImageEmbedError.failure value names the cause
- Check the ```chart and ```shapes fences in the artifact content
- Not run: no recorded results

**Hands-on test plans**

- Web: [70-qa/test-plans/web/030-presentation-workspace.md](../../70-qa/test-plans/web/030-presentation-workspace.md)
- Mobile: [70-qa/test-plans/mobile/030-presentation-workspace.md](../../70-qa/test-plans/mobile/030-presentation-workspace.md)

## 10. Gaps and dependencies

- **No layout selection** Affects: All apps. Evidence: no layout field found. Work needed: Define layouts and a picker
- **Mobile cannot insert images, tables, charts, shapes** Affects: Mobile. Evidence: PresentationDeckView.tsx action list. Work needed: Add or decide to leave
- **Inserts always append at end of slide** Affects: Web. Evidence: appendToSlide. Work needed: Position choice
- **No editing on Chrome, VS Code, CLI, Tauri desktop** Affects: those apps. Evidence: grep. Work needed: Product decision
- Not built on: Desktop, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- file:apps/web/features/chat/components/artifacts/presentation/SlideTextEditor.tsx
- file:packages/ui/unified-chat/src/lib/deck-model.ts
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- F030-02
- F030-05

## Unknown

- Whether the size of inline images can exceed a server-side artifact size limit
- Whether the layout concept exists in how the assistant writes decks (no code found)
- Mobile onSave storage path and sync
