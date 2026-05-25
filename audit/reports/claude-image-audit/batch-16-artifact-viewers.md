# Batch 16 -- Artifact Viewers: HTML / Markdown / PDF / Rich Text

Audit date: 2026-05-24
Auditor: Claude Opus 4.7 (automated)
Reference: Claude Desktop (macOS) screenshots in `~/Desktop/reference/ui/desktop/claude-artifacts/`
Target: AGI web app at `apps/web/features/chat/`

---

## IMG: 12_artifact-sidebar_html-resume-preview.png

- Feature: Right-side artifact sidebar showing a live rendered HTML resume preview. Left pane has chat with inline artifact card ("Ideal resume anthropic growth", Code: HTML). Right pane shows the rendered HTML with title "Alex Kim" styled as a professional resume. Panel header shows artifact title, type badge "HTML", and close/copy actions.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/12_artifact-sidebar_html-resume-preview.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx
  - apps/web/features/chat/components/artifacts/ArtifactPreview.tsx
  - apps/web/features/chat/components/SandboxedIframe.tsx
  - apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx
  - apps/web/features/chat/stores/artifacts-store.ts
- API endpoints: N/A (client-side rendering)
- Data flow:
  - Assistant message with HTML code block is parsed by `extractArtifacts()` in `artifact-detector.ts`
  - `MessageBubble` calls `extractArtifacts` and `removeArtifactBlocks`, feeds results to `InlineArtifactCards`
  - Clicking an inline card calls `useArtifactsStore.selectArtifact()` + `setPanelOpen(true)`
  - `ArtifactsPanel` renders in WebChatPage layout alongside chat area, shows `ArtifactViewer` for selected artifact
  - `ArtifactPreview` uses `SandboxedIframe` for live HTML rendering via cross-origin sandbox or `srcDoc` fallback
- Flaws:
  - [major] ArtifactsPanel only renders syntax-highlighted code, NOT a live HTML preview -- it uses `SyntaxHighlighter` at ArtifactsPanel.tsx:114-135 instead of `SandboxedIframe`. The live preview only exists in `ArtifactPreview.tsx` which is NOT mounted in the panel. Claude shows a fully rendered HTML page in the sidebar panel.
  - [major] ArtifactsPanel is a 400px side panel (ArtifactsPanel.tsx:194) but Claude's sidebar is roughly 50% of screen width with rich rendered content. The AGI panel is too narrow and only shows code.
  - [major] The inline artifact card in Claude shows "Code: HTML" with an "Open in Comet" button to open the artifact in an external editor. AGI's `InlineArtifactCards` only shows tiny 80x60 thumbnail cards with no external-editor integration.
  - [minor] Claude's panel header shows "Ideal resume anthropic growth - HTML" with Copy and X buttons in a clean row. AGI's panel header says "Artifacts" generically with a count badge -- it does not show the selected artifact's title and type in the header bar.
