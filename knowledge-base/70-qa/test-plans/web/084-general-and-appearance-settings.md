---
id: "PLAN-web-084"
type: "test-plan"
title: "Web · 84. General and appearance settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "84"
---
# Web · 84. General and appearance settings

15 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S84.01 Display language.

- **Expected:** The user can choose the interface display language and the UI switches to it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:850 (quoted code not found in the file now); apps/web/features/settings/components/LanguageSelector.tsx:13
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > General > Preferences > Display Language (labels found in the code)
- **Steps:**
  1. Sign in and open the account menu, then click Settings.
  2. On the General page, find the Preferences heading and the Display Language row.
  3. Open the Display Language dropdown (it lists languages by their own names) and pick a different language.
  4. Look at the page: the labels and menu text should switch to the chosen language, as Expected says.

## S84.03 Theme.

- **Expected:** The user can choose light, dark or system theme and it applies and persists.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:822 (quoted code not found in the file now); apps/web/features/settings/sections/GeneralSection.tsx:168 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Appearance > Theme (labels found in the code)
- **Steps:**
  1. Open Settings and click Appearance in the settings list.
  2. Under Theme, click Light, then Dark, then System.
  3. After each click, look at the whole page colours and check the chosen button is marked active.
  4. Reload the page and check the same theme is still selected.

## S84.04 Accent color where offered.

- **Expected:** Where offered, the user can pick an accent colour that recolours the interface.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:1017 (quoted code not found in the file now); apps/web/shared/components/AppearancePreferences.tsx:36
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Appearance > Accent colour (labels found in the code)
- **Steps:**
  1. Open Settings > Appearance.
  2. Find the Accent colour row of colour circles.
  3. Click one circle (each is labelled with its colour name followed by accent).
  4. Look for the check mark on the chosen circle and for buttons, links and highlights to take that colour. Click another circle and compare.

## S84.05 Text size.

- **Expected:** The user can change the chat text size and it applies across messages.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:1186 (quoted code not found in the file now); apps/web/shared/components/AppearancePreferences.tsx:20
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Appearance > Chat text size (labels found in the code)
- **Needs:** a chat with at least one reply
- **Steps:**
  1. Open Settings > Appearance.
  2. Choose Large in the Chat text size dropdown.
  3. Open a chat that has several replies.
  4. Compare message text with Small and Default; the size should change across messages.

## S84.07 Reduced motion.

- **Expected:** The user can reduce animation (in-app setting or honouring the OS reduce-motion preference).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:1095 (quoted code not found in the file now); apps/web/shared/components/AppearancePreferences.tsx:51
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Appearance > Motion (labels found in the code)
- **Steps:**
  1. Open Settings > Appearance.
  2. Under Motion, click Reduced.
  3. Look at the interface and replies for less animation, for example while a reply streams or a menu opens.
  4. Click System and compare the motion again.

## S84.08 Code theme.

- **Expected:** The user can choose the syntax-highlighting theme for code blocks.
- **Code:** done. Evidence present: apps/web/features/settings/sections/AppearanceSection.tsx:251; apps/web/features/settings/sections/AppearanceSection.tsx:81
- **Where to find it:** Settings > Appearance > Code theme (labels found in the code)
- **Needs:** a chat with a code block; dark mode to see the colours
- **Steps:**
  1. Open Settings > Appearance.
  2. Choose a theme in the Code theme dropdown.
  3. Open a chat that shows a code block, or ask for a short code sample.
  4. Compare code colours; the hint says the colours apply in dark mode and light mode keeps high contrast.

## S84.09 Code line wrapping.

- **Expected:** The user can turn line wrapping for code blocks on or off.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:1206 (quoted code not found in the file now); apps/web/shared/components/AppearancePreferences.tsx:25
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Appearance > Wrap long code lines (labels found in the code)
- **Needs:** a chat with a code block that has a long line
- **Steps:**
  1. Open Settings > Appearance.
  2. Turn on the switch labelled Wrap long code lines.
  3. Open a chat with a code block that has a very long line.
  4. Check the long line wraps onto new lines; turn the switch off and check it no longer wraps.

## S84.10 Default model.

- **Expected:** The user can set a default model that new conversations start with.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:410; apps/web/features/settings/sections/GeneralSection.tsx:918 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > General > Preferences > Default model (labels found in the code)
- **Needs:** a Free account to see the Free choices; a paid account to pick a model marked Upgrade to use
- **Steps:**
  1. Open Settings > General.
  2. In Preferences, open the Default model dropdown.
  3. Choose a model name, or leave Last used.
  4. Start a new chat and check the model shown for it matches your choice.

## S84.11 Default effort.

- **Expected:** The user can set a default reasoning effort used for new turns.
- **Code:** done. Evidence present: apps/web/features/settings/sections/GeneralSection.tsx:504; apps/web/features/settings/sections/GeneralSection.tsx:502
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > General > Preferences > Reasoning effort (labels found in the code)
- **Needs:** a paid account to pick levels marked not on your plan
- **Steps:**
  1. Open Settings > General.
  2. In Preferences, open the Reasoning effort dropdown.
  3. Choose a level other than Off.
  4. Start a new chat and check the effort control in the composer shows that level.

