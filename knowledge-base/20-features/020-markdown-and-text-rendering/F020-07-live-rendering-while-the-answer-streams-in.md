---
id: "F020-07"
type: "feature"
title: "Live rendering while the answer streams in"
aliases: ["Live rendering while the answer streams in", "Partially streamed Markdown (S20.22)", "Incomplete code-fence handling (S20.23)", "StreamingMarkdownContent", "streaming tail", "StreamAnnouncer", "streaming_markdown_tail (CLI)"]
area: "20 Markdown and text rendering"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S20.22", "S20.23"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "file:packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx", "file:packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design", "SYS-execution-boundaries", "F020-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F020-07 Live rendering while the answer streams in

While an AI answer is still arriving, the reader sees formatted text grow on every app. On web and desktop finished blocks are kept and only the unfinished tail is redrawn, a half-typed table or link is hidden, an open code fence shows as code, and screen readers hear new words every two seconds.

Area: [20. Markdown and text rendering](README.md). Requirement items: [S20.22](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2022), [S20.23](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2023).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Draws the answer as formatted Markdown (headings, lists, code, tables, links) while the model is still writing, instead of showing raw symbols until the end. Web and desktop split the text into finished blocks and an unfinished tail (packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx:73-135). Mobile, CLI, VS Code and Chrome each re-draw the answer so far with their own renderer.

**Why it exists.** Answers arrive a few words at a time. Without repair the reader would see stars, backticks and pipes flicker, a table jump around, or a code block appear as prose. Re-drawing a long answer on every word is also slow, so web keeps finished blocks. [inferred from the code comments and tests]

**Who uses it.** Everyone who watches a reply being written, on Web, Desktop (hosted web app), Mobile, CLI, VS Code and Chrome. Screen-reader users are served by the announcer on web and desktop.

**Problems it solves**

- Raw Markdown symbols visible mid-answer.
- A table that is half typed flashing as plain text.
- A link whose address is still arriving showing as a broken link.
- An open code fence showing as prose.
- A screen reader re-reading the whole growing answer on every word.

**Use cases**

- Ask for a comparison table and watch it appear once its header and divider are complete (web).
- Ask for code; the code block shows as code from the opening fence, before the closing fence arrives.
- Ask a long question with a screen reader and hear the answer in word-sized pieces every two seconds (web).
- Watch a reply grow in the terminal UI (CLI).

## 2. User experience

**Where to find it**

- Web: any chat turn while the reply is streaming; message body is built in apps/web/features/chat/components/messages/MessageBubble.tsx:2884-2893 and :2914.
- Desktop: the public Electron app shows the hosted web app, so it is the same screen (doc: AGENTS.md section 5; apps/desktop/electron/main.ts:345 loads a URL).
- Mobile: the chat screen while a reply streams (apps/mobile/src/features/chat/components/MessageBubble.tsx:2089-2125).
- CLI: the terminal chat UI, an answer block prefixed with a sparkle glyph (apps/cli/src/tui/tui_app.rs:2952-2970).
- VS Code: the AGI sidebar chat transcript (webviewContent.ts:3167).
- Chrome: the side panel chat (apps/extension/src/side_panel.ts:6373).

**Before you start**

- A chat turn in progress; no setting is needed.
- Web guest chat, the model compare page and the thinking block also use the same component (apps/web/features/chat/guest/GuestChat.tsx:345, apps/web/features/models/components/CompareAnswersPage.tsx:422, apps/web/features/chat/components/ThinkingBlock.tsx:181).

**Screens and controls**

- No control. The reader just watches.
- Web shows a small spinning mark above the text while prose streams (MessageBubble.tsx:2830-2833).
- Mobile shows a blank placeholder labelled 'Block in progress' for a block that cannot be drawn yet, and 'Equation in progress' for an open display equation (MessageContentRenderer.tsx:1400-1411, :1476-1486).
- After a stopped or cut-off block, mobile shows the code plus the line 'This block was not finished.' (MessageContentRenderer.tsx:1487-1507).

**Journey**

1. 1. The person sends a message.
2. 2. Text starts arriving; the app draws it as formatted Markdown straight away.
3. 3. Web/desktop: blocks that are finished stay drawn; only the last unfinished part changes.
4. 4. An unclosed code fence is drawn as a code block; an unfinished table row or header is held back; a link with a half-typed address shows only its label.
5. 5. A screen reader on web hears the new words about every two seconds.
6. 6. When the answer ends, the full renderer takes over: numeric citation markers become links, task boxes become clickable, and code is syntax highlighted (MarkdownContent.tsx:915-923; mobile highlightCode is off while streaming, MessageBubble.tsx:2113).