- Visual gaps:
  - Claude has a dedicated full-width toolbar row with the artifact title + type badge (HTML) + copy/close buttons. AGI panel header is generic "Artifacts" text.
  - Claude panel background is white for HTML preview with the rendered resume. AGI panel background is dark (#1e1e1e) showing code syntax.
  - Claude's inline card in chat shows a document icon, artifact name, "Code: HTML" subtitle, and "Open in Comet" CTA button. AGI's inline card is a small 80x60 pixel thumbnail.
  - The chat text in Claude wraps around the artifact card naturally. AGI shows artifact cards below the message content.

---

## IMG: 13_artifact-viewer_toolbar-copy-refresh-close.png

- Feature: Same sidebar HTML resume preview as image 12, but with the toolbar buttons clearly visible: Copy button, refresh icon (implied), and close (X) button in the top-right corner of the artifact sidebar. The panel shows rendered HTML content with the artifact title and type visible.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/13_artifact-viewer_toolbar-copy-refresh-close.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx
  - apps/web/features/chat/components/artifacts/ArtifactPreview.tsx
- API endpoints: N/A
- Data flow:
  - Same as IMG 12
  - Copy button calls `navigator.clipboard.writeText(artifact.content)` at ArtifactsPanel.tsx:72
  - Close button calls `setPanelOpen(false)` at ArtifactsPanel.tsx:213
- Flaws:
  - [major] ArtifactsPanel has Copy and Download at the bottom action bar (line 139-160) but no Refresh button. ArtifactPreview has a Refresh button (line 497) but ArtifactPreview is NOT used in the panel layout.
  - [minor] Claude's Copy button is in the top toolbar row next to the close button. AGI's copy is in a bottom action bar, making it harder to find.
  - [minor] No refresh capability in the ArtifactsPanel at all -- the `refreshKey` pattern only exists in ArtifactPreview.tsx:91 and ArtifactBlock.tsx:107.
- Visual gaps:
  - Claude toolbar: "Copy" text button with icon + X close button, horizontally aligned in the panel header. 
  - AGI toolbar: Close button (X) in header, copy/download in a separate bottom bar.
  - Claude shows the artifact rendered as rich HTML. AGI shows it as syntax-highlighted code.

---

## IMG: 16_artifact-editor_html-code-source-view.png

- Feature: Artifact sidebar toggled to show the raw HTML source code view. The panel header shows the artifact title with "HTML" badge and "Copy" + close buttons. The code view shows full HTML source with CSS variables, CSS selectors, and HTML markup rendered with syntax highlighting and line numbers. This is the "Code" tab of the artifact panel -- a toggle between Preview and Code.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/16_artifact-editor_html-code-source-view.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx
  - apps/web/features/chat/components/artifacts/ArtifactPreview.tsx
- API endpoints: N/A
- Data flow:
  - ArtifactPreview has Preview/Code tabs (line 544-560), but it is NOT used in the ArtifactsPanel
  - ArtifactsPanel only shows code view via SyntaxHighlighter (always code, no preview toggle)
- Flaws:
  - [major] The AGI ArtifactsPanel ONLY shows the code view (SyntaxHighlighter) and has no preview toggle. Claude's panel supports toggling between rendered Preview and source Code view. The `ArtifactPreview` component has this toggle (Preview/Code tabs at line 544-560) but it is NOT mounted inside `ArtifactsPanel`. There are two disconnected artifact viewing systems.
  - [minor] Claude's code view shows line numbers left-aligned with a dark background and the artifact title + HTML badge in the header. AGI's ArtifactsPanel code view does show line numbers (SyntaxHighlighter showLineNumbers at line 125) which partially matches.
  - [minor] Claude's code view has a clean dark background matching the code editor. AGI uses bg-[#1e1e1e] at ArtifactsPanel.tsx:240 which is similar but the overall styling differs.
- Visual gaps:
  - Claude has a clear tab or toggle to switch between Preview and Code. AGI's panel is permanently in code view.
  - Claude shows the file type badge (HTML) inline with the artifact title. AGI shows the language label at the bottom right (ArtifactsPanel.tsx:157-159) in a subtle muted style.

---

## IMG: 17_chat-response_multiple-artifact-cards-download-all.png

- Feature: Chat response with three inline artifact cards in a vertical stack. Each card shows: document icon, artifact name ("Optiona grandtour", "Optionb relaxedclassic", "Optiond essentialamerica"), "Document - MD" type label, and an "Open in Antigravity" CTA button. Below the cards is a "Download all" button with a download icon. Standard message action buttons (copy, bookmark, retry, etc.) are shown below.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/17_chat-response_multiple-artifact-cards-download-all.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx
  - apps/web/features/chat/components/messages/MessageBubble.tsx
  - apps/web/features/chat/utils/artifact-detector.ts
- API endpoints: N/A
- Data flow:
  - Multiple markdown code blocks in assistant message are parsed by `extractArtifacts()` via `parseCodeBlocks()`
  - `MessageBubble` renders `InlineArtifactCards` with all extracted artifacts
  - `InlineArtifactCards` shows up to MAX_VISIBLE=3 cards (line 207), overflow shows "+N more" card
  - Each card click opens the ArtifactsPanel via `selectArtifact()` + `setPanelOpen(true)`
- Flaws:
  - [critical] No "Download all" button exists anywhere in the codebase. Claude shows this prominently below the artifact cards. The `InlineArtifactCards` component has no download functionality at all -- it only opens the panel. Users cannot download multiple artifacts at once.
  - [major] Claude's inline cards are full-width rows with document icon, name, type label, and CTA button. AGI's cards are tiny 80x60 pixel thumbnails (InlineArtifactCards.tsx:122-125) laid out horizontally -- completely different visual pattern.
  - [major] Claude shows "Document - MD" type label per card. AGI shows a tiny 8px uppercase badge (InlineArtifactCards.tsx:167) which is much less readable.
  - [major] Claude shows "Open in Antigravity" CTA button on each card for opening in an external app. AGI has no external-app integration.
- Visual gaps:
  - Claude: vertical stack of full-width cards with icon + name + type + CTA, followed by "Download all" row.
  - AGI: horizontal row of 80x60 pixel thumbnails with truncated names.
  - Claude cards have clear left-aligned layout with generous padding. AGI thumbnails are cramped.
  - No "Download all" action available in AGI.

---

## IMG: 18_artifact-sidebar_markdown-preview-split-view.png

- Feature: Artifact sidebar showing a rendered Markdown document preview. The panel header shows "Optiona grandtour - MD" with Copy button and close button. The right panel shows the rendered markdown with proper heading formatting ("Option A -- The Grand Tour"), metadata table (Route, Cities, Flights, Budget, Pace, Best for), section headings ("Why This Option", "Advantages"), and bullet lists. This is the Preview tab of a Markdown artifact.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/18_artifact-sidebar_markdown-preview-split-view.png
- Implementation status: missing
- Primary files:
  - apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx (lacks markdown preview)
  - apps/web/features/chat/components/messages/EnhancedMarkdownRenderer.tsx
  - apps/web/features/chat/components/artifacts/DocumentMessage.tsx
- API endpoints: N/A
- Data flow:
  - Markdown artifact is detected and stored in artifacts-store
  - ArtifactsPanel shows the markdown as raw source code via SyntaxHighlighter -- no rendered preview
  - DocumentMessage component has markdown rendering via EnhancedMarkdownRenderer but is only used for GeneratedDocument objects, NOT for artifact panel previews
  - ArtifactPreview has Preview/Code tabs but only renders HTML/React/SVG/Mermaid types -- markdown/document types fall through to code view (ArtifactPreview.tsx:116 maps 'document' to 'code')
- Flaws:
  - [critical] Markdown preview is completely missing in the artifact sidebar. Claude renders markdown artifacts as beautifully formatted rich text in the panel. AGI shows raw markdown source code only. The ArtifactPreview component explicitly maps 'document' type to 'code' rendering (line 116), skipping the preview path entirely.
  - [major] The `canPreview` check at ArtifactPreview.tsx:376 only includes `['html', 'react', 'svg', 'mermaid']` -- 'document' and 'code' types are excluded from preview rendering. Markdown documents will never show the Preview tab.
  - [major] Panel header does not show per-artifact title and type. Claude shows "Optiona grandtour - MD" but AGI shows generic "Artifacts" header.
- Visual gaps:
  - Claude: rendered markdown with proper headings, tables, bullet lists, and nice typography.
  - AGI: raw markdown source code with syntax highlighting.
  - Claude shows document metadata (title, type badge MD) in the panel header.
  - AGI panel header is generic.

---

## IMG: 19_artifact-sidebar_markdown-source-code-view.png

- Feature: Artifact sidebar toggled to show raw Markdown source code. The panel shows the same "Optiona grandtour - MD" artifact but in source/code view with raw markdown syntax visible (headings with #, **bold**, table with pipes, etc.). Line numbers are shown on the left. This is the Code tab complement to the Preview tab shown in image 18.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/19_artifact-sidebar_markdown-source-code-view.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx
- API endpoints: N/A
- Data flow:
  - Same artifact data from store
  - ArtifactsPanel renders with SyntaxHighlighter showing raw markdown with line numbers
- Flaws:
  - [minor] The code view is functionally similar between Claude and AGI -- both show raw markdown with line numbers. However, since AGI only has the code view and no preview toggle, the user cannot switch to the rendered preview.
  - [minor] Claude's panel header shows the artifact name + type (MD). AGI's shows "Artifacts" generic header with tab selection below.
  - [cosmetic] Line number styling differs slightly -- Claude's line numbers appear in a slightly different shade.
- Visual gaps:
  - Claude has a clear toggle indicator showing which view is active (Code view is currently selected).
  - AGI has no toggle since there is no preview mode for markdown.
  - Panel header lacks per-artifact title in AGI.

---

## IMG: 20_artifact-sidebar_rich-text-document-preview.png

- Feature: Artifact sidebar showing a rich text document (DOCX) preview. The panel header shows "Optiona grandtour - DOCX" with close button. The document is rendered with Google-Docs-like formatting: a title page section with "Option A" / "The Grand Tour" headings, navigation menu at top, and body text with metadata (Duration, Cities, Budget, Pace, Best for). Cards in chat show "Document: DOCX" type and "Open in TextEdit" CTA. The rendering uses a word-processor-like white-page-on-dark-background layout.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/20_artifact-sidebar_rich-text-document-preview.png
- Implementation status: missing
- Primary files:
  - apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx (no DOCX preview)
  - apps/web/features/chat/services/document-export-service.ts (export only, no preview)
  - apps/web/features/chat/components/artifacts/DocumentMessage.tsx
- API endpoints: N/A
- Data flow:
  - DOCX artifact would need to be detected by artifact-detector -- current detection only handles code block languages (ArtifactData.type: 'html' | 'react' | 'svg' | 'mermaid' | 'code' | 'document')
  - No DOCX viewer/renderer exists in the codebase
  - document-export-service.ts can EXPORT to DOCX (using `docx` library) but cannot PREVIEW DOCX documents
  - DocumentMessage renders markdown content via EnhancedMarkdownRenderer, not DOCX
- Flaws:
  - [critical] No DOCX preview capability exists. Claude shows DOCX documents rendered in a word-processor-like view within the artifact sidebar. AGI has no DOCX rendering -- only DOCX export. A DOCX viewer library would be needed.
  - [major] Inline cards in Claude show "Document: DOCX" type and "Open in TextEdit" button. AGI has no concept of DOCX artifacts and no external editor integration.
  - [major] Claude's DOCX preview uses a white-page-on-dark-background layout that mimics a word processor. AGI has no equivalent UI pattern.
- Visual gaps:
  - Claude: full word-processor-style DOCX preview with page layout, title section, and formatted body text.
  - AGI: nothing -- DOCX artifacts are not recognized or previewable.
  - Claude inline cards show DOCX type badge and "Open in TextEdit" CTA.
  - AGI has no DOCX artifact cards.

---

## IMG: 21_artifact-sidebar_pdf-preview-dark-mode.png

- Feature: Artifact sidebar showing a PDF document preview in dark mode. The panel header shows "Optiona grandtour - PDF" with checkmark icon and close button. The PDF preview shows a dark navy/gold themed document cover page with "OPTION A" subtitle, "The Grand Tour" in gold script, and a data dashboard row showing numbers (25, 9, 7, ~$10K). Below the cover are colored tab indicators. Inline cards in chat show "Document: PDF" with "Open in Preview" CTA buttons.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/21_artifact-sidebar_pdf-preview-dark-mode.png
- Implementation status: missing
- Primary files:
  - apps/web/features/chat/services/document-export-service.ts (export only)
  - apps/web/features/chat/services/document-export.ts (export only)
- API endpoints: N/A
- Data flow:
  - PDF artifacts are generated externally (e.g., via Python reportlab as shown in images 22/23/27)
  - No PDF viewer component exists in the web app
  - document-export-service.ts can generate PDFs using jsPDF (client-side) but cannot display/preview them
  - No PDF.js or equivalent viewer library is integrated
- Flaws:
  - [critical] No PDF preview capability exists. Claude renders PDFs in the artifact sidebar with full page rendering, zoom, and navigation. AGI has zero PDF viewing infrastructure -- only PDF generation/export via jsPDF.
  - [major] Inline cards in Claude show "Document: PDF" with "Open in Preview" (macOS Preview.app) CTA. AGI has no PDF artifact detection, no inline cards for PDFs, and no external-app integration.
  - [major] Claude's PDF preview includes dark-mode-aware rendering. AGI has no PDF rendering at all, let alone dark-mode support.
- Visual gaps:
  - Claude: rendered PDF with cover page, styled content, and dark-mode integration.
  - AGI: no PDF viewing capability.
  - Claude inline cards for PDF artifacts with "Open in Preview" CTA.
  - AGI: no PDF artifact cards.

---

## IMG: 22_inline-reasoning_pdf-generation-library-install.png

- Feature: Chat message showing Claude's inline reasoning/tool-use steps for PDF generation. The flow shows: reasoning/thinking block ("Devised three visually distinct PDF designs"), user intent interpretation, then sequential tool steps: "Read PDF skill" (with tool icon), planning text listing 3 PDF options, "Install reportlab" (Script badge), "PDF 1 - Grand Tour - Dark luxury magazine aesthetic" (with file name badge `pdf1_grand_luxury.py`), "Generate PDF 1" (Script badge), "Check letter spacing method name" (Script badge). Each step has an icon and optional file/script badge.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/22_inline-reasoning_pdf-generation-library-install.png
- Implementation status: N/A
- Primary files:
  - apps/web/features/chat/components/messages/ReasoningAccordion.tsx
  - apps/web/features/chat/components/messages/ToolTimeline.tsx
  - apps/web/features/chat/components/InlineToolResults/ToolResultCard.tsx
- API endpoints: N/A (this is Claude Code desktop-specific tool execution, not web chat)
- Data flow:
  - This screenshot shows Claude Code (desktop) executing Python scripts to generate PDFs using `reportlab`
  - The web app does not have a code execution sandbox for running Python scripts
  - Tool timeline and reasoning accordion exist but are for displaying metadata from API responses, not for executing code locally
- Flaws:
  - [major] The web app cannot execute arbitrary Python scripts to generate PDFs. Claude Code has a sandboxed execution environment. AGI web relies on client-side jsPDF for PDF generation which produces much simpler output compared to reportlab-generated PDFs.
  - [minor] The tool timeline UI (ToolTimeline.tsx) exists and can display sequential steps, but the actual PDF generation pipeline does not exist.
- Visual gaps:
  - Claude shows inline reasoning with expandable thinking blocks, sequential tool execution steps with script/file badges.
  - AGI has ReasoningAccordion and ToolTimeline components that could display similar UI, but the backend pipeline for PDF script execution is absent.

---

## IMG: 23_inline-tool-iterative-fixes_python-pdf-script.png

- Feature: Continuation of the PDF generation flow showing iterative fix steps. Steps include: "Fix charspace method" (Script), "Generate PDF 1 again" (Script), "Fix syntax errors" (Script), "Fix linedash" (Script), "Done" (checkmark icon). This demonstrates Claude Code's ability to iteratively debug and fix Python code during multi-step tool execution.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/23_inline-tool-iterative-fixes_python-pdf-script.png
- Implementation status: N/A
- Primary files:
  - apps/web/features/chat/components/messages/ToolTimeline.tsx
  - apps/web/features/chat/components/InlineToolResults/ToolResultCard.tsx
- API endpoints: N/A
- Data flow:
  - Same as IMG 22 -- this is Claude Code desktop tool execution, not replicable in web chat
  - ToolTimeline.tsx can render sequential step indicators with status icons
- Flaws:
  - [major] No iterative code execution + fix cycle exists in the web app. This is a desktop/CLI capability. The web app can display tool results received from an API but cannot drive the fix loop itself.
- Visual gaps:
  - Claude shows each fix step with "Script" badge and a final "Done" checkmark.
  - AGI's ToolTimeline could render similar UI but lacks the backend execution engine.

---

## IMG: 24_artifact-viewer_tabbed-content-with-print-button.png

- Feature: Artifact sidebar showing an HTML artifact with tabbed content navigation. The panel header shows "Usa trip options 2026 - HTML" with "Copy" button and close. The rendered HTML includes custom tabs at the top ("The Grand Tour", "West Coast Focus", "Relaxed Classic", "Essential America") allowing navigation between multiple trip options within a single HTML artifact. The chat message includes a table and mentions a "Print button" for physical copy output. The artifact renders a complex HTML page with styled tables, data cards, and a professional travel itinerary layout.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/24_artifact-viewer_tabbed-content-with-print-button.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/artifacts/ArtifactPreview.tsx
  - apps/web/features/chat/components/SandboxedIframe.tsx
  - apps/web/features/chat/components/ArtifactBlock.tsx
- API endpoints: N/A
- Data flow:
  - Complex HTML artifact with embedded JavaScript tabs is generated by Claude
  - ArtifactPreview can render HTML artifacts via SandboxedIframe (but is not mounted in the panel)
  - ArtifactBlock.tsx HtmlBlock renders HTML in an iframe with 340px height
  - SandboxedIframe uses cross-origin sandbox or srcDoc fallback
  - JavaScript inside the artifact handles tab switching and print functionality
- Flaws:
  - [critical] ArtifactsPanel does not render HTML artifacts as live previews -- it only shows source code. The `ArtifactPreview` component with `SandboxedIframe` can render HTML but is not integrated into the panel layout. Only the inline `ArtifactBlock` (HtmlBlock) renders HTML as a small 340px iframe in the chat flow.
  - [major] No print button integration. Claude's artifact panel implicitly supports the HTML artifact's own print button (via `window.print()`). AGI's SandboxedIframe CSP and sandbox attributes would likely block `window.print()` since the iframe has `sandbox="allow-scripts"` without `allow-modals` (which is needed for print dialogs).
  - [major] AGI's ArtifactBlock HtmlBlock is only 340px tall (ArtifactBlock.tsx:162), too small for complex tabbed content. Claude's panel gives the full sidebar height.
  - [minor] Claude shows "Open in Comet" button on the inline card. AGI has no external-editor CTA.
- Visual gaps:
  - Claude: full-height rendered HTML with interactive tabs, styled tables, and rich layout in the sidebar.
  - AGI: 340px inline iframe in chat flow (ArtifactBlock) OR syntax-highlighted code in the panel (ArtifactsPanel). Neither matches Claude's full sidebar preview.
  - Claude panel header shows artifact name + type badge. AGI panel header is generic.

---

## IMG: 27_inline-tool_sequential-pdf-generation.png

- Feature: Chat message showing the final steps of a multi-PDF generation workflow. Steps shown: "PDF 2 - West Coast Focus" (with file badge `pdf2_west_coast.py`), "Generate PDF 2" (Script), "Done" (checkmark), narrative text "Now PDF 3 -- completely different, clean minimal style.", "Created a file, ran a command" (collapsed detail), "PDF 3 - Essential America" (with file badge `pdf3_essential.py`), "Generate PDF 3" (Script), "Done" (checkmark), "All 3 generated. Now copy to outputs.", reasoning block "Analyzed three distinct PDF designs for user accessibility", "Copy to outputs" (Script), "Presented 3 files" (file icon), and final summary text.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/27_inline-tool_sequential-pdf-generation.png
- Implementation status: N/A
- Primary files:
  - apps/web/features/chat/components/messages/ToolTimeline.tsx
  - apps/web/features/chat/components/InlineToolResults/ToolResultCard.tsx
- API endpoints: N/A
- Data flow:
  - Same as IMG 22/23 -- Claude Code desktop tool execution generating PDFs via Python scripts
  - Multiple PDFs generated sequentially with different aesthetic styles
  - Files presented to user after generation
  - Web app has no equivalent pipeline
- Flaws:
  - [major] No multi-file generation pipeline exists in the web app. The web app can generate one PDF at a time via jsPDF client-side, but cannot orchestrate sequential Python script executions to create multiple styled PDFs.
  - [major] No "Presented 3 files" / file presentation UI exists. Claude shows a file icon with count. AGI has no multi-file presentation component.
  - [minor] Claude's inline tool steps with file badges (e.g., `pdf2_west_coast.py`) and "Script" labels are well-styled. AGI's ToolTimeline can show steps but the styling for file badges is less developed.
- Visual gaps:
  - Claude: sequential steps with file badges, done checkmarks, narrative text interspersed, and file presentation summary.
  - AGI: ToolTimeline and ReasoningAccordion exist but the multi-step PDF pipeline is absent.

---

## Summary of Cross-Cutting Flaws

### Critical (4)

1. **Markdown preview missing in artifact panel** -- ArtifactsPanel shows only syntax-highlighted source code. No rendered markdown view. ArtifactPreview has Preview/Code tabs but is NOT mounted in the panel, and even it maps 'document' type to 'code' (ArtifactPreview.tsx:116), bypassing preview rendering. @ ArtifactsPanel.tsx:110-136, ArtifactPreview.tsx:116
2. **No PDF viewer** -- No PDF.js or equivalent library is integrated. The app can generate/export PDFs via jsPDF but cannot display them. Claude shows full PDF page rendering in the sidebar. @ entire artifacts subsystem
3. **No DOCX viewer** -- No DOCX rendering capability exists. Only DOCX export via the `docx` library. @ entire artifacts subsystem
4. **No "Download all" button** -- Claude shows a "Download all" action below multiple artifact cards. AGI has zero download functionality on inline artifact cards. @ InlineArtifactCards.tsx

### Major (11)

1. **ArtifactPreview not mounted in ArtifactsPanel** -- Two disconnected artifact viewing systems exist. ArtifactsPanel renders code-only via SyntaxHighlighter. ArtifactPreview has full preview+code tabs with SandboxedIframe but is never used in the panel. @ ArtifactsPanel.tsx vs ArtifactPreview.tsx
2. **Inline artifact cards are tiny thumbnails** -- Claude shows full-width row cards with icon, name, type, and CTA button. AGI shows 80x60 pixel thumbnails. @ InlineArtifactCards.tsx:122-125
3. **No external-editor integration** -- Claude shows "Open in Comet", "Open in Antigravity", "Open in TextEdit", "Open in Preview" buttons. AGI has none. @ InlineArtifactCards.tsx
4. **Panel header is generic** -- Claude shows per-artifact title + type badge (e.g., "Optiona grandtour - MD"). AGI shows "Artifacts" with a count badge. @ ArtifactsPanel.tsx:200-218
5. **HTML preview not in sidebar panel** -- ArtifactsPanel only shows code. Live HTML preview exists only in ArtifactBlock (340px inline) and ArtifactPreview (unused). @ ArtifactsPanel.tsx:240
6. **Print blocked in sandboxed iframe** -- `sandbox="allow-scripts"` without `allow-modals` would prevent `window.print()`. @ SandboxedIframe.tsx:97-98
7. **No multi-file generation pipeline** -- Web app cannot execute Python scripts to generate styled PDFs. Limited to client-side jsPDF. @ document-export-service.ts
8. **No multi-file presentation UI** -- Claude shows "Presented 3 files" summary. AGI has no equivalent. @ entire chat components
9. **ArtifactBlock iframe height too small** -- HtmlBlock is 340px (ArtifactBlock.tsx:162), insufficient for complex tabbed HTML content. @ ArtifactBlock.tsx:162
10. **No iterative code execution capability** -- Claude Code can run, debug, and fix scripts iteratively. Web app has no sandboxed execution engine. @ entire web app
11. **document type maps to 'code' in preview** -- ArtifactPreview.tsx:116 `artifact.type === 'document' ? 'code' : artifact.type` prevents markdown documents from ever being previewed. @ ArtifactPreview.tsx:116

### Minor (5)

1. **Copy button placement differs** -- Claude: top toolbar. AGI: bottom action bar. @ ArtifactsPanel.tsx:139-160
2. **No refresh button in ArtifactsPanel** -- Only exists in ArtifactPreview.tsx. @ ArtifactsPanel.tsx
3. **Language label placement** -- Claude: inline with title in header. AGI: bottom-right muted text. @ ArtifactsPanel.tsx:157-159
4. **Type badge visibility** -- Claude: prominent type badge. AGI: 8px uppercase badge in thumbnail cards. @ InlineArtifactCards.tsx:167
5. **Panel width** -- 400px (ArtifactsPanel.tsx:194) is narrow vs Claude's ~50% screen width panel.

### Cosmetic (1)

1. **Line number styling** -- Slight shade differences between Claude and AGI code views. @ ArtifactsPanel.tsx:128-130

---

## Architecture Observation

The codebase has two disconnected artifact viewing systems:

1. **ArtifactsPanel** (the actual panel mounted in WebChatPage.tsx:700) -- shows only syntax-highlighted code via `SyntaxHighlighter`. No live preview for any artifact type.
2. **ArtifactPreview** (not mounted anywhere in the page layout) -- has full Preview/Code tabs with SandboxedIframe, version history, download options, share, fullscreen. Supports HTML/React/SVG/Mermaid preview.

Additionally, **ArtifactBlock** provides inline rendering in the chat flow (HTML iframe, CSV table, JSON highlighting, Mermaid diagrams) but is separate from both panel systems.

The key remediation is to replace the `ArtifactViewer` component inside `ArtifactsPanel` with the `ArtifactPreview` component, add markdown rendering support to ArtifactPreview, integrate a PDF viewer (e.g., react-pdf with PDF.js), and redesign `InlineArtifactCards` to match Claude's full-width card layout with download-all functionality.
