---
id: "PLAN-web-018"
type: "test-plan"
title: "Web · 18. Conversation-level controls"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "18"
---
# Web · 18. Conversation-level controls

22 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S18.01 Automatic title.

- **Expected:** A new conversation gets a meaningful title automatically without the user naming it.
- **Code:** done. Evidence present: apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:200; apps/web/features/chat/pages/WebChatPage.tsx:5040
- **Where to find it:** no screen of its own. Title is set on the server in persist-message.ts; the chat header title button has aria-label 'Conversation options' (ConversationTitleMenu.tsx). No visible control was found.
- **Needs:** a Free account or a paid account
- **Steps:**
  1. Start a new chat, send one message, and wait for the reply.
  2. Look at the chat header title and the sidebar row for this conversation.
  3. Check that the title is a short name based on the message, not 'New chat' or blank.

## S18.02 Manual rename.

- **Expected:** The user can rename a conversation and the new title persists.
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:153; packages/ui/ui/src/sidebar/SessionItem.tsx:343; apps/web/shared/components/layout/WebAppShell.tsx:345
- **Earlier check in the running app:** PASS: E040 [PASS; rename interaction]: Follow-up on (model name).8-max-0902 returned exact LIVE_QA_20260926_OK; served route labeled via free pool. Renamed own conversation Browser QA, Chat and rendering. The earlier Retry click on failed activity did not visibly restart a request; fresh send succeeded. Sources panel opens empty, no research performed. | E042 [PASS; browser reload persistence]: Reload preserved Browser QA, Chat and rendering, exact answer marker and formatted response. This verifies reload in the same browser, not cross-device sync.
- **Where to find it:** Chat header > conversation title (button named 'Conversation options') > Rename (labels found in the code)
- **Steps:**
  1. Open a conversation that already has a title.
  2. Click the title at the top of the chat.
  3. Choose Rename, type a new name, and press Enter.
  4. Reload the page and check the new name is still shown in the header and sidebar.

## S18.03 Pin and unpin.

- **Expected:** A conversation can be pinned so it stays at the top of the list, and unpinned.
- **Code:** done. Evidence present: apps/web/app/api/chat/conversations/[id]/route.ts:359; apps/web/app/api/chat/conversations/bulk/route.ts:74
- **Where to find it:** Sidebar > conversation row > More options for [conversation name] > Pin (then Unpin) (labels found in the code)
- **Steps:**
  1. Hover a conversation row in the sidebar and click its More options button.
  2. Click Pin.
  3. Check the conversation moves to the top of the list.
  4. Open its More options again and click Unpin.
  5. Check it returns to its normal place.

## S18.04 Archive and restore.

- **Expected:** A conversation can be archived (hidden, kept) and later restored.
- **Code:** done. Evidence moved: packages/ui/ui/src/sidebar/SessionItem.tsx:386; apps/web/shared/components/layout/WebAppShell.tsx:322 (quoted code not found in the file now); apps/web/features/chat/components/ConversationTitleMenu.tsx:223
- **Earlier check in the running app:** PASS: E012 [UI_ONLY; empty-state UI]: Archived manager opens and settles to its empty state; restore behavior needs a test archived chat. | E094 [PASS; archive and restore workflow]: Archived synthetic Browser QA, Chat and rendering from menu; appeared in Archived chats. Restore returned named success status and list became empty. No user conversation deleted.
- **Where to find it:** Chat header > conversation title (Conversation options) > Archive; restore from Sidebar > Archived ({count}) > the conversation > Unarchive (labels found in the code)
- **Steps:**
  1. Open a conversation, click its title, and choose Archive.
  2. Check it disappears from the main sidebar list.
  3. Open the sidebar filter labelled Archived (count) and find the conversation.
  4. Open its menu and choose Unarchive, then check it is back in the main list.

## S18.05 Delete.

