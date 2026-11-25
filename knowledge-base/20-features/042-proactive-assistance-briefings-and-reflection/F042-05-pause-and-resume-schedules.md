---
id: "F042-05"
type: "feature"
title: "Pause and resume schedules"
aliases: ["Pause briefings", "Pause and resume schedule", "Active After Save", "Enable and disable schedule", "S42.15"]
area: "42 Proactive assistance, briefings, and reflection"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S42.15"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "F042-01", "SYS-api-and-contracts", "SYS-agents-tools-and-automation", "table:scheduled_tasks", "api:PATCH /api/schedules/{id}"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F042-05 Pause and resume schedules

A person stops a schedule without deleting it and starts it again. Web, desktop and Chrome have a Pause or Resume control; mobile has a switch; the CLI has 'agi schedules pause' and 'resume'; VS Code has Pause and Resume commands. The server also pauses a schedule itself when a run needs approval or the credit cap is reached.

Area: [42. Proactive assistance, briefings, and reflection](README.md). Requirement items: [S42.15](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4215).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns a schedule off or on. Off keeps the prompt and settings, clears the next run time and marks status 'paused'. On recomputes the next run.

**Why it exists.** Item S42.15 in the area brief: the user can pause and resume briefings (doc: knowledge-base/data/area-briefs/042-proactive-assistance-briefings-and-reflection.md).

**Who uses it.** Anyone with a schedule, such as on holiday or when briefings are noisy.

**Problems it solves**

- Deleting loses the prompt and settings.
- Unwanted runs consume usage.
- A schedule stopped by the system needs a way back.

**Use cases**

- Pause the Daily briefing for a week away.
- Resume after approving a paused run.
- Pause from the terminal in a script.

## 2. User experience

**Where to find it**

- Web: schedule card switch labelled 'Pause <name>' or 'Resume <name>' and a menu item 'Pause'/'Resume' (apps/web/features/schedules/components/ScheduleCard.tsx:385,476-477); 'Next Run' shows 'Paused'; filter 'Paused' (SchedulesPage.tsx:99).
- Desktop (Tauri build): 'Pause' or 'Resume' button, status 'Active' or 'Paused' (DesktopCloudSchedules.tsx:1186,1229).
- Mobile: switch on the schedule card (apps/mobile/src/features/schedules/components/ScheduleCard.tsx:297); Notifications > Daily brief switch off pauses the brief (dailyBrief.ts:204).
- CLI: 'agi schedules pause <id|name>' and 'agi schedules resume <id|name>' (apps/cli/src/lib.rs:1571-1585).
- VS Code: commands 'Code: Pause Schedule' and 'Code: Resume Schedule' (apps/extension-vscode/package.json:621-627).
- Chrome: button 'Pause' or 'Resume' in the Schedules section (schedulesSection.ts:905).

**Before you start**

- An existing schedule that is not completed or expired.
- Signed in to AGI Cloud.

**Screens and controls**

- Switch or button per schedule.
- Disabled when the action is not allowed (getScheduleActionAvailability).

**Journey**

1. Find the schedule.
2. Press Pause; the card shows Paused.
3. Later press Resume; Next Run returns.

**What the person sees and gets**

- Web: 'Paused' text; 'Paused: a run needed your approval. Approve or deny it in Run History...' (ScheduleCard.tsx:349); 'Paused: it used its <cap> cap...' (ScheduleCard.tsx:338).
- Chrome: 'Schedule paused.' and 'Schedule resumed.'
- CLI prints the updated schedule; a paused schedule from approval shows 'paused: a run needed your approval' (schedules.rs:599).
- VS Code: 'this schedule cannot be paused or resumed in its current state.' (scheduleActions.ts:111).

**Settings**

- Create paused: web 'Active After Save', CLI '--paused'.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server toggle: PATCH /api/schedules/{id} with isActive boolean, calls setScheduleEnabled (apps/web/app/api/schedules/[id]/route.ts:98-115; schedule-service.ts:1234).
- Pause sets is_enabled false, status 'paused', next run cleared; resume recomputes the next run and clears paused_reason (schedule-service.ts:1234-1289).
- Resume is refused for a completed or expired schedule, one at its run limit or credit cap, one past its end date, or with no further occurrence (schedule-service.ts:1243-1270).
- The system pauses a schedule itself on approval needed and on credit cap (schedule-service.ts:1915, 2144).
- Delete is refused while a run is in progress (schedule-service.ts:1305).
- All six apps call the same endpoint: web, desktop, mobile service, CLI set_active (schedules.rs:316), Chrome (schedulesClient.ts:279), VS Code (scheduleActions.ts:121).

