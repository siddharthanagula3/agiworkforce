---
id: "PLAN-mobile-014"
type: "test-plan"
title: "Mobile · 14. Attachment intake components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "14"
---
# Mobile · 14. Attachment intake components

21 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S14.01 Device file picker.

- **Expected:** The composer opens the device file chooser and the chosen file is attached to the next message.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:722; apps/mobile/app/(app)/(tabs)/chat.tsx:1029; apps/mobile/app/(app)/(tabs)/chat.tsx:1426; apps/mobile/src/features/chat/components/ChatInput.tsx:247 (quoted code not found in the file now); apps/mobile/src/features/chat/utils/runComposerAttachmentPick.ts:19
- **Where to find it:** Chat screen > Add to chat (+) > File (AGI Cloud mode only) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and a file on the phone
- **Steps:**
  1. On the Chat screen, switch the mode toggle to AGI Cloud.
  2. Tap the + button labelled Add to chat at the left of the message box.
  3. Tap the File card in the sheet titled Add to Chat.
  4. In the phone's file chooser, pick a PDF or text file.
  5. Look at the composer: the file should appear as a chip, and after sending the message the file should be attached to it.

## S14.04 Camera capture.

- **Expected:** The composer offers a camera control that takes a photo and attaches it.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:697; apps/mobile/app/(app)/(tabs)/chat.tsx:949; apps/mobile/app/(app)/(tabs)/chat.tsx:1426; apps/mobile/src/features/chat/components/ChatInput.tsx:247 (quoted code not found in the file now)
- **Where to find it:** Chat screen > Add to chat (+) > Camera (labels found in the code)
- **Needs:** a phone with a camera; an account that has the camera capability (the Camera card is hidden otherwise)
- **Steps:**
  1. On the Chat screen, tap the + button labelled Add to chat.
  2. Tap the Camera card in the sheet titled Add to Chat.
  3. If asked, allow camera access; take a photo with the camera screen.
  4. Look at the composer: the photo should appear as a thumbnail chip, ready to send.

## S14.05 Photo-library selection.

- **Expected:** The user can pick one or more photos from the photo library and attach them.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:705; apps/mobile/app/(app)/(tabs)/chat.tsx:1003; apps/mobile/app/(app)/(tabs)/chat.tsx:1426; apps/mobile/src/features/chat/components/ChatInput.tsx:247 (quoted code not found in the file now)
- **Where to find it:** Chat screen > Add to chat (+) > Photos (labels found in the code)
- **Needs:** a phone with at least one photo in the library
- **Steps:**
  1. On the Chat screen, tap the + button labelled Add to chat.
  2. Tap the Photos card in the sheet titled Add to Chat.
  3. In the photo library, tap one photo, then confirm the picker.
  4. Look at the composer: the chosen photo should appear as a thumbnail chip.

## S14.10 Library-file picker.

- **Expected:** The user can pick a file already in their product Library and attach it to a message.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:212 (quoted code not found in the file now); apps/mobile/src/features/chat/components/AddToChatSheet.tsx:420; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:111 (quoted code not found in the file now)
- **Where to find it:** Chat screen > Add to chat (+) > Attach from Library (tap a file row) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with at least one image or file already in its Library
- **Steps:**
  1. On the Chat screen, switch the mode to AGI Cloud.
  2. Tap the + button labelled Add to chat.
  3. Look for the Attach from Library section in the sheet and tap a file row (its label reads Attach <file name> from Library).
  4. Look at the composer: the Library file should appear as an attachment chip.

## S14.15 Multiple-file selection.

- **Expected:** One pick action can select several files, and all of them are attached.
- **Code:** done. Evidence present: apps/mobile/app/(app)/(tabs)/chat.tsx:1037; apps/mobile/app/(app)/chat/[id].tsx:1609
- **Where to find it:** Chat screen > Add to chat (+) > Photos (select several); AGI Cloud mode > Add to chat (+) > File (select several) (labels found in the code)
- **Needs:** several photos on the phone, and for the File part an AGI Cloud account and several files
- **Steps:**
  1. Tap the + button labelled Add to chat, then tap Photos.
  2. In the photo picker, tap two or more photos, then confirm.
  3. Look at the composer: every chosen photo should appear as its own chip.
  4. Repeat with AGI Cloud mode and File, choosing several files, and check that each one is attached.

