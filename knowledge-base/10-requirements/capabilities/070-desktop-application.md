---
id: "REQ-AREA-070"
type: "requirements"
title: "Requirement items: Desktop application"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 70. Desktop application

32 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S70.01

**Native application shell.** The product runs as an installed desktop app window with its own lifecycle, single instance, sign-in and crash recovery.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Seen in a real run: Desktop PASS
- Feature: [F070-01 App window and lifecycle](../../20-features/070-desktop-application/F070-01-app-window-and-lifecycle.md)
- Competitor trace: CAP-apps-and-install-01

## S70.02

**System menu integration.** The app installs a native menu bar (File, Edit, View, History, Window, Help) whose items perform real actions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-02 Menu bar, Dock and tray icon](../../20-features/070-desktop-application/F070-02-menu-bar-dock-and-tray-icon.md)

## S70.03

**Tray/menu-bar integration.** A menu-bar/tray icon offers open, new chat, Quick Ask, screenshot, voice, shortcuts and quit, and can be turned off.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-02 Menu bar, Dock and tray icon](../../20-features/070-desktop-application/F070-02-menu-bar-dock-and-tray-icon.md)
- Competitor trace: CAP-apps-and-install-16

## S70.04

**Dock/taskbar behavior.** Clicking the dock/taskbar icon restores the app; closing the last window keeps it running on macOS and quits elsewhere.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-01 App window and lifecycle](../../20-features/070-desktop-application/F070-01-app-window-and-lifecycle.md)
- Competitor trace: CAP-apps-and-install-16

## S70.05

**Global shortcut.** System-wide shortcuts (Quick Ask, screenshot, voice) work while another app is focused, are configurable and report conflicts.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-03 Global shortcuts](../../20-features/070-desktop-application/F070-03-global-shortcuts.md)
- Competitor trace: CAP-apps-and-install-15

## S70.06

**Quick composer.** A global shortcut opens a small composer over any app where the user can type and send a prompt.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-03 Global shortcuts](../../20-features/070-desktop-application/F070-03-global-shortcuts.md)
- Competitor trace: CAP-apps-and-install-15

## S70.07

**Companion window.** A compact companion window can stay open beside other apps while the user works elsewhere.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-04 Window management](../../20-features/070-desktop-application/F070-04-window-management.md)
- Competitor trace: CAP-apps-and-install-15

## S70.08

**Always-on-top option.** The user can choose to keep an app window above all other windows.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-04 Window management](../../20-features/070-desktop-application/F070-04-window-management.md)

## S70.09

**Multiple windows.** The user can open more than one app window and move a conversation into its own window.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-04 Window management](../../20-features/070-desktop-application/F070-04-window-management.md)

## S70.10

**Detachable panels.** A panel (artifact, preview, side panel) can be popped out of the main window into its own window.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing
- Feature: [F070-04 Window management](../../20-features/070-desktop-application/F070-04-window-management.md)

## S70.11

**Native file picker.** Choosing files or folders opens the operating system's own file dialog.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-06 Local folders and files](../../20-features/070-desktop-application/F070-06-local-folders-and-files.md)

## S70.12

**Persistent folder access.** A folder the user approves stays approved across launches and can be reviewed and revoked.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-06 Local folders and files](../../20-features/070-desktop-application/F070-06-local-folders-and-files.md)

## S70.13

**Local filesystem search.** The user or assistant can search approved local folders by file name or content.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-06 Local folders and files](../../20-features/070-desktop-application/F070-06-local-folders-and-files.md)

## S70.14

**Local filesystem editing.** The assistant can create or change files in a folder the user approved, after a permission prompt.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-06 Local folders and files](../../20-features/070-desktop-application/F070-06-local-folders-and-files.md)

## S70.15

**Local shell execution.** The user or assistant can run a program in an approved folder, with approval, sandboxing and streamed output.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-07 Local shell commands](../../20-features/070-desktop-application/F070-07-local-shell-commands.md)

## S70.16

**Local agent daemon.** A local agent service runs on the machine and keeps accepting work in the background.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F070-12 Planned or not applicable items](../../20-features/070-desktop-application/F070-12-planned-or-not-applicable-items.md)

