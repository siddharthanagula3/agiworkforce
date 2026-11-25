---
id: "F022-09"
type: "feature"
title: "Tables, diagrams and mind maps"
aliases: ["Comparison table", "Markdown table", "Mermaid diagram", "Mind map", "Flowchart", "Timeline", "MermaidDiagram", "MarkdownTable", "message-table-scroll", "S22.30", "S22.31", "S22.32", "S22.33"]
area: "22 Rich answers and structured result widgets"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S22.30", "S22.31", "S22.32", "S22.33"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "SYS-observability-and-operations", "file:packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F022-09 Tables, diagrams and mind maps

Tables in answers show as real tables, with copy, CSV download and an expand view on web and desktop, and sideways scroll on mobile and VS Code. Mermaid diagram text (mind maps, flowcharts, timelines) is drawn as a picture on web, desktop and mobile. The CLI prints text tables only. Chrome and VS Code do not draw Mermaid.

Area: [22. Rich answers and structured result widgets](README.md). Requirement items: [S22.30](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2230), [S22.31](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2231), [S22.32](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2232), [S22.33](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2233).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Draws markdown tables as tables and draws a code block labelled mermaid as a diagram with show-source, copy-source and expand actions. Mind map, flowchart and timeline are just Mermaid diagram kinds; there is no separate code for each. (packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:26-36,172-390; packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx)

**Why it exists.** Comparisons and plans are easier to read as tables and pictures than as text. (doc: area brief S22.30-S22.33)

**Who uses it.** Anyone reading a comparison or asking for a flowchart, mind map or timeline, on web, desktop, mobile; tables also on CLI, VS Code and Chrome.

**Problems it solves**

- Wide comparison tables stay readable by scrolling or expanding.
- Diagram code does not have to be pasted into another tool.
- Table data can be copied or downloaded as CSV.

**Use cases**

- Ask for a comparison of three laptops; read a table.
- Ask for a flowchart of a sign-up process; see a drawn diagram and press Expand diagram.
- Ask for a mind map of a topic; read it, copy the source.
- Read a table in the VS Code chat by scrolling sideways.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): in the assistant reply. Table actions 'Copy table', 'Download as CSV', 'Expand table' (MarkdownTable.tsx:48-85). Diagram buttons 'Show source'/'Hide source', 'Copy diagram source', 'Expand diagram', 'Close' (MermaidDiagram.tsx:268-345).
- Mobile: tables in MessageContentRenderer with table actions; diagrams in MermaidDiagramBlock with an expand control and source controls (apps/mobile/src/features/chat/components/MermaidDiagramBlock.tsx:1-66; DiagramFullScreen.tsx).
- VS Code: tables inside a region labelled 'Table' that scrolls (apps/extension-vscode/src/webview/render.ts:72-74).
- CLI: bordered text table (apps/cli/src/tui/markdown_renderer.rs:444).
- Chrome: the sanitizer allows table tags (apps/extension/src/features/side-panel/markdown.ts:71); rendering not verified.

**Before you start**

- The model must write a markdown table or a mermaid fenced block; the mermaid library is loaded on demand in the browser (MermaidDiagram.tsx:135-142).

**Screens and controls**

- Web diagram: figure with the picture and a caption row of buttons; expanded view is a dialog with Copy and Close (MermaidDiagram.tsx:290-345).
- Web table: header toolbar with copy, download, expand (MarkdownTable.tsx).
- VS Code table: focusable scroll region (render.ts:72-74).
- Mobile: drawn in a sandboxed web view; pinch zoom not established.

**Journey**

1. Ask for a comparison, flowchart, mind map or timeline.
2. While streaming, an unfinished diagram is held back until its source looks closed (MermaidDiagram.tsx:203-215).
3. When drawn, read it; use Expand diagram for a larger view; Show source to see the text.
4. Copy the table or the diagram source if needed.

**What the person sees and gets**

- Failed diagram keeps the source and shows a status message with the reason (MermaidDiagram.tsx:365-372).
- Copy buttons change label to copied/failed (MarkdownTable.tsx:36-45).
- Mobile shows a failure text from diagramFailureText (MermaidDiagramBlock.tsx:9).

