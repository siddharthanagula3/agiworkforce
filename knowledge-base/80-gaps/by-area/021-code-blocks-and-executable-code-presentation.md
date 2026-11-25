---
id: "GAPS-AREA-021"
type: "gap-list"
title: "Gaps: Code blocks and executable code presentation"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 21. Code blocks and executable code presentation

93 open gaps that touch this area. Area page: [20-features/021-code-blocks-and-executable-code-presentation](../../20-features/021-code-blocks-and-executable-code-presentation/README.md).

## CMP-CP137

**Monitor tool that watches a background process**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md), [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F092-08](../../20-features/092-tool-calling-and-agent-loop-components/F092-08-budgets-and-loop-limits.md)
- Detail: The agent has no monitor tool that wakes on output Background commands can be listed, read and stopped with /tasks, but the agent has no monitor tool that wakes on output.
- Evidence: searched: monitor, bash_output, kill_shell in apps/cli/src

## CMP-CP83

**TaskStop tool stops a background task or agent**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md), [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F092-08](../../20-features/092-tool-calling-and-agent-loop-components/F092-08-budgets-and-loop-limits.md)
- Detail: No tool stops a subagent by name command_stop (alias KillShell) stops a background command; no tool stops a subagent by name.
- Evidence: apps/cli/src/platform/runtime/tool_catalog.rs:246,225

## CMP-M37

**Switch a chart between static image and interactive**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md), [F022-03](../../20-features/022-rich-answers-and-structured-result-widgets/F022-03-charts-and-chart-data.md)
- Detail: Charts do not have a static or interactive switch.
- Evidence: searched: interactive chart, switch to interactive in src/features/chat

## CMP-MP26

**Preview HTML, React, SVG, Mermaid and Vega code blocks**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F021-05](../../20-features/021-code-blocks-and-executable-code-presentation/F021-05-explain-edit-beside-chat-and-open-in-coding-worksp.md)
- Detail: A code block has no Preview toggle for React or Vega Artifacts and Mermaid render in a safe preview, but a code block has no Preview toggle for React or Vega.
- Evidence: src/features/chat/components/SafeArtifactPreview.tsx; src/features/chat/components/MermaidDiagramBlock.tsx

## CMP-MP31

**Data analysis with code run in a sandbox**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md), [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md), [F057-02](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md), [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Detail: Interactive data tables from analysis were not found Code execution runs and its code shows in chat; interactive data tables from analysis were not found.
- Evidence: apps/mobile/src/features/chat/components/CodeExecutionBlock.tsx; lib/v1FeatureFlags.ts:codeExecution=true

## CMP-MP60

**Run a code block and see the console output**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md), [F057-02](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md), [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Detail: No Run on any code block Code the assistant already ran can be run again with a confirm and stopped; no Run on any code block.
- Evidence: apps/mobile/src/features/chat/components/CodeRunAgain.tsx:56; ToolCallTimeline.tsx:435

## CMP-W126

**Run Python in a canvas document or code file**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md), [F021-08](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md), [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md), [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md), [F028-01](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)
- Detail: Code in an artifact is shown and edited, and HTML or React previews run, but Python cannot be run in place.
- Evidence: packages/ui/unified-chat/src/components/ArtifactPanel.tsx (no run for Python); apps/web/lib/code-execution/ is chat tool only

## CMP-WP109

**Run Python from a code block**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md), [F021-08](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md), [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md), [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md), [F028-01](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)
- Detail: Ordinary code blocks have no Run button The assistant runs code in a cloud sandbox and the reply offers Run again; ordinary code blocks have no Run button.
- Evidence: apps/web/lib/tool-copy.ts:51; searched: Run Python, runCode in features/chat, unified-chat

## CMP-WP159

**Setting for internet access and code execution from chat and shell commands**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md), [F057-02](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md), [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Detail: There is no separate public-internet switch or workspace default You can turn cloud code execution on or off in Capabilities settings; there is no separate public-internet switch or workspace default.
- Evidence: apps/web/features/settings/sections/CapabilitiesSection.tsx:52,118; apps/web/lib/server/code-execution-policy.ts

## CMP-WP65

**Code block live preview (HTML, React, SVG, Mermaid, Vega)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F021-05](../../20-features/021-code-blocks-and-executable-code-presentation/F021-05-explain-edit-beside-chat-and-open-in-coding-worksp.md)
- Detail: No Vega found Static HTML preview, Mermaid diagrams, SVG galleries and chart blocks; no Vega found. Searched.
- Evidence: packages/ui/unified-chat/src/components/markdown/HtmlCodePreview.tsx:15-23; MermaidDiagram.tsx; searched: vega

