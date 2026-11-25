---
id: "F102-03"
type: "feature"
title: "Background jobs, schedules, connector sync and indexing"
aliases: ["Document/media worker runtime", "Background jobs", "Job drain", "Scheduler", "Scheduled tasks", "Retrieval indexing workers", "Indexing workers", "Connector synchronization workers", "S102.07", "S102.27", "S102.28", "S102.29"]
area: "102 Runtime inventory"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S102.07", "S102.27", "S102.28", "S102.29"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-files-artifacts-and-storage", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "SYS-observability-and-operations", "SYS-data-model-and-migrations", "surface:web", "mode:cloud", "table:background_jobs", "table:scheduled_tasks", "table:scheduled_task_runs", "table:retrieval_documents", "table:retrieval_chunks", "plan:basic", "file:vercel.json"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F102-03 Background jobs, schedules, connector sync and indexing

Server-side background work: a cron drains queued jobs (media, file purge, exports, email, webhooks); a cron fires due scheduled runs; uploaded documents are indexed by durable workflows with a retry sweep. Workers that sync mail or drive content on a schedule do not exist.

Area: [102. Runtime inventory](README.md). Requirement items: [S102.07](../../10-requirements/capabilities/102-runtime-inventory.md#s10207), [S102.27](../../10-requirements/capabilities/102-runtime-inventory.md#s10227), [S102.28](../../10-requirements/capabilities/102-runtime-inventory.md#s10228), [S102.29](../../10-requirements/capabilities/102-runtime-inventory.md#s10229).

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

**What it does.** Runs work that is not part of a web request: queued jobs with retries and dead letters, scheduled agent runs, search indexing of uploaded knowledge files, and large chat-file intake.

**Why it exists.** Slow or retried work must not block a request, must survive crashes, and must be metered. Scheduled tasks must run when the user is away.

**Who uses it.** Users who upload project files, schedule tasks, request exports or generate media; operators who watch queues.

**Problems it solves**

- Uploads that need chunking and embedding.
- Retrying failed emails, webhooks and deletions with backoff.
- Running a user's saved prompt at the time they chose.
- Detecting a queue that stopped draining.

**Use cases**

- A user adds a PDF to a project and later finds it searchable.
- A user with a paid plan schedules a daily summary; the cron runs it.
- A user requests a data export; a job builds the archive and emails when ready.
- Nothing syncs a user's mailbox content in the background; Gmail changes only fire event triggers.

## 2. User experience

**Where to find it**

- Project knowledge files in the web app (indexing state shown; reindex route apps/web/app/api/projects/[id]/knowledge-files/[fileId]/reindex/route.ts).
- Scheduled tasks list in the web app: routes under apps/web/app/api/schedules (exact visible label not read: unknown).
- Cron jobs have no user screen; they run from vercel.json.

**Before you start**

- Signed-in account.
- Scheduling needs a plan with scheduled tasks: Free, Local and own-key plans allow 0; basic 3, pro 5, max 15, max_15x 25, team 10; enterprise custom (packages/contracts/types/src/billing-catalog.ts:572-723; apps/web/lib/services/schedule-service.ts:877-902).

**Screens and controls**

- Reindex action for a knowledge file.
- Schedule create, edit, enable and delete (apps/web/lib/services/schedule-service.ts:994-1291).
- No controls for indexing (automatic).

**Journey**

1. 1. The user uploads a document or creates a schedule.
2. 2. For a document, the server dispatches an indexing workflow; if the start fails the document stays pending (project-knowledge-files.ts:105-123).
3. 3. Every 10 minutes a cron reserves due documents and starts workflows (vercel.json:62; index-retrieval-documents/route.ts).
4. 4. For a schedule, the 15-minute cron claims due runs in waves of 10 for up to 55 s (run-schedules/route.ts:14-18).
5. 5. Each run executes the saved prompt through the managed agent path and records success, failure, timeout or cancel.
6. 6. Every 5 minutes the drain cron claims and runs queued jobs (vercel.json:150).

**What the person sees and gets**

- Index state on knowledge files; keyword-only note when embeddings fail ('The embedding provider did not respond; keyword search still works and indexing retries automatically.', retrieval-index-service.ts:118).
- Schedule run history, completion notifications and email (job kinds notifications.schedule-completed, email.schedule-completed, job-handlers.ts:347-367).
- Quota message: '<plan> plans do not include scheduled tasks. Upgrade to schedule unattended runs.' (schedule-service.ts:884-889).

**Settings**

- AGI_DB_LOW_POWER skips these crons after minute 15 each hour (cron-low-power.ts:3-17).
- CRON_SECRET (name only) authenticates cron calls, minimum length 32 (apps/web/lib/server/cron-auth.ts:19).
- Missed-run policy per schedule: run_once or skip (schedule-service.ts:2102 area).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Drain cron: budget 250 s, at most 12 jobs in flight, handlers for webhooks, notifications, email, deletion, file purge, research settlement, event triggers, image generation and data export (apps/web/app/api/cron/drain-background-jobs/route.ts:17-18, :35-36; apps/web/lib/jobs/job-handlers.ts:347-367). Per-queue concurrency, attempts, backoff, lease and retention are in JOB_QUEUE_POLICIES (apps/web/lib/jobs/job-queues.ts:18).
- Drain reports queue depth and age, reaps expired leases, and pages operators when a queue is not draining (apps/web/lib/jobs/job-drain.ts:209 and helpers).
- A failed drain returns HTTP 500 (drain route:43-49).
- Scheduler: waves of 10, 40 s per wave, 55 s sweep, up to ceil(50/10) waves (run-schedules/route.ts:14-20; PLATFORM_SCHEDULE_RUNS_PER_SWEEP=50 at billing-catalog.ts:478); each wave first expires lapsed approvals and recovers expired claims, then claims due runs (schedule-service.ts:2471-2500).
- Scheduled runs use the managed route with a usage reservation and managed-compute access check (scheduled-agent-executor.ts:12-14, :98, :110).
- Indexing: dispatch on upload/reindex, 10-minute cron sweep, durable workflow with one step that chunks, embeds (metered), and stores chunks; embedding failure leaves keyword-only chunks and retries (retrieval-index-service.ts:658-780; start-retrieval-index-workflow.ts:32-50).
- Large chat-file intake runs as its own workflow with a 5-minute sweeper (chat-file-intake-workflow.ts; vercel.json:66).
- Video generation has its own workflow (apps/web/lib/workflows/video-generation-workflow.ts).
- Gmail: a webhook and a watch-renewal cron feed event triggers (apps/web/app/api/webhooks/gmail/route.ts; lib/triggers/gmail-watch.ts:492; vercel.json:198).

**Incomplete**

- The scheduler cron has maxDuration 60 s (run-schedules/route.ts:12), so one sweep can leave runs due; it logs 'Scheduled-task sweep ended with schedules still due'.
- Retention of finished jobs is set per queue; user-facing deletion of job history was not found.

**Present but disconnected or switched off**

- Crons skip when AGI_DB_LOW_POWER=1 and the minute is 15 or more (cron-low-power.ts).

**Not available**

- Connector synchronization workers: no worker that syncs mail or drive content on a schedule exists; audit/missing/102-runtime-inventory.md lists S102.28 as missing and audit/ledger/ecosystem-capability-ledger.jsonl records it as missing. The Gmail path only starts event triggers; refresh-connector-directory refreshes the connector list, not user content (route names in vercel.json).

## 4. Required behaviour

**Established requirements**

- Media and file work runs in background jobs drained by a worker. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.07)
- A scheduler fires due scheduled runs and completes them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.27)
- Background workers sync connected-account content (mail, drive) on a schedule. Status: missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.28)
- Indexing runs as durable workflows dispatched by upload and swept by a cron. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.29)