**Incomplete**

- Pause does not stop a run already in progress [inferred; the toggle edits the row only].

**Present but disconnected or switched off**

- nothing found

**Not available**

- none; the brief's cited commandSetup.ts:2220 for VS Code is account-tier code and not the pause path (apps/extension-vscode/src/core/commandSetup.ts:2200-2235); the real path is features/schedules/scheduleActions.ts.

## 4. Required behaviour

**Established requirements**

- The user can pause and resume briefings (S42.15), on web, desktop, mobile, CLI, VS Code and Chrome. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.15)
- A schedule cannot be deleted while a run is in progress. (source: apps/web/lib/services/schedule-service.ts:1305)

**Acceptance criteria**

1. Pausing a schedule makes Next Run read 'Paused' and no run starts at the old time.
2. Resuming sets a Next Run in the schedule's timezone.
3. A paused schedule keeps name, prompt, sources and time.
4. Resume of an expired schedule is refused with a conflict message.
5. A schedule paused for approval resumes after the run is approved or denied.
6. The CLI pause by name works and prints the schedule.
7. Delete during a running run is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A second tap during a pending toggle is blocked by the busy state [inferred from aria-busy at ScheduleCard.tsx:386].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer 'Pause until' a date for holidays.
- [proposed] Say on the card when a run in progress will still finish.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ScheduleCard (web) | `apps/web/features/schedules/components/ScheduleCard.tsx` | Switch, menu item, Paused text (lines 275-303, 385, 476). |
| screen | SchedulesPage (web) | `apps/web/features/schedules/components/SchedulesPage.tsx` | Toggle handler, 'Paused' filter (line 99). |
| component | DesktopCloudSchedules | `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx` | Pause or Resume button (line 1229). |
| component | ScheduleCard (mobile) | `apps/mobile/src/features/schedules/components/ScheduleCard.tsx` | Switch (line 297). |
| screen | Schedules list (mobile) | `apps/mobile/app/(app)/schedules/index.tsx` | Filters All, Active, Paused, Completed (lines 42-46). |
| service | mobile service toggleSchedule | `apps/mobile/src/features/schedules/service.ts` | Calls the toggle endpoint. |
| command | agi schedules pause and resume | `apps/cli/src/lib.rs` | Handler at line 4473. |
| service | SchedulesClient.set_active | `apps/cli/src/schedules.rs` | PATCH with isActive (line 316). |
| command | pauseSchedule and resumeSchedule | `apps/extension-vscode/src/features/schedules/scheduleActions.ts` | VS Code commands (lines 24-25, 111-121). |
| component | schedulesSection toggle | `apps/extension/src/features/side-panel/schedulesSection.ts` | Chrome Pause or Resume button (line 905). |
| service | Chrome schedulesClient | `apps/extension/src/features/cloud-bridge/schedulesClient.ts` | setScheduleEnabled (line 279). |
| endpoint | PATCH /api/schedules/{id} | `apps/web/app/api/schedules/[id]/route.ts` | Toggle route (line 98). |
| service | setScheduleEnabled | `apps/web/lib/services/schedule-service.ts` | Transactional toggle with checks (line 1234). |
| table | scheduled_tasks | `apps/web/lib/services/schedule-service.ts` | is_enabled, status, next_execution_at, paused_reason columns. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses the switch, button or command. | device | apps/web/features/schedules/components/ScheduleCard.tsx:385 |
| The app sends PATCH with isActive. | our servers | apps/web/app/api/schedules/[id]/route.ts:98-115 |
| The server locks the row, checks terminal state, run limit, credit cap and expiry, computes the next run if enabling, and updates is_enabled, status, next_execution_at, paused_reason. | our servers | apps/web/lib/services/schedule-service.ts:1234-1289 |
| The sweep only claims schedules with status active and is_enabled true. | our servers | apps/web/lib/services/schedule-service.ts:1350 |
| The app shows the returned schedule. | device | apps/cli/src/lib.rs:4473-4486 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Enabled flag, status, next run, paused reason | table:scheduled_tasks | Yes, all apps read the same row | Kept; paused_reason cleared on any toggle (schedule-service.ts:1280). |

