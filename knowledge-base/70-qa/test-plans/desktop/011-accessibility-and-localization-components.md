---
id: "PLAN-desktop-011"
type: "test-plan"
title: "Desktop · 11. Accessibility and localization components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "11"
---
# Desktop · 11. Accessibility and localization components

26 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S11.01 Accessible control labels.

- **Expected:** Every interactive control exposes an accessible name (visible text, aria-label or platform equivalent) that says what it does.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** no screen of its own. The plan gives no code location; the only label I checked was the Copy message fallback, and I did not survey all controls.
- **Needs:** a screen reader (VoiceOver)
- **Steps:**
  1. Turn on VoiceOver (Cmd+F5) and move through the chat with VO+Arrow keys.
  2. Stop on the Copy message button under a reply and listen for its spoken name, compared with Expected.

## S11.02 Semantic heading hierarchy.

- **Expected:** Each screen has a top heading and sections use nested headings, so screen-reader users can jump by heading.
- **Code:** done. Evidence moved: apps/web/features/chat/components/ConversationTitleMenu.tsx:106 (quoted code not found in the file now); packages/ui/unified-chat/src/components/ConversationHeader.tsx:92
- **Where to find it:** no screen of its own. Heading markup is inner structure; I only checked the Agent activity section label.
- **Needs:** a screen reader (VoiceOver)
- **Steps:**
  1. Turn on VoiceOver and open the VO rotor (VO+U), then choose Headings.
  2. Open a chat with tool activity and check for a top heading and nested section headings, compared with Expected.

## S11.03 Keyboard navigation.

- **Expected:** Everything can be reached and operated from the keyboard, including menus with arrow keys and Escape.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/useMenuKeyboard.ts:18; packages/ui/ui/src/sidebar/Menu.tsx:113; apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx:16
- **Where to find it:** Any screen after sign-in > press Tab to move through controls, use arrow keys in open menus, press Escape to close them; press Cmd+K (Ctrl+K on Windows) to open the command palette (labels found in the code)
- **Steps:**
  1. Click outside any field, press Tab repeatedly and watch focus move to each control.
  2. Open the Account menu and use the Down and Up arrow keys to move between items.
  3. Press Escape and check the menu closes and focus returns to its button.

## S11.04 Visible focus indicators.

- **Expected:** The focused control always shows a clearly visible focus indicator when navigating by keyboard.
- **Code:** done. Evidence present: apps/web/app/globals.css:1233; apps/web/app/globals.css:1234; apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. Focus styling is a CSS rule, not a control.
- **Steps:**
  1. On a chat screen, press Tab one time at a time.
  2. Check that the focused control shows a clear ring or outline each time, compared with Expected.

## S11.05 Focus management across dialogs.

- **Expected:** Opening a dialog moves focus into it, Tab stays inside it, and Escape closes it.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/useDialogKeyboard.ts:29; apps/web/app/gallery/GalleryClient.tsx:502
- **Where to find it:** Account menu > Keyboard shortcuts (opens from the Account menu on any screen) (labels found in the code)
- **Steps:**
  1. Open the Account menu and choose Keyboard shortcuts.
  2. Press Tab several times and check focus stays inside the dialog.
  3. Press Escape and check the dialog closes.

## S11.06 Focus restoration after panel closure.

- **Expected:** Closing a dialog, menu or panel returns focus to the control that opened it.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/useDialogKeyboard.ts:60
- **Where to find it:** Account menu > Keyboard shortcuts, then close it (labels found in the code)
- **Steps:**
  1. Click the Account menu button and note which control has focus.
  2. Open Keyboard shortcuts, then close it with Escape.
  3. Check focus returned to the Account menu button, compared with Expected.

## S11.07 Screen-reader announcements for completed events.

- **Expected:** When something finishes (a reply, a tool step, a save, a connection), a screen reader hears a short announcement without moving focus.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:2089; apps/web/features/chat/components/messages/ChatMessageList.tsx:1144; apps/web/app/AppRuntimeMounts.tsx:23
- **Where to find it:** no screen of its own. The announcement is a polite live region; I did not confirm which events are announced.
- **Needs:** a screen reader (VoiceOver) and a signed-in account
- **Steps:**
  1. Turn on VoiceOver and send a message that uses a tool.
  2. Keep focus in the composer and listen for a short spoken status when the reply or tool step finishes, compared with Expected.

