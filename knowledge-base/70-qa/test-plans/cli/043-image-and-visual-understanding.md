---
id: "PLAN-cli-043"
type: "test-plan"
title: "CLI · 43. Image and visual understanding"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "43"
---
# CLI · 43. Image and visual understanding

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S43.01 Single-image questions.

- **Expected:** User attaches one image and asks a question about it; the image reaches a vision-capable model with the question.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6215; apps/cli/src/tui/tui_app.rs:6263; apps/cli/src/lib.rs:8379
- **Where to find it:** agi, then type /attach <path to image>, then type your question and send (labels found in the code)
- **Needs:** a vision-capable model selected with /model, an image file
- **Steps:**
  1. Start agi and pick a vision-capable model with /model (agi refuses images on a model that does not accept them, with the text "switch to a vision model with /model first").
  2. Type /attach followed by the path to a PNG or JPG on your Mac, and press Enter.
  3. Look for the message "Attached <name> (<size>). It goes with your next message; /attach remove drops it."
  4. Type a question about the picture (for example "What is in this image?") and send.
  5. Compare the reply with Expected: it should answer about the picture you attached.

## S43.02 Multiple-image comparison.

- **Expected:** User attaches two or more images to one message and the model receives all of them to compare.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6215; apps/cli/src/tui/tui_app.rs:6263; apps/cli/src/lib.rs:8379
- **Where to find it:** agi, then /attach <image 1>, then /attach <image 2>, then /attach list to check (labels found in the code)
- **Needs:** a vision-capable model selected with /model, two image files
- **Steps:**
  1. Start agi with a vision-capable model selected by /model.
  2. Type /attach <first image path> and press Enter, then type /attach <second image path> and press Enter.
  3. Type /attach list and press Enter. Look for "Staged for the next turn:" with both images numbered 1 and 2.
  4. Type a message such as "Compare these two images" and send.
  5. Compare with Expected: the reply should describe both images and how they differ.

## S43.03 Screenshot interpretation.

- **Expected:** User shares a screenshot (captured or pasted) and the model explains what it shows.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6215; apps/cli/src/tui/tui_app.rs:6263; apps/cli/src/lib.rs:8379
- **Where to find it:** agi, then Ctrl+V in the message box (or /attach clipboard after copying a screenshot) (labels found in the code)
- **Needs:** a vision-capable model selected with /model, a screenshot on the clipboard
- **Steps:**
  1. Take a screenshot so it is on the clipboard, then start agi with a vision-capable model selected by /model.
  2. Press Ctrl+V in the message box. The status line should show "attached clipboard (<width>x<height>)".
  3. Type /attach list and press Enter to confirm the screenshot is staged.
  4. Type "What does this screenshot show?" and send.
  5. Compare with Expected: the reply should explain what the screenshot shows.

## S43.04 Document-image interpretation.

- **Expected:** User attaches a photo or scan of a document (incl. a scanned PDF) and the model reads and explains it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6215; apps/cli/src/tui/tui_app.rs:6263; apps/cli/src/lib.rs:8379
- **Where to find it:** agi, then /attach <photo or scan path> (labels found in the code)
- **Needs:** a vision-capable model for a photo, a document file (PDF or Office) or a scanned PDF
- **Steps:**
  1. Start agi and select a model with /model.
  2. Type /attach <path to a photo (JPG/PNG) or a scanned PDF> and press Enter.
  3. Type "Read this document and explain it" and send.
  4. Compare with Expected: the reply should read and explain the document.

## S43.05 Chart interpretation.

- **Expected:** User attaches a chart image and the model interprets its data and trends.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6215; apps/cli/src/tui/tui_app.rs:6263; apps/cli/src/lib.rs:8379
- **Where to find it:** agi, then /attach <chart image path> (labels found in the code)
- **Needs:** a vision-capable model selected with /model, a chart image file
- **Steps:**
  1. Start agi and select a vision-capable model with /model.
  2. Type /attach <path to a chart PNG or JPG> and press Enter.
  3. Type "What trends does this chart show? Give the main values." and send.
  4. Compare with Expected: the reply should describe the chart's data and trends.

## S43.06 Diagram interpretation.

- **Expected:** User attaches a diagram image and the model explains its structure.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6215; apps/cli/src/tui/tui_app.rs:6263; apps/cli/src/lib.rs:8379
- **Where to find it:** agi, then /attach <diagram image path> (labels found in the code)
- **Needs:** a vision-capable model selected with /model, a diagram image file
- **Steps:**
  1. Start agi and select a vision-capable model with /model.
  2. Type /attach <path to a diagram PNG or JPG> and press Enter.
  3. Type "Explain the structure of this diagram." and send.
  4. Compare with Expected: the reply should explain the parts of the diagram and how they connect.

