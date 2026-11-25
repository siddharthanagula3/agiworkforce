---
id: "GAPS-AREA-020"
type: "gap-list"
title: "Gaps: Markdown and text rendering"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 20. Markdown and text rendering

67 open gaps that touch this area. Area page: [20-features/020-markdown-and-text-rendering](../../20-features/020-markdown-and-text-rendering/README.md).

## CMP-WP70

**Interactive tables with sort and filter**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F020-05](../../20-features/020-markdown-and-text-rendering/F020-05-tables-and-table-actions.md), [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md)
- Detail: Sorting exists only in the spreadsheet artifact Answer tables copy and download as CSV; sorting exists only in the spreadsheet artifact.
- Evidence: packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:52-122; packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx:236

## GAP-AREA020-LW04

**Table download uses the cell text of the rendered table. If a cell holds a formula, the exported text may differ from the source. Not tested.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-020
- Detail: Area 20. Markdown and text rendering
- Evidence: packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:21-33.

## GAP-AREA020-LW05

**Table copy writes tab-separated text while the download label says CSV. This is by design but may confuse a reader.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-020
- Detail: Area 20. Markdown and text rendering
- Evidence: packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:110 and :122.

## GAP-AREA020-LW06

**The CLI parser turns on tables, strikethrough and task lists only. Maths, footnotes and bare-address links are not turned on, so those features are absent in the terminal.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-020
- Detail: Area 20. Markdown and text rendering
- Evidence: apps/cli/src/tui/markdown_renderer.rs:149.

## GAP-CAP-rich-content-rendering-01

**Core Markdown text: Footnotes on four apps; CLI autolinks and selection unverified.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F020-01](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md), [F020-03](../../20-features/020-markdown-and-text-rendering/F020-03-links-images-and-link-safety.md), [F020-04](../../20-features/020-markdown-and-text-rendering/F020-04-footnotes.md), [F020-08](../../20-features/020-markdown-and-text-rendering/F020-08-select-find-and-export.md)
- Requirement items: S20.01, S20.02, S20.03, S20.04, S20.05, S20.06, S20.07, S20.08, S20.09, S20.10, S20.12, S20.13, S20.14, S20.26
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-CAP-rich-content-rendering-02

**Streaming Markdown and unclosed fences: none known; one stop-mid-stream defect: stopped artifact replies show raw HTML source (W-8).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F020-07](../../20-features/020-markdown-and-text-rendering/F020-07-live-rendering-while-the-answer-streams-in.md)
- Requirement items: S20.22, S20.23
- Detail: Claude unknown, ChatGPT unknown; AGI built

## GAP-CAP-rich-content-rendering-03

**Safe rendering of embedded markup and links: CLI link-safety status not recorded.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F020-03](../../20-features/020-markdown-and-text-rendering/F020-03-links-images-and-link-safety.md)
- Requirement items: S20.24, S20.25
- Detail: Claude partly, ChatGPT partly; AGI built

## GAP-CAP-rich-content-rendering-04

**Tables that fit and scroll: Chrome comparison table row (S22.30) is missing; no row cap rule decided for terminal.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F020-05](../../20-features/020-markdown-and-text-rendering/F020-05-tables-and-table-actions.md), [F022-09](../../20-features/022-rich-answers-and-structured-result-widgets/F022-09-tables-diagrams-and-mind-maps.md)
- Requirement items: S20.15, S20.16, S22.30
- Detail: Claude partly, ChatGPT partly; AGI built

## GAP-CAP-rich-content-rendering-05

**Table actions: copy, download, sort, filter: Copy-table on all apps; download on four apps; sort and filter beyond web.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F020-05](../../20-features/020-markdown-and-text-rendering/F020-05-tables-and-table-actions.md)
- Requirement items: S20.17, S20.18
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-rich-content-rendering-10

**Math typesetting: CLI shows no typeset math and no fallback rule is recorded.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F020-01](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md), [F020-06](../../20-features/020-markdown-and-text-rendering/F020-06-math-formulas.md)
- Requirement items: S20.19, S20.20, S20.21
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-rich-content-rendering-11