## CMP-WP67

**More chart types and a static or interactive switch**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md), [F022-03](../../20-features/022-rich-answers-and-structured-result-widgets/F022-03-charts-and-chart-data.md)
- Detail: Charts cover bar, line, pie (donut) and scatter, with no area, histogram, box, radar or others and no static switch Charts cover bar, line, pie (donut) and scatter, with no area, histogram, box, radar or others and no static switch.
- Evidence: packages/contracts/types/src/chart-spec.ts:1-4

## CMP-WP70

**Interactive tables with sort and filter**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F020-05](../../20-features/020-markdown-and-text-rendering/F020-05-tables-and-table-actions.md), [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md)
- Detail: Sorting exists only in the spreadsheet artifact Answer tables copy and download as CSV; sorting exists only in the spreadsheet artifact.
- Evidence: packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:52-122; packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx:236

## CMP-WP99

**Capabilities switches for Artifacts, Inline visualizations and code execution**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Detail: There is no AI-powered artifacts switch Capabilities has Artifacts, Inline visualizations and Cloud code execution switches; there is no AI-powered artifacts switch.
- Evidence: apps/web/features/settings/sections/CapabilitiesSection.tsx:161; apps/web/features/settings/hooks/use-capabilities-preferences.ts:69

## GAP-AREA021-LW01

**The run panel shows the fixed English text Running Python while running, and other labels (Code Execution, Output, Stderr, Plot, Exit code) are fixed English too, although the runtime choice allows more than Python and the block code elsewhere uses translated labels.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-021
- Detail: Area 21. Code blocks and executable code presentation
- Evidence: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:76

## GAP-CAP-rich-content-rendering-06

**Code blocks: label, highlight, copy, edit, expand: VS Code and Chrome label and highlight; Chrome copy; line numbers, wrap toggle and collapse on all apps.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F021-01](../../20-features/021-code-blocks-and-executable-code-presentation/F021-01-language-label-and-syntax-colours.md), [F021-02](../../20-features/021-code-blocks-and-executable-code-presentation/F021-02-copy-and-download-a-code-block.md), [F021-03](../../20-features/021-code-blocks-and-executable-code-presentation/F021-03-open-a-code-block-full-screen.md), [F021-05](../../20-features/021-code-blocks-and-executable-code-presentation/F021-05-explain-edit-beside-chat-and-open-in-coding-worksp.md), [F021-11](../../20-features/021-code-blocks-and-executable-code-presentation/F021-11-line-numbers-line-wrapping-and-collapsing-long-blo.md)
- Requirement items: S21.01, S21.02, S21.03, S21.05, S21.06, S21.07, S21.08, S21.25
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-rich-content-rendering-07

**Code download, full screen and diff display: Download on three apps, full screen on mobile and extensions, Chrome diffs, error-line highlight everywhere.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F021-02](../../20-features/021-code-blocks-and-executable-code-presentation/F021-02-copy-and-download-a-code-block.md), [F021-03](../../20-features/021-code-blocks-and-executable-code-presentation/F021-03-open-a-code-block-full-screen.md), [F021-04](../../20-features/021-code-blocks-and-executable-code-presentation/F021-04-diff-changed-lines-and-error-line-highlight.md)
- Requirement items: S21.04, S21.08, S21.09, S21.10, S21.11
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-rich-content-rendering-09

**Run code from a block with output: Run Python partial on web; no run in canvas Python (W126); duration, stdin, reset; mobile permission text.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md), [F021-08](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md), [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md), [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md)
- Requirement items: S21.12, S21.13, S21.14, S21.15, S21.16, S21.17, S21.18, S21.19, S21.20, S21.21, S21.22, S21.23, S21.29, S21.30
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-rich-content-rendering-25

