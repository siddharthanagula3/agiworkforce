---
id: "PLAN-mobile-021"
type: "test-plan"
title: "Mobile · 21. Code blocks and executable code presentation"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "21"
---
# Mobile · 21. Code blocks and executable code presentation

13 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S21.01 Language label.

- **Expected:** Each code block shows its language name in a header.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:494 (quoted code not found in the file now)
- **Where to find it:** Chat > send a message that asks for code > read the bar above the finished code block (labels found in the code)
- **Steps:**
  1. Sign in and open a chat.
  2. Type in the message box: Write a short Python function that adds two numbers, in a code block. Send it.
  3. Wait until the reply finishes.
  4. Look at the small grey text at the top-left of the code block. Compare with Expected: it should show the language name in lower case (for example python). A block with no language shows Plain text.

## S21.02 Syntax highlighting.

- **Expected:** Code is syntax-highlighted according to its language.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:496 (quoted code not found in the file now)
- **Where to find it:** Chat > send a message that asks for code > look at the colours in the finished code block (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Sign in and open a chat.
  2. Type in the message box: Write a short Python function that adds two numbers, in a code block. Send it.
  3. Wait until the reply finishes; the block is not coloured while it is still streaming.
  4. Look at the keywords, strings and numbers in the code. Compare with Expected: different parts of the code should have different colours.

## S21.03 Copy code.

- **Expected:** Each code block has a copy control that copies exactly its code.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:531 (quoted code not found in the file now); apps/mobile/src/features/chat/components/CodeBlockCopyButton.tsx:39
- **Where to find it:** Chat > send a message that asks for code > tap the copy button in the top-right of the code block (its accessible name is Copy code) (labels found in the code)
- **Steps:**
  1. Sign in, open a chat and ask for a short code sample in a code block. Wait until the reply finishes.
  2. Tap the copy icon in the header bar of the code block.
  3. Paste into the message box (or any text field) and compare the pasted text with the code block.
  4. Compare with Expected: the pasted text should be exactly the code, with no language name or header text, and the icon should briefly show a check mark.

## S21.04 Download source file.

- **Expected:** A code block can be downloaded as a source file with a sensible extension.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:790 (quoted code not found in the file now); apps/mobile/src/features/chat/utils/artifactExport.ts:67 (quoted code not found in the file now)
- **Where to find it:** Chat > send a message that asks for code > tap the download icon in the code block header (its accessible name is Download plus the file name, for example Download code.py) (labels found in the code)
- **Steps:**
  1. Sign in, open a chat and ask for a short Python function in a code block. Wait until the reply finishes.
  2. Tap the download icon in the header bar of the code block.
  3. In the sheet that opens, choose a place to keep the file (for example Files), then open the saved file.
  4. Compare with Expected: the file should have a sensible extension (for example .py for Python) and its content should match the code block.

## S21.09 Highlighted changed lines.

- **Expected:** Changed lines in a code suggestion are visually highlighted (added/removed).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:748 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ArtifactChangesView.tsx:73
- **Where to find it:** Chat > ask for a change as a diff > look at the added and removed lines in the diff code block (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Sign in and open a chat.
  2. Type in the message box: Show the change as a unified diff inside a diff code block: rename the variable x to total in this Python snippet, x = 1 then print(x). Send it.
  3. Wait until the reply finishes.
  4. Compare with Expected: added lines should have a green fill and removed lines a red fill, each line on its own row.

## S21.10 Diff formatting.

- **Expected:** Diffs render with diff formatting (+/- lines coloured, hunks readable).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:731 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:760 (quoted code not found in the file now)
- **Where to find it:** Chat > ask for a diff > read the diff block; Settings > AGI Code > Show + and - signs in diffs (labels found in the code)
- **Needs:** none (the AGI Code row may depend on the account mode; not traced)
- **Steps:**
  1. Sign in and ask for a diff in a diff code block, as in S21.09. Wait until the reply finishes.
  2. Read the lines: each line should keep its own row, and the hunk header lines (starting with @@) should be readable.
  3. Open the side menu, tap Settings, then tap AGI Code.
  4. Turn on Show + and - signs in diffs, go back to the chat and open the same diff. Compare with Expected: + and - signs now show at the start of changed lines, with their colours.

## S21.12 Run-code action.

- **Expected:** The user can have code run (sandbox or local) from the chat and see it execute.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:577; apps/mobile/src/features/chat/utils/toolCallAccumulator.ts:125
- **Where to find it:** Add to chat (the button labelled Add to chat next to the message box) > Add to Chat sheet > turn on Run code, then send a request that runs code (labels found in the code)
- **Needs:** a Cloud account with cloud code execution granted, and a model with code execution
- **Steps:**
  1. Sign in to a Cloud account whose plan includes cloud code execution, and choose a model that supports code execution.
  2. Tap the button labelled Add to chat next to the message box.
  3. In the sheet titled Add to Chat, turn on the Run code row.
  4. Type: Run this Python code and show the output: print(sum(range(10))). Send it, then wait for the reply.
  5. Compare with Expected: a Run code row should appear in the reply with its output, showing the printed result 45.

## S21.15 Output panel.

- **Expected:** Execution stdout is shown in a dedicated output panel under the code.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:550; apps/mobile/src/features/chat/utils/toolCallAccumulator.ts:119 (quoted code not found in the file now)
- **Where to find it:** Chat > Run code reply > tap the Run code row > read the Output heading (labels found in the code)
- **Needs:** a Cloud account with cloud code execution granted, and a model with code execution
- **Steps:**
  1. Run S21.12 first so that a Run code row exists.
  2. Tap the Run code row to open its details.
  3. Look under the heading Output (or Response for non-code tools).
  4. Compare with Expected: the printed text of the program (45 for the example) should appear under Output.

## S21.16 Standard-error panel.

- **Expected:** Standard error is shown separately (and visibly distinguished) from stdout.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:639; apps/mobile/src/features/chat/utils/toolCallAccumulator.ts:143
- **Where to find it:** Chat > Run code reply > tap the Run code row > look for the red Stderr heading (labels found in the code)
- **Needs:** a Cloud account with cloud code execution granted, and a model with code execution
- **Steps:**
  1. Run this Python code and wait for the reply: import sys then print('ok') then print('problem', file=sys.stderr).
  2. Tap the Run code row to open its details.
  3. Compare the Output section (ok) with the Stderr section (problem).
  4. Compare with Expected: Stderr should show in its own section, in red, separate from Output.

## S21.17 Execution-duration display.

- **Expected:** Each execution shows how long it took.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:166; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:192
- **Where to find it:** Chat > Run code reply > the right-hand label on the Run code row (for example 450ms or 1.2s) (labels found in the code)
- **Needs:** a Cloud account with cloud code execution granted, and a model with code execution
- **Steps:**
  1. Run S21.12 in Cloud mode.
  2. Look at the Run code row in the reply, on the right-hand side.
  3. Compare with Expected: a time such as 450ms or 1.2s should show after the run finishes.

## S21.18 Exit-status display.

- **Expected:** Each execution shows its outcome/exit status (success, failure with code).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:658; apps/mobile/src/features/chat/utils/toolCallAccumulator.ts:145
- **Where to find it:** Chat > Run code reply > read the status word on the Run code row, then tap the row and read Exit code (labels found in the code)
- **Needs:** a Cloud account with cloud code execution granted, and a model with code execution
- **Steps:**
  1. Run S21.12 (success) and then a failing program such as: import sys then sys.exit(3).
  2. Read the status word on each Run code row: Done for success, Failed for failure.
  3. Tap the failing row and look for the line Exit code 3.
  4. Compare with Expected: success shows Done and exit code 0 in green; the failure shows Failed and a red exit code line.

## S21.19 Generated-file output.

- **Expected:** Files produced by execution are listed and can be opened or downloaded.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1276; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:792 (quoted code not found in the file now)
- **Where to find it:** Chat > reply with a generated file card > tap the file card to open it > tap the download icon at the top (accessible name Download artifact) (labels found in the code)
- **Needs:** a Cloud account; a reply that produces a file
- **Steps:**
  1. Sign in to a Cloud account with a chat that produces a file (for example: Create a CSV file with three rows of sample data).
  2. Look for the file card in the reply, showing the file name.
  3. Tap the file card to open the full screen view.
  4. Tap the download icon at the top (accessible name Download artifact), then check the file that is saved or shared.
  5. Compare with Expected: the file should be listed and openable or downloadable.

## S21.21 Retry execution.

- **Expected:** A failed or finished execution can be re-run in place.
- **Code:** partial. Evidence moved: apps/mobile/src/features/chat/components/CodeRunAgain.tsx:35; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:279 (quoted code not found in the file now)
- **Known to be unfinished:** Switch-on: AGI_E2B_EXECUTION=1 and E2B_API_KEY in production (same as web).
- **Where to find it:** Chat > Run code reply (after the run has finished) > tap Run again under the code (labels found in the code)
- **Needs:** a Cloud account with cloud code execution granted, and a model with code execution
- **Steps:**
  1. Run S21.12 in Cloud mode and wait until the row shows Done or Failed.
  2. Under the reply's code block, find the button labelled Run again.
  3. If the approval setting is Ask every time, a dialog titled Run this code again? appears; tap its Run again button.
  4. Compare with Expected: a new run should appear with its own output and status, and the earlier run should stay visible.
