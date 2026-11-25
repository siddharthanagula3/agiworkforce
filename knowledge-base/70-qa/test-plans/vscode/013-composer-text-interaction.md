---
id: "PLAN-vscode-013"
type: "test-plan"
title: "VS Code · 13. Composer text interaction"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "13"
---
# VS Code · 13. Composer text interaction

23 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S13.01 Plain-text entry.

- **Expected:** The user can type a plain-text message into the composer and send it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3344; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4008 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar (activity bar) > composer box with placeholder "Describe a task…" > Send (Enter) button (labels found in the code)
- **Steps:**
  1. Click the AGI Code icon in the activity bar to open the sidebar.
  2. Click in the box that says "Describe a task…".
  3. Type a short plain sentence, for example: Explain this file in one line.
  4. Click the send button at the bottom right of the composer (tooltip "Send (Enter)") or press Enter.
  5. Look: the message appears in the chat as your message, the box clears, and a reply starts.

## S13.02 Multiline entry.

- **Expected:** The composer accepts multi-line text (line breaks are kept in the sent message).
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3344; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4008 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar > composer box "Describe a task…" (labels found in the code)
- **Steps:**
  1. Click in the box that says "Describe a task…".
  2. Type a first line, press Shift+Enter, type a second line, press Shift+Enter, type a third line.
  3. Look: the cursor moves to a new line each time and nothing is sent.
  4. Press Enter to send, then look at the sent message in the chat and check the line breaks are still there.

## S13.03 Automatic height growth.

- **Expected:** The composer grows taller automatically as the text grows, up to a cap, then scrolls.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3344; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5140; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** no screen of its own. The growth is a layout rule in autoResize (height capped at 140px); the cap is in code, not a visible setting.
- **Steps:**
  1. Click in the box that says "Describe a task…".
  2. Type or paste many lines (press Shift+Enter between them) without sending.
  3. Look: the box gets taller with each line until it reaches about 140 px, then stops growing and a scroll bar appears inside it.

## S13.06 Send button.

- **Expected:** A visible send button submits the composed message (and is disabled with a reason when sending is blocked).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3366; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5858; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar > composer > send button at the bottom right (tooltip "Send (Enter)") (labels found in the code)
- **Steps:**
  1. With the composer empty, look at the send button: it is greyed out and cannot be clicked.
  2. Type a message in the box "Describe a task…".
  3. Look: the send button becomes active.
  4. Click the send button and look for the message in the chat.

## S13.07 Stop button.

- **Expected:** While a reply is generating, a stop control ends it (keeping what was produced).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3365; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1537; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar > composer, while a reply is generating > Stop response button (labels found in the code)
- **Needs:** a reply that takes a few seconds to generate
- **Steps:**
  1. Send a prompt that gives a long answer, for example: List 30 facts about the Moon.
  2. While the reply is still streaming, look at the bottom of the composer for the stop button (tooltip "Stop response").
  3. Click "Stop response".
  4. Look: the reply stops, the text already written stays in the chat, and the send controls return.

## S13.09 Newline shortcut.

- **Expected:** A keyboard shortcut (e.g. Shift+Enter) inserts a newline without sending.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3522 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4008 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar > composer box "Describe a task…" > Shift+Enter (default). Setting: Settings > Session behavior > Send key (labels found in the code)
- **Steps:**
  1. Click in the box that says "Describe a task…" and type some text.
  2. Press Shift+Enter.
  3. Look: a new line is added and the message is not sent.
  4. Optional: open Settings > Send key and check the option text matches the behaviour seen.

## S13.10 Undo and redo.

- **Expected:** Standard undo/redo shortcuts (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z) revert and reapply edits in the composer.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** AGI Code sidebar > composer box "Describe a task…" > Cmd+Z and Shift+Cmd+Z (labels found in the code)
- **Needs:** a Mac with the keyboard (device)
- **Steps:**
  1. Click in the box that says "Describe a task…" and type a word.
  2. Type a second word, then press Cmd+Z.
  3. Look: the last typed text is taken back.
  4. Press Shift+Cmd+Z and look: the text comes back.

## S13.11 Clipboard paste.

- **Expected:** Pasting from the clipboard inserts text into the composer and turns pasted files/images into attachments.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3344; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7730; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar > composer box "Describe a task…" > paste (Cmd+V) (labels found in the code)
- **Needs:** a file or an image on the clipboard
- **Steps:**
  1. Copy a text snippet and an image or a file from Finder.
  2. Click in the box "Describe a task…" and press Cmd+V with the text.
  3. Look: the text appears in the box.
  4. Press Cmd+V with the image or file, and look for a chip in the strip above the box (Pending attachments).

