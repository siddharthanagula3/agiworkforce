---
id: "F057-10"
type: "feature"
title: "Agents, questions and approvals"
aliases: ["Clarifying questions (ask_clarifying_questions)", "ask_user tool", "Question card", "Approval request tool", "Sub-agent delegation (task, agent)", "S57.25", "S57.26", "S57.27"]
area: "57 Tool catalog and invocation experience"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S57.25", "S57.26", "S57.27"]
depends_on: ["surface:web", "surface:mobile", "surface:chrome", "surface:cli", "surface:vscode", "surface:desktop", "mode:cloud", "mode:local", "api:POST /api/interactive-cards/respond", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F057-10 Agents, questions and approvals

The assistant can ask a clarifying question with choices, ask the person to approve a plan or decision, and hand a job to another agent. The hosted chat shows a question card on Web, Mobile and Chrome and then ends the turn. The CLI and VS Code have ask_user (question or approval), plus task and agent tools for delegation.

Area: [57. Tool catalog and invocation experience](README.md). Requirement items: [S57.25](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5725), [S57.26](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5726), [S57.27](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5727).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built (this page lists unfinished parts) | partly built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Hosted route: the model calls ask_clarifying_questions to render up to four questions with two to four options each, plus an 'other' answer. CLI and VS Code: ask_user asks a question or an approve or decline decision and waits; task and agent run a sub-agent and return its result to the parent turn.

**Why it exists.** To ask when information is missing instead of guessing, to get consent before a decision, and to split work across agents.

**Who uses it.** People who send vague requests, and developers using the CLI or VS Code.

**Problems it solves**

- A vague request such as 'plan my trip' with no details.
- Consent for a plan or decision before it runs.
- Parallel sub-tasks in code work.

**Use cases**

- The assistant asks 'Which destination?' with buttons.
- In the CLI the assistant asks 'Apply this plan?' and the person approves in an overlay.
- The CLI spawns two sub-agents to fix two files in parallel.

## 2. User experience

**Where to find it**

- Web: inline question card (apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:34-35; apps/web/features/chat/components/messages/cards/ClarifyCard).
- Mobile: InteractiveCardBlock (apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx).
- Chrome: side-panel card (apps/extension/src/features/side-panel/interactiveCards.ts).
- Desktop (Electron shows hosted web): the card component is shared, but the server offers the tool only for web, mobile and chrome surfaces and the desktop shell reports surface desktop, so Desktop may not receive it (request-processor.ts:1279-1281; apps/web/lib/device-steps/host-headers.ts:38-52). Unverified.
- CLI: question modal and a 'Tool Approval' overlay (apps/cli/src/tui/tui_app.rs:8315-8335; approval_overlay.rs:568).
- VS Code: question card inside the chat panel, label 'AGI asks, <question>' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7269).

**Before you start**

- Hosted: streaming chat, tool-capable model, client declares clarify.v1 support (request-processor.ts:1283), message short and not an explicit action request (apps/web/lib/services/clarify-tool-service.ts:50-60).
- CLI: ask_user is a deferred tool loaded through tool_search (tool_catalog.rs:794-825).
- Delegation: not inside a sub-agent (apps/cli/src/agent/mod.rs:1063-1065).

**Screens and controls**

- Option buttons, an 'other' text answer and skip on the card (apps/web/app/api/interactive-cards/respond/route.ts:36-58).
- CLI approval overlay keys: y Yes, n No, s Allow Session, a Always allow, d Deny All (approval_overlay.rs:15-20,121).
- CLI question modal with option list and 'Type your own answer' (apps/cli/src/features/exec/tools/task_registry/mod.rs:670-680).

**Journey**

1. 1. The person sends a message.
2. 2. The model calls the question tool.
3. 3. A card or modal shows the question and choices.
4. 4. The person picks an option or types an answer.
5. 5. Hosted: the answer returns as the next request and the model continues. CLI: the tool returns 'User responded: ...' and the same turn continues.
6. 6. For approval kind, the model receives 'The user approved.' or 'The user declined. Do not proceed with it.'

**What the person sees and gets**

- Settled card shows the chosen answers.
- CLI result text 'The user did not answer. Continue without the answer and say which assumption you made.' on no answer (task_registry/mod.rs:563-564).
- Delegation: the sub-agent result is added to the parent as a tool result (apps/cli/src/agent/chat.rs:2762-2830).

**Settings**

- Tool approval policy.
- Plan mode in the CLI blocks sub-agents until the plan is approved (agent/chat.rs:2795-2808).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Hosted clarify tool: schema, normalisation, rejection of delivery-only questions, always an 'other' option (apps/web/lib/services/clarify-tool-service.ts:150-342).
- Answer route settles the card and rebuilds a message (apps/web/app/api/interactive-cards/respond/route.ts).
- The hosted loop ends the turn after a clarify card (tool-loop.ts:7651-7655).
- CLI ask_user with kinds question and approval, routed to the surface, then the terminal, else refused (task_registry/mod.rs:569-680).
- CLI task and agent tools; results go back as tool results (tool_catalog.rs:646-675; agent/chat.rs:2762-2830).
- VS Code shows the question card from the CLI app-server approval event (ChatStateManager.ts:6740-6790) because VS Code spawns the CLI app-server (apps/extension-vscode/src/integrations/localRuntimeClient.ts:2575).

