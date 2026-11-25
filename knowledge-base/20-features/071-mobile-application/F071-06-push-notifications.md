---
id: "F071-06"
type: "feature"
title: "Push notifications"
aliases: ["Push notifications", "Notifications", "Notification center", "Notification deep links", "Alerts", "S71.12", "S71.13"]
area: "71 Mobile application"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S71.12", "S71.13"]
depends_on: ["surface:mobile", "mode:local", "mode:cloud", "api:POST /api/mobile/push-token", "api:DELETE /api/mobile/push-token", "table:mobile_devices", "store:mmkv-notification-history", "SYS-observability-and-operations", "SYS-agents-tools-and-automation", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F071-06 Push notifications

Alerts from AGI Mobile. A signed-in phone registers a push address with AGI Cloud, which sends alerts for agent runs, research, schedules, chat replies and product updates through Expo's push service. Local notices such as 'Your reply is ready' are made on the phone. A tap opens the matching screen from an allow list.

Area: [71. Mobile application](README.md). Requirement items: [S71.12](../../10-requirements/capabilities/071-mobile-application.md#s7112), [S71.13](../../10-requirements/capabilities/071-mobile-application.md#s7113).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Registers the device, shows alerts according to priority, account and user preferences, keeps a list of past alerts and routes taps to chats, tasks, schedules, reports and settings.

**Why it exists.** The brief requires push registration with server storage and pushes for agent, research and schedule events (S71.12), and deep links that open the right screen (S71.13). (doc: knowledge-base/data/area-briefs/071-mobile-application.md)

**Who uses it.** People who start long tasks or scheduled work and want to be told when they finish or need approval.

**Problems it solves**

- Long runs finish while the app is closed.
- An agent waits for approval.
- Alerts for another account must not leak.
- A tap must land on the right screen.

**Use cases**

- An agent run finishes; the phone buzzes and a tap opens it.
- A scheduled task completes; tap opens Schedules.
- Leave a Local chat while it answers; a notice says 'Your reply is ready'.
- Open the Notifications list to see missed alerts.

## 2. User experience

**Where to find it**

- Mobile: Settings, Notifications (title 'Notifications') with a card 'Turn on notifications' (apps/mobile/src/features/settings/notifications/index.tsx:168-190, 362).
- Notifications list screen at /(app)/notifications with 'Mark all as read', 'Clear All' and 'No notifications yet.' (apps/mobile/app/(app)/notifications/index.tsx:344-431).
- The menu button shows an unread pip (apps/mobile/src/shared/components/DrawerButton.tsx:77-95).

**Before you start**

- OS notification permission, requested only from the explicit enable button (apps/mobile/services/notifications.ts:202-221).
- Remote push needs a signed-in account (apps/mobile/src/features/auth/hooks/usePushTokenAccountRegistration.ts:28-63).
- A build with push entitlements; without them registration is skipped (notifications.ts:277-285).

**Screens and controls**

- Permission card with states: delivering, 'Turn on notifications', 'Your device is blocking notifications' (Open Settings), and 'AGI Cloud alerts cannot reach this device' for registration failures (settings/notifications/index.tsx:168-193).
- Category rows with Push or Off or Blocked, quiet hours, vibration toggles, daily brief and usage reset reminders (settings/notifications/index.tsx:254-700).
- Notification list: mark all read, clear on this device, tap an item to open.

**Journey**

1. Open Settings, Notifications. Read the card that says what AGI will send.
2. Tap 'Turn on notifications'. The OS prompt appears once.
3. The app registers the push address with AGI Cloud with a device id and preferences.
4. Choose categories and quiet hours; changes sync to the server after about 0.8 s.
5. When an event happens an alert arrives. Tap it. The app opens the matching screen or the Notifications list.
6. If notifications are blocked, the card offers Open Settings.

**What the person sees and gets**

- Banner, sound or badge according to priority (notifications.ts:101-160).
- Unread count on the menu button and the app icon badge (notifications.ts:686-720).
- Card text changes for blocked or unregistered states (settings/notifications/index.tsx:168-193).

**Settings**

- Categories and per-type switches, quiet hours with days and times, vibration per priority, daily brief time (settings/notifications/index.tsx; apps/mobile/stores/notificationPrefsStore).
- Agent activity push switch (useAgentActivityPushSync.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The OS prompt runs only from enablePushNotifications; sign-in registration never prompts (apps/mobile/services/notifications.ts:202-221; test:apps/mobile/__tests__/push-permission-primer.test.ts).
- After permission, the app gets an Expo push token and posts it with device id, platform, name and preferences to POST /api/mobile/push-token (notifications.ts:237-290; apps/mobile/services/pushPreferenceSync.ts:108-160; packages/contracts/cloud-contracts/src/mobile-push.ts:3).
- The server upserts into public.mobile_devices and refuses a device id owned by another user with 403 (apps/web/app/api/mobile/push-token/route.ts:23-80; apps/web/db/neon/0013_devices.sql:38).
- DELETE clears or releases the device token on sign-out (route.ts:96-125; test sign-out-push-token-cleanup).
- The server sends batches of up to 100 through Expo's push endpoint, drops tokens Expo says are not registered, defers sends held by quiet hours through a job, and filters by device preferences (apps/web/lib/services/push-notification-service.ts:25-27, 92-120, 189-220, 281-311).
- Producers: agent run events, research and code session events (apps/web/lib/services/agent-notification-service.ts:140, 209, 314, 374), chat replies (chat-reply-notification-service.ts:30-39), scheduled runs (schedule-notification-service.ts:139-178), product updates as opt-in (product-update-notification-service.ts:66-189); video completion and usage-reset reminders import the service (video-completion-notice-service.ts, apps/web/lib/workflows/steps/send-usage-reset-reminder.ts).
- Foreground handler hides alerts for another account, for unbound legacy notices, for the chat open in front, and for types the person turned off; priority: critical and high show banner, list, sound and badge; normal shows without sound; low shows no banner and no list, badge only (notifications.ts:101-160).
- Tap routing: only an allow list of route prefixes and only those whose feature flag is on (notifications.ts:339-370); tap on another account's alert offers Switch account (notifications.ts:471-490).
- Local notices: 'Your reply is ready' when a reply finishes while the app is in the background (apps/mobile/services/replyReadyNotice.ts:17-43); tagged as a device conversation for Local chats (notifications.ts:293-338).
- Notification history kept on the device, at most 50 items (notifications.ts:662-720).

**Incomplete**

- The code comment in notificationEventTypes.ts calls schedule_run the only server push producer, but several server producers exist now. (apps/mobile/services/notificationEventTypes.ts:14-18 vs the server files above)

**Present but disconnected or switched off**

- Approval alerts open the companion pages only when FEATURES.companion is true; it is false, so they open the Notifications list, or the tasks page when the alert carries a run id (apps/mobile/lib/v1FeatureFlags.ts:16; notifications.ts:414-466, 540-580).
- The Notifications list route is allowed only while FEATURES.cloudChat is true (notifications.ts:339-351).

**Not available**

- Push on Web, Desktop, CLI, VS Code and Chrome through this feature: not applicable. A separate web push service exists in apps/web/lib/services/web-push-service.ts and is not part of this page.

## 4. Required behaviour

**Established requirements**

- The app registers for push, the server stores the token and sends pushes for agent, research and schedule events. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.12)
- Tapping a notification opens the screen it is about (task, approval, schedule, chat). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.13)
- The OS permission prompt is spent from an explicit user action after a primer, never from a lifecycle effect. (source: apps/mobile/services/notifications.ts:202-204 (code comment citing MOBILE-021))
- A notice for another account must not be shown or opened without an account switch. (source: notifications.ts:97-135, 482-490 and test notification-auth-gate)

**Acceptance criteria**

1. Before the person taps Turn on notifications, no OS prompt appears at launch or sign-in.
2. After enabling, public.mobile_devices holds a row for the device with a push token and preferences.
3. Signing out clears the token (the next push is not delivered to the device).
4. An agent run finishing sends an alert; tapping it opens the run in Tasks or the Notifications list.
5. With quiet hours on, a non-exempt alert is held and sent later.
6. A push for another account shows no banner; tapping a stored one offers Switch account.
7. A reply finishing while the app is closed shows 'Your reply is ready' and a tap opens the chat.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local mode cannot receive remote pushes because the token is bound to a signed-in account; only local notices work. [inferred from usePushTokenAccountRegistration.ts:28-63 and notifications.ts:293-338]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the stale 'only producer' comment.
- [proposed] Decide whether approval alerts should open Tasks when companion is off.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | notifications service | `apps/mobile/services/notifications.ts` | Handler, enable, register, route taps, history store. |
| service | pushPreferenceSync | `apps/mobile/services/pushPreferenceSync.ts` | Posts token and preferences to the server, debounced. |
| hook | usePushTokenAccountRegistration | `apps/mobile/src/features/auth/hooks/usePushTokenAccountRegistration.ts` | Registers or clears the token as the account changes. |
| screen | Notification settings | `apps/mobile/src/features/settings/notifications/index.tsx` | Permission card, categories, quiet hours. |
| screen | Notifications list | `apps/mobile/app/(app)/notifications/index.tsx` | History list with mark all read and clear. |
| service | replyReadyNotice | `apps/mobile/services/replyReadyNotice.ts` | Local 'Your reply is ready' notice. |
| service | companionNotifications | `apps/mobile/services/companionNotifications.ts` | Local notices for companion events. |
| store | notificationPrefsStore | `apps/mobile/stores/notificationPrefsStore.ts` | Per-category preferences and quiet hours. |
| config | notificationEventTypes and channels | `apps/mobile/services/notificationEventTypes.ts` | Event types and quiet-hours exempt list. |
| endpoint | POST and DELETE /api/mobile/push-token | `apps/web/app/api/mobile/push-token/route.ts` | Stores or clears the device token and preferences. |
| table | mobile_devices | `apps/web/db/neon/0013_devices.sql` | Stores device id, user, platform, push token, preferences. |
| service | push-notification-service | `apps/web/lib/services/push-notification-service.ts` | Filters devices, sends through Expo, invalidates dead tokens, defers for quiet hours. |
| service | agent-notification-service | `apps/web/lib/services/agent-notification-service.ts` | Agent run, research and code session pushes. |
| service | chat-reply-notification-service | `apps/web/lib/services/chat-reply-notification-service.ts` | Chat reply ready pushes. |
| service | schedule-notification-service | `apps/web/lib/services/schedule-notification-service.ts` | Scheduled run completion pushes. |
| service | product-update-notification-service | `apps/web/lib/services/product-update-notification-service.ts` | Opt-in product update announcements. |
| schema | mobile-push contract | `packages/contracts/cloud-contracts/src/mobile-push.ts` | Token path, preference schema and opt-in rule shared by phone and server. |
| job | notifications.deferred-push | `apps/web/lib/services/push-notification-service.ts` | Background job that sends a push after quiet hours. |
| test | push tests | `apps/mobile/__tests__/push-permission-primer.test.ts` | Prompt only from the enable path. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person taps Turn on notifications; the OS asks once. | device | apps/mobile/services/notifications.ts:204-221; settings/notifications/index.tsx:301-312 |
| The phone asks Expo for a push token using the project id. | outside service | notifications.ts:257-263 (getExpoPushTokenAsync) |
| The phone posts token, device id, platform, name and preferences to our servers. | device and our servers | pushPreferenceSync.ts:137-160; apps/web/app/api/mobile/push-token/route.ts:23-80 |
| Our server saves them in public.mobile_devices after a rate limit, CSRF check and ownership check. | our servers | route.ts:23-80 |
| An event happens on our servers; a producer service calls sendPushToUser, which picks devices that accept the notice now. | our servers | agent-notification-service.ts:164-176; push-notification-service.ts:92-120 |
| The server posts batches to Expo's push endpoint; Expo delivers through the platform push services. | outside service | push-notification-service.ts:25, 182-200 (platform delivery behind Expo is [inferred]) |
| The phone's handler decides banner, sound and badge, then stores the alert in the history. | device | notifications.ts:101-160, 686-720 |
| A tap runs handleNotificationResponse and navigates with a retry until the router is ready. | device | notifications.ts:376-410, 471-640 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Push token, device id, platform, name, preferences | table:mobile_devices on our servers | yes, by the registration post | token set to null on sign-out or when Expo reports it unregistered; row deleted on release or account deletion (route.ts:96-125; push-notification-service.ts:208; 0020_functions.sql:1373) |
| Notification history | MMKV on the device | no | latest 50, cleared by Clear All (notifications.ts:662-720; list screen 344-348) |
| Notification preferences and quiet hours | device preferences store, copy on server in push_preferences | yes, debounced | until changed |
| Local notice payloads | OS notification store | no | per OS; clearDeliveredNotifications removes them (notifications.ts:222-235) |

**Models and providers.** No model or inference provider. Delivery goes through Expo's push service (outside service). Alerts are triggered by agent, research, schedule and chat reply events that run elsewhere (SYS-agents-tools-and-automation).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Remote push: signed in. Local notices: no account (account null marks a device conversation) (notifications.ts:293-338). |
| Permissions | OS notification permission, granted from the explicit button. Android notification channels are created (notifications.ts:200-215). |
| Subscription | none found in the code for push delivery itself. Some alert sources (scheduled tasks, agent work) depend on plan features owned elsewhere. |
| Limits and metering | Server rate limit 'mobile-push-token' on registration (route.ts:23); 100 tokens per Expo request and a 10 s timeout (push-notification-service.ts:26-27); client keeps 50 history items. Delivery is not metered against usage in the code read. |
| Feature flags | FEATURES.companion, cloudChat, schedules, cloudTasks decide which tap routes are allowed (notifications.ts:339-351; apps/mobile/lib/v1FeatureFlags.ts). |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code for inference. Push depends on Expo and platform push services. |
| Local mode | No account means no remote push token. Local chats can still raise a local 'Your reply is ready' notice when the app is in the background, and a tap opens the chat (replyReadyNotice.ts:17-43; notifications.ts:500-520). Taps never land on a sign-in wall in Local mode (notifications.ts:519-523). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Permission undetermined or denied | Card offers Turn on notifications or Open Settings; no auto prompt. | settings/notifications/index.tsx:168-181, 301-312; test push-permission-primer |
| Token fetch fails | Registration issue 'device_token'; status reads unregistered; card says AGI Cloud alerts cannot reach the device. | notifications.ts:172-178, 266-285; settings/notifications/index.tsx:184-193 |
| Server refuses registration | Issue 'server' set; same card. | notifications.ts:266-274 |
| Device id belongs to another account | Server returns 403 'Device registered to another user'. | apps/web/app/api/mobile/push-token/route.ts:40-48 |
| Account switch or sign-out | Token cleared for old account before the new registration; late callbacks dropped. | test:apps/mobile/__tests__/push-token-account-lifecycle.test.ts |
| Alert for another account | Hidden; tap offers Switch account. | notifications.ts:101-135, 482-490 |
| Chat reply for the chat open in front | Not shown. | notifications.ts:97-100, 112 |
| Quiet hours | Server holds non-exempt pushes and a job resumes them; device applies the same exempt list. | push-notification-service.ts:281-311; notificationEventTypes.ts:34-43 |
| Router not ready on tap | Navigation retries up to 4 times with growing waits. | notifications.ts:376-398 |
| Route not on allow list or feature off | Blocked with a console warning and a fallback to home or chat. | notifications.ts:339-351, 548-600 |
| Expo reports DeviceNotRegistered | Token set to null on the server. | push-notification-service.ts:208-220 |
| Offline | Alerts depend on the push service; history and settings work offline. Preference sync retry details not read. | pushPreferenceSync.ts (not read in full) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/push-permission-primer.test.ts`: No prompt from sign-in or denied registration; registers without prompt once granted; prompts only from the explicit enable path.
- `apps/mobile/__tests__/push-preference-sync.test.ts`: Registers with category map, quiet hours and timezone; resolves types to categories; keeps opt-in groups off; re-syncs on changes.
- `apps/mobile/__tests__/notification-auth-gate.test.ts`: Switch account offer, no open for unbound legacy notices, delayed navigation dropped on account change, Local Mode opens without sign-in.
- `apps/mobile/__tests__/push-token-account-lifecycle.test.ts`: Account A delete before account B registers; late callbacks dropped; same account can register again.
- `apps/mobile/__tests__/sign-out-push-token-cleanup.test.ts`: Captured credential for the exact DELETE endpoint; no general Local bypass; 401 handling.
- `apps/mobile/__tests__/NotificationCategorySettings.test.tsx`: Category summaries, detail screens, research and code groups, list of recent notifications.
- `apps/mobile/__tests__/NotificationsScreenForegroundRefresh.test.tsx`: Permission status re-read when returning from Settings, including Android channels.
- `apps/mobile/__tests__/research-code-push-groups.test.ts`: Server switch for the task group, per-group switches, hidden groups stay silent.
- `apps/web/lib/services/__tests__/push-notification-service.test.ts`: Server delivery service (titles not read).
- `apps/web/lib/services/__tests__/agent-notification-service.test.ts`: Agent notices (titles not read).
- `apps/web/lib/services/__tests__/schedule-notification-service.test.ts`: Schedule notices (titles not read).
- `apps/web/lib/services/__tests__/chat-reply-notification-service.test.ts`: Chat reply notices (titles not read).

**Test scenarios**

- **Primer then prompt**
  1. Install fresh, sign in.
  2. Observe no OS prompt.
  3. Open Settings, Notifications and tap 'Turn on notifications'.
  - Expected: One OS prompt; card changes to 'Your device is delivering notifications'; a row appears in mobile_devices.
- **Agent run finishes**
  1. Start a Cloud task, background the app.
  2. Wait for completion.
  - Expected: Alert arrives; tap opens Tasks with the run or the Notifications list.
- **Account isolation**
  1. Register with account A, switch to account B.
  2. Trigger an event for A.
  - Expected: No banner on the device for A's alert; if opened from history, 'Notification for another account' appears.
- **Quiet hours**
  1. Turn quiet hours on for the current time.
  2. Trigger a non-exempt event.
  - Expected: No alert until quiet hours end; exempt types still arrive.
- **Local reply notice**
  1. In Local mode, send a long request and leave the app.
  - Expected: 'Your reply is ready' appears; tap opens that chat.
- **Sign out**
  1. Sign out.
  2. Trigger an event.
  - Expected: No push reaches the device; token cleared in the table.

**Where to look when it fails**

- Console prefixes '[push]' and '[notifications]' (notifications.ts:277-290, 395, 548).
- Server: log lines '[push] Expo rejected the batch', 'Failed to upsert mobile push token', 'Failed to clear push token'.
- Table: public.mobile_devices (push_token, push_preferences, updated_at).
- Settings card text maps to getPushDeliveryStatus and registration issue values 'device_token' and 'server'.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/071-mobile-application.md](../../70-qa/test-plans/mobile/071-mobile-application.md)

## 10. Gaps and dependencies

- **Approval alerts do not open the approval screens because companion is off.** Affects: Mobile Cloud users who get approval alerts.. Evidence: apps/mobile/lib/v1FeatureFlags.ts:16; apps/mobile/services/notifications.ts:414-466. Work needed: Decide the intended landing (Tasks with run id works when the alert carries a run id) and test it.
- **Stale comment says schedule_run is the only server producer.** Affects: Engineers reading the code.. Evidence: apps/mobile/services/notificationEventTypes.ts:14-18. Work needed: Correct the comment.
- **Server sends sound 'default' on every push while the phone's priority table only applies to what the foreground handler shows.** Affects: Low-priority alerts when the app is closed (the OS plays the sound).. Evidence: apps/web/lib/services/push-notification-service.ts:189; apps/mobile/services/notifications.ts:101-160. Work needed: Check on device whether low-priority pushes are silent when the app is closed.
- **No live run of delivery is recorded here.** Affects: All.. Evidence: No result file was read. Work needed: Run the scenarios on real devices.

**Depends on**

- surface:mobile
- mode:local
- mode:cloud
- api:POST /api/mobile/push-token
- api:DELETE /api/mobile/push-token
- table:mobile_devices
- store:mmkv-notification-history
- SYS-observability-and-operations
- SYS-agents-tools-and-automation
- SYS-authentication-and-identity

## Unknown

- Whether pushes arrive on real devices and with the app closed; no run record was read.
- Which entitlement or plan, if any, limits push producers such as scheduled tasks.
- Preference-sync retry behaviour when offline (pushPreferenceSync.ts only partly read).
- Retention of rows in mobile_devices beyond sign-out and account deletion.
- How Android channels map to priorities (notificationChannels.ts not read).
- Whether the rate limit 'mobile-push-token' value is adequate; value not read.
- The web push path is separate and not covered here.
