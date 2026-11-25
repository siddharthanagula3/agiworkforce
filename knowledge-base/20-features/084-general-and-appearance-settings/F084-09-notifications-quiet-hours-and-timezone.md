---
id: "F084-09"
type: "feature"
title: "Notifications, quiet hours and timezone"
aliases: ["Notifications settings", "Notification channels", "Notification categories", "Quiet hours", "Time and focus", "Break reminder", "Do not disturb", "Timezone", "S84.18", "S84.19", "S84.02"]
area: "84 General and appearance settings"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S84.18", "S84.19", "S84.02"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "api:GET /api/settings/preferences", "api:PUT /api/settings/preferences", "table:user_settings", "store:notification-prefs-store", "SYS-authentication-and-identity", "SYS-sync-and-continuity", "SYS-observability-and-operations", "mode:cloud", "mode:local", "F084-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F084-09 Notifications, quiet hours and timezone

Lets a person choose where each kind of notice goes (web: Off, Email, Browser, Push combinations; mobile: Push or Off per category) and set quiet hours, when non-critical notices are held. Quiet hours are enforced on our servers for push and schedule emails. Timezone is read-only: it follows the device.

Area: [84. General and appearance settings](README.md). Requirement items: [S84.18](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8418), [S84.19](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8419), [S84.02](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8402).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Web and Desktop (hosted page): the 'Notifications' pane has one select per event; the 'Time and focus' pane holds a break reminder and quiet hours (days, start, end) saved to the account. Mobile: 'Notifications' lists categories with a Push or Off state and links to 'Quiet hours' on the 'Time and focus' screen. Servers hold non-critical push and schedule email during the window; critical types are exempt.

**Why it exists.** People want alerts where they will see them and want silence at night. The brief's S84.18 and S84.19 require per-category channels and quiet hours. S84.02 asks for a visible timezone for schedules, reminders and quiet hours.

**Who uses it.** Everyone who uses scheduled tasks, agents or push alerts; people who work across timezones.

**Problems it solves**

- Alerts at the wrong time
- Unwanted email or push for finished tasks
- No way to see which timezone quiet hours use
- Too much time in the app without a break

**Use cases**

- A person sets quiet hours 22:00 to 07:00 on weekdays so a scheduled-task push waits until morning.
- A person sets 'Scheduled task finished' to Email only.
- A person turns off 'Reply ready' browser alerts.
- A person on mobile turns off the 'Tasks' push category.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted): Settings, Notifications (apps/web/features/settings/sections/NotificationsSection.tsx; nav label in packages/ui/ui/src/settings-nav.ts:348).
- Web and Desktop (hosted): Settings, Time and focus (TimeFocusSection.tsx:156; nav label settings-nav.ts:369).
- Desktop Electron also: Settings, Desktop app, General, 'Agent notifications' rows (DesktopSettingsSection.tsx:470-525).
- Mobile: Settings, Notifications (apps/mobile/src/features/settings/screenTitles.ts:4), rows 'Recent notifications', 'Device Permission', 'Notification Types', and 'Quiet hours' (index.tsx:643-662), which opens 'Time and focus' (screenTitles.ts:7).
- Desktop Tauri (retained internal): Settings, Notifications tab with 'Do not disturb' fields (NotificationsSettings.tsx; notification_center.rs:156-160).
- VS Code, Chrome, CLI: no quiet hours or channel settings found (brief marks VS Code and Chrome missing; CLI n/a).

**Before you start**

- Web and Desktop: a signed-in account is needed to load and save; without an owner the pane shows 'Loading account settings...' and stays read-only (NotificationsSection.tsx:178-198, 340-366).
- Mobile: push needs the device permission; if denied, categories show 'Blocked' (index.tsx:411-413). Quiet hours sync only when signed in and in Cloud mode (useTimeFocusSync.ts:30-38).
- Mobile push on web is shown only after the surface is released (surface-status.ts:10).

**Screens and controls**

