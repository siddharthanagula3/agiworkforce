---
id: "PLAN-web-011"
type: "test-plan"
title: "Web · 11. Accessibility and localization components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "11"
---
# Web · 11. Accessibility and localization components

26 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S11.01 Accessible control labels.

- **Expected:** Every interactive control exposes an accessible name (visible text, aria-label or platform equivalent) that says what it does.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** no screen of its own. Inner rule with no control of its own; the check is by screen reader.
- **Needs:** VoiceOver on macOS and a signed-in account
- **Steps:**
  1. Turn on VoiceOver (Command+F5).
  2. Tab to the Account menu button in the sidebar, then to Settings and to a few buttons on the chat page.
  3. Listen: each control should say what it does (for example Keyboard shortcuts or Account menu for your name), not just 'button'.

## S11.02 Semantic heading hierarchy.

- **Expected:** Each screen has a top heading and sections use nested headings, so screen-reader users can jump by heading.
- **Code:** done. Evidence moved: apps/web/features/chat/components/ConversationTitleMenu.tsx:106 (quoted code not found in the file now); packages/ui/unified-chat/src/components/ConversationHeader.tsx:92
- **Where to find it:** no screen of its own. The title is an h1 in ConversationHeader.tsx; Settings section headings were not all checked.
- **Needs:** VoiceOver on macOS and a signed-in account with a saved chat
- **Steps:**
  1. Turn on VoiceOver and open an existing chat.
  2. Open the VoiceOver rotor (Control+Option+U) and choose Headings.
  3. Listen for a top-level heading for the conversation title and nested headings in sections; compare with Expected.

## S11.03 Keyboard navigation.

- **Expected:** Everything can be reached and operated from the keyboard, including menus with arrow keys and Escape.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/useMenuKeyboard.ts:18; packages/ui/ui/src/sidebar/Menu.tsx:113; apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx:16
- **Where to find it:** Account menu > Get help > Keyboard shortcuts (menu opened from the round account button with your initial) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Press Tab until the round account button is focused, then press Return.
  2. Press Down Arrow to move through the menu items, then Right Arrow to open Get help.
  3. Press Escape to close the menu, and check the menu closed and focus went back to the account button.

## S11.04 Visible focus indicators.

- **Expected:** The focused control always shows a clearly visible focus indicator when navigating by keyboard.
- **Code:** done. Evidence present: apps/web/app/globals.css:1233; apps/web/app/globals.css:1234; apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. Rule is in apps/web/app/globals.css (focus-visible outline).
- **Needs:** a keyboard and a signed-in account
- **Steps:**
  1. Open the chat page and press Tab repeatedly.
  2. Look at each focused control for a visible outline (2px ring).
  3. Compare with Expected: the focused control always shows a clear indicator.

## S11.05 Focus management across dialogs.

- **Expected:** Opening a dialog moves focus into it, Tab stays inside it, and Escape closes it.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/useDialogKeyboard.ts:29; apps/web/app/gallery/GalleryClient.tsx:502
- **Where to find it:** Account menu > Get help > Keyboard shortcuts (the dialog opens) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the Account menu and go to Get help > Keyboard shortcuts.
  2. Check that focus moved into the dialog, then press Tab several times and confirm focus stays inside it.
  3. Press Escape and check the dialog closes.

## S11.06 Focus restoration after panel closure.

