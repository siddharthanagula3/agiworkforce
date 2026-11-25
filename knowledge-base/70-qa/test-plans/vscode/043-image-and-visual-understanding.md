---
id: "PLAN-vscode-043"
type: "test-plan"
title: "VS Code · 43. Image and visual understanding"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "43"
---
# VS Code · 43. Image and visual understanding

11 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S43.01 Single-image questions.

- **Expected:** User attaches one image and asks a question about it; the image reaches a vision-capable model with the question.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7703; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2212; apps/cli/src/app_server/developer_host.rs:1672
- **Where to find it:** Code: Open Chat > click "Describe a task…" and paste (Cmd+V) an image, or drag an image file onto the composer (labels found in the code)
- **Needs:** an image file; a signed-in account
- **Steps:**
  1. Run "Code: Open Chat" from the Command Palette (Cmd+Shift+P) to open the chat panel.
  2. Copy a PNG or JPG image, or drag an image file from Finder onto the composer at the bottom.
  3. Look for an attachment chip that shows the file name and a thumbnail.
  4. Type "What is in this image?" in "Describe a task…" and send.
  5. Compare: the reply should describe the image you attached.

## S43.02 Multiple-image comparison.

- **Expected:** User attaches two or more images to one message and the model receives all of them to compare.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7703; apps/cli/src/app_server/developer_host.rs:132; apps/cli/src/app_server/developer_host.rs:1672; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2212
- **Where to find it:** Code: Open Chat > drag several image files onto the composer, or paste several images into "Describe a task…" (labels found in the code)
- **Needs:** two or more image files; a signed-in account
- **Steps:**
  1. Run "Code: Open Chat" from the Command Palette to open the chat panel.
  2. Select 2 or 3 image files in Finder and drag them together onto the composer, or copy several images and press Cmd+V in "Describe a task…".
  3. Check that one chip appears for each image.
  4. Type "Compare these images and list the differences" and send.
  5. Compare: the reply should refer to every attached image, not just one.

## S43.03 Screenshot interpretation.

- **Expected:** User shares a screenshot (captured or pasted) and the model explains what it shows.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7703; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2212; apps/cli/src/app_server/developer_host.rs:1672
- **Where to find it:** Code: Open Chat > click "Describe a task…" and paste (Cmd+V) a screenshot (labels found in the code)
- **Needs:** a screenshot on the clipboard; a signed-in account
- **Steps:**
  1. Run "Code: Open Chat" from the Command Palette to open the chat panel.
  2. Take a screenshot with the macOS screenshot tool so it is copied to the clipboard.
  3. Click in "Describe a task…" and press Cmd+V.
  4. Check that an attachment chip with a thumbnail appears.
  5. Type "Explain what this screenshot shows" and send; compare the reply with what is on the screenshot.

## S43.04 Document-image interpretation.

- **Expected:** User attaches a photo or scan of a document (incl. a scanned PDF) and the model reads and explains it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7703; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2212; apps/cli/src/app_server/developer_host.rs:1672
- **Where to find it:** Code: Open Chat > click "Describe a task…" and paste (Cmd+V) a photo, or drag a photo file onto the composer (labels found in the code)
- **Needs:** a photo or scan saved as JPG or PNG; a signed-in account
- **Steps:**
  1. Run "Code: Open Chat" from the Command Palette to open the chat panel.
  2. Drag a photo of a printed page (JPG or PNG) onto the composer, or copy it and press Cmd+V in "Describe a task…".
  3. Check that the attachment chip appears.
  4. Type "Read this document and summarize it" and send.
  5. Compare: the reply should read the text on the page and summarize it.

## S43.05 Chart interpretation.

- **Expected:** User attaches a chart image and the model interprets its data and trends.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7703; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2212; apps/cli/src/app_server/developer_host.rs:1672
- **Where to find it:** Code: Open Chat > drag a chart image onto the composer, or paste it into "Describe a task…" (labels found in the code)
- **Needs:** a chart image file; a signed-in account
- **Steps:**
  1. Run "Code: Open Chat" from the Command Palette to open the chat panel.
  2. Save a chart as a PNG and drag it onto the composer, or copy it and press Cmd+V in "Describe a task…".
  3. Check that the attachment chip appears.
  4. Type "What trends does this chart show? Give the main values" and send.
  5. Compare: the reply should describe the trend and values shown in the chart.

## S43.06 Diagram interpretation.

