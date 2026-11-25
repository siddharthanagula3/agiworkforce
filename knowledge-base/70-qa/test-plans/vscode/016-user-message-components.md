---
id: "PLAN-vscode-016"
type: "test-plan"
title: "VS Code · 16. User-message components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "16"
---
# VS Code · 16. User-message components

10 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S16.01 User identity/avatar.

- **Expected:** The author of each turn is distinguishable visually (avatar, name, alignment/bubble style or terminal marker) AND announced to assistive tech (R-n).
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4257 (quoted code not found in the file now)
- **Where to find it:** Chat panel > send any message > look at the right-aligned bubble. There is no visible name or avatar; the author label "You said:" is screen-reader text only (webviewContent.ts 5771). (labels found in the code)
- **Steps:**
  1. Open the AGI chat panel in the VS Code sidebar.
  2. Type "Hello" in the message box and press Enter.
  3. Look at your message: it is a bubble on the right, with a dashed border while it is sending.
  4. Compare with Expected: the author is shown by alignment and bubble style, but no visible name or avatar appears; the name is only announced to screen readers.

## S16.02 Message text.

- **Expected:** The text the user sent is shown in their message in the transcript.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5769; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5811; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:4643; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat panel > type a message and press Enter > the bubble shows your text. (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open the AGI chat panel.
  2. Type "Hello, list the files here" in the message box.
  3. Press Enter.
  4. Look at the right-aligned bubble: the same text should appear exactly as typed.

## S16.03 Attachment group.

- **Expected:** Files and images sent with a user turn are listed on that message (thumbnail or named chip) after sending.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5599
- **Where to find it:** Chat panel > + (Attach or use tools) > attach a file, then send > chips appear under your bubble. (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Open the AGI chat panel.
  2. Click the + button ("Attach or use tools") above the message box and attach a file or image.
  3. Check that the file chip shows in the strip above the message box.
  4. Type a message and press Enter.
  5. Look under your bubble: the file is listed as a chip named after the file (with an icon). Compare with Expected.

## S16.04 Source and context chips.

- **Expected:** A sent user message shows chips for the non-file context it carried (quoted text, connector/MCP resources, page, editor selection, @mentions).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5599; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5550
- **Where to find it:** Chat panel > + (Attach or use tools) > turn on Browse the web > send > the sent message shows a Context chip list. (labels found in the code)
- **Steps:**
  1. Open the AGI chat panel.
  2. Click the + button ("Attach or use tools") and turn on "Browse the web".
  3. Type a message and press Enter.
  4. Look under your bubble: a "Browse the web" chip appears, and a Context (count) toggle lists the non-file context when it was sent.

## S16.09 Resend action.

- **Expected:** A sent user message can be re-sent unchanged from the message itself to get a fresh reply.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4925; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6032; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:315
- **Where to find it:** Chat panel > hover over your sent message > click the Resend icon (redo arrow) on the message. (labels found in the code)
- **Steps:**
  1. Open the AGI chat panel and send a message, then wait for the reply.
  2. Move the pointer over your message bubble so the action icons appear under it.
  3. Hover the redo-arrow icon to see the tooltip "Resend", then click it.
  4. Look at the transcript: a new reply comes back for the same unchanged text, with a new message entry.

## S16.10 Branch-from-message action.

- **Expected:** From a chosen user message the user can start a new branch conversation that contains the thread up to that message.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4925; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6088; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6111
- **Where to find it:** Chat panel > hover over your sent message > click the Branch icon (fork icon) on the message. (labels found in the code)
- **Needs:** a conversation with at least two turns
- **Steps:**
  1. Open the AGI chat panel and send two or more messages with replies.
  2. Move the pointer over an earlier message bubble and hover the fork icon to see the tooltip "Branch".
  3. Click it.
  4. Look at the result: a new session opens with the message ready to edit in the message box; the first message starts a fresh conversation.

## S16.14 Delivery-pending state.

- **Expected:** While a user message is not yet accepted by the service, the message shows a pending/sending/queued state.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5779
- **Where to find it:** Chat panel > send a message > look under your bubble for "Sending" until the service accepts it. (labels found in the code)
- **Steps:**
  1. Open the AGI chat panel.
  2. Type a message and press Enter.
  3. Look immediately under your bubble for the caption "Sending".
  4. Compare with Expected: the caption should change once the service accepts the message.

## S16.15 Delivery-failed state.

- **Expected:** When a user message fails to deliver, the transcript shows a clear failed state for that turn.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:686; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4506; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7984; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat panel > send a message that fails > look under your bubble for "Not sent" and the red error block. (labels found in the code)
- **Needs:** a way to make a send fail
- **Steps:**
  1. Open the AGI chat panel.
  2. Cause a failed send, such as losing the network or signing out, then type a message and press Enter.
  3. Look under the bubble for "Not sent" in the error colour.
  4. Look below the transcript for the error block with a "Retry" button.

## S16.16 Retry-send action.

- **Expected:** A failed send offers Retry that re-sends the same turn (text and attachments) and replaces the failure with the new outcome.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3346 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3414 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:4910; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat panel > after a failed send, click "Retry" in the error block. (labels found in the code)
- **Needs:** a way to make a send fail, and an attachment for the attachment check
- **Steps:**
  1. Make a send fail as in S16.15.
  2. Click the "Retry" button in the error block under the transcript.
  3. Look: the error block disappears and the same text is sent again with a new reply.
  4. Compare with Expected: the failure should be replaced by the new outcome; check the attachments are still listed on the message.

## S16.17 Queued-message state.

- **Expected:** A message sent while a reply is still running is shown as queued (not yet sent) until it goes out.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5107; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:4702; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:634; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat panel > send a message while a reply is still running > look under the new bubble for "Queued". (labels found in the code)
- **Steps:**
  1. Open the AGI chat panel and send a long request so a reply starts streaming.
  2. While the reply is still running, type a second message and press Enter (the button beside Stop reads "Queue" or "Steer").
  3. Look under the new bubble for "Queued" with Edit and Cancel icons.
  4. Wait for the first reply to finish: the "Queued" caption should clear and the message should go out.
