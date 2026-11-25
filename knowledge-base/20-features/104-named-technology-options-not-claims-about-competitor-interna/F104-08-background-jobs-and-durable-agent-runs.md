---
id: "F104-08"
type: "feature"
title: "Background jobs and durable agent runs"
aliases: ["Background jobs and durable agent runs", "drain-background-jobs cron", "job queue", "cloud agent workflow", "durable workflow", "Tasks", "S104.15", "S104.16"]
area: "104 Named technology options-not claims about competitor internals"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S104.15", "S104.16"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-observability-and-operations", "table:background_jobs", "table:cloud_agent_runs", "table:cloud_agent_events", "api:GET /api/cron/drain-background-jobs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F104-08 Background jobs and durable agent runs

Two separate server mechanisms. A queue in the database holds small jobs (notifications, email, deletion, exports) that a cron route drains every five minutes. Cloud agent turns run on the Vercel Workflow engine, are journaled in the database, and can be reattached from the Tasks page after a tab closes.

Area: [104. Named technology options-not claims about competitor internals](README.md). Requirement items: [S104.15](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10415), [S104.16](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10416).

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

**What it does.** Runs long or retried work off the request: queued jobs with retries and dead letters (job-service.ts:231-540) and durable cloud agent turns that wait for a person's device up to an hour (cloud-agent-workflow.ts:14-65).

**Why it exists.** The brief requires background jobs queued and drained by a scheduled worker (S104.15) and long agent and indexing runs on a durable workflow engine (S104.16). Agent turns that die with the browser connection lose work.

**Who uses it.** Web users who start cloud agent tasks; desktop and mobile users whose cloud runs show in Tasks; operators who watch dead jobs in admin.

**Problems it solves**

- Work survives a closed tab, because the run is journaled and attached to a workflow (0061_cloud_agent_runs.sql:1-45; start-cloud-agent-workflow.ts:150-194).
- Transient failures retry with backoff; permanent failures stop (job-service.ts:454-496).
- A sleeping device is waited for, not failed (cloud-agent-workflow.ts:14-65).

**Use cases**

- Start an Agi Work task, close the tab, return to Tasks and read the result.
- An account erasure or data export runs in the queue.
- A schedule-completed email is sent with retry.
- A device-revoke message to the relay is retried until it answers (job-handlers.ts:300-340).

## 2. User experience

**Where to find it**

- Web: the Tasks page (apps/web/app/tasks/page.tsx) with filters Active, Needs you, All, Archived and layouts List and Board (TasksPage.tsx:70-81).
- Desktop shell code has a Tasks view and cloud runtime, but the public Electron window shows the hosted web app, so treat the web page as what desktop users get (doc: AGENTS.md section 5).
- Mobile: settings row 'Cloud agent' with statuses Available, Not available on this server, Not included in your account, Status unavailable (CloudAgentStatus.tsx:15-21).
- Job queue itself has no user screen; operators use the admin background-jobs endpoint (app/api/admin/background-jobs).

**Before you start**

- Signed in with a Managed Cloud account.
- For Work mode, the Work capability must be admitted (start-cloud-agent-workflow.ts:84-92).
- Durable start must not be switched off (durable-initial-turns.ts:1-20).

**Screens and controls**

- Tasks list with cancel, pause, resume, archive and approval actions (TasksPage.tsx:340-490).
- Run snapshot, journal and steer endpoints under /api/llm/v1/chat/completions/runs.

**Journey**

1. Send an agent turn in chat; the server creates a run row and starts the workflow.
2. The stream is read live; the person may close the tab.
3. Later open Tasks; the run list is read from the runs API and the journal replays.
4. Resolve any approval, or read the result.

**What the person sees and gets**

- Run states queued, running, awaiting_input, ready_for_review, completed, failed, cancelled, paused, archived (0061_cloud_agent_runs.sql:9-25).
- Device wait notices 'waiting', 'back', 'withdrawn' (cloud-agent-workflow.ts:19-64).
- Failure notifications on a terminal run (cloud-agent-terminal-notifications.test.ts exists).

**Settings**

