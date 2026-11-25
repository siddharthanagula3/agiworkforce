---
id: "PLAN-mobile-013"
type: "test-plan"
title: "Mobile · 13. Composer text interaction"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "13"
---
# Mobile · 13. Composer text interaction

28 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S13.01 Plain-text entry.

- **Expected:** The user can type a plain-text message into the composer and send it.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:2099; apps/mobile/src/features/chat/components/ChatInput.tsx:1197; apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** First screen after sign-in (New chat) > message box that shows "What's on your mind?" > type > Send message button on the right of the box (labels found in the code)
- **Steps:**
  1. Sign in and wait for the New chat screen.
  2. Tap the message box that shows "What's on your mind?".
  3. Type a short sentence, for example "Hello, this is a test".
  4. Tap the send button on the right of the box (accessibility label "Send message").
  5. Compare: your text appears as a sent message and the box is cleared.

## S13.02 Multiline entry.

- **Expected:** The composer accepts multi-line text (line breaks are kept in the sent message).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:2099; apps/mobile/src/features/chat/components/ChatInput.tsx:1059 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** First screen after sign-in (New chat) > message box "What's on your mind?" (labels found in the code)
- **Steps:**
  1. Tap the message box.
  2. Type "First line".
  3. Press Return on the keyboard (this does not send).
  4. Type "Second line".
  5. Compare: the box shows two lines. Send, then check that the sent message keeps the line break.

## S13.03 Automatic height growth.

- **Expected:** The composer grows taller automatically as the text grows, up to a cap, then scrolls.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:2107; apps/mobile/src/features/chat/components/ChatInput.tsx:612 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** no screen of its own. The code caps the field at a maximum height of 160 with a scroll, so the exact cap is not confirmed on screen.
- **Steps:**
  1. Tap the message box.
  2. Press Return and type until the text is more than about eight lines long.
  3. Compare: the box grows taller as lines are added, stops growing at a cap, then scrolls inside the box.

## S13.04 Manual expansion.

- **Expected:** The user can manually enlarge the composer (an expand control or resize handle) beyond its automatic height.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:2149; apps/mobile/src/features/chat/components/ChatInput.tsx:1616; apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** New chat > message box > "Expand message" control (small icon at the top right of the box; appears once the text is multiline) (labels found in the code)
- **Steps:**
  1. Type several lines so the box is multiline.
  2. Tap the small expand icon at the top right of the box (accessibility label "Expand message").
  3. Compare: a full-screen "Message" editor opens.
  4. Tap "Collapse editor" (top left) to return to the box.

## S13.05 Full-screen prompt editing.

- **Expected:** The user can open the draft in a full-screen (or external) editor and return it to the composer.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:2399; apps/mobile/src/features/chat/components/ComposerFullScreenEditor.tsx:27; apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** New chat > message box > "Expand message" > full-screen "Message" editor > "Collapse editor" (labels found in the code)
- **Steps:**
  1. Type some text and tap the "Expand message" icon at the top right of the box.
  2. In the full-screen "Message" editor, add or change text.
  3. Tap the top-left icon with the accessibility label "Collapse editor".
  4. Compare: you are back in the message box and the edited text is kept.
  5. Optionally tap the send button at the top right of the full-screen editor.

## S13.06 Send button.

- **Expected:** A visible send button submits the composed message (and is disabled with a reason when sending is blocked).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:2313; apps/mobile/src/features/chat/components/ChatInput.tsx:1591; apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** New chat > message box > send button on the right of the box (accessibility label "Send message") (labels found in the code)
- **Steps:**
  1. With the box empty, look at the send button and note it is dimmed.
  2. Type a sentence.
  3. Tap the send button.
  4. Compare: the message is sent and the box is cleared. While offline, the box says "Offline, message will send on reconnect" instead.

## S13.07 Stop button.

- **Expected:** While a reply is generating, a stop control ends it (keeping what was produced).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:2313; apps/mobile/src/features/chat/components/ChatInput.tsx:1593; apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** New chat > send any message > while the reply streams, the send button becomes the stop control (accessibility label "Stop generating") (labels found in the code)
- **Steps:**
  1. Send a message that gets a long reply.
  2. While the reply is streaming, look at the right of the box where the send button was.
  3. Tap that button (accessibility label "Stop generating").
  4. Compare: the reply stops and the text produced so far stays on screen.

## S13.09 Newline shortcut.

- **Expected:** A keyboard shortcut (e.g. Shift+Enter) inserts a newline without sending.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:2125; apps/mobile/src/features/chat/components/ChatInput.tsx:2126; apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** New chat > message box > Shift+Return on a hardware keyboard (labels found in the code)
- **Needs:** a hardware keyboard (for example the Mac keyboard connected to the simulator)
- **Steps:**
  1. Tap the message box and type "one".
  2. Press Shift+Return on a connected keyboard.
  3. Compare: a new line appears in the box and the message is not sent.

