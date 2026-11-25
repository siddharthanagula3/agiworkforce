---
id: "F060-04"
type: "feature"
title: "Review the plan before it acts"
aliases: ["Review the plan before it acts", "Reviewable task plan", "Plan review card", "AgiWorkPlanReview", "agi_work_plan_approval", "agi_work_plan", "x_agiwork_plan", "ready_for_review"]
area: "60 Agentic work product"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S60.13"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-sync-and-continuity", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "F060-01", "F060-05", "table:work_plan_steps", "table:work_plan_revisions", "api:POST /api/llm/v1/chat/completions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F060-04 Review the plan before it acts

After a Work goal is sent, the agent first writes a 3 to 6 step plan. Web, desktop, Chrome and mobile chat stop and show it; the person edits steps, taps 'Start work' or 'Cancel'. Start sends the edited steps as a new request. The mobile New task sheet and scheduled runs skip review. CLI app-server can carry reviews.

Area: [60. Agentic work product](README.md). Requirement items: [S60.13](../../10-requirements/capabilities/060-agentic-work-product.md#s6013).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Runs a tool-free planning turn, shows the steps, ends the turn in a 'ready for review' state, and on Start sends the (edited) steps back so the agent follows them.

**Why it exists.** Long tool runs cost credits and take actions. Seeing and editing the plan first lets the person correct direction before anything runs. (doc: docs/product/requirements.md:768-780.)

**Who uses it.** Work users on web, desktop (hosted web), Chrome and mobile chat.

**Problems it solves**

- Wrong plan caught before credits are spent on tools.
- The person can remove, add or rewrite steps.

**Use cases**

- Remove a 'send an email' step from a research plan.
- Add a step 'cross-check numbers' before starting.
- Cancel a plan that misread the goal.

## 2. User experience

**Where to find it**

- Web and Desktop: a card inside the assistant message with heading 'Plan' and help 'Edit any step before the work starts. The agent follows the plan you start here.' (apps/web/features/chat/components/work-session/AgiWorkPlanReview.tsx:8-17, 91-94).
- Chrome: same labels in the side panel: heading 'Plan', buttons 'Start work' and 'Cancel', 'Add a step', declined text 'You cancelled this plan. Nothing was run.' (apps/extension/_locales/en/messages.json spPlanReview*; apps/extension/src/features/side-panel/agiWorkPlanReview.ts).
- Mobile chat: plan review in the assistant message (apps/mobile/stores/chat/chatExecutionStore.ts resolveAgiWorkPlan, lines 5932-6015; MessageBubble component named by the brief, not opened).
- CLI: app-server clients can save, update and decline a plan review (apps/cli/src/app_server/account_host.rs:74; apps/cli/src/cloud/work_plan.rs). No plan review in the CLI terminal UI.
- VS Code: none.

**Before you start**

- Work mode on; a plan was produced (the planning call returned parseable steps).

**Screens and controls**

- Numbered step text areas (limit 300 characters each), remove-step X button 'Remove this step', 'Add a step' (hidden at 6 steps), 'Start work' (disabled with no non-empty step), 'Cancel', message 'Add at least one step, or cancel.' (AgiWorkPlanReview.tsx:95-159).
- After a failed or stopped run: 'Retry from this step' button (AgiWorkPlanReview.tsx:57-80). This belongs to F060 retry, noted here because the same component renders it.

**Journey**

1. Send a Work goal.
2. The assistant message shows 'Here is the plan. Review it, edit any step, then start the work, or cancel it.' (tool-loop.ts:2204-2205) and the plan card.
3. Edit the steps.
4. Tap 'Start work': the client resends the user message with agi_work_goal and agi_work_plan (edited steps), replacing the review turn (WebChatPage.tsx:6385-6410).
5. The run executes the plan and shows progress (F060-05).
6. Or tap 'Cancel': steps are marked cancelled and nothing runs.

**What the person sees and gets**

- Task state 'ready_for_review' with summary 'The plan is ready for your review.' (tool-loop.ts flushTerminal, around line 5245-5247).
- If no plan could be made when review was requested: error 'A plan could not be prepared for review. No work steps were started. Try the goal again.' code agi_work_plan_unavailable, retryable (tool-loop.ts:6226-6245).
- Chrome shows the declined message after Cancel.

**Settings**

- None specific. Review is requested by the client flag, not a setting.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server planning turn: a tool-free provider call asks for a JSON array of 3 to 6 short steps; parsing falls back to numbered or bulleted lines; each step cut to 300 characters (agiwork-plan.ts:103-155; tool-loop.ts:6195-6208).
- With review requested (and not scheduled) the server emits the plan with awaiting_approval true plus a note, finishes the turn, and ends in ready_for_review (tool-loop.ts:6252-6285, 5239-5247).
- A client-supplied plan (agi_work_plan, 1 to 6 steps of up to 300 characters) skips the planning call and starts the work (agiwork-plan.ts:226-231; tool-loop.ts:6187-6190, 6287-6310).
- The execution directive tells the model to work through the steps in order and write 'Step N:' lines (agiwork-plan.ts:218-224).
- Web card: edit, add, remove, start, cancel; cancel is client-side and saved to the message unless the chat is temporary, Local or own-key (WebChatPage.tsx:6312-6334).
- Chrome card with the same controls and a draft memory (apps/extension/src/features/side-panel/agiWorkPlanReview.ts:94-130; side_panel.ts:9615-9660).
- Mobile resolveAgiWorkPlan handles start, cancel and retry with an in-flight guard (chatExecutionStore.ts:5932-6072).
- CLI app-server validates a plan review with a fingerprint and sends agi_work_plan on start, or agi_work_plan_approval true when no plan is given (apps/cli/src/cloud/work_plan.rs:1-66; apps/cli/src/app_server/cloud_turns.rs:833-840).

**Incomplete**

- Review is not a server pause. The server finishes the turn; Start is a new request, and the first run row ends. Cancel never tells the server (WebChatPage.tsx:6312-6320). [inferred from code]
- Mobile New task sheet does not request review (chatExecutionStore.ts:3291-3295, 3451).
- Planning call failure with no review requested continues without a plan (tool-loop.ts:6209-6224; test tool-loop.agiwork.test.ts:140).
- The brief says all six apps are done. VS Code and the CLI terminal UI have no plan review; Chrome and mobile chat do.

**Present but disconnected or switched off**

- work_plan_steps and work_plan_revisions tables exist for a durable, revisable plan with dependsOn, but nothing writes the model plan or user edits into them; only the objective row is opened (work-plan-steps.ts:29-36; work-plan-service.ts:365-372).

**Not available**

- VS Code: no plan review. CLI terminal UI: no plan review. Scheduled (unattended) runs: no review by design (tool-loop.ts:6226-6247).

## 4. Required behaviour

**Established requirements**

- Before the agent acts, the user sees its plan and can approve, edit or reject it. Brief: all six apps done. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.13)
- Approval prompts show action, target, risk, scope and choices. (source: doc: docs/product/requirements.md:780-781)
- Nothing may silently route a Local chat to BYOK or cloud; crossing needs explicit consent. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. A Work send from web returns a plan with awaiting_approval true and no tool step starts.
2. Editing a step then 'Start work' makes the next request carry exactly those steps in agi_work_plan.
3. 'Start work' is disabled when every step is empty; 'Add a step' is absent at 6 steps.
4. 'Cancel' marks steps cancelled and no run executes tools.
5. If the planning call yields no steps while review was requested, the person sees the agi_work_plan_unavailable message and no steps run.
6. A scheduled run starts without a review stop.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Reject should be recorded on the server; today it is client-side. [inferred from WebChatPage.tsx:6312-6320]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store plan steps and edits in work_plan_steps and revisions with the author 'user' so the plan survives devices.
- [proposed] Show the review card on the mobile New task path and in VS Code if Work is added there.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | agiWorkPlanningDirective, parseAgiWorkPlanSteps | `apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts` | Builds the planning prompt and parses steps (lines 103-155). |
| schema | AgiWorkSuppliedPlanSchema | `apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts` | Accepts the edited steps on Start (lines 226-231). |
| service | Plan phase in runToolLoop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Planning turn, awaiting-approval stop, start with directive (lines 6183-6310). |
| event | x_agiwork_plan delta | `apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts` | SSE frame carrying steps, goal and awaiting_approval (lines 233-256). |
| service | parseAgiWorkPlanEvent / parseAgiWorkPlanReview | `apps/web/features/chat/utils/agiwork-plan.ts` | Client parsing of the plan delta (lines 56-127). |
| component | AgiWorkPlanReview | `apps/web/features/chat/components/work-session/AgiWorkPlanReview.tsx` | The plan card. |
| service | handleAgiWorkPlanDecision | `apps/web/features/chat/pages/WebChatPage.tsx` | Applies Start, Cancel, Retry decisions (lines 6304-6410). |
| hook | useChatStream plan delta handling | `apps/web/lib/hooks/useChatStream.ts` | Stores the plan and review on the message; sends plan or approval flag (lines 4665-4671). |
| store | resolveAgiWorkPlan (mobile) | `apps/mobile/stores/chat/chatExecutionStore.ts` | Mobile decision handling (lines 5932-6072). |
| service | agiWorkPlan utils (mobile) | `apps/mobile/src/features/chat/utils/agiWorkPlan.ts` | readAgiWorkPlanReview, parseAgiWorkPlanDelta (imported at chatExecutionStore.ts:211-221); not opened. |
| component | Chrome plan review | `apps/extension/src/features/side-panel/agiWorkPlanReview.ts` | Card builder and pending-plan detection. |
| service | Chrome plan start and decline | `apps/extension/src/side_panel.ts` | startAgiWorkPlan, declineAgiWorkPlan, review binding (lines 9615-9660). |
| service | CLI work plan review | `apps/cli/src/cloud/work_plan.rs` | Fingerprint, validate, seal and continue a saved plan review (lines 1-66). |
| service | CLI cloud turn work body | `apps/cli/src/app_server/cloud_turns.rs` | Sends agi_work_plan or agi_work_plan_approval (lines 833-840). |
| schema | CloudWorkPlanReview | `crates/agiworkforce-protocol/src/account_cloud.rs` | Protocol type for a plan review (lines 35-46). |
| service | work-plan-service | `apps/web/lib/services/work-plan-service.ts` | Durable plan, steps with dependsOn, revisions (unused for steps). |
| table | work_plan_steps / work_plan_revisions | `apps/web/db/neon/0237_work_plans.sql` | Durable step and revision tables. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client sends the goal with agi_work_plan_approval true. | device and our servers | useChatStream.ts:4669-4670 |
| Server runs the planning call (no tools) on the routed provider; usage from it is merged into the turn's usage. | outside service | tool-loop.ts:6195-6205 |
| Server emits the plan with awaiting_approval, the review note and ends the turn in ready_for_review. | our servers | tool-loop.ts:6252-6285 |
| Person edits and taps Start; client resends the message with agi_work_plan replacing the review turn. | device | WebChatPage.tsx:6385-6410 |
| Server skips planning, marks the first step in progress and appends the execution directive to the last user message; work begins. | our servers | tool-loop.ts:6287-6310 |
| Cancel updates the stored message locally and tries to save the change to the account; no server run continues. | device and our servers | WebChatPage.tsx:6312-6334 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Plan steps and review state (goal, awaiting_approval) | Message metadata agiWorkPlan and agiWorkPlanReview in web_messages | Yes (message sync); not synced for temporary, Local or own-key chats | With the conversation |
| Plan overview and per-step progress | Journal events with progress ids agiwork:plan-overview and agiwork:plan:<step id> in cloud_agent_events | Yes | With the run journal |

