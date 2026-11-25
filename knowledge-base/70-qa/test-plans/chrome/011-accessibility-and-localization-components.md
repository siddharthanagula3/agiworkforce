---
id: "PLAN-chrome-011"
type: "test-plan"
title: "Chrome · 11. Accessibility and localization components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "11"
---
# Chrome · 11. Accessibility and localization components

18 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S11.01 Accessible control labels.

- **Expected:** Every interactive control exposes an accessible name (visible text, aria-label or platform equivalent) that says what it does.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** no screen of its own. Names are set in code for many controls (aria-label in apps/extension/src/side_panel.ts); the code audit did not check every control.
- **Needs:** a Mac with VoiceOver
- **Steps:**
  1. Turn on VoiceOver (Command+F5).
  2. Move VoiceOver focus to the Recent chats button at the top right of the side panel, then to the Send message button beside the message box.
  3. Listen: each control should speak a name that says what it does.
  4. Compare with Expected.

## S11.02 Semantic heading hierarchy.

- **Expected:** Each screen has a top heading and sections use nested headings, so screen-reader users can jump by heading.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/schedulesSection.ts:437; apps/extension/src/side_panel.ts:10919 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The Chat panel's top heading is a visually hidden h1 (apps/extension/src/side_panel.ts). The Schedules heading on the options page is an h2 at the same level as the Shortcuts section heading (apps/extension/src/features/options/shortcuts-section.ts), so it is not nested under it.
- **Needs:** a Mac with VoiceOver
- **Steps:**
  1. Turn on VoiceOver (Command+F5).
  2. Press VO+U, then choose Headings.
  3. Check that the list has a top heading for the Chat panel and a heading called Recent chats.
  4. Compare with Expected.

## S11.03 Keyboard navigation.

- **Expected:** Everything can be reached and operated from the keyboard, including menus with arrow keys and Escape.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:8651 (quoted code not found in the file now); apps/extension/__tests__/side-panel-a11y.test.ts:51; apps/extension/src/side_panel.ts:13496
- **Where to find it:** Side panel: Tab key from the top of the panel, then the More menu and Recent chats (labels found in the code)
- **Steps:**
  1. Click an empty part of the side panel, then press Tab over and over; focus should reach the top buttons, the Chat and Computer Use tabs and the message box.
  2. Press Return on the More button, press Down and Up arrow keys, then press Escape.
  3. Press Return on the Recent chats button, press Tab through the sheet, then press Escape.
  4. Compare with Expected: all controls reachable, arrows move through the menu, Escape closes.

## S11.04 Visible focus indicators.

- **Expected:** The focused control always shows a clearly visible focus indicator when navigating by keyboard.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2061; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Side panel: Tab key from the top of the panel, starting near the message box (labels found in the code)
- **Steps:**
  1. Press Tab repeatedly from the top of the side panel.
  2. Watch the focused control; it should show a clear outline or ring.
  3. Check the message box placeholder and the buttons beside it.
  4. Compare with Expected.

## S11.05 Focus management across dialogs.

- **Expected:** Opening a dialog moves focus into it, Tab stays inside it, and Escape closes it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:5814 (quoted code not found in the file now); apps/extension/__tests__/side-panel-a11y.test.ts:95 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5529 (quoted code not found in the file now)
- **Where to find it:** Side panel > Recent chats (clock icon at top right) (labels found in the code)
- **Steps:**
  1. Click the Recent chats button (clock icon).
  2. Check that focus moves into the sheet: the search box or the Close recent chats button should be focused.
  3. Press Tab repeatedly; focus should stay inside the sheet and wrap around.
  4. Press Escape; the sheet should close. Compare with Expected.

## S11.06 Focus restoration after panel closure.

