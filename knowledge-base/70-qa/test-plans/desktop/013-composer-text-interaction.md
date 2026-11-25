---
id: "PLAN-desktop-013"
type: "test-plan"
title: "Desktop · 13. Composer text interaction"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "13"
---
# Desktop · 13. Composer text interaction

36 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S13.01 Plain-text entry.

- **Expected:** The user can type a plain-text message into the composer and send it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerInput.tsx:47; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2858; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Where to find it:** Chat home (first screen after sign-in) > message box that says "Ask anything. Type / for commands" > "Send message" button (labels found in the code)
- **Steps:**
  1. Sign in and open the chat home screen.
  2. Click the message box that says "Ask anything. Type / for commands".
  3. Type a short plain sentence such as "hello test".
  4. Click the round "Send message" button at the right end of the box (or press Enter).
  5. Look: the sentence appears as your message in the chat and a reply starts. Compare with Expected.

## S13.02 Multiline entry.

- **Expected:** The composer accepts multi-line text (line breaks are kept in the sent message).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerInput.tsx:47; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3517 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Where to find it:** Chat home > message box "Ask anything. Type / for commands" > press Shift+Enter between lines (labels found in the code)
- **Steps:**
  1. Click the message box that says "Ask anything. Type / for commands".
  2. Type "line one".
  3. Press Shift+Enter and type "line two", then press Shift+Enter again and type "line three".
  4. Do not press plain Enter. Click "Send message".
  5. Look: the sent message shows three separate lines, as typed. Compare with Expected.

## S13.03 Automatic height growth.

- **Expected:** The composer grows taller automatically as the text grows, up to a cap, then scrolls.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerInput.tsx:47; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2441; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Where to find it:** Chat home > message box "Ask anything. Type / for commands" (the box grows as you type) (labels found in the code)
- **Steps:**
  1. Click the message box that says "Ask anything. Type / for commands".
  2. Type one line, then press Shift+Enter and type another line. Repeat until you have about ten lines.
  3. Look: the box gets taller after each new line.
  4. Keep adding lines until the box stops growing; it has a maximum height and then the text scrolls inside it. Compare with Expected.

## S13.04 Manual expansion.

- **Expected:** The user can manually enlarge the composer (an expand control or resize handle) beyond its automatic height.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5901; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4703; apps/web/features/chat/components/Composer/ComposerInput.tsx:54
- **Where to find it:** Chat home > message box > "Expand message input" button at the top-right corner of the box (appears once the text is long) (labels found in the code)
- **Steps:**
  1. Click the message box and type or paste about ten lines of text.
  2. Look for a small icon button at the top-right corner of the box.
  3. Hover over it to see the tooltip "Expand message input" and click it.
  4. Look: the box becomes much taller, and the same button now reads "Collapse message input". Click it again to return to normal height. Compare with Expected.

## S13.05 Full-screen prompt editing.

- **Expected:** The user can open the draft in a full-screen (or external) editor and return it to the composer.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5901; apps/web/features/chat/components/Composer/ComposerInput.tsx:66; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4669
- **Where to find it:** not found in the code. Only the inline expand control (S13.04) was found. No full-screen or external-editor control exists in the code: searched apps/web and packages/ui for "Exit full", "fullscreen", "full screen", "Open in" and "Edit in" in the composer files; the only hits are the map and artifact preview.

## S13.06 Send button.

- **Expected:** A visible send button submits the composed message (and is disabled with a reason when sending is blocked).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6958; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2706 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat home > message box > round "Send message" button at the right end of the box (after you type) (labels found in the code)
- **Steps:**
  1. Click the message box and type a short sentence.
  2. Look at the right end of the box: the round Send message button appears.
  3. Click it (or hover to see the tooltip "Send message").
  4. Look: the message is sent. Then clear the box and look at the same spot: a voice button appears instead when voice is available. Compare with Expected, including whether a disabled state shows a reason when sending is blocked.

## S13.07 Stop button.

- **Expected:** While a reply is generating, a stop control ends it (keeping what was produced).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6977; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3443; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat home > send a message that needs a long answer > the same round button at the right end of the box, now a Stop control (labels found in the code)
- **Needs:** a reply that takes several seconds to generate
- **Steps:**
  1. Click the message box and type "Write a 500 word essay about rivers", then click Send message.
  2. While the reply is still streaming, look at the right end of the box: the button has changed to a stop control.
  3. Hover over it to see the tooltip "Stop generation", then click it.
  4. Look: the reply stops early and the text already written stays on screen. Compare with Expected.

## S13.09 Newline shortcut.

