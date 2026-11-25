---
id: "F019-04"
type: "feature"
title: "Streaming the answer"
aliases: ["Receiving first output", "Streaming text", "Streaming structured output", "Typing effect", "Thinking block", "Frame coalescing"]
area: "19 Streaming and response-presentation states"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S19.09", "S19.10", "S19.11"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-inference-providers", "SYS-shared-ui-and-design", "SYS-local-inference", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F019-04 Streaming the answer

The answer appears while the model writes it. The waiting row gives way when text arrives, text is added in small batches so the screen does not flicker, and lists, tables and code blocks take shape while partial. Each app has its own renderer.

Area: [19. Streaming and response-presentation states](README.md). Requirement items: [S19.09](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1909), [S19.10](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1910), [S19.11](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1911).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Streams model text to the screen in batches, swaps the waiting indicator for the answer, and renders markdown while it is incomplete.

**Why it exists.** Long answers would otherwise show nothing until the end; batching keeps the page smooth.

**Who uses it.** Everyone reading answers.

**Problems it solves**

- Visible progress during long answers.
- No flicker or tap lag from one render per token (mobile services/streaming.ts:244-250).
- An unfinished code fence still looks like code.

**Use cases**

- Read a long answer as it appears.
- Scroll up while it streams without being pulled to the bottom.
- Watch a table or list form.
- Expand a thinking block.

## 2. User experience

**Where to find it**

- Web and Desktop: the assistant message body in the transcript.
- Mobile: the assistant bubble.
- CLI: the live transcript area during a turn.
- VS Code: sidebar chat message.
- Chrome: side panel message.

**Before you start**

- A model route that streams.

**Screens and controls**

- Web scroll anchoring: follow the bottom unless the reader scrolled up (ChatMessageList.tsx:1558-1589,1632-1638).
- Thinking block expand and collapse on web, mobile (ThinkingUi tests exist), others unknown.
- CLI: scroll the transcript during a turn; Ctrl+O toggles expanded tool output (tui_app.rs:8455-8460).

**Journey**

1. 1. After send the waiting row shows (F019-01).
2. 2. The first text arrives: on web the typing indicator condition becomes false because the last message is streaming (ChatMessageList.tsx:1350).
3. 3. Text appends once per frame on web (frame-coalesced-appender.ts:20-70, fallback 32 ms), every 16 ms on mobile (streaming.ts:250), every 80 ms redraw tick in the CLI (tui_app.rs:8438).
4. 4. Markdown is rendered on the partial text; an open code fence is closed for display on web (MessageBubble.tsx:446-449) and a fence is re-opened for the visible tail in the CLI (tui_app.rs:5495-5512).
5. 5. The turn ends and the streaming flag clears.

**What the person sees and gets**

- Answer text growing in place.
- Web: for an artifact block the Creating row replaces the raw code in the body (MessageBubble.tsx:2057-2060).

**Settings**

- None found specific to streaming display.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: first text hides the Preparing indicator; appends coalesced per animation frame with 32 ms fallback (frame-coalesced-appender.ts:1-70; useChatStream.ts:2051-2065).
- Web: thinking text appended through the same appender (useChatStream.ts:2461-2469).
- Web: unterminated fence closed for display only, stored message not changed (MessageBubble.tsx:437-449).
- Web: reader scrolling away is respected with an anchoring timer (ChatMessageList.tsx:1556-1589).
- Mobile: events delivered at most once per 16 ms in order (services/streaming.ts:250-295); fence detection helpers (MessageContentRenderer.tsx:747-756); streaming citation link hold (src/features/chat/utils/streamingCitationLink.ts).
- CLI: live redraw with tail-limited markdown and a re-opened fence (tui_app.rs:5495-5512); markdown renderer supports tables and strike (markdown_renderer.rs:142-150).
- VS Code and Chrome: streaming renderers exist; not opened (webviewContent.ts renderAssistantInto at 5059; Chrome markdown.ts).

**Incomplete**

