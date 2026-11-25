---
id: "PLAN-desktop-066"
type: "test-plan"
title: "Desktop · 66. Coding-workspace frontend"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "66"
---
# Desktop · 66. Coding-workspace frontend

20 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S66.01 Repository picker.

- **Expected:** The user chooses which repository or folder a coding session works on before it starts.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeComposer.tsx:431; apps/desktop/electron/runtime/dispatcher.ts:2312
- **Where to find it:** Sidebar > Code > New > folder chip (local folder menu, "Change the folder") (labels found in the code)
- **Needs:** the Desktop app with at least one local folder added
- **Steps:**
  1. Sign in to the Desktop app and click Code in the sidebar.
  2. Click New to start a session, then click the folder chip in the composer.
  3. Pick a folder from the list in the menu.
  4. Check that the chosen folder name stays on the chip before you send, to compare with Expected.

## S66.02 Branch picker.

- **Expected:** The user chooses the git branch a coding session starts from or works on.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeComposer.tsx:1182; apps/web/features/code/components/CodeComposer.tsx:2088; apps/desktop/electron/runtime/dispatcher.ts:3066; apps/desktop/electron/runtime/gitService.ts:712
- **Where to find it:** Sidebar > Code > New > branch chip under the folder chip ("Change the branch") (labels found in the code)
- **Needs:** a local git folder with more than one branch
- **Steps:**
  1. Open Code, click New, and pick a local folder that is a git repository.
  2. Click the branch chip shown under the folder chip.
  3. Type in "Search or type a branch name" or click a branch in the list, then click "Use this branch".
  4. Check that the chip shows the branch you chose.

## S66.04 Local/cloud execution selector.

- **Expected:** Before starting, the user chooses whether the coding session runs locally or in a cloud sandbox.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Sidebar > Code > New > environment selector ("Local" or "Cloud") (labels found in the code)
- **Needs:** a paid account for the Cloud option
- **Steps:**
  1. Click Code, then New.
  2. Open the environment choice in the composer and look for "Local" and "Cloud".
  3. Select "Cloud" and check that the composer changes to repository controls.
  4. Select "Local" and check that the folder chip returns.

## S66.05 Coding-session list.

- **Expected:** The user sees a list of their coding sessions and can open one.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionsSection.tsx:419; apps/desktop/electron/runtime/dispatcher.ts:2695; apps/desktop/electron/runtime/developerSessionService.ts:885 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Code > Your computer (session list) (labels found in the code)
- **Needs:** the Desktop app with a folder allowed to run commands
- **Steps:**
  1. Sign in to the Desktop app and click Code in the sidebar.
  2. Look for the "Your computer" section and the "On this device" list.
  3. Click a session row to open it.
  4. Check that the session opens and its title is shown, to compare with Expected.

## S66.06 Coding-session title.

- **Expected:** Each coding session shows a readable title, and the user can rename it where the surface offers renaming.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:177 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2723
- **Where to find it:** Sidebar > Code > Your computer > session row > More actions > Rename (labels found in the code)
- **Needs:** a Desktop app session
- **Steps:**
  1. Open a session from Your computer.
  2. Click the "More actions for" control on the session row (its name is the session title).
  3. Click Rename and type a new name in the "Session name" field.
  4. Check that the new title shows in the list and the session header.

## S66.07 Session status.

- **Expected:** Each coding session shows whether it is running, waiting for approval, idle, failed or closed.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionsSection.tsx:100 (quoted code not found in the file now); apps/web/features/code/local-code.ts:381; apps/web/features/code/components/LocalSessionsSection.tsx:124 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Code > Your computer (status words on each session row) (labels found in the code)
- **Needs:** a Desktop app session with a task that asks for approval
- **Steps:**
  1. Open Code and look at the "Your computer" list.
  2. Start a task in a session and watch the row change to "Running".
  3. Wait for the run to end and check the row shows "Ready" or "Idle".
  4. Check that a session with an archived state shows "Archived".

## S66.11 Code editor.

- **Expected:** The user can open and edit a source file inside the coding surface.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalChangesPanel.tsx:97; apps/web/features/code/components/LocalFileEditor.tsx:105; apps/web/features/code/components/LocalFileEditor.tsx:52 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2343
- **Where to find it:** Sidebar > Code > Your computer > session > Files > open a file > Edit > Save (labels found in the code)
- **Needs:** a Desktop app session with a text file in its folder
- **Steps:**
  1. Open a Desktop app session whose folder has a text file.
  2. Click Files (or press Command P) and open the file.
  3. Click Edit, change a line, then click Save.
  4. Check that the change shows in the file and that the file on disk changed.

## S66.15 Integrated terminal.