## S11.08 Non-spammy streaming announcements.

- **Expected:** A streaming reply is announced calmly (in word-bounded chunks or once when done), never token by token and never twice.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:1169; packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx:96
- **Where to find it:** no screen of its own. Behaviour is in the streaming announcer component; not verified live.
- **Needs:** a screen reader (VoiceOver) and a signed-in account
- **Steps:**
  1. Turn on VoiceOver and send a question that gets a long streamed reply.
  2. Listen while the reply streams and check it is spoken in short chunks or once at the end, not word by word, compared with Expected.

## S11.09 Accessible tool and approval status.

- **Expected:** Tool steps and approval requests expose their state (running, done, failed, waiting for approval) to assistive tech, with labelled approve and deny controls.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:869; packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:870; apps/web/features/chat/components/messages/ChatMessageList.tsx:1152; packages/ui/unified-chat/src/components/ToolCallCard.tsx:409
- **Where to find it:** Chat > send a request that needs a tool approval > watch the tool card in the reply (labels found in the code)
- **Needs:** a signed-in account where a tool asks for approval
- **Steps:**
  1. Send a request that asks the AI to use a tool that needs approval.
  2. Look at the tool card and read the warning line about approval.
  3. Turn on VoiceOver and check the running, done or waiting state is spoken, and that the Allow and Deny buttons have names, compared with Expected.

## S11.10 Touch equivalents for hover interactions.

- **Expected:** Anything revealed on hover is also reachable by touch (always visible on touch screens or shown on tap).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3702; packages/ui/unified-chat/src/components/MessageBubble.tsx:624
- **Where to find it:** Chat > send a message > hover over the reply > Copy message button in the row under it (labels found in the code)
- **Needs:** a touch screen or phone-width browser to check the touch case
- **Steps:**
  1. Send a message and wait for a reply.
  2. Move the pointer over the reply and look for the action row with Copy message.
  3. On a touch screen (or phone width), tap the reply and check the action row is always visible, compared with Expected.

## S11.11 Alternatives to drag-only operations.

- **Expected:** Every drag operation (drop files, resize, reorder) has a non-drag alternative such as a button, menu or arrow keys.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:428 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3651 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:298
- **Where to find it:** not found in the code. Not found in time: I did not open apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx or the drag handling in ArtifactsPanel.tsx to get the visible menu words.

## S11.12 Text resizing.

- **Expected:** Text scales with the user's text-size setting (browser, OS or app) up to at least 200% without being cut off.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:1186 (quoted code not found in the file now); apps/web/shared/components/AppearancePreferences.tsx:20
- **Where to find it:** Settings > Appearance > Chat text size (labels found in the code)
- **Steps:**
  1. Open Settings and choose Appearance.
  2. Set Chat text size to Large.
  3. Look at the chat text and check it grows without being cut off, compared with Expected.

## S11.13 Browser-zoom reflow.

- **Expected:** At high browser zoom (400%) the layout reflows to one column with no horizontal scrolling.
- **Code:** done. Evidence present: apps/web/shared/components/layout/app-shell-layout.ts:24; apps/web/shared/components/layout/WebAppShell.tsx:196; apps/web/shared/components/layout/WebAppShell.tsx:692
- **Where to find it:** no screen of its own. Zoom keys for the Electron window were not verified in the code.
- **Steps:**
  1. Zoom the app window in (the browser zoom keys, if the app supports them).
  2. Check that at high zoom the chat shows one column and does not scroll sideways, compared with Expected.

## S11.14 Reduced motion.

- **Expected:** With the OS or app reduced-motion preference on, looping and travelling animation stops or is replaced.
- **Code:** done. Evidence moved: apps/web/app/globals.css:1928; apps/web/shared/components/AppearancePreferences.tsx:51; apps/web/features/settings/sections/GeneralSection.tsx:1091 (quoted code not found in the file now)
- **Where to find it:** Settings > Appearance > Motion > Reduced (labels found in the code)
- **Needs:** none (optionally turn on Reduce motion in the operating system)
- **Steps:**
  1. Open Settings and choose Appearance.
  2. Under Motion, choose Reduced.
  3. Send a chat message and watch the reply animations and any looping indicators, compared with Expected.

