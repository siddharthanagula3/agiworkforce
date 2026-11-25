---
id: "AREA-070"
type: "area"
title: "Desktop application"
features: ["F070-01", "F070-02", "F070-03", "F070-04", "F070-05", "F070-06", "F070-07", "F070-08", "F070-09", "F070-10", "F070-11", "F070-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 70. Desktop application

The desktop app is an installed Mac and Windows program that opens the signed-in product in its own window. It adds things a browser tab cannot do well: a menu bar, a tray icon, system-wide shortcuts, a small quick-ask panel, local folders and shell commands, screen capture, computer control after permission, and control from a paired phone. These local powers touch the user's own files and screen, so each one is gated by approvals.

**Who uses it.** Per the brief, this area applies to the Desktop app only (the other five apps are n/a or not listed). In the code, the window, menus and shortcuts are for any signed-in user. Local folder and shell features need the user to approve a folder first. Phone control needs a paired phone. The code read here shows no plan gate on these features, so plan limits are unknown (see not_sure). No workspace admin role was seen in these files.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F070-01](F070-01-app-window-and-lifecycle.md) | App window and lifecycle | n/a | built | n/a | n/a | n/a | n/a |
| [F070-02](F070-02-menu-bar-dock-and-tray-icon.md) | Menu bar, Dock and tray icon | n/a | built | n/a | n/a | n/a | n/a |
| [F070-03](F070-03-global-shortcuts.md) | Global shortcuts | n/a | built | n/a | n/a | n/a | n/a |
| [F070-04](F070-04-window-management.md) | Window management | n/a | partly | n/a | n/a | n/a | n/a |
| [F070-05](F070-05-screen-capture-and-computer-use.md) | Screen capture and computer use | n/a | built | n/a | n/a | n/a | n/a |
| [F070-06](F070-06-local-folders-and-files.md) | Local folders and files | n/a | built | n/a | n/a | n/a | n/a |
| [F070-07](F070-07-local-shell-commands.md) | Local shell commands | n/a | built | n/a | n/a | n/a | n/a |
| [F070-08](F070-08-phone-remote-control.md) | Phone remote control | n/a | built | n/a | n/a | n/a | n/a |
| [F070-09](F070-09-background-work-launch-at-login-and-sleep.md) | Background work, launch at login and sleep | n/a | partly | n/a | n/a | n/a | n/a |
| [F070-10](F070-10-updates-and-diagnostics.md) | Updates and diagnostics | n/a | partly | n/a | n/a | n/a | n/a |
| [F070-11](F070-11-local-storage-privacy-and-links.md) | Local storage, privacy and links | n/a | built | n/a | n/a | n/a | n/a |
| [F070-12](F070-12-planned-or-not-applicable-items.md) | Planned or not applicable items | n/a | partly | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/070-desktop-application.md](../../10-requirements/capabilities/070-desktop-application.md).

## How this area works in the code

