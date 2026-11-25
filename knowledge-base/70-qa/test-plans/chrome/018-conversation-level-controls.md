---
id: "PLAN-chrome-018"
type: "test-plan"
title: "Chrome · 18. Conversation-level controls"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "18"
---
# Chrome · 18. Conversation-level controls

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S18.01 Automatic title.

- **Expected:** A new conversation gets a meaningful title automatically without the user naming it.
- **Code:** done. Evidence moved: apps/extension/src/features/background/conversation-history.ts:867; apps/extension/src/side_panel.ts:6690 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Code derives the title from the first user message (truncated to 60 characters). It does not generate a summary title, so Expected may not match what a tester sees; the Code line's evidence lines were moved and found in conversation-history.ts, not side_panel.ts.
- **Steps:**
  1. Sign in, open a new chat and send a first message such as 'Plan a three-day trip to Lisbon'.
  2. Look at the title row at the top of the chat.
  3. Click the Recent chats button and find the chat in the list.
  4. Compare the title with Expected: a meaningful title without you naming it. The code takes the first message text, collapses spaces and cuts it at 60 characters, so a long first message shows as a truncated copy of it, not a generated summary.

## S18.05 Delete.

- **Expected:** A conversation can be deleted, with confirmation, and it disappears everywhere.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6756 (quoted code not found in the file now); apps/extension/src/side_panel.ts:12661
- **Where to find it:** Recent chats > More actions for the chat > Delete chat > Delete chat (confirm) (labels found in the code)
- **Needs:** none for a chat saved only on this device; a signed-in account with a synced chat for the account wording and the 'disappears everywhere' check; a second signed-in device to see the chat is gone there
- **Steps:**
  1. Click the Recent chats button and find the chat row.
  2. Click the row's More actions button (its name is 'More actions for' the chat title), then click Delete chat.
  3. Read the confirmation: 'Delete this chat from this device? It cannot be recovered.' (or, for a chat synced to your account, '...from this device and from your AGI account?'). Click Delete chat to confirm, or Cancel to stop.
  4. Look for the status 'Chat deleted.' and check the chat is gone from Recent chats and from the title row.

## S18.09 Change conversation mode.

- **Expected:** Within a conversation, the user can switch its working mode (e.g. chat vs agent/work/plan) and later turns follow it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:11163; apps/extension/src/side_panel.ts:11167; apps/extension/src/side_panel.ts:6282 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:776; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:655
- **Where to find it:** Model button in the message box (the button showing the model name) > AGI Work switch (labels found in the code)
- **Needs:** a plan that includes AGI Work (otherwise the row is shown locked with 'available on' text)
- **Steps:**
  1. Open a chat and send one message.
  2. Click the model button in the message box, the one that shows the model name.
  3. Turn on the switch labelled AGI Work. Its description reads 'Plans and runs multi-step tasks with tools and files...'.
  4. Send a multi-step request, then check that the model button shows an 'AGI Work' badge and that later messages in this chat use it. Turn the switch off and check the badge goes away.

## S18.10 Change privacy mode through an explicit flow.

- **Expected:** The user switches a conversation's privacy mode (e.g. temporary/incognito, local-only) through an explicit flow that explains the consequence.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14937; apps/extension/src/side_panel.ts:8939; apps/extension/src/side_panel.ts:9078; apps/extension/src/side_panel.ts:1134 (quoted code not found in the file now); apps/extension/src/side_panel.ts:8912; apps/extension/src/side_panel.ts:10290
- **Where to find it:** Add attachment button > Temporary chat (labels found in the code)
- **Steps:**
  1. Start a new, empty chat. Click the Add attachment button in the message box.
  2. Click Temporary chat. Hover over it first to read its tooltip, which explains what is not saved.
  3. Look for the banner: 'Temporary chat. Stays out of your history, search, memory and Library.'
  4. Send a message, then click Add attachment again and click Temporary chat. Check the prompt offers End temporary chat, End and discard, Keep chatting or Turn off, and that after ending the chat is absent from Recent chats.

## S18.28 Continuation on another device.

- **Expected:** A conversation started on one device can be continued on another.
- **Code:** done. Evidence present: apps/extension/src/background.ts:6167; apps/extension/src/side_panel.ts:599
- **Where to find it:** Chat title row > More actions for the chat > Continue on phone (labels found in the code)
- **Needs:** a signed-in account, a chat synced to the account (the item only appears for chats with a cloud conversation), and a second device signed in with the same account
- **Steps:**
  1. Open a chat that is saved to your account (signed in, account mirroring on).
  2. Click the More actions button on the chat title row, then click Continue on phone.
  3. A sheet titled 'Continue on your phone' shows a code and the text 'Scan this code with your phone's camera to open this chat in AGI.' Use Copy link to copy the link.
  4. On the other device, sign in with the same account, open the link or scan the code, and check the same chat opens.
