---
id: "REQ-AREA-092"
type: "requirements"
title: "Requirement items: Tool-calling and agent-loop components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 92. Tool-calling and agent-loop components

30 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S92.01

**Tool registry.** One registry declares every platform tool with its risk properties (action class, reversibility, untrusted content, egress) and the loop consults it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-01 Tool list, risk labels and tool search](../../20-features/092-tool-calling-and-agent-loop-components/F092-01-tool-list-risk-labels-and-tool-search.md)

## S92.02

**Tool discovery/search.** When many tools are connected, a selector picks the relevant schemas per turn and the rest stay discoverable.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-01 Tool list, risk labels and tool search](../../20-features/092-tool-calling-and-agent-loop-components/F092-01-tool-list-risk-labels-and-tool-search.md)
- Competitor trace: CAP-tools-and-code-execution-15

## S92.03

**Tool schema loader.** Deferred tool schemas are loaded on demand into the next step when the model asks for them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-01 Tool list, risk labels and tool search](../../20-features/092-tool-calling-and-agent-loop-components/F092-01-tool-list-risk-labels-and-tool-search.md)
- Competitor trace: CAP-tools-and-code-execution-15

## S92.04

**Tool argument validator.** Every tool call's arguments are validated against the tool's declared schema before execution, and invalid calls are rejected with a reason.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-02 Checking tool arguments and reading tool calls](../../20-features/092-tool-calling-and-agent-loop-components/F092-02-checking-tool-arguments-and-reading-tool-calls.md)

## S92.05

**Tool-call parser.** Streamed and stored tool calls from any provider are parsed into one internal call shape (id, name, arguments).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-02 Checking tool arguments and reading tool calls](../../20-features/092-tool-calling-and-agent-loop-components/F092-02-checking-tool-arguments-and-reading-tool-calls.md)
- Competitor trace: CAP-tools-and-code-execution-23

## S92.06

**Tool executor dispatcher.** A single dispatcher routes each call to its executor (search, fetch, sandbox, office, skills, connectors, device steps, caller-owned).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-03 Running tools in a turn](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)

## S92.07

**Tool result normalizer.** Tool outputs are normalized into a bounded, redacted result with an error flag before they reach the model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-03 Running tools in a turn](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)
- Competitor trace: CAP-tools-and-code-execution-23, CAP-tools-and-code-execution-24

## S92.08

**Tool-result storage.** Tool calls and their results are stored durably with the run so a paused or resumed turn and the transcript can read them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-07 Durable runs and recovery](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md)

## S92.09

**Large-result reference service.** Oversized tool results are stored once and referenced by id, so the model and user can fetch the full result later.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-04 Large tool results](../../20-features/092-tool-calling-and-agent-loop-components/F092-04-large-tool-results.md)
- Competitor trace: CAP-tools-and-code-execution-24

## S92.10

**Multi-round model/tool loop.** The runtime loops model call → tool calls → results → model until done, within step and time limits.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-03 Running tools in a turn](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)
- Competitor trace: CAP-tools-and-code-execution-26

## S92.11

**Parallel tool scheduler.** Independent, parallel-safe tool calls in one step run concurrently; unsafe ones run one at a time.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-03 Running tools in a turn](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)
- Competitor trace: CAP-tools-and-code-execution-26

## S92.12

**Dependency-aware execution.** Calls whose inputs depend on other calls' outputs are ordered or scheduled by those dependencies.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-03 Running tools in a turn](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)

## S92.13

