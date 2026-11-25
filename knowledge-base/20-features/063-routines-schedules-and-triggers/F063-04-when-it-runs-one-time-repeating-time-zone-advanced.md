---
id: "F063-04"
type: "feature"
title: "When it runs: one-time, repeating, time zone, advanced rules"
aliases: ["Frequency", "Repeat", "One time", "Daily", "Weekly", "Monthly", "Interval", "Custom Cron", "Recurrence Rule", "Time Zone", "Only Run During (dayparts)", "Retries After A Failed Run", "If A Run Is Missed", "S63.11 S63.12 S63.13 S63.14"]
area: "63 Routines, schedules, and triggers"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "n/a", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S63.11", "S63.12", "S63.13", "S63.14"]
depends_on: ["F063-02", "F063-06", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "mode:cloud", "table:scheduled_tasks", "table:scheduled_task_runs", "SYS-sync-and-continuity", "SYS-observability-and-operations", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F063-04 When it runs: one-time, repeating, time zone, advanced rules

Sets when a routine runs: once at a future time, daily, weekly, monthly, or advanced (fixed interval, custom cron, calendar recurrence rule), always read in a chosen IANA time zone. The cloud checks every 15 minutes, so faster rates are refused. Mobile and Chrome offer only once, daily, weekly, monthly. The CLI takes cron only.

Area: [63. Routines, schedules, and triggers](README.md). Requirement items: [S63.11](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6311), [S63.12](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6312), [S63.13](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6313), [S63.14](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6314).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns the person's timing choice into a stored schedule type, cron or rule, and a next execution time computed in the chosen zone (schedule-service.ts:681-868; packages/platform/utils/src/scheduling/schedule-time.ts).

**Why it exists.** Routines must run on a clock without the person present; the service must know exactly when and refuse timings it cannot deliver.

**Who uses it.** Everyone who creates a routine; advanced people use cron, interval and recurrence rules.

**Problems it solves**

- Wrong time because of time zone
- Daylight-saving surprises (ambiguous one-time times are rejected)
- Promising a one-minute schedule the sweep cannot deliver

**Use cases**

- Weekly review every Friday 4 PM in London
- One reminder next Tuesday at 9:00
- Weekday cron 0 9 * * 1-5 from the CLI
- Interval every 2 hours only during office hours

## 2. User experience

**Where to find it**

- Web and public Electron Desktop: form field 'Frequency' with One Time, Daily, Weekly, Monthly, Interval, Custom Cron, Recurrence Rule, When An Event Happens; fields 'Run At', 'Local Time', 'Days of Week', 'Day of Month', 'Cron Expression', 'Recurrence Rule', 'Time Zone', 'End date (optional)', 'Only Run During', 'Retries After A Failed Run', 'If A Run Is Missed' (ScheduleForm.tsx:293-312, 321-560, 562-660).
- Tauri desktop: select options One time, Daily, Weekly, Monthly, Interval, Custom cron (DesktopCloudSchedules.tsx:1646-1651); no recurrence rule or event option in the form.
- Mobile: form with recurrence picker (Once, Daily, Weekly, Monthly), date-time field and time zone picker (RecurrencePicker.tsx; ScheduleDateTimeField.tsx; TimezonePickerField.tsx), and a cadence note.
- Chrome: 'Repeat' select with Once, Every day, On chosen days of the week, Once a month; 'Time', 'Run at', 'Time zone' (schedulesSection.ts:486-524).
- CLI: agi schedules create --schedule '<5-field cron>' --timezone <zone> (lib.rs:1514-1545); edit with --schedule and --timezone.
- VS Code: display only.

**Before you start**

- Create or edit access (F063-02)
- A valid IANA time zone
- Time in the future for one-time

**Screens and controls**

- Time zone defaults to the device zone (web ScheduleForm time zone list; Chrome browserTimeZone at schedulesSection.ts:405; CLI local_timezone at schedules.rs:67)
- Interval unit select Minutes, Hours, Days (ScheduleForm.tsx:103-107)
- Mobile note: 'Schedules are checked every 15 minutes, so a run can start later in the 15-minute Cloud window.' (policy.ts:36)
- Retries 0 to 5 with first wait doubling (ScheduleForm.tsx:592-640)

**Journey**

1. Choose Frequency
2. Fill the time fields for that choice
3. Check the time zone
4. Optionally set end date, run windows, retries, missed-run policy (web)
5. Save; the list shows 'Next run'

**What the person sees and gets**

- Next run time and upcoming runs on the card (ScheduleCard.tsx:209-266)
- Field errors such as 'Choose a future date and time.' (Chrome) or server messages like 'Scheduled tasks are swept every 15 minutes, so a cron expression cannot fire more often than that'
- Mobile refusal of 'hourly' or 'every 15 minutes' text in quick schedule (policy.ts:50-60)

**Settings**

- Retries and missed-run policy per routine
- Account time zone is not stored; each routine has its own

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Recurrence values accepted: once, daily, weekly, monthly, custom, interval, rrule, event; stored schedule types: cron, once, interval, rrule, event (schedule-service.ts:90-100).
- One-time needs a valid date and must be in the future (schedule-time.ts:200-204; schedule-service.ts:516 test 'rejects a disabled one-time schedule in the past').
- expiresAt must be in the future and after the first occurrence (schedule-service.ts:719-721, 825).
- Time zone validated as IANA, up to 100 characters (schedule-time.ts:44-54).
- Cadence checked against the 15-minute sweep for interval, rrule and cron (schedule-time.ts:259, 325-350; vercel.json:50-51); edits re-check only when timing changes (schedule-service.ts:1121-1140).
- Retries 0 to 5, first wait 60 seconds to 86,400, delay doubles each retry up to the cap (schedule-service.ts:86-89, 1643-1646).
- Missed runs: grace is two sweeps (30 minutes, or two hours in low-power mode); policy run_once or skip (schedule-service.ts:81-85, 2102-2118).
- Mobile supports only once, daily, weekly, monthly and throws a message sending interval or cron to Web (policy.ts:4-8, 40-45).
- CLI sends cron as recurrence custom with a time zone (apps/cli/src/schedules.rs:89-115).
- Chrome sends once/daily/weekly/monthly with time zone; one-time sets maxExecutions 1 (schedulesSection.ts:727-775).
- Day-parts and recurrence rules validated server-side (apps/web/lib/schedules/dayparts.ts, recurrence-rule.ts).

**Incomplete**

- CLI: cron only; no daily/weekly pickers, no one-time, interval or rule (lib.rs:1514-1545).
- Tauri desktop form lacks recurrence rule, event, run windows, retries (DesktopCloudSchedules.tsx:1646-1651).
- Chrome edit cannot change timing (schedulesSection.ts:1207).
- Mobile cadence note is text only; quick schedule refuses sub-daily asks rather than offering the nearest delivery.

**Present but disconnected or switched off**

- Interval, custom cron and recurrence rule creation is blocked on mobile by design (policy.ts:40-45).
- In low-power database mode the sweep is hourly (schedule-service.ts:81-85; lowPowerCronSkip in apps/web/app/api/cron/run-schedules/route.ts:29).

**Not available**

- Pause until a date (brief S63.25, missing everywhere).
- Per-routine time zone default from the account: not found.
- VS Code create.

## 4. Required behaviour

**Established requirements**

- A routine can run once at a chosen future date and time. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.11)
- A routine repeats on a cadence and fires on each occurrence. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.12)
- User sets the time zone the times are read in. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.13)
- Advanced recurrence: cron, intervals, iCalendar rules, run windows. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.14)
- The deployed sweep runs every 15 minutes and faster schedules are refused. (source: vercel.json:50-51; packages/platform/utils/src/scheduling/schedule-time.ts:259, 325-350)
- DST transitions and overlapping sweeps must create at most one run per occurrence. (source: doc: docs/product/experience-contract.md:790)
- The time zone and one-time behaviour of the older local scheduler were fixed to read the zone and run once. (source: doc: docs/decisions/wire-or-cut.md:680-681)

