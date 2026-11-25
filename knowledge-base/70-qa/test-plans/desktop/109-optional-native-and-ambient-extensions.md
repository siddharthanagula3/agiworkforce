---
id: "PLAN-desktop-109"
type: "test-plan"
title: "Desktop · 109. Optional native and ambient extensions"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "109"
---
# Desktop · 109. Optional native and ambient extensions

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S109.03 Menu-bar quick actions.

- **Expected:** A menu-bar (or equivalent quick menu) offers one-click AGI actions such as new chat, quick ask, screenshot and voice.
- **Code:** done. Evidence present: apps/desktop/electron/tray.ts:170; apps/desktop/electron/main.ts:1937
- **Where to find it:** Menu bar icon (Desktop) > New Chat, Quick Ask, Screenshot to Chat, Window to Chat, Dictation (labels found in the code)
- **Needs:** macOS with the desktop app running
- **Steps:**
  1. Turn on the menu bar icon: Settings > General desktop settings > Menu bar (the toggle, which is on by default in the code is not confirmed).
  2. Click the Desktop icon in the macOS menu bar.
  3. Look for the items New Chat, Quick Ask, Screenshot to Chat, Window to Chat and Dictation, each with its shortcut shown beside it.
  4. Click New Chat and check that a new chat opens; compare with the one-click quick actions in Expected.

## S109.04 Desktop companion.

- **Expected:** A desktop companion pairs with the user's phone so desktop work can be started, watched or approved from the phone.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/RemoteControlSection.tsx:293; apps/desktop/electron/remote/remoteControlService.ts:219
- **Where to find it:** Settings > Capabilities > Remote Control > Pair a phone (labels found in the code)
- **Needs:** a paid account, a phone with AGI Mobile, a camera on the phone to scan the QR code
- **Steps:**
  1. Sign in on the desktop app and open Settings, then the Capabilities tab.
  2. Scroll to the Remote Control section and click Pair a phone.
  3. Confirm the on-screen pairing code and scan the QR code with the phone (in AGI Mobile: AGI Code > Add device).
  4. Watch the status in the Remote Control section: it should show the phone as connected; use Disconnect phone to stop. Compare with the phone pairing in Expected.

## S109.05 Compact floating assistant.

- **Expected:** A compact assistant floats over other content (other apps or pages) and can take a prompt without opening the full app.
- **Code:** done. Evidence present: apps/desktop/electron/appMenu.ts:183; apps/desktop/electron/quickAsk.ts:76
- **Where to find it:** Press Alt+Shift+Space (Quick Ask shortcut, from any app), or File > Quick Ask (some labels not found in the code; trust the screen)
- **Needs:** none (a signed-in account is needed to get a reply)
- **Steps:**
  1. Open another app or web page so it is in front.
  2. Press Alt+Shift+Space (the default Quick Ask chord; it can be changed in Settings > General desktop settings > Quick Ask shortcut).
  3. A small panel (about 480 by 620 pixels, always on top) appears over the other content; type a prompt into it.
  4. Check that the prompt is accepted from the panel without the full main window opening; press Escape to hide the panel again.

## S109.07 Global dictation.

- **Expected:** Dictation to AGI can be started from anywhere on the device (global shortcut or system voice command) without first opening the app.
- **Code:** done. Evidence moved: apps/desktop/electron/quickAsk.ts:19; apps/desktop/electron/quickAsk.ts:72; apps/desktop/electron/main.ts:2702; apps/desktop/electron/voiceDictation.ts:42 (quoted code not found in the file now)
- **Where to find it:** Press Alt+Shift+V (Dictation shortcut, from any app), or menu bar icon > Dictation (labels found in the code)
- **Needs:** a microphone, Desktop app permission for the microphone
- **Steps:**
  1. Click into a text field in another app (for example Notes) so it has focus.
  2. Press Alt+Shift+V to start dictation.
  3. Speak, then press Alt+Shift+V again to finish.
  4. Check that the spoken words reach AGI (the main window or Quick Ask) or are typed into the app in front when Settings > General desktop settings > Dictate into the app you are using is on.

## S109.09 Screenshot-to-chat shortcut.

- **Expected:** A shortcut captures the screen and attaches it to an AGI chat.
- **Code:** done. Evidence present: apps/desktop/electron/appMenu.ts:190; apps/desktop/electron/screenshot.ts:190; apps/desktop/electron/shortcuts.ts:100
- **Where to find it:** Press Cmd+Shift+2 (Screenshot to Chat shortcut, from any app), or File > Screenshot to Chat, or menu bar icon > Screenshot to Chat (labels found in the code)
- **Needs:** macOS Screen & System Audio Recording permission for the desktop app
- **Steps:**
  1. Open the content you want to capture on the screen and leave it visible.
  2. Press Cmd+Shift+2 (the default; the first listed option for this shortcut).
  3. Wait for the app to hide briefly, then open the AGI chat (main window or Quick Ask) and check that the screenshot is attached to the composer.
  4. If the composer was not ready, look for the notice Screenshot copied to clipboard and paste with Cmd+V into the composer. On a permission problem look for the notice Screenshot failed.

## S109.10 Window-to-chat shortcut.

- **Expected:** A shortcut captures one chosen window (not the whole screen) into an AGI chat.
- **Code:** done. Evidence moved: packages/contracts/local-runtime/src/host-bridge.ts:70 (quoted code not found in the file now); apps/desktop/electron/screenshot.ts:142; apps/desktop/electron/screenshot.ts:167; apps/desktop/electron/main.ts:1938; apps/desktop/electron/native/macos/agi-input.swift:217; apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:106
- **Where to find it:** Bring another app's window to the front, press Cmd+Shift+1 (Window to Chat shortcut), or menu bar icon > Window to Chat (labels found in the code)
- **Needs:** macOS Screen & System Audio Recording permission; a second app window to capture
- **Steps:**
  1. Bring one app window (not the AGI window) to the front, and click it so it is the frontmost window.
  2. Press Cmd+Shift+1 (the default Window to Chat chord).
  3. Check the AGI chat composer: it should hold an image of only that window, not the whole screen.
  4. If no other window is in front, look for the notice No other app window is in front to capture.
