---
id: "F092-07"
type: "feature"
title: "Durable runs and recovery"
aliases: ["Durable runs and recovery", "Cloud agent run journal", "cloud_agent_runs", "durable initial turns", "Workflow transport", "run reaper", "reap-agent-runs", "S92.08 tool-result storage", "S92.22 agent runtime", "S92.23 plan/step store", "S92.25 checkpoint store", "S92.30 runtime recovery manager"]
area: "92 Tool-calling and agent-loop components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S92.08", "S92.22", "S92.23", "S92.25", "S92.30"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "surface:vscode", "mode:cloud", "table:cloud_agent_runs", "table:cloud_agent_events", "table:cloud_agent_approval_checkpoints", "table:cloud_agent_execution_operations", "table:work_plans", "api:GET /api/cron/reap-agent-runs", "api:GET /api/llm/v1/chat/completions/runs/{runId}", "F092-08", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-sync-and-continuity", "SYS-observability-and-operations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F092-07 Durable runs and recovery

On our servers, each Cloud agent turn is saved as a run with its ordered events, tool and model results, approval checkpoints and (in Work mode) a plan. The turn runs in a durable workflow, so it can outlive the connection. A sweep every 15 minutes ends runs whose worker has gone, marking them failed or cancelled with a reason.

Area: [92. Tool-calling and agent-loop components](README.md). Requirement items: [S92.08](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9208), [S92.22](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9222), [S92.23](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9223), [S92.25](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9225), [S92.30](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9230).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps the state of a Managed Cloud agent turn on the server instead of in the open request. It stores the run row (state, model, last event number, cancel request), every event in order, a receipt for each model call and tool call (including its result), versioned approval checkpoints that hold messages and pending tool calls, and a Work plan row. A reaper then settles runs that nothing is driving any more. (apps/web/db/neon/0061_cloud_agent_runs.sql:9-39; apps/web/db/neon/0063_cloud_agent_execution_operations.sql:19-39; apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:9-35; apps/web/lib/services/cloud-agent-run-reaper.ts:90)

**Why it exists.** A long agent task must not die when a tab closes, a phone loses signal or a server invocation ends. Events are stored by sequence number so Web, Desktop and Mobile can reconnect and replay the same activity. (apps/web/db/neon/0061_cloud_agent_runs.sql:1-7) Operation receipts stop a retried step from repeating a paid or changing action. (apps/web/db/neon/0063_cloud_agent_execution_operations.sql:1-7)

**Who uses it.** A person using Cloud (managed) agent turns in chat or Work mode on the web app, and the other apps that follow a run through the shared run client. Engineers and support read the tables when a run looks stuck. (packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:528; apps/web/lib/hooks/useChatStream.ts:3095)

**Problems it solves**

- A closed tab or dropped connection does not end the turn: the durable workflow keeps running and the client can follow it again from the last event number it saw (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:50-58).
- A crash leaves a run in a live state; the reaper moves it to failed (or cancelled if the person had asked to stop) and writes an error event saying why (apps/web/lib/services/cloud-agent-run-reaper.ts:110-125, 56-70).
- A retried step does not repeat a model or tool call because a completed operation replays its stored result (apps/web/lib/workflows/cloud-agent-operation-executor.ts:304-307).
- A tool that was waiting for approval can resume later from a saved checkpoint (apps/web/lib/services/cloud-agent-run-service.ts:1416).

**Use cases**

- Start a long Work task, close the tab, return later and see the run's events replayed.
- A server invocation ends mid-turn; about 18 minutes later the reaper settles the run so the conversation is no longer blocked.
- A turn pauses for tool approval and resumes from the stored checkpoint within the 24 hour window.
- An engineer looks up a stuck run in cloud_agent_runs and its operations to see the last step.

## 2. User experience

**Where to find it**

