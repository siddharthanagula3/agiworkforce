---
id: "F103-06"
type: "feature"
title: "Agent runs, tasks and automation"
aliases: ["Execution attempts (S103.08)", "Agents and task plans (S103.21)", "Tool invocations and receipts (S103.22)", "Approval requests and decisions (S103.23)", "Checkpoints (S103.24)", "Coding sessions and repository bindings (S103.25)", "Skills and Plugins (S103.28)", "Schedules and trigger definitions (S103.29)", "cloud_agent_runs", "scheduled_tasks", "Agent run"]
area: "103 Data and persistence categories"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S103.08", "S103.21", "S103.22", "S103.23", "S103.24", "S103.25", "S103.28", "S103.29"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-observability-and-operations", "SYS-inference-providers", "surface:web", "mode:cloud", "table:cloud_agent_runs", "table:cloud_agent_execution_operations", "table:cloud_agent_approval_checkpoints", "table:scheduled_tasks", "table:connector_call_events"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F103-06 Agent runs, tasks and automation

Server records of agent work: each run and its event journal, each model or tool operation with its attempt count, plans, resumable checkpoints for approval and input, coding sessions tied to a repository, installed skills and plugins, schedules and triggers. Approval decisions are written to the audit trail, not on the checkpoint row. All on our servers.

Area: [103. Data and persistence categories](README.md). Requirement items: [S103.08](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10308), [S103.21](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10321), [S103.22](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10322), [S103.23](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10323), [S103.24](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10324), [S103.25](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10325), [S103.28](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10328), [S103.29](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10329).

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

**What it does.** Records managed agent runs and their ordered events (apps/web/db/neon/0061_cloud_agent_runs.sql:9), each provider or tool operation with attempt, retry safety and stored result (apps/web/db/neon/0063_cloud_agent_execution_operations.sql:20), task plans (work_plans, work_plan_steps, work_plan_revisions listed in apps/web/lib/services/deletion-manifest.ts), approval checkpoints (apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:8), connector call outcomes (apps/web/db/neon/0223_connector_call_events.sql:32), coding sessions (apps/web/db/neon/0075_cloud_code_sessions.sql:7), user skills (apps/web/db/neon/0157_user_skills.sql:19), plugin installations (apps/web/db/neon/0109_web_plugin_installations.sql:53) and scheduled tasks and runs (apps/web/db/neon/0009_scheduling.sql:1,34; apps/web/db/neon/0210_event_triggers.sql:38).

**Why it exists.** So long agent work can pause for a person, resume after a restart without repeating an action that already happened, show what the agent did, and run unattended on a schedule. Brief items S103.08, S103.21 to S103.25, S103.28, S103.29 (doc: knowledge-base/data/area-briefs/103-data-and-persistence-categories.md).

**Who uses it.** People who run agent tasks, coding sessions or schedules; admins reviewing activity.

**Problems it solves**

- Doing a paid or side-effecting step twice after a retry (apps/web/db/neon/0063_cloud_agent_execution_operations.sql:1-10)
- Losing a paused run when the client goes away (apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:1-6)
- Knowing whether a connector is answering (apps/web/db/neon/0223_connector_call_events.sql:4-20)
- Missed or failed scheduled runs (apps/web/lib/services/schedule-service.ts:2102)

**Use cases**

- An agent asks to run a tool; the person approves later and the run resumes.
- A coding session attaches to a repository and keeps a terminal journal.
- A person schedules a daily agent task that retries with backoff.
- A person installs a plugin and a custom skill.

## 2. User experience

**Where to find it**

- Web: /chat/agents, /chat/code, /chat/schedules, plugin and skill pages (apps/web/app/chat; apps/web/app/api/plugins; apps/web/app/api/skills). Exact visible labels: unknown, not opened.
- Run origins accepted: web, desktop, mobile, chrome, vscode, api (apps/web/db/neon/0061_cloud_agent_runs.sql:9 origin_surface). CLI is not in that list.
- Per-app screens: not traced.

