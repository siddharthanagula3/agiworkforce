---
id: "PLAN-mobile-084"
type: "test-plan"
title: "Mobile · 84. General and appearance settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "84"
---
# Mobile · 84. General and appearance settings

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S84.03 Theme.

- **Expected:** The user can choose light, dark or system theme and it applies and persists.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/appearance/index.tsx:14; apps/mobile/src/features/settings/appearance/index.tsx:24
- **Where to find it:** Settings > Device > Appearance (open Settings from the side menu, then tap Appearance) (labels found in the code)
- **Steps:**
  1. Open the side menu and tap Settings.
  2. Under Device, tap Appearance.
  3. Tap Dark. The screen and app colours should switch to dark.
  4. Tap Light, then System. Each tap should move the selected tick and change the colours to match.
  5. Close the app completely, reopen it, and open Appearance again. The last choice should still be selected.

## S84.04 Accent color where offered.

- **Expected:** Where offered, the user can pick an accent colour that recolours the interface.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/index.tsx:470 (quoted code not found in the file now); apps/mobile/src/features/settings/accent-color/index.tsx:31
- **Where to find it:** Settings > Device > Accent Color (open Settings from the side menu, then tap Accent Color) (labels found in the code)
- **Steps:**
  1. Open the side menu and tap Settings.
  2. Under Device, tap Accent Color.
  3. Tap Blue. A tick should appear on Blue.
  4. Go back and look at selected controls and highlights. They should use the blue accent.
  5. Tap Neutral to return to the default and check the colours go back.

## S84.10 Default model.

- **Expected:** The user can set a default model that new conversations start with.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/models.tsx:244; apps/mobile/app/(app)/models.tsx:100 (quoted code not found in the file now)
- **Where to find it:** Settings > Device > General > Models (then tap a model name) (labels found in the code)
- **Needs:** a Free account can pick free models; a paid account is needed for paid models
- **Steps:**
  1. Open the side menu and tap Settings.
  2. Under Device, tap General.
  3. Tap Models. The row on General shows the current model name.
  4. Tap a different model name in the list (a model that cannot be picked opens the model picker instead).
  5. Go back to General and read the Models row, then start a new chat and check the model shown there matches.

## S84.11 Default effort.

- **Expected:** The user can set a default reasoning effort used for new turns.
- **Code:** done. Evidence present: apps/mobile/stores/agentControlStore.ts:50; apps/mobile/src/features/model-picker/components/EffortSlider.tsx:58
- **Where to find it:** Settings > Device > General > Default effort (slider) (labels found in the code)
- **Needs:** a model that offers effort levels
- **Steps:**
  1. Open the side menu and tap Settings.
  2. Under Device, tap General.
  3. Find the Default effort slider. If it is missing, the selected model has no effort steps, so choose a model with reasoning first on the Models row.
  4. Drag the Default effort slider to another step.
  5. Leave the screen, come back, and check the slider stays on the new step.

## S84.12 Default mode.

- **Expected:** The user can choose the default mode new conversations start in (e.g. chat vs agent/work, ask vs auto).
- **Code:** done. Evidence present: apps/mobile/src/features/drawer/components/DrawerContent.tsx:635; apps/mobile/src/features/chat/store/appModeStore.ts:66; apps/mobile/src/features/chat/store/appModeStore.ts:63
- **Where to find it:** not found in the code. No Settings control for a default agent mode was found. The only default written from Settings is effort (setProjectDefault is called only from EffortSlider.tsx); the built-in default is mode 'auto' in apps/mobile/stores/agentControlStore.ts. The Chat or Work switch (WorkModeSwitch.tsx, label 'Chat or Work') is per chat, not a default. Searched apps/mobile for AGENT_MODE_LABEL, 'Ask before edits', 'Edit automatically', useScopedMode and setProjectDefault.

## S84.17 Haptics.

- **Expected:** On devices with haptics, the user can turn haptic feedback on or off.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/general/index.tsx:143; apps/mobile/src/features/settings/general/index.tsx:58
- **Where to find it:** Settings > Device > General > Haptic Feedback (switch) (labels found in the code)
- **Needs:** a real phone with haptics (a simulator will not vibrate)
- **Steps:**
  1. Open the side menu and tap Settings.
  2. Under Device, tap General.
  3. Turn the Haptic Feedback switch off.
  4. On a phone with haptics, copy a chat reply with its copy control, or trigger an approval prompt, and feel for a vibration. There should be none.
  5. Turn Haptic Feedback on and repeat the same action. A short vibration should be felt.

## S84.18 Notification channels.

- **Expected:** The user can choose which channels (push, email, in-app/browser) deliver each notification category.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/notifications/NotificationCategoryDetailScreen.tsx:108; apps/mobile/services/pushPreferenceSync.ts:29
- **Where to find it:** Settings > Device > Notifications > Notification Types > Chat replies > Push notifications (switch) (labels found in the code)
- **Needs:** none; a device that has allowed notifications for push
- **Steps:**
  1. Open the side menu and tap Settings.
  2. Under Device, tap Notifications.
  3. Under Notification Types, tap a category such as Chat replies.
  4. Read the Push notifications switch and the Email notifications row under Delivery channels.
  5. Turn Push notifications off, go back, and check the category now shows Off.

## S84.19 Quiet hours.

- **Expected:** The user can set quiet hours during which notifications are held.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/notifications/index.tsx:186 (quoted code not found in the file now); apps/mobile/src/features/settings/notifications/index.tsx:370 (quoted code not found in the file now)
- **Where to find it:** Settings > Device > Time and focus > Enable quiet hours (or Settings > Device > Notifications > Quiet hours row, which opens Time and focus) (labels found in the code)
- **Steps:**
  1. Open the side menu and tap Settings.
  2. Under Device, tap Time and focus.
  3. Turn on Enable quiet hours.
  4. Tap a day chip to choose days, then set Quiet Hours Start and Quiet Hours End times.
  5. Go back to Notifications and check the Quiet hours row now reads On. Then check the held-notification behaviour against the note on this screen.