**Diagrams from Mermaid text: Extensions and CLI show no drawing; whether they show the source as fallback is not recorded.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F020-09](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md), [F022-09](../../20-features/022-rich-answers-and-structured-result-widgets/F022-09-tables-diagrams-and-mind-maps.md)
- Requirement items: S20.30, S22.31, S22.32, S22.33
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-rich-content-rendering-15

**Cards, forms and interactive layouts in answers: Forms on mobile and extensions; state persistence across reload not recorded.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F020-09](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md), [F022-08](../../20-features/022-rich-answers-and-structured-result-widgets/F022-08-approvals-and-questions.md)
- Requirement items: S20.30, S22.28, S22.29
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-rich-content-rendering-25

**Terminal and editor rendering: Open-in-full-view hand-off for unrendered parts; VS Code highlight.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F020-06](../../20-features/020-markdown-and-text-rendering/F020-06-math-formulas.md), [F021-01](../../20-features/021-code-blocks-and-executable-code-presentation/F021-01-language-label-and-syntax-colours.md), [F022-03](../../20-features/022-rich-answers-and-structured-result-widgets/F022-03-charts-and-chart-data.md)
- Requirement items: S20.19, S20.20, S21.01, S21.02, S22.08
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-rich-content-rendering-26

**Rendering with no network and clear boundaries: No test that flight-mode renders everything local; boundary label per card not checked.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F020-09](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md)
- Requirement items: S20.30
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-F020-01-01

**CLI prints literal # prefixes on headings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-01](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Detail: Affects: CLI users. Work needed: Drop the prefix and keep level through style; update the test.
- Evidence: apps/cli/src/tui/markdown_renderer.rs:222-228 versus brief S20.02

## GAP-F020-01-02

**Brief says tasks tick 'where supported' but no chat bubble supplies the toggle.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-01](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Detail: Affects: Web, Desktop, Mobile chat users. Work needed: Decide the product rule; wire or remove the unused path for chat.
- Evidence: onTaskToggle is passed only at ArtifactPreview.tsx:354,1934 and ArtifactFullScreen.tsx:1101

## GAP-F020-01-03

**Single-newline handling differs between VS Code and web/Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-01](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Detail: Affects: VS Code users. Work needed: Pick one rule and add a cross-app test.
- Evidence: render.ts:19 versus remarkPlugins.ts:74 and markdown.ts:144

## GAP-F020-01-04

**Web heading levels 4 to 6 have no explicit style.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-01](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Detail: Affects: Web and Desktop. Work needed: Add h4-h6 components or confirm library default is acceptable.
- Evidence: MarkdownContent.tsx:775-789

## GAP-F020-01-05

**No tests found that run a real CLI heading or nested-list case; the in-file tests cover tasks and tables only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-01](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Detail: Affects: CLI. Work needed: Add cases for headings, ordered start and nesting.
- Evidence: markdown_renderer.rs:658-736

## GAP-F020-02-01

**VS Code has no syntax colours.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-02](../../20-features/020-markdown-and-text-rendering/F020-02-code-blocks.md)
- Detail: Affects: VS Code users. Work needed: Use the shared highlighter or document the choice.
- Evidence: render.ts:36-57 only escapes and colours diff lines

## GAP-F020-02-02

**Chrome and VS Code lack Download and Expand for code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-02](../../20-features/020-markdown-and-text-rendering/F020-02-code-blocks.md)
- Detail: Affects: Chrome, VS Code. Work needed: Decide parity target with web.
- Evidence: render.ts:44-57; markdown.ts:314-348

## GAP-F020-02-03

**Brief says highlight failure not verified; code and test show it is handled on web. Other apps have no test named for it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-02](../../20-features/020-markdown-and-text-rendering/F020-02-code-blocks.md)
- Detail: Affects: Mobile, Chrome, VS Code. Work needed: Add failure tests per app.
- Evidence: HighlightedCode.tsx:57; markdown.ts:352-385