**Before you start**

- Cloud account with a plan that allows the feature; schedules need a plan with scheduled tasks (apps/web/lib/services/schedule-service.ts:877).

**Screens and controls**

- Approve, reject, or approve-always on a pending tool call (apps/web/app/api/llm/v1/chat/completions/approve/route.ts).
- Run list, cancel, pause, steer (apps/web/lib/services/cloud-agent-run-service.ts:1174,2727,2798).
- Schedule create, edit, enable, run now (apps/web/lib/services/schedule-service.ts:994-1495).
- Coding session create and attach (apps/web/app/api/code/sessions).

**Journey**

1. 1. Person starts an agent task; a run row is created with the request id.
2. 2. The run emits ordered events; each model or tool step claims an operation row.
3. 3. If a tool needs approval the run saves a checkpoint and waits.
4. 4. The person decides; the server claims the checkpoint under a lease, resumes, and records the decision in the audit trail.
5. 5. The run completes, fails or is cancelled and its state is stored.

**What the person sees and gets**

- Schedule limit: '<plan> plans do not include scheduled tasks. Upgrade to schedule unattended runs.' or '<plan> plans can have up to N scheduled tasks. Delete one or upgrade to add another.' (apps/web/lib/services/schedule-service.ts:877).
- Approval mismatch: 'Approval decisions do not match the pending tool calls.' (apps/web/app/api/llm/v1/chat/completions/approve/route.ts:142).
- Policy block: 'This tool must be approved once under the current conversation and workspace policy.' (apps/web/app/api/llm/v1/chat/completions/approve/route.ts:390).
- Run state names: queued, running, awaiting_input, ready_for_review, completed, failed, cancelled, paused, archived (apps/web/db/neon/0061_cloud_agent_runs.sql:9).

**Settings**

- Autonomous tool approvals preference, allowed only when the workspace allows (apps/web/app/api/settings/preferences/route.ts).
- Network access for coding sessions: none, trusted, full (apps/web/db/neon/0075_cloud_code_sessions.sql:7).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- createCloudAgentRun is idempotent by user and request id (unique constraint in apps/web/db/neon/0061_cloud_agent_runs.sql:9; apps/web/lib/services/cloud-agent-run-service.ts:756).
- Events are appended with a sequence per run (cloud_agent_events in apps/web/db/neon/0061_cloud_agent_runs.sql:9; appendCloudAgentEvents at apps/web/lib/services/cloud-agent-run-service.ts:841).
- claimCloudAgentExecutionOperation takes a lease, records attempt, retry safety safe or unsafe and a result; a completed operation replays its stored result and an unsafe lapsed lease becomes outcome_unknown (apps/web/lib/services/cloud-agent-execution-service.ts:206; apps/web/db/neon/0063_cloud_agent_execution_operations.sql:20).
- Approval checkpoints store the transcript, up to 32 pending tool calls and an event cursor, in states pending, resuming, resolved, failed, claimed under a short lease (apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:8; apps/web/lib/services/cloud-agent-run-service.ts:1908,2000).
- The client decides only approve or reject; the decision is recorded as audit event tool_approval_decided with status per tool (apps/web/app/api/llm/v1/chat/completions/approve/route.ts:638).
- Other checkpoint kinds exist for caller input, device steps and pause (apps/web/lib/services/cloud-agent-run-service.ts:1645,2090,2429,2928).
- Task plans are created and settled for a run (apps/web/lib/services/work-plan-service.ts:372,422).
- Connector call outcomes (succeeded, failed, blocked, duration) are logged without waiting on the call and read back up to 100 entries to judge health (apps/web/lib/services/connector-call-log-service.ts:52,97; caller apps/web/lib/connectors/health.ts).
- Coding sessions store title, repository url, network access, state and terminal entries (apps/web/db/neon/0075_cloud_code_sessions.sql:7; apps/web/lib/services/cloud-code-session-service.ts:1196).
- Schedules: runs have status running, success, failed, timeout, cancelled and source schedule, manual, webhook, api (apps/web/db/neon/0009_scheduling.sql:34); attempt count (apps/web/db/neon/0057_durable_scheduling.sql:11) and retry backoff and missed-run policy (apps/web/db/neon/0209_scheduled_task_rules_and_policies.sql:16; apps/web/lib/services/schedule-service.ts:1643,2102).
- User skills and plugin installations have create, update, delete, enable services (apps/web/lib/services/user-skill-service.ts:261-321; apps/web/lib/services/plugin-installation-service.ts:346-448).