## S11.15 Captions.

- **Expected:** Spoken audio (voice conversations) can be shown as live captions.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceComposer.tsx:146 (quoted code not found in the file now); apps/web/features/chat/components/Voice/VoiceCaptions.tsx:26; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:176
- **Where to find it:** Start voice mode (composer button) > voice call screen > the menu with In this chat > Captions (labels found in the code)
- **Needs:** a microphone and a signed-in account
- **Steps:**
  1. Click the Start voice mode button in the chat composer and allow the microphone.
  2. Open the in-call menu titled In this chat and turn on Captions.
  3. Speak a sentence and check that caption lines appear in the captions panel, compared with Expected.

## S11.16 Transcripts.

- **Expected:** A voice conversation leaves a readable text transcript kept with the chat.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:6739; apps/web/features/chat/pages/WebChatPage.tsx:5002 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:6770
- **Where to find it:** Start voice mode > speak > end the call > the conversation in the chat (path not confirmed in the code; trust the screen)
- **Needs:** a microphone and a signed-in account
- **Steps:**
  1. Start voice mode and allow the microphone.
  2. Say two or three sentences and then end the call.
  3. Open the same chat and check the spoken turns appear as readable text, compared with Expected.

## S11.17 Chart descriptions.

- **Expected:** A chart comes with a text description (title, what is plotted, key values) that assistive tech can read.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:134; packages/ui/unified-chat/src/components/artifact-components/chart-spec.ts:130 (quoted code not found in the file now); packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.test.tsx:35
- **Where to find it:** Chat > ask for a chart (for example a bar chart of sample numbers) > the chart card in the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Ask the AI for a bar chart of a short list of numbers.
  2. Find the chart card in the reply and check it has a title.
  3. Turn on VoiceOver and check the chart name and the data table are read, compared with Expected.

## S11.19 Right-to-left layouts.

- **Expected:** In a right-to-left language the whole layout mirrors correctly (direction set and spacing uses logical start/end).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:466; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:545; packages/ui/ui/src/primitives/DropdownMenu.tsx:186; packages/ui/ui/src/primitives/SearchInput.tsx:25
- **Where to find it:** Settings > General > Display Language > Arabic (labels found in the code)
- **Steps:**
  1. Open Settings and choose General.
  2. Under Display Language, choose Arabic (or another right-to-left language).
  3. Look at the whole screen and check menus, text and spacing mirror to the right, compared with Expected.

## S11.20 Mixed-direction text handling.

- **Expected:** Messages mixing left-to-right and right-to-left text render each paragraph in its own direction (e.g. dir="auto").
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerInput.tsx:137; apps/web/features/chat/components/messages/MessageBubble.tsx:2839; apps/web/app/i18n/index.ts:75
- **Where to find it:** Chat composer > type a line in English, a line in Arabic, then send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Type an English sentence, press Shift+Enter, then type an Arabic sentence.
  2. Send the message.
  3. Check each paragraph in the reply bubble runs in its own direction, compared with Expected.

## S11.21 Input-method composition support.

- **Expected:** Typing with an input method (Japanese, Chinese, Korean) never sends the message when Enter confirms a composition.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4579; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3520 (quoted code not found in the file now); packages/ui/unified-chat/src/composer-editor/ime-composition.ts:10 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Where to find it:** no screen of its own. Inner keyboard behaviour; the composer checks for composition before sending.
- **Needs:** a Japanese, Chinese or Korean input method
- **Steps:**
  1. Add a Japanese (or Chinese or Korean) input method on the Mac and switch to it.
  2. In the chat composer, type a word and press Enter to confirm a conversion candidate.
  3. Check the message is not sent and the text stays in the composer, compared with Expected.

## S11.22 Locale-aware dates and numbers.

