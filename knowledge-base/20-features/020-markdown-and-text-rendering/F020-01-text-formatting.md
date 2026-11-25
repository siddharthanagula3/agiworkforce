---
id: "F020-01"
type: "feature"
title: "Text formatting"
aliases: ["Text formatting", "Markdown basics", "S20.01 to S20.10 and S20.21", "MarkdownContent", "MessageContentRenderer", "markdown_renderer"]
area: "20 Markdown and text rendering"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "seen failing", desktop: "not seen by a person", mobile: "not seen by a person", cli: "partly seen (1 of 11)", vscode: "not seen by a person", chrome: "partly seen (1 of 11)"}
requirement_items: ["S20.01", "S20.02", "S20.03", "S20.04", "S20.05", "S20.06", "S20.07", "S20.08", "S20.09", "S20.10", "S20.21"]
depends_on: ["SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "file:packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F020-01 Text formatting

Turns the plain Markdown text a model writes into readable structure in every AGI Workforce app: paragraphs, headings, bold, italic, strikethrough, bulleted, numbered and nested lists, task checkboxes, quotes, dividers, inline code, and backslash-escaped symbols. It is client-side display code with no plan check.

Area: [20. Markdown and text rendering](README.md). Requirement items: [S20.01](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2001), [S20.02](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2002), [S20.03](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2003), [S20.04](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2004), [S20.05](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2005), [S20.06](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2006), [S20.07](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2007), [S20.08](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2008), [S20.09](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2009), [S20.10](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2010), [S20.21](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2021).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen failing |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | partly seen (1 of 11) |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | partly seen (1 of 11) |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Parses the model's reply as Markdown and draws it with the matching text styles. Web and Tauri desktop share the React component MarkdownContent (packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:874-960). Mobile has its own parser and renderer (apps/mobile/src/features/chat/components/MessageContentRenderer.tsx). The CLI draws styled terminal lines (apps/cli/src/tui/markdown_renderer.rs:142-439). VS Code and the Chrome side panel use markdown-it (apps/extension-vscode/src/webview/render.ts:16-24; apps/extension/src/features/side-panel/markdown.ts:141-146).

**Why it exists.** Models answer in Markdown. Showing raw hash marks and asterisks makes answers hard to read, so each app turns them into structure. The brief lists this as items S20.01 to S20.10 and S20.21 (doc: knowledge-base/data/area-briefs/020-markdown-and-text-rendering.md).

**Who uses it.** Every person who reads an answer in Web, Desktop, Mobile, CLI, VS Code or Chrome. Nobody has to turn it on.

**Problems it solves**

- Answers read as structured text instead of raw Markdown symbols.
- A symbol the model escaped with a backslash shows as the plain character.
- Lists, quotes and task items keep their shape on small screens and in a terminal.

**Use cases**

- A reader sees a step-by-step answer as a numbered list with nested bullets.
- A reader sees a checklist answer with open and ticked boxes.
- A CLI user reads a headed, bulleted answer in the terminal.
- A reader sees a quoted passage set apart from the explanation.

## 2. User experience

**Where to find it**

- Web: assistant and user messages in the chat page (apps/web/features/chat/components/messages/MessageBubble.tsx:2884-2906).
- Desktop (Tauri build): chat messages through the shared unified-chat MessageBubble (packages/ui/unified-chat/src/components/MessageBubble.tsx:827-835). The public Electron Desktop shows the hosted web app, so it gets the web rendering (AGENTS.md section 5; apps/desktop/electron/main.ts:345).
- Mobile: the message list rendered by renderMarkdownContent (apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:1625-1679).
- CLI: the terminal chat view (apps/cli/src/tui/tui_app.rs:2923, 2970) and the one-shot print path (apps/cli/src/lib.rs:7324).
- VS Code: the sidebar chat webview (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5368-5380).
- Chrome: the side panel assistant bubble (apps/extension/src/features/side-panel/bubbles.ts:401).

**Before you start**

- A reply that contains Markdown. Nothing else; there is no setting or plan gate in the rendering code I read.

**Screens and controls**

- No control for plain formatting. Reading only.
- Task checkboxes in a chat message are read-only on web and desktop (MarkdownContent.tsx:443-449 renders a disabled input when no toggle is supplied).
- Task checkboxes are tickable only where the host passes onTaskToggle: the web artifact preview (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:354, 1934) and the mobile artifact full screen (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1101). No chat message bubble passes it (searched apps/web, apps/desktop/src, packages/ui/unified-chat).

**Journey**

1. The model streams or finishes a reply.
2. The app prepares the text (math delimiters, hyphenated labels, citations) and parses it.
3. The app draws paragraphs, headings, lists, quotes, dividers and inline styles.
4. If the reply is empty, the web bubble shows a notice that the model finished without returning a response (apps/web/features/chat/components/messages/MessageBubble.tsx:2870-2880); mobile returns nothing (MessageContentRenderer.tsx:1626).

**What the person sees and gets**

- Styled text on screen. On web, h1 to h3 have named heading styles and paragraphs have bottom spacing (MarkdownContent.tsx:775-790, 392-399).
- A tick glyph inside a bordered square for a done task (MarkdownContent.tsx:419-454).
- In the CLI, headings keep their # prefix in an accent colour (markdown_renderer.rs:222-228), bullets show a dot, tasks show a ballot-box glyph (markdown_renderer.rs:325-331).

**Settings**

- None specific to formatting. Text size and theme come from each app's general settings (not read in detail).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Tauri desktop: remark-gfm, remark-math and remark-breaks feed react-markdown with custom components for paragraph, h1-h3, lists, quote, task checkbox (MarkdownContent.tsx:771-805; remarkPlugins.ts:71-77).
- Ordered lists keep their start number (MarkdownContent.tsx:473-483). Nested lists render through the same list components [inferred]. Task items drop the bullet (MarkdownContent.tsx:456-471, 485-512).
- Raw HTML in an assistant answer is parsed, then sanitised (MarkdownContent.tsx:819-823). For user messages the host sets literalHtml so HTML shows as text (MarkdownContent.tsx:944; MessageBubble.tsx 2895-2900).
- Mobile: own block parser with headings, lists (nested, ordered, task), quotes, rules, indented and fenced code (MessageContentRenderer.tsx:254-300, 787-796, 1073).
- CLI: pulldown-cmark with tables, strikethrough and task lists on (markdown_renderer.rs:147-150); headings, bold, italic, strike, bullets, ordered numbering, quotes, rules, inline code are handled (markdown_renderer.rs:206-400). Terminal control characters are stripped first (markdown_renderer.rs:146; apps/cli/src/terminal_text.rs:3-19).
- VS Code and Chrome: markdown-it with html disabled; tasks via the shared markdownItTaskLists plugin, which writes a role=checkbox span with a tick or box glyph (packages/ui/unified-chat/src/components/markdown/markdownItTaskLists.ts:24-27).
- Backslash escapes: web normalises math delimiters but leaves a backslash-dollar alone (packages/platform/utils/src/markdownSource.ts:208); the Markdown parser drops the backslash for other symbols [inferred]. Mobile has protectEscapes and restoreEscapes (MarkdownInline.tsx:36-41).

**Incomplete**

- CLI headings are drawn with their literal # marks, e.g. ' ## text' (markdown_renderer.rs:222-228). The brief's S20.02 says hash marks must not show. The brief's status for CLI is done.
- Chat task checkboxes cannot be ticked on any app; only artifact views pass a toggle handler (see screens_and_controls).
- Line-break handling differs: web uses remark-breaks (remarkPlugins.ts:3, 74) and Chrome sets breaks true (markdown.ts:144), but VS Code sets breaks false (render.ts:19). A single newline inside a paragraph is therefore a line break on web and Chrome and a space in VS Code [inferred from markdown-it behaviour].
- Web styles only h1, h2 and h3 explicitly (MarkdownContent.tsx:775-789). h4 to h6 fall back to the library default elements [inferred].

**Present but disconnected or switched off**

- onTaskToggle is implemented in MarkdownContent (MarkdownContent.tsx:920-924) and in the mobile renderer (MessageContentRenderer.tsx:1660-1668) but is not wired into chat bubbles.

**Not available**

- CLI: no raw-HTML pass-through; HTML events fall into the catch-all arm and are ignored (markdown_renderer.rs:433).
- Chrome: no CSS classes survive the sanitiser (markdown.ts:130 forbids class), so styling is applied by stylesheet selectors on elements.

## 4. Required behaviour

**Established requirements**

- Assistant text separated by blank lines renders as distinct paragraphs with spacing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.01)
- ATX headings (# to ######) render as styled headings, not literal hash marks. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.02)
- Bold, italic and strikethrough render with matching text styles. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.03)
- Ordered lists show their numbers, respecting the start value, with indentation. Unordered lists show bullets. Nested lists indent deeper under the parent. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.04, S20.05, S20.06)
- GFM task items render as checkboxes reflecting their state. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.07)
- Lines starting with > render as an indented, distinct quotation block; a thematic break renders as a divider; inline code is monospace. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.08, S20.09, S20.10)
- Backslash-escaped delimiters (star, dollar, underscore) display as the literal character without the backslash. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.21)
- No requirement for Markdown rendering was found in docs/product or docs/decisions (searched for markdown, table, footnote, katex). (source: doc: docs/product/requirements.md (no matching requirement))