**Incomplete**

- Tool receipts: the connector call log keeps tool name and outcome only, not arguments or result (apps/web/lib/services/connector-call-log-service.ts:52). The full result is kept per operation in cloud_agent_execution_operations.result (apps/web/db/neon/0063_cloud_agent_execution_operations.sql:20). A single receipt record that joins both: not found.

**Present but disconnected or switched off**

- Migrations 0223 (connector call events) and 0235 (autonomous tool approvals workspace switch) carry 'NOT YET APPLIED : draft only' headers (apps/web/db/neon/0223_connector_call_events.sql:4; apps/web/db/neon/0235_autonomous_tool_approvals_workspace_switch.sql). 0061, 0062, 0063, 0075 and 0009 do not show that header in the lines opened. Applied state: unknown.
- The legacy table agent_approval_requests (status pending, approved, denied, expired, cancelled) exists (apps/web/db/neon/0077_gateway_compatibility_tables.sql:86) and is named in the erasure lists; no code writing it was found in this pass.

**Not available**

- Run origin 'cli' is not allowed by the 0061 constraint; how CLI runs are recorded: unknown.

## 4. Required behaviour

**Established requirements**

- Each execution attempt (operation, run, retry count) is durably recorded and classified. (source: S103.08)
- Agent runs and task plans (with revisions) are durably stored and classified. (source: S103.21)
- Tool invocations and their receipts are durably recorded and classified. (source: S103.22)
- Approval requests and the decisions made on them are durably recorded and classified. (source: S103.23)
- Resumable checkpoints of long-running work are durably stored and classified. (source: S103.24)
- Coding sessions and their repository bindings are durably stored and classified. (source: S103.25)
- Skills and plugin installations are durably stored and classified. (source: S103.28)
- Schedules and trigger definitions are durably stored and classified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.29)
- A client decides only whether a pending tool call may run; transcript and arguments stay on the server and are claimed once under a lease. (source: apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:1)

**Acceptance criteria**