- Pause and approval mode for runs.
- No user setting for the job queue.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- vercel.json schedules drain-background-jobs every 5 minutes (vercel.json:149-152).
- The drain verifies cron authentication, honors low-power mode, runs project-knowledge cleanup, then drains with a 250-second budget and at most 12 jobs in flight (drain-background-jobs/route.ts:17-50).
- Low power (AGI_DB_LOW_POWER=1) skips only after minute 15 of each hour, so the first 15 minutes still run (cron-low-power.ts:5-20).
- Nine queue policies set concurrency, attempts, backoff, lease and retention, e.g. email 8 attempts, data-deletion 12 (job-queues.ts:19-100).
- Backoff is exponential with jitter, capped per queue (job-queues.ts:135-152).
- A PermanentJobError dead-letters at once; exhausted attempts also dead-letter; expired leases are reaped (job-service.ts:116-121,454-540).
- Seventeen job kinds map to queues; the handler registry covers 17 handlers (job-queues.ts:108-128; job-handlers.ts:340-367).
- Cloud agent turns start through start() from the workflow package and the run is attached to its workflow id; if attach fails the workflow is cancelled (start-cloud-agent-workflow.ts:150-194).
- The workflow waits up to 60 minutes for the device in 'retryInMs' steps, then withdraws device tools and continues (cloud-agent-workflow.ts:14-65).
- Work-plan settle and stream close run on success and on failure (cloud-agent-workflow.ts:67-100).
- If durable transport is unavailable the turn can run inline, request-scoped (start-cloud-agent-workflow.ts:196-262).

**Incomplete**

- When the kill switch AGI_DURABLE_INITIAL_TURNS is 0, false or off, new turns die with the connection (durable-initial-turns.ts:8-18).
- Admin view of dead jobs exists, but user-facing display of job failure was not found (unknown).

**Present but disconnected or switched off**

- Agent runs are not queue jobs: no agent kind exists in the job registry (job-queues.ts:108-128).

**Not available**

- Mobile and desktop handling of runs not fully read; mobile shows only a cloud-agent availability row (CloudAgentStatus.tsx:15-50).

## 4. Required behaviour

**Established requirements**

- Background jobs are queued and drained by a scheduled worker. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.15)
- Long agent and indexing runs execute on a durable workflow engine. (source: S104.16 (same brief))
- Rate limits and limits are configuration; design for bounded resources and backpressure. (source: doc: AGENTS.md section 8)
- Dead letters carrying Google user data are kept no longer than 30 days. (source: job-queues.ts:19-35)
- Background mode is non-ZDR because it needs stored response data. (source: doc: docs/product/requirements.md (line 625))

**Acceptance criteria**