**What the person sees and gets**

- Formatted text growing in place.
- Web: a polite hidden live region carries the spoken text (StreamAnnouncer.tsx:97-105).
- VS Code: the transcript is a polite live log (webviewContent.ts:3167).
- Mobile: placeholder boxes for blocks not yet drawable.

**Settings**

- None found in the code for this feature.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/desktop: StreamingMarkdownContent splits the text with a Markdown parser, keeps the last two blocks unsettled (TAIL_NODE_RESERVE = 2) and draws each settled block once with a stable key (packages/ui/unified-chat/src/components/markdown/splitMarkdownBlocks.ts:6, :183-200, :205-243; StreamingMarkdownContent.tsx:110-123). MarkdownContent is wrapped in React.memo (MarkdownContent.tsx:962).
- Web/desktop: a reference link or footnote whose definition arrives later folds the whole answer back into one unit so it resolves (StreamingMarkdownContent.tsx:76-104; test StreamingMarkdownContent.test.tsx:198-250).
- Web/desktop: completeInlineTokens closes an open code span, drops a link whose address is unfinished and closes a dangling bold marker (completeInlineTokens.ts:148-162, :140-144). It skips code fences while looking for these (completeInlineTokens.ts:37-56).
- Web/desktop: holdIncompleteGfmTable cuts the row being typed and cuts a header until its divider row is valid (streamingTableHold.ts:47-74). It does not hold a whole finished table.
- Web: an unterminated fence is closed for display by closeUnterminatedFence, only when extractTrailingUnclosedBlock finds one (apps/web/features/chat/components/messages/MessageBubble.tsx:446-449, :2083). The Markdown parser also draws an unclosed fence as code to the end of the text [inferred from CommonMark; test side-panel-markdown-fence.test.ts:5 shows the same for Chrome's parser].
- Web: a half-written math error and a streaming rich block are hidden while streaming (MarkdownContent.tsx:748, :638-640).
- Web/desktop: StreamAnnouncer announces only the new words, cut at the last space, every 2000 ms, then the rest when the stream ends (StreamAnnouncer.tsx:3-13, :33-74). The web bubble passes announce={false} to StreamingMarkdownContent and wraps the announcer itself (MessageBubble.tsx:2889, :2914). The shared bubble in unified-chat does the same (packages/ui/unified-chat/src/components/MessageBubble.tsx:825-841).
- Mobile: prepareMarkdownSource holds an unfinished table, an open image tail and open inline tokens while streaming (apps/mobile/src/features/chat/components/markdownBlockSyntax.ts:530-542). classifyStreamingFence lets a fence with an unfinished structured body wait or show the last good lines (packages/ui/unified-chat/src/components/markdown/assistantFence.ts:440-458; MessageContentRenderer.tsx:1414-1426). Code is not highlighted while streaming (MessageBubble.tsx:2113).
- CLI: streaming_markdown_tail renders only the last 200 source lines, re-opens a fence if an earlier line opened one, and shows the last 40 rendered lines (apps/cli/src/tui/tui_app.rs:5492-5508, called at :2968).
- VS Code: every token re-renders the whole answer with markdown-it, then sanitizes it (webviewContent.ts:7852-7856; webview/render.ts:216-226).
- Chrome: every update re-renders the whole answer into the bubble (apps/extension/src/side_panel.ts:6373-6384; features/side-panel/markdown.ts:607-614).

**Incomplete**

- Mobile has no settled-block cache: renderMarkdownContent re-draws the full text inside a memo keyed on content (MessageBubble.tsx:2089-2125, :2114; MessageContentRenderer.tsx:1628-1665). Whether mobile avoids re-parsing finished blocks is unknown beyond that.
- VS Code and Chrome do not call completeInlineTokens or holdIncompleteGfmTable (no import found outside unified-chat and mobile). A half-typed table or open bold marker is drawn as the parser sees it. [inferred from search]
- CLI has no table hold or inline-token repair; it only windows the text (tui_app.rs:5495-5508).
- VS Code has no per-answer streaming announcer; the transcript container is a polite live log (webviewContent.ts:3167). Chrome has none found for answer text (not handled in the code).

**Present but disconnected or switched off**

- The brief points at StreamingMarkdownContent.tsx:171 and side_panel.ts:4463; the first file ends at line 147 and the second line is CSS. These brief citations are stale. (doc: knowledge-base/data/area-briefs/020-markdown-and-text-rendering.md)

**Not available**

- Settled-block caching on mobile, CLI, VS Code and Chrome (not implemented there).
- Table hold on CLI, VS Code and Chrome.

## 4. Required behaviour

**Established requirements**

- While a reply streams, partial text renders as formatted Markdown progressively rather than raw syntax; required on all six apps. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.22)
- An unclosed ``` fence mid-stream renders as a code block, not prose, until the closing fence arrives; required on all six apps. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.23)
- packages/ui/unified-chat is shared by desktop, web, Chrome and VS Code, so nothing in it may assume one surface's routing, billing or account model. (source: doc: AGENTS.md section 5)
- Production code has no silent failures or dead controls; accessible behaviour must be real. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Web: stream a reply containing a table; the header and divider are never drawn as pipe text, and the table appears once the divider row is valid.
2. Web: stream a reply with an opening code fence and no closing fence; the text after the fence is shown inside a code block.
3. Web: a link whose address is half typed shows only its label until the closing parenthesis arrives.
4. Web: while streaming, earlier paragraphs are not re-rendered when a new word arrives (render-count check).
5. Web with a screen reader: new words are announced about every 2 seconds, never half a word, and the remainder is read once when the stream ends.
6. Mobile, CLI, VS Code, Chrome: an open code fence draws as code during streaming and no raw symbols for headings, bold or lists remain visible.
7. After the stream ends, the final text equals one full parse of the whole answer.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Parity on VS Code and Chrome (table hold, inline repair) is wanted, because the brief marks every app done for S20.22 and S20.23 while the code shows different depth. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Move completeInlineTokens and holdIncompleteGfmTable into the VS Code webview renderer and the Chrome side panel renderer.
- [proposed] Add a streaming announcer to the Chrome side panel and VS Code webview, or document why the live log is enough.
- [proposed] Refresh the stale line references in the brief.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | StreamingMarkdownContent | `packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx` | Splits streaming text into settled blocks plus a tail; repairs the tail; mounts the announcer. |
| service | createMarkdownBlockSplitter | `packages/ui/unified-chat/src/components/markdown/splitMarkdownBlocks.ts` | Incremental block splitter; keeps two tail nodes; stable keys by hash. |
| service | completeInlineTokens / dropOpenLinkDestination | `packages/ui/unified-chat/src/components/markdown/completeInlineTokens.ts` | Closes open code spans and bold, drops unfinished link destinations. |
| service | holdIncompleteGfmTable | `packages/ui/unified-chat/src/components/markdown/streamingTableHold.ts` | Hides a half-typed table row or header until the divider row is valid. |
| component | StreamAnnouncer / useStreamAnnouncement | `packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx` | Polite live region announcing new words every 2000 ms. |
| hook | StreamTailContext / useIsStreamTail | `packages/ui/unified-chat/src/components/markdown/streamTailContext.ts` | Tells child blocks (rich fences, math, mermaid) that they are in the live tail. |
| component | MarkdownContent (memoised) | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Renders one Markdown unit; streaming gate for math, rich fences, citations and task toggles. |
| component | Web MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Chooses streaming vs finished rendering, closes an unterminated fence, wraps StreamAnnouncer. |
| component | Shared MessageBubble | `packages/ui/unified-chat/src/components/MessageBubble.tsx` | Shared bubble that wraps StreamAnnouncer around StreamingMarkdownContent. |
| service | classifyStreamingFence | `packages/ui/unified-chat/src/components/markdown/assistantFence.ts` | Decides whether a structured fence can be drawn yet while open. |
| service | prepareMarkdownSource | `apps/mobile/src/features/chat/components/markdownBlockSyntax.ts` | Mobile streaming repair: table hold, open image tail, inline tokens. |
| component | renderMarkdownContent / renderFencedBlock | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Mobile renderer; pending and unfinished-block placeholders. |
| component | Mobile MessageBubble | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Passes streaming and highlight flags to the renderer. |
| service | streaming_markdown_tail | `apps/cli/src/tui/tui_app.rs` | CLI streaming window: 200 source lines, 40 rendered lines, re-opened fence. |
| service | render_markdown | `apps/cli/src/tui/markdown_renderer.rs` | CLI Markdown to terminal lines. |
| service | agiRender (markdown-it) | `apps/extension-vscode/src/webview/render.ts` | VS Code webview renderer with sanitizer, run on every token. |
| component | Sidebar streaming handlers | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | token / streamReplaced / done messages call renderAssistantInto. |
| service | renderMarkdownInto / updateStreamingBubble | `apps/extension/src/features/side-panel/markdown.ts` | Chrome side-panel renderer; side_panel.ts:6373 re-fills the bubble per update. |
| test | Streaming and announcer tests | `packages/ui/unified-chat/src/components/markdown/__tests__/StreamingMarkdownContent.test.tsx` | Same-as-full-parse, table hold, definitions, diagram and highlighter gates. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model reply arrives as text pieces from the chat turn pipeline and is stored in the message content (see SYS-chat-turn-pipeline). | our servers | [inferred] Rendering input is message.content (MessageBubble.tsx:2083, mobile MessageBubble.tsx:2089-2125); the transport itself was not traced for this page. |
| Web: the bubble removes artifact blocks, closes an unterminated fence and passes the lead prose to StreamingMarkdownContent with isStreaming. | device | apps/web/features/chat/components/messages/MessageBubble.tsx:2076-2093, :2884-2893 |
| StreamingMarkdownContent splits the text into settled blocks and a tail, repairs the tail (table hold, then inline completion) and draws both. | device | packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx:76-135 |
| StreamAnnouncer reads the new words on a 2-second timer into a hidden polite live region. | device | packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx:43-56, :97-105 |
| Mobile: the bubble calls renderMarkdownContent with streaming on; the source is prepared and drawn as native views. | device | apps/mobile/src/features/chat/components/MessageBubble.tsx:2112-2118; MessageContentRenderer.tsx:1628-1636 |
| CLI, VS Code, Chrome: the whole answer so far is re-rendered per update (terminal lines, or sanitized HTML). | device | apps/cli/src/tui/tui_app.rs:2968; webviewContent.ts:7852-7856; apps/extension/src/side_panel.ts:6384 |
| When the stream ends the full non-streaming renderer replaces the live one. | device | MessageBubble.tsx:2894-2905 (MarkdownContent branch); mobile highlightCode: !isStreamingRow (MessageBubble.tsx:2113) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Message text being streamed | Message state in the app; persisted by the chat turn pipeline (not traced here) | unknown for this page; see SYS-sync-and-continuity | unknown for this page |
| Settled block list and announcer cursor | React refs in memory only (StreamingMarkdownContent.tsx:73-74; StreamAnnouncer.tsx:39-41) | no | Dropped when the component unmounts |
| Repairs (closed fence, held table) | Display only; closeUnterminatedFence says it never changes the stored message (MessageBubble.tsx:440-445 comment) | no | Not stored |

**Models and providers.** The renderer reads text only. It does not call a model or provider and does not depend on which model wrote the answer. Formatting quality depends on what the model writes. No model call is made by this feature. (apps/web/features/chat/components/messages/MessageBubble.tsx:2076-2093)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found in the code for the rendering itself. The chat turn that feeds it needs whatever sign-in the app requires (see SYS-authentication-and-identity). Web guest chat uses the same component (GuestChat.tsx:345). |
| Permissions | None found in the code. |
| Subscription | None found in the code. No plan check sits in the streaming renderer (StreamingMarkdownContent.tsx). |
| Limits and metering | CLI windows to 200 source lines and 40 rendered lines (tui_app.rs:5492-5493). Web announcer interval is 2000 ms (StreamAnnouncer.tsx:3). No usage metering in the renderer. |
| Feature flags | None found in the code for this feature. |
| Model compatibility | Any model. The renderer only sees text. Models that emit unusual Markdown get the same repair. |
| Provider restrictions | None found in the code. |
| Local mode | Rendering runs on the device in every mode. Mobile uses the same renderer for any message [inferred; no mode branch seen in MessageBubble.tsx:2089-2125]. The Electron desktop has no Local chat mode; its chat is Managed Cloud by construction (apps/desktop/electron/config.ts:8-11). Whether the CLI local runtime uses the same tail function: tui_app.rs:2968 has no mode branch. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty content while streaming | Shared bubble shows a thinking status instead of text. | packages/ui/unified-chat/src/components/MessageBubble.tsx:821-823 |
| Stream ends | Announcer reads the unread remainder once, then stops its timer; a message already finished on mount says nothing. | StreamAnnouncer.tsx:58-71; test StreamAnnouncer.test.tsx:96-124 |
| Content is not an append of the earlier text (edit or replace) | Splitter resets and re-splits. | splitMarkdownBlocks.ts:220 |
| Late reference definition | Whole answer folds into one unit until content stops being an append. | StreamingMarkdownContent.tsx:97-103 |
| Stopped by the user mid-block (mobile) | Open image tail kept, inline tokens closed; unfinished structured block shows code plus 'This block was not finished.' | markdownBlockSyntax.ts:530-542; MessageContentRenderer.tsx:1487-1507 |
| Message paused for a decision (web) | proseIsStreaming is false while paused, so the finished renderer is used. | MessageBubble.tsx:2431 |
| Open table on mobile or web | Held back; a partial pipe line renders as prose after the stream finishes. | streamingTableHold.ts:58-60; test StreamingMarkdownContent.test.tsx:186 |
| Offline, retry, cancel, timeout, reconnect | Not handled in this renderer; handled by the chat turn pipeline (mobile shows 'Reconnecting…' label at MessageBubble.tsx:1935). | apps/mobile/src/features/chat/components/MessageBubble.tsx:1935 |
| Reduced motion / accessibility on VS Code and Chrome | VS Code uses a polite live log; Chrome has no answer announcer found (not handled in the code). | webviewContent.ts:3167 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/__tests__/StreamingMarkdownContent.test.tsx`: Streamed markup equals one full parse, table hold, late definitions, diagram and highlighter gates, per-flush cost.
- `packages/ui/unified-chat/src/components/markdown/__tests__/StreamAnnouncer.test.tsx`: Interval announcements, no half words, remainder at end, silent when already finished, plain-text conversion.
- `packages/ui/unified-chat/src/components/markdown/__tests__/StreamingAnswerSurface.test.tsx`: Streaming answer surfaces.
- `packages/ui/unified-chat/src/components/markdown/__tests__/streamingParseCost.test.ts`: Parse cost while streaming.
- `packages/ui/unified-chat/src/components/markdown/splitMarkdownBlocks.test.ts`: Block splitter.
- `packages/ui/unified-chat/src/components/markdown/splitMarkdownBlocks.redos.test.ts`: Splitter resistance to slow-pattern input.
- `packages/ui/unified-chat/src/components/markdown/completeInlineTokens.test.ts`: Inline token repair and cut-off links.
- `packages/ui/unified-chat/src/components/markdown/__tests__/assistantFenceStreaming.test.ts`: Structured fences while open.
- `apps/web/features/chat/components/messages/__tests__/stream-announcement.test.ts`: The one-phrase generation status line in the message list.
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.streaming.test.tsx`: Mobile streaming rendering.
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.divergence.test.tsx`: Includes a still-streaming unterminated code fence drawn as a code block (line 32).
- `apps/mobile/__tests__/StreamingRenderCost.test.tsx`: No tokenising while streaming; code shown unhighlighted.
- `apps/extension/__tests__/side-panel-markdown-fence.test.ts`: Chrome: a still-streaming unterminated fence renders as a code block.
- `apps/extension/__tests__/side-panel-markdown-parity.test.ts`: Chrome: unclosed display maths kept as text while the answer streams (line 144).

