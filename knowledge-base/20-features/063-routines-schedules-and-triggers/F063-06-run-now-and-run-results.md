---
id: "F063-06"
type: "feature"
title: "Run now and run results"
aliases: ["Run now", "Run History", "Latest result", "View Output", "Scheduled runs (mobile)", "Code: Run Schedule Now", "Code: Show Schedule Runs", "agi schedules run", "agi schedules runs", "Next run", "Last run", "S63.19 S63.20 S63.21 S63.22 S63.23"]
area: "63 Routines, schedules, and triggers"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S63.19", "S63.20", "S63.21", "S63.22", "S63.23"]
depends_on: ["F063-02", "F063-03", "F063-04", "F063-05", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "table:scheduled_task_runs", "api:POST /api/schedules/{id}/runs", "api:GET /api/schedules/{id}/runs", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-observability-and-operations", "SYS-agents-tools-and-automation"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F063-06 Run now and run results

Lets a person start a routine right now and read what each run produced. Each routine shows its next run and last run, and a paged run history with status, time and the output text. A manual run needs an Idempotency-Key, waits up to 40 seconds, and a repeat key returns the same run.

Area: [63. Routines, schedules, and triggers](README.md). Requirement items: [S63.19](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6319), [S63.20](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6320), [S63.21](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6321), [S63.22](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6322), [S63.23](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6323).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built (this page lists unfinished parts) | partly built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built (this page lists unfinished parts) | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Creates one run immediately, executes the agent in the request, stores status and output, and exposes next run, last run and history (apps/web/app/api/schedules/[id]/runs/route.ts:65-103; apps/web/lib/services/schedule-service.ts:454-481, 1456-1486, 1495-1630).

**Why it exists.** People need to test a routine, rerun it, and trust it by reading real outputs. The product contract lists run history and results as required (doc: docs/product/requirements.md:1583-1590).

**Who uses it.** Routine owners on every app; developers via the API.

**Problems it solves**

- Waiting for the next scheduled time to test
- Not knowing if a routine worked
- Double runs from a repeated tap or retry

**Use cases**

- Press Run now after editing the prompt
- Open History to read last Friday's review
- Approve a step a run paused on
- CLI: agi schedules run 'Weekly review'

## 2. User experience

**Where to find it**

- Web and public Electron Desktop: card menu 'Actions for <name>' then 'Run now'; icon 'Run History' (View or Hide History); button 'Latest result'; list 'Recent results' (ScheduleCard.tsx:385-452; RecentScheduleResults.tsx).
- Tauri desktop: 'Run now' button on each row (DesktopCloudSchedules.tsx:1247).
- Mobile: card action 'Run now' and 'History' with a 'Run History' section; header icon 'Scheduled runs' opens all runs (ScheduleCard.tsx:225, 357; runs.tsx:153-352).
- CLI: agi schedules run <id-or-name> and agi schedules runs <id-or-name> --limit --offset (lib.rs:1584-1602).
- Chrome: 'Run now' button and 'Runs' view per schedule (schedulesSection.ts:916, 1123-1140, 1270).
- VS Code: commands 'Code: Run Schedule Now' and 'Code: Show Schedule Runs' in the schedules tree (package.json:631-637).

**Before you start**

- Signed in; routine exists
- Routine active, not expired, not at run limit, credit cap not reached
- Plan still allows unattended runs at run time

**Screens and controls**

- Run now (VS Code asks 'Run it now' first)
- Run History list: status label (needs approval, success, failed, timeout, cancelled, running) and time; 'View Output' details; 'Load more'; Approve and Deny for a paused run
- Next run and Last run text on the card; 'Last run: <error>' when failed
- Mobile 'Report this run'

**Journey**

1. Press Run now
2. A spinner shows while the run executes (up to about 40 seconds)
3. On finish the card shows 'Schedule finished successfully.' or the status
4. Open Run History and 'View Output' to read the text
5. If the run is paused for approval, approve or deny in the same list

**What the person sees and gets**

- Status message in a live region (web SchedulesPage.tsx:660-675)
- Chrome: 'Run started.' or 'That run was already queued.'
- VS Code toast states the run result or 'this run already happened'
- Output text with internal reasoning removed (schedule-service.ts:444-452)
- Notes such as 'Ran late: scheduled for ... started ... later.' or 'Skipped the run scheduled for ...' (schedules.ts:740-757)

**Settings**

- Routine notifications switches (web form)
- Retries and missed-run policy (F063-04)
- Credit cap and Maximum Runs (ScheduleForm.tsx:744-770)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/schedules/{id}/runs: rate limit, CSRF, required Idempotency-Key (8 to 128 URL-safe characters), claim with a 45 s lease, execute with a 40 s timeout, return 201 with the run; a replay returns 200 with replay true, or a conflict while the first is still running (runs route.ts:65-103; schedule-service.ts:1489-1493).
- Run now refuses a paused, disabled, expired routine, one at its run limit, or at its credit cap, with a conflict (schedule-service.ts:1568-1590).
- Manual run increments execution_count and last_executed_at in the same transaction (schedule-service.ts:1608-1622; schedule-service.test.ts:941).
- Run statuses running, success, failed, timeout, cancelled, awaiting_approval (packages/contracts/cloud-contracts/src/schedules.ts:247).
- Output text is the answer with reasoning removed and also returned as output (schedule-service.ts:444-481).
- History: GET /api/schedules/{id}/runs, newest first, page 20 default and 100 max; recent runs across routines: GET /api/schedules/runs (runs route.ts:36-58; schedules.ts:9-10).
- Web polls only routines that are due, every 6 seconds, only while the tab is visible and within a 2-minute window (SchedulesPage.tsx:380-440, 140, 150).
- Web shows 'Latest result' and a recent results list; mobile shows per-routine history and an all-runs screen; CLI prints output lines and says '--json has the full output' (schedules.rs:448-480); VS Code opens run output in a document; Chrome renders output as markdown (schedulesSection.ts:1065-1090).
- Next and last run on cards for web, mobile, CLI, VS Code and Chrome (ScheduleCard.tsx:209-267; mobile ScheduleCard.tsx:218-240; schedules.rs:340-350; schedulePresentation.ts:78-90).
- Approval: a run that needs approval pauses as awaiting_approval and resumes after approve or deny; it expires after the approval window (schedule-service.ts:1874, 1957, 2424).
- Missed or skipped occurrences are explained in the history note (ScheduleRunHistory.tsx:150-160; schedules.ts:740-757).

**Incomplete**

- Mobile replaces the server's error text with a generic sentence per status (apps/mobile/src/features/schedules/service.ts:132-141).
- Run now on mobile generates its own key per tap, so a double tap with different keys can start two runs only if both pass the conflict rules [inferred]; the web reuses a key per routine until it ends (SchedulesPage.tsx:633-640).
- The brief marks CLI run as missing but code has agi schedules run (lib.rs:1584-1590, 4488-4500).

**Present but disconnected or switched off**

- On plans that no longer allow unattended runs the run is recorded cancelled with 'Scheduled execution skipped' text; the Tauri panel blocks the button with an upgrade message (executor:889-911; DesktopCloudSchedules.tsx:815).

**Not available**

- Cancel a running manual run from the apps: not found beyond closing the request (the route passes request.signal).
- Deferred execution after the allowance resets (brief S63.34) and connection-expiry repair (S63.35): missing everywhere.
- Mobile Local mode: gated.

## 4. Required behaviour

**Established requirements**

- A 'Run now' control starts the routine immediately and the run completes with a result. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.19)
- Each routine shows when it will next run. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.20)
- Each routine shows when it last ran and whether it failed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.21)
- A list of past runs with status and time. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.22)
- Opening a run shows its output text, not only status. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.23)
- Run now requires an Idempotency-Key; repeating it returns the same run; 409 while still running. (source: apps/web/public/openapi.json '/schedules/{id}/runs' post; apps/web/app/api/schedules/[id]/runs/route.ts:76-95)
- One occurrence creates at most one run; results and failures enter run history; opted-in notifications arrive once. (source: doc: docs/product/experience-contract.md:790)
- When a scheduled occurrence is missed or skipped the history says so and why. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.33)

