---
id: "PLAN-vscode-021"
type: "test-plan"
title: "VS Code · 21. Code blocks and executable code presentation"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "21"
---
# VS Code · 21. Code blocks and executable code presentation

16 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S21.03 Copy code.

- **Expected:** Each code block has a copy control that copies exactly its code.
- **Code:** done. Evidence present: apps/extension-vscode/src/webview/render.ts:49; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5503
- **Where to find it:** Chat > a reply that contains a code block > hover the code block > Copy (labels found in the code)
- **Needs:** a reply that contains a code block
- **Steps:**
  1. Open AGI Chat from the activity bar and ask a question that gets a reply with code, such as "write a Python function that adds two numbers".
  2. Move the mouse over the code block until the buttons Copy, Explain and Apply appear at its top right.
  3. Click Copy.
  4. Paste into a text editor or the composer and compare with the code block: the paste should match the code exactly, with no line numbers or button text.

## S21.09 Highlighted changed lines.

- **Expected:** Changed lines in a code suggestion are visually highlighted (added/removed).
- **Code:** done. Evidence present: apps/extension-vscode/src/webview/render.ts:51; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2281
- **Where to find it:** Chat > a reply with a code block > Apply > Accept in the editor (labels found in the code)
- **Needs:** a file open in the editor, and a reply with a suggested code change
- **Steps:**
  1. Open a file in the editor and click at the place where the change goes.
  2. In AGI Chat, hover a code block in a reply that suggests a change and click Apply.
  3. In the editor, look at the highlighted changed lines of the file.
  4. Compare with Expected: added and removed lines should be visibly marked. Click Accept above the change to keep it.

## S21.10 Diff formatting.

- **Expected:** Diffs render with diff formatting (+/- lines coloured, hunks readable).
- **Code:** done. Evidence present: apps/extension-vscode/src/webview/render.ts:28
- **Where to find it:** Chat > a reply with a code block marked diff or patch (labels found in the code)
- **Needs:** a reply that returns a diff or patch code block
- **Steps:**
  1. Ask in AGI Chat for a change to a file and ask for the answer as a diff, for example "show the change as a diff".
  2. Look at the code block the reply shows.
  3. Compare with Expected: lines starting with + should be coloured as added, lines starting with - as removed, and @@ hunk lines and --- +++ file lines set apart.

## S21.12 Run-code action.

- **Expected:** The user can have code run (sandbox or local) from the chat and see it execute.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8952; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6765
- **Where to find it:** not found in the code. I found no Run control on code blocks. Code blocks offer only Copy, Explain and Apply. Commands run only when the agent calls a shell tool, shown as activity rows (see S21.15). I searched for run-btn, Run, runCode, executeCode and sandbox in apps/extension-vscode/src.

## S21.15 Output panel.

- **Expected:** Execution stdout is shown in a dedicated output panel under the code.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8954; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8947
- **Where to find it:** Chat > activity row for a command the agent ran > click the row (labels found in the code)
- **Needs:** a workspace the agent can run commands in, and approval to run the command
- **Steps:**
  1. In AGI Chat, ask the agent to run a simple shell command, for example "run the command ls in this folder".
  2. When the activity row for the command appears, wait until it finishes.
  3. Click the row's bar to open it.
  4. Look at the Command section (the command with a $ in front) and the Output section below it: the printed text should match what the command printed.

## S21.17 Execution-duration display.

- **Expected:** Each execution shows how long it took.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7968; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8984
- **Where to find it:** Chat > activity row for a command the agent ran > after it finishes, the time shows on the row's summary line (labels found in the code)
- **Needs:** a workspace the agent can run commands in, and approval to run the command
- **Steps:**
  1. Ask the agent to run a command that takes a few seconds, such as "wait 3 seconds then print done".
  2. Watch the activity row until it finishes.
  3. Look at the end of the row's summary line: it should add a time such as "· 3.0 s" or "· 120 ms".

## S21.18 Exit-status display.

- **Expected:** Each execution shows its outcome/exit status (success, failure with code).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8962; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8953
- **Where to find it:** Chat > activity row for a command the agent ran > click the row > Exit status line (labels found in the code)
- **Needs:** a workspace the agent can run commands in, and approval to run the command
- **Steps:**
  1. Ask the agent to run a command that fails, such as "run the command exit 3".
  2. When the row finishes, click the row's bar to open it.
  3. Look at the line under the Output section.
  4. Compare with Expected: it should read "Exit status 3" in the error colour. A successful command shows "Exit status 0".

## S21.19 Generated-file output.

- **Expected:** Files produced by execution are listed and can be opened or downloaded.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5769 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8916
- **Where to find it:** not found in the code. I found no list of files produced by a command run. Write tool rows only show an Open diff button for the file they changed, and apps/extension-vscode/src/features/sidebar-webview/turnChanges.ts handles changed files for a turn, but I did not find a chat control that lists them as generated output. I searched for Generated, downloads and new files in the webview and sidebar folders.

