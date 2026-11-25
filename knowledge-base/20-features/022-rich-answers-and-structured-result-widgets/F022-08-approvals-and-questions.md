---
id: "F022-08"
type: "feature"
title: "Approvals and questions"
aliases: ["Approval card", "Tool approval", "Approval form", "Clarify card", "Clarifying questions", "Questionnaire", "ask_clarifying_questions", "Elicitation overlay", "Interactive card", "AGI asks", "S22.28", "S22.29"]
area: "22 Rich answers and structured result widgets"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S22.28", "S22.29"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "api:POST /api/interactive-cards/respond", "table:web_messages", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "SYS-api-and-contracts", "file:packages/contracts/cloud-contracts/src/interactive-cards.ts"]
basis: "code inspection"
second_reader: "4 of 10 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F022-08 Approvals and questions

When the assistant needs permission for an action, an approval card shows what it will do, a risk label and the parameters, with Allow and Deny choices. When it needs facts from you, a question card lets you pick options or type an answer and send. Each app has its own version.

Area: [22. Rich answers and structured result widgets](README.md). Requirement items: [S22.28](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2228), [S22.29](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2229).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | built (this page lists unfinished parts) | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Approval cards stop a tool call until the person allows or denies it (once, for this chat, or always where the scope is offered). Question cards (clarify.v1) show up to four questions with up to four options each and an optional 'something else' box; the answers go back to the assistant as the next turn input. (apps/web/features/chat/components/approvals/ToolApprovalCard.tsx:57-140; apps/web/lib/services/clarify-tool-service.ts:12-16; apps/web/features/chat/components/messages/cards/ClarifyCard.tsx:86-229)

**Why it exists.** Consent must be explicit before an action that changes things, and a vague request is better answered with a few structured questions than with a guess. (doc: AGENTS.md section 9; area brief S22.28, S22.29)

**Who uses it.** Anyone using an agent that calls tools (all six apps) and anyone whose request is vague (the model-driven clarify tool is offered on web, desktop via hosted web, mobile and Chrome; VS Code has its own separate 'AGI asks' question card that does not come from clarify.v1; CLI shows tool-server questions). [apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1278-1291; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7262-7300]

**Problems it solves**

- The person sees the tool name, risk tier, destructive notice and parameters before saying yes.
- The assistant does not guess missing details; it asks.
- A tool server can ask for typed input (CLI elicitation) without leaving the terminal.

**Use cases**

- A cloud tool wants to send data to a connector; the card shows the parameters and the person presses Allow once.
- A vague request 'plan my trip' triggers a card with questions about dates and budget; the person picks options and presses Send answers.
- In the CLI, a command run asks 'Apply this patch?' with y/n keys.
- An MCP server asks for a token; the CLI overlay shows a masked field with Accept, Decline, Cancel.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): approval card is a section labelled 'Approve <tool>' with buttons from the scope labels (Allow once, Allow for this chat, Always allow) and 'Deny' (apps/web/features/chat/components/approvals/ToolApprovalCard.tsx:79-140; packages/contracts/types/src/tool-approval-policy.ts:23-36). Question card is a card in the reply with buttons 'Send answers' and 'I'll just type it' (ClarifyCard.tsx:195-216).
- Mobile: approval controls with 'Raw JSON' toggle, guidance field and decision buttons (apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:260-410). Question card with 'Send answers' and 'I'll just type it' (apps/mobile/src/features/chat/components/ClarifyCard.tsx).
- CLI: full-screen approval overlay titled 'Tool Approval' with keys y, n, s, a, d, t and Tab to add a note; MCP request overlay with Accept, Decline, Cancel (apps/cli/src/tui/widgets/approval_overlay.rs:1-30; elicitation_overlay.rs:1-25,375).
- VS Code: approval card with approve/deny style buttons and a guidance field; question card titled 'AGI asks' with option buttons, 'Skip' and a typed-answer box; this card is a separate request/response path (respondToApproval), not clarify.v1 (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7262-7360).
- Chrome side panel: approval with 'Approve', 'Decline', 'Allow for this chat' and a guidance field (apps/extension/_locales/en/messages.json:1154-1170,1942; apps/extension/src/features/side-panel/bubbles.ts:946-1042); question card built by buildClarifyCard (apps/extension/src/features/side-panel/interactiveCards.ts; bubbles.ts:245).

