---
id: "F042-06"
type: "feature"
title: "Quiet hours"
aliases: ["Quiet hours", "Time and focus", "Do not disturb window", "S42.16", "S42.23 (settings page)"]
area: "42 Proactive assistance, briefings, and reflection"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S42.16"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "mode:local", "F042-01", "SYS-observability-and-operations", "SYS-sync-and-continuity", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "table:user_settings", "table:mobile_devices", "store:notificationPrefsStore", "api:POST /api/mobile/push-token"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F042-06 Quiet hours

Quiet hours is a saved schedule of days and times. When on, the server drops routine push notices inside the window and delays routine schedule emails until it ends. Failed runs and approval requests are exempt. If the saved hours cannot be read, push is queued for retry and email is retried. Set on web, desktop and mobile.

Area: [42. Proactive assistance, briefings, and reflection](README.md). Requirement items: [S42.16](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4216).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stops routine proactive notices, such as 'Scheduled task finished', from alerting the person at night or other chosen times.

**Why it exists.** Item S42.16: during quiet hours the product holds proactive notifications and nudges (doc: knowledge-base/data/area-briefs/042-proactive-assistance-briefings-and-reflection.md).

**Who uses it.** Anyone who receives scheduled-run notices.

**Problems it solves**

- A 07:00 brief or a night run buzzes the phone at the wrong time.
- Email arrives while asleep.
- The person still needs urgent failures and approvals.

**Use cases**

- Quiet weeknights 22:00 to 08:00.
- Weekend quiet all day.
- A failed run still alerts at night.

## 2. User experience

**Where to find it**

- Web: Settings > 'Time and focus' > 'Quiet hours' (apps/web/features/settings/components/WebSettingsModal.tsx:299; sections/TimeFocusSection.tsx:233).
- Desktop (Tauri build): Settings 'Time and focus' (apps/desktop/src/features/settings/cloud/CloudTimeFocusSection.tsx:143).
- Mobile: Settings > Notifications > 'Quiet hours' row (On or Off) opens the 'Time and focus' screen (apps/mobile/src/features/settings/notifications/index.tsx:643-662; TimeFocusScreen.tsx:198).
- CLI, VS Code, Chrome: not available.

**Before you start**

- Signed in for server-side effect; mobile Local mode keeps the setting on the device (TimeFocusScreen test: 'says in Local Mode that the settings stay on this device').

**Screens and controls**

- Switch 'Enable quiet hours'; day buttons Sunday to Saturday; fields 'Quiet hours start' and 'Quiet hours end'; button 'Save changes' (web) (TimeFocusSection.tsx:243-387).
- Mobile: Days, start and end time pickers 'Quiet hours start time' and 'Quiet hours end time'; accessibility label '<day> quiet hours'.

**Journey**

1. Open Time and focus.
2. Turn on Enable quiet hours.
3. Choose days and the start and end times.
4. Save (web) or change (mobile syncs after edits).
5. From then on the server holds routine notices in the window.

**What the person sees and gets**

- Web message 'Choose at least one quiet-hours day.' (TimeFocusSection.tsx:94); text 'Times use <timezone>. These reminders currently apply on the Website.' (line 375).
- Defaults 22:00 to 08:00, off, no days (time-focus.ts:219-231).
- Mobile app alert 'Quiet hours are active' with 'This is a reminder, not a lock.' (TimeFocusReminder.tsx:36).

**Settings**

- Break reminder (same page, a separate feature in this area).
- Per-schedule notification toggles (F042-01).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Preferences namespace 'time-focus' with quiet hours, saved from web, desktop and mobile (time-focus.ts:1; useTimeFocusSync.ts:67).
- Server push: sendPushToUser checks account quiet hours and returns no delivery inside the window (push-notification-service.ts:281-292).
- Exempt types never held: agent_failed, emergency_stop_triggered, agent_approval_needed, approval_pending_escalation (time-focus.ts:6-11). Schedule failures, timeouts and approvals map to exempt types (schedule-notification-service.ts:82-88); only a success notice is held.
- Device-level check also applies each phone's own quietHours from its push preferences (push-notification-service.ts:92-113; mobile-push.ts:24).
- Email: completion email is queued to run after the quiet window ends (job-handlers.ts:106-128) and a held email is re-queued with runAfter (job-handlers.ts:191-199).
- Unreadable quiet hours: push is queued as 'notifications.deferred-push' and retried; on the final attempt it is dropped (push-notification-service.ts:304-326,333-352; job-handlers.ts:351).
- The in-app notice is recorded regardless of quiet hours (schedule-notification-service.ts:155).

