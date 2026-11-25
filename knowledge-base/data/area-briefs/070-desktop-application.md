# Area 70. Desktop application

32 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S70.01 Native application shell.
- Should: The product runs as an installed desktop app window with its own lifecycle, single instance, sign-in and crash recovery.
- Status: desktop done
- Code: apps/desktop/electron/windowPolicy.ts:16; apps/desktop/electron/main.ts:1286

## S70.02 System menu integration.
- Should: The app installs a native menu bar (File, Edit, View, History, Window, Help) whose items perform real actions.
- Status: desktop done
- Code: apps/desktop/electron/appMenu.ts:246; apps/desktop/electron/main.ts:1291

## S70.03 Tray/menu-bar integration.
- Should: A menu-bar/tray icon offers open, new chat, Quick Ask, screenshot, voice, shortcuts and quit, and can be turned off.
- Status: desktop done
- Code: apps/desktop/electron/tray.ts:93; apps/desktop/electron/main.ts:1366; apps/desktop/electron/garnishCore.ts:314

## S70.04 Dock/taskbar behavior.
- Should: Clicking the dock/taskbar icon restores the app; closing the last window keeps it running on macOS and quits elsewhere.
- Status: desktop done
- Code: apps/desktop/electron/main.ts:1389; apps/desktop/electron/main.ts:1403

## S70.05 Global shortcut.
- Should: System-wide shortcuts (Quick Ask, screenshot, voice) work while another app is focused, are configurable and report conflicts.
- Status: desktop done
- Code: apps/desktop/electron/shortcuts.ts:84; apps/desktop/electron/tray.ts:82; apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:167

## S70.06 Quick composer.
- Should: A global shortcut opens a small composer over any app where the user can type and send a prompt.
- Status: desktop done
- Code: apps/desktop/electron/appMenu.ts:101; apps/desktop/electron/quickAsk.ts:98; apps/desktop/electron/quickAsk.ts:12; apps/web/app/quick-ask/page.tsx:3

## S70.07 Companion window.
- Should: A compact companion window can stay open beside other apps while the user works elsewhere.
- Status: desktop done
- Code: apps/desktop/electron/appMenu.ts:237; apps/desktop/electron/appMenu.ts:242

## S70.08 Always-on-top option.
- Should: The user can choose to keep an app window above all other windows.
- Status: desktop done
- Code: apps/desktop/electron/appMenu.ts:242; apps/desktop/electron/main.ts:1151

## S70.09 Multiple windows.
- Should: The user can open more than one app window and move a conversation into its own window.
- Status: desktop done
- Code: apps/desktop/electron/appMenu.ts:209; apps/desktop/electron/main.ts:1081

## S70.10 Detachable panels.
- Should: A panel (artifact, preview, side panel) can be popped out of the main window into its own window.
- Status: desktop missing

## S70.11 Native file picker.
- Should: Choosing files or folders opens the operating system's own file dialog.
- Status: desktop done
- Code: apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx:225; apps/desktop/electron/runtime/dispatcher.ts:462; apps/desktop/electron/main.ts:493

## S70.12 Persistent folder access.
- Should: A folder the user approves stays approved across launches and can be reviewed and revoked.
- Status: desktop done
- Code: apps/web/features/settings/sections/CapabilitiesSection.tsx:88; apps/web/features/desktop-host/components/LocalAccessSection.tsx:334; apps/desktop/electron/runtime/dispatcher.ts:759

## S70.13 Local filesystem search.
- Should: The user or assistant can search approved local folders by file name or content.
- Status: desktop done
- Code: apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx:367; packages/contracts/local-runtime/src/device-steps.ts:102; packages/contracts/local-runtime/src/device-steps.ts:109; apps/web/features/desktop-host/lib/device-steps.ts:225; apps/web/features/desktop-host/lib/device-steps.ts:233

## S70.14 Local filesystem editing.
- Should: The assistant can create or change files in a folder the user approved, after a permission prompt.
- Status: desktop done
- Code: apps/desktop/electron/runtime/dispatcher.ts:367; apps/desktop/electron/runtime/dispatcher.ts:728; apps/web/features/desktop-host/lib/device-steps.ts:169; apps/web/lib/hooks/useChatStream.ts:1233

## S70.15 Local shell execution.
- Should: The user or assistant can run a program in an approved folder, with approval, sandboxing and streamed output.
- Status: desktop done
- Code: apps/web/features/settings/sections/CapabilitiesSection.tsx:88; apps/web/features/desktop-host/components/LocalAccessSection.tsx:415

