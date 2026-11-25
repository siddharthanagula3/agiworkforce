---
id: "F042-10"
type: "feature"
title: "Break reminders and Time and focus settings"
aliases: ["Break reminders (S42.22)", "Time and focus (S42.23)", "Time & focus", "Quiet hours settings", "time-focus namespace", "TimeFocusReminder"]
area: "42 Proactive assistance, briefings, and reflection"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S42.22", "S42.23"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "mode:cloud", "mode:local", "api:GET /api/settings/preferences", "api:PUT /api/settings/preferences", "table:user_settings", "store:notificationPrefsStore", "store:focusActivityStore", "F042-07", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F042-10 Break reminders and Time and focus settings

One settings page for break reminders and quiet hours. After a chosen amount of active time per day (30, 60, 120 or 240 minutes) the app shows one break nudge. Quiet hours hold routine notices and show a one-time nudge on opening. Settings sync to the account; the active-time counter stays on each device.

Area: [42. Proactive assistance, briefings, and reflection](README.md). Requirement items: [S42.22](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4222), [S42.23](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4223).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Saves two optional boundaries in the account: a break reminder length and quiet hours (days, start, end, time zone). The web chat page and the phone app count visible active time and show a break nudge; quiet hours also gate server push and email (packages/contracts/types/src/time-focus.ts:1-30; apps/web/lib/services/quiet-hours-service.ts:70-85).

**Why it exists.** The brief wants a reminder to take a break after a chosen amount of use (S42.22) and one Time and focus page that holds break reminders and quiet hours (S42.23).

**Who uses it.** Anyone who wants healthier use or fewer interruptions, on web, desktop settings and mobile.

**Problems it solves**

- Long unbroken use.
- Notices at night or on chosen days.
- Having to set quiet hours in several places.

**Use cases**

- Set a 60 minute break reminder.
- Hold notices from 22:00 to 08:00 on weekdays.
- Open the app in quiet hours and get a gentle note with a way back.
- Keep the same settings on phone and web.

## 2. User experience

**Where to find it**

- Web: Settings, 'Time and focus' (apps/web/features/settings/components/WebSettingsModal.tsx:299; page route apps/web/app/settings/time-focus/page.tsx; e2e name apps/web/e2e/settings-search.spec.ts:135).
- Mobile: Settings, row 'Time and focus', and Settings, Notifications, 'Quiet hours' row which opens it (apps/mobile/src/features/settings/index.tsx:698-701; apps/mobile/src/features/settings/notifications/index.tsx:640-662).
- Desktop internal Tauri build: cloud settings, section titled 'Time and focus' (apps/desktop/src/features/settings/cloud/CloudTimeFocusSection.tsx:143; DesktopCloudSettingsModal.tsx:142,1244). The public Desktop shows the hosted web app (doc: AGENTS.md section 5), so web behaviour applies there [inferred].
- CLI, VS Code, Chrome: not available.

**Before you start**

- To sync: signed-in cloud account and, on mobile, Cloud mode (apps/mobile/src/features/settings/notifications/useTimeFocusSync.ts:28-36).
- The reminder dialog on web needs a signed-in user id (TimeFocusReminder.tsx:124-129).

**Screens and controls**

- Web: select 'Break reminder' (Off or 30/60/120/240 minutes); switch 'Enable quiet hours'; seven day buttons; 'Quiet hours start' and 'Quiet hours end' time fields; 'Save changes' (TimeFocusSection.tsx:181-199,243-355,387).
- Mobile: 'Break reminders' dropdown, status line, 'Quiet hours' switch with day circles and start and end time pickers (TimeFocusScreen.tsx:127-203).
- Reminder dialogs: web 'Time for a break?' and 'Quiet hours are active' with 'Come back later' and 'Continue in AGI' (TimeFocusReminder.tsx:249-260); mobile alerts with 'Continue in AGI' (TimeFocusReminder.tsx:13-16).

**Journey**

1. 1. Open Time and focus.
2. 2. Choose a break length and, optionally, turn on quiet hours with days and times.
3. 3. Web: press 'Save changes'; mobile: each change syncs on its own.
4. 4. While using the app, the device adds up visible active time.
5. 5. At the chosen length a break dialog appears once; choose 'Continue in AGI' or 'Come back later'.
6. 6. In quiet hours, opening the app shows a quiet-hours note once per window.

**What the person sees and gets**

- Web status line 'Loading account settings...', 'Saving...', 'Unsaved changes', 'Saved' (TimeFocusSection.tsx:134-141).
- Validation text: 'Choose at least one quiet-hours day.', 'Enter both a start and an end time.', 'Choose different start and end times.' (TimeFocusSection.tsx:94-106).
- Save error: 'Save failed' with the message (TimeFocusSection.tsx:117-121).
- Mobile status: 'Saved on this device. Use AGI Cloud to share with web and desktop.', 'Synced with web and desktop.' (TimeFocusScreen.tsx:83-91).
- Note under quiet hours: 'Agent failures, emergency stops and approval requests still come through.' (TimeFocusScreen.tsx:202).