**Acceptance criteria**

1. A one-time schedule in the past is refused
2. An invalid time zone name is refused
3. A cron firing every 5 minutes is refused with the sweep message; one every 15 minutes is accepted
4. A daily 09:00 in a non-UTC zone fires at 09:00 local on both sides of a DST change
5. retryMaxAttempts 6 is refused
6. Mobile create with recurrence interval throws the Web message
7. CLI create with --schedule '0 9 * * 1-5' stores a custom schedule in the given zone

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile and Chrome time zone controls are needed because the server requires timezone on every create [inferred from validateTimeZone].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add one-time and non-cron cadences to the CLI.
- [proposed] Show the 15-minute window on web at pick time, not only after a refusal.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | validateScheduleInput (timing part) | `apps/web/lib/services/schedule-service.ts` | Picks schedule type, cron, rule, checks cadence and expiry (lines 740-845) |
| service | getNextExecutionAt, assertDeliverableCadence, validateTimeZone, SWEEP_INTERVAL_MS | `packages/platform/utils/src/scheduling/schedule-time.ts` | Next occurrence and cadence rules (lines 44, 200, 259, 325) |
| service | recurrence-rule and dayparts | `apps/web/lib/schedules/recurrence-rule.ts` | Rule parse and day-part windows |
| job | run-schedules cron | `apps/web/app/api/cron/run-schedules/route.ts` | Claims due schedules each sweep (waves of 10, budget 55 s) |
| config | crons run-schedules | `vercel.json` | Every 15 minutes (lines 50-51) |
| service | claimDueScheduleRuns | `apps/web/lib/services/schedule-service.ts` | Atomic claim with occurrence key (line 1341) |
| service | retryDelaySeconds, detectMissedExecution | `apps/web/lib/services/schedule-service.ts` | Retry and missed-run rules (lines 1643, 2102) |
| component | ScheduleForm timing fields | `apps/web/features/schedules/components/ScheduleForm.tsx` | Web timing UI |
| component | DesktopCloudSchedules form | `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx` | Tauri timing UI |
| service | policy.ts | `apps/mobile/src/features/schedules/policy.ts` | Mobile cadence limits and note |
| component | RecurrencePicker, ScheduleDateTimeField, TimezonePickerField | `apps/mobile/src/features/schedules/components/RecurrencePicker.tsx` | Mobile timing controls |
| service | timing.ts | `apps/mobile/src/features/schedules/timing.ts` | Zoned date-time conversion |
| command | agi schedules create --schedule | `apps/cli/src/lib.rs` | CLI cron input (line 1519) |
| component | Repeat, Time, Time zone controls | `apps/extension/src/features/side-panel/schedulesSection.ts` | Chrome timing UI (lines 486-524) |
| service | zonedLocalInputToIso | `packages/platform/utils/src/scheduling/local-input.ts` | Local wall time to UTC instant |
| config | scheduled-task rules migration | `apps/web/db/neon/scheduled-task-rules-migration.test.ts` | Test for the added columns for rules, retries, missed policy |
| component | LocalRoutinesSection | `apps/web/features/schedules/components/LocalRoutinesSection.tsx` | On-device routines on the Electron Desktop with interval, cron, daily, weekly, monthly, once |
| service | localRoutineEngine, localRoutineService | `apps/desktop/electron/runtime/localRoutineEngine.ts` | On-device schedule engine that reuses the same time functions (line 1-30) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client builds timing fields and the zone (device zone by default). | device | ScheduleForm.tsx:510; schedulesSection.ts:405 |
| Server builds a cron expression from time of day, days and day of month, or takes cron, interval or rule; checks cadence; computes the first occurrence. | our servers | schedule-service.ts:740-845 |
| Every 15 minutes a cron job claims due rows and inserts one run per occurrence key; the next time is recomputed when the run ends. | our servers | vercel.json:50-51; schedule-service.ts:1341-1411, 1653 |
| A late claim over two sweeps is marked missed and either runs once or is skipped. | our servers | schedule-service.ts:2102-2118, 2236-2262 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Timing: schedule_type, cron_expression, execute_at, interval_ms, recurrence_rule, dayparts, timezone, retry settings, missed policy, next_execution_at | table scheduled_tasks | Yes | Deleted with the routine |
| Occurrence key 'schedule:<time>' per run | table scheduled_task_runs.idempotency_key | Server only | Runs cascade-delete with the routine (0009_scheduling.sql:36) |