- **Expected:** The user runs shell commands in a terminal attached to the coding session and sees their output.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalChangesPanel.tsx:240 (quoted code not found in the file now); apps/web/features/code/components/LocalTerminal.tsx:102; apps/desktop/electron/runtime/dispatcher.ts:2378
- **Where to find it:** Code > local session > Terminal (also Session actions > Open in > Terminal) (labels found in the code)
- **Needs:** a Desktop app session with a local folder
- **Steps:**
  1. Open a Desktop app session.
  2. Click Terminal, or open Session actions > Open in > Terminal.
  3. Click the "Run a command" field, type a short command such as ls, and click Run.
  4. Check that the output appears under the terminal.

## S66.17 Command-history view.

- **Expected:** The user can review the commands run in the session with their output and exit status.
- **Code:** done. Evidence present: apps/web/features/code/components/LocalTerminal.tsx:202; apps/web/features/code/components/LocalTerminal.tsx:215; apps/web/features/code/components/LocalTerminal.tsx:102
- **Where to find it:** Code > local session > Terminal (empty text "No commands have run in this session.") (labels found in the code)
- **Needs:** a Desktop app session with a local folder
- **Steps:**
  1. Open a Desktop app session and click Terminal.
  2. Check that the empty text "No commands have run in this session." shows if nothing ran.
  3. Run a command, then look at the list of commands with their output.
  4. Check that each entry shows the command and its result, to compare with Expected.

## S66.18 Diff viewer.

- **Expected:** The user views a line-level diff of the changes the agent made.
- **Code:** done. Evidence present: apps/web/features/code/components/LocalChangesPanel.tsx:120; apps/desktop/electron/runtime/dispatcher.ts:3101; apps/desktop/electron/runtime/gitService.ts:575
- **Where to find it:** Code > local session > Changes (the Changes panel, then pick a changed file) (labels found in the code)
- **Needs:** a git folder with a changed file
- **Steps:**
  1. Open a Desktop app session in a git folder and make a change to a file (a task or an edit).
  2. Click the "Changes" button in the session.
  3. Click a changed file in the Changes panel.
  4. Check that the line-by-line diff shows removed and added lines, to compare with Expected.

## S66.19 File-change summary.

- **Expected:** The user sees a summary of which files the session created, modified or deleted.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalChangesPanel.tsx:208 (quoted code not found in the file now); apps/web/features/code/components/LocalChangesPanel.tsx:54; apps/desktop/electron/runtime/gitService.ts:575
- **Where to find it:** Code > local session > Changes (file list with commit choices) (labels found in the code)
- **Needs:** a git folder with several changed files
- **Steps:**
  1. Open a session with several changed files.
  2. Click the "Changes" button.
  3. Look at the commit line "Commits N of M changed files" and the "Include in the commit:" choices.
  4. Untick one file and check the count changes.

## S66.24 Plan mode.

- **Expected:** The user switches the agent into a plan mode where it proposes a plan and makes no edits until approved.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:83 (quoted code not found in the file now); apps/web/features/code/local-code.ts:143 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:231 (quoted code not found in the file now); apps/cli/src/agent/chat.rs:2361
- **Where to find it:** Code > local session > the Permissions chip > Plan (cloud: Approval mode > Mode > Plan) (labels found in the code)
- **Needs:** a Desktop app session with a local folder
- **Steps:**
  1. Open a Desktop app session and click the "Permissions" chip (it shows the current mode, such as Ask).
  2. Choose "Plan" and read the hint "Reads and plans. Changes nothing."
  3. Send a request that would edit a file, and check the agent proposes a plan and does not change files.
  4. Check the plan waits for approval before any edit, to compare with Expected.

## S66.25 Edit/agent mode.

- **Expected:** The user chooses a mode in which the agent may edit files and run tools on its own (edit/agent mode) versus asking first.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:111 (quoted code not found in the file now); apps/web/features/code/local-code.ts:145 (quoted code not found in the file now); apps/cli/src/app_server/developer_host.rs:7742
- **Where to find it:** Code > local session > the Permissions chip > Auto (or Ask) (labels found in the code)
- **Needs:** a Desktop app session with a local folder
- **Steps:**
  1. Open a Desktop app session and click the "Permissions" chip.
  2. Read the choices: Ask, Auto, Plan, Bypass permissions.
  3. Choose "Auto" and read the hint "Edits files without asking. Asks before commands and git hook or MCP changes."
  4. Send a small edit request and check it edits without asking, to compare with Expected.

## S66.26 Permission-mode control.

