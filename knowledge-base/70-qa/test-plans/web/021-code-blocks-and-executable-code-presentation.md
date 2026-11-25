---
id: "PLAN-web-021"
type: "test-plan"
title: "Web · 21. Code blocks and executable code presentation"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "21"
---
# Web · 21. Code blocks and executable code presentation

19 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S21.01 Language label.

- **Expected:** Each code block shows its language name in a header.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:80 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:41 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E041 [PASS; Rendered code label, copied code, and verified Markdown download]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Chat > ask for code (e.g. type "Write a Python hello world" and send) > top bar of the code block (labels found in the code)
- **Steps:**
  1. Sign in and open a new chat.
  2. Type "Write a Python hello world in a code block" and send.
  3. Look at the bar above the code box: the language name (for example "python") should show there.
  4. Compare with Expected: each code block shows its language name in a header.

## S21.02 Syntax highlighting.

- **Expected:** Code is syntax-highlighted according to its language.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:98 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:1
- **Where to find it:** Chat > ask for code (e.g. type "Write a Python hello world" and send) > the code block (labels found in the code)
- **Steps:**
  1. Sign in and open a new chat.
  2. Type "Write a Python function that adds two numbers" and send.
  3. Look at the code block: keywords, strings and names should be in different colours.
  4. Compare with Expected: code is coloured according to its language.

## S21.03 Copy code.

- **Expected:** Each code block has a copy control that copies exactly its code.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:86 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:48 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E041 [PASS; Rendered code label, copied code, and verified Markdown download]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Chat > ask for code > code block > Copy code button (labels found in the code)
- **Steps:**
  1. Send a prompt that returns a code block, such as "Write a Python hello world".
  2. Move the mouse over the code block and click the Copy control in its top bar.
  3. Paste into the composer (Cmd+V) and compare with the code block.
  4. Compare with Expected: the pasted text matches the code exactly.

## S21.04 Download source file.

- **Expected:** A code block can be downloaded as a source file with a sensible extension.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:108; packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:110; packages/ui/unified-chat/src/components/markdown/codeFileName.ts:113
- **Where to find it:** Chat > ask for code > code block > Download button (top bar) (labels found in the code)
- **Steps:**
  1. Send a prompt that returns a code block, such as "Write a Python hello world".
  2. Move the mouse over the code block and click the Download control in its top bar.
  3. Open Downloads in Finder and open the file.
  4. Compare with Expected: a source file with a sensible extension (for example .py) and the same code.

## S21.08 Full-screen code view.

- **Expected:** A code block can be opened in a full-screen/expanded view.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:199; packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:240; packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:180
- **Where to find it:** Chat > ask for code > code block > Expand code button (labels found in the code)
- **Steps:**
  1. Send a prompt that returns a code block, such as "Write a long Python script".
  2. Click the Expand control in the code block's top bar.
  3. Look at the full-screen dialog that opens; its title should read like "Python code".
  4. Compare with Expected: the code opens in an expanded view and closes with the Close control.

## S21.09 Highlighted changed lines.

- **Expected:** Changed lines in a code suggestion are visually highlighted (added/removed).
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1702 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx:27; packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:91 (quoted code not found in the file now)
- **Where to find it:** not found in the code. The changed-line highlighting exists in ArtifactChangesView.tsx (aria label at line 104) and in ArtifactPreview.tsx, but I did not find the visible control that opens the compare view, so the path is unconfirmed.
- **Needs:** a second version of an artifact

## S21.10 Diff formatting.

- **Expected:** Diffs render with diff formatting (+/- lines coloured, hunks readable).
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:98 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:12
- **Where to find it:** Chat > ask for a diff in a fenced block > diff code block (labels found in the code)
- **Steps:**
  1. Type "Show a git diff that renames a variable in a small Python file, in a diff code block" and send.
  2. Look at the answer's code block: lines starting with + and - should be coloured differently.
  3. Compare with Expected: diff lines are coloured and hunk headers are readable.

## S21.12 Run-code action.

- **Expected:** The user can have code run (sandbox or local) from the chat and see it execute.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4858; apps/web/features/chat/components/messages/MessageBubble.tsx:2799
- **Where to find it:** Composer > + button > Run code (labels found in the code)
- **Needs:** a model that can run code on this deployment
- **Steps:**
  1. Sign in and open a new chat with Auto selected.
  2. Click the + button beside the composer and click Run code.
  3. Type "Use Python to print the sum of 2 and 3" and send.
  4. Look for a Code Execution block under the answer that shows Output.
  5. Compare with Expected: the code runs and its result appears.

## S21.13 Runtime/language selection where offered.

- **Expected:** Where multiple runtimes exist, the user can choose the runtime/language for execution.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeComposer.tsx:326; apps/web/lib/e2b/runtime.ts:156
- **Where to find it:** Address bar: go to /code > Coding harness dropdown (labels found in the code)
- **Needs:** a paid account, or whatever the deployment allows
- **Steps:**
  1. Open the /code page.
  2. Click the Coding harness dropdown.
  3. Look at the list of runtimes (the default is "No agent, Python 3, Node.js, git, curl, build-essential, GitHub CLI").
  4. Compare with Expected: more than one runtime can be chosen.

## S21.15 Output panel.

