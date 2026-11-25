---
id: "PLAN-vscode-066"
type: "test-plan"
title: "VS Code · 66. Coding-workspace frontend"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "66"
---
# VS Code · 66. Coding-workspace frontend

23 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S66.01 Repository picker.

- **Expected:** The user chooses which repository or folder a coding session works on before it starts.
- **Code:** done. Evidence present: apps/extension-vscode/src/platform/workspaceFolders.ts:21; apps/extension-vscode/src/platform/workspaceFolders.ts:3
- **Where to find it:** AGI Code sidebar (activity bar icon) > Open folder (labels found in the code)
- **Steps:**
  1. Open VS Code with no folder open and click the AGI Code icon in the activity bar.
  2. Read the onboarding text that says to choose a folder before AGI can read project context.
  3. Click Open folder and pick a project folder in the system dialog.
  4. Look for the chat to show that folder as its scope, and compare with Expected.

## S66.02 Branch picker.

- **Expected:** The user chooses the git branch a coding session starts from or works on.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/trees/conversationTreeProvider.ts:29; apps/cli/src/app_server/developer_host.rs:2815; apps/cli/src/app_server/developer_host.rs:7842
- **Where to find it:** not found in the code. Searched apps/extension-vscode for branch pickers. The branch is only shown on session rows and tooltips (conversationTreeProvider.ts) and recorded by the CLI at start (apps/cli/src/app_server/developer_host.rs). Worktree creation takes only a name. No control to choose a branch was found.
- **Needs:** a git repository with more than one branch

## S66.05 Coding-session list.

- **Expected:** The user sees a list of their coding sessions and can open one.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:1243 (quoted code not found in the file now); apps/extension-vscode/src/integrations/localRuntimeClient.ts:1655
- **Where to find it:** AGI Code sidebar > Sessions (history icon in the chat header) (labels found in the code)
- **Needs:** at least one earlier session
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the Sessions icon at the top right of the chat header.
  3. Look at the Local tab for a list of your sessions with titles and ages.
  4. Click one session and check that it opens, and compare with Expected.

## S66.06 Coding-session title.

- **Expected:** Each coding session shows a readable title, and the user can rename it where the surface offers renaming.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:1259 (quoted code not found in the file now); apps/extension-vscode/src/integrations/localRuntimeClient.ts:1655
- **Where to find it:** AGI Code sidebar > Sessions (session rows) (labels found in the code)
- **Needs:** at least one earlier session
- **Steps:**
  1. Open Sessions from the chat header.
  2. Look at each row's title, age and source.
  3. Look for a rename control on a row; none was found for local sessions.
  4. Compare the readable titles with Expected.

## S66.07 Session status.

- **Expected:** Each coding session shows whether it is running, waiting for approval, idle, failed or closed.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:1260 (quoted code not found in the file now); apps/extension-vscode/src/integrations/localRuntimeClient.ts:342
- **Where to find it:** not found in the code. Status values in code are idle, running, awaiting_approval, archived, failed and unknown (localRuntimeClient.ts). The session list shows only a spinner for running (conversationTreeProvider.ts) and a notice for running or awaiting approval elsewhere (ChatStateManager.ts). No visible words for idle, failed or closed were found.
- **Needs:** sessions in more than one state (running, waiting for approval)

## S66.09 File search.

- **Expected:** The user searches the workspace for files by name from inside the coding surface.
- **Code:** done. Evidence moved: apps/extension-vscode/src/data/mentionSearch.ts:41 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:197
- **Where to find it:** AGI Code chat composer > type @ > file names (labels found in the code)
- **Needs:** a workspace folder open
- **Steps:**
  1. Click the message box in the AGI Code chat.
  2. Type @ followed by part of a file name.
  3. Look for the dropdown titled Workspace files and symbols listing matching files.
  4. Pick one and check that it is added to the message, and compare with Expected.

## S66.10 Symbol search.

- **Expected:** The user searches for code symbols (functions, classes) by name from the coding surface.
- **Code:** done. Evidence moved: apps/extension-vscode/src/data/mentionSearch.ts:60 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:197
- **Where to find it:** AGI Code chat composer > type @ > symbol names (labels found in the code)
- **Needs:** a project with a language that has a symbol provider
- **Steps:**
  1. Click the message box in the AGI Code chat.
  2. Type @ followed by a function or class name from an open project file.
  3. Look in the dropdown titled Workspace files and symbols for symbol entries.
  4. Pick one and check it is added as a reference, and compare with Expected.

## S66.11 Code editor.

- **Expected:** The user can open and edit a source file inside the coding surface.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:992; apps/extension-vscode/src/platform/applyEdit.ts:59 (quoted code not found in the file now); apps/extension-vscode/src/providers/diffDecorationProvider.ts:388
- **Where to find it:** Command Palette > Code: Open File Reference, or a file reference in a chat answer (labels found in the code)
- **Needs:** a file in the workspace
- **Steps:**
  1. Run Code: Open File Reference from the Command Palette and enter a file path, or click a file path in a chat answer.
  2. Check that the file opens in the VS Code editor.
  3. Type a small change and save.
  4. Compare the open and edit result with Expected.