**Models and providers.** The plan is written by the same routed model as the work (llmRequest reused with tools removed). Plan quality depends on the model. Provider failover applies to the planning call (test tool-loop.agiwork.test.ts:182).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Managed Cloud account on a qualifying plan. |
| Permissions | None beyond Work access; the review decision is the person's own. |
| Subscription | Same agi_work gate as F060-01. |
| Limits and metering | The planning call uses credits. Plan size limits: 6 steps, 300 characters (cloud-agent-runs.ts:84-85). |
| Feature flags | Client flag agi_work_plan_approval; unattended runs ignore it. |
| Model compatibility | Models must return a list; a fallback parser accepts numbered lists; unparseable output gives no plan. |
| Provider restrictions | None found in the code. |
| Local mode | Work is Cloud only. Plan decisions in a Local or own-key conversation do not resend (WebChatPage.tsx:6322-6334 and the boundary refusal at 6385-6396). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Planning call fails or unparseable, review not requested | Run continues without a plan; a warning is logged. | tool-loop.ts:6208-6224; tool-loop.agiwork.test.ts:140 |
| Planning fails and review was requested | Error agi_work_plan_unavailable, retryable; no work starts. | tool-loop.ts:6226-6245; tool-loop.agiwork.test.ts:154 |
| Empty draft | Start disabled with 'Add at least one step, or cancel.' | AgiWorkPlanReview.tsx:158 |
| Busy resend | Controls disabled while a turn streams; mobile guards double decisions. | AgiWorkPlanReview.tsx:104; chatExecutionStore.ts:5935 |
| Cancelled before start | Steps shown as Stopped; Chrome shows the declined line. | WebChatPage.tsx:6312-6320; messages.json spPlanReviewDeclined |
| Scheduled run | No review; plan runs straight away. | tool-loop.ts:6226-6247 |
| Reload with a pending plan | Chrome and web rebuild the card from stored metadata or journal overview; Chrome detects it from the overview progress entry. | agiWorkPlanReview.ts:85-100 |
| Accessibility | Section labelled 'Review the plan', textareas labelled 'Step N', remove buttons labelled; coarse pointers get 44px buttons in Chrome. | AgiWorkPlanReview.tsx:86-103; agiWorkPlanReview.ts:70-75 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.agiwork.test.ts`: Plan turn emits goal, steps and x_agiwork_plan; no parseable steps is non-fatal; review with no plan starts no steps; planning is the first dispatch; failover.
- `apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.test.ts`: Plan parsing (JSON, fenced, list fallback, cap), state transitions, SSE frame.
- `apps/web/lib/hooks/useChatStream.agiwork.test.tsx`: Plan delta populates the message; no-delta guard.
- `apps/mobile/__tests__/AgiWorkPlanProgress.test.tsx`: Mobile plan progress and review (matched by search).
- `apps/mobile/__tests__/AgiWorkPlanTurnSettle.test.ts`: Mobile plan settling on turn end (name; contents not opened).
- `apps/mobile/src/features/chat/utils/__tests__/clarifyAndPlan.test.ts`: Mobile plan and clarify helpers (matched by search).
- `apps/extension/__tests__/i18n.test.ts`: Locale keys including plan review strings (matched by search).
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.agiwork.test.tsx`: Tasks page Work behaviour (contents not opened).