1. Cron without valid auth returns 401.
2. With AGI_DB_LOW_POWER=1 after minute 15 the drain returns skipped 'db_low_power' and touches nothing.
3. A job throwing PermanentJobError becomes dead on its first attempt.
4. A job failing transiently is requeued with a delay not above the queue maximum and dead after max attempts.
5. Closing the tab during a cloud agent turn does not cancel it; Tasks later shows its result.
6. A device that is offline holds the run for up to 60 minutes, then continues without device tools.
7. With the kill switch on, the turn still completes inline and the run is recorded.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Free-trial turns use the same durable path since the transport no longer depends on tier [inferred] (start-cloud-agent-workflow.ts:206-262 comment).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the person the reason when a run degraded to inline.
- [proposed] Expose failed job reasons to the owner of the job where Google data rules allow.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/cron/drain-background-jobs | `apps/web/app/api/cron/drain-background-jobs/route.ts` | Cron entry that drains the queue. |
| config | vercel cron schedule | `vercel.json` | Schedules drain (every 5 minutes) and retrieval indexing (every 10). |
| service | job-service | `apps/web/lib/jobs/job-service.ts` | Enqueue, claim, complete, fail, reap. |
| service | job-drain | `apps/web/lib/jobs/job-drain.ts` | Budgeted drain loop with concurrency. |
| config | job-queues | `apps/web/lib/jobs/job-queues.ts` | Queue policies, kinds, backoff. |
| service | job-handlers | `apps/web/lib/jobs/job-handlers.ts` | Handler per job kind; permanent errors. |
| service | cron-low-power | `apps/web/lib/server/cron-low-power.ts` | AGI_DB_LOW_POWER skip rule. |
| service | cron-auth | `apps/web/lib/server/cron-auth.ts` | Verifies cron requests. |
| table | background_jobs | `apps/web/db/neon/0208_background_jobs.sql` | Job rows with status, attempts, lease. |
| schema | worker fencing | `apps/web/db/neon/0249_background_job_worker_fencing_and_cancellation.sql` | Fencing and cancellation columns. |
| job | cloudAgentWorkflow | `apps/web/lib/workflows/cloud-agent-workflow.ts` | Durable agent workflow with device wait. |
| service | start-cloud-agent-workflow | `apps/web/lib/workflows/start-cloud-agent-workflow.ts` | Admission, start, attach, inline fallback. |
| config | durable-initial-turns | `apps/web/lib/workflows/durable-initial-turns.ts` | AGI_DURABLE_INITIAL_TURNS kill switch. |
| table | cloud_agent_runs / cloud_agent_events | `apps/web/db/neon/0061_cloud_agent_runs.sql` | Run journal for replay. |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Starts durable turns. |
| endpoint | runs/[runId] routes | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts` | Read, cancel, pause, resume, steer, archive runs. |
| component | TasksPage | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | Tasks UI shared by surfaces. |
| service | cloud-tasks-client | `apps/web/features/tasks/services/cloud-tasks-client.ts` | Web client for the runs API. |
| component | CloudAgentStatusRow | `apps/mobile/src/features/settings/code/CloudAgentStatus.tsx` | Mobile availability row. |
| job | retrieval index workflow | `apps/web/lib/workflows/retrieval-index-workflow.ts` | Indexing runs on the workflow engine. |
| config | workflow package | `apps/web/package.json` | Declares the workflow dependency (line 174). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Vercel cron calls the drain route on schedule. | outside service | vercel.json:149-152 |
| Route checks cron auth and low-power skip, then reaps expired leases and claims jobs per queue. | our servers | drain-background-jobs/route.ts:21-38; job-drain.ts:209-259 |
| Each handler runs; success completes, failure retries with backoff or dead-letters. | our servers | job-service.ts:415-496 |
| For an agent turn, the chat route builds the workflow input, starts the workflow and attaches its id to the run row. | our servers | completions/route.ts:637-660; start-cloud-agent-workflow.ts:150-194 |
| Workflow checks device presence, runs each model/tool invocation as a step, loops on 'continue', then closes the stream. | our servers | cloud-agent-workflow.ts:67-100 |
| The client reconnects through the runs API and replays journal events by sequence. | device and our servers | 0061_cloud_agent_runs.sql:1-6; cloud-tasks-client.ts:8 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Background job rows | background_jobs in Neon | Server only | Finished 7 to 30 days, dead letters 30 days by queue (job-queues.ts:19-100). |
| Agent run state and events | cloud_agent_runs, cloud_agent_events | Replayed to Web, Desktop, Mobile on reconnect (0061 comment) | Archived by the person; deletion rule: unknown. |
| Workflow state | Vercel Workflow platform | Server only | unknown |

**Models and providers.** The workflow runs the tool loop with the provider and model on the run row; admitted Managed Cloud routes and usage reservations cross the invocation boundary (start-cloud-agent-workflow.ts:206-240; 0061_cloud_agent_runs.sql:20-23). Queue jobs use no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud runs need a signed-in account; the drain needs cron auth, not a user (drain-background-jobs/route.ts:21). |
| Permissions | Runs are keyed to user_id with foreign keys (0061_cloud_agent_runs.sql:9-50); job handlers use claimed user-scoped databases (job-handlers.ts:280-300). |
| Subscription | Work mode is gated by a capability check (start-cloud-agent-workflow.ts:84-92); Work and cloud agent availability for a plan: unknown. |
| Limits and metering | Per-queue concurrency and attempts (job-queues.ts:19-100); drain budget 250 s and 12 in flight (route.ts:17-18); device wait 60 minutes (cloud-agent-workflow.ts:14-15); agent usage is reserved and settled (cloud-agent-workflow.metering.test.ts exists). |
| Feature flags | AGI_DURABLE_INITIAL_TURNS kill switch (durable-initial-turns.ts:3-18); AGI_DB_LOW_POWER (cron-low-power.ts:9); WORK_CAPABILITY kill switch (start-cloud-agent-workflow.ts:87). |
| Model compatibility | Any model admitted for the run; no queue dependence on model. |
| Provider restrictions | Managed Cloud only for durable runs; the workflow rejects turns with no reservation to replay (start-cloud-agent-workflow.ts:108-114). |
| Local mode | Local-mode chats do not use the cloud queue or workflow; no Local path touches these routes in the files read [inferred]. Local mode behaviour on desktop device-presence is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unauthorized cron | 401 and warning log. | drain-background-jobs/route.ts:21-24 |
| Low-power window | Returns {skipped:'db_low_power'} after minute 15. | cron-low-power.ts:17-20 |
| Budget exhausted with work left | Logs 'Background job drain ended with work still queued'. | drain-background-jobs/route.ts:39-41 |
| Permanent job error | Dead-lettered immediately. | job-service.ts:454-480 |
| Worker crash | Lease expiry requeues or dead-letters at last attempt. | job-service.ts:504-540 |
| Device asleep | Waits up to 60 minutes; then withdraws device tools and continues. | cloud-agent-workflow.ts:19-64 |
| Workflow start fails or stalls | Degrade reasons workflow_start_failed, workflow_stream_stalled, transport_cooling_down; inline fallback when allowed. | start-cloud-agent-workflow.ts:196-203 |
| Cancel and pause | Cancellation requested on the run; paused and awaiting_input states exist. | 0061_cloud_agent_runs.sql:17-22; TasksPage.tsx:340-420 |
| Offline client | Not handled in the code beyond reconnect replay by sequence (0061 comment). | 0061_cloud_agent_runs.sql:1-6 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/jobs/__tests__/job-service.test.ts`: Enqueue, claim, fail, reap.
- `apps/web/lib/jobs/__tests__/job-drain.test.ts`: Drain loop.
- `apps/web/lib/jobs/__tests__/job-handlers.test.ts`: Handlers and permanent errors.
- `apps/web/lib/jobs/__tests__/job-backoff-properties.test.ts`: Backoff bounds.
- `apps/web/lib/jobs/__tests__/job-cancellation-idempotency.test.ts`: Cancellation.
- `apps/web/app/api/cron/drain-background-jobs/route.test.ts`: Cron route auth and skip.
- `apps/web/lib/workflows/cloud-agent-workflow.device-clearance.test.ts`: Device wait.
- `apps/web/lib/workflows/cloud-agent-workflow.settle.test.ts`: Settlement.
- `apps/web/lib/workflows/start-cloud-agent-workflow.test.ts`: Start and attach.
- `apps/web/lib/workflows/cloud-agent-workflow.liveness.test.ts`: Stream liveness.

