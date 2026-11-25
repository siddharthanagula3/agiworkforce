---
id: "PLAN-chrome-014"
type: "test-plan"
title: "Chrome · 14. Attachment intake components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "14"
---
# Chrome · 14. Attachment intake components

13 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S14.01 Device file picker.

- **Expected:** The composer opens the device file chooser and the chosen file is attached to the next message.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:10064; apps/extension/src/side_panel.ts:14680; apps/extension/src/side_panel.ts:10368
- **Where to find it:** Composer > + button (its tooltip is "Add attachment") > Upload from device (path not confirmed in the code; trust the screen)
- **Needs:** a file to upload, and an account where file uploads are allowed (the Upload from device item is hidden otherwise)
- **Steps:**
  1. Sign in and open the side panel on a normal web page.
  2. Click the + button beside the message box.
  3. Click Upload from device and pick one file in the file chooser.
  4. Look at the attachment bar above the message box: the file should show as a chip, and it should go with your next message.

## S14.02 Drag-and-drop intake.

- **Expected:** Dropping files onto the chat attaches them to the next message.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:15818; apps/extension/src/side_panel.ts:15822; apps/extension/src/side_panel.ts:10368
- **Where to find it:** Composer > drag a file from Finder onto the message box (path not confirmed in the code; trust the screen)
- **Needs:** a file to drag, and an account where file uploads are allowed
- **Steps:**
  1. Sign in and open the side panel.
  2. Drag an image or PDF from a Finder window onto the message box.
  3. Drop it there.
  4. Look at the attachment bar above the message box: the file should appear as a chip, and it should go with your next message.

## S14.03 Paste-image intake.

- **Expected:** Pasting an image from the clipboard into the composer attaches it as an image.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:14584; apps/extension/src/side_panel.ts:10343
- **Where to find it:** Composer > click the message box and press Command-V after copying an image (path not confirmed in the code; trust the screen)
- **Needs:** an image on the clipboard, and an account where file uploads are allowed
- **Steps:**
  1. Copy an image to the clipboard, for example with Shift-Command-Control-4 or by copying an image from a web page.
  2. Sign in and click in the message box.
  3. Press Command-V.
  4. Look at the attachment bar: the image should appear as an image chip, not as text, and it should go with your next message.

## S14.05 Photo-library selection.

- **Expected:** The user can pick one or more photos from the photo library and attach them.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:9843 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10343
- **Where to find it:** not found in the code. Searched for "photo" and "library" in apps/extension/src and apps/extension/_locales/en. No photo-library control was found; the only file route is Upload from device, which opens the file chooser.

## S14.06 Screenshot capture.

- **Expected:** A composer control captures the screen and attaches the screenshot to the next message.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14630; apps/extension/src/background.ts:5610; apps/extension/src/side_panel.ts:5238 (quoted code not found in the file now)
- **Where to find it:** Composer > + button > Take a screenshot (labels found in the code)
- **Needs:** a regular website open in the active tab, and an account where file uploads are allowed (the item is disabled otherwise)
- **Steps:**
  1. Open a regular website (not a Chrome settings or store page) in the active tab and sign in to the side panel.
  2. Click the + button beside the message box.
  3. Click Take a screenshot.
  4. Look at the attachment bar: a Screenshot chip should appear, and it should go with your next message.

## S14.08 URL attachment.

- **Expected:** The user can attach a web page by its URL so its content is used as context for the message.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14832; apps/extension/src/side_panel.ts:14892; apps/extension/src/side_panel.ts:5834 (quoted code not found in the file now)
- **Where to find it:** Composer > + button > Add a web page by link (path not confirmed in the code; trust the screen)
- **Needs:** a web address on a site the extension has approved
- **Steps:**
  1. Click the + button beside the message box.
  2. Click Add a web page by link.
  3. Type a web address on a site the extension has approved, then press the button in the link form to add it.
  4. Look at the attachment bar: the page should appear as a chip, and it should go with your next message.

## S14.15 Multiple-file selection.

- **Expected:** One pick action can select several files, and all of them are attached.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:14681
- **Where to find it:** Composer > + button > Upload from device (path not confirmed in the code; trust the screen)
- **Needs:** two or three files to upload, and an account where file uploads are allowed
- **Steps:**
  1. Click the + button beside the message box.
  2. Click Upload from device.
  3. In the file chooser, select two or three files together (for example with Command-click), then click Open.
  4. Look at the attachment bar: every selected file should appear as its own chip, and all of them should go with your next message.

