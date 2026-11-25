---
id: "F063-09"
type: "feature"
title: "Missed runs, retries and held runs"
aliases: ["Missed runs, retries and held runs", "Missed-run explanation (S63.33)", "Deferred execution after allowance reset (S63.34, not built)", "Connection-expiry repair flow (S63.35, not built)", "If A Run Is Missed / missedExecutionPolicy", "run_once / skip", "Retries After A Failed Run / retryMaxAttempts", "First Retry After (Minutes) / retryBackoffSeconds", "Ran late / Skipped note (describeScheduleRunTiming)"]
area: "63 Routines, schedules, and triggers"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S63.33", "S63.34", "S63.35"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "table:scheduled_tasks", "table:scheduled_task_runs", "SYS-observability-and-operations", "SYS-subscriptions-entitlements-and-usage", "SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-api-and-contracts", "SYS-execution-boundaries", "SYS-model-catalog-and-routing", "F063-07", "F063-08"]
basis: "code inspection"
second_reader: "9 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F063-09 Missed runs, retries and held runs

Explains and handles runs that did not happen on time or failed. The Cloud sweep decides a run is missed when it starts more than two sweep intervals late and then runs it late once or skips it, as the owner chose, and the run history says so. Failed or timed-out runs retry with doubling waits. Holding runs for usage resets and repairing expired connectors are not built.

Area: [63. Routines, schedules, and triggers](README.md). Requirement items: [S63.33](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6333), [S63.34](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6334), [S63.35](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6335).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Records why an occurrence ran late or was skipped, applies the owner's 'If A Run Is Missed' choice, retries failed or timed-out runs a chosen number of times with doubling waits, and writes an audit event for missed runs. On Electron Desktop, Local routines have their own missed-run choice and a 2 minute grace.

**Why it exists.** The Cloud sweep runs about every 15 minutes, machines sleep, and models fail. People need to see what happened to an occurrence instead of guessing (doc: knowledge-base/data/area-briefs/063-routines-schedules-and-triggers.md, S63.33 to S63.35).

**Who uses it.** Owners reading run history on any app; operators reading audit events.

**Problems it solves**

- A routine fired hours late: the history says 'Ran late: scheduled for X, started Y later.'
- A stale occurrence should not run: choose skip and see 'Skipped the run scheduled for X'.
- A flaky run: retries try again before the routine moves on.
- A skipped run must not use up the run limit: the slot is given back.

**Use cases**

- Morning digest that is pointless after noon: set 'Skip it and wait for the next occurrence'.
- Billing report that must still happen: keep 'Run it once, late'.
- Flaky external site: Retries After A Failed Run 3, first retry after 5 minutes.
- Check why a routine did not run overnight in the run history.

## 2. User experience

**Where to find it**

- Web: card History button, each run row shows a badge ('skipped' when skipped) and a grey note; the 'If A Run Is Missed' choice sits in the form section 'When It May Run, And What Happens If It Fails' (apps/web/features/schedules/components/ScheduleRunHistory.tsx:76-87, :165-169; ScheduleForm.tsx:555-557, :644-662).
- Desktop (Electron): the same Web page; Local routines dialog has 'If a run is missed' (apps/web/features/schedules/components/LocalRoutinesSection.tsx:553-560 region, label at 'local-routine-missed').
- Desktop (internal Tauri): run history rows show the same note via describeScheduleRunTiming (apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:997, :1422); no missed or retry fields in its form.
- Mobile: note under the run status in run history (apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx:213-216; apps/mobile/src/features/schedules/service.ts:142).
- CLI: agi schedules runs <id> prints 'ran late for the occurrence due <time>' for late runs; a skipped run shows as cancelled with the server's error text (apps/cli/src/schedules.rs:489-499, :631-668).
- VS Code: run list detail and the label 'Skipped' (apps/extension-vscode/src/features/schedules/schedulePresentation.ts:118-136, :154-157).
- Chrome side panel: note under each run (apps/extension/src/features/side-panel/schedulesSection.ts:1077-1078).

