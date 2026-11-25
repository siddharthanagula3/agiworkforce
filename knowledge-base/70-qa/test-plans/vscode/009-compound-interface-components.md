---
id: "PLAN-vscode-009"
type: "test-plan"
title: "VS Code · 9. Compound interface components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "9"
---
# VS Code · 9. Compound interface components

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S9.01 Searchable resource picker.

- **Expected:** A picker lists selectable resources (files, projects, models, skills) and narrows the list as the user types a query.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8545; apps/extension-vscode/src/data/mentionSearch.ts:138
- **Where to find it:** AGI Code sidebar > click the "Describe a task…" box > type @ and a few letters of a file or symbol name (labels found in the code)
- **Needs:** a workspace folder open in VS Code
- **Steps:**
  1. Sign in, open the AGI Code sidebar and click the "Describe a task…" box.
  2. Type @ followed by part of a file name, for example @app.
  3. Look for a list labelled "Workspace files and symbols" under the box, and check that it narrows as you type more letters.
  4. Clear the text and type a different query; the list should change to match.
  5. Note: the code searches workspace files, folders and symbols. It did not show projects, models or skills in this picker.

## S9.02 Model picker.

- **Expected:** A control lists the available models and switches the conversation to the one the user picks.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5286; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2150
- **Where to find it:** AGI Code sidebar > model button under the chat box (title "Model", shows "Auto" by default) > pick a model in the "Select model" list (labels found in the code)
- **Steps:**
  1. Open the AGI Code sidebar and find the model button under the chat box; it shows "Auto" at first.
  2. Click it to open the "Select model" list grouped by model family.
  3. Pick a different model.
  4. Check that the button now shows the model you picked and that the next reply uses it.
  5. Alternative: open the Command Palette and run "Code: Select Model", then pick a model.

## S9.06 Project picker.

- **Expected:** The user can pick one of their projects so the chat or task runs in that project.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/projects/projectActions.ts:230; apps/extension-vscode/src/features/projects/projectActions.ts:362; apps/extension-vscode/src/core/commandSetup.ts:2618
- **Where to find it:** Command Palette > "Code: Show Projects" > pick a project > "Use in this chat" (labels found in the code)
- **Needs:** a cloud account with at least one project
- **Steps:**
  1. Open the Command Palette and run "Code: Show Projects".
  2. Pick one of your projects from the list.
  3. In the project detail list, choose "Use in this chat".
  4. Open the same project again and check that its row now says "Used in this chat" with a check mark.
  5. Send a message in the chat and check that the project is applied to it.

## S9.07 Repository picker.

- **Expected:** The user can choose which code repository a coding session works in, from a list or by URL/path.
- **Code:** done. Evidence present: apps/extension-vscode/src/platform/workspaceFolders.ts:21; apps/extension-vscode/src/platform/workspaceFolders.ts:3
- **Where to find it:** Two or more folders open in one VS Code window with no file open > an AGI Code action that needs a folder > list "Select a workspace folder for this operation" (labels found in the code)
- **Needs:** two folders open in one VS Code window
- **Steps:**
  1. Open two folders in one VS Code window (File > Open Folder twice, or add a folder to the workspace).
  2. Close every editor tab so no file is active.
  3. Run an AGI Code command that works on a folder.
  4. Look for the list titled "Select a workspace folder for this operation" and pick a folder; the folder path is shown beside each name.
  5. Check that the command runs in the folder you picked.

## S9.10 Permission-scope picker.

- **Expected:** When granting access (an API key, tool approvals or site automation), the user chooses how far the permission reaches: which capabilities, or once versus always.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7035; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1833 (quoted code not found in the file now)
- **Where to find it:** AGI Code sidebar > chat asks to run a shell command (approval card "Approval needed") > choose Approve or Deny; or Command Palette > "Code: Permissions" > "Add a rule" (labels found in the code)
- **Needs:** a task that asks for approval (shell commands ask first in the mode described in the Mode list)
- **Steps:**
  1. Open the AGI Code sidebar and send a task that runs a shell command, such as listing files.
  2. When the "Approval needed" card appears, read the action it names.
  3. Compare the choices offered (once, for session, deny) and note what each one covers.
  4. Choose one and check that the run continues or stops as chosen.
  5. Open the Command Palette, run "Code: Permissions" and check the "Add a rule" entry, which lets you pick allow, ask first or block for a site, tool or command.

