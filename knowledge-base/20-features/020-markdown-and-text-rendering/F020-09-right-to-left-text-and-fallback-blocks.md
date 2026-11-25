---
id: "F020-09"
type: "feature"
title: "Right-to-left text and fallback blocks"
aliases: ["Right-to-left text and fallback blocks", "Right-to-left content (S20.29)", "Fallback rendering for unsupported blocks (S20.30)", "RTL", "textDirection", "data-answer-fallback", "interactive-card-fallback", "Copy diagram source"]
area: "20 Markdown and text rendering"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S20.29", "S20.30"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "file:packages/ui/unified-chat/src/components/markdown/textDirection.ts", "file:packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx", "file:packages/ui/unified-chat/src/components/markdown/assistantFence.ts", "SYS-shared-ui-and-design", "F020-07", "F020-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F020-09 Right-to-left text and fallback blocks

Arabic and Hebrew text should read right to left, and a block the app cannot draw (a failed diagram, an unknown card or an unknown fence) should turn into readable text. Web sets one direction per message body, mobile sets it per block, and the CLI, VS Code and Chrome have no direction code. Fallbacks exist on every app.

Area: [20. Markdown and text rendering](README.md). Requirement items: [S20.29](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2029), [S20.30](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2030).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows right-to-left languages with the right direction and alignment, and keeps unreadable or unsupported blocks visible as plain text with a way to copy the source.

**Why it exists.** A reply in Arabic shown left to right is hard to read. A broken diagram or unknown card must not make the message disappear. [inferred]

**Who uses it.** Readers of Arabic, Hebrew and other right-to-left languages; anyone whose answer contains a diagram or card the app cannot draw.

**Problems it solves**

- Arabic answers aligned left and reordered wrongly.
- A Mermaid diagram with a syntax error leaving a blank hole.
- An unknown 'x-surface' card or the literal language 'unknown' vanishing from the answer.
- An unknown programming language failing to highlight.

**Use cases**

- Ask a question in Arabic on web and read the answer right-aligned.
- Mixed list on mobile where Arabic items are right-aligned and English items stay left.
- A model writes a broken Mermaid diagram; the reader sees the error line, the source and a 'Copy diagram source' button.
- A model writes a card of a kind the app does not know; a headline and text are shown instead.

## 2. User experience

**Where to find it**

- Web and Desktop: any assistant message; the message body carries dir='auto' (apps/web/features/chat/components/messages/MessageBubble.tsx:2839, :3212).
- Mobile: assistant answers, headings, paragraphs and list items (apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:632-639, :1097, :1211-1253, :1338).
- Diagram failure on web and desktop: inside the answer where the diagram fence was (packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:363-375).
- Unknown card on web: a bordered section with the card headline (apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:227-238).
- VS Code and Chrome: unknown surfaces as a plain paragraph (assistantFence.ts:488-494).

**Before you start**

- No setting. Mobile app is built with native right-to-left support but does not force it (apps/mobile/__tests__/rtl-native-config.test.ts:3-18).

**Screens and controls**

- 'Copy diagram source' button on a failed or ready diagram; label changes to 'Source copied' or 'Copy failed' (MermaidDiagram.tsx:265-282).
- 'Show source' / 'Hide source' toggle on a drawn diagram (MermaidDiagram.tsx:342-344).
- Failed diagram message: 'This diagram could not be drawn: <reason>. Its source is kept below.' (MermaidDiagram.tsx:366-368).
- Mobile: 'This block was not finished.' under a block that never completed (MessageContentRenderer.tsx:1487-1507).

**Journey**

1. 1. The answer arrives (or finishes).
2. 2. Web: the browser picks the direction from the first strong letter of the message body; the text aligns to the start edge.
3. 3. Mobile: each heading, paragraph and list item checks its own first strong letter and, if right-to-left, gets right alignment and reversed list rows.
4. 4. If a diagram fails, the failed state shows the reason, a copy button and the source code.
5. 5. If a card kind is unknown, the fallback headline and text are shown.
6. 6. If a fence language is unknown, the code is shown plain.

**What the person sees and gets**

- Right-aligned text and mirrored list markers (mobile).
- Status line 'This diagram could not be drawn: ...' (read as a polite status).
- A plain paragraph or section instead of the missing block.
- Failed diagram is reported as a client failure 'mermaid_render' (MermaidDiagram.tsx:233, :248).

**Settings**