- Web Notifications: sections 'Reply ready', 'Scheduled task finished' (with link 'Manage tasks'), 'Security alerts', 'Usage', and 'Agent run updates'. Each has a select with 'Off' plus every combination of its channels (NotificationsSection.tsx:46-61, 99-122).
- Web Time and focus: 'Break reminder' select, switch 'Enable quiet hours', day buttons Sunday to Saturday, 'Quiet hours start', 'Quiet hours end', text 'Times use <zone>. These reminders currently apply on the Website.', button 'Save changes' (TimeFocusSection.tsx:243-375).
- Mobile Time and focus: 'Break reminders', 'Enable quiet hours' (Suppress non-critical alerts), 'Days', 'Start time', 'End time' (TimeFocusScreen.tsx:140-290).

**Journey**

1. Web channels: open Settings, Notifications; change an event's select; a status line shows 'Saved' or the error; changes save at once.
2. Web quiet hours: open Time and focus; turn on Enable quiet hours; pick days; set start and end; press Save changes.
3. If no day is chosen or times are equal Save is refused with a message; leaving with unsaved edits asks first.
4. Mobile: open Settings, Notifications; tap a category; choose Push or Off; tap Quiet hours; switch on; pick days and times; changes sync automatically.
5. During the window the website shows a notice 'Quiet hours are active' once per window; servers hold non-critical push and schedule emails until the window ends.

**What the person sees and gets**

- Web Notifications status line: 'Loading account settings...', 'Saved', or error text with 'Retry loading'.
- Web Time and focus status: 'Loading account settings...', 'Saving...', 'Unsaved changes', 'Saved', 'Load failed: ...', 'Save failed: ...'.
- Mobile status line under break reminders (test id time-focus.sync-status) and polite live region.
- Website reminder 'Quiet hours are active' or 'Time for a break?' (TimeFocusReminder.tsx:250-255); mobile alert 'Quiet hours are active' with 'This is a reminder, not a lock.' (apps/mobile/src/features/settings/notifications/TimeFocusReminder.tsx:41).

**Settings**

- notifications namespace keys browserReplyReady, mobilePushScheduleDone, emailScheduleDone, emailSecurityAlerts, pushUsageReset (notification-preferences.ts, all default true)
- time-focus namespace: breakReminderMinutes (30, 60, 120, 240 or off), quietHours {enabled, days, startTime, endTime, timezone}
- Mobile push categories (DEFAULT_CATEGORY_ENABLED; product updates default off)
- Desktop agentNotifications (when, muted kinds, sound, drawAttention)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web channel select stores booleans per channel to the 'notifications' namespace through PUT /api/settings/preferences with CSRF (apps/web/features/settings/services/notification-preferences-client.ts:62-80).
- Mobile push is hidden from web channels until the surface status says released; today status says 'Coming soon' (NotificationsSection.tsx:121-124; apps/web/lib/surface-status.ts:6-13).
- Quiet hours validation: at least one day, valid times, start different from end (TimeFocusSection.tsx:92-109). Overnight windows work (packages/contracts/types/src/time-focus.ts isMinuteWithinQuietHours).
- Timezone: browser zone is detected and saved inside the quiet-hours object, shown as read-only text (TimeFocusSection.tsx:41-43, 375). Mobile uses the device zone (notificationPrefsStore.ts:204, 267).
- Server holds notices: push delivery checks quiet hours per device and exempts four critical types (agent_failed, emergency_stop_triggered, agent_approval_needed, approval_pending_escalation) (apps/web/lib/services/push-notification-service.ts:88-110; packages/contracts/types/src/time-focus.ts:7-13).
- Schedule email is delayed until the window ends and, if the saved quiet hours cannot be read, the notice is held and finally dropped on the last retry (apps/web/lib/jobs/job-handlers.ts:105-190; apps/web/lib/services/quiet-hours-service.ts:16-86).
- Mobile registers its push delivery preferences, including quiet hours and exempt types, with the server (apps/mobile/services/pushPreferenceSync.ts:57-80).
- Web reminder checks the window, remembers a dismissal in session storage, and handles missing storage (apps/web/features/time-focus/TimeFocusReminder.tsx:158-168).
- Security alerts are always shown in-app, including quiet hours (NotificationsSection.tsx:46-61, subheading).

**Incomplete**