## S70.16 Local agent daemon.
- Should: A local agent service runs on the machine and keeps accepting work in the background.
- Status: not applicable anywhere

## S70.17 Local MCP servers.
- Should: The desktop app can run MCP servers on the local machine and give their tools to the assistant.
- Status: desktop missing

## S70.18 Native application context.
- Should: The assistant can read context from the app the user is working in (active app, window title, selected text or contents).
- Status: desktop missing

## S70.19 Screen/window capture.
- Should: The user can capture the screen or a chosen window into the chat from the desktop app.
- Status: desktop done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4461; apps/desktop/electron/main.ts:631; apps/desktop/electron/screenshot.ts:61

## S70.20 Cross-application dictation.
- Should: Dictation started by a global shortcut inserts text into whichever application the user is using.
- Status: not applicable anywhere

## S70.21 Computer use.
- Should: The assistant can see the screen and move, click and type on the user's computer after permission, with stop and take-over.
- Status: desktop done
- Code: apps/web/features/desktop-host/components/ComputerUseControlBar.tsx:51; apps/web/features/desktop-host/components/DesktopHostMount.tsx:30; apps/desktop/electron/runtime/computerUseSession.ts:117; apps/desktop/electron/appMenu.ts:123; apps/desktop/electron/runtime/dispatcher.ts:918

## S70.22 Remote-host service.
- Should: The desktop app can act as a host that another device (phone) pairs with and drives remotely.
- Status: desktop done
- Code: apps/web/features/desktop-host/components/RemoteControlSection.tsx:118; apps/desktop/electron/remote/remoteControlService.ts:32

## S70.23 Local model management where offered.
- Should: Where local models are offered, the desktop app lets the user list, choose and configure them.
- Status: not applicable anywhere

## S70.24 Launch at login.
- Should: The user can choose to start the app automatically at login.
- Status: desktop done
- Code: apps/desktop/electron/appMenu.ts:76; apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:158; apps/desktop/electron/launchAtLogin.ts:21

## S70.25 Background-runtime controls.
- Should: The user can see and control what the desktop app keeps running in the background.
- Status: desktop done
- Code: apps/web/features/desktop-host/components/BackgroundActivitySection.tsx:100; apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:273; apps/desktop/electron/runtime/backgroundActivity.ts:45; apps/desktop/electron/runtime/backgroundActivity.ts:67; apps/desktop/electron/runtime/dispatcher.ts:1047

## S70.26 Automatic updates.
- Should: The app finds, downloads and installs new versions by itself (or with one click).
- Status: desktop done
- Code: apps/desktop/electron-builder.yml:55; .github/workflows/release-desktop-cloud.yml:336; apps/desktop/electron/desktopAutoUpdate.ts:23; apps/web/app/api/releases/desktop-cloud/update/[arch]/[version]/route.ts:52; apps/web/app/download/page.tsx:200; apps/web/features/desktop-host/components/DesktopUpdateRow.tsx:82

## S70.27 Update-channel selection.
- Should: The user can pick an update channel (stable, beta or similar).
- Status: desktop missing

## S70.28 Diagnostic export.
- Should: The user can export or copy diagnostics and open logs to send to support.
- Status: desktop done
- Code: apps/desktop/electron/appMenu.ts:239; apps/desktop/electron/main.ts:1103

## S70.29 Local cache/storage management.
- Should: The user can see and clear the desktop app's local cache and stored data.
- Status: desktop done
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:251; apps/web/features/desktop-host/components/StorageSettings.tsx:59; apps/web/features/desktop-host/components/StorageSettings.tsx:173

## S70.30 Native deep links.
- Should: agiworkforce-cloud:// links and notification clicks open the app on the right screen.
- Status: desktop done
- Code: apps/desktop/electron/main.ts:1325; apps/web/features/desktop-host/hooks/use-desktop-deep-links.ts:12

## S70.31 OS-specific privacy settings.
- Should: The app shows which OS privacy permissions and in-app grants it holds, explains how to change them, and lets the user revoke grants.
- Status: desktop done
- Code: apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:123; apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:136; apps/desktop/electron/runtime/systemPermissions.ts:22; apps/desktop/electron/runtime/systemPermissions.ts:48

## S70.32 Sleep/wake and lock-state behavior.
- Should: The app reacts to sleep, wake and screen lock (pauses or resumes work, keeps the machine awake for long tasks).
- Status: desktop missing