**Models and providers.** No model takes part in timing. Mobile quick-schedule parsing is local text parsing, not a model (QuickSchedule.tsx:211-300).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account. |
| Permissions | Owner must be allowed to run unattended and be an active workspace member or the claim skips the routine (schedule-service.ts:1341-1411; trigger SQL uses same helpers). |
| Subscription | Plan limit as F063-02. No per-plan difference in cadence found; the product test 'sells no more scheduled tasks than the deployed sweep attempts in a day' ties limits to the sweep (apps/web/lib/schedules/schedule-cadence.test.ts:121). |
| Limits and metering | Retries 0-5; backoff 60-86,400 s; max runs 1 to 1,000,000; sweep claims up to 50 runs per sweep (PLATFORM_SCHEDULE_RUNS_PER_SWEEP, billing-catalog.ts:478). |
| Feature flags | Low-power database mode skips or slows sweeps (cron-low-power). |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Cloud schedules are unavailable in Local mode on mobile, CLI and Tauri. On the Electron Desktop a separate 'On this computer' section creates on-device routines (once, interval, cron, daily, weekly, monthly) that run while the app is open and ask for confirmation; the model may still run in the cloud (apps/web/features/schedules/components/LocalRoutinesSection.tsx:194-205; apps/desktop/electron/runtime/localRoutineService.ts:134-160). No sign-in or plan rule was found in that service. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| One-time time in an ambiguous or missing DST hour | Rejected ('Ambiguous daylight-saving times are rejected') | ScheduleForm.tsx:333-336; apps/mobile/__tests__/schedule-policy.test.ts:166; apps/extension/__tests__/schedule-create-controls.test.ts:89 |
| Cadence faster than sweep | Refused on create; on edit only when timing changed | schedule-time.ts:325-350; schedule-service.ts:1121-1140 |
| Occurrence missed by more than two sweeps | Policy run_once runs late and says so; skip cancels with an explanation | schedule-service.ts:2102-2118, 2246-2262; schedules.ts:740-757 |
| Retry after failure or timeout | New attempt after the backoff, doubling | schedule-service.ts:1643-1646; ScheduleForm.tsx:640-646 |
| Schedule with no further occurrence | Enabling is refused with a conflict | schedule-service.ts:1260-1270 |
| One-time reaches its run | Becomes completed | schedule-service.test.ts:1033 |
| Offline on mobile | Not handled in the code beyond request errors | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/schedules/schedule-cadence.test.ts`: Sweep matches vercel.json, interval and cron floors, DST daily, one-time left alone, daily limit versus sweep
- `apps/web/lib/schedules/schedule-time.test.ts`: Next-occurrence maths (case titles not read)
- `apps/web/lib/schedules/recurrence-rule.test.ts`: Recurrence rule parsing (case titles not read)
- `apps/web/lib/schedules/dayparts.test.ts`: Run windows (case titles not read)
- `apps/web/lib/services/schedule-service.test.ts`: Invalid timezone and cron, unknown recurrence, past one-time, expiry before first run, enabling recomputes next run, interval anchor kept
- `apps/web/lib/services/__tests__/schedule-missed-grace.test.ts`: Missed-run grace (case titles not read)
- `apps/mobile/__tests__/schedule-policy.test.ts`: Mobile cadences, sweep note, sub-daily refusals, default 09:00, DST wall-clock rejection
- `apps/mobile/src/features/schedules/__tests__/ScheduleOnceTime.test.tsx`: Mobile one-time form (title-level)
- `apps/extension/__tests__/schedule-create-controls.test.ts`: One-time with zone-aware instant; DST edge inputs
- `apps/desktop/electron/__tests__/localRoutineEngine.test.ts`: On-device routine engine (case titles not read)
- `apps/cli/src/schedules.rs`: Inline test that a cron request carries only accepted fields

**Test scenarios**

- **Sweep floor**
  1. POST recurrence custom, cronExpression '*/5 * * * *'
  2. POST '*/15 * * * *'
  - Expected: First refused with a swept-every-15-minutes message; second accepted
- **DST daily**
  1. Create daily 09:00 in a zone that changes clocks
  2. Read nextExecutionAt before and after the change
  - Expected: Local 09:00 both times
- **Past one-time**
  1. POST once with scheduledAt one hour ago
  - Expected: Validation error that the one-time time must be in the future
- **Mobile interval**
  1. Call mobile createSchedule with recurrence interval
  - Expected: Error telling the user to use Web
- **CLI cron zone**
  1. agi schedules create --name x --schedule '0 9 * * 1-5' --prompt p --timezone Europe/London
  - Expected: Schedule listed as custom with that zone and a next run at 09:00 London

**Where to look when it fails**

- Log 'Scheduled-task sweep ended with schedules still due' (run-schedules route.ts:62)
- scheduled_tasks.next_execution_at null for an enabled routine
- Run result.missedExecution in scheduled_task_runs

**Hands-on test plans**

- Web: [70-qa/test-plans/web/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/web/063-routines-schedules-and-triggers.md)
- Desktop: [70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md)
- Mobile: [70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md)
- CLI: [70-qa/test-plans/cli/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/cli/063-routines-schedules-and-triggers.md)
- Chrome: [70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md)

## 10. Gaps and dependencies

- **CLI only supports cron** Affects: CLI users. Evidence: apps/cli/src/lib.rs:1514-1545. Work needed: Add other cadences or document
- **Tauri desktop form omits recurrence rule, event, run windows, retries** Affects: Tauri desktop users. Evidence: DesktopCloudSchedules.tsx:1646-1651. Work needed: Add or decide to rely on web
- **Chrome cannot edit timing** Affects: Chrome users. Evidence: schedulesSection.ts:1207. Work needed: Add timing edit
- **Brief says Chrome has no time zone; code has a Time zone select** Affects: Brief accuracy. Evidence: schedulesSection.ts:520-524. Work needed: Correct S63.13
- **Brief says CLI has no one-time (S63.11); true, and brief says cron only done for advanced** Affects: CLI users. Evidence: apps/cli/src/schedules.rs:89-115. Work needed: Add one-time
- **Pause until a date missing** Affects: All apps. Evidence: Brief S63.25. Work needed: Add field and sweep rule
- **Fastest cadence is 15 minutes, also late by up to the window** Affects: All users expecting exact times. Evidence: schedule-time.ts:259. Work needed: Product decision; show expected window on pick

**Depends on**

- F063-02
- F063-06
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- mode:cloud
- table:scheduled_tasks
- table:scheduled_task_runs
- SYS-sync-and-continuity
- SYS-observability-and-operations
- SYS-data-model-and-migrations

## Unknown

- Whether the Electron local routines have a plan or sign-in rule: none found in localRoutineService.ts, not exhaustively read.
- Exact retry limits of the local routine engine.
- Where mobile shows the 15-minute note on screen (constant at policy.ts:36 was read, UI placement not).
- Cases inside schedule-time.test.ts, recurrence-rule.test.ts, dayparts.test.ts.