**Test scenarios**

- **Review then start**
  1. Send a Work goal on web.
  2. Edit step 2, delete step 3, add a step, tap 'Start work'.
  - Expected: The next request has agi_work_plan with the edited steps; execution begins at step 1.
- **Cancel**
  1. Send a Work goal, tap 'Cancel'.
  - Expected: Steps show Stopped; no tool calls; reload keeps the cancelled state.
- **Unusable plan**
  1. Use a model or test double that returns prose with no list.
  2. Send with review requested.
  - Expected: agi_work_plan_unavailable message and no work.
- **Mobile sheet**
  1. Start from 'New task' with a goal.
  - Expected: Observe whether a plan card or immediate work appears (code predicts no review).
- **Chrome**
  1. Send a goal with AGI Work on in the side panel.
  - Expected: Plan card with 'Start work' and 'Cancel'; Start runs the edited plan.

**Where to look when it fails**

- Log '[tool-loop] AGI Work planning turn produced no parseable steps' and 'AGI Work planning turn failed; continuing without a plan' (tool-loop.ts:6208-6224).
- Task state ready_for_review in the journal.
- Message metadata keys agiWorkPlan, agiWorkPlanReview.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/060-agentic-work-product.md](../../70-qa/test-plans/web/060-agentic-work-product.md)
- Desktop: [70-qa/test-plans/desktop/060-agentic-work-product.md](../../70-qa/test-plans/desktop/060-agentic-work-product.md)
- Mobile: [70-qa/test-plans/mobile/060-agentic-work-product.md](../../70-qa/test-plans/mobile/060-agentic-work-product.md)
- CLI: [70-qa/test-plans/cli/060-agentic-work-product.md](../../70-qa/test-plans/cli/060-agentic-work-product.md)
- Chrome: [70-qa/test-plans/chrome/060-agentic-work-product.md](../../70-qa/test-plans/chrome/060-agentic-work-product.md)