**Incomplete**

- Hosted clarify does not wait inside the loop; it ends the turn and the answer arrives as a later request (tool-loop.ts:7651-7655).
- Desktop offer of the clarify tool is unverified (see unknowns).

**Present but disconnected or switched off**

- Hosted route has no delegation tool and no model-callable approval tool; the web has plan approval via agi_work_plan_approval and tool approval cards, which are not the same (request-processor.ts:772-773).

**Not available**

- Delegation on Web, Desktop, Mobile, Chrome.
- Model-callable approval request on Web, Desktop, Mobile, Chrome as a separate tool.

## 4. Required behaviour

**Established requirements**

- The assistant waits for the answer before it continues. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.26)
- A declined approval is returned to the model as a decline. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.27)
- Delegation returns the sub-agent's result to the parent turn. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.25)
- Approval prompts show the action, target and choices. (source: doc: docs/product/requirements.md lines 768-780)

**Acceptance criteria**

1. A vague one-line request on Web produces a card with 2 to 4 options and an 'other' answer.
2. A request that starts with an explicit action verb does not produce a card.
3. In the CLI, ask_user with kind approval and Deny returns 'The user declined. Do not proceed with it.'
4. In an exec or app-server run with nobody to answer, ask_user returns a refusal and does not read stdin.
5. A task call returns the sub-agent text to the parent as a tool result.
6. A sub-agent cannot spawn further sub-agents.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] 'Wait' means a stopped turn on the hosted route and a blocked call in the CLI; both stop the model from continuing without an answer.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Confirm and, if needed, add the clarify offer for the desktop surface.
- [proposed] Add delegation to the hosted route only if a product decision wants it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | clarify tool service | `apps/web/lib/services/clarify-tool-service.ts` | Defines and validates ask_clarifying_questions |
| hook | applyClarifyCardCapability | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Offers the tool on web, mobile, chrome (lines 1269-1298) |
| service | tool loop clarify branch | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Builds the card and ends the turn (lines 2705-2717, 7651-7655) |
| endpoint | POST /api/interactive-cards/respond | `apps/web/app/api/interactive-cards/respond/route.ts` | Records the person's answers |
| component | web InteractiveCardBlock | `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx` | Renders cards on web and desktop |
| component | mobile InteractiveCardBlock | `apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx` | Mobile card |
| store | mobile chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Declares x_interactive_cards support (line 3442) |
| service | chrome interactive cards | `apps/extension/src/features/side-panel/interactiveCards.ts` | Chrome card rendering |
| hook | useChatStream cards | `apps/web/lib/hooks/useChatStream.ts` | Web capability declaration (lines 1336-1347, 4590) |
| command | ask_user | `apps/cli/src/features/exec/tools/task_registry/mod.rs` | Question and approval execution (lines 560-680) |
| config | CLI tool catalog | `apps/cli/src/platform/runtime/tool_catalog.rs` | Declares ask_user, task, agent |
| component | approval overlay | `apps/cli/src/tui/widgets/approval_overlay.rs` | Tool Approval overlay |
| component | TUI question modal | `apps/cli/src/tui/tui_app.rs` | Question modal (lines 8315-8335) |
| service | sub-agent batch | `apps/cli/src/agent/chat.rs` | Runs task and agent calls (lines 2762-2830) |
| service | VS Code approval and question cards | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Maps CLI events to cards (lines 6725-6790) |
| component | VS Code webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Renders the question card (line 7269) |
| test | clarify service tests | `apps/web/lib/services/clarify-tool-service.test.ts` | Card shape, rejection rules |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The server offers ask_clarifying_questions for short, non-action messages on web, mobile or chrome when the client declares clarify.v1. | our servers | request-processor.ts:1269-1298; clarify-tool-service.ts:50-60 |
| The model calls it; arguments are normalised and validated; a card is built and sent in the stream. | our servers | clarify-tool-service.ts:298-342; tool-loop.ts:2705-2717 |
| The turn ends. The person answers on the card; the answer is posted and the card settles. | device and our servers | tool-loop.ts:7651-7655; interactive-cards/respond/route.ts |
| CLI: ask_user asks the surface through the approval broker or a typed prompt and returns the reply as the tool result. | device | task_registry/mod.rs:569-680 |
| CLI: task and agent spawn sub-agents and return their output to the parent. | device and our servers | agent/chat.rs:2762-2830 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Card and answers | message metadata of the conversation | with the conversation | with the chat |
| CLI approval decisions | session activity on the device | app-server events to VS Code | with the session (apps/cli/src/platform/runtime/session_activity.rs:1-60) |

