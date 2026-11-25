---
id: "F068-10"
type: "feature"
title: "Activity alerts on other clients"
aliases: ["Activity alerts on other clients", "Cross-client activity notifications", "Local code session activity", "approval_required / completed / failed push", "agent push preference (mobilePushAgentActivity)", "S68.30"]
area: "68 Session continuity and remote-session product"
available_on: ["desktop", "mobile", "cli", "vscode"]
implementation: {web: "n/a", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S68.30"]
depends_on: ["surface:desktop", "surface:mobile", "surface:vscode", "surface:cli", "surface:web", "mode:cloud", "api:POST /api/code/local-sessions/activity", "table:mobile_devices", "table:user_settings", "table:profiles", "F068-09", "F068-07", "SYS-observability-and-operations", "SYS-sync-and-continuity", "SYS-api-and-contracts", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F068-10 Activity alerts on other clients

While Remote Control is on, a computer's coding session reports 'approval needed', 'task finished' or 'task stopped' to the account. The server writes a notification and sends a push to the person's phone if the agent push preference is not off. VS Code also shows an alert in its own window when unfocused. Command line reports too, contrary to the brief.

Area: [68. Session continuity and remote-session product](README.md). Requirement items: [S68.30](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6830).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** A session host posts one small activity record to POST /api/code/local-sessions/activity. The server stores a notification in the account feed and, when allowed, sends a mobile push that deep-links to the session. [apps/web/app/api/code/local-sessions/activity/route.ts:16-33; apps/web/lib/services/agent-notification-service.ts:374-414]

**Why it exists.** A person away from the computer must learn that a session needs approval, finished or failed (S68.30). (doc: area brief 068)

**Who uses it.** A person running sessions on Desktop, command line or VS Code who carries a phone. [inferred]

**Problems it solves**

- An agent waiting for approval for hours unnoticed.
- Not knowing a long task ended or failed.

**Use cases**

- Phone buzzes 'Approval needed': tap opens the session at the approval.
- 'Task finished' push after a long refactor.
- VS Code window in the background shows 'Allow once / Deny / Open chat' for an approval.

## 2. User experience

**Where to find it**

- Nothing to open. The alert arrives as a phone push, an entry in the account notification feed, and in VS Code an information or warning message when the window is not focused [apps/extension-vscode/src/features/sidebar-webview/sessionActivityAlert.ts:26-57].
- Preference: the phone's notification settings for agent activity, stored as 'mobilePushAgentActivity' [apps/mobile/src/features/settings/notifications/useAgentActivityPushSync.ts:20; apps/web/lib/services/agent-notification-service.ts:25]. Web: notifications settings (test file name only: NotificationsSection.grouping.test.tsx).

**Before you start**

- Remote Control is active on the reporting computer app (Desktop, command line or VS Code) [packages/platform/utils/src/remoteControl/codeSessionActivity.ts:34; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:192-199].
- Signed in on that app; Desktop posts as the shell account [apps/desktop/electron/main.ts:1336-1340].
- Phone: push permission and a registered device row in mobile_devices (the send reads it) [agent-notification-service.ts:81-83].

**Screens and controls**

- Push title and body from one shared text: 'Approval needed' / '<session> on <device> is waiting for your approval.', 'Task finished' / '... finished its task.', 'Task stopped' / '... stopped before it finished.' [packages/contracts/cloud-contracts/src/local-code-session-activity.ts:32-44].
- VS Code buttons 'Allow once', 'Deny', 'Open chat' [sessionActivityAlert.ts:9,23-24].

**Journey**

1. 1. A session on the computer asks for approval, finishes a turn or fails.
2. 2. The host builds the activity (event, rootId, threadId, turnId, approvalId, session title) and posts it.
3. 3. The server validates it, finds the sending device's name, records a feed notification and, if the preference is not off, sends a push to the phone.
4. 4. The person taps the push; the phone opens the session at the approval when the Remote area is on, otherwise the notifications list [apps/mobile/services/notifications.ts:414-447,525-528].

**What the person sees and gets**

- Response JSON { pushed: true|false } [route.ts:32].
- Phone push with type agent_approval_needed, task_completed or agent_failed and the rootId, threadId, approvalId [agent-notification-service.ts:35-48,395-407].
- Feed notification of category agent_run with severity [agent-notification-service.ts:382-390].

**Settings**

- Agent push preference key 'mobilePushAgentActivity'; absent or true means on [agent-notification-service.ts:62-78].
- Remote Control on/off on the reporting app.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop: createCodeSessionActivity runs on every session event and posts when Remote Control is active and the folder is allowed [apps/desktop/electron/main.ts:2664-2686; packages/platform/utils/src/remoteControl/codeSessionActivity.ts:30-47].
- VS Code: posts the same record with the editor's account token and shows a local alert when the window is unfocused [apps/extension-vscode/src/features/remote-control/remoteControlService.ts:141-152,192-199; sessionActivityAlert.ts:26-57].
- Command line: reports activity for relayable (Managed) threads while 'agi remote-control' runs [apps/cli/src/remote_control/mod.rs:581-606,621-654]. The brief says missing; code shows it present.
- Server route: signed-in, per-user rate limit 'code-session-activity', CSRF, schema validation, device name lookup [route.ts:16-33].
- Server service: always records a feed notification (deduped per turn and approval), then push only if preference not false [agent-notification-service.ts:374-414].
- Only 'approval requested', 'turn finished completed' and 'turn finished failed' produce activity; stopped turns do not [codeSessionActivity.ts:20-28].

**Incomplete**

- Preference read fails open: a database error returns true and a push may go out [agent-notification-service.ts:79-84].
- Activity is reported only while Remote Control is active, not whenever a session runs [codeSessionActivity.ts:34].

**Present but disconnected or switched off**

- On the phone with companion off, a tap opens the notifications list instead of the session [apps/mobile/services/notifications.ts:414-418].

**Not available**

- Push to the web or other desktops for local sessions: push is sent with web false [agent-notification-service.ts:405].
- Chrome extension: not applicable.
- Web page alert for local sessions other than the feed entry: not found.

## 4. Required behaviour

**Established requirements**

- Activity in a session (approval needed, turn done, failure) notifies the user on their other clients. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S68.30)
- The server sends a push only if the account's agent push preference is on; if nothing is sent the response says pushed false. (source: apps/web/lib/services/agent-notification-service.ts:62-78,391; route.ts:27-32)
- Delivery is best effort and must never stop or slow the session. (source: apps/extension-vscode/src/features/remote-control/remoteControlService.ts:138-152; apps/desktop/electron/main.ts:2683-2685)

**Acceptance criteria**

1. An approval request in a session on Desktop with Remote Control on creates one feed notification and one push (preference on).
2. With the preference set false, the feed entry exists and the response is { pushed: false }.
3. Two activity posts for the same turn and approval create one feed entry.
4. With Remote Control off, no activity is posted.
5. An invalid event name or an over-long id returns a validation error.
6. A signed-out caller gets 401; a caller over the rate limit is refused.
7. Tapping the push opens the approval's session on a build with the Remote area on.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Fail-open preference means an outage can send an unwanted push [inferred from agent-notification-service.ts:79-84].
- Cloud sessions use a separate notice path with web and phone push [agent-notification-service.ts:291-347].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Report activity for local sessions even when Remote Control is off but the person is signed in and has asked for alerts.
- [proposed] Fail closed on a preference read error.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/code/local-sessions/activity | `apps/web/app/api/code/local-sessions/activity/route.ts` | Receives activity, rate limits, validates, calls the notifier. |
| service | notifyLocalCodeSessionEvent | `apps/web/lib/services/agent-notification-service.ts` | Feed record, push preference read, push send (374-414). |
| schema | LocalCodeSessionActivitySchema | `packages/contracts/cloud-contracts/src/local-code-session-activity.ts` | Wire shape, events list, shared notice text. |
| service | createCodeSessionActivity | `packages/platform/utils/src/remoteControl/codeSessionActivity.ts` | Turns session events into activity and applies the Remote Control and folder gates. |
| service | reportCodeSessionActivity (Desktop) | `apps/desktop/electron/main.ts` | Posts as the shell account (1336-1348); wiring at 2664-2686. |
| service | postCodeSessionActivity (VS Code) | `apps/extension-vscode/src/features/remote-control/remoteControlService.ts` | Posts with the editor's token (141-152). |
| service | alertSessionActivity | `apps/extension-vscode/src/features/sidebar-webview/sessionActivityAlert.ts` | Local alert when the window is unfocused. |
| service | CLI report_activity | `apps/cli/src/remote_control/mod.rs` | Posts activity for relayable threads (621-654). |
| service | mobile notification routing | `apps/mobile/services/notifications.ts` | Opens the session from a push (414-447,525-528). |
| hook | useAgentActivityPushSync | `apps/mobile/src/features/settings/notifications/useAgentActivityPushSync.ts` | Syncs the agent push preference. |
| table | user_settings / profiles | `apps/web/lib/services/agent-notification-service.ts` | Preference read from settings.notifications (62-78); mobile_devices read at send. |
| test | activity route tests | `apps/web/app/api/code/local-sessions/activity/__tests__/route.test.ts` | Route behaviours. |
| test | codeSessionActivity tests | `packages/platform/utils/src/__tests__/codeSessionActivity.test.ts` | Activity creation. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The session host receives a session event (approval requested or turn finished). | device | apps/desktop/electron/main.ts:2677-2685 |
| The activity builder checks Remote Control is active and the folder allowed, reads the session title, and calls report. | device | codeSessionActivity.ts:30-47 |
| The app posts the record to the web route with the account session (CSRF). | device | main.ts:1336-1347; VS Code remoteControlService.ts:141-152 |
| The server validates, names the sending device, records a feed notification keyed by turn and event. | our servers | route.ts:23-31; agent-notification-service.ts:382-390 |
| The server reads the push preference and sends an Expo push to the account's phones (not web). | our servers | agent-notification-service.ts:391-409 |
| The push provider delivers it to the phone; the app routes the tap. | outside service | agent-notification-service.ts:395-409 (sendPushToUser, expo: true); delivery vendor not named in files read |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Activity record: event, rootId, threadId, turnId, approvalId, session title | Feed notification row via recordNotification (table not read) | Server; read by other clients | Per notification retention (unknown). |
| Push payload: type, priority, rootId, threadId, approvalId | Not stored beyond delivery | Sent to phone | n/a |

**Models and providers.** None. No model or provider takes part; the text is fixed shared copy.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required on the reporting app and the receiving phone. |
| Permissions | Report only for folders the agent is allowed in on Desktop [apps/desktop/electron/main.ts:2670; agentAccess.ts:23]; CSRF and user-scoped DB on the route [route.ts:17-21]. |
| Subscription | No plan check found in the activity route or the notifier. Remote Control, which gates reporting, needs a paid plan [codeSessionActivity.ts:34; billing-catalog.ts:352]. [inferred] |
| Limits and metering | Rate limit key 'code-session-activity' per user [route.ts:18]; text clipped to 60 characters for the title [agent-notification-service.ts:86-89]; no metering. |
| Feature flags | Preference key 'mobilePushAgentActivity'; push only to Expo (phone) for local sessions. |
| Model compatibility | Not applicable. |
| Provider restrictions | None found in the code (push vendor path not named). |
| Local mode | Needs an account and Remote Control, so nothing is posted in Local mode: the command line only reports in Managed mode [apps/cli/src/remote_control/mod.rs:1337 test; client.rs:368-372]. For Desktop in Local mode: not traced (unknown). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Preference off | Feed entry written, push skipped, response pushed false. | agent-notification-service.ts:382-391 |
| Preference unreadable | Treated as on (fail open). | agent-notification-service.ts:79-84 |
| No registered phone | pushed false because nothing was sent. | agent-notification-service.ts:409 |
| Delivery error | Logged as warning; returns pushed false; session unaffected. | agent-notification-service.ts:410-413; main.ts:2683-2685 |
| Signed out | VS Code posts nothing; route returns 401. | apps/extension-vscode/src/__tests__/codeSessionActivityPost.test.ts; route.test.ts |
| Remote Control stopped mid-report | Second check drops the report. | codeSessionActivity.ts:37 |
| Stopped turn | No alert. | codeSessionActivity.ts:24-27; sessionActivityAlert.ts:13 |
| Flag off on phone | Tap opens notifications list. | apps/mobile/services/notifications.ts:414-418 |
| Accessibility | Not handled in the code beyond platform notification defaults; VS Code uses standard messages. | Looked in apps/extension-vscode/src/features/sidebar-webview/sessionActivityAlert.ts:26-57 and found no accessibility-specific code. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/code/local-sessions/activity/__tests__/route.test.ts`: 401 when signed out; per-user rate limit; CSRF refusal; invalid JSON and unknown event; notifies with the device name, and without it when unknown.
- `packages/platform/utils/src/__tests__/codeSessionActivity.test.ts`: Activity creation (contents not read).
- `apps/extension-vscode/src/__tests__/codeSessionActivityPost.test.ts`: Posts to the account path with the editor token; sends nothing without a session.
- `apps/web/lib/services/__tests__/agent-notification-service.test.ts`: Notifier (contents not read).
- `apps/cli/src/remote_control/mod.rs`: Inline tests 'only_finished_or_blocked_turns_are_reported' and 'an_approval_this_host_waits_on_is_reported_for_the_phone'.

**Test scenarios**

- **Approval push**
  1. Pair Desktop; keep Remote Control on.
  2. Run a turn that asks for approval.
  3. Watch the phone.
  - Expected: Push 'Approval needed' arrives; tap opens the session at the approval.
- **Preference off**
  1. Turn off agent activity push in settings.
  2. Repeat.
  - Expected: No push; the feed has the entry; API answers pushed false.
- **Remote Control off**
  1. Stop Remote Control.
  2. Finish a turn.
  - Expected: No POST to the activity route.
- **Duplicate**
  1. Post the same activity twice.
  - Expected: One feed entry.
- **VS Code unfocused**
  1. Start an approval in VS Code and focus another window.
  - Expected: Warning with Allow once, Deny, Open chat.

**Where to look when it fails**

- Desktop console '[code-session-activity] could not deliver activity:'.
- Server warn '[notifications] local code session notify failed' and '[notifications] could not read agent push preference'.
- Desktop event domain cloud_request outcome failed.
- CLI debug '[remote-control] session activity was not reported'.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md)
- Mobile: [70-qa/test-plans/mobile/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/mobile/068-session-continuity-and-remote-session-product.md)
- CLI: [70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md)
- VS Code: [70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md)

## 10. Gaps and dependencies

- **Reporting stops when Remote Control is off, so a person who never paired gets no alerts for local sessions.** Affects: Desktop, command line, VS Code users. Evidence: codeSessionActivity.ts:34. Work needed: Product decision on a separate alert switch.
- **Brief says command line missing; code reports activity.** Affects: Brief accuracy. Evidence: apps/cli/src/remote_control/mod.rs:621-654. Work needed: Correct the brief; verify live.
- **Local-session pushes go to phones only (web false).** Affects: Web and desktop users. Evidence: agent-notification-service.ts:405. Work needed: Decide whether other clients should get them.
- **Preference read fails open.** Affects: Phone users. Evidence: agent-notification-service.ts:79-84. Work needed: Decide on fail-closed.
- **Phone tap lands on the notifications list while the Remote area is off.** Affects: Mobile v1. Evidence: apps/mobile/services/notifications.ts:414-418. Work needed: Open the session or explain.

**Depends on**

- surface:desktop
- surface:mobile
- surface:vscode
- surface:cli
- surface:web
- mode:cloud
- api:POST /api/code/local-sessions/activity
- table:mobile_devices
- table:user_settings
- table:profiles
- F068-09
- F068-07
- SYS-observability-and-operations
- SYS-sync-and-continuity
- SYS-api-and-contracts
- SYS-authentication-and-identity

## Unknown

- Push vendor and delivery path beyond sendPushToUser (not opened).
- Retention of feed notifications.
- Whether Desktop in Local mode reports activity (not traced).
- Web notifications settings screen that sets the preference (found only by test file name).
- Exact web display of the feed entry.