## S66.13 Selected-code context.

- **Expected:** The user selects code in the workspace and sends that selection to the agent as context.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1145; apps/extension-vscode/src/core/commandSetup.ts:906; apps/extension-vscode/src/data/contextExclusion.ts:89; apps/extension-vscode/src/__tests__/contextExclusion.test.ts:19
- **Where to find it:** Editor: select code > AGI Code chat > + (Attach or use tools) > Selection (labels found in the code)
- **Needs:** an open file with a selection
- **Steps:**
  1. In an editor, select a few lines of code.
  2. Open the AGI Code chat and click the + button labelled Attach or use tools.
  3. Click Selection and check that a context chip appears in the composer.
  4. Send a question and check the answer uses the selection, and compare with Expected.

## S66.14 Diagnostics panel.

- **Expected:** The workspace shows compiler/linter diagnostics and lets the user act on them.
- **Code:** done. Evidence present: apps/extension-vscode/src/providers/errorExplainerProvider.ts:11; apps/extension-vscode/src/features/editor-utilities/editorUtilities.ts:77
- **Where to find it:** AGI Code chat > + (Attach or use tools) > Problems (labels found in the code)
- **Needs:** a file with an error
- **Steps:**
  1. Open a file with a compiler or linter error and put the cursor on that line.
  2. Open the AGI Code chat and click + then Problems.
  3. Check that the problem is added as context in the composer.
  4. Compare with Expected, which asks for a panel where the user can act on diagnostics.

## S66.15 Integrated terminal.

- **Expected:** The user runs shell commands in a terminal attached to the coding session and sees their output.
- **Code:** done. Evidence present: apps/extension-vscode/src/providers/terminalProvider.ts:357; apps/extension-vscode/src/providers/terminalProvider.ts:126
- **Where to find it:** Command Palette > Code: Run Terminal Command (labels found in the code)
- **Needs:** a workspace folder open
- **Steps:**
  1. Run Code: Run Terminal Command from the Command Palette and enter a command such as echo hello.
  2. Check that a VS Code terminal opens with the product name.
  3. Read the output in that terminal.
  4. Compare with Expected.

## S66.17 Command-history view.

- **Expected:** The user can review the commands run in the session with their output and exit status.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7943; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7955
- **Where to find it:** AGI Code chat > command tool card in the transcript (labels found in the code)
- **Needs:** a session where the agent runs a command
- **Steps:**
  1. Ask AGI to run a shell command in the chat, for example to list files.
  2. Find the tool card for that command in the transcript.
  3. Expand it and read the output.
  4. Look for the line Exit code: and compare with Expected.

## S66.18 Diff viewer.

- **Expected:** The user views a line-level diff of the changes the agent made.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2250; apps/extension-vscode/src/providers/diffDecorationProvider.ts:294
- **Where to find it:** Editor: a file the agent changed > highlighted lines and Accept / Reject buttons above them; or Command Palette > Code: Git Diff (labels found in the code)
- **Needs:** an agent edit to a file
- **Steps:**
  1. Ask the agent to edit a file in the workspace and let the change appear.
  2. Open that file in the editor.
  3. Look for highlighted changed lines with Accept and Reject buttons above them.
  4. Run Code: Git Diff from the Command Palette and compare the line-level changes with Expected.

## S66.19 File-change summary.

- **Expected:** The user sees a summary of which files the session created, modified or deleted.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/sessionReceipt.ts:47; apps/extension-vscode/src/integrations/localRuntimeClient.ts:472
- **Where to find it:** Command Palette > Code: Show Session Activity (labels found in the code)
- **Needs:** a session that changed files
- **Steps:**
  1. Use a session in which the agent created, changed or deleted files.
  2. Run Code: Show Session Activity from the Command Palette.
  3. Read the Files changed section, which lists each file with Created, Modified or Deleted.
  4. Compare the list with the actual changes, and compare with Expected.

## S66.21 Hunk acceptance/rejection.

- **Expected:** The user accepts or rejects individual hunks of an agent change.
- **Code:** done. Evidence present: apps/extension-vscode/src/providers/diffDecorationProvider.ts:175; apps/extension-vscode/src/core/commandSetup.ts:1034
- **Where to find it:** Editor: a file with an agent change > Accept / Reject buttons above each change (labels found in the code)
- **Needs:** an agent edit with at least two changes in one file
- **Steps:**
  1. Ask the agent to change two separate places in one file.
  2. Open the file and find the Accept and Reject buttons above the first change.
  3. Click Reject on the first change and check only that change reverts.
  4. Click Accept on the second change and compare with Expected.

## S66.22 Checkpoint list.