## S14.16 Attachment thumbnail.

- **Expected:** An attached image shows a small visual thumbnail in the composer before sending.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AttachmentPreview.tsx:101 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ChatInput.tsx:1665; apps/mobile/src/features/chat/components/ChatInput.tsx:247 (quoted code not found in the file now)
- **Where to find it:** Chat screen > Add to chat (+) > Photos (labels found in the code)
- **Needs:** a phone with a photo in the library
- **Steps:**
  1. Tap the + button labelled Add to chat, then tap Photos.
  2. Pick one photo and confirm.
  3. Look at the message box area: the photo should show as a square picture (about 72 by 72) before sending.

## S14.17 File-type icon.

- **Expected:** Each non-image attachment shows an icon matching its file type (PDF, spreadsheet, code, other).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AttachmentPreview.tsx:85 (quoted code not found in the file now); apps/mobile/src/features/chat/components/AttachmentPreview.tsx:313
- **Where to find it:** Chat screen > Add to chat (+) > File (AGI Cloud mode) (labels found in the code)
- **Needs:** an AGI Cloud account and one PDF, one spreadsheet and one code file
- **Steps:**
  1. Switch to AGI Cloud, tap Add to chat (+), then tap the File card.
  2. Pick a PDF, then a spreadsheet (for example .csv or .xlsx), then a code file (for example .py).
  3. Look at each chip: under the file name it should show the kind word: PDF, Spreadsheet or Code.

## S14.18 Filename and file-size metadata.

- **Expected:** Each attachment shows its file name and size before sending.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AttachmentPreview.tsx:187 (quoted code not found in the file now); apps/mobile/src/features/chat/components/AttachmentPreview.tsx:240 (quoted code not found in the file now)
- **Where to find it:** Chat screen > Add to chat (+) > File (AGI Cloud mode) (labels found in the code)
- **Needs:** an AGI Cloud account and a non-image file
- **Steps:**
  1. Switch to AGI Cloud, tap Add to chat (+), then tap File.
  2. Pick a non-image file such as a PDF.
  3. Look at the chip: it should show the file name and, under it, the kind and size (for example PDF and a size in KB or MB).

## S14.19 Upload progress.

- **Expected:** While a file uploads, its chip shows that the upload is in progress.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AttachmentPreview.tsx:332; apps/mobile/src/features/chat/upload/uploadAttachment.ts:59; apps/mobile/src/features/chat/components/ChatInput.tsx:1665
- **Where to find it:** Chat screen > AGI Cloud mode > Add to chat (+) > File (labels found in the code)
- **Needs:** an AGI Cloud account and a large file
- **Steps:**
  1. Switch to AGI Cloud, tap Add to chat (+), then tap File.
  2. Pick a large file (several megabytes) so the upload lasts a few seconds.
  3. While it uploads, look at the bottom edge of the chip: a thin progress bar fills up.
  4. Compare with Expected: the chip shows progress while the upload runs. The percentage (Uploading NN%) is only in the screen-reader label, not printed on the chip.

## S14.22 Ready-to-use state.

- **Expected:** The composer makes clear when an attachment is ready and the message can be sent with it.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AttachmentPreview.tsx:332; apps/mobile/src/features/chat/components/ChatInput.tsx:874; apps/mobile/src/features/chat/components/ChatInput.tsx:1665
- **Where to find it:** Chat screen > AGI Cloud mode > Add to chat (+) > Photos or File, then wait for the upload (labels found in the code)
- **Needs:** an AGI Cloud account
- **Steps:**
  1. Switch to AGI Cloud, tap Add to chat (+), then pick a photo under Photos.
  2. Watch the chip while it uploads (progress bar).
  3. When the bar disappears, check the chip has no Retry or Cancel overlay and the Send button is not held.
  4. Compare with Expected: the code shows no visible Ready or Uploaded word, so judge whether the chip alone makes ready clear.

