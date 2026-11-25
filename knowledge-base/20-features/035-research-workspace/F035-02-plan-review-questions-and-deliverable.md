---
id: "F035-02"
type: "feature"
title: "Plan review, questions and deliverable"
aliases: ["Research plan", "Research plan card", "Review the plan to start searching", "Before I search", "Deliverable", "awaiting_approval", "Approve plan (mobile)", "Start research (web)", "S35.02", "S35.03", "S35.04"]
area: "35 Research workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S35.02", "S35.03", "S35.04"]
depends_on: ["F035-01", "F035-03", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "SYS-api-and-contracts", "file:packages/contracts/types/src/research.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F035-02 Plan review, questions and deliverable

Before any search the run stops and shows its plan. The person can answer up to three questions, reword, remove or add search steps (up to six), pick depth, format, minimum sources and stop rules, then start or cancel. Web and mobile have it; the brief's 'questions missing' is out of date.

Area: [35. Research workspace](README.md). Requirement items: [S35.02](../../10-requirements/capabilities/035-research-workspace.md#s3502), [S35.03](../../10-requirements/capabilities/035-research-workspace.md#s3503), [S35.04](../../10-requirements/capabilities/035-research-workspace.md#s3504).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Pauses a new research run at phase awaiting_approval and sends the plan, clarifying questions and deliverable settings to the screen. Start re-sends the question as a new turn with the approved steps, deliverable and answers [research-loop.ts:3088-3110; WebChatPage.tsx:6215].

**Why it exists.** Searching spends the person's budget, so the plan is theirs to accept; what they start is exactly what is searched (ResearchPlan.tsx:23-24; doc: docs/product/experience-contract.md:781).

**Who uses it.** Paid-plan people running Deep Research on web, desktop (hosted web) and mobile.

**Problems it solves**

- Wasted spend on a badly framed question.
- Models guessing ambiguous scope.
- No control over report depth and format.

**Use cases**

- Remove a step the person does not care about before it runs.
- Answer 'which region?' so the searches are narrower.
- Pick Executive summary with a bullet brief.

## 2. User experience

**Where to find it**

- Web and Desktop: plan card in the assistant message under the status bar (ResearchActivity renders ResearchPlan when waiting) [ResearchActivity.tsx:459,799].
- Mobile: ResearchRunCard plan editor with buttons 'Approve plan' and 'Cancel' [apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:620,641].

**Before you start**

- A research send that reached awaiting_approval.
- The surface can send (a plan with no send handler shows no Start button) [ResearchActivity.tsx:459].

**Screens and controls**

- Web: heading 'Research plan'; text 'Edit any step before it runs. What you start here is exactly what gets searched, and it spends your budget.'; fieldset 'Before I search' with the hint 'Answer what you can; anything left blank is skipped.'; step inputs 'Research step N'; 'Remove this step' (X); 'Add a step' (max 6); fieldset 'Deliverable' with radios 'Executive summary' and 'Full report', Format select 'Prose', 'Prose with comparison tables', 'Bullet brief', 'Done when it has at least' (no minimum, 5, 10, 20 sources), checkbox 'Stop once a round of searching stops finding anything new' (on by default), checkbox 'Save the finished report to my library' (off by default); buttons 'Start research' and 'Cancel'; empty copy 'Add at least one step, or cancel.' [ResearchPlan.tsx:19-37,80-82,223-345; research.ts:286-292].
- Mobile: 'Before I search' questions (same hint), editable steps (max 6) with 'Add a step', 'Remove step N', options with Deliverable depth and Format ('Prose with tables') only, then 'Approve plan' / 'Cancel' [ResearchRunCard.tsx:45,390,566-581,620; ResearchPlanOptions.tsx:30-42,224-260].

**Journey**

1. Send a research question.
2. The run plans (one tool-free model call) and stops with status 'Review the plan to start searching'.
3. Answer questions, edit steps, choose the deliverable.
4. Press Start research (web) or Approve plan (mobile), or Cancel.
5. The plan turn is replaced by a new turn that searches the approved steps.

**What the person sees and gets**

- Cancel marks the run stopped with the label 'Research plan cancelled' and no server call [WebChatPage.tsx:6222-6228; chatExecutionStore.ts:5754-5762].
- If the trial is exhausted Start opens the upgrade dialog [WebChatPage.tsx:6240-6244].
- Blocked guidance (a secret in an answer) returns 400 secret_detected with a message to remove it [route.ts:503-522].

**Settings**

- Deliverable defaults: Full report, Prose, no minimum, stop-when-no-new-sources on, save-to-library off [packages/contracts/types/src/research.ts:286-292].
- Plan size bounds: 3 to 6 planned searches, up to 3 questions of 200 characters [research-loop.ts:223-232].

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Plan turn, question parsing and approval gate; nothing is stored for a run waiting for approval [research-loop.ts:3033-3110,3594].
- If the plan is empty the loop adds the step 'Search for sources on this question' [research-loop.ts:3088-3098].
- Web card with questions, step editing, deliverable [ResearchPlan.tsx].
- Start sends approved steps, completed steps, deliverable and answers as research_resume; the plan turn is replaced [WebChatPage.tsx:6215-6290; useChatStream.ts:4616-4636].
- Server approves only search steps, up to six, with new ids plan-N [research-loop.ts:1862-1880 region, 1850-1870].
- Only approved searches run unasked; other tool calls that need approval are refused [research-loop.ts:2215-2230].
- Mobile editor, questions and options [ResearchRunCard.tsx; ResearchPlanOptions.tsx].

**Incomplete**

- Mobile lacks minimum sources, stop-when-no-new-sources and save-to-library controls (grep found none) .
- The 'Save the finished report to my library' tick is sent in the deliverable but no server or client code reads saveToLibrary (grep of apps and packages found only the type, the checkbox and the normaliser) [ResearchPlan.tsx:294; research.ts:321].
- minSources only gates the early READY stop; it does not force more searching past the budgets [research-loop.ts:3370-3374].
- Answers become guidance; guidance runs a re-plan turn that can replace the pending steps the person just edited [research-loop.ts:2906-2960]. Whether the replacement searches pass the approval gate depends on the saved tool policy (not established).

**Present but disconnected or switched off**

- Brief rows S35.03 (questions missing on all apps) and S35.02 (deliverable missing on mobile) are out of date: both exist in code.

**Not available**

- CLI, VS Code, Chrome: no plan card.

## 4. Required behaviour

**Established requirements**

- Before a run starts the user states the objective and chooses the deliverable. (source: brief S35.02)
- A run asks clarifying questions with answers the user can give before searching. (source: brief S35.03)
- The plan is shown before searching and the user can add, remove, reword steps before approving. (source: brief S35.04)
- Review the plan before approved work begins. (source: doc: docs/product/experience-contract.md:781)

**Acceptance criteria**

1. A new research question stops at phase awaiting_approval and stores no report row.
2. Blank answers are skipped; non-blank answers arrive as guidance.
3. Editing a step then pressing Start searches the edited text.
4. With all steps removed Start is disabled and 'Add at least one step, or cancel.' shows.
5. Cancel changes the label to 'Research plan cancelled' without a network call.
6. A secret typed into an answer returns 400 secret_detected or is redacted.
7. Choosing Executive summary changes the report directive sent to the writing turn.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Edited steps should be what runs; the re-plan on guidance may break that [inferred from research-loop.ts:2906-2960].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Skip the re-plan when the person has already edited steps, or show the replaced steps for approval.
- [proposed] Remove or implement the Save to library tick.
- [proposed] Bring minimum sources and stop rule to mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ResearchPlan | `apps/web/features/chat/components/research/ResearchPlan.tsx` | Web editable plan, questions, deliverable form |
| component | ResearchActivity | `apps/web/features/chat/components/research/ResearchActivity.tsx` | Hosts the card and the Start and Cancel decision |
| hook | handleResearchPlanDecision | `apps/web/features/chat/pages/WebChatPage.tsx` | Start and Cancel handling, replaces the plan turn |
| other | research-plan utils | `apps/web/features/chat/utils/research-plan.ts` | Parse plan event, pick approved and completed steps |
| other | parseResearchPlanQuestions / researchAnswersGuidance | `packages/ui/unified-chat/src/lib/research-plan.ts` | Shared question parsing and answers to guidance |
| hook | useChatStream research parsing | `apps/web/lib/hooks/useChatStream.ts` | Reads x_research_plan and builds research_resume |
| service | runResearchLoop planning and approval gate | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Plan turn, questions, awaiting_approval stop, approved steps |
| service | buildResearchRunOptions | `apps/web/app/api/llm/v1/chat/completions/lib/research-run-options.ts` | requirePlanApproval is true until approved steps exist |
| schema | research_resume schema | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Validates approved_steps, deliverable, guidance |
| schema | ResearchDeliverableSpec | `packages/contracts/types/src/research.ts` | Deliverable defaults and normaliser |
| endpoint | POST chat completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Secret check on guidance |
| component | ResearchRunCard | `apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx` | Mobile editor, questions, Approve plan |
| component | ResearchPlanOptions | `apps/mobile/src/features/chat/components/research/ResearchPlanOptions.tsx` | Mobile depth, format and source choices |
| store | chatExecutionStore.resumeResearch | `apps/mobile/stores/chat/chatExecutionStore.ts` | Mobile start, cancel, retry |
| other | researchPlanChoices | `apps/mobile/src/features/chat/utils/researchPlanChoices.ts` | Mobile choices type and defaults |
| test | ResearchPlan tests | `apps/web/features/chat/components/research/__tests__/ResearchPlan.test.tsx` | Plan card behaviour |
| test | ResearchRunCard tests | `apps/mobile/src/features/chat/components/research/__tests__/ResearchRunCard.test.tsx` | Mobile card behaviour |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server runs the tool-free planning turn, parses up to 3 questions and 3 to 6 searches, and emits the plan, run settings and status awaiting_approval. | our servers | research-loop.ts:3033-3110 |
| Client shows the card and keeps the edits in component state. | device | ResearchPlan.tsx:94-100 |
| Start rolls back the plan turn and sends a new request with research_resume (approved steps, deliverable, guidance). | device and our servers | WebChatPage.tsx:6254-6275; useChatStream.ts:4616-4636 |
| Server checks guidance for secrets, then runs the loop on the approved steps. | our servers | route.ts:503-522; research-run-options.ts:112 |
| Approved runs may run as a durable workflow when enabled. | our servers | route.ts:634-690 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Plan, questions and run settings | assistant message metadata research state in the client store; no report row while awaiting approval | message save may fail on size; server projects the state from the report instead [assistant-turn-research.ts:1-20] | normal chat retention; a cancelled plan stays as an interrupted message |
| Deliverable and source selection | research_reports row after the run (via deliverable and sourceSelection) [research-run-options.ts:78-86] | server side | deleted with the conversation (foreign key cascade, 0094) |

**Models and providers.** The planning turn uses the same routed model as the run, with tools off [research-loop.ts:3033-3040]. Provider-neutral.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; paid plan. |
| Permissions | Guidance is checked by the secret-handling gate; tool calls that need approval are refused during the run [research-loop.ts:2215-2230]. |
| Subscription | Same as F035-01 (deep_research on pro and above). The plan turn is one of the run's model calls and is billed with the run [research-loop.ts:1796-1800 region]. |
| Limits and metering | One planning call counts toward the 6 model calls; plan cap 6 steps, 3 questions, answers 300 characters per box [research-loop.ts:223-232; ResearchPlan.tsx:20]. |
| Feature flags | None specific. |
| Model compatibility | Any research-capable model. If the run budget is under 3 model calls the plan turn is skipped but the approval gate still stops the run [research-loop.ts:238,3076-3087]. |
| Provider restrictions | None found. |
| Local mode | Cloud only (see F035-01). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Plan turn fails or has no parseable queries | Not fatal; approval gate still stops, with the single placeholder step. | research-loop.ts:3055-3098 |
| No steps left | Start disabled, text 'Add at least one step, or cancel.' | ResearchPlan.tsx:111,343 |
| Step over 300 characters | Truncated to 300. | ResearchPlan.tsx:21,118 |
| Seventh step | Add a step disabled at 6. | ResearchPlan.tsx:136,226 |
| Start while streaming or already retrying | Ignored or button busy. | WebChatPage.tsx:6216; ResearchActivity.tsx:459 |
| Surface cannot send | No Start button. | ResearchActivity.tsx:459 |
| Blocked secret in answers | 400 secret_detected, reservation refunded. | route.ts:503-518 |
| Reload while waiting | Plan restored from stored message state; unknown if the server state is also needed. | assistant-turn-research.ts:56-78 |
| Accessibility | Section labelled by heading; steps have aria-labels; mobile question fields have accessibility labels. | ResearchPlan.tsx:151; ResearchRunCard.tsx:97 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/research/__tests__/ResearchPlan.test.tsx`: Questions, edit, remove, add, deliverable, empty plan, read-only mode
- `apps/web/features/chat/components/research/ResearchActivity.test.tsx`: Start and Cancel shown only while waiting
- `apps/mobile/src/features/chat/components/research/__tests__/ResearchRunCard.test.tsx`: Approve and cancel, questions, answers, sources and deliverable choices
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.research.test.ts`: Approved-plan schema accepted and empty step rejected
- `apps/web/lib/hooks/useChatStream.research.test.tsx`: Plan kept for approval; approved plan sent back as research_resume.approved_steps
- `packages/ui/unified-chat/src/lib/research-plan.test.ts`: Shared question parsing

**Test scenarios**

- **Edit then start**
  1. Run a research question on web
  2. Reword step 1, remove step 2
  3. Press Start research
  - Expected: Request carries approved_steps with the edited text; the status bar moves to searching
- **Questions**
  1. Answer one question, leave one blank
  2. Start
  - Expected: Guidance holds only the answered question
- **Cancel plan**
  1. Press Cancel
  - Expected: Label 'Research plan cancelled', no request sent, no report row
- **Secret in answer**
  1. Type a fake API key in an answer
  2. Start
  - Expected: 400 secret_detected or redacted guidance
- **Answers versus edits**
  1. Edit steps and also answer a question
  2. Start
  3. Compare searched queries to the edited ones
  - Expected: Records whether the re-plan replaced the edits (open question)

**Where to look when it fails**

- Log '[research-loop] planning turn produced no parseable queries'.
- Log 'guidance produced no parseable queries; the plan is unchanged'.
- Header X-AGI-Research-Loop.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/035-research-workspace.md](../../70-qa/test-plans/web/035-research-workspace.md)
- Desktop: [70-qa/test-plans/desktop/035-research-workspace.md](../../70-qa/test-plans/desktop/035-research-workspace.md)
- Mobile: [70-qa/test-plans/mobile/035-research-workspace.md](../../70-qa/test-plans/mobile/035-research-workspace.md)

## 10. Gaps and dependencies

- **Save to library tick has no effect** Affects: Web users. Evidence: grep: saveToLibrary appears only in research.ts:283-321 and ResearchPlan.tsx:294. Work needed: Save the report to the library when ticked, or remove the control
- **Mobile missing minimum sources, stop rule and save tick** Affects: Mobile. Evidence: ResearchPlanOptions.tsx has depth, format, sources only. Work needed: Add controls or document the difference
- **Guidance re-plan may overwrite edited steps** Affects: Web and mobile users who answer questions. Evidence: research-loop.ts:2906-2960. Work needed: Keep approved steps and append guidance
- **Brief rows stale** Affects: Documentation. Evidence: brief S35.02/S35.03 versus ResearchPlan.tsx. Work needed: Update the brief rows
- **No plan card on CLI, VS Code, Chrome** Affects: Those apps. Evidence: no research code. Work needed: Decide scope
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F035-01
- F035-03
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- SYS-api-and-contracts
- file:packages/contracts/types/src/research.ts

## Unknown

- Whether replacement queries from a guidance re-plan pass the approval gate.
- Whether a reload while awaiting approval restores the card from stored state alone.
- Why the brief marks questions missing (stale brief, not established).
