---
id: "PLAN-vscode-014"
type: "test-plan"
title: "VS Code · 14. Attachment intake components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "14"
---
# VS Code · 14. Attachment intake components

15 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S14.01 Device file picker.

- **Expected:** The composer opens the device file chooser and the chosen file is attached to the next message.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3200; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2171; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6601
- **Where to find it:** + button (Attach or use tools) > Attach workspace files (labels found in the code)
- **Needs:** a folder open in a trusted workspace, a text file in that folder
- **Steps:**
  1. Sign in and open a folder in VS Code, and trust the workspace.
  2. Click the + button at the bottom of the message box.
  3. Click Attach workspace files.
  4. In the file dialog, select one text file and click Attach.
  5. Look at the message box: the file name should appear as a chip, ready for the next message.

## S14.02 Drag-and-drop intake.

- **Expected:** Dropping files onto the chat attaches them to the next message.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7720; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7648; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2176
- **Where to find it:** Drag files from Finder or the VS Code Explorer onto the message box (no visible label) (path not confirmed in the code; trust the screen)
- **Needs:** a folder open in a trusted workspace, one or more files on the Mac
- **Steps:**
  1. Sign in and open a folder in VS Code.
  2. Drag one or more text files from Finder onto the message box.
  3. Watch the message box border highlight while the files are over it, then release.
  4. Look at the message box: each dropped file should appear as a chip before sending.

## S14.03 Paste-image intake.

- **Expected:** Pasting an image from the clipboard into the composer attaches it as an image.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7730; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7648; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2176
- **Where to find it:** Click in the message box and press Cmd+V with an image on the clipboard (no visible label) (path not confirmed in the code; trust the screen)
- **Needs:** an image on the clipboard
- **Steps:**
  1. Sign in and open a folder in VS Code.
  2. Take a screenshot to the clipboard (Cmd+Ctrl+Shift+4), or copy an image.
  3. Click in the message box and press Cmd+V.
  4. Look at the message box: an image chip should appear and the text should not contain the image data.

## S14.08 URL attachment.

- **Expected:** The user can attach a web page by its URL so its content is used as context for the message.
- **Code:** done. Evidence present: apps/extension-vscode/src/data/composerContext.ts:272
- **Where to find it:** + button (Attach or use tools) > Web page, then type the link in the box titled Attach a web page (labels found in the code)
- **Needs:** a Free or paid account is not needed beyond sign-in; an internet connection and a public web page link
- **Steps:**
  1. Sign in and open a folder in VS Code.
  2. Click the + button at the bottom of the message box.
  3. Click Web page.
  4. In the input box, type a full https:// link to a public page and press Enter.
  5. Look at the message box: a chip named after the site's host should appear, or an error that the page could not be read.

## S14.11 Repository attachment.

- **Expected:** The user can attach a code repository (e.g. a GitHub repo) as the context for a task.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3754; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1494
- **Where to find it:** not found in the code. No repository attachment was found: the + menu (Attach workspace files, Selection, Open editors, Problems, Git changes, Terminal output, Web page, Browse the web) has no repository item, and the file picker is files-only. Searched apps/extension-vscode for repositor, repo and folder near attach.
- **Needs:** a code repository

## S14.12 Folder attachment.

- **Expected:** The user can attach a whole folder so the assistant can use the files inside it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3754; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1494
- **Where to find it:** not found in the code. No folder attachment was found: the file picker sets canSelectFolders to false (ChatStateManager.ts), and the + menu has no folder item. Searched apps/extension-vscode for folder near attach.
- **Needs:** a folder with files

## S14.15 Multiple-file selection.

- **Expected:** One pick action can select several files, and all of them are attached.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2171; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3200
- **Where to find it:** + button (Attach or use tools) > Attach workspace files, then select several files in the dialog and click Attach (labels found in the code)
- **Needs:** a folder open in a trusted workspace, three or more text files in it
- **Steps:**
  1. Sign in and open a folder in VS Code.
  2. Click the + button, then click Attach workspace files.
  3. In the file dialog, hold Cmd and click three or more text files, then click Attach.
  4. Look at the message box: every selected file should appear as its own chip.

## S14.16 Attachment thumbnail.

