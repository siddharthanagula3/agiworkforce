---
id: "F084-08"
type: "feature"
title: "Sound effects and haptics"
aliases: ["Sound Effects", "Notification sound", "soundEnabled", "sound_enabled", "Haptic Feedback", "hapticsEnabled", "Haptics", "S84.16", "S84.17"]
area: "84 General and appearance settings"
available_on: ["desktop", "mobile"]
implementation: {web: "missing", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S84.16", "S84.17"]
depends_on: ["surface:mobile", "surface:desktop", "store:settings-store", "file:apps/mobile/src/shared/utils/haptics.ts", "file:apps/desktop/electron/agentNotifications.ts", "F084-09", "SYS-voice-and-media", "SYS-observability-and-operations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F084-08 Sound effects and haptics

Mobile has a 'Haptic Feedback' switch that gates touch vibrations app-wide. Desktop has two sound controls that work on notifications only: 'Notification sound' (public Electron app, agent notifications) and 'Sound Effects' (retained Tauri build, OS notification sound). No interface-sound setting exists on web, CLI, VS Code or Chrome.

Area: [84. General and appearance settings](README.md). Requirement items: [S84.16](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8416), [S84.17](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8417).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Mobile: one switch turns haptic pulses on button presses, copy actions, approvals and many other taps on or off. Desktop (Electron): a switch decides whether agent notifications play the system sound. Desktop (Tauri, retained internal code): a switch decides whether notifications carry the system sound.

**Why it exists.** Some people find vibration or sound distracting, or work where noise is not allowed. The brief's S84.16 and S84.17 ask for control of interface sounds and haptics.

**Who uses it.** Phone users who dislike vibration; desktop users who run agents in the background and want quiet or audible alerts.

**Problems it solves**

- Unwanted vibration on every button
- Unwanted notification sound during meetings
- Silent agent alerts being missed (sound on)

**Use cases**

- A person on a train turns Haptic Feedback off on the phone.
- A person in a meeting turns Notification sound off in Desktop settings.
- A person leaves sound on so a finished agent task is heard.

## 2. User experience

**Where to find it**

- Mobile: Settings, General, switch 'Haptic Feedback' (apps/mobile/src/features/settings/general/index.tsx:142-147).
- Desktop (Electron): Settings, group Desktop app, 'General', section 'General desktop settings', switch 'Notification sound' with hint 'Play the system sound with agent notifications.' (apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:179-181, 506-514; nav label in packages/ui/ui/src/settings-nav.ts:296).
- Desktop (Tauri build, retained internal): Settings, Notifications tab, switch 'Sound Effects' with hint 'Play sounds for message received and task completion' (apps/desktop/src/features/settings/NotificationsSettings.tsx:122-130).
- Web, CLI, VS Code, Chrome: no sound or haptic control found.

**Before you start**

- Mobile: none; the setting is local.
- Desktop Electron: the preference appears only when the shell reports agent notification preferences; otherwise the older rows 'Task finished alerts' and 'Approval alerts' show instead (DesktopSettingsSection.tsx:400-438).
- Notification sound switch is disabled while 'Agent notifications' is set to 'Never' (DesktopSettingsSection.tsx:506-512).

**Screens and controls**

- Mobile switch 'Haptic Feedback' with a vibrate icon (default on).
- Desktop Electron switches under 'Agent notifications': 'Approval requests', 'Questions', 'Finished turns', 'Failed turns', 'Notification sound', and 'Draw attention' where offered.
- Desktop Tauri switches: enable all, 'Desktop Notifications', 'Sound Effects'.

**Journey**

1. Mobile: open Settings, then General; flip Haptic Feedback; press any Button and feel (or not) the pulse.
2. Desktop Electron: open Settings, then Desktop app, General; set Agent notifications to a mode other than Never; flip Notification sound; start an agent that finishes while Desktop is in the background.

**What the person sees and gets**

- Mobile: haptic pulse present or absent on actions.
- Desktop: notification arrives with or without the system sound.
- Desktop settings page: error line 'That setting was not saved.' if the shell refuses the write (DesktopSettingsSection.tsx:41, 257-259).

**Settings**

- hapticsEnabled (mobile, default true)
- agentNotifications.sound (Desktop Electron)
- soundEnabled (Desktop Tauri build)
- Related: Notifications and quiet hours, F084-09

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mobile switch writes hapticsEnabled in the settings store, persisted in device storage (apps/mobile/stores/settingsStore.ts:45, 123, 144, 166-170).
- Button press haptic is skipped when off (apps/mobile/components/ui/Button.tsx:54-60). Copy action haptic is skipped when off (apps/mobile/src/shared/hooks/useCopyAction.ts:31, 52). Approval modal checks it (apps/mobile/src/shared/components/ApprovalModal.tsx:63-69).
- A shared helper, preferredImpactHaptic and preferredNotificationHaptic, checks the setting before calling the haptics library (apps/mobile/src/shared/utils/haptics.ts:4-12). Files that call the library directly (for example voice.tsx, schedules/index.tsx) read hapticsEnabled themselves.
- Desktop Electron: agent notifications are created with silent set to the opposite of preference sound (apps/desktop/electron/agentNotifications.ts:279).
- Desktop Tauri: delivery plan sets sound to settings.sound_enabled and not quiet (apps/desktop/src-tauri/src/sys/commands/notification_center.rs:608-617). The draft claim that no code reads soundEnabled is wrong for this build.

**Incomplete**

- Desktop Tauri switch hint says 'sounds for message received and task completion', but the code only adds the platform default sound to a delivered OS notification (notification_center.rs:600-617). No in-app sound for message received was found [inferred from the delivery plan being the only reader].
- Haptics: the library import list could not be fully proven gated; static check found all non-helper importers read hapticsEnabled or use the helper (grep of apps/mobile), but runtime coverage is not tested.

**Present but disconnected or switched off**

- Tauri notifications tab belongs to the retained internal build, not the public Desktop (AGENTS.md section 5).

**Not available**

- Interface sound effects (clicks, send sounds) on any app: none found.
- Sound or haptic setting on web, CLI, VS Code, Chrome.
- Haptic setting on desktop (no haptics hardware path found).

## 4. Required behaviour

**Established requirements**

- The user can turn interface sound effects on or off. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.16)
- On devices with haptics, the user can turn haptic feedback on or off. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.17)
- When haptics are off the mobile app skips the pulse on button presses, copy actions and approval actions. (source: apps/mobile/components/ui/Button.tsx:54-60; apps/mobile/src/shared/hooks/useCopyAction.ts:52; apps/mobile/src/shared/components/ApprovalModal.tsx:69)

