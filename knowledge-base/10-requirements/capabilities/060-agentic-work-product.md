---
id: "REQ-AREA-060"
type: "requirements"
title: "Requirement items: Agentic work product"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 60. Agentic work product

34 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S60.01

**Work-task composer.** The user can open a dedicated entry to describe and start an agentic work task (not a plain chat turn) and it starts a real agent run.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F060-01 Start a task from a goal](../../20-features/060-agentic-work-product/F060-01-start-a-task-from-a-goal.md)
- Competitor trace: CAP-agent-actions-01

## S60.02

**Task title.** Each work task shows a readable title in the task list, and the user can set or change it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F060-11 Task list, history, sharing and handoff](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)
- Competitor trace: CAP-agent-actions-01

## S60.03

**Objective.** The user states the objective of the task, and the objective is stored with the run and shown back.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F060-01 Start a task from a goal](../../20-features/060-agentic-work-product/F060-01-start-a-task-from-a-goal.md)
- Competitor trace: CAP-agent-actions-01

## S60.04

**Deliverable selection.** The user can specify what deliverable the task should produce (e.g. a report or file) and the run receives it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F060-01 Start a task from a goal](../../20-features/060-agentic-work-product/F060-01-start-a-task-from-a-goal.md)

## S60.05

**Source selection.** While composing a task the user can choose which sources it may use (project, files, connectors).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome missing
- Feature: [F060-02 Choose sources, tools, place, model and effort](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md)

## S60.06

**Tool selection.** The user can choose which tools the task may use before it runs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F060-02 Choose sources, tools, place, model and effort](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md)

## S60.07

**Execution-location selection.** The user can choose where the task executes (cloud sandbox versus this computer or another device).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F060-02 Choose sources, tools, place, model and effort](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md)
- Competitor trace: CAP-agent-actions-05

## S60.08

**Model/profile selection.** The user can pick the model (or profile) the task runs on, and the run records it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome missing
- Feature: [F060-02 Choose sources, tools, place, model and effort](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md)

## S60.09

**Effort selection.** The user can set reasoning effort for the task and it is sent with the run.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome missing
- Feature: [F060-02 Choose sources, tools, place, model and effort](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md)

## S60.10

**Spend budget.** The user can cap how much a task may spend, and the run stops at the cap.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F060-03 Spend, time and completion limits](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md)
- Competitor trace: CAP-agent-actions-28

## S60.11

**Time budget.** The user can set how long a task may run, and the run stops when time is up.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F060-03 Spend, time and completion limits](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md)
- Competitor trace: CAP-agent-actions-07

## S60.12

**Completion condition.** The user can state an explicit completion condition that the agent checks before it finishes.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F060-03 Spend, time and completion limits](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md)
- Competitor trace: CAP-agent-actions-07

## S60.13

**Reviewable task plan.** Before the agent acts, the user sees its plan and can approve, edit or reject it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F060-04 Review the plan before it acts](../../20-features/060-agentic-work-product/F060-04-review-the-plan-before-it-acts.md)
- Competitor trace: CAP-agent-actions-02

## S60.14

**Step list.** The task view lists its steps with an accurate per-step status.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F060-05 Follow progress](../../20-features/060-agentic-work-product/F060-05-follow-progress.md)
- Competitor trace: CAP-agent-actions-03

## S60.15

**Dependency display.** The task view shows which steps depend on which.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F060-05 Follow progress](../../20-features/060-agentic-work-product/F060-05-follow-progress.md)

## S60.16

**Running-step indicator.** While a task runs, the view marks which step is currently executing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F060-05 Follow progress](../../20-features/060-agentic-work-product/F060-05-follow-progress.md)
- Competitor trace: CAP-agent-actions-03

## S60.17

**Parallel-work indicator.** When the agent works on several things at once, the view shows the parallel work.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F060-05 Follow progress](../../20-features/060-agentic-work-product/F060-05-follow-progress.md)
- Competitor trace: CAP-agent-actions-06