**Test scenarios**

- **Table appears whole (web)**
  1. Send a prompt that makes the model write a 3-column table.
  2. Watch the table region as text arrives.
  3. Record frames or inspect DOM.
  - Expected: No line of pipes or dashes is ever drawn as prose; the table appears after its divider row is valid.
- **Open fence shows as code**
  1. Ask for a long code sample.
  2. While the code is still being written, look at the block.
  - Expected: Lines after the opening fence are inside a code block on web, mobile, CLI, VS Code and Chrome.
- **Settled blocks are not redrawn (web)**
  1. Open React profiler or add a render counter to MarkdownContent.
  2. Stream a 10-paragraph answer.
  - Expected: Only the last unit re-renders per update; earlier blocks keep their key.
- **Screen reader cadence (web)**
  1. Turn on a screen reader.
  2. Send a prompt with a long answer.
  - Expected: Speech comes in pieces about every 2 seconds, ending on whole words, and the end of the answer is read once.
- **Half-typed link**
  1. Stream an answer with a Markdown link.
  2. Pause at the moment after '](' is shown.
  - Expected: Web and mobile show the label only; no broken link.
- **VS Code and Chrome depth**
  1. Stream an answer with a table in the VS Code sidebar and in the Chrome side panel.
  - Expected: Record what shows mid-stream; the code suggests no table hold, so a pipe line may appear as text (unverified).