## S13.12 Rich-text paste normalization.

- **Expected:** Pasting formatted (HTML/rich) text yields clean plain text in the composer, without styling or markup.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3344; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7730; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar > composer box "Describe a task…" > paste (Cmd+V) formatted text (labels found in the code)
- **Needs:** a web page or document with formatted text
- **Steps:**
  1. Copy a formatted line from a web page (bold or coloured text, links).
  2. Click in the box "Describe a task…" and press Cmd+V.
  3. Look: only plain text appears, with no bold, colours or links.

## S13.15 Character or token indicators where useful.

- **Expected:** Where length matters, the composer shows a character or token/context indicator before sending.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3359; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4478; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar > composer bottom row, small counter beside the Auto model button, shown after a turn finishes (labels found in the code)
- **Needs:** a finished reply
- **Steps:**
  1. Send a short message and wait for the reply to finish.
  2. Look at the bottom row of the composer, next to the model button, for a small token count.
  3. Hover over the count and read the tooltip.

## S13.20 Prompt suggestions.

- **Expected:** The product offers prompt suggestions (e.g. follow-up questions) that the user can pick to fill or send the next message.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:685
- **Where to find it:** AGI Code sidebar > empty chat (start screen) > Skills rows. Also VS Code Chat view > @agi answer > follow-up buttons (labels found in the code)
- **Needs:** a skill available to the account for the sidebar rows; the VS Code Chat view for the follow-up buttons
- **Steps:**
  1. Open a new chat so the start screen is showing.
  2. Look for the group heading "Skills" under the start screen.
  3. Click one skill row: the composer fills with a prompt for that skill.
  4. Optional: in the VS Code Chat view, ask a question to the AGI Code participant and look for follow-up buttons under the answer.

## S13.21 Prompt-template insertion.

- **Expected:** The user can insert a saved prompt template (e.g. a custom command) into the composer, filling in their own text.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2054 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2077 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:4919; apps/extension-vscode/src/integrations/localRuntimeClient.ts:995
- **Where to find it:** AGI Code sidebar > composer > Commands button (/) > pick a prompt command (labels found in the code)
- **Needs:** a saved prompt command in your account or CLI (not confirmed which exist)
- **Steps:**
  1. Click the "Commands" button next to the + button in the composer.
  2. Look for a command listed from your prompt commands and click it.
  3. Look: the composer shows the command name with a space after it, ready for your own text.
  4. Type your text after it and press Enter.

## S13.22 Slash-command autocomplete.

- **Expected:** Typing "/" opens a filtered list of commands that can be chosen with keyboard or pointer.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6738; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6801; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar > composer box "Describe a task…" > type / (labels found in the code)
- **Steps:**
  1. Click in the box "Describe a task…" and type a single slash /.
  2. Look: a list of commands opens above the box.
  3. Type a letter after the slash, for example /co, and look: the list narrows to matching commands.
  4. Use the arrow keys and Enter, or click a row, to choose one.

## S13.23 Skill invocation.

- **Expected:** The user can explicitly invoke a Skill from the composer so the next message runs with it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1685 (quoted code not found in the file now)
- **Where to find it:** AGI Code sidebar > empty chat (start screen) > Skills > click a skill (labels found in the code)
- **Needs:** a skill listed under Skills on the start screen
- **Steps:**
  1. Open a new chat so the start screen shows.
  2. Under the heading "Skills", click one skill row.
  3. Look: the composer is filled with a sentence naming that skill, with the cursor at the end.
  4. Type what you want done and send it, then check the reply uses that skill.

## S13.24 Agent or assistant mention.

- **Expected:** The user can address a message to a specific agent or assistant by mentioning or selecting it in the composer.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:891; apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:651; apps/extension-vscode/src/core/chatSetup.ts:48
- **Where to find it:** VS Code Chat view (the native chat, not the AGI Code sidebar) > type @ > AGI Code (labels found in the code)
- **Needs:** a VS Code build with the Chat view
- **Steps:**
  1. Open the VS Code Chat view.
  2. Type @ in its input box and look for the AGI Code entry.
  3. Select AGI Code and send a question.
  4. Look: the reply comes from AGI Code.

## S13.26 File mention.

