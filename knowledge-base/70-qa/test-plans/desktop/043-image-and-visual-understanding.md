---
id: "PLAN-desktop-043"
type: "test-plan"
title: "Desktop · 43. Image and visual understanding"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "43"
---
# Desktop · 43. Image and visual understanding

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S43.01 Single-image questions.

- **Expected:** User attaches one image and asks a question about it; the image reaches a vision-capable model with the question.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** New chat > round + button beside the message box > Add photos & files (labels found in the code)
- **Needs:** an image file to upload; a Free account must use a model that accepts images
- **Steps:**
  1. Sign in and open a new chat.
  2. Click the round + button beside the message box (it has no visible words).
  3. Click Add photos & files and choose one image.
  4. Type "What is in this picture?" and send.
  5. Compare: the answer describes what the image shows.

## S43.02 Multiple-image comparison.

- **Expected:** User attaches two or more images to one message and the model receives all of them to compare.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** New chat > round + button beside the message box > Add photos & files (labels found in the code)
- **Needs:** two image files to upload
- **Steps:**
  1. Open a new chat and click the round + button beside the message box.
  2. Click Add photos & files and select two images at once.
  3. Type "What is different between these two pictures?" and send.
  4. Compare: the answer refers to both images.

## S43.03 Screenshot interpretation.

- **Expected:** User shares a screenshot (captured or pasted) and the model explains what it shows.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** File > Screenshot to Chat (desktop app), then the message box (labels found in the code)
- **Needs:** the desktop app; macOS may ask for screen recording permission (unknown)
- **Steps:**
  1. Open the desktop app and go to a chat.
  2. Choose File > Screenshot to Chat and capture the screen as the app asks.
  3. If the image does not appear in the message box, click the box and press Command-V.
  4. Type "What does this screenshot show?" and send.
  5. Compare: the answer explains the screenshot.

## S43.04 Document-image interpretation.

- **Expected:** User attaches a photo or scan of a document (incl. a scanned PDF) and the model reads and explains it.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** New chat > round + button beside the message box > Add photos & files (labels found in the code)
- **Needs:** a photo or scan of a document, or a PDF
- **Steps:**
  1. Open a new chat and click the round + button beside the message box.
  2. Click Add photos & files and choose a photo of a paper document or a scanned PDF.
  3. Type "Read this document and explain it." and send.
  4. Compare: the answer reads the text and explains it.

## S43.05 Chart interpretation.

- **Expected:** User attaches a chart image and the model interprets its data and trends.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** New chat > round + button beside the message box > Add photos & files (labels found in the code)
- **Needs:** a chart image file
- **Steps:**
  1. Open a new chat and click the round + button beside the message box.
  2. Click Add photos & files and choose a chart image.
  3. Type "What trend does this chart show?" and send.
  4. Compare: the answer reads the values and trends from the chart.

## S43.06 Diagram interpretation.

- **Expected:** User attaches a diagram image and the model explains its structure.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** New chat > round + button beside the message box > Add photos & files (labels found in the code)
- **Needs:** a diagram image file
- **Steps:**
  1. Open a new chat and click the round + button beside the message box.
  2. Click Add photos & files and choose a diagram image.
  3. Type "Explain the structure of this diagram." and send.
  4. Compare: the answer names the parts and how they connect.

## S43.07 Handwriting recognition.

- **Expected:** User attaches handwritten notes and the model transcribes or answers about them.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** New chat > round + button beside the message box > Add photos & files (labels found in the code)
- **Needs:** a photo of handwritten notes
- **Steps:**
  1. Open a new chat and click the round + button beside the message box.
  2. Click Add photos & files and choose a photo of handwritten notes.
  3. Type "Transcribe these notes." and send.
  4. Compare: the answer gives the handwritten words.

## S43.08 Visual text extraction.

- **Expected:** User extracts the text in an image (OCR) and can copy or reuse it.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** New chat > round + button beside the message box > Add photos & files, then the reply (labels found in the code)
- **Needs:** an image with readable text
- **Steps:**
  1. Open a new chat and click the round + button beside the message box.
  2. Click Add photos & files and choose an image that contains text.
  3. Type "Extract all the text in this image." and send.
  4. Click Copy message under the reply and paste it somewhere to check.
  5. Compare: the copied text matches the text in the image.

## S43.12 Object counting.

- **Expected:** User asks how many of something appear in an image and the vision model answers.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** New chat > round + button beside the message box > Add photos & files (labels found in the code)
- **Needs:** an image with countable objects
- **Steps:**
  1. Open a new chat and click the round + button beside the message box.
  2. Click Add photos & files and choose an image with several of one object.
  3. Type "How many apples are in this picture?" (use the object in the image) and send.
  4. Compare: the answer gives a count that matches the image.

## S43.13 Scene comparison.

- **Expected:** User attaches two scenes and the model describes the differences between them.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** New chat > round + button beside the message box > Add photos & files (labels found in the code)
- **Needs:** two scene images
- **Steps:**
  1. Open a new chat and click the round + button beside the message box.
  2. Click Add photos & files and select two scene images.
  3. Type "Describe the differences between these two scenes." and send.
  4. Compare: the answer names differences that appear in the two images.

## S43.14 Visual troubleshooting.

- **Expected:** User shares a photo or screenshot of a problem (device, error, setup) and gets troubleshooting steps.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** New chat > round + button beside the message box > Add photos & files (labels found in the code)
- **Needs:** a photo or screenshot of a problem
- **Steps:**
  1. Open a new chat and click the round + button beside the message box.
  2. Click Add photos & files and choose a photo or screenshot of the problem (device, error or setup).
  3. Type "What is wrong and how do I fix it?" and send.
  4. Compare: the answer gives troubleshooting steps that match the picture.

## S43.17 Reference-image selection for another task.

- **Expected:** User picks an existing image (upload, library item or earlier output) as the reference input for a generation or edit.
- **Code:** done. Evidence moved: apps/web/features/library/components/LibraryView.tsx:230; apps/web/features/library/lib/library-chat-handoff.ts:75; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3792; apps/web/app/api/media/image/generate/route.ts:300 (quoted code not found in the file now)
- **Where to find it:** Library > image item > Remix (a new chat opens with the image attached and Image mode on) (labels found in the code)
- **Needs:** an image in the Library; an account that can create images (plan limits unknown)
- **Steps:**
  1. Click Library in the left sidebar.
  2. Open the menu of an image item in the Library.
  3. Click Remix.
  4. Check the new chat: the image is attached and the menu "What to do with the attached image" shows.
  5. Type an edit prompt, send, and compare: the new image is made from the chosen reference.
