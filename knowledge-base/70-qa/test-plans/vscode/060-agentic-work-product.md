---
id: "PLAN-vscode-060"
type: "test-plan"
title: "VS Code · 60. Agentic work product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "60"
---
# VS Code · 60. Agentic work product

21 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S60.01 Work-task composer.

- **Expected:** The user can open a dedicated entry to describe and start an agentic work task (not a plain chat turn) and it starts a real agent run.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5811; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523
- **Where to find it:** Message box > "/" (Commands) > /cloud, or Command Palette > Code: Continue in the Cloud (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and a checked-out branch that is pushed to GitHub
- **Steps:**
  1. Sign in to AGI Cloud, and open a folder whose git branch is pushed to GitHub.
  2. Click the "/" button (title "Commands") under the message box and choose /cloud. Or open the Command Palette and run "Code: Continue in the Cloud".
  3. In the input box titled "Continue in the cloud", type what the task should do and press Enter.
  4. In the review dialog, check the repository, branch and model, then click "Continue in the cloud".
  5. Watch for the progress notification "starting a cloud session", then the result message. Compare with Expected: a cloud agent run has started and can be found under Work > Cloud tasks.

## S60.02 Task title.

- **Expected:** Each work task shows a readable title in the task list, and the user can set or change it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:287
- **Where to find it:** More actions > Work > Cloud tasks > pick a task > Rename task (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and a cloud task that has a conversation
- **Steps:**
  1. Click the "More" button in the sidebar header (aria label "More actions") and choose Work.
  2. Under Cloud tasks, pick a task row that has a conversation.
  3. Choose "Rename task", type a new name and press Enter.
  4. Compare with Expected: the list row and the detail title show the new name. The row title is otherwise the first line of the task's conversation title, or a default such as "AGI work task".

## S60.03 Objective.

- **Expected:** The user states the objective of the task, and the objective is stored with the run and shown back.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5811; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523
- **Where to find it:** Message box > "/" (Commands) > /cloud, then type the objective in the "Continue in the cloud" box (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and a pushed branch
- **Steps:**
  1. Start the flow as in S60.01: choose /cloud or run "Code: Continue in the Cloud".
  2. In the input box titled "Continue in the cloud", type the objective. The prompt names the branch.
  3. Click "Continue in the cloud" in the review dialog.
  4. Open More actions > Work > Cloud tasks and find the new task. Compare with Expected: the objective is stored with the run and shown back.

## S60.05 Source selection.

- **Expected:** While composing a task the user can choose which sources it may use (project, files, connectors).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7703; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2176
- **Where to find it:** Message box > "+" (Attach or use tools) > Add context (labels found in the code)
- **Needs:** none for the menu; an open project folder for workspace files
- **Steps:**
  1. Click the "+" button (title "Attach or use tools") under the message box.
  2. Read the "Add context" menu: "Attach workspace files", "Selection", "Open editors", "Problems", "Git changes", "Terminal output", "Web page".
  3. Choose one, for example "Git changes".
  4. Compare with Expected: the chosen source appears as an item above the message box before you send.

## S60.06 Tool selection.

- **Expected:** The user can choose which tools the task may use before it runs.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1125; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5402
- **Where to find it:** Command Palette > Code: Choose Tools for This Session (labels found in the code)
- **Needs:** a local runtime that supports tool filters; otherwise an error message appears
- **Steps:**
  1. Open the Command Palette and run "Code: Choose Tools for This Session".
  2. Tick or untick the tools: "Shell commands", "File edits", "New files", "Web search", "Web pages", "Browser".
  3. Press Enter to confirm.
  4. Send a message and compare with Expected: the unticked tools are not used. The picker says the choice applies from your next message.

## S60.08 Model/profile selection.

- **Expected:** The user can pick the model (or profile) the task runs on, and the run records it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6966; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2150
- **Where to find it:** Message box > model pill (shows "Auto") > pick a model in "Select model" (labels found in the code)
- **Steps:**
  1. Find the pill under the message box, showing "Auto" by default (title "Model").
  2. Click it. The popover "Select model" opens.
  3. Choose a model from the list.
  4. Compare with Expected: the pill shows the chosen model before you send. Command Palette "Code: Select Model" offers the same choice.

## S60.09 Effort selection.

- **Expected:** The user can set reasoning effort for the task and it is sent with the run.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3555 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1961
- **Where to find it:** Message box > "Mode and reasoning effort" button > Effort, or Command Palette > Code: Set Reasoning Effort (labels found in the code)
- **Steps:**
  1. Click the "Mode and reasoning effort" button under the message box, or run "Code: Set Reasoning Effort" from the Command Palette.
  2. Pick an effort level: None, Minimal, Low, Medium, High, xHigh or Max.
  3. Compare with Expected: a message "AGI Code effort set to: <level>" appears (palette route), and the controls show the new level.
  4. Send a message. The effort is sent with the turn in the local chat code path.

## S60.13 Reviewable task plan.

- **Expected:** Before the agent acts, the user sees its plan and can approve, edit or reject it.
- **Code:** done. Evidence present: apps/cli/src/app_server/developer_host.rs:5845; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8743
- **Where to find it:** Message box > "+" (Attach or use tools) > Plan mode, then send a task (labels found in the code)
- **Steps:**
  1. Click "+" (title "Attach or use tools") and choose "Plan mode".
  2. Send a task such as a small refactor.
  3. Wait until the card titled "Plan" stops streaming.
  4. Compare with Expected: the buttons "Approve and auto-accept edits" and "Revise" appear. Click "Revise" to see the box "What should change in the plan?" with "Send" and "Cancel". Nothing runs until you approve.

## S60.14 Step list.

- **Expected:** The task view lists its steps with an accurate per-step status.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7938; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8637; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6677
- **Where to find it:** Message box > card titled "Plan" (after Plan mode); for cloud runs: More actions > Work > Cloud tasks > pick a task > Progress (labels found in the code)
- **Needs:** a Plan-mode turn for the chat card, or a cloud task for the Progress list
- **Steps:**
  1. In Plan mode, send a task and open the card titled "Plan" in the chat.
  2. Read the count (for example "2/5 complete") and the list of steps.
  3. For a cloud run, click "More" (More actions) > Work > Cloud tasks > pick a task.
  4. Compare with Expected: the "Progress" section lists each step with its own status icon, matching the run.

## S60.16 Running-step indicator.

- **Expected:** While a task runs, the view marks which step is currently executing.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8637; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7943; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:666
- **Where to find it:** More actions > Work > Cloud tasks > Working > pick a running task > Progress (labels found in the code)
- **Needs:** a cloud task that is running
- **Steps:**
  1. Click "More" (More actions) > Work, then open the group "Working" under Cloud tasks.
  2. Pick a running task.
  3. In the "Progress" section, find the step with a spinning icon. That is the step executing now.
  4. Compare with Expected: the spinner moves to the next step as the run continues.

## S60.19 Approval request.

- **Expected:** When the agent needs permission for an action, the task pauses and the user can approve or deny it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:160; apps/extension-vscode/src/core/commandSetup.ts:2561; apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:216
- **Where to find it:** More actions > Work > Cloud tasks > Needs you > pick a task > Actions > Approve (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and a cloud task waiting for a tool approval
- **Steps:**
  1. Click "More" (More actions) > Work and open the group "Needs you" under Cloud tasks.
  2. Pick a task. In its detail, under "Actions", read the tool names shown next to "Approve" and "Reject".
  3. Click "Approve". A modal dialog asks to approve. Confirm with "Approve and continue".
  4. Compare with Expected: the task leaves "Needs you" and continues. Choosing "Reject" asks for an optional reason.

## S60.20 Task steering.

- **Expected:** The user can redirect a running task with new guidance without starting over.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:168; apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:279; apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:99
- **Where to find it:** More actions > Work > Cloud tasks > pick a working task > Message the agent (labels found in the code)
- **Needs:** a cloud task in the state queued, planning, running or resuming
- **Steps:**
  1. Click "More" (More actions) > Work and pick a task in the group "Working".
  2. In its detail, click "Message the agent" (description "Add instructions or change course").
  3. Type the guidance in the box and press Enter. The prompt says it reads the message at its next step.
  4. Compare with Expected: a notification "Queued. The agent reads it at its next step." appears. Reopen the task and see "Your messages" with the message marked as queued.

## S60.22 Resume.

- **Expected:** The user can resume a paused or stopped task from where it left off.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** not found in the code. Searched features/cloud-tasks (cloudRunDetail.ts, cloudRunApproval.ts, cloudTasksTree.ts) for resume. The only resumeRun call is inside approve or reject. No Resume control was found, and paused tasks are not steerable.
- **Needs:** a paused or stopped cloud task

## S60.23 Cancel.

- **Expected:** The user can stop a running task and the run is cancelled on the server.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:177; apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:216
- **Where to find it:** More actions > Work > Cloud tasks > pick a running task > Stop this task (labels found in the code)
- **Needs:** a cloud task that is still running
- **Steps:**
  1. Click "More" (More actions) > Work and pick a task that is still running.
  2. Click "Stop this task" (description "Asks the cloud executor to cancel the run").
  3. In the modal dialog that asks Stop "<task title>"?, click "Stop this task" to confirm.
  4. Compare with Expected: the notification "This task was asked to stop." appears, and the task moves to "Stopped".

## S60.25 Restart task.

- **Expected:** The user can restart a finished task with the same inputs.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/chat/retry.ts:59; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4666
- **Where to find it:** not found in the code. Searched features/cloud-tasks, features/surfaces, core/commandSetup.ts and features/chat/retry.ts for restart. The only match is "Code: Retry Last Message", which resends the last chat message. No restart control for a finished cloud task was found.
- **Needs:** a finished cloud task

## S60.26 Duplicate task.

- **Expected:** The user can duplicate a task into a new editable task.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1452; apps/extension-vscode/src/core/commandSetup.ts:1462
- **Where to find it:** not found in the code. Searched features/cloud-tasks, features/surfaces and core/commandSetup.ts for duplicate. None for cloud tasks. The closest is "Code: Fork Conversation", which forks a local session, not a cloud task.

## S60.29 Results summary.

- **Expected:** When a task ends the user sees a summary of the result.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:120; apps/extension-vscode/src/features/cloud-tasks/cloudRunPresentation.ts:180
- **Where to find it:** More actions > Work > Cloud tasks > Done > pick a task > Result (labels found in the code)
- **Needs:** a finished cloud task (completed, ready for review or archived)
- **Steps:**
  1. Click "More" (More actions) > Work and open the group "Done" under Cloud tasks.
  2. Pick a finished task.
  3. Read the "Result" section, which shows the first line of the result, with the detail "Select to copy the full result".
  4. Compare with Expected: the result summary matches what the run produced. Selecting the line copies the full result with the notice "copied the task result".

## S60.30 Generated deliverables.

- **Expected:** Files the task produced are listed and can be opened or downloaded.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:143; apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:216
- **Where to find it:** More actions > Work > Cloud tasks > pick a task > Outputs (labels found in the code)
- **Needs:** a cloud task linked to a conversation that produced an artifact
- **Steps:**
  1. Click "More" (More actions) > Work and pick a task that produced files.
  2. Read the "Outputs" section, which lists each file by its title (or "Untitled" plus its type).
  3. Select a file.
  4. Compare with Expected: the file opens in the editor. The code opens the file; it has no download step.

## S60.31 Partial-outcome summary.

- **Expected:** When a task stops short, the user sees what was done and what remains.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:113; apps/extension-vscode/src/features/cloud-tasks/cloudRunPresentation.ts:191
- **Where to find it:** More actions > Work > Cloud tasks > Stopped > pick a task > Outcome (labels found in the code)
- **Needs:** a cloud task that ended as partial, failed, cancelled or timed out, with steps
- **Steps:**
  1. Click "More" (More actions) > Work and open the group "Stopped" under Cloud tasks.
  2. Pick a task that stopped short.
  3. Read the "Outcome" section, for example "2 of 5 steps done, 3 not finished".
  4. Compare with Expected: the done and remaining steps match the Progress list.

## S60.32 Task history.

- **Expected:** The user can browse past tasks with their state and open any of them.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:146; apps/extension-vscode/src/core/commandSetup.ts:2702; apps/extension-vscode/src/features/cloud-tasks/cloudRunClient.ts:27
- **Where to find it:** More actions > Work, or Command Palette > Code: Show Cloud Tasks (labels found in the code)
- **Needs:** a signed-in AGI Cloud account that has cloud tasks
- **Steps:**
  1. Click "More" (More actions) > Work, or run "Code: Show Cloud Tasks" from the Command Palette.
  2. Look at the groups "Needs you", "Working", "Ready for review", "Done" and "Stopped", each with its tasks.
  3. Read each row's title and state.
  4. Pick any row to open its detail. Compare with Expected: the list refreshes about every 15 seconds and can be refreshed with the refresh button.

## S60.34 Cross-device task continuation.

- **Expected:** A task started on one device can be followed and acted on from another device.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:146; apps/extension-vscode/src/features/cloud-tasks/cloudRunClient.ts:27; apps/extension-vscode/src/core/commandSetup.ts:2561
- **Where to find it:** More actions > Work > Cloud tasks (tasks from other devices appear here), then pick a task (labels found in the code)
- **Needs:** a second device or the web, signed into the same AGI Cloud account
- **Steps:**
  1. On a second device (web, desktop or another VS Code), start a task with the same AGI Cloud account.
  2. In VS Code, open More actions > Work and find the task under Cloud tasks. Use the refresh button if it has not appeared.
  3. Open the task, then use "Message the agent", "Approve" or "Stop this task".
  4. Compare with Expected: the change is applied and the state shown on the other device follows it. Use "Open on web" to open the conversation in a browser.