**Settings**

- Namespace 'time-focus' in user_settings: breakReminderMinutes and quietHours {enabled, days, startTime, endTime, timezone} (packages/contracts/types/src/time-focus.ts:18-30).
- Device-only counters: web localStorage key prefix agi:time-focus:activity:v1: and sessionStorage prefix agi:time-focus:quiet:v1: (TimeFocusReminder.tsx:31-32); mobile store focus-activity-store (apps/mobile/src/features/settings/notifications/focusActivityStore.ts:35).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Allowed break lengths are the fixed list 30, 60, 120, 240 minutes; any other value normalizes to off (packages/contracts/types/src/time-focus.ts:2,233-245).
- Web counts visible-tab time every 15 seconds in localStorage, per account and per day in the quiet-hours time zone, capped at 24 hours (TimeFocusReminder.tsx:169-207).
- Web shows the break dialog once the day's time reaches the length unless that length was dismissed (TimeFocusReminder.tsx:192-198); closing the dialog records the dismissal (lines 209-230).
- Quiet-hours nudge shows once per window and is remembered in sessionStorage (TimeFocusReminder.tsx:156-167,211-217).
- Web save checks days, times and different start and end, then stores the namespace (TimeFocusSection.tsx:93-114); the reminder adopts a save made in the same page without reload (TimeFocusReminder.tsx:143-153).
- Mobile counts AppState active time, shows an alert once the length is reached, and marks the break dismissed when shown (TimeFocusReminder.tsx:46-70).
- Mobile works unsynced in Local mode and syncs the namespace in Cloud mode (useTimeFocusSync.ts:28-36; test: apps/mobile/__tests__/TimeFocusScreen.test.tsx:212).
- Quiet hours also gate server push and email except for four urgent types (packages/contracts/types/src/time-focus.ts:6-14; apps/web/lib/services/quiet-hours-service.ts:70-85).

**Incomplete**

- The web reminder is mounted in one place, the chat page (apps/web/features/chat/pages/WebChatPage.tsx:7987); no other mount found in apps/web, so time spent on other pages is not counted and no break dialog shows there [inferred].
- Active-time counters are per device and never sync, so web and phone count separately (TimeFocusReminder.tsx:31; focusActivityStore.ts).

**Present but disconnected or switched off**

- apps/desktop/src has only the settings section for Time and focus, no reminder component (grep of TimeFocusReminder in apps/desktop found only a test and the section).

**Not available**

- CLI, VS Code, Chrome: no break reminders or Time and focus page (brief S42.22, S42.23).

## 4. Required behaviour

**Established requirements**

- The product reminds the user to take a break after a chosen amount of use. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.22)
- A Time & focus settings page holds break reminders and quiet hours. (source: S42.23 (same brief))
- Reminders never lock the user out of the product. (source: apps/web/features/settings/sections/TimeFocusSection.tsx:159 (code, as copy))

**Acceptance criteria**

