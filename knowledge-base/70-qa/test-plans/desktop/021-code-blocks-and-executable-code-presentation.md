---
id: "PLAN-desktop-021"
type: "test-plan"
title: "Desktop · 21. Code blocks and executable code presentation"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "21"
---
# Desktop · 21. Code blocks and executable code presentation

19 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S21.01 Language label.

- **Expected:** Each code block shows its language name in a header.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:80 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:41 (quoted code not found in the file now)
- **Where to find it:** Ask in chat for code in any language, so the answer has a code block; the header bar of the block shows the language name (for example python) on the left, next to the buttons 'Copy', 'Edit', download and 'Expand code' (labels found in the code)
- **Steps:**
  1. Send a message in the chat that asks for a short Python script
  2. Wait for the answer to finish and look at the code block that appears
  3. Read the header bar at the top of the code block
  4. Compare the word at the left of the header with the language of the code

## S21.02 Syntax highlighting.

- **Expected:** Code is syntax-highlighted according to its language.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:98 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:1
- **Where to find it:** no screen of its own. Highlighting is done by HighlightedCode and shikiHighlighter; there is no control. It is turned off while the answer is still streaming.
- **Steps:**
  1. Send a message in the chat that asks for a short Python script with a comment and a string
  2. Look at the colours of keywords, strings and comments in the code block
  3. Compare with Expected: code should be coloured by its language

## S21.03 Copy code.

- **Expected:** Each code block has a copy control that copies exactly its code.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:86 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:48 (quoted code not found in the file now)
- **Where to find it:** Any code block in an answer > 'Copy' button in the block header bar (tooltip-free text button; its accessible name is 'Copy code') (labels found in the code)
- **Steps:**
  1. Send a message in the chat that asks for a short Python script
  2. Click the 'Copy' button in the top bar of the code block
  3. Paste into a text field (for example the message box) with Command+V
  4. Compare the pasted text with the code in the block: it should match exactly, with no extra header or line numbers

## S21.04 Download source file.

- **Expected:** A code block can be downloaded as a source file with a sensible extension.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:108; packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:110; packages/ui/unified-chat/src/components/markdown/codeFileName.ts:113
- **Where to find it:** Any code block in an answer > download icon in the header bar (no visible words; hover shows the name 'Download' followed by the file name, for example 'Download script.py') (labels found in the code)
- **Steps:**
  1. Send a message in the chat that asks for a short Python script
  2. Hover over the download icon in the code block header and read the tooltip
  3. Click the download icon
  4. Open the downloaded file and check its extension matches the language (for example .py for Python)

## S21.08 Full-screen code view.

- **Expected:** A code block can be opened in a full-screen/expanded view.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:199; packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:240; packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:180
- **Where to find it:** Any code block in an answer > expand icon in the header bar (tooltip 'Expand code'); it opens a large dialog titled with the language followed by 'code' (labels found in the code)
- **Steps:**
  1. Send a message in the chat that asks for a long Python script
  2. Hover over the expand icon and read the tooltip 'Expand code'
  3. Click the expand icon
  4. Look for the full-screen dialog with the title like 'python code', the code, and the 'Close expanded code' icon at the top right

## S21.09 Highlighted changed lines.

- **Expected:** Changed lines in a code suggestion are visually highlighted (added/removed).
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1702 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx:27; packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:91 (quoted code not found in the file now)
- **Where to find it:** Send a message that asks for a diff, so the answer has a code block whose fence language is 'diff' (lines starting with + and -); the lines are coloured green for added and red for removed (labels found in the code)
- **Steps:**
  1. Send a message in the chat that asks for a short unified diff of a code change, in a diff code block
  2. Look at the code block with the lines that start with + and -
  3. Check that added lines have a green background and removed lines have a red background
  4. Compare with Expected: changed lines are highlighted

## S21.10 Diff formatting.

- **Expected:** Diffs render with diff formatting (+/- lines coloured, hunks readable).
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:98 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:12
- **Where to find it:** Same as S21.09: a code block whose fence language is 'diff' in an answer; the lines show the +/- diff formatting (labels found in the code)
- **Steps:**
  1. Send a message in the chat that asks for a diff of a small change
  2. Look at the diff block: each line should be on its own row with + or - at the start
  3. Check that hunk header lines (starting with @@) are readable in the block

## S21.12 Run-code action.

- **Expected:** The user can have code run (sandbox or local) from the chat and see it execute.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4858; apps/web/features/chat/components/messages/MessageBubble.tsx:2799
- **Where to find it:** Message box > the '+' menu (the plus button, exact label not confirmed in code) > 'Run code' toggle row (labels found in the code)
- **Needs:** a model that can run code (Auto works); deployment must have code execution switched on (see note)
- **Steps:**
  1. Open the message box in the chat
  2. Open the '+' menu next to the message box
  3. Click 'Run code' to turn it on
  4. Send a message that asks for a Python calculation
  5. Look for the 'Code Execution' block under the answer and check that it shows 'Running Python…' and then the result

## S21.13 Runtime/language selection where offered.

- **Expected:** Where multiple runtimes exist, the user can choose the runtime/language for execution.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeComposer.tsx:326; apps/web/lib/e2b/runtime.ts:156
- **Where to find it:** The /code page (Code workspace), in the environment select field: the first option is the default runtime, followed by optgroups for coding harnesses and images (labels found in the code)
- **Needs:** a signed-in account; the Code page for the account
- **Steps:**
  1. Open the Code page of the app
  2. Open the environment section of the new task form
  3. Open the select field for the environment
  4. Compare the options: default runtime plus coding harness and image groups

## S21.15 Output panel.

