---
id: "PLAN-vscode-004"
type: "test-plan"
title: "VS Code · 4. Signed-in application destinations"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "4"
---
# VS Code · 4. Signed-in application destinations

20 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S4.01 New-chat home.

- **Expected:** Signed-in user lands on (or opens) an empty new-chat screen with a ready composer from which a new conversation starts.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3168; apps/extension-vscode/src/core/commandSetup.ts:1725
- **Where to find it:** AGI Code sidebar > New chat (+ button in the header, tooltip "New chat"); command palette: Code: New Conversation (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in, then open AGI Code from the activity bar (or run Code: Open Chat).
  2. Click the + button whose tooltip is "New chat".
  3. Look for an empty chat with a composer that says "Describe a task…" and type a first message to start a new conversation.

## S4.02 Existing conversation.

- **Expected:** Opening a past conversation (from the list or a link) shows its transcript and lets the user continue it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:1243 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:1399
- **Where to find it:** AGI Code sidebar > Sessions (history icon in the header) > click a session row; command palette: Code: Open Conversation (labels found in the code)
- **Needs:** a signed-in account with at least one past session
- **Steps:**
  1. Click the history icon with tooltip "Sessions" in the AGI Code header.
  2. Click one session in the list.
  3. Check that its transcript opens and that you can send a new message to continue it.

## S4.03 Conversation search.

- **Expected:** A search destination where the user types a keyword, gets past conversations matching titles or message text, and opens one.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/trees/sessionPickers.ts:60; apps/cli/src/app_server/developer_host.rs:3578
- **Where to find it:** AGI Code sidebar > Sessions (history icon) > Search sessions box; also command palette: Code: Show Sessions History (labels found in the code)
- **Needs:** a signed-in account with several past sessions
- **Steps:**
  1. Click the "Sessions" icon in the AGI Code header.
  2. Click the "Search sessions" box and type a word from a session title.
  3. Clear it and type a word that appears only inside a message body.
  4. Click a matching result and check it opens that session.

## S4.04 Archived conversations.

- **Expected:** A destination lists the user's archived conversations and lets them open, restore or delete them.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/trees/sessionPickers.ts:134
- **Where to find it:** AGI Code sidebar > Sessions (history icon) > Archived sessions (archive icon); command palette: Code: Archived Sessions (labels found in the code)
- **Needs:** a signed-in account with at least one archived session
- **Steps:**
  1. Click "Sessions" in the AGI Code header.
  2. Click the archive icon labelled "Archived sessions".
  3. Select a session and click the Restore button, or the Delete permanently button.
  4. Confirm the delete prompt if you chose it; check the session is back in the list or gone from the archive.

## S4.06 Projects index.

- **Expected:** A Projects destination lists the user's projects and lets them open or create one.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:2593; apps/extension-vscode/src/features/surfaces/index.ts:270 (quoted code not found in the file now); apps/extension-vscode/src/features/projects/projectsTree.ts:87 (quoted code not found in the file now)
- **Where to find it:** AGI Code header > More (…) > Projects; command palette: Code: Show Projects (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the "More" button in the AGI Code header.
  2. Click "Projects".
  3. Check the list opens with the placeholder "Open a project…".
  4. Click the "New project" icon in the list's title bar and check the create flow starts.

## S4.07 Project overview.

- **Expected:** Opening a project shows its home: name, description/instructions summary, and entry points to its chats and files.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2603; apps/extension-vscode/src/features/projects/projectActions.ts:96; apps/extension-vscode/src/features/projects/projectActions.ts:182
- **Where to find it:** AGI Code header > More > Projects > click a project (labels found in the code)
- **Needs:** a signed-in account with at least one project
- **Steps:**
  1. Click "More" in the AGI Code header, then "Projects".
  2. Click a project in the list.
  3. Check the project home shows its name, an "About" section with description and instructions, "Knowledge files" and "Recent conversations".

## S4.08 Project conversations.

- **Expected:** Within a project, a list of the project's conversations that open when selected.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/projects/projectActions.ts:124; apps/extension-vscode/src/features/projects/projectActions.ts:246
- **Where to find it:** AGI Code header > More > Projects > click a project > "Recent conversations" section > click a conversation (labels found in the code)
- **Needs:** a signed-in account with a project that has conversations
- **Steps:**
  1. Open a project from More > Projects.
  2. Scroll to the "Recent conversations" section.
  3. Click one conversation.
  4. Check that it opens; the code opens it in the web app in the browser, not inside the editor.

## S4.10 Project instructions.

- **Expected:** A place to view and edit a project's instructions, which then apply to chats in that project.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1710; apps/extension-vscode/src/features/settings/SettingsPanel.ts:389
- **Where to find it:** AGI Code header > More > Projects > click a project > Edit > Instructions (labels found in the code)
- **Needs:** a signed-in account with a project
- **Steps:**
  1. Open a project from More > Projects.
  2. Under "Edit", click "Instructions".
  3. Change the text in the "Project instructions" box and save.
  4. Reopen the project and check the saved text shows; check it is used in a chat in that project.

## S4.14 Active-task dashboard.

- **Expected:** A dashboard lists the user's active/running work tasks with their live status, filterable from finished ones.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2549; apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:59; apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:146
- **Where to find it:** AGI Code header > More > Work (labels found in the code)
- **Needs:** a signed-in account with cloud tasks
- **Steps:**
  1. Click "More" in the AGI Code header, then "Work".
  2. Read the groups "Needs you", "Working", "Ready for review", "Done" and "Stopped".
  3. To hide finished work, type a word in the list's box to narrow it; no separate filter toggle was found.
  4. Compare each task's status text with what is shown on the cloud web app.

## S4.15 Task details and transcript.

- **Expected:** Opening one task shows its status, step-by-step activity/transcript, outputs, and any pending decision.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:86; apps/extension-vscode/src/core/commandSetup.ts:2709
- **Where to find it:** AGI Code header > More > Work > click a cloud task row (labels found in the code)
- **Needs:** a signed-in account with a cloud task
- **Steps:**
  1. Click "More", then "Work".
  2. Click a task under any group.
  3. Read the sections "Progress", "Outcome", "Result", "Error", "Outputs" (only those that apply).
  4. Check the "Actions" section for approve or reject when a decision is pending.

## S4.16 Approvals inbox.

- **Expected:** An approvals inbox gathers every pending approval across the user's tasks and lets them approve or reject each.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:132 (quoted code not found in the file now); apps/extension-vscode/src/features/surfaces/treeQuickPick.ts:155
- **Where to find it:** AGI Code header > More > Work > "Needs you" group; approve or reject on the row, or open the task > Actions (labels found in the code)
- **Needs:** a signed-in account with a cloud task waiting for approval
- **Steps:**
  1. Click "More", then "Work".
  2. Look in the "Needs you" group for tasks waiting on you.
  3. On a row, click the check icon "Approve this run" or the x icon "Reject this run".
  4. Open a task and use "Approve" or "Reject" in its Actions section, then check the row leaves "Needs you".

## S4.18 Routine details.

- **Expected:** Opening one routine/schedule shows its configuration (prompt, cadence, next run) and its run history.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2588; apps/extension-vscode/src/features/schedules/scheduleActions.ts:211
- **Where to find it:** Command palette > Code: Show Schedules; then hover a schedule row, or use its "Show recent runs" icon (labels found in the code)
- **Needs:** a signed-in account with at least one schedule
- **Steps:**
  1. Run "Code: Show Schedules" from the command palette.
  2. Hover a schedule row to read its status, cadence, timezone, next run and prompt in the tooltip.
  3. Click the history icon "Show recent runs" on the row.
  4. Check the run list matches Expected: runs with their status and times.

## S4.19 Coding-session home.

- **Expected:** A coding home lists the user's coding sessions and starts a new one on a repository or runtime.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/chatSetup.ts:62; apps/extension-vscode/src/core/commandSetup.ts:1243 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5386
- **Where to find it:** not found in the code. No dedicated coding-session home found. Closest: the Sessions sheet with its Local and Cloud tabs plus the + New chat button (webviewContent.ts), and Code: Session Worktrees > New session in a worktree (apps/extension-vscode/src/features/surfaces/sessionWorktrees.ts). Searched the app folder for a coding home, coding sessions and repository-start screens.
- **Needs:** a signed-in account

## S4.20 Coding-session workspace.

- **Expected:** A coding-session workspace shows the session transcript, file changes/diffs and a composer to steer the next turn.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3168; apps/extension-vscode/src/core/commandSetup.ts:1034; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5386
- **Where to find it:** AGI Code header > Sessions > open a session row (the chat panel is the workspace) (labels found in the code)
- **Needs:** a signed-in account with a coding session that changed files
- **Steps:**
  1. Click "Sessions" in the AGI Code header and open a session.
  2. Read the transcript in the chat panel.
  3. Where a change exists, click "Review changes".
  4. Type your next instruction in the box that says "Describe a task…" and check the reply continues the session.

## S4.25 Artifact gallery.

- **Expected:** An artifact gallery lists the user's generated artifacts and opens any of them.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2638; apps/extension-vscode/src/features/artifacts/artifactsTree.ts:112
- **Where to find it:** AGI Code header > More > Artifacts; command palette: Code: Show Artifacts (labels found in the code)
- **Needs:** a signed-in account with at least one artifact
- **Steps:**
  1. Click "More" in the AGI Code header, then "Artifacts".
  2. Check the list of your artifacts.
  3. Click one artifact and check it opens.

## S4.35 Skills manager.

- **Expected:** A skills manager lists installed and available skills and lets the user install, enable/disable, author and remove them.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:245; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:295
- **Where to find it:** AGI Code header > More > Skills; also Settings > Integrations > Skills (labels found in the code)
- **Steps:**
  1. Click "More", then "Skills".
  2. Check the installed and available lists.
  3. Click "Install a skill" or "Create a skill" from the top of the list.
  4. On a skill row, use the "Turn on" or "Turn off" button and check the state changes.

## S4.36 Plugins manager.

- **Expected:** A plugins manager lists installed and available plugins and lets the user install, configure, update and remove them.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:503; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:360; apps/extension-vscode/src/integrations/localRuntimeClient.ts:2227
- **Where to find it:** AGI Code header > More > Plugins; also Settings > Integrations > Plugins (labels found in the code)
- **Needs:** a signed-in account to browse the marketplace
- **Steps:**
  1. Click "More", then "Plugins".
  2. Check the installed plugins and the "Browse AGI Cloud Marketplace" entry.
  3. Click "Install a plugin" to add one.
  4. On an installed plugin, use "Configure options" or "Update" and check the result.

## S4.39 Usage dashboard.

- **Expected:** A usage dashboard shows current usage against plan limits per window (session/weekly/credits), reset times and recent usage history.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2295; apps/extension-vscode/src/core/commandSetup.ts:2344
- **Where to find it:** AGI Code header > More > Account & usage; command palette: Code: Account & usage (some labels not found in the code; trust the screen)
- **Needs:** a paid account to see plan windows (a Free account sees only the Upgrade item)
- **Steps:**
  1. Click "More", then the "Account & usage" item (or run the command).
  2. Read "Session usage" and the "<plan> plan usage" rows with their reset times.
  3. Scroll to "Usage history" for recent usage.

## S4.41 Personal settings.

- **Expected:** A personal settings destination lets the signed-in user view and change their own preferences (profile, appearance, personalization, notifications) and saves them.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:740 (quoted code not found in the file now); apps/extension-vscode/src/features/settings/SettingsPanel.ts:363
- **Where to find it:** AGI Code header > More > Personalization; command palette: Code: Personalization (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click "More", then "Personalization".
  2. Under "About you", pick "What should AGI call you?" and change it.
  3. Under "Responses", change "Style" or "Length".
  4. Close and reopen Personalization and check the new values are kept.

## S4.44 Help and feedback.

- **Expected:** A help-and-feedback destination links to help/docs/status and lets the user send product feedback or a bug report from inside the product.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/help/helpMenu.ts:19; apps/extension-vscode/src/features/help/helpMenu.ts:24; apps/extension-vscode/src/features/help/helpMenu.ts:34; apps/extension-vscode/src/features/help/helpMenu.ts:40; apps/extension-vscode/src/features/feedback/submitFeedback.ts:27 (quoted code not found in the file now)
- **Where to find it:** AGI Code header > More > Help (labels found in the code)
- **Needs:** a signed-in account to send feedback
- **Steps:**
  1. Click "More", then "Help".
  2. Check the items "Help center", "Service status", "Documentation", "Contact support" open web pages.
  3. Click "Send feedback", then choose "Report a Bug" and check the feedback form opens.
