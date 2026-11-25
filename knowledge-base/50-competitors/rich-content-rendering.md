---
id: "COMP-rich-content-rendering"
type: "competitor-trace"
title: "Rich content rendering"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Rich content rendering: competitors to requirements

AGI renders the basics (Markdown, tables, code, math, Mermaid, charts, citations, inline interactive cards) on web, desktop and mobile, per code reading. The extensions and CLI trail. Missing: table copy, line numbers, code wrap, news, weather, sports, flights and shopping cards, flashcards, tappable entity panels, inline web images on web. Competitors document visuals and cards, not plain Markdown. No rendering was seen working by a person, except an HTML artifact preview.

**How the products divide this topic.** Review date 2026-11-22 for all competitor evidence. Claude (chat, support.claude.com): custom visuals (HTML/SVG diagrams, charts, interactive) inline on web and desktop, beta, all users, and not rendered in the iOS or Android apps; artifacts beside the chat; weather and recipe cards on web/desktop. Claude Code (code.claude.com): terminal and editor rendering only (syntax highlight toggle, OSC 8 links, 200-row table cap, LaTeX in the VS Code panel, mods with Markdown/Code/Svg elements); it connects to chat only through shared claude.ai sign-in and artifacts. ChatGPT (help.openai.com, chatgpt.com/pricing): writing blocks and code blocks with Preview for HTML, React, SVG, Mermaid and Vega; interactive charts; Intelligent UI (layouts, forms, buttons) on a current model generation for all plans; tappable highlights; inline web images. Codex (learn.chatgpt.com): visualizations are not rendered in Codex CLI/IDE; the desktop artifacts viewer previews files; CLI has no preview. Catalogue rows tagged product chatgpt with a learn.chatgpt.com url are the Codex coding tool or its docs. Plan limits: ChatGPT interactive tables and charts are Plus and Pro only on the pricing page, while the release notes and Intelligent UI page list all plans; the two conflict and are not reconciled. Claude Data, Sheets and Motion templates are plan-gated. The catalogue has almost nothing on Claude chat Markdown, code-block copy or table behaviour, so those are unknown, not no.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-rich-content-rendering-01](#cap-rich-content-rendering-01) | Core Markdown text | unknown | unknown | partly built | code inspected only |
| [CAP-rich-content-rendering-02](#cap-rich-content-rendering-02) | Streaming Markdown and unclosed fences | unknown | unknown | built | seen working by a person |
| [CAP-rich-content-rendering-03](#cap-rich-content-rendering-03) | Safe rendering of embedded markup and links | partly | partly | built | code inspected only |
| [CAP-rich-content-rendering-04](#cap-rich-content-rendering-04) | Tables that fit and scroll | partly | partly | built | code inspected only |
| [CAP-rich-content-rendering-05](#cap-rich-content-rendering-05) | Table actions: copy, download, sort, filter | partly | partly | partly built | not verified |
| [CAP-rich-content-rendering-06](#cap-rich-content-rendering-06) | Code blocks: label, highlight, copy, edit, expand | partly | yes | partly built | code inspected only |
| [CAP-rich-content-rendering-07](#cap-rich-content-rendering-07) | Code download, full screen and diff display | partly | partly | partly built | code inspected only |
| [CAP-rich-content-rendering-08](#cap-rich-content-rendering-08) | Live preview of HTML, React, SVG, Mermaid and Vega code | partly | yes | partly built | seen failing by a person |
| [CAP-rich-content-rendering-09](#cap-rich-content-rendering-09) | Run code from a block with output | partly | partly | partly built | code inspected only |
| [CAP-rich-content-rendering-10](#cap-rich-content-rendering-10) | Math typesetting | partly | partly | partly built | code inspected only |
| [CAP-rich-content-rendering-11](#cap-rich-content-rendering-11) | Diagrams from Mermaid text | partly | yes | partly built | code inspected only |
| [CAP-rich-content-rendering-12](#cap-rich-content-rendering-12) | Inline custom visuals written by the model | yes | yes | partly built | code inspected only |
| [CAP-rich-content-rendering-13](#cap-rich-content-rendering-13) | Keep or export a visual | yes | partly | not built | not verified |
| [CAP-rich-content-rendering-14](#cap-rich-content-rendering-14) | Charts in answers with data view | yes | yes | partly built | code inspected only |
| [CAP-rich-content-rendering-15](#cap-rich-content-rendering-15) | Cards, forms and interactive layouts in answers | partly | yes | partly built | code inspected only |
| [CAP-rich-content-rendering-16](#cap-rich-content-rendering-16) | Setting to reduce generated visuals | unknown | yes | built | not verified |
| [CAP-rich-content-rendering-17](#cap-rich-content-rendering-17) | Citations and sources | yes | yes | partly built | seen failing by a person |
| [CAP-rich-content-rendering-18](#cap-rich-content-rendering-18) | Inline web images with attribution | partly | yes | partly built | not verified |
| [CAP-rich-content-rendering-19](#cap-rich-content-rendering-19) | Tappable highlights with a facts panel | unknown | yes | not built | not verified |
| [CAP-rich-content-rendering-20](#cap-rich-content-rendering-20) | Place, map, weather, recipe and shopping cards | yes | partly | partly built | not verified |
| [CAP-rich-content-rendering-21](#cap-rich-content-rendering-21) | Writing blocks and draft widgets | unknown | yes | partly built | not verified |
| [CAP-rich-content-rendering-22](#cap-rich-content-rendering-22) | Third-party app panels inside a reply | yes | unknown | partly built | not verified |
| [CAP-rich-content-rendering-23](#cap-rich-content-rendering-23) | Artifact panel for standalone outputs | yes | partly | built | seen failing by a person |
| [CAP-rich-content-rendering-24](#cap-rich-content-rendering-24) | Interactive learning visuals | unknown | yes | not built | not verified |
| [CAP-rich-content-rendering-25](#cap-rich-content-rendering-25) | Terminal and editor rendering | yes | partly | partly built | code inspected only |
| [CAP-rich-content-rendering-26](#cap-rich-content-rendering-26) | Rendering with no network and clear boundaries | unknown | unknown | partly built | not verified |

## CAP-rich-content-rendering-01 Core Markdown text

Headings, paragraphs, lists, task lists, blockquotes, rules, inline code, links, strikethrough and footnotes render as formatted text, not raw syntax.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 9 and 10 (message part renderers); docs/product/requirements.md 2.1). Every app renders the common Markdown elements the same way for any model or provider output. Rendering is on the device, so Local mode needs no server.

**With different models, providers and the one subscription.** Renderer reads text only, never the model id. No entitlement check. Works offline in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Done on all six apps except footnotes, which are missing on mobile, CLI, VS Code and Chrome; autolinks and selection unverified on CLI. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S20.01, S20.02, S20.03, S20.04, S20.05, S20.06, S20.07, S20.08, S20.09, S20.10, S20.12, S20.13, S20.14, S20.26
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:293`; `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:254`; `apps/cli/src/tui/markdown_renderer.rs:94`; `apps/extension-vscode/src/webview/render.ts:5`; `apps/extension/src/features/side-panel/markdown.ts:87`

**Gap.** Footnotes on four apps; CLI autolinks and selection unverified.

**Acceptance criteria**

1. Send one answer with every element listed on each app; none shows raw # or ** marks.
2. A [^1] footnote shows a superscript marker linked to a notes section on web.
3. Switch model and provider; the same answer text renders identically.

**Verification: code inspected only.** Ledger status from code reading. W-2 (web, Free and Premium) showed a plain-text arithmetic answer only; no Markdown element was checked by a person.

## CAP-rich-content-rendering-02 Streaming Markdown and unclosed fences

Text that is still arriving renders as formatted Markdown, and an open code fence shows as a code block until it closes.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity). Partial answers render formatted while streaming on every app, with no flicker of raw syntax and no broken half tokens.

**With different models, providers and the one subscription.** Provider-neutral: works on the text stream whatever the model. Same in Local mode.

**Current implementation, as this trace read it on 2026-11-24: built.** Done on all six apps per code reading. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S20.22, S20.23
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx:171`; `packages/ui/unified-chat/src/components/markdown/completeInlineTokens.ts:37`; `apps/cli/src/tui/tui_app.rs:3959`

**Gap.** none known; one stop-mid-stream defect: stopped artifact replies show raw HTML source (W-8).

**Acceptance criteria**

1. Stream a reply that has a table and a code fence; each appears formatted before the reply ends.
2. Stop mid-fence; the partial code still shows as a code block.

**Verification: seen working by a person.** W-1 scorecard (web): a 600-word story streamed and finished; Stop kept the partial text. Formatting of tables and fences while streaming was not checked. 6-defects W-8: Stop during an artifact shows raw HTML code in chat.

## CAP-rich-content-rendering-03 Safe rendering of embedded markup and links

Raw HTML or script in a reply is sanitized or shown inert, unsafe link schemes are refused, and generated interactive content runs in a sandbox.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork): Custom visuals are HTML-based and interactive; the catalogue does not describe the sandbox for chat visuals. Plans: all users. Apps: web, desktop.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt): Code block Preview renders HTML, React, SVG, Mermaid and Vega in a sandbox that may ask permission for outside resources. Plans: Varies. Apps: web, desktop, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 10.3 (artifact security)). Model output never executes on the host page; interactive content runs in a cross-origin sandbox without host credentials; external loads are controlled.

**With different models, providers and the one subscription.** Applies to every provider equally. In Local mode no external fetch happens without the user seeing it.

**Current implementation, as this trace read it on 2026-11-24: built.** Done on all six apps per code reading, including unsafe-scheme refusal on web, mobile, VS Code and Chrome; the CLI row has no status for link safety. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S20.24, S20.25
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/markdown/markdownSanitizeSchema.test.ts`; `packages/ui/unified-chat/src/components/markdown/HtmlCodePreview.tsx:63`; `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:286`

**Gap.** CLI link-safety status not recorded.

**Acceptance criteria**

1. A reply with a script tag and a javascript: link shows inert text and the link does not run.
2. An HTML preview cannot read the app's cookies or storage.

**Verification: code inspected only.** Ledger plus HtmlCodePreview uses a sandbox attribute (HtmlCodePreview.tsx:25,63). No person tested hostile output.

## CAP-rich-content-rendering-04 Tables that fit and scroll

Pipe tables render as a grid with a header; wide ones keep every column readable and scroll sideways only when needed.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/troubleshooting.md](https://code.claude.com/docs/en/troubleshooting.md): Markdown tables in the terminal show the first 200 rows with a count of the rest; the full table stays in the conversation and /copy copies all rows. Apps: cli.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes](https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes): Wide tables, code blocks and math scroll horizontally (macOS desktop app). Apps: desktop.

**AGI requirement** (stated requirement; source: docs/decisions/2026-11-13-founder-decisions.md (table decision)). A table is shown whole at message width, wraps text without splitting words, and scrolls sideways only if columns cannot keep their longest word. Same on the phone, the desktop app and both extensions.

**With different models, providers and the one subscription.** Layout depends only on content. Works offline in Local mode.

**Current implementation, as this trace read it on 2026-11-24: built.** Tables and wide-table scrolling done on all six apps per code reading. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S20.15, S20.16, S22.30
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:401`; `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:306`; `apps/cli/src/tui/markdown_renderer.rs:448`; `apps/mobile/src/features/chat/components/TableFullScreen.tsx`

**Gap.** Chrome comparison table row (S22.30) is missing; no row cap rule decided for terminal.

**Acceptance criteria**

1. A 10-column table at 390 px wide keeps no column narrower than its longest word and scrolls sideways.
2. A table with a 300-character URL cell breaks only that token.

**Verification: code inspected only.** Founder decision of 2026-11-13 says rendering was reworked; no scorecard row shows a person checking a table.

## CAP-rich-content-rendering-05 Table actions: copy, download, sort, filter

A rendered table offers copy, download as CSV or spreadsheet, and sorting or filtering in place.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Docs tables get sort column, merge cells and add row actions (Docs artifact, not chat answers). Apps: web, desktop.
- **ChatGPT: partly**
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Interactive tables and charts are Plus and Pro only. Plans: Plus, Pro. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Tables in answers can be copied and downloaded on every app, and sorted where the surface allows. Interactivity availability follows the one subscription entitlement and shows an upgrade label, not meters, on Free.

**With different models, providers and the one subscription.** Table download is a local action and needs no server in Local mode. If a plan gate is chosen it must come from the one entitlement system.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Download done on web and desktop; copy-table missing on all six; mobile, CLI, VS Code, Chrome have no download; sort and filter partial on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S20.17, S20.18
- Comparison list ids: WP70
- Code: `packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:122`; `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:406`

**Gap.** Copy-table on all apps; download on four apps; sort and filter beyond web.

**Acceptance criteria**

1. Press copy on a table and paste into a spreadsheet; columns land in cells.
2. Press download; the CSV opens with the same rows.
3. Sort a column on web; the order changes and can be reset.

**Verification: not verified.** No scorecard or defect row covers table actions.

## CAP-rich-content-rendering-06 Code blocks: label, highlight, copy, edit, expand

Code appears in its own block with a language label, syntax colours, a copy button, and where supported edit and full-screen view.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/interactive-mode.md](https://code.claude.com/docs/en/interactive-mode.md): Ctrl+T in the /theme picker turns code-block syntax coloring on or off (terminal tool). Apps: cli.
  - [https://code.claude.com/docs/en/settings-reference.md](https://code.claude.com/docs/en/settings-reference.md): syntaxHighlightingDisabled shows diffs, code blocks and previews as plain text, for example for screen readers. Apps: cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt): Code sits in its own block with a language label, copy, direct edit for supported blocks, ask-ChatGPT-to-edit and full-screen view. Plans: Varies. Apps: web, desktop, ios, android.
  - [https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes](https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes): Code blocks keep a copy button visible while scrolling. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). Every code block shows a language label, highlighting and an exact-copy control on every app, with a plain-text option for accessibility.

**With different models, providers and the one subscription.** Highlighting is client side; no provider or entitlement dependence; works in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Label and highlighting done on web, desktop, mobile, CLI; missing on VS Code and Chrome. Copy done everywhere except Chrome. Edit and full screen done on web and desktop. Line numbers, wrap toggle, collapse missing everywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S21.01, S21.02, S21.03, S21.05, S21.06, S21.07, S21.08, S21.25
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:181`; `packages/ui/unified-chat/src/components/markdown/HighlightedCode.tsx`; `apps/mobile/src/features/chat/components/CodeBlockCopyB*` (not found); `apps/extension-vscode/src/webview/render.ts:26`

**Gap.** VS Code and Chrome label and highlight; Chrome copy; line numbers, wrap toggle and collapse on all apps.

**Acceptance criteria**

1. Each code block shows its language and coloured tokens on every app.
2. Copy yields exactly the block text, with no label or line numbers.
3. A 200-line block can be collapsed and expanded.

**Verification: code inspected only.** Ledger from code reading; CodeBlock.tsx has copy, download, expand and edit imports (lines 2-21). No person check.

## CAP-rich-content-rendering-07 Code download, full screen and diff display

A block can be downloaded as a file with a sensible extension, opened full screen, and diffs show coloured added and removed lines.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/plugins/mods/gallery.md](https://code.claude.com/docs/en/plugins/mods/gallery.md): Code element shows source in the user's theme colors with optional line numbers, or unified diffs with word-level shading; plain text in VS Code. Apps: cli, desktop, ide.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt): Code blocks offer full-screen view; writing blocks can be saved or downloaded where available. Plans: Varies. Apps: web, desktop, ios, android.

**AGI requirement** (inferred; source: competitor parity). Download, full-screen and diff formatting exist on every app that shows code, so a reply's code can leave the chat as a file.

**With different models, providers and the one subscription.** Local action; no server; same in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Download done on web, desktop, mobile; missing CLI, VS Code, Chrome. Full screen done on web and desktop. Diff done on five apps, not Chrome. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S21.04, S21.08, S21.09, S21.10, S21.11
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/markdown/downloadTextFile.ts`; `packages/ui/unified-chat/src/components/markdown/codeFileName.ts`; `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:16`

**Gap.** Download on three apps, full screen on mobile and extensions, Chrome diffs, error-line highlight everywhere.

**Acceptance criteria**

1. Download a Python block; the file is named with .py.
2. Open a block full screen on desktop and close with Esc.
3. A diff block shows plus and minus lines in different colours.

**Verification: code inspected only.** Ledger status only.

## CAP-rich-content-rendering-08 Live preview of HTML, React, SVG, Mermaid and Vega code

A preview toggle on a code block draws the rendered page, component, image, diagram or chart in a sandbox.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/10165899-](https://support.claude.com/en/articles/10165899-) (this address is not in the saved catalogue; treat as unverified): Not used: no catalogue row names this toggle for Claude chat code blocks.
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Artifacts are self-contained content such as code, single-page sites, diagrams and dashboards that open beside the conversation, editable and shareable. Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android, cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt): Preview toggle renders HTML pages, React components, SVG images, Mermaid diagrams and Vega or Vega-Lite charts in a sandbox that may ask permission for outside resources. Plans: Varies. Apps: web, desktop, ios, android.

**AGI requirement** (inferred; source: competitor parity). A code block of a previewable language can be previewed in a sandbox on every app that can show it, with an explicit prompt before any outside resource loads.

**With different models, providers and the one subscription.** Preview runs on the device. In Local mode outside resources stay blocked unless the user allows them and sees the boundary.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop preview HTML, React, SVG and Mermaid; Vega not found; mobile partial; extensions and CLI none. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: MP26, WP65
- Code: `packages/ui/unified-chat/src/components/markdown/HtmlCodePreview.tsx:15`; `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:208`; `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:312`; `apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx`

**Gap.** Vega and Vega-Lite; mobile coverage; extensions. Note a seen defect: an SVG reply rendered nothing and a preview cropped the shape (W-7).

**Acceptance criteria**

1. An HTML block previews and its buttons work.
2. A Mermaid block shows a diagram; a bad one shows a readable fallback.
3. An SVG reply is visible in full at 1280 and 390 wide.

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv W-7 (Free): SVG answer 'Response complete but renders nothing visible' (blocker) and preview crops the yellow square (major).

## CAP-rich-content-rendering-09 Run code from a block with output

The reader runs code in a sandbox from the chat and sees output, errors, files and plots under the block.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Artifacts are built through the computing environment; prerequisites include code execution and file creation being on for the organisation. Apps: web, desktop.
- **ChatGPT: partly**
  - [https://learn.chatgpt.com/docs/enterprise/higher-education-roles-and-permissions.md](https://learn.chatgpt.com/docs/enterprise/higher-education-roles-and-permissions.md): Permission toggles exist for running code in Canvas and code blocks and for internet access from them (Edu role page). Plans: Edu. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md 7.1 (Local fails closed with a fork offer)). Where code can run, the user sees what permission it needs, output, errors and exit status, and can stop it. Where it cannot run, the app says so. Local mode runs only on the device.

**With different models, providers and the one subscription.** Cloud sandbox runs count under the one subscription's usage; local runs use no managed quota.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Run, stdout, stderr, exit status, files done on web and desktop (mobile mostly); plots only web and desktop; duration, stdin panel, reset and runtime choice mostly missing; Chrome none. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S21.12, S21.13, S21.14, S21.15, S21.16, S21.17, S21.18, S21.19, S21.20, S21.21, S21.22, S21.23, S21.29, S21.30
- Comparison list ids: W126, WP109
- Code: `apps/web/lib/tool-copy.ts:51`

**Gap.** Run Python partial on web; no run in canvas Python (W126); duration, stdin, reset; mobile permission text.

**Acceptance criteria**

1. Run a 3-line script; output and exit status appear under the block.
2. An unavailable runtime shows a clear message, not a silent failure.
3. Stop a long run; it stops and says so.

**Verification: code inspected only.** Ledger and comparison from code reading; no scorecard row.

## CAP-rich-content-rendering-10 Math typesetting

Inline and display LaTeX renders as typeset equations; copy gives the source.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/vs-code.md](https://code.claude.com/docs/en/vs-code.md): The VS Code chat panel typesets display and inline math; copy yields TeX source; not in terminal mode; heuristics avoid prices and shell text. Apps: ide.
  - [https://support.claude.com/en/articles/10366421-how-does-claude-handle-mathematical-equations-and-calculations](https://support.claude.com/en/articles/10366421-how-does-claude-handle-mathematical-equations-and-calculations): Claude processes equations and calculations, but critical results should be checked with dedicated math software (no rendering stated). Apps: web.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes](https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes): Wide tables, code blocks and math scroll horizontally in the macOS desktop app. Apps: desktop.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Mar 10, 2026: interactive learning modules let users change formulas and variables and see graphs update. Plans: Free, Go, Plus, Pro, Business, Enterprise. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). Math in answers is typeset on every app that has a text surface capable of it, with prices and shell text not mistaken for math, and a readable fallback elsewhere.

**With different models, providers and the one subscription.** Client side; works with any model's LaTeX; works offline.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Inline and block math done on web, desktop, mobile, VS Code, Chrome; CLI missing. Mobile comparison row is marked N/A by the comparer. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S20.19, S20.20, S20.21
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:57`; `packages/ui/unified-chat/src/components/markdown/preprocessMath.ts:6`; `apps/mobile/src/features/chat/components/MathBlock.tsx:13`

**Gap.** CLI shows no typeset math and no fallback rule is recorded.

**Acceptance criteria**

1. Ask for the quadratic formula; it appears typeset on web and mobile.
2. A reply with 'costs $5 and $10' shows no math.
3. Copy a formula; the TeX source is pasted.

**Verification: code inspected only.** W-2 asked 17 x 19 and got plain-text arithmetic; no typeset equation was requested.

## CAP-rich-content-rendering-11 Diagrams from Mermaid text

Flowcharts, mind maps and timelines written as Mermaid render as drawn diagrams, with a fallback if the diagram fails.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork): Claude builds HTML-based diagrams, charts and comparisons inline when useful or on request; no setting to turn on. Plans: all users. Apps: web, desktop.
  - [https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude): Claude builds charts, diagrams and interactive visuals inline in the conversation. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt): Preview renders Mermaid diagrams in a sandbox. Plans: Varies. Apps: web, desktop, ios, android.
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Flowcharts, diagrams and data visualizations in Code Blocks can be exported as images. Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Diagram answers render as drawings on every app with a screen; a failed diagram shows readable source, never a blank.

**With different models, providers and the one subscription.** Drawing is local; model need only emit text. Outside images inside a diagram are blocked or labelled.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mind map, flowchart, timeline done on web, desktop, mobile; none on CLI, VS Code, Chrome. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S20.30, S22.31, S22.32, S22.33
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:272`; `packages/ui/unified-chat/src/components/markdown/mermaidExternalResources.ts:82`; `apps/mobile/src/features/chat/components/MermaidDiagramBlock.tsx`

**Gap.** Extensions and CLI show no drawing; whether they show the source as fallback is not recorded.

**Acceptance criteria**

1. A Mermaid flowchart draws on web and mobile.
2. A broken diagram shows its source with an error line.
3. A diagram that loads an outside image asks or is blocked.

**Verification: code inspected only.** Ledger and file existence checked; no person test.

## CAP-rich-content-rendering-12 Inline custom visuals written by the model

The model builds a one-off diagram, chart or small interactive widget inside the answer, with controls such as sliders, adjustable by follow-up.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork): HTML diagrams, charts and comparisons inline; interactive with buttons, sliders and full-screen; no setting to turn on. Not rendered in iOS or Android apps. Plans: all users. Apps: web, desktop.
  - [https://support.claude.com/en/articles/9002504-can-claude-produce-images](https://support.claude.com/en/articles/9002504-can-claude-produce-images): Claude builds HTML/SVG diagrams, charts and interactive visuals in conversation that can be adjusted by follow-up; beta on web and desktop. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/visualizations.md](https://learn.chatgpt.com/docs/visualizations.md): Tag @Visualize or let ChatGPT choose; produces explorable visuals that are snapshots, not live dashboards; not rendered in Codex CLI/IDE. Apps: web, desktop, ios, android.
  - [https://help.openai.com/en/articles/20001598-intelligent-ui-in-chatgpt](https://help.openai.com/en/articles/20001598-intelligent-ui-in-chatgpt): A current model picks the response format, mixing text, graphics, buttons, forms, charts and interactive diagrams; some components keep state after refresh but not across threads. Plans: Free, Go, Plus, Pro, Business, Enterprise. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md capabilities list (visuals, inline visualizations)). Any model can produce an inline interactive visual that runs in a sandbox on web, desktop and mobile, can be asked for by name, and is a snapshot unless saved as an artifact.

**With different models, providers and the one subscription.** Rendering needs only the model's code. The visual is generated by whichever model is chosen, so quality differs by model; usage is billed as normal chat in the one subscription. Local models may produce weaker visuals and the app should still render them or show source.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop: interactive cards and sandboxed iframe present (partial); mobile: interactive cards present; CLI, VS Code, Chrome none. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S22.36, S22.38
- Comparison list ids: WP64, WP66, WP92
- Code: `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48`; `apps/web/features/chat/lib/visual-intent.ts:98`; `apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:388`

**Gap.** Asking by name is partial; save-as-artifact from a visual is partial; extensions have none.

**Acceptance criteria**

1. Ask for an interactive compound-interest explainer; a slider changes the result in the chat.
2. The same visual works on mobile.
3. Reload; the visual is still there or its loss is stated.

**Verification: code inspected only.** W-8 (web Free and Premium) saw an HTML artifact render with two inputs and Sum 36 then 37 in the side panel, which is an artifact, not an inline visual.

## CAP-rich-content-rendering-13 Keep or export a visual

A visual can be copied as an image, downloaded as SVG or HTML, or turned into a saved artifact.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork): Visuals are ephemeral by default; options to copy a static image, download .svg or .html, or convert to a persistent artifact. Plans: all users. Apps: web, desktop.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Flowcharts, diagrams and data visualizations in Code Blocks can be exported as images. Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Every inline visual offers copy as image, download, and save as artifact.

**With different models, providers and the one subscription.** Local export; saving to the account artifact store is a cloud action and must be labelled in Local mode.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on web; comparison searched for toPng and svg download in the unified chat package and found none. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W76
- Code: `packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:17`

**Gap.** No copy-as-image or SVG download for visuals; save-as-artifact partial.

**Acceptance criteria**

1. A Mermaid diagram offers Copy image and Download SVG.
2. Save as artifact puts it in the Artifacts tab.
3. Copying works with no network.

**Verification: not verified.** Comparison W76 marked Missing from code reading.

## CAP-rich-content-rendering-14 Charts in answers with data view

Bar, line, pie and scatter charts render in the answer with hover values, legend and an inspectable data table.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12138966-release-notes](https://support.claude.com/en/articles/12138966-release-notes): Claude can create custom charts and diagrams inline in responses. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork): The page lists charts among custom visuals and says they are not rendered in the iOS or Android apps. Plans: all users. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jun 8, 2026: some answers become interactive bar, line, pie and scatter charts, on request or automatically. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt](https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt): Charts can be switched between static image and interactive; other chart types stay static. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/9213685-extracting-insights-with-chatgpt-data-analysis](https://help.openai.com/en/articles/9213685-extracting-insights-with-chatgpt-data-analysis): Supports line, bar, pie, histogram, scatter, box, heat map, area, radar, treemap, bubble and waterfall; only bar, pie, scatter and line are interactive; download PNG, expand, recolor by hex. Apps: web.
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Interactive tables and charts are Plus and Pro only. Plans: Plus, Pro. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Charts render on web, desktop and mobile from a typed chart spec any model can emit, with a data view, PNG download and a static-or-interactive switch. Row and series caps are shown, not silent.

**With different models, providers and the one subscription.** Charting is local. Interactivity is not a plan gate unless the owner chooses one; if so it comes from the one entitlement system.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Interactive charts and data inspection done on web, desktop, mobile; CLI, VS Code, Chrome none. Only bar, line, pie, scatter; no static/interactive switch. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S22.08, S22.09
- Comparison list ids: M37, WP67
- Code: `packages/contracts/types/src/chart-spec.ts:1`; `packages/contracts/types/src/chart-spec.ts:9`; `packages/ui/unified-chat/src/components/artifact-components/ChartSpecView.tsx`; `apps/mobile/src/features/chat/components/ChartArtifactView.tsx`

**Gap.** Histogram, box, heat map, area, radar, treemap, bubble, waterfall; PNG download; static/interactive switch; mobile switch.

**Acceptance criteria**

1. Ask for a 5-row bar chart; hover shows values and a table view opens.
2. A 600-row dataset shows a note about the 500-row cap.
3. Download PNG yields an image.

**Verification: code inspected only.** Caps 500 rows and 12 series read in chart-spec.ts:9-10; no person test.

## CAP-rich-content-rendering-15 Cards, forms and interactive layouts in answers

Answers can contain structured pieces such as stat cards, checklists, step timelines, expandable sections, forms and buttons that reply to the model.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude): Claude builds its own diagrams, charts and simple interactive elements when no connected interactive interface handles the request.
  - [https://code.claude.com/docs/en/mcp.md](https://code.claude.com/docs/en/mcp.md): Claude Code shows elicitation forms and, in cloud sessions, a card with Submit, Open link and Decline (coding tool). Apps: cli, web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001598-intelligent-ui-in-chatgpt](https://help.openai.com/en/articles/20001598-intelligent-ui-in-chatgpt): Answers mix text, graphics, tappable buttons, forms, charts and interactive diagrams; checklists keep state after refresh but not across threads. Plans: Free, Go, Plus, Pro, Business, Enterprise. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 10.1 (renderer manifest with mobile fallback)). The model can ask for structured answer parts through one typed schema; each app draws what it supports and degrades unknown parts to readable text. Buttons reply into the same chat.

**With different models, providers and the one subscription.** Typed schema is provider-neutral so non-native models use a prompt contract; no extra quota; Local models may emit fewer parts.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop have cards, stats, checklists, controls, gallery, expandable sections, timelines; mobile has interactive cards; questionnaires missing on mobile and extensions; approval forms on all six. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S20.30, S22.28, S22.29
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/markdown/answerSurfaces.ts:1`; `packages/ui/unified-chat/src/components/markdown/AnswerForm.tsx`; `packages/ui/unified-chat/src/components/markdown/AnswerSurface.tsx:118`; `apps/mobile/src/features/chat/components/AnswerUiCard.tsx`

**Gap.** Forms on mobile and extensions; state persistence across reload not recorded.

**Acceptance criteria**

1. A reply with a checklist keeps ticks after reload.
2. A form submit sends a user message and the model answers.
3. An unknown part type shows text, not a blank.

**Verification: code inspected only.** Comparison rows marked Same from code reading; W-1 saw a clarifying-question card on web, which is a form of this, with an unrelated defect.

## CAP-rich-content-rendering-16 Setting to reduce generated visuals

A user setting that turns inline visuals or rich layouts down or off.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork): Custom visuals have no setting to turn on; whether an off switch exists is not stated. Plans: all users. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001354](https://help.openai.com/en/articles/20001354): Settings > Layout and visuals reduces mixed layouts on web. Plans: Eligible paid plans. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/definition.md (Capabilities must include visuals, inline visualizations)). Capabilities settings include visuals and inline visualizations switches, and turning them off makes the model reply in text.

**With different models, providers and the one subscription.** The switch changes the prompt and renderer for every model. Stored per account, so it follows the user across apps.

**Current implementation, as this trace read it on 2026-11-24: built.** Switch on web (Capabilities) and mobile (with Beta badge); other apps not recorded. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP99
- Code: `apps/web/features/settings/sections/CapabilitiesSection.tsx:127`; `apps/web/features/settings/sections/CapabilitiesSection.tsx:162`; `apps/mobile/src/features/settings/capabilities/index.tsx:154`

**Gap.** Desktop, CLI, extensions not recorded; comparison marks it Partial.

**Acceptance criteria**

1. Turn the switch off; ask for a chart; the reply has no inline visual.
2. The setting is the same on web and mobile after sign-in.

**Verification: not verified.** No scorecard row.

## CAP-rich-content-rendering-17 Citations and sources

Search-grounded answers carry citation chips that identify the source, with a hover or tap preview and a sources list.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9002504-can-claude-produce-images](https://support.claude.com/en/articles/9002504-can-claude-produce-images): Not used.
  - [https://support.claude.com/en/articles/11817273-use-claudes-chat-search-and-memory-to-reference-past-conversations](https://support.claude.com/en/articles/11817273-use-claudes-chat-search-and-memory-to-reference-past-conversations) (this address is not in the saved catalogue; treat as unverified): Catalogue row ch01:189 (Past chat citations with delete option): earlier chats used by Claude show citations linking to the source chats. Plans: Paid plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jan 30, 2026: answers may highlight people, places, products; tapping opens a panel with facts and sources. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). Search-based answers show source chips with preview and a sources list on every app that can search; raw citation markers never appear in text.

**With different models, providers and the one subscription.** Citations come from the search tool, not the model, so they work for any provider. Search is a cloud tool; in Local mode no search runs unless the user forks.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Chips and hover cards done on web, desktop, mobile, Chrome; missing CLI and VS Code. One seen defect: raw [7] left in the text. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S22.01, S22.02, S22.03
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx`; `packages/ui/unified-chat/src/components/markdown/citationMarkers.ts`; `apps/mobile/src/features/chat/components/MarkdownInline.tsx:36`

**Gap.** CLI and VS Code; raw marker defect.

**Acceptance criteria**

1. A web-search answer shows chips that open the source.
2. No '[7]' text remains next to chips.
3. The chat lists the sources.

**Verification: seen failing by a person.** W-5 subscribed (web): 'Searched the web 5 sources' shown and a raw citation marker '[7]' left in the answer (minor, 6-defects). The chips themselves were seen.

## CAP-rich-content-rendering-18 Inline web images with attribution

Search answers show pictures inline with source attribution and a click to the original.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/13641943-visual-and-interactive-content](https://support.claude.com/en/articles/13641943-visual-and-interactive-content): Recipe cards use images from Bing on web and desktop. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): May 12, 2026: Free users see inline images with source attribution and click-through to original size. Plans: Free. Apps: web, ios.

**AGI requirement** (inferred; source: competitor parity). Images in answers show where they came from and open the original; in Local mode no image is fetched from the web without the user seeing it.

**With different models, providers and the one subscription.** Image search is a cloud tool counted under the one subscription; remote image loads are an explicit boundary crossing.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile partial (image with source link); web missing; web gallery/carousel partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S22.05
- Comparison list ids: MP25, W77
- Code: `apps/mobile/src/features/chat/components/MarkdownImage.tsx:5`; `packages/ui/unified-chat/src/components/markdown/AnswerGallery.tsx`; `packages/ui/unified-chat/src/components/markdown/ImageTrust.tsx`

**Gap.** Web inline web images with source attribution.

**Acceptance criteria**

1. An answer about a landmark shows an image with a source name and a link.
2. In Local mode the app asks before loading a remote image.

**Verification: not verified.** None.

## CAP-rich-content-rendering-19 Tappable highlights with a facts panel

People, places and products inside an answer are tappable and open a panel with facts and sources.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jan 30, 2026: visual answers and tappable highlights open a side panel with facts and sources. Apps: web, ios, android.

**AGI requirement** (proposed; source: competitor parity). Open owner choice; see unresolved list.

**With different models, providers and the one subscription.** Would need a search or knowledge lookup, a cloud action; in Local mode it would be off or labelled.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on web and mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M38, W82
- Code: `searched: entity panel, tappable in apps/web/features/chat (comparison W82)` (not found)

**Gap.** Whole feature.

**Acceptance criteria**

1. Tap a named place in an answer; a panel shows facts with sources.
2. Close returns to the same scroll position.

**Verification: not verified.** None.

## CAP-rich-content-rendering-20 Place, map, weather, recipe and shopping cards

Topic answers render as purpose-built cards: maps with pins, weather, recipes with serving changes, product comparisons.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13641943-visual-and-interactive-content](https://support.claude.com/en/articles/13641943-visual-and-interactive-content): Weather visual on web and desktop, text on mobile, needs web search; recipe cards with serving changes and a step-by-step cooking mode on web and desktop only. Apps: web, desktop, ios, android.
- **ChatGPT: partly**
  - [https://learn.chatgpt.com/docs/visualizations.md](https://learn.chatgpt.com/docs/visualizations.md): Visualizations produce explorable visuals including maps and calculators. Apps: web, desktop, ios, android.

**AGI requirement** (proposed; source: competitor parity). Maps, product comparison cards and structured cards exist; other topic cards (weather, news, sports, flights, shopping prices, itineraries) are not required until the owner chooses them.

**With different models, providers and the one subscription.** Topic cards need cloud data tools; each counts under the one subscription and is off in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Map and place cards partial on web and desktop, Chrome done; comparison cards on web and desktop; weather, news, sports, finance, flights, packages, reservations, itineraries, recipes missing everywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S22.04, S22.10, S22.11, S22.12, S22.13, S22.14, S22.15, S22.16, S22.17, S22.18, S22.19, S22.20, S22.21, S22.22, S22.23, S22.24, S22.26, S22.27
- Comparison list ids: M35, M36, M39, W80, W83
- Code: `apps/web/features/chat/components/messages/cards/PlacesMapCard.tsx`; `apps/mobile/src/features/chat/components/MapFenceSurface.tsx`

**Gap.** All topic cards except maps and comparison.

**Acceptance criteria**

1. Ask for a map of three cafes; pins show and open details.
2. Ask for weather; a card or clear text shows conditions.

**Verification: not verified.** None.

## CAP-rich-content-rendering-21 Writing blocks and draft widgets

A drafted email, message or document appears as an editable block with copy, revise, full screen, and send or save.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt): Drafts appear in an editable block: edit in place, copy, ask for revisions, full-screen view, undo and redo of AI edits, formatting. Email drafts can be sent or opened; document drafts saved to the Library. Plans: Availability varies by plan, device and workspace. Apps: web, desktop, ios, android.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jun 8, 2026: writing blocks open in a focused full-screen editor with save, download, undo and redo. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Drafts show as editable blocks on web and desktop and mobile; sending needs an explicit confirm and the connected account.

**With different models, providers and the one subscription.** Block is local; sending via mail is an outside service call the user confirms. Provider-neutral.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Email widget done on web and desktop; writing block with copy and expand on web; mobile missing; message-draft widget missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S22.25, S22.26
- Comparison list ids: M40, WP71, WP72
- Code: `packages/ui/unified-chat/src/components/markdown/WritingBlock.tsx:32`; `packages/ui/unified-chat/src/components/markdown/EmailBlock.tsx:97`

**Gap.** Undo/redo, outline, save to Library; mobile; message drafts.

**Acceptance criteria**

1. Ask for an email draft; it shows an editable block with copy.
2. Send needs a visible confirmation naming the account.

**Verification: not verified.** None.

## CAP-rich-content-rendering-22 Third-party app panels inside a reply

A connected app returns its own small interface that appears inline in the chat.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude): Interactive connectors show their interface in the chat; Claude builds its own visuals when none handles the request.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 10.1 (renderer manifest, mobile fallback)). Connected app UIs render in a sandbox on web and desktop, with mobile fallback.

**With different models, providers and the one subscription.** Needs a connector; availability follows the plan entitlement; unavailable in Local mode with a stated reason.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop done per ledger; mobile card exists; comparison marks the web row Partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S22.37
- Comparison list ids: WP68
- Code: `apps/web/features/chat/components/messages/cards/McpAppCard.tsx`; `apps/mobile/src/features/chat/components/cards/McpAppCard.tsx`

**Gap.** Release gate for connectors; mobile ledger marks missing.

**Acceptance criteria**

1. A connector with a UI shows it in the chat.
2. Without the connector the chat shows text, not a blank box.

**Verification: not verified.** W-17 (web Free) showed connectors are unavailable on Free; none connected.

## CAP-rich-content-rendering-23 Artifact panel for standalone outputs

Larger self-contained outputs open beside the chat as a panel that can be viewed, edited, versioned, downloaded and shared.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): An artifact is created for self-contained content (typically 15+ lines) and opens beside the conversation, editable, shareable, saved in the Artifacts tab; older chat artifacts keep working but new ones cannot be made. Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android, cli.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): May 28, 2026: canvas removed from the newest models; writing and code blocks used instead; paid users keep canvas via older models for now. Plans: Plus, Pro. Apps: web.
  - [https://learn.chatgpt.com/docs/artifacts-viewer.md](https://learn.chatgpt.com/docs/artifacts-viewer.md): Codex desktop previews generated documents, slides, spreadsheets, PDFs and HTML beside the chat. Codex coding tool, not ChatGPT chat. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md sections 10.2 and 10.3 and W09). Large outputs open as artifacts with preview and source tabs only when real, versions, and sandboxed interactive content; failed edits keep the previous version.

**With different models, providers and the one subscription.** Artifact generation counts under the one subscription; saving to the account is a cloud action, and in Local mode artifacts stay on the device.

**Current implementation, as this trace read it on 2026-11-24: built.** Panel, versions, download done on web and mobile; Fix-with-assistant on error missing; two defects seen. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W122, WP91
- Code: `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2338`; `apps/web/features/chat/components/artifacts/artifact-render.ts:121`; `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1929`

**Gap.** Duplicate artifact after edit; raw HTML after Stop; narrow-width header overlap; no fix-this button.

**Acceptance criteria**

1. Ask for a small calculator; it renders and works in the panel.
2. Edit it; one artifact with two versions, not two artifacts.
3. Panel header is readable at 390 wide.

**Verification: seen failing by a person.** W-8 (web): rendering worked and Download as HTML produced a working file; defects seen: duplicate 'Live Sum', raw HTML after Stop, header overlap at 390.

## CAP-rich-content-rendering-24 Interactive learning visuals

Study answers let the user change formulas or variables and watch graphs update.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Mar 10, 2026: interactive learning modules for 70+ math and science topics, with graphs that update; all logged-in users. Plans: Free, Go, Plus, Pro, Business, Enterprise. Apps: web, ios, android.

**AGI requirement** (proposed; source: competitor parity). Not established; see unresolved list.

**With different models, providers and the one subscription.** Could be built on the same inline-visual renderer; no extra entitlement.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on web and mobile; flashcards and quizzes exist as study sets in web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S22.34, S22.35
- Comparison list ids: M33, W78
- Code: `apps/web/features/study/components/StudyPage.tsx`

**Gap.** Formula-driven modules.

**Acceptance criteria**

1. A slider on a quadratic changes the graph live.

**Verification: not verified.** None.

## CAP-rich-content-rendering-25 Terminal and editor rendering

CLI and editor surfaces draw Markdown, code, tables and links within what a terminal or editor panel can show.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/env-vars.md](https://code.claude.com/docs/en/env-vars.md): Env vars force strikethrough, synchronized output and kitty-protocol image drawing; syntax highlight and 24-bit tmux colour can be set. Apps: cli.
  - [https://code.claude.com/docs/en/plugins/mods/gallery.md](https://code.claude.com/docs/en/plugins/mods/gallery.md): Mods draw Markdown, Code, Svg (Desktop and VS Code only) and Image (terminal) elements. Apps: cli, desktop, ide.
- **Codex: partly**
  - [https://learn.chatgpt.com/docs/config-file/config-advanced.md](https://learn.chatgpt.com/docs/config-file/config-advanced.md): Codex can render file citations as links using vscode, cursor, windsurf, vscode-insiders or none. Apps: cli, ide, desktop.
  - [https://learn.chatgpt.com/docs/visualizations.md](https://learn.chatgpt.com/docs/visualizations.md): Visualizations are not rendered in Codex CLI and IDE. Apps: cli, ide.

**AGI requirement** (proposed; source: competitor parity). CLI and VS Code render what they can and say what they cannot, with a way to open the full view on web or desktop.

**With different models, providers and the one subscription.** Same typed answer parts, different drawing. Shown fallback names the app that can render it.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI Markdown, tables, code, diff done; math, charts, citations, diagrams missing; VS Code has math and tables, no highlight label, no charts. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S20.19, S20.20, S21.01, S21.02, S22.08
- Comparison list ids: none matched
- Code: `apps/cli/src/tui/markdown_renderer.rs:65`; `apps/cli/src/tui/markdown_renderer.rs:279`; `apps/extension-vscode/src/webview/render.ts:199`

**Gap.** Open-in-full-view hand-off for unrendered parts; VS Code highlight.

**Acceptance criteria**

1. A chart reply in CLI shows a clear line saying where to open it.
2. A table in CLI is readable at 80 columns.

**Verification: code inspected only.** Ledger only.

## CAP-rich-content-rendering-26 Rendering with no network and clear boundaries

The reader can render replies, math, tables and code on the device without servers, and any outside load is shown.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/requirements.md 7.1 (Local mode fails closed) and docs/product/definition.md). All local rendering works offline in Local mode; features that need servers (search cards, image search, hosted previews of outside content, cloud code runs) are marked and not used silently.

**With different models, providers and the one subscription.** Applies to local, BYOK and managed models. Hosted-only parts show a requirement and a fork choice.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mermaid blocks outside images with a stated reason; math, tables and code are local; other boundary labels on cards not recorded. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S20.30
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/markdown/mermaidExternalResources.ts:14`; `packages/ui/unified-chat/src/components/markdown/ImageTrust.tsx`

**Gap.** No test that flight-mode renders everything local; boundary label per card not checked.

**Acceptance criteria**

1. In aeroplane mode a Local chat renders Markdown, table, code and math.
2. A card that needs a server shows what it needs.

**Verification: not verified.** None. W-1 saw an offline banner on web but did not render rich content.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to match ChatGPT's tappable highlights with a facts panel, which only ChatGPT documents.
- Whether to build topic cards (weather, recipes, news, sports, flights, shopping) and which, since Claude documents weather and recipes and the catalogue shows no equivalent set for ChatGPT.
- Whether interactive charts and tables are a plan feature. ChatGPT's pricing page says Plus and Pro only while its Intelligent UI and release notes list all plans; the project rule is Free shows Upgrade only.
- Whether inline visuals must render on mobile. Claude's custom visuals are not rendered on iOS or Android; ChatGPT's Visualizations roll out on mobile; AGI's mobile code already renders them.
- Whether to follow ChatGPT's static and interactive chart switch and extra chart types, or keep four chart kinds.
- Whether to add formula-driven learning modules (ChatGPT only) beyond flashcards and quizzes.
- Whether CLI and VS Code should render visuals or only point to web and desktop.
- Whether the Claude-style default of visuals shown automatically with no setting, or the ChatGPT-style Layout and visuals reduction setting, is the model.
- Row cap, collapse rule and copy format for tables in terminals (Claude Code caps at 200 rows).

## Could not establish

- How Claude chat renders plain Markdown, tables, code-block copy and LaTeX: the catalogue has no row on it, so has is unknown.
- Whether ChatGPT chat typesets LaTeX: only a macOS release note about horizontal scrolling of math was found.
- The sandbox model behind Claude's inline visuals and whether Claude chat offers a Preview toggle on code blocks.
- Whether ChatGPT shows third-party app UIs inline: no catalogue row found.
- The plan conflict for ChatGPT interactive charts (pricing page versus release notes) was not reconciled.
- Code evidence was read from the ledger and a handful of files (line numbers cited were seen in grep output); I did not open each cited line or run anything.
- No person-verified result exists for tables, math, Mermaid, citations chips beyond W-5 or any mobile, desktop, CLI or extension rendering; the scorecards and defect list cover web only.
- Desktop is Electron showing the hosted web app (AGENTS.md section 5), so desktop rendering equals web rendering; the Tauri desktop ledger status was not separated.
- Truncated catalogue url for one Claude row (ch06:144) was completed from a second row; one other cited url pattern (the support article on past chat citations) was taken as printed in a truncated row and should be re-checked.
