---
id: "PLAN-web-013"
type: "test-plan"
title: "Web · 13. Composer text interaction"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "13"
---
# Web · 13. Composer text interaction

34 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S13.01 Plain-text entry.

- **Expected:** The user can type a plain-text message into the composer and send it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerInput.tsx:47; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2858; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Earlier check in the running app:** PASS: E036 [PASS; send and generating UI]: Model changed to an available free-pool route; sent project context question; user message persisted into new chat and Thinking state appeared. Project chip correctly names selected project.
- **Where to find it:** Chat page, first screen after sign-in > the composer box that reads 'Ask anything. Type / for commands' > the 'Send message' button (labels found in the code)
- **Needs:** a signed-in account that can chat (for example a Free account)
- **Steps:**
  1. Sign in and stay on the chat page.
  2. Click the composer box that reads 'Ask anything. Type / for commands'.
  3. Type a short plain sentence, such as 'Plain text test'.
  4. Click 'Send message', or press Enter if your Enter key sends in your settings.
  5. Check that the sentence appears as your message with no formatting changes and that a reply starts.

## S13.02 Multiline entry.

- **Expected:** The composer accepts multi-line text (line breaks are kept in the sent message).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerInput.tsx:47; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3517 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Where to find it:** Chat page > the composer box (accessible name 'Message input') (labels found in the code)
- **Needs:** a signed-in account that can chat
- **Steps:**
  1. Click the composer.
  2. Type 'Line one', press Shift+Enter, then type 'Line two'.
  3. Click 'Send message'.
  4. Check that the sent message shows two lines, with the line break kept.

## S13.03 Automatic height growth.

- **Expected:** The composer grows taller automatically as the text grows, up to a cap, then scrolls.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerInput.tsx:47; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2441; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Where to find it:** no screen of its own. Automatic height is a layout rule with no control of its own. The maximum height value was not read.
- **Steps:**
  1. Click the composer.
  2. Type a line, press Shift+Enter, and repeat until there are five or more lines.
  3. Check that the box grows taller as lines are added, then stops growing and scrolls inside the box.

## S13.04 Manual expansion.

- **Expected:** The user can manually enlarge the composer (an expand control or resize handle) beyond its automatic height.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5901; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4703; apps/web/features/chat/components/Composer/ComposerInput.tsx:54
- **Where to find it:** Chat page > the 'Expand message input' button at the top-right corner of the composer (it shows only when the text is tall enough) (labels found in the code)
- **Steps:**
  1. Type or paste enough lines that the composer becomes tall.
  2. Hover the top-right corner of the composer.
  3. Click 'Expand message input'.
  4. Check that the composer is taller than its automatic height.
  5. Click 'Collapse message input' to return it to normal size.

## S13.05 Full-screen prompt editing.

- **Expected:** The user can open the draft in a full-screen (or external) editor and return it to the composer.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5901; apps/web/features/chat/components/Composer/ComposerInput.tsx:66; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4669
- **Where to find it:** not found in the code. Searched apps/web/features/chat/components/Composer for 'Full screen', 'Fullscreen', 'Open in' and 'Edit in' and found no such control. The only control is the in-place expand toggle 'Expand message input' (ChatComposerNew.tsx), which does not open a full-screen or external editor.

## S13.06 Send button.

- **Expected:** A visible send button submits the composed message (and is disabled with a reason when sending is blocked).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6958; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2706 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Earlier check in the running app:** PASS: E036 [PASS; send and generating UI]: Model changed to an available free-pool route; sent project context question; user message persisted into new chat and Thinking state appeared. Project chip correctly names selected project.
- **Where to find it:** Chat page > the 'Send message' button at the right end of the composer (labels found in the code)
- **Needs:** a signed-in account that can chat
- **Steps:**
  1. Leave the composer empty and hover over the 'Send message' button; read the reason shown.
  2. Type a message.
  3. Click 'Send message'.
  4. Check that the message is sent and the button shows a sending state.

## S13.07 Stop button.

