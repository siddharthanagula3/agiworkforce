---
id: "F060-05"
type: "feature"
title: "Follow progress"
aliases: ["Follow progress", "Step list", "Running-step indicator", "Parallel-work indicator", "Dependency display", "Plan progress", "Tool timeline", "x_tool_status parallel_group", "Step N: markers"]
area: "60 Agentic work product"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S60.14", "S60.15", "S60.16", "S60.17"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-sync-and-continuity", "SYS-observability-and-operations", "SYS-shared-ui-and-design", "F060-04", "F060-06", "table:work_plan_steps", "table:cloud_agent_events"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F060-05 Follow progress

A running Work task shows its plan steps with a status (Not started, In progress, Done, Failed, Stopped), the step currently running, and read-only tool calls that run together grouped as 'parallel'. Step status follows 'Step N:' lines the model writes, so it can be wrong. Dependencies between steps are shown nowhere.

Area: [60. Agentic work product](README.md). Requirement items: [S60.14](../../10-requirements/capabilities/060-agentic-work-product.md#s6014), [S60.15](../../10-requirements/capabilities/060-agentic-work-product.md#s6015), [S60.16](../../10-requirements/capabilities/060-agentic-work-product.md#s6016), [S60.17](../../10-requirements/capabilities/060-agentic-work-product.md#s6017).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not stated on this page | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not stated on this page | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Streams plan and tool events and renders them: step list, which step is running, and parallel tool groups, in the chat message, the Tasks detail, and mobile and VS Code run views.

**Why it exists.** People leave long tasks running and need to see what is happening and how far along they are. (doc: docs/product/requirements.md lists approval state and durable AGI Work task surfaces, lines 683, 1139.)

**Who uses it.** Anyone running Work on web, desktop, mobile, VS Code Cloud tasks view, Chrome.

**Problems it solves**

- Knowing what step the agent is on.
- Seeing that several searches ran at once.
- Reopening a run later and seeing its steps from the journal.

**Use cases**

- Open Tasks on web and read the Plan section with step states.
- Tap a run card on mobile and read 'Plan · 5' with each step state.
- Watch a 'parallel' group while four searches run together.

## 2. User experience

**Where to find it**

- Web and Desktop: plan sentence and rows in the activity timeline in the chat (packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:805-830, 901-903); 'Plan · N' section in the Tasks detail panel (packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:483, 610, 647-660); tool timeline with a 'parallel' label (apps/web/features/chat/components/messages/ToolTimeline.tsx:737-747).
- Mobile: run detail sheet section 'Plan · N' with lines like '2. Compare pricing · In progress' and a note 'Done X of N steps before it stopped.' (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:~497-537; labels in apps/mobile/src/features/tasks/runPresentation.ts:318-324). No parallel indicator on mobile.
- VS Code: Cloud tasks detail quick pick, 'Progress' section with step icons (apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:70-84).
- Chrome: the run is shown in the chat; step list view not traced.
- CLI: the terminal UI shows the local agent's tool timeline; no Work plan (not applicable to Cloud Work).

**Before you start**

- A Work run that has a plan (review requested and started, or planning succeeded).

**Screens and controls**

- Step status words: Not started, In progress, Done, Failed, Stopped (web AgiWorkPlanReview.tsx:19-25; mobile runPresentation.ts:318-324).
- Tool rows with a 'parallel' tag for read-only batches.

**Journey**

1. Start the work.
2. Plan overview and the first step appear as In progress.
3. As the model writes 'Step 2:' the earlier steps become Done and step 2 In progress.
4. Several read-only tool calls run together and appear grouped.
5. At the end remaining steps become Done, or the running one becomes Failed or Stopped.

**What the person sees and gets**

- Journal progress events with ids agiwork:plan-overview and agiwork:plan:<step id> and statuses running, completed, failed.
- Task state messages: 'Agent is planning the work.', 'Agent is working through the plan.', 'Agent work finished and is ready for review.'

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server advances the plan: first pending step to in_progress on start; completes steps on finish; fails or cancels the in-progress step on error or cancel; 'stop' leaves the in-progress step stopped (agiwork-plan.ts:165-190; tool-loop.ts:5210-5230).
- The running step follows 'Step N:' marker lines in the model text (agiwork-plan.ts:207-216; tool-loop.ts:7016-7027).
- Plan snapshots are sent as x_agiwork_plan frames and as journal progress events; only started steps are journaled plus an overview (agiwork-plan.ts:284-306).
- Parallel: read-only tool calls (up to 4) share a parallel_group id when the serving harness supports it (tool-loop.ts:5400-5422, 541; useChatStream.ts:3487-3488) and ToolTimeline groups them (ToolTimeline.tsx:261-264, 737-747).
- Web Tasks detail builds the step list from the journal (TaskDetailPanel.tsx:455-483); mobile builds it from journal progress (runPresentation.ts:300-330).

**Incomplete**

- Step status accuracy depends on the model writing 'Step N:' lines; a model that does not write them leaves step 1 In progress until the end. [inferred from agiwork-plan.ts:207-216, 218-224]
- Parallel indicator is absent on mobile, VS Code and Chrome (brief; mobile CloudRunDetailSheet has no grouping).
- At end of turn every non-terminal step is marked Done (tool-loop.ts:5217-5227), which can overstate progress. [inferred]

**Present but disconnected or switched off**

- Dependencies: table work_plan_steps has a depends_on column and the service refuses a step that depends on an unknown step (work-plan-service.ts:31-36, 109-118; test lib/workflows/__tests__/agiwork-plan.test.ts:257), but nothing writes the model plan into those rows and no client reads or shows dependencies.

**Not available**

- Dependency display on every app.
- Parallel indicator on mobile, VS Code, Chrome.

## 4. Required behaviour

**Established requirements**

- The task view lists its steps with an accurate per-step status. Brief: web, desktop, mobile, CLI, VS Code done; Chrome unverified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.14)
- The task view shows which steps depend on which. Brief: missing everywhere. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.15)
- While a task runs, the view marks which step is currently executing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.16)
- When the agent works on several things at once, the view shows the parallel work. Brief: web, desktop, CLI done; mobile, VS Code, Chrome missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.17)

