---
id: "F042-03"
type: "feature"
title: "Briefing home and content"
aliases: ["Briefing home", "Briefing cards", "Calendar overview", "Email or work summary", "Suggested next actions", "All caught up state", "S42.05", "S42.06", "S42.07", "S42.08", "S42.09", "S42.24"]
area: "42 Proactive assistance, briefings, and reflection"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S42.05", "S42.06", "S42.07", "S42.08", "S42.09", "S42.24"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "F042-01", "SYS-shared-ui-and-design", "SYS-connectors-plugins-and-skills", "table:scheduled_task_runs", "api:GET /api/schedules/runs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F042-03 Briefing home and content

A briefing home with cards (calendar, email or work summary, suggested actions) and an 'all caught up' end state is not built on any app. Today the briefing is one block of agent text in a schedule's run history, plus a 'Recent results' list on web. The prompt asks for these topics but no layout exists.

Area: [42. Proactive assistance, briefings, and reflection](README.md). Requirement items: [S42.05](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4205), [S42.06](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4206), [S42.07](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4207), [S42.08](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4208), [S42.09](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4209), [S42.24](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4224).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Target: one screen that shows today's briefing as separate cards and ends with a clear finished state. Present reality: the person reads the run result as text.

**Why it exists.** Items S42.05 to S42.09 and S42.24 in the area brief (doc: knowledge-base/data/area-briefs/042-proactive-assistance-briefings-and-reflection.md).

**Who uses it.** People who receive a daily briefing.

**Problems it solves**

- A wall of text is slow to scan.
- The person cannot tell when the briefing is finished.
- Calendar, mail and next actions mix together.

**Use cases**

- Open the app in the morning and see today's meetings first.
- Skim an email summary card.
- Tap a suggested next action.
- See 'all caught up' and close the app.

## 2. User experience

**Where to find it**

- Not available as a screen on any app.
- Closest on web: Schedules page > 'Recent results' (apps/web/features/schedules/components/RecentScheduleResults.tsx:89) and a card's history button 'View History for <name>' (ScheduleCard.tsx:385-395).
- Closest on mobile: schedule run history in the schedule card (apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx).
- Closest on desktop (Tauri build): run history in DesktopCloudSchedules.tsx.
- CLI: 'agi schedules runs <id>'.

**Before you start**

- A Daily briefing schedule that has produced a run (F042-01).

**Screens and controls**

- Recent results list with 'Load more' style paging by cursor (RecentScheduleResults.tsx:53-60).
- Per-schedule run history with status, result and approve or deny controls.

**Journey**

1. Open the schedule or Recent results.
2. Open a run.
3. Read the text the agent wrote.
4. No cards, no end state.

**What the person sees and gets**

- Run status and text; 'Recent results could not be loaded.' on error (RecentScheduleResults.tsx:69).

**Settings**

- none found in the code for briefing layout.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Run text is stored and listed (schedule-service.ts:1418-1456; GET /api/schedules/runs, runs/route.ts:30).
- The prompt asks for calendar, email, recent chats, memory and web, leads with the key items, flags time-sensitive ones and ends with one early action under 250 words (schedules.ts:843).

**Incomplete**

- Output is free text; no structure is requested, so no cards can be built from it [inferred from schedules.ts:843].

**Present but disconnected or switched off**

- Calendar and mail input needs connectors that are 'coming soon' (connector-release.ts:14).

**Not available**

- Briefing home, cards, calendar overview, email or work summary card, suggested-actions card, all-caught-up state on web, desktop, mobile, CLI, VS Code and Chrome (brief S42.05-S42.09, S42.24 missing; no code found).

## 4. Required behaviour

**Established requirements**

- A briefing home shows today's briefing (S42.05); the briefing is laid out as cards (S42.06) with calendar overview (S42.07), email or work summary (S42.08) and suggested next actions (S42.09); a digest ends with a clear 'all caught up' state (S42.24). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.05, S42.06, S42.07, S42.08, S42.09, S42.24)

**Acceptance criteria**