**Before you start**

- Question cards need a saved chat (not temporary) and a finished reply; otherwise the controls are disabled (InteractiveCardBlock.tsx:60-86).
- An approval card is live only while its turn is live; an expired turn shows no buttons (MessageBubble.tsx:1010-1019).

**Screens and controls**

- Web approval: label, risk badge (Low/Medium/High/Critical risk), destructive notice, parameter list, 'Raw JSON' details, decision group (ToolApprovalCard.tsx:79-140; packages/contracts/cloud-contracts/src/tool-approval-presentation.ts:16-23).
- Web question card: question text with header chip, option chips (toggle, multi-select where allowed), 'Something else…' box, Send answers, I'll just type it (ClarifyCard.tsx:129-216).
- CLI approval: buttons Yes, No, Allow Session, Always allow, Deny All, Allow All; Enter confirms; Esc means No; scroll keys; allow answers are accepted only after the whole detail has been scrolled into view (approval_overlay.rs:1-30,754-822).

**Journey**

1. The assistant requests a tool call or asks questions.
2. The card or overlay appears with the details.
3. The person reads, then chooses an option (or types an answer).
4. The app sends the decision; the card shows the outcome (for example 'Answered: ...', 'Skipped', or the saved decision) and the assistant continues.

**What the person sees and gets**

- While streaming the card says 'Available when the reply finishes.'; in a temporary chat it says 'Buttons that send a message work in saved chats.' (InteractiveCardBlock.tsx:60-61).
- A failed submit is stored on the message and shown as a red alert on the card (InteractiveCardBlock.tsx:95-102; ClarifyCard.tsx:219-224).
- Expired question card: 'These questions are no longer answerable: ...' with a reason (ClarifyCard.tsx:100-112).
- Mobile failure text: 'Couldn't send that answer, the questions are still waiting for you.' (apps/mobile ClarifyCard.tsx:28-29).

**Settings**

- Tool allowances per chat and always-allow lists (useChatToolAllowanceStore, MessageBubble.tsx:2331-2340).
- CLI approval scopes depend on whether session or always-allow is available (approval_overlay.rs:811-816).
- Settings, Connectors reset of tool approvals is mentioned in the scope note (tool-approval-presentation.ts:31-32).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/desktop approval card with risk tier, parameters, scopes, destructive confirm (ToolApprovalCard.tsx:57-140).
- Web/desktop question card with single and multi-select, other text, send, dismiss, expired/answered/dismissed states (ClarifyCard.tsx:86-229).
- Server route that records a card response on the message: it authenticates the user, requires a CSRF token, applies the 'chat-message' rate limit, then either returns composed message text (payload.kind 'message' on an answer-ui card, nothing stored) or settles the clarify card with a compare-and-set update (apps/web/app/api/interactive-cards/respond/route.ts:93-103,196-217).
- Server tool ask_clarifying_questions with limits of 4 questions and 4 options and a gate that skips explicit commands (apps/web/lib/services/clarify-tool-service.ts:12-60). It is offered only on web, mobile and chrome surfaces, to tool-capable models, on streamed requests, when the client declares clarify.v1 in x_interactive_cards (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1278-1291).
- Mobile ClarifyCard registered in InteractiveCardBlock (apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:1077-1088). The brief marks S22.29 mobile as missing; code contradicts it.
- Mobile cloud approval controls (CloudToolApprovalControls.tsx).
- CLI approval overlay and MCP elicitation overlay with unit tests inside the Rust files.
- VS Code approval card and 'AGI asks' question card (webviewContent.ts:7262-7360). The brief marks vscode questionnaires missing; code contradicts it.
- Chrome approval buttons and clarify card (bubbles.ts:946-1042; interactiveCards.ts:245).

**Incomplete**