**Acceptance criteria**

1. A reply with two paragraphs separated by a blank line shows two spaced paragraphs on all six apps.
2. A reply with '## Title' shows a styled heading with no visible hash marks on web, desktop, mobile, VS Code and Chrome. On CLI this currently fails (gap).
3. '**a** *b* ~~c~~' shows bold, italic and struck text on every app.
4. '3. x' then '4. y' shows numbering that starts at 3 on web (test RenderingMatrix 'starts an ordered list at the number the author wrote').
5. A nested bullet under a bullet shows deeper indentation on every app.
6. '- [x] done' and '- [ ] open' show a ticked and an empty box; in a chat message the box cannot be toggled.
7. '\*not bold\*' shows asterisks with no backslash.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Empty or whitespace-only replies should show nothing extra in the renderer itself; the web bubble adds a separate notice for a finished reply with no output [inferred from MessageBubble.tsx:2870-2880].
- Formatting must be identical in meaning across apps, differing only in presentation [inferred from AGENTS.md section 5 shared contract layer].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the CLI draw headings without the literal # marks, keeping the level by colour and weight.
- [proposed] Decide one line-break rule for all apps and test it.
- [proposed] Decide whether chat checkboxes should be tickable, since the toggle code exists.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MarkdownContent | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Shared web and desktop renderer; component map for p, h1-h3, ul, ol, li, blockquote, input, a, table (lines 771-805) and the pipeline (874-960). |
| config | REMARK_PLUGINS | `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts` | remark-gfm, remark-math, remark-breaks, lossless tables, fence identity (71-77); literal-HTML variant (79-82). |
| config | MARKDOWN_SANITIZE_SCHEMA | `packages/ui/unified-chat/src/components/markdown/markdownSanitizeSchema.ts` | Allow-list for raw HTML; adds the u tag and checked on input (7-36). |
| service | normalizeMathDelimiters | `packages/platform/utils/src/markdownSource.ts` | Rewrites math delimiters, escapes currency dollars, skips code ranges (153-228). |
| component | StreamingMarkdownContent | `packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx` | Splits a streaming reply into settled blocks and a live tail (64-144). |
| hook | taskList helpers | `packages/ui/unified-chat/src/components/markdown/taskList.ts` | Finds task markers and flips one box in source text (3-52). |
| component | Web MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Chooses StreamingMarkdownContent or MarkdownContent and sets literalHtml for user messages (2884-2906). |
| component | Unified MessageBubble | `packages/ui/unified-chat/src/components/MessageBubble.tsx` | Desktop (Tauri) use of the same renderer (827-835). |
| component | renderMarkdownContent | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Mobile block renderer, lists, tasks, quotes, headings (254-300, 787-796, 1625-1679). |
| component | MarkdownInline | `apps/mobile/src/features/chat/components/MarkdownInline.tsx` | Mobile inline styles, links, escapes, footnote markers. |
| component | markdownBlockSyntax | `apps/mobile/src/features/chat/components/markdownBlockSyntax.ts` | Mobile line patterns for headings, lists, quotes, rules (imported at MessageContentRenderer.tsx:36-61). |
| service | render_markdown | `apps/cli/src/tui/markdown_renderer.rs` | CLI pulldown-cmark to ratatui lines (142-439) and ANSI string output (107-139). |
| service | sanitize_terminal_text | `apps/cli/src/terminal_text.rs` | Strips escape sequences and bidi controls before parsing (3-19). |
| service | VS Code render | `apps/extension-vscode/src/webview/render.ts` | markdown-it plus DOMPurify bundle exposed as window.agiRender (16-24, 216-225, 242). |
| component | VS Code renderAssistant | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Calls agiRender, falls back to escaped plain text (5368-5380). |
| service | Chrome renderMarkdown | `apps/extension/src/features/side-panel/markdown.ts` | markdown-it, sanitiser and renderMarkdownInto for the side panel (141-146, 253-256, 607-620). |
| service | markdownItTaskLists | `packages/ui/unified-chat/src/components/markdown/markdownItTaskLists.ts` | Shared plugin that turns [ ] and [x] into checkbox spans for VS Code and Chrome (5-28). |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | The only web host that passes onTaskToggle (354, 1934). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Reply text arrives from the chat turn (streaming or finished). | device | apps/web/features/chat/components/messages/MessageBubble.tsx:2884-2906 |
| Web and desktop prepare the text: math delimiters, hyphenated labels, citation links, then parse with remark and sanitise raw HTML. | device | packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:899-919, 943-951 |
| Mobile parses line by line and draws native text views. | device | apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:1625-1679 |
| CLI strips control characters, parses and draws terminal lines. | device | apps/cli/src/tui/markdown_renderer.rs:146-150 |
| VS Code and Chrome render markdown-it HTML, sanitise it with DOMPurify, then insert it into the page. | device | apps/extension-vscode/src/webview/render.ts:216-225; apps/extension/src/features/side-panel/markdown.ts:607-612 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Rendered output (DOM, native views, terminal lines) | In memory only; the source text is the stored chat message, owned by the chat pipeline (SYS-chat-turn-pipeline). | Rendering output does not sync; the message text syncs through chat storage (not read here). | Discarded when the view unmounts. |

