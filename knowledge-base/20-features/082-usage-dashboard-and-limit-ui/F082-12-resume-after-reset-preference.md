---
id: "F082-12"
type: "feature"
title: "Resume-after-reset preference"
aliases: ["Notify me when it resets", "Usage reset reminder", "Resume-after-reset preference", "pushUsageReset", "S82.28"]
area: "82 Usage dashboard and limit UI"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "partial", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S82.28"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "SYS-observability-and-operations", "SYS-api-and-contracts", "surface:web", "surface:mobile", "surface:desktop", "mode:cloud", "table:user_settings", "api:POST /api/usage/reset-reminder", "F082-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F082-12 Resume-after-reset preference

When a Cloud usage window is spent, web and mobile offer 'Notify me when it resets'. The server schedules one push notification at the reset time, only if the user's usage-reset notification preference is not off. It is a reminder, not an automatic resume. The brief marks it missing, but the code exists on web and mobile.

Area: [82. Usage dashboard and limit UI](README.md). Requirement items: [S82.28](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8228).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Schedules a push notification for the moment a spent usage window resets, so the user knows they can send messages again.

**Why it exists.** Brief S82.28 asks for automatic resume or notification after reset.

**Who uses it.** Cloud users blocked by a plan window, on web (browser push) or mobile (device push).

**Problems it solves**

- User must keep checking when they can work again

**Use cases**

- Web user hits the 5-hour limit and clicks 'Notify me when it resets'.
- Mobile user sees the warning banner with the action and taps it.
- User turns the alert off in Notifications and gets nothing.

## 2. User experience

**Where to find it**

- Web: in the account usage-block card above the composer (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5075-5145). Hidden in the desktop host (apps/web/features/chat/pages/WebChatPage.tsx:1815-1817).
- Mobile: inside the usage warning banner (apps/mobile/src/features/chat/components/UsageLimitBanner.tsx:66, 200-230).
- Preference: web Settings > Notifications > Usage (apps/web/features/settings/sections/NotificationsSection.tsx:74-77); mobile Settings > Notifications switch (apps/mobile/src/features/settings/notifications/index.tsx:548-556).

**Before you start**

- Cloud account; a spent window with a known reset time within 8 days (packages/contracts/cloud-contracts/src/usage-reset-reminder.ts:6; UsageLimitBanner.tsx:77-91).
- Notification permission granted on the browser or device (asked when needed).
- Preference not set to off.

**Screens and controls**

- Web button 'Notify me when it resets', spinner while pending, then a status text (ChatComposerNew.tsx:5088-5107).
- Mobile text button 'Notify me when it resets' (44 point target), then 'We'll notify you' (UsageLimitBanner.tsx:66-67, 200-230).
- Outcome texts on web: 'We will notify you when it resets.', 'Notifications are blocked for this site in your browser settings.', 'This browser cannot receive notifications.', 'The reminder could not be set. Try again in a minute.' (apps/web/features/chat/lib/usage-reset-reminder.ts:10-15).

**Journey**

1. A window reaches zero and the account is blocked.
2. The block card (web) or warning banner (mobile) shows the reset time and the notify action.
3. The person taps it; the app asks for notification permission if needed.
4. The app asks the server to schedule a reminder for the reset time.
5. The status changes to confirmation.
6. At the reset time a push arrives: 'Your AGI usage limit has reset. You can send messages again.' Tapping opens /chat.

**What the person sees and gets**

- Confirmation or refusal text above.
- Push title 'Your AGI usage limit has reset', body 'You can send messages again.' (apps/web/lib/workflows/steps/send-usage-reset-reminder.ts:11-14).
- Mobile error messages: 'Notifications are blocked for this app in Settings.', 'This device cannot receive notifications right now. Try again in a minute.', 'Notifications are not allowed yet. Tap again to be asked.' (UsageLimitBanner.tsx:70-76).

**Settings**