**Acceptance criteria**

1. With a 4-step plan, step 1 shows In progress at start and the others Not started.
2. When the model writes 'Step 3:' steps 1 and 2 show Done and step 3 In progress.
3. On error the in-progress step shows Failed; on cancel Stopped.
4. Two or more read-only tool calls in one step show under a 'parallel' label on web.
5. Mobile run detail lists the same steps and statuses as the web Tasks detail for the same run.
6. Closing and reopening the run restores the step list from the journal.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- An accurate status should come from tool outcomes, not only from model text. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Write steps with dependsOn into work_plan_steps and show a 'waits for step N' hint on all surfaces.
- [proposed] Show parallel groups on mobile and VS Code.
- [proposed] Mark a step Done only on a verified result.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | advanceAgiWorkPlan, advanceAgiWorkPlanToStep, agiWorkPlanStepMarker | `apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts` | Status transitions and marker parsing (lines 165-216). |
| service | agiWorkPlanProgressEvents | `apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts` | Journal events for the plan (lines 284-306). |
| service | Plan advance on model text | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Moves the running step when a marker appears (lines 7016-7027). |
| service | Parallel read-only batch | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Concurrent read-only tools and parallel_group ids (lines 5400-5422, 5729). |
| component | ToolTimeline | `apps/web/features/chat/components/messages/ToolTimeline.tsx` | Groups tools by parallelGroup and shows 'parallel' (lines 261-264, 737-747). |
| component | AgentActivityTimeline | `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx` | Plan sentence and rows for Work (lines 805-830, 901-903). |
| component | TaskDetailPanel | `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx` | Plan section from the journal (lines 455-483, 647-660). |
| component | TasksPage | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | List and selection of runs with state badges. |
| service | runPresentation plan reader | `apps/mobile/src/features/tasks/runPresentation.ts` | Builds plan steps and labels from the journal (lines 300-330). |
| component | CloudRunDetailSheet | `apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx` | Mobile 'Plan · N' section. |
| service | cloudRunDetail items | `apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts` | VS Code Progress section from readCloudRunSteps (lines 70-84). |
| service | work-plan-service | `apps/web/lib/services/work-plan-service.ts` | Durable steps with dependsOn and revision validation (lines 31-36, 109-118). |
| table | work_plan_steps | `apps/web/db/neon/0237_work_plans.sql` | depends_on text[] column per step. |
| table | cloud_agent_events | `apps/web/lib/services/cloud-agent-run-service.ts` | Journal rows the clients read to rebuild the plan. |
| hook | useChatStream tool status parsing | `apps/web/lib/hooks/useChatStream.ts` | Reads x_tool_status parallel_group into timeline entries (lines 3487-3488). |
| service | observability work-plan signals | `apps/web/lib/observability` | Directory with work-plan-signals test (apps/web/lib/observability/__tests__/work-plan-signals.test.ts); implementation file not opened. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server holds the plan array in the tool loop, marks the first pending step in progress, emits snapshots. | our servers | tool-loop.ts:6287-6298; agiwork-plan.ts:165-178 |
| As the model streams text, the loop scans for 'Step N:' and advances the plan, emitting a new snapshot and journal events. | our servers | tool-loop.ts:7016-7027 |
| Read-only tool batches run concurrently and carry a parallel group id in tool status events. | our servers | tool-loop.ts:5400-5422 |
| Clients stream the events live, or poll the journal (every 2.5 s on web) after reconnecting, and render steps. | device and our servers | useChatStream.ts:1360-1364 (poll interval 2,500 ms) |
| At end of turn the server closes the plan (complete, fail, cancel, stop). | our servers | tool-loop.ts:5210-5230 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Plan steps and statuses | Stream frames, message metadata agiWorkPlan, journal progress events in cloud_agent_events | Yes | With the run and message |
| Dependencies | work_plan_steps.depends_on (never written by the run path) | Not applicable | Not applicable |