- **Expected:** Closing a dialog, menu or panel returns focus to the control that opened it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:5767 (quoted code not found in the file now); apps/extension/__tests__/side-panel-a11y.test.ts:101 (quoted code not found in the file now); apps/extension/src/side_panel.ts:9046 (quoted code not found in the file now)
- **Where to find it:** Side panel > Recent chats (clock icon at top right) (labels found in the code)
- **Steps:**
  1. Note which button you pressed: the clock icon labelled Recent chats.
  2. Open Recent chats, then close it with Escape or the Close recent chats button.
  3. Check that focus returns to the clock icon (it should show a focus ring).
  4. Compare with Expected.

## S11.07 Screen-reader announcements for completed events.

- **Expected:** When something finishes (a reply, a tool step, a save, a connection), a screen reader hears a short announcement without moving focus.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13654; apps/extension/src/features/side-panel/bubbles.ts:355; apps/extension/src/side_panel.ts:5934
- **Where to find it:** Chat: type in the message box and press Return (labels found in the code)
- **Needs:** an account that can get a reply
- **Steps:**
  1. Turn on VoiceOver (Command+F5).
  2. Click the message box, type a short question and press Return.
  3. When the reply finishes, listen for a short spoken update while VoiceOver focus stays on the box.
  4. Compare with Expected: a short announcement, focus not moved.

## S11.08 Non-spammy streaming announcements.

- **Expected:** A streaming reply is announced calmly (in word-bounded chunks or once when done), never token by token and never twice.
- **Code:** unverified. Evidence present: apps/extension/src/side_panel.ts:13654
- **Needs:** live-web
- **Where to find it:** Chat: type in the message box and press Return (labels found in the code)
- **Needs:** an account that can get a reply
- **Steps:**
  1. Turn on VoiceOver (Command+F5).
  2. Click the message box, type a question that needs a long answer, and press Return.
  3. Listen while the answer streams: it should not speak each word, and it should not repeat text.
  4. Compare with Expected.

## S11.09 Accessible tool and approval status.

- **Expected:** Tool steps and approval requests expose their state (running, done, failed, waiting for approval) to assistive tech, with labelled approve and deny controls.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:493 (quoted code not found in the file now); apps/extension/src/features/side-panel/bubbles.ts:982; apps/extension/src/features/side-panel/bubbles.ts:1006
- **Where to find it:** Chat: an approval card inside a reply when a tool needs approval (labels found in the code)
- **Needs:** a task that needs tool approval
- **Steps:**
  1. Start a task that makes the agent use a tool which needs approval (the tool depends on the task).
  2. When the card says Your approval is required before this tool can run., check that VoiceOver announces it.
  3. Tab to the Approve and Decline buttons; both should have clear names.
  4. Press Approve, then check that the card shows a recorded status. Compare with Expected.

## S11.10 Touch equivalents for hover interactions.

- **Expected:** Anything revealed on hover is also reachable by touch (always visible on touch screens or shown on tap).
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2451; apps/extension/src/side_panel.ts:2453; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Chat: any reply; the Copy response button (labels found in the code)
- **Needs:** a Mac with a touch screen to test touch; the keyboard check works on any Mac
- **Steps:**
  1. Send a message and wait for a reply.
  2. Move the pointer over the reply; the Copy response button should appear.
  3. Press Tab until the Copy response button is focused; it should show now without hovering.
  4. Compare with Expected.

## S11.12 Text resizing.

- **Expected:** Text scales with the user's text-size setting (browser, OS or app) up to at least 200% without being cut off.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** no screen of its own. The code audit found no location; no in-app text-size control was found in the app code and the rule was not checked in code.
- **Steps:**
  1. Raise the text size in the browser or OS settings.
  2. Open the side panel and read a chat reply, the Recent chats list and the model menu.
  3. Check that no text is cut off. Compare with Expected.

## S11.13 Browser-zoom reflow.

- **Expected:** At high browser zoom (400%) the layout reflows to one column with no horizontal scrolling.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** no screen of its own. The code audit found no location, so the reflow rule was not confirmed in code.
- **Steps:**
  1. Open the side panel in Chrome.
  2. Press Command+Plus in Chrome until the zoom reads 400%.
  3. Check that the layout becomes one column with no horizontal scrollbar.
  4. Compare with Expected.