**Approval-policy evaluator.** A policy evaluator decides allow/ask/deny for every tool call from the account policy, saved per-tool levels and the lethal-trifecta rule, on every path that runs tools.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-05 Approvals and pauses](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Competitor trace: CAP-tools-and-code-execution-12, CAP-tools-and-code-execution-13, CAP-tools-and-code-execution-14

## S92.14

**Approval-request store.** Pending approval requests are persisted with the exact calls, messages and request so any device can answer them later.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-05 Approvals and pauses](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Competitor trace: CAP-tools-and-code-execution-12

## S92.15

**Approval-decision store.** Each approval decision is recorded (per call, with outcome) and the checkpoint is resolved exactly once.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-05 Approvals and pauses](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Competitor trace: CAP-tools-and-code-execution-12

## S92.16

**Action-binding validator.** A decision only applies to the exact pending calls it was made for; mismatched or stale decisions are refused and resumed calls use the stored arguments.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-05 Approvals and pauses](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Competitor trace: CAP-tools-and-code-execution-12

## S92.17

**Action-receipt store.** Every tool action leaves a durable receipt (who, which tool, when, outcome) the user can later read.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-06 Receipts, retries and outcome checks](../../20-features/092-tool-calling-and-agent-loop-components/F092-06-receipts-retries-and-outcome-checks.md)
- Competitor trace: CAP-tools-and-code-execution-25

## S92.18

**Idempotency manager.** Retry-unsafe tool calls are remembered by an idempotency key so a retried step does not run them twice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-06 Receipts, retries and outcome checks](../../20-features/092-tool-calling-and-agent-loop-components/F092-06-receipts-retries-and-outcome-checks.md)
- Competitor trace: CAP-tools-and-code-execution-24

## S92.19

**External-outcome reconciliation.** When an external action's outcome is unknown (timeout, crash), the runtime checks the external system and records the real outcome before retrying or reporting.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-06 Receipts, retries and outcome checks](../../20-features/092-tool-calling-and-agent-loop-components/F092-06-receipts-retries-and-outcome-checks.md)

## S92.20

**Cancellation coordinator.** Cancelling a run stops the model stream and in-flight tools and settles the run as cancelled.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-03 Running tools in a turn](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)
- Competitor trace: CAP-editing-regeneration-and-branching-11, CAP-tools-and-code-execution-26

## S92.21

**Agent definition store.** Agent definitions (name, instructions, tools, model) are stored and can be run by the runtime.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-10 Agent definitions and subagents](../../20-features/092-tool-calling-and-agent-loop-components/F092-10-agent-definitions-and-subagents.md)

## S92.22

**Agent runtime.** A durable agent runtime runs turns as tracked runs (state, events, leases) that survive a dropped connection.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-07 Durable runs and recovery](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md)
- Competitor trace: CAP-tools-and-code-execution-26

## S92.23

**Plan/step store.** Agent plans and their steps are persisted and updated as the run progresses.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-07 Durable runs and recovery](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md)

## S92.24

**Subagent coordinator.** A coordinator spawns subagents for sub-tasks, bounds their depth and fan-out, and merges their results.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-10 Agent definitions and subagents](../../20-features/092-tool-calling-and-agent-loop-components/F092-10-agent-definitions-and-subagents.md)

## S92.25

**Checkpoint store.** A run can checkpoint its state (messages, pending calls, request) and resume from it later.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-07 Durable runs and recovery](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md)
- Competitor trace: CAP-editing-regeneration-and-branching-16

## S92.26

**Completion-condition evaluator.** One evaluator decides whether a turn finished, came back empty, was blocked, cancelled or cut off, for every path that persists a turn.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-03 Running tools in a turn](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)

## S92.27

**Human-input queue.** Requests for human input (approvals, questions, connector input) queue durably and the run resumes when answered.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-05 Approvals and pauses](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)

## S92.28

**Per-task budget manager.** Each run has a budget (steps, time, spend) that is reserved up front and enforced before every operation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-08 Budgets and loop limits](../../20-features/092-tool-calling-and-agent-loop-components/F092-08-budgets-and-loop-limits.md)
- Competitor trace: CAP-tools-and-code-execution-26, CAP-tools-and-code-execution-28

## S92.29

**Durable task scheduler.** A durable scheduler starts scheduled agent runs on time and runs them to completion unattended.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-09 Scheduled unattended runs](../../20-features/092-tool-calling-and-agent-loop-components/F092-09-scheduled-unattended-runs.md)

## S92.30

**Runtime recovery manager.** Runs interrupted by a crash or dropped connection are recovered: resumed by the durable workflow or settled so they do not hang.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F092-07 Durable runs and recovery](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md)
- Competitor trace: CAP-tools-and-code-execution-26