**Test scenarios**

- **Cron auth**
  1. Call the drain route with no cron credential.
  - Expected: 401 Unauthorized.
- **Retry then dead**
  1. Enqueue a job whose handler throws a normal error.
  2. Run the drain repeatedly past the queue's max attempts.
  - Expected: Job requeued with growing delay, then status dead with a dead reason.
- **Permanent failure**
  1. Enqueue an audit-stream job with no workspace.
  - Expected: Dead on first attempt.
- **Closed tab**
  1. Start a cloud agent turn.
  2. Close the tab before it ends.
  3. Open Tasks.
  - Expected: Run continues and the final state and journal appear.
- **Kill switch**
  1. Set AGI_DURABLE_INITIAL_TURNS=0.
  2. Start a turn and close the tab.
  - Expected: Turn runs inline and stops with the connection; warning log present.

**Where to look when it fails**

- Logs 'Unauthorized background job drain request', 'Background job drain ended with work still queued', 'Background job drain failed'.
- Logs '[durable-initial-turns] kill-switch engaged'.
- Tables background_jobs (status, attempts, dead_reason, retry_reason), cloud_agent_runs, cloud_agent_events.
- Admin route /api/admin/background-jobs.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No user-visible failure state for queue jobs.** Affects: Web users whose export or notification job dies.. Evidence: Only admin route found: app/api/admin/background-jobs. Work needed: Decide which job kinds need a person-facing status.
- **Durable path can silently degrade to inline, where closing the tab ends the run.** Affects: Web, desktop, mobile cloud users.. Evidence: start-cloud-agent-workflow.ts:196-262. Work needed: Tell the person when a turn is not detachable.
- **Retrieval indexing is on a separate cron plus workflow, not the job queue, so there are three background mechanisms.** Affects: Operators.. Evidence: index-retrieval-documents/route.ts:15-37. Work needed: Document or consolidate.
- **Desktop and mobile run handling was not verified in this read.** Affects: Desktop, mobile.. Evidence: Only file names located. Work needed: Read run clients and record reconnect behaviour.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-observability-and-operations
- table:background_jobs
- table:cloud_agent_runs
- table:cloud_agent_events
- api:GET /api/cron/drain-background-jobs

## Unknown

- Retry and display of failed agent runs on mobile and desktop.
- How long Vercel Workflow keeps workflow state.
- Which plans may start Work-mode runs.
- Whether the cron schedule is honored on the production deployment (not verifiable from files).
- Run deletion and retention rules for cloud_agent_events.