- The footer says reminders 'currently apply on the Website', but servers also hold push and schedule email, and mobile shows its own reminder, so the text is outdated for some behaviour (TimeFocusSection.tsx:375 vs job-handlers.ts:111).
- Timezone is not chosen: there is no control, so someone travelling cannot set a zone different from the device (S84.02 'not applicable anywhere').
- Desktop Electron has no quiet-hours rule of its own; its agent notifications use 'Agent notifications' modes only (agentNotifications.ts shouldNotify) [inferred from absence of quiet-hours reads in that file].
- Mobile quiet hours sync only in Cloud mode while signed in; in Local mode they stay on the device (useTimeFocusSync.ts:30-38).

**Present but disconnected or switched off**

- Web 'Mobile push' channel is hidden until the mobile surface is marked released (surface-status.ts:10).
- Desktop Tauri notifications tab and its do-not-disturb belong to the retained internal build.

**Not available**

- Quiet hours and channel settings in VS Code and Chrome.
- A timezone picker on any app.
- Per-channel choices on mobile beyond Push or Off per category (index.tsx:411-413).

## 4. Required behaviour

**Established requirements**

- The user can choose which channels (push, email, in-app/browser) deliver each notification category. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.18)
- The user can set quiet hours during which notifications are held. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.19)
- The user can see and set the timezone used for schedules, reminders and quiet hours. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.02)
- Quiet hours need at least one day and different start and end times; otherwise Save is refused. (source: apps/web/features/settings/sections/TimeFocusSection.tsx:92-109)
- Agent failures, emergency stops and approval requests still come through during quiet hours. (source: apps/mobile/src/features/settings/notifications/TimeFocusScreen.tsx:200-203; packages/contracts/types/src/time-focus.ts:7-13)
- A channel is shown only when its surface is released. (source: apps/web/features/settings/sections/NotificationsSection.tsx:121-124)

**Acceptance criteria**

