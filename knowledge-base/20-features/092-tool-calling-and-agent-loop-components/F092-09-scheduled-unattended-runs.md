---
id: "F092-09"
type: "feature"
title: "Scheduled unattended runs"
aliases: ["Scheduled unattended runs", "Scheduled tasks", "Scheduled", "run-schedules cron", "Durable task scheduler", "S92.29", "create_schedule tool", "scheduled agent executor"]
area: "92 Tool-calling and agent-loop components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S92.29"]
depends_on: ["surface:web", "surface:cli", "surface:mobile", "surface:chrome", "mode:cloud", "api:GET /api/cron/run-schedules", "table:scheduled_tasks", "table:scheduled_task_runs", "F092-08", "F092-07", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-security-and-privacy", "SYS-observability-and-operations", "SYS-connectors-plugins-and-skills"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F092-09 Scheduled unattended runs

People set up a task that runs on its own at a set time, once or repeating. A cron endpoint every 15 minutes claims due runs in waves of 10 and stops at 55 seconds. Each run uses the tool loop without a person present. Tools that would need asking are withheld, or the run pauses for approval.

Area: [92. Tool-calling and agent-loop components](README.md). Requirement items: [S92.29](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9229).

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

**What it does.** Stores scheduled tasks and their runs, finds those that are due, runs the agent for each with a time limit, and records the result. It runs with the person's Tool approvals rules: tools allowed without asking run; others are not offered or cause a pause that the owner can approve later. (apps/web/app/api/cron/run-schedules/route.ts:14-72; apps/web/lib/services/schedule-service.ts:2471-2520; apps/web/lib/services/scheduled-agent-executor.ts:237-372, 595-640)

**Why it exists.** People want a daily briefing or weekly summary without opening the app. A run with nobody present cannot ask permission, so it needs rules for that. (apps/web/lib/server/tools/schedule-tool.ts:42-44; apps/web/db/neon/0308_schedule_run_approval.sql:3-8)

**Who uses it.** People on a plan that allows scheduled tasks: basic 3, pro 5, max 15, max_15x 25, team 10 tasks; free, byok and local-only 0 (packages/contracts/types/src/billing-catalog.ts:562-700). Plan display names may differ from these keys.

**Problems it solves**

- Repeat work can be set once and runs by itself.
- A run cannot do an action that needs a person without that person knowing: it pauses and waits for approval for up to 24 hours (apps/web/db/neon/0308_schedule_run_approval.sql:3-8; apps/web/lib/services/schedule-service.ts:79).
- A claimed run whose worker died is recovered through lease expiry (schedule-service.ts:2487-2489).
- Spend cap on the account pauses schedules with reason credit_cap_reached (schedule-service.ts:1794, 2144).

**Use cases**

- A daily morning briefing task.
- A weekly summary of a project's files using the project context.
- A one-time reminder set from chat with the create_schedule tool.
- A recurring task that stops and asks the owner before sending data out.

## 2. User experience

**Where to find it**

- Web: route /chat/schedules, page heading 'Scheduled', button 'Create a task', search 'Search scheduled tasks' (apps/web/app/chat/schedules/page.tsx; apps/web/features/schedules/components/SchedulesPage.tsx:967, 1010, 1065). Also a section inside a project (apps/web/app/chat/projects/[id]/page.tsx:44).
- Chat: the create_schedule tool, described as 'set up a task that runs on its own at a set time' (apps/web/lib/prompts/chat-system-prompt.ts:423; apps/web/lib/server/tools/schedule-tool.ts:16).
- CLI, Mobile: files that call the schedules API exist (apps/cli/src/schedules.rs; apps/mobile/src/features/schedules/service.ts); screens and labels not read.
- Chrome extension page lists 'Scheduled tasks' (apps/web/app/chrome-extension/page.tsx:74).

**Before you start**

- A plan with a non-zero scheduled task limit; otherwise the page shows 'Scheduled tasks are available on Basic and higher plans.' (SchedulesPage.tsx:306, 1076).
- Managed compute access for schedules must allow the run (apps/web/lib/services/scheduled-agent-executor.ts:915-935).

**Screens and controls**

- Create a task, More ways to create a task, templates, status filter, project filter, share link (SchedulesPage.tsx:1010, 1024, 1206, 1235, 1537).
- Form note: 'Scheduled tasks are swept <cadence>, so the shortest supported interval is <minimum>.' (apps/web/features/schedules/components/ScheduleForm.tsx:358-359; sweep interval 15 minutes: packages/platform/utils/src/scheduling/schedule-time.ts:259).

**Journey**

1. 1. Create a task by form or by asking in chat (create_schedule: name, prompt, recurrence once/daily/weekly/monthly, time) (schedule-tool.ts:42-60).
2. 2. The task saves, checked against the plan's task limit (schedule-service.ts:877, 994).
3. 3. The cron sweep claims due runs (apps/web/app/api/cron/run-schedules/route.ts:47-52).
4. 4. The executor checks secrets, access policy, route and tools, then runs the tool loop with unattended settings (scheduled-agent-executor.ts:861-935, 595-640).
5. 5. The result is saved with status success, failed, timeout, cancelled or awaiting_approval (schedule-service.ts:350).
6. 6. If a step needs approval, the run waits; the owner approves or denies and it resumes (0308 migration).

**What the person sees and gets**

- Run history with status (apps/web/app/api/schedules/runs/route.ts).
- Skipped-run text such as 'Scheduled execution skipped: <reason>' for secret handling or access denial (scheduled-agent-executor.ts:890, 920).
- When search or code tools are withheld the run's result says which step was skipped and points to Settings, Capabilities, Tool approvals (scheduled-agent-executor.ts:374-425).
- Expired approval: 'Nobody approved or denied the step this run was waiting on within 24 hours, so the run stopped. Resume the schedule to run it again.' (schedule-service.ts:79).

**Settings**

- Settings, Capabilities, Tool approvals (named in the withheld-tool note) (scheduled-agent-executor.ts:424).
- AGI_DB_LOW_POWER (sweep paused outside minutes 0 to 14 of each hour) (apps/web/lib/server/cron-low-power.ts).
- Per-task: recurrence, retry settings, missed-run policy run_once or skip (schedule-service.ts:102, 2076).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Cron endpoint checks the secret, skips under low power, runs up to 5 waves of 10 claims (limit 50 per sweep) and stops after 55 seconds of budget; each wave has a 40 second run timeout (apps/web/app/api/cron/run-schedules/route.ts:14-72; packages/contracts/types/src/billing-catalog.ts:478).
- Cron runs every 15 minutes (vercel.json:49-51).
- Before claiming, expired approvals are stopped and expired claims recovered (schedule-service.ts:2481-2487).
- Claim leases the run for the timeout plus 5 seconds (schedule-service.ts:2490-2492).
- The run goes through the tool loop with unattended true and escalation pauses (scheduled-agent-executor.ts:619-620).
- Tools needing approval under the owner's rules are not offered for the provider-native search or code tools, and a note says so (scheduled-agent-executor.ts:264-327, 374-425).
- A run can pause awaiting_approval and resume (apps/web/db/neon/0308_schedule_run_approval.sql:21-35; schedule-service.ts:1957).
- Retries with backoff up to 5 attempts (schedule-service.ts:77-80, 1643).
- Entitlement and managed-compute access are checked at run time (scheduled-agent-executor.ts:903-935).

**Incomplete**

- Each scheduled run is cut off at about 40 seconds (the wave timeout becomes the run timeout) and ends with status timeout, so long tasks do not 'run to completion' (route.ts:16, 47-52; schedule-service.ts:2323).
- The brief says anything that would need asking is refused. The code withholds some tools and pauses others for approval; it does not refuse outright (scheduled-agent-executor.ts:619-620, 374-381; 0308 migration).
- Scheduled runs do not use the per-run budget or the durable run journal (F092-07, F092-08); they use their own run table scheduled_task_runs (scheduled-agent-executor.ts:595-640).

**Present but disconnected or switched off**

- Low-power skip: when AGI_DB_LOW_POWER is 1 the sweep returns skipped db_low_power outside the first 15 minutes of each hour (apps/web/lib/server/cron-low-power.ts:15-18).

**Not available**

- Free, byok and local-only plans: limit 0, so no scheduled tasks (billing-catalog.ts:590-640).
- Local mode: no on-device scheduler found in the files read. The CLI has its own cron tools (apps/cli/src/features/exec/tools/mod.rs:1196 'cron_create'); not examined further.

## 4. Required behaviour

**Established requirements**

- A cron endpoint with a secret check claims due runs in waves of 10 and stops at a sweep budget of 55 seconds. (source: brief S92.29 (apps/web/app/api/cron/run-schedules/route.ts:14-18))
- Tools run only if the unattended gate allows them; anything that would need asking is refused. (source: brief S92.29; code differs (apps/web/lib/services/unattended-tool-gate.ts:18-45))
- Low-power cron skip can pause the sweep. (source: brief S92.29 (apps/web/lib/server/cron-low-power.ts:15))
- A durable scheduler starts scheduled agent runs on time and runs them to completion unattended. (source: brief S92.29 Should line)

**Acceptance criteria**

1. Calling the cron route without the secret returns 401 and runs nothing.
2. With 25 due runs, one sweep claims 10, 10, then 5 and stops (drained true).
3. A task on a plan with limit 0 cannot be created; the page shows the plan message.
4. A task whose tool needs approval under the owner's policy either has the tool withheld with a note or pauses as awaiting_approval, and never runs it silently.
5. An unanswered approval is stopped after 24 hours with the message above.
6. A run that exceeds its time limit is recorded as timeout and may retry up to the configured attempts.
7. With AGI_DB_LOW_POWER=1 at minute 30 the route answers skipped db_low_power.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A scheduled run should be able to run longer than 40 seconds if the product wants long agent tasks [inferred from the brief's 'to completion'].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Run long scheduled tasks on the durable workflow so they get journal, budget and recovery.
- [proposed] Tell the owner in a notification when a run pauses for approval.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/cron/run-schedules | `apps/web/app/api/cron/run-schedules/route.ts` | Sweep: secret check, low-power skip, waves of 10, 55 s budget. |
| config | cron schedule | `vercel.json` | Runs the sweep every 15 minutes (line 49-51). |
| service | processDueScheduleRuns | `apps/web/lib/services/schedule-service.ts` | Expires approvals, recovers expired claims, claims runs, runs them with concurrency (line 2471). |
| service | claimDueScheduleRuns | `apps/web/lib/services/schedule-service.ts` | Leases due runs (line 1341). |
| service | processClaimedScheduleRun / finalizeScheduleRun | `apps/web/lib/services/schedule-service.ts` | Runs one claim with timeout and records the outcome and retries (lines 2045, 1653). |
| service | createSchedule and assertScheduleQuota | `apps/web/lib/services/schedule-service.ts` | Create a task and enforce the plan's task limit (lines 994, 877). |
| service | scheduledAgentExecutor | `apps/web/lib/services/scheduled-agent-executor.ts` | Runs one scheduled agent: secrets, access, route, tools, loop (line 852). |
| service | buildScheduledToolPlan | `apps/web/lib/services/scheduled-agent-executor.ts` | Chooses which tools are offered for an unattended run and which are withheld (line 237). |
| service | runScheduledToolLoop | `apps/web/lib/services/scheduled-agent-executor.ts` | Runs the tool loop with unattended and escalation pause settings (line 595). |
| service | runsUnattendedWithoutAsking | `apps/web/lib/services/unattended-tool-gate.ts` | The unattended gate: true only if the call gate verdict is allow (line 18). |
| service | scheduleToolDefinition (create_schedule) | `apps/web/lib/server/tools/schedule-tool.ts` | Chat tool to create a schedule. |
| table | scheduled_tasks, scheduled_task_runs | `apps/web/db/neon/0308_schedule_run_approval.sql` | Run status incl. awaiting_approval, approval checkpoint and request columns. |
| endpoint | /api/schedules, /api/schedules/[id], /api/schedules/runs | `apps/web/app/api/schedules` | Create, update, list tasks and runs. |
| screen | SchedulesPage | `apps/web/features/schedules/components/SchedulesPage.tsx` | Web screen 'Scheduled' at /chat/schedules. |
| component | ScheduleForm | `apps/web/features/schedules/components/ScheduleForm.tsx` | Create and edit form with the sweep-interval note. |
| config | lowPowerCronSkip | `apps/web/lib/server/cron-low-power.ts` | Skips the sweep on low-power database setting. |
| config | verifyCronRequest | `apps/web/lib/server/cron-auth.ts` | Constant-time secret check with failure throttle. |
| config | PLATFORM_SCHEDULE_RUNS_PER_SWEEP | `packages/contracts/types/src/billing-catalog.ts` | 50 runs per sweep (line 478). |
| config | BILLING_PLAN_PRODUCT_LIMITS.maxScheduledTasks | `packages/contracts/types/src/billing-catalog.ts` | Per-plan task limit. |
| service | Schedules client (CLI) | `apps/cli/src/schedules.rs` | CLI calls to the schedules API (not read). |
| service | Schedules client (Mobile) | `apps/mobile/src/features/schedules/service.ts` | Mobile calls to the schedules API (not read). |
| test | run-schedules route test | `apps/web/app/api/cron/run-schedules/route.test.ts` | Auth, waves, 500 on failure. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The platform cron calls the sweep endpoint every 15 minutes with the secret | our servers | vercel.json:49-51; apps/web/app/api/cron/run-schedules/route.ts:23-26 |
| Expired approval waits are stopped and expired claims recovered | our servers | apps/web/lib/services/schedule-service.ts:2481-2487 |
| Due runs are claimed with a lease and run with concurrency up to 10 | our servers | schedule-service.ts:2490-2515 |
| Executor applies secret handling, managed-compute access, agent config, route choice and tool plan | our servers | apps/web/lib/services/scheduled-agent-executor.ts:861-980 |
| The tool loop runs the model call against the chosen provider; tools run per the unattended gate | outside service | scheduled-agent-executor.ts:595-640, 1098 |
| The outcome and cost are saved; the run may pause for approval | our servers | schedule-service.ts:1653; 0308 migration |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Task definition and run history, approval checkpoint and request | Neon tables scheduled_tasks, scheduled_task_runs | Read by web, CLI and mobile through the schedules API | Retention rule: unknown. Approval checkpoint is cleared when the run resumes (0308 comment). |
| Cost of each run | Run result (costMicrousd) feeding usage accounting | Server only | unknown |

**Models and providers.** The executor selects a route with an unattended admission check and a model that keeps inputs out of training when the person or data requires it. Tools are offered only if the chosen model supports tools (apps/web/lib/services/scheduled-agent-executor.ts:783-820, 248-249, 957-968).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; the task belongs to a user and the run scope must match the owner (scheduled-agent-executor.ts:870-873). |
| Permissions | Cron secret for the sweep; user-scoped database for each run (schedule-service.ts:2497). Tool use follows the owner's Tool approvals setting and connector permissions (scheduled-agent-executor.ts:258-268). |
| Subscription | maxScheduledTasks per plan: local-only 0, byok 0, free 0, basic 3, pro 5, max 15, max_15x 25, team 10 (billing-catalog.ts:562-700; display names may differ). Managed compute access is also checked at run time (scheduled-agent-executor.ts:903-935). |
| Limits and metering | 50 runs per sweep, waves of 10, 55 s sweep budget, 40 s run timeout, retries up to 5, 24 h approval wait. Account credit cap pauses schedules with reason credit_cap_reached (schedule-service.ts:1794). |
| Feature flags | AGI_DB_LOW_POWER; CRON_SECRET (name of the check input, value not read). |
| Model compatibility | Models without tool support run with no tools (scheduled-agent-executor.ts:248-249). |
| Provider restrictions | Provider-native search and code tools run inside the provider's turn and cannot pause; they are withheld when they would need approval (scheduled-agent-executor.ts:374-381). |
| Local mode | Not applicable to the hosted scheduler, which is Cloud only and needs a paid plan. A local scheduler on Mobile or Desktop: not found in the files read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unauthorized cron call | 401 and a warning log | route.ts:23-26 |
| Low power | Responds skipped db_low_power | apps/web/lib/server/cron-low-power.ts:15-18 |
| Nothing due | First wave claims fewer than 10; sweep ends drained | route.ts:59-62 |
| Sweep budget used | Loop stops under 1 s remaining and logs 'Scheduled-task sweep ended with schedules still due' | route.ts:44-70 |
| Error | 500 so the platform sees a failure | route.ts:73-78 |
| Timeout | Run marked timeout; retry with backoff up to 5 | schedule-service.ts:2323, 1718 |
| Awaiting approval | Schedule paused with reason approval_required until answered; expires after 24 h | 0308 migration; schedule-service.ts:79 |
| Cancel | Run status cancelled | schedule-service.ts:2323 |
| Missed run | Policy run_once or skip with a grace of two sweep intervals | schedule-service.ts:83-102 |
| Secret or access refusal | Run ends with a skipped text and cancellation code | scheduled-agent-executor.ts:884-923 |
| Offline device, accessibility, empty state on mobile and CLI | not handled in the code read; empty state on web page: loading region 'Loading schedules' exists (SchedulesPage.tsx:1090) | unknown for other apps |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/cron/run-schedules/route.test.ts`: 401 without secret, bounded batch, stops on a short wave, keeps sweeping on full waves, 500 on failure.
- `apps/web/lib/services/schedule-service.test.ts`: Schedule service (by file name; not read).
- `apps/web/lib/services/schedule-service.policies.test.ts`: Schedule policies (by file name; not read).
- `apps/web/lib/services/scheduled-agent-executor.test.ts`: Executor behaviour (by file name; not read).
- `apps/web/lib/services/scheduled-agent-executor.tools.test.ts`: Tool plan for unattended runs (by file name; not read).
- `apps/web/features/schedules/components/SchedulesPage.test.tsx`: Includes the plan message for plans without scheduled tasks (line 178).
- `apps/web/db/neon/scheduled-task-rules-migration.test.ts`: Scheduled task rules migration (by file name; not read).

**Test scenarios**

- **Plan limit**
  1. Sign in on a Free account on local seeded data
  2. Open /chat/schedules
  - Expected: Message that scheduled tasks need a higher plan; Create is not usable.
- **Create from chat**
  1. On a paid test account ask: remind me every morning at 8 to summarise my notes
  2. Open Scheduled
  - Expected: A new task appears with the daily time.
- **Sweep and run**
  1. Make a task due now
  2. Call GET /api/cron/run-schedules with the secret
  - Expected: Response shows claimed 1; the run appears in history with a status.
- **Approval pause**
  1. Set Tool approvals to ask for everything
  2. Run a scheduled task that needs a connector write
  - Expected: Run goes to awaiting_approval and the schedule pauses; approving resumes it.
- **Long task**
  1. Schedule a task that takes about two minutes
  - Expected: Today expected: timeout near 40 seconds. Record the actual result.
- **Low power**
  1. Set AGI_DB_LOW_POWER=1 and call the route at minute 30
  - Expected: {skipped: db_low_power}.

**Where to look when it fails**

- Logs: 'Unauthorized scheduled-task cron request', 'Scheduled-task sweep ended with schedules still due', 'Scheduled task batch completed', 'Scheduled task could not be finalized; leaving the claim for lease expiry', 'Scheduled execution skipped by managed-compute access policy'.
- Tables: scheduled_task_runs.status, approval_expires_at, scheduled_tasks.paused_reason.
- Error names ScheduleLimitError, ScheduledAgentUnavailableError, UnattendedPolicyUnreadableError.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Scheduled runs are limited to about 40 seconds and do not use the durable run journal, checkpoints or the F092-08 budget.** Affects: Web scheduled tasks and the CLI and mobile clients that create them. Evidence: apps/web/app/api/cron/run-schedules/route.ts:16, 47-52; apps/web/lib/services/scheduled-agent-executor.ts:595-640. Work needed: Decide whether long scheduled work should move to the durable workflow.
- **Brief says tools needing approval are refused; code withholds or pauses them.** Affects: Brief accuracy; testers. Evidence: apps/web/lib/services/scheduled-agent-executor.ts:374-381, 619-620. Work needed: Correct the brief.
- **Shortest interval is 15 minutes (sweep cadence) and the sweep can be paused by low power.** Affects: All schedule users. Evidence: packages/platform/utils/src/scheduling/schedule-time.ts:259; cron-low-power.ts. Work needed: None if intended; keep the form note.
- **No Local-mode or on-device scheduler for free, byok or local-only plans on the hosted path.** Affects: Local and own-key users. Evidence: packages/contracts/types/src/billing-catalog.ts:590-640. Work needed: Product decision on whether schedules should work without a paid plan.
- **Mobile, CLI and Chrome schedule screens were not examined.** Affects: Mobile, CLI, Chrome. Evidence: apps/mobile/src/features/schedules/service.ts; apps/cli/src/schedules.rs. Work needed: Read and drive each app.

**Depends on**

- surface:web
- surface:cli
- surface:mobile
- surface:chrome
- mode:cloud
- api:GET /api/cron/run-schedules
- table:scheduled_tasks
- table:scheduled_task_runs
- F092-08
- F092-07
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-security-and-privacy
- SYS-observability-and-operations
- SYS-connectors-plugins-and-skills

## Unknown

- What the Mobile, CLI and Chrome schedule screens show and what they are called.
- Retention period for run history.
- Whether the 40 second run limit is intended for agent tasks.
- Which display plan names match the plan keys basic, pro, max, max_15x, team.
- Whether the CRON_SECRET check is enabled in every environment.
- Whether a local scheduler exists on Desktop or Mobile.