**Acceptance criteria**

1. After an upload the document gets indexed state or is retried within about 10 minutes.
2. A schedule due now is claimed and finished by the next 15-minute cron, with a run row in scheduled_task_runs.
3. A Free plan user cannot create a scheduled task and sees the upgrade message.
4. A job that fails is retried with backoff and ends dead-lettered after the queue's max attempts.
5. Drain returns HTTP 500 and logs 'Background job drain failed' when it throws.
6. With the cron secret missing or wrong the cron routes answer 401.
7. If embedding fails, the file remains keyword searchable and a later pass retries.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Scheduled runs need a signed-in-owner and billing identity even though the user is away [inferred from claim scope createClaimedUserScopedDb, schedule-service.ts:2500].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build connector sync workers or retire S102.28 from the inventory.
- [proposed] Raise run-schedules maxDuration or split sweeps so schedules are not left due.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| job | drain-background-jobs cron | `apps/web/app/api/cron/drain-background-jobs/route.ts` | Runs the drain; vercel.json:150. |
| service | drainBackgroundJobs | `apps/web/lib/jobs/job-drain.ts` | Claims, runs, retries, dead-letters, reports health (line 209). |
| service | BACKGROUND_JOB_HANDLERS | `apps/web/lib/jobs/job-handlers.ts` | Registry of job kinds to handlers (line 347). |
| config | JOB_QUEUE_POLICIES | `apps/web/lib/jobs/job-queues.ts` | Per-queue limits (line 18). |
| service | job-service | `apps/web/lib/jobs/job-service.ts` | Claim, complete, fail jobs (insert at line 246). |
| table | background_jobs | `apps/web/lib/jobs/job-service.ts` | Queue table. |
| job | run-schedules cron | `apps/web/app/api/cron/run-schedules/route.ts` | Sweep due schedules; vercel.json:50. |
| service | schedule-service | `apps/web/lib/services/schedule-service.ts` | Create, claim, process and finalize scheduled runs (lines 994, 1341, 2471). |
| service | scheduled-agent-executor | `apps/web/lib/services/scheduled-agent-executor.ts` | Runs the scheduled prompt through managed routing and the tool loop. |
| table | scheduled_tasks | `apps/web/lib/services/schedule-service.ts` | Schedule definitions (line 870). |
| table | scheduled_task_runs | `apps/web/lib/services/schedule-service.ts` | Run history (line 1388). |
| job | index-retrieval-documents cron | `apps/web/app/api/cron/index-retrieval-documents/route.ts` | Reserve due documents and start workflows; vercel.json:62. |
| job | retrievalIndexWorkflow | `apps/web/lib/workflows/retrieval-index-workflow.ts` | One-step durable workflow (line 12). |
| service | dispatchRetrievalIndexWorkflows | `apps/web/lib/workflows/start-retrieval-index-workflow.ts` | Starts workflows; failure leaves document pending (lines 32-50). |
| service | indexRetrievalDocument | `apps/web/lib/services/retrieval-index-service.ts` | Chunk, embed, store (line 658). |
| table | retrieval_documents / retrieval_chunks | `apps/web/lib/services/retrieval-index-service.ts` | Index tables (lines 462, 535). |
| service | project-knowledge-files | `apps/web/lib/server/project-knowledge-files.ts` | Dispatches indexing after an upload (line 105). |
| job | chat-file-intake workflow | `apps/web/lib/workflows/chat-file-intake-workflow.ts` | Large chat-file inspection, scan and indexing; sweeper vercel.json:66. |
| job | video-generation workflow | `apps/web/lib/workflows/video-generation-workflow.ts` | Media generation workflow. |
| endpoint | POST /api/webhooks/gmail | `apps/web/app/api/webhooks/gmail/route.ts` | Receives Gmail change notices for triggers; no content sync. |
| config | cron registry | `vercel.json` | Cron schedules; checked by cron-registration.test.ts. |
| service | cron-auth | `apps/web/lib/server/cron-auth.ts` | Verifies the cron secret. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Vercel calls the cron route with the cron secret. | outside service | (vercel.json:50-72, :150; cron-auth.ts:19) |
| The route checks the secret and the low-power switch, then does its work. | our servers | (drain route:20-35) |
| Drain claims jobs from background_jobs, runs handlers with a time budget, completes, retries or dead-letters. | our servers | (job-drain.ts:209) |
| Handlers call outside services (email, push, webhooks, signaling relay, image providers). | outside service | (job-handlers.ts:~330-345 relay revoke; :347-367) |
| Schedule sweep claims due runs and executes them through the managed route with a reservation. | our servers | (schedule-service.ts:2471-2520; scheduled-agent-executor.ts:110) |
| The executor calls the model provider. | outside service | (scheduled-agent-executor.ts:22, :35 adapter imports) |
| Indexing workflow loads the file text, chunks it and calls an embedding provider (metered), then writes chunks. | outside service | (retrieval-index-service.ts:479-545) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Jobs | table background_jobs | Server only | Finished jobs kept 7-30 days per queue; dead letters up to 30 days (job-queues.ts:19-120) |
| Scheduled tasks and runs | tables scheduled_tasks, scheduled_task_runs | Shown on clients through the API | unknown |
| Document chunks and embeddings | tables retrieval_documents, retrieval_chunks | Server only | purged with the file (job file-processing.purge-upload-object) |

