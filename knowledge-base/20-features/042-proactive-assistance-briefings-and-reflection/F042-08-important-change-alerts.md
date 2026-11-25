---
id: "F042-08"
type: "feature"
title: "Important-change alerts"
aliases: ["Important-change alerts (S42.18)", "Alerts for things you follow"]
area: "42 Proactive assistance, briefings, and reflection"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S42.18"]
depends_on: ["F042-07", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F042-08 Important-change alerts

Target only: tell the person when something they follow changes. The brief marks it missing on all six apps and a code search found no feature. The nearest pieces are a page-changed condition on schedules and the notification pipeline, which a future feature could reuse.

Area: [42. Proactive assistance, briefings, and reflection](README.md). Requirement items: [S42.18](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4218).

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

**What it does.** Would alert the person to important changes in things they follow. Nothing of this kind is built (audit/missing/042-proactive-assistance-briefings-and-reflection.md:75-79).

**Why it exists.** The brief states the target: the product alerts the user to important changes in things they follow (S42.18). No decision document found that rules it in or out.

**Who uses it.** Intended for any signed-in person once built [inferred].

**Problems it solves**

- Would remove the need to check sources by hand [inferred].

**Use cases**

- [proposed] A followed web page changes and the person gets a push.
- [proposed] A followed project has a new result and the person is told.

## 2. User experience

**Where to find it**

- Not available on web, desktop, mobile, CLI, VS Code or Chrome.

**Before you start**

- Not applicable.

**Screens and controls**

- None. Adjacent control: the schedule form field for a watched page, helper text 'Optional. Runs only when this page changed since the last check.' (apps/web/features/schedules/components/ScheduleForm.tsx:685-688).

**Journey**

1. No journey exists. A person can approximate it by making a schedule with a page condition and keeping Routine notifications on (ScheduleForm.tsx:685-730) [inferred].

**What the person sees and gets**

- None for the target. For the approximation, a skipped run shows the note 'Skipped: the condition was not met.' (packages/contracts/cloud-contracts/src/schedules.ts:753-756).

**Settings**

- None for the target.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Adjacent: a schedule can carry a page condition; when the condition is not met the run is finalized as cancelled with skipped true and a note (apps/web/lib/services/schedule-service.ts:2269-2278).

**Incomplete**

- Adjacent only: a condition is checked at the schedule time, not continuously, and a met condition leads to a normal run, not a change alert [inferred from schedule-service.ts:2269-2308].

**Present but disconnected or switched off**

- Nothing found that is built but switched off.

**Not available**

- The feature itself on all six apps. Searches for 'important change', 'things you follow', 'price alert' and 'watch change' in apps/web/features, apps/web/lib, apps/mobile/src and apps/extension/src found only schedule and page-watch code, none of it an alert feature.

## 4. Required behaviour

**Established requirements**

- The product alerts the user to important changes in things they follow. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.18)
- Planned for wave 4, to build on web, desktop, mobile, cli, vscode and chrome. (source: doc: audit/missing/042-proactive-assistance-briefings-and-reflection.md:75-79)

**Acceptance criteria**

1. Not testable today: no behaviour exists.
2. [proposed] Once built, a followed item that changes produces one notice through the work-completion pipeline.
3. [proposed] Notices respect quiet hours and the per-event settings.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Whatever is built should reuse the notice pipeline (feed row, push, email) of F042-07 and its quiet-hours rules [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Define what 'follow' means (page, topic, project, connector) before building.
- [proposed] Check what ChatGPT and Claude ship first, per docs/product/competitive-guidance.md (AGENTS.md section 10); the founder rule is not to build what neither offers (doc: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-27-02).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | schedule-condition-service | `apps/web/lib/services/schedule-condition-service.ts` | Adjacent: fetches a watched public page with a 10 second timeout and 1 MB cap to decide if a schedule runs (lines 7-8). |
| service | checkScheduleCondition use | `apps/web/lib/services/schedule-service.ts` | Adjacent: skips a run when the condition is not met (lines 2269-2278). |
| component | ScheduleForm page condition field | `apps/web/features/schedules/components/ScheduleForm.tsx` | Adjacent: lets the person enter a page to watch (lines 685-688). |
| service | describeScheduleRunTiming | `packages/contracts/cloud-contracts/src/schedules.ts` | Adjacent: skip note for an unmet condition (lines 753-756). |
| service | notifyScheduleCompleted | `apps/web/lib/services/schedule-notification-service.ts` | Adjacent: pipeline a change alert could reuse. |
| service | sendPushToUser | `apps/web/lib/services/push-notification-service.ts` | Adjacent: push delivery with quiet hours. |
| service | recordNotification | `apps/web/lib/services/notification-service.ts` | Adjacent: feed row with dedupe. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists for the target. | our servers | Negative search recorded under current_implementation.not_available |
| Adjacent flow: a due schedule's condition is evaluated before the run; unmet means skip. | our servers | apps/web/lib/services/schedule-service.ts:2269-2278 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| None for the target | none | not applicable | not applicable |

**Models and providers.** None found. The adjacent condition check uses a plain HTTP fetch and field conditions, not a model (apps/web/lib/services/schedule-condition-service.ts:1-8).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code (target). Adjacent schedules are plan-limited (packages/contracts/types/src/billing-catalog.ts:600-701). |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not applicable: the feature does not exist. Whether it should work in Local mode is undecided. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Any state | Not handled in the code: the feature does not exist. | Searches listed in current_implementation |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/schedule-service.test.ts`: Schedule service behaviour; the condition path may be covered but this was not checked.

**Test scenarios**

- **Confirm absence**
  1. Open web Settings and the Schedules page on each app.
  2. Look for a way to follow a topic or page and be alerted.
  - Expected: No such control exists; only the schedule page condition.
- **Approximate with a page condition**
  1. Create a schedule with a page condition.
  2. Wait for the due time with the page unchanged.
  - Expected: Run is skipped with the note 'Skipped: the condition was not met.'

**Where to look when it fails**

- Skipped runs carry result.conditionWatch in table scheduled_task_runs (schedule-service.ts:2276).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The whole feature is missing.** Affects: All six apps. Evidence: audit/missing/042-proactive-assistance-briefings-and-reflection.md:75-79. Work needed: Product definition of 'follow', then build on the notice pipeline.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F042-07
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries

## Unknown

- What 'things they follow' means in the product.
- Whether the founder wants this built; no decision found for S42.18.
- Which leader products ship such alerts.
- The implementation map is short on purpose: only adjacent real code is listed, and the target has no files.
- What apps/extension/src/features/browser-tools/pageWatch.ts does beyond its imports (debugger session, console and network capture); it was not read in full.
