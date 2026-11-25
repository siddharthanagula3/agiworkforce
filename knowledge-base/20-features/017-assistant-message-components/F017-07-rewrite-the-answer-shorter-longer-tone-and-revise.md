---
id: "F017-07"
type: "feature"
title: "Rewrite the answer (shorter, longer, tone) and revise a selected part"
aliases: ["Rewrite answer", "Shorten answer", "Expand answer", "Change tone", "Revise selected text", "Select Text", "Quote in reply", "S17.23", "S17.24", "S17.25", "S17.26"]
area: "17 Assistant-message components"
available_on: ["mobile"]
implementation: {web: "missing", desktop: "missing", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S17.23", "S17.24", "S17.25", "S17.26"]
depends_on: ["surface:mobile", "surface:web", "mode:local", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design", "file:apps/mobile/src/features/chat/components/SelectTextSheet.tsx", "file:packages/ui/unified-chat/src/lib/artifact-selection-request.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F017-07 Rewrite the answer (shorter, longer, tone) and revise a selected part

Lets a person reshape an answer in one step (shorter, longer, other tone) or pick one span of it to ask about. Today only the mobile app can pick a span, and it quotes the span into the next reply. No app has a one-step shorten, expand or tone action for chat answers.

Area: [17. Assistant-message components](README.md). Requirement items: [S17.23](../../10-requirements/capabilities/017-assistant-message-components.md#s1723), [S17.24](../../10-requirements/capabilities/017-assistant-message-components.md#s1724), [S17.25](../../10-requirements/capabilities/017-assistant-message-components.md#s1725), [S17.26](../../10-requirements/capabilities/017-assistant-message-components.md#s1726).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** The intended feature has two parts: three one-step rewrites of a whole answer (shorter, longer, different tone) and selecting part of an answer to revise it or ask about it. In the code, only a mobile 'Select Text' sheet exists. It lets the person highlight text in an answer and press 'Quote in reply', which puts the quote above the next message they send (apps/mobile/src/features/chat/components/SelectTextSheet.tsx:123; apps/mobile/app/(app)/chat/[id].tsx:1663-1671, 2638). The three one-step rewrite actions are not present for chat answers in any app I searched.

**Why it exists.** The brief lists these as expected answer actions so a person does not have to retype 'make this shorter' or 'sound friendlier' (doc: knowledge-base/data/area-briefs/017-assistant-message-components.md, S17.23 to S17.26). The reason beyond the brief is [inferred] from the leaders-parity policy in AGENTS.md section 10.

**Who uses it.** People reading an assistant answer who want a different length or tone, or want to question one sentence of a long answer. Today only mobile users reach the span-selection half.

**Problems it solves**

- Avoids retyping a long instruction to shorten, expand or restyle an answer (intended, not built for chat answers).
- Lets a person point at exactly which sentence they mean when replying (mobile only, as a quote).
- Avoids copying text out of the app to refer to one part of an answer.

**Use cases**

- On mobile, open an answer's action menu, choose Select Text, highlight one sentence, press Quote in reply, then type 'explain this' (apps/mobile/src/features/chat/components/MessageBubble.tsx:1688-1693).
- On mobile, quote a code line from an answer and ask for a fix (apps/mobile/__tests__/SelectTextQuote.test.tsx, code-line test).
- Intended on any app: press Shorten on a long answer and get a shorter version in one action (not built).

## 2. User experience

**Where to find it**

- Mobile: open the action menu on an assistant message and choose 'Select Text' (the accessibility action reads 'Select text') (apps/mobile/src/features/chat/components/MessageBubble.tsx:1688-1693, 1807). The sheet is titled 'Select Text' (SelectTextSheet.tsx).
- Web, Desktop (Electron shows the hosted web app), CLI, VS Code, Chrome: no shorten, expand, tone or selected-span action on chat answers found. Not available.
- Related but a different feature: the web artifact viewer has a selection toolbar with 'Improve', 'Edit with AI' and an action list including 'Make shorter', 'Make longer' and tone choices. It edits an artifact, not a chat answer (apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx:21-26; packages/ui/unified-chat/src/lib/artifact-selection-request.ts:44-70).

**Before you start**

- Mobile: an assistant message with visible text. The Select Text action is shown only when the message has text (MessageBubble.tsx:1688).
- Quote in reply is offered only when the host passes onQuoteSelection (MessageList.tsx:404); without it the sheet is a plain selectable read-only view (SelectTextSheet.tsx, ScrollView branch; test: apps/mobile/__tests__/SelectTextQuote.test.tsx 'keeps the plain selectable view').

**Screens and controls**

- Select Text sheet: header 'Select Text', a Close button, a multiline text box labelled 'Message text' holding the answer as plain text, a footer line showing the selection in quotes or 'Select part of the message to quote it in your reply.', and a 'Quote in reply' button that stays disabled until text is selected (SelectTextSheet.tsx).
- Quoted reply bar above the composer, with a dismiss control (apps/mobile/app/(app)/chat/[id].tsx:2638).

**Journey**

1. 1. Open the actions for an assistant message.
2. 2. Choose 'Select Text'. The sheet slides up with the answer as plain text.
3. 3. Drag the selection handles over the span. The footer shows the span in quotes.
4. 4. Press 'Quote in reply'. The sheet closes and a quote bar appears above the composer (SelectTextSheet.tsx quoteSelection; MessageList.tsx:349-352).
5. 5. Type a message and send. The sent text becomes '> <author>: <quote>' then a blank line then the typed text ((app)/chat/[id].tsx:631-646).
6. 6. The assistant answers the whole message, with the quote as context. It is not a targeted rewrite of the span [inferred from the send format].

**What the person sees and gets**

- Footer text echoes the chosen span.
- In the thread the sent message shows the quote as a chip (MessageBubble.tsx:532-538, 2290).
- No toast or rewrite result: the quote does not itself produce a new answer.

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mobile Select Text sheet lets the person select a span and quote it into the next reply (SelectTextSheet.tsx:123; test: apps/mobile/__tests__/SelectTextQuote.test.tsx).
- Mobile quote is attached to the outgoing message text as a '> ' prefix and cleared after send (apps/mobile/app/(app)/chat/[id].tsx:631-646).
- Web artifact viewer has Make shorter, Make longer, tone, audience and translate actions for a selected passage in an artifact (packages/ui/unified-chat/src/lib/artifact-selection-request.ts:44-70; apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx:21-26; test: apps/web/features/chat/components/artifacts/ArtifactPreview.selectionEdit.test.tsx). This is related, not this feature.

**Incomplete**

- Mobile selection only quotes. It does not revise the span; the brief says 'revised or asked about' (S17.26). The 'ask about' half is reached by typing a follow-up; the 'revise' half is not offered (SelectTextSheet.tsx has one action).

**Present but disconnected or switched off**

- The artifact selection actions are wired only inside the artifact viewer (ArtifactPreview.tsx imports artifact-selection-request); no import from chat message components found.

**Not available**

- Shorten, expand and change tone on a chat answer: not available on Web, Desktop, Mobile, CLI, VS Code or Chrome (brief S17.23-25; my search of apps/web/features, apps/mobile/src, apps/extension/src, apps/extension-vscode/src, packages/ui found these labels only in artifact-selection-request.ts).
- Selected-span revise/ask on Web, Desktop, CLI, VS Code, Chrome: not available (brief S17.26).

## 4. Required behaviour

**Established requirements**

- One action rewrites an answer shorter. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S17.23)
- One action rewrites an answer longer or more detailed. (source: S17.24 (same brief))
- One action rewrites an answer in a different tone. (source: S17.25 (same brief))
- The user can select part of an answer and ask for that span to be revised or asked about. (source: S17.26 (same brief))
- Every async flow has complete states including loading, error, retry and cancellation. (source: doc: docs/product/experience-contract.md:82)

**Acceptance criteria**

1. On each app that offers it, the answer actions include Shorten, Expand and a tone choice, each starting one rewrite with one press.
2. The rewrite result is a new version of the answer linked to the original, and the original stays reachable (same expectation as regenerate variants, S17.28) [inferred].
3. Selecting a span and choosing the revise action sends a request that names the selected span and leaves the rest of the answer unchanged.
4. On mobile, Select Text shows the selected span and disables 'Quote in reply' until a span exists (works today; test: SelectTextQuote.test.tsx).
5. A failed rewrite shows an error with retry.
6. A rewrite in Local mode on mobile or desktop stays on the device and needs no paid plan (product rule).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A rewrite is just another chat turn, so it should follow the same account, quota and routing rules as a new message [inferred from the shared chat pipeline].
- Rewrite actions should be hidden or disabled while the answer is still streaming, as Regenerate and Export already are (MessageBubble.tsx:1692-1700 shows the pattern).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build one shared rewrite-request builder in packages/ui/unified-chat, reusing selectionActionsFor, so web, mobile and extensions send the same instruction wording.
- [proposed] Add a 'Revise this' action next to 'Quote in reply' on the mobile Select Text sheet.
- [proposed] Offer the web artifact toolbar pattern on chat answers.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SelectTextSheet | `apps/mobile/src/features/chat/components/SelectTextSheet.tsx` | Mobile sheet to select a span of an answer and quote it. |
| component | MessageBubble (mobile) | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Adds the 'Select Text' menu action and mounts the sheet (lines 1688-1693, 3302-3308). |
| component | MessageList (mobile) | `apps/mobile/src/features/chat/components/MessageList.tsx` | Turns a quoted span into a reply request (handleQuoteSelection, line 349). |
| screen | Chat screen (mobile) | `apps/mobile/app/(app)/chat/[id].tsx` | Holds quotedMessage state, shows the quote bar and prefixes the sent text (lines 335, 631-646, 1663-1676, 2638). |
| service | answerPlainText | `apps/mobile/src/features/chat/utils/markdownPlainText.ts` | Converts answer markdown to the plain text shown in the sheet (imported by SelectTextSheet). |
| test | SelectTextQuote test | `apps/mobile/__tests__/SelectTextQuote.test.tsx` | Covers quoting a span, no quote without a selection, read-only fallback and code lines. |
| test | MessageBubbleAnswerControls test | `apps/mobile/__tests__/MessageBubbleAnswerControls.test.tsx` | References SelectTextSheet in the answer controls (file lists the sheet; coverage detail not read). |
| component | ArtifactSelectionToolbar (related) | `apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx` | Web selection toolbar for artifacts: Improve, Edit with AI, Comment. |
| service | selectionActionsFor (related) | `packages/ui/unified-chat/src/lib/artifact-selection-request.ts` | Defines Rewrite, Make shorter, Make longer, tone, audience and translate instructions for artifact passages. |
| config | SELECTION_ACTIONS (related) | `apps/web/features/chat/components/artifacts/artifact-selection-request.ts` | Binds the shared action list to the web's supported languages. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens Select Text on an answer; the sheet converts the answer to plain text and shows it. | device | SelectTextSheet.tsx useMemo with answerPlainText |
| Person selects a span; the sheet records start and end positions and shows the trimmed span. | device | SelectTextSheet.tsx onSelectionChange and selectedText |
| 'Quote in reply' passes the span up; the chat screen stores it as quotedMessage tagged to the current conversation scope. | device | apps/mobile/app/(app)/chat/[id].tsx:1663-1671 |
| On send, the screen prepends '> <author>: <quote>' and a blank line to the typed text, then sends it as an ordinary message through the normal chat path for the conversation's mode. | device and our servers | apps/mobile/app/(app)/chat/[id].tsx:631-646; server step applies only to Cloud conversations [inferred from the mode split in apps/mobile/stores/chat/chatMessageStore.ts:133-140] |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Selected span text, as a quote attached to the next message | React state in the chat screen until sent; then inside the sent message text in the conversation store | Syncs with the message when the conversation is a Cloud conversation [inferred]; stays on the device for Local conversations | Quote state is cleared on send or dismiss, or when the conversation scope changes ((app)/chat/[id].tsx:551-555, 1673-1676) |

**Models and providers.** The quote step calls no model. The follow-up message is routed like any message, so the model is whichever the conversation uses. No rewrite-specific model rule found.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Selecting and quoting needs no account (device UI). Sending the follow-up follows the chat rules of the conversation's mode. |
| Permissions | none found in the code |
| Subscription | No entitlement check on Select Text or quoting found in the code. The follow-up message is a normal chat turn [inferred]. |
| Limits and metering | none found for the quote itself. The follow-up turn is metered like any turn; details are in SYS-subscriptions-entitlements-and-usage and not traced here. |
| Feature flags | none found in the code |
| Model compatibility | Not model-specific; the quote is plain text. |
| Provider restrictions | none found in the code |
| Local mode | Select Text and Quote in reply work with no network, because they only handle on-device text. The follow-up message runs on-device when the conversation is Local [inferred]. Sign-in rules for Local are not established here. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No text selected | Quote in reply is disabled and the footer shows the hint text. | SelectTextSheet.tsx; test SelectTextQuote.test.tsx 'does not quote without a selection' |
| Quoting not offered by the host | Sheet shows a plain read-only selectable text view. | SelectTextSheet.tsx ScrollView branch; test SelectTextQuote.test.tsx |
| Answer still streaming | Menu offers 'Copy Partial Response'; Select Text appears when there is text. Whether quoting a partial answer is blocked: not handled in the code I read. | MessageBubble.tsx:1683-1693 |
| User switches conversation before sending | Stale quote is dropped. | apps/mobile/app/(app)/chat/[id].tsx:551-555, 631-637 |
| Android versus iOS | The text box is editable on Android only (so selection handles work); on iOS it is non-editable. | SelectTextSheet.tsx editable={Platform.OS === 'android'} |
| Accessibility | Modal marks accessibilityViewIsModal; the text box has a label and hint; Close has a label. | SelectTextSheet.tsx |
| Offline, timeout, reconnect | not handled in the code for the quote itself (the send follows normal chat offline handling). | none in SelectTextSheet.tsx |
| Shorten, expand, tone | No control exists, so no states exist. | search of apps for these labels returned only artifact-selection-request.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/SelectTextQuote.test.tsx`: Quotes only the selected span, no quote without selection, plain view when quoting is not offered, code-fence lines quoted exactly.
- `apps/mobile/__tests__/MessageBubbleAnswerControls.test.tsx`: Mentions SelectTextSheet in answer controls; exact assertions not read.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.selectionEdit.test.tsx`: Artifact selection edit (related feature, not chat answers).
- `packages/ui/unified-chat/src/lib/artifact-selection-request.test.ts`: Shared artifact selection request builder (related).

**Test scenarios**

- **Quote a span (mobile)**
  1. Open a chat with a multi-sentence answer.
  2. Open the message menu, choose Select Text.
  3. Select the second sentence.
  4. Press Quote in reply and send 'explain this'.
  - Expected: A quote bar appears, the sent message shows the quote chip, the assistant answers with the quote as context.
- **Empty selection**
  1. Open Select Text.
  2. Do not select anything.
  - Expected: Quote in reply is disabled and the hint text shows.
- **Switch chat with a quote pending**
  1. Quote a span.
  2. Switch to another conversation and back, or start a new chat.
  - Expected: The old quote is gone and is not sent.
- **No rewrite actions on web**
  1. Open web chat and open the more-actions menu on an answer.
  - Expected: No Shorten, Expand or Tone item exists (confirms the gap).
- **Artifact selection actions (related)**
  1. Open an artifact on web, select a passage.
  2. Choose Make shorter.
  - Expected: A change request for the passage is sent; chat answers are unaffected.

**Where to look when it fails**

- No log lines found for this feature.
- If Quote in reply does nothing, check that onQuoteReply is passed to MessageList ((app)/chat/[id].tsx:2631).

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/017-assistant-message-components.md](../../70-qa/test-plans/mobile/017-assistant-message-components.md)

## 10. Gaps and dependencies

- **No one-step Shorten, Expand or Change tone on any app** Affects: All six apps; all users. Evidence: Brief S17.23-S17.25 status missing; labels found only in artifact-selection-request.ts. Work needed: Design the action row entry, build a shared rewrite instruction builder, send it as a turn that creates a linked answer version, add tests per app.
- **Selected-span support is quote-only on mobile and absent elsewhere** Affects: Web, Desktop, CLI, VS Code, Chrome users; mobile users wanting a real revise. Evidence: SelectTextSheet.tsx has one action; brief S17.26. Work needed: Add a revise action on mobile; add span selection on web answers; decide what CLI, VS Code and Chrome offer.
- **Artifact rewrite actions are not reused for chat answers** Affects: Web users. Evidence: ArtifactPreview.tsx only importer of the toolbar. Work needed: Extract the toolbar so a chat answer can host it.
- **The draft's claim that mobile 'revises' a selection is wrong** Affects: Anyone reading earlier docs. Evidence: SelectTextSheet.tsx only offers 'Quote in reply'. Work needed: Correct the brief wording for S17.26 mobile status (partial, not done).
- Not built on: Web, Desktop, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:mobile
- surface:web
- mode:local
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design
- file:apps/mobile/src/features/chat/components/SelectTextSheet.tsx
- file:packages/ui/unified-chat/src/lib/artifact-selection-request.ts

## Unknown

- Whether the desktop Tauri build (apps/desktop/src) has any selection action: the brief says missing, not searched in depth.
- Whether the Chrome in-page panel offers selection rewriting: not found, not exhaustively searched.
- How the assistant uses the '> ' quote: only the send format was read, not the server prompt.
- Whether quoting a partial streaming answer is blocked on mobile.
- Contents of MessageBubbleAnswerControls.test.tsx assertions.