- None found in the code. The code theme setting affects highlighting but not fallback.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop direction: the prose container has dir='auto', so the browser decides the direction of the whole message body from its first strong letter; alignment uses text-start (MessageBubble.tsx:2839, :3212). A source-string test checks this (apps/web/features/chat/components/messages/__tests__/MessageDirection.test.tsx).
- Mobile direction: textDirection() returns rtl if the first strong letter is Hebrew or Arabic range (packages/ui/unified-chat/src/components/markdown/textDirection.ts:5-14); mobile applies writingDirection rtl and right alignment to headings, paragraphs and list items and reverses list rows (MessageContentRenderer.tsx:632-639, :1097, :1211-1253, :1338). Test: apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.blocks.test.tsx:558-569.
- Export direction (web): PDF and Word exports use one direction for the document from the first block with strong text (textDirection.ts:59-64; export-pdf.ts:295, :383; export-docx.ts:82). Tests: textDirection.test.ts.
- Diagram fallback: render errors, external-resource blocks and empty output set a failed state with reason, copy button and source (MermaidDiagram.tsx:228, :240, :249, :363-375). Streaming holds the diagram pending instead of failing (test StreamingMarkdownContent.test.tsx:252-340).
- Unknown or invalid structured fence: classifyAssistantFence returns a fallback with reason 'unknown' for the language 'unknown' and for names starting with 'x-surface-', and 'invalid' for fences that fail to parse (assistantFence.ts:84, :180-182, :211-218). Web draws a paragraph with data-answer-fallback (MarkdownContent.tsx:677-678, :720-721). VS Code and Chrome do the same in HTML (assistantFence.ts:488-494; used at webview/render.ts:59-67 and markdown.ts:188-197).
- Unknown card on web: SingleCard shows a section with the card's fallback headline and text when no renderer matches or the card is not recognised (InteractiveCardBlock.tsx:227-238).
- Unknown programming language: code is drawn as plain text until or unless the highlighter resolves it (HighlightedCode.tsx:55 returns plain code when no lines; resolveHighlightLanguage returns null for unknown names, highlightLanguages.ts:115).
- Mobile fences: an invalid closed fence shows as code, an unfinished one shows code plus 'This block was not finished.' (MessageContentRenderer.tsx:1414-1426, :1487-1507). Mobile has canRenderAssistantSurface to choose between a surface and fallback (AssistantSurface.tsx:37; MessageContentRenderer.tsx:1510).
- CLI: unknown code language falls back to plain text highlighting (apps/cli/src/tui/markdown_renderer.rs:592-601).

**Incomplete**

- Web direction is one choice per message body, not per paragraph: MarkdownParagraph and list components set no direction (MarkdownContent.tsx:392-399, :790-792). A reply that starts in English and continues in Arabic is laid out left to right throughout. [inferred from the code; not run]
- Web has no direction on code blocks and tables; tables use text-start/text-end classes by alignment only (MarkdownContent.tsx:540-548).
- Mobile table cells default to text-align 'left' regardless of direction (MessageContentRenderer.tsx:~470-480 cellStyle, textAlign alignments[colIdx] ?? 'left').
- The shared unified-chat MessageBubble has no dir attribute (rg for dir='auto' finds only the web bubble and the composer).

**Present but disconnected or switched off**

- The brief points at MessageBubble.tsx:2026 and MarkdownContent.tsx:540 for right-to-left; line 540 is table alignment, not direction; the real web hook is dir='auto' at 2839 and 3212. (doc: knowledge-base/data/area-briefs/020-markdown-and-text-rendering.md)

**Not available**

- Right-to-left handling on CLI (markdown_renderer.rs has no direction code), VS Code (webview/render.ts has none), Chrome (side-panel markdown.ts has none found), and mobile export HTML.
- Per-paragraph direction on web.

## 4. Required behaviour

**Established requirements**

- Right-to-left text (Arabic, Hebrew) renders right-aligned in the correct direction. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.29)
- A block the renderer cannot draw (unknown card, failed diagram, unknown language) degrades to a readable fallback instead of vanishing or breaking the message. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.30)
- No silent failures or dead controls; copy actions must report success or failure. (source: doc: AGENTS.md section 9)
- unified-chat is shared by desktop, web, Chrome and VS Code, so direction and fallback logic in it must not assume one surface. (source: doc: AGENTS.md section 5)

**Acceptance criteria**

