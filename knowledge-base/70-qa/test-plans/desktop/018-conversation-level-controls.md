---
id: "PLAN-desktop-018"
type: "test-plan"
title: "Desktop · 18. Conversation-level controls"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "18"
---
# Desktop · 18. Conversation-level controls

22 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S18.01 Automatic title.

- **Expected:** A new conversation gets a meaningful title automatically without the user naming it.
- **Code:** done. Evidence present: apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:200; apps/web/features/chat/pages/WebChatPage.tsx:5040
- **Where to find it:** no screen of its own. The title is generated in apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts; there is no visible control for it, so the tester only sees the result.
- **Steps:**
  1. Sign in and start a new chat without naming it.
  2. Send one message and wait for the reply.
  3. Look at the sidebar row for this chat and at the title at the top of the chat. Compare with Expected: a meaningful title, not a placeholder.

## S18.02 Manual rename.

- **Expected:** The user can rename a conversation and the new title persists.
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:153; apps/web/shared/components/layout/WebAppShell.tsx:345
- **Where to find it:** Chat screen > conversation title at the top > Rename (labels found in the code)
- **Steps:**
  1. Open a conversation that has messages.
  2. Click the conversation title at the top of the chat.
  3. Click Rename in the menu, type a new name and press Enter.
  4. Open the sidebar and check that the row shows the new name; reload the page and check it again.

## S18.03 Pin and unpin.

- **Expected:** A conversation can be pinned so it stays at the top of the list, and unpinned.
- **Code:** done. Evidence present: apps/web/app/api/chat/conversations/[id]/route.ts:359; apps/web/app/api/chat/conversations/bulk/route.ts:74
- **Where to find it:** Sidebar > the row's More options button (three dots, hover the row) > Pin; later the same menu > Unpin (labels found in the code)
- **Steps:**
  1. Hover a conversation row in the sidebar and click its three-dot More options button.
  2. Click Pin.
  3. Check that the row now shows a pin mark and moves to the top of the list (the move to top was not confirmed in the code read).
  4. Repeat the menu and click Unpin; check the pin mark is gone.

## S18.04 Archive and restore.

- **Expected:** A conversation can be archived (hidden, kept) and later restored.
- **Code:** done. Evidence moved: packages/ui/ui/src/sidebar/SessionItem.tsx:386; apps/web/shared/components/layout/WebAppShell.tsx:322 (quoted code not found in the file now)
- **Where to find it:** Sidebar > a row's More options button > Archive; to bring it back open Show archived chats and use the row's More options > Restore (labels found in the code)
- **Steps:**
  1. Hover a conversation row, click its three-dot More options button and click Archive.
  2. Check that the chat leaves the main list and a toast says Chat archived.
  3. Click Show archived chats in the sidebar to list archived chats.
  4. Click More options on the archived chat, click Restore, and check it returns to the main list. The chat screen menu also offers Archive and Unarchive.

## S18.05 Delete.

- **Expected:** A conversation can be deleted, with confirmation, and it disappears everywhere.
- **Code:** done. Evidence present: apps/web/app/api/chat/conversations/[id]/route.ts:501; apps/web/app/api/chat/conversations/[id]/restore/route.ts:27; apps/web/app/api/chat/conversations/bulk/route.ts:63
- **Where to find it:** Sidebar > a row's More options button > Delete, or chat screen > conversation title > Delete (labels found in the code)
- **Steps:**
  1. Hover a conversation row, click its three-dot More options button and click Delete.
  2. Read the dialog title Delete conversation? and its text; click Cancel first and check the chat is still there.
  3. Click Delete again, then the Delete conversation button in the dialog.
  4. Check the chat is gone from the sidebar and that opening its old link shows it as not found.

## S18.06 Duplicate.

- **Expected:** A conversation can be duplicated into a new, independent conversation.
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:209; apps/web/features/chat/pages/WebChatPage.tsx:7422
- **Where to find it:** Chat screen > conversation title at the top > Duplicate as branch (labels found in the code)
- **Steps:**
  1. Open a conversation that has messages.
  2. Click the conversation title at the top of the chat and click Duplicate as branch.
  3. Check that a new conversation opens with the same messages.
  4. Send a message in the new one and check the original conversation is unchanged.

## S18.07 Move to Project.

- **Expected:** An existing conversation can be moved into a Project.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:414; apps/web/shared/components/layout/WebAppShell.tsx:379
- **Where to find it:** Sidebar > a row's More options button > Move to project > the project name; or chat screen > conversation title > Move to project (labels found in the code)
- **Needs:** a project created first
- **Steps:**
  1. Make sure at least one project exists (the menu item appears only when a project exists).
  2. Hover a conversation row, click its three-dot More options button and open Move to project.
  3. Click a project name.
  4. Open that project and check the conversation is listed there.

