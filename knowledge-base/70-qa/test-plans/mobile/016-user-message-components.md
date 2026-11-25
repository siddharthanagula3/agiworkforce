---
id: "PLAN-mobile-016"
type: "test-plan"
title: "Mobile · 16. User-message components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "16"
---
# Mobile · 16. User-message components

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S16.01 User identity/avatar.

- **Expected:** The author of each turn is distinguishable visually (avatar, name, alignment/bubble style or terminal marker) AND announced to assistive tech (R-n).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:672 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:686; apps/mobile/src/features/chat/components/MessageList.tsx:377; apps/mobile/app/(app)/chat/[id].tsx:2577
- **Where to find it:** Chat > send any message > look at your message and the reply (labels found in the code)
- **Needs:** a Free or paid account
- **Steps:**
  1. Sign in, open a chat (or start a new one), type "Hello" in the message box and send it.
  2. Look at your message: it sits on the right in a rounded bubble.
  3. Look at the reply: it is plain text across the full width with no bubble.
  4. Turn on a screen reader and move to your message: it is announced as "Your message: Hello" (the name "You" is only in that spoken label).
  5. Compare with Expected: alignment and bubble style tell the two authors apart; no avatar or visible name was found in the code.

## S16.02 Message text.

- **Expected:** The text the user sent is shown in their message in the transcript.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:659 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:1691; apps/mobile/app/(app)/chat/[id].tsx:2577; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat > send any message > your message in the transcript (path not confirmed in the code; trust the screen)
- **Needs:** a Free or paid account
- **Steps:**
  1. In a chat, type a short sentence in the message box.
  2. Tap send.
  3. Look at the transcript: the sentence you sent appears in your message bubble, unchanged.

## S16.03 Attachment group.

- **Expected:** Files and images sent with a user turn are listed on that message (thumbnail or named chip) after sending.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:727 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:760 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2616; apps/mobile/app/(app)/chat/[id].tsx:2577; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat > attach a file or image in the message box > send > the sent message (labels found in the code)
- **Needs:** a file or image to upload
- **Steps:**
  1. In a chat, use the attach control in the message box to choose a photo or a file. The control's exact label was not checked in the code.
  2. Send the message.
  3. Look at the sent message: an image appears as a tile, and a file appears as a chip with its name and a detail line.
  4. Tap the image tile (hint "Opens full screen") or the file chip (hint "Opens the file") and check it opens.

## S16.04 Source and context chips.

- **Expected:** A sent user message shows chips for the non-file context it carried (quoted text, connector/MCP resources, page, editor selection, @mentions).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2290
- **Where to find it:** not found in the code. Searched MessageBubble.tsx: the only chips on a sent user message are a quoted-text chip (text starting with "> " then a blank line) and a "Skill: " chip. No code adds connector, page, editor-selection or @mention chips to a sent message.

## S16.07 Copy action.

- **Expected:** A sent user message offers a Copy action that puts its text on the clipboard.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:528 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:589 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:1759; apps/mobile/app/(app)/chat/[id].tsx:2577; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat > long-press your sent message > Copy Message (labels found in the code)
- **Needs:** a sent message
- **Steps:**
  1. Press and hold your sent message (about 0.4 seconds) to open the message actions.
  2. Tap "Copy Message".
  3. Paste into the message box.
  4. Compare the pasted text with the sent message: it must match. (While a reply is still streaming the label reads "Copy Partial Response".)

## S16.08 Edit action.

- **Expected:** A sent user message can be edited in place and resubmitted, producing a new reply.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1643; apps/mobile/src/features/chat/components/MessageBubble.tsx:3315; apps/mobile/stores/chat/chatExecutionStore.ts:3138 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:6127; apps/mobile/app/(app)/chat/[id].tsx:2577; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat > long-press your sent message > Edit Message (labels found in the code)
- **Needs:** a sent message in a chat
- **Steps:**
  1. Press and hold your sent message and tap "Edit Message".
  2. In the "Edit Message" dialog, change the text in the box labelled "Edit message text".
  3. Tap "Send".
  4. Look for a new reply to the edited text and the version pager ("1 / 2" style) under your message.

## S16.09 Resend action.