- VS Code asks one question at a time with options and a typed answer, not a multi-question form; it is a separate respondToApproval path, not clarify.v1 (webviewContent.ts:7262-7360).
- CLI elicitation overlay answers MCP server requests, not the model's clarify tool; the brief maps S22.29 to it (elicitation_overlay.rs:1-25). Whether the CLI has a model-driven question card is unknown. The server never offers the clarify tool to the CLI surface (request-processor.ts:1278-1291).
- The surface feature matrix lists CLI approvals as 'unverified' for reachability (doc: docs/product/surface-feature-matrix.md:397), though tui_app.rs maps overlay choices to decisions (apps/cli/src/tui/tui_app.rs:1595-1625).

**Present but disconnected or switched off**

- Card answering is off when no runtime provider is mounted or the chat is temporary or streaming (InteractiveCardBlock.tsx:150-160).

**Not available**

- Mobile: nothing found showing a Local-mode question card; the clarify tool is a server tool (clarify-tool-service.ts imports server-only).
- The model-driven clarify tool is never offered to VS Code or the CLI (request-processor.ts:1278-1291).

## 4. Required behaviour

**Established requirements**

- Actions needing consent render an approval form (what will happen, approve/deny). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.28)
- The assistant can ask structured questions (options/fields) the user answers in an inline form. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.29)
- A card cannot be sent while the reply is still streaming; the text says 'Available when the reply finishes.' (source: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:60)
- A card cannot be sent in a temporary chat; the text says 'Buttons that send a message work in saved chats.' (source: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:61)
- A failed submission is stored on the message and shown on the card. (source: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:95-102)
- The CLI approval overlay is keyboard-driven. (source: apps/cli/src/tui/widgets/approval_overlay.rs:1-30)
- An action a user cannot undo asks first and the question names the consequence. (source: doc: AGENTS.md section 9)
- Security behaviour fails closed. (source: doc: AGENTS.md section 6)
- Interactive cards are capped at 4 per message and 12,000 serialized characters. (source: packages/contracts/types/src/interactive-cards.ts:13-14)
- The respond route's payload.kind 'message' on an answer-ui card composes follow-up text and stores nothing; the clarify update uses optimistic concurrency. (source: apps/web/app/api/interactive-cards/respond/route.ts:152-160,196-217)

**Acceptance criteria**