**Terminal and editor rendering: Open-in-full-view hand-off for unrendered parts; VS Code highlight.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F020-06](../../20-features/020-markdown-and-text-rendering/F020-06-math-formulas.md), [F021-01](../../20-features/021-code-blocks-and-executable-code-presentation/F021-01-language-label-and-syntax-colours.md), [F022-03](../../20-features/022-rich-answers-and-structured-result-widgets/F022-03-charts-and-chart-data.md)
- Requirement items: S20.19, S20.20, S21.01, S21.02, S22.08
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-tools-and-code-execution-01

**Sandboxed code execution in chat: Web cloud sandbox is not switched on in production per the ledger. Mobile data analysis in a sandbox and run-code are partial. A tool-step failure showed 'No module named pymupdf' in the web sandbox.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md), [F057-02](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md), [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Requirement items: S21.12, S57.05, S57.10, S57.11
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-tools-and-code-execution-02

**Code execution and file creation switch with admin control: Web admin switches and the internet-access setting are partial per the comparison.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Requirement items: S21.29
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-tools-and-code-execution-05

**Interactive charts and tables from analysis: Static/interactive switch, more chart types and sortable tables partial; plots missing on mobile, CLI and VS Code.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md)
- Requirement items: S21.20
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-tools-and-code-execution-07

**Run code from a code block and Python in canvas: No Python in canvas; no stdin panel, runtime reset, retry or stop on web and desktop (partial).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Requirement items: S21.12, S21.13
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-tools-and-code-execution-08

**Execution output, errors and generated files display: Duration, plots, unsupported-runtime state and error-line highlight are missing on several apps. A file card in a human web test had no download.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md), [F021-08](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md), [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md)
- Requirement items: S21.15, S21.16, S21.17, S21.18, S21.19, S21.20, S21.30
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-CAP-tools-and-code-execution-09

**Code block presentation and actions: Line numbers, wrapping toggle, collapse missing on all six; Chrome and VS Code gaps.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F021-01](../../20-features/021-code-blocks-and-executable-code-presentation/F021-01-language-label-and-syntax-colours.md), [F021-02](../../20-features/021-code-blocks-and-executable-code-presentation/F021-02-copy-and-download-a-code-block.md), [F021-03](../../20-features/021-code-blocks-and-executable-code-presentation/F021-03-open-a-code-block-full-screen.md), [F021-11](../../20-features/021-code-blocks-and-executable-code-presentation/F021-11-line-numbers-line-wrapping-and-collapsing-long-blo.md)
- Requirement items: S21.01, S21.02, S21.03, S21.04, S21.05, S21.06, S21.07, S21.08
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-tools-and-code-execution-10

**Code block live preview (HTML, React, SVG, Mermaid, Vega): Vega and some formats partial; after Stop the edited artifact showed as raw HTML code, not a card.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F021-05](../../20-features/021-code-blocks-and-executable-code-presentation/F021-05-explain-edit-beside-chat-and-open-in-coding-worksp.md)
- Requirement items: S21.25
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-tools-and-code-execution-26

**Multi-step tool loop, parallel calls and background tasks: Stop is partial on web and desktop; a stopped answer raised an 'Agent run failed' notice.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md), [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F092-08](../../20-features/092-tool-calling-and-agent-loop-components/F092-08-budgets-and-loop-limits.md)
- Requirement items: S21.22, S92.10, S92.11, S92.20, S92.22, S92.28, S92.30
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-tools-and-code-execution-27

**Execution location and boundary labels: Per-call location label not confirmed.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Requirement items: S21.29
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-F021-01-01

**VS Code has no language label and no colours.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-01](../../20-features/021-code-blocks-and-executable-code-presentation/F021-01-language-label-and-syntax-colours.md)
- Detail: Affects: VS Code users. Work needed: Reuse the shared highlighter and add a label in the VS Code renderer.
- Evidence: apps/extension-vscode/src/webview/render.ts:44-58

## GAP-F021-01-02

**Unlabelled-fence wording differs by app (text, Plain text, code).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-01](../../20-features/021-code-blocks-and-executable-code-presentation/F021-01-language-label-and-syntax-colours.md)
- Detail: Affects: All apps. Work needed: Pick one wording; owner decision.
- Evidence: MarkdownContent.tsx:734; CodeCard.tsx:387; markdown_renderer.rs:185