**Before you start**

- A Cloud routine that has had at least one late, skipped or failed occurrence.
- Retries only apply to occurrences started by the schedule, not manual runs (schedule-service.ts:1713-1716).

**Screens and controls**

- 'If A Run Is Missed' select: 'Run it once, late' or 'Skip it and wait for the next occurrence'; helper: 'A missed occurrence is recorded on the run history and written to the audit log either way.' (ScheduleForm.tsx:644-662).
- 'Retries After A Failed Run' (0 to 5) and 'First Retry After (Minutes)' (1 to 1440); helper: 'A failed or timed-out run is tried again after this wait, doubling each time, before the schedule moves on to its next occurrence.' (ScheduleForm.tsx:592-640).
- 'Only Run During' window: an occurrence outside the window is not run late; it moves to the next one inside it (ScheduleForm.tsx:561-585).
- Run row badge and note (Web ScheduleRunHistory.tsx:87, :165-169).

**Journey**

1. Choose the missed-run policy and retry settings in the routine form and save.
2. The sweep claims a due occurrence. If it is more than the grace period late, the missed-run rule applies.
3. Run it once, late: the run goes ahead and its result carries the missed-run details; the history says 'Ran late: scheduled for <when>, started <how late> later.'
4. Skip: the run is recorded as cancelled with skipped, the run slot is returned, and the history says 'Skipped the run scheduled for <when>: it was missed by <how late>, and this schedule skips missed runs.'
5. If a run fails or times out and retries remain, the routine is scheduled again after the wait (doubling) for the same occurrence.
6. Open run history to read notes, errors and output.

**What the person sees and gets**

- Notes from describeScheduleRunTiming: 'Ran late...' and 'Skipped the run scheduled for...' and, for condition watches, 'Skipped: the condition was not met. <detail>' (packages/contracts/cloud-contracts/src/schedules.ts:740-765).
- Run error text for a skip: 'Skipped the occurrence scheduled for <time>: it was missed by more than the grace period' (schedule-service.ts:2264).
- Audit event type schedule_missed_execution with outcome success for run late and failure for skip (schedule-service.ts:2120-2138).
- Failed or timed-out status badge and error text on the run (ScheduleRunHistory.tsx:87, :172-176).

**Settings**

- missedExecutionPolicy (run_once default, skip) (schedule-service.ts:760-763).
- retryMaxAttempts 0 to 5, default 0; retryBackoffSeconds 60 to 86,400, default 300 (schedule-service.ts:86-89, :741-757).
- AGI_DB_LOW_POWER environment setting raises the grace to two hours and limits sweeps (apps/web/lib/server/cron-low-power.ts:6-21; schedule-service.ts:81-85).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Detection: late by more than missedExecutionGraceMs counts as missed; applies only to scheduled, first attempts (schedule-service.ts:2102-2118). Grace is twice the 15 minute sweep interval (30 minutes) or twice an hour in low-power mode (packages/platform/utils/src/scheduling/schedule-time.ts:259; schedule-service.ts:81-85).
- Policy: skip finalizes the run as cancelled with {missedExecution, skipped:true}, returns the run slot; run_once continues and stores the missed details in the result; both write an audit event (schedule-service.ts:2256-2268, :2120-2138, :2156-2166).
- A run that resumes after approval keeps its missed-run details (schedule-service.ts:2220, :2039).
- A run resumed after approval skips both missed detection and the condition check (`if (!options.resume)`) (schedule-service.ts:2256-2257).
- Retries: failed or timeout, scheduled triggers only, while retriesSpent is below retryMaxAttempts, no cap reached and the expiry not passed; delay is backoff doubled per retry, exponent capped at 10, capped at one day; a retry claims under its own key and does not spend a run (schedule-service.ts:1643-1647, :1713-1735; :1381-1382).
- A reached credit cap stops retries: when a retry would otherwise fire, the cap pauses the routine instead, via isCreditCapReached in the retry predicate and the pauseForCreditCap path (schedule-service.ts:1643-1647, :2130-2250).
- Shared note text via describeScheduleRunTiming, used by Web, Tauri desktop, Mobile, VS Code and Chrome (see user_experience).
- Condition-not-met runs are also recorded as skipped and give the run slot back (schedule-service.ts:2269-2277). Their stored status is 'cancelled' with the error 'Condition not met: ...', unlike the missed-run skip error text 'Skipped the occurrence scheduled for ...' (schedule-service.ts:2269-2277).
- Electron Local routines: missed beyond 120 seconds with policy skip records a run in state 'skipped'; run_once starts it; a computer sleep marks the interrupted claim and never replays it (apps/desktop/electron/runtime/localRoutineEngine.ts:145, :511-537; test title apps/desktop/electron/__tests__/localRoutineEngine.test.ts:587).
- Expired worker leases are recovered by the sweep so a run does not stay 'running' for ever (schedule-service.ts:2360-2400; exact recovery steps not read).