## S13.10 Undo and redo.

- **Expected:** Standard undo/redo shortcuts (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z) revert and reapply edits in the composer.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** not found in the code. Searched apps/mobile for undo and redo in the chat composer. No composer undo or redo handler was found. The only "Undo last change" label is in apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx, which is the artifact editor, not the composer.
- **Needs:** a hardware keyboard

## S13.11 Clipboard paste.

- **Expected:** Pasting from the clipboard inserts text into the composer and turns pasted files/images into attachments.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:2099; apps/mobile/src/features/chat/components/ChatInput.tsx:1197; apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** New chat > message box > long press > Paste (text, from the system menu); New chat > "Add to chat" (+) > "Paste image" (image) (labels found in the code)
- **Needs:** a sentence and an image on the clipboard
- **Steps:**
  1. Copy a sentence in another app.
  2. Long-press the message box and choose Paste.
  3. Compare: the text appears in the box.
  4. Copy an image, tap "Add to chat" (+), then tap "Paste image".
  5. Compare: the image appears as an attachment in the strip above the box.

## S13.12 Rich-text paste normalization.

- **Expected:** Pasting formatted (HTML/rich) text yields clean plain text in the composer, without styling or markup.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:2099; apps/mobile/src/features/chat/components/ChatInput.tsx:1197; apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** not found in the code. Searched ChatInput.tsx and src/features/chat for HTML or rich-text normalization on paste. None was found; the message box is a plain multiline text field. Whether iOS pastes plain text was not verified in code.
- **Needs:** formatted text copied from a web page

## S13.14 Long-prompt handling.

- **Expected:** Very long input is handled deliberately (turned into an attachment, collapsed, or clearly limited with feedback) instead of flooding the composer.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:1274; apps/mobile/src/features/chat/components/ChatInput.tsx:1664; apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** New chat > message box > paste a very long block of text; it appears as a "Pasted text" chip above the box (labels found in the code)
- **Needs:** a long text on the clipboard
- **Steps:**
  1. Copy a long text (several pages) from another app.
  2. Paste it into the message box.
  3. Compare: a "Pasted text" chip appears above the box with its size, instead of filling the box.
  4. Tap the chip to expand the text back into the message box.

## S13.15 Character or token indicators where useful.

- **Expected:** Where length matters, the composer shows a character or token/context indicator before sending.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2700; apps/mobile/src/features/chat/components/ContextWarningChip.tsx:19
- **Where to find it:** Open a long conversation > warning line above the message box: "Chat is getting long. Start a fresh chat for faster responses." (labels found in the code)
- **Needs:** a long conversation
- **Steps:**
  1. Open a conversation with many long messages.
  2. Look at the line above the message box.
  3. Tap the warning line to open the context details.
  4. Compare: the warning shows only for a long chat, and no character or token count appears while you type.

## S13.16 Draft autosave.

- **Expected:** The unsent composer text is saved automatically while typing, so it survives a reload or crash.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:2099; apps/mobile/src/features/chat/components/ChatInput.tsx:280 (quoted code not found in the file now); apps/mobile/src/features/chat/draftStore.ts:5; apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** no screen of its own. Drafts are saved on the device by apps/mobile/src/features/chat/draftStore.ts, keyed per conversation. Not checked on a device.
- **Steps:**
  1. Type a sentence in the message box but do not send it.
  2. Force quit the app (or reload the page on web).
  3. Reopen the app and sign in again if asked.
  4. Compare: the typed sentence is back in the message box.

## S13.17 Draft recovery.

- **Expected:** After a reload, crash or failed send, the unsent text is put back in the composer (with a notice).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:462; apps/mobile/src/features/chat/components/ChatInput.tsx:399 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** no screen of its own. The restore is in code (restoreSentText in ChatInput.tsx), but no visible notice for a restored draft was found. The only failed-send alert found is "Pasted text not sent", which applies to large pasted text.
- **Needs:** a way to make the send fail; offline does not fail, it queues
- **Steps:**
  1. Type a sentence and tap the send button.
  2. Wait for the send to fail (offline sends are queued, so use a failing server response if you can).
  3. Compare: the sent text is put back at the top of the message box.

## S13.18 Draft isolation by conversation.