- No screen of its own. It sits behind chat and Work turns in the web app; the reconnect state shows as a stream phase named 'reconnecting' in the web chat code (apps/web/lib/hooks/useChatStream.ts:3095).
- Run follow code exists in Desktop (apps/desktop/src/runtime/CloudRuntime.ts:700), Mobile (apps/mobile/services/streaming.ts:478), the Chrome extension (apps/extension/src/features/cloud-bridge/managedRunControl.ts:435) and the VS Code extension (apps/extension-vscode/src/features/cloud-tasks/cloudRunClient.ts, matched by search, not read).
- CLI: not found. The CLI has no call to the hosted run endpoint (search for completions/runs in apps/cli/src found nothing).

**Before you start**

- A Cloud (managed) turn that carries a managed-usage or free-trial reservation. A turn with neither cannot start durably and runs request-scoped (apps/web/lib/workflows/cloud-agent-workflow-input.ts:560-611; apps/web/app/api/llm/v1/chat/completions/route.ts:1001-1018).
- The kill switch AGI_DURABLE_INITIAL_TURNS must not be set to 0, false or off (apps/web/lib/workflows/durable-initial-turns.ts:5-19).

**Screens and controls**

- Stop control: sets cancellation_requested_at on the run (apps/web/lib/services/cloud-agent-run-service.ts:1174).
- Pause and resume of a run are served by sub-routes of the run endpoint (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/pause, /resume, /steer, /archive: directory listing).

**Journey**

1. 1. The person sends an agent turn; the server creates the run row keyed by the request idempotency key (apps/web/app/api/llm/v1/chat/completions/route.ts:899-901; apps/web/db/neon/0061_cloud_agent_runs.sql:23-25).
2. 2. The server starts the durable workflow and waits for its first event; if that fails it falls back to a request-scoped stream (route.ts:946-1018).
3. 3. In Work mode a plan row is opened first (apps/web/lib/workflows/cloud-agent-workflow.ts:74-76).
4. 4. Each model call and tool call is claimed, run and stored as an operation receipt; events are appended in order (apps/web/lib/workflows/cloud-agent-operation-executor.ts:238-338).
5. 5. If the connection drops, the client calls the run endpoint with the last event number and replays what it missed (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:50-58).
6. 6. If the turn needs approval, a checkpoint is saved and the run waits; the workflow continues in a new invocation when a turn passes the invocation limit (apps/web/lib/workflows/cloud-agent-workflow.ts:81-85).
7. 7. At the end the run is settled and the stream closed; if the worker died, the reaper settles it (apps/web/lib/services/cloud-agent-run-reaper.ts:90).

**What the person sees and gets**

- Replayed events in the chat or task view.
- On an orphaned run the person sees: 'This turn did not finish: the run working on it ended before it could report back.' with code run_abandoned and retryable true (apps/web/lib/services/cloud-agent-run-reaper.ts:32-33; apps/web/lib/services/cloud-agent-run-termination.ts:12, 38-45).
- If the person had asked to stop: 'You stopped this turn, and the run working on it ended before it could report back.' (cloud-agent-run-reaper.ts:34-35).
- Response headers X-AGI-Tool-Loop: durable and X-AGI-Workflow-Run-Id (route.ts:983-984).

**Settings**

- AGI_DURABLE_INITIAL_TURNS (kill switch; durable on unless set off) (apps/web/lib/workflows/durable-initial-turns.ts:5)
- AGI_DB_LOW_POWER (sweep skipped outside the first 15 minutes of each hour) (apps/web/lib/server/cron-low-power.ts:5-18)
- No user-facing setting found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Run and event journal with per-user isolation (row level security) (apps/web/db/neon/0061_cloud_agent_runs.sql:56-70).
- Operation receipts with leases, replay limit of 5 and result storage (apps/web/db/neon/0063_cloud_agent_execution_operations.sql:19-39; apps/web/lib/services/cloud-agent-execution-service.ts:25).
- Versioned approval checkpoints holding request, messages and 1 to 32 pending calls, claimed once under a lease; 24 hour expiry constant (apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:19-34; apps/web/lib/services/cloud-agent-run-service.ts:457).
- Durable workflow loop that continues in new invocations until the turn settles (apps/web/lib/workflows/cloud-agent-workflow.ts:77-91).
- Reaper: runs in states queued, planning, running, resuming idle for 1100 seconds (800 s invocation limit + 300 s lease) go to failed, or cancelled if a stop was requested; also cancels the workflow run; batches of 200, up to 25 batches, 240 s budget (apps/web/lib/services/cloud-agent-run-reaper.ts:13-18, 28, 110-125; apps/web/lib/deadline-policy.ts:16; apps/web/lib/services/cloud-agent-execution-service.ts:23).
- Cron route with secret check, scheduled at minutes 10, 25, 40, 55 of each hour (apps/web/app/api/cron/reap-agent-runs/route.ts:13-31; vercel.json:70-71).
- Work plan row opened for Work mode runs and settled at the end (apps/web/lib/workflows/steps/work-plan-steps.ts:18-65).