## S18.09 Change conversation mode.

- **Expected:** Within a conversation, the user can switch its working mode (e.g. chat vs agent/work/plan) and later turns follow it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6182; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2808; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1112
- **Where to find it:** Composer (bottom of the chat) > second row > the Chat / Work switch (labels found in the code)
- **Steps:**
  1. Open a new or existing conversation and look at the switch under the message box.
  2. Click Work, then send a message.
  3. Check the reply uses the work mode: the Work session panel opens from Panels.
  4. Click Chat, send another message, and check it behaves as a chat reply.

## S18.10 Change privacy mode through an explicit flow.

- **Expected:** The user switches a conversation's privacy mode (e.g. temporary/incognito, local-only) through an explicit flow that explains the consequence.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:356 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1829
- **Where to find it:** Composer + button > Use incognito (switch to Exit incognito); the same menu shows End temporary chat (labels found in the code)
- **Steps:**
  1. Click the + button in the message box.
  2. Click Use incognito and read the explanation under it: Stays out of your history, search, memory and Library.
  3. Send a message and check the chat is not in the sidebar history after you leave it.
  4. Open the + menu again and click Exit incognito (or End temporary chat) and check the state changes.

## S18.11 Conversation search.

- **Expected:** The user can search within the open conversation's messages.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageSearch.tsx:96; apps/web/features/chat/components/messages/ChatMessageList.tsx:1541; apps/web/features/chat/components/messages/ChatMessageList.tsx:2093
- **Where to find it:** Keyboard: Command+F (Ctrl+F on Windows/Linux) in an open chat > Search messages box (labels found in the code)
- **Needs:** a conversation with repeated words
- **Steps:**
  1. Open a conversation with several messages.
  2. Press Command+F.
  3. Type a word that appears in the chat and check the Search messages... box opens.
  4. Check the match count next to the box (N of M matches or No matches) and that matches are highlighted.

## S18.12 Jump between search matches.

- **Expected:** In-conversation search moves between matches (next/previous) and scrolls to each.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageSearch.tsx:132; apps/web/features/chat/components/messages/ChatMessageList.tsx:1518
- **Where to find it:** Search messages box (after Command+F) > Next match and Previous match arrows (labels found in the code)
- **Needs:** a conversation with repeated words
- **Steps:**
  1. Search for a word that has several matches.
  2. Press Enter or click the Next match (Enter) arrow; check the view scrolls to the next match.
  3. Press Shift+Enter or click the Previous match (Shift+Enter) arrow; check the view goes back.
  4. Check the count in the box changes with each move.

## S18.15 Jump to latest.

- **Expected:** After scrolling up, one control returns the view to the latest message.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:384; apps/web/features/chat/components/messages/ChatMessageList.tsx:1582
- **Where to find it:** Chat screen > round down-arrow button labelled Scroll to bottom (appears when you scroll up) (labels found in the code)
- **Needs:** a long conversation
- **Steps:**
  1. Open a long conversation and scroll up to an older message.
  2. Look for the round down-arrow button at the bottom of the message area.
  3. Click it and check the view jumps back to the latest message.

## S18.17 Branch-tree navigation.

- **Expected:** A conversation with branches lets the user see and switch between branches.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2614; apps/web/features/chat/pages/WebChatPage.tsx:7753
- **Where to find it:** Hover an assistant reply > Branch conversation from here; then the branch arrows on that message (Previous branch, Next branch) (labels found in the code)
- **Steps:**
  1. Hover an assistant reply and click Branch conversation from here.
  2. Check a new branch is created for that point.
  3. Find the branch arrows on the message that has branches and click Next branch and Previous branch.
  4. Check the message content and the rest of the conversation change to the chosen branch.

## S18.18 Conversation export.

- **Expected:** The whole conversation can be exported to a file (e.g. Markdown, PDF, JSON).
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:198; apps/web/features/chat/pages/WebChatPage.tsx:7938
- **Where to find it:** Chat screen > conversation title at the top > Export… (labels found in the code)
- **Steps:**
  1. Open a conversation and click the conversation title at the top.
  2. Click Export….
  3. In the Export Chat History dialog, pick Markdown, PDF or JSON and read the preview.
  4. Click the download control and open the saved file; check it holds the whole conversation.

## S18.19 Conversation sharing.

- **Expected:** The user can share a conversation (e.g. a read-only link) from the conversation.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:7502; apps/web/features/chat/components/share/ShareConversationDialog.tsx:444; apps/web/features/chat/hooks/use-share-conversation.ts:177 (quoted code not found in the file now)
- **Where to find it:** Chat screen > conversation title at the top > Share…, or the header button Share conversation (labels found in the code)
- **Steps:**
  1. Open a conversation and click the conversation title, then Share….
  2. In the Share conversation dialog, choose Anyone with the link and create the link using the dialog's button.
  3. Copy the link.
  4. Open the link in a private browser window without signing in and check the conversation shows.