**Incomplete**

- Held push is dropped, not delivered later; the brief says 'holds' (push-notification-service.ts:289-290).
- Web page text says the reminders apply on the Website, while the server also uses the setting for phone push (TimeFocusSection.tsx:375; push-notification-service.ts:281-292).
- Quiet hours cover schedule notices; other proactive nudges are outside the files read.

**Present but disconnected or switched off**

- Schedule push goes only to Expo phones; browser push is switched off for schedule notices (schedule-notification-service.ts:184).

**Not available**

- CLI, VS Code and Chrome quiet hours (brief S42.16 missing; no code found).

## 4. Required behaviour

**Established requirements**

- During quiet hours the product holds proactive notifications and nudges (S42.16). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.16)
- A Time and focus settings page holds break reminders and quiet hours (S42.23). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.23)
- Failures, approvals and emergency stops are exempt from quiet hours. (source: packages/contracts/types/src/time-focus.ts:6-11)

**Acceptance criteria**

1. With quiet hours on and now inside the window, a successful schedule run sends no phone push.
2. The same run still appears in the in-app notice list.
3. A failed run inside the window still pushes.
4. With email on, the success email is sent after the window ends, not before.
5. Saving with no day chosen shows 'Choose at least one quiet-hours day.'
6. Start equal to end is rejected.
7. If the saved hours are unreadable, a routine push is queued and no failure is shown to the person.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Overnight windows (22:00 to 08:00) span two dates and use the saved timezone [inferred from time-focus.ts:188-198].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Deliver a held push when the window ends, as email already does.
- [proposed] Correct the 'apply on the Website' copy.
- [proposed] Offer quiet hours in the CLI and Chrome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | time-focus preferences | `packages/contracts/types/src/time-focus.ts` | Namespace, defaults, exempt types, window math (lines 1-231). |
| service | quiet-hours-service | `apps/web/lib/services/quiet-hours-service.ts` | Reads settings, heldByQuietHours, quietHoursEndFor, unreadable error. |
| service | push-notification-service | `apps/web/lib/services/push-notification-service.ts` | Account hold, per-device check, Expo send, deferred push. |
| job | announceScheduleCompletion and email job | `apps/web/lib/jobs/job-handlers.ts` | Queues email after quiet end; deferred-push handler (lines 98-215, 351). |
| service | schedule-notification-service | `apps/web/lib/services/schedule-notification-service.ts` | scheduleQuietHoursType, notice copy, push and email. |
| service | notification-service recordNotification | `apps/web/lib/services/notification-service.ts` | In-app notice recorded outside quiet hours rules (line 107). |
| component | TimeFocusSection | `apps/web/features/settings/sections/TimeFocusSection.tsx` | Web quiet hours form. |
| component | CloudTimeFocusSection | `apps/desktop/src/features/settings/cloud/CloudTimeFocusSection.tsx` | Desktop quiet hours form. |
| screen | TimeFocusScreen | `apps/mobile/src/features/settings/notifications/TimeFocusScreen.tsx` | Mobile quiet hours screen. |
| hook | useTimeFocusSync | `apps/mobile/src/features/settings/notifications/useTimeFocusSync.ts` | Syncs quiet hours to the account preference namespace. |
| store | notificationPrefsStore | `apps/mobile/stores/notificationPrefsStore.ts` | Device copy of quiet hours. |
| component | TimeFocusReminder (mobile) | `apps/mobile/src/features/settings/notifications/TimeFocusReminder.tsx` | In-app 'Quiet hours are active' alert. |
| schema | MobilePushPreferences | `packages/contracts/cloud-contracts/src/mobile-push.ts` | Per-device quietHours in push preferences (line 24). |
| endpoint | POST /api/mobile/push-token | `apps/web/app/api/mobile/push-token/route.ts` | Stores device token and push_preferences. |
| table | mobile_devices | `apps/web/lib/services/push-notification-service.ts` | push_token and push_preferences per device (line 121). |
| table | user_settings | `apps/web/lib/services/quiet-hours-service.ts` | settings column keyed by the time-focus namespace (line 48). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person saves quiet hours; the app writes the 'time-focus' preference namespace to the account. | device and our servers | apps/mobile/src/features/settings/notifications/useTimeFocusSync.ts:67; apps/web/features/settings/sections/TimeFocusSection.tsx:94-141 |
| A schedule run finishes and a completion job records an in-app notice, then asks to push and, if email is on, queues the email. | our servers | apps/web/lib/jobs/job-handlers.ts:98-150; schedule-notification-service.ts:139-180 |
| Push: the server reads quiet hours from user_settings. Inside the window and not exempt, it returns without sending. | our servers | apps/web/lib/services/quiet-hours-service.ts:48-83; push-notification-service.ts:289-290 |
| Outside the window, each phone is also checked against its own quiet hours before the Expo request. | our servers | apps/web/lib/services/push-notification-service.ts:92-130 |
| The Expo push service delivers to the phone. | outside service | apps/web/lib/services/push-notification-service.ts:25 |
| Email: the job computes when the quiet window ends and queues the email job to run after it. | our servers | apps/web/lib/jobs/job-handlers.ts:106-128 |
| If hours are unreadable, push is queued for retry and email is retried; on the last attempt push is dropped and email is skipped. | our servers | push-notification-service.ts:304-352; job-handlers.ts:177-190 |
| On the phone, an in-app alert reminds the person the window is active. | device | apps/mobile/src/features/settings/notifications/TimeFocusReminder.tsx:29-38 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Quiet hours (enabled, days, start, end, timezone) | table:user_settings under namespace 'time-focus'; phone copy in store:notificationPrefsStore | Yes through the account preference namespace | Kept until changed; mobile Local mode keeps it only on the device. |
| Per-device push preferences including quietHours | table:mobile_devices.push_preferences | Sent on push-token registration | Token cleared when Expo reports DeviceNotRegistered (push-notification-service.ts:136-150). |
| Deferred push and email jobs | Job queue (enqueueJob); table name not opened | Server only | Unknown. |