- Notifications > Usage push toggle, stored under key pushUsageReset; absent or true means on, only false stops it (apps/web/lib/workflows/usage-reset-reminder-preference.ts:3-14; mobile useCloudReminders.ts:37).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web client: requestUsageResetReminder enables web push then POSTs the reset time (apps/web/features/chat/lib/usage-reset-reminder.ts:17-34).
- Mobile client: checks or requests push permission, POSTs, then turns the account push group on for the device (apps/mobile/src/features/chat/services/usageResetReminder.ts:19-32).
- Server route /api/usage/reset-reminder: CSRF, rate limit key usage-reset-reminder (10 per hour), refuses when the preference is off, validates the time (future and within 8 days), de-duplicates per user and reset time, starts a durable workflow that sleeps to the reset and then pushes if the preference still allows (apps/web/app/api/usage/reset-reminder/route.ts:60-107; apps/web/lib/workflows/usage-reset-reminder-workflow.ts:10-17; send-usage-reset-reminder.ts:16-33; apps/web/lib/rate-limit.ts:292-296).
- Mobile reads the latest exhausted window so the reminder fires when messages can actually flow (UsageLimitBanner.tsx:77-91).

**Incomplete**

- Only a notification; automatic resume of blocked work is not built (the workflow only sends a push).
- The mobile action appears only when some window is fully used (resetAt requires percentRemaining <= 0, UsageLimitBanner.tsx:77-91), not at the 25 percent warning.
- The web action appears only after a refusal that carries a reset time (WebChatPage.tsx:1807-1817).

**Present but disconnected or switched off**

- Hidden inside the desktop host (isDesktopHost, WebChatPage.tsx:1816).

**Not available**

- CLI, VS Code and Chrome: no reminder (brief n/a).
- Automatic resume on all apps.

## 4. Required behaviour

**Established requirements**

- Users can choose to have blocked work resume automatically, or be notified, once the limit resets. (source: S82.28 (brief))
- The server route is rate limited under usage-reset-reminder and the workflow sends only if the user's preference allows. (source: apps/web/app/api/usage/reset-reminder/route.ts:66; apps/web/lib/workflows/steps/send-usage-reset-reminder.ts:20)
- The reminder is a notification, not an automatic resume. (source: apps/web/lib/workflows/usage-reset-reminder-workflow.ts:15-16)

**Acceptance criteria**

