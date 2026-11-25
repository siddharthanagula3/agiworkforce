---
id: "PLAN-chrome-043"
type: "test-plan"
title: "Chrome · 43. Image and visual understanding"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "43"
---
# Chrome · 43. Image and visual understanding

11 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S43.01 Single-image questions.

- **Expected:** User attaches one image and asks a question about it; the image reaches a vision-capable model with the question.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14635; apps/extension/src/side_panel.ts:5237 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:371 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:569
- **Where to find it:** Chat screen: + (attach button) > Upload from device, then type the question in the message box and send (labels found in the code)
- **Needs:** a PNG, JPEG, WebP or GIF file to upload; an account where file uploads are on
- **Steps:**
  1. Click the + button next to the message box and click Upload from device.
  2. Choose one PNG, JPEG, WebP or GIF image in the file chooser.
  3. Type a question about the picture, for example: What is in this picture?
  4. Press Enter to send.
  5. Look at the reply: it should describe or answer about the image you attached, as Expected says.

## S43.02 Multiple-image comparison.

- **Expected:** User attaches two or more images to one message and the model receives all of them to compare.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14635; apps/extension/src/side_panel.ts:5237 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:371 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:569; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:103
- **Where to find it:** Chat screen: + (attach button) > Upload from device, pick several files, then send (labels found in the code)
- **Needs:** two or more image files; an account where file uploads are on
- **Steps:**
  1. Click the + button and click Upload from device.
  2. In the file chooser, select two or more images at once (or add them one after another).
  3. Check that each image appears as a thumbnail above the message box.
  4. Type a question such as: What is different between these two pictures?
  5. Press Enter and look at the reply: it should compare all the images you attached.

## S43.03 Screenshot interpretation.

- **Expected:** User shares a screenshot (captured or pasted) and the model explains what it shows.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14635; apps/extension/src/side_panel.ts:5237 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:371 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:569
- **Where to find it:** Chat screen: + (attach button) > Take a screenshot, or paste a screenshot into the message box (labels found in the code)
- **Needs:** a normal website open in the current tab; a screenshot on the clipboard for the paste route
- **Steps:**
  1. Open a normal website (not a Chrome settings page) in the current tab.
  2. Click the + button and click Take a screenshot.
  3. Or copy a screenshot to the clipboard and press Cmd+V in the message box.
  4. Type a question such as: What does this screenshot show?
  5. Press Enter and look at the reply: it should explain what is in the captured image, as Expected says.

## S43.04 Document-image interpretation.

- **Expected:** User attaches a photo or scan of a document (incl. a scanned PDF) and the model reads and explains it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14635; apps/extension/src/side_panel.ts:5237 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:371 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:569
- **Where to find it:** Chat screen: + (attach button) > Upload from device, choose a photo or a scanned PDF, then send (labels found in the code)
- **Needs:** a photo or scan of a document, or a scanned PDF; an account where file uploads are on
- **Steps:**
  1. Click the + button and click Upload from device.
  2. Choose a photo of a document (JPEG or PNG) or a scanned PDF file.
  3. Type a request such as: Read this document and explain it.
  4. Press Enter.
  5. Look at the reply: it should read and explain the document, as Expected says.

## S43.05 Chart interpretation.

- **Expected:** User attaches a chart image and the model interprets its data and trends.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14635; apps/extension/src/side_panel.ts:5237 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:371 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:569
- **Where to find it:** Chat screen: + (attach button) > Upload from device, choose a chart image, then send (labels found in the code)
- **Needs:** a chart image file; an account where file uploads are on
- **Steps:**
  1. Click the + button and click Upload from device.
  2. Choose a PNG or JPEG image of a chart.
  3. Type a request such as: What trends does this chart show?
  4. Press Enter.
  5. Look at the reply: it should name the data and trends shown in the chart, as Expected says.

## S43.06 Diagram interpretation.

