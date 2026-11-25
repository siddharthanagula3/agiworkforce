---
id: "PLAN-mobile-011"
type: "test-plan"
title: "Mobile · 11. Accessibility and localization components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "11"
---
# Mobile · 11. Accessibility and localization components

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S11.01 Accessible control labels.

- **Expected:** Every interactive control exposes an accessible name (visible text, aria-label or platform equivalent) that says what it does.
- **Code:** done. Evidence present: apps/mobile/app/(app)/notifications/index.tsx:143; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:389
- **Where to find it:** Header button "Open notifications, N unread" (only shown in the wide layout with the permanent sidebar), then the Notifications screen (labels found in the code)
- **Needs:** a notification in the inbox (unread) and a wide window; on phone width the code shows no link to this screen
- **Steps:**
  1. Make the app window wide enough for the permanent sidebar (a Mac window, not a phone-width window).
  2. Make sure there is at least one unread notification, so the bell button appears in the header.
  3. Turn on VoiceOver and move across the header button; it should announce "Open notifications, N unread".
  4. Tap the bell. On the Notifications screen, move through each notification row; each should read as one button with its title and time.
  5. Compare with Expected: every control has a name that says what it does.

## S11.02 Semantic heading hierarchy.

- **Expected:** Each screen has a top heading and sections use nested headings, so screen-reader users can jump by heading.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/common.tsx:46 (quoted code not found in the file now); apps/mobile/src/features/settings/capabilities/index.tsx:413
- **Where to find it:** Settings > Device (section title), then the other section titles Assistant, Cloud, Support (labels found in the code)
- **Steps:**
  1. Open Settings from the side menu.
  2. Turn on VoiceOver and use the heading navigation (VO + Command + H) to move between section titles.
  3. Confirm the section names Device, Assistant, Cloud and Support are reached as headings.
  4. Open a settings page such as Settings > Device > General and check its page title is a heading.
  5. Compare with Expected: each screen has a top heading and sections are headings.

## S11.05 Focus management across dialogs.

- **Expected:** Opening a dialog moves focus into it, Tab stays inside it, and Escape closes it.
- **Code:** done. Evidence present: apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx:171; apps/mobile/__tests__/modal-accessibility-semantics.test.ts:9; apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx:170
- **Where to find it:** Settings > Cloud > Remote control > Connections (row "Open Remote" or "Pair a computer"), then the Remote screen, then the help button "Show companion walkthrough" (labels found in the code)
- **Needs:** a paired or unpaired account with the Remote feature enabled (shown only when the companion feature is on)
- **Steps:**
  1. Open Settings, go to the Remote control section and tap Connections.
  2. Tap "Open Remote" (or "Pair a computer" if not paired).
  3. On the Remote screen, tap the help icon labelled "Show companion walkthrough".
  4. Check that the walkthrough opens as a full-screen dialog with focus inside it; press Tab (or swipe with VoiceOver) and confirm focus stays inside.
  5. Press Escape (or use the "Skip walkthrough" button) and confirm the dialog closes.
  6. Compare with Expected: focus moves into the dialog, stays there, and Escape closes it.

## S11.06 Focus restoration after panel closure.

- **Expected:** Closing a dialog, menu or panel returns focus to the control that opened it.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** not found in the code. No code for restoring focus to the opening control was found. I searched apps/mobile for restoreFocus, returnFocus, "focus restor" and "restore focus" and got no matches.
- **Needs:** device

## S11.07 Screen-reader announcements for completed events.

- **Expected:** When something finishes (a reply, a tool step, a save, a connection), a screen reader hears a short announcement without moving focus.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageList.tsx:253
- **Where to find it:** Chat screen > "Message input" field > send a message and wait for the reply (labels found in the code)
- **Needs:** a signed-in account with a working AI reply and VoiceOver on
- **Steps:**
  1. Turn on VoiceOver and open a chat.
  2. Focus the "Message input" field and type a short question.
  3. Send it and let the reply finish streaming.
  4. Listen for the short spoken announcements (a "responding" message when the reply starts and an outcome message when it ends) without the focus moving.
  5. Compare with Expected: a short announcement is heard and focus stays where it was.

## S11.09 Accessible tool and approval status.