- Mobile: no per-delta batching in the store write at chatExecutionStore.ts:3713; batching is in the stream layer.
- VS Code and Chrome streaming render functions were not read, so partial markdown behaviour there is unknown.

**Present but disconnected or switched off**

- nothing found

**Not available**

- The draft claim that a half-finished fence is 'held until it closes' is not true on web or CLI: web closes it and shows it as code; the CLI re-opens it. Held-back behaviour not found.

## 4. Required behaviour

**Established requirements**

- The moment first output arrives, the waiting indicator gives way to the answer. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.09)
- Text appears progressively while the model streams. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.10)
- Structured output (lists, tables, code) renders correctly while streaming. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.11)
- Streaming response is visible; user sees running state and can stop. (source: docs/product/requirements.md:955 (M-CHAT-003))

**Acceptance criteria**

1. Send a long prompt on web: the Preparing row disappears on the first text.
2. Scroll up during streaming: the view stays; returning to the bottom resumes following.
3. Stream a table: rows appear without raw pipe characters stuck on screen at the end.
4. Stream a code block: the open block renders as code with no stray backticks.
5. On mobile with 60 fast tokens, the Stop button stays tappable.
6. In the CLI the tail of a long answer stays readable and the spinner line updates.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Partial markdown on VS Code and Chrome should match web [inferred from brief done status].
- Reduced-motion preference should not remove progressive text [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a visual regression test of a half-streamed table on each app.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | createFrameCoalescedAppender | `apps/web/lib/client/frame-coalesced-appender.ts` | Batches content and thinking text per frame. |
| hook | useChatStream append wiring | `apps/web/lib/hooks/useChatStream.ts` | Creates the appender and calls appendToMessage (2051-2065). |
| component | web MessageBubble markdown and fence repair | `apps/web/features/chat/components/messages/MessageBubble.tsx` | closeUnterminatedFence and streaming artifact split (437-449,2057-2110). |
| component | ChatMessageList scroll and typing row | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Follow-bottom logic and when Preparing shows. |
| service | mobile frameStreamCallbacks | `apps/mobile/services/streaming.ts` | 16 ms ordered delivery. |
| store | mobile chat execution store | `apps/mobile/stores/chat/chatExecutionStore.ts` | Applies deltas to the streaming message (3670-3720). |
| component | mobile MessageContentRenderer | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Fence-aware rendering with a streaming flag (747-756,835-852). |
| component | mobile MessageList | `apps/mobile/src/features/chat/components/MessageList.tsx` | List and follow-bottom behaviour (test MessageListFollowBottom.test.tsx). |
| component | CLI streaming tail | `apps/cli/src/tui/tui_app.rs` | streaming_markdown_tail (5495-5512), live tick (8438-8560). |
| service | CLI markdown renderer | `apps/cli/src/tui/markdown_renderer.rs` | Markdown to styled lines with tables and code highlighting. |
| component | VS Code transcript render | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | renderAssistantInto and typing indicator (5019-5060). |
| component | Chrome markdown renderer | `apps/extension/src/features/side-panel/markdown.ts` | Markdown for the side panel (not opened). |
| hook | useStreamingArtifactSync | `apps/web/features/chat/hooks/use-streaming-artifact.ts` | Moves a streaming artifact block into the artifact panel. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model provider streams chunks to the AGI chat endpoint, which relays server-sent events. | outside service | apps/web/lib/hooks/useChatStream.ts:1679-1690 reads server-sent events; provider side in SYS-inference-providers |
| The gateway normalises chunks and forwards them. | our servers | apps/web/app/api/llm/v1/chat/completions/route.ts (route file exists; internals in SYS-chat-turn-pipeline) |
| The client batches text per frame and appends to the message. | device | frame-coalesced-appender.ts:20-70; services/streaming.ts:250-295 |
| The renderer re-parses markdown for the visible message and closes or re-opens an open fence. | device | MessageBubble.tsx:446-449; tui_app.rs:5495-5512 |
| For a Local model on web the text comes from runLocalTurn on the device. | device | useChatStream.ts:4494 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Streaming message text and thinking text | Client chat store (web zustand store; mobile message store; CLI stream_buffer) | Saved to the server when the turn settles for saved Cloud chats [inferred from saveMessageToDb at useChatStream.ts:6162] | Kept as the final message |

**Models and providers.** Rendering is independent of model. Whether a thinking block exists depends on the model and route sending reasoning text.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud streaming needs sign-in; Local does not need an account for display. |
| Permissions | None found. |
| Subscription | None found in the code for rendering. |
| Limits and metering | Chrome stops emitting visible text after 512,000 characters (MAX_VISIBLE_TEXT_CHARACTERS in managedRunControl.ts:34). Other apps: not found. |
| Feature flags | None found. |
| Model compatibility | Models without reasoning text show no thinking block. |
| Provider restrictions | None found. |
| Local mode | Local streaming displays through the same message store on web; mobile and CLI local streaming: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty or no first output | Waiting row stays (F019-01); an empty answer ends in the F019-06 empty-response notice. | turn-error-notice.ts:259-261 |
| Reader scrolled up | List does not jump back. | ChatMessageList.tsx:1626-1630,1740-1745 |
| Open code fence | Closed for display on web; re-opened on CLI tail. | MessageBubble.tsx:446-449; tui_app.rs:5503-5509 |
| Tap during burst (mobile) | Delivery capped at once per frame so taps are not held. | services/streaming.ts:252-256 |
| Unfinished last line (CLI) on stop | The partial line is set apart. | turn_transcript.rs:65-79 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.streaming.test.tsx`: Mobile streaming render [inferred from file name].
- `apps/mobile/src/features/chat/components/__tests__/StreamingArtifactCard.tail.test.tsx`: Artifact tail [inferred].
- `apps/mobile/__tests__/MessageListFollowBottom.test.tsx`: Mobile follow-bottom [inferred].
- `apps/web/features/chat/hooks/use-streaming-artifact.test.ts`: Streaming artifact sync [inferred].
- `apps/web/features/chat/components/messages/ChatMessageList.test.tsx`: Transcript list [inferred].

**Test scenarios**

- **First token swap**
  1. Send a prompt on web.
  2. Observe the transition.
  - Expected: Preparing disappears when text appears; no empty gap.
- **Partial fence**
  1. Ask for a long code sample.
  2. Capture the page mid-stream.
  - Expected: Open block rendered as code on web; no stray backticks.
- **Scroll hold**
  1. During streaming scroll up 500px.
  2. Wait 5 seconds.
  - Expected: Position does not move; a return control or scroll to bottom resumes following.
- **Table streaming**
  1. Ask for a 10-row table.
  - Expected: Table forms row by row without a raw pipe line left on completion.

**Where to look when it fails**

- Web: frame timings via the latency trace (latencyTrace.scheduleFirstPaint at useChatStream.ts:2063).
- Mobile: failure in a stream callback calls onError (services/streaming.ts:271-279).
- CLI: stream_buffer content versus transcript.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/web/019-streaming-and-response-presentation-states.md)
- Desktop: [70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md)
- Mobile: [70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md)
- CLI: [70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md)
- VS Code: [70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md)
- Chrome: [70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md)

## 10. Gaps and dependencies

- **VS Code and Chrome partial markdown behaviour not verified here.** Affects: VS Code, Chrome. Evidence: Render functions not opened. Work needed: Read and test.
- **Brief wording 'held until it closes' does not match code.** Affects: Documentation. Evidence: MessageBubble.tsx:446-449. Work needed: Fix wording.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-inference-providers
- SYS-shared-ui-and-design
- SYS-local-inference
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- VS Code streaming render function and Chrome markdown behaviour.
- Thinking block UI on VS Code, CLI and Chrome.
- Mobile local streaming path.
- Whether any app holds back an open table row.