**Where to look when it fails**

- Web: client failure report 'markdown_render' from HighlightedCode (HighlightedCode.tsx:48-50).
- Web: data-streaming attribute on the message body (MessageBubble.tsx:2840).
- Web: data-testid='stream-announcer' region (StreamAnnouncer.tsx:98).
- Mobile: testIDs 'markdown-surface-pending' and 'markdown-surface-unfinished' (MessageContentRenderer.tsx:1476-1507).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/020-markdown-and-text-rendering.md](../../70-qa/test-plans/web/020-markdown-and-text-rendering.md)
- Desktop: [70-qa/test-plans/desktop/020-markdown-and-text-rendering.md](../../70-qa/test-plans/desktop/020-markdown-and-text-rendering.md)
- Mobile: [70-qa/test-plans/mobile/020-markdown-and-text-rendering.md](../../70-qa/test-plans/mobile/020-markdown-and-text-rendering.md)
- CLI: [70-qa/test-plans/cli/020-markdown-and-text-rendering.md](../../70-qa/test-plans/cli/020-markdown-and-text-rendering.md)
- VS Code: [70-qa/test-plans/vscode/020-markdown-and-text-rendering.md](../../70-qa/test-plans/vscode/020-markdown-and-text-rendering.md)
- Chrome: [70-qa/test-plans/chrome/020-markdown-and-text-rendering.md](../../70-qa/test-plans/chrome/020-markdown-and-text-rendering.md)

