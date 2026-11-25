---
id: "F004-06"
type: "feature"
title: "Scheduled tasks and routine details"
aliases: ["Scheduled tasks", "Schedules", "Routines", "Scheduled-task manager", "Routine details", "Run History", "/chat/schedules", "Local routines", "S4.17", "S4.18"]
area: "4 Signed-in application destinations"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "partly seen (1 of 2)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S4.17", "S4.18"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-observability-and-operations", "table:scheduled_tasks", "table:scheduled_task_runs", "api:GET /api/schedules", "api:POST /api/schedules", "api:POST /api/schedules/{id}/runs", "api:POST /api/schedules/{id}/runs/{runId}/approval"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F004-06 Scheduled tasks and routine details

Run a prompt again on a repeating schedule on our servers and read each run's result. The web page lists schedules, creates them from scratch or a template, and lets people edit, pause, run now, delete and read run history, including approving a run that waits. Mobile, CLI, Chrome and VS Code have their own views.

Area: [4. Signed-in application destinations](README.md). Requirement items: [S4.17](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s417), [S4.18](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s418).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 2) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores a prompt with a cadence, fires it on time in the Cloud, and records each run with status, result and any approval it needs.

**Why it exists.** Recurring jobs such as daily summaries should run without the person present.

**Who uses it.** People on a plan that allows scheduled tasks (3 or more) on Web, Desktop, Mobile, CLI and Chrome; VS Code shows schedule details.

**Problems it solves**

- Repeating the same prompt by hand.
- Missing results when away.
- Unsafe unattended actions (approval stops a run).

**Use cases**

- Every weekday at 9 summarise overnight news.
- Run a weekly report now to check it works.
- Pause a schedule while on holiday.
- Approve a paused run from Run History.

## 2. User experience

**Where to find it**

- Web: /chat/schedules, sidebar entry (apps/web/shared/components/layout/app-nav-items.ts:135; apps/web/app/chat/schedules/page.tsx:5-17); page metadata title 'Scheduled'.
- Web: inside a project, tab 'Scheduled' (projects/[id]/page.tsx:1339-1352).
- Desktop web app also shows a section 'On this computer' (local routines) above the cloud schedules (LocalRoutinesSection.tsx:194-199; SchedulesPageWithProjects.tsx:48).
- Mobile: drawer 'Schedules' (DrawerContent.tsx:121-125) at /(app)/schedules.
- CLI: 'agi schedules' with list, create, delete, edit, pause, resume, run, runs, approve, deny (lib.rs:1504-1620).
- Chrome: 'Schedules' section in the side panel (_locales spSchedulesTitle; schedulesSection.ts).
- VS Code: 'Code: Show Schedules' tree with pause, resume, run and open on web (commandSetup.ts:2563-2575).

**Before you start**

- Signed in.
- Plan with maxScheduledTasks above zero: free and byok are zero, basic 3, pro 5, max 15 (the MAX plan constant at billing-catalog.ts:572), max_15x 25 (billing-catalog.ts:572-683).
- Mobile: Cloud mode and cloud unlocked (schedules/index.tsx:83).

**Screens and controls**

- Header button 'New task' (or 'New task in this project') with a menu 'Create from scratch' and 'Start from a template'; 'Upgrade plan' replaces it when the plan allows none.
- Search 'Search scheduled tasks...', status filter All, Active, Paused, Completed, Failed, Expired; sort 'Next run' or 'Recently created'.
- Card: pause or resume icon, 'Run History', 'Edit Schedule', 'View latest result', 'More actions' with 'Run now' and delete.
- Dialogs 'Create Schedule' or 'Edit Schedule'; 'Delete Schedule?'.

**Journey**

1. 1. Open Scheduled.
2. 2. Click 'New task' > 'Create from scratch' or 'Start from a template'; fill name, prompt, cadence, model, access; save.
3. 3. The card shows next run and status.
4. 4. Use the card actions: edit, pause or resume, 'Run now', delete (asks first).
5. 5. Open Run History to read each run, load more, retry on failure.
6. 6. If a run needs approval, approve or deny it in Run History.

**What the person sees and gets**