- **Expected:** While a reply is generating, a stop control ends it (keeping what was produced).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6977; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3443; apps/web/features/chat/pages/WebChatPage.tsx:7674; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Earlier check in the running app:** UI_ONLY: E036 [UI_ONLY; stop control visible]: Model changed to an available free-pool route; sent project context question; user message persisted into new chat and Thinking state appeared. Project chip correctly names selected project.
- **Where to find it:** Chat page > after sending a message, the 'Stop the current response' button replaces Send while the reply is streaming (labels found in the code)
- **Needs:** a signed-in account with a working chat model
- **Steps:**
  1. Send a question that needs a long answer.
  2. While the reply is still streaming, hover the button and read 'Stop generation'.
  3. Click 'Stop the current response'.
  4. Check that the reply stops and the text already written stays on screen.

## S13.09 Newline shortcut.

- **Expected:** A keyboard shortcut (e.g. Shift+Enter) inserts a newline without sending.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerInput.tsx:47; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3517 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Where to find it:** Chat page > the 'Message input' box (labels found in the code)
- **Needs:** a signed-in account that can chat
- **Steps:**
  1. Click the composer and type 'First line'.
  2. Press Shift+Enter.
  3. Check that the cursor moves to a new line and nothing is sent.
  4. Type 'Second line' and send with 'Send message'.
  5. Check that the sent message has two lines.

## S13.10 Undo and redo.

- **Expected:** Standard undo/redo shortcuts (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z) revert and reapply edits in the composer.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/composer-editor/extensions/index.ts:25; apps/web/features/chat/lib/composer-editor-gate.ts:46
- **Needs:** live-web
- **Where to find it:** Chat page > the 'Message input' box (labels found in the code)
- **Steps:**
  1. Click the composer and type 'one two three'.
  2. Press Cmd+Z and check the text reverts.
  3. Press Shift+Cmd+Z and check the text comes back.
  4. Repeat with a second edit to confirm several steps undo in order.

## S13.11 Clipboard paste.

- **Expected:** Pasting from the clipboard inserts text into the composer and turns pasted files/images into attachments.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerInput.tsx:141; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2372; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Where to find it:** Chat page > the 'Message input' box for text; the '+' button next to the composer > 'Attach clipboard' for clipboard files (labels found in the code)
- **Needs:** text and a file or image copied to the clipboard
- **Steps:**
  1. Copy a line of plain text, click the composer, and press Cmd+V; check the text appears in the box.
  2. Copy an image or a file (for example a screenshot), click the composer, and press Cmd+V; check it appears as an attachment with its name.
  3. Open the '+' menu and choose 'Attach clipboard' if it is listed; check that the clipboard item is attached.

## S13.12 Rich-text paste normalization.

- **Expected:** Pasting formatted (HTML/rich) text yields clean plain text in the composer, without styling or markup.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerInput.tsx:47; packages/platform/utils/src/composerPaste.ts:131; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Where to find it:** Chat page > the 'Message input' box (labels found in the code)
- **Needs:** a web page or document with formatted text to copy
- **Steps:**
  1. Copy a formatted passage from a web page with a bold word, a link and a heading.
  2. Click the composer and press Cmd+V.
  3. Check that the text arrives as plain text with no bold, links, colours or HTML tags.

## S13.13 Code-paste formatting.

- **Expected:** Pasted source code is recognized and wrapped in a code block (with a way to paste it as plain text).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4983; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2383; packages/platform/utils/src/composerPaste.ts:212; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat page > the 'Message input' box > paste multi-line source code (labels found in the code)
- **Needs:** a few lines of source code copied to the clipboard
- **Steps:**
  1. Copy five or more lines of source code with indentation or braces.
  2. Click the composer and press Cmd+V.
  3. Check the notice 'That paste looked like code, so it was wrapped in a code block.' and that the text is inside a code fence.
  4. Click 'Paste as plain text' to remove the code block and keep the raw text.

## S13.14 Long-prompt handling.