**Settings**

- Diagram colours follow the theme; mobile passes dark mode and font scale (MermaidDiagramBlock.tsx:57-62).
- none found for tables

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/desktop: Mermaid drawn with strict security level and plain SVG labels, sanitized SVG, expand dialog, source toggle (MermaidDiagram.tsx:30-37,290-345; tests in MermaidDiagram.test.tsx).
- Web: CodeBlock routes mermaid language to MermaidDiagram (CodeBlock.tsx:314); also used in artifact panel and slides (ArtifactPreview.tsx:1905; SlideView.tsx:154).
- Web tables: MarkdownTable with copy, CSV download, expand (MarkdownTable.tsx).
- Mobile: MermaidDiagramBlock inside a sandboxed web view with cached height, expand and source (MermaidDiagramBlock.tsx; SafeArtifactPreview.tsx:134-152) and tables with side scroll (tests WideMarkdownTable.test.tsx).
- VS Code tables in a labelled focusable scroll region (render.ts:72-74).
- CLI renders GFM tables with borders, column caps of 8-40 characters and wrapping (markdown_renderer.rs:444-480; test at :697).
- Timeline fence (a separate 'timeline' language) draws as an ordered list in VS Code and Chrome and as a surface on mobile (assistantFence.ts:416-425,664-671; AssistantSurface.tsx:895).

**Incomplete**

- Diagram zoom: only an expand dialog on web; pinch or wheel zoom not found.
- CLI: tables only; no diagram drawing; mermaid source shown as code. cloud/artifacts.rs only maps mermaid to an .mmd file extension (apps/cli/src/cloud/artifacts.rs:240).
- VS Code and Chrome: no Mermaid renderer found; the fence is shown as code or a classifier fallback. The VS Code artifact view only lists mermaid as a type (apps/extension-vscode/src/features/artifacts/artifactPresentation.ts:15,51).

**Present but disconnected or switched off**

- Chrome tables: allowed by the sanitizer allowlist (markdown.ts:71) so the brief's 'missing' may be wrong; no Chrome test for tables found.

**Not available**

- Dedicated mind map, flowchart or timeline components: none; all are Mermaid text. Mermaid drawing on CLI, VS Code, Chrome: none found.

## 4. Required behaviour

**Established requirements**

- Decision/comparison answers render as a readable comparison table. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.30)
- Mind-map answers render as a drawn mind map. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.31)
- Flowchart answers render as a drawn flowchart diagram. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.32)
- Timeline answers render as a drawn timeline. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.33)
- VS Code tables are wrapped in a labelled, keyboard-focusable scroll region. (source: apps/extension-vscode/src/webview/render.ts:72-74)
- The CLI renders markdown tables as text rows. (source: apps/cli/src/tui/markdown_renderer.rs:444)
- Diagram code is drawn by the shared MermaidDiagram component. (source: packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:172)

**Acceptance criteria**