1. Choosing 60 minutes and using the chat page for 60 visible minutes in one day shows one break dialog; closing it stops further dialogs for that length that day.
2. A hidden tab does not add time.
3. Saving quiet hours with no day, a missing time, or equal start and end is refused with the message.
4. Saving a valid change shows 'Saved' and a second device reads the same values.
5. Opening the app inside a quiet-hours window shows the nudge once for that window.
6. A success notice is held during quiet hours while a failure or approval notice is not.
7. On mobile in Local mode the page says settings are saved on this device and still shows reminders.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Quiet-hours days are evaluated in the saved time zone, with overnight windows belonging to the start day [inferred from packages/contracts/types/src/__tests__/time-focus.test.ts:23-38].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Mount the reminder app-wide on web, not only on the chat page.
- [proposed] Sync or merge active time across devices if one daily total is wanted.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | time-focus contract | `packages/contracts/types/src/time-focus.ts` | Break lengths, exempt types, normalize, window helpers. |
| component | TimeFocusSection (web) | `apps/web/features/settings/sections/TimeFocusSection.tsx` | Settings page and validation. |
| component | TimeFocusReminder (web) | `apps/web/features/time-focus/TimeFocusReminder.tsx` | Activity timer and dialogs. |
| component | WebChatPage mount | `apps/web/features/chat/pages/WebChatPage.tsx` | Mounts the reminder (line 7987). |
| endpoint | GET and PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Reads and writes the namespace (lines 252-253; namespace pattern line 28). |
| service | preferences client | `apps/web/app/settings/_lib/preferences-client.ts` | fetch and save namespace and saved event. |
| service | quiet-hours-service | `apps/web/lib/services/quiet-hours-service.ts` | Server enforcement of quiet hours. |
| service | push-notification-service | `apps/web/lib/services/push-notification-service.ts` | Applies the hold to push (lines 289-291). |
| screen | TimeFocusScreen (mobile) | `apps/mobile/src/features/settings/notifications/TimeFocusScreen.tsx` | Mobile page. |
| component | TimeFocusReminder (mobile) | `apps/mobile/src/features/settings/notifications/TimeFocusReminder.tsx` | Timer and alerts; mounted in apps/mobile/app/(app)/(tabs)/_layout.tsx:7. |
| hook | useTimeFocusSync | `apps/mobile/src/features/settings/notifications/useTimeFocusSync.ts` | Cloud-mode sync of the namespace. |
| store | focusActivityStore | `apps/mobile/src/features/settings/notifications/focusActivityStore.ts` | Per-day active time on the phone. |
| store | notificationPrefsStore | `apps/mobile/stores/notificationPrefsStore.ts` | quietHours and breakReminderMinutes state. |
| component | CloudTimeFocusSection (desktop internal) | `apps/desktop/src/features/settings/cloud/CloudTimeFocusSection.tsx` | Settings section only. |
| table | user_settings | `apps/web/lib/services/quiet-hours-service.ts` | Stores settings['time-focus'] (lines 41-52). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The page loads the namespace from the account; defaults use the device time zone. | device and our servers | apps/web/features/settings/sections/TimeFocusSection.tsx:54; apps/web/app/api/settings/preferences/route.ts:140-160 |
| Save validates in the browser, then writes the normalized namespace. | device and our servers | TimeFocusSection.tsx:93-114 |
| The running reminder reads the namespace and the same-page save event. | device | TimeFocusReminder.tsx:124-154 |
| A timer adds visible seconds to local storage and opens the dialog at the threshold. | device | TimeFocusReminder.tsx:169-207 |
| Separately, the server reads the namespace before sending push or email and holds non-urgent notices in the window. | our servers | apps/web/lib/services/quiet-hours-service.ts:70-85 |
| Mobile applies its own quiet-hours and break logic from the local store and pulls or pushes the namespace in Cloud mode. | device and our servers | useTimeFocusSync.ts:100-140 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Break length and quiet-hours schedule | table:user_settings, key 'time-focus'; phone copy in store:notificationPrefsStore | Yes in Cloud (web, desktop, mobile Cloud mode) | Kept with account settings; cleared by app data removal on the phone |
| Daily active time and dismissed length | Browser localStorage on web; store:focusActivityStore on phone | No | Reset when the date key changes; stays until storage is cleared |
| Quiet-hours dismissal | Browser sessionStorage; phone store field quietWindowAcknowledged | No | Session end on web |

