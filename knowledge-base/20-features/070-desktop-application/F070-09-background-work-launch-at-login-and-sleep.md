---
id: "F070-09"
type: "feature"
title: "Background work, launch at login and sleep"
aliases: ["Run on startup", "Launch at Login", "Open at login", "Running on this Mac", "Background activity", "Keep computer awake", "preventSleepWhileRunning", "S70.24", "S70.25", "S70.32"]
area: "70 Desktop application"
available_on: ["desktop"]
implementation: {web: "n/a", desktop: "partial", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S70.24", "S70.25", "S70.32"]
depends_on: ["surface:desktop", "SYS-observability-and-operations", "SYS-agents-tools-and-automation", "F070-07", "F070-08", "file:apps/desktop/electron/launchAtLogin.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F070-09 Background work, launch at login and sleep

AGI Desktop lets the user choose to start at login, see what runs in the background and stop each item, and keep the computer from idle sleep while an agent runs. Sleep and lock handling is partial: some services react to suspend, wake or lock, but there is no general pause and resume of agent work.

Area: [70. Desktop application](README.md). Requirement items: [S70.24](../../10-requirements/capabilities/070-desktop-application.md#s7024), [S70.25](../../10-requirements/capabilities/070-desktop-application.md#s7025), [S70.32](../../10-requirements/capabilities/070-desktop-application.md#s7032).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the user control over start at login, a list of background work (coding runtimes, commands, computer use, Remote Control, Chrome bridge) with Stop buttons, and a keep-awake setting.

**Why it exists.** An app that keeps agents and phone links running must show what is active, let the user end it without quitting, and avoid being cut off by idle sleep.

**Who uses it.** AGI Desktop users on macOS who run long coding sessions or routines.

**Problems it solves**

- Not knowing what the app is still running
- A run killed by idle sleep
- Forgetting to start the app after a restart

**Use cases**

- Turn on Run on startup
- Stop a stuck command from the background list
- Keep the Mac awake during a long agent run
- Let a phone-connected session keep the computer awake

## 2. User experience

**Where to find it**

- Settings > General (key 'desktop', heading 'General desktop settings'): row 'Run on startup' ('Start Desktop when you log in to this computer.') (apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:43, :49).
- Same page: row 'Keep computer awake' (DesktopSettingsSection.tsx:60-62).
- Same page: section 'Running on this Mac' (BackgroundActivitySection.tsx:19; mounted at DesktopSettingsSection.tsx:448).
- Menu: 'Launch at Login' checkbox in the app-name menu on macOS and in the File menu elsewhere (apps/desktop/electron/appMenu.ts:141, :221).
- Quit prompt lists running work (apps/desktop/electron/quitGuard.ts:20-56).

**Before you start**

- surface:desktop only. Settings page needs the shell to expose preferences (DesktopSettingsSection.tsx).

**Screens and controls**

- Switch 'Run on startup'.
- Switch 'Keep computer awake', with the hint that the display can still turn off and closing the lid still sleeps.
- 'Running on this Mac' rows: 'CLI in <folder>' (working or waiting), each command, 'Computer use', 'Remote control', and a read-only 'Chrome bridge' row; each stoppable row has a 'Stop' button (BackgroundActivitySection.tsx:100-195).
- Empty text: 'Nothing is running in the background.'

**Journey**

1. 1. Open Settings > General.
2. 2. Switch 'Run on startup' on; the shell asks 'Open <product> at login?' with 'Cancel' and 'Open at login' (main.ts:2060-2070).
3. 3. The OS login item is set and the result is read back; the switch follows the OS answer (launchAtLogin.ts:22-28).
4. 4. Scroll to 'Running on this Mac'; press 'Stop' on a row.
5. 5. Optionally switch on 'Keep computer awake'.

**What the person sees and gets**

- Switch states follow what the OS reports.
- The list refreshes on window focus and on session, computer-use, remote-control and browser-pairing events (BackgroundActivitySection.tsx:62-80).
- Errors: 'What is running could not be read from the app.' and 'That was not stopped.' (BackgroundActivitySection.tsx:23-24).

**Settings**

- launchAtLogin, preventSleepWhileRunning in settings.json (settingsStore.ts:18)
- Routine 'keepAwake' per local routine (localRoutineEngine.ts:556)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Launch at login uses the OS login item and reads it back; the stored value follows the OS (launchAtLogin.ts:12-28; syncLaunchAtLogin at main.ts:2631).
- Turning it on from Settings is confirmed in main; turning it off is not (main.ts:2185-2190).
- Background list: coding runtimes tracked when the CLI starts, running shell commands, computer-use phase, Remote Control status, Chrome bridge paired flag (backgroundActivity.ts:47-67).
- Stop: coding-runtime, command, computer-use and remote-control kinds (backgroundActivity.ts:69-95).
- Keep-awake: holds 'prevent-app-suspension' while the preference is on and a coding turn runs, or whenever a phone is connected; released when none (main.ts:1696-1712; workKeeper.ts:28-31).
- Local routines may hold the computer awake per routine (localRoutineService.ts:102-107).
- Sleep and lock reactions that do exist: the unreachable-screen retry tries again on wake (screenRetry.ts:4; main.ts:318-323); local routines cancel active runs as 'interrupted' on suspend and do not replay them, and resume scheduling on wake (localRoutineService.ts:232-233; localRoutineEngine.ts:460-474); skill capture stops on lock or suspend (skillCapture.ts:164-175); a locked screen refuses phone approvals that need the computer (remoteControlService.ts:132).

**Incomplete**

- There is no pause and resume of agent turns or terminals on sleep or lock; only the services above react.
- The menu toggle changes the login item without the confirmation the Settings toggle asks for (appMenu.ts:28-34).

**Present but disconnected or switched off**

- The brief marks S70.32 'missing'; the services above show it is partial, not absent.

**Not available**

- surface:web, surface:mobile, surface:cli, surface:vscode, surface:chrome for these controls.
- Linux and Windows builds are not produced (electron-builder.yml:80).

## 4. Required behaviour

**Established requirements**

- The user can choose to start the app automatically at login. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.24)
- The user can see and control what the desktop app keeps running in the background. (source: S70.25 in the same brief)
- The app reacts to sleep, wake and screen lock (pauses or resumes work, keeps the machine awake for long tasks). (source: S70.32 in the same brief (status: desktop missing))
- Turning launch at login on is asked in main; turning it off is not. (source: docs/decisions/wire-or-cut.md:759)
- Keep-awake stops idle sleep only; the display can turn off and a closed lid still sleeps. (source: apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:61)

**Acceptance criteria**

1. Switching 'Run on startup' on shows the confirmation; Cancel leaves it off.
2. After setting it, System Settings login items shows the app; removing it there makes the switch read off at next read.
3. A running command appears under 'Running on this Mac' and Stop ends it.
4. Stopping Remote Control from the list returns it to idle.
5. With 'Keep computer awake' on and a coding turn running, the Mac does not idle-sleep; with it off it can.
6. With a phone connected the Mac stays awake regardless of the switch.
7. Suspending the Mac while a local routine runs records the run as interrupted and does not replay it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] 'Stopped' items are only those the app itself tracks; the Chrome bridge row has no Stop and says to unpair under Capabilities (BackgroundActivitySection.tsx:185-190).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Confirm the login item from the menu path as the Settings path does.
- [proposed] Pause agent turns on lock or suspend and resume on wake, or state clearly that they continue.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | launchAtLogin | `apps/desktop/electron/launchAtLogin.ts` | Reads and sets the OS login item; syncs the stored preference. |
| component | app menu Launch at Login | `apps/desktop/electron/appMenu.ts` | Menu checkbox that changes the login item. |
| service | preference handler | `apps/desktop/electron/main.ts` | Confirms and applies launchAtLogin; builds the work keeper; wake retry. |
| service | backgroundActivity | `apps/desktop/electron/runtime/backgroundActivity.ts` | Reads and stops background work. |
| service | workKeeper | `apps/desktop/electron/workKeeper.ts` | Decides and holds the power-save block. |
| service | localRoutineService | `apps/desktop/electron/runtime/localRoutineService.ts` | Suspend and resume hooks and per-routine keep-awake. |
| service | localRoutineEngine | `apps/desktop/electron/runtime/localRoutineEngine.ts` | Marks interrupted runs on suspend; resumes scheduling. |
| service | screenRetry | `apps/desktop/electron/screenRetry.ts` | Retries the unreachable screen on wake, reconnect and backoff. |
| service | skillCapture | `apps/desktop/electron/runtime/skillCapture.ts` | Stops capture on lock or suspend. |
| service | quitGuard | `apps/desktop/electron/quitGuard.ts` | Quit prompt listing running work. |
| component | BackgroundActivitySection | `apps/web/features/desktop-host/components/BackgroundActivitySection.tsx` | The 'Running on this Mac' list. |
| component | DesktopSettingsSection | `apps/web/features/desktop-host/components/DesktopSettingsSection.tsx` | Switches for startup and keep-awake. |
| store | settingsStore | `apps/desktop/electron/settingsStore.ts` | settings.json in user data. |
| command | background_activity / background_stop | `apps/desktop/electron/runtime/dispatcher.ts` | Runtime commands; stopBackgroundWork is called at line 2651. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The user flips a switch; the page writes the preference to the shell. | device | DesktopSettingsSection.tsx:294-296 |
| Main confirms (turn on), sets the OS login item and reads it back. | device | main.ts:2185-2190; launchAtLogin.ts:22-28 |
| The Background list reads trackers and states and renders rows. | device | backgroundActivity.ts:47-67 |
| Stop calls the stop function for that kind. | device | backgroundActivity.ts:69-95 |
| Work keeper holds or releases the OS power-save block as turns start and end. | device | main.ts:1696-1712 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| launchAtLogin and preventSleepWhileRunning | settings.json in user data, and the OS login item | No sync found | Kept until changed |
| Background activity | In memory only | No | Gone on quit |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The shell loads the signed-in hosted app; the controls themselves need no account check. |
| Permissions | OS login item permission; the app asks before turning on login start. |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code; dictation preference is macOS only but these are not |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code |
| Local mode | All of it runs on the device with no model, no cloud call and no subscription. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Loading what is running' | BackgroundActivitySection.tsx:127 |
| Empty | 'Nothing is running in the background.' | BackgroundActivitySection.tsx:22 |
| Error | Read and stop failures shown in an alert | BackgroundActivitySection.tsx:23-24 |
| OS refuses login item | Switch shows what the OS holds | launchAtLogin.ts:21-28 |
| Menu toggle fails | Checkbox restored and warning logged | appMenu.ts:28-34 |
| Suspend during routine | Run recorded as interrupted, not replayed | localRoutineEngine.ts:460-471 |
| Wake after offline screen | Page load retried | screenRetry.ts:4 |
| Start hidden at login | not handled in the code found: no check for being opened at login | search of apps/desktop/electron/*.ts |
| Lid closed | Still sleeps (stated in copy) | DesktopSettingsSection.tsx:61 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/backgroundActivity.test.ts`: Turn counting and replacement runtime
- `apps/desktop/electron/__tests__/workKeeper.test.ts`: Hold and release rules including phone
- `apps/desktop/electron/__tests__/appMenu.test.ts`: Menu; restoring the Launch at Login box on failure
- `apps/desktop/electron/__tests__/screenRetry.test.ts`: Retry on wake
- `apps/desktop/electron/__tests__/localRoutineEngine.test.ts`: Suspend and wake behaviour
- `apps/desktop/electron/__tests__/quitGuard.test.ts`: Quit prompt
- `apps/web/features/desktop-host/__tests__/DesktopSettingsSection.test.tsx`: Writing launchAtLogin

**Test scenarios**

- **Login item**
  1. Turn on Run on startup and confirm
  2. Open System Settings login items
  3. Remove the app there
  4. Reopen Settings
  - Expected: Item appears then switch reads off
- **Stop a command**
  1. Start a long command
  2. Open Running on this Mac
  3. Press Stop
  - Expected: Row disappears; command ends
- **Keep awake**
  1. Turn on Keep computer awake
  2. Start a long coding turn
  3. Check power assertions
  - Expected: A prevent-suspension assertion exists until the turn ends
- **Phone hold**
  1. Connect a phone
  2. Turn the switch off
  - Expected: Assertion remains
- **Suspend routine**
  1. Run a local routine
  2. Sleep the Mac, wake it
  - Expected: Run shows interrupted and is not replayed

**Where to look when it fails**

- '[launch-at-login] the change was not saved' warning
- '[local-routines] suspend failed' warning
- telemetry domain 'launch' in desktop-telemetry.ndjson

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/070-desktop-application.md](../../70-qa/test-plans/desktop/070-desktop-application.md)

## 10. Gaps and dependencies

- **No pause or resume of agent turns, terminals or computer use on sleep, wake or lock** Affects: surface:desktop. Evidence: powerMonitor uses only in main.ts:321, localRoutineService.ts:232, skillCapture.ts:174, computerUseSession.ts:166, remoteControlService.ts:132. Work needed: Define the expected behaviour and implement it for CLI turns and terminals
- **Menu toggle skips the confirmation that Settings uses** Affects: surface:desktop. Evidence: appMenu.ts:28-34 vs main.ts:2185-2190. Work needed: Route the menu through the same confirmation
- **Brief status 'missing' for S70.32 is out of date** Affects: Documentation. Evidence: Code references above. Work needed: Change the brief to partial
- **Not known whether the app starts hidden at login** Affects: surface:desktop. Evidence: No code for it found. Work needed: Decide and implement or document

**Depends on**

- surface:desktop
- SYS-observability-and-operations
- SYS-agents-tools-and-automation
- F070-07
- F070-08
- file:apps/desktop/electron/launchAtLogin.ts

## Unknown

- Whether the app opens hidden at login
- Behaviour of the coding runtime when the Mac sleeps
- Windows and Linux login item behaviour (no builds)
- Whether the OS login item survives app updates