- **Expected:** An attached image shows a small visual thumbnail in the composer before sending.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7577
- **Where to find it:** Paste (Cmd+V) or drag an image (PNG or JPG) into the message box (no visible label) (path not confirmed in the code; trust the screen)
- **Needs:** an image file or an image on the clipboard
- **Steps:**
  1. Sign in and open a folder in VS Code.
  2. Copy an image or take a screenshot to the clipboard.
  3. Click in the message box and press Cmd+V.
  4. Look at the chip: it should show a small picture of the image instead of an icon.

## S14.17 File-type icon.

- **Expected:** Each non-image attachment shows an icon matching its file type (PDF, spreadsheet, code, other).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7555
- **Where to find it:** Drag a non-image file onto the message box (no visible label) (path not confirmed in the code; trust the screen)
- **Needs:** a few sample files of different types
- **Steps:**
  1. Sign in and open a folder in VS Code.
  2. Drag a file with a code extension (for example .ts) onto the message box, then drag a .csv and a .pdf in turn.
  3. Look at each chip's icon: code files show a code icon, csv a table icon, and other types a generic file icon.

## S14.18 Filename and file-size metadata.

- **Expected:** Each attachment shows its file name and size before sending.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7621
- **Where to find it:** Drag or paste a text file into the message box (no visible label) (path not confirmed in the code; trust the screen)
- **Needs:** a text file of known size
- **Steps:**
  1. Sign in and open a folder in VS Code.
  2. Drag a text file of known size onto the message box.
  3. Look at the chip: the file name and a size such as KB or B should show.
  4. Hover over the chip: the tooltip should show the name and size.

## S14.22 Ready-to-use state.

- **Expected:** The composer makes clear when an attachment is ready and the message can be sent with it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8476; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4861 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2176
- **Where to find it:** Attach any file, then look at the Send button (labels found in the code)
- **Needs:** a text file
- **Steps:**
  1. Sign in and open a folder in VS Code, with the message box empty.
  2. Note that the Send button is disabled.
  3. Drag one text file onto the message box.
  4. Wait until the chip stops looking faded, then look at the Send button: it should be enabled.

## S14.23 Partial-extraction notice.

- **Expected:** When only part of a file could be read or it was cut to a size limit, the user is told.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5965 (quoted code not found in the file now)
- **Where to find it:** + button (Attach or use tools) > Attach workspace files, choose a text file longer than 40,000 characters (labels found in the code)
- **Needs:** a text file longer than 40,000 characters
- **Steps:**
  1. Sign in and open a folder in VS Code that has a text file longer than 40,000 characters.
  2. Click the + button, then click Attach workspace files, choose that file and click Attach.
  3. Look at the chip: a Truncated note should appear.
  4. Hover over the chip: the tooltip should say only the first 40,000 characters are sent.

## S14.24 Unsupported-file notice.

- **Expected:** Adding a file type the chat cannot read shows a notice naming the file and why.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2221; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8476
- **Where to find it:** Drag a binary file (for example a .zip) onto the message box (labels found in the code)
- **Needs:** a binary file such as a .zip
- **Steps:**
  1. Sign in and open a folder in VS Code.
  2. Drag a .zip file onto the message box.
  3. Look at the chip: the file name should be followed by the reason in brackets.

## S14.28 Attachment removal.

- **Expected:** Each attachment can be removed before sending, and a removed file is not sent.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2214; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8496
- **Where to find it:** Attach a text file, then click the × on its chip (labels found in the code)
- **Needs:** a text file
- **Steps:**
  1. Sign in and open a folder in VS Code.
  2. Drag a text file onto the message box, or use + > Attach workspace files.
  3. Click the × on the chip; the chip should disappear and Send should disable if the box is empty.
  4. Type a question that asks what the file contains and send it; the reply should not use the removed file's content.

## S14.32 Per-file error display.

- **Expected:** When a file fails, the error is shown against that file (name and reason), not as one generic message.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8500; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2176
- **Where to find it:** Drag a file the chat refuses (for example a .zip) onto the message box (labels found in the code)
- **Needs:** a binary file such as a .zip and a text file
- **Steps:**
  1. Sign in and open a folder in VS Code.
  2. Drag a .zip file onto the message box.
  3. Look at that file's chip: its name should be followed by the reason, not a generic message.
  4. Drag a valid text file in the same drop and check that its chip shows no error.