1. After a refusal with a reset time, web shows 'Notify me when it resets' (not in the desktop host).
2. Clicking asks for push permission if needed and then shows 'We will notify you when it resets.'
3. If the browser blocks notifications the text says so and no request is sent.
4. Asking twice for the same reset sends only one push.
5. A reset more than 8 days away or already past is refused.
6. With the Usage push preference off, the request is refused and no push is sent even if scheduled earlier.
7. On mobile, a fully spent window shows the action; tapping with notifications denied shows the blocked text.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Brief status 'missing' for web and mobile is out of date because the code is present and tested [inferred from the files above].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an 'auto-resume' option that re-sends the blocked message after the reset, if the owner wants it.
- [proposed] Offer the action on the desktop host if Electron can receive push.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/usage/reset-reminder | `apps/web/app/api/usage/reset-reminder/route.ts` | Validate, de-duplicate, start workflow |
| job | usageResetReminderWorkflow | `apps/web/lib/workflows/usage-reset-reminder-workflow.ts` | Sleep until reset then send step |
| job | sendUsageResetReminderStep | `apps/web/lib/workflows/steps/send-usage-reset-reminder.ts` | Check preference and send push |
| service | usageResetReminderEnabled | `apps/web/lib/workflows/usage-reset-reminder-preference.ts` | Reads settings.notifications.pushUsageReset |
| schema | UsageResetReminderRequestSchema | `packages/contracts/cloud-contracts/src/usage-reset-reminder.ts` | Request and response shape, 8-day limit, path |
| service | requestUsageResetReminder (web) | `apps/web/features/chat/lib/usage-reset-reminder.ts` | Enable push and POST |
| component | ChatComposerNew usage block | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Button, pending and status text |
| component | WebChatPage wiring | `apps/web/features/chat/pages/WebChatPage.tsx` | Passes onRemindAtReset unless desktop host |
| service | requestUsageResetReminder (mobile) | `apps/mobile/src/features/chat/services/usageResetReminder.ts` | Permission, POST, enable push group |
| component | UsageLimitBanner (mobile) | `apps/mobile/src/features/chat/components/UsageLimitBanner.tsx` | Action button and states |
| hook | useCloudReminders | `apps/mobile/src/features/settings/notifications/useCloudReminders.ts` | Mobile toggle for pushUsageReset |
| component | NotificationsSection (web) | `apps/web/features/settings/sections/NotificationsSection.tsx` | Usage push toggle |
| config | rate limit usage-reset-reminder | `apps/web/lib/rate-limit.ts` | 10 per hour, fail open |
| store | key-value store de-duplication | `apps/web/app/api/usage/reset-reminder/route.ts:20-58` | Key usage-reset-reminder:<user>:<reset time> |
| table | user_settings | `apps/web/lib/workflows/usage-reset-reminder-preference.ts:8` | Holds the notification preference |
| service | push-notification-service | `apps/web/lib/services/push-notification-service.ts` | sendPushToUser used by the step |
| test | route test | `apps/web/app/api/usage/reset-reminder/__tests__/route.test.ts` | Route behaviour |
| test | mobile banner test | `apps/mobile/__tests__/UsageResetReminderBanner.test.tsx` | Mobile behaviour |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person taps the action. The app checks notification permission and asks if undetermined. | device | apps/mobile/src/features/chat/services/usageResetReminder.ts:19-26; apps/web/features/chat/lib/usage-reset-reminder.ts:17-21 |
| The app POSTs the reset time to /api/usage/reset-reminder. | device and our servers | usage-reset-reminder.ts:23-29; usageResetReminder.ts:28 |
| Server checks CSRF, rate limit, preference and time window, claims a de-duplication key, and starts the workflow. | our servers | reset-reminder/route.ts:60-103 |
| The workflow sleeps until the reset time. | our servers | usage-reset-reminder-workflow.ts:15 |
| At reset, the step re-checks the preference and sends a push to the user's registered browsers and devices. | our servers | send-usage-reset-reminder.ts:16-33 |
| The push provider delivers to the device. | outside service | send-usage-reset-reminder.ts:22 (sendPushToUser); provider not identified in this review |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Reminder claim key (pending or scheduled) | Key-value store, TTL until the reset plus 60 seconds | No | Expires by TTL (reset-reminder/route.ts:83) |
| Scheduled workflow run | Workflow runtime | No | unknown |
| Preference pushUsageReset | table:user_settings (settings.notifications) | Server; edited on web and mobile | Kept with the account settings |
| Push subscriptions | Push notification service (store not read) | Server | unknown |