## S9.19 Timeline.

- **Expected:** The steps of a run are shown in time order, each with its state and (where known) how long it took.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7968; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7955
- **Where to find it:** AGI Code sidebar > send a task that uses tools > "Activity" summary under the reply > click it to open the list of tool steps (labels found in the code)
- **Needs:** a sign-in or setup that lets AGI run tools
- **Steps:**
  1. Send a task that makes AGI read or change files so tools run.
  2. Find the "Activity" summary under the reply, which shows a count such as "3 actions".
  3. Click it to open the list of steps.
  4. Check that the steps are in the order they ran, each with its state (running, done or error).
  5. Check that finished steps show a time such as "· 1.2s" after their name.

## S9.21 Task board.

- **Expected:** Tasks are laid out as a board with a column per status so the user sees and manages work by stage.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:45
- **Where to find it:** Command Palette > "Code: Show Cloud Tasks" (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with at least one cloud task
- **Steps:**
  1. Open the Command Palette and run "Code: Show Cloud Tasks".
  2. Look at the list titled with "Cloud tasks"; tasks are grouped under the headings "Needs you", "Working", "Ready for review", "Done" and "Stopped".
  3. Compare the groups with the task states shown in each row.
  4. Start or wait for a cloud task in another state and check that it moves to the matching group.

## S9.22 Stepper.

- **Expected:** A multi-step flow shows which step the user is on out of how many (e.g. dots or "Step 2 of 4") and advances or goes back with it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2274 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2653 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2650 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched apps/extension-vscode/src for "Step N of", "Step " with a value, "stepper", "step-dot", "steps-indicator" and "wizard". No step indicator or stepper was found; the only related item is onboarding inline actions in the sidebar CSS.

## S9.24 Split-pane container.

- **Expected:** Two panes sit side by side (e.g. chat and artifact) and the user can resize the split, by pointer and by keyboard.
- **Code:** done. Evidence present: apps/extension-vscode/src/platform/applyEdit.ts:104; apps/extension-vscode/src/core/commandSetup.ts:1150
- **Where to find it:** not found in the code. The code opens results beside the current editor (showLlmResultInNewTab in apps/extension-vscode/src/platform/applyEdit.ts), but no app control to resize that split was found; the resize is VS Code's own editor divider. Not confirmed that the pane pairing matches Expected.

## S9.25 Docking layout manager.

- **Expected:** The user can move panels to different positions (left, right, bottom, floating) and the layout keeps that arrangement.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:966; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** not found in the code. Searched apps/extension-vscode for docking, left, right, bottom, floating and layout code. The app registers one sidebar view (apps/extension-vscode/package.json, views agi-workforce.sidebar); moving it is done by VS Code, and no layout-saving code was found.

## S9.27 Diff viewer.

- **Expected:** Changes to a file are shown as a diff (added and removed lines marked) that the user can read before accepting.
- **Code:** done. Evidence moved: apps/extension-vscode/src/providers/diffDecorationProvider.ts:252 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2250; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2281
- **Where to find it:** AGI Code sidebar > a reply with a code block > "Apply" button on the block > the editor shows the proposed change with "Accept" and "Reject" links above it (labels found in the code)
- **Needs:** a file open in the editor and a reply with a code block
- **Steps:**
  1. Open a file in the editor and ask AGI in the sidebar to change it, so a reply includes a code block.
  2. Click the "Apply" button on that code block.
  3. Wait for the change to appear in the open file, with removed lines shaded red and added lines marked "+" in the gutter.
  4. Read the line above the change, which starts with "Changes:" and names the file.
  5. Compare with Expected: the lines are readable before you click "Accept" or "Reject".

## S9.29 Usage meter.

- **Expected:** A meter shows how much of the plan allowance is used (per window) with the reset time, readable by assistive tech.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3140; apps/extension-vscode/src/utils/api.ts:845 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3383
- **Where to find it:** Command Palette > "Code: Account & Usage" > "Cloud usage: N% used" row; the sidebar usage bar is labelled "AGI Managed Cloud plan usage" (labels found in the code)
- **Needs:** a paid AGI Cloud plan (Free accounts do not get this meter in the code path checked)
- **Steps:**
  1. Open the Command Palette and run "Code: Account & Usage".
  2. Find the "Cloud quota" section and the row that starts "Cloud usage:" with the percent used and "Plan:" beside it.
  3. Open the AGI Code sidebar and find the usage bar labelled "AGI Managed Cloud plan usage" (with "Usage" to show details if it is collapsed).
  4. Check the percent, the reset text in the bar (or "No reset pending") and that the bar matches the palette row.
  5. Optional: with VoiceOver on, focus the bar and check that it reads the percent.

## S9.30 Credit-balance card.

- **Expected:** The user sees their purchased credit balance in one place, next to a way to add credits.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4070; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4077; apps/extension-vscode/src/utils/api.ts:1394
- **Where to find it:** Command Palette > "Code: Account & Usage" > "Add credits" (shown only when the account has a credit balance) (labels found in the code)
- **Needs:** a paid account that has a credit balance
- **Steps:**
  1. Open the Command Palette and run "Code: Account & Usage".
  2. Look for the row "Add credits" with the description "Buy credits in Settings > Billing on Web".
  3. Check the sidebar usage list titled "Managed Cloud usage limits" for the credit row with its balance and an "Add credits" button.
  4. Choose "Add credits" and check that the web billing page opens.
  5. Compare the balance shown with Expected: the balance and the add-credits action sit together.

## S9.31 Permission summary.

- **Expected:** One view states in plain language what the assistant or a connected app is allowed to do (scopes, autonomy, allowed sites or tools).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1220; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1263; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1288
- **Where to find it:** Command Palette > "Code: Permissions" (labels found in the code)
- **Steps:**
  1. Open the Command Palette and run "Code: Permissions".
  2. Read the list: "This session" shows the mode and tools; "Rules for every session" lists saved rules; "Trusted folders" lists trusted folders.
  3. Compare the list with what the assistant may do: check the mode label and any "Turned off" tools.
  4. Pick "Add a rule" and look at the choices offered (allow, ask first, block) without saving, then cancel.

## S9.32 Approval card.

- **Expected:** When an action needs consent, an inline card names the action and offers approve and deny, and the choice resumes or stops the run.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7135; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7213; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1840
- **Where to find it:** AGI Code sidebar > send a task that needs an action approved > "Approval needed" card with Approve and Deny buttons (labels found in the code)
- **Needs:** a task that triggers an approval (a shell command)
- **Steps:**
  1. Open the AGI Code sidebar and send a task that asks AGI to run a shell command.
  2. When the "Approval needed" card appears, read the action named in the card.
  3. Click one of the approve buttons (once or for the session) and check that the card shows an approved state and the run continues.
  4. Send another such task, click "Deny" (or type guidance in the box and press Enter) and check that the run stops or changes course.
  5. "Abort turn" stops the whole reply; check that it ends the run.

## S9.35 Task-progress card.

- **Expected:** A running task shows a card with its current state and progress (steps done, latest action) that updates while it runs.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:57; apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:59; apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:146
- **Where to find it:** Command Palette > "Code: Show Cloud Tasks" > group "Working" > pick a running task (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with a running cloud task
- **Steps:**
  1. Open the Command Palette and run "Code: Show Cloud Tasks".
  2. Under the "Working" group, pick a task that is running.
  3. Read its state and description, and open its detail with the task's title.
  4. Wait about 15 seconds and check that the state or progress has changed when it has changed in the cloud.

## S9.38 Keyboard-command palette.

- **Expected:** A keyboard shortcut opens a searchable list of commands and destinations; typing filters it and Enter runs the choice.
- **Code:** done. Evidence moved: apps/extension-vscode/package.json:753; apps/extension-vscode/src/core/commandSetup.ts:2309 (quoted code not found in the file now)
- **Where to find it:** AGI Code sidebar > click the "/" button (title "Commands") > type in the "Filter actions…" box > press Enter on a choice (labels found in the code)
- **Steps:**
  1. Open the AGI Code sidebar and click the "/" button beside the chat box.
  2. Check that the list opens with a "Filter actions…" box focused.
  3. Type part of a command name, for example "model", and check that the list narrows.
  4. Press Enter on the highlighted item and check that it runs.