1. Web: each event select offers Off and every combination of its visible channels; choosing one saves and survives reload.
2. Web: Save changes is refused when no day is picked or start equals end, with the message shown.
3. Web: leaving Time and focus with unsaved edits asks before discarding.
4. Server: with quiet hours enabled and the clock inside the window, a non-critical push is not delivered and a schedule email waits until the window ends; a critical type is delivered.
5. Mobile: Quiet hours switch, days and times save and appear on a second signed-in phone after sync.
6. Web: timezone text shows the browser's zone and has no control.
7. Failed load or save shows an error and a retry path without losing local edits.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The footer text should name every place quiet hours apply, since servers also use them [inferred].
- A person travelling should be able to set the timezone used for quiet hours [inferred from S84.02].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a timezone select that writes quiet-hours.timezone and is used by server hold logic (the server already reads timezone from the saved object).
- [proposed] Update the footer text to match enforcement.
- [proposed] Add a quiet-hours control on VS Code and Chrome, or record why not.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | NotificationsSection | `apps/web/features/settings/sections/NotificationsSection.tsx` | Per-event channel selects, load, save, retry. |
| service | notification-preferences-client | `apps/web/features/settings/services/notification-preferences-client.ts` | Reads and PUTs the 'notifications' namespace. |
| config | NOTIFICATION_DEFAULTS | `apps/web/features/settings/lib/notification-preferences.ts` | Five channel keys, default true. |
| config | SURFACE_STATUS | `apps/web/lib/surface-status.ts` | Which surfaces count as released; hides Mobile push. |
| screen | TimeFocusSection | `apps/web/features/settings/sections/TimeFocusSection.tsx` | Break reminder and quiet hours form. |
| component | TimeFocusReminder (web) | `apps/web/features/time-focus/TimeFocusReminder.tsx` | In-page quiet-hours and break nudges. |
| config | time-focus contract | `packages/contracts/types/src/time-focus.ts` | Namespace name, break minutes, exempt types, window maths. |
| endpoint | /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | GET and PUT of namespaces in user_settings. |
| table | user_settings | `apps/web/lib/services/quiet-hours-service.ts` | Row read by server for quiet hours (select settings -> namespace). |
| service | quiet-hours-service | `apps/web/lib/services/quiet-hours-service.ts` | quietHoursEndFor, heldByQuietHours, unreadable-error handling. |
| service | push-notification-service | `apps/web/lib/services/push-notification-service.ts` | deviceAcceptsNotice applies quiet hours per device. |
| job | schedule email job handlers | `apps/web/lib/jobs/job-handlers.ts` | Delay schedule email until quiet hours end. |
| service | schedule-notification-service | `apps/web/lib/services/schedule-notification-service.ts` | Marks the quiet-hours type of a schedule notice. |
| endpoint | mobile push-token route | `apps/web/app/api/mobile/push-token/__tests__/route.test.ts` | Test of the endpoint that receives mobile delivery preferences (route directory app/api/mobile/push-token). |
| screen | Mobile Notifications screen | `apps/mobile/src/features/settings/notifications/index.tsx` | Permission card, category list, Quiet hours row. |
| screen | Mobile category detail | `apps/mobile/src/features/settings/notifications/NotificationCategoryDetailScreen.tsx` | Per-category push choice. |
| screen | Mobile TimeFocusScreen | `apps/mobile/src/features/settings/notifications/TimeFocusScreen.tsx` | Break reminders and quiet hours. |
| hook | useTimeFocusSync | `apps/mobile/src/features/settings/notifications/useTimeFocusSync.ts` | Syncs time-focus to the account in Cloud mode. |
| store | notificationPrefsStore | `apps/mobile/stores/notificationPrefsStore.ts` | Device store 'notification-prefs-store' for categories and quiet hours. |
| service | pushPreferenceSync | `apps/mobile/services/pushPreferenceSync.ts` | Sends delivery preferences incl. quiet hours to the server. |
| component | Mobile TimeFocusReminder | `apps/mobile/src/features/settings/notifications/TimeFocusReminder.tsx` | Alert 'Quiet hours are active'. |
| component | DesktopSettingsSection agent notifications | `apps/web/features/desktop-host/components/DesktopSettingsSection.tsx` | Desktop agent notification modes and kinds (line 470). |
| service | Tauri notification_center | `apps/desktop/src-tauri/src/sys/commands/notification_center.rs` | Retained build do-not-disturb window and delivery plan. |
| config | settings nav | `packages/ui/ui/src/settings-nav.ts` | Labels 'Notifications' and 'Time and focus'. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: pane resolves the signed-in owner, then GET /api/settings/preferences loads the notifications namespace. | device and our servers | notification-preferences-client.ts:50-60 |
| Person changes a select; the client validates keys are known booleans and sends PUT with CSRF. | device and our servers | notification-preferences-client.ts:62-80 |
| Server merges the patch into user_settings. | our servers | route.ts:83-90, 177-181 |
| Web quiet hours: Save changes sends the time-focus object, including the browser timezone. | device and our servers | TimeFocusSection.tsx:111-125 |
| When a schedule notice or push is due, the server reads the user's time-focus quiet hours and holds or sends. | our servers | quiet-hours-service.ts:50-86; job-handlers.ts:105-190; push-notification-service.ts:88-110 |
| Mobile: category and quiet-hours changes go to the device store; a debounced job registers delivery preferences with the server push token endpoint, and time-focus is saved to the account in Cloud mode. | device and our servers | pushPreferenceSync.ts:24-25, 57-80; useTimeFocusSync.ts:50-78 |
| Page or app checks the window and shows a one-time reminder. | device | TimeFocusReminder.tsx:158-168; mobile TimeFocusReminder.tsx:33-45 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| notifications namespace and time-focus namespace | Table user_settings, column settings, per namespace | Yes, account level, read by web, Desktop hosted page and mobile | Kept until changed; deletion with account is outside this feature (unknown). |
| Mobile categories and quiet hours | Phone store 'notification-prefs-store' | Quiet hours and break minutes to the account in Cloud mode; delivery preferences to the push-token registration | Device data until cleared. |
| Dismissal of the quiet-hours nudge | Browser session storage (key from quietDismissalKey) | No | Ends with the tab session. |
| Desktop agent notification preferences | settings.json in user data | No | Kept on the computer. |