1. A screen shows the most recent briefing run as separate cards.
2. A calendar card lists today's meetings when a calendar is connected, or says none is connected.
3. A summary card covers mail or work.
4. A card lists suggested next actions.
5. After the last card an 'all caught up' state appears.
6. Empty state when no briefing has run yet says how to set one up.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Cards need structured output from the run, not prose [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Ask the scheduled run for a structured result (sections) and render cards from it.
- [proposed] Open the latest briefing from the notice tap.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | RecentScheduleResults | `apps/web/features/schedules/components/RecentScheduleResults.tsx` | Web list of latest runs across schedules. |
| component | ScheduleRunHistory (web) | `apps/web/features/schedules/components/ScheduleRunHistory.tsx` | Per-schedule run text on web. |
| component | ScheduleRunHistory (mobile) | `apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx` | Mobile run text. |
| component | DesktopCloudSchedules | `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx` | Desktop run history in the schedules screen. |
| service | listRecentScheduleRuns | `apps/web/lib/services/schedule-service.ts` | Query behind recent results (line 1418). |
| endpoint | GET /api/schedules/runs | `apps/web/app/api/schedules/runs/route.ts` | Recent runs across schedules (line 30). |
| config | daily-briefing template prompt | `packages/contracts/cloud-contracts/src/schedules.ts` | Asks for calendar, email, chats, memory, web, one early action (line 843). |
| service | mobile schedules service mapRun | `apps/mobile/src/features/schedules/service.ts` | Maps run result and errors for the phone. |
| command | agi schedules runs | `apps/cli/src/lib.rs` | CLI run history output. |
| service | CLI render_runs | `apps/cli/src/schedules.rs` | Text rendering of runs (line 631). |
| service | scheduleRunOutput | `apps/extension-vscode/src/features/schedules/scheduleRunOutput.ts` | VS Code run output view. |
| table | scheduled_task_runs | `apps/web/lib/services/schedule-service.ts` | Stores run result. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens Recent results or a schedule's history. | device | apps/web/features/schedules/components/RecentScheduleResults.tsx:53 |
| The app asks the server for recent runs. | our servers | apps/web/app/api/schedules/runs/route.ts:30 |
| The server reads run rows and returns text and status. | our servers | apps/web/lib/services/schedule-service.ts:1418-1456 |
| The app shows the text; no card layout step exists. | device | Not found in the files searched. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run result text | table:scheduled_task_runs | Yes through the runs API | Unknown. |

**Models and providers.** The briefing text comes from the scheduled model call described in F042-01. No model step exists for cards.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. |
| Permissions | Runs are scoped to the owner and workspace (schedule-service.ts:1418-1456). |
| Subscription | Same as F042-01. |
| Limits and metering | none found in the code for viewing runs. |
| Feature flags | none found in the code. |
| Model compatibility | not applicable until built. |
| Provider restrictions | none found in the code. |
| Local mode | Not available; mobile Local mode has no briefing. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Recent results status 'loading'. | RecentScheduleResults.tsx:44-52 |
| Error | 'Recent results could not be loaded.' | RecentScheduleResults.tsx:69 |
| Empty | Not read in detail; recent list empty state unknown. | RecentScheduleResults.tsx (not fully read) |
| All caught up | not handled in the code | No such state found. |
| Run skipped or late | A timing note is shown on the run. | schedules.ts:740-760 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/schedule-recent-runs.test.ts`: Recent runs API; matched by name, cases not read.
- `apps/desktop/src/features/v3/__tests__/AgiWorkScheduled.test.tsx`: A desktop scheduled-work view; matched by search for 'Daily briefing', cases not read.

**Test scenarios**

- **Read the latest brief**
  1. Let a briefing run.
  2. Open Schedules > Recent results.
  - Expected: The run text is listed with status.
- **Empty history**
  1. New account, open Recent results.
  - Expected: An empty state, not an error.
- **Cards**
  1. Look for a briefing home on each app.
  - Expected: Record that none exists.

**Where to look when it fails**

- Table scheduled_task_runs result column.
- Runs route errors from withErrorHandler.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No briefing home, cards or all-caught-up state.** Affects: All six apps.. Evidence: Brief S42.05-S42.09, S42.24 missing; no code found.. Work needed: Design and build home, structured output and states.
- **No structured briefing output.** Affects: Any card UI.. Evidence: schedules.ts:843 asks for prose.. Work needed: Result schema with sections.
- **Calendar and mail inputs unavailable.** Affects: Calendar and email cards.. Evidence: connector-release.ts:14. Work needed: Release connectors.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- F042-01
- SYS-shared-ui-and-design
- SYS-connectors-plugins-and-skills
- table:scheduled_task_runs
- api:GET /api/schedules/runs

## Unknown

- Whether ScheduleRunHistory renders any structure from run results.
- Empty state of Recent results.
- Retention of run text.
- Product design for cards (no spec found).