## GAP-F021-01-03

**Brief marks Chrome missing but code exists; brief code citations for mobile and CLI are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-01](../../20-features/021-code-blocks-and-executable-code-presentation/F021-01-language-label-and-syntax-colours.md)
- Detail: Affects: Documentation and testers. Work needed: Update the brief rows.
- Evidence: apps/extension/src/features/side-panel/markdown.ts:314-386

## GAP-F021-01-04

**No web install of a client failure sink was found, so highlight failures may go unreported on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-01](../../20-features/021-code-blocks-and-executable-code-presentation/F021-01-language-label-and-syntax-colours.md)
- Detail: Affects: Web. Work needed: Confirm and install a sink on web if absent.
- Evidence: search found setClientFailureSink only in unified-chat and apps/desktop/src/services/clientFailureReporting.ts

## GAP-F021-01-05

**Three separate highlighters (Shiki, syntect, hand-written mobile tokenizer) give different colours and language coverage.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-01](../../20-features/021-code-blocks-and-executable-code-presentation/F021-01-language-label-and-syntax-colours.md)
- Detail: Affects: Mobile, CLI. Work needed: Decide whether parity of language lists is required.
- Evidence: syntaxHighlight.ts; markdown_renderer.rs

## GAP-F021-01-NOTBUILT

**Language label and syntax colours: not built on VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code
- Features: [F021-01](../../20-features/021-code-blocks-and-executable-code-presentation/F021-01-language-label-and-syntax-colours.md)
- Requirement items: S21.01, S21.02
- Detail: VS Code: S21.01, S21.02

## GAP-F021-02-01

**CLI has no per-block copy or file download; /copy takes only the last block.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-02](../../20-features/021-code-blocks-and-executable-code-presentation/F021-02-copy-and-download-a-code-block.md)
- Detail: Affects: CLI. Work needed: Add block selection and save-to-file.
- Evidence: claude_parity.rs:1152; tui_app.rs:5915

## GAP-F021-02-02

**VS Code and Chrome have no download.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-02](../../20-features/021-code-blocks-and-executable-code-presentation/F021-02-copy-and-download-a-code-block.md)
- Detail: Affects: VS Code, Chrome. Work needed: Add a download action.
- Evidence: render.ts:36-41; markdown.ts:314-347

## GAP-F021-02-03

**Plan limits for download: none established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-02](../../20-features/021-code-blocks-and-executable-code-presentation/F021-02-copy-and-download-a-code-block.md)
- Detail: Affects: All. Work needed: Owner decision if any limit is wanted.
- Evidence: none found in CodeBlock.tsx

## GAP-F021-02-NOTBUILT

**Copy and download a code block: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F021-02](../../20-features/021-code-blocks-and-executable-code-presentation/F021-02-copy-and-download-a-code-block.md)
- Requirement items: S21.04
- Detail: CLI: S21.04; VS Code: S21.04

## GAP-F021-03-01

**No test opens the dialog on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-03](../../20-features/021-code-blocks-and-executable-code-presentation/F021-03-open-a-code-block-full-screen.md)
- Detail: Affects: Web, Desktop. Work needed: Add a dialog open, close and focus test.
- Evidence: CodeBlock.test.tsx titles list no expand case

## GAP-F021-03-02

**Diff blocks are not coloured in the expanded view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-03](../../20-features/021-code-blocks-and-executable-code-presentation/F021-03-open-a-code-block-full-screen.md)
- Detail: Affects: Web, Desktop. Work needed: Render DiffLines in the dialog when language is diff.
- Evidence: CodeBlock.tsx:274 renders only highlighted

## GAP-F021-03-03

**CLI, VS Code and Chrome have no expanded view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-03](../../20-features/021-code-blocks-and-executable-code-presentation/F021-03-open-a-code-block-full-screen.md)
- Detail: Affects: those apps. Work needed: Decide if needed for terminal and panel surfaces.
- Evidence: brief S21.08

## GAP-F021-03-NOTBUILT

