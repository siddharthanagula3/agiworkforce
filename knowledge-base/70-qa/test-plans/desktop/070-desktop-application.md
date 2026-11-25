---
id: "PLAN-desktop-070"
type: "test-plan"
title: "Desktop · 70. Desktop application"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "70"
---
# Desktop · 70. Desktop application

24 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S70.01 Native application shell.

- **Expected:** The product runs as an installed desktop app window with its own lifecycle, single instance, sign-in and crash recovery.
- **Code:** done. Evidence present: apps/desktop/electron/windowPolicy.ts:47; apps/desktop/electron/main.ts:1296
- **Earlier check in the running app:** PASS: Isolated Electron loopback fixture: HTTP 503 drew the native shell recovery screen. Both automatic retry and Try again returned to the exact conversation URL, including its query, without replacing it with new chat. The 360-pixel screen fit in both themes.
- **Where to find it:** no screen of its own. Single-instance and crash-recovery screen code was not located by visible words; the earlier recovery check was not re-verified.
- **Steps:**
  1. Open AGI Desktop from the Applications folder.
  2. Open AGI Desktop a second time and check that the one open window comes forward instead of a second copy appearing.
  3. Close the window with the red button, then click the app icon in the Dock and check the same window returns.

## S70.02 System menu integration.

- **Expected:** The app installs a native menu bar (File, Edit, View, History, Window, Help) whose items perform real actions.
- **Code:** done. Evidence moved: apps/desktop/electron/appMenu.ts:246 (quoted code not found in the file now); apps/desktop/electron/main.ts:2504
- **Where to find it:** Menu bar > File > New Chat (menu titles File, Edit, View, History, Window, Help) (labels found in the code)
- **Steps:**
  1. Click File in the menu bar and check the items listed: New Chat, New Temporary Chat, New Project, Open Folder.
  2. Click Edit and check Undo, Redo, Cut, Copy, Paste, Find.
  3. Click View and History, then Window and Help, and check each lists its items.
  4. Click File > New Chat and check a new chat opens. Compare with Expected.

## S70.03 Tray/menu-bar integration.

- **Expected:** A menu-bar/tray icon offers open, new chat, Quick Ask, screenshot, voice, shortcuts and quit, and can be turned off.
- **Code:** done. Evidence moved: apps/desktop/electron/tray.ts:93 (quoted code not found in the file now); apps/desktop/electron/main.ts:1366 (quoted code not found in the file now); apps/desktop/electron/garnishCore.ts:566
- **Where to find it:** Menu bar icon (AGI Desktop) > Open Desktop; > New Chat; > Quick Ask; > Screenshot to Chat; > Dictation; > Shortcuts (labels found in the code)
- **Steps:**
  1. Click the AGI Desktop icon in the menu bar.
  2. Check the items: Open Desktop, New Chat, Quick Ask, Screenshot to Chat, Dictation, Shortcuts, Check for Updates, Quit.
  3. Click Shortcuts and check the shortcut choices list.
  4. Open Settings > Desktop app > General, find the Menu bar switch, turn it off, and check the icon disappears from the menu bar.

## S70.04 Dock/taskbar behavior.