## 10. Gaps and dependencies

- **VS Code and Chrome show no table hold and no inline-token repair; the brief marks them done for S20.22.** Affects: VS Code and Chrome users. Evidence: No import of completeInlineTokens or holdIncompleteGfmTable outside unified-chat and mobile (rg over apps and packages); webviewContent.ts:7852-7856; side_panel.ts:6373-6384. Work needed: Share the repair functions with both renderers, or lower the brief status to partial.
- **VS Code and Chrome replace the whole answer's HTML on every token; settled blocks are not kept.** Affects: VS Code, Chrome (long answers, text selection mid-stream). Evidence: renderAssistantInto sets el.innerHTML (webviewContent.ts:5386-5388); renderMarkdownInto sets target.innerHTML (markdown.ts:612). Work needed: Block-level incremental update or an equivalent cost test.
- **CLI has no table hold or inline repair and only shows the last 40 rendered lines of the live answer.** Affects: CLI. Evidence: apps/cli/src/tui/tui_app.rs:5492-5508. Work needed: Decide if a windowed tail is the intended behaviour; add tests (no test for streaming_markdown_tail found).
- **Brief citations are stale (StreamingMarkdownContent.tsx:171, side_panel.ts:4463, markdownSource.ts:109 is TeX code, not fence handling).** Affects: Anyone using the brief. Evidence: File lengths and the lines opened for this page. Work needed: Regenerate the brief citations.
- **No streaming announcer on Chrome; VS Code relies on a log region only; mobile live-region use for answer text not found.** Affects: Screen-reader users on those apps. Evidence: StreamAnnouncer is used only in unified-chat and web (rg StreamAnnouncer); mobile accessibilityLiveRegion hits are on cards and pending bubble only. Work needed: Add and test announcements, or document equivalents.
- **The web streaming path has no direct test of closeUnterminatedFence in MessageBubble.** Affects: Web. Evidence: No test file found that references it (rg). Work needed: Add a bubble-level test.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- file:packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx
- file:packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design
- SYS-execution-boundaries
- F020-09

## Unknown

- Whether mobile avoids re-parsing finished blocks (no block cache seen; cost test only covers tokenising).
- What extractTrailingUnclosedBlock treats as an open block: it lives in a shared artifacts package and was not opened (used at apps/web/features/chat/components/messages/MessageBubble.tsx:447); the language conditions are unknown.
- How the CLI local runtime and the desktop Tauri build stream text into tui_app.rs and apps/desktop/src (not traced).
- Whether any test covers VS Code streaming render: none found by search of apps/extension-vscode/src/__tests__ names.
- Whether Chrome has an announcer for streamed text: not found, not exhaustively searched.