**Open a code block full screen: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F021-03](../../20-features/021-code-blocks-and-executable-code-presentation/F021-03-open-a-code-block-full-screen.md)
- Requirement items: S21.08
- Detail: CLI: S21.08; VS Code: S21.08; Chrome: S21.08

## GAP-F021-04-01

**Error-line highlight is not built in any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-04](../../20-features/021-code-blocks-and-executable-code-presentation/F021-04-diff-changed-lines-and-error-line-highlight.md)
- Detail: Affects: All apps. Work needed: Define input (execution error with line) and a line mark in CodeBlock, CodeCard, and others.
- Evidence: search for errorLine and related names returned no code

## GAP-F021-04-02

**Web treats only fence word 'diff' as a diff.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-04](../../20-features/021-code-blocks-and-executable-code-presentation/F021-04-diff-changed-lines-and-error-line-highlight.md)
- Detail: Affects: Web, Desktop. Work needed: Use the language alias resolution.
- Evidence: CodeBlock.tsx:225 vs CodeCard.tsx diff, patch, udiff

## GAP-F021-04-03

**File header lines are coloured as add or remove on web and mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-04](../../20-features/021-code-blocks-and-executable-code-presentation/F021-04-diff-changed-lines-and-error-line-highlight.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Treat ---, +++ and @@ lines separately as VS Code does.
- Evidence: CodeBlock.tsx:40; CodeCard.tsx:73-77

## GAP-F021-04-04

**Chrome shows diffs as plain code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-04](../../20-features/021-code-blocks-and-executable-code-presentation/F021-04-diff-changed-lines-and-error-line-highlight.md)
- Detail: Affects: Chrome. Work needed: Add diff rows to the side panel.
- Evidence: no diff code in markdown.ts

## GAP-F021-04-05

**Diffs are not coloured in the web expanded dialog.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-04](../../20-features/021-code-blocks-and-executable-code-presentation/F021-04-diff-changed-lines-and-error-line-highlight.md)
- Detail: Affects: Web, Desktop. Work needed: Reuse DiffLines.
- Evidence: CodeBlock.tsx:274

## GAP-F021-04-NOTBUILT

**Diff, changed lines and error-line highlight: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F021-04](../../20-features/021-code-blocks-and-executable-code-presentation/F021-04-diff-changed-lines-and-error-line-highlight.md)
- Requirement items: S21.09, S21.10, S21.11
- Detail: Web: S21.11; Desktop: S21.11; Mobile: S21.11; CLI: S21.11; VS Code: S21.11; Chrome: S21.09, S21.10, S21.11

## GAP-F021-05-01

**Explain exists only on VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-05](../../20-features/021-code-blocks-and-executable-code-presentation/F021-05-explain-edit-beside-chat-and-open-in-coding-worksp.md)
- Detail: Affects: Web, Desktop, Mobile, CLI, Chrome. Work needed: Add an Explain action that sends the block as a chat message.
- Evidence: brief S21.24; no Explain control in CodeBlock.tsx or CodeCard.tsx

## GAP-F021-05-02

**Open in coding workspace: no real code found behind the brief's citation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-05](../../20-features/021-code-blocks-and-executable-code-presentation/F021-05-explain-edit-beside-chat-and-open-in-coding-worksp.md)
- Detail: Affects: VS Code, Web, Desktop. Work needed: Decide what the action is; fix or remove the brief claim.
- Evidence: ChatStateManager.ts:1324 is effort-picker code; render.ts:18 is an import

## GAP-F021-05-03

**Web Edit fails silently when no block matches.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-05](../../20-features/021-code-blocks-and-executable-code-presentation/F021-05-explain-edit-beside-chat-and-open-in-coding-worksp.md)
- Detail: Affects: Web, Desktop. Work needed: Show a notice.
- Evidence: MessageBubble.tsx:1458-1459

## GAP-F021-05-04

**The brief says mobile Edit is missing, but it exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-05](../../20-features/021-code-blocks-and-executable-code-presentation/F021-05-explain-edit-beside-chat-and-open-in-coding-worksp.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: CodeCard.tsx:400-415,524

## GAP-F021-05-05

**Explain failure behaviour unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-05](../../20-features/021-code-blocks-and-executable-code-presentation/F021-05-explain-edit-beside-chat-and-open-in-coding-worksp.md)
- Detail: Affects: VS Code. Work needed: Read sendMessage failure path and add a test.
- Evidence: webviewContent.ts:5477-5481