## S60.18

**Clarification request.** The agent can pause a task to ask the user a clarifying question and continue with the answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Feature: [F060-06 Answer questions and approvals](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md)
- Competitor trace: CAP-agent-actions-02

## S60.19

**Approval request.** When the agent needs permission for an action, the task pauses and the user can approve or deny it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F060-06 Answer questions and approvals](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md)
- Competitor trace: CAP-agent-actions-02, CAP-agent-actions-14

## S60.20

**Task steering.** The user can redirect a running task with new guidance without starting over.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F060-07 Steer, pause, resume and stop](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Competitor trace: CAP-editing-regeneration-and-branching-14, CAP-editing-regeneration-and-branching-15, CAP-agent-actions-03

## S60.21

**Pause.** The user can pause a running task at a step boundary and it keeps its work.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F060-07 Steer, pause, resume and stop](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Competitor trace: CAP-agent-actions-03

## S60.22

**Resume.** The user can resume a paused or stopped task from where it left off.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F060-07 Steer, pause, resume and stop](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Competitor trace: CAP-agent-actions-03

## S60.23

**Cancel.** The user can stop a running task and the run is cancelled on the server.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F060-07 Steer, pause, resume and stop](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Competitor trace: CAP-editing-regeneration-and-branching-15, CAP-agent-actions-03

## S60.24

**Retry failed step.** After a step fails, the user can retry just that step and the task continues.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F060-08 Retry, restart and duplicate](../../20-features/060-agentic-work-product/F060-08-retry-restart-and-duplicate.md)
- Competitor trace: CAP-agent-actions-03

## S60.25

**Restart task.** The user can restart a finished task with the same inputs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code done, Chrome missing
- Feature: [F060-08 Retry, restart and duplicate](../../20-features/060-agentic-work-product/F060-08-retry-restart-and-duplicate.md)

## S60.26

**Duplicate task.** The user can duplicate a task into a new editable task.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F060-08 Retry, restart and duplicate](../../20-features/060-agentic-work-product/F060-08-retry-restart-and-duplicate.md)

## S60.27

**Save as routine.** From a task the user can save it as a routine/schedule that reruns it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F060-09 Save a task as a routine or a skill](../../20-features/060-agentic-work-product/F060-09-save-a-task-as-a-routine-or-a-skill.md)

## S60.28

**Save as Skill.** From a finished task the user can save its procedure as a reusable Skill.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F060-09 Save a task as a routine or a skill](../../20-features/060-agentic-work-product/F060-09-save-a-task-as-a-routine-or-a-skill.md)

## S60.29

**Results summary.** When a task ends the user sees a summary of the result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F060-10 Results, deliverables and partial outcome](../../20-features/060-agentic-work-product/F060-10-results-deliverables-and-partial-outcome.md)
- Competitor trace: CAP-agent-actions-01

## S60.30

**Generated deliverables.** Files the task produced are listed and can be opened or downloaded.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F060-10 Results, deliverables and partial outcome](../../20-features/060-agentic-work-product/F060-10-results-deliverables-and-partial-outcome.md)
- Competitor trace: CAP-agent-actions-01

## S60.31

**Partial-outcome summary.** When a task stops short, the user sees what was done and what remains.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome unverified
- Feature: [F060-10 Results, deliverables and partial outcome](../../20-features/060-agentic-work-product/F060-10-results-deliverables-and-partial-outcome.md)

## S60.32

**Task history.** The user can browse past tasks with their state and open any of them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F060-11 Task list, history, sharing and handoff](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)
- Competitor trace: CAP-agent-actions-01

## S60.33

**Task sharing.** The user can share a task (its plan, steps and results) with someone else.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F060-11 Task list, history, sharing and handoff](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)

## S60.34

**Cross-device task continuation.** A task started on one device can be followed and acted on from another device.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F060-11 Task list, history, sharing and handoff](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)
- Competitor trace: CAP-agent-actions-04