- **Expected:** User attaches a diagram image and the model explains its structure.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7703; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2212; apps/cli/src/app_server/developer_host.rs:1672
- **Where to find it:** Code: Open Chat > drag a diagram image onto the composer, or paste it into "Describe a task…" (labels found in the code)
- **Needs:** a diagram image file; a signed-in account
- **Steps:**
  1. Run "Code: Open Chat" from the Command Palette to open the chat panel.
  2. Save a diagram as a PNG and drag it onto the composer, or copy it and press Cmd+V in "Describe a task…".
  3. Check that the attachment chip appears.
  4. Type "Explain the structure of this diagram" and send.
  5. Compare: the reply should name the parts of the diagram and how they connect.

## S43.07 Handwriting recognition.

- **Expected:** User attaches handwritten notes and the model transcribes or answers about them.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7703; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2212; apps/cli/src/app_server/developer_host.rs:1672
- **Where to find it:** Code: Open Chat > drag a photo of handwritten notes onto the composer, or paste it into "Describe a task…" (labels found in the code)
- **Needs:** a photo of handwriting saved as JPG or PNG; a signed-in account
- **Steps:**
  1. Run "Code: Open Chat" from the Command Palette to open the chat panel.
  2. Take a photo of the handwritten notes, save it as JPG or PNG, and drag it onto the composer.
  3. Check that the attachment chip appears.
  4. Type "Transcribe these handwritten notes" and send.
  5. Compare: the reply should give the written text of the notes.

## S43.08 Visual text extraction.

- **Expected:** User extracts the text in an image (OCR) and can copy or reuse it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7703; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2212; apps/cli/src/app_server/developer_host.rs:1672
- **Where to find it:** Code: Open Chat > attach an image, ask for its text, then copy the text from the reply (labels found in the code)
- **Needs:** an image with readable text; a signed-in account
- **Steps:**
  1. Run "Code: Open Chat" from the Command Palette to open the chat panel.
  2. Drag an image containing text onto the composer, or paste it into "Describe a task…".
  3. Type "Transcribe all the text in this image exactly" and send.
  4. When the reply arrives, select the text and press Cmd+C, or use the "Copy" button on a code block in the reply.
  5. Compare: the copied text should match the text in the image and can be pasted elsewhere.

## S43.12 Object counting.

- **Expected:** User asks how many of something appear in an image and the vision model answers.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7703; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2212; apps/cli/src/app_server/developer_host.rs:1672
- **Where to find it:** Code: Open Chat > attach an image, then ask how many items appear in it (labels found in the code)
- **Needs:** a photo with countable objects; a signed-in account
- **Steps:**
  1. Run "Code: Open Chat" from the Command Palette to open the chat panel.
  2. Drag a photo with several countable objects onto the composer, or paste it into "Describe a task…".
  3. Type "How many apples are in this image? Count each one" (use your own object) and send.
  4. Compare: the reply should give a count and the count should match the objects you can see.

## S43.13 Scene comparison.

- **Expected:** User attaches two scenes and the model describes the differences between them.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7703; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2212; apps/cli/src/app_server/developer_host.rs:1672
- **Where to find it:** Code: Open Chat > drag two scene images onto the composer, or paste them into "Describe a task…" (labels found in the code)
- **Needs:** two scene photos as image files; a signed-in account
- **Steps:**
  1. Run "Code: Open Chat" from the Command Palette to open the chat panel.
  2. Select two photos of different scenes in Finder and drag both onto the composer, or copy each and paste into "Describe a task…".
  3. Check that two attachment chips appear.
  4. Type "Describe the differences between these two scenes" and send.
  5. Compare: the reply should describe differences from both photos.

## S43.14 Visual troubleshooting.

- **Expected:** User shares a photo or screenshot of a problem (device, error, setup) and gets troubleshooting steps.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7703; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2212; apps/cli/src/app_server/developer_host.rs:1672
- **Where to find it:** Code: Open Chat > drag a screenshot or photo of the problem onto the composer, or paste it into "Describe a task…" (labels found in the code)
- **Needs:** a screenshot or photo of a problem as an image file; a signed-in account
- **Steps:**
  1. Run "Code: Open Chat" from the Command Palette to open the chat panel.
  2. Take a screenshot of the error or a photo of the device, save it as PNG or JPG, and drag it onto the composer.
  3. Check that the attachment chip appears.
  4. Type "What is wrong here and what steps should I try?" and send.
  5. Compare: the reply should name the problem shown and give troubleshooting steps.