**Models and providers.** The model's own text decides the step marker, so progress quality varies by model. No model identifiers are written.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account that owns the run. |
| Permissions | Run owner and workspace rules; a member sees only their own runs (all queries filter by user id, cloud-agent-run-service.ts:1304). |
| Subscription | Same as Work (F060-01). No extra gate for viewing progress found. |
| Limits and metering | Journal polling rate limit: web polls at 2.5 s to stay under a per-minute limiter (useChatStream.ts:1356-1364). Journal truncation flag exists in the Tasks detail (TaskDetailPanel truncated prop). |
| Feature flags | Parallel grouping depends on the serving harness implementing parallelToolCalls (tool-loop.ts:5400-5404). |
| Model compatibility | Parallel batching needs a model that issues several tool calls in one step; marker progress needs a model that follows the 'Step N:' instruction. |
| Provider restrictions | None found in the code. |
| Local mode | No Work progress exists in Local mode because Work is Cloud only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Run stopped while a step is running | Mobile shows that step as Stopped when the run is no longer live. | CloudRunDetailSheet.tsx:~504-506 |
| Model never writes 'Step N:' | Step 1 stays In progress until the end, then all become Done. [inferred] | agiwork-plan.ts:207-224; tool-loop.ts:5217-5227 |
| Failure | The in-progress step becomes Failed and the rest stay Not started. | agiwork-plan.ts:186-189 (fail); test agiwork-plan.test.ts:79 |
| Empty plan | No plan section; plain activity rows. | tool-loop.ts:5217 (only when plan has steps) |
| Journal truncated or loading | Tasks detail has loading, error, refresh and truncated indicators. | TaskDetailPanel.tsx props loading, error, truncated, onRefresh |
| Reconnect | Web recovers an in-flight turn from the durable run (inFlightTurnRecovery). | apps/web/lib/hooks/inFlightTurnRecovery.ts (file exists; details not read) |
| Accessibility | Mobile step lines carry an accessibility label 'Step N, description, status'. | CloudRunDetailSheet.tsx:~509 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.test.ts`: Start marks only the first pending step; complete, fail transitions; SSE frame; journal only started steps.
- `packages/ui/unified-chat/src/components/__tests__/AgentActivityTimeline.agiWork.test.tsx`: Work plan rendering in the activity timeline (matched by search; assertions not read).
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.agiwork.test.tsx`: Tasks page Work runs (contents not opened).
- `apps/mobile/src/features/tasks/__tests__/runPresentation.test.ts`: Mobile run presentation (contents not opened).
- `apps/mobile/__tests__/AgiWorkPlanProgress.test.tsx`: Mobile plan progress (matched by search).
- `apps/web/lib/workflows/__tests__/agiwork-plan.test.ts`: Durable plan service, including refusing a step that depends on a missing step (line 257).
- `apps/web/lib/observability/__tests__/work-plan-signals.test.ts`: Work plan signals (contents not opened).

