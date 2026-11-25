# Area 92. Tool-calling and agent-loop components

30 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S92.01 Tool registry.
- Should: One registry declares every platform tool with its risk properties (action class, reversibility, untrusted content, egress) and the loop consults it.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:105; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:339; crates/agiworkforce-protocol/src/tool_primitive.rs:58

## S92.02 Tool discovery/search.
- Should: When many tools are connected, a selector picks the relevant schemas per turn and the rest stay discoverable.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:95; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2690

## S92.03 Tool schema loader.
- Should: Deferred tool schemas are loaded on demand into the next step when the model asks for them.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:144; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2704

## S92.04 Tool argument validator.
- Should: Every tool call's arguments are validated against the tool's declared schema before execution, and invalid calls are rejected with a reason.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-argument-validation.ts:76; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2835; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4178

## S92.05 Tool-call parser.
- Should: Streamed and stored tool calls from any provider are parsed into one internal call shape (id, name, arguments).
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1717; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2197

## S92.06 Tool executor dispatcher.
- Should: A single dispatcher routes each call to its executor (search, fetch, sandbox, office, skills, connectors, device steps, caller-owned).
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1868; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2005; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5089

## S92.07 Tool result normalizer.
- Should: Tool outputs are normalized into a bounded, redacted result with an error flag before they reach the model.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2516; apps/web/lib/e2b/execution-tools.ts:261; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2099

## S92.08 Tool-result storage.
- Should: Tool calls and their results are stored durably with the run so a paused or resumed turn and the transcript can read them.
- Status: platform done
- Code: apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:16; apps/web/db/neon/0061_cloud_agent_runs.sql:35; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3207

## S92.09 Large-result reference service.
- Should: Oversized tool results are stored once and referenced by id, so the model and user can fetch the full result later.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:57; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2176; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3087; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4233

## S92.10 Multi-round model/tool loop.
- Should: The runtime loops model call → tool calls → results → model until done, within step and time limits.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2614; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:681; crates/agiworkforce-agent-core/src/engine.rs:46

## S92.11 Parallel tool scheduler.
- Should: Independent, parallel-safe tool calls in one step run concurrently; unsafe ones run one at a time.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3947; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:307

## S92.12 Dependency-aware execution.
- Should: Calls whose inputs depend on other calls' outputs are ordered or scheduled by those dependencies.
- Status: not applicable anywhere

## S92.13 Approval-policy evaluator.
- Should: A policy evaluator decides allow/ask/deny for every tool call from the account policy, saved per-tool levels and the lethal-trifecta rule, on every path that runs tools.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2578; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1605; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3731; apps/web/lib/voice/live-voice-tools.ts:226; apps/web/lib/services/scheduled-agent-executor.ts:222

## S92.14 Approval-request store.
- Should: Pending approval requests are persisted with the exact calls, messages and request so any device can answer them later.
- Status: platform done
- Code: apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:8; apps/web/lib/services/cloud-agent-run-service.ts:1389

## S92.15 Approval-decision store.
- Should: Each approval decision is recorded (per call, with outcome) and the checkpoint is resolved exactly once.
- Status: platform done
- Code: apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:22; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4494; apps/web/lib/services/cloud-agent-run-service.ts:1448

## S92.16 Action-binding validator.
- Should: A decision only applies to the exact pending calls it was made for; mismatched or stale decisions are refused and resumed calls use the stored arguments.
- Status: platform done
- Code: apps/web/lib/services/cloud-agent-run-service.ts:1439; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4492

## S92.17 Action-receipt store.
- Should: Every tool action leaves a durable receipt (who, which tool, when, outcome) the user can later read.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2586; apps/web/db/neon/0223_connector_call_events.sql:32; apps/web/app/api/connectors/calls/route.ts:33

## S92.18 Idempotency manager.
- Should: Retry-unsafe tool calls are remembered by an idempotency key so a retried step does not run them twice.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-idempotency.ts:119; apps/web/app/api/llm/v1/chat/completions/lib/tool-idempotency.ts:17

