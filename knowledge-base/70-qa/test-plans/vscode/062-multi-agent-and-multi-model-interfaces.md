---
id: "PLAN-vscode-062"
type: "test-plan"
title: "VS Code · 62. Multi-agent and multi-model interfaces"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "62"
---
# VS Code · 62. Multi-agent and multi-model interfaces

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S62.09 Concurrent task view.

- **Expected:** The user can watch several running tasks or agents at once in one view.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:146; apps/extension-vscode/src/features/cloud-tasks/cloudRunClient.ts:27
- **Where to find it:** Command Palette > "Code: Show Cloud Tasks" (quick pick ending in "Cloud tasks"; the runs sit under group headings such as "Working") (labels found in the code)
- **Needs:** a signed-in AGI account with two or more cloud tasks running
- **Steps:**
  1. Sign in to AGI Cloud (the list needs an AGI account; if signed out, the list shows "Sign in to see your cloud tasks").
  2. Start two or more cloud tasks, or use an account that already has them running.
  3. Open the Command Palette and run "Code: Show Cloud Tasks".
  4. Look at the list: several runs should appear at the same time, grouped under "Working" (and other groups), each with its own row.
  5. Click "Refresh cloud tasks" in the title bar of the list and check that the states update.

## S62.10 Needs-input prioritization.

- **Expected:** Tasks or agents that need the user's input are surfaced first.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:27 (quoted code not found in the file now); apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:110 (quoted code not found in the file now)
- **Where to find it:** Command Palette > "Code: Show Cloud Tasks", then the first group "Needs you" (labels found in the code)
- **Needs:** a signed-in AGI account with a cloud task waiting for input or approval, and one running task
- **Steps:**
  1. Sign in to AGI Cloud and have at least one cloud task that is waiting for your input or for approval, and at least one task that is running.
  2. Open the Command Palette and run "Code: Show Cloud Tasks".
  3. Look at the group order: "Needs you" should be the first group, above "Working", "Ready for review", "Done" and "Stopped".
  4. Compare: the waiting task should be listed under "Needs you" and not under "Working".

## S62.11 Inline unblock response.

- **Expected:** The user can unblock a waiting task or agent inline without leaving the overview.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2561; apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:216
- **Where to find it:** Command Palette > "Code: Show Cloud Tasks", then a row under "Needs you" with the check and x row buttons (labels found in the code)
- **Needs:** a signed-in AGI account with a cloud task that has a pending approval
- **Steps:**
  1. Sign in to AGI Cloud and have a cloud task with a pending approval (it shows under "Needs you").
  2. Open the Command Palette and run "Code: Show Cloud Tasks" and stay in the list.
  3. Hover the check button on the waiting row: the tooltip should read "Approve this run". Hover the x button: "Reject this run".
  4. Click the check button, read the confirmation (it offers "Approve and continue"), and confirm.
  5. Compare: the list should update and the run should leave "Needs you"; the x button rejects the run and asks for a reason.

## S62.14 Agent handoff.

- **Expected:** Work can be handed from one agent to another, and the receiving agent continues it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:184
- **Where to find it:** Command Palette > "Code: Continue in the Cloud" (hands the current branch to a cloud session; the cloud session then continues the work and shows under "Code: Show Cloud Tasks") (labels found in the code)
- **Needs:** a signed-in AGI Cloud account, a workspace with a GitHub remote, and a pushed branch
- **Steps:**
  1. Open a folder whose git remote is on GitHub, check out a branch, and push it (the code refuses a detached commit or an unpushed branch).
  2. Open the Command Palette and run "Code: Continue in the Cloud".
  3. Read the review message, choose the continue option, and confirm the repository, branch and model shown.
  4. Open the Command Palette and run "Code: Show Cloud Tasks" to find the new cloud task.
  5. Open the new task (or "Code: Open AGI Code Session") and check that the cloud session continues the work from that branch.

## S62.17 Interactive branch.

- **Expected:** The user can branch the conversation from a point and continue interactively in the branch.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1452; apps/extension-vscode/src/core/commandSetup.ts:1462
- **Where to find it:** Chat: "/" button (title "Commands") > Context > "Rewind" > pick a prompt under "Checkpoints" > "Fork conversation and rewind code"; or Command Palette > "Code: Fork Conversation" (labels found in the code)
- **Needs:** a developer session with a prompt that changed tracked files; the fork option appears only when the runtime offers it
- **Steps:**
  1. Open the AGI chat in the editor and send a prompt that changes a file, so a checkpoint exists.
  2. Click the "/" button titled "Commands", then choose "Rewind" under Context.
  3. In the list titled "Checkpoints", pick the prompt to go back to.
  4. Choose "Fork conversation and rewind code" and confirm.
  5. Compare: a new chat should open just before that prompt, the original chat keeps its history, and you can keep typing in the new chat.