## GAP-F020-03-01

**CLI does not link bare addresses and shows images as alt text only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-03](../../20-features/020-markdown-and-text-rendering/F020-03-links-images-and-link-safety.md)
- Detail: Affects: CLI users. Work needed: Confirm behaviour by running the renderer test; decide product rule.
- Evidence: markdown_renderer.rs:147-150, 206-433

## GAP-F020-03-02

**VS Code removes images with no placeholder.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-03](../../20-features/020-markdown-and-text-rendering/F020-03-links-images-and-link-safety.md)
- Detail: Affects: VS Code users. Work needed: Show alt text or a notice.
- Evidence: render.ts:82-99; sanitizer.webview.test.ts:130-145

## GAP-F020-03-03

**Brief says links open outside the app; mobile uses an in-app browser.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-03](../../20-features/020-markdown-and-text-rendering/F020-03-links-images-and-link-safety.md)
- Detail: Affects: Mobile users. Work needed: Confirm intended behaviour.
- Evidence: sourceDisplay.ts:29

## GAP-F020-03-04

**No test found for the web link component rules (protocol-relative, fragment, new tab).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-03](../../20-features/020-markdown-and-text-rendering/F020-03-links-images-and-link-safety.md)
- Detail: Affects: Web, Desktop. Work needed: Add render tests for MarkdownLink.
- Evidence: No matching test title found in packages/ui/unified-chat markdown tests

## GAP-F020-03-PARTLY

**Links, images and link safety: partly built on CLI**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F020-03](../../20-features/020-markdown-and-text-rendering/F020-03-links-images-and-link-safety.md)
- Requirement items: S20.13

## GAP-F020-04-01

**VS Code and CLI show no footnotes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-04](../../20-features/020-markdown-and-text-rendering/F020-04-footnotes.md)
- Detail: Affects: VS Code, CLI. Work needed: Add support or decide not to.
- Evidence: render.ts:16-24; markdown_renderer.rs:147-150

## GAP-F020-04-02

**Brief marks mobile and Chrome as missing though both are built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-04](../../20-features/020-markdown-and-text-rendering/F020-04-footnotes.md)
- Detail: Affects: Documentation, planning. Work needed: Update the brief.
- Evidence: MarkdownInline.tsx:410-430; markdown.ts:217-246

## GAP-F020-04-03

**Mobile has no back-link from the list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-04](../../20-features/020-markdown-and-text-rendering/F020-04-footnotes.md)
- Detail: Affects: Mobile users. Work needed: Add a link or accept the alert.
- Evidence: MessageContentRenderer.tsx:876-925

## GAP-F020-04-04

**No test found proving the mobile alert text.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-04](../../20-features/020-markdown-and-text-rendering/F020-04-footnotes.md)
- Detail: Affects: Mobile. Work needed: Read or add a test.
- Evidence: Mobile tests matched 'footnote' but cases not read

## GAP-F020-04-NOTBUILT

**Footnotes: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F020-04](../../20-features/020-markdown-and-text-rendering/F020-04-footnotes.md)
- Requirement items: S20.14
- Detail: CLI: S20.14; VS Code: S20.14

## GAP-F020-05-01

**No test found for the web copy, download and expand buttons.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-05](../../20-features/020-markdown-and-text-rendering/F020-05-tables-and-table-actions.md)
- Detail: Affects: Web, Desktop. Work needed: Add render tests for MarkdownTable actions.
- Evidence: Searches for 'Copy table', 'table.csv', 'Download as CSV' in tests found only mobile and artifact tests

## GAP-F020-05-02

**CLI, VS Code and Chrome have no copy or download.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-05](../../20-features/020-markdown-and-text-rendering/F020-05-tables-and-table-actions.md)
- Detail: Affects: CLI, VS Code, Chrome users. Work needed: Decide parity and add actions.
- Evidence: markdown_renderer.rs:441-455; render.ts:72-74; side_panel.ts:2965-2971