- **Expected:** A keyboard shortcut (e.g. Shift+Enter) inserts a newline without sending.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerInput.tsx:47; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3517 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Where to find it:** Chat home > message box > press Shift+Enter (Enter alone sends) (labels found in the code)
- **Steps:**
  1. Click the message box and type "first line".
  2. Press Shift+Enter.
  3. Look: the cursor moves to a new line inside the box and nothing is sent.
  4. Type "second line" and compare with Expected.

## S13.10 Undo and redo.

- **Expected:** Standard undo/redo shortcuts (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z) revert and reapply edits in the composer.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/composer-editor/extensions/index.ts:25; apps/web/features/chat/lib/composer-editor-gate.ts:46
- **Needs:** live-web
- **Where to find it:** no screen of its own. Undo comes from the composer editor extension in packages/ui/unified-chat/src/composer-editor/extensions/index.ts, but which composer arm is used depends on apps/web/features/chat/lib/composer-editor-gate.ts; the tester should check the behaviour in the running app.
- **Steps:**
  1. Click the message box and type "alpha beta".
  2. Press Cmd+Z: the last typed words are removed.
  3. Press Shift+Cmd+Z: the words come back.
  4. Compare with Expected. The effect is visible only in the box text.

## S13.11 Clipboard paste.

- **Expected:** Pasting from the clipboard inserts text into the composer and turns pasted files/images into attachments.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerInput.tsx:141; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2372; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Where to find it:** Chat home > message box > paste with Cmd+V (text, and copied files or images) (labels found in the code)
- **Needs:** a copied image or file on the Mac
- **Steps:**
  1. Copy one sentence from another app, click the message box and press Cmd+V: the sentence appears in the box.
  2. Copy an image (or a file in Finder) and press Cmd+V in the box.
  3. Look: the image or file appears as an attachment chip or preview above the box, not as text.
  4. Compare with Expected.

## S13.12 Rich-text paste normalization.

- **Expected:** Pasting formatted (HTML/rich) text yields clean plain text in the composer, without styling or markup.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerInput.tsx:47; packages/platform/utils/src/composerPaste.ts:131; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Where to find it:** no screen of its own. The paste decision reads the plain-text clipboard data in packages/platform/utils/src/composerPaste.ts; the rendered result was not verified.
- **Needs:** formatted text copied from another app
- **Steps:**
  1. Copy a line that has bold or a link from a web page (or from Notes).
  2. Click the message box "Ask anything. Type / for commands" and press Cmd+V.
  3. Look: the text appears with no bold, no link and no colours.
  4. Compare with Expected.

## S13.13 Code-paste formatting.

- **Expected:** Pasted source code is recognized and wrapped in a code block (with a way to paste it as plain text).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4983; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2383; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat home > message box > paste source code with Cmd+V > notice "Paste as plain text" (labels found in the code)
- **Needs:** a copied piece of source code
- **Steps:**
  1. Copy four or more lines of source code from an editor.
  2. Click the message box and press Cmd+V.
  3. Look: a notice appears above the box saying "That paste looked like code, so it was wrapped in a code block." and the code is inside a code block.
  4. Click "Paste as plain text" in the notice, then look: the same code comes back as plain text without the fence. Compare with Expected.

## S13.14 Long-prompt handling.

- **Expected:** Very long input is handled deliberately (turned into an attachment, collapsed, or clearly limited with feedback) instead of flooding the composer.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3665 (quoted code not found in the file now); packages/platform/utils/src/composerPaste.ts:45; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat home > message box > paste a very long text with Cmd+V > notice with "Put it back in the message" (labels found in the code)
- **Needs:** a long text copied to the clipboard (over 10,000 characters)
- **Steps:**
  1. Copy a long text of about 11,000 characters (for example a long article).
  2. Click the message box and press Cmd+V.
  3. Look: the box stays short; a notice appears above it saying the paste was long and was attached as a file named Pasted text.txt.
  4. Click "Put it back in the message" to see the text return to the box, or dismiss the notice. Compare with Expected.

## S13.15 Character or token indicators where useful.

- **Expected:** Where length matters, the composer shows a character or token/context indicator before sending.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5926; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4761; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat home > message box > character counter under the box (shows only when the text is long) (labels found in the code)
- **Needs:** a very long text (about 75,000 characters)
- **Steps:**
  1. Paste or type a very long text (the counter appears once the text reaches 75,000 characters).
  2. Look under the message box for a line reading the character count, for example "75,000 / 100,000 characters".
  3. Keep adding text until the count reaches the limit; the line then adds "limit reached" in red.
  4. Compare with Expected. No token or context indicator was found in the composer.