- **Expected:** Very long input is handled deliberately (turned into an attachment, collapsed, or clearly limited with feedback) instead of flooding the composer.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3665 (quoted code not found in the file now); packages/platform/utils/src/composerPaste.ts:45; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:294; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat page > the 'Message input' box > paste a very long text (labels found in the code)
- **Needs:** a text longer than 10,000 characters to copy
- **Steps:**
  1. Copy a text longer than 10,000 characters, such as a long article.
  2. Click the composer and press Cmd+V.
  3. Check that the text does not fill the box and that a notice says the paste was attached as a file.
  4. Click 'Put it back in the message' to bring the text back into the box.
  5. Type or paste up to the maximum and check that the counter shows 'limit reached'.

## S13.15 Character or token indicators where useful.

- **Expected:** Where length matters, the composer shows a character or token/context indicator before sending.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5926; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4761; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat page > the 'Message input' box > the counter under it (labels found in the code)
- **Needs:** a long text to paste, to reach about 75 percent of the message limit
- **Steps:**
  1. Click the composer and type or paste text.
  2. When the counter appears, read '<n> / <max> characters'.
  3. Keep adding text until the counter shows 'limit reached'.
  4. Check that the counter appears before the limit is reached.

## S13.16 Draft autosave.

- **Expected:** The unsent composer text is saved automatically while typing, so it survives a reload or crash.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4124; apps/web/features/chat/components/Composer/composer-draft-storage.ts:188; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4157
- **Earlier check in the running app:** FAIL: E057 [FAIL; reproduced navigation loss]: Typed unique DRAFT_5182 in ordinary new chat (draft-before.txt), navigated Projects, then Chat. Composer returned empty and two draft-conflict toasts claimed text is still here. No other editing tab active; stale error tab existed. Reproduces data-loss behavior without source inspection.
- **Where to find it:** no screen of its own. Drafts are saved in browser storage (apps/web/features/chat/components/Composer/composer-draft-storage.ts). This item covers reload only; the plan's earlier run recorded text lost after moving to another page and back, which a reload test does not cover.
- **Steps:**
  1. Click the composer and type a unique sentence, such as 'DRAFT TEST 1'.
  2. Wait three seconds without sending.
  3. Reload the page with Cmd+R.
  4. Check that the sentence is back in the composer.

## S13.17 Draft recovery.

- **Expected:** After a reload, crash or failed send, the unsent text is put back in the composer (with a notice).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4157; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:689; apps/web/features/chat/hooks/use-conversation-draft-sync.ts:246
- **Earlier check in the running app:** FAIL: E057 [FAIL; reproduced navigation loss]: Typed unique DRAFT_5182 in ordinary new chat (draft-before.txt), navigated Projects, then Chat. Composer returned empty and two draft-conflict toasts claimed text is still here. No other editing tab active; stale error tab existed. Reproduces data-loss behavior without source inspection.
- **Where to find it:** no screen of its own. When the device is offline the app shows a different notice, 'You are offline. Your draft is saved here and can be sent after you reconnect.' (ChatComposerNew.tsx). The restore notice is for a failed send, so the test may need a server-side failure instead.
- **Needs:** a way to make a send fail, such as turning Wi-Fi off
- **Steps:**
  1. Click the composer and type 'RECOVERY TEST'.
  2. Make the send fail, for example by turning Wi-Fi off in the Mac menu bar, then click 'Send message'.
  3. Check that the text comes back into the box with the notice 'Couldn't send. Restored here so you can try again.'
  4. Turn Wi-Fi back on.

## S13.18 Draft isolation by conversation.

- **Expected:** Each conversation keeps its own unsent draft; switching chats never carries text into another chat.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerInput.tsx:47; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3158 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Where to find it:** no screen of its own. The name of the chat list (sidebar) was not verified in the code read.
- **Needs:** two chats in the account
- **Steps:**
  1. Open chat A, type 'DRAFT A' in the composer, and do not send.
  2. Open a different chat B from the chat list.
  3. Check that the composer in chat B does not contain 'DRAFT A'.
  4. Go back to chat A and check that 'DRAFT A' is still there.

## S13.20 Prompt suggestions.