## 10. Gaps and dependencies

- **Cancel and review are client-side; the server has no record of a rejected plan.** Affects: All surfaces. Evidence: WebChatPage.tsx:6312-6320. Work needed: Write a decision to the durable plan tables and the journal.
- **Mobile New task sheet skips review.** Affects: Mobile. Evidence: chatExecutionStore.ts:3451. Work needed: Send the flag and render the card.
- **Brief says VS Code and the CLI are done; neither terminal UI nor VS Code shows a plan review.** Affects: CLI, VS Code. Evidence: No plan review component found in apps/extension-vscode/src; docs list N/A for Work. Work needed: Correct the brief or build it.
- **Durable plan tables not used for steps or edits.** Affects: Resume on another device, audit. Evidence: work-plan-steps.ts:29-36. Work needed: Write steps and revisions; read them for display.
- **The review flag is sent for every Work message, even follow-ups in a running Work chat.** Affects: Web, Chrome users. Evidence: useChatStream.ts:4669-4670. Work needed: Decide whether follow-ups need review.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-sync-and-continuity
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- F060-01
- F060-05
- table:work_plan_steps
- table:work_plan_revisions
- api:POST /api/llm/v1/chat/completions

## Unknown

- Whether the mobile MessageBubble review controls match the web card labels (component not opened).
- Whether the server stores a user's plan edits anywhere besides message metadata.
- How the CLI app-server plan review is shown to the end user.
- Behaviour of the plan review in temporary chats beyond skipping the save.