## GAP-F021-05-NOTBUILT

**Explain, edit beside chat, and open in coding workspace: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F021-05](../../20-features/021-code-blocks-and-executable-code-presentation/F021-05-explain-edit-beside-chat-and-open-in-coding-worksp.md)
- Requirement items: S21.24, S21.25, S21.26
- Detail: Web: S21.24, S21.26; Desktop: S21.24, S21.26; CLI: S21.24, S21.25; VS Code: S21.25; Chrome: S21.24, S21.25, S21.26

## GAP-F021-06-01

**No apply-to-files for Web, Desktop, Mobile and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-06](../../20-features/021-code-blocks-and-executable-code-presentation/F021-06-apply-suggested-code-to-repository-files.md)
- Detail: Affects: those apps. Work needed: Decide scope per surface; hosted Desktop and web have no local file access except through Code sessions.
- Evidence: brief S21.27; no control in CodeBlock.tsx or CodeCard.tsx

## GAP-F021-06-02

**CLI does not apply a reply code block; it reviews changes already made.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-06](../../20-features/021-code-blocks-and-executable-code-presentation/F021-06-apply-suggested-code-to-repository-files.md)
- Detail: Affects: CLI. Work needed: Clarify the requirement or add block-to-file apply.
- Evidence: tui_app.rs:6582-6667

## GAP-F021-06-03

**VS Code Apply on an empty selection inserts at the cursor, not replacing a whole file.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-06](../../20-features/021-code-blocks-and-executable-code-presentation/F021-06-apply-suggested-code-to-repository-files.md)
- Detail: Affects: VS Code. Work needed: Decide if a whole-file target is wanted.
- Evidence: ChatStateManager.ts:2275-2277

## GAP-F021-06-04

**Discard in the CLI review is permanent for the hunk; OS Trash or checkpoint use was not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-06](../../20-features/021-code-blocks-and-executable-code-presentation/F021-06-apply-suggested-code-to-repository-files.md)
- Detail: Affects: CLI. Work needed: Read the discard code and add a checkpoint if missing.
- Evidence: tui_app.rs:1357-1367; AGENTS.md section 9

## GAP-F021-06-05

**Brief code citations are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-06](../../20-features/021-code-blocks-and-executable-code-presentation/F021-06-apply-suggested-code-to-repository-files.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: ChatStateManager.ts:1350 and tui_app.rs:3974 do not match

## GAP-F021-06-NOTBUILT

**Apply suggested code to repository files: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F021-06](../../20-features/021-code-blocks-and-executable-code-presentation/F021-06-apply-suggested-code-to-repository-files.md)
- Requirement items: S21.27
- Detail: Web: S21.27; Desktop: S21.27; Mobile: S21.27; Chrome: S21.27

## GAP-F021-07-01

**No input or stdin entry**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Detail: Affects: All apps. Work needed: Add an optional input field to the tool schema, composer UI and sandbox call.
- Evidence: execution-tools.ts:80-83; brief S21.14

## GAP-F021-07-02

**Person cannot choose the runtime or language in chat; only the AGI Code page lets them pick a harness, and not after start**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Decide if a chat runtime choice is wanted; if so add a selector and pass it as the language.
- Evidence: execution-tools.ts:80; apps/web/features/code/code-runtime.ts:32-39

## GAP-F021-07-03

**Silent auto-off of the toggle when the model changes**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Detail: Affects: Web and desktop. Work needed: Show a short notice naming the reason.
- Evidence: ChatComposerNew.tsx:1715-1719

## GAP-F021-07-04

**Mobile hides Run code with no explanation**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Detail: Affects: Mobile. Work needed: Show a disabled row with a reason.
- Evidence: AddToChatSheet.tsx:249-255

## GAP-F021-07-05

**No per-run permission explanation on web or mobile; Chrome has no run control**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Detail: Affects: Web, desktop, mobile, Chrome. Work needed: Add a first-run explanation in chat.
- Evidence: brief S21.29; CapabilitiesSection.tsx:115 is settings text only