- **Expected:** The product offers prompt suggestions (e.g. follow-up questions) that the user can pick to fill or send the next message.
- **Code:** partial. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:1093
- **Known to be unfinished:** switch-on (deploy step 'follow-ups on'): change FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT to true at apps/web/features/chat/components/messages/ChatMessageList.tsx:1048; generator and settings toggle are built
- **Where to find it:** Settings > General > 'Show follow-up suggestions in chats' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings from the command palette entry 'Settings' (the account menu route was not verified).
  2. Open the General section.
  3. Switch on 'Show follow-up suggestions in chats'.
  4. Go back to a chat, send a message, and wait for the reply.
  5. Check whether follow-up suggestions appear that you can tap to fill or send.

## S13.21 Prompt-template insertion.

- **Expected:** The user can insert a saved prompt template (e.g. a custom command) into the composer, filling in their own text.
- **Code:** done. Evidence present: apps/web/features/settings/components/CustomCommandsSettings.tsx:95; apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:211; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3183; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1925; apps/web/features/settings/sections/GeneralSection.tsx:337; apps/web/features/settings/components/WebSettingsModal.tsx:262
- **Where to find it:** Settings > General > 'Custom commands' to save a command; then the composer > type '/' and choose it under 'Commands' (labels found in the code)
- **Steps:**
  1. Open Settings, then the General section, and scroll to 'Custom commands'.
  2. Create a command whose template contains {{input}}, and save it.
  3. Close Settings, click the composer, and type '/'.
  4. Choose your command under the 'Commands' group.
  5. Check that the composer shows the template with {{input}} replaced by your own text.

## S13.22 Slash-command autocomplete.

- **Expected:** Typing "/" opens a filtered list of commands that can be chosen with keyboard or pointer.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1925; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2818; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat page > the 'Message input' box, type '/' (labels found in the code)
- **Steps:**
  1. Click the composer and type '/'.
  2. Check the list labelled 'Slash commands' with groups 'Skills' and 'Commands'.
  3. Type 'sk' and check the list narrows.
  4. Use the arrow keys and Enter, or click an item, and check that the item is chosen.

## S13.23 Skill invocation.

- **Expected:** The user can explicitly invoke a Skill from the composer so the next message runs with it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5163; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3381; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3925; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat page > the 'Message input' box, type '/' and choose a skill under 'Skills' (labels found in the code)
- **Needs:** at least one skill in the account
- **Steps:**
  1. Click the composer and type '/'.
  2. Under the 'Skills' group, click a skill (or type its name and press Enter).
  3. Check that a chip '/<skill name>' appears above the box with a remove control.
  4. Type a message and send it, then check the reply uses that skill.

## S13.25 Project mention.

- **Expected:** Typing a mention in the composer can reference a project, scoping the message to it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5606; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3043; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat page > the 'Message input' box, type '@' (labels found in the code)
- **Needs:** at least one project in the account
- **Steps:**
  1. Click the composer and type '@'.
  2. Check the list labelled 'Mentions' with a 'Projects' group.
  3. Type part of a project name to narrow the list.
  4. Click a project and check that its name now appears in the composer.
  5. Send a message and check the reply is about that project.

## S13.26 File mention.

- **Expected:** Typing a mention in the composer can reference a file, whose contents are included with the message.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2960; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:778; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2535; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5891
- **Where to find it:** Chat page > the 'Message input' box, type '@' and part of a file name (labels found in the code)
- **Needs:** a file already in your file library
- **Steps:**
  1. Make sure the file is in your library, for example through '+' > 'Add photos & files' first.
  2. Click the composer, type '@' and part of the file name.
  3. In the 'Mentions' list, click the file.
  4. Check that the file appears as an attachment in the composer.
  5. Send a message and check the reply uses the file's contents.

## S13.30 Connected-app mention.

- **Expected:** The user can reference a connected app (connector/MCP server) or one of its resources inline in the composer.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2922; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3052; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2995; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5654
- **Where to find it:** Chat page > the 'Message input' box, type '@' > the 'Connected apps' group (labels found in the code)
- **Needs:** a connected app with resources set up in the account
- **Steps:**
  1. Click the composer and type '@'.
  2. In the 'Mentions' list, find the 'Connected apps' group and click a connected app or one of its resources.
  3. Check that a chip such as 'Resource: <name>' appears above the box with a remove control.
  4. Send a message and check the reply uses the connected resource.