1. A tool call that needs approval shows its name, risk label and parameters and cannot run until Allow or Deny is chosen.
2. Choosing a wider scope on a destructive tool asks for confirmation first on web.
3. A question card with one selected option and Send answers produces an answered state showing the chosen labels.
4. 'I'll just type it' dismisses the card with the dismissed note.
5. The card is not answerable while streaming or in a temporary chat and shows the stated message.
6. A failed submit leaves the card answerable and shows an alert.
7. In the CLI, y and n answer; Esc answers No; Allow keys are ignored until the detail is fully shown.
8. An expired card shows the reason text and has no buttons.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every app should show the same approval facts (tool, risk, parameters) because the shared labels live in contracts. [inferred from packages/contracts/types/src/tool-approval-policy.ts]
- Questions in Local mode would need a local tool; none found. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give Chrome the same multi-question form as web; for VS Code, decide whether to offer clarify.v1 at all, since its question card is a separate path.
- [proposed] Show clarify questions in the CLI from the model, not only from MCP servers.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | InteractiveCardBlock (web) | `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx` | Renders cards from a registry, computes send-blocked reasons, submission error, deadline, resume. |
| component | ClarifyCard (web) | `apps/web/features/chat/components/messages/cards/ClarifyCard.tsx` | Question card with options, other text, send, dismiss. |
| component | ToolApprovalCard | `apps/web/features/chat/components/approvals/ToolApprovalCard.tsx` | Approval card with risk, parameters, scopes, Deny. |
| component | ApprovalInbox | `apps/web/features/chat/components/approvals/ApprovalInbox.tsx` | Lists pending approvals for the web chat. |
| endpoint | POST /api/interactive-cards/respond | `apps/web/app/api/interactive-cards/respond/route.ts` | Validates a card answer and updates the message metadata in web_messages. |
| service | clarify-tool-service | `apps/web/lib/services/clarify-tool-service.ts` | Defines ask_clarifying_questions, its limits and when it is offered. |
| schema | interactive card contracts | `packages/contracts/cloud-contracts/src/interactive-cards.ts` | Zod schemas for card bodies including clarify and mcp-app. |
| schema | card response rules | `packages/contracts/cloud-contracts/src/interactive-card-response.ts` | Deadline, accepts-response and needs-resume rules. |
| schema | interactive card types | `packages/contracts/types/src/interactive-cards.ts` | Card kinds, renderer registry resolver, clarify limits (4 questions, 4 options, header 32, other-answer 500; 4 cards and 12,000 serialized characters per message). |
| config | tool approval labels | `packages/contracts/types/src/tool-approval-policy.ts` | Allow, Deny, Approve labels shared by apps. |
| hook | useChatStream (card response and resume) | `apps/web/lib/hooks/useChatStream.ts` | respondToInteractiveCard and resume of the paused turn. |
| component | ClarifyCard (mobile) | `apps/mobile/src/features/chat/components/ClarifyCard.tsx` | Mobile question card. |
| component | CloudToolApprovalControls | `apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx` | Mobile approval controls with raw JSON and guidance. |
| component | approval overlay (CLI) | `apps/cli/src/tui/widgets/approval_overlay.rs` | Keyboard approval overlay. |
| component | elicitation overlay (CLI) | `apps/cli/src/tui/widgets/elicitation_overlay.rs` | Form for MCP server input requests. |
| service | tui_app approval mapping | `apps/cli/src/tui/tui_app.rs` | Maps overlay choices to approval decisions (line 1595). |
| component | VS Code webview approval and question cards | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | renderQuestionCard (line 7262) and approval cards; the question card uses a separate respondToApproval path, not clarify.v1. |
| component | Chrome side-panel bubbles and interactive cards | `apps/extension/src/features/side-panel/bubbles.ts` | Approval buttons and card registry (lines 245, 946-1042). |
| other | clarify tool surface gate | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Offers the clarify tool only for web, mobile and chrome surfaces, tool-capable models, streamed requests and clients declaring clarify.v1 in x_interactive_cards (lines 1278-1291). |
| table | web_messages | `apps/web/app/api/interactive-cards/respond/route.ts` | Stores the card state in message metadata. |
| test | InteractiveCardBlock.respond.test.tsx | `apps/web/features/chat/components/messages/InteractiveCardBlock.respond.test.tsx` | Card response behaviour on web. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model calls the clarify tool or a tool needing approval; the server builds a card and streams it with the reply. The clarify tool is offered only on web, mobile and chrome surfaces, to tool-capable models, on streamed requests whose client declares clarify.v1. | our servers | apps/web/lib/services/clarify-tool-service.ts; apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1278-1291 |
| The app validates the card, shows it, and blocks sending while streaming or in a temporary chat. | device | InteractiveCardBlock.tsx:60-86,150-160 |
| The person's answer is posted to the respond route, which authenticates the user, requires a CSRF token, applies the chat-message rate limit, then either returns composed message text (answer-ui card with payload.kind 'message', nothing stored) or settles the clarify card with a compare-and-set update of the stored message (matches the old metadata with 'is not distinct from'; 409 if no row changed). | our servers | apps/web/app/api/interactive-cards/respond/route.ts:93-103,152-160,196-217 |
| The paused turn resumes with the answer. | our servers | useCardTurnResume in InteractiveCardBlock.tsx:105-117 |
| CLI approval and elicitation are answered on the device and returned to the local agent loop or MCP server. | device | approval_overlay.rs; tui_app.rs:1595-1625 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Card state and answers | Message metadata in table web_messages (interactiveCards key) | Part of the conversation | Removed with the message; soft-delete (deleted_at) is checked on both web_conversations and web_messages in the lookups (route.ts:117-135) |
| Tool allowances (once/chat/always) | Chat allowance store on web; permission store in CLI | unknown | Chat allowances last until the chat is deleted or the tool is reset (tool-approval-presentation.ts:31-32) |