**Incomplete**

- Plan steps are not written during the run. The workflow opens the plan with no steps and only settles its status; no caller creates steps or revises the plan (apps/web/lib/workflows/steps/work-plan-steps.ts:29-36; apps/web/lib/services/work-plan-service.ts:365-370; search found no other caller of createWorkPlan outside the service). The in-run step list is still tracked in the tool loop (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3880).
- The brief says a run holds 'a lease'. The runs table has no lease column. Leases are on operations and checkpoints only (apps/web/db/neon/0061_cloud_agent_runs.sql:9-29; 0063:25-27; 0062:25-26).
- The reaped run is marked state failed with code run_abandoned on its error event. There is no state named abandoned (apps/web/lib/services/cloud-agent-run-reaper.ts:112, 67).
- Whether the migration for the plan tables (0237) is applied is not shown: its header reads 'NOT YET APPLIED : draft only' (apps/web/db/neon/0237_work_plans.sql:3).

**Present but disconnected or switched off**

- Request-scoped fallback: when the durable start fails, stalls or is switched off, the turn runs inline and dies with the connection (apps/web/lib/workflows/durable-initial-turns.ts:12-15; route.ts:1001-1018).

**Not available**

- CLI: no use of the hosted run journal found. The CLI keeps its own sessions (search of apps/cli/src for the run endpoint found nothing).
- Local mode and own-key: a durable turn needs a managed-usage or free-trial reservation, so a turn without one runs request-scoped (apps/web/lib/workflows/cloud-agent-workflow-input.ts:605-611). Whether an own-key turn carries a reservation: unknown.

## 4. Required behaviour

**Established requirements**

- Runs are stored with state, events and a lease. (source: brief S92.22 (apps/web/db/neon/0061_cloud_agent_runs.sql:9))
- Plans and steps are stored and updated as the run goes. (source: brief S92.23 (apps/web/db/neon/0237_work_plans.sql:78))
- A checkpoint holds messages, pending calls and the request; a run can resume from it. (source: brief S92.25 (apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:14))
- Tool calls and their results are stored durably with the run so a paused or resumed turn and the transcript can read them. (source: brief S92.08 (apps/web/db/neon/0063_cloud_agent_execution_operations.sql))
- A reaper sweep settles runs whose invocation has ended so they do not hang; an orphaned run is marked with a reason. (source: brief S92.30 (apps/web/lib/services/cloud-agent-run-reaper.ts:90))
- Client reconnection on each app is not established by the brief. (source: brief area note for S92.22)

**Acceptance criteria**