**Models and providers.** Any tool-capable model on the hosted route. CLI sub-agents use the session's model and cannot change it (tool_catalog.rs:664-665).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Hosted: signed in. CLI: none for ask_user in Local mode. |
| Permissions | CLI sub-agents inherit the session's tool limits and permission mode (tool_catalog.rs:647-650). |
| Subscription | none found in the code for these tools; the underlying chat turn is metered as usual. |
| Limits and metering | Up to 4 questions and 4 options per card; question 200 chars, label 60 (clarify-tool-service.ts:14-20). CLI options up to 6 (tool_catalog.rs:803). |
| Feature flags | INTERACTIVE_QUESTIONS flag in the CLI (apps/cli/src/features/exec/tools/mod.rs interactive_questions_enabled); x_interactive_cards.supported on the request. |
| Model compatibility | Tool-capable models only on the hosted route. |
| Provider restrictions | none found in the code. |
| Local mode | CLI works in Local mode: ask_user and sub-agents run on the device. Hosted cards need Cloud. Mobile Local mode: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Nobody can answer (exec or app-server) | ask_user returns a refusal and never reads the terminal | task_registry/mod.rs:596-606,665-668; tools/mod.rs:315-335 |
| Question closed without answer | Model told to carry on with its best judgement | task_registry/mod.rs:651-656 |
| Malformed card | Tool error returned to the model | clarify-tool-service.ts:303-313 |
| Temporary chat | Card buttons that send messages need a saved chat | InteractiveCardBlock.tsx:60-62 |
| Plan mode not approved | Sub-agent tasks blocked | agent/chat.rs:2795-2808 |
| Accessibility | VS Code card has an aria-label; web card accessibility: not checked | webviewContent.ts:7269 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/clarify-tool-service.test.ts`: Card shape, other option, rejection of delivery-only questions
- `apps/web/features/chat/components/messages/InteractiveCardBlock.test.tsx`: Card rendering (name only)
- `apps/web/lib/hooks/useChatStream.interactive-cards.test.tsx`: Hook handling of cards (name only)
- `apps/web/app/api/interactive-cards/respond/route.test.ts`: Respond route (name only)
- `apps/mobile/src/features/chat/utils/__tests__/clarifyAndPlan.test.ts`: Mobile clarify helpers (name only)
- `apps/cli/src/features/exec/tools/task_registry/mod.rs`: In-file module ask_user_tests (line 1248)
- `apps/cli/src/app_server/developer_host.rs`: Test 'ask_user_is_announced_to_the_client_and_resumed_by_its_answer' (line 10644)

**Test scenarios**

- **Vague request on Web**
  1. Send 'plan my trip'
  2. Pick an option on the card
  - Expected: A card with options and 'other'; the next reply uses the choice
- **Explicit action**
  1. Send 'summarize this: <text>'
  - Expected: No card; direct answer
- **CLI approval decline**
  1. Ask the CLI to call ask_user with kind approval
  2. Press n
  - Expected: Result 'The user declined. Do not proceed with it.'
- **No human**
  1. Run the CLI in exec mode with ask_user
  - Expected: Refusal text, no hang
- **Delegation**
  1. Ask the CLI to use task for two independent fixes
  - Expected: Two sub-agent results appear as tool results in the parent turn
- **Desktop**
  1. On the Electron desktop send a vague request
  - Expected: Observe whether a card appears (unverified)

**Where to look when it fails**

- Tool result prefix 'The clarifying questions were rejected'.
- Task state awaiting_input events in the stream.
- CLI messages "Tool 'task' is not available in this session."

**Hands-on test plans**

- Web: [70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md)
- Desktop: [70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md)
- Mobile: [70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md)
- CLI: [70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md)
- VS Code: [70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md)
- Chrome: [70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md)

## 10. Gaps and dependencies

- **Desktop may not be offered the clarify tool.** Affects: Desktop (Electron). Evidence: request-processor.ts:1279-1281 excludes surface desktop; host-headers.ts:38-52 sends desktop. Work needed: Verify on the running desktop; add the desktop surface if intended.
- **Brief marks CLI question 'unverified'; code and two tests exist but no run is recorded.** Affects: CLI. Evidence: task_registry/mod.rs:1248; developer_host.rs:10644. Work needed: Run the scenarios and record results.
- **No delegation or approval tool on the hosted route.** Affects: Web, Desktop, Mobile, Chrome. Evidence: No matching tool in request-processor.ts. Work needed: Product decision.
- **The hosted tool description says a last resort, so cards are rare by design.** Affects: All hosted surfaces. Evidence: clarify-tool-service.ts:241-270. Work needed: None; note for testers.

**Depends on**

- surface:web
- surface:mobile
- surface:chrome
- surface:cli
- surface:vscode
- surface:desktop
- mode:cloud
- mode:local
- api:POST /api/interactive-cards/respond
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design

## Unknown

- Whether the desktop shell receives the clarify tool.
- Whether the web card passes accessibility checks.
- How the CLI question modal behaves in a real terminal (no run recorded).
- Whether the Chrome card has its own test (only side-panel-bubbles test found).