## S70.17

**Local MCP servers.** The desktop app can run MCP servers on the local machine and give their tools to the assistant.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing
- Feature: [F070-12 Planned or not applicable items](../../20-features/070-desktop-application/F070-12-planned-or-not-applicable-items.md)

## S70.18

**Native application context.** The assistant can read context from the app the user is working in (active app, window title, selected text or contents).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing
- Feature: [F070-12 Planned or not applicable items](../../20-features/070-desktop-application/F070-12-planned-or-not-applicable-items.md)
- Competitor trace: CAP-apps-and-install-18

## S70.19

**Screen/window capture.** The user can capture the screen or a chosen window into the chat from the desktop app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-05 Screen capture and computer use](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md)
- Competitor trace: CAP-apps-and-install-17

## S70.20

**Cross-application dictation.** Dictation started by a global shortcut inserts text into whichever application the user is using.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F070-12 Planned or not applicable items](../../20-features/070-desktop-application/F070-12-planned-or-not-applicable-items.md)

## S70.21

**Computer use.** The assistant can see the screen and move, click and type on the user's computer after permission, with stop and take-over.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-05 Screen capture and computer use](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md)
- Competitor trace: CAP-apps-and-install-19

## S70.22

**Remote-host service.** The desktop app can act as a host that another device (phone) pairs with and drives remotely.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-08 Phone remote control](../../20-features/070-desktop-application/F070-08-phone-remote-control.md)

## S70.23

**Local model management where offered.** Where local models are offered, the desktop app lets the user list, choose and configure them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F070-12 Planned or not applicable items](../../20-features/070-desktop-application/F070-12-planned-or-not-applicable-items.md)
- Competitor trace: CAP-apps-and-install-30

## S70.24

**Launch at login.** The user can choose to start the app automatically at login.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-09 Background work, launch at login and sleep](../../20-features/070-desktop-application/F070-09-background-work-launch-at-login-and-sleep.md)
- Competitor trace: CAP-apps-and-install-28

## S70.25

**Background-runtime controls.** The user can see and control what the desktop app keeps running in the background.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-09 Background work, launch at login and sleep](../../20-features/070-desktop-application/F070-09-background-work-launch-at-login-and-sleep.md)
- Competitor trace: CAP-apps-and-install-28

## S70.26

**Automatic updates.** The app finds, downloads and installs new versions by itself (or with one click).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Seen in a real run: Desktop PASS
- Feature: [F070-10 Updates and diagnostics](../../20-features/070-desktop-application/F070-10-updates-and-diagnostics.md)
- Competitor trace: CAP-apps-and-install-03

## S70.27

**Update-channel selection.** The user can pick an update channel (stable, beta or similar).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing
- Feature: [F070-10 Updates and diagnostics](../../20-features/070-desktop-application/F070-10-updates-and-diagnostics.md)
- Competitor trace: CAP-apps-and-install-04

## S70.28

**Diagnostic export.** The user can export or copy diagnostics and open logs to send to support.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-10 Updates and diagnostics](../../20-features/070-desktop-application/F070-10-updates-and-diagnostics.md)

## S70.29

**Local cache/storage management.** The user can see and clear the desktop app's local cache and stored data.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-11 Local storage, privacy and links](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md)

## S70.30

**Native deep links.** agiworkforce-cloud:// links and notification clicks open the app on the right screen.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-11 Local storage, privacy and links](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md)
- Competitor trace: CAP-apps-and-install-20

## S70.31

**OS-specific privacy settings.** The app shows which OS privacy permissions and in-app grants it holds, explains how to change them, and lets the user revoke grants.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F070-11 Local storage, privacy and links](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md)
- Competitor trace: CAP-apps-and-install-19

## S70.32

**Sleep/wake and lock-state behavior.** The app reacts to sleep, wake and screen lock (pauses or resumes work, keeps the machine awake for long tasks).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing
- Feature: [F070-09 Background work, launch at login and sleep](../../20-features/070-desktop-application/F070-09-background-work-launch-at-login-and-sleep.md)
- Competitor trace: CAP-apps-and-install-28