## S14.16 Attachment thumbnail.

- **Expected:** An attached image shows a small visual thumbnail in the composer before sending.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10426; apps/extension/src/side_panel.ts:10716; apps/extension/src/side_panel.ts:5238 (quoted code not found in the file now)
- **Where to find it:** Composer > + button > Upload from device (path not confirmed in the code; trust the screen)
- **Needs:** an image file, and an account where file uploads are allowed
- **Steps:**
  1. Click the + button beside the message box.
  2. Click Upload from device and pick a PNG, JPEG, WebP or GIF image.
  3. Look at the attachment bar: the image chip should show a small picture of the image, not just a file icon.
  4. Compare the chip with the image before sending.

## S14.22 Ready-to-use state.

- **Expected:** The composer makes clear when an attachment is ready and the message can be sent with it.
- **Code:** done. Evidence present: apps/extension/_locales/en/messages.json:332; apps/extension/src/side_panel.ts:10787; apps/extension/src/side_panel.ts:10343
- **Where to find it:** Composer > + button > Upload from device, then look under the file name in the attachment bar (path not confirmed in the code; trust the screen)
- **Needs:** a file to upload, and an account where file uploads are allowed
- **Steps:**
  1. Click the + button and pick a file with Upload from device.
  2. While it reads, look at the attachment bar: the notice "Adding attachments… Send will be available when they are ready." appears.
  3. When the file is done, look under its name: the text "Ready to send" should appear.
  4. Compare the chip with Expected: the message should only be sendable once it shows Ready to send.

## S14.24 Unsupported-file notice.

- **Expected:** Adding a file type the chat cannot read shows a notice naming the file and why.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:10356
- **Where to find it:** Composer > + button > Upload from device (path not confirmed in the code; trust the screen)
- **Needs:** a file the chat cannot read, such as a .zip or .docx file
- **Steps:**
  1. Click the + button beside the message box.
  2. Click Upload from device and try to pick a file type the chat does not read, such as a .zip or .docx file.
  3. If the chooser hides that type, drag the file onto the message box instead.
  4. Look at the attachment bar: a notice should name the file and say that only PNG, JPEG, WebP or GIF images, PDF, and text or Markdown files can be attached.

## S14.28 Attachment removal.

- **Expected:** Each attachment can be removed before sending, and a removed file is not sent.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:5325 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10716
- **Where to find it:** Composer > attachment chip > its remove control (tooltip "Remove <file name>") (path not confirmed in the code; trust the screen)
- **Needs:** two files to upload, and an account where file uploads are allowed
- **Steps:**
  1. Attach two files with Upload from device.
  2. Hover over one chip and click its remove control.
  3. Look at the attachment bar: that chip should disappear and the other should stay.
  4. Send the message and check that the removed file is not in the sent message.

## S14.32 Per-file error display.

- **Expected:** When a file fails, the error is shown against that file (name and reason), not as one generic message.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:10356; apps/extension/src/side_panel.ts:10192; apps/extension/src/side_panel.ts:10779
- **Where to find it:** Composer > + button > Upload from device (path not confirmed in the code; trust the screen)
- **Needs:** a file over the size limit, and a way to make an upload fail (for example turning Wi-Fi off)
- **Steps:**
  1. Click the + button and pick a file that is over the per-file size limit.
  2. Look at the attachment bar: a notice should name that file and state the limit.
  3. Pick a file while the network is off, or otherwise make an upload fail.
  4. Look at that file's chip: it should show the file name with "could not be uploaded" and a Retry button, not one generic message.

## S14.34 File-retention explanation.

- **Expected:** The composer explains whether and how long attached files are kept.
- **Code:** done. Evidence moved: apps/extension/_locales/en/messages.json:593 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5376 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10716; apps/extension/src/side_panel.ts:10343
- **Where to find it:** Composer > + button > Temporary chat (hover for the full text) (path not confirmed in the code; trust the screen)
- **Needs:** an account that can use Temporary chat
- **Steps:**
  1. Click the + button beside the message box.
  2. Read the Temporary chat item and its line "Stays out of your history, search, memory and Library."; hover it to read the full text.
  3. Click Temporary chat to turn it on.
  4. Look at the notice above the message box, and compare it with Expected: it should say whether attached files are kept and for how long.