## S13.31 Context chips.

- **Expected:** Context attached to the next message (skill, project, folder, files, page) shows as removable chips in the composer.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5155; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5161; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Earlier check in the running app:** PASS: E051 [PASS; synthetic attachment intake]: Selecting Free Auto by keyboard worked, then direct Add photos & files accepted synthetic text file, displaying name, 198 B and Managed destination. Earlier compatibility alert cleared. Pointer model selection had inconsistent result; not a confirmed persistence bug.
- **Where to find it:** Chat page > the chips above the 'Message input' box (labels found in the code)
- **Needs:** a skill and a connected app with resources
- **Steps:**
  1. Add a skill (type '/' and choose under 'Skills') and a connected resource (type '@' and choose under 'Connected apps').
  2. Check the removable chips above the box: '/<skill name>' with its remove control, and 'Resource: <name>' with 'Remove selected connector context'.
  3. Click the remove control on one chip.
  4. Check that only that chip is removed.

## S13.32 Selected-source chips.

- **Expected:** Sources chosen for the next message (e.g. web search, connector resources, a page) are shown as chips before sending.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5183; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5188; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Composer > + (Add attachments and tools) > Connectors > choose a connector resource; the chip "Resource: <name>" then shows above the text box (labels found in the code)
- **Needs:** A connected connector account that exposes a resource (connector availability is gated by hasReleasedConnectors()).
- **Steps:**
  1. Click the + button in the composer (aria label "Add attachments and tools").
  2. Click the "Connectors" row and pick a connected connector's resource or prompt.
  3. Look above the text box for a chip reading "Resource: <name>" (or "Prompt: <name>") with an X button labelled "Remove selected connector context".
  4. Compare with Expected: the chip is shown before sending and the X removes it.

## S13.33 Selected-tool chips.

- **Expected:** Tools switched on for the next message (e.g. research, code, office files) are shown as chips near the composer.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6233; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4850; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Composer > + (Add attachments and tools) > Deep Research / Run code / Output; the active tools show in the + menu and as a count badge on the + button (labels found in the code)
- **Needs:** A signed-in account where these tools are offered. Run code and Output depend on account and plan.
- **Steps:**
  1. Click the + button in the composer.
  2. Click "Deep Research" or "Run code" to switch it on (or pick a format under "Output").
  3. Look at the + button: its count badge and aria label change to "Add attachments and tools: N active".
  4. Reopen the + menu and compare: the switched-on tools are listed with checkmarks, as Expected asks for chips near the composer.

## S13.34 Output-format selection.

- **Expected:** Before sending, the user can choose the output format for the reply (e.g. table, document, code, slides).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:958; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:249; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2571; apps/web/lib/hooks/useChatStream.ts:4642; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6650; apps/web/lib/chat-output-format.ts:23
- **Where to find it:** Composer > + (Add attachments and tools) > Output > Document, Presentation or Spreadsheet (labels found in the code)
- **Needs:** A plan where office file creation is enabled. When it is not, the Output row is disabled and shows a title explaining why.
- **Steps:**
  1. Click the + button in the composer.
  2. Click the "Output" row to expand it.
  3. Click "Document", "Presentation" or "Spreadsheet".
  4. Look at the + menu and the + button: the row reads "Output: Document" (or the chosen format), and the + button shows a badge. Compare with Expected: the format is chosen before sending.

## S13.35 Attachment menu.

- **Expected:** A "+" (attach) menu in the composer lists the ways to add files, media and context.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6000; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5955; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Earlier check in the running app:** PASS: E051 [PASS; synthetic attachment intake]: Selecting Free Auto by keyboard worked, then direct Add photos & files accepted synthetic text file, displaying name, 198 B and Managed destination. Earlier compatibility alert cleared. Pointer model selection had inconsistent result; not a confirmed persistence bug.
- **Where to find it:** Composer > + (button labelled "Add attachments and tools") > "Add photos & files" and the other rows in the menu (labels found in the code)
- **Needs:** A file to upload. Some rows depend on the surface: "Attach from local folder" only appears in the desktop app, and "Create image" and "Create video" depend on the account.
- **Steps:**
  1. Click the + button at the left of the composer.
  2. Look for the menu rows "Add photos & files", "Add from library", "Attach clipboard", "Create image" and "Create video".
  3. Click "Add photos & files" and choose a small text file to confirm it appears as an attachment.
  4. Compare with Expected: the + menu lists the ways to add files, media and context.