**Test scenarios**

- **Marker-driven progress**
  1. Run a 4-step Work task.
  2. Watch the step list as the model writes Step lines.
  - Expected: Earlier steps become Done, the current step In progress, matching what the agent is doing.
- **No markers**
  1. Use a model that ignores the instruction (or edit a test fixture).
  2. Run to the end.
  - Expected: Note whether progress stays on step 1 then jumps to all Done.
- **Parallel group**
  1. Ask for four independent searches in one step.
  2. Watch the tool timeline on web, then on mobile.
  - Expected: Web shows a 'parallel' group; mobile shows rows without grouping.
- **Reopen later**
  1. Close the browser mid-run, reopen Tasks, open the run.
  - Expected: Plan section rebuilds from the journal with current states.
- **Dependencies**
  1. Look for any dependency text in any task view.
  - Expected: None present.

**Where to look when it fails**

- Journal entries with progress ids agiwork:plan-overview and agiwork:plan:agiwork-plan-N.
- Stream frame x_agiwork_plan.
- tool status field parallel_group.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/060-agentic-work-product.md](../../70-qa/test-plans/web/060-agentic-work-product.md)
- Desktop: [70-qa/test-plans/desktop/060-agentic-work-product.md](../../70-qa/test-plans/desktop/060-agentic-work-product.md)
- Mobile: [70-qa/test-plans/mobile/060-agentic-work-product.md](../../70-qa/test-plans/mobile/060-agentic-work-product.md)
- CLI: [70-qa/test-plans/cli/060-agentic-work-product.md](../../70-qa/test-plans/cli/060-agentic-work-product.md)
- VS Code: [70-qa/test-plans/vscode/060-agentic-work-product.md](../../70-qa/test-plans/vscode/060-agentic-work-product.md)
- Chrome: [70-qa/test-plans/chrome/060-agentic-work-product.md](../../70-qa/test-plans/chrome/060-agentic-work-product.md)

## 10. Gaps and dependencies

- **Dependency display and storage are not connected.** Affects: All apps. Evidence: No writer of work_plan_steps outside tests (work-plan-steps.ts only opens the plan). Work needed: Write steps with dependencies; render them.
- **Step status is inferred from model text and from end-of-turn completion, not from verified outcomes.** Affects: All apps. Evidence: agiwork-plan.ts:207-216; tool-loop.ts:5217-5227. Work needed: Tie status to tool results or explicit step tools.
- **No parallel indicator on mobile, VS Code, Chrome.** Affects: Those apps. Evidence: CloudRunDetailSheet.tsx has no grouping; cloudRunDetail.ts lists flat progress. Work needed: Carry parallel_group into the run view.
- **Brief evidence lines for running step and parallel (tool-loop 4157, 4557, windowPolicy.ts:86) do not point at that code any more.** Affects: Engineers. Evidence: windowPolicy.ts:70-110 is link policy. Work needed: Update the brief.
- **CLI and Chrome step lists were not verified as Cloud Work views.** Affects: CLI, Chrome. Evidence: Not traced. Work needed: Trace and test.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-sync-and-continuity
- SYS-observability-and-operations
- SYS-shared-ui-and-design
- F060-04
- F060-06
- table:work_plan_steps
- table:cloud_agent_events

## Unknown

- Whether Chrome shows a step list or running step for Cloud Work.
- Whether the CLI shows Work plan steps (the terminal UI has none found).
- Exact assertions of the Tasks and timeline tests.
- How the ToolTimeline parallel label is announced to screen readers.