1. Web: an answer written entirely in Arabic is right-aligned and flows right to left.
2. Web: an answer that starts in English then continues in Arabic: record how the Arabic paragraphs align (expected by the brief: right-aligned per paragraph).
3. Mobile: an Arabic heading, paragraph and list item are right-aligned with writingDirection rtl; an English list item beside them is not.
4. A Mermaid block with a syntax error shows the failure line, the source and a working 'Copy diagram source' button; the rest of the answer stays visible.
5. A fence labelled 'unknown' or 'x-surface-anything' shows its text as a paragraph on web, VS Code and Chrome.
6. A code fence with an unknown language shows as plain code with no error.
7. An unknown interactive card on web shows the fallback headline and text.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Direction should be decided per paragraph on every app, because the brief says 'renders right-aligned' for right-to-left text and mixed-language answers are common. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Set dir on each paragraph, heading, list and table cell from textDirection() in MarkdownContent.
- [proposed] Add the same per-block direction to the VS Code and Chrome renderers.
- [proposed] Add a browser test with a mixed English and Arabic answer.
- [proposed] Mirror table column order for right-to-left tables on mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | textDirection / documentDirection | `packages/ui/unified-chat/src/components/markdown/textDirection.ts` | First-strong-letter direction for text and document blocks. |
| component | Web MessageBubble (dir auto) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Sets dir='auto' on the prose containers. |
| component | MarkdownContent components map | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Paragraph, list, table components (no direction) and fallback paragraphs at :677 and :720. |
| component | MermaidDiagram | `packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx` | Failed state with reason, copy source and source block. |
| service | classifyAssistantFence / renderClassifiedFenceHtml | `packages/ui/unified-chat/src/components/markdown/assistantFence.ts` | Decides unknown or invalid fence fallback; HTML for VS Code and Chrome. |
| component | InteractiveCardBlock (web) | `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx` | Fallback section for unrecognised cards. |
| component | HighlightedCode / shikiHighlighter | `packages/ui/unified-chat/src/components/markdown/HighlightedCode.tsx` | Plain code when the language is unknown or highlighting fails. |
| component | Mobile renderer direction helpers | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | directionStyle, list row reversal, fence fallbacks. |
| component | AssistantSurface (mobile) | `apps/mobile/src/features/chat/components/AssistantSurface.tsx` | canRenderAssistantSurface decides surface vs fallback. |
| component | InteractiveCardBlock (mobile) | `apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx` | Mobile cards; fallback behaviour not confirmed in the lines read. |
| service | PDF and Word direction | `apps/web/features/chat/services/export-pdf.ts` | Direction-aware export; export-docx.ts:82 directionOptions. |
| service | CLI highlight fallback | `apps/cli/src/tui/markdown_renderer.rs` | Plain-text syntax fallback for unknown language (line 592-601). |
| service | VS Code fence rule | `apps/extension-vscode/src/webview/render.ts` | Uses renderClassifiedFenceHtml for fences (line 59-67). |
| service | Chrome fence rule | `apps/extension/src/features/side-panel/markdown.ts` | Uses renderClassifiedFenceHtml (line 188-197). |
| config | native RTL support | `apps/mobile/__tests__/rtl-native-config.test.ts` | Test records supportsRTL true and forcesRTL false in the app config. |
| test | textDirection test | `packages/ui/unified-chat/src/components/markdown/__tests__/textDirection.test.ts` | First-letter rule and document direction. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The answer text is rendered on the device. Web wraps it in an element with dir='auto'; the browser picks the direction. | device | MessageBubble.tsx:2839 |
| Mobile calls textDirection on each heading, paragraph and list item text and adds the right-to-left style. | device | MessageContentRenderer.tsx:632-639, :1097, :1338 |
| For each fence the app classifies the language and body; unknown or invalid gives a fallback object holding the text. | device | assistantFence.ts:205-218 |
| A diagram is drawn by a browser-side renderer inside a hidden host; any error sets the failed state. | device | MermaidDiagram.tsx:226-250, :363-375 |
| Copy source writes the diagram text to the clipboard and shows 'Source copied' or 'Copy failed'. | device | MermaidDiagram.tsx:265-282 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Diagram source, card fallback text | In the message content; display only | With the message (see SYS-sync-and-continuity); not changed by this feature | Follows the message |
| Client failure report 'mermaid_render' | Reported through reportClientFailure (destination not traced here) | unknown | unknown |