## GAP-F021-07-06

**Sandbox switched on in production is unconfirmed**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Owner switch-on and a live check.
- Evidence: brief S21.21 Unfinished; gate.ts:20-28

## GAP-F021-07-NOTBUILT

**Run code from the chat: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Requirement items: S21.12, S21.13, S21.14, S21.29, S21.30
- Detail: Web: S21.14; Desktop: S21.14; Mobile: S21.13, S21.14, S21.29, S21.30; CLI: S21.13, S21.14, S21.30; VS Code: S21.13, S21.14; Chrome: S21.12, S21.13, S21.14, S21.29, S21.30

## GAP-F021-08-01

**No duration in the web, desktop and Chrome panel**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-08](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md)
- Detail: Affects: Web, desktop, Chrome. Work needed: Carry elapsed time in the result and draw it.
- Evidence: CodeExecutionBlock.tsx:35-133; bubbles.ts:660-705

## GAP-F021-08-02

**Managed sandbox results have no separate stderr or exit code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-08](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Return stdout, stderr and an error flag separately and map them into the panel.
- Evidence: execution-tools.ts:73-75; runtime.ts:1240-1253

## GAP-F021-08-03

**Running line always says Python**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-08](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md)
- Detail: Affects: Web, mobile. Work needed: Use the real language.
- Evidence: CodeExecutionBlock.tsx:76; mobile CodeExecutionBlock.tsx:23

## GAP-F021-08-04

**No dependency install status anywhere**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-08](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md)
- Detail: Affects: All apps. Work needed: Emit install events from the sandbox and show a status row.
- Evidence: brief S21.28; no match found

## GAP-F021-08-05

**Web panel code duplicates the shared panel**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-08](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md)
- Detail: Affects: Web. Work needed: Use one component (doc: AGENTS.md section 3 ownership rule).
- Evidence: CodeExecutionBlock.tsx vs CodeExecutionOutput.tsx

## GAP-F021-08-06

**The brief's rows differ from the code: CLI duration exists and the web tool row has duration**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-08](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md)
- Detail: Affects: Documentation. Work needed: Correct the brief rows.
- Evidence: tui_app.rs:374-379; ToolTimeline.tsx:755

## GAP-F021-08-NOTBUILT

**Execution output panel: not built on Web, Desktop, Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code
- Features: [F021-08](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md)
- Requirement items: S21.17, S21.28
- Detail: Web: S21.17, S21.28; Desktop: S21.17, S21.28; Mobile: S21.28; CLI: S21.17, S21.28; VS Code: S21.28

## GAP-F021-09-01

**Web live path never sets images on the result**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md)
- Detail: Affects: Web, desktop (Electron). Work needed: Confirm which path shows plots from a managed run and wire figures into the panel or the file list.
- Evidence: useChatStream.ts:3598-3603

## GAP-F021-09-02

**Mobile mapper drops images**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md)
- Detail: Affects: Mobile. Work needed: Pass images through.
- Evidence: apps/mobile/stores/chat/codeExecutionResult.ts:13-17

## GAP-F021-09-03

**No notice when an image is skipped**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md)
- Detail: Affects: Web. Work needed: Show a short line.
- Evidence: CodeExecutionBlock.tsx:42-43

## GAP-F021-09-04

**Chrome, CLI, VS Code do not show plots**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md)
- Detail: Affects: Chrome, CLI, VS Code. Work needed: Add image or file link display.
- Evidence: freeTrialClient.ts:879-908; webviewContent.ts:8950

## GAP-F021-09-05

**Brief says mobile plots missing; code shows plots exist**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md)
- Detail: Affects: Documentation. Work needed: Correct the brief rows.
- Evidence: CodeExecutionPlots.tsx; CodeRunAgain.tsx:188-200

## GAP-F021-09-NOTBUILT

**Generated files and plots: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md)
- Requirement items: S21.19, S21.20
- Detail: Mobile: S21.20; CLI: S21.19, S21.20; VS Code: S21.19, S21.20; Chrome: S21.20

## GAP-F021-10-01

**No web or desktop (Electron) rerun control although the endpoint exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md)
- Detail: Affects: Web, desktop. Work needed: Add Run again to the web panel through useConfirmAction.
- Evidence: route.ts exists; no caller in apps/web