1. Start two runs with the same request id: one run row.
2. Retry a tool operation after a crash: a completed operation returns its stored result and does not run again.
3. An unsafe operation whose lease lapsed is marked outcome_unknown, not re-run.
4. Reject a pending tool call: the run resumes without executing it and an audit event tool_approval_decided with status rejected exists.
5. Claim the same checkpoint twice: the second claim fails.
6. Create more schedules than the plan allows: refused with the plan message.
7. A failed scheduled run retries with backoff up to its retry limit.
8. A connector tool failure produces one outcome row and never fails the original call.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- An approval decision is not readable from the checkpoint row itself, so an approvals history must read the audit trail [inferred from completeCloudAgentApprovalCheckpoint at apps/web/lib/services/cloud-agent-run-service.ts:2000].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store the decision, decider and time on the checkpoint or an approvals table so history does not depend on the audit stream.
- [proposed] Add one receipt row per tool call joining arguments digest, result digest and outcome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | cloud_agent_runs / cloud_agent_events | `apps/web/db/neon/0061_cloud_agent_runs.sql` | Run state and ordered event journal. |
| table | cloud_agent_approval_checkpoints | `apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql` | Pending approval with transcript, pending tool calls and lease. |
| table | cloud_agent_execution_operations | `apps/web/db/neon/0063_cloud_agent_execution_operations.sql` | One row per provider or tool operation with attempt, result and lease. |
| service | cloud-agent-run-service | `apps/web/lib/services/cloud-agent-run-service.ts` | Runs, events, transitions, cancel, pause, steer and all checkpoint kinds. |
| service | cloud-agent-execution-service | `apps/web/lib/services/cloud-agent-execution-service.ts` | Operation claim, complete, fail and reconcile. |
| service | work-plan-service | `apps/web/lib/services/work-plan-service.ts` | Create and settle task plans. |
| endpoint | /api/llm/v1/chat/completions/approve | `apps/web/app/api/llm/v1/chat/completions/approve/route.ts` | Receive approval decisions, resume, write audit event. |
| endpoint | /api/llm/v1/chat/completions/runs | `apps/web/app/api/llm/v1/chat/completions/runs` | Read and control runs. |
| table | connector_call_events | `apps/web/db/neon/0223_connector_call_events.sql` | Tool call outcome log per connector. |
| service | connector-call-log-service | `apps/web/lib/services/connector-call-log-service.ts` | Fire-and-forget record and read for health. |
| table | cloud_code_sessions | `apps/web/db/neon/0075_cloud_code_sessions.sql` | Coding session with repository url and terminal journal. |
| service | cloud-code-session-service | `apps/web/lib/services/cloud-code-session-service.ts` | Create, claim, release and list coding sessions. |
| endpoint | /api/code/sessions | `apps/web/app/api/code/sessions` | Coding session API. |
| table | user_skills | `apps/web/db/neon/0157_user_skills.sql` | Custom skills. |
| service | user-skill-service | `apps/web/lib/services/user-skill-service.ts` | Skill create, update, delete, list. |
| table | plugin_installations | `apps/web/db/neon/0109_web_plugin_installations.sql` | Installed plugins per account. |
| service | plugin-installation-service | `apps/web/lib/services/plugin-installation-service.ts` | Plan, install, enable, uninstall. |
| table | scheduled_tasks / scheduled_task_runs | `apps/web/db/neon/0009_scheduling.sql` | Schedules and their runs. |
| service | schedule-service | `apps/web/lib/services/schedule-service.ts` | Create, claim due runs, retry, finalize, quota. |
| table | event_triggers | `apps/web/db/neon/0210_event_triggers.sql` | Trigger definitions and events. |
| job | run-schedules and reap-agent-runs | `apps/web/app/api/cron/run-schedules` | Cron that processes due schedules; reap-agent-runs cleans stuck runs. |
| service | deletion-manifest | `apps/web/lib/services/deletion-manifest.ts` | Classifies all of these tables. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| App sends a managed chat turn in agent mode; server creates the run row and starts the tool loop. | our servers | apps/web/lib/services/cloud-agent-run-service.ts:756 |
| Each provider or tool step claims an operation row under a lease and stores its result. | our servers | apps/web/lib/services/cloud-agent-execution-service.ts:206 |
| The model call itself goes to a model provider. | outside service | apps/web/db/neon/0063_cloud_agent_execution_operations.sql:25 (operation_kind provider) |
| A tool that needs approval stops the loop and saves a checkpoint. | our servers | apps/web/lib/services/cloud-agent-run-service.ts:1416 |
| The person's decision arrives; the server claims the checkpoint and resumes. | device and our servers | apps/web/app/api/llm/v1/chat/completions/approve/route.ts:220 |
| Tools that act on the person's own machine (device steps) use a device checkpoint and the device finishes them. | device | apps/web/lib/services/cloud-agent-run-service.ts:2429 (saveCloudAgentDeviceCheckpoint) |
| Scheduled runs are claimed by a cron and executed as agent runs. | our servers | apps/web/lib/services/schedule-service.ts:1341,2471 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run, events, operations, plans | cloud_agent_* tables, work_plan_* tables | Read through the runs API by any app. | Cascade from run; classified in manifest (apps/web/lib/services/deletion-manifest.ts:32-38,214). |
| Approval decision | Audit event tool_approval_decided | Server only. | Audit retention rules (SYS-observability-and-operations). |
| Connector call outcomes | connector_call_events | Server only. | Cascade from profile (apps/web/db/neon/0223_connector_call_events.sql:20-30 header). |
| Schedules and runs | scheduled_tasks, scheduled_task_runs | Read through the schedules API. | Runs cascade with the task (apps/web/db/neon/0009_scheduling.sql:34). |