**Models and providers.** No model or provider takes part. A web push service or the mobile push service delivers the message.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Cloud account; session plus CSRF (reset-reminder/route.ts:61-64). |
| Permissions | Notification permission on the browser or device. |
| Subscription | No plan check in the route. A reset time exists only for a metered Cloud plan; Free uses its own limit card (see F082-09). |
| Limits and metering | 10 requests per hour per user (rate-limit.ts:292-296, fail open). Reset must be within 8 days (cloud-contracts usage-reset-reminder.ts:6). |
| Feature flags | Preference pushUsageReset. Desktop host hides the web action. |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Local mode has no managed limit, so no reminder. Mobile reads the cloud usage store for the signed-in owner and its reminder settings only act in Cloud mode (useCloudReminders.ts currentCloudAccount). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Pending | Spinner and aria-busy on web; disabled and busy on mobile. | ChatComposerNew.tsx:5099-5105; UsageLimitBanner.tsx:208-224 |
| Success | Confirmation text; mobile announces it to screen readers. | usage-reset-reminder.ts:11; UsageLimitBanner.tsx:119-123 |
| Blocked notifications | Text and no request. | usage-reset-reminder.ts:19 |
| Browser cannot notify | Text and no request. | usage-reset-reminder.ts:20 |
| Server refusal | Mobile shows the message for statuses 400, 401, 409, 429; others show the generic message. | UsageLimitBanner.tsx:104-112 |
| Queue down | 503 'The reminder could not be set right now...'; key released so a retry works. | reset-reminder/route.ts:86-96 |
| Duplicate request | Second call returns the same remindAt; a call during scheduling gets 409. | reset-reminder/route.ts:98-103 |
| Preference off | 400 'Usage reminders are turned off in Notifications settings.' | reset-reminder/route.ts:68-71 |
| Offline | Web returns 'failed' text; not otherwise handled. | usage-reset-reminder.ts:31-33 |
| Account switch | Mobile shows the action only for the signed-in owner's snapshot. | UsageLimitBanner.tsx:111-114; test 'offers nothing for another account's usage' |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/usage/reset-reminder/__tests__/route.test.ts`: Preference refusal, scheduling once, duplicate, past or far reset, queue down, in-progress conflict
- `apps/web/lib/workflows/__tests__/send-usage-reset-reminder.test.ts`: Push step
- `apps/web/features/chat/lib/__tests__/usage-reset-reminder.test.ts`: Web client outcomes
- `apps/web/features/chat/components/Composer/ChatComposerNew.usageBlock.test.tsx`: Usage block in the composer (reminder button coverage not confirmed)
- `apps/mobile/__tests__/UsageResetReminderBanner.test.tsx`: Mobile ask, refusal, permission, no registration, hidden when usage is left, last window

**Test scenarios**

- **Web reminder**
  1. Exhaust a window on a test account.
  2. Send a message to get the block card.
  3. Click 'Notify me when it resets', allow notifications.
  - Expected: Confirmation text. At the reset time a push arrives and opens /chat.
- **Preference off**
  1. Turn off Usage push in Notifications.
  2. Click the action.
  - Expected: Refusal message; no push at reset.
- **Blocked permission**
  1. Block notifications for the site.
  2. Click the action.
  - Expected: Blocked text, no network call.
- **Mobile last window**
  1. Spend two windows with different resets on mobile.
  - Expected: Reminder is set for the later reset.
- **Desktop host**
  1. Open the desktop app and cause a block.
  - Expected: No notify action (current behaviour).

**Where to look when it fails**

- Log lines '[usage-reset-reminder] the reminder could not be scheduled', '...the scheduled receipt was not recorded', '...push lookup failed'.
- Rate limit key usage-reset-reminder.
- Setting user_settings.settings.notifications.pushUsageReset.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md)
- Desktop: [70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md)
- Mobile: [70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md)

## 10. Gaps and dependencies

- **No automatic resume; only a notification.** Affects: All apps. Evidence: apps/web/lib/workflows/usage-reset-reminder-workflow.ts:15-16. Work needed: Product decision, then a re-send mechanism.
- **Brief marks web, desktop and mobile as missing and says no web UI caller exists; code shows web and mobile callers.** Affects: Documentation. Evidence: WebChatPage.tsx:1816; ChatComposerNew.tsx:5104; UsageLimitBanner.tsx:66. Work needed: Update brief statuses.
- **Hidden in the desktop host.** Affects: Desktop users. Evidence: WebChatPage.tsx:1816. Work needed: Decide whether Electron push can be supported.
- **No reminder on CLI, VS Code, Chrome.** Affects: Those apps. Evidence: No code found. Work needed: Optional.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- SYS-observability-and-operations
- SYS-api-and-contracts
- surface:web
- surface:mobile
- surface:desktop
- mode:cloud
- table:user_settings
- api:POST /api/usage/reset-reminder
- F082-09

## Unknown

- Which push provider delivers web and mobile pushes.
- Why the desktop host is excluded (no comment in the code).
- Whether the workflow run is retained or cleaned after it sends.
- Whether ChatComposerNew.usageBlock.test.tsx covers the reminder button.
- How a workflow behaves if the server restarts before the reset (durability is assumed from the workflow library, not tested here).