**Models and providers.** No model or provider is used.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Needs sign-in to save to the account on web and desktop; mobile works without sign-in on the device only. |
| Permissions | Writes only the user's own settings namespace. Notification permission is separate (F042-07). |
| Subscription | No plan gate found. |
| Limits and metering | Fixed break lengths 30, 60, 120, 240 minutes; active time capped at 24 hours per day (time-focus.ts:2; TimeFocusReminder.tsx:35). Preferences writes use optimistic version checks (apps/web/app/settings/_lib/preferences-client.ts:176-222). |
| Feature flags | none found in the code |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code |
| Local mode | Mobile Local mode keeps settings on the device and still shows break and quiet-hours reminders; no payment or sign-in gate (apps/mobile/__tests__/TimeFocusScreen.test.tsx:212; useTimeFocusSync.ts:28-36). Server-side holding of notices applies only to Cloud notices. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading account settings...' and controls locked. | TimeFocusSection.tsx:134 |
| Load or save error | 'Load failed' or 'Save failed' with message; mobile shows retry text. | TimeFocusSection.tsx:65-66,117-121; useTimeFocusSync.ts error strings |
| Unsaved leave | Warns that changes will be lost. | TimeFocusSection.tsx:130 |
| Storage blocked | Reminder still works for the mount; malformed local data resets to zero. | TimeFocusReminder.tsx:79-81,161-165 |
| Hidden tab or app in background | No time counted. | TimeFocusReminder.tsx:183; mobile TimeFocusReminder.tsx:46 |
| Day change | Counter resets by date key in the saved time zone. | TimeFocusReminder.tsx:66; focusActivityStore.ts:25-37 |
| Quiet-hours settings unreadable on server | Holds or defers the notice rather than treating quiet hours as off. | quiet-hours-service.ts:20-34,71-79 |
| Account switch | Web counters are keyed by user; mobile sync cancels on owner change. | TimeFocusReminder.tsx:45-47; useTimeFocusSync.ts:33-47 |
| Different dismissal timing | Mobile marks the break dismissed when shown; web marks it when the dialog closes. | mobile TimeFocusReminder.tsx:62-63; web TimeFocusReminder.tsx:209-230 |
| Accessibility | Day buttons labelled; mobile day circles have 44 point tap areas; status line is a polite live region. | TimeFocusSection.tsx:283; TimeFocusScreen.tsx:162 and test line 305 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/time-focus/TimeFocusReminder.test.tsx`: Quiet nudge once per window, come-back-later, threshold nudge and dismissal, adopting saved threshold, hidden-tab time, malformed storage.
- `apps/web/features/settings/sections/TimeFocusSection.test.tsx`: Load, save, validation, failure surface.
- `apps/web/lib/services/__tests__/quiet-hours-service.test.ts`: Server hold, urgent exemption, unreadable settings.
- `packages/contracts/types/src/__tests__/time-focus.test.ts`: Window maths, weekday and overnight rules, normalization.
- `apps/mobile/__tests__/TimeFocusScreen.test.tsx`: Break dropdown, quiet-hours controls, Local mode text, save error.
- `apps/mobile/__tests__/TimeFocusSyncOwnership.test.tsx`: Sync ownership across accounts.
- `apps/mobile/src/features/settings/__tests__/SettingsMediaTimeFocusRows.test.tsx`: Settings rows.
- `apps/desktop/src/features/settings/__tests__/CloudAccountSections.test.tsx`: Desktop cloud sections including Time and focus.

**Test scenarios**

- **Break nudge**
  1. Set 30 minutes and use the web chat page with the tab visible for 30 minutes.
  2. Close the dialog.
  3. Keep using.
  - Expected: One dialog 'Time for a break?'; none again that day for 30 minutes.
- **Validation**
  1. Turn on quiet hours with no day selected and press 'Save changes'.
  - Expected: 'Choose at least one quiet-hours day.'; nothing saved.
- **Sync**
  1. Save quiet hours on web.
  2. Open the phone app in Cloud mode and view Time and focus.
  - Expected: Same values and 'Synced with web and desktop.'
- **Hold a success notice**
  1. Set quiet hours covering now.
  2. Finish a scheduled run successfully.
  - Expected: No push; email held until the window ends.
- **Local mode phone**
  1. Switch to Local mode and open Time and focus.
  - Expected: 'Saved on this device. Use AGI Cloud to share with web and desktop.'

**Where to look when it fails**

- Server log '[quiet-hours] could not read quiet hours; holding the notice' and metric failure notification quiet_hours_unreadable (quiet-hours-service.ts:32-34).
- Browser localStorage keys agi:time-focus:activity:v1:*.
- Mobile status line values local, loading, synced, saving, error (useTimeFocusSync.ts:25).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md)
- Desktop: [70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md)
- Mobile: [70-qa/test-plans/mobile/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/mobile/042-proactive-assistance-briefings-and-reflection.md)

## 10. Gaps and dependencies

- **Web reminder mounts only on the chat page.** Affects: Web users on other pages. Evidence: apps/web/features/chat/pages/WebChatPage.tsx:7987 is the only mount found. Work needed: Mount at the app shell or document the limit.
- **Active time does not sync between devices.** Affects: People using several devices. Evidence: TimeFocusReminder.tsx:31; focusActivityStore.ts. Work needed: Decide whether per-device counting is intended.
- **No reminder component in apps/desktop/src; the internal desktop has only settings.** Affects: Internal Tauri desktop users. Evidence: CloudTimeFocusSection.tsx; search results. Work needed: Confirm Electron shows the web reminder and, if the Tauri build ships, add one.
- **CLI, VS Code and Chrome have neither break reminders nor quiet-hours holding.** Affects: Those apps. Evidence: audit/partial/042-proactive-assistance-briefings-and-reflection.md S42.16, S42.22, S42.23. Work needed: Scope decision per surface.
- **Dismissal timing differs between web and mobile.** Affects: Consistency. Evidence: see states. Work needed: Align to one rule.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- mode:cloud
- mode:local
- api:GET /api/settings/preferences
- api:PUT /api/settings/preferences
- table:user_settings
- store:notificationPrefsStore
- store:focusActivityStore
- F042-07
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-shared-ui-and-design

## Unknown

- Whether the Electron Desktop shows the web reminder (inferred from AGENTS.md only).
- Labels used by the mobile break dropdown (breakReminderChoiceLabel not read).
- How the mobile notification gate uses quiet hours (shouldNotify body not read).
- Whether any server job other than push and email reads quiet hours.
- Whether the web reminder appears on pages outside chat via another component.