- **Expected:** Closing a dialog, menu or panel returns focus to the control that opened it.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/useDialogKeyboard.ts:60
- **Where to find it:** Account menu > Get help > Keyboard shortcuts; close it and see where focus lands (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the Keyboard shortcuts dialog from the Account menu, using the keyboard.
  2. Press Escape to close it.
  3. Check focus returns to the Get help item or the account button that opened it.

## S11.07 Screen-reader announcements for completed events.

- **Expected:** When something finishes (a reply, a tool step, a save, a connection), a screen reader hears a short announcement without moving focus.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:2089; apps/web/features/chat/components/messages/ChatMessageList.tsx:1144; apps/web/app/AppRuntimeMounts.tsx:23
- **Where to find it:** no screen of its own. Announcement text comes from buildStreamAnnouncement in ChatMessageList.tsx.
- **Needs:** VoiceOver on macOS and a signed-in account
- **Steps:**
  1. Turn on VoiceOver (Command+F5) and open a chat.
  2. Type a short message in the composer and send it, without moving focus.
  3. Listen for a short announcement such as Response complete, and check focus stayed in the composer.

## S11.08 Non-spammy streaming announcements.

- **Expected:** A streaming reply is announced calmly (in word-bounded chunks or once when done), never token by token and never twice.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:1169; packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx:96
- **Where to find it:** no screen of its own. Chunking is in packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx.
- **Needs:** VoiceOver on macOS and a signed-in account
- **Steps:**
  1. Turn on VoiceOver and send a message that asks for a long answer.
  2. Listen while the reply streams: it should speak in short chunks or once at the end, not word by word.
  3. While it streams, the send button shows Stop the current response; check it is labelled.

## S11.09 Accessible tool and approval status.

- **Expected:** Tool steps and approval requests expose their state (running, done, failed, waiting for approval) to assistive tech, with labelled approve and deny controls.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:869; packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:870; apps/web/features/chat/components/messages/ChatMessageList.tsx:1152; packages/ui/unified-chat/src/components/ToolCallCard.tsx:409
- **Where to find it:** Chat > a reply that asks to run a tool > the tool card with Needs approval and the approval buttons (labels found in the code)
- **Needs:** a signed-in account whose chat asks for tool approval
- **Steps:**
  1. Open a chat and ask AGI to do a task that needs a tool (agent mode), so it asks for approval.
  2. Find the tool card showing Needs approval or This tool requires approval before execution.
  3. Turn on VoiceOver and check the card states the step (running, done, failed or waiting) and that the approve and deny buttons have names.

## S11.10 Touch equivalents for hover interactions.

- **Expected:** Anything revealed on hover is also reachable by touch (always visible on touch screens or shown on tap).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3702; packages/ui/unified-chat/src/components/MessageBubble.tsx:624
- **Where to find it:** Chat > any message bubble > the Copy message button under the message (labels found in the code)
- **Needs:** a touch screen or phone width
- **Steps:**
  1. Open a chat with a reply on a touch device or at phone width, and tap a message.
  2. Check the action buttons (Copy message and others) are visible without hovering.
  3. Tap Copy message and check it works.

## S11.11 Alternatives to drag-only operations.

- **Expected:** Every drag operation (drop files, resize, reorder) has a non-drag alternative such as a button, menu or arrow keys.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:428 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3651 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:298
- **Where to find it:** Chat composer > Files menu > Upload from device (non-drag upload); artifacts panel > Resize artifacts panel (arrow keys) (labels found in the code)
- **Needs:** a file to upload and a signed-in account
- **Steps:**
  1. Open the Files menu from the chat composer and choose Upload from device; pick a file from the file picker.
  2. Check the file is attached without dragging anything.
  3. Click or Tab to the separator labelled Resize artifacts panel and press Left Arrow or Right Arrow to resize the panel; check it moves.

## S11.12 Text resizing.

- **Expected:** Text scales with the user's text-size setting (browser, OS or app) up to at least 200% without being cut off.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:1186 (quoted code not found in the file now); apps/web/shared/components/AppearancePreferences.tsx:20
- **Where to find it:** Settings > Appearance > Chat text size (choose Small, Default or Large) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click Account menu > Settings, then Appearance.
  2. Find Chat text size and choose Large.
  3. Go back to a chat and check the text is bigger and not cut off; then try a larger text size in the browser (Cmd+Plus) and check again.

## S11.13 Browser-zoom reflow.

- **Expected:** At high browser zoom (400%) the layout reflows to one column with no horizontal scrolling.
- **Code:** done. Evidence present: apps/web/shared/components/layout/app-shell-layout.ts:24; apps/web/shared/components/layout/WebAppShell.tsx:196; apps/web/shared/components/layout/WebAppShell.tsx:692
- **Where to find it:** no screen of its own. Layout rules are in apps/web/shared/components/layout/WebAppShell.tsx and app-shell-layout.ts.
- **Needs:** a browser with zoom and a signed-in account
- **Steps:**
  1. Open the chat page in a browser window and press Cmd+Plus until zoom is 400%.
  2. Check the page turns into one column (sidebar moves away or collapses) and there is no sideways scroll bar.
  3. Read a long message and check no text is cut off.

## S11.14 Reduced motion.

- **Expected:** With the OS or app reduced-motion preference on, looping and travelling animation stops or is replaced.
- **Code:** done. Evidence moved: apps/web/app/globals.css:1928; apps/web/shared/components/AppearancePreferences.tsx:51; apps/web/features/settings/sections/GeneralSection.tsx:1091 (quoted code not found in the file now)
- **Where to find it:** Settings > Appearance > Motion > Reduced (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click Account menu > Settings, then Appearance.
  2. Under Motion, click Reduced.
  3. Open a chat that is loading or streaming and check the looping and moving animations stop or are replaced; then click System to go back.

## S11.15 Captions.

- **Expected:** Spoken audio (voice conversations) can be shown as live captions.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceComposer.tsx:146 (quoted code not found in the file now); apps/web/features/chat/components/Voice/VoiceCaptions.tsx:26; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:176
- **Where to find it:** Composer > Start voice mode > voice call screen > menu with In this chat > Captions (labels found in the code)
- **Needs:** a microphone and a signed-in account with voice allowed
- **Steps:**
  1. Click Start voice mode in the chat composer and allow the microphone.
  2. Open the menu from the call screen and turn on Captions.
  3. Speak a sentence and check the Voice captions area shows your words and the reply as text.

## S11.16 Transcripts.

- **Expected:** A voice conversation leaves a readable text transcript kept with the chat.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:6739; apps/web/features/chat/pages/WebChatPage.tsx:5002 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:6770
- **Where to find it:** Composer > Start voice mode; after the call, the spoken turns appear as messages in the chat (labels found in the code)
- **Needs:** a microphone and a signed-in account with voice allowed
- **Steps:**
  1. Click Start voice mode, allow the microphone, and say two or three sentences.
  2. End the call and go back to the chat.
  3. Read the messages and check each spoken line appears as text in the same chat.

## S11.17 Chart descriptions.

- **Expected:** A chart comes with a text description (title, what is plotted, key values) that assistive tech can read.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:134; packages/ui/unified-chat/src/components/artifact-components/chart-spec.ts:130 (quoted code not found in the file now); packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.test.tsx:35
- **Where to find it:** Chat > ask AGI for a chart > the chart card > View chart data (labels found in the code)
- **Needs:** a signed-in account; AGI must produce a chart
- **Steps:**
  1. Open a chat and ask AGI to make a chart from some numbers.
  2. Click View chart data under the chart.
  3. Check the table shows the values and the chart has a title that matches what is plotted.

## S11.19 Right-to-left layouts.

- **Expected:** In a right-to-left language the whole layout mirrors correctly (direction set and spacing uses logical start/end).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:466; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:545; packages/ui/ui/src/primitives/DropdownMenu.tsx:186; packages/ui/ui/src/primitives/SearchInput.tsx:25
- **Where to find it:** Settings > General > Display Language, choose an Arabic or Hebrew option (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click Account menu > Settings, then General.
  2. Under Display Language, pick a right-to-left language such as Arabic.
  3. Check the whole layout mirrors: the sidebar and menus move to the right and text aligns to the right.

## S11.20 Mixed-direction text handling.

- **Expected:** Messages mixing left-to-right and right-to-left text render each paragraph in its own direction (e.g. dir="auto").
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerInput.tsx:137; apps/web/features/chat/components/messages/MessageBubble.tsx:2839; apps/web/app/i18n/index.ts:75
- **Where to find it:** no screen of its own. The composer and bubbles set dir=auto in ComposerInput.tsx and MessageBubble.tsx.
- **Needs:** a signed-in account and a keyboard that types Arabic or Hebrew
- **Steps:**
  1. In the composer, type one line in English and a new line in Arabic or Hebrew.
  2. Send it and read the message bubble.
  3. Check each paragraph lines up in its own direction.

## S11.21 Input-method composition support.

- **Expected:** Typing with an input method (Japanese, Chinese, Korean) never sends the message when Enter confirms a composition.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4579; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3520 (quoted code not found in the file now); packages/ui/unified-chat/src/composer-editor/ime-composition.ts:10 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Where to find it:** no screen of its own. Composition check is in ChatComposerNew.tsx keydown handling.
- **Needs:** a Japanese, Chinese or Korean input method and a signed-in account
- **Steps:**
  1. Switch the Mac keyboard to a Japanese or Chinese input method.
  2. In the composer, type a word and press Return to confirm the conversion (do not send yet).
  3. Check the message is not sent, and press Return again to send only when you want.

## S11.22 Locale-aware dates and numbers.

- **Expected:** Dates, times and numbers are formatted for the user's locale rather than a fixed US format.
- **Code:** done. Evidence present: apps/web/features/settings/components/LinkedDevicesPanel.tsx:67; apps/web/features/chat/components/Composer/ComposerFooter.tsx:331; apps/web/features/settings/components/Settings/PasskeysPanel.tsx:26
- **Where to find it:** Settings > Account > Linked devices (dates shown in the list) (labels found in the code)
- **Needs:** a signed-in account with at least one linked device
- **Steps:**
  1. Click Account menu > Settings, then Account.
  2. Find Linked devices and read the dates shown for each device.
  3. Compare the date format with your Mac's region format (day/month order and 12 or 24 hour clock).

## S11.23 Currency formatting.

- **Expected:** Prices and money amounts show the right currency symbol and the user's number format.
- **Code:** done. Evidence moved: packages/contracts/types/src/money-format.ts:23; packages/contracts/types/src/money-format.ts:1; apps/web/app/billing/invoices/InvoiceList.tsx:25; apps/web/features/billing/components/BillingPaymentHistory.tsx:142; apps/web/app/pricing/page.tsx:137 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:291; apps/desktop/src/features/pricing/DesktopUpgradeConfirmDialog.tsx:139; apps/desktop/src/features/pricing/PlanCard.tsx:68
- **Where to find it:** Settings > Billing (the Invoices and receipts page); the link from Billing to that page was not confirmed (labels found in the code)
- **Needs:** a paid or past-paid account with invoices
- **Steps:**
  1. Click Account menu > Settings, then Billing.
  2. Look for Invoices and receipts, or open the page directly at /billing/invoices.
  3. Check each amount shows the right currency symbol and number format.

## S11.24 Pluralization.

- **Expected:** Counted phrases follow each language's plural rules rather than an English "s" suffix.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/lib/compactToolSummary.ts:33; apps/web/features/chat/components/messages/ToolTimeline.tsx:360; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3422; apps/web/features/workspace-console/components/WorkspaceRoles.tsx:271; apps/web/features/schedules/components/ScheduleCard.tsx:115; apps/web/features/settings/sections/PrivacySection.tsx:343 (quoted code not found in the file now); apps/web/features/projects/components/ProjectSettingsDialog.tsx:155; packages/ui/i18n/locales/ar/chat.json:609; packages/ui/i18n/locales/ru/settings.json:155
- **Where to find it:** Chat > a reply that ran commands > the tool summary line (for example ran 2 commands or ran a command) (labels found in the code)
- **Needs:** a chat where AGI runs commands (agent mode)
- **Steps:**
  1. Open a chat in agent mode where AGI runs more than one command.
  2. Read the tool summary line in the reply.
  3. Check it says ran a command for one and ran N commands for more than one, not a plain English s on every word.

## S11.25 Translated error messages.

- **Expected:** Error messages appear in the user's chosen language.
- **Code:** done. Evidence present: packages/ui/ui/src/lib/network-error.ts:11; apps/web/features/chat/lib/turn-error-notice.ts:185; apps/desktop/src/constants/errorMessages.ts:47
- **Where to find it:** no screen of its own. Message text is in packages/ui/ui/src/lib/network-error.ts and apps/web/features/chat/lib/turn-error-notice.ts; not every error may be translated.
- **Needs:** a signed-in account and a way to cause a network error
- **Steps:**
  1. Open Account menu > Settings > General and set Display Language to another language.
  2. Turn off Wi-Fi, send a chat message, and read the error that appears.
  3. Check the error text is in the language you chose, not always English.

## S11.26 Platform-specific shortcut notation.

- **Expected:** Shortcut hints use the platform's notation (⌘ on Apple, Ctrl elsewhere).
- **Code:** done. Evidence present: packages/ui/ui/src/platformKeys.ts:31; apps/web/shared/components/layout/AccountMenuItems.tsx:112
- **Earlier check in the running app:** PARTIAL: E007 [PARTIAL; interaction]: Shortcut dialog renders grouped shortcuts with macOS modifier labels and enabled states; preferences were not changed. Opening the dialog logs React invalid nesting: div inside p (hydration warning).
- **Where to find it:** Account menu > Get help > Keyboard shortcuts (the shortcut hints show ⌘ on a Mac) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the Account menu, go to Get help > Keyboard shortcuts.
  2. Read the shortcut list and check the keys show the Mac symbol ⌘ (not Ctrl).
  3. Compare with Expected. Earlier check: the dialog shows macOS labels but logs a React nesting warning (div inside p) in the console.

## S11.27 Long-label and translated-copy layouts.

- **Expected:** Long labels and longer translated strings wrap or truncate cleanly without overlapping or clipping controls.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Settings > General > Display Language (choose Español or another language, then look at the page) (labels found in the code)
- **Needs:** a Free account or a paid account, phone width optional for a second check
- **Steps:**
  1. Sign in and open Settings from the account or sidebar menu.
  2. Open the General section and find the row labelled Display Language.
  3. Open the Display Language menu and pick a language other than English, such as Español.
  4. Look at the settings rows, buttons and the sidebar: long or translated labels should wrap or truncate with no overlap or clipped controls.