**Acceptance criteria**

1. Run now without Idempotency-Key returns a validation error
2. Same key twice returns the same run, not a second execution
3. Run now on a paused routine returns a conflict
4. Run now on a routine at its credit cap returns a conflict naming the cap in credits
5. A finished run lists with status, time and 'View Output' text
6. History pages 20 at a time and 'Load more' adds the next page
7. The output shown never contains the model's internal reasoning
8. A run still going after 40 s returns with status timeout

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web, mobile and CLI should all reuse a key across a retry of the same tap [inferred from the web ref pattern].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the real error text on mobile when it is safe.
- [proposed] Add a cancel control for a running manual run.
- [proposed] Hold a run that hits the allowance and resume it after reset (S63.34).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST and GET /api/schedules/{id}/runs | `apps/web/app/api/schedules/[id]/runs/route.ts` | Run now and history |
| endpoint | GET /api/schedules/runs | `apps/web/app/api/schedules/runs/route.ts` | Recent runs across routines |
| endpoint | POST /api/schedules/{id}/runs/{runId}/approval | `apps/web/app/api/schedules/[id]/runs/[runId]/approval/route.ts` | Approve or deny a paused run |
| service | createManualScheduleRun, createOnDemandScheduleRun | `apps/web/lib/services/schedule-service.ts` | Idempotent claim (lines 1495, 1527) |
| service | processClaimedScheduleRun, runClaimedSchedule, finalizeScheduleRun | `apps/web/lib/services/schedule-service.ts` | Execute and store result (lines 2045, 2198, 1653) |
| service | mapScheduleRun, listScheduleRuns, listRecentScheduleRuns | `apps/web/lib/services/schedule-service.ts` | Shape and page runs (lines 454, 1456, 1418) |
| service | executeScheduledAgent | `apps/web/lib/services/scheduled-agent-executor.ts` | The agent run (line 859) |
| table | scheduled_task_runs | `apps/web/db/neon/0009_scheduling.sql` | Run rows with status, result, error, idempotency key (line 34) |
| component | ScheduleCard | `apps/web/features/schedules/components/ScheduleCard.tsx` | Run now, history, latest result, next and last run |
| component | ScheduleRunHistory, RecentScheduleResults | `apps/web/features/schedules/components/ScheduleRunHistory.tsx` | History list with View Output |
| component | SchedulesPage runNow | `apps/web/features/schedules/components/SchedulesPage.tsx` | Run now handler, polling (lines 380-440, 633) |
| service | schedule-api | `apps/web/features/schedules/services/schedule-api.ts` | Web API client |
| screen | runs.tsx and ScheduleRunHistory | `apps/mobile/app/(app)/schedules/runs.tsx` | Mobile all-runs screen |
| service | triggerScheduleNow, fetchScheduleRuns | `apps/mobile/src/features/schedules/service.ts` | Mobile calls (lines 165, 268) |
| command | agi schedules run, runs | `apps/cli/src/schedules.rs` | CLI run_now (75 s client timeout) and runs |
| component | Runs view and Run now | `apps/extension/src/features/side-panel/schedulesSection.ts` | Chrome (lines 916, 1065-1140, 1270) |
| service | runNow client | `apps/extension/src/features/cloud-bridge/schedulesClient.ts` | Chrome call with a fresh key (line 291) |
| command | runScheduleNowInteractively, showScheduleRuns | `apps/extension-vscode/src/features/schedules/scheduleActions.ts` | VS Code commands (lines 127-155, 211) |
| service | describeScheduleRunTiming | `packages/contracts/cloud-contracts/src/schedules.ts` | Missed and skipped notes (line 740) |
| job | run-schedules cron | `apps/web/app/api/cron/run-schedules/route.ts` | Scheduled runs that fill history |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client sends POST with an Idempotency-Key. | device | SchedulesPage.tsx:633-640; mobile service.ts:268; schedules.rs:200 |
| Server locks the routine row, returns an existing run for the key, or checks state and caps and inserts a running run and bumps counts. | our servers | schedule-service.ts:1527-1630 |
| Executor re-checks access, applies secret handling, selects a model route, reserves usage, runs the model and tools. | our servers | scheduled-agent-executor.ts:859-1138 |
| Model and tool calls go to the provider or connector. | outside service | executor:1056-1100 |
| Run is finalised (success, failed, timeout, cancelled or awaiting approval) and the routine's next run moves on; the response returns the run. | our servers | schedule-service.ts:1653, 2198-2340; runs route.ts:93-98 |
| Client lists history by GET and shows output. | device and our servers | ScheduleRunHistory.tsx:140-160; runs route.ts:36-58 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run row: status, trigger_source, scheduled_for, started and completed times, duration, result JSON including text, error, idempotency key 'manual:<key>', attempt count, usage credits | table scheduled_task_runs | Yes, one record for all apps | Deleted with the routine; account erasure covered by apps/web/lib/server/__tests__/scheduled-account-erasure.test.ts; other retention unknown |
| Managed usage reservation and settlement | managed usage ledger (managed-usage-request-service) | Server only | unknown |
| Notifications for finished runs | notification service | Per notification settings | unknown |

