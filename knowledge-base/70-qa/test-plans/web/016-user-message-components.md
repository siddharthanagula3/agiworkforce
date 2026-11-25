---
id: "PLAN-web-016"
type: "test-plan"
title: "Web · 16. User-message components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "16"
---
# Web · 16. User-message components

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S16.01 User identity/avatar.

- **Expected:** The author of each turn is distinguishable visually (avatar, name, alignment/bubble style or terminal marker) AND announced to assistive tech (R-n).
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2582; apps/web/features/chat/components/messages/MessageBubble.tsx:1982 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** no screen of its own. Expected mentions an avatar and a name, but the code states 'No avatars'; the author is shown by alignment and the hidden 'You said:' heading only.
- **Needs:** a Free or paid account; VoiceOver for the screen-reader step
- **Steps:**
  1. Sign in and open a chat, then send any short message.
  2. Look at your message: it should be a right-aligned bubble, and the reply a flat left column.
  3. With VoiceOver on, move through the transcript and check you hear 'You said:' before your message and 'Assistant said:' before a reply.
  4. Compare with Expected: the code has no avatars or names, so only the bubble-versus-column difference and the hidden headings apply.

## S16.02 Message text.

- **Expected:** The text the user sent is shown in their message in the transcript.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2900; apps/web/lib/hooks/useChatStream.ts:1394; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Earlier check in the running app:** PASS: E104 [PASS; synthetic temporary response completed]: Temporary request returned exact TEMP_QA_8402_OK. Conversation URL 20c45353-c2e3-4606-a039-692504921dcf and temporary status visible. This establishes inference in temporary mode, not retention enforcement.
- **Where to find it:** Chat screen: type in the box that reads 'Ask anything. Type / for commands', then press Enter (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open a new chat after signing in.
  2. Type 'QA test message one' in the box that reads 'Ask anything. Type / for commands'.
  3. Press Enter.
  4. Look at the transcript: your exact text should appear in your own message bubble on the right.

## S16.03 Attachment group.

- **Expected:** Files and images sent with a user turn are listed on that message (thumbnail or named chip) after sending.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3007; apps/web/features/chat/components/messages/MessageBubble.tsx:3050; apps/web/features/chat/components/messages/ChatMessageList.tsx:608; apps/web/lib/hooks/useChatStream.ts:4305; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat screen: attach a file or image in the composer, then send. The sent message shows the file as a thumbnail or named chip (labels found in the code)
- **Needs:** a file to upload (an image and a document)
- **Steps:**
  1. Open a new chat and use the composer's attach control to choose an image and a PDF or text file.
  2. Send the message.
  3. Look at your message: the image should show as a thumbnail and the file as a named chip.
  4. Click the image thumbnail and the file chip to check they open or download.

## S16.04 Source and context chips.

- **Expected:** A sent user message shows chips for the non-file context it carried (quoted text, connector/MCP resources, page, editor selection, @mentions).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3132; apps/web/features/chat/components/messages/MessageContextChips.tsx:17; apps/web/lib/hooks/useChatStream.ts:4228; apps/web/features/chat/lib/mcp-context-summary.ts:11
- **Where to find it:** Composer > Connectors, pick a prompt or a resource, then send. Or type / and pick a skill, then send (labels found in the code)
- **Needs:** a connected connector with a prompt or resource, or an available skill
- **Steps:**
  1. Open the composer's Connectors menu and choose a prompt or resource from a connected connector.
  2. Send a message with it.
  3. Look at your message: a chip should show 'Prompt:' or 'Resource:' and, for a skill, '/' plus the skill name.
  4. Hover a chip to see its full name in the tooltip.

## S16.05 Timestamp.

- **Expected:** Each user message exposes when it was sent (inline or on demand).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3962; apps/web/features/chat/components/messages/ChatMessageList.tsx:688; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Hover your message > More message actions > Sent at (labels found in the code)
- **Steps:**
  1. Send a message and hover over it.
  2. Click the 'More message actions' button at the end of the message's action row.
  3. Read the 'Sent at' line in the menu; it shows the time.
  4. Compare with Expected: the time appears on demand in the menu, not inline in the transcript.

## S16.06 Edited-message indicator.

- **Expected:** A user message that was edited after sending is visibly marked as edited.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:1000; apps/web/features/chat/components/messages/MessageBubble.tsx:3695; apps/web/features/chat/components/messages/VariantPager.tsx:25
- **Where to find it:** Hover your message > Edit message > change text > submit; then page the versions with Previous version and Next version (labels found in the code)
- **Needs:** a sent message you can edit
- **Steps:**
  1. Send a message, hover over it, and click 'Edit message'.
  2. Change the text and submit the edit.
  3. Look under your message for the version pager (1/2 style) with 'Previous version' and 'Next version'.
  4. Compare with Expected: the code shows the count and pager, not the word 'Edited'; check whether the pager is the edited mark you see.

## S16.07 Copy action.

- **Expected:** A sent user message offers a Copy action that puts its text on the clipboard.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3751; apps/web/features/chat/components/messages/MessageBubble.tsx:2273; apps/web/features/chat/components/messages/MessageBubble.tsx:2389; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Hover your message > Copy message (labels found in the code)
- **Steps:**
  1. Send a message and hover over it.
  2. Click the 'Copy message' button (tooltip 'Copy').
  3. Click into the composer and paste.
  4. Compare with Expected: the pasted text should match your message exactly.

## S16.08 Edit action.

- **Expected:** A sent user message can be edited in place and resubmitted, producing a new reply.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3734; apps/web/features/chat/components/messages/MessageBubble.tsx:2811; apps/web/features/chat/pages/WebChatPage.tsx:5627; apps/web/features/chat/pages/WebChatPage.tsx:5589; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Hover your message > Edit message (labels found in the code)
- **Needs:** a sent message you can edit
- **Steps:**
  1. Send a message and hover over it.
  2. Click 'Edit message' and change the text.
  3. Submit the edit.
  4. Look for a new reply under the edited message, and check the thread follows it.

## S16.09 Resend action.

- **Expected:** A sent user message can be re-sent unchanged from the message itself to get a fresh reply.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3708; apps/web/features/chat/components/messages/MessageBubble.tsx:3717; apps/web/features/chat/pages/WebChatPage.tsx:5778; apps/web/features/chat/components/messages/ChatMessageList.tsx:1116
- **Where to find it:** Hover your message > Retry this message (labels found in the code)
- **Needs:** a sent message; the button is disabled while a reply is still streaming
- **Steps:**
  1. Send a message and wait for the reply to finish.
  2. Hover over your message and click the 'Retry this message' button (tooltip 'Retry').
  3. Look at the transcript: a fresh reply should appear.
  4. Compare with Expected: the message text should be unchanged.

## S16.10 Branch-from-message action.

- **Expected:** From a chosen user message the user can start a new branch conversation that contains the thread up to that message.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4014; apps/web/features/chat/hooks/use-conversation-branches.ts:103; apps/web/app/api/chat/conversations/[id]/branches/route.ts:52; apps/web/app/api/chat/conversations/[id]/branches/route.ts:67; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Hover your message > Branch conversation from here, or More message actions > Branch conversation from here (labels found in the code)
- **Needs:** a conversation with at least two exchanges
- **Steps:**
  1. Send several messages so there is a thread.
  2. Hover a user message and click 'Branch conversation from here' (or open 'More message actions' and choose it).
  3. Wait for the new conversation to open.
  4. Compare with Expected: the new chat should contain the thread up to that message, and the original chat should be unchanged.

## S16.11 Message-version navigation.

- **Expected:** When a user message has several revisions the user can page between them (n of m) and the thread follows the chosen revision.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:994; apps/web/features/chat/components/messages/VariantPager.tsx:44 (quoted code not found in the file now); apps/web/features/chat/components/messages/VariantPager.tsx:69 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:2087; apps/web/features/chat/lib/message-variants-gate.ts:49
- **Known to be unfinished:** ['ui']
- **Where to find it:** Under an edited user message: 'Previous version' and 'Next version' buttons around the count (labels found in the code)
- **Needs:** a sent message you can edit
- **Steps:**
  1. Edit a sent message and submit the edit so it has two versions.
  2. Look under your message for the pager with the count (1/2).
  3. Click 'Previous version' and then 'Next version'.
  4. Compare with Expected: the count changes and the thread follows the version you chose.

## S16.12 Expand long message.

- **Expected:** A long user message is shown collapsed with a control that expands it to full length.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2950; apps/web/features/chat/components/messages/MessageBubble.tsx:927; apps/web/features/chat/components/messages/MessageBubble.tsx:2856; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat screen: a long user message shows a 'Show more' link under it (labels found in the code)
- **Needs:** a message long enough to collapse (paste several paragraphs)
- **Steps:**
  1. Paste a very long text into the composer and send it.
  2. Look under your message for the 'Show more' link.
  3. Click 'Show more' and check the full message appears.
  4. Compare with Expected: the message should now be at full length.

## S16.13 Collapse long message.

- **Expected:** An expanded long user message can be collapsed again.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2950; apps/web/features/chat/components/messages/MessageBubble.tsx:927; apps/web/features/chat/components/messages/MessageBubble.tsx:2856; apps/web/features/chat/pages/WebChatPage.tsx:7729; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat screen: after 'Show more', the same link reads 'Show less' (labels found in the code)
- **Needs:** a message long enough to collapse
- **Steps:**
  1. Send a long message and click 'Show more'.
  2. Click the 'Show less' link under the message.
  3. Compare with Expected: the message should shrink back to its collapsed height.

## S16.15 Delivery-failed state.

- **Expected:** When a user message fails to deliver, the transcript shows a clear failed state for that turn.
- **Code:** done. Evidence present: apps/web/lib/hooks/useChatStream.ts:6207; apps/web/lib/hooks/useChatStream.ts:6214; apps/web/lib/hooks/useChatStream.ts:5123
- **Where to find it:** not found in the code. No visible failed-state text for a user message was found; a failed user save only logs to the console. The only failure copy is the composer notice "Couldn't send. Restored here so you can try again." (ChatComposerNew.tsx) and an assistant 'Response failed' label.
- **Needs:** a way to make a send fail, such as a dropped connection

## S16.16 Retry-send action.

- **Expected:** A failed send offers Retry that re-sends the same turn (text and attachments) and replaces the failure with the new outcome.
- **Code:** done. Evidence present: apps/web/lib/hooks/useChatStream.ts:6207; apps/web/lib/hooks/useChatStream.ts:6214; apps/web/lib/hooks/useChatStream.ts:5123
- **Where to find it:** not found in the code. No Retry is found on a failed send: the composer restores the draft with the notice "Couldn't send. Restored here so you can try again." and the 'Retry this message' button exists on sent messages, but not as a failure action. Searched useChatStream.ts and ChatComposerNew.tsx for failed-send retry.
- **Needs:** a way to make a send fail

## S16.17 Queued-message state.

- **Expected:** A message sent while a reply is still running is shown as queued (not yet sent) until it goes out.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5010; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:359; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4340; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat screen: send a message while a reply is still running. A 'Queued messages' list appears above the message box (labels found in the code)
- **Needs:** a prompt that gives a reply long enough to send a second message during
- **Steps:**
  1. Send a message that starts a long reply.
  2. While it is still running, type a second message and send it.
  3. Look above the message box for the 'Queued messages' list with a row that starts 'Queued:'.
  4. Wait for the reply to finish, then check the row goes and the message appears in the transcript.

## S16.18 Draft versus submitted distinction.

- **Expected:** Unsent composer text is kept as a draft per conversation, separate from sent messages, and a failed send returns to the composer as an unsent draft.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:689; apps/web/features/chat/hooks/use-conversation-draft-sync.ts:28 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:1972; apps/web/app/api/chat/conversations/[id]/route.ts:223; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat screen: type text in the box that reads 'Ask anything. Type / for commands' without sending, then switch to another conversation and come back (labels found in the code)
- **Needs:** two conversations in the account
- **Steps:**
  1. Open a chat and type 'draft text' in the box, without sending.
  2. Open a different conversation from the sidebar, then open the first one again.
  3. Look at the message box: the draft should still be there and should not appear in the transcript.
  4. Compare with Expected: sent messages stay in the transcript; the unsent draft stays only in the box.