## GAP-F020-05-03

**Exports add a leading apostrophe to formula-like cells, so a copy of '=x' differs from the visible text.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-05](../../20-features/020-markdown-and-text-rendering/F020-05-tables-and-table-actions.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Tell the reader or limit the guard to downloads.
- Evidence: tabular.ts:253-258, 327-335

## GAP-F020-05-04

**No XLSX or Markdown copy.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-05](../../20-features/020-markdown-and-text-rendering/F020-05-tables-and-table-actions.md)
- Detail: Affects: All. Work needed: Confirm requirement.
- Evidence: MarkdownTable.tsx has TSV and CSV only

## GAP-F020-05-05

**Brief statuses for S20.17 and S20.18 are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-05](../../20-features/020-markdown-and-text-rendering/F020-05-tables-and-table-actions.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: MarkdownTable.tsx:105-123; MessageContentRenderer.tsx:436-445

## GAP-F020-05-NOTBUILT

**Tables and table actions: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F020-05](../../20-features/020-markdown-and-text-rendering/F020-05-tables-and-table-actions.md)
- Requirement items: S20.17, S20.18
- Detail: Web: S20.17; Desktop: S20.17; Mobile: S20.17, S20.18; CLI: S20.17, S20.18; VS Code: S20.17, S20.18; Chrome: S20.17, S20.18

## GAP-F020-06-01

**CLI has no math rendering.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-06](../../20-features/020-markdown-and-text-rendering/F020-06-math-formulas.md)
- Detail: Affects: CLI users. Work needed: Show readable source or a Unicode approximation.
- Evidence: markdown_renderer.rs:147-150

## GAP-F020-06-02

**The brief's 'next to a word or digit' rule is not applied on web or mobile; they use the currency check instead.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-06](../../20-features/020-markdown-and-text-rendering/F020-06-math-formulas.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Unify rules or document the difference.
- Evidence: markdownSource.ts:24-31 versus markdownItMath.ts:21-27

## GAP-F020-06-03

**Web fallback for an undrawable formula is unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-06](../../20-features/020-markdown-and-text-rendering/F020-06-math-formulas.md)
- Detail: Affects: Web, Desktop. Work needed: Add a test for non-streaming errors.
- Evidence: No failure test found in MathRendering tests (file read by name only)

## GAP-F020-06-04

**Centering of display math not established in repository CSS.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-06](../../20-features/020-markdown-and-text-rendering/F020-06-math-formulas.md)
- Detail: Affects: All. Work needed: Check visually.
- Evidence: math-layout.css:1-11 sets width and scroll only

## GAP-F020-06-NOTBUILT

**Math formulas: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F020-06](../../20-features/020-markdown-and-text-rendering/F020-06-math-formulas.md)
- Requirement items: S20.19, S20.20
- Detail: CLI: S20.19, S20.20

## GAP-F020-07-01

**VS Code and Chrome show no table hold and no inline-token repair; the brief marks them done for S20.22.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-07](../../20-features/020-markdown-and-text-rendering/F020-07-live-rendering-while-the-answer-streams-in.md)
- Detail: Affects: VS Code and Chrome users. Work needed: Share the repair functions with both renderers, or lower the brief status to partial.
- Evidence: No import of completeInlineTokens or holdIncompleteGfmTable outside unified-chat and mobile (rg over apps and packages); webviewContent.ts:7852-7856; side_panel.ts:6373-6384

## GAP-F020-07-02

**VS Code and Chrome replace the whole answer's HTML on every token; settled blocks are not kept.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-07](../../20-features/020-markdown-and-text-rendering/F020-07-live-rendering-while-the-answer-streams-in.md)
- Detail: Affects: VS Code, Chrome (long answers, text selection mid-stream). Work needed: Block-level incremental update or an equivalent cost test.
- Evidence: renderAssistantInto sets el.innerHTML (webviewContent.ts:5386-5388); renderMarkdownInto sets target.innerHTML (markdown.ts:612)