**Models and providers.** None. No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and Desktop hosted panes need a signed-in account to load and save. Mobile local settings work without one; account sync needs sign-in and Cloud mode. Desktop agent notifications need no account. |
| Permissions | Browser notification permission for web alerts (BrowserNotificationStatus); phone push permission; OS notification permission on Desktop. |
| Subscription | No plan limit was seen in the files read. |
| Limits and metering | Rate limit 'settings-activity' on GET and PUT of preferences, and 'settings-org-patch' on PUT (route.ts:136, 180). Values not opened. |
| Feature flags | SURFACE_STATUS hides Mobile push on web while mobile is 'Coming soon'. No other flag found. |
| Model compatibility | Not model dependent. |
| Provider restrictions | None for choosing channels. Push delivery uses the platform push services through our servers [inferred]; provider folder not opened. |
| Local mode | Mobile Local mode: categories and quiet hours stay on the device and the account sync is skipped because it needs Cloud mode (useTimeFocusSync.ts:30-38). Server-held delivery needs the Cloud account. Desktop Electron agent notifications work with no account. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Status 'Loading account settings...' and controls disabled. | NotificationsSection.tsx:340-366; TimeFocusSection.tsx:141-155 |
| Load failed | Error text and 'Retry loading' (notifications); 'Load failed: ...' with locked form (time and focus). | NotificationsSection.tsx:223-232, 363-369; TimeFocusSection.tsx:56-72 |
| Save failed | Notifications: latest preferences are reloaded and a message asks the person to review; Time and focus: 'Save failed: ...' and form stays dirty. | NotificationsSection.tsx:286-302; TimeFocusSection.tsx:121-126 |
| Unsaved edits | Leaving the pane asks to discard. | TimeFocusSection.tsx:129-133 |
| Invalid quiet hours | Messages 'Choose at least one quiet-hours day.', 'Enter both a start and an end time.', 'Choose different start and end times.' | TimeFocusSection.tsx:92-109 |
| Owner changes while open | Pending work is retired and the state resets. | NotificationsSection.tsx:152-166 |
| Saved quiet hours unreadable on the server | The notice is held; the schedule email is dropped on the final retry with reason quiet_hours_unreadable_expired. | job-handlers.ts:171-190; quiet-hours-service.ts:20-41 |
| Session storage unavailable | The nudge shows once for that mount. | TimeFocusReminder.tsx:164-168 |
| Push permission denied (mobile) | Categories show 'Blocked' and cannot be opened. | index.tsx:411-420 |
| Offline, reconnect | Mobile sync shows status 'error' with 'Could not save time and focus settings. Check your connection and try again.'; automatic retry not confirmed. | useTimeFocusSync.ts:76-80 |
| Accessibility | Day buttons use aria-pressed with full day names; switch labelled; mobile status is a polite live region. | TimeFocusSection.tsx:285-300; TimeFocusScreen.tsx:60-90 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/NotificationsSection.lifetime.test.tsx`: Owner changes and request lifetime.
- `apps/web/features/settings/sections/NotificationsSection.grouping.test.tsx`: Event and channel grouping.
- `apps/web/features/settings/sections/NotificationsSection.permission.test.tsx`: Browser permission display.
- `apps/web/features/settings/sections/NotificationsSection.density.test.tsx`: Layout density.
- `apps/web/features/settings/services/notification-preferences-client.test.ts`: Client read and write rules.
- `apps/web/features/settings/sections/TimeFocusSection.test.tsx`: Quiet hours form.
- `apps/web/features/time-focus/TimeFocusReminder.test.tsx`: Web reminder.
- `apps/web/lib/services/__tests__/quiet-hours-service.test.ts`: Server hold logic.
- `apps/web/lib/services/__tests__/push-notification-service.test.ts`: Push delivery decisions.
- `apps/web/lib/services/__tests__/schedule-notification-service.test.ts`: Schedule notices.
- `apps/web/lib/jobs/__tests__/job-handlers.test.ts`: Job handlers incl. quiet hours.
- `packages/contracts/types/src/__tests__/time-focus.test.ts`: Window maths and normalisation.
- `apps/mobile/__tests__/TimeFocusScreen.test.tsx`: Mobile Time and focus screen.
- `apps/mobile/__tests__/TimeFocusSyncOwnership.test.tsx`: Sync ownership.
- `apps/mobile/__tests__/NotificationCategorySettings.test.tsx`: Category settings.
- `apps/mobile/__tests__/push-preference-sync.test.ts`: Delivery preference registration.
- `apps/desktop/src/features/settings/__tests__/CloudAccountSections.test.tsx`: Tauri build cloud account sections incl. time focus.

**Test scenarios**

- **Channel choice persists**
  1. Sign in on web; open Notifications.
  2. Set 'Scheduled task finished' to Off.
  3. Reload.
  - Expected: Select still shows Off; status 'Saved' appeared after the change.
- **Quiet hours validation**
  1. Open Time and focus, enable quiet hours, clear all days, press Save changes.
  - Expected: Message 'Choose at least one quiet-hours day.' and nothing saved.
- **Held notice**
  1. Set quiet hours to include the current time.
  2. Trigger a scheduled task that finishes.
  - Expected: No immediate email or push for non-critical status; delivered after the window ends. A failed agent notice still arrives.
- **Timezone is read-only**
  1. Open Time and focus and read the footer.
  - Expected: Text 'Times use <browser zone>.' with no control to change it.
- **Mobile quiet hours sync**
  1. Phone in Cloud mode, signed in: enable quiet hours with days and times.
  2. Open Time and focus on web.
  - Expected: Same days and times show on web.
- **Mobile Local mode**
  1. Phone in Local mode: change quiet hours.
  - Expected: Saved on device; sync status shows local.

**Where to look when it fails**

- Web: error text from toUserMessage in the status lines.
- Server log '[quiet-hours] could not read quiet hours; holding the notice' and metric failure 'notification' / 'quiet_hours_unreadable' (quiet-hours-service.ts:30-36).
- Job result skipped 'quiet_hours_unreadable' (job-handlers.ts:188).
- Table user_settings, settings -> 'time-focus' and 'notifications'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/084-general-and-appearance-settings.md](../../70-qa/test-plans/web/084-general-and-appearance-settings.md)
- Desktop: [70-qa/test-plans/desktop/084-general-and-appearance-settings.md](../../70-qa/test-plans/desktop/084-general-and-appearance-settings.md)
- Mobile: [70-qa/test-plans/mobile/084-general-and-appearance-settings.md](../../70-qa/test-plans/mobile/084-general-and-appearance-settings.md)

## 10. Gaps and dependencies

- **No timezone control; the brief's 'set the timezone' is unmet.** Affects: Web, Desktop, Mobile people who travel or use a different zone. Evidence: TimeFocusSection.tsx:41-43, 375. Work needed: Add a select bound to quietHours.timezone, validated by isValidIanaTimeZone.
- **Footer says 'currently apply on the Website', but servers and mobile also apply quiet hours.** Affects: All people reading the text. Evidence: TimeFocusSection.tsx:375; job-handlers.ts:111; pushPreferenceSync.ts. Work needed: Reword.
- **Quiet hours missing on VS Code and Chrome.** Affects: VS Code and Chrome users. Evidence: Brief S84.19. Work needed: Decide scope.
- **Web Mobile push channel hidden until release.** Affects: Web users who use the phone app. Evidence: surface-status.ts:10. Work needed: Update the surface status when mobile ships (owner call).
- **Desktop Electron has no quiet hours for its own agent notifications.** Affects: Desktop users. Evidence: agentNotifications.ts has no quiet-hours input [inferred]. Work needed: Confirm and decide.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- api:GET /api/settings/preferences
- api:PUT /api/settings/preferences
- table:user_settings
- store:notification-prefs-store
- SYS-authentication-and-identity
- SYS-sync-and-continuity
- SYS-observability-and-operations
- mode:cloud
- mode:local
- F084-08

## Unknown

- Whether Desktop Electron's own notification path ever reads quiet hours.
- Values of the rate limits named settings-activity and settings-org-patch.
- Whether mobile retries a failed time-focus save automatically.
- How mobile local reminders honour quiet hours outside push (not traced).
- Which auth check wraps the preferences route beyond getUserScopedDb (not read in detail).
- No test was run here.