## S43.07 Handwriting recognition.

- **Expected:** User attaches handwritten notes and the model transcribes or answers about them.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6215; apps/cli/src/tui/tui_app.rs:6263; apps/cli/src/lib.rs:8379
- **Where to find it:** agi, then /attach <photo of handwritten notes path> (labels found in the code)
- **Needs:** a vision-capable model selected with /model, a photo of handwritten notes
- **Steps:**
  1. Start agi and select a vision-capable model with /model.
  2. Type /attach <path to a photo of handwritten notes> and press Enter.
  3. Type "Transcribe these handwritten notes." and send.
  4. Compare with Expected: the reply should transcribe or answer questions about the handwriting.

## S43.08 Visual text extraction.

- **Expected:** User extracts the text in an image (OCR) and can copy or reuse it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6215; apps/cli/src/tui/tui_app.rs:6263; apps/cli/src/lib.rs:8379
- **Where to find it:** agi, then /attach <image path}, then ask for the text (labels found in the code)
- **Needs:** a vision-capable model selected with /model, an image containing text
- **Steps:**
  1. Start agi and select a vision-capable model with /model.
  2. Type /attach <path to an image containing text> and press Enter.
  3. Type "Extract all the text in this image exactly." and send.
  4. Select the returned text in the terminal with the mouse, copy it, and compare with Expected: the copied text should match the text in the image.

## S43.12 Object counting.

- **Expected:** User asks how many of something appear in an image and the vision model answers.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6215; apps/cli/src/tui/tui_app.rs:6263; apps/cli/src/lib.rs:8379
- **Where to find it:** agi, then /attach <image path>, then ask how many items (labels found in the code)
- **Needs:** a vision-capable model selected with /model, an image with countable items
- **Steps:**
  1. Start agi and select a vision-capable model with /model.
  2. Type /attach <path to an image with several items> and press Enter.
  3. Type "How many of the <item> are in this image?" and send.
  4. Compare with Expected: the reply should give a count of the items.

## S43.13 Scene comparison.

- **Expected:** User attaches two scenes and the model describes the differences between them.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6215; apps/cli/src/tui/tui_app.rs:6263; apps/cli/src/lib.rs:8379
- **Where to find it:** agi, then /attach <scene 1 path>, then /attach <scene 2 path>, then a question (labels found in the code)
- **Needs:** a vision-capable model selected with /model, two scene images
- **Steps:**
  1. Start agi and select a vision-capable model with /model.
  2. Type /attach <path to first scene> and press Enter, then /attach <path to second scene> and press Enter.
  3. Type "Describe the differences between these two scenes." and send.
  4. Compare with Expected: the reply should describe differences between the two images.

## S43.14 Visual troubleshooting.

- **Expected:** User shares a photo or screenshot of a problem (device, error, setup) and gets troubleshooting steps.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6215; apps/cli/src/tui/tui_app.rs:6263; apps/cli/src/lib.rs:8379
- **Where to find it:** agi, then /attach <photo or screenshot of the problem path>, then describe the problem (labels found in the code)
- **Needs:** a vision-capable model selected with /model, a photo or screenshot of a problem
- **Steps:**
  1. Start agi and select a vision-capable model with /model.
  2. Type /attach <path to a photo or screenshot of the error or device> and press Enter.
  3. Type "What is wrong here, and what steps should I take to fix it?" and send.
  4. Compare with Expected: the reply should give troubleshooting steps for what the picture shows.

## S43.18 High-resolution versus reduced-resolution handling.

- **Expected:** Images are processed at a resolution suited to the task, with a high-detail vs reduced-detail choice honoured end to end.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:8383; apps/cli/src/tui/tui_app.rs:6251; apps/cli/src/tui/tui_app.rs:872
- **Where to find it:** agi, then /attach --full <image path> and compare with /attach <image path> (labels found in the code)
- **Needs:** a vision-capable model selected with /model, a large detailed image
- **Steps:**
  1. Start agi and select a vision-capable model with /model.
  2. Type /attach <path to a large, detailed image> and press Enter. Note the message "Attached <name> (<size>). It goes with your next message; /attach remove drops it."
  3. Type /attach remove all, then type /attach --full <same image path> and press Enter.
  4. Look for the message "It is sent without being scaled down, so it costs more input".
  5. Compare with Expected: the full-resolution attach should be the only one that says it is not scaled down, and the reply should show more detail when asked about fine text.