1. **1. App launch and single instance.** The app asks the operating system for a single-instance lock. If it already runs, the new copy quits. The first copy handles a second launch by delivering any deep link and bringing its window forward. (`apps/desktop/electron/main.ts:2570`, `apps/desktop/electron/main.ts:2722`)
2. **2. Window and page load.** The main window loads the signed-in web product from the cloud origin. A window policy decides which links stay in the window and which open in the user's browser. Sign-in pages go through the browser. (`apps/desktop/electron/windowPolicy.ts:1-19`, `apps/desktop/electron/main.ts:913-928`)
3. **3. Crash and unresponsive handling.** If the page process crashes, or stays unresponsive for a set time, the app shows a recovery screen. A busy page that recovers does not trigger it. (`apps/desktop/electron/main.ts:913`, `apps/desktop/electron/main.ts:924`)
4. **4. Menus, tray and shortcuts.** The menu and tray call the same command functions. The tray is created or removed by a rule: preference on, or computer use granted, or an agent running. Global shortcuts are registered with the operating system and checked for taken or duplicate keys. (`apps/desktop/electron/main.ts:1860-1873`, `apps/desktop/electron/tray.ts:209`, `apps/desktop/electron/shortcuts.ts:80`, `apps/desktop/electron/shortcuts.ts:106`, `apps/desktop/electron/garnishCore.ts:105`)
5. **5. Quick Ask panel.** A small always-on-top window loads the web page for quick ask. It hides on blur or Escape. A navigation to a full page is handed to the main window. (`apps/desktop/electron/quickAsk.ts:76`, `apps/desktop/electron/quickAsk.ts:93`, `apps/web/app/quick-ask/page.tsx:7`)
6. **6. Screen capture.** The app captures the screen or one window, puts the image on the clipboard, focuses the chat composer, pastes, and clears the clipboard again if it still holds only the capture. (`apps/desktop/electron/screenshot.ts:80`, `apps/desktop/electron/screenshot.ts:109`, `apps/desktop/electron/screenshot.ts:163-171`)
7. **7. Agent actions on the machine.** The page sends device steps (file, shell, browser, screen) to the desktop runtime. The runtime checks that the folder is approved and that any permission was given before it acts. Computer use has stop, take-over and hand-back controls. (`packages/contracts/local-runtime/src/device-steps.ts:102`, `apps/web/features/desktop-host/lib/device-steps.ts:226-236`, `apps/desktop/electron/runtime/dispatcher.ts:1027-1041`, `apps/desktop/electron/runtime/computerUseSession.ts:335-355`)
8. **8. OS permissions.** The app reads screen, microphone and accessibility status from the operating system. It can ask for microphone access or open the matching system settings page. (`apps/desktop/electron/runtime/systemPermissions.ts:16-22`, `apps/desktop/electron/runtime/systemPermissions.ts:48-52`)
9. **9. Updates and login item.** The app sets a feed for the update server and waits for a download. Install quits and relaunches. Launch at login is a login item setting. (`apps/desktop/electron/desktopAutoUpdate.ts:69`, `apps/desktop/electron/desktopAutoUpdate.ts:95`, `apps/desktop/electron/launchAtLogin.ts:22-24`)

## Files to know

| File | Role |
|---|---|
| `apps/desktop/electron/main.ts` | Main process entry: single instance, window creation, lifecycle, tray rules, IPC handlers, quit guard. |
| `apps/desktop/electron/appMenu.ts` | Builds the native menu bar (File, Edit, View, History, Window, Help) and its actions. |
| `apps/desktop/electron/tray.ts` | Tray icon and its menu: open, new chat, agent activity, shortcuts, updates, quit. |
| `apps/desktop/electron/shortcuts.ts` | Registers global shortcuts and reports taken or duplicate keys. |
| `apps/desktop/electron/garnishCore.ts` | Shortcut defaults, presets, the off value, and which shortcuts can be turned off. |
| `apps/desktop/electron/quickAsk.ts` | The Quick Ask panel window: show, hide, reposition and hand-off. |
| `apps/desktop/electron/screenshot.ts` | Screen and window capture, clipboard handling and paste into chat. |
| `apps/desktop/electron/runtime/dispatcher.ts` | Runs device commands (files, shell, MCP review, remote control text) after approval checks. |
| `apps/desktop/electron/runtime/computerUseSession.ts` | Computer use grant, stop, take-over, hand-back and revoke. |
| `apps/web/features/desktop-host/lib/device-steps.ts` | Web side: turns the assistant's device tool calls into host commands and returns results. |
| `apps/desktop/electron/remote/remoteControlService.ts` | Remote control host: pairing, phone approval, session relay. |
| `apps/desktop/electron/desktopAutoUpdate.ts` | Auto-update feed, download state and install. |

## What is stored