**Models and providers.** No model is involved in pause or resume.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; CLI and mobile require Cloud. |
| Permissions | Authenticated, rate limited and CSRF-checked (route.ts:98-106). |
| Subscription | No plan gate in the toggle path found; creation is limited by plan (billing-catalog.ts:816). |
| Limits and metering | Resume is blocked by run limit and credit cap (schedule-service.ts:1248-1256). |
| Feature flags | Mobile FEATURES.schedules (v1FeatureFlags.ts:14). |
| Model compatibility | not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Not available in Local mode on mobile and CLI; the CLI refuses non-Cloud sessions (schedules.rs:800). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Busy | Switch marked aria-busy while the toggle runs. | ScheduleCard.tsx:386 |
| Terminal schedule | Conflict 'A terminal schedule cannot be enabled'; VS Code message when not allowed. | schedule-service.ts:1244; scheduleActions.ts:111 |
| Approval pause | Card says approve or deny in Run History; approving reactivates. | ScheduleCard.tsx:349; schedule-service.ts:2010-2015 |
| Credit cap pause | Card tells the person to raise the cap in Edit. | ScheduleCard.tsx:338 |
| Error | Row error text with 'Retry the action when ready.' on web. | ScheduleCard.tsx:200-210 |
| Offline | not handled in the code beyond request errors | No offline queue found. |
| Accessibility | Switch label 'Pause <name>' or 'Resume <name>'. | ScheduleCard.tsx:385 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/schedules.test.ts`: Includes 'pauses through the hosted endpoint and refreshes the view' (line 230) and presentation of a paused schedule.
- `apps/cli/src/schedules.rs`: Inline tests for 'a paused request with a model keeps both' (line 745) and approval-paused rendering.
- `apps/web/features/schedules/components/ScheduleCard.test.tsx`: Web card; matched by name, cases not read.
- `apps/web/lib/services/schedule-service.test.ts`: Schedule service; matched by name, cases not read.
- `apps/mobile/__tests__/ScheduleScreen.test.tsx`: Mobile schedules screen; matched by search, cases not read.

**Test scenarios**

- **Pause and resume on web**
  1. Pause a schedule.
  2. Check Next Run and the Paused filter.
  3. Resume.
  - Expected: Next Run shows 'Paused' then a time in the schedule zone.
- **Resume expired**
  1. Take a schedule past its end date.
  2. Resume.
  - Expected: Refused with 'Schedule has expired'.
- **CLI by name**
  1. agi schedules pause 'Daily briefing'
  2. agi schedules list
  3. agi schedules resume 'Daily briefing'
  - Expected: Status paused then active.
- **Approval pause**
  1. Run a schedule that needs approval.
  - Expected: Card shows 'Paused: a run needed your approval' and approving clears it.
- **Delete while running**
  1. Start a run now; delete.
  - Expected: Refused with 'Schedule cannot be deleted while a run is in progress'.

**Where to look when it fails**

- Column paused_reason values 'approval_required' and 'credit_cap_reached'.
- Error ScheduleConflictError.
- Route PATCH response.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md)
- Desktop: [70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md)
- Mobile: [70-qa/test-plans/mobile/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/mobile/042-proactive-assistance-briefings-and-reflection.md)
- CLI: [70-qa/test-plans/cli/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/cli/042-proactive-assistance-briefings-and-reflection.md)
- VS Code: [70-qa/test-plans/vscode/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/vscode/042-proactive-assistance-briefings-and-reflection.md)
- Chrome: [70-qa/test-plans/chrome/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/chrome/042-proactive-assistance-briefings-and-reflection.md)

## 10. Gaps and dependencies

- **Pause on the server was not traced against a running run; effect on an in-flight run unknown.** Affects: All apps.. Evidence: schedule-service.ts:1234-1289 edits the row only.. Work needed: Test and document.
- **Brief cites commandSetup.ts:2220 for VS Code pause, which is unrelated.** Affects: Documentation.. Evidence: apps/extension-vscode/src/core/commandSetup.ts:2200-2235. Work needed: Fix citation to scheduleActions.ts.
- **VS Code is by decision a viewer; it cannot create schedules.** Affects: VS Code.. Evidence: docs/decisions/2026-09-27-founder-decisions.md (VS Code extras). Work needed: None.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- F042-01
- SYS-api-and-contracts
- SYS-agents-tools-and-automation
- table:scheduled_tasks
- api:PATCH /api/schedules/{id}

## Unknown

- Effect of pausing on a run already in progress.
- Exact web toggle error messages (rethrowScheduleError not read).
- Desktop Tauri versus Electron which build applies to the public Desktop for this control.