**Models and providers.** Provider and model are required columns on every run (apps/web/db/neon/0061_cloud_agent_runs.sql:9) and so are recorded; which models: unknown and not named. Operations record whether they are provider or tool calls and their usage (apps/web/db/neon/0063_cloud_agent_execution_operations.sql:20).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required. |
| Permissions | All run, checkpoint and operation rows use user-scoped keys and row-level security (apps/web/db/neon/0063_cloud_agent_execution_operations.sql:59-68). Autonomous approvals need workspace permission (apps/web/app/api/settings/preferences/route.ts). Policy can force a tool to be approved once (apps/web/app/api/llm/v1/chat/completions/approve/route.ts:390). |
| Subscription | Scheduled tasks capped by plan (getPlanMaxScheduledTasks, apps/web/lib/services/schedule-service.ts:877); project, plugin and connector limits by plan in apps/web/lib/services/free-plan-entitlements.ts; managed usage metering applies to provider operations (usage jsonb on operations, apps/web/db/neon/0063_cloud_agent_execution_operations.sql:20). |
| Limits and metering | Up to 32 pending tool calls per checkpoint (apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:18); coding session title 1-120 characters (apps/web/db/neon/0075_cloud_code_sessions.sql:7); plan schedule cap value unknown. |
| Feature flags | Connector release flag assertConnectorsReleased is used in connector import routes; none found specific to runs in the code opened. |
| Model compatibility | Run requires a provider and model string; compatibility checks live in SYS-model-catalog-and-routing. |
| Provider restrictions | Sandbox providers for Code sessions are kept server-side and not exposed (apps/web/db/neon/0075_cloud_code_sessions.sql:1-4 header). |
| Local mode | These server records exist only for Cloud runs. Desktop and CLI can run agents on the device; whether they write any of these tables in Local mode: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Run lifecycle | States queued, running, awaiting_input, ready_for_review, completed, failed, cancelled, paused, archived. | apps/web/db/neon/0061_cloud_agent_runs.sql:9 |
| Lease expired on an unsafe operation | Becomes outcome_unknown instead of being repeated. | apps/web/db/neon/0063_cloud_agent_execution_operations.sql:20; apps/web/lib/services/cloud-agent-execution-service.ts:436 |
| Checkpoint claimed twice | Conflict error 'Approval checkpoint lease is no longer active'. | apps/web/lib/services/cloud-agent-run-service.ts:2000 |
| Approval decisions that do not match | 400 error. | apps/web/app/api/llm/v1/chat/completions/approve/route.ts:142 |
| Cancel and pause | Cancellation and pause are requested and checked by the loop. | apps/web/lib/services/cloud-agent-run-service.ts:1174,2727 |
| Missed schedule | Detected against a grace window with a policy. | apps/web/lib/services/schedule-service.ts:83,2102 |
| Connector log write fails | Logged as a warning; the call is unaffected. | apps/web/lib/services/connector-call-log-service.ts:52 |
| Offline client during a paused run | Run stays paused or awaiting; resumes on decision. Client wording: unknown. | apps/web/lib/services/cloud-agent-run-service.ts:2928,3035 (pause checkpoint save and claim) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/cloud-agent-run-service.test.ts`: Runs.
- `apps/web/lib/services/cloud-agent-execution-service.test.ts`: Operations and leases.
- `apps/web/lib/services/cloud-agent-run-reaper.test.ts`: Reaping stuck runs.
- `apps/web/lib/services/cloud-agent-run-cancellation.test.ts`: Cancellation.
- `apps/web/lib/services/__tests__/cloud-agent-caller-checkpoint.test.ts`: Caller checkpoints.
- `apps/web/lib/services/__tests__/cloud-agent-device-checkpoint.test.ts`: Device checkpoints.
- `apps/web/lib/services/__tests__/cloud-agent-event-journal.test.ts`: Event journal.
- `apps/web/lib/services/__tests__/connector-call-log-service.test.ts`: Connector call log.
- `apps/web/lib/services/cloud-code-session-service.test.ts`: Coding sessions.
- `apps/web/lib/services/schedule-service.test.ts`: Schedules.
- `apps/web/lib/services/schedule-service.policies.test.ts`: Schedule retry and missed policies.
- `apps/web/lib/services/user-skill-service.test.ts`: Skills.
- `apps/web/lib/services/plugin-installation-service.test.ts`: Plugin installs.
- `apps/web/lib/observability/__tests__/work-plan-signals.test.ts`: Plan signals.

**Test scenarios**

- **Idempotent run**
  1. Send the same agent request twice with one request id.
  - Expected: One run row and no duplicate side effects.
- **Crash during tool**
  1. Start an unsafe tool operation.
  2. Stop the worker.
  3. Wait for the lease to lapse and reconcile.
  - Expected: Operation status outcome_unknown and the tool is not executed again.
- **Approve later**
  1. Run a task that needs a tool approval.
  2. Close the client.
  3. Approve from another app.
  - Expected: Run resumes; audit event tool_approval_decided written.
- **Schedule cap**
  1. Create schedules up to the plan cap.
  2. Create one more.
  - Expected: Plan limit message.
- **Schedule retry**
  1. Create a schedule that fails.
  2. Wait for its retry.
  - Expected: A new attempt appears with attempt count higher and backoff applied.
- **Connector outage**
  1. Make a connector fail several calls.
  - Expected: Outcome rows recorded and the connector reads as not responding.

**Where to look when it fails**

- Audit events tool_approval_decided.
- Operation status outcome_unknown rows.
- Log 'a connector call was not logged'.
- Run state and last_event_sequence columns.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Approval decisions are not stored on a table of their own.** Affects: Admins reviewing approvals. Evidence: apps/web/lib/services/cloud-agent-run-service.ts:2000; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:638. Work needed: Add a durable decision record or document the audit trail as the owner.
- **Tool receipts are split: outcome log without arguments, results in operations.** Affects: Audit and support. Evidence: apps/web/lib/services/connector-call-log-service.ts:52; apps/web/db/neon/0063_cloud_agent_execution_operations.sql:20. Work needed: Define the receipt and join it.
- **CLI runs are not an accepted run origin.** Affects: CLI. Evidence: apps/web/db/neon/0061_cloud_agent_runs.sql:9. Work needed: Confirm how CLI agent work is recorded.
- **Draft migrations 0223 and 0235 not marked applied.** Affects: All apps. Evidence: apps/web/db/neon/0223_connector_call_events.sql:4. Work needed: Confirm ledger.
- **Per-app screens for runs, sessions, skills and schedules not traced.** Affects: Desktop, Mobile, CLI, VS Code, Chrome. Evidence: Brief status 'platform'. Work needed: Trace each app.

**Depends on**

- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-observability-and-operations
- SYS-inference-providers
- surface:web
- mode:cloud
- table:cloud_agent_runs
- table:cloud_agent_execution_operations
- table:cloud_agent_approval_checkpoints
- table:scheduled_tasks
- table:connector_call_events

## Unknown

- Whether migrations 0223 and 0235 are applied in production.
- Plan values for scheduled-task caps.
- How CLI and desktop local agent work is recorded, if at all.
- Visible labels and screens for runs, approvals, sessions, skills and schedules.
- Which writer, if any, uses agent_approval_requests.
- How long audit events holding approval decisions are retained.
