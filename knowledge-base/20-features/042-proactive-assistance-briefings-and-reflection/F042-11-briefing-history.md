---
id: "F042-11"
type: "feature"
title: "Briefing history"
aliases: ["Briefing history (S42.25)", "Proactive-feature history and saved editions", "Recent results", "Run history", "Scheduled runs", "Recent schedule results"]
area: "42 Proactive assistance, briefings, and reflection"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S42.25"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "api:GET /api/schedules/runs", "table:scheduled_task_runs", "table:scheduled_tasks", "table:managed_usage_requests", "F042-07", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F042-11 Briefing history

Lets a signed-in person look back at past scheduled runs, including daily briefings, with status, output, error, cost and a late or skipped note. Web and the internal desktop show a 'Recent results' list across schedules; mobile has a 'Scheduled runs' screen and per-schedule history. There are no saved editions; history is the run list.

Area: [42. Proactive assistance, briefings, and reflection](README.md). Requirement items: [S42.25](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4225).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lists runs of the person's scheduled tasks, newest first, each with status, output, error, credits used and timing note (packages/contracts/cloud-contracts/src/schedules.ts:244-262,740-760; apps/web/lib/services/schedule-service.ts:1418-1454).

**Why it exists.** The brief wants past briefings and proactive outputs kept as a browsable history (S42.25). A briefing today is a schedule (S42.01), so its history is the run list.

**Who uses it.** A signed-in person with scheduled tasks on a plan that allows them.

**Problems it solves**

- Reading a result after the notice is gone.
- Seeing why a run failed or was skipped.
- Approving a paused run from the history.

**Use cases**

- Open 'Recent results' to read this morning's briefing output.
- See that a run 'Ran late' after downtime.
- Page back through older runs with 'Show more results'.
- Check how many credits a run used.

## 2. User experience

**Where to find it**

- Web: Scheduled page (heading 'Scheduled'), section 'Recent results' with 'Show' and 'Hide'; per-schedule run history inside each schedule card (apps/web/features/schedules/components/SchedulesPage.tsx:967-968,1191-1198; RecentScheduleResults.tsx:84-100).
- Mobile: Schedules screen, 'Scheduled runs' control opens the runs screen; each schedule card has 'Run History' (apps/mobile/app/(app)/schedules/index.tsx:447; apps/mobile/app/(app)/schedules/runs.tsx; apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx:290).
- Desktop internal Tauri build: cloud schedules view, 'Recent results' with 'Show' and 'Hide' (apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:957-994). The public Desktop shows the hosted web app (doc: AGENTS.md section 5), so the web view applies there [inferred].
- CLI: 'agi schedules runs <id>' with limit, offset, json (apps/cli/src/lib.rs:4502-4519). VS Code: command 'agi-workforce.showScheduleRuns' (apps/extension-vscode/src/features/schedules/scheduleActions.ts:27,199). Chrome side panel: 'Runs' button on each schedule (apps/extension/src/features/side-panel/schedulesSection.ts:925-937). The brief says CLI and VS Code n/a and Chrome missing; the code shows run listing on all three.

**Before you start**

- Signed-in cloud account with at least one schedule.
- Plan that allows scheduled tasks to create them (billing-catalog.ts:600-701); viewing has no plan check in the route.
- Mobile: Cloud mode, FEATURES.schedules and cloud unlocked (apps/mobile/app/(app)/schedules/runs.tsx:79).

**Screens and controls**

- Web Recent results: Show or Hide toggle, Retry, 'Show more results' (RecentScheduleResults.tsx:84-155).
- Run row: status, usage line (credits, tokens, model), approval card 'Waiting for your approval', timing note, error, 'View Output' disclosure (ScheduleRunHistory.tsx:100-170).
- Mobile runs screen: list, pull to refresh, load more, 'Report this run', retry (runs.tsx:33,130-132,238).
- Mobile per-schedule history: 'Run History', refresh button, 'No runs yet', retry (ScheduleRunHistory.tsx:290-321).

**Journey**

1. 1. Open Scheduled (web) or Schedules (mobile).
2. 2. Open Recent results or Scheduled runs.
3. 3. The app fetches the newest page of 20 runs.
4. 4. Read status, output and notes; expand 'View Output' on web.
5. 5. Load older runs with 'Show more results' (web) or by scrolling (mobile).
6. 6. Approve or deny a run that waits for approval from the row.

**What the person sees and gets**