**Incomplete**

- CLI shows only 'ran late' lines from the result; a skipped run appears as cancelled with the error text, not as 'skipped' (apps/cli/src/schedules.rs:489-499).
- Mobile replaces a cancelled run's error with 'This run was canceled.' and so loses the skip explanation text except the timing note (apps/mobile/src/features/schedules/service.ts:126-131).
- Missed and retry fields are only on the Web form (and Local missed choice on Electron); Mobile, CLI, VS Code, Chrome, Tauri desktop cannot set them (no matches in those apps' schedule code).
- A routine whose owner left the workspace is not claimed and only a server warning is logged; the owner sees nothing on the routine (schedule-service.ts:1317-1335).

**Present but disconnected or switched off**

- In low-power mode the cron route returns early after the first 15 minutes of each hour (apps/web/app/api/cron/run-schedules/route.ts:28; cron-low-power.ts:17-19).

**Not available**

- Held run that waits for the usage allowance to reset and then runs: no code found; brief S63.34 missing on every app.
- Expired connector repair flow: no code found in schedule-service, the executor or the web schedules feature for reconnect or expired connectors; brief S63.35 missing on every app.
- Chrome: the brief says no missed-run note, but code shows one (schedulesSection.ts:1077-1078); the brief is out of date.

## 4. Required behaviour

**Established requirements**

- S63.33: when an occurrence is missed or skipped, the run history says so and why. Done on Web, Desktop, Mobile, CLI, VS Code; the brief lists Chrome as none. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.33)
- S63.34: a run that hits the usage allowance is held and runs automatically after the allowance resets. Missing on every app. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.34)
- S63.35: when a connector a routine depends on expires, the user is told on the routine and led to reconnect. Missing on every app. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.35)
- A run is missed when it starts more than twice the sweep interval late; run_once runs it late, skip records it and gives the run slot back; both write an audit event. (source: apps/web/lib/services/schedule-service.ts:83-85, :2102-2138, :2156-2166)
- Failed or timed-out scheduled runs retry with doubling wait up to the chosen count (0 to 5). (source: apps/web/lib/services/schedule-service.ts:86-89, :1643-1647, :1713-1735)
- The note text comes from describeScheduleRunTiming in the shared contracts. (source: packages/contracts/cloud-contracts/src/schedules.ts:740-765)
- Mobile v1 only needs the pieces required for Cloud sign-in and future dispatch; Desktop and CLI carry deeper automation later. (source: doc: docs/product/requirements.md (section 20))

**Acceptance criteria**

