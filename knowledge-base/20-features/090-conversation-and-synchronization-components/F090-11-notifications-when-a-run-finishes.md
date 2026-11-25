---
id: "F090-11"
type: "feature"
title: "Notifications when a run finishes"
aliases: ["Notification fan-out", "Agent run notification", "Push notification", "Web push", "Expo push", "Notification feed", "NotificationBell", "notifyAgentRunEvent", "S90.18", "quiet hours"]
area: "90 Conversation and synchronization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S90.18"]
depends_on: ["surface:web", "surface:mobile", "mode:cloud", "table:notifications", "table:mobile_devices", "table:web_push_subscriptions", "table:cloud_agent_runs", "api:GET /api/notifications", "api:PATCH /api/notifications", "api:POST /api/web-push", "SYS-agents-tools-and-automation", "SYS-observability-and-operations", "SYS-voice-and-media", "F090-12", "F090-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F090-11 Notifications when a run finishes

When a background agent run needs approval or input, finishes, or fails, or a research report settles, the server writes one item to the in-app feed and then sends a push to the phone and to registered browsers. The phone has its own switch. Quiet hours suppress the push, and the feed keeps the item.

Area: [90. Conversation and synchronization components](README.md). Requirement items: [S90.18](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9018).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Writes a feed row first (with a dedupe key for finished or failed runs), then sends the same notice through the mobile push provider and Web Push at the same time. Failures of push are counted but never remove the feed item. (apps/web/lib/services/agent-notification-service.ts:140-184; apps/web/lib/services/push-notification-service.ts:362-383)

**Why it exists.** Long runs finish when the person is away. The brief wants one event fanned out to the in-app feed and to every registered device transport (brief S90.18). Mobile data type values are kept in step with the app's own routing. (apps/web/lib/services/agent-notification-service.ts:30-40)

**Who uses it.** People who start agent runs, research or scheduled tasks and leave the app. Receivers: phone (Expo push), browser (Web Push), and the feed on Web (also in Electron Desktop). (apps/web/lib/services/agent-notification-service.ts:163-177; apps/web/features/notifications/components/NotificationBell.tsx)

**Problems it solves**

- Missing an approval request that blocks a run.
- Learning that a long run finished.
- Two devices telling the person the same thing twice (dedupe key on the feed). (apps/web/lib/services/agent-notification-service.ts:160)
- A dead phone token staying forever (removed when the provider says unregistered). (apps/web/lib/services/push-notification-service.ts:208-211,135-147)

**Use cases**

- Start a long research job, leave, get 'Research report ready' on the phone.
- An agent needs approval: push 'Approval needed' with high priority.
- A run fails: 'Agent run failed' with critical priority and a feed row.
- Open the bell in the web app and see the same events.

## 2. User experience

**Where to find it**

- Web: notification bell with panel titled 'Notifications' and 'Mark all as read'. (apps/web/features/notifications/components/NotificationBell.tsx:11,139,152)
- Web: 'Browser notifications' toggle in settings. (apps/web/features/notifications/components/WebPushToggle.tsx:121-128)
- Mobile: push registration and per-event preferences; 'Agent activity' push key mobilePushAgentActivity. (apps/mobile/services/notifications.ts:237-290; apps/mobile/src/features/settings/notifications/useAgentActivityPushSync.ts:20)
- Desktop (Electron): shows the hosted web app, so the bell is the same [inferred from doc: AGENTS.md section 5].
- CLI, VS Code, Chrome: no push receiver found for this feature.

**Before you start**

- A signed-in account.
- For phone push: device registered with a push token and OS permission granted. (apps/mobile/services/notifications.ts:243-248)
- For browser push: the person turned on 'Browser notifications' and the browser allows it. (apps/web/features/notifications/lib/web-push-client.ts:5)

**Screens and controls**

- Bell with unread count (aria-label from bellLabel), panel, 'Mark all as read', loading spinner 'Loading notifications', error 'Notifications could not be loaded.' (NotificationBell.tsx:121,152,164,169)
- Each feed item opens its target link, such as /open/work/<id> or /chat/<id>. (apps/web/features/notifications/lib/notification-target.ts:28-41)
- Mobile tap opens the route in the push data if allowed (for example /(app)/tasks). (apps/mobile/services/notifications.ts:577-605)

**Journey**

1. Person starts a run and leaves.
2. The run reaches approval_required, input_required, completed or failed.
3. Server writes a feed item, then sends push to the phone and browsers (unless held by quiet hours or switched off).
4. Person taps the push or opens the bell.
5. The app opens the run.

**What the person sees and gets**

- Titles: 'Approval needed', 'Your agent has a question', 'Agent run finished', 'Agent run failed', 'Research report ready', 'Research did not finish'. (apps/web/lib/services/agent-notification-service.ts:100-122,226-229)
- Feed severity: warning, success, error. (agent-notification-service.ts:53-58)

**Settings**

- Mobile 'agent activity' push switch (opt-out; only an explicit false silences the phone). (agent-notification-service.ts:25,62-85)
- Per-event preferences on each device, and quiet hours in time-focus preferences. (apps/web/lib/services/push-notification-service.ts:94-111)
- Web 'Browser notifications' toggle is separate from the phone switch. (agent-notification-service.ts:146-149)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- notifyAgentRunEvent: feed first, then push with expo and web transports. (agent-notification-service.ts:140-184)
- Feed dedupe by (user, dedupe_key), so the same finished or failed event is stored once. (apps/web/lib/services/notification-service.ts:58-90)
- Phone switch fails open if the preference cannot be read. (agent-notification-service.ts:62-85)
- Run state transitions trigger notices after commit, once, from whichever writer made the terminal transition. (apps/web/lib/services/cloud-agent-run-service.ts:186-205,863-870,1045)
- Research report notice with its own dedupe key. (agent-notification-service.ts:209-258)
- Expo send in batches of 100 with a 10 s timeout; 'DeviceNotRegistered' tokens cleared. (push-notification-service.ts:176-221,135-147)
- Web Push subscriptions deleted on 404 or 410. (apps/web/lib/services/web-push-service.ts:49,256)
- If one transport fails the other still sends. (push-notification-service.ts:247-257,362-373)
- Quiet hours check before sending. (push-notification-service.ts:289-295; apps/web/lib/services/quiet-hours-service.ts:77-86)

**Incomplete**

- Quiet hours do not defer the push: when the person is inside quiet hours, sendPushToUser returns no delivery and the push is dropped; the feed item stays. Only an unreadable quiet-hours setting queues a deferred job. (push-notification-service.ts:289-295,304-324)
- The draft 'defer until they end' applies to scheduled-task email, which is held until quiet hours end. (apps/web/lib/jobs/job-handlers.ts:111-123)
- Cancelled and archived runs send no notice by design. (apps/web/lib/services/cloud-agent-run-service.ts:178-185)

**Present but disconnected or switched off**

- None found.

**Not available**

- Desktop native, CLI, VS Code and Chrome have no push receiver for run events found in the code read. (grep of apps for api/notifications outside web returned nothing)

## 4. Required behaviour

**Established requirements**

- One event is fanned out to the in-app notification feed and to every registered device transport (mobile push, web push). (source: brief S90.18)
- The phone switch governs only the mobile transport; the browser carries its own consent. (source: apps/web/lib/services/agent-notification-service.ts:146-149)
- A push failure never breaks a run or removes the feed item. (source: apps/web/lib/services/cloud-agent-run-service.ts:150-173; agent-notification-service.ts:180-182)
- Notices fire on the transition into a terminal state once. (source: apps/web/lib/services/cloud-agent-run-service.ts:186-205)

**Acceptance criteria**

1. A run that finishes writes one feed item with target kind work and the run id.
2. The same finished event delivered twice creates one feed item.
3. With the phone's agent-activity switch false, no Expo push is sent but a browser subscription still receives one.
4. Inside quiet hours no push arrives and the feed item exists.
5. A token the provider reports as unregistered is cleared from mobile_devices.
6. If Web Push fails, the Expo push still sends.
7. Tapping the push opens the tasks screen with the run id.
8. A cancelled run sends no notice.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every app that lets a person start background work should offer a way to be told it ended; today only phone and browser are covered. [inferred]
- Quiet-hours drop may surprise people if the feed is not seen; they would expect delay. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Defer rather than drop pushes during quiet hours (as the schedule email does).
- [proposed] Add push for Electron Desktop and CLI completion.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | agent-notification-service | `apps/web/lib/services/agent-notification-service.ts` | Builds the notice, writes the feed row, fans out push. |
| service | push-notification-service | `apps/web/lib/services/push-notification-service.ts` | Expo push, fan-out, quiet hours, token cleanup. |
| service | web-push-service | `apps/web/lib/services/web-push-service.ts` | Web Push send and subscription cleanup. |
| service | notification-service | `apps/web/lib/services/notification-service.ts` | Feed insert, dedupe, list, mark read. |
| service | quiet-hours-service | `apps/web/lib/services/quiet-hours-service.ts` | Reads quiet hours; held or end time. |
| service | cloud-agent-run-service announce | `apps/web/lib/services/cloud-agent-run-service.ts` | announceAgentRunEvent after terminal transitions. |
| job | notifications.deferred-push | `apps/web/lib/jobs/job-handlers.ts` | Retries a push held for unreadable quiet hours (line 351). |
| endpoint | GET/PATCH /api/notifications | `apps/web/app/api/notifications/route.ts` | Feed list and mark read. |
| endpoint | /api/web-push | `apps/web/app/api/web-push/route.ts` | Browser subscription storage. |
| table | notifications | `apps/web/lib/services/notification-service.ts` | Feed rows with dedupe_key. |
| table | web_push_subscriptions | `apps/web/db/neon/0151_web_push_subscriptions.sql` | Browser subscriptions. |
| table | mobile_devices | `apps/web/lib/services/push-notification-service.ts` | Push token and preferences per phone. |
| component | NotificationBell | `apps/web/features/notifications/components/NotificationBell.tsx` | Feed UI. |
| component | WebPushToggle | `apps/web/features/notifications/components/WebPushToggle.tsx` | Browser notifications switch. |
| service | web-push-client | `apps/web/features/notifications/lib/web-push-client.ts` | Subscribes the browser. |
| service | mobile notifications | `apps/mobile/services/notifications.ts` | Token registration, tap routing. |
| hook | useAgentActivityPushSync | `apps/mobile/src/features/settings/notifications/useAgentActivityPushSync.ts` | Syncs the agent activity push preference. |
| config | notification-target | `apps/web/features/notifications/lib/notification-target.ts` | Turns feed targets into links. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A run reaches a notified state and the journal transaction commits. | our servers | apps/web/lib/services/cloud-agent-run-service.ts:860-870 |
| announceAgentRunEvent chooses chat reply, research or generic run notice. | our servers | cloud-agent-run-service.ts:155-173 |
| Feed row inserted with dedupe key for terminal events. | our servers | agent-notification-service.ts:153-161 |
| Phone switch read; quiet hours checked; tokens filtered by per-device preferences. | our servers | agent-notification-service.ts:163; push-notification-service.ts:289-295,113-133 |
| Expo push service delivers to the phone. | outside service | push-notification-service.ts:25,180 |
| Web Push service delivers to browsers. | outside service | apps/web/lib/services/web-push-service.ts (browser push providers) |
| The device shows the notice; tap routes to the run. | device | apps/mobile/services/notifications.ts:577-605 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Feed item (category, severity, title, message, target, dedupe key, read) | table notifications | Read through GET /api/notifications on any app showing the feed | Retention not established. |
| Push token and preferences | table mobile_devices | No | Token cleared when the provider says unregistered. (push-notification-service.ts:135-147) |
| Browser subscription | table web_push_subscriptions | No | Deleted on 404 or 410. |
| Account binding in push data | payload only | No | Hash of the user id added so a device can check the account. (push-notification-service.ts:168-190) |

**Models and providers.** No model is called. Push goes through outside push services. Run notices do not include model names. (agent-notification-service.ts:100-122)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud account; the notice is for the run's owner. (agent-notification-service.ts:92-98) |
| Permissions | Phone and browser consent are separate; OS permission needed on phone. (agent-notification-service.ts:146-149; apps/mobile/services/notifications.ts:243-248) |
| Subscription | No plan check found in the notification services (none found in the code). |
| Limits and metering | Expo batches of 100; request timeout 10 s; delivery counted in metrics. (push-notification-service.ts:36-37,238-244) |
| Feature flags | Mobile route allow-list: unknown routes are dropped. (agent-notification-service.ts:50-51) |
| Model compatibility | Model independent. |
| Provider restrictions | None found. |
| Local mode | Not applicable: notices come from Cloud runs on our servers. Local runs send no server push. [inferred] |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Feed write fails | Logged; recordNotification returns failed; push still attempted for run events. | notification-service.ts:107-120 |
| Push throws | Caught, logged '[notifications] agent notify failed'. | agent-notification-service.ts:180-183 |
| Quiet hours active | No push, feed item kept. | push-notification-service.ts:289-295 |
| Quiet hours unreadable | Push queued as a job and dropped after the final attempt with a failure metric. | push-notification-service.ts:304-324,337-356 |
| No devices | sent 0, no error. | push-notification-service.ts:166 |
| Token not registered | Token cleared. | push-notification-service.ts:208-211 |
| Offline phone | Handled by the push providers, not by this code. [inferred] | none in this repository's code |
| Accessibility | Bell has aria-label with unread count; panel has aria-label 'Notifications'. | NotificationBell.tsx:121,139 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/agent-notification-service.test.ts`: Agent notice fan-out.
- `apps/web/lib/services/cloud-agent-run-notifications.test.ts`: Run state to notice mapping.
- `apps/web/lib/services/__tests__/push-notification-service.test.ts`: Expo push service.
- `apps/web/lib/services/__tests__/web-push-service.test.ts`: Web Push.
- `apps/web/lib/services/__tests__/quiet-hours-service.test.ts`: Quiet hours.
- `apps/web/lib/services/__tests__/notification-service.test.ts`: Feed dedupe and list.
- `apps/web/app/api/notifications/__tests__/route.test.ts`: Feed route.
- `apps/web/features/notifications/components/__tests__/NotificationBell.test.tsx`: Bell UI.
- `apps/mobile/__tests__/AgentActivityPushPreference.test.tsx`: Agent activity push preference.
- `apps/mobile/__tests__/agent-activity-push-owner.test.ts`: Push preference owner.

**Test scenarios**

- **Finish notice**
  1. Start a Cloud agent run, leave the app.
  2. Wait for completion.
  - Expected: One feed item and one push per registered transport.
- **Phone switch off**
  1. Turn the Agent activity push off on the phone.
  2. Finish a run with a browser also registered.
  - Expected: Browser push arrives, phone push does not, feed item exists.
- **Quiet hours**
  1. Set quiet hours covering now.
  2. Finish a run.
  - Expected: No push; feed item present.
- **Dedupe**
  1. Trigger the same completed event twice (replay).
  - Expected: One feed row.
- **Dead token**
  1. Uninstall the app, finish a run.
  - Expected: Provider reports unregistered; token column cleared.
- **Tap routing**
  1. Tap the push on a phone.
  - Expected: Opens the tasks screen with the run id.

**Where to look when it fails**

- Logs '[notifications] agent notify failed', '[push] Expo rejected the batch', '[push] could not load device tokens', '[quiet-hours] could not read quiet hours'.
- Metrics recordNotificationDelivery channels push_expo and push_web.
- Tables notifications, mobile_devices, web_push_subscriptions.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Quiet hours drop pushes rather than defer them** Affects: Phone and browser users with quiet hours. Evidence: apps/web/lib/services/push-notification-service.ts:289-295 versus the brief draft. Work needed: Decide the product rule; defer if required.
- **No push receiver for CLI, VS Code, Chrome, native Desktop** Affects: Those apps. Evidence: no api/notifications use outside apps/web found. Work needed: Parity decision.
- **Notifications are not plan gated and not subscription-linked** Affects: Subscription consistency. Evidence: no entitlement check in agent-notification-service.ts. Work needed: Confirm that is intended.
- **Brief item cites line ranges that moved** Affects: Documentation. Evidence: agent-notification-service.ts:146-180. Work needed: Refresh references.

**Depends on**

- surface:web
- surface:mobile
- mode:cloud
- table:notifications
- table:mobile_devices
- table:web_push_subscriptions
- table:cloud_agent_runs
- api:GET /api/notifications
- api:PATCH /api/notifications
- api:POST /api/web-push
- SYS-agents-tools-and-automation
- SYS-observability-and-operations
- SYS-voice-and-media
- F090-12
- F090-08

## Unknown

- Retention of notifications rows.
- Whether Electron Desktop adds OS-level notifications.
- Methods on /api/web-push.
- Whether Chrome or CLI have any local completion notice (not searched).
- The meaning of the exact data.target payload fields on every mobile route.
