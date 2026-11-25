---
id: "PLAN-desktop-014"
type: "test-plan"
title: "Desktop · 14. Attachment intake components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "14"
---
# Desktop · 14. Attachment intake components

27 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S14.01 Device file picker.

- **Expected:** The composer opens the device file chooser and the chosen file is attached to the next message.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:892; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7011; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2301; apps/web/features/chat/pages/WebChatPage.tsx (text found, layout changed); apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/hooks/use-attachments.ts:407; packages/contracts/cloud-contracts/src/chat-attachments.ts:321
- **Where to find it:** More composer options (+ button in the message box) > Add photos & files (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Sign in and open a new chat.
  2. Click the + button labelled More composer options next to the message box.
  3. Click Add photos & files and choose a file in the device file chooser.
  4. Look for the file chip above the message box; then send a short message and check the file is listed on your message.

## S14.02 Drag-and-drop intake.

- **Expected:** Dropping files onto the chat attaches them to the next message.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3651 (quoted code not found in the file now); apps/web/features/chat/components/Composer/DragDropOverlay.tsx:45; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2301; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** Drag a file from Finder onto the chat window (overlay reads Drop files here) (labels found in the code)
- **Needs:** a file to drag from Finder
- **Steps:**
  1. Open a chat and keep it visible.
  2. Drag a file from Finder over the chat area.
  3. Wait for the overlay to appear with the words Drop files here, then release the file.
  4. Check that a file chip appears above the message box and that it is sent with the next message.

## S14.03 Paste-image intake.

- **Expected:** Pasting an image from the clipboard into the composer attaches it as an image.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5870; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2372; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** Message box in the chat composer, then Command+V after copying an image (path not confirmed in the code; trust the screen)
- **Needs:** an image on the clipboard
- **Steps:**
  1. Copy an image (for example a screenshot) to the clipboard.
  2. Click in the message box of a chat.
  3. Press Command+V.
  4. Check that an image thumbnail appears above the message box and that it is sent with the next message.

## S14.05 Photo-library selection.

- **Expected:** The user can pick one or more photos from the photo library and attach them.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:147; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:892; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7011; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2301; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** More composer options > Add photos & files (labels found in the code)
- **Needs:** two or more photos
- **Steps:**
  1. Click the + button labelled More composer options.
  2. Click Add photos & files.
  3. In the file chooser, pick two or more photos (use Command+click) and confirm.
  4. Check that every photo appears as a thumbnail above the message box.

## S14.06 Screenshot capture.

- **Expected:** A composer control captures the screen and attaches the screenshot to the next message.
- **Code:** done. Evidence moved: apps/desktop/electron/main.ts:851; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:857 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4461 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1827 (quoted code not found in the file now)
- **Where to find it:** Desktop menu File > Screenshot to Chat (or its keyboard shortcut) (labels found in the code)
- **Needs:** the Electron desktop app and Screen Recording permission for the app on macOS
- **Steps:**
  1. In the Electron desktop app, open the File menu.
  2. Click Screenshot to Chat, or press the screenshot shortcut.
  3. Wait for the capture to finish, then look at the chat composer for a new image thumbnail.
  4. Send the message and check the screenshot is attached to it.

## S14.07 Window capture.

- **Expected:** The user can pick a single application window and attach a capture of it.
- **Code:** done. Evidence moved: apps/desktop/electron/main.ts:851; apps/desktop/electron/main.ts:862; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:857 (quoted code not found in the file now)
- **Where to find it:** Keyboard shortcut Window to Chat (no menu item) (labels found in the code)
- **Needs:** the Electron desktop app, Screen Recording permission, and a second app window in front
- **Steps:**
  1. Open another app window and bring it to the front, with the desktop app behind it.
  2. Press the Window to Chat shortcut.
  3. Wait for the notice and then look for a new image thumbnail in the chat composer.
  4. Send the message and check the window capture is attached.

## S14.10 Library-file picker.

- **Expected:** The user can pick a file already in their product Library and attach it to a message.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7094; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:261; apps/web/features/library/components/LibraryView.tsx:217; apps/web/features/chat/pages/WebChatPage.tsx:1541
- **Where to find it:** More composer options > Add from library (labels found in the code)
- **Needs:** a file already in the Library
- **Steps:**
  1. Make sure the Library holds at least one file (Library in the sidebar).
  2. Click the + button labelled More composer options.
  3. Click Add from library and choose a file from the list.
  4. Check that the file chip appears above the message box and is sent with the next message.

## S14.11 Repository attachment.

- **Expected:** The user can attach a code repository (e.g. a GitHub repo) as the context for a task.
- **Code:** done. Evidence moved: apps/web/features/code/components/CodeComposer.tsx:687; apps/web/features/code/components/CodeComposer.tsx:718; apps/web/features/code/services/cloud-code-api.ts:363 (quoted code not found in the file now)
- **Where to find it:** Code page > Select repository (repository chip in the code composer) (labels found in the code)
- **Needs:** a connected code account with at least one repository (not checked)
- **Steps:**
  1. Open the Code page of the app.
  2. Click the Select repository chip.
  3. Pick a repository from the list that opens.
  4. Check that the chosen repository is shown as the context for the task.

## S14.15 Multiple-file selection.

- **Expected:** One pick action can select several files, and all of them are attached.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7012; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7011; apps/web/features/chat/hooks/use-attachments.ts:524; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** More composer options > Add photos & files (labels found in the code)
- **Needs:** several files
- **Steps:**
  1. Click the + button labelled More composer options.
  2. Click Add photos & files.
  3. In the file chooser select several files at once and confirm.
  4. Check that all of them appear as chips or thumbnails above the message box.

## S14.16 Attachment thumbnail.

- **Expected:** An attached image shows a small visual thumbnail in the composer before sending.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:225; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5769; apps/web/features/chat/hooks/use-attachments.ts:524; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** More composer options > Add photos & files (choose an image) (labels found in the code)
- **Needs:** an image file
- **Steps:**
  1. Click the + button labelled More composer options.
  2. Click Add photos & files and choose an image file.
  3. Look above the message box for a small square thumbnail of the image.

## S14.17 File-type icon.

- **Expected:** Each non-image attachment shows an icon matching its file type (PDF, spreadsheet, code, other).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:38 (quoted code not found in the file now); apps/web/features/chat/components/Composer/AttachmentPreview.tsx:226 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5769; apps/web/features/chat/hooks/use-attachments.ts:524
- **Where to find it:** More composer options > Add photos & files (choose a PDF, spreadsheet, code or other file) (labels found in the code)
- **Needs:** a PDF, a spreadsheet and a code file
- **Steps:**
  1. Click the + button labelled More composer options.
  2. Click Add photos & files and choose a PDF, a spreadsheet and a code file.
  3. Compare the icon on each chip with the file type.

## S14.18 Filename and file-size metadata.

- **Expected:** Each attachment shows its file name and size before sending.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:222; apps/web/features/chat/components/Composer/AttachmentPreview.tsx:222
- **Where to find it:** More composer options > Add photos & files (labels found in the code)
- **Needs:** any file
- **Steps:**
  1. Click the + button labelled More composer options.
  2. Click Add photos & files and choose any file.
  3. Look at the chip above the message box for the file name and its size (for example KB or MB).

## S14.19 Upload progress.

- **Expected:** While a file uploads, its chip shows that the upload is in progress.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:138; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5769; apps/web/features/chat/pages/WebChatPage.tsx:2694
- **Where to find it:** More composer options > Add photos & files (choose a large file) (labels found in the code)
- **Needs:** a large file, and a slow connection helps the status stay visible
- **Steps:**
  1. Click the + button labelled More composer options.
  2. Click Add photos & files and choose a large file.
  3. Watch the chip: it should show Preparing, Uploading or Verifying text under the file name while the upload runs.

## S14.21 Indexing progress.

- **Expected:** A file added to searchable knowledge shows indexing progress and whether indexing finished or failed.
- **Code:** done. Evidence moved: apps/web/features/projects/components/KnowledgeFilesPanel.tsx:557 (quoted code not found in the file now); apps/web/features/projects/components/KnowledgeFilesPanel.tsx:121; apps/web/features/projects/components/ProjectSettingsDialog.tsx:414
- **Where to find it:** Projects > open a project > project settings > Files (Indexing for search status on each file) (labels found in the code)
- **Needs:** a project you own
- **Steps:**
  1. Open Projects in the sidebar and open a project.
  2. Open the project's settings and find the Files section.
  3. Upload a file with the Upload button.
  4. Watch the status next to the file: Indexing for search while it runs, then Keyword search only or Not indexed when it finishes.

## S14.22 Ready-to-use state.

- **Expected:** The composer makes clear when an attachment is ready and the message can be sent with it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1904 (quoted code not found in the file now); apps/web/features/chat/components/Composer/AttachmentPreview.tsx:147; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5769
- **Where to find it:** no screen of its own. Code hides the progress line when a chip is ready, and no Ready word is shown; the tester can only see the absence of progress text.
- **Needs:** any file
- **Steps:**
  1. Attach a file with Add photos & files.
  2. Wait until the chip stops showing Uploading or Preparing text.
  3. Check that the Send button is enabled and sends the message with the file.

## S14.23 Partial-extraction notice.

- **Expected:** When only part of a file could be read or it was cut to a size limit, the user is told.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:699; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:769; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4167; apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:969; apps/web/lib/hooks/useChatStream.ts:4705; apps/web/features/chat/components/messages/MessageBubble.tsx:3141
- **Where to find it:** Under your sent message (notice reads Only part of NAME was read because it is too long to read in full.) (labels found in the code)
- **Needs:** a long file (text or PDF)
- **Steps:**
  1. Attach a long text or PDF file with Add photos & files.
  2. Send the message.
  3. Look under your own message bubble for the notice that starts with Only part of.
  4. Compare with Expected: the notice names the file.

## S14.24 Unsupported-file notice.

- **Expected:** Adding a file type the chat cannot read shows a notice naming the file and why.
- **Code:** done. Evidence present: apps/web/features/chat/hooks/use-attachments.ts:179; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:953; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4938; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** More composer options > Add photos & files (choose a file type the chat cannot read) (labels found in the code)
- **Needs:** a file the chat cannot read (for example an unusual binary type)
- **Steps:**
  1. Click the + button labelled More composer options.
  2. Click Add photos & files and choose a file of an unsupported type.
  3. Look for the notice that names the file and says it has an unsupported file type.

## S14.25 Password-protected-file notice.

- **Expected:** A password-protected file produces a notice that says it is locked and how to fix it.
- **Code:** done. Evidence moved: apps/web/lib/server/pdf-attachment-content.ts:264 (quoted code not found in the file now); apps/web/lib/server/pdf-attachment-content.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:524
- **Where to find it:** More composer options > Add photos & files (choose a password-protected PDF), then send (labels found in the code)
- **Needs:** a password-protected PDF
- **Steps:**
  1. Click the + button labelled More composer options.
  2. Click Add photos & files and choose a PDF that has a password.
  3. Send the message and read the reply area.
  4. Check for the notice that says the file is password protected and to remove the password and upload it again.

## S14.26 Upload retry.

- **Expected:** A failed upload offers Retry on that file, which uploads it again.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:162; apps/web/features/chat/pages/WebChatPage.tsx:2866; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5769
- **Where to find it:** Attachment chip under the message box (Retry on a failed upload) (labels found in the code)
- **Needs:** a way to make an upload fail (for example turning Wi-Fi off)
- **Steps:**
  1. Click the + button labelled More composer options, then Add photos & files and choose a file.
  2. Make the upload fail, for example by turning Wi-Fi off straight after choosing the file.
  3. Look at the chip for Upload failed and a Retry button under the file name.
  4. Turn Wi-Fi back on, click Retry, and check the upload runs again.

## S14.27 Upload cancellation.

- **Expected:** While a file is uploading the user can cancel that upload.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:2531; apps/web/features/chat/pages/WebChatPage.tsx:2902; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5774; apps/web/features/chat/components/Composer/AttachmentPreview.tsx:135
- **Where to find it:** Attachment chip under the message box, the X button while Uploading shows (labels found in the code)
- **Needs:** a large file so the upload lasts long enough to cancel
- **Steps:**
  1. Click the + button labelled More composer options, then Add photos & files and choose a large file.
  2. While the chip shows Uploading, click the X button on that chip.
  3. Check that the upload stops and the chip is removed.
  4. Send a message and check the cancelled file is not sent.

## S14.28 Attachment removal.

- **Expected:** Each attachment can be removed before sending, and a removed file is not sent.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:185 (quoted code not found in the file now); apps/web/features/chat/hooks/use-attachments.ts:531; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5769
- **Where to find it:** Attachment chip under the message box, the X button (Remove NAME) (labels found in the code)
- **Needs:** two or more files
- **Steps:**
  1. Attach two or more files with Add photos & files.
  2. Click the X button on one chip.
  3. Check that only that chip disappears.
  4. Send the message and check the removed file is not in the sent message.

## S14.31 Duplicate-file treatment.

- **Expected:** Adding the same file twice is detected and handled visibly (skipped, merged or flagged) rather than sent twice silently.
- **Code:** done. Evidence moved: apps/web/features/chat/hooks/use-attachments.ts:258 (quoted code not found in the file now); apps/web/features/chat/hooks/use-attachments.ts:216
- **Where to find it:** More composer options > Add photos & files (choose the same file twice) (labels found in the code)
- **Needs:** one file
- **Steps:**
  1. Attach a file with Add photos & files.
  2. Attach the same file again with Add photos & files.
  3. Look for the notice that says the file is already attached.
  4. Check the file is listed only once when you send.

## S14.32 Per-file error display.

- **Expected:** When a file fails, the error is shown against that file (name and reason), not as one generic message.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:152; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5769; apps/web/features/chat/hooks/use-attachments.ts:178 (quoted code not found in the file now)
- **Where to find it:** Attachment chip under the message box (error text under the failed file) (labels found in the code)
- **Needs:** a file that fails (for example an image larger than the image limit)
- **Steps:**
  1. Attach a file that will fail, for example an image over the image size limit or a file that cannot be uploaded.
  2. Look at the failed chip for the error text under its file name.
  3. Hover the error text to see its full reason in the tooltip.
  4. Check that the error names that file, not a general message.

## S14.33 Batch-upload summary.

- **Expected:** After adding several files at once the user sees one summary of what was attached and what was refused.
- **Code:** done. Evidence present: apps/web/features/chat/hooks/use-attachments.ts:238; apps/web/features/chat/hooks/use-attachments.ts:447
- **Where to find it:** More composer options > Add photos & files (choose several files, with one that is refused) (labels found in the code)
- **Needs:** several files, including one that will be refused
- **Steps:**
  1. Click the + button labelled More composer options.
  2. Click Add photos & files and select several files, including one that will be refused (for example a duplicate or an unsupported file).
  3. Read the single notice that follows.
  4. Check that it says how many files were attached and lists the refused files.

## S14.34 File-retention explanation.

- **Expected:** The composer explains whether and how long attached files are kept.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:899
- **Where to find it:** More composer options > hover Add photos & files (tooltip) (labels found in the code)
- **Steps:**
  1. Click the + button labelled More composer options.
  2. Hover the mouse over the Add photos & files row and wait for the tooltip.
  3. Read the tooltip for whether files are kept and for how long.
  4. Open a temporary chat and repeat, then compare with the text that says files are deleted with the temporary chat.

## S14.35 Selected-model compatibility warning.

- **Expected:** If the selected model cannot read an attached file type, the composer warns before sending and offers a fix.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5445; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5425; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** New chat screen > attach a document or image with the attach control in the composer > choose a model that cannot read that file type from the model picker > the alert appears above the text box, with the buttons "Use Auto", "Remove attachments" and "Choose a compatible model" (labels found in the code)
- **Needs:** a Free account or a paid account, a file to upload (PDF for document, PNG or JPG for image), a model that cannot read that file type
- **Steps:**
  1. Sign in and open a new chat.
  2. Attach a PDF or other document with the attach control in the composer (the menu label was not verified in code).
  3. Select a model that cannot read documents or images (the model picker location was not verified in code).
  4. Look above the text box for the warning that starts "The selected model can't read the attached document." (or "image" for pictures).
  5. Check that the "Use Auto" button is present and that clicking "Choose a compatible model" lists models that can read the file, compared with Expected.

## S14.36 Alternative processing-path explanation.

- **Expected:** When a file cannot go the normal way, the user is told the alternative (switch model or mode, convert, or what is sent instead).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5343; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5318; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** New chat screen > select a local model (on-device) from the model picker > attach a file in the composer > the alert appears above the text box with "Switch to a cloud model" and "Remove attachment" (labels found in the code)
- **Needs:** a local model available on the device (desktop app), a file to upload
- **Steps:**
  1. Sign in and open a new chat.
  2. Select a local model that runs on this device (the picker location was not verified in code).
  3. Attach any file with the attach control in the composer.
  4. Look for the alert that says "Local models on this device cannot read attachments." with the text "Switch to a cloud model or remove the attachment."
  5. Compare with Expected: the alert names the alternative (switch to a cloud model) and the removal option, and the message is not sent through the local model.
