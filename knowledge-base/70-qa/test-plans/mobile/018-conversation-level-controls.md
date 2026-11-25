---
id: "PLAN-mobile-018"
type: "test-plan"
title: "Mobile · 18. Conversation-level controls"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "18"
---
# Mobile · 18. Conversation-level controls

15 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S18.01 Automatic title.

- **Expected:** A new conversation gets a meaningful title automatically without the user naming it.
- **Code:** done. Evidence present: apps/mobile/app/(app)/(tabs)/chat.tsx:569; apps/mobile/src/features/chat/ChatsListScreen.tsx:124
- **Where to find it:** no screen of its own. The code sets the title to the first 40 characters of the first message (chat.tsx around line 762), with 'New chat' as fallback. No AI-generated summary title was found in apps/mobile; a server-side title step is unknown.
- **Steps:**
  1. Sign in and start a new chat by typing a first message and sending it.
  2. Tap the Open menu button at the top of the chat, then tap See all chats.
  3. Find the new chat's row in the list and read its title.
  4. Compare the title with Expected: it should be a meaningful title without you naming the chat.

## S18.02 Manual rename.

- **Expected:** The user can rename a conversation and the new title persists.
- **Code:** done. Evidence moved: apps/mobile/src/features/conversation-actions/useConversationActions.ts:267; apps/mobile/app/(app)/chat/[id].tsx:1195 (quoted code not found in the file now)
- **Where to find it:** Open a chat > Conversation menu > Rename (labels found in the code)
- **Steps:**
  1. Open a chat that already has a title.
  2. Tap the Conversation menu button (icon only, accessibility label 'Conversation menu') at the top of the chat.
  3. Tap Rename.
  4. Type a new name in the Rename chat box and tap Rename.
  5. Leave the chat, open See all chats, and check the new name is still shown.

## S18.03 Pin and unpin.

- **Expected:** A conversation can be pinned so it stays at the top of the list, and unpinned.
- **Code:** done. Evidence moved: apps/mobile/src/features/conversation-actions/useConversationActions.ts:124 (quoted code not found in the file now); apps/mobile/stores/chat/chatMessageStore.ts:965; apps/mobile/src/features/chat/ChatsListScreen.tsx:148
- **Where to find it:** See all chats > long-press a chat row > Pin (or Unpin) (labels found in the code)
- **Steps:**
  1. Open Open menu > See all chats.
  2. Long-press a chat row (or tap its More actions icon).
  3. Tap Pin.
  4. Check that the chat moves to the Pinned group at the top, and that the Pinned filter shows it.
  5. Long-press the same row again and tap Unpin; check it returns to its date group.

## S18.04 Archive and restore.

- **Expected:** A conversation can be archived (hidden, kept) and later restored.
- **Code:** done. Evidence present: apps/mobile/services/cloudSyncEngine.ts:128
- **Where to find it:** Open a chat > Conversation menu > Archive; restore at Settings > Privacy > Archived chats (labels found in the code)
- **Needs:** a signed-in account with a Cloud chat
- **Steps:**
  1. Open a Cloud chat (archive is offered only for Cloud chats, not Local ones).
  2. Tap Conversation menu and tap Archive.
  3. Read the message 'Chat archived. Find it in Settings, Archived chats.' and check the chat is gone from See all chats.
  4. Open Open menu > Settings > Privacy > Archived chats.
  5. Tap Restore on the chat and check it comes back to See all chats.

## S18.05 Delete.

- **Expected:** A conversation can be deleted, with confirmation, and it disappears everywhere.
- **Code:** done. Evidence moved: apps/mobile/src/features/conversation-actions/useConversationActions.ts:160 (quoted code not found in the file now)
- **Where to find it:** Open a chat > Conversation menu > Delete (labels found in the code)
- **Needs:** a chat you can delete
- **Steps:**
  1. Open a chat you are willing to delete.
  2. Tap Conversation menu and tap Delete.
  3. Read the Delete chat? box, which states what is lost, then tap Delete.
  4. Check the chat is gone from See all chats and you are returned from the chat screen.

## S18.07 Move to Project.

- **Expected:** An existing conversation can be moved into a Project.
- **Code:** done. Evidence present: apps/mobile/src/features/conversation-actions/useConversationActions.ts:279
- **Where to find it:** Open a chat > Conversation menu > Move to project (labels found in the code)
- **Needs:** at least one Project
- **Steps:**
  1. Open a chat that is not in a project.
  2. Tap Conversation menu and tap Move to project.
  3. In the Move to project list, tap a project name.
  4. Check the toast 'Moved to <project name>' appears.
  5. Open the project from the Projects tab and check the chat is listed there.

## S18.09 Change conversation mode.

- **Expected:** Within a conversation, the user can switch its working mode (e.g. chat vs agent/work/plan) and later turns follow it.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2387
- **Where to find it:** Chat tab > new chat > Chat or Work switch (Chat / Work) (labels found in the code)
- **Needs:** a signed-in account whose plan includes AGI Work and Cloud mode; the switch is hidden on a chat that already started
- **Steps:**
  1. Sign in on an account whose plan includes AGI Work, and start a new chat in Cloud mode.
  2. Before sending anything, tap Work in the Chat or Work switch.
  3. Send a message and check it is answered as planned, multi-step work with tools.
  4. Send a second message and compare how it runs with Expected: later turns should follow the chosen mode.

## S18.10 Change privacy mode through an explicit flow.

