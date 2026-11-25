---
id: "F070-10"
type: "feature"
title: "Updates and diagnostics"
aliases: ["Check for Updates", "Relaunch to update", "Auto-update", "Troubleshooting", "Open Logs", "Copy Diagnostics", "Update channel", "S70.26", "S70.27", "S70.28"]
area: "70 Desktop application"
available_on: ["desktop"]
implementation: {web: "n/a", desktop: "partial", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "partly seen (1 of 2)", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S70.26", "S70.27", "S70.28"]
depends_on: ["surface:desktop", "SYS-observability-and-operations", "SYS-api-and-contracts", "api:GET /api/releases/desktop-cloud/latest", "api:GET /api/releases/desktop-cloud/update/[arch]/[version]", "file:apps/desktop/electron/desktopAutoUpdate.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F070-10 Updates and diagnostics

AGI Desktop on macOS checks for new versions daily and on request, downloads them in the background and installs after the user chooses 'Relaunch to update'. The Help menu can open the logs folder and copy a diagnostics summary. The user cannot pick an update channel.

Area: [70. Desktop application](README.md). Requirement items: [S70.26](../../10-requirements/capabilities/070-desktop-application.md#s7026), [S70.27](../../10-requirements/capabilities/070-desktop-application.md#s7027), [S70.28](../../10-requirements/capabilities/070-desktop-application.md#s7028).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built | partly built | partly seen (1 of 2) |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps the app current through a signed feed and gives support two tools: the log folder and a copy-ready diagnostics summary.

**Why it exists.** Users should not reinstall by hand, and support needs facts about the build and each part of the shell without private data.

**Who uses it.** All AGI Desktop users on macOS; support staff.

**Problems it solves**

- Running an old build
- Not knowing whether an update is ready
- Reporting a problem with no details

**Use cases**

- Check for updates from the menu
- Relaunch to finish an update
- Copy diagnostics into a support message
- Open the logs folder

## 2. User experience

**Where to find it**

- macOS: app-name menu > 'Check for Updates…' (apps/desktop/electron/appMenu.ts:136). Other systems: Help > 'Check for Updates' (appMenu.ts:574). Tray: 'Check for Updates…' (apps/desktop/electron/tray.ts:203).
- Settings > General: row 'App version' with 'Check for updates' and 'Relaunch to update' or 'Download installer' (apps/web/features/desktop-host/components/DesktopUpdateRow.tsx:11-16; mounted at DesktopSettingsSection.tsx:440).
- A notice in the page when an update is ready (DesktopUpdateNotice.tsx:29), and a system notification with a 'Relaunch to update' button (main.ts:2454-2465).
- Help > Troubleshooting > 'Open Logs', 'Copy Diagnostics', 'Clear Cache and Restart…' (appMenu.ts:565-571).

**Before you start**

- Packaged macOS app for automatic download (desktopAutoUpdate.ts:17).
- Network access to the update service.

**Screens and controls**

- Update dialogs: 'Couldn’t check for updates', '<product> is up to date', 'No update available', '<product> update ready' with 'Relaunch to update' and 'Later', '<product> update available' with 'Download Installer' and 'Later' (desktopCloudUpdate.ts:221-300).
- Notification 'Diagnostics copied' (main.ts:1631-1640).
- Dialog before restart if work would stop, using the quit guard wording (main.ts:2437-2445).

**Journey**

1. 1. At launch and every 24 hours the app checks the feed (desktopAutoUpdate.ts:10, :33-80).
2. 2. A newer build downloads in the background.
3. 3. When ready, a notice and a notification appear.
4. 4. The user chooses 'Relaunch to update'. If agent turns or commands are running, the quit prompt asks first; declining defers the install to the next quit.
5. 5. The app restarts on the new version.
6. Manual: choose Check for Updates and read the dialog.
7. Support: Help > Troubleshooting > Copy Diagnostics, paste into the message; Open Logs to attach files.

**What the person sees and gets**

- Dialog text for each state, with installed and latest versions.
- If the build could not be downloaded, a 'Download Installer' button opens the browser to the installer.
- Diagnostics JSON on the clipboard: release (version, channel, platform, arch), collected time, per-domain counts and health, unhealthy domains (desktopTelemetry.ts:79-85).

**Settings**

- None for update channel (not offered).
- Log files: desktop-telemetry.ndjson, capped at 512 KB (desktopTelemetry.ts:86-87).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Feed URL built from architecture and version only: /api/releases/desktop-cloud/update/<arch>/<version> (desktopCloudUpdate.ts:19-23).
- Server answers 204 when no newer stable release, no archive for the architecture, or updates are held; otherwise returns url, name, notes, pub_date (update route.ts:27-62).
- Operator hold through a kill switch (desktop-update-hold.ts:23-40).
- Metadata check against /api/releases/desktop-cloud/latest, with distinct messages for no installer published, wrong architecture, outage and held updates (desktopCloudUpdate.ts:131-215; latest/route.ts:15-32).
- Install quits and installs only when the download is ready (desktopAutoUpdate.ts:93-97).
- Telemetry records updater success and failure (desktopAutoUpdate.ts:49, :58).
- Copy Diagnostics and Open Logs work from the Help menu (main.ts:1623-1640).

**Incomplete**

- Automatic installation exists only on packaged macOS; elsewhere 'unsupported' and the user gets the installer link (desktopAutoUpdate.ts:17, :87).

**Present but disconnected or switched off**

- Two names for the channel exist: the client constant 'cloud' (desktopCloudUpdate.ts:9) and the server's fixed 'stable' release line (update route.ts:35; latest route.ts:32). Neither is user-selectable.

**Not available**

- Update channel selection (stable, beta): not found anywhere in the client, settings or feed (S70.27 'desktop missing').
- Windows and Linux installers and updates (electron-builder.yml has a mac section only; release workflow runs on macOS).

## 4. Required behaviour

**Established requirements**

- The app finds, downloads and installs new versions by itself, or with one click. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.26)
- The user can pick an update channel (stable, beta or similar). (source: S70.27 in the same brief (status: desktop missing))
- The user can export or copy diagnostics and open logs to send to support. (source: S70.28 in the same brief)
- If no installer is published, the user is told so. (source: task brief for F070-10; apps/desktop/electron/desktopCloudUpdate.ts:244)

**Acceptance criteria**

1. With a newer published release, the app downloads it and shows 'Relaunch to update'.
2. With no release published the dialog says 'No installer is published for this update channel.'
3. With the feed unreachable the dialog says the update service could not be reached, not that the app is up to date.
4. When an operator holds updates, the app is not offered the update.
5. Relaunch with a running agent turn shows the quit prompt first; Cancel keeps the app running.
6. Copy Diagnostics puts JSON on the clipboard containing version, platform and domain health, and no route, account or file name.
7. Open Logs opens the logs folder.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The feed carries no channel because the server always reads the stable line (update route.ts:35).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a channel setting that passes a channel to the feed and the latest route.
- [proposed] Offer a save-to-file diagnostics export besides copy.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | desktopAutoUpdate | `apps/desktop/electron/desktopAutoUpdate.ts` | Electron auto-updater: feed, state, daily check, install. |
| service | desktopCloudUpdate | `apps/desktop/electron/desktopCloudUpdate.ts` | Release metadata check, versions, and update dialog text. |
| service | main update functions | `apps/desktop/electron/main.ts` | cloudUpdateAvailability, restartToUpdate, announceUpdateReady, checkForCloudUpdate, copyDiagnostics, openLogsFolder, clearCacheAndRestart. |
| component | appMenu | `apps/desktop/electron/appMenu.ts` | Check for Updates and Troubleshooting menu items. |
| component | tray | `apps/desktop/electron/tray.ts` | Tray item Check for Updates. |
| service | desktopTelemetry | `apps/desktop/electron/runtime/desktopTelemetry.ts` | Counters, health, ndjson log writer, diagnostics shape. |
| service | desktopTelemetryService | `apps/desktop/electron/runtime/desktopTelemetryService.ts` | Shared instance, desktopDiagnostics(). |
| endpoint | GET /api/releases/desktop-cloud/update/[arch]/[version] | `apps/web/app/api/releases/desktop-cloud/update/[arch]/[version]/route.ts` | Auto-update feed. |
| endpoint | GET /api/releases/desktop-cloud/latest | `apps/web/app/api/releases/desktop-cloud/latest/route.ts` | Latest published version and architectures. |
| service | desktopUpdateHeld | `apps/web/lib/releases/desktop-update-hold.ts` | Kill-switch hold on updates. |
| component | DesktopUpdateRow | `apps/web/features/desktop-host/components/DesktopUpdateRow.tsx` | Settings row. |
| component | DesktopUpdateNotice | `apps/web/features/desktop-host/components/DesktopUpdateNotice.tsx` | In-app ready notice. |
| config | electron-builder | `apps/desktop/electron-builder.yml` | Mac dmg and zip targets, notarization. |
| job | Release Desktop Cloud Shell workflow | `.github/workflows/release-desktop-cloud.yml` | Builds, signs, notarizes and publishes on macOS runner. |
| service | quitGuard | `apps/desktop/electron/quitGuard.ts` | Prompt before restart when work is running. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The shell asks the website for the latest version (10 s limit). | our servers | desktopCloudUpdate.ts:131-160 |
| The website reads the latest stable release and its archives from the release host. | outside service | update route.ts:35-50 (fetchLatestDesktopRelease; module name github-desktop-releases) |
| The system updater downloads the archive from the feed's URL and stages it. | outside service | desktopAutoUpdate.ts:69; route.ts:53-60 |
| The user chooses Relaunch; the quit guard asks if work is running; the updater quits and installs. | device | main.ts:2437-2452 |
| Copy Diagnostics reads in-memory counters and writes JSON to the clipboard; nothing is sent. | device | main.ts:1631-1633 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Telemetry counters and log | Memory and desktop-telemetry.ndjson in the logs folder | Not sent anywhere by this code; user pastes it | File capped at 512 KB; old logs can be cleared in Storage after 7 days |
| Downloaded update | Updater's staging area on the device | No | Installed on relaunch |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The feed is anonymous: no user identity is sent, only the client version and platform headers (desktop-update-hold.ts:9-12; desktopCloudUpdate.ts:150). |
| Permissions | None beyond the OS installing into Applications; the app offers to move itself there (applicationsFolder.ts). |
| Subscription | none found in the code |
| Limits and metering | Daily check; the feed is rate limited under key 'release-latest' (update route.ts:30). |
| Feature flags | Kill switch DESKTOP_UPDATE_CAPABILITY holds updates (desktop-update-hold.ts:5-40). |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code |
| Local mode | Updates need the network but not an account or a model. Diagnostics and logs work offline. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Checking | 'Checking…' on the button | DesktopUpdateRow.tsx:12 |
| Up to date | 'This is the latest version.' | DesktopUpdateRow.tsx:13 |
| No release | 404 NOT_FOUND treated as nothing published | desktopCloudUpdate.ts:170-177 |
| Offline / timeout | Sentence about not reaching the update service | desktopCloudUpdate.ts:158-166 |
| Held by operator | Feed returns 204; latest returns 503 UPDATES_HELD | latest/route.ts:15 |
| Download failed | Offers 'Download Installer' | desktopCloudUpdate.ts:268-281 |
| Restart declined | Install deferred to next quit | main.ts:2432-2445 |
| Unsupported platform | state 'unsupported' | desktopAutoUpdate.ts:87 |
| Wrong architecture | 'No signed ... installer is published for this update.' | desktopCloudUpdate.ts:188 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/desktopAutoUpdate.test.ts`: Phases, retries, staged package, unsupported
- `apps/desktop/electron/__tests__/desktopCloudUpdate.test.ts`: Availability, versions, errors, architecture, handshake
- `apps/desktop/electron/__tests__/desktopTelemetry.test.ts`: Telemetry and diagnostics
- `apps/web/app/api/releases/desktop-cloud/update/[arch]/[version]/__tests__`: Feed route answers: held, current, no archive, matching zip
- `apps/web/features/desktop-host/__tests__/DesktopUpdateRow.test.tsx`: Settings row
- `apps/web/features/desktop-host/__tests__/DesktopUpdateNotice.test.tsx`: Ready notice

**Test scenarios**

- **Manual check, current**
  1. Choose Check for Updates on the newest build
  - Expected: 'is up to date' dialog with installed and latest versions
- **Update available**
  1. Run an older packaged build
  2. Wait for the download
  - Expected: Ready notice, then Relaunch installs the new version
- **Work running**
  1. Start a command
  2. Choose Relaunch to update
  - Expected: Quit prompt names the command; Cancel defers
- **Held**
  1. Switch on the update hold for the version
  2. Check
  - Expected: Not offered an update
- **Diagnostics**
  1. Help > Troubleshooting > Copy Diagnostics
  2. Paste
  - Expected: JSON with release and domain counts
- **Offline**
  1. Disconnect the network
  2. Check
  - Expected: Could-not-reach message

**Where to look when it fails**

- '[auto-update]' console warnings
- '[desktop-cloud-update] release check failed'
- desktop-telemetry.ndjson domain 'updater'
- Feed HTTP 204, 404 NOT_FOUND, 503 UPDATES_HELD or RELEASE_LOOKUP_UNAVAILABLE

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/070-desktop-application.md](../../70-qa/test-plans/desktop/070-desktop-application.md)

## 10. Gaps and dependencies

- **No update channel choice** Affects: surface:desktop users who want beta builds. Evidence: update route.ts:35 fixed 'stable'; desktopCloudUpdate.ts:19-23 feed has no channel. Work needed: Design channels, feed parameter and a settings control
- **Automatic update only on macOS** Affects: Any Windows or Linux build. Evidence: desktopAutoUpdate.ts:17; electron-builder.yml. Work needed: Add platform builds and updaters if planned
- **Diagnostics are copy only; no file export or send** Affects: Support workflow. Evidence: main.ts:1631. Work needed: Optional save-to-file

**Depends on**

- surface:desktop
- SYS-observability-and-operations
- SYS-api-and-contracts
- api:GET /api/releases/desktop-cloud/latest
- api:GET /api/releases/desktop-cloud/update/[arch]/[version]
- file:apps/desktop/electron/desktopAutoUpdate.ts

## Unknown

- What the release host is exactly (module name suggests GitHub; module not opened)
- Whether any log is uploaded automatically
- Update behaviour on a build run from outside Applications
- Windows and Linux plans
