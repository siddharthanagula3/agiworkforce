---
id: "PLAN-desktop-016"
type: "test-plan"
title: "Desktop · 16. User-message components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "16"
---
# Desktop · 16. User-message components

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S16.01 User identity/avatar.

- **Expected:** The author of each turn is distinguishable visually (avatar, name, alignment/bubble style or terminal marker) AND announced to assistive tech (R-n).
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2582; apps/web/features/chat/components/messages/MessageBubble.tsx:1982 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** no screen of its own. There is no avatar or visible name. The only author text is a screen-reader-only heading 'You said:' in MessageBubble.tsx, so the visual part is alignment only.
- **Steps:**
  1. Sign in, start a new chat, type a short message and press Send.
  2. Look at the message: it sits as a right-aligned bubble, and the assistant reply is a flat left-aligned column with no avatar or name, so the two authors are told apart by alignment and bubble style.

## S16.02 Message text.

- **Expected:** The text the user sent is shown in their message in the transcript.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2900; apps/web/lib/hooks/useChatStream.ts:1394; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Start a new chat, type in the message box at the bottom of the chat screen, press Send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Sign in and open a new chat.
  2. Type a short sentence in the message box at the bottom and press Send.
  3. Look at the transcript: the sentence you typed should appear in your message bubble above the reply.

## S16.03 Attachment group.

- **Expected:** Files and images sent with a user turn are listed on that message (thumbnail or named chip) after sending.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3007; apps/web/features/chat/components/messages/MessageBubble.tsx:3050; apps/web/features/chat/components/messages/ChatMessageList.tsx:608; apps/web/lib/hooks/useChatStream.ts:4305; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Start a new chat, attach a file or image to the message box, press Send (path not confirmed in the code; trust the screen)
- **Needs:** a file to upload, and optionally an image
- **Steps:**
  1. Sign in and open a new chat.
  2. Attach an image or a file to the message box (use the attach control at the bottom of the chat screen), type a short text and press Send.
  3. Look at the sent message: image thumbnails or a named file chip should appear on that message. Click a thumbnail to open it full size.

## S16.04 Source and context chips.

- **Expected:** A sent user message shows chips for the non-file context it carried (quoted text, connector/MCP resources, page, editor selection, @mentions).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3132; apps/web/features/chat/components/messages/MessageContextChips.tsx:17; apps/web/lib/hooks/useChatStream.ts:4228; apps/web/features/chat/lib/mcp-context-summary.ts:11
- **Where to find it:** Chat screen, a sent message with a skill, a connector prompt or a connector resource attached (labels found in the code)
- **Needs:** a connector with prompts or resources, or a skill
- **Steps:**
  1. Sign in and open a chat where a skill or a connector (MCP) prompt or resource is available.
  2. Use the skill, prompt or resource in the message box and press Send.
  3. Look under the sent user message: chips such as '/<skill name>', 'Prompt:' or 'Resource:' should appear, grouped as 'Context sent with this message'.

## S16.05 Timestamp.

- **Expected:** Each user message exposes when it was sent (inline or on demand).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3962; apps/web/features/chat/components/messages/ChatMessageList.tsx:688; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Hover over the sent user message > 'More message actions' (the three-dot button) > 'Sent at' (labels found in the code)
- **Steps:**
  1. Sign in, send a message in a chat.
  2. Hover over your sent message (on touch screens the actions stay visible).
  3. Click the 'More message actions' button under the message.
  4. Look at the top of the menu: 'Sent at' followed by the time should be shown.

## S16.06 Edited-message indicator.

- **Expected:** A user message that was edited after sending is visibly marked as edited.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:1000; apps/web/features/chat/components/messages/MessageBubble.tsx:3695; apps/web/features/chat/components/messages/VariantPager.tsx:25
- **Where to find it:** Hover over a sent user message > 'Edit message' > save the edit > a version pager appears under the message (labels found in the code)
- **Steps:**
  1. Send a message, then hover over it and click 'Edit message'.
  2. Change the text and click 'Save & Retry'.
  3. Look under the edited message: a version pager with 'Previous version' and 'Next version' arrows appears, and its label should read 'Edited message, version n of m'.

