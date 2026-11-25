---
id: "PLAN-mobile-043"
type: "test-plan"
title: "Mobile · 43. Image and visual understanding"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "43"
---
# Mobile · 43. Image and visual understanding

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S43.01 Single-image questions.

- **Expected:** User attaches one image and asks a question about it; the image reaches a vision-capable model with the question.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:409; apps/mobile/services/api.ts:771
- **Known to be unfinished:** live check (owner): provision the upload scanner and set UPLOAD_SCAN_WEBHOOK_URL in production, then attach a photo on the phone in a Cloud chat and ask the question this cell names; the code path is the web's (presigned upload to file part)
- **Where to find it:** Chat screen > Add to chat > Photos (labels found in the code)
- **Needs:** a signed-in account, a photo file
- **Steps:**
  1. Sign in and make sure the mode control shows Cloud selected.
  2. Tap Add to chat (the + button beside the message box).
  3. Tap Photos and pick one photo.
  4. Tap Message input, type 'What is in this photo?' and tap Send message.
  5. Check that the reply describes the photo, as Expected says.

## S43.02 Multiple-image comparison.

- **Expected:** User attaches two or more images to one message and the model receives all of them to compare.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:409; apps/mobile/services/api.ts:771
- **Known to be unfinished:** live check (owner): provision the upload scanner and set UPLOAD_SCAN_WEBHOOK_URL in production, then attach a photo on the phone in a Cloud chat and ask the question this cell names; the code path is the web's (presigned upload to file part)
- **Where to find it:** Chat screen > Add to chat > Photos (labels found in the code)
- **Needs:** a signed-in account, two photo files
- **Steps:**
  1. Tap Add to chat, then Photos.
  2. Select two photos in the picker (it allows several, in order).
  3. Type 'Compare these two images: what is different?' in Message input and tap Send message.
  4. Check that the reply compares both photos, as Expected says.

## S43.03 Screenshot interpretation.

- **Expected:** User shares a screenshot (captured or pasted) and the model explains what it shows.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:409; apps/mobile/services/api.ts:771
- **Known to be unfinished:** live check (owner): provision the upload scanner and set UPLOAD_SCAN_WEBHOOK_URL in production, then attach a photo on the phone in a Cloud chat and ask the question this cell names; the code path is the web's (presigned upload to file part)
- **Where to find it:** Chat screen > Add to chat > Paste image (or Photos for a saved screenshot) (labels found in the code)
- **Needs:** a signed-in account, a screenshot
- **Steps:**
  1. Take a screenshot on the device and copy it to the clipboard.
  2. Tap Add to chat, then Paste image (this row only shows when the clipboard holds an image).
  3. Type 'What does this screenshot show?' in Message input and tap Send message.
  4. Check that the reply explains the screenshot, as Expected says.

## S43.04 Document-image interpretation.

- **Expected:** User attaches a photo or scan of a document (incl. a scanned PDF) and the model reads and explains it.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:409; apps/mobile/services/api.ts:771
- **Known to be unfinished:** live check (owner): provision the upload scanner and set UPLOAD_SCAN_WEBHOOK_URL in production, then attach a photo on the phone in a Cloud chat and ask the question this cell names; the code path is the web's (presigned upload to file part)
- **Where to find it:** Chat screen > Add to chat > File (Cloud mode only) or Photos (labels found in the code)
- **Needs:** a signed-in account, a scanned PDF or a document photo
- **Steps:**
  1. Make sure Cloud is selected, then tap Add to chat and tap File.
  2. Pick a scanned PDF or a photo of a document.
  3. Type 'Read this document and explain it' in Message input and tap Send message.
  4. Check that the reply reads and explains the document, as Expected says.

## S43.05 Chart interpretation.

- **Expected:** User attaches a chart image and the model interprets its data and trends.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:409; apps/mobile/services/api.ts:771
- **Known to be unfinished:** live check (owner): provision the upload scanner and set UPLOAD_SCAN_WEBHOOK_URL in production, then attach a photo on the phone in a Cloud chat and ask the question this cell names; the code path is the web's (presigned upload to file part)
- **Where to find it:** Chat screen > Add to chat > Photos (labels found in the code)
- **Needs:** a signed-in account, a chart image file
- **Steps:**
  1. Tap Add to chat, then Photos, and pick a chart image.
  2. Type 'What trends does this chart show? Give the main values.' in Message input and tap Send message.
  3. Check that the reply names the data and the trend, as Expected says.

## S43.06 Diagram interpretation.

- **Expected:** User attaches a diagram image and the model explains its structure.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:409; apps/mobile/services/api.ts:771
- **Known to be unfinished:** live check (owner): provision the upload scanner and set UPLOAD_SCAN_WEBHOOK_URL in production, then attach a photo on the phone in a Cloud chat and ask the question this cell names; the code path is the web's (presigned upload to file part)
- **Where to find it:** Chat screen > Add to chat > Photos (labels found in the code)
- **Needs:** a signed-in account, a diagram image file
- **Steps:**
  1. Tap Add to chat, then Photos, and pick a diagram image.
  2. Type 'Explain the structure of this diagram.' in Message input and tap Send message.
  3. Check that the reply describes the parts and how they connect, as Expected says.