## S13.16 Draft autosave.

- **Expected:** The unsent composer text is saved automatically while typing, so it survives a reload or crash.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4124; apps/web/features/chat/components/Composer/composer-draft-storage.ts:188; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4157
- **Where to find it:** no screen of its own. Drafts are written to browser storage (apps/web/features/chat/components/Composer/composer-draft-storage.ts), so they stay per browser. Temporary (incognito) chats do not save drafts.
- **Steps:**
  1. Click the message box "Ask anything. Type / for commands" and type "draft autosave test" without sending.
  2. Wait a few seconds, then reload the page (Cmd+R).
  3. Look: the text "draft autosave test" is still in the box after reload. Compare with Expected.

## S13.17 Draft recovery.

- **Expected:** After a reload, crash or failed send, the unsent text is put back in the composer (with a notice).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4157; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:689; apps/web/features/chat/hooks/use-conversation-draft-sync.ts:246
- **Where to find it:** Chat home > message box; failed send shows the notice "Couldn't send. Restored here so you can try again." (labels found in the code)
- **Needs:** a way to turn off the internet connection
- **Steps:**
  1. Click the message box and type "recovery test".
  2. Turn off the Mac's Wi-Fi or internet, then click Send message.
  3. Look: the text returns to the box and a notice reads "Couldn't send. Restored here so you can try again."
  4. Turn the internet back on. Also reload the page with unsent text to see whether the text comes back. Compare with Expected.

## S13.18 Draft isolation by conversation.

- **Expected:** Each conversation keeps its own unsent draft; switching chats never carries text into another chat.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerInput.tsx:47; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3158 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5863
- **Where to find it:** no screen of its own. The sidebar label was not traced; the parking logic is in ChatComposerNew.tsx around the conversation-change effect.
- **Needs:** two conversations
- **Steps:**
  1. Open conversation A and type "draft for A" in the message box without sending.
  2. Open a different conversation (or a new chat) from the sidebar.
  3. Look: the message box in the other chat does not contain "draft for A".
  4. Go back to conversation A and look: "draft for A" is back. Compare with Expected.

## S13.20 Prompt suggestions.

- **Expected:** The product offers prompt suggestions (e.g. follow-up questions) that the user can pick to fill or send the next message.
- **Code:** partial. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:1093
- **Known to be unfinished:** switch-on (deploy step 'follow-ups on'): change FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT to true at apps/web/features/chat/components/messages/ChatMessageList.tsx:1048; generator and settings toggle are built
- **Where to find it:** Settings > General > "Show follow-up suggestions in chats" switch; suggestions then appear under a chat reply (labels found in the code)
- **Steps:**
  1. Open Settings (command palette entry "Settings", shortcut Cmd+,) and open General.
  2. Turn on the switch "Show follow-up suggestions in chats".
  3. Go back to a chat, ask a question and wait for the reply to finish.
  4. Look under the reply for suggested follow-up questions; click one and check that it fills or sends the next message. Compare with Expected.

## S13.21 Prompt-template insertion.

- **Expected:** The user can insert a saved prompt template (e.g. a custom command) into the composer, filling in their own text.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:211; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3183; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1925
- **Where to find it:** Settings > General > Custom commands > New command; then chat message box > type "/" and choose the command (labels found in the code)
- **Steps:**
  1. Open Settings, open General and scroll to Custom commands.
  2. Click "New command", give it a name, and write a template containing {{input}}; click "Create command".
  3. Open a chat, click the message box, type "/" and the command name.
  4. Choose the command and press Enter.
  5. Look: the template appears in the box with the text you type in place of {{input}}. Compare with Expected.

## S13.22 Slash-command autocomplete.

- **Expected:** Typing "/" opens a filtered list of commands that can be chosen with keyboard or pointer.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1925; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2818; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat home > message box > type "/" (labels found in the code)
- **Steps:**
  1. Click the message box "Ask anything. Type / for commands" and type "/".
  2. Look: a list opens with group headings such as "Commands", "Skills" and "Your skills".
  3. Type "/sk" to filter the list and see it narrow.
  4. Pick an item with the arrow keys and Enter, or click it with the mouse. Compare with Expected.

## S13.23 Skill invocation.

- **Expected:** The user can explicitly invoke a Skill from the composer so the next message runs with it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5163; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3381; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat home > message box > "Add attachments and tools" (+ button) > Skills (or type "/" and choose a skill) (labels found in the code)
- **Needs:** a skill available in your account
- **Steps:**
  1. Click the "+" button labelled "Add attachments and tools" at the left of the box.
  2. Click the "Skills" group and choose a skill.
  3. Look: a chip with the skill name appears above the box, with a remove button.
  4. Type a message and send it; check that the reply uses the skill. Compare with Expected.