- **Expected:** Tool steps and approval requests expose their state (running, done, failed, waiting for approval) to assistive tech, with labelled approve and deny controls.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:389; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:296 (quoted code not found in the file now)
- **Where to find it:** Chat screen > a message with agent activity > "Show agent activity" > the tool step or approval row > "Allow" / "Deny" buttons (some labels not found in the code; trust the screen)
- **Needs:** a signed-in account and a tool request that needs approval
- **Steps:**
  1. Open a chat in which the agent runs a tool that needs approval.
  2. Tap the agent activity line whose label starts with "Show agent activity" to expand it.
  3. Read the tool step: it should say its state (running, done, failed or waiting for approval).
  4. For a step waiting for approval, check the buttons labelled "Allow" and "Deny" and the "Decision for" group.
  5. Compare with Expected: each step's state is announced and approve/deny controls have labels.

## S11.12 Text resizing.

- **Expected:** Text scales with the user's text-size setting (browser, OS or app) up to at least 200% without being cut off.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/index.tsx:226; apps/mobile/src/features/chat/ChatsListScreen.tsx:673
- **Where to find it:** Settings > Device > Appearance (the text size comes from the device's own text-size setting, not an in-app control) (labels found in the code)
- **Needs:** a device with text-size control; the text-size option itself is not in the app
- **Steps:**
  1. Change the device text size to a larger setting (the system Text Size or Larger Text option).
  2. Reopen the app and go to Settings > Device > Appearance.
  3. Check that the row labels and values wrap or stay on one line, with values capped at about 200%.
  4. Open the chat list (Chats) and check the header title and subtitle are still readable.
  5. Compare with Expected: text grows up to about 200% and nothing is cut off.

## S11.14 Reduced motion.

- **Expected:** With the OS or app reduced-motion preference on, looping and travelling animation stops or is replaced.
- **Code:** done. Evidence moved: apps/mobile/src/ui/theme/useReduceMotion.ts:22; apps/mobile/src/features/edge-cases/components/OfflineBanner.tsx:19 (quoted code not found in the file now); apps/mobile/src/ui/theme/__tests__/accessibilityPreferenceCoverage.test.ts:78
- **Where to find it:** no screen of its own. The app reads the OS reduce-motion flag through AccessibilityInfo; I did not find a visible in-app switch for it.
- **Needs:** a device that lets the tester turn on Reduce Motion
- **Steps:**
  1. Turn on Reduce Motion in the device accessibility settings.
  2. Open the app and go to a screen with a loading or offline indicator.
  3. Check that looping or travelling animations stop or are replaced by a static display.
  4. Compare with Expected: the animations stop or change while Reduce Motion is on.

## S11.15 Captions.

- **Expected:** Spoken audio (voice conversations) can be shown as live captions.
- **Code:** done. Evidence moved: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:440; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:85 (quoted code not found in the file now)
- **Where to find it:** Settings > Device > Voice > "Open Voice Companion", then the live voice bar button "Show captions" / "Hide captions" (labels found in the code)
- **Needs:** a microphone and a device with an on-device speech recognizer; the "Open Voice Companion" row is hidden otherwise
- **Steps:**
  1. Open Settings > Device > Voice.
  2. Tap "Open Voice Companion" (this row appears only when the on-device recognizer is available).
  3. Start a voice conversation and speak.
  4. Tap the captions button (labelled "Show captions" or "Hide captions") in the voice bar.
  5. Compare with Expected: spoken words appear as live captions while the conversation runs.

## S11.16 Transcripts.

- **Expected:** A voice conversation leaves a readable text transcript kept with the chat.
- **Code:** done. Evidence present: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:440; apps/mobile/stores/chat/chatMessageStore.ts:1199
- **Where to find it:** Settings > Device > Voice > "Open Voice Companion", then the live transcript shown under the voice bar when captions are on (labels found in the code)
- **Needs:** a microphone and an on-device speech recognizer
- **Steps:**
  1. Open Settings > Device > Voice and tap "Open Voice Companion".
  2. Turn captions on ("Show captions") and have a short spoken exchange.
  3. Read the transcript area (testID live-voice-transcript) that lists each turn.
  4. Go back to the chat that the voice session came from and look for the conversation text.
  5. Compare with Expected: a readable text transcript is kept with the chat.

## S11.19 Right-to-left layouts.

- **Expected:** In a right-to-left language the whole layout mirrors correctly (direction set and spacing uses logical start/end).
- **Code:** done. Evidence moved: apps/mobile/src/i18n/index.ts:27; apps/mobile/src/i18n/index.ts:99; apps/mobile/app/_layout.tsx:261 (quoted code not found in the file now); apps/mobile/src/features/settings/general/index.tsx:56
- **Where to find it:** Settings > Device > General > "App language" (labels found in the code)
- **Needs:** a device or app setting that lets the app use a right-to-left language
- **Steps:**
  1. Open Settings > Device > General.
  2. Tap "App language" and choose a right-to-left language.
  3. Go back and look at the app layout: menus, rows and text should mirror (text aligned to the right, start and end swapped).
  4. If the layout does not change, check whether the app asks you to restart it.
  5. Compare with Expected: the whole layout mirrors correctly.

## S11.20 Mixed-direction text handling.

- **Expected:** Messages mixing left-to-right and right-to-left text render each paragraph in its own direction (e.g. dir="auto").
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** Chat screen > a message bubble that mixes Arabic or Hebrew text with English text (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account and a chat that can show mixed-direction text
- **Steps:**
  1. Open a chat and send a message that has an Arabic or Hebrew paragraph and an English paragraph (or ask for a reply that contains both).
  2. Look at each paragraph in the message bubble.
  3. Check that the Arabic or Hebrew paragraph is right-aligned and the English paragraph is left-aligned.
  4. Compare with Expected: each paragraph is shown in its own direction.

## S11.21 Input-method composition support.

- **Expected:** Typing with an input method (Japanese, Chinese, Korean) never sends the message when Enter confirms a composition.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:2126; apps/mobile/src/features/chat/components/ChatInput.tsx:2125; apps/mobile/src/features/chat/components/ChatInput.tsx:2272
- **Where to find it:** Chat screen > "Message input" field (a Japanese, Chinese or Korean keyboard) (labels found in the code)
- **Needs:** a Japanese, Chinese or Korean input method on the keyboard
- **Steps:**
  1. Switch the Mac keyboard to a Japanese, Chinese or Korean input method.
  2. Open a chat, focus the "Message input" field and type a phrase so it is still being converted (underlined).
  3. Press Enter to confirm the conversion.
  4. Check that the message is not sent and the composed text stays in the field.
  5. Compare with Expected: Enter confirms the composition and never sends the message.

## S11.22 Locale-aware dates and numbers.

- **Expected:** Dates, times and numbers are formatted for the user's locale rather than a fixed US format.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-usage/index.tsx:205; apps/mobile/src/features/settings/plans/index.tsx:30
- **Where to find it:** Settings > Cloud > Usage (labels found in the code)
- **Needs:** a cloud account with credits that have an expiry date (for the date to appear)
- **Steps:**
  1. Open Settings and go to the Cloud section, then tap Usage.
  2. Look at any date shown, such as "Expires ..." or "Next expiry ...".
  3. Look at the numbers, such as counts with thousands separators.
  4. Change the device region or language in the device settings, reopen the screen and compare the date and number format.
  5. Compare with Expected: dates and numbers follow the user's locale.

## S11.23 Currency formatting.

- **Expected:** Prices and money amounts show the right currency symbol and the user's number format.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-billing/index.tsx:475 (quoted code not found in the file now)
- **Where to find it:** Settings > Account > Subscription (labels found in the code)
- **Needs:** a store account (App Store or Google Play); prices come from the store, so they can show only in an app-store build
- **Steps:**
  1. Open Settings and go to the Account section, then tap Subscription.
  2. Look at the "Current Plan" section and any plan button showing a price, such as "Upgrade · price".
  3. Compare the currency symbol and number format with the device region.
  4. Compare with Expected: the price shows the right currency symbol and number format.

## S11.24 Pluralization.

- **Expected:** Counted phrases follow each language's plural rules rather than an English "s" suffix.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ArtifactChangesView.tsx:87; apps/mobile/app/(app)/scan.tsx:367; apps/mobile/app/(app)/settings/memory-import.tsx:131 (quoted code not found in the file now); apps/mobile/app/(app)/settings/reflect.tsx:38
- **Where to find it:** Settings > Cloud > Reflect (the follow-up count line in the recap) (labels found in the code)
- **Needs:** a cloud account with some recap data (ongoing work with follow-ups)
- **Steps:**
  1. Open Settings, go to the Cloud section and tap Reflect.
  2. Look at the ongoing-work lines that show a follow-up count.
  3. Find a line with exactly one follow-up and one with more than one.
  4. Compare with Expected: "1 follow-up" and "2 follow-ups" follow the language's plural rules.

## S11.27 Long-label and translated-copy layouts.

- **Expected:** Long labels and longer translated strings wrap or truncate cleanly without overlapping or clipping controls.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** not found in the code. The ledger has no code location for this item and I did not find a specific long-label or translated-copy layout check in apps/mobile; I did not search exhaustively.
- **Needs:** device