## S14.23 Partial-extraction notice.

- **Expected:** When only part of a file could be read or it was cut to a size limit, the user is told.
- **Code:** done. Evidence present: apps/mobile/services/streaming.ts:83
- **Where to find it:** Chat screen > AGI Cloud mode > Add to chat (+) > File, then send; read the line under your sent message (labels found in the code)
- **Needs:** an AGI Cloud account and a long document
- **Steps:**
  1. Switch to AGI Cloud, tap Add to chat (+), then tap File.
  2. Pick a long text or document file that is larger than the readable limit.
  3. Type a short question and send.
  4. Look under your sent message: a grey line should say Only part of <file name> was read because it is too long to read in full.

## S14.24 Unsupported-file notice.

- **Expected:** Adding a file type the chat cannot read shows a notice naming the file and why.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/utils/attachmentValidation.ts:61 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ChatInput.tsx:247 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ChatInput.tsx:235
- **Where to find it:** Chat screen > AGI Cloud mode > Add to chat (+) > File (labels found in the code)
- **Needs:** an AGI Cloud account and a file the chat refuses
- **Steps:**
  1. Switch to AGI Cloud, tap Add to chat (+), then tap File.
  2. Pick a file type the chat cannot read (for example an executable or an unsupported archive, if the chooser lets you pick it).
  3. Look for the alert titled Attachment not added: it should name the file and say it is not a supported file type.

## S14.25 Password-protected-file notice.

- **Expected:** A password-protected file produces a notice that says it is locked and how to fix it.
- **Code:** done. Evidence moved: apps/mobile/services/attachmentContext.ts:27 (quoted code not found in the file now)
- **Where to find it:** not found in the code. The notice text is written only into the input sent to the model (apps/mobile/services/attachmentContext.ts:45), so no app-drawn notice was found; the File card that could attach a PDF is shown only in AGI Cloud mode (AddToChatSheet.tsx:720), where the password check runs on the server, which is not in this app's code. Searched apps/mobile for ENCRYPTED_PDF and password protected.
- **Needs:** a password-protected PDF

## S14.26 Upload retry.

- **Expected:** A failed upload offers Retry on that file, which uploads it again.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AttachmentPreview.tsx:393; apps/mobile/src/features/chat/components/ChatInput.tsx:1333; apps/mobile/src/features/chat/components/ChatInput.tsx:1665
- **Where to find it:** Chat screen > AGI Cloud mode > Add to chat (+) > Photos (upload fails), then tap Retry on the chip (labels found in the code)
- **Needs:** an AGI Cloud account and a way to switch the network off and on
- **Steps:**
  1. Switch to AGI Cloud, turn Wi-Fi and mobile data off, then tap Add to chat (+) and pick a photo.
  2. Wait until the chip shows a failed state with a Retry overlay.
  3. Turn the network back on and tap Retry on the chip.
  4. Look at the chip: the upload should start again and the Retry overlay should go away when it finishes.

## S14.27 Upload cancellation.

- **Expected:** While a file is uploading the user can cancel that upload.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AttachmentPreview.tsx:192; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:476; apps/mobile/src/features/chat/upload/uploadAttachment.ts:59
- **Where to find it:** Chat screen > AGI Cloud mode > Add to chat (+) > File, then tap the small X on the uploading chip (labels found in the code)
- **Needs:** an AGI Cloud account and a large file
- **Steps:**
  1. Switch to AGI Cloud, tap Add to chat (+), then tap File and pick a large file.
  2. While the progress bar is moving, tap the small X on the chip's corner (screen reader label: Cancel upload of <file name>).
  3. Look at the chip: it should disappear and the upload should stop.

## S14.28 Attachment removal.