1. A scheduled occurrence started more than 30 minutes after its due time (normal mode) is treated as missed; one started within 30 minutes is not.
2. With 'Run it once, late' the run executes and its history note reads 'Ran late: scheduled for <time>, started <duration> later.'
3. With 'Skip it...' no model call happens, the run shows as skipped with the skip note, and the routine's run counter is not increased by that occurrence.
4. Both policies create a schedule_missed_execution audit event.
5. With Retries After A Failed Run 2 and first retry 5 minutes, a failed run is tried again after 5 minutes, then 10 minutes, then the routine moves on; a manual run is not retried.
6. A retry does not reduce the Maximum Runs allowance.
7. Run history on Web, Mobile, VS Code and Chrome shows the same note text for the same run.
8. A Local routine on Electron with skip and a due time more than 2 minutes old shows state 'skipped'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The Chrome run list should show missed notes because it calls the shared function, but no test title for it was found [inferred] (schedulesSection.ts:1077).
- A usage-allowance refusal currently surfaces as a failed run (which retries if configured) because the reservation call is not guarded in runClaimedSchedule [inferred] (scheduled-agent-executor.ts:1056; schedule-service.ts:2309-2335).
- The two-sweep grace means a routine only appears missed after about 30 minutes, which is roughly two missed cron ticks [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Hold a run that hits the allowance, show 'Waiting for your allowance to reset', and run it after the reset time.
- [proposed] When a connector token has expired, mark the run and the routine with a repair link to the connector screen.
- [proposed] Show the skip note on CLI and Mobile with the same wording as Web.
- [proposed] Tell the owner on the routine when a workspace departure stops it from running.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | detectMissedExecution and missedExecutionGraceMs | `apps/web/lib/services/schedule-service.ts` | Missed detection and grace (lines 83-85, 2102-2118) |
| service | runClaimedSchedule | `apps/web/lib/services/schedule-service.ts` | Applies skip or run_once, condition skip, error to status mapping (lines 2198-2335) |
| service | auditMissedExecution | `apps/web/lib/services/schedule-service.ts` | Audit event schedule_missed_execution (2120-2138) |
| service | releaseExecutionSlot | `apps/web/lib/services/schedule-service.ts` | Gives back a run slot for a skipped occurrence (2156-2166) |
| service | finalizeScheduleRun retry branch and retryDelaySeconds | `apps/web/lib/services/schedule-service.ts` | Retry decision and doubling wait (1643-1735) |
| service | claimDueScheduleRuns | `apps/web/lib/services/schedule-service.ts` | Claims due routines, own idempotency key for retries (1341-1410) |
| service | recoverExpiredScheduleRun and findExpiredClaims | `apps/web/lib/services/schedule-service.ts` | Lease recovery (2360-2420) |
| job | cron run-schedules | `apps/web/app/api/cron/run-schedules/route.ts` | Sweep waves; low-power skip (line 28) |
| config | cron entry for run-schedules | `vercel.json` | Every 15 minutes (lines 50-51) |
| config | SWEEP_INTERVAL_MS | `packages/platform/utils/src/scheduling/schedule-time.ts` | 15 minute sweep interval (line 259) |
| config | low-power switch | `apps/web/lib/server/cron-low-power.ts` | AGI_DB_LOW_POWER and cron skip window |
| schema | describeScheduleRunTiming | `packages/contracts/cloud-contracts/src/schedules.ts` | Shared note text for all clients (740-765) |
| component | RunRow (Web) | `apps/web/features/schedules/components/ScheduleRunHistory.tsx` | Badge and note |
| component | ScheduleForm missed and retry fields | `apps/web/features/schedules/components/ScheduleForm.tsx` | Inputs (592-662) |
| component | DesktopCloudSchedules run history | `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx` | Tauri note display (997, 1422) |
| service | mapRun (mobile) | `apps/mobile/src/features/schedules/service.ts` | Adds timingNote, replaces error text (lines 123-146) |
| component | Mobile RunRow | `apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx` | Shows timingNote (213) |
| command | CLI run_outcome_lines / render_runs | `apps/cli/src/schedules.rs` | Prints ran-late line (489-499, 631-668) |
| component | schedulePresentation (VS Code) | `apps/extension-vscode/src/features/schedules/schedulePresentation.ts` | Run label 'Skipped' and detail (118-157) |
| component | Chrome buildRunEntry | `apps/extension/src/features/side-panel/schedulesSection.ts` | Note and error per run (1067-1090) |
| service | LocalRoutineEngine tick | `apps/desktop/electron/runtime/localRoutineEngine.ts` | Local missed-run policy with 120 second grace (145, 480-537) |
| table | scheduled_tasks and scheduled_task_runs | `apps/web/db/neon/0209_scheduled_task_rules_and_policies.sql` | missed_execution_policy and retry columns |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Vercel cron calls /api/cron/run-schedules every 15 minutes; in low-power mode it returns early after minute 15 of the hour. | our servers | vercel.json:50-51; apps/web/app/api/cron/run-schedules/route.ts:28; apps/web/lib/server/cron-low-power.ts:17-19 |
| The sweep cancels expired approvals, recovers expired leases, then claims due routines (enabled, active, next run due, not past expiry, under run limit unless retrying, owner allowed to run unattended and active in the workspace). The claim inserts a run row with an idempotency key built from the due time and retry number. | our servers | schedule-service.ts:1341-1410, :2477-2492 |
| For each claim, the cap check runs; then missed detection compares now with the due time; skip policy finalizes the run as cancelled, run_once continues. A run resumed after approval skips missed detection and the condition check. | our servers | schedule-service.ts:2238-2268 |
| The executor runs the routine (model call to the provider); on error the status becomes failed, on timeout timeout, on outside cancel cancelled. | outside service | schedule-service.ts:2309-2335; apps/web/lib/services/scheduled-agent-executor.ts:866-1187 |
| finalizeScheduleRun writes the run result and decides the next time: retry with doubling delay, or next occurrence, or completed/expired, or pause at cap (a reached credit cap pauses the routine instead of retrying); failed and timed-out runs queue a notification, cancelled ones do not. | our servers | schedule-service.ts:1653-1810, :1822-1847; :1643-1647, :2130-2250 |
| Clients list runs; the shared function turns the stored missedExecution and skipped fields into the note text. | device | packages/contracts/cloud-contracts/src/schedules.ts:740-765; ScheduleRunHistory.tsx:76 |
| Electron Local routines: the on-device engine ticks every second and applies its own missed rule with a 120 second grace. | device | apps/desktop/electron/runtime/localRoutineService.ts:226-240; localRoutineEngine.ts:480-537 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Missed details {policy, scheduledFor, detectedAt, lateByMs} and skipped flag | scheduled_task_runs.result (JSON) | Returned with each run through the API | With the run; removed when the routine is deleted |
| Retry state (retry_attempt, retry_scheduled_for, attempt_count) | scheduled_tasks and scheduled_task_runs | attemptCount returned with the run | Reset to zero on resume (schedule-service.ts:1269) |
| Audit event schedule_missed_execution | audit log via recordAuditEvent (storage table not opened) | Server side only | unknown |
| Local routine run states (skipped, cancelled, completed) up to 20 runs | Electron device store | No | Oldest dropped beyond 20 (localRoutineEngine.ts:144, :519) |

**Models and providers.** The missed and retry logic does not depend on a model. A retried or late run goes through normal route selection; retries of a failed provider call use the same managed path. Nothing in this feature switches model or provider on failure (no such code found in the retry branch). The on-screen text for Electron Local routines says the model may still run in the cloud, so a Local routine's model call can leave the device (LocalRoutinesSection.tsx:199).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account to read history; the sweep acts for the routine owner and skips owners whose account state forbids unattended work or who left the workspace (schedule-service.ts:1366-1368, :1317-1335). |
| Permissions | Owner reads their own runs. Workspace admin visibility of skipped work: only a server log line (schedule-service.ts:1328-1335). |
| Subscription | A run for an account without managed compute access is cancelled by the executor with a reason (scheduled-agent-executor.ts:889-915). A usage-allowance hold: none found in the code. |
| Limits and metering | Retries 0 to 5; backoff 60 to 86,400 seconds, default 300; retry delay doubles with the exponent capped at 10 (schedule-service.ts:86-89, :1643-1647). Retries do not spend a run (schedule-service.ts:1381-1382). A reached credit cap stops retries and pauses the routine (schedule-service.ts:1643-1647, :2130-2250). Sweep batch limits are in the cron route (not detailed). |
| Feature flags | AGI_DB_LOW_POWER (cron-low-power.ts:6-21). Others: none found. |
| Model compatibility | None found in the code for missed or retry rules. |
| Provider restrictions | None found in the code for these rules. |
| Local mode | Cloud sweep, retries and the missed policy do not apply in Local mode. Electron Local routines have a skip-or-run missed rule with a 2 minute grace, run only while the Desktop app is open, and have no retry code (a grep for 'retry' in localRoutine*.ts found nothing) (localRoutineEngine.ts:145, :511-537; LocalRoutinesSection.tsx:199, the text 'Runs while the Desktop app is open'). The same on-screen text adds that the model may still run in the cloud, so a Local routine's model call can leave the device (LocalRoutinesSection.tsx:199). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Late within grace | Not missed; runs normally with no note | schedule-service.ts:2111 |
| Late beyond grace, run_once | Runs, note 'Ran late...' | schedule-service.ts:2256-2258; cloud-contracts schedules.ts:757 |
| Late beyond grace, skip | Run cancelled and shown as skipped; slot returned | schedule-service.ts:2259-2268 |
| Retry attempt | Not checked for missed again; keeps the same occurrence | schedule-service.ts:2106; :1727 |
| Manual run fails | Not retried | schedule-service.ts:1713-1716; test title schedule-service.policies.test.ts:288 |
| Retries exhausted | Routine moves to its next occurrence | schedule-service.ts:1736-1773 |
| Credit cap reached when a retry would fire | No retry; the routine is paused via the pauseForCreditCap path | schedule-service.ts:1643-1647, :2130-2250 |
| Run resumed after approval | Skips both missed detection and the condition check; keeps its earlier missed details | schedule-service.ts:2256-2257 |
| Condition-watch skip | Stored as status 'cancelled' with the error 'Condition not met: ...', not the missed-run skip text 'Skipped the occurrence scheduled for ...'; slot returned | schedule-service.ts:2269-2277 |
| Timeout | Status timeout; retried like a failure | schedule-service.ts:2321-2323, :1717 |
| Worker died | Lease expiry recovery ends the run with 'Worker lease expired before a terminal result was recorded' | schedule-service.ts:2360 |
| Owner left workspace | Routine is never claimed; a warning is logged | schedule-service.ts:1317-1335 |
| Sleep or offline on Electron | Engine suspends on sleep; interrupted claim is marked and not replayed | localRoutineService.ts:218-232; test title localRoutineEngine.test.ts:587 |
| Usage allowance exhausted | Not handled as a hold; surfaces as a failed run (inferred) | scheduled-agent-executor.ts:1056 [inferred] |
| Connector expired | not handled in the code as a repair flow | no reconnect handling in schedule-service.ts or scheduled-agent-executor.ts |
| Accessibility | Web note is plain text in the run row; Mobile and VS Code show the same text; no extra role found | ScheduleRunHistory.tsx:165-169 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/schedule-missed-grace.test.ts`: Two sweeps of lateness at normal cadence (13); two hourly sweeps in low-power mode (18).
- `apps/web/lib/services/schedule-service.policies.test.ts`: Retry claimed under its own key without spending a run (235); retry scheduled after backoff (250); no retry for hand-started runs (288); skips a late occurrence and audits it (305); policy refusal without retry or notice (532); says nothing for skipped or cancelled runs (626).
- `apps/web/lib/services/schedule-service.test.ts`: Terminal run states and lease handling (titles 1072, 1114, 1252, 1320).
- `apps/web/features/schedules/types/schedule-run-usage.test.ts`: Run usage display helpers (not the timing note).
- `apps/mobile/__tests__/schedule-service.test.ts`: Maps terminal run states and does not expose provider diagnostics (222, 244).
- `apps/extension-vscode/src/__tests__/schedules.test.ts`: Names a manual run and keeps the server's error text (127); lists run history with outcomes (283).
- `apps/desktop/electron/__tests__/localRoutineEngine.test.ts`: Elapsed one-shot with the selected missed-run policy (697); sleep interruption never duplicated (587).
- `apps/extension/__tests__/schedule-action-controls.test.ts`: Chrome schedule controls; no missed-note test found by title.

**Test scenarios**

- **Run it once, late**
  1. Create a routine with 'Run it once, late'.
  2. Prevent the sweep for over 30 minutes (stop cron in a test database).
  3. Run the sweep.
  - Expected: Run executes; history note 'Ran late: scheduled for <time>, started <duration> later.'; an audit event exists.
- **Skip**
  1. Set 'Skip it and wait for the next occurrence'.
  2. Repeat the delay and sweep.
  - Expected: Run is skipped, no output, no credits; Runs counter unchanged; next occurrence is scheduled.
- **Retries with doubling**
  1. Set Retries After A Failed Run 2 and First Retry After 5 minutes.
  2. Make the run fail (invalid connector or forced error in a test).
  3. Watch the runs and the next-run time.
  - Expected: Retry after about 5 minutes, then about 10; attempt counts rise; after the last retry the next normal occurrence is scheduled.
- **Manual run not retried**
  1. Press Run now on a routine with retries configured and force a failure.
  - Expected: One failed run; no retry scheduled.
- **Same note across apps**
  1. Produce a skipped run.
  2. Open its history on Web, Mobile, VS Code and Chrome; run agi schedules runs.
  - Expected: Web, Mobile, VS Code, Chrome show the shared skip note; CLI shows cancelled and the error text, not the 'skipped' word.
- **Held run after allowance (not built)**
  1. Exhaust the plan allowance and let a run fall due.
  - Expected: Current behaviour to record: unknown; required behaviour in the brief is a held run that starts after the reset.

**Where to look when it fails**

- Audit event type schedule_missed_execution; log 'Scheduled task batch completed' with counts (schedule-service.ts:2520).
- Run row fields: scheduled_for, attempt_count, status, error, result.missedExecution.
- Task fields: retry_attempt, retry_scheduled_for, last_error, next_execution_at.
- Log 'Scheduled tasks were not claimed: their owner is no longer an active member of the workspace'.
- Cron response {"skipped":"db_low_power"} when low power is on.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/web/063-routines-schedules-and-triggers.md)
- Desktop: [70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md)
- Mobile: [70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md)
- CLI: [70-qa/test-plans/cli/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/cli/063-routines-schedules-and-triggers.md)
- VS Code: [70-qa/test-plans/vscode/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/vscode/063-routines-schedules-and-triggers.md)
- Chrome: [70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md)

## 10. Gaps and dependencies

- **Held run after the usage allowance resets is not built.** Affects: All apps; paid and Free users who hit an allowance.. Evidence: Brief S63.34; no hold code found in schedule-service.ts or scheduled-agent-executor.ts. Work needed: Define the hold state, the reset time source, and the resume job; show it in history.
- **Expired connector repair flow is not built.** Affects: All apps; routines with connectors.. Evidence: Brief S63.35; no reconnect handling found in the schedule feature code read. Work needed: Detect an expired connector at run time, mark the routine, and link to the reconnect screen.
- **Missed and retry settings can be set only on the Web form (and Electron Local missed choice).** Affects: Mobile, CLI, VS Code, Chrome, Tauri desktop users.. Evidence: No such fields in those apps' schedule code. Work needed: Add fields or document web-only.
- **CLI does not label a skipped run as skipped; Mobile replaces the cancelled error text.** Affects: CLI and Mobile users.. Evidence: apps/cli/src/schedules.rs:489-499; apps/mobile/src/features/schedules/service.ts:126-131. Work needed: Use the shared note wording.
- **The brief says Chrome has no missed-run note, but code has one; its run history also exists although the brief marks it missing.** Affects: Documentation accuracy.. Evidence: schedulesSection.ts:1067-1090. Work needed: Update brief rows S63.22 and S63.33.
- **No notice when a routine silently stops because its owner left the workspace.** Affects: Workspace routines.. Evidence: schedule-service.ts:1317-1335 logs only. Work needed: Show a reason on the routine and tell an admin.
- **The missed-run grace is a fixed multiple of the sweep, not a user setting.** Affects: Owners who want a tighter or looser rule.. Evidence: schedule-service.ts:83-85. Work needed: Decide whether to expose it; rate limits and similar values should be configuration (doc: AGENTS.md section 8).
- **No test title found that checks the Chrome missed note or the CLI ran-late line.** Affects: Test coverage.. Evidence: Searched apps/extension/__tests__ and apps/cli/src/schedules.rs test titles. Work needed: Add tests.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- table:scheduled_tasks
- table:scheduled_task_runs
- SYS-observability-and-operations
- SYS-subscriptions-entitlements-and-usage
- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-api-and-contracts
- SYS-execution-boundaries
- SYS-model-catalog-and-routing
- F063-07
- F063-08

## Unknown

- Where the audit event is stored and how long it is kept.
- What the recovery code does for an expired lease beyond the error text (schedule-service.ts:2360-2420 only partly read).
- Exact error a usage-allowance refusal raises in reserveManagedUsageRequest and how it shows in run history.
- Whether a skipped Cloud run counts toward notifications in any app (the code sends none for cancelled runs).
- Wording of the Local routine 'run once' option label (only 'Skip missed runs' read).
- Behaviour of the older Tauri local scheduler (scheduler_* commands, AgiWorkScheduled.tsx) for missed runs beyond one visible sentence at line 148.
- Handler details of GET /api/schedules/[id]/runs.

## Second reader's check

A second reader checked 11 statements of this page against the code: 9 correct, 2 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 6):** "Low-power mode: the cron route returns early after minute 15 of the hour (route.ts:21-22; cron-low-power.ts:17-19)" The code shows: Behaviour is right: lowPowerCronSkip returns {skipped:'db_low_power'} when UTC minutes >= 15 and AGI_DB_LOW_POWER is '1'. The route lines cited (21-22) are the MAX_WAVES constant and the GET signature. The call is at route.ts:28. (apps/web/app/api/cron/run-schedules/route.ts:28; apps/web/lib/server/cron-low-power.ts:17-19). **Corrected:** Cite route.ts:28 for the low-power early return.
- **Partly wrong (section 7):** "Local mode: Cloud sweep, retries and missed policy do not apply; Electron Local routines have a 2 minute grace, run only while Desktop is open, no retry code" The code shows: The 2 minute grace and the no-retry claim hold. A grep for 'retry' in localRoutine*.ts found nothing. The 'Runs while the Desktop app is open' text is at LocalRoutinesSection.tsx:199, not 218-222. The same text adds 'The model may still run in the cloud', so a Local routine's model call can leave the device. (apps/web/features/schedules/components/LocalRoutinesSection.tsx:199). **Corrected:** Cite LocalRoutinesSection.tsx:199, and note the on-screen text says the model may still run in the cloud.

**Facts the page missed**

- A reached credit cap stops retries. When a retry would otherwise fire, the cap pauses the routine, via isCreditCapReached in the retry predicate and the pauseForCreditCap path (schedule-service.ts:1643-1647, :2130-2250). The page names the cap only in passing.
- A run resumed after approval skips both missed detection and the condition check (`if (!options.resume)`, schedule-service.ts:2256-2257). The page notes only that the missed details are kept.
- The skip error text is 'Skipped the occurrence scheduled for ...' but a condition-watch skip is stored as status 'cancelled' with the error 'Condition not met: ...' (schedule-service.ts:2269-2277). The page covers this only through the note text.
