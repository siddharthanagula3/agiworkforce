---
id: "PLAN-web-043"
type: "test-plan"
title: "Web · 43. Image and visual understanding"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "43"
---
# Web · 43. Image and visual understanding

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S43.01 Single-image questions.

- **Expected:** User attaches one image and asks a question about it; the image reaches a vision-capable model with the question.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** Chat > composer plus menu > Add photos & files > choose one image > type a question > send (labels found in the code)
- **Needs:** an image file
- **Steps:**
  1. Open a new chat in the web app.
  2. Open the plus menu in the message box and click "Add photos & files".
  3. Choose one image file.
  4. Type a question about the image, such as "What is in this picture?", and send.
  5. Look for an answer that describes the image. Expected: the model answers from the image, with no upload refusal message.

## S43.02 Multiple-image comparison.

- **Expected:** User attaches two or more images to one message and the model receives all of them to compare.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** Chat > composer plus menu > Add photos & files > choose two or more images > type a comparison question > send (labels found in the code)
- **Needs:** two image files
- **Steps:**
  1. Open a new chat in the web app.
  2. Open the plus menu and click "Add photos & files".
  3. Choose two or more image files at once.
  4. Type "Compare these two images" and send.
  5. Look for an answer that names details from both images. Expected: the model received and compared all attached images.

## S43.03 Screenshot interpretation.

- **Expected:** User shares a screenshot (captured or pasted) and the model explains what it shows.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** Chat > composer plus menu > Attach clipboard (after copying a screenshot), or Chat > Add photos & files > choose a screenshot file (labels found in the code)
- **Needs:** a screenshot
- **Steps:**
  1. Take a screenshot with the macOS screenshot keys and leave it on the clipboard.
  2. Open a new chat and open the plus menu.
  3. Click "Attach clipboard" (or use "Add photos & files" and pick the screenshot file).
  4. Type "What does this screenshot show?" and send.
  5. Look for an answer that explains what is on the screen. Expected: the model describes the screenshot.

## S43.04 Document-image interpretation.

- **Expected:** User attaches a photo or scan of a document (incl. a scanned PDF) and the model reads and explains it.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** Chat > composer plus menu > Add photos & files > choose a photo or scanned PDF > type "Read this document and explain it" > send (labels found in the code)
- **Needs:** a photo or scanned PDF of a document
- **Steps:**
  1. Open a new chat and open the plus menu.
  2. Click "Add photos & files" and choose a photo or a scanned PDF of a document.
  3. Type "Read this document and explain it." and send.
  4. Look for an answer that reads text from the document and explains it. Expected: the model reads the scanned document.

## S43.05 Chart interpretation.

- **Expected:** User attaches a chart image and the model interprets its data and trends.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** Chat > composer plus menu > Add photos & files > choose a chart image > type a question about trends > send (labels found in the code)
- **Needs:** a chart image
- **Steps:**
  1. Open a new chat and open the plus menu.
  2. Click "Add photos & files" and choose a chart image.
  3. Type "What trend does this chart show?" and send.
  4. Look for an answer that names the data series and the trend. Expected: the model interprets the chart.

## S43.06 Diagram interpretation.

- **Expected:** User attaches a diagram image and the model explains its structure.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** Chat > composer plus menu > Add photos & files > choose a diagram image > type "Explain the structure of this diagram" > send (labels found in the code)
- **Needs:** a diagram image
- **Steps:**
  1. Open a new chat and open the plus menu.
  2. Click "Add photos & files" and choose a diagram image.
  3. Type "Explain the structure of this diagram." and send.
  4. Look for an answer that names the parts and how they connect. Expected: the model explains the diagram structure.

## S43.07 Handwriting recognition.

- **Expected:** User attaches handwritten notes and the model transcribes or answers about them.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** Chat > composer plus menu > Add photos & files > choose a photo of handwritten notes > type "Transcribe these notes" > send (labels found in the code)
- **Needs:** a photo of handwritten notes
- **Steps:**
  1. Open a new chat and open the plus menu.
  2. Click "Add photos & files" and choose a photo of handwritten notes.
  3. Type "Transcribe these notes." and send.
  4. Look for a transcription that matches the handwriting. Expected: the model transcribes or answers about the notes.

## S43.08 Visual text extraction.

- **Expected:** User extracts the text in an image (OCR) and can copy or reuse it.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** Chat > composer plus menu > Add photos & files > choose an image with text > type "Extract the text in this image" > send, then copy the reply (labels found in the code)
- **Needs:** an image with text
- **Steps:**
  1. Open a new chat and open the plus menu.
  2. Click "Add photos & files" and choose an image that contains text.
  3. Type "Extract the text in this image." and send.
  4. Select the text in the reply and copy it, then paste it somewhere.
  5. Look for the copied text to match the text in the image. Expected: the text can be copied and reused.

## S43.12 Object counting.

- **Expected:** User asks how many of something appear in an image and the vision model answers.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** Chat > composer plus menu > Add photos & files > choose an image with several items > type "How many are there?" > send (labels found in the code)
- **Needs:** an image with countable objects
- **Steps:**
  1. Open a new chat and open the plus menu.
  2. Click "Add photos & files" and choose an image with a countable number of items.
  3. Type "How many of these are in the image?" and send.
  4. Count the items yourself and compare with the answer. Expected: the model gives a count.

## S43.13 Scene comparison.

- **Expected:** User attaches two scenes and the model describes the differences between them.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** Chat > composer plus menu > Add photos & files > choose two scene images > type "Describe the differences" > send (labels found in the code)
- **Needs:** two scene images
- **Steps:**
  1. Open a new chat and open the plus menu.
  2. Click "Add photos & files" and choose two scene images at once.
  3. Type "Describe the differences between these two scenes." and send.
  4. Look for an answer that names differences in both images. Expected: the model describes the differences.

## S43.14 Visual troubleshooting.

- **Expected:** User shares a photo or screenshot of a problem (device, error, setup) and gets troubleshooting steps.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:419
- **Known to be unfinished:** live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model
- **Where to find it:** Chat > composer plus menu > Add photos & files > choose a photo or screenshot of the problem > type "What is wrong and what should I try?" > send (labels found in the code)
- **Needs:** a photo or screenshot of a problem
- **Steps:**
  1. Open a new chat and open the plus menu.
  2. Click "Add photos & files" and choose a photo or screenshot of a device, error or setup.
  3. Type "What is wrong here and what should I try?" and send.
  4. Look for numbered troubleshooting steps that refer to the picture. Expected: the model gives troubleshooting steps.

## S43.17 Reference-image selection for another task.

- **Expected:** User picks an existing image (upload, library item or earlier output) as the reference input for a generation or edit.
- **Code:** done. Evidence moved: apps/web/features/library/components/LibraryView.tsx:230; apps/web/features/library/lib/library-chat-handoff.ts:75; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3792; apps/web/app/api/media/image/generate/route.ts:300 (quoted code not found in the file now)
- **Where to find it:** Library > open an image item > Remix (then the composer opens with the image attached); or Chat > plus menu > Add from library > pick the image > Edit or Variation (labels found in the code)
- **Needs:** a previously saved image in the library
- **Steps:**
  1. Click "Library" in the sidebar.
  2. Open an image item in the library list.
  3. Click "Remix" in its menu.
  4. The new chat opens with the image attached. Check the image chip and the "Edit" or "Variation" option.
  5. Type a change, such as "Make the sky red", and send. Expected: the image is used as the reference input for the new generation.