- **Expected:** A conversation can be deleted, with confirmation, and it disappears everywhere.
- **Code:** done. Evidence present: apps/web/app/api/chat/conversations/[id]/route.ts:501; apps/web/app/api/chat/conversations/[id]/restore/route.ts:27; apps/web/app/api/chat/conversations/bulk/route.ts:63
- **Where to find it:** Chat header > conversation title (Conversation options) > Delete (labels found in the code)
- **Needs:** a test conversation you can delete
- **Steps:**
  1. Open a test conversation and click its title.
  2. Choose Delete.
  3. Check whether a confirmation appears before anything is removed.
  4. Confirm, then check the conversation is gone from the sidebar and the Archived list.

## S18.06 Duplicate.

- **Expected:** A conversation can be duplicated into a new, independent conversation.
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:209; apps/web/features/chat/pages/WebChatPage.tsx:7422
- **Where to find it:** Chat header > conversation title (Conversation options) > Duplicate as branch (labels found in the code)
- **Steps:**
  1. Open a conversation with several messages.
  2. Click its title and choose Duplicate as branch.
  3. Check a new conversation opens with the same messages.
  4. Send a message in one conversation and check the other does not change.

## S18.07 Move to Project.

- **Expected:** An existing conversation can be moved into a Project.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:414; apps/web/shared/components/layout/WebAppShell.tsx:379; apps/web/features/chat/components/ConversationTitleMenu.tsx:167
- **Earlier check in the running app:** PASS: E043 [PASS; move and read result]: Moved only the synthetic ordinary conversation into QA project; project Chats lists it alongside project-context test. Copy-to-project not tested.
- **Where to find it:** Chat header > conversation title (Conversation options) > Move to project (shows Change project when already in a project) (labels found in the code)
- **Needs:** a project already created
- **Steps:**
  1. Make sure at least one project exists.
  2. Open a conversation that is not in a project and click its title.
  3. Choose Move to project and pick a project name.
  4. Open the project and check the conversation is listed there.

## S18.09 Change conversation mode.

- **Expected:** Within a conversation, the user can switch its working mode (e.g. chat vs agent/work/plan) and later turns follow it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6182; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2808; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1112
- **Where to find it:** Composer > Work or Chat mode buttons (Work is shown when the account can use Work mode) (labels found in the code)
- **Needs:** an account that can use Work mode
- **Steps:**
  1. Open a conversation in Chat mode, or start a new chat.
  2. Click Work in the composer mode buttons and check it becomes pressed.
  3. Send a task and check the Work session panel opens for later turns.
  4. Click Chat and check the mode switches back.

## S18.10 Change privacy mode through an explicit flow.

- **Expected:** The user switches a conversation's privacy mode (e.g. temporary/incognito, local-only) through an explicit flow that explains the consequence.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:356 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1829
- **Where to find it:** Composer > More composer options (plus button) > Use incognito (shows Exit incognito when on) (labels found in the code)
- **Steps:**
  1. Open a conversation and click More composer options.
  2. Read the line under the temporary chat row: 'Stays out of your history, search, memory and Library.'
  3. Click Use incognito and check the row changes to Exit incognito.
  4. Check the chat is marked temporary, and send a message to see it is kept out of history.

## S18.11 Conversation search.

- **Expected:** The user can search within the open conversation's messages.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageSearch.tsx:96; apps/web/features/chat/components/messages/ChatMessageList.tsx:1541; apps/web/features/chat/components/messages/ChatMessageList.tsx:2093
- **Earlier check in the running app:** PASS: E003 [PASS; interaction]: Searching QA_CHECKLIST_OK returned three matching messages across two conversations with highlighted matches.
- **Where to find it:** Open a conversation > press Command+F > Search messages box (labels found in the code)
- **Needs:** a conversation with repeated words
- **Steps:**
  1. Open a conversation with several messages.
  2. Press Command+F.
  3. Type a word that appears in the conversation.
  4. Check the matching messages are highlighted and the search box stays open. Press Escape to close it.