- **Expected:** The user switches a conversation's privacy mode (e.g. temporary/incognito, local-only) through an explicit flow that explains the consequence.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:21 (quoted code not found in the file now); apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:8 (quoted code not found in the file now)
- **Where to find it:** Chat tab > top-right eye-off button (Enable temporary chat) > Turn on temporary chat? (labels found in the code)
- **Steps:**
  1. On the Chat tab, tap the eye-off button at the top right.
  2. Read the Turn on temporary chat? box, which states the consequence.
  3. Tap Cancel and check nothing changes; tap the button again and tap Turn on.
  4. Check the button now shows the word Temporary.
  5. Tap Temporary again to turn it off.

## S18.15 Jump to latest.

- **Expected:** After scrolling up, one control returns the view to the latest message.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageList.tsx:528; apps/mobile/src/features/chat/components/MessageList.tsx:264
- **Where to find it:** Open a long chat > scroll up > round down-arrow button (Scroll to bottom) (labels found in the code)
- **Needs:** a conversation long enough to scroll
- **Steps:**
  1. Open a chat with enough messages to scroll.
  2. Scroll up several screens.
  3. Look for the round button with a down chevron that appears over the thread.
  4. Tap it and check the view jumps to the latest message and the button hides.

## S18.17 Branch-tree navigation.

- **Expected:** A conversation with branches lets the user see and switch between branches.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:3133
- **Where to find it:** Open a chat > long-press a message > Branch Conversation from Here (labels found in the code)
- **Needs:** a chat with messages; not available in temporary chats
- **Steps:**
  1. Open a chat with at least one reply.
  2. Long-press a message (about half a second).
  3. Tap Branch Conversation from Here.
  4. Check the toast 'Conversation branch created' and the new chat titled '<chat title> (branch)'.
  5. For alternate answers, look for the Previous and Next arrows under a reply that has more than one version and tap them.

## S18.18 Conversation export.

- **Expected:** The whole conversation can be exported to a file (e.g. Markdown, PDF, JSON).
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2837; apps/mobile/app/(app)/chat/[id].tsx:1790
- **Where to find it:** Open a chat > Conversation menu > Export > Export as Markdown (labels found in the code)
- **Steps:**
  1. Open a chat that has messages.
  2. Tap Conversation menu and tap Export.
  3. Read the Export Conversation list: Export as PDF, Print, Export as Text, Export as Markdown, Copy All Messages.
  4. Tap Export as Markdown and choose where to save or share the file.
  5. Open the file and check every message is in it, in order.

## S18.19 Conversation sharing.

- **Expected:** The user can share a conversation (e.g. a read-only link) from the conversation.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/chat/[id].tsx:1535 (quoted code not found in the file now)
- **Where to find it:** Open a chat > Conversation menu > Share (labels found in the code)
- **Needs:** a signed-in account and a Cloud chat
- **Steps:**
  1. Open a signed-in Cloud chat that is not temporary.
  2. Tap Conversation menu and tap Share.
  3. Read Share a link to this chat? and tap Create link.
  4. Choose a app from the share sheet to send the link.
  5. Open the link in a browser that is not signed in and check the chat can be read.

## S18.20 Shared-link management.

- **Expected:** The user can see and revoke links they have shared.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/shared-links.tsx:48 (quoted code not found in the file now); apps/mobile/app/(app)/settings/shared-links.tsx:92 (quoted code not found in the file now); apps/mobile/src/features/shared-links/service.ts:43 (quoted code not found in the file now); apps/mobile/src/features/settings/index.tsx:443 (quoted code not found in the file now)
- **Where to find it:** Open menu > Settings > Privacy > Shared links (labels found in the code)
- **Needs:** a Cloud account with at least one shared link
- **Steps:**
  1. Tap Open menu, then Settings, then Privacy.
  2. Tap Shared links.
  3. Find a link you created (S18.19), tap Revoke, and read Revoke this link?.
  4. Tap Revoke again to confirm and check the link leaves the list.
  5. Open the old link in a browser and check it no longer opens.

## S18.22 Context and source inspector.

- **Expected:** The user can inspect what context and sources the conversation is using (files, instructions, memory, token budget).
- **Code:** done. Evidence moved: apps/mobile/app/(app)/chat/[id].tsx:1554 (quoted code not found in the file now)
- **Where to find it:** Open a chat > Conversation menu > What is in context (labels found in the code)
- **Steps:**
  1. Open a chat that has messages and some context.
  2. Tap Conversation menu and tap What is in context.
  3. Read the sheet: the model, the percent of context used, and the list of context rows.
  4. Check the rows cover files, instructions, memory and the token budget as Expected asks.
  5. Tap Close context details to close.

## S18.28 Continuation on another device.

- **Expected:** A conversation started on one device can be continued on another.
- **Code:** done. Evidence moved: apps/mobile/stores/chat/chatExecutionStore.ts:1484; apps/mobile/src/features/chat/ChatsListScreen.tsx:330 (quoted code not found in the file now)
- **Where to find it:** Second device: Open menu > See all chats > open the same chat (labels found in the code)
- **Needs:** two devices signed in to the same account
- **Steps:**
  1. On device A (signed in), start or open a Cloud chat and send a message.
  2. On device B, signed in to the same account, tap Open menu and then See all chats.
  3. Find the same chat under Recent chats and open it; check the messages from device A are there.
  4. Send a reply on device B and check it appears on device A after sync.