## S13.25 Project mention.

- **Expected:** Typing a mention in the composer can reference a project, scoping the message to it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5606; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3043; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat home > message box > type "@" then a project name (list labelled "Mentions") (labels found in the code)
- **Needs:** at least one project in your account
- **Steps:**
  1. Click the message box and type "@".
  2. Look: a list labelled "Mentions" opens with project rows.
  3. Type the first letters of a project name and pick it with the arrow keys and Enter.
  4. Look: the project is shown as a chip or the project picker shows its name, and the message is scoped to it. Compare with Expected.

## S13.26 File mention.

- **Expected:** Typing a mention in the composer can reference a file, whose contents are included with the message.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2960; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:778; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2535; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5891
- **Where to find it:** Chat home > message box > type "@" then a file name (list labelled "Mentions") (labels found in the code)
- **Needs:** a file already in your library (upload one first with "Add from library" or the + menu)
- **Steps:**
  1. Click the message box and type "@".
  2. Look: the "Mentions" list shows files from your library.
  3. Type part of a file name and pick it with Enter.
  4. Look: the file appears as an attachment and is sent with the message. Compare with Expected.

## S13.27 Folder mention.

- **Expected:** Typing a mention in the composer can reference a folder, whose contents are made available to the message.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2932; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3073; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5681; apps/web/features/chat/hooks/use-mention-folders.ts:48
- **Where to find it:** AGI Desktop app > chat message box > "Add attachments and tools" (+) > "Add working folder", then type "@" and look for folder rows (labels found in the code)
- **Needs:** the AGI Desktop app and a folder on the Mac
- **Steps:**
  1. In the AGI Desktop app, click the "+" button "Add attachments and tools".
  2. Click "Add working folder" and pick a folder on the Mac.
  3. Click the message box, type "@" and look in the "Mentions" list for folder rows.
  4. Pick a folder row and check that the message is sent with that folder in context. Compare with Expected.

## S13.29 Browser-tab mention.

- **Expected:** The user can reference an open browser tab (choosing which one) as context for the message.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:351; apps/desktop/electron/browser/commandGate.ts:141
- **Where to find it:** AGI Desktop app > chat message box > "Add attachments and tools" (+) > "Use the browser" > dialog "Use the browser" > "Choose a tab" (labels found in the code)
- **Needs:** the AGI Desktop app, and a Chrome window paired with the extension (Settings > Capabilities)
- **Steps:**
  1. In the AGI Desktop app, click the "+" button "Add attachments and tools" and click "Use the browser".
  2. In the dialog titled "Use the browser", choose the read-page action and click "Choose a tab".
  3. Pick a tab from the Tab list that appears.
  4. Run the action and approve it when asked; look for the page text attached to the message. Compare with Expected.

## S13.30 Connected-app mention.

- **Expected:** The user can reference a connected app (connector/MCP server) or one of its resources inline in the composer.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2922; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3052; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2995; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5654
- **Where to find it:** Message box > type @ > Connected apps > click an app name (labels found in the code)
- **Needs:** a connected app
- **Steps:**
  1. Sign in and open a chat with an empty message box.
  2. Click in the message box and type @.
  3. Look for the Connected apps heading in the menu that opens, under any skills, projects and files.
  4. Click a connected app name.
  5. Compare with Expected: the app is added to the message as a reference and the menu closes.

## S13.31 Context chips.