**Models and providers.** Scheduled runs and embeddings go through managed Cloud routing, model chosen by the server; embeddings use a metered embedding service (retrieval-embedding-service imports at retrieval-index-service.ts:34-37). Image jobs use image providers. No Local or own-key path.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Scheduling and uploads need a signed-in account; crons use the cron secret (config name CRON_SECRET). |
| Permissions | Schedules are per user and workspace; approvals can lapse and stop a run (schedule-service.ts:2481). |
| Subscription | Scheduled tasks count is a plan limit (see prerequisites); managed compute access is checked for scheduled runs (scheduled-agent-executor.ts:98); embeddings can be refused as not_entitled, leaving keyword-only (retrieval-index-service.ts:720). |
| Limits and metering | Per-queue concurrency and attempts; 12 in flight; 250 s drain; 55 s sweep; 50 runs per sweep; scheduled runs reserve managed usage; MAX_OUTPUT_TOKENS 4096 for scheduled runs (scheduled-agent-executor.ts:161). |
| Feature flags | AGI_DB_LOW_POWER; capability kill switches may apply (not read). |
| Model compatibility | Scheduled tool plans withhold tools the model cannot run unattended (scheduled-agent-executor.ts:237-400). |
| Provider restrictions | Adapter-table providers; embeddings need a configured embedding route. |
| Local mode | No Local or own-key behaviour: all of this is server side. Local and own-key plans have 0 scheduled tasks (billing-catalog.ts:593-610). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Indexing start fails | Document stays pending; cron retries. | (start-retrieval-index-workflow.ts:32-50) |
| Embedding fails | Keyword-only chunks stored, retried later. | (retrieval-index-service.ts:511, :720-731) |
| Drain fails | HTTP 500 and error log. | (drain route:43-49) |
| Drain budget ends with work left | Warns 'Background job drain ended with work still queued'. | (drain route:38-41) |
| Sweep ends with schedules due | Warn log; next cron continues. | (run-schedules/route.ts:~63-70) |
| Run times out | Recorded as timeout in the summary. | (schedule-service.ts:2540-2550) |
| Unauthorized cron call | 401. | (drain route:21-24) |
| Offline user | Not relevant: runs are server side. | (design) |
| Accessibility | unknown | not read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/cron/drain-background-jobs/route.test.ts`: Drain cron route.
- `apps/web/app/api/cron/run-schedules/route.test.ts`: Schedule cron route.
- `apps/web/app/api/cron/index-retrieval-documents/route.test.ts`: Index sweep cron route.
- `apps/web/app/api/cron/cron-registration.test.ts`: Crons registered once in vercel.json.
- `apps/web/lib/jobs/__tests__/job-drain.test.ts`: Drain logic.
- `apps/web/lib/jobs/__tests__/job-handlers.test.ts`: Handlers.
- `apps/web/lib/jobs/__tests__/job-service.test.ts`: Job claim and complete.
- `apps/web/lib/jobs/__tests__/job-backoff-properties.test.ts`: Backoff properties.
- `apps/web/lib/services/schedule-service.test.ts`: Schedule service.
- `apps/web/lib/services/scheduled-agent-executor.test.ts`: Scheduled executor.
- `apps/web/lib/workflows/retrieval-index-workflow-input.test.ts`: Index workflow input checks.
- `apps/web/lib/workflows/__tests__/chat-file-intake-workflow.test.ts`: Chat file intake workflow.
- `apps/web/app/api/webhooks/gmail/route.test.ts`: Gmail webhook.

**Test scenarios**

- **Index after upload**
  1. Upload a text file to a project.
  2. Watch index state for 10 minutes.
  - Expected: State reaches indexed; chunks exist in retrieval_chunks.
- **Embedding outage**
  1. Disable the embedding route on a test deployment.
  2. Upload a file.
  - Expected: File searchable by keyword; last_error holds the keyword-only message; later pass retries.
- **Schedule fires**
  1. As a Basic user create a schedule due in 5 minutes.
  2. Wait for the next */15 cron.
  - Expected: A scheduled_task_runs row ends success; completion notification job runs.
- **Free schedule refusal**
  1. As a Free user create a schedule.
  - Expected: Refused with the plans-do-not-include-scheduled-tasks message.
- **Cron auth**
  1. Call each cron route with no secret.
  - Expected: 401 and a warn log.

**Where to look when it fails**

- Logs: 'Background job drain failed', 'Scheduled-task sweep ended with schedules still due', '[retrieval] index workflow did not start; the cron sweep will retry it', 'Scheduled task batch completed'.
- Metrics: queue depth and age per queue (job-drain.ts).
- Tables: background_jobs, scheduled_task_runs, retrieval_documents (last_error).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No connector sync workers (mail, drive).** Affects: All apps that expect connected content to be searchable or fresh.. Evidence: (audit/missing/102-runtime-inventory.md S102.28; vercel.json has no sync cron). Work needed: Design and build scheduled syncs with entitlement and quota, or retire the item.
- **Scheduler cron limited to 60 s and 50 runs per sweep.** Affects: Heavy schedule load.. Evidence: (run-schedules/route.ts:12-20). Work needed: Capacity test; raise limits if needed.
- **Scheduling is unavailable on Free, Local and own-key plans; check against the requirement that Local features stay free of subscription.** Affects: Local and own-key users.. Evidence: (billing-catalog.ts:593-610, :878-884 of schedule-service.ts). Work needed: Product decision; local scheduler is a different feature.

**Depends on**

- SYS-agents-tools-and-automation
- SYS-files-artifacts-and-storage
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- SYS-observability-and-operations
- SYS-data-model-and-migrations
- surface:web
- mode:cloud
- table:background_jobs
- table:scheduled_tasks
- table:scheduled_task_runs
- table:retrieval_documents
- table:retrieval_chunks
- plan:basic
- file:vercel.json

## Unknown

- Visible labels for the schedules screen.
- Retention of scheduled run history.
- Whether data export and email jobs are visible to users as progress.
- Whether any user-facing control reports indexing state beyond the knowledge file list.
- Which embedding provider route is configured.
- Brief lines vercel.json:26, job-handlers.ts:164 and context-engine/src/engine.ts:349 were not opened; engine.ts is a local context engine and its relation to the scheduler is unknown.