**Models and providers.** No model call. The direction and fallback are decided from the text a model returns. A model that writes malformed diagram or card syntax triggers the fallback; the renderer does not ask a model to fix it. (packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:226-250)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found in the code. |
| Permissions | Clipboard write for 'Copy diagram source' (MermaidDiagram.tsx:265-282). |
| Subscription | None found in the code. |
| Limits and metering | None found in the code. |
| Feature flags | None found in the code for this feature. |
| Model compatibility | Any model. Quality of right-to-left output depends on the model's language skill, not the renderer. |
| Provider restrictions | None found in the code. |
| Local mode | Runs on the device in every mode; no mode branch in the code read. Electron desktop has no Local mode (apps/desktop/electron/config.ts:8-11). A small on-device model may write more malformed blocks, which then use the same fallbacks. [inferred] |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Diagram loading | Shows 'Drawing diagram…' and the source; held pending while streaming. | MermaidDiagram.tsx:380-396; test StreamingMarkdownContent.test.tsx:258-300 |
| Diagram fails | Failed message with reason, copy button, source; error reported once. | MermaidDiagram.tsx:228-250, :363-375 |
| Diagram renders to empty output | Treated as failed with reason 'The rendered diagram had no displayable content'. | MermaidDiagram.tsx:240 |
| Copy fails | Button shows 'Copy failed'. | MermaidDiagram.tsx:274-276 |
| Unknown fence label or 'x-surface-' name | Paragraph with the fence text and data-answer-fallback='unknown'. | assistantFence.ts:211-218; MarkdownContent.tsx:677-678 |
| Structured fence invalid | Paragraph with data-answer-fallback='invalid'; on mobile a closed invalid fence is shown, an open one waits. | assistantFence.ts:180-182; MessageContentRenderer.tsx:1414-1426 |
| Mixed English and Arabic in one web message | One direction for the whole body, chosen by the first strong letter. | MessageBubble.tsx:2839 (dir auto on container); no paragraph-level dir in MarkdownContent.tsx |
| Digits or symbols only | textDirection returns null; LTR default. | textDirection.ts:8-14, :63 |
| Accessibility | Failed diagram message has role status; hidden render host is aria-hidden. | MermaidDiagram.tsx:259, :368 |
| CLI, VS Code, Chrome right-to-left | Not handled in the code (no direction code found). | markdown_renderer.rs, webview/render.ts, side-panel/markdown.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/__tests__/textDirection.test.ts`: First-strong-letter rule and document direction for lists and fenced text.
- `apps/web/features/chat/components/messages/__tests__/MessageDirection.test.tsx`: Reads MessageBubble.tsx source and checks it contains dir='auto' and text-start; it does not render a message.
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.blocks.test.tsx`: Right-to-left heading, paragraph and list item styles and the English item left alone (lines 558-569).
- `apps/mobile/__tests__/rtl-native-config.test.ts`: App config enables native right-to-left support without forcing it.
- `packages/ui/unified-chat/src/components/markdown/__tests__/MermaidDiagram.test.tsx`: Diagram states.
- `packages/ui/unified-chat/src/components/markdown/__tests__/MermaidDiagram.externalResources.test.tsx`: Diagram refused for external resources.
- `apps/web/features/chat/components/messages/InteractiveCardBlock.test.tsx`: Interactive card rendering on web.
- `packages/ui/unified-chat/src/components/markdown/__tests__/RichBlocks.test.tsx`: Rich fences.
- `packages/ui/unified-chat/src/components/markdown/__tests__/FunctionalBlocks.test.tsx`: Functional blocks.
- `apps/extension/__tests__/side-panel-markdown-fence.test.ts`: Chrome fences.

**Test scenarios**

- **Arabic answer on web**
  1. Ask a question in Arabic.
  2. Look at alignment, bullet side and punctuation placement.
  - Expected: Whole answer right-aligned, right to left.
- **Mixed answer on web**
  1. Ask for an English sentence followed by an Arabic paragraph and an Arabic list.
  - Expected: Record the result. The code suggests the Arabic paragraphs follow the English direction (gap).
- **Arabic and English list on mobile**
  1. Send a prompt that yields a bullet list with two Arabic items and one English item.
  - Expected: Arabic items right-aligned and reversed, English item left.
- **Broken diagram**
  1. Make the model write a Mermaid block with a syntax error.
  - Expected: Failure line, source and 'Copy diagram source' appear; pressing the button shows 'Source copied'.