1. A markdown table in a reply appears as a table on web, mobile, VS Code, CLI and Chrome.
2. A mermaid block with a valid flowchart draws as a picture on web and mobile.
3. An invalid mermaid block shows its source and a reason, not a blank space.
4. An unfinished mermaid block is not compiled while streaming.
5. Expand diagram opens a dialog and Close returns focus.
6. VS Code table scrolls sideways with the keyboard (region is focusable).
7. Diagram SVG passes the sanitizer (no scripts).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Diagram drawing needs a browser engine, so CLI would need an image or text fallback. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add pinch and wheel zoom in the expanded diagram.
- [proposed] Show Mermaid in VS Code and Chrome through the same shared component, or an image fallback.
- [proposed] Verify tables on Chrome and update the brief.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MermaidDiagram | `packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx` | Loads mermaid, draws sanitized SVG, expand dialog, source toggle, failure message. |
| service | mermaid-render | `packages/ui/unified-chat/src/components/markdown/mermaid-render.ts` | Renders in an owned host element. |
| service | mermaidExternalResources | `packages/ui/unified-chat/src/components/markdown/mermaidExternalResources.ts` | Detects external resources in diagram source. |
| component | CodeBlock | `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx` | Chooses MermaidDiagram for mermaid fences (line 314). |
| component | MarkdownTable | `packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx` | Table with copy, CSV download, expand. |
| component | MarkdownContent | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Mounts MarkdownTable and the diagram path. |
| component | MermaidDiagramBlock (mobile) | `apps/mobile/src/features/chat/components/MermaidDiagramBlock.tsx` | Mobile diagram frame with expand and source. |
| component | SafeArtifactPreview | `apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx` | Sandboxed web view that draws the diagram. |
| component | DiagramFullScreen | `apps/mobile/src/features/chat/components/DiagramFullScreen.tsx` | Mobile full-screen diagram. |
| component | MessageContentRenderer (mobile) | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Mobile tables and mermaid routing (line 1559). |
| service | VS Code markdown-it renderer | `apps/extension-vscode/src/webview/render.ts` | Wraps tables in a labelled scroll region. |
| service | CLI markdown renderer | `apps/cli/src/tui/markdown_renderer.rs` | render_table text tables. |
| service | Chrome side-panel markdown | `apps/extension/src/features/side-panel/markdown.ts` | Sanitizer allowlist includes table tags. |
| service | assistantFence timeline | `packages/ui/unified-chat/src/components/markdown/assistantFence.ts` | Timeline fence to ordered list HTML. |
| test | MermaidDiagram.test.tsx | `packages/ui/unified-chat/src/components/markdown/__tests__/MermaidDiagram.test.tsx` | Diagram draw, failure, streaming, sanitizer. |
| test | WideMarkdownTable.test.tsx | `apps/mobile/__tests__/WideMarkdownTable.test.tsx` | Mobile wide table. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model streams markdown with a table or mermaid block. | our servers | Chat stream (apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts); local and own-key paths not traced: unknown |
| The app parses markdown; tables become table elements; mermaid text is compiled to SVG with the mermaid library loaded on demand. | device | MermaidDiagram.tsx:135-142,224-238 |
| The SVG is sanitized before it is inserted. | device | MermaidDiagram.test.tsx 'passes the drawn markup through the package sanitizer' |
| Mobile draws the diagram in a sandboxed web view and reports height back. | device | SafeArtifactPreview.tsx:134-152; MermaidDiagramBlock.tsx:65-70 |
| A failed render is reported as a client failure event. | our servers | reportClientFailure({failure:'mermaid_render'}) at MermaidDiagram.tsx:239-247; the receiving endpoint was not traced: unknown |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Diagram source and table text | Inside the message content | With the conversation | With the message |
| Mobile drawn-height cache | In-memory map of up to 32 entries | No | Lost when the app process ends (MermaidDiagramBlock.tsx:14,27-42) |