- **Expected:** Execution stdout is shown in a dedicated output panel under the code.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:84; apps/web/features/chat/components/messages/MessageBubble.tsx:2799
- **Where to find it:** Composer > + > Run code, then send a prompt that runs code > Code Execution block > Output (labels found in the code)
- **Needs:** a model that can run code on this deployment
- **Steps:**
  1. Turn on Run code from the + button (see S21.12).
  2. Type "Run Python: print('hello')" and send.
  3. Click the Code Execution header if it is collapsed.
  4. Look for the Output section with the printed text.
  5. Compare with Expected: stdout is shown in its own panel under the code.

## S21.16 Standard-error panel.

- **Expected:** Standard error is shown separately (and visibly distinguished) from stdout.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:99; apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:108
- **Where to find it:** Composer > + > Run code, then send a prompt that fails > Code Execution block > Stderr (labels found in the code)
- **Needs:** a model that can run code on this deployment
- **Steps:**
  1. Turn on Run code from the + button.
  2. Type "Run Python: print(1/0)" and send.
  3. Click the Code Execution header if it is collapsed.
  4. Look for the red Stderr section.
  5. Compare with Expected: stderr is shown separately from Output, in a different colour.

## S21.18 Exit-status display.

- **Expected:** Each execution shows its outcome/exit status (success, failure with code).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:127; apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:46
- **Where to find it:** Composer > + > Run code, then send a prompt > Code Execution block > Exit code (labels found in the code)
- **Needs:** a model that can run code on this deployment
- **Steps:**
  1. Turn on Run code from the + button.
  2. Send a prompt that runs code successfully, then one that fails ("Run Python: print(1/0)").
  3. Open the Code Execution block of each answer.
  4. Look for the Exit code line and the check or x icon in the header.
  5. Compare with Expected: success and failure show their outcome and exit code.

## S21.19 Generated-file output.

- **Expected:** Files produced by execution are listed and can be opened or downloaded.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:1524; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1669
- **Where to find it:** not found in the code. Generated-file handling exists in MessageBubble.tsx (around line 1524, non-image files get a download chip) and ArtifactPreview.tsx (around line 1669), but I did not find the visible label for the chip, so the path is unconfirmed.
- **Needs:** a prompt that produces a file

## S21.20 Plot output.

- **Expected:** Plots/images produced by execution render inline.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:115; apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:28
- **Where to find it:** Composer > + > Run code, then send a prompt that draws a plot > Code Execution block > Plot (path not confirmed in the code; trust the screen)
- **Needs:** a model that can run code on this deployment
- **Steps:**
  1. Turn on Run code from the + button.
  2. Type "Run Python with matplotlib to plot a sine wave and show it" and send.
  3. Click the Code Execution header if it is collapsed.
  4. Look for the Plot 1 heading and the image under it.
  5. Compare with Expected: the plot renders inline in the answer.

## S21.21 Retry execution.

- **Expected:** A failed or finished execution can be re-run in place.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. Retry execution is partial: the code is gated by AGI_E2B_EXECUTION and E2B_API_KEY (apps/web/lib/e2b/gate.ts:16). I searched CodeExecutionBlock.tsx and the chat composer and message files for retry or rerun controls for execution and found none.

## S21.22 Stop execution.

- **Expected:** A running execution can be stopped by the user.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. Stop execution is partial, gated the same way as S21.21. I searched the chat and code folders for an execution stop control and found only the chat turn's stop (ChatComposerNew.tsx onStop), not one for execution.

## S21.25 Edit in Canvas.

- **Expected:** A code block can be opened in an editable canvas/editor next to the chat.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:181; apps/web/features/chat/components/messages/MessageBubble.tsx:1456; apps/web/features/chat/components/messages/MessageBubble.tsx:2894; apps/web/features/chat/utils/artifact-detector.ts:59
- **Where to find it:** Chat > ask for code > code block > Edit button (labels found in the code)
- **Steps:**
  1. Send a prompt that returns a code block, such as "Write a Python hello world".
  2. Click the Edit control in the code block's top bar.
  3. Look for the code opening in an editable panel beside the chat.
  4. Type a small change and check that the change shows in the panel.
  5. Compare with Expected: the code can be edited next to the chat.

## S21.29 Execution-permission explanation.

- **Expected:** Before or when code runs, the user is told what permission it needs/what it can touch and why.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/CapabilitiesSection.tsx:78 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No permission or capability text for code execution was found. CapabilitiesSection.tsx:78 is a save-status line ("Saving...", "Saved", "Synced to your account"), not an explanation of what code can touch. I searched the settings and chat folders for sandbox or permission wording.

## S21.30 Unsupported-runtime state.

- **Expected:** If the requested runtime/execution is unavailable, the UI states that clearly instead of failing silently.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6115; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1638
- **Where to find it:** Composer > + > Run code (greyed out, hover for the tooltip) (labels found in the code)
- **Needs:** a Free account, or a model that cannot run code
- **Steps:**
  1. Sign in and choose a model that cannot run code (a free model, or a model the deployment does not allow).
  2. Click the + button beside the composer.
  3. Hover over the Run code row.
  4. Look for the tooltip "Run code isn't available for this model on this deployment. Choose Auto or a model that can run code."
  5. Compare with Expected: the unavailable state is stated clearly.