- **Unknown card or fence**
  1. Send a message whose fence language is 'x-surface-demo'.
  - Expected: Text shows as a paragraph on web, VS Code and Chrome; no blank gap.
- **Unknown code language**
  1. Ask for code in a rare language.
  - Expected: Plain code, no error.

**Where to look when it fails**

- Web: data-mermaid='failed' on the figure (MermaidDiagram.tsx:365); data-answer-fallback attribute; data-testid='interactive-card-fallback'.
- Client failure event 'mermaid_render' (MermaidDiagram.tsx:233, :248).
- Mobile: testID 'markdown-list-item-rtl'.
- Check the card parse code that produces card.recognized and card.fallback (not traced).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/020-markdown-and-text-rendering.md](../../70-qa/test-plans/web/020-markdown-and-text-rendering.md)
- Desktop: [70-qa/test-plans/desktop/020-markdown-and-text-rendering.md](../../70-qa/test-plans/desktop/020-markdown-and-text-rendering.md)
- Mobile: [70-qa/test-plans/mobile/020-markdown-and-text-rendering.md](../../70-qa/test-plans/mobile/020-markdown-and-text-rendering.md)
- CLI: [70-qa/test-plans/cli/020-markdown-and-text-rendering.md](../../70-qa/test-plans/cli/020-markdown-and-text-rendering.md)
- VS Code: [70-qa/test-plans/vscode/020-markdown-and-text-rendering.md](../../70-qa/test-plans/vscode/020-markdown-and-text-rendering.md)
- Chrome: [70-qa/test-plans/chrome/020-markdown-and-text-rendering.md](../../70-qa/test-plans/chrome/020-markdown-and-text-rendering.md)

## 10. Gaps and dependencies

- **Web decides direction once per message, not per paragraph.** Affects: Web and Desktop users reading mixed English and right-to-left answers. Evidence: dir='auto' only on the container (MessageBubble.tsx:2839, :3212); MarkdownParagraph has no dir (MarkdownContent.tsx:392-399); brief S20.29 and the draft say per paragraph. Work needed: Add dir from textDirection to paragraph, heading, list, quote and table cell components; add a rendering test.
- **CLI, VS Code and Chrome have no right-to-left handling.** Affects: Right-to-left readers on those apps. Evidence: No direction code in markdown_renderer.rs, webview/render.ts or side-panel/markdown.ts (rg). Work needed: Per-block dir in the two HTML renderers; terminal limits for the CLI need a decision.
- **Mobile table cells and export HTML ignore direction.** Affects: Mobile readers of right-to-left tables and PDFs. Evidence: textAlign alignments[colIdx] ?? 'left' in MessageContentRenderer.tsx table cells; no direction in exportMarkdownHtml.ts. Work needed: Use textDirection on cells; add direction to export HTML.
- **The web direction test only reads source text.** Affects: Web. Evidence: MessageDirection.test.tsx:5-16. Work needed: Render a message in a browser test and check computed direction.
- **Brief says mobile right-to-left is unverified, but a test exists.** Affects: Brief accuracy. Evidence: MessageContentRenderer.blocks.test.tsx:558-569. Work needed: Update the brief status after a device check.
- **Brief citations are stale for right-to-left (MarkdownContent.tsx:540 is table alignment).** Affects: Anyone using the brief. Evidence: MarkdownContent.tsx:540-548. Work needed: Regenerate citations.
- **Mobile card fallback not confirmed.** Affects: Mobile. Evidence: InteractiveCardBlock.tsx lines read near 375-400 show map tiles, not a fallback. Work needed: Read the rest of the mobile card file and add a test.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- file:packages/ui/unified-chat/src/components/markdown/textDirection.ts
- file:packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx
- file:packages/ui/unified-chat/src/components/markdown/assistantFence.ts
- SYS-shared-ui-and-design
- F020-07
- F020-08

## Unknown

- Whether the browser applies dir='auto' per block child in a real mixed-language message: the result was inferred from HTML rules, not run.
- Whether the mobile InteractiveCardBlock has a fallback for an unknown card (file read only partly).
- What the web card parser sets for card.recognized and card.fallback (not opened).
- Where reportClientFailure sends its data and how long it is kept.
- Whether Chrome's side panel sets any direction through CSS or a dir attribute outside markdown.ts (not exhaustively searched).
- Desktop Tauri build (apps/desktop/src) rendering of right-to-left: only a floating chat using MarkdownContent was found (apps/desktop/src/features/floating-chat/index.tsx:249).
