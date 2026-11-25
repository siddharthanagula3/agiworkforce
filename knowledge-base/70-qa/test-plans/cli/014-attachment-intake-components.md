---
id: "PLAN-cli-014"
type: "test-plan"
title: "CLI · 14. Attachment intake components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "14"
---
# CLI · 14. Attachment intake components

15 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S14.01 Device file picker.

- **Expected:** The composer opens the device file chooser and the chosen file is attached to the next message.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6215; apps/cli/src/tui/tui_app.rs:3278; apps/cli/src/claude_parity.rs:223; apps/cli/src/claude_parity.rs:395
- **Where to find it:** not found in the code. No device file chooser found. /attach and /files take a typed path, and @ opens a picker for workspace files only. Searched apps/cli/src for file-dialog code (rfd, FileDialog, NSOpenPanel, osascript, file chooser) and found none.

## S14.03 Paste-image intake.

- **Expected:** Pasting an image from the clipboard into the composer attaches it as an image.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4098; apps/cli/src/tui/tui_app.rs:916; apps/cli/src/tui/tui_app.rs:3278
- **Where to find it:** agi, then Ctrl+V in the message box (or type /attach clipboard) (some labels not found in the code; trust the screen)
- **Needs:** an image on the clipboard and a vision model selected
- **Steps:**
  1. Copy an image to the clipboard, for example with a screenshot.
  2. Start agi and click into the message box.
  3. Press Ctrl+V.
  4. Look for the notice 'attached <name>' in the chat, then type /attach list and compare with Expected.

## S14.08 URL attachment.