- **Expected:** The user sees a list of checkpoints (saved states of code and conversation) for the session.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3692; apps/extension-vscode/src/core/commandSetup.ts:1230 (quoted code not found in the file now)
- **Where to find it:** Command Palette > Code: Checkpoints (labels found in the code)
- **Needs:** a session with checkpoints
- **Steps:**
  1. Use a session in which the agent has made earlier changes.
  2. Run Code: Checkpoints from the Command Palette.
  3. Read the list of prompts, each with its tracked file count.
  4. Compare with Expected.

## S66.23 Restore checkpoint.

- **Expected:** The user restores the session's code and conversation to an earlier checkpoint.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3760; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3692
- **Where to find it:** Command Palette > Code: Checkpoints > pick a prompt > What goes back to this point > confirm (labels found in the code)
- **Needs:** a session with a checkpoint that tracked files
- **Steps:**
  1. Run Code: Checkpoints and pick a prompt.
  2. Pick an option at What goes back to this point.
  3. In the modal dialog, read the Rewind question and confirm.
  4. Check that the files and the chat return to that point, and compare with Expected.

## S66.24 Plan mode.

- **Expected:** The user switches the agent into a plan mode where it proposes a plan and makes no edits until approved.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:1632 (quoted code not found in the file now); apps/cli/src/app_server/developer_host.rs:7736
- **Where to find it:** AGI Code chat > Mode and reasoning effort > Mode > Plan; or Command Palette > Code: Choose Agent Mode (labels found in the code)
- **Needs:** a workspace folder open and a signed-in account
- **Steps:**
  1. Click the Mode and reasoning effort button under the chat box.
  2. Choose Plan.
  3. Send a request to change code, such as moving a function to a new API.
  4. Check that the reply is a step-by-step plan and no file is edited until you approve, and compare with Expected.

## S66.25 Edit/agent mode.

- **Expected:** The user chooses a mode in which the agent may edit files and run tools on its own (edit/agent mode) versus asking first.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1141; apps/cli/src/app_server/developer_host.rs:7742
- **Where to find it:** AGI Code chat > Mode and reasoning effort > Mode > Auto; or Command Palette > Code: Choose Agent Mode (labels found in the code)
- **Needs:** a workspace folder open
- **Steps:**
  1. Click the Mode and reasoning effort button under the chat box.
  2. Choose Auto.
  3. Ask for a small edit to a file and watch whether it is made without asking.
  4. Compare with Expected.

## S66.26 Permission-mode control.

- **Expected:** The user sets how much the agent must ask before acting (ask every time / auto-approve safe / autonomous), and the running session honours it.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1141; apps/cli/src/app_server/developer_host.rs:7724
- **Where to find it:** AGI Code chat > Mode and reasoning effort > Mode; or Command Palette > Code: Set Agent Mode (labels found in the code)
- **Needs:** a workspace folder open
- **Steps:**
  1. Open the Mode and reasoning effort button and look at the options Ask, Auto, Plan and Bypass permissions.
  2. Choose Ask and send a request that edits a file, and check that the agent asks first.
  3. Choose Bypass permissions and send the same request, and check that it does not ask.
  4. Compare with Expected.

## S66.27 Context-usage indicator.

- **Expected:** The workspace shows how much of the model's context window the session has used.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4478; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3609
- **Where to find it:** AGI Code chat > context usage text next to the Mode and reasoning effort button (labels found in the code)
- **Needs:** a long chat
- **Steps:**
  1. Send several long messages in one chat.
  2. Look at the context usage text beside the chat controls.
  3. Keep chatting until a notice appears above the composer.
  4. Compare the percentage with Expected.

## S66.28 Usage/cost indicator.

- **Expected:** The coding surface shows how much plan usage or money the user has spent.
- **Code:** done. Evidence moved: apps/extension-vscode/src/data/tokenCounter.ts:74 (quoted code not found in the file now); apps/extension-vscode/src/data/tokenCounter.ts:207
- **Where to find it:** AGI Code chat > Auto (model button) > Account & usage…; or Command Palette > Code: Account & Usage (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the model button in the chat controls, which shows Auto by default.
  2. Choose Account & usage….
  3. Read the plan usage meter and usage label.
  4. Compare with Expected.

## S66.41 Continue in another client.

- **Expected:** The user moves an ongoing coding session to another client (terminal, editor, desktop, phone) and continues it there.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1494; apps/extension-vscode/src/core/commandSetup.ts:587
- **Where to find it:** AGI Code sidebar > Sessions > Continue in the cloud (cloud icon); or Command Palette > Code: Continue This Session in the Terminal (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and a second client (terminal, desktop or phone)
- **Steps:**
  1. Open a session in AGI Code and click Sessions.
  2. Click the Continue in the cloud icon button.
  3. Open the same session in the cloud or terminal client.
  4. Check it continues there, and compare with Expected.