- **Expected:** Context attached to the next message (skill, project, folder, files, page) shows as removable chips in the composer.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5155; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5161; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Message box > + (Add attachments and tools) > Add photos & files (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Click the + button left of the message box.
  2. Click Add photos & files and choose a file (or click Skills and pick a skill).
  3. Look above the message box for a chip with a close control.
  4. Click the close control on the chip.
  5. Compare with Expected: the chip shows the attached context and disappears when removed.

## S13.32 Selected-source chips.

- **Expected:** Sources chosen for the next message (e.g. web search, connector resources, a page) are shown as chips before sending.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5183; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5188; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** not found in the code. Chips labelled Prompt: and Resource: with Remove selected connector context exist in apps/web/features/chat/components/Composer/ChatComposerNew.tsx (about lines 5170-5190), and a Use prompt button is in apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx (line 345). I could not confirm a path from sign-in to that panel. Web search is automatic and has no chip (ChatComposerNew.tsx line 3409). I searched for a page-source chip and found none.
- **Needs:** a connected app that offers a prompt or a resource

## S13.33 Selected-tool chips.

- **Expected:** Tools switched on for the next message (e.g. research, code, office files) are shown as chips near the composer.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6233; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4850; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Message box > + (Add attachments and tools) > Deep Research (labels found in the code)
- **Steps:**
  1. Click the + button left of the message box.
  2. Click Deep Research.
  3. Close the menu and look at the row beside the + button.
  4. Look for a pill with a count badge that names the active option (Deep Research).
  5. Compare with Expected: the active tool shows near the composer. Tools show as one pill with a count, not one chip per tool.

## S13.34 Output-format selection.

- **Expected:** Before sending, the user can choose the output format for the reply (e.g. table, document, code, slides).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:958; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:249; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2571; apps/web/lib/hooks/useChatStream.ts:4642; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6650; apps/web/lib/chat-output-format.ts:23
- **Where to find it:** Message box > + (Add attachments and tools) > Output (labels found in the code)
- **Steps:**
  1. Click the + button left of the message box.
  2. Click Output to expand its list.
  3. Click Document, Presentation or Spreadsheet.
  4. Look at the Output row: it now reads Output with the chosen format, and the pill beside + updates.
  5. Compare with Expected. Click the same format again to clear it.

## S13.35 Attachment menu.

- **Expected:** A "+" (attach) menu in the composer lists the ways to add files, media and context.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6000; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5955; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Message box > + (Add attachments and tools) (labels found in the code)
- **Steps:**
  1. Click the round + button left of the message box (its label is Add attachments and tools).
  2. Look at the menu that opens.
  3. Check for these rows: Add photos & files, Add from library, Create image, Create video, Skills, Connectors, Output and Deep Research.
  4. Compare with Expected: each row lists a way to add files, media or context.

## S13.36 Dictation control.

- **Expected:** A microphone control dictates speech into the composer text (without sending) for review.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6942; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2048; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Message box > microphone button labelled Start voice input (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Click the microphone button beside the message box.
  2. Allow microphone access if the browser asks.
  3. Speak a sentence.
  4. Click the microphone button again to stop, if it does not stop by itself.
  5. Compare with Expected: the spoken words appear in the message box and nothing is sent.

## S13.37 Voice-conversation control.

- **Expected:** A control starts a hands-free voice conversation (speak, hear the reply) from the composer.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6956; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2085; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Message box (left empty) > round button labelled Start voice mode (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Leave the message box empty.
  2. Look at the right end of the message box for a round button labelled Start voice mode. Typing text replaces it with Send.
  3. Click it and allow microphone access.
  4. Speak, then listen for the spoken reply.
  5. Compare with Expected: a hands-free voice conversation starts from the composer.

## S13.38 Queued next prompt.

- **Expected:** While a reply is still generating, the user can type and queue the next message, which sends when the reply finishes.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5009; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3948; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Message box, while a reply is still generating > type > press Enter (labels found in the code)
- **Steps:**
  1. Send a question that gets a long answer.
  2. While the answer is still appearing, type a new message in the message box.
  3. Press Enter (Shift+Enter adds a line).
  4. Look above the message box for a row starting Queued: in a list labelled Queued messages.
  5. Compare with Expected: when the reply finishes, the queued message is sent.

## S13.39 Edit or cancel queued prompt.

- **Expected:** A queued message can be edited or cancelled before it is sent.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5045; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4422; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Queued row above the message box > Edit or Cancel (labels found in the code)
- **Steps:**
  1. Queue a message while a reply is running (as in S13.38).
  2. Click Edit on the Queued row: the text returns to the message box. Change it and send, which replaces the queued message.
  3. Or click Cancel on the Queued row.
  4. Compare with Expected: Cancel removes the row and nothing is sent; Edit puts the text back for changes.

## S13.40 Mid-task steering input.

- **Expected:** While an agent is working, the user can send guidance that steers the running task without stopping it.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchActivity.tsx:625; apps/web/features/chat/components/research/ResearchActivity.tsx:638; apps/web/features/chat/pages/WebChatPage.tsx:6105; packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:514
- **Where to find it:** Deep Research card in the chat > Steer (labels found in the code)
- **Steps:**
  1. Click the + button, choose Deep Research, then send a research question.
  2. While the research card shows it is planning or searching, click Steer.
  3. Type guidance in the box labelled Guidance for the rest of this research and click Send.
  4. Compare with Expected: the note Your guidance is applied when the current step finishes appears and the research keeps running.
