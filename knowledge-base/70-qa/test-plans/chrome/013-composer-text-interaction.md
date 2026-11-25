---
id: "PLAN-chrome-013"
type: "test-plan"
title: "Chrome · 13. Composer text interaction"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "13"
---
# Chrome · 13. Composer text interaction

21 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S13.01 Plain-text entry.

- **Expected:** The user can type a plain-text message into the composer and send it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14171; apps/extension/src/side_panel.ts:9750 (quoted code not found in the file now); apps/extension/manifest.json:84
- **Where to find it:** Side panel (after sign-in) > message box "How can I help you today?" > type text > press Enter or click the "Send message" button (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the AGI side panel and sign in.
  2. Click the message box that shows "How can I help you today?".
  3. Type a plain sentence.
  4. Press Enter, or click the send button (arrow icon, tooltip "Send").
  5. Look for the sent message in the chat and compare with Expected.

## S13.02 Multiline entry.

- **Expected:** The composer accepts multi-line text (line breaks are kept in the sent message).
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14171; apps/extension/src/side_panel.ts:9750 (quoted code not found in the file now); apps/extension/manifest.json:84
- **Where to find it:** Side panel > message box "How can I help you today?" > Shift+Enter for a new line (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type a first line, press Shift+Enter, type a second line.
  3. Confirm the box still holds both lines and nothing was sent.
  4. Press Enter to send.
  5. Look at the sent message and check the line break is kept.

## S13.03 Automatic height growth.

- **Expected:** The composer grows taller automatically as the text grows, up to a cap, then scrolls.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14171; apps/extension/src/side_panel.ts:5406 (quoted code not found in the file now); apps/extension/manifest.json:84
- **Where to find it:** Side panel > message box "How can I help you today?" > keep typing (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type or paste many lines of text, pressing Shift+Enter between them.
  3. Watch the box height as lines are added.
  4. Keep adding lines until the box stops growing and a scroll bar appears inside it.
  5. Compare with Expected: grows, then scrolls at a cap.

## S13.06 Send button.

- **Expected:** A visible send button submits the composed message (and is disabled with a reason when sending is blocked).
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:14592; apps/extension/src/side_panel.ts:14598; apps/extension/manifest.json:84
- **Where to find it:** Side panel > message box > "Send message" button (arrow icon at the right of the box) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box and type text.
  2. Look for the send button (arrow icon) at the right; it appears once text is typed.
  3. Click it and watch the message go into the chat.
  4. Clear the box and look at the send button; it hides when empty and no file is attached.
  5. Compare with Expected: visible send button submits; blocked state is disabled.

## S13.07 Stop button.

- **Expected:** While a reply is generating, a stop control ends it (keeping what was produced).
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:9915; apps/extension/src/side_panel.ts:12096; apps/extension/manifest.json:84
- **Where to find it:** Side panel > message box > send button becomes "Stop response" while a reply is generating (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Send any message that gets a long reply.
  2. While the reply is still streaming, look at the button at the right of the box (square icon).
  3. Click it.
  4. Watch the reply stop and check the text produced so far stays in the chat.

## S13.09 Newline shortcut.

- **Expected:** A keyboard shortcut (e.g. Shift+Enter) inserts a newline without sending.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14593; apps/extension/src/side_panel.ts:9750 (quoted code not found in the file now); apps/extension/manifest.json:84
- **Where to find it:** Side panel > message box > Shift+Enter (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type some text.
  3. Press Shift+Enter.
  4. Check a new line appears and nothing is sent.
  5. Compare with Expected: newline without sending.

## S13.10 Undo and redo.

- **Expected:** Standard undo/redo shortcuts (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z) revert and reapply edits in the composer.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/composerText.ts:1; apps/extension/src/features/side-panel/voice.ts:223; apps/extension/src/side_panel.ts:14228
- **Needs:** live-web
- **Where to find it:** Side panel > message box "How can I help you today?" > Cmd+Z and Shift+Cmd+Z (labels found in the code)
- **Steps:**
  1. Click the message box and type a word.
  2. Type a second word.
  3. Press Cmd+Z and watch the last edit go.
  4. Press Shift+Cmd+Z and watch it come back.
  5. Compare with Expected: undo and redo revert and reapply edits.

## S13.11 Clipboard paste.

- **Expected:** Pasting from the clipboard inserts text into the composer and turns pasted files/images into attachments.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:14171; apps/extension/src/side_panel.ts:14584; apps/extension/manifest.json:84
- **Where to find it:** Side panel > message box "How can I help you today?" > Cmd+V (labels found in the code)
- **Needs:** a copied image or file for the second half
- **Steps:**
  1. Copy some plain text from another page and click the message box.
  2. Press Cmd+V and check the text appears in the box.
  3. Copy an image or a file and press Cmd+V in the message box.
  4. Look for an attachment chip above the box.
  5. Compare with Expected: text is inserted and files or images become attachments.

## S13.12 Rich-text paste normalization.

- **Expected:** Pasting formatted (HTML/rich) text yields clean plain text in the composer, without styling or markup.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:14171; apps/extension/src/side_panel.ts:14584; apps/extension/manifest.json:84
- **Where to find it:** Side panel > message box "How can I help you today?" > Cmd+V (labels found in the code)
- **Needs:** a web page with formatted text to copy
- **Steps:**
  1. Copy formatted text (bold, colours, links) from a web page.
  2. Click the message box and press Cmd+V.
  3. Look at the text: it should show as plain text with no styling.
  4. Compare with Expected: clean plain text.

## S13.16 Draft autosave.

- **Expected:** The unsent composer text is saved automatically while typing, so it survives a reload or crash.
- **Code:** partial. Evidence present: apps/extension/src/side_panel.ts:14570
- **Known to be unfinished:** Chrome keeps text in the current browser session. Recovery after Chrome restarts and across devices is open.
- **Where to find it:** no screen of its own. Marked unfinished in the plan: text is kept for the current browser session only, so restart and other devices are not covered.
- **Steps:**
  1. Type a sentence in the message box but do not send it.
  2. Close the side panel and open it again.
  3. Look at the message box.
  4. Compare with Expected: the unsent text is still there.

## S13.17 Draft recovery.

- **Expected:** After a reload, crash or failed send, the unsent text is put back in the composer (with a notice).
- **Code:** partial. Evidence present: apps/extension/src/side_panel.ts:10148; apps/extension/src/side_panel.ts:9556
- **Known to be unfinished:** Same-session panel reopen, reload, and delayed-read handling verified with a Chromium extension fixture. Authenticated side-panel acceptance and recovery after Chrome restarts remain open.
- **Where to find it:** no screen of its own. Plan says Chrome restart and authenticated side-panel acceptance are still open.
- **Steps:**
  1. Type unsent text in the message box.
  2. Reload or close and reopen the side panel.
  3. Look for the notice "Restored your unsent text." and the text in the box.
  4. Compare with Expected: text is put back with a notice.

## S13.18 Draft isolation by conversation.

- **Expected:** Each conversation keeps its own unsent draft; switching chats never carries text into another chat.
- **Code:** partial. Evidence present: apps/extension/src/side_panel.ts:10126
- **Known to be unfinished:** Text is keyed by chat, account, and login session. Chromium verified isolation, including keyboard undo and Temporary Chat, in an extension fixture. Authenticated history navigation in the side panel remains unverified.
- **Where to find it:** no screen of its own. Plan says authenticated history navigation in the side panel is still unverified.
- **Needs:** a signed-in account with two chats
- **Steps:**
  1. In chat A, type unsent text and do not send.
  2. Open "Recent chats" and open chat B.
  3. Check the message box in chat B is empty.
  4. Go back to chat A and check its unsent text is still there.
  5. Compare with Expected: drafts are separate per chat.

## S13.21 Prompt-template insertion.

- **Expected:** The user can insert a saved prompt template (e.g. a custom command) into the composer, filling in their own text.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/pageCommands.ts:116; apps/extension/src/features/side-panel/pageCommands.ts:144; apps/extension/src/side_panel.ts:8799; apps/extension/src/side_panel.ts:11142 (quoted code not found in the file now); apps/extension/src/features/background/shortcuts.ts:145
- **Where to find it:** More > Shortcuts > Create shortcut (saved prompt), then side panel message box "How can I help you today?" > type "/" and choose the shortcut (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the side panel and click "More".
  2. Click "Shortcuts" (opens the options page) and click "Create shortcut"; enter a name and a prompt with the input placeholder.
  3. Back in the side panel, click the message box and type "/" then the shortcut name.
  4. Choose the shortcut from the list, type your own text after it, and send.
  5. Compare with Expected: template is inserted and filled with your text.

## S13.22 Slash-command autocomplete.

- **Expected:** Typing "/" opens a filtered list of commands that can be chosen with keyboard or pointer.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:14233; apps/extension/src/side_panel.ts:14243; apps/extension/manifest.json:84
- **Where to find it:** Side panel > message box "How can I help you today?" > type "/" (labels found in the code)
- **Steps:**
  1. Click the message box and type "/".
  2. Look for the list of commands, each with a name and a short hint.
  3. Type "/su" and check the list filters to "/summarize".
  4. Press ArrowDown and Enter, or click an item.
  5. Compare with Expected: filtered list, chosen by keyboard or pointer.

## S13.25 Project mention.

- **Expected:** Typing a mention in the composer can reference a project, scoping the message to it.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:14351; apps/extension/src/side_panel.ts:14496; apps/extension/src/side_panel.ts:14511
- **Where to find it:** Side panel > message box "How can I help you today?" > type "@" > "Tabs and projects" menu > "Projects" > "Start the chat in this project" (labels found in the code)
- **Needs:** a signed-in account with at least one project
- **Steps:**
  1. Sign in and make sure you have at least one project.
  2. Click the message box and type "@".
  3. Look for the "Tabs and projects" menu with the "Projects" heading.
  4. Click a project under "Projects" (sub-line "Start the chat in this project").
  5. Look for the "Project · NAME" chip above the box and compare with Expected.

## S13.29 Browser-tab mention.

- **Expected:** The user can reference an open browser tab (choosing which one) as context for the message.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14351; apps/extension/src/side_panel.ts:11993 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5791 (quoted code not found in the file now); apps/extension/src/side_panel.ts:11813 (quoted code not found in the file now)
- **Where to find it:** Side panel > message box "How can I help you today?" > type "@" > "Tabs and projects" menu > "Tabs" group (labels found in the code)
- **Needs:** two or more open browser tabs
- **Steps:**
  1. Open two or more browser tabs with web pages.
  2. In the side panel, click the message box and type "@".
  3. Look for the "Tabs" heading in the "Tabs and projects" menu.
  4. Click one tab name.
  5. Look for the attached page chip above the box and compare with Expected.

## S13.31 Context chips.

- **Expected:** Context attached to the next message (skill, project, folder, files, page) shows as removable chips in the composer.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:11579; apps/extension/src/side_panel.ts:11596; apps/extension/manifest.json:84
- **Where to find it:** Side panel > "Add attachment" (+) button > "Add the browser page" (labels found in the code)
- **Needs:** a web page open in the browser
- **Steps:**
  1. Open a web page in the browser tab.
  2. In the side panel, click the "+" button labelled "Add attachment".
  3. Click "Add the browser page".
  4. Look above the message box for a chip for that page; it shows "capturing…" then the page name.
  5. Click the chip's remove control ("Remove" plus the page name) and check it disappears.

## S13.32 Selected-source chips.

- **Expected:** Sources chosen for the next message (e.g. web search, connector resources, a page) are shown as chips before sending.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6563 (quoted code not found in the file now)
- **Where to find it:** not found in the code. The cited side_panel.ts:6563 no longer holds this. Searched apps/extension for connector or source chips ("resources", "connectorResource", "spConnector" chip keys, "attachment-chip" kinds); only the "Connectors" item in the + menu and the answer-sources list ("Sources used for this answer") were found, not a pre-send source chip.

## S13.35 Attachment menu.

- **Expected:** A "+" (attach) menu in the composer lists the ways to add files, media and context.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14614; apps/extension/src/side_panel.ts:9918 (quoted code not found in the file now); apps/extension/manifest.json:84
- **Where to find it:** Side panel > message box > "+" button ("Add attachment") > menu "Attachment options" (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the side panel and click the "+" button next to the message box.
  2. Look at the "Attachment options" menu list.
  3. Check for "Upload from device" and "Attach tabs" among the items.
  4. Compare with Expected: the menu lists the ways to add files, media and context.

## S13.36 Dictation control.

- **Expected:** A microphone control dictates speech into the composer text (without sending) for review.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:14101; apps/extension/src/features/side-panel/voice.ts:136; apps/extension/manifest.json:84; apps/extension/src/side_panel.ts (text found, layout changed)
- **Where to find it:** Side panel > message box > microphone button "Voice input" > "Before you dictate" > Continue (labels found in the code)
- **Needs:** a microphone and Chrome microphone permission
- **Steps:**
  1. Click the microphone button next to the message box.
  2. Read the "Before you dictate" notice and click "Continue".
  3. Allow the microphone in Chrome when asked.
  4. Speak; the words should appear in the message box.
  5. Check the text is not sent until you press Enter or the send button.

## S13.40 Mid-task steering input.

- **Expected:** While an agent is working, the user can send guidance that steers the running task without stopping it.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:8701; apps/extension/src/side_panel.ts:8718; apps/extension/src/side_panel.ts:8734
- **Where to find it:** Side panel > message box while a reply is generating (placeholder "Reply to send it after this answer") > Enter (labels found in the code)
- **Needs:** a signed-in account and a reply that is still generating
- **Steps:**
  1. Send a message that gets a long reply.
  2. While it streams, click the message box and type a guidance message.
  3. Press Enter.
  4. Look for the "Queued" item above the box with Edit and Cancel.
  5. Compare with Expected: guidance steers the running task without stopping it.