**Models and providers.** The question card needs the model to call the clarify tool; this is a server tool. The cards themselves do not depend on a provider. Which providers support the tool in the server loop was not traced: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and mobile cards need a signed-in saved chat. CLI approval needs no account (local overlay). |
| Permissions | Approvals gate tool execution; risk tier and destructive flag come from a review object (tool-approval-presentation.ts:8-14). Unreviewed tools default to high risk, destructive, once-only. |
| Subscription | none found in the code for the cards; the turn is governed by SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | Max 4 questions, 4 options, option label 60, question text 200 characters (clarify-tool-service.ts:15-20); header chip max 32; other-answer text capped at 500 characters (CLARIFY_OTHER_MAX_LENGTH, packages/contracts/types/src/interactive-cards.ts:84; imported at ClarifyCard.tsx:14). Interactive cards are capped at 4 per message and 12,000 serialized characters (interactive-cards.ts:13-14). The clarify tool is offered only for non-research messages of 1 to 400 characters with no attachment, no URL and no code fence, and (outside AGI Work mode) not starting with an explicit-command verb such as search, write, explain, fix, list (clarify-tool-service.ts:17,20,22-40,53-63). The respond route uses getUserScopedDb auth, requireCsrfToken and withRateLimit with the 'chat-message' bucket (route.ts:93-103). |
| Feature flags | The server offers the clarify tool only when the client declares clarify.v1 in x_interactive_cards (request-processor.ts:1278-1291); no other flags found in the code. |
| Model compatibility | Any tool-capable model that can call the clarify tool [inferred]. Not tied to a model. |
| Provider restrictions | none found in the code |
| Local mode | CLI approval overlay works on the device. Question cards come from a server tool, so a fully Local chat would not show them [inferred]; not verified. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming | Card controls disabled; text 'Available when the reply finishes.' | InteractiveCardBlock.tsx:60,70 |
| Temporary chat | Controls disabled with 'Buttons that send a message work in saved chats.' | InteractiveCardBlock.tsx:61,71 |
| Submitting | Button shows 'Sending' with spinner; others disabled. | ClarifyCard.tsx:197-205 |
| Error on submit | Error stored on message and shown with role alert; card stays answerable. | InteractiveCardBlock.tsx:95-102; ClarifyCard.tsx:219 |
| Deadline elapsed | A timer re-renders the card so it stops accepting answers. | InteractiveCardBlock.tsx:119-129 |
| Expired / dismissed / answered | Read-only text per state. | ClarifyCard.tsx:100-125,141 |
| Unknown card kind | Fallback section with headline and text. | InteractiveCardBlock.tsx:213-228 |
| Approval turn expired | Approval buttons are withheld. | MessageBubble.tsx:1010-1019 |
| Message response for a card that is not answer-ui | The respond route rejects it with 'This card does not send messages' when payload.kind is message. | apps/web/app/api/interactive-cards/respond/route.ts |
| CLI terminal too small | Draws a too-small notice; Esc cancels. | approval_overlay.rs imports draw_too_small; elicitation_overlay.rs:632 |
| Offline | not handled in the code for the web card beyond the submit error. | searched ClarifyCard.tsx and InteractiveCardBlock.tsx for offline handling; none found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/InteractiveCardBlock.test.tsx`: Card rendering and fallback
- `apps/web/features/chat/components/messages/InteractiveCardBlock.respond.test.tsx`: Responding to cards
- `apps/web/app/api/interactive-cards/respond/route.test.ts`: Respond endpoint
- `apps/web/lib/services/clarify-tool-service.test.ts`: Clarify tool rules
- `apps/web/lib/hooks/useChatStream.card-answers.test.tsx`: Card answers in the stream hook
- `packages/contracts/cloud-contracts/src/__tests__/interactive-card-response.test.ts`: Response deadline and acceptance
- `apps/web/features/chat/components/approvals/ToolApprovalCard.test.tsx`: Approval card
- `apps/mobile/__tests__/CloudToolApprovalReview.test.tsx`: Mobile approval review
- `apps/extension-vscode/src/__tests__/approvalCard.webview.test.ts`: VS Code approval card
- `apps/cli/src/tui/widgets/approval_overlay.rs`: Inline unit tests for the CLI approval overlay
- `apps/cli/src/tui/widgets/elicitation_overlay.rs`: Inline unit tests for the elicitation overlay

**Test scenarios**

- **Answer a question card**
  1. In a saved web chat send a vague request such as 'Plan a trip'.
  2. When a question card appears and the reply is finished, pick options and press Send answers.
  - Expected: The card shows the chosen labels as answered and the assistant continues.
- **Blocked while streaming**
  1. Send a request that yields a card.
  2. Try to press a card button while text is still streaming.
  - Expected: Controls disabled with 'Available when the reply finishes.'
- **Temporary chat**
  1. Open a temporary chat and trigger a card.
  - Expected: 'Buttons that send a message work in saved chats.' is shown.
- **Deny a tool**
  1. Trigger a cloud tool that needs approval.
  2. Press Deny.
  - Expected: Tool does not run; the card shows the denial.
- **CLI approval keys**
  1. Run an agent task that writes a file.
  2. Scroll the detail to the end, press y; repeat pressing n and Esc.
  - Expected: y allows once, n and Esc deny; allow is ignored before the end of the detail.
- **Respond failure**
  1. Block the network and press Send answers.
  - Expected: Alert text on the card; card still answerable.

**Where to look when it fails**

- Respond route errors: 'Interactive card not found', 'This card is no longer accepting a response', 'This card changed while the response was in flight' (route.ts:146,165,212). The route also rejects a card that is not an answer-ui card when payload.kind is message, with 'This card does not send messages'.
- Table web_messages metadata keys interactiveCards and interactiveCardSubmissionErrors.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md)
- Desktop: [70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md)
- Mobile: [70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md)
- CLI: [70-qa/test-plans/cli/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/cli/022-rich-answers-and-structured-result-widgets.md)
- VS Code: [70-qa/test-plans/vscode/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/vscode/022-rich-answers-and-structured-result-widgets.md)
- Chrome: [70-qa/test-plans/chrome/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/chrome/022-rich-answers-and-structured-result-widgets.md)

## 10. Gaps and dependencies

- **VS Code question card handles one question at a time, not the multi-question form; it is a separate respondToApproval path and does not come from clarify.v1, which the server never offers to VS Code.** Affects: VS Code. Evidence: webviewContent.ts:7262-7360; request-processor.ts:1278-1291. Work needed: Decide whether VS Code should get the clarify.v1 tool and form, or keep its own question path.
- **CLI has no model-driven question form; the overlay serves MCP elicitation only.** Affects: CLI. Evidence: elicitation_overlay.rs:1-25. Work needed: Decide whether the clarify tool is offered in the CLI and render it.
- **Brief is out of date on mobile, VS Code and Chrome questionnaires.** Affects: Brief accuracy. Evidence: mobile InteractiveCardBlock.tsx:1077; webviewContent.ts:7262; bubbles.ts:245. Work needed: Update brief; live-check each app.
- **Surface matrix marks CLI approvals 'unverified'.** Affects: CLI. Evidence: doc: docs/product/surface-feature-matrix.md:397. Work needed: Run a CLI session and record the result.
- **No Local-mode path for question cards.** Affects: Mobile and desktop Local mode. Evidence: clarify-tool-service.ts is server-only. Work needed: Decide if local models should offer a clarify tool.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- api:POST /api/interactive-cards/respond
- table:web_messages
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- SYS-api-and-contracts
- file:packages/contracts/cloud-contracts/src/interactive-cards.ts

## Unknown

- Whether the CLI shows model-driven questions.
- How approval allowances sync between devices.
- Which providers' models reliably call the clarify tool.
- Live behaviour on Chrome and VS Code (only unit tests exist).
- Whether the Tauri desktop code has its own approval UI that is still used (public desktop shows the hosted web app, doc: AGENTS.md section 5).

## Second reader's check

A second reader checked 10 statements of this page against the code: 4 correct, 6 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3 / 7):** "The clarify tool is 'offered only for short messages without URL, code fence or attachment (clarify-tool-service.ts:49-60)'" The code shows: turnWarrantsClarifyTool also returns false for research turns, empty messages, messages over 400 characters, and (unless work_mode is agiwork) messages that open with an explicit verb such as search, write, explain, fix, list. The 4/4/200/60 limits are right. (apps/web/lib/services/clarify-tool-service.ts:17,20,22-40,53-63). **Corrected:** The clarify tool is offered only for non-research messages of 1 to 400 characters with no attachment, no URL and no code fence, and (outside AGI Work mode) not starting with an explicit-command verb.
- **Partly wrong (section 3 / 7 / 1):** "Questions are a feature for 'web, desktop, mobile, Chrome, VS Code'; the clarify tool is a server tool that gates only on the message" The code shows: The server offers the tool only when the surface is web, mobile or chrome, the model can use tools, the request streams, and the client declares x_interactive_cards support for clarify.v1. VS Code and CLI never get it. The VS Code 'AGI asks' card is a separate request/response path (respondToApproval), not clarify.v1. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1278-1291; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7262-7300). **Corrected:** The model-driven clarify tool is offered only on web (and desktop via hosted web), mobile and Chrome, and only for streamed, tool-capable turns whose client advertises clarify.v1. The VS Code question card does not come from clarify.v1, so the section 10 gap 'render clarify.v1 fully in VS Code' is misframed.
- **Wrong (section 6 / 7):** "Respond route 'soft-delete column used in the lookup (route.ts:31)'" The code shows: Line 31 is inside findQuestion. The deleted_at checks are in the SQL on the conversation lookup (about line 117-123) and the message lookup (about line 133). (apps/web/app/api/interactive-cards/respond/route.ts:27-33,117-135). **Corrected:** Soft-delete is checked on both web_conversations and web_messages in the lookups at route.ts:117-135.
- **Wrong (section 9):** "Respond route errors at route.ts:43,58,93 ('Interactive card not found', 'no longer accepting a response', 'changed while in flight')" The code shows: Lines 43, 58 and 93 are inside toClarifyAnswer and settleClarifyBody. The three messages are at about lines 146, 165 and 212. (apps/web/app/api/interactive-cards/respond/route.ts:146,165,212). **Corrected:** Cite route.ts:146, 165 and 212. The route also rejects a card that is not an answer-ui card when payload.kind is message, with 'This card does not send messages'.
- **Partly wrong (section 6):** "Respond route 'checks the card and updates the stored message' (server step; also 'rate limit and CSRF helpers imported')" The code shows: The helpers are used, not only imported: getUserScopedDb auth, requireCsrfToken, and withRateLimit with the 'chat-message' bucket. Update is optimistic: it matches the old metadata with 'is not distinct from' and returns 409 if no row changed. A payload.kind 'message' response does not write anything; it only returns composed text from an answer-ui card. (route.ts:93-103,196-217). **Corrected:** The route authenticates the user, requires a CSRF token, applies the chat-message rate limit, then either returns composed message text (answer-ui, nothing stored) or settles the clarify card with a compare-and-set update.
- **Partly wrong (section 7):** "Limit 'other-answer cap CLARIFY_OTHER_MAX_LENGTH (ClarifyCard.tsx:17)'" The code shows: It is imported at ClarifyCard.tsx:14, not 17. The value (500) is defined in packages/contracts/types/src/interactive-cards.ts:84, which also sets header max 32 and 4 questions/4 options. The page never gives the number. (apps/web/features/chat/components/messages/cards/ClarifyCard.tsx:14; packages/contracts/types/src/interactive-cards.ts:80-84). **Corrected:** Other-answer text is capped at 500 characters (CLARIFY_OTHER_MAX_LENGTH, interactive-cards.ts:84).

**Facts the page missed**

- The clarify tool is gated server-side: only web, mobile and chrome surfaces, tool-capable models, streaming requests, and clients that declare clarify.v1 in x_interactive_cards (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1278-1291). The page says this is only 'a server tool' and lists VS Code as a user.
- The respond route also handles payload.kind 'message' for answer-ui cards: it composes follow-up text and stores nothing (apps/web/app/api/interactive-cards/respond/route.ts:152-160). It uses optimistic concurrency on the metadata update (route.ts:196-217).
- Interactive cards are capped at 4 per message and 12,000 serialized characters (packages/contracts/types/src/interactive-cards.ts:13-14), and the other-answer limit is 500 characters (line 84). The page's limits list omits all three.