## S11.14 Reduced motion.

- **Expected:** With the OS or app reduced-motion preference on, looping and travelling animation stops or is replaced.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:4622; apps/extension/src/features/content/in-page-panel/panelStyles.ts:269; apps/extension/src/side_panel.ts:5518
- **Where to find it:** no screen of its own. The rule is in apps/extension/src/side_panel.ts and apps/extension/src/tokens.ts (agi-loading-mark). The macOS path was not checked in the repository.
- **Steps:**
  1. Turn on Reduce motion in macOS System Settings > Accessibility > Display (this path is an OS setting, not in the repository).
  2. Open the side panel and send a message.
  3. Watch the typing dots and loading mark: they should stop or barely move.
  4. Compare with Expected.

## S11.21 Input-method composition support.

- **Expected:** Typing with an input method (Japanese, Chinese, Korean) never sends the message when Enter confirms a composition.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:9751 (quoted code not found in the file now); apps/extension/src/side_panel.ts:14175
- **Where to find it:** Chat: message box with a Japanese, Chinese or Korean input method (labels found in the code)
- **Needs:** a Japanese, Chinese or Korean input method on the Mac
- **Steps:**
  1. Switch the Mac input method to Japanese (the input method is an OS setting).
  2. Click the message box and type a word such as konnichiwa, then press Return to confirm the conversion.
  3. Check that the message is not sent and the converted text stays in the box.
  4. Press Return again and check that the message is sent. Compare with Expected.

## S11.22 Locale-aware dates and numbers.

- **Expected:** Dates, times and numbers are formatted for the user's locale rather than a fixed US format.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel > Recent chats (dates and times on chat rows) (labels found in the code)
- **Needs:** a Mac set to a non-English locale
- **Steps:**
  1. Set the Mac language and region to a non-English locale (an OS setting).
  2. Click Recent chats and read the dates and times on the rows.
  3. Compare the date and number formats with Expected.
  4. Note that the labels stay in English because only the English catalog exists.

## S11.24 Pluralization.

- **Expected:** Counted phrases follow each language's plural rules rather than an English "s" suffix.
- **Code:** done. Evidence present: apps/extension/src/i18n.ts:13
- **Where to find it:** Chat > Add attachment > Attach tabs; then the attached-tabs chip above the message box (labels found in the code)
- **Needs:** two Chrome tabs open
- **Steps:**
  1. Have one Chrome tab open besides the side panel, click Add attachment, then Attach tabs, and attach it.
  2. Read the chip text: it should say 1 tab attached.
  3. Attach a second tab the same way; the chip should now say 2 tabs attached.
  4. Compare with Expected: singular and plural forms are correct.

## S11.25 Translated error messages.

- **Expected:** Error messages appear in the user's chosen language.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/voice.ts:32
- **Where to find it:** Chat > Voice input (microphone button) (labels found in the code)
- **Needs:** a microphone, and Chrome site settings access to block it
- **Steps:**
  1. In Chrome site settings, block the microphone for the extension.
  2. Click Voice input in the message box.
  3. Read the message that appears; it should say the microphone is blocked.
  4. Compare with Expected.

## S11.27 Long-label and translated-copy layouts.

- **Expected:** Long labels and longer translated strings wrap or truncate cleanly without overlapping or clipping controls.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:10914; apps/extension/src/side_panel.ts:2230
- **Where to find it:** Chat > the model button under the message box (menu labelled Available models) (labels found in the code)
- **Needs:** a narrow side panel
- **Steps:**
  1. Drag the side panel to its narrowest width.
  2. Open the Available models menu from the model button.
  3. Look for long model names and effort labels: they should wrap or cut off cleanly without covering other controls.
  4. Compare with Expected.