**Models and providers.** The routine's stored model (Auto or a catalog model) is routed on our servers; usage is billed to the account's credits; output capped at 4,096 tokens; runs that must keep inputs out of training refuse to start when no such model is available (executor:161, 719-722).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account; VS Code and CLI use account tokens; Chrome signs in through Clerk (schedulesSection.ts:340). |
| Permissions | Routine owner only (object-level owner predicate, schedule-service.ts:1531); CSRF for browser; workspace access policy at execution through evaluateManagedComputeAccess 'schedules' (executor:889-911); approval of a paused step by the owner. |
| Subscription | Plan limit counts routines, not runs. Execution needs the plan to still allow scheduled runs; otherwise the run is cancelled with a message. Basic and up (billing-catalog.ts:644-723). |
| Limits and metering | Idempotency key 8-128 characters; 40 s wait; maxDuration 60 s; sweep handles up to 50 runs per sweep; per-routine credit cap up to 1,000,000 credits and Maximum Runs up to 1,000,000 (schedule-service.ts:731-745; schedules.ts:12); usage reserved per run. |
| Feature flags | Mobile FEATURES.schedules true. |
| Model compatibility | As F063-03. |
| Provider restrictions | none found beyond training-opt-out routing. |
| Local mode | Not available in Local mode: mobile shows the Cloud gate; CLI refuses before any request; Tauri panel Managed only. On-device local routines on the Electron Desktop have their own run list ('Open run') and are separate (LocalRoutinesSection.tsx:264). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Skeleton and 'Loading run history'; Chrome 'Loading runs…'; mobile 'Loading scheduled runs' | ScheduleRunHistory.tsx:136-146; messages.json spSchedulesRunsLoading |
| Empty | 'No runs yet' (mobile), 'This schedule hasn't run yet.' (Chrome) | ScheduleRunHistory.tsx:321; messages.json |
| History error | Alert text and Retry | ScheduleRunHistory.tsx:150-160 |
| Run longer than 40 s | Status timeout; the person can read the error and run again | runs route.ts:93-96; schedule-service.ts:2310-2330 |
| Same key repeated | Same run returned; 409 while it is running | runs route.ts:87-91; schedule-runs.test.ts:106-125 |
| Paused for approval | Run shows needs approval; approve or deny; expires after the approval window with a message to resume | schedule-service.ts:70, 1874, 2424; ScheduleRunHistory.tsx:40-41 |
| Lease expired (worker lost) | Run is finalised by recovery | schedule-service.ts:2341-2420; schedule-service.test.ts:1232-1320 |
| Tab hidden | Polling pauses | SchedulesPage.tsx:399 |
| Offline or request failure | Row error 'Schedule could not be run.' | SchedulesPage.tsx:662 |
| Accessibility | Live region for results; status text beside icons; VS Code modal confirmation | SchedulesPage.tsx:1085-1093; ScheduleRunHistory.tsx:40-58 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/schedule-runs.test.ts`: History clamps pagination and stays owner-scoped, no cross-user disclosure, key required, malformed key, terminal run after execution, completed replay without re-execution, in-progress replay conflict
- `apps/web/lib/services/schedule-service.test.ts`: Manual run for another user refused, malformed key, disabled task refused, replay after disable, one run and count bump, finalize rules, lifecycle (success, failure, timeout, cancel), lease recovery, credit caps
- `apps/web/__tests__/api/schedule-recent-runs.test.ts`: Recent runs endpoint (case titles not read)
- `apps/web/features/schedules/components/ScheduleCard.test.tsx`: Card controls (case titles not read)
- `apps/web/features/schedules/components/SchedulesPage.test.tsx`: Opens history from a notification link, fetches a linked schedule outside page one
- `apps/web/features/schedules/types/schedule-run-usage.test.ts`: Run usage display (title-level)
- `apps/mobile/__tests__/ScheduleRunsScreen.test.tsx`: Mobile runs screen (title-level)
- `apps/mobile/src/features/schedules/__tests__/ScheduleRunHistoryReport.test.tsx`: Run history with Report this run (title-level)
- `apps/extension-vscode/src/__tests__/schedules.test.ts`: Status, cadence, next and last run wording, failed last run, manual run labelled run now, user-fixable failures, sign-in prompt, retry on listing failure
- `apps/extension/__tests__/schedule-action-controls.test.ts`: Chrome schedule action controls (case titles not read)
- `packages/contracts/cloud-contracts/src/__tests__/schedules.test.ts`: Run statuses preserved, idempotency key required before manual run dispatch
- `apps/web/lib/server/__tests__/scheduled-account-erasure.test.ts`: Erasure of scheduled data (title-level)

**Test scenarios**

- **Run now and read**
  1. Create an active routine
  2. Press Run now
  3. Open Run History and View Output
  - Expected: Status success within 40 s and the output text shown with no reasoning
- **Idempotent repeat**
  1. POST runs twice with the same key after the first finishes
  - Expected: Second returns replay true and the same run id; execution_count rose by one
- **Blocked states**
  1. Pause a routine and press Run now
  2. Set a credit cap already used and press Run now
  - Expected: Conflict 'Schedule is disabled or paused'; conflict naming the cap in credits
- **Approval path**
  1. Run a routine whose tool needs approval
  2. Approve in history
  - Expected: Status awaiting_approval then success after approval
- **CLI run and runs**
  1. agi schedules run 'name'
  2. agi schedules runs 'name' --limit 5
  - Expected: Run printed with up to a set number of output lines; history lists five runs
- **Free account run**
  1. On a lapsed plan call POST runs for an existing routine
  - Expected: Run recorded cancelled with 'Scheduled execution skipped' reason

**Where to look when it fails**

- scheduled_task_runs.status, error, result
- Log 'Scheduled execution skipped by managed-compute access policy'
- Errors ScheduleConflictError and ScheduleValidationError mapped to 409 and 400
- Sweep log 'Scheduled-task cron batch failed'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/web/063-routines-schedules-and-triggers.md)
- Desktop: [70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md)
- Mobile: [70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md)
- CLI: [70-qa/test-plans/cli/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/cli/063-routines-schedules-and-triggers.md)
- VS Code: [70-qa/test-plans/vscode/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/vscode/063-routines-schedules-and-triggers.md)
- Chrome: [70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md)

## 10. Gaps and dependencies

- **Brief says CLI run missing; code has agi schedules run** Affects: Brief accuracy. Evidence: apps/cli/src/lib.rs:1584-1590, 4488-4500. Work needed: Correct S63.19 for CLI
- **Brief says Chrome runs list missing; code has a Runs view** Affects: Brief accuracy. Evidence: schedulesSection.ts:1065-1140. Work needed: Correct S63.22 for Chrome
- **Deferred execution after the allowance resets is not built** Affects: All apps. Evidence: Brief S63.34; executor records a cancelled run when access is denied (executor:889-911). Work needed: Design held runs and a resume sweep
- **Connection-expiry repair flow not built** Affects: All apps. Evidence: Brief S63.35. Work needed: Detect expired connector on run, show on routine, link to reconnect
- **Mobile shows generic error text** Affects: Mobile users. Evidence: apps/mobile/src/features/schedules/service.ts:132-141. Work needed: Show a safe reason
- **Manual run is waited inside one request limited to 60 s** Affects: Long routines on every app. Evidence: runs route.ts:26, 95. Work needed: Return a pending run and let clients poll
- **API-started runs are marked manual** Affects: History readers. Evidence: schedule-service.ts:1495-1500. Work needed: Record the real source
- **Run notification preferences are web-form only for routines (brief S63.30 CLI missing)** Affects: CLI users. Evidence: ScheduleForm.tsx:696-710. Work needed: Decide parity

**Depends on**

- F063-02
- F063-03
- F063-04
- F063-05
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- table:scheduled_task_runs
- api:POST /api/schedules/{id}/runs
- api:GET /api/schedules/{id}/runs
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-observability-and-operations
- SYS-agents-tools-and-automation

## Unknown

- Retention period of scheduled_task_runs rows and managed usage rows.
- Whether notifications for finished runs arrive once on every app.
- Cases inside ScheduleCard.test.tsx, schedule-recent-runs.test.ts, ScheduleRunsScreen.test.tsx and schedule-action-controls.test.ts.
- Whether a client can cancel an in-flight manual run beyond aborting the request.