## S16.07 Copy action.

- **Expected:** A sent user message offers a Copy action that puts its text on the clipboard.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3751; apps/web/features/chat/components/messages/MessageBubble.tsx:2273; apps/web/features/chat/components/messages/MessageBubble.tsx:2389; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Hover over the sent user message > 'Copy message' button (tooltip 'Copy') (labels found in the code)
- **Steps:**
  1. Send a message and hover over it.
  2. Click the copy button (tooltip 'Copy') in the action row under the message.
  3. Paste into the message box or another app. The icon should change to a check and the label to 'Message copied'. Compare the pasted text with the sent text.

## S16.08 Edit action.

- **Expected:** A sent user message can be edited in place and resubmitted, producing a new reply.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3734; apps/web/features/chat/components/messages/MessageBubble.tsx:2811; apps/web/features/chat/pages/WebChatPage.tsx:5627; apps/web/features/chat/pages/WebChatPage.tsx:5589; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Hover over the sent user message > 'Edit message' (pencil button, tooltip 'Edit') (labels found in the code)
- **Needs:** a sent message
- **Steps:**
  1. Send a message and hover over it.
  2. Click the pencil button 'Edit message' in the action row.
  3. The bubble becomes an editor with 'Cancel' and 'Save & Retry' buttons. Change the text and click 'Save & Retry'.
  4. Look at the thread: the edited message replaces the old one and a new reply appears.

## S16.09 Resend action.

- **Expected:** A sent user message can be re-sent unchanged from the message itself to get a fresh reply.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3708; apps/web/features/chat/components/messages/MessageBubble.tsx:3717; apps/web/features/chat/pages/WebChatPage.tsx:5778; apps/web/features/chat/components/messages/ChatMessageList.tsx:1116
- **Where to find it:** Hover over the sent user message > 'Retry this message' (circular arrow button, tooltip 'Retry') (labels found in the code)
- **Steps:**
  1. Send a message and wait until the reply finishes (the button is disabled while a reply is running).
  2. Hover over your sent message and click 'Retry this message' in the action row.
  3. Look at the thread: a new reply should appear for the same unchanged message.

## S16.10 Branch-from-message action.

- **Expected:** From a chosen user message the user can start a new branch conversation that contains the thread up to that message.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4014; apps/web/features/chat/hooks/use-conversation-branches.ts:103; apps/web/app/api/chat/conversations/[id]/branches/route.ts:52; apps/web/app/api/chat/conversations/[id]/branches/route.ts:67; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Hover over the sent user message > 'More message actions' > 'Branch conversation from here' (labels found in the code)
- **Needs:** a chat with several messages
- **Steps:**
  1. Open a chat with at least two exchanges.
  2. Hover over an earlier user message and click 'More message actions'.
  3. Click 'Branch conversation from here' (it shows 'Creating branch…' while running).
  4. Look at the new conversation: it should contain the thread up to that message, and the original chat should stay unchanged.

## S16.11 Message-version navigation.

- **Expected:** When a user message has several revisions the user can page between them (n of m) and the thread follows the chosen revision.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:994; apps/web/features/chat/components/messages/VariantPager.tsx:44 (quoted code not found in the file now); apps/web/features/chat/components/messages/VariantPager.tsx:69 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:2087; apps/web/features/chat/lib/message-variants-gate.ts:49
- **Known to be unfinished:** ['ui']
- **Where to find it:** Hover over an edited user message > 'Previous version' / 'Next version' arrows under the message (appears only after the message has more than one version) (labels found in the code)
- **Needs:** a sent message that you can edit
- **Steps:**
  1. Send a message, then edit it with 'Edit message' > 'Save & Retry' so it has two versions.
  2. Look under the edited message for the pager arrows.
  3. Click 'Previous version' and 'Next version' and check the page position changes (n of m), and the thread below follows the chosen version.

## S16.12 Expand long message.

