---
id: "F042-04"
type: "feature"
title: "Ask, listen to and rate a briefing"
aliases: ["Follow-up question on a briefing item", "Listen-to-briefing mode", "Mark helpful or not helpful", "S42.10", "S42.11", "S42.12"]
area: "42 Proactive assistance, briefings, and reflection"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S42.10", "S42.11", "S42.12"]
depends_on: ["surface:web", "surface:mobile", "surface:chrome", "mode:cloud", "F042-01", "F042-03", "SYS-voice-and-media", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations", "table:scheduled_task_runs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F042-04 Ask, listen to and rate a briefing

Asking a follow-up about a briefing item, listening to a briefing read aloud, and rating a briefing are not built. The brief marks the Chrome follow-up (S42.10) as done, but its cited lines are about desktop pairing and run cancellation, so that claim is unconfirmed. Web can open a schedule's chat through an onOpenChat action.

Area: [42. Proactive assistance, briefings, and reflection](README.md). Requirement items: [S42.10](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4210), [S42.11](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4211), [S42.12](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4212).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Target: the person asks a question about one briefing item, hears the briefing aloud, and rates it.

**Why it exists.** Items S42.10, S42.11 and S42.12 in the area brief (doc: knowledge-base/data/area-briefs/042-proactive-assistance-briefings-and-reflection.md). Follow-ups turn a one-way brief into a conversation; ratings can improve briefings.

**Who uses it.** People who read the briefing, including while commuting (listen).

**Problems it solves**

- A brief item raises a question and there is no way to continue it.
- Reading is not possible while driving.
- No feedback reaches the product.

**Use cases**

- Ask 'what is the 2pm meeting about?' from the briefing.
- Tap listen and hear the brief.
- Mark a brief not helpful.

## 2. User experience

**Where to find it**

- Not available as a briefing control on any app.
- Web: SchedulesPage has an onOpenChat action for a schedule (apps/web/features/schedules/components/SchedulesPage.tsx:183,871); its label was not read.
- Chrome: brief cites apps/extension/src/background.ts:1288 and :1951; those lines are run cancellation and desktop pairing release, not a briefing follow-up.

**Before you start**

- A briefing run (F042-01).

**Screens and controls**

- No listen or rating control found.

**Journey**

1. Follow-up: unknown; open the schedule's chat from the card if the action is present.
2. Listen and rate: no journey.

**What the person sees and gets**

- none found in the code for listen or rating.

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web SchedulesPage accepts an onOpenChat callback and calls it for a schedule (SchedulesPage.tsx:871-873; SchedulesPageWithProjects.tsx:60). What it opens was not read.

**Incomplete**

- Follow-up reach to a single briefing item is not established.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Read-aloud of a briefing on all apps (S42.11).
- Helpful or not helpful control on all apps (S42.12).
- Chrome follow-up (S42.10): cited code does not match; treated as not confirmed.
- No rating, listen or follow-up code found in the files searched.

## 4. Required behaviour

**Established requirements**

- The user can ask a follow-up question about a briefing item (S42.10). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.10)
- The user can listen to the briefing read aloud (S42.11). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.11)
- The user can mark a briefing helpful or not helpful (S42.12). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.12)

**Acceptance criteria**

1. From a briefing, an Ask action opens a chat that already contains that item.
2. A Listen control reads the briefing aloud and can be stopped.
3. Helpful and Not helpful controls save a choice and show it afterwards.
4. The rating is stored per run.
5. Each control works with the keyboard and a screen reader.
6. In Local mode the state is described, not broken.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Read-aloud can reuse the product voice feature [inferred from the SYS-voice-and-media area].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reuse the chat continuation used by schedule runs for follow-ups.
- [proposed] Store ratings on scheduled_task_runs.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | SchedulesPage onOpenChat | `apps/web/features/schedules/components/SchedulesPage.tsx` | Callback to open a schedule's chat (lines 183, 871). |
| component | SchedulesPageWithProjects | `apps/web/features/schedules/components/SchedulesPageWithProjects.tsx` | Supplies onOpenChat (line 60). |
| component | schedule-from-turn | `apps/web/features/schedules/components/schedule-from-turn.ts` | Builds a schedule from a chat turn (reverse direction). |
| service | schedule-tool | `apps/web/lib/server/tools/schedule-tool.ts` | Chat tool that creates schedules from a request. |
| service | extension background | `apps/extension/src/background.ts` | Brief cites lines 1288 and 1951; they do not match this item. |
| component | schedulesSection | `apps/extension/src/features/side-panel/schedulesSection.ts` | Chrome schedule runs list and approvals. |
| component | ScheduleRunHistory (mobile) | `apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx` | Where a mobile control would sit. |
| component | ScheduleRunHistory (web) | `apps/web/features/schedules/components/ScheduleRunHistory.tsx` | Where a web control would sit. |
| table | scheduled_task_runs | `apps/web/lib/services/schedule-service.ts` | Run rows that would carry a rating. |
| service | voice area | `packages/ui` | Read-aloud would reuse the voice feature; code location not established. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses open chat on a schedule in the web page. | device | apps/web/features/schedules/components/SchedulesPage.tsx:871-873 |
| Where the chat opens and what it contains is not read. | device | unknown |
| Listen and rating: no steps exist. | device | No code found. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Rating | not available | not applicable | not applicable |

**Models and providers.** A follow-up would use the normal chat route; read-aloud would use the voice route. Neither is connected to briefings.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. |
| Permissions | not applicable until built. |
| Subscription | Follow-up chat would count as chat usage [inferred]; no briefing-specific rule found. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | not applicable until built. |
| Provider restrictions | none found in the code. |
| Local mode | Not available for briefings; Local mode has no schedules. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Follow-up | not handled in the code for a briefing item | No code found. |
| Listen | not handled in the code | No code found. |
| Rating | not handled in the code | No code found. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/tools/schedule-tool.test.ts`: Chat schedule tool; matched by name, does not cover follow-ups.

**Test scenarios**

- **Find the Chrome follow-up**
  1. Open apps/extension/src/background.ts lines 1288 and 1951.
  2. Look in the Chrome side panel for a briefing follow-up.
  - Expected: Record whether any follow-up exists; the cited lines are not one.
- **Web open chat**
  1. Click the schedule's open-chat action on web.
  - Expected: Record what opens and whether it holds the run.
- **Absent controls**
  1. Open a briefing run on each app.
  - Expected: No Listen and no Helpful buttons.

**Where to look when it fails**

- not applicable until built.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No follow-up, listen or rating on any app.** Affects: All six apps.. Evidence: Brief S42.10-S42.12; no code found.. Work needed: Build the three controls and storage.
- **Brief marks Chrome S42.10 done but its code citations do not match.** Affects: Chrome; documentation.. Evidence: apps/extension/src/background.ts:1288,1951. Work needed: Correct the status or find the real code.
- **No rating storage.** Affects: Any app.. Evidence: No column or endpoint found.. Work needed: Schema and API.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:chrome
- mode:cloud
- F042-01
- F042-03
- SYS-voice-and-media
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations
- table:scheduled_task_runs

## Unknown

- What onOpenChat opens and its label.
- Whether the Chrome extension has a briefing follow-up elsewhere.
- Whether a voice route can read a run result.
- Product design for the controls.