## S18.20 Shared-link management.

- **Expected:** The user can see and revoke links they have shared.
- **Code:** done. Evidence moved: apps/web/features/chat/components/share/ShareConversationDialog.tsx:223; apps/web/features/chat/hooks/use-share-conversation.ts:212 (quoted code not found in the file now)
- **Where to find it:** Share conversation dialog (open it again from Share…) > Revoke share (labels found in the code)
- **Needs:** a shared conversation
- **Steps:**
  1. Create a share link for a conversation (see S18.19) and reopen the Share conversation dialog.
  2. Check the dialog shows the existing link state (title Public link ready or Shared with your workspace).
  3. Click Revoke share, then the Revoke share confirmation in the dialog.
  4. Open the old link in a private window and check it no longer opens.

## S18.21 Conversation details inspector.

- **Expected:** A conversation details view shows its metadata (created/updated, model, message count, id, project).
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:6614; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:1115; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:942; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:558
- **Where to find it:** Panels button (top right of the chat) > Open Chat details; the Details section is at the bottom of the panel (labels found in the code)
- **Needs:** a conversation with messages
- **Steps:**
  1. Open a conversation with messages.
  2. Click the Panels button at the top right and then Open Chat details.
  3. Scroll to the Details section.
  4. Check the rows Created, Last updated, Model (or Models) and Messages against the chat.

## S18.22 Context and source inspector.

- **Expected:** The user can inspect what context and sources the conversation is using (files, instructions, memory, token budget).
- **Code:** done. Evidence present: apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:1113; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:1023; apps/web/features/chat/pages/WebChatPage.tsx:6614
- **Where to find it:** Panels button (top right of the chat) > Open Chat details > Context and Sources sections (labels found in the code)
- **Needs:** a conversation that used files or web search
- **Steps:**
  1. Open a conversation and click Panels, then Open Chat details.
  2. Look at the Context section; in Work mode an empty section shows Tools and files this session uses show up here.
  3. Look at the Sources section if the answer used web results.
  4. Check the listed items match what the chat used.

## S18.25 Conversation-level enabled tools.

- **Expected:** Tool enablement (web search, code, etc.) can be set for this conversation and persists across its turns.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:1903; apps/web/features/chat/pages/WebChatPage.tsx:1925
- **Where to find it:** Composer + button > Deep Research (a switch); Web search is automatic for models that support it (labels found in the code)
- **Steps:**
  1. Open a conversation and click the + button in the message box.
  2. Turn on Deep Research and send a message.
  3. Send a second message in the same conversation and check Deep Research is still on.
  4. Check the send preview lists Deep Research and, where shown, Web search.

## S18.26 Conversation-level connected accounts.

- **Expected:** The user can choose which connected accounts/connectors this conversation may use.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1007; apps/web/features/chat/pages/WebChatPage.tsx:2763
- **Known to be unfinished:** ['ui']
- **Where to find it:** Composer + button > Connectors > a connector name (switch per connector); Manage in Settings for the full list (labels found in the code)
- **Needs:** a connected connector account
- **Steps:**
  1. Connect a connector in Settings first, then open a conversation.
  2. Click the + button and open Connectors.
  3. Turn one connector off for this conversation and send a message.
  4. Check the reply does not use it, then open the same menu in a different conversation and check it is still on there.

## S18.27 Active tasks associated with the conversation.

- **Expected:** The conversation shows the active tasks/runs started from it and their status.
- **Code:** done. Evidence moved: apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:295 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7844; apps/web/features/chat/pages/WebChatPage.tsx:6971
- **Where to find it:** Composer > Work mode > Panels button > Open Work session dock; the dock lists Progress, Outputs and the run status (labels found in the code)
- **Needs:** a Work task that runs
- **Steps:**
  1. Switch the composer to Work and send a task.
  2. Click Panels at the top right and then Open Work session dock.
  3. Read the Progress section and the status text (Ready, Paused or Finished with errors).
  4. Compare the steps and status with the run that is still going.

## S18.28 Continuation on another device.

- **Expected:** A conversation started on one device can be continued on another.
- **Code:** done. Evidence present: apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:200; packages/ui/ui/src/sidebar/SessionItem.tsx:266
- **Where to find it:** no screen of its own. The code shows server-side saving only (persist-message.ts and the sidebar row); no visible continue control was found.
- **Needs:** a second device or browser signed into the same account
- **Steps:**
  1. On device A, start a conversation and send one message.
  2. On device B (another browser or computer) sign in to the same account and find the conversation in the sidebar.
  3. Open it, send a follow-up and check device A shows the new message after a refresh.