## S18.12 Jump between search matches.

- **Expected:** In-conversation search moves between matches (next/previous) and scrolls to each.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageSearch.tsx:132; apps/web/features/chat/components/messages/ChatMessageList.tsx:1518
- **Where to find it:** Open a conversation > Command+F > type a word > Go to next match / Go to previous match buttons (labels found in the code)
- **Needs:** a conversation with several matches for one word
- **Steps:**
  1. Open search with Command+F and type a word with several matches.
  2. Click Go to next match and check the transcript scrolls to the next match.
  3. Click Go to previous match and check it goes back.
  4. Compare the position with the match count shown in the search bar.

## S18.15 Jump to latest.

- **Expected:** After scrolling up, one control returns the view to the latest message.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:384; apps/web/features/chat/components/messages/ChatMessageList.tsx:1582
- **Where to find it:** Open a long conversation > scroll up > Scroll to bottom button (labels found in the code)
- **Needs:** a conversation long enough to scroll
- **Steps:**
  1. Open a conversation with many messages.
  2. Scroll up to an older message.
  3. Click the Scroll to bottom button that appears.
  4. Check the view jumps to the latest message.

## S18.17 Branch-tree navigation.

- **Expected:** A conversation with branches lets the user see and switch between branches.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2614; apps/web/features/chat/pages/WebChatPage.tsx:7753
- **Where to find it:** Chat transcript > a message with branches > Previous branch / Next branch arrows with the n/total count (labels found in the code)
- **Needs:** a conversation that already has branches
- **Steps:**
  1. Open a conversation that has branches.
  2. Find a message with the branch control under it.
  3. Click Next branch, then Previous branch.
  4. Check the n/total count and the shown messages change to match the branch.

## S18.18 Conversation export.

- **Expected:** The whole conversation can be exported to a file (e.g. Markdown, PDF, JSON).
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:198; apps/web/features/chat/pages/WebChatPage.tsx:7938
- **Earlier check in the running app:** PASS: E041 [PASS; render, clipboard, and downloaded content]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Chat header > conversation title (Conversation options) > Export… (labels found in the code)
- **Steps:**
  1. Open a conversation with several messages.
  2. Click its title and choose Export….
  3. Choose the format in the export step and save or download the file.
  4. Open the file and check all messages, the title and the timestamps are there.

## S18.19 Conversation sharing.

- **Expected:** The user can share a conversation (e.g. a read-only link) from the conversation.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:7502; apps/web/features/chat/components/share/ShareConversationDialog.tsx:444; apps/web/features/chat/hooks/use-share-conversation.ts:177 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E093 [UI_ONLY; dialog and expiry choices]: Share explains read-only snapshot, anyone-with-link access and 1/7/30-day expiry. No public link created.
- **Where to find it:** Chat header > Share conversation button (or Conversation options > Share…) (labels found in the code)
- **Needs:** a test conversation and an account allowed to share
- **Steps:**
  1. Open a conversation that has messages.
  2. Click Share conversation.
  3. Read the read-only snapshot note and the access and expiry choices (1, 7 or 30 days).
  4. Create a link only with a test conversation, then check the link appears.

## S18.20 Shared-link management.

- **Expected:** The user can see and revoke links they have shared.
- **Code:** done. Evidence moved: apps/web/features/chat/components/share/ShareConversationDialog.tsx:223; apps/web/features/chat/hooks/use-share-conversation.ts:212 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E093 [UI_ONLY; dialog and expiry choices]: Share explains read-only snapshot, anyone-with-link access and 1/7/30-day expiry. No public link created.
- **Where to find it:** Chat header > Share conversation > Revoke share (or Revoke every link) (labels found in the code)
- **Needs:** a live link you created
- **Steps:**
  1. Open Share conversation on a conversation that has a live link.
  2. Find the link in the Conversation link field.
  3. Click Revoke share or Revoke every link and read the confirmation.
  4. Confirm, then open the link in a private window and check it no longer works.