- **Expected:** Execution stdout is shown in a dedicated output panel under the code.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:84; apps/web/features/chat/components/messages/MessageBubble.tsx:2799
- **Where to find it:** After a code run in the chat (see S21.12), the 'Code Execution' block under the answer > 'Output' section (labels found in the code)
- **Needs:** a model that can run code and an execution gate that is on
- **Steps:**
  1. Turn on 'Run code' in the '+' menu
  2. Send a message that asks for code that prints a line of text
  3. Click the 'Code Execution' block header if it is collapsed
  4. Look for the 'Output' label and the printed text in a monospace box

## S21.16 Standard-error panel.

- **Expected:** Standard error is shown separately (and visibly distinguished) from stdout.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:99; apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:108
- **Where to find it:** After a code run that writes to error output, in the 'Code Execution' block under the answer > 'Stderr' section (red label) (labels found in the code)
- **Needs:** a model that can run code and an execution gate that is on
- **Steps:**
  1. Turn on 'Run code' in the '+' menu
  2. Send a message that asks for Python code that raises an error
  3. Look at the 'Code Execution' block under the answer
  4. Check that the 'Stderr' label and its box are shown in red, separate from 'Output'

## S21.18 Exit-status display.

- **Expected:** Each execution shows its outcome/exit status (success, failure with code).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:127; apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:46
- **Where to find it:** The 'Code Execution' block under an answer: the status icon in its header (a tick for success, a cross for failure) and the text 'Exit code:' when the code failed (labels found in the code)
- **Needs:** a model that can run code and an execution gate that is on
- **Steps:**
  1. Turn on 'Run code' in the '+' menu
  2. Send a message that asks for Python code that calls exit with the number 3
  3. Look at the 'Code Execution' header icon: it should be a cross
  4. Read the text 'Exit code: 3' inside the block and compare with Expected

## S21.19 Generated-file output.

- **Expected:** Files produced by execution are listed and can be opened or downloaded.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:1524; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1669
- **Where to find it:** Chat '+' menu > 'Office files' (option to create files), then the answer shows a generated file as a download chip or preview under the answer (labels found in the code)
- **Needs:** a paid account that allows file creation (not confirmed); no file to upload
- **Steps:**
  1. Open the '+' menu next to the message box
  2. Choose 'Office files' and pick an output format
  3. Send a message that asks for a small spreadsheet
  4. Look under the answer for the generated file: an image preview, a spreadsheet preview, or a download chip with the file name
  5. Click the file and check that it opens or downloads

## S21.20 Plot output.

- **Expected:** Plots/images produced by execution render inline.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:115; apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:28
- **Where to find it:** After a code run that draws a chart (see S21.12), the 'Code Execution' block shows a 'Plot 1' label and the image under the answer (some labels not found in the code; trust the screen)
- **Needs:** a model that can run code and an execution gate that is on
- **Steps:**
  1. Turn on 'Run code' in the '+' menu
  2. Send a message that asks for a Python script that plots a sine wave with matplotlib and saves it as a PNG image
  3. Look at the 'Code Execution' block under the answer
  4. Check that the label 'Plot 1' is shown above a picture of the chart

## S21.21 Retry execution.

- **Expected:** A failed or finished execution can be re-run in place.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. No retry control was found in CodeExecutionBlock.tsx or in apps/web/lib/e2b/gate.ts. The 'Retry' button in MessageBubble.tsx regenerates the answer, not the run. The plan marks this partial.

## S21.22 Stop execution.

- **Expected:** A running execution can be stopped by the user.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. No stop control specific to a code run was found. The composer has a turn-level stop (onStop in ChatComposerNew.tsx); its visible label was not confirmed. The run-stopped text is CODE_RUN_STOPPED_MESSAGE in apps/web/lib/e2b/types.ts.
- **Needs:** a running code execution, a model that can run code, and an execution gate that is on

## S21.25 Edit in Canvas.

- **Expected:** A code block can be opened in an editable canvas/editor next to the chat.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:181; apps/web/features/chat/components/messages/MessageBubble.tsx:1456; apps/web/features/chat/components/messages/MessageBubble.tsx:2894; apps/web/features/chat/utils/artifact-detector.ts:59
- **Where to find it:** Any code block in an answer > 'Edit' button in the header bar (accessible name 'Edit this code beside the chat') (labels found in the code)
- **Steps:**
  1. Send a message in the chat that asks for a short Python script
  2. Wait until the answer has finished (the Edit button is hidden while streaming)
  3. Click the 'Edit' button in the code block header
  4. Look for an editable code panel that opens beside the chat with the same code

## S21.29 Execution-permission explanation.

- **Expected:** Before or when code runs, the user is told what permission it needs/what it can touch and why.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/CapabilitiesSection.tsx:78 (quoted code not found in the file now)
- **Where to find it:** Settings > Capabilities > 'Code execution and file creation' (switch 'Cloud code execution and file creation') (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings from the app menu
  2. Click 'Capabilities' in the Settings list
  3. Find the section 'Code execution and file creation'
  4. Read the line under the switch: 'Run code and create files in a sandbox that can reach only GitHub, npm and PyPI.' and compare with Expected

## S21.30 Unsupported-runtime state.

- **Expected:** If the requested runtime/execution is unavailable, the UI states that clearly instead of failing silently.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6115; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1638
- **Where to find it:** Message box > '+' menu > 'Run code' row when the model cannot run code: the row is greyed out and its hover text says that code is not available for this model (labels found in the code)
- **Needs:** a model without code execution in the model picker
- **Steps:**
  1. Choose a model that cannot run code in the model picker (not Auto)
  2. Open the '+' menu next to the message box
  3. Hover over the 'Run code' row and read the tooltip
  4. Check that the row is disabled and the text says: Run code isn't available for this model on this deployment. Choose Auto or a model that can run code.