## GAP-F021-10-02

**No reset runtime control**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md)
- Detail: Affects: All apps. Work needed: Add a confirmed Reset code session action that kills the conversation sandbox.
- Evidence: brief S21.23; none found in code

## GAP-F021-10-03

**CLI and VS Code stop is whole-turn, not per run**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md)
- Detail: Affects: CLI, VS Code. Work needed: Optional per-command stop.
- Evidence: tui_app.rs:8441-8449; webviewContent.ts:5870

## GAP-F021-10-04

**Mobile Stop leaves the server run possibly continuing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md)
- Detail: Affects: Mobile. Work needed: Confirm the abort reaches the sandbox and say so.
- Evidence: CodeRunAgain.tsx:20-21

## GAP-F021-10-05

**Brief marks VS Code retry and reset done, not confirmed**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md)
- Detail: Affects: VS Code. Work needed: Re-check and correct the brief.
- Evidence: webviewContent.ts:3722 and :2510 are unrelated

## GAP-F021-10-06

**No retry on Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md)
- Detail: Affects: Chrome. Work needed: Decide scope.
- Evidence: none found

## GAP-F021-10-NOTBUILT

**Retry, stop and reset a run: not built on Web, Desktop, Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, Chrome
- Features: [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md)
- Requirement items: S21.21, S21.22, S21.23
- Detail: Web: S21.23; Desktop: S21.23; Mobile: S21.23; CLI: S21.21, S21.23; Chrome: S21.21, S21.22, S21.23

## GAP-F021-10-PARTLY

**Retry, stop and reset a run: partly built on Web, Desktop, Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md)
- Requirement items: S21.21, S21.22
- Detail: Web S21.21: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S21.22: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Desktop S21.21: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-meteri

## GAP-F021-11-01

**No line numbers, wrap switch or collapse in web and desktop chat blocks**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-11](../../20-features/021-code-blocks-and-executable-code-presentation/F021-11-line-numbers-line-wrapping-and-collapsing-long-blo.md)
- Detail: Affects: Web, desktop. Work needed: Add to the shared CodeBlock.
- Evidence: CodeBlock.tsx; codeBlock.css

## GAP-F021-11-02

**Line numbers only in the mobile full-screen viewer**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-11](../../20-features/021-code-blocks-and-executable-code-presentation/F021-11-line-numbers-line-wrapping-and-collapsing-long-blo.md)
- Detail: Affects: Mobile. Work needed: Optional inline line numbers.
- Evidence: ArtifactFullScreen.tsx:161-181; CodeCard.tsx

## GAP-F021-11-03

**No wrap setting on web; the product definition lists code wrapping under Appearance**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-11](../../20-features/021-code-blocks-and-executable-code-presentation/F021-11-line-numbers-line-wrapping-and-collapsing-long-blo.md)
- Detail: Affects: Web, desktop. Work needed: Add to the Appearance page.
- Evidence: docs/product/definition.md:279

## GAP-F021-11-04

**CLI, VS Code and Chrome have none**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-11](../../20-features/021-code-blocks-and-executable-code-presentation/F021-11-line-numbers-line-wrapping-and-collapsing-long-blo.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Decide per surface.
- Evidence: markdown_renderer.rs; render.ts:44-49

## GAP-F021-11-05

**Brief says mobile missing for all three items, but wrap, collapse and full-screen line numbers exist**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F021-11](../../20-features/021-code-blocks-and-executable-code-presentation/F021-11-line-numbers-line-wrapping-and-collapsing-long-blo.md)
- Detail: Affects: Documentation. Work needed: Correct the brief rows.
- Evidence: CodeCard.tsx:417-575; store.ts:20

## GAP-F021-11-NOTBUILT

**Line numbers, line wrapping and collapsing long blocks: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F021-11](../../20-features/021-code-blocks-and-executable-code-presentation/F021-11-line-numbers-line-wrapping-and-collapsing-long-blo.md)
- Requirement items: S21.05, S21.06, S21.07
- Detail: CLI: S21.05, S21.06, S21.07; VS Code: S21.05, S21.06, S21.07; Chrome: S21.05, S21.06, S21.07
