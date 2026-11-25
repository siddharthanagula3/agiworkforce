---
id: "PLAN-chrome-016"
type: "test-plan"
title: "Chrome · 16. User-message components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "16"
---
# Chrome · 16. User-message components

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S16.01 User identity/avatar.

- **Expected:** The author of each turn is distinguishable visually (avatar, name, alignment/bubble style or terminal marker) AND announced to assistive tech (R-n).
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:384; apps/extension/src/features/side-panel/bubbles.ts:388
- **Where to find it:** AGI Extension side panel > type in the box that shows "How can I help you today?" > Send (labels found in the code)
- **Steps:**
  1. Open the AGI Extension side panel from its toolbar icon.
  2. Click the box that shows "How can I help you today?", type "Hello", and click Send.
  3. Look at your message in the transcript. It sits in its own bubble, separate from the reply.
  4. With VoiceOver on, move to your message and listen for "You said:" before the text is read.

## S16.02 Message text.

- **Expected:** The text the user sent is shown in their message in the transcript.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:791; apps/extension/src/side_panel.ts:5804; apps/extension/manifest.json:84; apps/extension/src/side_panel.ts:5934
- **Where to find it:** AGI Extension side panel > type in the box that shows "How can I help you today?" > Send (labels found in the code)
- **Steps:**
  1. Open the AGI Extension side panel from its toolbar icon.
  2. Click the box that shows "How can I help you today?", type "Hello from QA", and click Send.
  3. Look at the transcript: the words you sent appear in your message bubble.

## S16.03 Attachment group.

- **Expected:** Files and images sent with a user turn are listed on that message (thumbnail or named chip) after sending.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:8681; apps/extension/src/side_panel.ts:5805; apps/extension/src/features/side-panel/bubbles.ts:405; apps/extension/src/features/side-panel/bubbles.ts:421; apps/extension/src/features/background/conversation-history.ts:437; apps/extension/src/features/background/conversation-history.ts:544
- **Where to find it:** AGI Extension side panel > Add attachment (+ button) > Upload from device (labels found in the code)
- **Needs:** a file to upload (PNG, JPEG, WebP or GIF image, PDF, or text or Markdown file)
- **Steps:**
  1. Open the AGI Extension side panel from its toolbar icon.
  2. Click the + button labelled "Add attachment", then click "Upload from device".
  3. Choose a PNG image or a PDF from your Mac and wait until it is ready to send.
  4. Type a short message and click Send.
  5. Look at your sent message: the image shows as a thumbnail, and the other file shows as a named chip with its file name.

## S16.04 Source and context chips.

- **Expected:** A sent user message shows chips for the non-file context it carried (quoted text, connector/MCP resources, page, editor selection, @mentions).
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:5816 (quoted code not found in the file now); apps/extension/src/features/side-panel/bubbles.ts:437; apps/extension/src/features/background/conversation-history.ts:558
- **Where to find it:** AGI Extension side panel > Add attachment (+ button) > Add the browser page (labels found in the code)
- **Needs:** a normal website tab (not a Chrome internal page)
- **Steps:**
  1. Open a normal website in a Chrome tab and make it the active tab.
  2. Open the AGI Extension side panel, click the + button labelled "Add attachment", and click "Add the browser page".
  3. Type a short message and click Send.
  4. Look at your sent message: a link chip with the page title (or host name) appears on it, and clicking the chip opens the page in a new tab.

## S16.05 Timestamp.

- **Expected:** Each user message exposes when it was sent (inline or on demand).
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:250 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5801; apps/extension/manifest.json:84; apps/extension/src/side_panel.ts:5934
- **Where to find it:** AGI Extension side panel > send any message > look under the sent message (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open the AGI Extension side panel from its toolbar icon.
  2. Type "Hello" and click Send.
  3. Look at the row under your message: a small grey time of day is shown beside it, always visible.
  4. Compare the time with the clock on your Mac.

## S16.09 Resend action.

- **Expected:** A sent user message can be re-sent unchanged from the message itself to get a fresh reply.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:634; apps/extension/src/features/side-panel/bubbles.ts:641; apps/extension/src/side_panel.ts:9577; apps/extension/src/side_panel.ts:9588
- **Where to find it:** AGI Extension side panel > hover your sent message > Send again (labels found in the code)
- **Needs:** a signed-in account with the reply finished
- **Steps:**
  1. Open the AGI Extension side panel, type "Hello", and click Send.
  2. Wait until the reply finishes.
  3. Move the mouse over your sent message and find the round icon button with the label "Send again" in the row under it.
  4. Click "Send again" and wait for a new reply.
  5. Look at the transcript: your message text is unchanged, and the old reply is replaced by a new one.

## S16.15 Delivery-failed state.

- **Expected:** When a user message fails to deliver, the transcript shows a clear failed state for that turn.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:316; apps/extension/src/side_panel.ts:5046 (quoted code not found in the file now); apps/extension/manifest.json:84; apps/extension/src/side_panel.ts:5934
- **Where to find it:** AGI Extension side panel > a message that fails to send > red error box under the reply (labels found in the code)
- **Needs:** a way to make a send fail (not traced)
- **Steps:**
  1. Make a send fail (the way to cause a failure was not traced in the code).
  2. Look at the transcript after the failed send.
  3. Look for an alert box with error text and a Retry button; it sits on the reply bubble that follows your message.

## S16.16 Retry-send action.

- **Expected:** A failed send offers Retry that re-sends the same turn (text and attachments) and replaces the failure with the new outcome.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:9606; apps/extension/src/side_panel.ts:9530; apps/extension/src/side_panel.ts:9498; apps/extension/src/side_panel.ts:1289; apps/extension/src/side_panel.ts:9502
- **Where to find it:** AGI Extension side panel > a failed reply > Retry (labels found in the code)
- **Needs:** a failed send with an attachment or text to resend
- **Steps:**
  1. Make a send fail (the way to cause a failure was not traced in the code).
  2. In the red error box under the failed reply, click Retry; the button greys out after one click.
  3. Wait for the new outcome.
  4. Look at the transcript: the failure is gone and replaced by a new reply, with your text and attachments sent again.
