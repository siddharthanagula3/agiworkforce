---
id: "F069-08"
type: "feature"
title: "Browser notifications"
aliases: ["Browser notifications", "Web push", "Agent run updates (Settings switch)", "Know when a run finishes (offer card)", "S69.13"]
area: "69 Web application"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S69.13"]
depends_on: ["surface:web", "mode:cloud", "table:web_push_subscriptions", "api:GET /api/web-push", "api:POST /api/web-push", "api:DELETE /api/web-push", "file:apps/web/public/sw.js", "file:apps/web/lib/services/web-push-service.ts", "SYS-observability-and-operations", "SYS-agents-tools-and-automation", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F069-08 Browser notifications

Web users can turn on browser push so a system notification arrives when a cloud agent run finishes, fails or needs approval, even with the tab closed. A switch in Settings, Notifications, 'Agent run updates', registers this browser. The server sends encrypted push through the browser's push service. Alerts show status, not run output.

Area: [69. Web application](README.md). Requirement items: [S69.13](../../10-requirements/capabilities/069-web-application.md#s6913).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Registers a browser with a push service and our server, then sends an encrypted notice when a cloud agent run changes state (apps/web/lib/services/agent-notification-service.ts:140-175; apps/web/lib/services/web-push-service.ts:346-412).

**Why it exists.** A run can finish while the user is away. Without push the web user hears nothing (apps/web/db/neon/0151_web_push_subscriptions.sql:1-8). The brief asks for a system notification with the tab closed (S69.13).

**Who uses it.** Web users in a browser that supports push, signed in, with cloud agent runs.

**Problems it solves**

- Missing a finished or blocked run.
- Not knowing a run needs approval.
- A shared browser leaking one account's alerts to the next.

**Use cases**

- Start a long cloud run, close the tab, get 'Agent run finished'.
- Get 'Approval needed' for a tool.
- Turn alerts off on a shared computer.

## 2. User experience

**Where to find it**

- Web: Settings, Notifications, row 'Agent run updates' with a switch (apps/web/features/settings/sections/NotificationsSection.tsx:80,439-470).
- Web: a one-time card 'Know when a run finishes' with 'Turn on' and 'Not now', bottom right (apps/web/features/notifications/components/WebPushOptIn.tsx:88-120; mounted at apps/web/app/AppRuntimeMounts.tsx:26).
- A status note 'Browser delivery: <Allowed | Not allowed yet | Blocked | Unavailable | System settings>' sits above the rows (apps/web/features/notifications/components/BrowserNotificationStatus.tsx).
- Desktop shell: the row says the desktop app uses system notifications (apps/web/features/notifications/components/WebPushToggle.tsx).

**Before you start**

- Signed in.
- Browser with service worker, Push API and Notification (apps/web/features/notifications/lib/web-push-client.ts:34-41).
- Not in the Desktop shell.
- Server has a VAPID key pair configured, else nothing is offered (web-push-client.ts:74-88).

**Screens and controls**

- Switch 'Agent run updates'; helper text 'Completions, failures and approval requests. This browser only.' and details 'Enable separately in each browser. Alerts show run status, not run output.' (NotificationsSection.tsx:81,448-451).
- Offer card with 'Turn on', 'Not now' and a Dismiss button (WebPushOptIn.tsx).
- Browser permission prompt.

**Journey**

1. Sign in; the offer card appears if permission is undecided, the offer was not dismissed and the server has a key (WebPushOptIn.tsx:46-67).
2. Press 'Turn on' (or the Settings switch). The browser asks permission.
3. On allow, the worker registers and the browser subscription is sent to the server.
4. A cloud agent run ends or needs input; a notification appears.
5. Click it: an open tab on the same path is focused, else a window opens (apps/web/public/sw.js:81-103).
6. Turn the switch off to delete the registration and drop the browser subscription.

**What the person sees and gets**

- Switch state and helper text: 'Registered in this browser.', 'Notifications are blocked for this site in your browser settings.', 'This browser could not be turned off. Try again.', 'Browser push is unavailable here.' (WebPushToggle.tsx).
- Notification titles: 'Approval needed', 'Your agent has a question', 'Agent run finished', 'Agent run failed' (agent-notification-service.ts:98-121).

**Settings**

- Quiet hours (checked before sending, apps/web/lib/services/push-notification-service.ts:281-291).
- Separate 'Reply ready' browser popup preference, a different mechanism (NotificationsSection.tsx:50).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Subscribe, store, delete endpoints with CSRF, rate limit, https and public-host checks (apps/web/app/api/web-push/route.ts:62-145).
- Client enable/disable, account hand-over on a shared browser, re-sync of held subscriptions (web-push-client.ts:132-217).
- Own Web Push sender: encryption, VAPID signing, batches of 10, 10 s timeout, prune of dead endpoints (web-push-service.ts:178-238,252-263,346-412).
- Service worker shows the notice, handles click and endpoint rotation (public/sw.js:63-133).
- Cloud agent run events call the sender (apps/web/lib/services/cloud-agent-run-service.ts:170; agent-notification-service.ts:140).

**Incomplete**

- Click on a run notice opens /tasks, not the run: sw.js says /tasks does not read the run query parameter yet (public/sw.js:31-44).
- Agent-run notices only carry runId; conversation and code-session ids are used by other senders (sw.js:45-62; agent-notification-service.ts:157-165).
- Migration 0151 header still reads 'NOT YET APPLIED - draft only'; applied state in each environment is not established (apps/web/db/neon/0151_web_push_subscriptions.sql:3).

**Present but disconnected or switched off**

- The standalone WebPushToggle component has no importer outside features/notifications; only the hook is used by Settings.
- Chat reply and schedule notices pass web: false, so they do not push to browsers (apps/web/lib/services/chat-reply-notification-service.ts:42; apps/web/lib/services/schedule-notification-service.ts:184).
- Without the three VAPID env vars the sender returns zero sends and GET returns a null key (web-push-service.ts:104-114,350-351).

**Not available**

- Desktop shell: push disabled, OS notifications used (web-push-client.ts:26-40).
- Mobile, CLI, VS Code, Chrome extension: not this feature (mobile has its own push path).

## 4. Required behaviour

**Established requirements**

- A user turns on browser notifications in Settings and gets a system notification when an agent run or long task finishes, even with the tab closed. (source: S69.13 (brief))
- A registration moves between accounts only by a fresh endpoint; the server refuses to move it. (source: apps/web/app/api/web-push/route.ts:83-96; apps/web/db/neon/0151_web_push_subscriptions.sql:12-16)
- Notices carry no task output because they render on a locked screen. (source: apps/web/lib/services/web-push-service.ts:337-345)
- Permission is requested only on a user click. (source: apps/web/features/notifications/components/WebPushOptIn.tsx:33-40)
- Quiet hours hold a push. (source: apps/web/lib/services/push-notification-service.ts:281-297)

**Acceptance criteria**

1. Switch on: browser prompt appears; on allow a row exists in web_push_subscriptions for this user.
2. Switch off: row deleted and browser subscription removed, even if the server call fails.
3. With no VAPID key the offer card and switch offer nothing and GET /api/web-push returns publicKey null.
4. A second account on the same browser can turn notifications on (gets a fresh endpoint).
5. A finished cloud run sends a notice with no run output.
6. Click on a notice focuses or opens a tab.
7. In quiet hours no notice is sent.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] 'Opens the run' is not met: the click lands on /tasks.
- [inferred] Tab-closed delivery depends on the browser's push service and OS, not on our code.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make /tasks read the run parameter, or send the run's conversation id.
- [proposed] Fix the stale 'not yet applied' header or record the applied state.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | web-push-client | `apps/web/features/notifications/lib/web-push-client.ts` | Support check, permission, subscribe, enable, disable, resync |
| hook | useWebPushToggle | `apps/web/features/notifications/components/WebPushToggle.tsx` | Switch state machine: unsupported, desktop, blocked, off, on, stuck |
| component | WebPushOptIn | `apps/web/features/notifications/components/WebPushOptIn.tsx` | One-time offer card |
| component | BrowserNotificationStatus | `apps/web/features/notifications/components/BrowserNotificationStatus.tsx` | Delivery status note |
| screen | NotificationsSection | `apps/web/features/settings/sections/NotificationsSection.tsx` | Settings row 'Agent run updates' |
| component | AppRuntimeMounts | `apps/web/app/AppRuntimeMounts.tsx` | Mounts the offer card app-wide |
| other | Service worker | `apps/web/public/sw.js` | Push, click, subscription change |
| endpoint | GET/POST/DELETE /api/web-push | `apps/web/app/api/web-push/route.ts` | Public key, store, remove |
| service | web-push-service | `apps/web/lib/services/web-push-service.ts` | VAPID, encryption, send, prune |
| service | push-notification-service | `apps/web/lib/services/push-notification-service.ts` | Quiet hours and fan-out to mobile and web |
| service | agent-notification-service | `apps/web/lib/services/agent-notification-service.ts` | Builds agent run notices, records feed row, sends push |
| service | cloud-agent-run-service | `apps/web/lib/services/cloud-agent-run-service.ts` | Calls the notifier on run events (line 170) |
| table | web_push_subscriptions | `apps/web/db/neon/0151_web_push_subscriptions.sql` | Endpoint, keys, user, user agent; unique endpoint; RLS |
| schema | RLS migration | `apps/web/db/neon/0153_notifications_row_level_security.sql` | Row-level security notes |
| store | localStorage keys agi.web-push.disabled and agi.web-push.offer-dismissed | `apps/web/features/notifications/lib/web-push-client.ts` | Remember opt-out and dismissed offer |
| config | WEB_PUSH_VAPID_PUBLIC_KEY / _PRIVATE_KEY / _SUBJECT | `apps/web/lib/services/web-push-service.ts` | Server key pair (names only) |
| test | web-push-client tests | `apps/web/features/notifications/lib/__tests__/web-push-client.test.ts` | Client behaviour |
| test | route tests | `apps/web/app/api/web-push/__tests__/route.test.ts` | Endpoint behaviour |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| User clicks; browser asks permission; client registers sw.js and reads the public key from GET /api/web-push (signed-in only). | device and our servers | web-push-client.ts:74-88,168-186; route.ts:62-69 |
| Browser subscribes through its own push service; client posts the subscription with CSRF. | outside service | web-push-client.ts:123-166 (subscribe call); the push service is run by the browser vendor [inferred] |
| Server validates, refuses another account's endpoint (403), upserts the row under row-level security. | our servers | route.ts:71-117 |
| A cloud agent run event records a feed row, then calls sendPushToUser for web; quiet hours may hold it. | our servers | agent-notification-service.ts:140-175; push-notification-service.ts:281-297 |
| Server encrypts the payload and posts it to the stored endpoint with a signed token; 404/410 removes the row. | outside service | web-push-service.ts:283-335,346-412 |
| Service worker shows the notice; click focuses or opens a window. | device | public/sw.js:63-103 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Push endpoint, p256dh, auth, user agent, timestamps | table web_push_subscriptions | Server only | Deleted on switch off, on dead-endpoint prune, or with the account (cascade) (0151_web_push_subscriptions.sql:12-19; route.ts:133-142) |
| Notification text (title, body, runId) | Sent encrypted; also a feed row via recordNotification | Feed row on server | Feed retention not established |
| Opt-out and dismissed flags | localStorage in the browser | No | Until cleared |

**Models and providers.** No model is called. Delivery goes through the browser's push service. Notices come from cloud agent runs, which use whatever model that run used.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for key read, store and delete (route.ts:66,75). |
| Permissions | Browser notification permission; per-row user scope (row-level security). |
| Subscription | none found in the code for the push itself. Cloud agent runs have their own plan rules. |
| Limits and metering | Rate-limit bucket 'web-push' (route.ts:18). Deliveries are counted by recordNotificationDeliveries (web-push-service.ts:410). Payload must fit one 4096-byte record (web-push-service.ts:372-375). TTL 3600 s. |
| Feature flags | VAPID env vars; no feature flag found. |
| Model compatibility | none found in the code |
| Provider restrictions | Works only in browsers with service worker, Push and Notification; not in the Desktop shell (web-push-client.ts:26-40). |
| Local mode | Local mode has no cloud agent runs to notify about; push needs our server and the browser's push service. [inferred] |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Permission denied | Enable returns 'denied'; switch shows blocked text | web-push-client.ts:168-172; WebPushToggle.tsx |
| No server key | 'unavailable'; offer card never appears | web-push-client.ts:74-88,174-178; WebPushOptIn.tsx:62-66 |
| Endpoint belongs to another account | 403; client drops the held subscription and takes a new one | route.ts:94-96; web-push-client.ts:132-150 |
| Turn off, server unreachable | Browser subscription still dropped; row pruned at next failed send | web-push-client.ts:188-217 |
| Turn off, unsubscribe fails | Switch shows 'stuck' text | WebPushToggle.tsx change() |
| Endpoint rotated by push service | Service worker re-registers | public/sw.js:105-133 |
| Push service says gone | Row deleted | web-push-service.ts:48-49,323,409 |
| Quiet hours unreadable | Notice queued as a deferred job; dropped after final attempt | push-notification-service.ts:304-356 |
| Storage blocked | Opt-out memory lost; offer shown again next session | web-push-client.ts:9-24; WebPushOptIn.tsx:25-31 |
| Accessibility | Switch has aria-label and describedby; status note is aria-live polite | NotificationsSection.tsx:455-461; BrowserNotificationStatus.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/notifications/lib/__tests__/web-push-client.test.ts`: Support detection, enable, held subscription reuse, account hand-over, resync, disable (from test titles)
- `apps/web/app/api/web-push/__tests__/route.test.ts`: Key, auth, store, refresh, 403 on other account, CSRF, rate limit, key and https checks, delete scope (from test titles)
- `apps/web/features/notifications/components/__tests__/WebPushOptIn.test.tsx`: Offer card (name only)
- `apps/web/features/notifications/components/__tests__/WebPushToggle.test.tsx`: Toggle (name only)
- `apps/web/lib/services/__tests__/web-push-service.test.ts`: Sender (name only)
- `apps/web/lib/services/__tests__/agent-notification-service.test.ts`: Agent notices (name only)
- `apps/web/lib/services/__tests__/push-notification-service.test.ts`: Fan-out and quiet hours (name only)

**Test scenarios**

- **Enable**
  1. Sign in on a push-capable browser.
  2. Settings, Notifications, switch 'Agent run updates' on.
  3. Allow the prompt.
  - Expected: Helper text 'Registered in this browser.'; one new row for the user.
- **Closed tab**
  1. Enable.
  2. Start a cloud agent run.
  3. Close the tab.
  4. Wait for it to finish.
  - Expected: System notification 'Agent run finished'; no run output in it.
- **Shared browser**
  1. Enable as account A.
  2. Sign out; sign in as account B.
  3. Enable.
  - Expected: B succeeds; A's row is no longer used by this browser.
- **Denied**
  1. Block notifications in browser settings.
  2. Open Settings.
  - Expected: Text says notifications are blocked.
- **No key**
  1. Run with no VAPID env vars.
  2. Open the app.
  - Expected: No offer card; GET returns a null key.
- **Click**
  1. Click a run notice with a tab open on /tasks.
  - Expected: The tab is focused; the run parameter is ignored by the page today.

**Where to look when it fails**

- Server logs prefixed [web-push]: 'push service rejected the notification', 'push endpoint could not be reached', 'payload exceeds one record', 'failed to prune dead endpoints'.
- Logger error 'Failed to store web push subscription'.
- Table web_push_subscriptions.
- Browser devtools, Application, Service Workers.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/069-web-application.md](../../70-qa/test-plans/web/069-web-application.md)

## 10. Gaps and dependencies

- **Click does not open the run itself.** Affects: Web users with agent run notices. Evidence: public/sw.js:31-44,45-62. Work needed: Teach /tasks to read the run parameter or carry a conversation id.
- **Migration 0151 says not applied; real state unknown.** Affects: Operations. Evidence: apps/web/db/neon/0151_web_push_subscriptions.sql:3. Work needed: Check migration status and correct the header.
- **Standalone WebPushToggle component is not mounted anywhere.** Affects: Code hygiene. Evidence: search for WebPushToggle importers. Work needed: Remove it or mount it.
- **Chat reply and schedule results do not push to browsers.** Affects: Web users. Evidence: chat-reply-notification-service.ts:42; schedule-notification-service.ts:184. Work needed: Product decision.

**Depends on**

- surface:web
- mode:cloud
- table:web_push_subscriptions
- api:GET /api/web-push
- api:POST /api/web-push
- api:DELETE /api/web-push
- file:apps/web/public/sw.js
- file:apps/web/lib/services/web-push-service.ts
- SYS-observability-and-operations
- SYS-agents-tools-and-automation
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-data-model-and-migrations

## Unknown

- Whether migration 0151 is applied in each environment.
- Whether VAPID keys are configured in production.
- Delivery success on each browser; no run result recorded.
- Which cloud run statuses beyond the four events notify.
- Feed retention.