- **Expected:** A sent user message can be re-sent unchanged from the message itself to get a fresh reply.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:847 (quoted code not found in the file now)
- **Where to find it:** Chat > long-press your sent message > Resend (labels found in the code)
- **Needs:** a sent message in a chat
- **Steps:**
  1. Press and hold your sent message to open the message actions.
  2. Tap "Resend" without changing the text.
  3. Look at the transcript: a fresh reply appears for the same message.

## S16.11 Message-version navigation.

- **Expected:** When a user message has several revisions the user can page between them (n of m) and the thread follows the chosen revision.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:3200
- **Where to find it:** Chat > Edit Message on a sent message (S16.08) > version pager under your message (labels found in the code)
- **Needs:** a sent message that has been edited
- **Steps:**
  1. Edit a sent message and send the edit, so the message has two versions.
  2. Under the edited message, look for the pager with a left and right arrow and a count such as "2 / 2".
  3. Tap the left arrow (screen-reader label "Previous version").
  4. Check the count changes to "1 / 2" and the thread shows the earlier version and its reply. Tap the right arrow to go back.

## S16.15 Delivery-failed state.

- **Expected:** When a user message fails to deliver, the transcript shows a clear failed state for that turn.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/chat/[id].tsx:1477 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:1045 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:1751; apps/mobile/app/(app)/chat/[id].tsx:2577; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat > send a message with the network off > the failed message bubble (labels found in the code)
- **Needs:** a way to turn the network off on the test device
- **Steps:**
  1. Turn off the network on the test device.
  2. In a chat, type a message and send it: the bubble shows a "queued" badge.
  3. Turn the network back on and wait for the send to finish.
  4. If the send fails, look at the bubble: it shows "failed to send" with a "Retry" button.

## S16.16 Retry-send action.

- **Expected:** A failed send offers Retry that re-sends the same turn (text and attachments) and replaces the failure with the new outcome.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2023; apps/mobile/stores/chat/chatExecutionStore.ts:5603; apps/mobile/app/(app)/chat/[id].tsx:2577; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat > failed message bubble > Retry (labels found in the code)
- **Needs:** a way to turn the network off on the test device
- **Steps:**
  1. Make a send fail as in S16.15 so the bubble shows "failed to send".
  2. Tap "Retry" next to it (or long-press the message and tap "Resend").
  3. Check the same text and attached files are sent again.
  4. Check the failed badge goes away and a reply appears, or a new failure replaces it.

## S16.17 Queued-message state.

- **Expected:** A message sent while a reply is still running is shown as queued (not yet sent) until it goes out.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:1902; apps/mobile/src/features/chat/components/ChatInput.tsx:952; apps/mobile/src/features/chat/components/MessageBubble.tsx:2240; apps/mobile/app/(app)/chat/[id].tsx:2577; apps/mobile/src/features/chat/components/MessageList.tsx:377; apps/mobile/services/offlineQueue.ts:305; apps/mobile/__tests__/network-status-late-restore.test.ts:101; apps/mobile/stores/chat/chatMessageStore.ts:1144
- **Where to find it:** Chat > send a second message while a reply is still running > the row above the message box (labels found in the code)
- **Needs:** a chat where a reply is still running (or the network off for the offline badge)
- **Steps:**
  1. Send a message and, while its reply is still streaming, type a second message and tap send.
  2. Look above the message box: the second message appears as a row with a clock icon, with an "Edit queued message" and a "Cancel queued message" button.
  3. Wait for the first reply to finish: the queued message goes out and appears in the transcript.
  4. Optionally, with the network off, send a message: its bubble shows the "queued" badge until it goes out.

## S16.18 Draft versus submitted distinction.

- **Expected:** Unsent composer text is kept as a draft per conversation, separate from sent messages, and a failed send returns to the composer as an unsent draft.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:1037; apps/mobile/src/features/chat/draftStore.ts:137; apps/mobile/app/(app)/chat/[id].tsx:2759; apps/mobile/app/(app)/chat/[id].tsx:2577; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat > type in the message box without sending > switch chats and come back; and a failed send (labels found in the code)
- **Needs:** a way to turn the network off on the test device
- **Steps:**
  1. In a chat, type a sentence but do not send it. Open another chat, then come back: the sentence is still in the message box for this chat.
  2. In the first chat, send the sentence with the network off (see S16.15) so the send fails.
  3. Check the sentence returns to the message box as unsent text, and that it does not appear as a sent message in the transcript.
  4. Compare: sent messages appear in the transcript, while the unsent text stays in the box.