- Shortcut choices and the showInMenuBar preference, saved as settings: settingsStore (apps/desktop/electron/settingsStore.ts), via saveSettings and saveSettingsDurably
- Shell window state (last account, window frames): apps/desktop/electron/shellWindowStore.ts and windowState.ts (file in user data folder)
- Applications-folder move record: applications-folder.json in the app's user data folder (main.ts, applicationsFolderStore)
- Screen capture image, briefly: System clipboard only; cleared again when the paste is done (screenshot.ts:92-107)
- Launch at login flag: Operating system login item (launchAtLogin.ts:24)
- Remote control pairing and phone list: Not confirmed; only function names were read in remoteControlService.ts
- Approved local folders: Not confirmed; the approval store was not opened (dispatcher.ts:759 named by the brief)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Show in menu bar preference**: Shows or hides the tray icon (tray is also forced on while an agent runs or computer use is granted). (apps/desktop/electron/main.ts:1860-1862, main.ts:2203-2204, main.ts:1978)
- **Shortcut off value and per-key on/off**: Turns a shortcut off; Stop Agents cannot be turned off. (apps/desktop/electron/garnishCore.ts:105-117, garnishCore.ts:207)
- **Launch at login**: Starts the app at login. (apps/desktop/electron/launchAtLogin.ts:12-24; apps/desktop/electron/appMenu.ts:141, appMenu.ts:221)
- **Auto-update support**: Turns automatic update checks on only when supported. (apps/desktop/electron/main.ts (whenReady block, autoUpdateSupported call))
- **Computer use enabled**: Turns computer use on or off. (apps/desktop/electron/runtime/computerUseSession.ts:380)
- **Remote control available**: Remote control can start only when available. (apps/desktop/electron/remote/remoteControlService.ts:426-449)
- **Keep-awake while agent runs (UI text)**: Stops idle sleep while an agent runs; display and lid sleep still apply. (apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:62)
- **Screen and microphone permission status**: Read from the OS; shown in the permissions panel. (apps/desktop/electron/runtime/systemPermissions.ts:16-52)

## Shared between apps

Shared: the web product pages (chat composer, quick-ask page, settings sections, desktop-host components under apps/web/features/desktop-host) and the device-step contracts in packages/contracts/local-runtime. Desktop-only: the Electron main process, menus, tray, shortcuts, screenshot, computer use and runtime folders under apps/desktop/electron. The brief lists only Desktop status for these items, so other apps are shown as not listed.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief marks local MCP servers as missing, but the desktop code has MCP approval review pieces (developer MCP approval). Unclear whether the desktop runs MCP servers at all. (apps/desktop/electron/runtime/dispatcher.ts:897; apps/desktop/electron/runtime/mcpApprovalReview.ts:14)
- Brief says the app quits on other platforms when the last window closes, but the rule keeps it running while a tray icon exists, and the tray can stay for running agents or computer use. (apps/desktop/electron/main.ts:2770-2775; apps/desktop/electron/main.ts:1860-1862)
- Brief says the tray can be turned off, but it stays while an agent runs or computer use is granted. (apps/desktop/electron/main.ts:1860-1862)
- Sleep and wake: brief marks missing. The power listener only retries a page on resume, and the sleep and lock hooks found belong to skill capture. Nothing pauses or resumes agent work on sleep or lock. (apps/desktop/electron/main.ts:321-322; apps/desktop/electron/runtime/skillCapture.ts:174-175)
- Update channel: the feed URL is built from the architecture and version only, with no channel choice. (apps/desktop/electron/desktopAutoUpdate.ts:69; apps/desktop/electron/desktopCloudUpdate.ts:8)
- Detachable panels: brief marks missing; no pop-out code was found in the window menu files opened. (apps/desktop/electron/appMenu.ts:209-245)

## Not established

- Plan gates: no plan check was seen in the desktop files opened here; the switches above are not plan-gated as far as read. Unknown whether any feature is paid-only.
- Local folder approval storage and revoke path (dispatcher.ts:759 and CapabilitiesSection.tsx:88 were named by the brief but not opened).
- Remote control pairing storage and the phone approval flow in detail (only function names were read).
- Whether Stop Computer Use and Revoke are reachable from every surface, and the exact grant rules.
- Update channel and update server behaviour beyond the feed URL.
- Whether the clipboard restore in screenshot.ts always runs (it runs only when the clipboard still holds the capture).
- Global shortcut behaviour on each operating system beyond the code paths read.
- Whether the brief's line references (for example appMenu.ts:101 and quickAsk.ts:12, 98) match the current code; several were not opened directly, and line numbers given here came from grep output or are approximate.
- No tests, builds, servers or localhost runs were done: this task was read-only, so the localhost and one-surface-at-a-time testing request was not applied here.
