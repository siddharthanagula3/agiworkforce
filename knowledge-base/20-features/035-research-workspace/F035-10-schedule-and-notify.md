---
id: "F035-10"
type: "feature"
title: "Schedule and notify"
aliases: ["Notify on completion", "Research notification", "Research report ready", "Schedule recurring research (S35.32)", "notifyResearchReportSettled"]
area: "35 Research workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S35.32", "S35.33"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "table:notifications", "table:research_reports", "SYS-observability-and-operations", "SYS-sync-and-continuity", "SYS-agents-tools-and-automation", "F035-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F035-10 Schedule and notify

When a Deep Research run ends as completed or failed, the server saves one notification (category research) and sends a push. Titles are 'Research report ready' and 'Research did not finish'. Web shows it in the bell; mobile push opens the Reports screen. Stopped or paused runs send nothing. Scheduled research is not built.

Area: [35. Research workspace](README.md). Requirement items: [S35.32](../../10-requirements/capabilities/035-research-workspace.md#s3532), [S35.33](../../10-requirements/capabilities/035-research-workspace.md#s3533).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** After a report is saved, writes a row to the notification feed and fans out push to the phone and browser, skipping repeats.

**Why it exists.** Research can take minutes; people leave. They need to be told when to come back.

**Who uses it.** Anyone who starts a research run and leaves, on web and mobile.

**Problems it solves**

- Having to watch a run.
- Missing a failed run.

**Use cases**

- Start research, close the tab, get a browser push.
- Phone buzzes, tap opens Reports.
- Open the bell and see 'Research report ready'.
- Failed run: 'Research did not finish'.

## 2. User experience

**Where to find it**

- Web: notification bell in the sidebar header (apps/web/shared/components/layout/SidebarBrandRow.tsx:10; apps/web/features/notifications/components/NotificationBell.tsx).
- Mobile: push, and the notifications screen (apps/mobile/app/(app)/notifications/index.tsx).
- Public Desktop: the web bell (hosted web app, doc: AGENTS.md section 5).
- CLI, VS Code, Chrome: none.

**Before you start**

- A run that ends completed or failed with a saved report.
- For push: a registered mobile device or browser push opt-in; mobile push uses the setting key mobilePushAgentActivity, default on (agent-notification-service.ts:25,78).

**Screens and controls**

- Bell list item with title and message; target opens the product link /open/research/<id> (notification-target.ts; product-link-resolver.ts:201).
- Mobile settings group for research notifications, shown when FEATURES.research is on (apps/mobile/src/features/settings/notifications/categories.ts:70).

**Journey**

1. Start a Deep Research run.
2. Leave the page.
3. Run settles; the report is saved.
4. Server records the notice and sends push.
5. Tap the push or open the bell.
6. Web: redirected to the report's chat. Mobile: opens Reports.

**What the person sees and gets**

- Completed: title 'Research report ready', body '“<title>” is ready, drawn from N sources.'
- Failed: 'Research did not finish', body '“<title>” stopped before the report was written.'

**Settings**

- Push preference mobilePushAgentActivity (turns phone push off when false).
- Quiet hours can hold or defer push (push-notification-service.ts:286-296).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- notifyResearchReportSettled records a feed row (category research, severity success or error, target kind research) and pushes (apps/web/lib/services/agent-notification-service.ts:209-262).
- It is called after the report is saved (apps/web/app/api/llm/v1/chat/completions/lib/research-run-options.ts:75-93).
- Dedupe key research:<requestId>:<status> with a unique index per user (agent-notification-service.ts:238; apps/web/db/neon/0199_notification_feed_targets.sql:54).
- If the feed row is a duplicate, no push is sent (agent-notification-service.ts:241).
- A run notice for a research run that already produced a completed report is skipped (apps/web/lib/services/cloud-agent-run-service.ts:131-146).
- Mobile push type research_completed navigates to /(app)/reports (apps/mobile/services/notifications.ts:621-623).

**Incomplete**

- The research notice built in research-run-options.ts passes no conversationId or runId, so the mobile branch that opens the chat (notifications.ts:536-545) is not reached for this push [inferred].
- Failed-run push uses type agent_failed with route /(app)/reports; whether mobile opens Reports for it is not established (unknown).

**Present but disconnected or switched off**

- None found.

**Not available**

- Scheduled or recurring research: not built on any app (brief S35.32).
- Notifications on CLI, VS Code, Chrome.

## 4. Required behaviour

**Established requirements**

- When a research run finishes or fails the user is notified in-app and/or push. (source: brief S35.33)
- Completed or failed records a notification (category research) titled 'Research report ready' or 'Research did not finish' and sends a push that opens the report on mobile. (source: apps/web/lib/services/agent-notification-service.ts:209-262)
- Stopped or paused runs send no notice. (source: agent-notification-service.ts:214)
- Duplicates avoided with a key per request and status. (source: agent-notification-service.ts:238)
- The user can schedule a research task to rerun on a cadence. Missing everywhere. (source: brief S35.32)

**Acceptance criteria**

1. Completed run creates exactly one feed row and one push.
2. Failed run creates 'Research did not finish'.
3. Stopped or paused run creates none.
4. Replaying the same request and status creates no second row or push.
5. Push opt-out (mobilePushAgentActivity false) stops phone push but not the feed row.
6. Mobile push tap opens Reports.
7. Web notice opens the chat of the report.
8. No schedule control exists for research.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Pausing then resuming yields one notice at the end, if the resumed run keeps the same request id; not established [inferred].
- Web opening the chat and not the Report tab is the resolver's behaviour [inferred from product-link-resolver.ts:117].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Open the Report tab directly from the web notice.
- [proposed] Pass conversationId so the mobile push opens the chat's report.
- [proposed] Add recurring research through the existing schedule service with its own notice.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | notifyResearchReportSettled | `apps/web/lib/services/agent-notification-service.ts` | Builds, records and pushes the notice |
| service | buildResearchRunOptions persistReport | `apps/web/app/api/llm/v1/chat/completions/lib/research-run-options.ts` | Saves report then notifies |
| service | recordNotification | `apps/web/lib/services/notification-service.ts` | Insert with on conflict do nothing on dedupe key |
| table | notifications | `apps/web/db/neon/0199_notification_feed_targets.sql` | Category, target and dedupe columns, unique index |
| service | sendPushToUser | `apps/web/lib/services/push-notification-service.ts` | Fan out to phone and browser, quiet hours |
| service | cloud-agent-run-service research skip | `apps/web/lib/services/cloud-agent-run-service.ts` | Avoids a second run notice for a finished report |
| component | NotificationBell | `apps/web/features/notifications/components/NotificationBell.tsx` | Web in-app feed |
| component | SidebarBrandRow | `apps/web/shared/components/layout/SidebarBrandRow.tsx` | Places the bell |
| service | notification-target | `apps/web/features/notifications/lib/notification-target.ts` | Maps target to /open/research/<id> |
| service | product-link-resolver | `apps/web/lib/services/product-link-resolver.ts` | Resolves research link to the report's chat |
| screen | open product link page | `apps/web/app/open/[target]/[id]/page.tsx` | Auth redirect and unavailable states |
| service | mobile notification routing | `apps/mobile/services/notifications.ts` | research_completed navigates to Reports |
| service | notificationEventTypes | `apps/mobile/services/notificationEventTypes.ts` | Lists research_completed |
| config | notification categories | `apps/mobile/src/features/settings/notifications/categories.ts` | Research group shown when flag on |
| config | productLinks | `apps/mobile/src/features/notifications/productLinks.ts` | research link to /(app)/reports |
| event | research_run_finished | `apps/web/lib/services/agent-notification-service.ts` | Product analytics event |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Research loop ends and the report is saved with its status. | our servers | research-run-options.ts:75-82 |
| notifyResearchReportSettled ignores any status except completed or failed. | our servers | agent-notification-service.ts:214 |
| Feed row is inserted with the dedupe key; a duplicate returns no push. | our servers | agent-notification-service.ts:231-241; notification-service.ts:75-86 |
| Push preference is read; push goes to the phone through the push provider and to browsers. | our servers | agent-notification-service.ts:243-261 |
| Push delivery by the platform push services. | outside service | push-notification-service.ts:349-352 |
| Phone receives the push and routes to Reports; web bell lists the row. | device | mobile/services/notifications.ts:621-623 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Notification row (category research, title, message, target research and report id, dedupe key) | public.notifications | Read by web bell and mobile feed | Retention unknown |
| Push registrations | mobile devices and web push tables (not read) | Server side | Unknown |

**Models and providers.** No model is used. Which model wrote the report is irrelevant to the notice.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; the notice is per user id. |
| Permissions | Mobile push needs OS permission and a registered device (not read in detail); web push needs browser opt-in. |
| Subscription | No separate rule; the notice follows a run that the plan allowed (request-processor.ts:1508). |
| Limits and metering | Quiet hours hold pushes (push-notification-service.ts:286-296). No other limit found. |
| Feature flags | Mobile FEATURES.research for the settings group. |
| Model compatibility | Not applicable. |
| Provider restrictions | Push delivery uses the Expo and web push transports. |
| Local mode | No notice in Local mode: research is a Cloud run, so there is no server event. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Completed | Success row and push | agent-notification-service.ts:216-262 |
| Failed | Error row; push type agent_failed, priority critical | agent-notification-service.ts:249-257 |
| Stopped or paused | No notice | agent-notification-service.ts:214 |
| Duplicate | No second row or push | agent-notification-service.ts:241 |
| Notice failure | Logged warning; the report is still saved | agent-notification-service.ts:263-266 |
| Quiet hours | Push held or deferred | push-notification-service.ts:286-296 |
| Deleted chat | Web link shows unavailable 'deleted' or 'not_found' | product-link-resolver.ts:115-116 |
| Offline device | Push delivered later by the platform; not examined | unknown |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/agent-notification-service.test.ts`: notifyResearchReportSettled recording and push
- `apps/web/lib/services/__tests__/notification-service.test.ts`: Feed write and dedupe
- `apps/web/lib/services/__tests__/product-link-resolver.test.ts`: Product link resolution
- `apps/mobile/__tests__/research-code-push-groups.test.ts`: Research push groups on mobile
- `apps/mobile/__tests__/AccountNotificationFeed.test.tsx`: Mobile feed

**Test scenarios**

- **Completed run**
  1. Start research, leave
  2. Wait for completion
  - Expected: One bell row 'Research report ready' and a push.
- **Stop run**
  1. Start research
  2. Stop it
  - Expected: No notification.
- **Replay**
  1. Call notify twice for the same request and status in a test
  - Expected: One row, one push.
- **Failed run**
  1. Force a failure before the report is written
  - Expected: 'Research did not finish' row.
- **Push tap**
  1. Tap the push on a phone
  - Expected: Reports screen opens.
- **Schedule**
  1. Look for a schedule control in research
  - Expected: None.

**Where to look when it fails**

- Log '[notifications] research notify failed'.
- Table public.notifications where category = 'research'.
- Analytics event research_run_finished.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/035-research-workspace.md](../../70-qa/test-plans/web/035-research-workspace.md)
- Desktop: [70-qa/test-plans/desktop/035-research-workspace.md](../../70-qa/test-plans/desktop/035-research-workspace.md)
- Mobile: [70-qa/test-plans/mobile/035-research-workspace.md](../../70-qa/test-plans/mobile/035-research-workspace.md)

## 10. Gaps and dependencies

- **No scheduled recurring research** Affects: All apps. Evidence: brief S35.32. Work needed: Build a schedule type for research runs.
- **Web notice opens the chat, not the report tab** Affects: Web, public Desktop. Evidence: product-link-resolver.ts:117. Work needed: Open the Report tab or a report URL.
- **Mobile push may not open the chat's report because conversation id is not sent** Affects: Mobile. Evidence: research-run-options.ts:88-95 vs notifications.ts:536. Work needed: Pass conversationId and runId.
- **Failed-run push routing on mobile unconfirmed** Affects: Mobile. Evidence: type agent_failed at agent-notification-service.ts:251. Work needed: Trace the handler and test.
- **No notice on CLI, VS Code, Chrome** Affects: Those apps. Evidence: brief S35.33. Work needed: Decide scope.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- table:notifications
- table:research_reports
- SYS-observability-and-operations
- SYS-sync-and-continuity
- SYS-agents-tools-and-automation
- F035-08

## Unknown

- Whether a resumed run keeps its request id, which controls dedupe on resume.
- Retention of notification rows.
- Whether mobile opens Reports on the agent_failed push from research.
- Whether the public Desktop shows OS-level notices beyond the web bell (Electron agentNotifications.ts exists but was not read).