## S84.12 Default mode.

- **Expected:** The user can choose the default mode new conversations start in (e.g. chat vs agent/work, ask vs auto).
- **Code:** done. Evidence present: apps/web/features/settings/sections/GeneralSection.tsx:589; apps/web/features/settings/sections/GeneralSection.tsx:307
- **Where to find it:** Settings > General > Preferences > New chats start in (labels found in the code)
- **Needs:** none; if the hint under the row says your plan lacks Work, a plan that includes Work
- **Steps:**
  1. Open Settings > General.
  2. In Preferences, open the New chats start in dropdown.
  3. Choose Work, then click the new chat button and check the new chat opens in Work.
  4. Set it back to Chat and check the next new chat opens in Chat.

## S84.14 Send-key behavior.

- **Expected:** The user can choose whether Enter sends or inserts a newline (and which modifier sends).
- **Code:** done. Evidence present: apps/web/features/settings/sections/GeneralSection.tsx:614; apps/web/features/settings/sections/GeneralSection.tsx:325
- **Where to find it:** Settings > General > Composer > Send with Enter (labels found in the code)
- **Steps:**
  1. Open Settings > General and scroll to the Composer heading.
  2. Turn Send with Enter on, go to a chat, type a line and press Enter; the message should send.
  3. Read the hint under the switch: it names the send keys for this computer, such as Cmd + Enter on a Mac.
  4. Turn the switch off, type a line and press Enter; it should start a new line, and the send keys should send.

## S84.15 Keyboard shortcuts.

- **Expected:** Settings let the user view and customise (disable or rebind) keyboard shortcuts.
- **Code:** done. Evidence present: apps/web/features/settings/sections/GeneralSection.tsx:727; apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx:207
- **Earlier check in the running app:** PARTIAL: E007 [PARTIAL; interaction]: Shortcut dialog renders grouped shortcuts with macOS modifier labels and enabled states; preferences were not changed. Opening the dialog logs React invalid nesting: div inside p (hydration warning).
- **Where to find it:** Settings > Keyboard, or Settings > General > Preferences > Keyboard shortcuts > View shortcuts (labels found in the code)
- **Steps:**
  1. Open Settings and click Keyboard (or open General and click View shortcuts).
  2. Find a shortcut with a Change keys for button and click it, then press a new key combination.
  3. Turn that shortcut's switch off and check it is marked off in the list.
  4. Click Restore defaults and confirm; check the keys and switches return to their defaults.

## S84.18 Notification channels.

- **Expected:** The user can choose which channels (push, email, in-app/browser) deliver each notification category.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/NotificationsSection.tsx:38 (quoted code not found in the file now); apps/web/features/settings/sections/NotificationsSection.tsx:145 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E026 [UI_ONLY; scoped settings observation]: Notification channels visible; delivery not tested.
- **Where to find it:** Settings > Notifications, then the dropdown on a row such as Scheduled task finished (labels found in the code)
- **Needs:** none for Email; Browser needs browser notification permission; Mobile push needs the phone app (unsure)
- **Steps:**
  1. Open Settings and click Notifications.
  2. Find the row Scheduled task finished and open its dropdown.
  3. Choose Email, then open it again and choose Off.
  4. Check the row's selected value changes each time; the options list only channels released for this app.

## S84.19 Quiet hours.

- **Expected:** The user can set quiet hours during which notifications are held.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TimeFocusSection.tsx:89; apps/web/features/settings/sections/TimeFocusSection.tsx:92
- **Earlier check in the running app:** UI_ONLY: E029 [UI_ONLY; scoped settings observation]: Break reminders and quiet hours controls visible; not enabled.
- **Where to find it:** Settings > Time and focus > Quiet hours (labels found in the code)
- **Steps:**
  1. Open Settings and click Time and focus.
  2. Turn on the switch next to Quiet hours, then set Start, End and Days.
  3. Click the save control on the page (its visible label was not found in code) and wait for the status text.
  4. Reload the page and check Quiet hours still shows your times and days.

## S84.23 Sidebar behavior.

- **Expected:** The user can configure sidebar behaviour (which items show, collapsed by default, auto-hide).
- **Code:** done. Evidence present: apps/web/features/settings/sections/GeneralSection.tsx:567; apps/web/features/settings/sections/GeneralSection.tsx:544
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > General > Preferences > Sidebar items (collapse: the Toggle sidebar button in the sidebar) (labels found in the code)
- **Steps:**
  1. Open Settings > General and find the Sidebar items row.
  2. Click a destination button to switch it off, then look at the left sidebar: that item should be gone.
  3. Click the same button again to show it; the item returns.
  4. Click the Toggle sidebar button in the sidebar and check it collapses; click again to expand.