- **Expected:** Each conversation keeps its own unsent draft; switching chats never carries text into another chat.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2759; apps/mobile/src/features/chat/components/ChatInput.tsx:517
- **Where to find it:** no screen of its own. Drafts are keyed by conversation in apps/mobile/app/(app)/chat/[id].tsx and ChatInput.tsx (draftKey).
- **Needs:** two conversations
- **Steps:**
  1. In one chat, type "draft A" and do not send.
  2. Open a different chat from the chat list.
  3. Compare: that chat's message box is empty.
  4. Type "draft B" there, then go back to the first chat.
  5. Compare: "draft A" is still there and "draft B" is not.

## S13.22 Slash-command autocomplete.

- **Expected:** Typing "/" opens a filtered list of commands that can be chosen with keyboard or pointer.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:1796; apps/mobile/src/features/chat/components/ChatInput.tsx:1553; apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** New chat > message box > type "/" (labels found in the code)
- **Steps:**
  1. Tap the message box.
  2. Type "/".
  3. Compare: a "Command suggestions" list shows /image (Generate an image), /voice (Start voice conversation), /compare (Compare model responses) and /export (Export conversation).
  4. Type "/im" and compare: the list filters to /image.
  5. Tap a command to choose it.

## S13.23 Skill invocation.

- **Expected:** The user can explicitly invoke a Skill from the composer so the next message runs with it.
- **Code:** done. Evidence present: apps/mobile/app/(app)/(tabs)/chat.tsx:1437; apps/mobile/app/(app)/chat/[id].tsx:2886
- **Where to find it:** New chat > "Add to chat" (+) > "Skills" > pick a skill (labels found in the code)
- **Needs:** a signed-in Cloud account (the chip says "selected for the next Cloud message"); plan requirement not confirmed
- **Steps:**
  1. Tap the + button (accessibility label "Add to chat") at the left of the message box.
  2. Tap "Skills" in the sheet.
  3. Pick a skill.
  4. Compare: the skill name shows as a chip above the box, and the next message runs with it.
  5. Optionally tap the X on the chip (accessibility label "Clear selected Skill") and compare that the chip is gone.

## S13.31 Context chips.

- **Expected:** Context attached to the next message (skill, project, folder, files, page) shows as removable chips in the composer.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:1739; apps/mobile/src/features/chat/components/ChatInput.tsx:1700; apps/mobile/app/(app)/(tabs)/chat.tsx:1419
- **Where to find it:** New chat > "Add to chat" (+) > "Skills", "Project" or "File"; chips and the attachment strip appear above the message box (labels found in the code)
- **Needs:** a Cloud account, a file to upload, and at least one project and skill
- **Steps:**
  1. Tap + > "Skills" and pick a skill; compare the skill chip above the box, then tap its X and compare it is removed.
  2. Tap + > "Project" and pick a project; compare the project bar appears; its "Clear project" control removes it.
  3. Tap + > "File" and pick a file; compare it appears in the "Attached files" strip with a Remove control.
  4. Compare each chip is removable and shows its name.

## S13.32 Selected-source chips.

- **Expected:** Sources chosen for the next message (e.g. web search, connector resources, a page) are shown as chips before sending.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:1706; apps/mobile/src/features/chat/components/ChatInput.tsx:561
- **Where to find it:** New chat > "Add to chat" (+) > "Web search" or "Connectors" (labels found in the code)
- **Needs:** a Cloud account; a connected connector for the Connectors row
- **Steps:**
  1. Tap the + button and tap "Web search".
  2. Look at the row in the sheet: it shows a "selected" state when on.
  3. Close the sheet and look above the message box.
  4. Compare: sources should show as chips before sending.

## S13.33 Selected-tool chips.

- **Expected:** Tools switched on for the next message (e.g. research, code, office files) are shown as chips near the composer.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:1815; apps/mobile/src/features/chat/components/ChatInput.tsx:585; apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** New chat > "Add to chat" (+) > "Deep research" or "Run code"; chips appear in a row above the message box (labels found in the code)
- **Needs:** a signed-in Cloud account; a model that supports research or code
- **Steps:**
  1. Tap the + button.
  2. Tap "Deep research" or "Run code" to switch it on.
  3. Close the sheet.
  4. Compare: a chip labelled "Research" or "Run code" appears above the message box.

## S13.34 Output-format selection.

- **Expected:** Before sending, the user can choose the output format for the reply (e.g. table, document, code, slides).
- **Code:** done. Evidence moved: apps/mobile/stores/chat/chatExecutionStore.ts:2243 (quoted code not found in the file now)
- **Where to find it:** New chat > "Add to chat" (+) > "Create file" > "Document", "Presentation" or "Spreadsheet" (labels found in the code)
- **Needs:** a Cloud account with the code feature on (the row only shows in Cloud text mode)
- **Steps:**
  1. Tap the + button and tap "Create file".
  2. Choose an output: Document, Presentation or Spreadsheet.
  3. Compare: the "Create file" row shows the chosen format.
  4. Send a message and check that the reply is that kind of file.