**Models and providers.** The renderer receives text from any model and provider and does not read model or provider identity. No provider code is called while rendering.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code (no sign-in check in the renderer files read). |
| Permissions | none found in the code. |
| Subscription | none found in the code; no entitlement, plan or quota check exists in the markdown rendering folder or the mobile, CLI, VS Code and Chrome renderer files read. |
| Limits and metering | none found in the code; rendering is not metered. |
| Feature flags | none found in the code for plain formatting. literalHtml is a prop, not a flag (MarkdownContent.tsx:832). |
| Model compatibility | Any model that outputs text. |
| Provider restrictions | none found in the code. |
| Local mode | Fully works in Local mode and offline for text formatting; nothing leaves the device. Same behaviour as own-key and Cloud modes. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty reply | Web bubble shows 'The model finished without returning a response. Use Regenerate below to run it again.' Mobile renderer returns an empty list. | apps/web/features/chat/components/messages/MessageBubble.tsx:2870-2880; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:1626 |
| Streaming | Web splits settled blocks from the live tail, completes open inline tokens, and hides incomplete tables; task toggling is off while streaming. | StreamingMarkdownContent.tsx:106; MarkdownContent.tsx:920-924 |
| Stopped reply | finishedAnswer 'stopped' closes open inline tokens; 'complete' drops an unfinished link destination. | MarkdownContent.tsx:843-845 |
| Hostile or raw HTML | Assistant HTML is sanitised; user message HTML is shown as text. | MarkdownContent.tsx:819-823, 944 |
| Long unbroken words | Web paragraphs and list items use wrap-anywhere so they break inside the word. | MarkdownContent.tsx:395, 504 |
| Right-to-left text | Direction helper exists in shared code and mobile imports it; whether each app applies it to every block is not established here. | packages/ui/unified-chat/src/components/markdown/textDirection.ts:8-14; MessageContentRenderer.tsx:24 |
| Offline, timeout, retry, cancel | not handled in the code (formatting has no network step). | Searched MarkdownContent.tsx and markdown_renderer.rs; no network or retry code in the formatting paths. |
| Accessibility | Web task checkbox keeps role and checked state on an input; VS Code and Chrome task glyph spans carry role=checkbox and aria-checked; mobile uses accessibilityRole checkbox with state. | MarkdownContent.tsx:435-449; markdownItTaskLists.ts:24-27; MessageContentRenderer.tsx:703-722 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.render.test.tsx`: Task items render as checked or open disabled boxes, drop the bullet, keep bullets on plain lists, accent fill (tests at lines 100-129); footnotes and hostile markup in the same file.
- `packages/ui/unified-chat/src/components/markdown/__tests__/RenderingMatrix.test.tsx`: Nested lists, ordered start value, quotes, nested quotes, long tokens (lines 33-120).
- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.test.tsx`: Memoisation: no re-render for identical props, preprocess not re-run, re-parse when content grows.
- `packages/platform/utils/src/__tests__/markdownSource.test.ts`: Math delimiter and code-range helpers (file name only; cases not read).
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.markdown.test.tsx`: Mobile markdown blocks (file name only; cases not read). Sibling files: blocks, richMarkdown, lineWraps, chatMarkdownBlocks.
- `apps/cli/src/tui/markdown_renderer.rs`: In-file Rust tests: escape sequences stripped, checked and open tasks with code examples preserved, GFM table borders, CJK table alignment (658-736).
- `apps/extension-vscode/src/__tests__/sanitizer.webview.test.ts`: Assistant task lists render as read-only checkbox states; raw HTML escaped (lines 100-126).
- `apps/extension/__tests__/side-panel-markdown-parity.test.ts`: Chrome markdown parity cases (37 tests; titles not all read).

**Test scenarios**

- **Headings across apps**
  1. Send a prompt that makes the model answer with # H1, ## H2 and a paragraph.
  2. Look at the reply on web, mobile, CLI, VS Code, Chrome.
  - Expected: Styled headings without hash marks everywhere except CLI, which shows the # prefix (known gap).
- **Nested and ordered lists**
  1. Paste a reply with '3. a', '4. b' and an indented bullet under 'b'.
  2. Render it in each app.
  - Expected: Numbering starts at 3; the bullet is indented under item 4.
- **Task items are read-only in chat**
  1. Get a reply containing '- [x] done' and '- [ ] open'.
  2. Click each box on web.
  - Expected: Boxes show ticked and empty and do not change on click.
- **Escaped symbols**
  1. Get a reply containing '\*literal\* and \$5'.
  - Expected: Shows *literal* and $5 with no backslashes.
- **Single newline**
  1. Render 'line one' newline 'line two' with no blank line in web, VS Code and Chrome.
  - Expected: Web and Chrome break the line; VS Code joins them (differs; confirm).

**Where to look when it fails**

- Web: browser console on the chat page; client failure class markdown_render is reported through a host-installed sink (packages/ui/unified-chat/src/lib/client-failures.ts:20-30).
- VS Code: webview developer tools; if window.agiRender is missing the fallback shows escaped text (webviewContent.ts:5371-5380).
- CLI: no log line for rendering found.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/020-markdown-and-text-rendering.md](../../70-qa/test-plans/web/020-markdown-and-text-rendering.md)
- Desktop: [70-qa/test-plans/desktop/020-markdown-and-text-rendering.md](../../70-qa/test-plans/desktop/020-markdown-and-text-rendering.md)
- Mobile: [70-qa/test-plans/mobile/020-markdown-and-text-rendering.md](../../70-qa/test-plans/mobile/020-markdown-and-text-rendering.md)
- CLI: [70-qa/test-plans/cli/020-markdown-and-text-rendering.md](../../70-qa/test-plans/cli/020-markdown-and-text-rendering.md)
- VS Code: [70-qa/test-plans/vscode/020-markdown-and-text-rendering.md](../../70-qa/test-plans/vscode/020-markdown-and-text-rendering.md)
- Chrome: [70-qa/test-plans/chrome/020-markdown-and-text-rendering.md](../../70-qa/test-plans/chrome/020-markdown-and-text-rendering.md)

## 10. Gaps and dependencies

- **CLI prints literal # prefixes on headings.** Affects: CLI users. Evidence: apps/cli/src/tui/markdown_renderer.rs:222-228 versus brief S20.02. Work needed: Drop the prefix and keep level through style; update the test.
- **Brief says tasks tick 'where supported' but no chat bubble supplies the toggle.** Affects: Web, Desktop, Mobile chat users. Evidence: onTaskToggle is passed only at ArtifactPreview.tsx:354,1934 and ArtifactFullScreen.tsx:1101. Work needed: Decide the product rule; wire or remove the unused path for chat.
- **Single-newline handling differs between VS Code and web/Chrome.** Affects: VS Code users. Evidence: render.ts:19 versus remarkPlugins.ts:74 and markdown.ts:144. Work needed: Pick one rule and add a cross-app test.
- **Web heading levels 4 to 6 have no explicit style.** Affects: Web and Desktop. Evidence: MarkdownContent.tsx:775-789. Work needed: Add h4-h6 components or confirm library default is acceptable.
- **No tests found that run a real CLI heading or nested-list case; the in-file tests cover tasks and tables only.** Affects: CLI. Evidence: markdown_renderer.rs:658-736. Work needed: Add cases for headings, ordered start and nesting.

**Depends on**

- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- file:packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx

## Unknown

- Whether mobile and CLI treat a single newline as a break (mobile parser cases not read).
- Whether the Tauri desktop build is still shipped to users; AGENTS.md says it is retained internal code.
- How text direction is applied to every mobile block.
- The exact content of the mobile and CLI test cases beyond file names.
- Where the client failure sink sends reports.