## GAP-F020-07-03

**CLI has no table hold or inline repair and only shows the last 40 rendered lines of the live answer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-07](../../20-features/020-markdown-and-text-rendering/F020-07-live-rendering-while-the-answer-streams-in.md)
- Detail: Affects: CLI. Work needed: Decide if a windowed tail is the intended behaviour; add tests (no test for streaming_markdown_tail found).
- Evidence: apps/cli/src/tui/tui_app.rs:5492-5508

## GAP-F020-07-04

**Brief citations are stale (StreamingMarkdownContent.tsx:171, side_panel.ts:4463, markdownSource.ts:109 is TeX code, not fence handling).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-07](../../20-features/020-markdown-and-text-rendering/F020-07-live-rendering-while-the-answer-streams-in.md)
- Detail: Affects: Anyone using the brief. Work needed: Regenerate the brief citations.
- Evidence: File lengths and the lines opened for this page

## GAP-F020-07-05

**No streaming announcer on Chrome; VS Code relies on a log region only; mobile live-region use for answer text not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-07](../../20-features/020-markdown-and-text-rendering/F020-07-live-rendering-while-the-answer-streams-in.md)
- Detail: Affects: Screen-reader users on those apps. Work needed: Add and test announcements, or document equivalents.
- Evidence: StreamAnnouncer is used only in unified-chat and web (rg StreamAnnouncer); mobile accessibilityLiveRegion hits are on cards and pending bubble only

## GAP-F020-07-06

**The web streaming path has no direct test of closeUnterminatedFence in MessageBubble.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-07](../../20-features/020-markdown-and-text-rendering/F020-07-live-rendering-while-the-answer-streams-in.md)
- Detail: Affects: Web. Work needed: Add a bubble-level test.
- Evidence: No test file found that references it (rg)

## GAP-F020-08-01

**Mobile has no find in a conversation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-08](../../20-features/020-markdown-and-text-rendering/F020-08-select-find-and-export.md)
- Detail: Affects: Mobile users. Work needed: Add find using markdownRenderedText plus highlight in native text.
- Evidence: S20.27 status missing in the brief; no find feature in apps/mobile/src chat components by search

## GAP-F020-08-02

**Web find counts messages not matches, and highlights only mounted rows.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-08](../../20-features/020-markdown-and-text-rendering/F020-08-select-find-and-export.md)
- Detail: Affects: Web and desktop users with long chats. Work needed: Count matches; scroll to each match; paint after scroll.
- Evidence: message-search.ts:9-37; ChatMessageList.tsx:1499-1535; use-text-match-highlight.ts:90-117

## GAP-F020-08-03

**No rendered export or print on VS Code and Chrome; CLI exports raw Markdown only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-08](../../20-features/020-markdown-and-text-rendering/F020-08-select-find-and-export.md)
- Detail: Affects: VS Code, Chrome, CLI. Work needed: Decide scope; add HTML or PDF export, or mark not planned.
- Evidence: ChatStateManager.ts:4070-4115 (Markdown only); registry.rs:598-623; artifactPanel.ts:385

## GAP-F020-08-04

**Mobile export HTML has no right-to-left handling.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-08](../../20-features/020-markdown-and-text-rendering/F020-08-select-find-and-export.md)
- Detail: Affects: Mobile users with Arabic or Hebrew answers. Work needed: Use textDirection per block in exportMarkdownHtml.ts.
- Evidence: No direction code in apps/mobile/services/exportMarkdownHtml.ts or fileCreation.ts (rg)

## GAP-F020-08-05

**Web PDF/DOCX export from the dialog adds emoji role headings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-08](../../20-features/020-markdown-and-text-rendering/F020-08-select-find-and-export.md)
- Detail: Affects: Web users exporting to PDF or Word. Work needed: Use plain role labels for document exports.
- Evidence: apps/web/features/chat/services/conversation-export.ts:93-97

