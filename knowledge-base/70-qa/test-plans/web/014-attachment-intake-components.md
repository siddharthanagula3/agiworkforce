---
id: "PLAN-web-014"
type: "test-plan"
title: "Web · 14. Attachment intake components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "14"
---
# Web · 14. Attachment intake components

27 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S14.01 Device file picker.

- **Expected:** The composer opens the device file chooser and the chosen file is attached to the next message.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:892; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7011; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2301; apps/web/features/chat/pages/WebChatPage.tsx (text found, layout changed); apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/hooks/use-attachments.ts:407; packages/contracts/cloud-contracts/src/chat-attachments.ts:321
- **Earlier check in the running app:** PASS: E034 [PASS; picker, progress, and scoped error]: Picked synthetic browser-qa-reference.txt. Upload progress appeared then explicit subscription error: current plan does not include project knowledge storage. No file was stored. | E049 [PASS; actual upload and filtered result]: Uploaded browser-qa-reference.txt to Library successfully (198 bytes), switched grid to list, searched exact stem and saw only the uploaded file. Project knowledge plan gate is distinct from Library upload. | E051 [PASS; synthetic attachment intake]: Selecting Free Auto by keyboard worked, then direct Add photos & files accepted synthetic text file, displaying name, 198 B and Managed destination. Earlier compatibility alert cleared. Pointer model selection had inconsistent result; not a confirmed persistence bug. | Local Chromium attachment-intake preview [PASS]: the production hook accepted PNG and PDF File objects whose MIME fields were verified blank. The image decoded in the browser and the PDF kept its original display name. The preview used no account or storage backend.
- **Where to find it:** Chat composer > More composer options > Add photos & files (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Open a chat so the message box (composer) is on screen.
  2. Click the button labelled More composer options.
  3. Click Add photos & files and choose a file in the system file chooser.
  4. Look for the file's chip above the message box, then type a message and send it.
  5. Compare with Expected: the chooser opened and the chosen file is attached to the sent message.

## S14.02 Drag-and-drop intake.

- **Expected:** Dropping files onto the chat attaches them to the next message.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3651 (quoted code not found in the file now); apps/web/features/chat/components/Composer/DragDropOverlay.tsx:45; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2301; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** Chat composer > drag a file onto the chat window (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Open a chat.
  2. Drag a file from Finder over the chat window and hold it there.
  3. Look for the overlay with the words Drop files here.
  4. Release the file, then check that its chip appears above the message box.
  5. Compare with Expected: the dropped file is attached and is sent with the next message.

## S14.03 Paste-image intake.

- **Expected:** Pasting an image from the clipboard into the composer attaches it as an image.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5870; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2372; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** Chat composer > paste with Cmd+V into the message box (path not confirmed in the code; trust the screen)
- **Needs:** an image on the clipboard
- **Steps:**
  1. Copy an image to the clipboard (for example with a screenshot tool).
  2. Click in the message box of a chat.
  3. Press Cmd+V.
  4. Look for an image chip with a thumbnail above the message box.
  5. Compare with Expected: the pasted image is attached as an image.

## S14.05 Photo-library selection.

- **Expected:** The user can pick one or more photos from the photo library and attach them.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:147; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:892; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7011; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2301; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** Chat composer > More composer options > Add photos & files (labels found in the code)
- **Needs:** two or more photo files on the Mac
- **Steps:**
  1. Open a chat and click the button labelled More composer options.
  2. Click Add photos & files.
  3. In the system file chooser, select two or more photo files (hold Cmd while clicking).
  4. Look for one chip per photo above the message box.
  5. Compare with Expected: each selected photo is attached.

## S14.06 Screenshot capture.

- **Expected:** A composer control captures the screen and attaches the screenshot to the next message.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1255; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6244; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1429; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1952 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched the chat composer and ComposerPlusMenu.tsx for Screenshot and Capture. The only Capture screen button is in apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:344, which is a feedback dialog, not a composer control.
- **Needs:** a Mac with screen recording permission for the browser

## S14.07 Window capture.

- **Expected:** The user can pick a single application window and attach a capture of it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1255; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6244; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1952 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched features/chat and the composer for window capture controls and found none. Nothing matched Capture window or window picker in the composer.
- **Needs:** a Mac with screen recording permission for the browser

## S14.10 Library-file picker.

- **Expected:** The user can pick a file already in their product Library and attach it to a message.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7094; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:261; apps/web/features/library/components/LibraryView.tsx:217; apps/web/features/chat/pages/WebChatPage.tsx:1541
- **Where to find it:** Chat composer > More composer options > Add from library (labels found in the code)
- **Needs:** at least one file already in Library (upload one from the Library page first)
- **Steps:**
  1. Click the button labelled More composer options in the chat composer.
  2. Click Add from library and wait for the list to load.
  3. Click a file in the list.
  4. Look for that file's chip above the message box.
  5. Compare with Expected: the Library file is attached to the next message.

## S14.11 Repository attachment.

- **Expected:** The user can attach a code repository (e.g. a GitHub repo) as the context for a task.
- **Code:** done. Evidence moved: apps/web/features/code/components/CodeComposer.tsx:687; apps/web/features/code/components/CodeComposer.tsx:718; apps/web/features/code/services/cloud-code-api.ts:363 (quoted code not found in the file now)
- **Where to find it:** Code > Select repository (labels found in the code)
- **Needs:** a connected GitHub account with at least one repository (an outside account)
- **Steps:**
  1. Open the Code surface from the app's navigation (the entry labelled Code).
  2. Click the Select repository control in the task composer.
  3. Choose a repository from the list.
  4. Look for the chosen repository name in the composer.
  5. Compare with Expected: the repository is set as context for the task.

## S14.15 Multiple-file selection.

- **Expected:** One pick action can select several files, and all of them are attached.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7012; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7011; apps/web/features/chat/hooks/use-attachments.ts:524; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** Chat composer > More composer options > Add photos & files (labels found in the code)
- **Needs:** three or more files of any allowed type
- **Steps:**
  1. Open a chat and click More composer options.
  2. Click Add photos & files.
  3. In the system file chooser, select several files in one pick.
  4. Look for a chip for every selected file above the message box.
  5. Compare with Expected: all selected files are attached.

## S14.16 Attachment thumbnail.

- **Expected:** An attached image shows a small visual thumbnail in the composer before sending.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:225; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5769; apps/web/features/chat/hooks/use-attachments.ts:524; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** Chat composer > attached image chip above the message box (path not confirmed in the code; trust the screen)
- **Needs:** an image file
- **Steps:**
  1. Attach a PNG or JPG with Add photos & files.
  2. Look at the chip above the message box before sending.
  3. Compare with Expected: a small square thumbnail of the image is shown.

## S14.17 File-type icon.

- **Expected:** Each non-image attachment shows an icon matching its file type (PDF, spreadsheet, code, other).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:38 (quoted code not found in the file now); apps/web/features/chat/components/Composer/AttachmentPreview.tsx:226 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5769; apps/web/features/chat/hooks/use-attachments.ts:524
- **Earlier check in the running app:** PASS: E051 [PASS; synthetic attachment intake]: Selecting Free Auto by keyboard worked, then direct Add photos & files accepted synthetic text file, displaying name, 198 B and Managed destination. Earlier compatibility alert cleared. Pointer model selection had inconsistent result; not a confirmed persistence bug.
- **Where to find it:** Chat composer > attached PDF or spreadsheet chip (labels found in the code)
- **Needs:** a PDF file and a spreadsheet file (for example .csv or .xlsx)
- **Steps:**
  1. Attach a PDF and a spreadsheet file with Add photos & files.
  2. Look at the icon on each non-image chip above the message box.
  3. Compare with Expected: the PDF and the spreadsheet each show a different icon that matches their type.

## S14.18 Filename and file-size metadata.

- **Expected:** Each attachment shows its file name and size before sending.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:222; apps/web/features/chat/components/Composer/AttachmentPreview.tsx:222
- **Earlier check in the running app:** PASS: E049 [PASS; actual upload and filtered result]: Uploaded browser-qa-reference.txt to Library successfully (198 bytes), switched grid to list, searched exact stem and saw only the uploaded file. Project knowledge plan gate is distinct from Library upload. | E051 [PASS; synthetic attachment intake]: Selecting Free Auto by keyboard worked, then direct Add photos & files accepted synthetic text file, displaying name, 198 B and Managed destination. Earlier compatibility alert cleared. Pointer model selection had inconsistent result; not a confirmed persistence bug.
- **Where to find it:** Chat composer > attached file chip shows name and size (path not confirmed in the code; trust the screen)
- **Needs:** any file
- **Steps:**
  1. Attach any text file with Add photos & files.
  2. Read the file name and size shown on the chip above the message box.
  3. Compare with Expected: the name and size are shown before sending.

## S14.19 Upload progress.

- **Expected:** While a file uploads, its chip shows that the upload is in progress.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:138; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5769; apps/web/features/chat/pages/WebChatPage.tsx:2694; packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts:355
- **Earlier check in the running app:** PASS: E034 [PASS; picker, progress, and scoped error]: Picked synthetic browser-qa-reference.txt. Upload progress appeared then explicit subscription error: current plan does not include project knowledge storage. No file was stored. | E052 [PASS; upload and verified original download]: Composer upload completed and message has file link 2e11068a-2ad0-4968-b460-0181404aa249. Free Auto failed overloaded, so file-content reasoning unverified. Library Download produced original browser-qa-reference.txt; bytes match synthetic source exactly.
- **Where to find it:** Chat composer > attach a file > its chip while uploading (labels found in the code)
- **Needs:** a large enough file to see the upload run, or a throttled network
- **Steps:**
  1. Attach a large file with Add photos & files, so the upload takes a few seconds.
  2. Look at the chip while the bar is moving.
  3. Compare with Expected: the chip shows Uploading… or Preparing… or Verifying… until the upload finishes.

## S14.21 Indexing progress.

- **Expected:** A file added to searchable knowledge shows indexing progress and whether indexing finished or failed.
- **Code:** done. Evidence moved: apps/web/features/projects/components/KnowledgeFilesPanel.tsx:557 (quoted code not found in the file now); apps/web/features/projects/components/KnowledgeFilesPanel.tsx:121; apps/web/features/projects/components/ProjectSettingsDialog.tsx:414
- **Where to find it:** Projects > open a project > Project settings > Files (labels found in the code)
- **Needs:** a paid account whose plan includes project knowledge storage (the earlier Free check showed a plan gate)
- **Steps:**
  1. Click Projects in the sidebar and open a project.
  2. Open Project settings and go to the Files section.
  3. Add a file, then watch its status line under the file name.
  4. Compare with Expected: Indexing for search shows while indexing, then either Keyword search only or Not indexed when it ends, and a failed index offers Retry indexing.

## S14.22 Ready-to-use state.

- **Expected:** The composer makes clear when an attachment is ready and the message can be sent with it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1904 (quoted code not found in the file now); apps/web/features/chat/components/Composer/AttachmentPreview.tsx:147; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5769
- **Earlier check in the running app:** PASS: E049 [PASS; actual upload and filtered result]: Uploaded browser-qa-reference.txt to Library successfully (198 bytes), switched grid to list, searched exact stem and saw only the uploaded file. Project knowledge plan gate is distinct from Library upload. | E051 [PASS; synthetic attachment intake]: Selecting Free Auto by keyboard worked, then direct Add photos & files accepted synthetic text file, displaying name, 198 B and Managed destination. Earlier compatibility alert cleared. Pointer model selection had inconsistent result; not a confirmed persistence bug. | E052 [PASS; upload and verified original download]: Composer upload completed and message has file link 2e11068a-2ad0-4968-b460-0181404aa249. Free Auto failed overloaded, so file-content reasoning unverified. Library Download produced original browser-qa-reference.txt; bytes match synthetic source exactly.
- **Where to find it:** not found in the code. AttachmentPreview.tsx UploadStatus returns nothing for ready or complete, so no ready text was found in the chip. The send button state was not traced.

## S14.23 Partial-extraction notice.

- **Expected:** When only part of a file could be read or it was cut to a size limit, the user is told.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:699; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:769; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4167; apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:969; apps/web/lib/hooks/useChatStream.ts:4705; apps/web/features/chat/components/messages/MessageBubble.tsx:3141
- **Where to find it:** Chat > send a long text file > notice under your message (labels found in the code)
- **Needs:** a long file that exceeds the extraction limit
- **Steps:**
  1. Attach a long text file that is larger than the chat can read in full, using Add photos & files.
  2. Type a short message and send it.
  3. Look under your sent message for the notice.
  4. Compare with Expected: the notice says only part of the file was read.

## S14.24 Unsupported-file notice.

- **Expected:** Adding a file type the chat cannot read shows a notice naming the file and why.
- **Code:** done. Evidence present: apps/web/features/chat/hooks/use-attachments.ts:179; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:953; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4938; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** Chat composer > attach a file the chat cannot read (labels found in the code)
- **Needs:** a file of a type the chat cannot read
- **Steps:**
  1. Attach a file type the chat does not support with Add photos & files.
  2. Read the notice that appears for that file.
  3. Compare with Expected: the notice names the file and says its type is unsupported.

## S14.25 Password-protected-file notice.

- **Expected:** A password-protected file produces a notice that says it is locked and how to fix it.
- **Code:** done. Evidence moved: apps/web/lib/server/pdf-attachment-content.ts:264 (quoted code not found in the file now); apps/web/lib/server/pdf-attachment-content.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:524
- **Where to find it:** Chat composer > attach a password-protected PDF > notice (labels found in the code)
- **Needs:** a password-protected PDF
- **Steps:**
  1. Attach a password-protected PDF with Add photos & files.
  2. Send the message if the notice does not appear on attach.
  3. Read the notice that names the file.
  4. Compare with Expected: the notice says the file is locked and how to fix it.

## S14.26 Upload retry.

- **Expected:** A failed upload offers Retry on that file, which uploads it again.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:162; apps/web/features/chat/pages/WebChatPage.tsx:2866; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5769
- **Where to find it:** Chat composer > failed file chip > Retry (labels found in the code)
- **Needs:** a way to make one upload fail, such as turning off Wi-Fi during the upload
- **Steps:**
  1. Make one upload fail, for example by turning off Wi-Fi during the upload of one file.
  2. Look at the failed chip above the message box.
  3. Click Retry next to Upload failed.
  4. Compare with Expected: the file uploads again and the chip changes away from the failed state.

## S14.27 Upload cancellation.

- **Expected:** While a file is uploading the user can cancel that upload.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:2531; apps/web/features/chat/pages/WebChatPage.tsx:2902; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5774; apps/web/features/chat/components/Composer/AttachmentPreview.tsx:135
- **Where to find it:** Chat composer > a chip while uploading > X button (labels found in the code)
- **Needs:** a file large enough to catch mid-upload
- **Steps:**
  1. Attach a large file with Add photos & files.
  2. While the chip shows Uploading…, click its X button.
  3. Look for the chip to disappear.
  4. Compare with Expected: the upload stops and the file is not attached.

## S14.28 Attachment removal.

- **Expected:** Each attachment can be removed before sending, and a removed file is not sent.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:185 (quoted code not found in the file now); apps/web/features/chat/hooks/use-attachments.ts:531; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5769
- **Where to find it:** Chat composer > each attached chip > X button (labels found in the code)
- **Needs:** two files
- **Steps:**
  1. Attach two files with Add photos & files.
  2. Click the X button on one chip.
  3. Send the message and read the sent message.
  4. Compare with Expected: the removed file is not in the chip row or the sent message.

## S14.31 Duplicate-file treatment.

- **Expected:** Adding the same file twice is detected and handled visibly (skipped, merged or flagged) rather than sent twice silently.
- **Code:** done. Evidence moved: apps/web/features/chat/hooks/use-attachments.ts:258 (quoted code not found in the file now); apps/web/features/chat/hooks/use-attachments.ts:216
- **Where to find it:** Chat composer > add the same file twice with Add photos & files (labels found in the code)
- **Needs:** any file
- **Steps:**
  1. Attach a file with Add photos & files.
  2. Attach the same file again.
  3. Look for a message about the repeat.
  4. Send and check that the file is not sent twice.
  5. Compare with Expected: the repeat is skipped and the message says it is already attached.

## S14.32 Per-file error display.

- **Expected:** When a file fails, the error is shown against that file (name and reason), not as one generic message.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:152; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5769; apps/web/features/chat/hooks/use-attachments.ts:178 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4938
- **Earlier check in the running app:** PASS: E034 [PASS; picker, progress, and scoped error]: Picked synthetic browser-qa-reference.txt. Upload progress appeared then explicit subscription error: current plan does not include project knowledge storage. No file was stored.
- **Where to find it:** Chat composer > a failed file chip (labels found in the code)
- **Needs:** a way to make one upload fail
- **Steps:**
  1. Make one file fail to upload, for example by turning off Wi-Fi during the upload.
  2. Look at the chip for that file above the message box.
  3. Compare with Expected: the chip shows the file name with Upload failed and its reason, not one generic message for all files.

## S14.33 Batch-upload summary.

- **Expected:** After adding several files at once the user sees one summary of what was attached and what was refused.
- **Code:** done. Evidence present: apps/web/features/chat/hooks/use-attachments.ts:238; apps/web/features/chat/hooks/use-attachments.ts:447
- **Where to find it:** Chat composer > add several files at once, including one refused > summary message (labels found in the code)
- **Needs:** several files, with at least one that will be refused (too large or already attached)
- **Steps:**
  1. Add several files at once with Add photos & files, including one that is too large or a duplicate.
  2. Read the message that appears after the add.
  3. Compare with Expected: one summary says how many were attached and lists the refused file with its reason.

## S14.34 File-retention explanation.

- **Expected:** The composer explains whether and how long attached files are kept.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:899
- **Where to find it:** Chat composer > More composer options > hover Add photos & files (labels found in the code)
- **Steps:**
  1. Click the button labelled More composer options.
  2. Hover over Add photos & files and wait about a second.
  3. Read the tooltip that appears.
  4. Compare with Expected: the tooltip says whether files are kept and for how long.

## S14.35 Selected-model compatibility warning.

- **Expected:** If the selected model cannot read an attached file type, the composer warns before sending and offers a fix.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5445; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5425; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Earlier check in the running app:** PASS: E050 [PASS; incompatible model warning]: Add to chat navigated from Library but active text-only model rejected attachment and advised Free Auto. New chat also retained prior QA project selection. File was not attached; retest with compatible model next.
- **Where to find it:** Chat screen > attach a file in the composer > choose a model that cannot read that file type from the model picker > a warning appears above the composer with the buttons "Use Auto" and "Choose a compatible model" (labels found in the code)
- **Needs:** a file to upload, a Free account (the Free wording uses "Use Free Auto" and only the image-capable Free model passes images), a model that cannot read the file type (text-only)
- **Steps:**
  1. Sign in and open a new chat.
  2. Attach a document or image to the composer using the file upload control.
  3. Select a model that cannot read the attached file type from the model picker.
  4. Look for the warning above the composer that starts "The selected model can't read the attached ..." and check that it appears before you press send and that it offers "Use Auto" or "Choose a compatible model".

## S14.36 Alternative processing-path explanation.

- **Expected:** When a file cannot go the normal way, the user is told the alternative (switch model or mode, convert, or what is sent instead).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5343; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5443; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5318
- **Where to find it:** Chat screen > attach a file in the composer > choose a model that cannot read that file type > read the warning above the composer for the alternatives: "Use Auto", "Choose a compatible model" or "Remove attachments"; for a local model, the warning offers "Switch to a cloud model" (labels found in the code)
- **Needs:** a file to upload, a model that cannot read the file type (text-only)
- **Steps:**
  1. Sign in and open a new chat.
  2. Attach an image or a document while a model that cannot read it is selected.
  3. Read the warning above the composer and note the alternatives it gives (switch to Auto, choose a compatible model, or remove the file).
  4. Press "Choose a compatible model" and check that the list shows models that can read the file, or the text "No model on your plan can read this attachment." appears.