1. Closing the tab during a Work run does not stop it; reopening shows the events from where the client left off.
2. A run with no activity for more than 1100 seconds in a worker-held state is set to failed (or cancelled if stop was requested) by the next sweep, and an error event with code run_abandoned is added.
3. A run waiting for a person (awaiting_input, awaiting_approval, paused) is never reaped.
4. A completed operation replayed with the same key returns the stored result and does not run the tool again.
5. A second approval checkpoint can be saved for the same run only after the first is resolved (one active per run).
6. With AGI_DURABLE_INITIAL_TURNS set to off, a turn still answers but runs request-scoped.
7. Work mode run ends with its plan row settled (completed, failed or cancelled).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The run should be listed and re-openable after a reload on every app that shows cloud tasks [inferred from the shared run client in several apps].
- Plan steps should appear in work_plan_steps as the run proceeds, since the table, the status function and the revision schema exist [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Write plan steps and their status changes from the tool loop into work_plan_steps so the stored plan matches what the run shows.
- [proposed] Add a run lease column or document that operation leases are the only leases.
- [proposed] Show the person a clear 'resumed' or 'ended' state on each app after reconnecting.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | cloud_agent_runs | `apps/web/db/neon/0061_cloud_agent_runs.sql` | One row per run: state, provider, model, last event number, cancel request time, keyed by user and request id; workflow_run_id added in 0063. |
| table | cloud_agent_events | `apps/web/db/neon/0061_cloud_agent_runs.sql` | Ordered event journal (envelope json) unique by run and sequence, used for replay. |
| table | cloud_agent_approval_checkpoints | `apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql` | Versioned pause/resume state: request, messages, pending tool calls, lease, state pending/resuming/resolved/failed. |
| table | cloud_agent_execution_operations | `apps/web/db/neon/0063_cloud_agent_execution_operations.sql` | Receipt per model or tool call: kind, input hash, lease, status, result, usage, error. |
| table | work_plans, work_plan_steps, work_plan_revisions | `apps/web/db/neon/0237_work_plans.sql` | Durable Work plan, its steps and an append-only revision log. |
| service | cloud-agent-run-service | `apps/web/lib/services/cloud-agent-run-service.ts` | Create run (756), append events (818), transition (997), cancel (1174), get run snapshot (1218), save and claim checkpoints (1416, 1908), held-state lists (70-81). |
| service | cloud-agent-execution-service | `apps/web/lib/services/cloud-agent-execution-service.ts` | Claim, renew, complete, fail and reconcile operation receipts; lease max 300 s; replay cap 5. |
| service | executeCloudAgentOperation | `apps/web/lib/workflows/cloud-agent-operation-executor.ts` | Wraps every model or tool call in claim, authorize, run, store (line 228). |
| service | cloudAgentWorkflow | `apps/web/lib/workflows/cloud-agent-workflow.ts` | The durable workflow loop: plan, device wait, invocations, settle, close stream (line 69). |
| service | startCloudAgentWorkflowExecution | `apps/web/lib/workflows/start-cloud-agent-workflow.ts` | Starts the workflow for a run, with an inline fallback (line 116). |
| service | executeCloudAgentWorkflowInvocation | `apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts` | One invocation of the tool loop; returns continue or a final outcome (line 534). |
| service | failCloudAgentWorkflow | `apps/web/lib/workflows/steps/fail-cloud-agent-workflow.ts` | Writes error, task-state and stop events and settles a failed run. |
| job | reapOrphanedCloudAgentRuns | `apps/web/lib/services/cloud-agent-run-reaper.ts` | Settles stalled runs and cancels their workflow runs (line 90). |
| service | explainCloudAgentRunEnding and cancelCloudAgentWorkflowRun | `apps/web/lib/services/cloud-agent-run-termination.ts` | Journals the reason (code run_abandoned) and cancels the workflow run. |
| endpoint | GET /api/cron/reap-agent-runs | `apps/web/app/api/cron/reap-agent-runs/route.ts` | Cron entry with secret check and low-power skip; returns the sweep report. |
| config | cron schedule | `vercel.json` | Runs the reaper at minutes 10, 25, 40, 55 of each hour (line 70). |
| endpoint | GET /api/llm/v1/chat/completions/runs/{runId} | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts` | Returns a run snapshot and events after a given sequence for reconnection; also cancel. |
| config | AGI_DURABLE_INITIAL_TURNS | `apps/web/lib/workflows/durable-initial-turns.ts` | Kill switch for the durable transport. |
| endpoint | POST /api/llm/v1/chat/completions (durable start) | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Begins the run (899-901) and starts the workflow with fallback (946-1018). |
| service | work-plan steps | `apps/web/lib/workflows/steps/work-plan-steps.ts` | ensureWorkPlanForRun and settleWorkPlanForRun workflow steps. |
| service | work-plan-service | `apps/web/lib/services/work-plan-service.ts` | Create, load, settle plans; revision operations schema. |
| service | createManagedCloudAgentRunClient | `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | Shared client with followRun used by web, desktop, mobile, Chrome and VS Code. |
| hook | useChatStream follow | `apps/web/lib/hooks/useChatStream.ts` | Web reconnect: follows the run from the last sequence (line 3095-3130). |
| test | reaper tests | `apps/web/lib/services/cloud-agent-run-reaper.test.ts` | Covers the sweep rules. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Chat route creates the run row and event cursor for the turn | our servers | apps/web/app/api/llm/v1/chat/completions/route.ts:899-901; apps/web/lib/services/cloud-agent-run-service.ts:756 |
| Route starts the durable workflow and waits for the first event within a time budget; on failure it cancels and runs inline | our servers | apps/web/app/api/llm/v1/chat/completions/route.ts:946-1018 |
| Each model and tool call is claimed under a lease, run, and its result stored | our servers | apps/web/lib/workflows/cloud-agent-operation-executor.ts:238-338 |
| The model call goes to the chosen provider | outside service | apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts:692-713 |
| Events are appended and streamed to the client; the client reconnects with the last sequence | device and our servers | apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:50-58; apps/web/lib/hooks/useChatStream.ts:3106-3119 |
| On a tool needing approval a checkpoint is saved; the person's answer resumes it | device and our servers | apps/web/lib/services/cloud-agent-run-service.ts:1416, 1908 |
| The reaper updates stalled runs and cancels the workflow run | our servers | apps/web/lib/services/cloud-agent-run-reaper.ts:110-132 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run row and events | Neon Postgres tables cloud_agent_runs, cloud_agent_events | Read by clients through the run endpoint | Deleted with the conversation (cascade) or user; no other retention rule read (apps/web/db/neon/0061_cloud_agent_runs.sql:11, 31-33) |
| Tool and model results, usage, errors | cloud_agent_execution_operations | Server only | Cascade from the run; retention window: unknown |
| Approval checkpoint (messages, pending calls, request) | cloud_agent_approval_checkpoints | Server only; client sends only the decision | 24 hour constant for approval checkpoints (apps/web/lib/services/cloud-agent-run-service.ts:457) |
| Work plan | work_plans (steps and revisions tables exist) | Server only | Deleted on account erasure (apps/web/lib/server/account-erasure.ts matched by search); retention: no maximum (docs/architecture/RETENTION_MATRIX.md:266) |

**Models and providers.** The run stores the provider and model name chosen for the turn (apps/web/db/neon/0061_cloud_agent_runs.sql:26-27). The workflow is not tied to one provider: the failover plan can rotate the serving route during a run and the continuation carries it (apps/web/lib/workflows/cloud-agent-workflow-continuation.ts:11-55).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required; the run endpoint is user-scoped (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:44). |
| Permissions | Row level security limits every table to the owning user (apps/web/db/neon/0061_cloud_agent_runs.sql:56-70). Cancelling needs a CSRF token (route.ts imports requireCsrfToken). |
| Subscription | A durable turn needs a managed-usage or free-trial reservation; the reservation is carried in the workflow input (apps/web/lib/workflows/cloud-agent-workflow-input.ts:590-611). Plan-specific gating of durable runs: none found in the code read. |
| Limits and metering | Each model call is billed through the operation receipt's billing key (apps/web/lib/workflows/cloud-agent-operation-executor.ts:238-247). Invocation limit 800 s (apps/web/lib/deadline-policy.ts:16). Run endpoint is rate limited under 'agent-run-follow' (route.ts:41). |
| Feature flags | AGI_DURABLE_INITIAL_TURNS, AGI_DB_LOW_POWER. |
| Model compatibility | Tool-using turns only: a run is created when the tool loop or a Work turn runs (apps/web/app/api/llm/v1/chat/completions/route.ts:896-901). |
| Provider restrictions | None found for the journal itself; failover only to providers that have an adapter (apps/web/app/api/llm/v1/chat/completions/route.ts:978 area, isProviderDispatchable). |
| Local mode | Not used. The hosted run journal is a Cloud feature; no Local-mode path to it was found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading / reconnecting | Web chat sets a 'reconnecting' stream phase while it follows the run | apps/web/lib/hooks/useChatStream.ts:3095 |
| Empty / no run | Run endpoint answers not found for an unknown run id | apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:60 |
| Error: worker died | Reaper marks failed with code run_abandoned and a retryable error event | apps/web/lib/services/cloud-agent-run-termination.ts:38-45 |
| Cancel | Stop sets a request time; the reaper later records cancelled if the worker is gone | apps/web/lib/services/cloud-agent-run-reaper.ts:112 |
| Retry / replay | Completed operation returns stored result; running one raises a retry after 65 s; unknown outcome is probed, not repeated; replay cap 5 | apps/web/lib/workflows/cloud-agent-operation-executor.ts:293-311; apps/web/lib/services/cloud-agent-execution-service.ts:25 |
| Waiting for a person | awaiting_input, awaiting_approval and paused runs are not reaped | apps/web/lib/services/cloud-agent-run-service.ts:77-81; cloud-agent-run-reaper.ts:28 |
| Device asleep | Workflow waits up to 60 minutes for a device, then withdraws device tools and continues | apps/web/lib/workflows/cloud-agent-workflow.ts:15-65 |
| Sweep too large | Sweep stops at 240 s and reports remaining true | apps/web/lib/services/cloud-agent-run-reaper.ts:105-108 |
| Low-power database | Sweep skipped after minute 15 of the hour | apps/web/lib/server/cron-low-power.ts:15-18 |
| Offline, per-app reconnect and accessibility | Client reconnect behaviour per app beyond the existence of followRun: not verified; accessibility of reconnect state: not handled in the code read | unknown |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/cloud-agent-run-reaper.test.ts`: Age threshold, states swept, human-held runs left alone, cancelled vs failed, journalled reason, batching and budget, workflow cancel.
- `apps/web/lib/services/cloud-agent-run-liveness.test.ts`: Every run state is classified once and can be ended; a seeded interleaving sweep; repeated operation key runs once.
- `apps/web/lib/workflows/cloud-agent-workflow.liveness.test.ts`: Durable invocation opens its stream first; liveness probe; cancel reaches the provider call.
- `apps/web/lib/workflows/cloud-agent-workflow.checkpoint-journal.test.ts`: Turn that reaches a checkpoint with buffered events.
- `apps/web/lib/workflows/cloud-agent-workflow.settle.test.ts`: Settlement of workflow invocations.
- `apps/web/lib/workflows/durable-initial-turns.test.ts`: Kill switch default on.
- `apps/web/lib/services/cloud-agent-execution-service.test.ts`: Operation claim, lease and replay (by file name; not read).
- `apps/web/lib/services/cloud-agent-run-service.test.ts`: Run service (by file name; not read).
- `apps/web/db/neon/cloud-agent-runs-migration.test.ts`: Migration 0061 shape (by file name; not read).
- `apps/web/db/neon/cloud-agent-execution-migration.test.ts`: Migration 0063 shape (by file name; not read).

**Test scenarios**

- **Reconnect after tab close**
  1. Start a Work task on the web app against local seeded data
  2. Close the tab while it runs
  3. Reopen the conversation
  - Expected: Events resume from the last number and the run finishes.
- **Orphaned run is settled**
  1. Create a run row in state running with updated_at older than 1100 s
  2. Call GET /api/cron/reap-agent-runs with the cron secret
  - Expected: Run becomes failed, an error event with code run_abandoned is added, response shows reaped 1.
- **Run waiting for approval is not reaped**
  1. Make a run awaiting_approval and old
  2. Run the sweep
  - Expected: State unchanged.
- **Kill switch**
  1. Set AGI_DURABLE_INITIAL_TURNS=off
  2. Send an agent turn
  - Expected: Turn answers without the X-AGI-Tool-Loop: durable header; closing the tab ends it.
- **Replay a finished operation**
  1. Re-deliver a completed step with the same operation key
  - Expected: Stored result returned, no second tool call.
- **Plan steps**
  1. Run a Work turn with a goal
  2. Read work_plans and work_plan_steps for the run
  - Expected: Today: a plan row with objective and final status and no step rows. A tester should record the result.

**Where to look when it fails**

- Log 'Reaped cloud agent runs whose invocation had ended' and 'Cloud agent run reaper failed' (apps/web/app/api/cron/reap-agent-runs/route.ts:25, 29).
- Log '[durable-initial-turns] kill-switch engaged' (apps/web/lib/workflows/durable-initial-turns.ts:13).
- Log 'Durable initial agent turn could not start; falling back to the request-scoped stream' (route.ts:1013).
- Error names CloudAgentApprovalCheckpointConflictError, CloudAgentWorkflowBillingUnavailableError; error code run_abandoned, operation_replay_limit_exceeded.
- Tables: cloud_agent_runs.state and updated_at, cloud_agent_execution_operations.status (outcome_unknown), cloud_agent_approval_checkpoints.state.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Plan steps are not stored or updated while a run proceeds; only an empty plan and its final status are written.** Affects: Web Work mode; any app that would read the stored plan. Evidence: apps/web/lib/workflows/steps/work-plan-steps.ts:29-36; apps/web/lib/services/work-plan-service.ts:365-370. Work needed: Write steps and status changes from the tool loop; add tests.
- **Migration for plan tables is marked not yet applied in its header; applied state unknown.** Affects: Production Work runs. Evidence: apps/web/db/neon/0237_work_plans.sql:3. Work needed: Check migration status (pnpm db:migrate -- status) and update the header or apply.
- **No run-level lease or 'abandoned' state; the brief wording does not match the schema.** Affects: Engineers and testers reading the brief. Evidence: apps/web/db/neon/0061_cloud_agent_runs.sql:17-22; cloud-agent-run-reaper.ts:112. Work needed: Correct the brief wording or add the field.
- **Client reconnection is not shown to be complete on each app; only the presence of followRun is established.** Affects: Desktop, Mobile, Chrome, VS Code. Evidence: apps/desktop/src/runtime/CloudRuntime.ts:700; apps/mobile/services/streaming.ts:478. Work needed: Drive each app through a dropped connection and record results.
- **CLI does not use the hosted journal.** Affects: CLI. Evidence: search of apps/cli/src for completions/runs found nothing. Work needed: Decide if the CLI needs it.
- **Request-scoped fallback loses durability silently for the person.** Affects: Web turns that fall back. Evidence: apps/web/app/api/llm/v1/chat/completions/route.ts:1001-1018. Work needed: Optionally tell the person the turn cannot be detached.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- surface:vscode
- mode:cloud
- table:cloud_agent_runs
- table:cloud_agent_events
- table:cloud_agent_approval_checkpoints
- table:cloud_agent_execution_operations
- table:work_plans
- api:GET /api/cron/reap-agent-runs
- api:GET /api/llm/v1/chat/completions/runs/{runId}
- F092-08
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-sync-and-continuity
- SYS-observability-and-operations

## Unknown

- Whether migration 0237 (plan tables) is applied in production.
- Whether a turn on own key carries a managed-usage reservation and so runs durably.
- Retention period for events and operation receipts.
- Whether Desktop, Mobile, Chrome and VS Code actually resume a run after a dropped connection.
- Contents of the state check after migration 0196 (planning, resuming, awaiting_approval states were not read in SQL).
- Whether the 'archived' run state is user-facing.