## GAP-F020-08-06

**No test for the highlight hook, MessageSearch, or the PDF and Word builders directly.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-08](../../20-features/020-markdown-and-text-rendering/F020-08-select-find-and-export.md)
- Detail: Affects: Web and desktop. Work needed: Add unit and browser tests.
- Evidence: No test file referencing use-text-match-highlight or export-pdf found (rg over apps and packages tests)

## GAP-F020-08-07

**Brief says mobile export is done for 'conversation or answer' but per-message export is a separate button and web per-answer export is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-08](../../20-features/020-markdown-and-text-rendering/F020-08-select-find-and-export.md)
- Detail: Affects: Web users wanting one answer. Work needed: Check if per-answer export exists on web or add it.
- Evidence: FileExportButton.tsx:181; web per-answer export not found

## GAP-F020-08-NOTBUILT

**Select, find and export: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F020-08](../../20-features/020-markdown-and-text-rendering/F020-08-select-find-and-export.md)
- Requirement items: S20.27, S20.28
- Detail: Mobile: S20.27; CLI: S20.27; VS Code: S20.27, S20.28; Chrome: S20.27, S20.28

## GAP-F020-08-PARTLY

**Select, find and export: partly built on CLI**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F020-08](../../20-features/020-markdown-and-text-rendering/F020-08-select-find-and-export.md)
- Requirement items: S20.26

## GAP-F020-09-01

**Web decides direction once per message, not per paragraph.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-09](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md)
- Detail: Affects: Web and Desktop users reading mixed English and right-to-left answers. Work needed: Add dir from textDirection to paragraph, heading, list, quote and table cell components; add a rendering test.
- Evidence: dir='auto' only on the container (MessageBubble.tsx:2839, :3212); MarkdownParagraph has no dir (MarkdownContent.tsx:392-399); brief S20.29 and the draft say per paragraph

## GAP-F020-09-02

**CLI, VS Code and Chrome have no right-to-left handling.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-09](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md)
- Detail: Affects: Right-to-left readers on those apps. Work needed: Per-block dir in the two HTML renderers; terminal limits for the CLI need a decision.
- Evidence: No direction code in markdown_renderer.rs, webview/render.ts or side-panel/markdown.ts (rg)

## GAP-F020-09-03

**Mobile table cells and export HTML ignore direction.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-09](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md)
- Detail: Affects: Mobile readers of right-to-left tables and PDFs. Work needed: Use textDirection on cells; add direction to export HTML.
- Evidence: textAlign alignments[colIdx] ?? 'left' in MessageContentRenderer.tsx table cells; no direction in exportMarkdownHtml.ts

## GAP-F020-09-04

**The web direction test only reads source text.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-09](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md)
- Detail: Affects: Web. Work needed: Render a message in a browser test and check computed direction.
- Evidence: MessageDirection.test.tsx:5-16

## GAP-F020-09-05

**Brief says mobile right-to-left is unverified, but a test exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-09](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief status after a device check.
- Evidence: MessageContentRenderer.blocks.test.tsx:558-569

## GAP-F020-09-06

**Brief citations are stale for right-to-left (MarkdownContent.tsx:540 is table alignment).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-09](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md)
- Detail: Affects: Anyone using the brief. Work needed: Regenerate citations.
- Evidence: MarkdownContent.tsx:540-548

## GAP-F020-09-07

**Mobile card fallback not confirmed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F020-09](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md)
- Detail: Affects: Mobile. Work needed: Read the rest of the mobile card file and add a test.
- Evidence: InteractiveCardBlock.tsx lines read near 375-400 show map tiles, not a fallback

## GAP-F020-09-NOTBUILT

**Right-to-left text and fallback blocks: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F020-09](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md)
- Requirement items: S20.29
- Detail: CLI: S20.29; VS Code: S20.29; Chrome: S20.29

## GAP-F020-09-PARTLY

**Right-to-left text and fallback blocks: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F020-09](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md)
- Requirement items: S20.29