- 'Schedule finished successfully.' or 'Schedule finished with status <status>.' (SchedulesPage.tsx:~655-660).
- Row errors per schedule such as 'Schedule could not be run.' and 'The run finished, but the schedule summary could not be refreshed.'
- Card notes: paused because of cap or approval ('Paused: a run needed your approval. Approve or deny it in Run History...' ScheduleCard.tsx:349).
- Plan message 'Scheduled tasks are available on Basic and higher plans.' (SchedulesPage.tsx:1076).
- History states: 'Loading run history…', 'Retry Run History', 'No runs recorded yet.', 'Load More Runs' (ScheduleRunHistory.tsx:188-247).

**Settings**

- Time zone, cadence, model, credit cap, access fields (ScheduleAccessFields.tsx; creditCap text at ScheduleCard.tsx:338).
- Event triggers panel (ScheduleTriggersPanel.tsx).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/schedules lists with limit and offset and optional projectId; POST creates under an advisory lock and quota assert (apps/web/app/api/schedules/route.ts:78-136).
- A plan limit of zero is refused before anything else with code schedules_not_in_plan; a full quota gives schedule_limit_reached with an upgrade hint (route.ts:42-52,112-120).
- Run now posts to /api/schedules/<id>/runs with an Idempotency-Key header; the server requires the header (schedule-api.ts:274-292; runs/route.ts:74-76).
- The web page keeps one key per schedule until a run call succeeds, so a retry or double click after a failure reuses the key; the key is deleted only on success (SchedulesPage.tsx:294,633-642).
- Approve or deny a run from history posts to the run approval route and refreshes the schedule (SchedulesPage.tsx:~690-720; approval/route.ts:66).
- Cards show busy state per row (operation) and per-row errors (SchedulesPage.tsx:633-668).
- Delete asks 'Delete Schedule?' and says it removes the run history and event triggers and cannot be undone (SchedulesPage.tsx:1402-1404).
- Server runs due schedules from the cron route run-schedules with cron auth (apps/web/app/api/cron/run-schedules/route.ts:1-25).
- Mobile checks the plan limit and offers create only when allowed (schedules/index.tsx:62-63,98-116).
- CLI has the full set of commands against the same /api/schedules (schedules.rs:1-8).
- Chrome can create, list, run now, enable or disable, update and resolve approvals (schedulesSection.ts imports).

**Incomplete**

- The brief says Run now uses a fresh idempotency key; the code reuses a stored key per schedule until the call succeeds (SchedulesPage.tsx:636-637,640).
- The brief says VS Code has no manager row; it has a Schedules tree with pause, resume and run commands (commandSetup.ts:2563-2580) but create and edit there were not seen.
- The approval path on Chrome and mobile history was not opened.

**Present but disconnected or switched off**

- When the plan allows zero, the create control is replaced by 'Upgrade plan' and a note (SchedulesPage.tsx:1052-1058,1074-1078).
- Web 'On this computer' local routines work only inside the Desktop app (LocalRoutinesSection.tsx:44).

**Not available**

- Local mode schedules in the cloud sense: none; schedules run only on our servers. The Desktop local routines run 'while the Desktop app is open' and 'the model may still run in the cloud' (LocalRoutinesSection.tsx:199).
- Mobile in Local mode: schedules not loaded (schedules/index.tsx:83).

## 4. Required behaviour

**Established requirements**

- A scheduled-task manager lists schedules with cadence and status and lets users create, edit, pause or resume, run now and delete. (source: S4.17 Should)
- Opening one routine shows its configuration (prompt, cadence, next run) and its run history. (source: S4.18 Should)
- Rate limits, quotas and plan limits are configuration, not constants. (source: AGENTS.md sections 4 and 8)
- An action a user cannot undo asks first and names the consequence. (source: AGENTS.md section 9)

**Acceptance criteria**