**Models and providers.** Any model that writes valid mermaid or a GFM table. Diagram correctness depends on the model; the renderer reports failures.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for rendering |
| Permissions | none found in the code. Diagram external resources are checked (mermaidExternalResources.ts). |
| Subscription | none found in the code |
| Limits and metering | Mobile height cache 32 entries. CLI table column cap 40 characters, minimum 8, budget 96 columns (markdown_renderer.rs:448-451). No other limits found. |
| Feature flags | none found in the code |
| Model compatibility | Not tied to a model. |
| Provider restrictions | none found in the code |
| Local mode | Rendering runs on the device, so Local replies draw the same way. [inferred] The mermaid library is imported on demand; whether it is bundled offline in the mobile web view is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming diagram | Not compiled until brackets close. | MermaidDiagram.tsx:203-215; test 'does not compile an unfinished source' |
| Parse failure | Source kept, reason shown in a status paragraph. | MermaidDiagram.tsx:245-255,365-372 |
| Pending/rendering | Placeholder with status role. | MermaidDiagram.tsx:381-386 |
| Mobile load timeout or runtime error | Error view with reload option. | SafeArtifactPreview.tsx:166-200 |
| Wide table on mobile | Scrolls sideways. | apps/mobile/__tests__/WideMarkdownTable.test.tsx (file name) |
| Keyboard access (VS Code) | Table region is focusable and labelled 'Table'. | render.ts:72-74 |
| Screen reader | Expanded dialog labelled 'Diagram'; diagram figure labelled when interactive. | MermaidDiagram.tsx:286,333 |
| Offline | not handled in the code beyond the failure message if the mermaid library cannot load. | searched MermaidDiagram.tsx for offline handling; only the catch at lines 245-255 found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/__tests__/MermaidDiagram.test.tsx`: Draw, sanitize, failure, streaming hold
- `packages/ui/unified-chat/src/components/markdown/__tests__/MermaidDiagram.externalResources.test.tsx`: External resource handling
- `apps/mobile/__tests__/WideMarkdownTable.test.tsx`: Wide tables on mobile
- `apps/mobile/__tests__/MarkdownTableFit.test.tsx`: Table fit on mobile
- `apps/mobile/src/features/chat/components/__tests__/MarkdownTableActions.test.tsx`: Mobile table actions
- `apps/cli/src/tui/markdown_renderer.rs`: Inline tests renders_gfm_table_with_borders and cjk_table_cells_keep_all_rows_column_aligned
- `apps/web/e2e/chat-rendering-regression.spec.ts`: End-to-end rendering regression; the file mentions mermaid
- `apps/extension-vscode/src/__tests__/__snapshots__/webviewContent.snapshot.test.ts.snap`: Snapshot contains the message-table-scroll style

**Test scenarios**

- **Comparison table**
  1. Ask 'Compare three note apps in a table'.
  2. Press Copy table, then Download as CSV, then Expand table.
  - Expected: Table shown; copy and CSV match the rows; expand opens a larger view.
- **Flowchart**
  1. Ask 'Draw a flowchart of password reset'.
  2. Press Show source, then Expand diagram, then Close.
  - Expected: Diagram drawn; source toggles; dialog opens and closes with focus returned.
- **Broken diagram**
  1. Edit a mermaid block to invalid syntax.
  - Expected: Source remains with a reason message.
- **Mobile diagram**
  1. On mobile ask for a mind map; tap expand.
  - Expected: Diagram drawn in a frame; full screen opens.
- **VS Code table**
  1. Ask for a wide table; Tab to the Table region; scroll with arrow keys.
  - Expected: Region scrolls sideways.
- **CLI table and mermaid**
  1. In the CLI ask for a table and a flowchart.
  - Expected: Bordered text table; flowchart appears as code text.

**Where to look when it fails**

- reportClientFailure with failure 'mermaid_render' and detail 'parse' or 'render' (MermaidDiagram.tsx:239,247).
- data-mermaid attribute states: ready, failed, rendering, pending (MermaidDiagram.tsx:293,365,381).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md)
- Desktop: [70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md)
- Mobile: [70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md)
- CLI: [70-qa/test-plans/cli/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/cli/022-rich-answers-and-structured-result-widgets.md)
- VS Code: [70-qa/test-plans/vscode/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/vscode/022-rich-answers-and-structured-result-widgets.md)
- Chrome: [70-qa/test-plans/chrome/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/chrome/022-rich-answers-and-structured-result-widgets.md)

## 10. Gaps and dependencies

- **No Mermaid drawing on CLI, VS Code, Chrome.** Affects: CLI, VS Code, Chrome. Evidence: Mermaid referenced only in artifact type maps (artifactPresentation.ts:15; artifacts.rs:45). Work needed: Draw via shared component or provide an image/ASCII fallback.
- **No zoom beyond Expand.** Affects: Web, desktop, mobile. Evidence: MermaidDiagram.tsx:316-345. Work needed: Add pinch/wheel zoom.
- **Chrome table support unverified; brief says missing but sanitizer allows tables.** Affects: Chrome. Evidence: markdown.ts:71. Work needed: Live-check in the side panel and add a test.
- **Mind map and timeline are not distinct features, only Mermaid kinds; model must emit valid Mermaid.** Affects: All drawing apps. Evidence: no mind map code found. Work needed: Decide whether to add prompts or validation per kind.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- SYS-observability-and-operations
- file:packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx

## Unknown

- Whether Chrome draws tables correctly.
- Whether Mermaid works fully offline on mobile.
- Where reportClientFailure events are received and stored.
- Whether any prompt tells the model to use mermaid for mind maps, flowcharts and timelines.
- Whether pinch zoom exists inside the mobile diagram web view.