## S21.21 Retry execution.

- **Expected:** A failed or finished execution can be re-run in place.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4515
- **Where to find it:** not found in the code. The only Retry is on an error block for a failed reply. It re-sends the last message and is not attached to a single command row, so no in-place re-run of one execution was found.

## S21.22 Stop execution.

- **Expected:** A running execution can be stopped by the user.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3365; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7037
- **Where to find it:** Composer > Stop response (the square button beside Send while a reply is running) (labels found in the code)
- **Needs:** a workspace the agent can run commands in, and approval to run the command
- **Steps:**
  1. Ask the agent to run a long command, such as "run sleep 60", and approve it if asked.
  2. While the activity row shows the command running, click the Stop response button beside the Send button in the composer.
  3. Look at the row: it should stop running and the reply should end.
  4. For a command run in the background, click More (the ... button at the top right of the chat), choose Background commands, pick the command, then choose Stop command and confirm. Compare with Expected: the command is no longer running.

## S21.23 Reset runtime.

- **Expected:** The user can reset the execution runtime/state.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** Command Palette (Cmd+Shift+P) > Code: Restart Local Runtime (labels found in the code)
- **Steps:**
  1. Press Cmd+Shift+P in VS Code and type Restart Local Runtime.
  2. Choose Code: Restart Local Runtime.
  3. If a dialog asks to restart, choose Restart Local Runtime.
  4. Look at AGI Chat: the runtime should restart and new turns should start on a clean runtime. Running local turns are stopped by the restart.

## S21.24 Explain code.

- **Expected:** A code block offers an Explain action that asks for an explanation of that code.
- **Code:** done. Evidence present: apps/extension-vscode/src/webview/render.ts:50; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5477
- **Where to find it:** Chat > a reply with a code block > hover the code block > Explain (labels found in the code)
- **Needs:** a reply that contains a code block, and a signed-in account that can send chat messages
- **Steps:**
  1. In AGI Chat, get a reply that contains a code block.
  2. Move the mouse over the code block and click Explain.
  3. Look at the chat: a new message starting "Explain this code:" should be sent, with the code block inside it.
  4. Compare with Expected: the agent's reply should explain that code.

## S21.26 Open in coding workspace.

- **Expected:** A code block can be sent to/opened in the coding workspace (IDE, AGI Code).
- **Code:** done. Evidence present: apps/extension-vscode/src/webview/render.ts:51; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2250
- **Where to find it:** not found in the code. I found no Open in coding workspace control on code blocks. The code blocks offer only Copy, Explain and Apply, and Apply opens a diff in the editor. I searched for coding workspace and Open in in the webview and chat folders.

## S21.27 Apply to repository.

- **Expected:** Suggested code can be applied to files in the user's repository after review.
- **Code:** done. Evidence present: apps/extension-vscode/src/webview/render.ts:51; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2281
- **Where to find it:** Chat > a reply with a code block > Apply > Accept in the editor (labels found in the code)
- **Needs:** a file open in the editor, and a reply with a suggested code change
- **Steps:**
  1. Open the file to change in the editor. Select the code to replace, or leave the cursor at the place to insert.
  2. In AGI Chat, hover the code block in the reply and click Apply.
  3. In the editor, review the proposed change shown with the file.
  4. Click Accept above the change to apply it to the file, or Reject to dismiss it. Compare with Expected: the file changes only after Accept.

## S21.29 Execution-permission explanation.

- **Expected:** Before or when code runs, the user is told what permission it needs/what it can touch and why.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7052; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7057
- **Where to find it:** Chat > approval card shown when the agent wants to run a command (labels found in the code)
- **Needs:** a workspace where approval is asked for, and a prompt that makes the agent run a command
- **Steps:**
  1. Ask the agent to run a shell command, such as "run the command ls", in a chat where approval is needed.
  2. When the approval card appears in the chat, read its title, its summary and its details.
  3. Look for the risk word (Low risk, Medium risk or High risk) and for Can be undone or Cannot be undone.
  4. Compare with Expected: the card should say what the command is and what it can touch, before it runs. Choose Approve or Abort turn.

## S21.30 Unsupported-runtime state.

- **Expected:** If the requested runtime/execution is unavailable, the UI states that clearly instead of failing silently.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** Chat > session line (shows the label Runtime unavailable) when the AGI CLI is not connected to the workspace (labels found in the code)
- **Needs:** a workspace where the AGI CLI is not connected
- **Steps:**
  1. Open AGI Chat in a workspace where the AGI CLI is not connected, such as a new folder without the CLI set up.
  2. Look at the session line near the composer for the label Runtime unavailable.
  3. Try to send a message and read any error text in the chat.
  4. Compare with Expected: the screen should say the runtime is unavailable, not stay silent. The title tooltip says to connect the AGI CLI to the workspace.