## S43.07 Handwriting recognition.

- **Expected:** User attaches handwritten notes and the model transcribes or answers about them.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:409; apps/mobile/services/api.ts:771
- **Known to be unfinished:** live check (owner): provision the upload scanner and set UPLOAD_SCAN_WEBHOOK_URL in production, then attach a photo on the phone in a Cloud chat and ask the question this cell names; the code path is the web's (presigned upload to file part)
- **Where to find it:** Chat screen > Add to chat > Photos (labels found in the code)
- **Needs:** a signed-in account, a photo of handwriting
- **Steps:**
  1. Tap Add to chat, then Photos, and pick a photo of handwritten notes.
  2. Type 'Transcribe these notes.' in Message input and tap Send message.
  3. Check that the reply gives the handwritten text, as Expected says.

## S43.08 Visual text extraction.

- **Expected:** User extracts the text in an image (OCR) and can copy or reuse it.
- **Code:** done. Evidence gone: apps/mobile/src/features/shell/capabilityShortcuts.ts:19 (file no longer exists); apps/mobile/app/(app)/scan.tsx:94; apps/mobile/app/(app)/scan.tsx:392; apps/mobile/src/features/image/services/ocr.ts:16
- **Where to find it:** Siri or Shortcuts (iPhone): Scan with AGI; then the Scan Text screen > Copy text (labels found in the code)
- **Needs:** an iPhone with AGI installed, a page with printed text
- **Steps:**
  1. On an iPhone, run the Shortcuts action or Siri phrase Scan with AGI.
  2. On Scan Text, take a photo of a page with printed text.
  3. Tap Copy text and check that the pill changes to Copied.
  4. Paste into a note and check that the text matches Expected.

## S43.12 Object counting.

- **Expected:** User asks how many of something appear in an image and the vision model answers.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:409; apps/mobile/services/api.ts:771
- **Known to be unfinished:** live check (owner): provision the upload scanner and set UPLOAD_SCAN_WEBHOOK_URL in production, then attach a photo on the phone in a Cloud chat and ask the question this cell names; the code path is the web's (presigned upload to file part)
- **Where to find it:** Chat screen > Add to chat > Photos (labels found in the code)
- **Needs:** a signed-in account, an image with several countable objects
- **Steps:**
  1. Tap Add to chat, then Photos, and pick an image with several of the same object (for example apples).
  2. Type 'How many apples are in this picture?' in Message input and tap Send message.
  3. Check that the reply gives a count, as Expected says.

## S43.13 Scene comparison.

- **Expected:** User attaches two scenes and the model describes the differences between them.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:409; apps/mobile/services/api.ts:771
- **Known to be unfinished:** live check (owner): provision the upload scanner and set UPLOAD_SCAN_WEBHOOK_URL in production, then attach a photo on the phone in a Cloud chat and ask the question this cell names; the code path is the web's (presigned upload to file part)
- **Where to find it:** Chat screen > Add to chat > Photos (labels found in the code)
- **Needs:** a signed-in account, two scene photos
- **Steps:**
  1. Tap Add to chat, then Photos, and select two different scene photos (selection keeps the order you tap).
  2. Type 'Describe the differences between the first and second photo.' in Message input and tap Send message.
  3. Check that the reply names the differences between the two scenes, as Expected says.

## S43.14 Visual troubleshooting.

- **Expected:** User shares a photo or screenshot of a problem (device, error, setup) and gets troubleshooting steps.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:409; apps/mobile/services/api.ts:771
- **Known to be unfinished:** live check (owner): provision the upload scanner and set UPLOAD_SCAN_WEBHOOK_URL in production, then attach a photo on the phone in a Cloud chat and ask the question this cell names; the code path is the web's (presigned upload to file part)
- **Where to find it:** Chat screen > Add to chat > Camera (or Photos) (labels found in the code)
- **Needs:** a signed-in account, a device or error to photograph
- **Steps:**
  1. Tap Add to chat, then Camera, and take a photo of the device or error screen (or choose one with Photos).
  2. Type 'My router shows this light. What should I check?' in Message input and tap Send message.
  3. Check that the reply gives troubleshooting steps, as Expected says.

## S43.17 Reference-image selection for another task.

- **Expected:** User picks an existing image (upload, library item or earlier output) as the reference input for a generation or edit.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:705; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:235 (quoted code not found in the file now); apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:312
- **Where to find it:** Chat screen > Add to chat > Create image > Attach from Library (or Photos); or open a generated image > Change this image (labels found in the code)
- **Needs:** a signed-in account, an image to use as reference, an image-capable model
- **Steps:**
  1. Tap Add to chat, then Create image (the chat switches to image generation).
  2. Tap Attach from Library or Photos and pick an image; up to 4 photos can be attached, and the first is edited.
  3. Type 'Make the sky sunset orange' in Message input and tap Send message.
  4. Check that the new image is based on the chosen reference, as Expected says.
  5. Optional: tap a generated image in the chat, tap Change this image, type in Describe the change, then tap Change the image.
