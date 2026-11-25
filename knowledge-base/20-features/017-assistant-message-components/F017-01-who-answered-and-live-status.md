---
id: "F017-01"
type: "feature"
title: "Who answered and live status"
aliases: ["Who answered and live status", "Assistant identity", "Answered-by chip", "Working indicator", "Typing indicator", "Streaming answer body", "Actual-model and usage details", "S17.01", "S17.02", "S17.03", "S17.36"]
area: "17 Assistant-message components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "partly seen (3 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S17.01", "S17.02", "S17.03", "S17.36"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:own-key", "mode:cloud", "SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design", "file:apps/web/features/chat/components/messages/MessageBubble.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F017-01 Who answered and live status

Marks each reply as an assistant reply, shows the model that actually answered with its usage and time, shows a working indicator before text arrives, and renders the text as it streams in. Present on web, desktop (hosted web app), mobile, CLI, VS Code and Chrome in different forms.

Area: [17. Assistant-message components](README.md). Requirement items: [S17.01](../../10-requirements/capabilities/017-assistant-message-components.md#s1701), [S17.02](../../10-requirements/capabilities/017-assistant-message-components.md#s1702), [S17.03](../../10-requirements/capabilities/017-assistant-message-components.md#s1703), [S17.36](../../10-requirements/capabilities/017-assistant-message-components.md#s1736).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (3 of 4) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Tells the person who wrote each answer (assistant, and which model), shows that the assistant is still working, and fills the answer in as it arrives. After the answer is done it offers the model name, token counts and run time. On web the label comes from stored message data, so it survives a reload (apps/web/features/chat/components/messages/MessageBubble.tsx:2398).

**Why it exists.** The product is model agnostic and can route a turn through Auto, so the person needs to see which model really answered, not only which one they picked. A visible and announced working state stops a slow first token from looking like a hang (apps/cli/src/tui/tui_app.rs:3005-3020).

**Who uses it.** Every person who chats on any of the six apps; testers checking routing; support staff reading a screenshot.

**Problems it solves**

- Cannot tell which model answered after Auto routing
- Blank screen while waiting for the first token
- Screen reader users not told when a reply finished or failed
- No way to see how much a turn used

**Use cases**

- Open the more-actions menu on a web answer to read the time sent, the model and the token counts.
- Watch a mobile answer stream in with a spinner and status label, then read the provider and model line under it.
- Run a CLI turn and read the answer details line (model, tokens in and out, cost if any, time).
- Use a screen reader on web and hear one short phrase per generation change, such as Response complete.

## 2. User experience

**Where to find it**

- Web and Desktop (Desktop shows the hosted web app): answer text, then the action row under it. The model name is a small answered-by text at the end of the row, shown on hover or focus and always on touch (MessageBubble.tsx:4119-4127). The More message actions menu shows Sent at, the model and token counts (MessageBubble.tsx:3957-3976, 4075-4092).
- Mobile: a line under the answer gives the provider and model (ProvenanceFooter, apps/mobile/src/features/chat/components/MessageBubble.tsx:2995); a usage line sits beside it (MessageBubble.tsx:2998). Action-row button label is More message actions for <model> (MessageBubble.tsx:3188).
- CLI: after each turn the TUI adds an answer-details line (apps/cli/src/tui/tui_app.rs:2133-2151).
- VS Code: a small label in the answer action row; hover for the token detail (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4879-4885, 4941-4953).
- Chrome side panel: a meta label in the bubble action row with model name and elapsed time (apps/extension/src/features/side-panel/bubbles.ts:463-469, 608-620).

**Before you start**

- A conversation with at least one sent message.
- Model label depends on stored message fields (model, requested model, route lane); older messages without them show no label (MessageBubble.tsx:2398-2415).

**Screens and controls**

- Web: TypingIndicator reads Preparing with a spinning mark (apps/web/features/chat/components/messages/TypingIndicator.tsx:9-21). Streaming text uses StreamingMarkdownContent (MessageBubble.tsx:3217-3226).
- Web screen reader: one hidden status line with a phrase per state (ChatMessageList.tsx:2089-2091).
- Mobile: StreamingIndicator with a spinning mark, role progressbar, label Generating response unless a status label is given (apps/mobile/src/features/chat/components/StreamingIndicator.tsx:8-27). Long-press or accessibility action opens the message actions sheet.
- CLI: braille spinner, a verb (Thinking) and elapsed seconds; after 10 s with no visible text it adds still working (tui_app.rs:3005-3020, 2155).
- VS Code and Chrome: streaming text in the webview and side panel; Chrome also shows a Stopping or Reconnecting status line (bubbles.ts:655-661).

**Journey**

1. Person sends a message.
2. Before any text arrives the working indicator shows (web Preparing, mobile Generating response or a research label, CLI Thinking with a timer).
3. Text streams into the answer body with markdown applied as it arrives.
4. When the turn settles the indicator goes away and the screen reader phrase changes (for example Response complete).
5. The answer shows the model label, and token counts and time are available in the menu (web), under the answer (mobile) or in the details line (CLI).

**What the person sees and gets**

- Web live phrases: Response complete, Response failed, Response paused, waiting for your approval, Response cancelled. Partial response saved, No response was generated (ChatMessageList.tsx:1144-1170).
- Web Auto turns read Auto chose <model> (MessageBubble.tsx:2411-2415); mobile has a similar receipt (MessageBubble.tsx:803-815).
- CLI details line: <model> · N in · N out · optional cost · time (tui_app.rs:2138-2150).

**Settings**

- No setting turns the answer label or usage off on web, mobile, CLI or VS Code: none found in the code.
- Web TokenUsageDisplay is shown only when stored metadata has a token total (MessageBubble.tsx:4075).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: answered-by label, Auto-chose label, token and time detail, typing indicator, streaming markdown and a hidden live region all exist (MessageBubble.tsx:2398-2415, 4075-4092; ChatMessageList.tsx:1350, 2089).
- Mobile: provenance (provider and model, or Local Mode), usage line, streaming indicator and an accessibility label of the form <role> message: <first 100 chars> (MessageBubble.tsx:790-815, 2217-2220, 2995-3007).
- CLI: answer-details line with model, tokens, cost and time; spinner with timer (tui_app.rs:2133-2151, 3005-3020).
- VS Code: model label with token detail on hover (webviewContent.ts:4941-4953).
- Chrome: model name and elapsed time label, route receipt when Auto moved to another model (bubbles.ts:463-481).

**Incomplete**

- Web TypingIndicator itself has no role or live region (TypingIndicator.tsx:9-21); the announcement comes from the separate list-level status line (ChatMessageList.tsx:2089). Whether every app announces the working state was not verified on mobile beyond the progressbar role.
- Chrome shows model and time but no token counts in the meta label (bubbles.ts:463-469).
- VS Code shows the label only when the host sends a model label (webviewContent.ts:4942).

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Cost is not shown in the web menu detail; only tokens, request id and seconds are passed to the display (MessageBubble.tsx:4079-4090).

## 4. Required behaviour

**Established requirements**

- Assistant turns are distinguishable from the user's visually and to assistive tech, ideally naming the assistant or model. (source: brief S17.01)
- The answer body renders incrementally as tokens arrive, with markdown formatting. (source: brief S17.02)
- While the assistant works, a visible and announced working indicator is shown. (source: brief S17.03)
- For each answer the user can see which model actually answered and its usage (tokens, cost, time). (source: brief S17.36)
- A turn that returns nothing shows an explicit no-response error with retry, not an empty bubble. (source: brief S17.40)
- When an answer fails after some output, the partial text is kept and marked incomplete with the reason. (source: brief S17.37)
- Message actions work after app reload (M-CHAT-005). (source: doc: docs/product/requirements.md)

**Acceptance criteria**

1. On web, after an Auto turn finishes, the answered-by text names the model that answered and begins Auto chose.
2. On web, the More message actions menu shows Sent at plus token counts when the message has stored usage.
3. On mobile, a finished cloud answer shows the provider and model line; a local answer shows Local Mode and the model name.
4. With a screen reader on web, a finished turn produces the phrase Response complete, a stopped one Response cancelled. Partial response saved.
5. Before the first token, the working indicator is visible on web, mobile and CLI.
6. After a page reload, the model label is still shown (it comes from stored fields).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Model label should come from the resolved model, not the picked one [inferred from MessageBubble.tsx:2398 using message.model first and mobile preferring metadata.resolvedModel at MessageBubble.tsx:786-790].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give the web TypingIndicator its own status role so it is announced even if the list-level line is removed.
- [proposed] Show cost in the web usage detail so web matches the CLI line.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Renders the answer, answered-by label (2398-2415, 4119), action row and usage menu (4075). |
| component | ChatMessageList (web) | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Transcript, typing indicator (1350, 2000), live-region phrases (1144, 2089). |
| component | TypingIndicator | `apps/web/features/chat/components/messages/TypingIndicator.tsx` | Spinning mark with the word Preparing. |
| component | StreamingMarkdownContent | `packages/ui/unified-chat/src/index.ts` | Shared streaming markdown renderer used by web (imported at MessageBubble.tsx:164-165). |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Web streaming turn engine that fills the message while it arrives. |
| component | TokenUsageDisplay | `apps/web/features/chat/components/tokens/TokenUsageDisplay.tsx` | Token detail in the menu (imported MessageBubble.tsx:96); file path inferred from the import, not opened. |
| component | MessageBubble (mobile) | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Provenance (790-815), usage line (1958, 2998), streaming indicator use (2497-2510). |
| component | StreamingIndicator (mobile) | `apps/mobile/src/features/chat/components/StreamingIndicator.tsx` | Spinner plus label with progressbar role. |
| component | ProvenanceFooter | `apps/mobile/src/features/chat/components/ProvenanceFooter.tsx` | Prints provider and model under the answer. |
| component | TUI answer details | `apps/cli/src/tui/tui_app.rs` | answer_details (2133), spinner line (3005-3020). |
| component | VS Code webview answer meta | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | answerMeta (4941) and message label in the action row (4879). |
| component | Chrome bubbles | `apps/extension/src/features/side-panel/bubbles.ts` | answerMetaLabel (463), action row (608), transient status (655). |
| service | answeredModel routing | `apps/extension/src/features/side-panel/answeredModel.ts` | Turns routing results into the answered model and Auto reason for the Chrome bubble. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person sends a message; web useChatStream opens the turn and streams chunks into the message in the client store. | device and our servers | apps/web/lib/hooks/useChatStream.ts (stream engine); MessageBubble.tsx:3217 streaming render |
| While no assistant text exists the transcript shows the typing indicator. | device | apps/web/features/chat/components/messages/ChatMessageList.tsx:1350 |
| A hidden live region speaks one phrase when generation changes phase. | device | ChatMessageList.tsx:1750-1757, 2089 |
| When the turn ends, the message holds model, requested model, route lane and token fields; the label is computed from them on render. | device | MessageBubble.tsx:2397-2415 |
| Mobile derives provider and model from the stored model and resolved model; local models show Local Mode. | device | apps/mobile/src/features/chat/components/MessageBubble.tsx:790-815 |
| CLI builds the details line from the finished turn's token counts, cost and elapsed time. | device | apps/cli/src/tui/tui_app.rs:2133-2151, 8650 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Model, requested model, route lane, token counts, duration and request id on the assistant message | Message metadata in the client store and, for cloud chats, the saved message row (field names in MessageBubble.tsx:4075-4090). Table name unknown. | Cloud chats sync through the saved message; local chats stay on the device [inferred]. | Kept with the message; removed when the message is deleted [inferred]. |

**Models and providers.** The label is the resolved model, looked up through the shared model catalog (getManagedModelPresentationLabel, MessageBubble.tsx:2400). Any provider in the catalog can appear; no provider is special-cased. Local models are labelled Local Mode on mobile (MessageBubble.tsx:803).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Reading the label needs no extra sign-in beyond viewing the chat. Streaming a turn follows the chat rules of each mode; not studied here. |
| Permissions | none found in the code |
| Subscription | none found in the code for showing the label. Whether a free-pool answer is labelled differently: web passes freePool when the route lane is the free lane (MessageBubble.tsx:2400-2403) and mobile uses answeredOnFreePool (MessageBubble.tsx:806). |
| Limits and metering | none found in the code for display; the numbers shown are the metered usage of the turn. |
| Feature flags | none found in the code |
| Model compatibility | Any model with stored metadata. Auto ids are never shown as the answering model; the resolved model is (MessageBubble.tsx:2400, mobile 786-790). |
| Provider restrictions | none found in the code |
| Local mode | Mobile shows Local Mode plus the model name (MessageBubble.tsx:803). Web shows a Local badge in the action row when the privacy mode is local (MessageBubble.tsx:3686-3694). CLI footer shows Local as the access word (tui_app.rs:3486-3495). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading before first token | Web Preparing, mobile Generating response, CLI Thinking with timer and a still working hint after 10 s. | TypingIndicator.tsx:17; StreamingIndicator.tsx:17; tui_app.rs:3005-3017 |
| Empty response | Web reason text no response was returned and live phrase No response was generated; mobile message The model finished without returning a response. Try again.; CLI has an empty_response code. | ChatMessageList.tsx:120, 1149; apps/mobile/src/features/chat/utils/messageStreamError.ts:57-61; apps/cli/src/errors.rs:120 |
| Partial answer after failure | Web reason text says the part that arrived is kept above; mobile prefixes Response may be incomplete. | ChatMessageList.tsx:117; messageStreamError.ts:64 |
| Auto routed to another model | Web chip reads Auto chose <model>; web also shows a dismissible model substitution notice. | MessageBubble.tsx:2411, 3520-3535 |
| Reduced motion | Web typing indicator animation is skipped when reduced motion is set. | ChatMessageList.tsx:2003-2006 |
| Offline or reconnect | Mobile status label Reconnecting…; Chrome shows Reconnecting status line. | MessageBubble.tsx:1935; bubbles.ts:655-661 |
| Message with no stored model | No label is rendered on web. | MessageBubble.tsx:2398-2403 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/__tests__/stream-announcement.test.ts`: Live-region phrases (from file name; contents not opened).
- `apps/web/features/chat/components/messages/MessageBubble.timestamp.test.tsx`: Sent at timestamp in the menu (from file name).
- `apps/web/features/chat/components/messages/ChatMessageList.test.tsx`: Transcript list behaviour (from file name).
- `apps/web/features/chat/components/messages/__tests__/MessageBubble.emptyTurnActions.test.tsx`: Action row on a turn stopped before its first token: no copy or verdict, other actions kept (test names read).
- `apps/mobile/__tests__/MessageBubbleAccessibility.test.tsx`: Mobile bubble accessibility (from file name).
- `apps/mobile/__tests__/cloud-stream-finish-reason-and-error.test.ts`: Finish reason and error from the cloud stream (from file name).
- `apps/extension-vscode/src/__tests__/accessibleNames.webview.test.ts`: Accessible names in the VS Code webview (from file name).

**Test scenarios**

- **Auto model label**
  1. On web choose Auto, send a prompt, wait for it to finish.
  2. Hover the answer and read the small text at the end of the action row.
  3. Open More message actions.
  - Expected: The row text begins Auto chose and names the model; the menu shows Sent at and token counts.
- **Working indicator**
  1. Send a prompt to a slow model on web and on mobile.
  2. Look before text arrives.
  - Expected: Web shows Preparing; mobile shows the spinner with its label; both disappear once text arrives.
- **Screen reader phrase**
  1. Turn on a screen reader on web.
  2. Send a prompt; stop it halfway.
  - Expected: You hear Response cancelled. Partial response saved.
- **CLI details line**
  1. Run the CLI TUI, send one prompt.
  - Expected: A line shows model, N in, N out, time, and cost only when not on a subscription.
- **Reload keeps label**
  1. Finish a cloud answer on web.
  2. Reload the page.
  - Expected: The model label and token detail are still present.

**Where to look when it fails**

- Check message metadata keys model, requestedModel, routeLane, tokensUsed (MessageBubble.tsx:2397-2403, 4075).
- Mobile: metadata resolvedModel and requestedModel decide provenance (MessageBubble.tsx:786-790).
- Run test files above from the owning app with its own test runner (not run here).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/017-assistant-message-components.md](../../70-qa/test-plans/web/017-assistant-message-components.md)
- Desktop: [70-qa/test-plans/desktop/017-assistant-message-components.md](../../70-qa/test-plans/desktop/017-assistant-message-components.md)
- Mobile: [70-qa/test-plans/mobile/017-assistant-message-components.md](../../70-qa/test-plans/mobile/017-assistant-message-components.md)
- CLI: [70-qa/test-plans/cli/017-assistant-message-components.md](../../70-qa/test-plans/cli/017-assistant-message-components.md)
- VS Code: [70-qa/test-plans/vscode/017-assistant-message-components.md](../../70-qa/test-plans/vscode/017-assistant-message-components.md)
- Chrome: [70-qa/test-plans/chrome/017-assistant-message-components.md](../../70-qa/test-plans/chrome/017-assistant-message-components.md)

## 10. Gaps and dependencies

- **The brief marks live status done on all apps but the web TypingIndicator has no announcement of its own.** Affects: Screen reader users on web and Desktop. Evidence: TypingIndicator.tsx:9-21 versus ChatMessageList.tsx:2089. Work needed: Confirm the list-level line covers the pre-token state, or add a status role.
- **Chrome meta label has no token counts.** Affects: Chrome users. Evidence: bubbles.ts:463-469. Work needed: Pass token fields into the meta label if the brief's usage requirement should apply.
- **Brief line references are stale (for example the follow-up flag moved from 1048 to 1104).** Affects: Anyone following the brief. Evidence: ChatMessageList.tsx:1104. Work needed: Regenerate the brief code index.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:own-key
- mode:cloud
- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design
- file:apps/web/features/chat/components/messages/MessageBubble.tsx

## Unknown

- Whether the Desktop Electron window adds any answer-label behaviour beyond the hosted web app (not checked).
- The saved-message table and column that hold model and token fields (not opened).
- Whether mobile announces the working state beyond the progressbar role.