**Acceptance criteria**

1. Mobile: with Haptic Feedback off, pressing Buttons, copying text and approving a step cause no pulse.
2. Mobile: with it on, the same actions pulse.
3. Mobile: the choice survives an app restart.
4. Desktop Electron: with Notification sound off, an agent notification arrives silent; with it on, it plays the system sound.
5. Desktop Electron: with Agent notifications set to Never, the sound switch is off and disabled.
6. Desktop Tauri build: with Sound Effects off, a delivered notification has no sound; Do-not-disturb also silences it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A person turning haptics off expects no haptic from any screen, including voice and schedules [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether a general interface-sound setting is wanted at all; if not, correct S84.16 to say 'notification sound only'.
- [proposed] Fix the Tauri hint to describe notification sound exactly.
- [proposed] Add a test that fails when a file calls the haptics library without the setting check.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | GeneralSettingsScreen | `apps/mobile/src/features/settings/general/index.tsx` | Mobile 'Haptic Feedback' switch (line 142). |
| store | settingsStore | `apps/mobile/stores/settingsStore.ts` | hapticsEnabled, setHapticsEnabled, persisted under 'settings-store' in device storage. |
| component | Button | `apps/mobile/components/ui/Button.tsx` | Gated press haptic. |
| hook | useCopyAction | `apps/mobile/src/shared/hooks/useCopyAction.ts` | Gated success or error haptic after copy. |
| component | ApprovalModal | `apps/mobile/src/shared/components/ApprovalModal.tsx` | Gated approval haptic. |
| service | preferredImpactHaptic and preferredNotificationHaptic | `apps/mobile/src/shared/utils/haptics.ts` | Single helper that checks the setting. |
| screen | voice screen | `apps/mobile/app/(app)/voice.tsx` | Reads hapticsEnabled for voice actions (lines 191, 387, 411). |
| screen | schedules list | `apps/mobile/app/(app)/schedules/index.tsx` | Reads hapticsEnabled (line 56, 104). |
| component | DesktopSettingsSection | `apps/web/features/desktop-host/components/DesktopSettingsSection.tsx` | Hosted page rows incl. 'Notification sound' (AgentNotificationRows, line 506). |
| service | agentNotifications | `apps/desktop/electron/agentNotifications.ts` | Creates agent notifications with silent from preferences.sound (line 279). |
| service | settingsStore and garnishCore (Electron) | `apps/desktop/electron/settingsStore.ts` | Reads and writes settings.json in userData; normalizes agentNotifications. |
| config | HostAgentNotificationPreferences | `packages/contracts/local-runtime/src/host-bridge.ts` | Contract of host preferences including agent notifications. |
| command | writeHostPreferences | `apps/desktop/electron/main.ts` | Applies agentNotifications writes durably (lines ~2192-2196). |
| screen | NotificationsSettings (Tauri) | `apps/desktop/src/features/settings/NotificationsSettings.tsx` | Retained build switch 'Sound Effects' (line 122-130). |
| service | notification_center | `apps/desktop/src-tauri/src/sys/commands/notification_center.rs` | NotificationSettings.sound_enabled and delivery_plan (lines 148, 608-617). |
| service | desktop-command-client notifications | `packages/client/desktop-command-client/src/notifications.ts` | TypeScript shape of NotificationSettings with soundEnabled. |
| test | SettingsStore test | `apps/mobile/__tests__/SettingsStore.test.tsx` | setHapticsEnabled toggles the flag (line 126). |
| test | agentNotifications test | `apps/desktop/electron/__tests__/agentNotifications.test.ts` | Agent notification rules incl. sound preference. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Mobile: person flips the switch; the store sets hapticsEnabled and writes to device storage. | device | settingsStore.ts:144, 166-170 |
| Mobile: each action checks the flag, then calls the haptics library or skips. | device | Button.tsx:54-60; haptics.ts:4-12 |
| Desktop Electron: page calls the host bridge writePreferences with an agentNotifications patch. | device | DesktopSettingsSection.tsx:208-226 |
| The shell normalizes and saves it to settings.json durably; if the write fails the change is refused with 'The setting could not be saved on this computer, so it was not changed.' | device | main.ts:2192-2196; settingsStore.ts:62-74 |
| When an agent event occurs the shell checks mode and muted kinds, then creates the notification with silent equal to not sound. | device | agentNotifications.ts:269-281 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| hapticsEnabled | Phone device storage, key 'settings-store' | No; not in the account sync mapping (apps/mobile/services/cloudSettingsMapping.ts has no haptics entry) | Kept until app data is cleared. |
| agentNotifications (incl. sound) | settings.json in the Desktop user data folder | No | Kept on that computer. |
| soundEnabled (Tauri build) | Tauri notification settings (storage location not opened; unknown) | unknown | unknown |

**Models and providers.** None.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not required on any app for these switches. |
| Permissions | Mobile: no permission needed for haptics. Desktop: OS notification permission governs whether notifications appear at all; the app's own permission section is separate (DesktopPermissionsSection). |
| Subscription | No plan limit was seen; no entitlement check found. |
| Limits and metering | none found in the code |
| Feature flags | none found for haptics. Desktop Electron shows the notification rows only when the shell supplies agentNotifications (DesktopSettingsSection.tsx:400). |
| Model compatibility | Not model dependent. |
| Provider restrictions | None. |
| Local mode | Fully works; every setting is on the device and needs no server or sign-in. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Device without haptics | The library call is made when the switch is on; handling of hardware without haptics is not handled in app code (library behaviour unknown). | haptics.ts:4-12 |
| Agent notifications set to Never | Sound switch shows off and is disabled. | DesktopSettingsSection.tsx:506-512 |
| Shell write fails | Error line 'That setting was not saved.' and the setting stays unchanged. | DesktopSettingsSection.tsx:41, 257-259; settingsStore.ts:62-74 |
| Settings page cannot read from the shell | Error 'These settings could not be read from the app.' | DesktopSettingsSection.tsx:40, 242-244 |
| Do-not-disturb active (Tauri build) | No OS notification and no sound; badge still counts. | notification_center.rs:604-617 |
| Web, CLI, VS Code, Chrome | No sound or haptic setting: not handled in the code. | Searched apps/web/features/settings, apps/extension*, apps/cli; no match |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/SettingsStore.test.tsx`: setHapticsEnabled toggling.
- `apps/mobile/__tests__/LiveVoiceBar.test.tsx`: Voice bar with hapticsEnabled false.
- `apps/mobile/src/shared/hooks/__tests__/useCopyAction.test.tsx`: Copy action hook.
- `apps/desktop/electron/__tests__/agentNotifications.test.ts`: Agent notification decisions including sound in preferences.
- `apps/desktop/electron/__tests__/hostPreferences.test.ts`: Host preference reads and writes.
- `apps/web/features/desktop-host/__tests__/DesktopSettingsSection.test.tsx`: The hosted desktop settings rows.
- `apps/desktop/src/features/settings/NotificationsSettings.test.tsx`: Tauri notifications tab (soundEnabled in fixture).
- `apps/desktop/src-tauri/src/sys/commands/notification_center.rs`: Rust unit tests on settings defaults and delivery with sound_enabled false (lines 750, 822, 988).

**Test scenarios**

- **Haptics off**
  1. Mobile: Settings, General, turn Haptic Feedback off.
  2. Press a Button, copy a message, approve a tool step.
  - Expected: No haptic pulse in all three.
- **Haptics persist**
  1. Turn it off, force-close and reopen the app.
  - Expected: Switch still off.
- **Notification sound off**
  1. Desktop: Settings, Desktop app, General.
  2. Set Agent notifications to 'Always', Notification sound off.
  3. Finish an agent turn.
  - Expected: Notification shows without system sound.
- **Never mode**
  1. Set Agent notifications to 'Never'.
  - Expected: Notification sound and kind switches become disabled and show off.
- **Unwired haptic scan**
  1. Search apps/mobile for imports of the haptics library.
  2. Check each calls the helper or reads the flag.
  - Expected: No ungated call.

**Where to look when it fails**

- Desktop: console warning '[settings] could not persist settings.json:' (settingsStore.ts:62).
- Mobile: warning '[settingsStore] Hydration failed:' (settingsStore.ts line near 176).
- Tauri build: do_not_disturb_reason and delivery_plan in notification_center.rs.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/084-general-and-appearance-settings.md](../../70-qa/test-plans/desktop/084-general-and-appearance-settings.md)
- Mobile: [70-qa/test-plans/mobile/084-general-and-appearance-settings.md](../../70-qa/test-plans/mobile/084-general-and-appearance-settings.md)

## 10. Gaps and dependencies

- **No general interface sound effects setting exists; only notification sound.** Affects: All apps. Evidence: Only agentNotifications.sound and soundEnabled found. Work needed: Decide scope; update S84.16 and the brief.
- **Brief and draft say the desktop switch does nothing; code shows it is read.** Affects: Documentation accuracy. Evidence: notification_center.rs:615; agentNotifications.ts:279. Work needed: Correct the brief rows.
- **Tauri switch text promises more than the code does.** Affects: Retained Tauri build. Evidence: NotificationsSettings.tsx:124-126 vs notification_center.rs:608-617. Work needed: Reword or implement.
- **Haptics do not follow the account.** Affects: People with several phones. Evidence: cloudSettingsMapping.ts has no haptics. Work needed: Decide if it should sync.
- **No web or other app sound setting.** Affects: Web, CLI, VS Code, Chrome. Evidence: No controls found. Work needed: Only if product wants it (CLI has a bell option in config, config.rs:1355-1359, outside this item).
- Not built on: Web, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:mobile
- surface:desktop
- store:settings-store
- file:apps/mobile/src/shared/utils/haptics.ts
- file:apps/desktop/electron/agentNotifications.ts
- F084-09
- SYS-voice-and-media
- SYS-observability-and-operations

## Unknown

- Where the Tauri build stores its notification settings (not opened).
- Whether the retained Tauri build is shipped to anyone; AGENTS.md calls it internal.
- Hardware behaviour when haptics are unsupported.
- No test was run here.