## S92.19 External-outcome reconciliation.
- Should: When an external action's outcome is unknown (timeout, crash), the runtime checks the external system and records the real outcome before retrying or reporting.
- Status: platform done
- Code: apps/web/lib/github-app.ts:865; apps/web/lib/user-connector-tools.ts:406; apps/web/lib/user-connector-tools.ts:491; apps/web/lib/user-connector-tools.ts:512

## S92.20 Cancellation coordinator.
- Should: Cancelling a run stops the model stream and in-flight tools and settles the run as cancelled.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2830; crates/agiworkforce-agent-core/src/engine.rs:22

## S92.21 Agent definition store.
- Should: Agent definitions (name, instructions, tools, model) are stored and can be run by the runtime.
- Status: platform partial
- Code: apps/cli/src/agents.rs:331; apps/web/app/api/agents/execute/route.ts:8
- Unfinished: platform: Named agents exist only as local files in the CLI (.agi/agents); the hosted platform has no agent definition store, and the legacy /api/agents/execute route answers "retired".

## S92.22 Agent runtime.
- Should: A durable agent runtime runs turns as tracked runs (state, events, leases) that survive a dropped connection.
- Status: platform done
- Code: apps/web/db/neon/0061_cloud_agent_runs.sql:9; apps/web/app/api/llm/v1/chat/completions/route.ts:862; apps/web/lib/workflows/durable-initial-turns.ts:7

## S92.23 Plan/step store.
- Should: Agent plans and their steps are persisted and updated as the run progresses.
- Status: platform done
- Code: apps/web/db/neon/0237_work_plans.sql:78; apps/web/lib/workflows/steps/work-plan-steps.ts:17; apps/web/lib/workflows/cloud-agent-workflow.ts:10

## S92.24 Subagent coordinator.
- Should: A coordinator spawns subagents for sub-tasks, bounds their depth and fan-out, and merges their results.
- Status: not applicable anywhere

## S92.25 Checkpoint store.
- Should: A run can checkpoint its state (messages, pending calls, request) and resume from it later.
- Status: platform done
- Code: apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:14; apps/web/app/api/llm/v1/chat/completions/lib/approval-checkpoint-request.ts:3

## S92.26 Completion-condition evaluator.
- Should: One evaluator decides whether a turn finished, came back empty, was blocked, cancelled or cut off, for every path that persists a turn.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2399; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2459; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2468

## S92.27 Human-input queue.
- Should: Requests for human input (approvals, questions, connector input) queue durably and the run resumes when answered.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:792; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5040; apps/web/lib/services/cloud-agent-run-service.ts:1606; apps/web/app/api/llm/v1/chat/completions/resume-input/route.ts:210; apps/web/features/chat/components/messages/MessageBubble.tsx:958; apps/web/lib/hooks/useChatStream.ts:4796

## S92.28 Per-task budget manager.
- Should: Each run has a budget (steps, time, spend) that is reserved up front and enforced before every operation.
- Status: platform done
- Code: apps/web/lib/services/cloud-agent-budget.ts:275; apps/web/db/neon/0258_cloud_agent_run_budgets.sql:35; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:681

## S92.29 Durable task scheduler.
- Should: A durable scheduler starts scheduled agent runs on time and runs them to completion unattended.
- Status: platform done
- Code: apps/web/app/api/cron/run-schedules/route.ts:10; apps/web/lib/services/scheduled-agent-executor.ts:305; packages/platform/context-engine/src/manifest-store.ts:56

## S92.30 Runtime recovery manager.
- Should: Runs interrupted by a crash or dropped connection are recovered: resumed by the durable workflow or settled so they do not hang.
- Status: platform done
- Code: apps/web/lib/services/cloud-agent-run-reaper.ts:90; apps/web/app/api/cron/reap-agent-runs/route.ts:19; apps/web/app/api/llm/v1/chat/completions/route.ts:862