- Empty: 'No schedule has run yet.' (web, desktop); 'No runs yet' (mobile per schedule).
- Late note: 'Ran late: scheduled for <time>, started <n> later.'; skipped note: 'Skipped the run scheduled for <time>: it was missed by <n>, and this schedule skips missed runs.' (schedules.ts:740-760).
- Error: 'Recent results could not be loaded.' with Retry; 'Run history unavailable. Try again.' on mobile (RecentScheduleResults.tsx:63-95; ScheduleRunHistory.tsx:317).
- Mobile shows fixed copy instead of the raw error: 'This run exceeded its time limit. Try again.', 'This run was canceled.', 'This run could not finish. Try again.' (apps/mobile/src/features/schedules/service.ts:125-131).

**Settings**

- None specific. Per-schedule notice switches and Time and focus affect only notices, not history.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/schedules/runs returns a keyset-paged list across all of the user's schedules, default 20, max 100, with a cursor that must match the issued format (apps/web/app/api/schedules/runs/route.ts:20-52; packages/contracts/cloud-contracts/src/schedules.ts:9-10).
- Per-schedule list uses limit and offset (apps/web/lib/services/schedule-service.ts:1456-1480).
- Each run carries status, trigger, scheduled-for, start, end, duration, result, output, error, credits, pending approval (schedules.ts:244-261); credits come from managed_usage_requests (schedule-service.ts:1434-1439).
- Late and skipped notes are computed by one shared function used by web, mobile and others (schedules.ts:728-760; apps/mobile/src/features/schedules/service.ts:142).
- Web hides the error text for skipped runs and shows the note instead (apps/web/features/schedules/components/ScheduleRunHistory.tsx:154-163).
- Mobile has a cross-schedule 'Scheduled runs' screen with cursor paging (apps/mobile/src/features/schedules/store.ts:472-510; test: apps/mobile/__tests__/ScheduleRunsScreen.test.tsx:176).

**Incomplete**

- Mobile per-schedule history reads one default page and shows at most 5 runs (ScheduleRunHistory.tsx:269-276; service.ts:244-253).
- Desktop internal recent list loads 20 runs once, no 'more' control (DesktopCloudSchedules.tsx:519-527).
- Web 'Recent results' appears only when at least one schedule is listed (SchedulesPage.tsx:1191).
- No 'saved editions': there is no separate stored briefing edition beyond the run record.

**Present but disconnected or switched off**

- Chrome, CLI and VS Code run listings exist but the brief says missing or n/a; scope for CLI and VS Code is set by founder decisions (docs/decisions/2026-09-27-founder-decisions.md:408,471).

**Not available**

- A history of proactive outputs other than scheduled runs: none found.
- Search or filter inside history: none found in the files read.

## 4. Required behaviour

**Established requirements**

- Past briefings and proactive outputs are kept as a browsable history. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.25)
- The VS Code extension and the CLI do not add a proactive-feature history or a routine history view beyond listing runs. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-25 line 401; D-2026-09-28-29 line 462))
- Run history paging: default and maximum page sizes come from the contract constants. (source: packages/contracts/cloud-contracts/src/schedules.ts:9-10 (code))

**Acceptance criteria**