**Models and providers.** No model is involved. Push uses the Expo push service; email uses the configured mail provider (name not read).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in for server holding. Mobile Local mode keeps the setting on the device and sends nothing. |
| Permissions | Preference writes are the signed-in user's own. |
| Subscription | none found in the code; no plan gate in the quiet hours path. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | not applicable. |
| Provider restrictions | Phone push depends on Expo; browser push is excluded for schedule notices (schedule-notification-service.ts:184). |
| Local mode | Mobile Local mode: settings saved on the device only; no server notices exist in Local mode; the in-app 'Quiet hours are active' alert still shows. CLI, VS Code, Chrome: not available. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No day chosen | Save blocked with 'Choose at least one quiet-hours day.' | TimeFocusSection.tsx:94 |
| Same start and end | Save blocked as an ambiguous range. | TimeFocusSection.tsx:105; TimeFocusSection.test.tsx:90 |
| Save failed | 'Save failed' prefix message; mobile shows the error. | TimeFocusSection.tsx:120; TimeFocusScreen.test.tsx:228 |
| Settings unreadable | Push queued then dropped after the final attempt; email retried then skipped. | push-notification-service.ts:304-352; job-handlers.ts:177-190 |
| Enabled but invalid saved schedule | Treated as unreadable, not as off. | quiet-hours-service.ts:56-62 |
| Urgent notice | Sent without reading preferences. | quiet-hours-service.ts:66-83 |
| Offline phone | not handled in the code beyond Expo delivery. | No code found. |
| Accessibility | Labels on switch, days and time fields. | TimeFocusSection.tsx:243-353; TimeFocusScreen.tsx (day labels) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/quiet-hours-service.test.ts`: Hold read once, urgent never delayed, unreadable and invalid settings raise an error, never-saved is open, urgent failures exempt (cases lines 47-124).
- `apps/web/lib/services/__tests__/push-notification-service.test.ts`: Holds a routine notice inside quiet hours, delivers urgent types, applies the quiet-hours type to the device, device-level hold (cases lines 356-622).
- `apps/web/lib/services/__tests__/schedule-notification-service.test.ts`: Schedule notice quiet-hours type; matched by search, cases not read.
- `apps/web/lib/jobs/__tests__/job-handlers.test.ts`: Email deferral job; matched by search, cases not read.
- `apps/web/features/settings/sections/TimeFocusSection.test.tsx`: Load and save of one namespace, unsaved and saving states, ambiguous range rejected, switch-off saved, failure shown (lines 32-165).
- `apps/mobile/__tests__/TimeFocusScreen.test.tsx`: Mobile quiet hours and break reminder controls, Local mode note, save error (lines 127-247).
- `packages/contracts/types/src/__tests__/time-focus.test.ts`: Window math; matched by name, cases not read.
- `apps/web/app/api/mobile/push-token/__tests__/route.test.ts`: Push token route including quiet hours; matched by search, cases not read.

**Test scenarios**

- **Routine push held**
  1. Enable quiet hours covering now.
  2. Let a schedule succeed.
  - Expected: No phone push; the in-app notice exists.
- **Failure exempt**
  1. Same window; make a run fail.
  - Expected: Push arrives.
- **Email deferred**
  1. Turn on schedule email; inside window finish a run.
  - Expected: Email job runs at the window end.
- **Validation**
  1. Enable with no day; Save.
  - Expected: 'Choose at least one quiet-hours day.'
- **Unreadable settings**
  1. Corrupt the saved quiet-hours value in a test account.
  - Expected: Push is queued as deferred; log '[quiet-hours] could not read quiet hours; holding the notice'.

**Where to look when it fails**

- Log '[quiet-hours] could not read quiet hours; holding the notice' and metric failure 'quiet_hours_unreadable'.
- Delivery metric reason 'quiet_hours_unreadable_expired'.
- Job kinds 'notifications.deferred-push' and 'email.schedule-completed'.
- Tables user_settings and mobile_devices.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md)
- Desktop: [70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md)
- Mobile: [70-qa/test-plans/mobile/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/mobile/042-proactive-assistance-briefings-and-reflection.md)

## 10. Gaps and dependencies

- **Held push is dropped, not delivered after the window.** Affects: Mobile users with routine schedule notices.. Evidence: push-notification-service.ts:289-290. Work needed: Queue a push at quiet end like email, or document the drop.
- **Web copy says reminders apply on the Website; server also enforces for phone push.** Affects: Web and desktop users.. Evidence: TimeFocusSection.tsx:375; push-notification-service.ts:281-292. Work needed: Correct the copy.
- **No quiet hours on CLI, VS Code, Chrome.** Affects: Those apps.. Evidence: Brief S42.16 missing; no code found.. Work needed: Decide whether those surfaces need it.
- **Browser push is excluded for schedule notices.** Affects: Web users.. Evidence: schedule-notification-service.ts:184. Work needed: Confirm intent.
- **Two stores (account and per-device) can differ.** Affects: Mobile.. Evidence: quiet-hours-service.ts:48; push-notification-service.ts:92-113. Work needed: Single source or a sync check.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- mode:local
- F042-01
- SYS-observability-and-operations
- SYS-sync-and-continuity
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- table:user_settings
- table:mobile_devices
- store:notificationPrefsStore
- api:POST /api/mobile/push-token

## Unknown

- Table that holds queued jobs.
- Which mail provider sends schedule email.
- Whether other proactive nudges (not schedule notices) honour quiet hours.
- How the public Electron Desktop shows this page (hosted web app per AGENTS.md; Tauri file read here).
- Whether a phone's per-device quiet hours always equal the account's.
