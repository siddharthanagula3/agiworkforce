---
id: "PLAN-cli-021"
type: "test-plan"
title: "CLI · 21. Code blocks and executable code presentation"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "21"
---
# CLI · 21. Code blocks and executable code presentation

13 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S21.01 Language label.

- **Expected:** Each code block shows its language name in a header.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:191
- **Where to find it:** agi (start the app), then type a request that gets a code block back, e.g. "Show a Rust hello world in a code block" (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Run `agi` in a terminal and sign in if asked.
  2. Type "Show a Rust hello world in a code block" and press Enter.
  3. When the reply arrives, look at the top edge of the code block.
  4. Compare: the header line reads ┌─ rust ─ (the language name), or ┌─ code ─ when the fence has no language.

## S21.02 Syntax highlighting.

- **Expected:** Code is syntax-highlighted according to its language.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:592
- **Where to find it:** agi (start the app), then type a request that gets a code block back, e.g. "Show a Python function in a code block" (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Run `agi` in a terminal.
  2. Type "Show a Python function in a code block" and press Enter.
  3. When the reply arrives, compare the code's keywords, strings and comments in the block.
  4. Compare: keywords, strings and numbers show in different colours (the highlighter is syntect, chosen by language); a block with no language shows as plain text.

## S21.03 Copy code.

- **Expected:** Each code block has a copy control that copies exactly its code.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5915; apps/cli/src/tui/tui_app.rs:5929
- **Where to find it:** agi (start the app), then type /copy code at the prompt (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Run `agi` and ask for a reply that contains a code block.
  2. Type /copy code and press Enter.
  3. Read the message line: it should say "Copied last code block to clipboard" with a line count.
  4. Paste (Cmd-V) into a text editor and compare with the block: only the code, no fences or the text around it.

## S21.09 Highlighted changed lines.

- **Expected:** Changed lines in a code suggestion are visually highlighted (added/removed).
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:6582; apps/cli/src/tui/widgets/diff_review.rs:246 (quoted code not found in the file now)
- **Where to find it:** agi (start the app), then type /diff-review at the prompt (labels found in the code)
- **Needs:** a git repository with changed files
- **Steps:**
  1. Run `agi` in a git repository where a file has unsaved changes.
  2. Type /diff-review and press Enter.
  3. Read the "Diff Review" panel; added and removed lines are drawn on coloured bands.
  4. Compare: added lines and removed lines are visibly coloured differently. Also ask the agent to edit a file and check the + and - counts and coloured lines under the tool row.

## S21.10 Diff formatting.

- **Expected:** Diffs render with diff formatting (+/- lines coloured, hunks readable).
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:6582; apps/cli/src/tui/widgets/diff_review.rs:246 (quoted code not found in the file now)
- **Where to find it:** agi (start the app), then type /diff-review at the prompt (labels found in the code)
- **Needs:** a git repository with changed files
- **Steps:**
  1. Run `agi` in a git repository with changes.
  2. Type /diff-review and press Enter.
  3. Use the arrow keys to move between files and hunks.
  4. Compare: each hunk has an @@ header line, added lines start with +, removed lines start with -, and they are coloured. /diff also prints a summary.

## S21.12 Run-code action.

- **Expected:** The user can have code run (sandbox or local) from the chat and see it execute.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:334; apps/cli/src/tui/tui_app.rs:1616
- **Where to find it:** agi (start the app), then ask the agent in the prompt to run a command, e.g. "Run `echo hello` in the shell" (labels found in the code)
- **Needs:** a folder you can run commands in
- **Steps:**
  1. Run `agi` in a folder you are happy for commands to run in.
  2. Type "Run `echo hello` in the shell" and press Enter.
  3. When the approval box appears, read the command shown and press y (Yes).
  4. Compare: a tool row named run_command shows the command with $ and then prints its output. There is no run button on the code block itself.

## S21.15 Output panel.

- **Expected:** Execution stdout is shown in a dedicated output panel under the code.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4048; apps/cli/src/tui/tui_app.rs:400
- **Where to find it:** agi (start the app), then ask the agent to run a command that prints several lines (labels found in the code)
- **Needs:** a folder you can run commands in
- **Steps:**
  1. Run `agi` and ask "Run `ls` in the shell" and approve it with y.
  2. Look at the lines printed under the run_command row.
  3. Press Ctrl-O to show the full output.
  4. Compare: output shows indented under the tool row (a preview first), and Ctrl-O shows full output with the note "showing full tool output, Ctrl-O to collapse".

## S21.16 Standard-error panel.

- **Expected:** Standard error is shown separately (and visibly distinguished) from stdout.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:424; apps/cli/src/tui/tui_app.rs:8024
- **Where to find it:** agi (start the app), then ask the agent to run a command that fails, e.g. "Run `ls /no-such-folder` in the shell" (labels found in the code)
- **Needs:** a folder you can run commands in
- **Steps:**
  1. Run `agi` and send the request above, approving it with y.
  2. Look under the run_command row for a line starting with "stderr".
  3. Compare: the stderr label and text are drawn in the danger colour and bold, so they differ from the stdout lines.
  4. Press Ctrl-O to see more stderr lines if there are several.

## S21.18 Exit-status display.

- **Expected:** Each execution shows its outcome/exit status (success, failure with code).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:380; apps/cli/src/tui/tui_app.rs:8024
- **Where to find it:** agi (start the app), then ask the agent to run a command that fails, e.g. "Run `false` in the shell" (labels found in the code)
- **Needs:** a folder you can run commands in
- **Steps:**
  1. Run `agi` and send the request above, approving it with y.
  2. Look at the end of the run_command row.
  3. Compare: a failing command shows "exit 1" (or its code) in red, and a passing command shows "exit 0" in green, with a ✗ or ✔ glyph at the start of the row.

## S21.19 Generated-file output.

- **Expected:** Files produced by execution are listed and can be opened or downloaded.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:334; apps/cli/src/tui/tui_app.rs:344
- **Where to find it:** not found in the code. Searched apps/cli for open, download and output-file controls. The app lists "Files changed this turn" (apps/cli/src/tui/tui_app.rs) and shows edits, but found no control to open or download files a command produced.
- **Needs:** a folder you can run commands in

## S21.22 Stop execution.

- **Expected:** A running execution can be stopped by the user.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1249 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:8721
- **Where to find it:** agi (start the app), then ask for a long-running command, e.g. "Run `sleep 60` in the shell" (labels found in the code)
- **Needs:** a folder you can run commands in
- **Steps:**
  1. Run `agi` and send the request above, approving it with y.
  2. While the turn is running, read the status line: "working, Esc or Ctrl-C to cancel".
  3. Press Esc (or Ctrl-C).
  4. Compare: the turn stops and the run_command row is marked cancelled (⊘) or failed, and the prompt comes back.

## S21.27 Apply to repository.

- **Expected:** Suggested code can be applied to files in the user's repository after review.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6582; apps/cli/src/tui/tui_app.rs:1616
- **Where to find it:** agi (start the app), then ask the agent to change a file, e.g. "Add a comment line to README.md" (labels found in the code)
- **Needs:** a git repository
- **Steps:**
  1. Run `agi` in a repository and send the request above.
  2. When the "Apply this patch?" approval box appears, read the file names and the change.
  3. Press y to apply, or n to refuse.
  4. Compare: the file changes on disk and the tool row shows +N -N. To review changes later, type /diff-review and press y to approve a hunk or n to reject it.

## S21.29 Execution-permission explanation.

- **Expected:** Before or when code runs, the user is told what permission it needs/what it can touch and why.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/approval_overlay.rs:5; apps/cli/src/tui/tui_app.rs:1616
- **Where to find it:** agi (start the app), then ask the agent to run a command, e.g. "Run `ls` in the shell" (labels found in the code)
- **Needs:** a folder with files; default permission mode (not Bypass)
- **Steps:**
  1. Run `agi` in a folder with files, in the default permission mode (press Shift+Tab until the mode is the normal chat mode, not Bypass).
  2. Type "Run `ls` in the shell" and press Enter.
  3. Read the approval box: the command is shown, and the buttons are Yes, No, Allow Session, Always allow, Deny All, Allow All.
  4. Move to Yes and compare the text that appears: "Run it this once. Tab adds a note for the agent."
