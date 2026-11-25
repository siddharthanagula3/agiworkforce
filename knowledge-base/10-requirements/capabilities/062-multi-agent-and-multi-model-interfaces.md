---
id: "REQ-AREA-062"
type: "requirements"
title: "Requirement items: Multi-agent and multi-model interfaces"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 62. Multi-agent and multi-model interfaces

28 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S62.01

**Parent task.** A parent task visibly owns child agents it spawned, and the user can see that relationship.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F062-01 Parent task and child agent list](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md)
- Competitor trace: CAP-agent-actions-06

## S62.02

**Child-agent list.** The user sees a list of the child agents working under a task.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F062-01 Parent task and child agent list](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md)
- Competitor trace: CAP-agent-actions-06

## S62.03

**Role labels.** Each child agent is labelled with its role.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F062-01 Parent task and child agent list](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md)
- Competitor trace: CAP-agent-actions-06

## S62.04

**Model labels.** Each participating agent or model is labelled with the model it runs on.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F062-02 Per-agent status, model and result](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md)

## S62.05

**Per-agent status.** The view shows the live status of each participating agent or model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F062-02 Per-agent status, model and result](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md)

## S62.06

**Per-agent transcript.** The user can read each participating agent's own transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F062-03 Per-agent transcript and drill-down](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-03-per-agent-transcript-and-drill-down.md)

## S62.07

**Per-agent result.** Each participating agent's result is shown separately.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F062-02 Per-agent status, model and result](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md)

## S62.08

**Per-agent usage.** The user sees usage or cost per participating agent or model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, CLI done, VS Code missing, Chrome missing
- Feature: [F062-02 Per-agent status, model and result](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md)
- Competitor trace: CAP-agent-actions-06

## S62.09

**Concurrent task view.** The user can watch several running tasks or agents at once in one view.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F062-04 Concurrent task overview with needs-input first](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-04-concurrent-task-overview-with-needs-input-first.md)

## S62.10

**Needs-input prioritization.** Tasks or agents that need the user's input are surfaced first.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome unverified
- Feature: [F062-04 Concurrent task overview with needs-input first](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-04-concurrent-task-overview-with-needs-input-first.md)

## S62.11

**Inline unblock response.** The user can unblock a waiting task or agent inline without leaving the overview.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F062-04 Concurrent task overview with needs-input first](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-04-concurrent-task-overview-with-needs-input-first.md)

## S62.12

**Full-transcript drill-down.** From an overview the user can drill into the full transcript of a task.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome unverified
- Feature: [F062-03 Per-agent transcript and drill-down](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-03-per-agent-transcript-and-drill-down.md)

## S62.13

**Shared-workspace versus isolated-workspace indicator.** The view shows whether agents share one workspace or work in isolated ones.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F062-05 Workspace sharing indicator](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-05-workspace-sharing-indicator.md)

## S62.14

**Agent handoff.** Work can be handed from one agent to another, and the receiving agent continues it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code done, Chrome missing
- Feature: [F062-06 Agent handoff with summary](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-06-agent-handoff-with-summary.md)

## S62.15

**Summary-only handoff.** A handoff can pass only a summary, not the full history, and the user can see that.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F062-06 Agent handoff with summary](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-06-agent-handoff-with-summary.md)

## S62.16

**Background fork.** The user can fork a side task that runs in the background without disturbing the main one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F062-07 Background fork and conversation branch](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Competitor trace: CAP-editing-regeneration-and-branching-17, CAP-agent-actions-06

## S62.17

**Interactive branch.** The user can branch the conversation from a point and continue interactively in the branch.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F062-07 Background fork and conversation branch](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Competitor trace: CAP-editing-regeneration-and-branching-09, CAP-editing-regeneration-and-branching-17

## S62.18

**Advisor consultation.** The user or agent can consult an advisor model on a side question and see its answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F062-08 Advisor consultation](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-08-advisor-consultation.md)

## S62.19

**Model-comparison view.** The user can open a view that runs one prompt on several models side by side.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F062-09 Side-by-side model comparison](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-09-side-by-side-model-comparison.md)

## S62.20

**Independent parallel answers.** Each model answers the same prompt independently and in parallel.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F062-09 Side-by-side model comparison](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-09-side-by-side-model-comparison.md)

## S62.21

**Synthesis answer.** After parallel answers, the product produces one synthesized answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F062-10 Synthesis, agreement and unique findings](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-10-synthesis-agreement-and-unique-findings.md)

## S62.22

**Agreement and disagreement display.** The comparison highlights where models agree and disagree.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F062-10 Synthesis, agreement and unique findings](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-10-synthesis-agreement-and-unique-findings.md)

## S62.23

**Unique findings per model.** The comparison lists findings unique to each model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F062-10 Synthesis, agreement and unique findings](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-10-synthesis-agreement-and-unique-findings.md)

## S62.24

**Combined-source inspection.** The user can inspect the combined sources all participants used.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F062-11 Comparison sources, cost, rerun and save](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-11-comparison-sources-cost-rerun-and-save.md)

## S62.25

**Comparison-cost estimate.** Before running a comparison the user sees its estimated cost.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F062-11 Comparison sources, cost, rerun and save](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-11-comparison-sources-cost-rerun-and-save.md)

## S62.26

**Selected model set.** The user chooses which set of models takes part in the comparison.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F062-09 Side-by-side model comparison](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-09-side-by-side-model-comparison.md)

## S62.27

**Rerun one participant.** The user can rerun a single participant without rerunning the whole comparison.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F062-11 Comparison sources, cost, rerun and save](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-11-comparison-sources-cost-rerun-and-save.md)

## S62.28

**Save comparison.** The user can save a comparison and reopen it later.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F062-11 Comparison sources, cost, rerun and save](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-11-comparison-sources-cost-rerun-and-save.md)