## S13.36 Dictation control.

- **Expected:** A microphone control dictates speech into the composer text (without sending) for review.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6942; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2048; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Composer > microphone button "Start voice input" (next to the + button); click it, speak, then click "Stop recording and edit the transcript" (labels found in the code)
- **Needs:** A microphone and a browser that supports voice input (the page says Chrome or Edge). Dictation is off in chats that use a local or BYOK provider.
- **Steps:**
  1. Click the microphone button in the composer (aria label "Start voice input").
  2. Speak a short sentence.
  3. Click the same button, now labelled "Stop recording and edit the transcript".
  4. Look at the text box: the transcript appears in the composer and nothing has been sent. Compare with Expected.

## S13.37 Voice-conversation control.

- **Expected:** A control starts a hands-free voice conversation (speak, hear the reply) from the composer.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6956; apps/web/features/chat/pages/WebChatPage.tsx:7665; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2085; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Composer > "Start voice mode" button at the right end of the composer (shown when the text box is empty) (labels found in the code)
- **Needs:** A microphone, and an account that has the voice capability (canUseVoice). Voice is not offered in a chat that holds Google account data.
- **Steps:**
  1. Make sure the text box is empty.
  2. Click the "Start voice mode" button at the right end of the composer.
  3. Allow microphone access, speak a question, and wait for the reply to be spoken aloud.
  4. Compare with Expected: a hands-free conversation starts from the composer and the reply is heard.

## S13.38 Queued next prompt.

- **Expected:** While a reply is still generating, the user can type and queue the next message, which sends when the reply finishes.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5009; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3948; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3349 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Composer > type a message while a reply is still generating > press "Send message"; the message appears in the "Queued messages" list above the text box (labels found in the code)
- **Needs:** A paid or Free account that can get a streamed reply long enough to type during it.
- **Steps:**
  1. Send a message and wait until the reply is still streaming.
  2. Type a second message in the text box (it stays enabled while streaming).
  3. Press "Send message" (or Enter).
  4. Look above the text box for the "Queued messages" list with a row starting "Queued:". Wait for the first reply to finish and check the queued message is sent then. Compare with Expected.

## S13.39 Edit or cancel queued prompt.

- **Expected:** A queued message can be edited or cancelled before it is sent.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5045; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4422; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Composer > "Queued messages" list above the text box > "Edit" or "Cancel" on the queued row (labels found in the code)
- **Needs:** A paid or Free account and a reply still streaming long enough to queue a message.
- **Steps:**
  1. While a reply is streaming, queue a message as in S13.38.
  2. In the "Queued messages" list, click "Edit" on the row: the text returns to the composer to change.
  3. Or click "Cancel" on another queued row.
  4. Compare with Expected: the cancelled row disappears and does not send; the edited text is sent only when you send it again.

## S13.40 Mid-task steering input.

- **Expected:** While an agent is working, the user can send guidance that steers the running task without stopping it.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchActivity.tsx:625; apps/web/features/chat/components/research/ResearchActivity.tsx:638; apps/web/features/chat/pages/WebChatPage.tsx:6105; packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:514
- **Where to find it:** Deep Research run in the chat > "Steer" button in the research activity header (while the run is planning or searching) > type guidance and submit (labels found in the code)
- **Needs:** A Deep Research run that is still streaming; a Free or paid account where Deep Research is offered.
- **Steps:**
  1. Start a run with + > "Deep Research" in the composer and send a question.
  2. While the run shows planning or searching, click "Steer" in the research activity header.
  3. Type guidance in the field that opens and submit it.
  4. Look for the note "Your guidance is applied when the current step finishes, and the plan updates to follow it." and check the run continues. Compare with Expected.