- **Expected:** Dates, times and numbers are formatted for the user's locale rather than a fixed US format.
- **Code:** done. Evidence present: apps/web/features/settings/components/LinkedDevicesPanel.tsx:67; apps/web/features/chat/components/Composer/ComposerFooter.tsx:331; apps/web/features/settings/components/Settings/PasskeysPanel.tsx:26
- **Where to find it:** Settings > the section that lists Passkeys and linked devices (exact navigation label not confirmed) (path not confirmed in the code; trust the screen)
- **Needs:** none (a passkey or linked device helps)
- **Steps:**
  1. Open Settings and go to the section with Passkeys or linked devices.
  2. Look at the dates shown next to a device or passkey.
  3. Change Display Language in General, return and compare the date format with Expected.

## S11.23 Currency formatting.

- **Expected:** Prices and money amounts show the right currency symbol and the user's number format.
- **Code:** done. Evidence moved: packages/contracts/types/src/money-format.ts:23; packages/contracts/types/src/money-format.ts:1; apps/web/app/billing/invoices/InvoiceList.tsx:25; apps/web/features/billing/components/BillingPaymentHistory.tsx:142; apps/web/app/pricing/page.tsx:137 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:291; apps/desktop/src/features/pricing/DesktopUpgradeConfirmDialog.tsx:139; apps/desktop/src/features/pricing/PlanCard.tsx:68
- **Where to find it:** Pricing page (web app /pricing) for plan prices (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open the pricing page of the web app.
  2. Read the plan prices and note the currency symbol and number format.
  3. Compare with Expected (right currency symbol and the user's number format).

## S11.24 Pluralization.

- **Expected:** Counted phrases follow each language's plural rules rather than an English "s" suffix.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/lib/compactToolSummary.ts:33; apps/web/features/chat/components/messages/ToolTimeline.tsx:360; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3422; apps/web/features/workspace-console/components/WorkspaceRoles.tsx:271; apps/web/features/schedules/components/ScheduleCard.tsx:115; apps/web/features/settings/sections/PrivacySection.tsx:343 (quoted code not found in the file now); apps/web/features/projects/components/ProjectSettingsDialog.tsx:155; packages/ui/i18n/locales/ar/chat.json:609; packages/ui/i18n/locales/ru/settings.json:155
- **Where to find it:** Schedules (Sidebar > Scheduled) > New task > set the repeat to Every 2 hours (or Every 1 minute) and save (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Create a scheduled task with a repeat interval of 1 and then 2 hours.
  2. Read the schedule card label.
  3. Check singular and plural forms read correctly, compared with Expected.

## S11.25 Translated error messages.

- **Expected:** Error messages appear in the user's chosen language.
- **Code:** done. Evidence present: packages/ui/ui/src/lib/network-error.ts:11; apps/web/features/chat/lib/turn-error-notice.ts:185; apps/desktop/src/constants/errorMessages.ts:47
- **Where to find it:** Turn off Wi-Fi, then send a message in Chat; read the error shown in the chat (labels found in the code)
- **Needs:** a way to go offline and, for other languages, Settings > General > Display Language
- **Steps:**
  1. Turn off the Mac's Wi-Fi.
  2. Send a chat message.
  3. Read the error and compare it with Expected (in the chosen language).

## S11.26 Platform-specific shortcut notation.

- **Expected:** Shortcut hints use the platform's notation (⌘ on Apple, Ctrl elsewhere).
- **Code:** done. Evidence present: packages/ui/ui/src/platformKeys.ts:31; apps/web/shared/components/layout/AccountMenuItems.tsx:112
- **Where to find it:** Account menu > Keyboard shortcuts (the shortcut hint on the right of the item) (labels found in the code)
- **Steps:**
  1. Open the Account menu and look at the Keyboard shortcuts item.
  2. Read the hint on its right and compare it with Expected (command symbol on Mac, Ctrl elsewhere).

## S11.27 Long-label and translated-copy layouts.

- **Expected:** Long labels and longer translated strings wrap or truncate cleanly without overlapping or clipping controls.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The plan gives no code location (Code: unverified, Where to find it: not written yet). One search of apps/desktop for translation, i18n, locale, long-label, text-overflow, line-clamp and truncate found translation plumbing (apps/desktop/src/i18n/index.ts, apps/desktop/src/providers/I18nProvider.tsx) but no long-label or truncation control tied to this item, so no visible screen or path could be confirmed. The shared chat screens live in apps/web and packages/ui, which were not searched.
- **Needs:** live-web