- **Expected:** Clicking the dock/taskbar icon restores the app; closing the last window keeps it running on macOS and quits elsewhere.
- **Code:** done. Evidence present: apps/desktop/electron/main.ts:2722; apps/desktop/electron/main.ts:2770
- **Where to find it:** Red close button on the window, then the AGI Desktop icon in the Dock (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open a chat window and click the red close button at the top left.
  2. Look at the Dock: the AGI Desktop icon should still be there with its running dot.
  3. Click the AGI Desktop icon in the Dock.
  4. Check the chat window comes back. Compare with Expected.

## S70.05 Global shortcut.

- **Expected:** System-wide shortcuts (Quick Ask, screenshot, voice) work while another app is focused, are configurable and report conflicts.
- **Code:** done. Evidence present: apps/desktop/electron/shortcuts.ts:92; apps/desktop/electron/tray.ts:110; apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:320
- **Where to find it:** Settings > Desktop app > General > Quick Ask shortcut (dropdown) (labels found in the code)
- **Needs:** a Desktop app build
- **Steps:**
  1. Open Settings, choose the Desktop app group, then General.
  2. Find the row Quick Ask shortcut and open its dropdown.
  3. Pick another choice, or No shortcut.
  4. Click into another app and press the chosen key combination; check Quick Ask opens. For a conflict, check the note under the row: Already used by another Desktop shortcut or Already used by another app.

## S70.06 Quick composer.

- **Expected:** A global shortcut opens a small composer over any app where the user can type and send a prompt.
- **Code:** done. Evidence moved: apps/desktop/electron/appMenu.ts:183; apps/desktop/electron/quickAsk.ts:164; apps/desktop/electron/quickAsk.ts:12 (quoted code not found in the file now); apps/web/app/quick-ask/page.tsx:7
- **Where to find it:** File > Quick Ask (or the Quick Ask shortcut from any app) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. From any other app, press the Quick Ask shortcut, or click File > Quick Ask in AGI Desktop.
  2. Check a small window opens above the other windows.
  3. Type a short prompt in the box and send it.
  4. Check the answer appears in the small window.

## S70.07 Companion window.

- **Expected:** A compact companion window can stay open beside other apps while the user works elsewhere.
- **Code:** done. Evidence present: apps/desktop/electron/appMenu.ts:459; apps/desktop/electron/appMenu.ts:464
- **Where to find it:** not found in the code. Searched apps/desktop/electron and apps/web/features/desktop-host for companion; only a code comment in apps/desktop/electron/quickAsk.ts mentions companion windows. The nearest control is Quick Ask (floating window) and Window > Always on Top.

## S70.08 Always-on-top option.

- **Expected:** The user can choose to keep an app window above all other windows.
- **Code:** done. Evidence present: apps/desktop/electron/appMenu.ts:464; apps/desktop/electron/main.ts:1487
- **Where to find it:** Window > Always on Top (labels found in the code)
- **Steps:**
  1. Open a chat window and click Window in the menu bar.
  2. Click Always on Top so it shows a tick.
  3. Click into another app such as Notes or Finder.
  4. Check the AGI window stays above the other windows. Click Always on Top again to turn it off.

## S70.09 Multiple windows.

- **Expected:** The user can open more than one app window and move a conversation into its own window.
- **Code:** done. Evidence present: apps/desktop/electron/appMenu.ts:620; apps/desktop/electron/main.ts:1473
- **Where to find it:** Window > New Window; Window > Move Conversation to New Window (labels found in the code)
- **Needs:** a conversation to move
- **Steps:**
  1. Click Window > New Window and check a second AGI window opens.
  2. Open a conversation in one window.
  3. Click Window > Move Conversation to New Window.
  4. Check the conversation opens in its own window and the old window no longer shows it. Compare with Expected.

## S70.11 Native file picker.

- **Expected:** Choosing files or folders opens the operating system's own file dialog.
- **Code:** done. Evidence moved: apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx:378; apps/desktop/electron/runtime/dispatcher.ts:1402; apps/desktop/electron/main.ts:493 (quoted code not found in the file now)
- **Where to find it:** File > Open Folder (folder dialog); composer + > Add photos & files (file picker) (labels found in the code)
- **Needs:** a folder on the Mac
- **Steps:**
  1. Click File > Open Folder in the menu bar.
  2. Check the operating system's own folder dialog opens.
  3. Choose a folder and click Open.
  4. Check a notice says which folder was approved.

## S70.12 Persistent folder access.

- **Expected:** A folder the user approves stays approved across launches and can be reviewed and revoked.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/CapabilitiesSection.tsx:213; apps/web/features/desktop-host/components/LocalAccessSection.tsx:447; apps/desktop/electron/runtime/dispatcher.ts:759 (quoted code not found in the file now)
- **Where to find it:** Settings > Capabilities > Local access > Folders (labels found in the code)
- **Needs:** an approved folder
- **Steps:**
  1. Approve a folder with File > Open Folder.
  2. Open Settings, click Capabilities, and scroll to Local access.
  3. Quit AGI Desktop with Cmd+Q, reopen it, and return to Settings > Capabilities.
  4. Check the folder is still listed under Folders. Click Remove access in the confirmation to revoke it, then check it disappears.

## S70.13 Local filesystem search.

- **Expected:** The user or assistant can search approved local folders by file name or content.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx:392; packages/contracts/local-runtime/src/device-steps.ts:158; packages/contracts/local-runtime/src/device-steps.ts:165; apps/web/features/desktop-host/lib/device-steps.ts:365; apps/web/features/desktop-host/lib/device-steps.ts:373
- **Where to find it:** Composer + > Attach from local folder (labels found in the code)
- **Needs:** an approved folder and a file inside it
- **Steps:**
  1. In a new chat click the + button in the composer and click Attach from local folder.
  2. In the dialog Attach from a local folder, open an approved folder.
  3. Type a file name or some text in the box Search names and text and click Search.
  4. Check the results under Matching names and Matching text.

## S70.14 Local filesystem editing.

- **Expected:** The assistant can create or change files in a folder the user approved, after a permission prompt.
- **Code:** done. Evidence moved: apps/desktop/electron/runtime/dispatcher.ts:685; apps/desktop/electron/runtime/dispatcher.ts:2343; apps/web/features/desktop-host/lib/device-steps.ts:347; apps/web/lib/hooks/useChatStream.ts:1233 (quoted code not found in the file now)
- **Where to find it:** Composer + > Add working folder, then ask the assistant in chat (labels found in the code)
- **Needs:** an approved folder and a Desktop build
- **Steps:**
  1. In a new chat click + and choose Add working folder, then pick an approved folder.
  2. Type: Create a file named test.txt in this folder with the word hello.
  3. Check a permission prompt appears before anything is written.
  4. Approve it and check the file exists in the folder in Finder.

## S70.15 Local shell execution.

- **Expected:** The user or assistant can run a program in an approved folder, with approval, sandboxing and streamed output.
- **Code:** done. Evidence present: apps/web/features/settings/sections/CapabilitiesSection.tsx:213; apps/web/features/desktop-host/components/LocalAccessSection.tsx:547
- **Where to find it:** Composer + > Run a local command (labels found in the code)
- **Needs:** an approved folder and a Desktop build
- **Steps:**
  1. In a chat with an approved folder, click + and choose Run a local command.
  2. Type a harmless command such as ls and send it.
  3. Check an approval request appears before the command runs.
  4. Approve it and check the output streams into the chat. Settings > Capabilities > Local access shows the Commands section.

## S70.19 Screen/window capture.

- **Expected:** The user can capture the screen or a chosen window into the chat from the desktop app.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4461 (quoted code not found in the file now); apps/desktop/electron/main.ts:861; apps/desktop/electron/screenshot.ts:190
- **Where to find it:** File > Screenshot to Chat (labels found in the code)
- **Needs:** Screen Recording permission on macOS
- **Steps:**
  1. Click File > Screenshot to Chat in the menu bar.
  2. Choose the screen to capture if asked.
  3. Check the screenshot is attached in the chat composer.
  4. Send it and check the image appears in the conversation.

## S70.21 Computer use.

- **Expected:** The assistant can see the screen and move, click and type on the user's computer after permission, with stop and take-over.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/ComputerUseControlBar.tsx:51; apps/web/features/desktop-host/components/DesktopHostMount.tsx:55; apps/desktop/electron/runtime/computerUseSession.ts:126; apps/desktop/electron/appMenu.ts:197; apps/desktop/electron/runtime/dispatcher.ts:2602
- **Where to find it:** Settings > Desktop app > Computer use (turn on Any app); then the control bar shows Take over, Hand back, Stop (labels found in the code)
- **Needs:** Accessibility and Screen Recording permission on macOS, and a Desktop build
- **Steps:**
  1. Open Settings, click the Desktop app group, then Computer use, and turn on Any app.
  2. Ask the assistant in chat to click something on screen, and approve when asked.
  3. Check the control bar labelled Computer use appears with Take over or Hand back and Stop.
  4. Click Take over, then Stop, and check the assistant stops moving the pointer.

## S70.22 Remote-host service.

- **Expected:** The desktop app can act as a host that another device (phone) pairs with and drives remotely.
- **Code:** done. Evidence moved: apps/web/features/desktop-host/components/RemoteControlSection.tsx:118 (quoted code not found in the file now); apps/desktop/electron/remote/remoteControlService.ts:219
- **Where to find it:** Settings > Capabilities > Remote Control > Pair a phone (labels found in the code)
- **Needs:** a phone and a Desktop build
- **Steps:**
  1. Open Settings and click Capabilities.
  2. Scroll to Remote Control.
  3. Click Pair a phone and check a pairing code and QR code appear.
  4. Scan the code with the phone and check Connected to appears.

## S70.24 Launch at login.

- **Expected:** The user can choose to start the app automatically at login.
- **Code:** done. Evidence present: apps/desktop/electron/appMenu.ts:141; apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:296; apps/desktop/electron/launchAtLogin.ts:24
- **Where to find it:** Settings > Desktop app > General > Run on startup (labels found in the code)
- **Needs:** a Desktop build and a restart
- **Steps:**
  1. Open Settings, click Desktop app, then General.
  2. Turn on the switch Run on startup.
  3. Quit AGI Desktop and log out and back in, or restart the Mac.
  4. Check AGI Desktop opens by itself. Turn the switch off to stop it.

## S70.25 Background-runtime controls.

- **Expected:** The user can see and control what the desktop app keeps running in the background.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/BackgroundActivitySection.tsx:102; apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:448; apps/desktop/electron/runtime/backgroundActivity.ts:47; apps/desktop/electron/runtime/backgroundActivity.ts:69; apps/desktop/electron/runtime/dispatcher.ts:2644
- **Where to find it:** Settings > Desktop app > General > Running on this Mac (labels found in the code)
- **Needs:** a running agent or background task
- **Steps:**
  1. Start an agent task in a chat so something runs in the background.
  2. Open Settings, click Desktop app, then General.
  3. Find the section Running on this Mac and check it lists the running item.
  4. Click Stop next to it and check Nothing is running in the background appears.

## S70.26 Automatic updates.

- **Expected:** The app finds, downloads and installs new versions by itself (or with one click).
- **Code:** done. Evidence moved: apps/desktop/electron-builder.yml:82; .github/workflows/release-desktop-cloud.yml:257; apps/desktop/electron/desktopAutoUpdate.ts:33; apps/web/app/api/releases/desktop-cloud/update/[arch]/[version]/route.ts:49; apps/web/app/download/page.tsx:200 (quoted code not found in the file now); apps/web/features/desktop-host/components/DesktopUpdateRow.tsx:84
- **Earlier check in the running app:** PASS: Isolated Electron preview: a simulated download-complete event traveled through the real preload and changed the mounted Settings row from Downloading to Relaunch without a second check. The row fit at 320 pixels in both themes. No update package was downloaded or installed.
- **Where to find it:** Settings > Desktop app > General > App version > Check for updates (labels found in the code)
- **Needs:** a Desktop build; a newer published version to see the update path
- **Steps:**
  1. Open Settings, click Desktop app, then General.
  2. Find the row App version and click Check for updates.
  3. If a newer version exists, check the button changes to Download installer, then Relaunch to update.
  4. If none exists, check This is the latest version appears.

## S70.28 Diagnostic export.

- **Expected:** The user can export or copy diagnostics and open logs to send to support.
- **Code:** done. Evidence present: apps/desktop/electron/appMenu.ts:568; apps/desktop/electron/main.ts:1632
- **Where to find it:** Help > Troubleshooting > Copy Diagnostics (or Open Logs) (labels found in the code)
- **Steps:**
  1. Click Help in the menu bar and hover Troubleshooting.
  2. Click Copy Diagnostics.
  3. Paste into a text field (Cmd+V) and check diagnostic text appears.
  4. Go back to Help > Troubleshooting and click Open Logs, and check the log folder opens.

## S70.29 Local cache/storage management.

- **Expected:** The user can see and clear the desktop app's local cache and stored data.
- **Code:** done. Evidence present: apps/web/features/settings/components/WebSettingsModal.tsx:254; apps/web/features/desktop-host/components/StorageSettings.tsx:36; apps/web/features/desktop-host/components/StorageSettings.tsx:173
- **Where to find it:** Settings > Desktop app > Storage (labels found in the code)
- **Needs:** a Desktop build
- **Steps:**
  1. Open Settings, click Desktop app, then Storage.
  2. Check the heading Storage and the row Data folder show what is kept on the computer.
  3. Under Clean up, click Clear for the web cache or Delete for old logs, then confirm.
  4. Check the size goes down and the confirmation text Chats stay on this computer appears where chats are kept.

## S70.30 Native deep links.

- **Expected:** agiworkforce-cloud:// links and notification clicks open the app on the right screen.
- **Code:** done. Evidence present: apps/desktop/electron/main.ts:2574; apps/web/features/desktop-host/hooks/use-desktop-deep-links.ts:20
- **Where to find it:** no screen of its own. Accepted link paths are in apps/web/features/desktop-host/lib/deep-links.ts; the exact paths were not tested.
- **Needs:** a Desktop build and a link to open
- **Steps:**
  1. In Notes or Safari, open a link that starts with agiworkforce-cloud://.
  2. Check AGI Desktop opens or comes forward.
  3. Check it lands on the same screen the link names, such as a chat.
  4. Click a notification the app raised and check it opens that conversation.

## S70.31 OS-specific privacy settings.

- **Expected:** The app shows which OS privacy permissions and in-app grants it holds, explains how to change them, and lets the user revoke grants.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:190; apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:247; apps/desktop/electron/runtime/systemPermissions.ts:22; apps/desktop/electron/runtime/systemPermissions.ts:48
- **Where to find it:** Settings > Desktop app > General > Permissions (labels found in the code)
- **Needs:** a Desktop build and at least one saved answer
- **Steps:**
  1. Open Settings, click Desktop app, then General, and scroll to Permissions.
  2. Read Your answers and the system hint about computer use, screenshots and dictation.
  3. Click Open System Settings to check the macOS privacy pane opens.
  4. Click Remove on an answer and check it is gone, so Desktop asks again next time. Click Refresh to reload.