1. On a free account the page shows no 'New task' button, shows 'Upgrade plan' and the Basic-and-higher note.
2. On a plan with a limit, creating beyond it is refused with schedule_limit_reached text.
3. Clicking 'Run now' twice quickly produces one run (same key) and a result message.
4. After a failed 'Run now' the retry reuses the key.
5. A schedule that paused for approval shows the note and lets the person approve or deny in Run History.
6. Deleting asks 'Delete Schedule?' and removes history on confirm.
7. Each card shows its own busy state and error without blocking others.
8. Run History shows loading, error with retry, empty and load-more states.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A schedule fired by the cron must create a run row with status (scheduled_task_runs).
- Cap on credits pauses the schedule (ScheduleCard.tsx:338).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the brief on the idempotency key.
- [proposed] Add create and edit to the VS Code schedules tree or state that it opens the web.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Schedules route | `apps/web/app/chat/schedules/page.tsx` | Page shell |
| component | SchedulesPageWithProjects | `apps/web/features/schedules/components/SchedulesPageWithProjects.tsx` | Combines local routines and cloud schedules, projects, agents |
| component | SchedulesPage | `apps/web/features/schedules/components/SchedulesPage.tsx` | List, filters, create, edit, run now, delete, approvals |
| component | ScheduleCard | `apps/web/features/schedules/components/ScheduleCard.tsx` | Row UI and actions |
| component | ScheduleRunHistory | `apps/web/features/schedules/components/ScheduleRunHistory.tsx` | Run history with approval |
| component | ScheduleForm | `apps/web/features/schedules/components/ScheduleForm.tsx` | Create and edit form |
| component | LocalRoutinesSection | `apps/web/features/schedules/components/LocalRoutinesSection.tsx` | Desktop local routines |
| service | schedule-api | `apps/web/features/schedules/services/schedule-api.ts` | HTTP client incl. runNow with Idempotency-Key |
| endpoint | Schedules collection | `apps/web/app/api/schedules/route.ts` | GET list, POST create with plan checks |
| endpoint | One schedule | `apps/web/app/api/schedules/[id]/route.ts` | GET, PUT, PATCH toggle, DELETE |
| endpoint | Schedule runs | `apps/web/app/api/schedules/[id]/runs/route.ts` | GET history, POST run now |
| endpoint | Run approval | `apps/web/app/api/schedules/[id]/runs/[runId]/approval/route.ts` | POST approve or deny |
| service | schedule-service | `apps/web/lib/services/schedule-service.ts` | createSchedule, assertScheduleQuota, processDueScheduleRuns |
| service | scheduled-agent-executor | `apps/web/lib/services/scheduled-agent-executor.ts` | Runs the scheduled agent |
| job | run-schedules cron | `apps/web/app/api/cron/run-schedules/route.ts` | Fires due schedule runs |
| table | scheduled_tasks | `apps/web/lib/services/schedule-service.ts` | Schedule rows |
| table | scheduled_task_runs | `apps/web/lib/services/schedule-service.ts` | Run rows |
| config | Plan limits | `packages/contracts/types/src/billing-catalog.ts` | maxScheduledTasks per plan and getPlanMaxScheduledTasks |
| config | Schedule templates | `apps/web/features/schedules/lib/schedule-templates.ts` | Templates for 'Start from a template' |
| screen | Mobile schedules | `apps/mobile/app/(app)/schedules/index.tsx` | List and create gate |
| service | Mobile schedules service | `apps/mobile/src/features/schedules/service.ts` | API client |
| component | Mobile ScheduleCard | `apps/mobile/src/features/schedules/components/ScheduleCard.tsx` | Card with details and history |
| service | CLI schedules | `apps/cli/src/schedules.rs` | Hosted schedules client |
| component | Chrome schedules section | `apps/extension/src/features/side-panel/schedulesSection.ts` | Schedules in the side panel |
| command | VS Code schedules commands | `apps/extension-vscode/src/core/commandSetup.ts` | showSchedules, pause, resume, run |
| test | SchedulesPage test | `apps/web/features/schedules/components/SchedulesPage.test.tsx` | Page tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Create posts the schedule; the server checks plan and quota inside a transaction with an advisory lock, then inserts into scheduled_tasks. | our servers | apps/web/app/api/schedules/route.ts:112-136 |
| A cron calls the run-schedules route, which processes due runs (a batch per sweep). | our servers | apps/web/app/api/cron/run-schedules/route.ts:1-25 |
| The scheduled agent executes the prompt with a model and tools; the run is recorded in scheduled_task_runs; a run that needs approval pauses the schedule. | our servers | schedule-service.ts:1299-1591; scheduled-agent-executor.ts; ScheduleCard.tsx:343-349 |
| Run now posts with Idempotency-Key; the server rejects a missing header. | device and our servers | schedule-api.ts:274-292; runs/route.ts:74-76 |
| Run History reads runs by page and resolves approvals with decision and tool call ids. | device and our servers | SchedulesPage.tsx:555-565,667-690 |
| Desktop local routines run on the computer through the desktop host bridge. | device | LocalRoutinesSection.tsx:41-46,199 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Schedules (prompt, cadence, model, caps, project link) | table:scheduled_tasks | Yes to all apps using /api/schedules | Delete removes history and triggers (SchedulesPage.tsx:1404) |
| Runs and results | table:scheduled_task_runs | Yes | Retention unknown |
| Manual-run idempotency keys | component memory (manualRunKeys ref) | No | Deleted after a successful run call |
| Local routines | Desktop host (device) | unknown | Removed with confirmation 'Remove <name>?' (LocalRoutinesSection.tsx:290) |