- **Expected:** Each attachment can be removed before sending, and a removed file is not sent.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AttachmentPreview.tsx:187; apps/mobile/src/features/chat/components/ChatInput.tsx (text found, layout changed); apps/mobile/src/features/chat/components/ChatInput.tsx:1665
- **Where to find it:** Chat screen > Add to chat (+) > Photos, then tap the small X on the chip (labels found in the code)
- **Needs:** a phone with at least two photos
- **Steps:**
  1. Tap Add to chat (+), then tap Photos and pick two photos.
  2. Tap the small X at the top corner of one chip (screen reader label: Remove <file name>).
  3. Look at the composer: that chip should disappear.
  4. Send the message and check the sent message shows only the other photo.

## S14.31 Duplicate-file treatment.

- **Expected:** Adding the same file twice is detected and handled visibly (skipped, merged or flagged) rather than sent twice silently.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:657
- **Where to find it:** Chat screen > Add to chat (+) > Photos (pick the same photo twice) (labels found in the code)
- **Needs:** a phone with a photo in the library
- **Steps:**
  1. Tap Add to chat (+), then tap Photos and pick one photo.
  2. Open Add to chat (+) again, tap Photos, and pick the same photo again.
  3. Look for an alert titled Already attached that names the file and says Each file is attached once.
  4. Check the composer shows the photo only once.

## S14.32 Per-file error display.

- **Expected:** When a file fails, the error is shown against that file (name and reason), not as one generic message.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:235; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:392; apps/mobile/src/features/chat/components/ChatInput.tsx:247 (quoted code not found in the file now)
- **Where to find it:** Chat screen > AGI Cloud mode > Add to chat (+) > File (pick several files, one refused) (labels found in the code)
- **Needs:** an AGI Cloud account and one file the chat refuses
- **Steps:**
  1. Switch to AGI Cloud, tap Add to chat (+), then tap File.
  2. Pick one acceptable file and one refused file together.
  3. Look for the alert Attachment not added: it should name the refused file in quotes and give the reason.
  4. Check that the accepted file still appears as a chip.

## S14.33 Batch-upload summary.

- **Expected:** After adding several files at once the user sees one summary of what was attached and what was refused.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:235; apps/mobile/src/features/chat/components/ChatInput.tsx:247 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:1003
- **Where to find it:** Chat screen > AGI Cloud mode > Add to chat (+) > File (pick three or more files, one refused) (labels found in the code)
- **Needs:** an AGI Cloud account and three files, one refused
- **Steps:**
  1. Switch to AGI Cloud, tap Add to chat (+), then tap File.
  2. Pick three files, with at least one the chat refuses.
  3. Look for one alert titled Some attachments not added that lists each refused file with its reason.
  4. Check that the accepted files appear as chips in the composer.

## S14.34 File-retention explanation.

- **Expected:** The composer explains whether and how long attached files are kept.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:461 (quoted code not found in the file now)
- **Where to find it:** Chat screen > Add to chat (+) (read the caption under the Add to Chat title) (labels found in the code)
- **Needs:** an AGI Cloud account; a temporary chat for the second check
- **Steps:**
  1. Tap Add to chat (+) with AGI Cloud mode on.
  2. Read the grey line under the Add to Chat title: it should say Uploaded to AGI Cloud and kept in your Library until you delete them.
  3. Open a temporary chat and tap Add to chat (+) again; the line should say Kept out of your Library and deleted with this temporary chat.
  4. Compare with Expected: whether and how long files are kept.

## S14.36 Alternative processing-path explanation.

- **Expected:** When a file cannot go the normal way, the user is told the alternative (switch model or mode, convert, or what is sent instead).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/utils/attachmentValidation.ts:47 (quoted code not found in the file now); apps/mobile/src/features/chat/utils/attachmentValidation.ts:55 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ChatInput.tsx:247 (quoted code not found in the file now)
- **Where to find it:** Chat screen > AGI Cloud mode > Add to chat (+) > Photos (pick a HEIC photo) (labels found in the code)
- **Needs:** an AGI Cloud account and a HEIC photo on the phone
- **Steps:**
  1. Switch to AGI Cloud, tap Add to chat (+), then tap Photos.
  2. Pick a HEIC photo from the library.
  3. Look for the alert Attachment not added: it should say AGI Cloud cannot read the HEIC photo and to retake it with the in-app camera.
  4. Compare with Expected: the alert names the alternative (retake with the camera).