- **Expected:** The user can attach a web page by its URL so its content is used as context for the message.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7703; apps/cli/src/repl/mod.rs:937
- **Where to find it:** agi, then type /attach <url> in the message box (for example /attach https://example.com) (labels found in the code)
- **Needs:** a public web page URL and network access
- **Steps:**
  1. Start agi.
  2. Type /attach https://example.com and press Enter.
  3. Wait for the fetch to finish, then look for the notice in the chat that the page was added.
  4. Ask a question about the page's content and compare the answer with Expected.

## S14.11 Repository attachment.

- **Expected:** The user can attach a code repository (e.g. a GitHub repo) as the context for a task.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:421; apps/cli/src/tui/tui_app.rs:826
- **Where to find it:** not found in the code. No command attaches a code repository as task context. The only match is the --repo / -C flag in apps/cli/src/lib.rs, which points the whole program at a repository rather than attaching it. Searched apps/cli/src for github, /repo and repository attach terms.

## S14.12 Folder attachment.

- **Expected:** The user can attach a whole folder so the assistant can use the files inside it.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:221; apps/cli/src/claude_parity.rs:332; apps/cli/src/tui/tui_app.rs:6724
- **Where to find it:** agi, then type /add-dir <folder> in the message box, or type @dir/ to list a folder (labels found in the code)
- **Needs:** a folder inside the project folder
- **Steps:**
  1. Start agi in the project folder.
  2. Type /add-dir <a folder name> and press Enter.
  3. Type /add-dir with no folder to see the list of added folders.
  4. Compare the list with Expected and check that the folder is named.

## S14.15 Multiple-file selection.

- **Expected:** One pick action can select several files, and all of them are attached.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:223; apps/cli/src/claude_parity.rs:395; apps/cli/src/tui/tui_app.rs:6724; apps/cli/src/claude_parity.rs:398
- **Where to find it:** agi, then type /files <file1> <file2> in the message box (labels found in the code)
- **Needs:** two or three small text files in the project folder
- **Steps:**
  1. Start agi in a folder that holds two or three small text files.
  2. Type /files notes1.txt notes2.txt and press Enter (separate names with spaces).
  3. Look for one 'attached:' line per file in the reply.
  4. Type /files with no names to see the Context files list.

## S14.18 Filename and file-size metadata.

- **Expected:** Each attachment shows its file name and size before sending.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:592 (quoted code not found in the file now)
- **Where to find it:** agi, then type /attach <image file> in the message box, then /attach list (labels found in the code)
- **Needs:** an image file in the project folder and a vision model
- **Steps:**
  1. Start agi in a folder that holds a PNG or JPG image.
  2. Type /attach <image file name> and press Enter.
  3. Read the reply 'Attached <name> (<size>)...' and the chip line above the message box.
  4. Type /attach list and compare the name and size with Expected.

## S14.22 Ready-to-use state.

- **Expected:** The composer makes clear when an attachment is ready and the message can be sent with it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6269; apps/cli/src/tui/tui_app.rs:6215; apps/cli/src/tui/tui_app.rs:3278
- **Where to find it:** agi, then type /attach <image file> in the message box (labels found in the code)
- **Needs:** an image file and a vision model
- **Steps:**
  1. Start agi with a vision model selected.
  2. Type /attach <image file name> and press Enter.
  3. Look for the reply 'Attached <name>. It goes with your next message; /attach remove drops it.'
  4. Look at the chip line above the message box, type a question, press Enter, and compare with Expected.

## S14.23 Partial-extraction notice.

- **Expected:** When only part of a file could be read or it was cut to a size limit, the user is told.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:404; apps/cli/src/claude_parity.rs:395; apps/cli/src/agent/mod.rs:1529; apps/cli/src/tui/tui_app.rs:6724
- **Where to find it:** agi, then type /files <large text file> in the message box (labels found in the code)
- **Needs:** a text file over 40,000 characters in the project folder
- **Steps:**
  1. Create a plain text file in the project folder longer than 40,000 characters.
  2. Start agi and type /files <that file name> and press Enter.
  3. Look for the line 'truncated to budget:' followed by the file path.
  4. Compare with Expected.

## S14.24 Unsupported-file notice.

- **Expected:** Adding a file type the chat cannot read shows a notice naming the file and why.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:471 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:4573; apps/cli/src/tui/tui_app.rs:6215
- **Where to find it:** agi, then type /attach <file> in the message box with a file that is not an image, PDF or Office document (labels found in the code)
- **Needs:** a file of an unsupported type such as .txt
- **Steps:**
  1. Start agi in a folder that holds a .txt or .zip file.
  2. Type /attach <that file name> and press Enter.
  3. Look for the reply 'Could not attach <name>: <name> is not an image, PDF or Office document'.
  4. Compare with Expected.

## S14.28 Attachment removal.

- **Expected:** Each attachment can be removed before sending, and a removed file is not sent.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6215; apps/cli/src/tui/tui_app.rs:943; apps/cli/src/tui/tui_app.rs:3278
- **Where to find it:** agi, then type /attach remove in the message box (or /attach remove <n> or /attach remove all) (labels found in the code)
- **Needs:** two image files and a vision model
- **Steps:**
  1. Attach two images with /attach <image>.
  2. Type /attach list and note the numbers.
  3. Type /attach remove 1 and press Enter.
  4. Type /attach list and check that only the other image remains, then compare with Expected.

## S14.31 Duplicate-file treatment.

- **Expected:** Adding the same file twice is detected and handled visibly (skipped, merged or flagged) rather than sent twice silently.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:880
- **Where to find it:** agi, then type /attach <image file> twice in the message box (labels found in the code)
- **Needs:** an image file and a vision model
- **Steps:**
  1. Start agi with a vision model selected.
  2. Type /attach <image file name> and press Enter.
  3. Type the same command again and press Enter.
  4. Look for the reply '<name> (<size>) is already attached' and compare with Expected.

## S14.32 Per-file error display.

- **Expected:** When a file fails, the error is shown against that file (name and reason), not as one generic message.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:407; apps/cli/src/claude_parity.rs:395; apps/cli/src/tui/tui_app.rs:4573
- **Where to find it:** agi, then type /files <existing file> <missing file> in the message box (labels found in the code)
- **Needs:** one existing text file and one missing file name
- **Steps:**
  1. Start agi in the project folder.
  2. Type /files notes1.txt missing-file.txt and press Enter.
  3. Look for an 'attached:' line for the first file and a 'failed:' line that names the second file and gives a reason.
  4. Compare with Expected.

## S14.33 Batch-upload summary.

- **Expected:** After adding several files at once the user sees one summary of what was attached and what was refused.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:395; apps/cli/src/claude_parity.rs:223; apps/cli/src/tui/tui_app.rs:6724; apps/cli/src/claude_parity.rs:398
- **Where to find it:** agi, then type /files <name1> <name2> <name3> in the message box (labels found in the code)
- **Needs:** three small text files, one of them missing or repeated for a fuller check
- **Steps:**
  1. Start agi in a folder with three small text files.
  2. Type /files with the three file names and press Enter.
  3. Read the reply: one line per file for 'attached:', 'already attached:', 'truncated to budget:' or 'failed:'.
  4. Compare with Expected.

## S14.36 Alternative processing-path explanation.

- **Expected:** When a file cannot go the normal way, the user is told the alternative (switch model or mode, convert, or what is sent instead).
- **Code:** done. Evidence present: apps/cli/src/mentions.rs:340; apps/cli/src/mentions.rs:368; apps/cli/src/tui/tui_app.rs:4573
- **Where to find it:** agi, then pick a model without vision with /model, then type /attach <image file> in the message box (labels found in the code)
- **Needs:** a model without vision support in this build
- **Steps:**
  1. Type /model and choose a model that does not accept images (the code does not list which one in this build).
  2. Type /attach <image file name> and press Enter.
  3. Look for the reply '<model name> does not accept images; switch to a vision model with /model first'.
  4. Compare with Expected.