**Models and providers.** Each scheduled run calls a model through the Cloud pipeline. The schedule stores a model selection, defaulting to automatic (CLI help 'Defaults to the account's automatic selection', lib.rs:1529; MANAGED_CLOUD_DEFAULT_MODEL_SELECTION used in Chrome). Provider choice is by routing (SYS-model-catalog-and-routing, SYS-inference-providers). Prompts are checked for secrets before saving (refuseBlockedSchedulePrompt, route.ts:121).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account. |
| Permissions | Rows are scoped to the user; a workspace access gate and a 'schedules' workspace feature gate apply (route.ts:73-76,107-111). Shared schedule preview exists (SharedSchedulePreview.tsx). |
| Subscription | maxScheduledTasks per plan: free 0, byok 0, basic 3, pro 5, max 15, max_15x 25 as read from billing-catalog.ts:572-683 (team, enterprise values not read). Zero means create is not offered (SchedulesPage.tsx:306,1052). |
| Limits and metering | Quota checked with assertScheduleQuota under a lock; each schedule has a credit cap that can pause it (ScheduleCard.tsx:338); runs per cron sweep limited by PLATFORM_SCHEDULE_RUNS_PER_SWEEP (run-schedules route import). Page size from MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE. |
| Feature flags | Mobile FEATURES.schedules is true (v1FeatureFlags.ts:18). Workspace feature gate 'schedules'. |
| Model compatibility | Model options come from listChromeScheduleModels and the web form; compatibility rules not read. |
| Provider restrictions | None found in these files. |
| Local mode | Cloud schedules do not run in Local mode: mobile loads them only in Cloud mode (schedules/index.tsx:83); the CLI needs an AGI credential and refuses non-managed privacy mode (schedules.rs:36-48). Desktop 'On this computer' routines run on the device while the app is open, though the model may still run in the cloud. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading schedules…' status | SchedulesPage.tsx:1090-1094 |
| List error | 'Retry Loading Schedules' | SchedulesPage.tsx:1110 |
| Empty | 'No schedules yet' or 'No scheduled tasks in this project yet' | SchedulesPage.tsx:1119 |
| Load more failure | 'Retry loading more schedules.' | SchedulesPage.tsx:1272 |
| Run now busy | Row operation 'run' set; other rows unaffected | SchedulesPage.tsx:633-668 |
| Run now fails | Row error, key kept for retry | SchedulesPage.tsx:660-662 |
| Paused for cap or approval | Explanatory note on the card | ScheduleCard.tsx:338,349 |
| Run history loading, error, empty | As listed in the UI | ScheduleRunHistory.tsx:188-211 |
| Plan allows zero | Upgrade plan button, note, create not offered | SchedulesPage.tsx:1052-1078 |
| Limit reached on server | 403 subscription_required with schedule_limit_reached and upgrade hint | route.ts:44-52 |
| Offline | not handled beyond request errors | nothing found in SchedulesPage.tsx beyond error messages |
| Accessibility | Cards carry aria-labels per schedule name; status region 'Schedule action result' is polite live | ScheduleCard.tsx:385-438; SchedulesPage.tsx:1080-1086 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/schedules/components/SchedulesPage.test.tsx`: Schedules page
- `apps/web/features/schedules/components/ScheduleCard.test.tsx`: Card
- `apps/web/features/schedules/components/ScheduleForm.test.tsx`: Form
- `apps/web/features/schedules/services/schedule-api.test.ts`: API client including runNow with a key (line 189)
- `apps/web/lib/services/schedule-service.test.ts`: Schedule service
- `apps/web/app/api/schedules/[id]/runs/[runId]/approval/__tests__/route.test.ts`: Approval route
- `apps/web/app/api/schedules/__tests__/route.secret-handling.test.ts`: Secret handling in prompts
- `apps/web/features/schedules/components/LocalRoutinesSection.test.tsx`: Local routines
- `apps/mobile/src/features/schedules/__tests__/ScheduleListRace.test.ts`: Mobile list race
- `apps/mobile/src/features/schedules/__tests__/ScheduleRunHistoryReport.test.tsx`: Mobile run history
- `apps/cli/src/schedules.rs`: Inline tests (13 test functions)

**Test scenarios**

- **Free plan**
  1. Open /chat/schedules on a free account
  - Expected: Upgrade plan button and the Basic-and-higher note; no New task
- **Create and run now**
  1. Create a schedule from a template
  2. Open More actions > Run now
  - Expected: Run appears in History with a status; message shown
- **Double click Run now**
  1. Click Run now twice quickly
  - Expected: One run row only
- **Quota**
  1. Create schedules up to the plan limit
  2. Create one more
  - Expected: Refusal with upgrade hint
- **Approval**
  1. Create a schedule whose prompt triggers a tool needing approval
  2. Wait for the run
  3. Open Run History
  - Expected: Approve and Deny buttons; card note explains the pause
- **CLI**
  1. agi schedules create ...
  2. agi schedules runs <name>
  - Expected: Same schedule visible on web

**Where to look when it fails**

- Server log 'Unauthorized scheduled-task cron request'
- Error codes schedules_not_in_plan and schedule_limit_reached
- Tables scheduled_tasks and scheduled_task_runs
- Row error texts on the card

**Hands-on test plans**

- Web: [70-qa/test-plans/web/004-signed-in-application-destinations.md](../../70-qa/test-plans/web/004-signed-in-application-destinations.md)
- Desktop: [70-qa/test-plans/desktop/004-signed-in-application-destinations.md](../../70-qa/test-plans/desktop/004-signed-in-application-destinations.md)
- Mobile: [70-qa/test-plans/mobile/004-signed-in-application-destinations.md](../../70-qa/test-plans/mobile/004-signed-in-application-destinations.md)
- CLI: [70-qa/test-plans/cli/004-signed-in-application-destinations.md](../../70-qa/test-plans/cli/004-signed-in-application-destinations.md)
- VS Code: [70-qa/test-plans/vscode/004-signed-in-application-destinations.md](../../70-qa/test-plans/vscode/004-signed-in-application-destinations.md)
- Chrome: [70-qa/test-plans/chrome/004-signed-in-application-destinations.md](../../70-qa/test-plans/chrome/004-signed-in-application-destinations.md)

## 10. Gaps and dependencies

- **Brief's idempotency description is wrong: the key is reused until success.** Affects: Brief and testers. Evidence: SchedulesPage.tsx:636-640. Work needed: Fix the brief; add a test for retry reuse
- **VS Code lacks create and edit in the schedules tree (not seen).** Affects: VS Code. Evidence: commandSetup.ts:2563-2580. Work needed: Verify and decide
- **Approval handling on mobile and Chrome history not verified.** Affects: Mobile, Chrome. Evidence: Files not opened. Work needed: Read and test
- **Retention of run history unknown.** Affects: All. Evidence: No policy read. Work needed: Read deletion policy
- **No Local-mode scheduled execution for phones.** Affects: Mobile Local. Evidence: schedules/index.tsx:83. Work needed: Product decision

**Depends on**

- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-observability-and-operations
- table:scheduled_tasks
- table:scheduled_task_runs
- api:GET /api/schedules
- api:POST /api/schedules
- api:POST /api/schedules/{id}/runs
- api:POST /api/schedules/{id}/runs/{runId}/approval

## Unknown

- Plan values for team and enterprise tiers.
- Run history retention.
- Exact model compatibility rules for schedules.
- Whether VS Code can create or edit a schedule.
- Mobile and Chrome approval wiring.
- Whether desktop local routines sync anywhere.
- The cadence a free-trial or promotional plan gets.