## S13.35 Attachment menu.

- **Expected:** A "+" (attach) menu in the composer lists the ways to add files, media and context.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:2208; apps/mobile/src/features/chat/components/ChatInput.tsx:1599; apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** New chat > "Add to chat" (+) button at the left of the message box (labels found in the code)
- **Needs:** phone width; a Cloud account to see the Cloud rows
- **Steps:**
  1. Tap the + button.
  2. Compare the sheet lists Camera, Photos, Paste image and File.
  3. Scroll the sheet: compare Create image, Create video, Create file, Web search, Deep research, Run code, Study and learn, Project, Connectors, Skills and Choose style are there.
  4. Close the sheet and compare it closes without adding anything.

## S13.36 Dictation control.

- **Expected:** A microphone control dictates speech into the composer text (without sending) for review.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:2245; apps/mobile/src/features/chat/components/ChatInput.tsx:558 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** New chat > microphone icon in the message box controls (accessibility label "Tap to record, hold for push-to-talk") (labels found in the code)
- **Needs:** a microphone and microphone permission
- **Steps:**
  1. Tap the microphone icon.
  2. Speak a sentence.
  3. Tap the square "Stop recording" control.
  4. Compare: the spoken words appear in the message box and nothing is sent.
  5. Tap "Send message" yourself to send it.

## S13.37 Voice-conversation control.

- **Expected:** A control starts a hands-free voice conversation (speak, hear the reply) from the composer.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:2293; apps/mobile/app/(app)/(tabs)/chat.tsx:1218
- **Where to find it:** New chat > empty message box > round "Start voice mode" button on the right; or long-press the microphone icon (labels found in the code)
- **Needs:** a microphone and microphone permission; voice mode available on the account (not confirmed)
- **Steps:**
  1. Make sure the message box is empty.
  2. Tap the round button with the accessibility label "Start voice mode".
  3. Compare: a hands-free voice conversation opens.
  4. Speak and check that a reply is spoken back.

## S13.38 Queued next prompt.

- **Expected:** While a reply is still generating, the user can type and queue the next message, which sends when the reply finishes.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:2273; apps/mobile/src/features/chat/components/ChatInput.tsx:952; apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** Chat screen > type a message while a reply is still streaming > tap the "Queue message" button beside the stop button (labels found in the code)
- **Needs:** an account that can send a chat message and get a streaming reply
- **Steps:**
  1. Start a chat and send any message so that a reply begins to stream.
  2. While the reply is still streaming, tap the composer and type a second message.
  3. Look for the "Queue message" button next to the stop control (it appears only while a reply streams and the composer has text).
  4. Tap "Queue message". Check that the composer clears and a queued-message chip appears above it, and that the reply keeps streaming.
  5. When the first reply finishes, check that the queued message is sent automatically.

## S13.39 Edit or cancel queued prompt.

- **Expected:** A queued message can be edited or cancelled before it is sent.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:1886
- **Where to find it:** Chat screen > after queuing a message, the queued chip above the composer > pencil icon "Edit queued message" or X icon "Cancel queued message" (labels found in the code)
- **Needs:** an account that can send a chat message and get a streaming reply
- **Steps:**
  1. Queue a message as in S13.38 while a reply is streaming.
  2. Look above the composer for the queued chip that shows the queued message text.
  3. Tap the pencil (Edit queued message) icon: the text goes back into the composer and the chip disappears; check that it is not sent yet.
  4. Queue a new message again, then tap the X (Cancel queued message) icon: check that the chip disappears and the message is not sent when the reply finishes.

## S13.40 Mid-task steering input.

- **Expected:** While an agent is working, the user can send guidance that steers the running task without stopping it.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/RunSteerInput.tsx:26
- **Where to find it:** Chat screen > a managed cloud agent reply that is still running > "Message the agent" under the agent activity, then "Send to the agent" (labels found in the code)
- **Needs:** an account with managed cloud agent access and a cloud agent run that is currently running
- **Steps:**
  1. Start a managed cloud agent task from chat and wait until its run is in the running state.
  2. Under the agent activity shown for that running run, tap "Message the agent".
  3. Type guidance into the box that shows "Add instructions or change course".
  4. Tap "Send to the agent" and check that the note "Sent. The agent reads your message at its next step." appears and the run keeps going without stopping.
  5. Note: a second entry point "Message the agent" exists in the Tasks run detail (apps/mobile/src/features/tasks/components/CloudRunSteerSection.tsx:75), and the tester may use either.