- **Expected:** The user sets how much the agent must ask before acting (ask every time / auto-approve safe / autonomous), and the running session honours it.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:234 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:1055 (quoted code not found in the file now); apps/cli/src/app_server/developer_host.rs:7724
- **Where to find it:** Code > local session > Permissions chip (Ask / Auto / Plan / Bypass permissions); cloud: Approval mode chip (labels found in the code)
- **Needs:** a Desktop app session with a local folder
- **Steps:**
  1. Open a Desktop app session and click the "Permissions" chip.
  2. Pick "Ask" and send a task that runs a command; check it asks for approval.
  3. Pick "Auto", then "Bypass permissions", and send the same task.
  4. Check the approval prompts follow each mode, to compare with Expected.

## S66.27 Context-usage indicator.

- **Expected:** The workspace shows how much of the model's context window the session has used.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:1885; apps/web/features/code/hooks/use-local-session.ts:212 (quoted code not found in the file now); apps/desktop/electron/runtime/developerSessionService.ts:1091; apps/cli/src/app_server/developer_host.rs:4820
- **Where to find it:** Code > composer > Usage ring button (popover shows "Context window") (labels found in the code)
- **Needs:** a signed-in account with an open session
- **Steps:**
  1. Open a session in the composer.
  2. Click the small usage ring button (aria label "Usage").
  3. Read the "Context window" line in the popover.
  4. Send a message and reopen the popover to check the used amount rises.

## S66.28 Usage/cost indicator.

- **Expected:** The coding surface shows how much plan usage or money the user has spent.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeComposer.tsx:1521; apps/web/lib/hooks/useManagedUsageSummary.ts:73
- **Where to find it:** Code > composer > Usage ring button > "Plan usage limits" (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the composer in Code.
  2. Click the "Usage" ring button.
  3. Read "Plan usage limits", "Five hour limit" and "Weekly, all models", and "See detailed breakdown".
  4. Check the bars and reset times match your plan, to compare with Expected.

## S66.36 Pull-request panel.

- **Expected:** The workspace shows the session's pull request (open one, see its number/link and state).
- **Code:** done. Evidence present: apps/web/features/code/components/LocalPullRequest.tsx:150; apps/web/features/code/local-code.ts:404; apps/web/features/code/services/local-pull-request-api.ts:9
- **Where to find it:** Code > local session > "Push and open a pull request" (on a branch other than the default) (labels found in the code)
- **Needs:** a GitHub-connected repository, a non-default branch, and a linked GitHub account
- **Steps:**
  1. Open a Desktop app session in a GitHub-connected repository on a non-default branch.
  2. Look for the "Push and open a pull request" action in the session.
  3. Click it, then check the pull request number ("Pull request #") and state (open, draft, merged or closed) appear.
  4. Open "Open a pull request on GitHub" to compare the link with the panel.

## S66.38 Test-results panel.

- **Expected:** The workspace shows the results of test runs (pass/fail, counts, failing output).
- **Code:** done. Evidence present: apps/web/features/code/components/LocalSessionPanel.tsx:1135; apps/web/features/code/components/LocalSessionPanel.tsx:1704; apps/desktop/electron/runtime/dispatcher.ts:2378
- **Where to find it:** Code > local session > Run tests (results under "Test output") (labels found in the code)
- **Needs:** a Desktop app session in a folder with a test command
- **Steps:**
  1. Open a Desktop app session in a folder with a test script in package.json.
  2. Click "Run tests".
  3. Watch for "Running <command>" and then the result line such as "<command> passed." or "<command> failed with exit code N."
  4. Open "Test output" and check the failing output appears, to compare with Expected.

## S66.40 Share session.

- **Expected:** The user shares a coding session with someone else, who can open it.
- **Code:** done. Evidence present: docs/decisions/2026-09-27-founder-decisions.md:334; apps/web/features/code/components/CodeSessionMenu.tsx:133
- **Where to find it:** Code > session > Session actions > Share (dialog "Share session") (labels found in the code)
- **Needs:** a second account
- **Steps:**
  1. Open a cloud session in Code.
  2. Click "Session actions" and choose "Share".
  3. In the "Share session" dialog, pick the sharing option and copy the link.
  4. Sign in with a second account in the same workspace (or open the link) and check the session opens, to compare with Expected.

## S66.41 Continue in another client.

- **Expected:** The user moves an ongoing coding session to another client (terminal, editor, desktop, phone) and continues it there.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/dispatcher.ts:2659; apps/web/features/desktop-host/components/RemoteControlSection.tsx:67
- **Where to find it:** Code > session > Session actions > Open in > Desktop app (or Open in > Terminal) (labels found in the code)
- **Needs:** a paired desktop app signed into the same account
- **Steps:**
  1. Open a session in Code in the web app or Desktop app.
  2. Click "Session actions", then hover or click "Open in".
  3. Choose "Desktop app" and check the session opens in the desktop app.
  4. Check the same session is shown with the same transcript, to compare with Expected.
