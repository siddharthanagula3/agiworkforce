---
id: "PLAN-desktop-084"
type: "test-plan"
title: "Desktop · 84. General and appearance settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "84"
---
# Desktop · 84. General and appearance settings

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S84.01 Display language.

- **Expected:** The user can choose the interface display language and the UI switches to it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:850 (quoted code not found in the file now); apps/web/features/settings/components/LanguageSelector.tsx:13
- **Where to find it:** Settings > General > Display Language (labels found in the code)
- **Steps:**
  1. Open Settings and choose General in the settings list (the group is titled Settings).
  2. Find the row labelled Display Language and open its drop-down (options show a flag and the language's own name).
  3. Pick a different language.
  4. Look at whether the interface text switches to that language, and compare with Expected.

## S84.03 Theme.

- **Expected:** The user can choose light, dark or system theme and it applies and persists.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:822 (quoted code not found in the file now); apps/web/features/settings/sections/GeneralSection.tsx:168 (quoted code not found in the file now)
- **Where to find it:** Settings > Appearance > Theme (labels found in the code)
- **Steps:**
  1. Open Settings and choose Appearance.
  2. Find the row labelled Theme with three buttons: System, Light, Dark.
  3. Click Light, then Dark, then System.
  4. Look whether the colours of the whole app change each time and whether the choice is still selected after closing and reopening Settings.

## S84.04 Accent color where offered.

- **Expected:** Where offered, the user can pick an accent colour that recolours the interface.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:1017 (quoted code not found in the file now); apps/web/shared/components/AppearancePreferences.tsx:36
- **Where to find it:** Settings > Appearance > Accent colour (labels found in the code)
- **Steps:**
  1. Open Settings and choose Appearance.
  2. Find the row labelled Accent colour and its group of colour buttons.
  3. Click a different accent colour.
  4. Look whether buttons, links and highlights across the app take the new colour.

## S84.05 Text size.

- **Expected:** The user can change the chat text size and it applies across messages.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:1186 (quoted code not found in the file now); apps/web/shared/components/AppearancePreferences.tsx:20
- **Where to find it:** Settings > Appearance > Chat text size (labels found in the code)
- **Needs:** a chat with some messages
- **Steps:**
  1. Open Settings and choose Appearance.
  2. Find the row labelled Chat text size and open its drop-down.
  3. Choose Large, then Small.
  4. Open a chat with several messages and look whether message text grows and shrinks.

## S84.07 Reduced motion.

- **Expected:** The user can reduce animation (in-app setting or honouring the OS reduce-motion preference).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:1095 (quoted code not found in the file now); apps/web/shared/components/AppearancePreferences.tsx:51
- **Where to find it:** Settings > Appearance > Motion (labels found in the code)
- **Steps:**
  1. Open Settings and choose Appearance.
  2. Find the row labelled Motion with two buttons: System and Reduced.
  3. Click Reduced.
  4. Trigger an animation in chat (for example send a message or open a menu) and look whether motion is reduced; then check that System follows the device reduce-motion setting.

## S84.08 Code theme.

- **Expected:** The user can choose the syntax-highlighting theme for code blocks.
- **Code:** done. Evidence present: apps/web/features/settings/sections/AppearanceSection.tsx:251; apps/web/features/settings/sections/AppearanceSection.tsx:81
- **Where to find it:** Settings > Appearance > Code theme (labels found in the code)
- **Needs:** a chat that shows a code block
- **Steps:**
  1. Open Settings and choose Appearance.
  2. Find the row labelled Code theme and open its drop-down.
  3. Pick a different code theme.
  4. Open a chat that shows a code block and look whether its colours change.

## S84.09 Code line wrapping.

- **Expected:** The user can turn line wrapping for code blocks on or off.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:1206 (quoted code not found in the file now); apps/web/shared/components/AppearancePreferences.tsx:25
- **Where to find it:** Settings > Appearance > Wrap long code lines (labels found in the code)
- **Needs:** a chat with a long line of code
- **Steps:**
  1. Open Settings and choose Appearance.
  2. Find the row labelled Wrap long code lines and turn its switch on or off.
  3. Open a chat with a code block that has a very long line.
  4. Look whether the long line wraps onto the next line or runs off to the side.

## S84.10 Default model.

- **Expected:** The user can set a default model that new conversations start with.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:410; apps/web/features/settings/sections/GeneralSection.tsx:918 (quoted code not found in the file now)
- **Where to find it:** Settings > General > Default model (labels found in the code)
- **Needs:** none; a model marked Upgrade to use needs a paid plan to choose
- **Steps:**
  1. Open Settings and choose General.
  2. Find the row labelled Default model and open its drop-down; the first option is Last used.
  3. Pick a model name (a model marked Upgrade to use is locked to your plan).
  4. Open a new chat and look whether the model picker starts on the chosen model.

## S84.11 Default effort.

- **Expected:** The user can set a default reasoning effort used for new turns.
- **Code:** done. Evidence present: apps/web/features/settings/sections/GeneralSection.tsx:504; apps/web/features/settings/sections/GeneralSection.tsx:502
- **Where to find it:** Settings > General > Reasoning effort (labels found in the code)
- **Steps:**
  1. Open Settings and choose General.
  2. Find the row labelled Reasoning effort and open its drop-down.
  3. Choose a different effort level (levels above your plan are marked and cannot be picked).
  4. Open a new chat and look whether the effort picker in the composer shows the chosen level.

## S84.12 Default mode.

- **Expected:** The user can choose the default mode new conversations start in (e.g. chat vs agent/work, ask vs auto).
- **Code:** done. Evidence present: apps/web/features/settings/sections/GeneralSection.tsx:589; apps/web/features/settings/sections/GeneralSection.tsx:307
- **Where to find it:** Settings > General > New chats start in (labels found in the code)
- **Needs:** a paid plan may be needed for Work (the row shows a plan hint)
- **Steps:**
  1. Open Settings and choose General.
  2. Find the row labelled New chats start in and open its drop-down (options Chat and Work).
  3. Choose Work.
  4. Click the new-chat control and look whether the new chat opens in Work mode.

## S84.14 Send-key behavior.

- **Expected:** The user can choose whether Enter sends or inserts a newline (and which modifier sends).
- **Code:** done. Evidence present: apps/web/features/settings/sections/GeneralSection.tsx:614; apps/web/features/settings/sections/GeneralSection.tsx:325
- **Where to find it:** Settings > General > Composer > Send with Enter (labels found in the code)
- **Steps:**
  1. Open Settings and choose General, then scroll to the heading Composer.
  2. Turn the switch on the row labelled Send with Enter on or off.
  3. Read the hint under the row (it says Off: Enter starts a new line and the key combination sends).
  4. Open a chat, type two lines, press Enter, and look whether the message sends or a new line is added.

## S84.15 Keyboard shortcuts.

- **Expected:** Settings let the user view and customise (disable or rebind) keyboard shortcuts.
- **Code:** done. Evidence present: apps/desktop/electron/settingsStore.ts:37; apps/desktop/electron/appMenu.ts:183
- **Where to find it:** Settings > General > Keyboard shortcuts > View shortcuts, or Settings > Keyboard (labels found in the code)
- **Steps:**
  1. Open Settings and choose General, then find the row labelled Keyboard shortcuts and click View shortcuts (or choose the Keyboard item in the settings list).
  2. Read the list of shortcuts and search with the field labelled Search shortcuts.
  3. Click the control labelled Change keys for a rebindable shortcut and press a new key combination.
  4. Turn off a shortcut with its on/off switch and look whether the list updates and the key stops working.

## S84.18 Notification channels.

- **Expected:** The user can choose which channels (push, email, in-app/browser) deliver each notification category.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/NotificationsSection.tsx:38 (quoted code not found in the file now); apps/web/features/settings/sections/NotificationsSection.tsx:145 (quoted code not found in the file now)
- **Where to find it:** Settings > Notifications (labels found in the code)
- **Needs:** a second device or email inbox to confirm delivery; mobile push needs the phone app
- **Steps:**
  1. Open Settings and choose Notifications.
  2. Find the event rows (for example Reply ready, Scheduled task finished, Security alerts) and open the choice for each.
  3. Choose a channel combination (Browser, Email, Mobile push, or Push where shown) or Off.
  4. Trigger or wait for that event and look whether it arrives on the chosen channel only.

## S84.19 Quiet hours.

- **Expected:** The user can set quiet hours during which notifications are held.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TimeFocusSection.tsx:89; apps/web/features/settings/sections/TimeFocusSection.tsx:92
- **Where to find it:** Settings > Time and focus > Quiet hours (labels found in the code)
- **Steps:**
  1. Open Settings and choose Time and focus.
  2. Find the row labelled Quiet hours and turn on its switch labelled Enable quiet hours.
  3. Set the start and end time using the fields labelled Quiet hours start and Quiet hours end.
  4. Read the note under the row (it says notifications are held, and approvals and failures still arrive) and compare with Expected.

## S84.21 Launch-at-login preference.

- **Expected:** The desktop app can be set to launch at login.
- **Code:** done. Evidence present: apps/desktop/electron/appMenu.ts:141; apps/desktop/electron/launchAtLogin.ts:24
- **Where to find it:** Settings > Desktop app > General > Run on startup (desktop app only) (labels found in the code)
- **Needs:** the Electron desktop app on a Mac
- **Steps:**
  1. In the desktop app, open Settings and choose General under the group Desktop app.
  2. Find the row labelled Run on startup and turn its switch on.
  3. Optionally open the Mac app menu (the app name menu) and look for the item Launch at Login, which should show a tick.
  4. Quit and reopen the Mac, or log out and back in, and look whether AGI opens by itself.

## S84.22 Companion-window preference.

- **Expected:** The user can configure the companion/quick-access window (enable, shortcut, where it appears).
- **Code:** done. Evidence present: apps/desktop/electron/appMenu.ts:183; apps/desktop/electron/settingsStore.ts:37
- **Where to find it:** Settings > Desktop app > General > Quick Ask shortcut (desktop app only) (labels found in the code)
- **Needs:** the Electron desktop app on a Mac
- **Steps:**
  1. In the desktop app, open Settings, choose General under Desktop app, and find the row labelled Quick Ask shortcut.
  2. Open its drop-down (it lists shortcut choices, and No shortcut) and pick a different key combination or No shortcut.
  3. Press the chosen combination from another app and look whether the Quick Ask window appears.
  4. Open the Mac app menu or File menu and look for the item Quick Ask to compare the shortcut shown.

## S84.23 Sidebar behavior.

- **Expected:** The user can configure sidebar behaviour (which items show, collapsed by default, auto-hide).
- **Code:** done. Evidence present: apps/web/features/settings/sections/GeneralSection.tsx:567; apps/web/features/settings/sections/GeneralSection.tsx:544
- **Where to find it:** Settings > General > Sidebar items (labels found in the code)
- **Steps:**
  1. Open Settings and choose General, then find the row labelled Sidebar items.
  2. Click a destination name (the hint says Hide anything you do not use from the left rail) to switch it off; click again to switch it on.
  3. Close Settings and look at the left rail; the switched-off item should disappear and reappear when switched back on.
  4. Check whether there is any control for collapsed-by-default or auto-hide (none was found).