1. After a scheduled run ends, it appears at the top of Recent results after reload.
2. 'Show more results' loads the next 20 without duplicates.
3. A missed run shows the late or skipped note; a failed run shows an error line.
4. Empty account shows the empty text, not an error.
5. A forged cursor returns a validation error.
6. Mobile in Local mode makes no Cloud call for runs.
7. A run waiting for approval shows Approve and Deny and the action refreshes the row.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- History is limited to the signed-in user's own schedules [inferred from schedule-service.ts:1442].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add 'Show more' to the desktop list and pagination to mobile per-schedule history.
- [proposed] Decide whether the brief's Chrome 'missing' is correct given the Runs button.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/schedules/runs | `apps/web/app/api/schedules/runs/route.ts` | Cross-schedule keyset list. |
| endpoint | GET /api/schedules/{id}/runs | `apps/web/app/api/schedules/[id]/runs/route.ts` | Per-schedule list (route file present; handler not read). |
| service | listRecentScheduleRuns, listScheduleRuns | `apps/web/lib/services/schedule-service.ts` | Queries (lines 1418-1480). |
| schema | ManagedCloudScheduleRunSchema and recent list | `packages/contracts/cloud-contracts/src/schedules.ts` | Run shape, paging constants, describeScheduleRunTiming. |
| component | RecentScheduleResults | `apps/web/features/schedules/components/RecentScheduleResults.tsx` | Web recent list. |
| component | ScheduleRunHistory and RunRow | `apps/web/features/schedules/components/ScheduleRunHistory.tsx` | Run rows, output, approval card. |
| component | SchedulesPage | `apps/web/features/schedules/components/SchedulesPage.tsx` | Page host (lines 575,1191). |
| component | DesktopCloudSchedules | `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx` | Internal desktop list (lines 509-527,957-994). |
| screen | Mobile runs screen | `apps/mobile/app/(app)/schedules/runs.tsx` | Cross-schedule list. |
| component | Mobile ScheduleRunHistory | `apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx` | Per-schedule list of up to 5. |
| store | mobile schedule store | `apps/mobile/src/features/schedules/store.ts` | fetchRecentRuns and fetchMoreRecentRuns. |
| service | mobile schedule service | `apps/mobile/src/features/schedules/service.ts` | fetchScheduleRuns, mapRun with fixed error copy (lines 125-160,244-253). |
| command | agi schedules runs | `apps/cli/src/lib.rs` | CLI run listing (lines 4502-4519; client in apps/cli/src/schedules.rs:351). |
| command | showScheduleRuns | `apps/extension-vscode/src/features/schedules/scheduleActions.ts` | VS Code quick pick of runs, page limit 20. |
| component | Chrome schedulesSection Runs | `apps/extension/src/features/side-panel/schedulesSection.ts` | Runs button and list; client apps/extension/src/features/cloud-bridge/schedulesClient.ts:362. |
| table | scheduled_task_runs | `apps/web/db/neon/0009_scheduling.sql` | Run rows, cascade on schedule delete (lines 34-47). |
| table | managed_usage_requests | `apps/web/lib/services/schedule-service.ts` | Source of credits per run (line 1434). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person opens the list; the client calls GET /api/schedules/runs with limit and optional cursor. | device | apps/web/features/schedules/components/RecentScheduleResults.tsx:50-56 |
| The server scopes to the user, applies the rate limit, decodes the cursor and queries runs joined to schedules. | our servers | apps/web/app/api/schedules/runs/route.ts:30-48; schedule-service.ts:1429-1448 |
| The server returns runs plus a next cursor; the client validates and shows them. | our servers | route.ts:49-52; apps/mobile/src/features/schedules/service.ts:244-252 |
| The client builds the late or skipped note locally from the run's result. | device | schedules.ts:728-760 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run records (status, result, output, error, credits) | table:scheduled_task_runs | Server-side, read by every app | Deleted when the schedule is deleted (cascade, 0009_scheduling.sql:36); other retention: none found |
| Mobile recent runs list | In-memory state of store in apps/mobile/src/features/schedules/store.ts | Reloaded from server | Not persisted (not confirmed for the store's persist settings) |

**Models and providers.** The history itself calls no model. Each row may show the model that produced the run (ScheduleRunHistory.tsx:100-125); the run is made by the scheduled-agent executor (see F042-07 and SYS-agents-tools-and-automation). Own-key plans cannot create schedules (byok limit 0, billing-catalog.ts:610).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in cloud account; routes use getUserScopedDb (route.ts:31). |
| Permissions | User-scoped database access (row filter task.user_id at schedule-service.ts:1442). Workspace approval actions need rights to the schedule [inferred]. |
| Subscription | Viewing: no plan check in the route. Creating schedules: free 0, byok 0, basic 3, pro 5, team 10 (billing-catalog.ts:600-701); web copy 'Scheduled tasks are available on Basic and higher plans.' (SchedulesPage.tsx:1076). |
| Limits and metering | Page size default 20, max 100 (schedules.ts:9-10); rate limit bucket 'chat-conversation' per user (route.ts:32). Credits per run are displayed from usage rows. |
| Feature flags | Mobile FEATURES.schedules (v1FeatureFlags.ts:14) and cloudUnlocked (runs.tsx:79). |
| Model compatibility | Not applicable to listing. |
| Provider restrictions | none found in the code |
| Local mode | Mobile Local mode shows no Cloud runs and makes no Cloud call (test: apps/mobile/__tests__/ScheduleRunsScreen.test.tsx:302). Scheduled runs run only on Cloud; Local-mode scheduling: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Skeleton rows with status label 'Loading recent results'. | RecentScheduleResults.tsx:101-105 |
| Empty | 'No schedule has run yet.' | RecentScheduleResults.tsx:115-116 |
| Error | Message with Retry; if loading more fails, earlier rows stay and the message shows. | RecentScheduleResults.tsx:61-67,108-114,134 |
| Load more | Button disabled while loading; label 'Loading…'. | RecentScheduleResults.tsx:140-148 |
| Bad cursor | Validation error. | route.ts:42-44; test apps/web/__tests__/api/schedule-recent-runs.test.ts:90 |
| Late or skipped | Note replaces the error line for skipped runs. | ScheduleRunHistory.tsx:154-163 |
| Mobile refresh failure | Retry restores the newest page; load-more failure retries the same older page. | ScheduleRunsScreen.test.tsx:196-250 |
| Offline | Shown as the load error; no cached list. | store.ts:480-486 |
| Approval pending | Row shows an approval card with expiry; mobile card says to approve or deny in History. | ScheduleRunHistory.tsx:119-140; ScheduleCard.tsx:327-330 |
| Accessibility | Web section has aria-expanded and aria-controls; mobile refresh has an accessibility label. | RecentScheduleResults.tsx:91-93; ScheduleRunHistory.tsx:295-297 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/schedule-recent-runs.test.ts`: First page, cursor continuation, forged cursor.
- `apps/web/__tests__/api/schedule-runs.test.ts`: Per-schedule runs route.
- `apps/web/features/schedules/components/SchedulesPage.test.tsx`: Schedules page including run history [scope not itemised].
- `apps/web/features/schedules/types/schedule-run-usage.test.ts`: Run usage display values.
- `apps/mobile/__tests__/ScheduleRunsScreen.test.tsx`: Cross-schedule list, empty, error, cursor, refresh failures, Local mode.
- `apps/mobile/__tests__/schedule-service.test.ts`: Mobile schedule service mapping.
- `apps/desktop/src/features/schedules/__tests__/DesktopCloudSchedules.test.tsx`: Desktop internal schedules view.
- `apps/extension-vscode/src/__tests__/schedules.test.ts`: VS Code schedule commands.
- `apps/extension/__tests__/scheduled-task-runs.test.ts`: Extension scheduled-run journal, not the run list UI.

**Test scenarios**

- **New run appears**
  1. Run a schedule now.
  2. Open Recent results and reload.
  - Expected: The run is first, with status and output.
- **Paging**
  1. Create more than 20 runs.
  2. Open Recent results and press 'Show more results'.
  - Expected: Next 20 appear, no duplicates, button disappears at the end.
- **Missed run note**
  1. Pause the executor past the grace period for a schedule that skips missed runs.
  2. View history.
  - Expected: Skipped note naming the scheduled time and lateness; no raw error.
- **Failed run on mobile**
  1. Force a failed run.
  2. Open Run History on the phone.
  - Expected: Fixed copy 'This run could not finish. Try again.'
- **Local mode**
  1. Switch phone to Local mode.
  2. Open Schedules, Scheduled runs.
  - Expected: No Cloud request; banner to switch.

**Where to look when it fails**

- Table scheduled_task_runs (status, error, result).
- Error text 'Recent results could not be loaded.' and 'Run history could not be loaded.'
- Mobile console 'Failed to fetch recent schedule runs'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md)
- Desktop: [70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md)
- Mobile: [70-qa/test-plans/mobile/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/mobile/042-proactive-assistance-briefings-and-reflection.md)
- Chrome: [70-qa/test-plans/chrome/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/chrome/042-proactive-assistance-briefings-and-reflection.md)

## 10. Gaps and dependencies

- **Brief says Chrome missing, but the side panel has a 'Runs' list; CLI and VS Code also list runs while the brief says n/a.** Affects: Chrome, CLI, VS Code. Evidence: schedulesSection.ts:925-937; apps/cli/src/lib.rs:4502; scheduleActions.ts:199. Work needed: Update the audit ledger or document the limits.
- **Mobile per-schedule history is capped at 5 and has no paging; desktop recent list has no paging.** Affects: Mobile, internal desktop. Evidence: ScheduleRunHistory.tsx:269; DesktopCloudSchedules.tsx:519-527. Work needed: Add cursor paging.
- **Mobile hides the real error text.** Affects: Mobile users diagnosing failures. Evidence: service.ts:125-131. Work needed: Decide whether to show the safe summary the server stores.
- **No saved editions or briefing-specific view.** Affects: All apps. Evidence: No code found; briefing is a schedule template (apps/mobile/src/features/schedules/templates.ts:22 per brief). Work needed: Product decision.
- **Retention of run rows unknown.** Affects: Storage and privacy. Evidence: No retention job found in schedule-service.ts. Work needed: Confirm and document.

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- api:GET /api/schedules/runs
- table:scheduled_task_runs
- table:scheduled_tasks
- table:managed_usage_requests
- F042-07
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts

## Unknown

- Retention of scheduled_task_runs rows beyond schedule deletion.
- What the per-schedule runs route enforces (route file not read).
- Whether the public Electron Desktop shows the web list unchanged.
- Whether the mobile store persists recent runs.
- What SchedulesPage.test.tsx and desktop tests assert about history.
- Whether a Local-mode schedule exists on mobile or desktop with its own history.