- **Expected:** A long user message is shown collapsed with a control that expands it to full length.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2950; apps/web/features/chat/components/messages/MessageBubble.tsx:927; apps/web/features/chat/components/messages/MessageBubble.tsx:2856; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat screen, a long sent user message (collapsed) > 'Show more' button under the message (labels found in the code)
- **Needs:** a long message to paste or type
- **Steps:**
  1. Send a long message (several paragraphs of text).
  2. Look under the message: it should be cut short and a 'Show more' button appears under it.
  3. Click 'Show more' and check the full message is visible.

## S16.13 Collapse long message.

- **Expected:** An expanded long user message can be collapsed again.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2950; apps/web/features/chat/components/messages/MessageBubble.tsx:927; apps/web/features/chat/components/messages/MessageBubble.tsx:2856; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat screen, an expanded long sent user message > 'Show less' button under the message (labels found in the code)
- **Needs:** a long message to paste or type
- **Steps:**
  1. Follow S16.12 to expand a long message.
  2. Click 'Show less' under the expanded message.
  3. Check the message shrinks back to the collapsed height with 'Show more' visible again.

## S16.15 Delivery-failed state.

- **Expected:** When a user message fails to deliver, the transcript shows a clear failed state for that turn.
- **Code:** done. Evidence present: apps/web/lib/hooks/useChatStream.ts:6207; apps/web/lib/hooks/useChatStream.ts:6214; apps/web/lib/hooks/useChatStream.ts:5123
- **Where to find it:** Message box at the bottom of the chat screen, after a send fails (for example with the network off) (labels found in the code)
- **Needs:** a way to make the network fail (turn off Wi-Fi)
- **Steps:**
  1. Sign in, open a chat, and turn off the Wi-Fi or network.
  2. Type a message and press Send.
  3. Look at the message box and the transcript: a notice "Couldn't send. Restored here so you can try again." should appear above the composer, with the text restored in the box.

## S16.16 Retry-send action.

- **Expected:** A failed send offers Retry that re-sends the same turn (text and attachments) and replaces the failure with the new outcome.
- **Code:** done. Evidence present: apps/web/lib/hooks/useChatStream.ts:6207; apps/web/lib/hooks/useChatStream.ts:6214; apps/web/lib/hooks/useChatStream.ts:5123
- **Where to find it:** not found in the code. Searched MessageBubble.tsx, ChatMessageList.tsx and ChatComposerNew.tsx for a Retry or Resend control on a failed user send; found none. The only 'Try again' is for a stopped response in ChatMessageList.tsx. A failed send is restored to the composer (see S16.15), where the tester presses Send again, but there is no Retry control that re-sends the same text and attachments.
- **Needs:** a way to make the network fail (turn off Wi-Fi)

## S16.17 Queued-message state.

- **Expected:** A message sent while a reply is still running is shown as queued (not yet sent) until it goes out.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5010; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:359; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4340; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Message box at the bottom of the chat screen, while a reply is still running > 'Queued' row above the box (labels found in the code)
- **Needs:** a reply that takes time to finish
- **Steps:**
  1. Send a message that starts a long reply.
  2. While the reply is still streaming, type a second message in the message box and press Send.
  3. Look above the message box: a row labelled 'Queued' (or 'Queued 1 of 2:' with more than one) with 'Edit queued message' and 'Cancel queued message' buttons should appear, and it should disappear when the reply goes out.

## S16.18 Draft versus submitted distinction.

- **Expected:** Unsent composer text is kept as a draft per conversation, separate from sent messages, and a failed send returns to the composer as an unsent draft.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:689; apps/web/features/chat/hooks/use-conversation-draft-sync.ts:28 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:1972; apps/web/app/api/chat/conversations/[id]/route.ts:223; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat screen: type text in the message box, switch to another chat in the sidebar, then come back to the first chat (labels found in the code)
- **Needs:** two chats, and optionally the network off to test a failed send
- **Steps:**
  1. Open chat A and type a sentence in the message box but do not press Send.
  2. Open a different chat, then go back to chat A.
  3. Look at the message box: the unsent sentence should still be there, while the sent messages stay in the transcript as sent messages.
  4. Send a message while the network is off (see S16.15): the text should return to the box with the notice 'Couldn't send. Restored here so you can try again.'