- **Expected:** User attaches a diagram image and the model explains its structure.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14635; apps/extension/src/side_panel.ts:5237 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:371 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:569
- **Where to find it:** Chat screen: + (attach button) > Upload from device, choose a diagram image, then send (labels found in the code)
- **Needs:** a diagram image file; an account where file uploads are on
- **Steps:**
  1. Click the + button and click Upload from device.
  2. Choose a PNG or JPEG image of a diagram.
  3. Type a request such as: Explain the structure of this diagram.
  4. Press Enter.
  5. Look at the reply: it should explain the parts and how they connect, as Expected says.

## S43.07 Handwriting recognition.

- **Expected:** User attaches handwritten notes and the model transcribes or answers about them.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14635; apps/extension/src/side_panel.ts:5237 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:371 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:569
- **Where to find it:** Chat screen: + (attach button) > Upload from device, choose a photo of handwritten notes, then send (labels found in the code)
- **Needs:** a photo of handwritten notes; an account where file uploads are on
- **Steps:**
  1. Click the + button and click Upload from device.
  2. Choose a photo of handwritten notes (JPEG or PNG).
  3. Type a request such as: Transcribe these notes.
  4. Press Enter.
  5. Look at the reply: it should transcribe or answer about the handwriting, as Expected says.

## S43.08 Visual text extraction.

- **Expected:** User extracts the text in an image (OCR) and can copy or reuse it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14635; apps/extension/src/side_panel.ts:5237 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:371 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:569
- **Where to find it:** Chat screen: + (attach button) > Upload from device, send a request to extract the text, then hover over the reply and click Copy response (labels found in the code)
- **Needs:** an image that contains text; an account where file uploads are on
- **Steps:**
  1. Click the + button and click Upload from device.
  2. Choose an image that contains printed text.
  3. Type a request such as: Extract all the text in this image.
  4. Press Enter, then hover over the reply.
  5. Click the Copy response button and paste it somewhere; the copied text should be the extracted text, as Expected says.

## S43.12 Object counting.

- **Expected:** User asks how many of something appear in an image and the vision model answers.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14635; apps/extension/src/side_panel.ts:5237 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:371 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:569
- **Where to find it:** Chat screen: + (attach button) > Upload from device, choose a picture with items to count, then ask how many (labels found in the code)
- **Needs:** an image with countable objects; an account where file uploads are on
- **Steps:**
  1. Click the + button and click Upload from device.
  2. Choose an image with several of the same object (for example apples).
  3. Type a question such as: How many apples are in this picture?
  4. Press Enter.
  5. Look at the reply: it should give a count and answer the question, as Expected says.

## S43.13 Scene comparison.

- **Expected:** User attaches two scenes and the model describes the differences between them.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14635; apps/extension/src/side_panel.ts:5237 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:371 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:569
- **Where to find it:** Chat screen: + (attach button) > Upload from device, pick two scene images at once, then ask for the differences (labels found in the code)
- **Needs:** two scene image files; an account where file uploads are on
- **Steps:**
  1. Click the + button and click Upload from device.
  2. In the file chooser, select two images of different scenes.
  3. Type a request such as: Describe the differences between these two scenes.
  4. Press Enter.
  5. Look at the reply: it should describe the differences between the two scenes, as Expected says.

## S43.14 Visual troubleshooting.

- **Expected:** User shares a photo or screenshot of a problem (device, error, setup) and gets troubleshooting steps.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14635; apps/extension/src/side_panel.ts:5237 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:371 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:569
- **Where to find it:** Chat screen: + (attach button) > Take a screenshot, or Upload from device for a photo, then describe the problem and send (labels found in the code)
- **Needs:** a normal website open in the current tab, or a photo of the problem; an account where file uploads are on
- **Steps:**
  1. Open the page or error that shows the problem, in a normal website tab.
  2. Click the + button and click Take a screenshot (or Upload from device for a photo of the device).
  3. Type a request such as: My printer shows this error, what should I do?
  4. Press Enter.
  5. Look at the reply: it should give troubleshooting steps for the problem shown, as Expected says.