## S18.21 Conversation details inspector.

- **Expected:** A conversation details view shows its metadata (created/updated, model, message count, id, project).
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:6614; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:1115; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:942; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:558
- **Earlier check in the running app:** PASS: E037 [PASS; visible error and details]: Plain text project question with no attachments failed: QwenCloud free models answer text prompts in Chat; turn off tools/remove attachments. Could not verify project instruction influence. Error restored text to composer and Retry offered; details panel shows failed state.
- **Where to find it:** Chat header or Work session panel > Open Chat details (or Close Chat details) > Details (labels found in the code)
- **Steps:**
  1. Open a conversation and open the chat details panel with the Open Chat details control.
  2. Find the Details section.
  3. Compare the shown rows with the expected: created and updated time, model, message count, id and project.

## S18.22 Context and source inspector.

- **Expected:** The user can inspect what context and sources the conversation is using (files, instructions, memory, token budget).
- **Code:** done. Evidence present: apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:1113; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:1023; apps/web/features/chat/pages/WebChatPage.tsx:6614
- **Where to find it:** Open the session dock (Open ... session dock) > Context, Sources sections (labels found in the code)
- **Needs:** a Work conversation with a run
- **Steps:**
  1. In an AGI Work conversation, open the session dock.
  2. Find the Context section and read the tools and files it lists.
  3. Find the Sources section and check its entries.
  4. Compare with Expected: files, instructions, memory and token budget.

## S18.25 Conversation-level enabled tools.

- **Expected:** Tool enablement (web search, code, etc.) can be set for this conversation and persists across its turns.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:1903; apps/web/features/chat/pages/WebChatPage.tsx:1925
- **Where to find it:** Composer > More composer options > Deep Research (and the Web search and Run code toggles) (labels found in the code)
- **Steps:**
  1. Open a conversation and set Deep Research or Web search on from the composer.
  2. Send a message and read the reply.
  3. Send a second message and check the same tool is still on in this conversation.
  4. Open another conversation and check its tools are separate.

## S18.26 Conversation-level connected accounts.

- **Expected:** The user can choose which connected accounts/connectors this conversation may use.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1007; apps/web/features/chat/pages/WebChatPage.tsx:2763
- **Known to be unfinished:** ['ui']
- **Where to find it:** not found in the code. A 'Connectors' row exists in ComposerPlusMenu.tsx but renders as a coming-soon item (line 1776); the per-conversation disabledConnectorIds is passed at WebChatPage.tsx near line 2763, with no visible picker found. Searched for the conversation connector picker in apps/web/features/chat and found none.
- **Needs:** a connected account

## S18.27 Active tasks associated with the conversation.

- **Expected:** The conversation shows the active tasks/runs started from it and their status.
- **Code:** done. Evidence moved: apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:295 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7844; apps/web/features/chat/pages/WebChatPage.tsx:6971
- **Where to find it:** Open the session dock (Open ... session dock) > Progress (labels found in the code)
- **Needs:** a Work conversation with an active run
- **Steps:**
  1. Start a Work task from a conversation.
  2. Open the session dock.
  3. Find the Progress section and check the task's status matches what the run shows.

## S18.28 Continuation on another device.

- **Expected:** A conversation started on one device can be continued on another.
- **Code:** done. Evidence present: apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:200; packages/ui/ui/src/sidebar/SessionItem.tsx:266
- **Where to find it:** no screen of its own. Cross-device sync is the server's job (persist-message.ts), shown in the sidebar (SessionItem.tsx); no separate control found.
- **Needs:** a second browser or device signed in to the same account
- **Steps:**
  1. Sign in to the same account in a second browser or device.
  2. Open the sidebar there and find the conversation started on the first device.
  3. Send a message from the second device and check it appears on the first after a reload.