- **Expected:** Typing a mention in the composer can reference a file, whose contents are included with the message.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8545; apps/extension-vscode/src/data/mentionSearch.ts:138; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar > composer box "Describe a task…" > type @ then part of a file name (labels found in the code)
- **Needs:** a workspace folder open in VS Code
- **Steps:**
  1. Click in the box "Describe a task…" and type @.
  2. Type part of a file name, for example @app.
  3. Look: a list titled Workspace files and symbols opens above the box.
  4. Choose a file with the arrow keys and Enter, or click it, then look for the @ file token in the box and send.

## S13.31 Context chips.

- **Expected:** Context attached to the next message (skill, project, folder, files, page) shows as removable chips in the composer.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3330; apps/extension-vscode/src/data/composerContext.ts:394; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar > + (Attach or use tools) > Add context > Selection, Open editors, Problems, Git changes, Terminal output or Web page (labels found in the code)
- **Needs:** an open editor or a selection in VS Code for some items
- **Steps:**
  1. Click the + button at the bottom left of the composer.
  2. Under "Add context", click one item, for example Open editors.
  3. Look: a chip appears in the strip above the box with a name and an × button.
  4. Click the × on the chip and look: it disappears.

## S13.32 Selected-source chips.

- **Expected:** Sources chosen for the next message (e.g. web search, connector resources, a page) are shown as chips before sending.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3320; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5010; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar > + (Attach or use tools) > Tools > Browse the web (labels found in the code)
- **Needs:** a signed-in account; Browse the web is greyed out when web search is denied
- **Steps:**
  1. Click the + button, then click Browse the web under Tools.
  2. Look: a chip reading "Browse the web for current sources" appears above the composer.
  3. Click the × on that chip (Remove web browsing) and look: the chip goes away.

## S13.33 Selected-tool chips.

- **Expected:** Tools switched on for the next message (e.g. research, code, office files) are shown as chips near the composer.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3320; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5112; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar > + (Attach or use tools) > Tools > Plan mode or Browse the web (labels found in the code)
- **Steps:**
  1. Click the + button and look at the Tools heading.
  2. Click Plan mode.
  3. Look at the mode button at the bottom of the composer (next to the model): it changes to the plan mode label.
  4. Click Browse the web under Tools and look for its chip above the composer.

## S13.35 Attachment menu.

- **Expected:** A "+" (attach) menu in the composer lists the ways to add files, media and context.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3198; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6874; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar > + button (tooltip "Attach or use tools") at the bottom left of the composer (labels found in the code)
- **Steps:**
  1. Click the + button.
  2. Look at the menu titled Add context: Attach workspace files, Selection, Open editors, Problems, Git changes, Terminal output, Web page.
  3. Look under Tools: Browse the web, Set up web search, Plan mode.
  4. Click Attach workspace files and check that a file picker opens.

## S13.38 Queued next prompt.

- **Expected:** While a reply is still generating, the user can type and queue the next message, which sends when the reply finishes.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5112; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:4702; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar > composer, while a reply is generating > type in the box > send button labelled Queue (labels found in the code)
- **Needs:** a reply that takes a few seconds to generate
- **Steps:**
  1. Send a prompt that gives a long reply.
  2. While it is still streaming, type a second message in the box "Describe a task…".
  3. Look: the send button's label reads Queue.
  4. Click it and look: your message appears in the chat with a Queued tag and sends after the reply finishes.

## S13.39 Edit or cancel queued prompt.

- **Expected:** A queued message can be edited or cancelled before it is sent.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5554; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1802
- **Where to find it:** AGI Code sidebar > chat > the queued message shows Edit and Cancel buttons under it (labels found in the code)
- **Needs:** a reply that is still streaming
- **Steps:**
  1. Queue a message while a reply is streaming (see S13.38).
  2. Look under the queued message for two small icon buttons, Edit and Cancel.
  3. Click Cancel: the queued message is removed and not sent.
  4. Queue another message, clear the box "Describe a task…", click Edit and look: the text goes back into the box.

## S13.40 Mid-task steering input.

- **Expected:** While an agent is working, the user can send guidance that steers the running task without stopping it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3522 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:4853; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code sidebar > gear (Code: Open Settings) > Session behavior > Active-turn send > Steer current turn (labels found in the code)
- **Needs:** a reply that is still running
- **Steps:**
  1. Open Settings from the gear icon in the AGI Code sidebar.
  2. Find Session behavior and set Active-turn send to Steer current turn.
  3. Start a long reply, then type guidance in the box "Describe a task…" and send it while it runs.
  4. Look: the send button reads Steer, and the message shows a Steered tag while the reply keeps going.
