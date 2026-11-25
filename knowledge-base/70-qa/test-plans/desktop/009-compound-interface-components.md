---
id: "PLAN-desktop-009"
type: "test-plan"
title: "Desktop · 9. Compound interface components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "9"
---
# Desktop · 9. Compound interface components

36 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S9.01 Searchable resource picker.

- **Expected:** A picker lists selectable resources (files, projects, models, skills) and narrows the list as the user types a query.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:298; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:88; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7094; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5612
- **Where to find it:** Chat composer > Work mode > "Files" in the work bar above the message box > "Search library files" (labels found in the code)
- **Needs:** a paid account with Work available (not a Free trial) and at least two library files
- **Steps:**
  1. Turn on Work mode from the composer mode choice labelled "Work".
  2. Click "Files" in the work bar under the message box.
  3. Type part of a file name in the box "Search library files".
  4. Look: the list shows only files whose names match what you typed, compared with Expected.

## S9.02 Model picker.

- **Expected:** A control lists the available models and switches the conversation to the one the user picks.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:736; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1171; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6734
- **Where to find it:** Chat composer, bottom row > the model name button (screen-reader name ends "Change model") > "Models" list > "Search models" (labels found in the code)
- **Steps:**
  1. Open a new chat.
  2. Click the model name button at the bottom of the message box.
  3. Type a model name in "Search models" and click a different model.
  4. Look: the model name on the button changes to the one you picked, compared with Expected.

## S9.03 Source picker.

- **Expected:** Before or while asking, the user can choose which sources (specific sites, files, connected apps) the answer may draw on.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchActivity.tsx:690; apps/web/features/chat/components/research/ResearchActivity.tsx:808; apps/web/features/chat/components/messages/MessageBubble.tsx:2626
- **Where to find it:** Chat composer > plus button (screen-reader name "More composer options") > "Deep Research" > "Research plan" panel > "Add a source" (labels found in the code)
- **Needs:** a paid account with Deep Research; a connected app for the Connected app option
- **Steps:**
  1. Click the plus button and choose "Deep Research".
  2. Send a research question so the "Research plan" panel opens.
  3. In "Add a source" pick a kind: "Only this site", "Never this site", "My files" or "Connected app", type or choose a value, then click "Add".
  4. Look: the chip list "Sources for this run" shows the added source, compared with Expected.

## S9.04 Connected-account picker.

- **Expected:** When a connector has more than one linked account, the user can pick which account a task or chat uses.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched for account pickers ("Choose account", "Select account", "accounts.map", "Connected account") under apps/web/features and packages/ui. Found only a read-only list of accounts, "Connected account" heading, in apps/web/features/connectors/components/ConnectorAccountSummary.tsx, with no control to pick one.
- **Needs:** a connector with two linked accounts

## S9.05 Workspace picker.

- **Expected:** The user can see their personal and team workspaces in a list and switch the active one.
- **Code:** done. Evidence present: apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:180; apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:102; apps/web/shared/components/layout/AccountMenuItems.tsx:82
- **Where to find it:** Account menu for your name (sidebar) > "Workspace" > "Personal" or a team workspace name (labels found in the code)
- **Needs:** a team workspace on the account
- **Steps:**
  1. Open the account menu from the sidebar.
  2. Hover or click "Workspace".
  3. Look at the list: "Personal" and any team workspaces.
  4. Click a different workspace; a confirmation may appear, then check the active workspace changed, compared with Expected.

## S9.06 Project picker.

- **Expected:** The user can pick one of their projects so the chat or task runs in that project.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7055; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2782
- **Where to find it:** Chat composer > "Project" in the work bar (reads "Project or folder" in Work mode) > "Search projects..." (labels found in the code)
- **Needs:** a paid account with Work available and at least one project
- **Steps:**
  1. Turn on Work mode in the composer.
  2. Click "Project" in the work bar under the message box.
  3. Type a project name in "Search projects...".
  4. Click a project and look: the button shows that project name, compared with Expected.

## S9.07 Repository picker.

- **Expected:** The user can choose which code repository a coding session works in, from a list or by URL/path.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeComposer.tsx:431; apps/desktop/electron/runtime/dispatcher.ts:2312
- **Where to find it:** Code (sidebar) > composer > "Select repository" chip > "Search repositories" or the URL box (labels found in the code)
- **Needs:** a connected GitHub account with repositories, or a public repository URL
- **Steps:**
  1. Open Code from the sidebar.
  2. Click the "Select repository" chip.
  3. Type in "Search repositories" to narrow the list, or type a URL such as the placeholder "https://github.com/owner/repository".
  4. Click a repository and look: the chip shows its name, compared with Expected.

## S9.08 Branch picker.

- **Expected:** The user can pick the branch a coding session starts from or works on from a list of the repository's branches.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeComposer.tsx:1182; apps/web/features/code/components/CodeComposer.tsx:1205; apps/web/features/code/components/CodeComposer.tsx:1225; apps/desktop/electron/runtime/gitService.ts:681; apps/desktop/electron/runtime/gitService.ts:712; apps/desktop/electron/runtime/dispatcher.ts:918
- **Where to find it:** Code (sidebar) > choose a repository > branch chip (screen-reader name "Change the branch") > "Search or type a branch name" (labels found in the code)
- **Needs:** a repository with more than one branch
- **Steps:**
  1. Choose a repository in Code.
  2. Click the branch chip.
  3. Look at the "Branches" list, then type in "Search or type a branch name" to filter.
  4. Click another branch and look: the chip shows that branch, compared with Expected.

## S9.09 Device picker.

- **Expected:** The user can pick which device is used (microphone, speaker, camera or paired computer) from a list.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:12; apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:92; apps/web/features/chat/components/Voice/VoiceComposer.tsx:139 (quoted code not found in the file now)
- **Where to find it:** Chat > "Start voice mode" > "Audio output" button in the voice screen (labels found in the code)
- **Needs:** a microphone and a second audio output device to see a real choice
- **Steps:**
  1. Click "Start voice mode" in the composer.
  2. Click the "Audio output" button.
  3. Look at the list "Audio output device" with "System default" and any other speakers.
  4. Pick a device and look: the button shows that device, compared with Expected.

## S9.10 Permission-scope picker.

- **Expected:** When granting access (an API key, tool approvals or site automation), the user chooses how far the permission reaches: which capabilities, or once versus always.
- **Code:** done. Evidence moved: apps/web/features/settings/components/Settings/ApiKeys.tsx:354; apps/web/features/settings/services/user-preferences.ts:541 (quoted code not found in the file now); apps/web/features/settings/sections/AccountSection.tsx:40
- **Where to find it:** Settings > Account > "API keys" > "Generate Key" (scope checkboxes); also chat composer > "Tool approvals" in Work mode (labels found in the code)
- **Needs:** a signed-in account; creating a key is only needed to see the result
- **Steps:**
  1. Open Settings > Account and click the "API keys" row.
  2. Click "Generate Key".
  3. Look at the scope list: "Read model catalog", "Run inference", "Read usage", and tick only some of them.
  4. Create the key and look at the key list: it shows only the scopes you ticked, compared with Expected.

## S9.11 Member and recipient picker.

- **Expected:** The user can pick one or more people (workspace members or recipients) by name or email to share with, invite or assign.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:407; apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:230; apps/web/app/chat/projects/[id]/page.tsx:626; apps/web/features/projects/components/ProjectSharingControls.tsx:243
- **Where to find it:** Projects (sidebar) > open a project > the more-options menu > "Share" > "Share <project name>" dialog (labels found in the code)
- **Needs:** a second account in the same workspace
- **Steps:**
  1. Open Projects and open one of your projects.
  2. Open the more-options menu and click "Share".
  3. Look at the dialog: the list "People with access to <project>", each person with a Read, Write or None choice, and the sharing select "Everyone in the workspace can view" or "Only people you invite".
  4. Change one person's access and look: the choice is saved and shown, compared with Expected.

## S9.12 Recurrence editor.

- **Expected:** When creating a scheduled task, the user sets how it repeats (once, daily, weekly, monthly or a custom rule) and the schedule runs on that cadence.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:312; apps/web/lib/services/schedule-service.ts:807; apps/web/features/schedules/components/SchedulesPage.tsx:278
- **Where to find it:** Scheduled (sidebar) > "New task" > "Frequency" (labels found in the code)
- **Steps:**
  1. Open Scheduled and click "New task".
  2. Fill "Schedule Name" and "Task Instructions".
  3. Open "Frequency" and choose "One Time", "Daily", "Weekly", "Monthly", "Interval", "Custom Cron" or "Recurrence Rule"; the fields below change to match.
  4. Save and look at the schedule row: its cadence matches what you chose, compared with Expected.

## S9.13 File browser.

- **Expected:** The user can browse their stored files (uploads and generated outputs) in a list or grid, open one, and filter or search it.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1003; apps/web/app/api/library/route.ts:148; apps/web/app/chat/library/page.tsx:17
- **Where to find it:** Library (sidebar) > "All" tab (labels found in the code)
- **Needs:** a few uploaded or generated files
- **Steps:**
  1. Open Library.
  2. Look at the tabs: "All", "Images", "Videos", "Documents", "Artifacts", "Uploads", "Generated files".
  3. Type a name in "Search the library by name".
  4. Click a file and look: it opens in the file viewer ("Close file viewer"), compared with Expected.

## S9.14 Folder tree.

- **Expected:** Files are shown in a nested folder tree the user can expand and collapse to reach a file.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/SkillFileViewer.tsx:124; packages/ui/ui/src/directory/SkillFileViewer.tsx:99; packages/ui/ui/src/directory/SkillDetailView.tsx:256; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250
- **Where to find it:** Settings > Skills (under the Customize group) > open a skill > "Skill files" tree (labels found in the code)
- **Needs:** a skill with folders in its files
- **Steps:**
  1. Open Settings and click "Skills".
  2. Open a skill that has folders.
  3. In the "Skill files" tree, click a folder row to expand it, then click again to collapse it.
  4. Look: the folder opens and closes and the file inside is reached, compared with Expected.

## S9.15 Data table.

- **Expected:** Tabular data is shown in a table with column headers that the user can sort (and scroll) to inspect the rows.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx:242; packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx:32 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1947; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:200
- **Where to find it:** Chat > open a spreadsheet artifact ("Open artifacts panel") > click a column heading (labels found in the code)
- **Needs:** a spreadsheet artifact
- **Steps:**
  1. Ask for a spreadsheet in a chat and open the artifact.
  2. Open the artifacts panel if it is closed.
  3. Click a column heading; its title reads "Sort by <column>". Click again to reverse, then clear.
  4. Look: the rows reorder by that column, compared with Expected.

## S9.16 Resource grid.

- **Expected:** Resources (files, artifacts, projects) are shown as a grid of cards the user can scan and open.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1048; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1109; apps/web/app/api/library/route.ts:148; apps/web/app/chat/library/page.tsx:17
- **Where to find it:** Library (sidebar) > "Grid view" button in the toolbar (labels found in the code)
- **Needs:** a few library items
- **Steps:**
  1. Open Library.
  2. Click the "Grid view" button in the "Library layout" group.
  3. Look: files and artifacts appear as cards with a preview.
  4. Click "List view" to switch back, compared with Expected.

## S9.17 Media gallery.

- **Expected:** The user can browse their images and videos as a gallery and open one in a larger viewer.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:94; packages/ui/unified-chat/src/components/library/LibraryView.tsx:810; packages/ui/unified-chat/src/components/library/LibraryView.tsx:930; apps/web/app/chat/library/page.tsx:17
- **Where to find it:** Library (sidebar) > "Images" tab (or "Videos") (labels found in the code)
- **Needs:** at least one image in the library
- **Steps:**
  1. Open Library and click the "Images" tab.
  2. Look at the picture tiles in the grid.
  3. Click one picture to open it in the larger viewer.
  4. Look at the enlarged picture, then click "Close file viewer", compared with Expected.

## S9.19 Timeline.

- **Expected:** The steps of a run are shown in time order, each with its state and (where known) how long it took.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:978; apps/web/features/chat/components/messages/MessageBubble.tsx:2664; apps/web/lib/hooks/useChatStream.ts:2107
- **Where to find it:** Chat in Work mode > run a task > "Agent activity" section (labels found in the code)
- **Needs:** a paid account with Work available
- **Steps:**
  1. Turn on Work mode and send a task that uses tools.
  2. Look at the "Agent activity" section while it runs.
  3. Check the steps are listed in order, each with its state and a running seconds counter where shown.
  4. Compare with Expected once the run finishes.

## S9.20 Activity feed.

- **Expected:** The user can see a feed of recent account events (sign-ins, changes, runs), newest first.
- **Code:** done. Evidence moved: apps/web/features/settings/components/RecentActivityPanel.tsx:63 (quoted code not found in the file now); apps/web/features/settings/components/RecentActivityPanel.tsx:123; apps/web/features/settings/hooks/use-settings-queries.ts:1419; apps/web/features/settings/sections/AccountSection.tsx:883
- **Where to find it:** Settings > Account > "Recent activity" (labels found in the code)
- **Needs:** an account with some activity
- **Steps:**
  1. Open Settings and click "Account".
  2. Scroll to the bottom to the "Recent activity" panel.
  3. Make a small change elsewhere in settings, then come back.
  4. Look: the newest event is at the top, compared with Expected.

## S9.21 Task board.

- **Expected:** Tasks are laid out as a board with a column per status so the user sees and manages work by stage.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:84; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:617; packages/ui/unified-chat/src/components/tasks/TasksBoard.tsx:50
- **Where to find it:** Work (sidebar) > "Work history" > "Task layout" > "Board" (labels found in the code)
- **Needs:** a few work runs in different states
- **Steps:**
  1. Open Work from the sidebar to reach "Work history" (or go to /tasks).
  2. Click "Board" in the "Task layout" control.
  3. Look: columns with headings "Queued", "Running", "Needs approval", "Done" (and others with runs) and a count per column.
  4. Click "List" to switch back, compared with Expected.

## S9.22 Stepper.

- **Expected:** A multi-step flow shows which step the user is on out of how many (e.g. dots or "Step 2 of 4") and advances or goes back with it.
- **Code:** done. Evidence present: apps/web/app/gallery/GalleryClient.tsx:712; apps/web/app/gallery/GalleryClient.tsx:751; apps/web/app/gallery/GalleryClient.tsx:650; apps/web/app/gallery/GalleryClient.tsx:1727
- **Where to find it:** Gallery page (/gallery) > "Create artifact" > pick a type > "Next" steps (labels found in the code)
- **Steps:**
  1. Open /gallery and click "Create artifact".
  2. Look at the step counter text "Step <n> of <total>" and the step dots.
  3. Click "Next" to move forward; the counter and dots advance.
  4. Look: the counter matches the step shown, compared with Expected.

## S9.23 Multi-step setup wizard.

- **Expected:** A guided setup runs as ordered steps that collect the user's choices (name, model, sign-in) and saves them when it finishes.
- **Code:** done. Evidence present: apps/web/features/onboarding/components/OnboardingWizard.tsx:125; apps/web/features/onboarding/components/OnboardingWizard.tsx:153; apps/web/features/onboarding/components/OnboardingWizard.tsx:89; apps/web/features/onboarding/lib/onboarding-preferences.ts:65; apps/web/app/welcome/page.tsx:32
- **Where to find it:** New account sign-up > welcome page (/welcome) > "What should we call you?" (labels found in the code)
- **Needs:** a new account
- **Steps:**
  1. Create a new account and reach the welcome page.
  2. Look for "Step 1 of 2" and the "Preferred name" field.
  3. Type a name and continue; check "Step 2 of 2" with "What do you want to do first?".
  4. Finish and check the name appears, compared with Expected.

## S9.24 Split-pane container.

- **Expected:** Two panes sit side by side (e.g. chat and artifact) and the user can resize the split, by pointer and by keyboard.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:471 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:412 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:428 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:5834 (quoted code not found in the file now)
- **Where to find it:** Chat > "Open artifacts panel" > separator "Resize artifacts panel" between chat and artifact (labels found in the code)
- **Needs:** a desktop-width window and an artifact
- **Steps:**
  1. Open a chat that has an artifact and click "Open artifacts panel".
  2. Drag the separator named "Resize artifacts panel" left or right.
  3. Or click the separator and press the Left or Right arrow key.
  4. Look: the artifact pane gets wider or narrower and the chat pane adjusts, compared with Expected.

## S9.26 Version-history panel.

- **Expected:** A panel lists a resource's saved versions (when, what) and lets the user open or restore one.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:76; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2672
- **Where to find it:** Chat > open an artifact > version counter "Version <n> of <total>" > "Version history" (labels found in the code)
- **Needs:** an artifact with at least two versions
- **Steps:**
  1. Open an artifact that has been edited more than once.
  2. Click the version counter (screen-reader name "Version <n> of <total>. Show version history").
  3. Look at the "Version history" panel: each saved version and its count.
  4. Click "Restore version <n>" on an older one and look: the artifact shows that version, compared with Expected.

## S9.27 Diff viewer.

- **Expected:** Changes to a file are shown as a diff (added and removed lines marked) that the user can read before accepting.
- **Code:** done. Evidence moved: apps/web/features/code/components/CodeChangesPanel.tsx:39 (quoted code not found in the file now); apps/web/features/code/components/CodeChangesPanel.tsx:273; apps/web/features/code/services/cloud-code-api.ts:398 (quoted code not found in the file now); apps/web/features/code/CloudCodePage.tsx:2886
- **Where to find it:** Code > a coding session with file changes > "Changes" in the header (labels found in the code)
- **Needs:** a coding session with uncommitted or committed changes
- **Steps:**
  1. Open a coding session that has changed files.
  2. Click "Changes" in the header; the panel opens.
  3. Use "Filter changed files" if needed and click a file to read its diff.
  4. Look: added and removed lines are marked, compared with Expected. Do not click "Discard" controls.

## S9.28 Source inspector.

- **Expected:** The user can open an answer's sources and see each one's title, origin and the excerpt it contributed, then open it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3595; apps/web/features/chat/components/research/ResearchPanel.tsx:556 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchPanel.tsx:141 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:115
- **Where to find it:** Chat > send a question that uses web search > under the answer, click Sources > click a source row (labels found in the code)
- **Needs:** a web-search answer (a question that triggers web sources)
- **Steps:**
  1. Sign in and ask a question that needs web search, such as a current news topic.
  2. Wait until the answer finishes, then click the Sources button under the answer.
  3. In the research panel, read the Sources tab: each row shows the title, the publisher and date line (with Retrieved date) and a short snippet.
  4. Click a source row; it opens the page in a new tab. Compare with Expected: title, origin, excerpt, and open.

## S9.29 Usage meter.

- **Expected:** A meter shows how much of the plan allowance is used (per window) with the reset time, readable by assistive tech.
- **Code:** done. Evidence present: apps/web/features/settings/sections/UsageSection.tsx:326; apps/web/lib/hooks/useManagedUsageSummary.ts:73; apps/web/app/settings/usage/page.tsx:6
- **Where to find it:** Account menu > Settings > Usage > Plan usage limits (labels found in the code)
- **Needs:** a paid account (a Free account sees Upgrade for higher capacity instead)
- **Steps:**
  1. Open the account menu and click Settings, then click Usage.
  2. Find the card titled Plan usage limits.
  3. Look at each bar: Current session, This week and, when shown, Most capable models. Each shows a percent used.
  4. Read the reset line under a bar (Resets at ... or a time left until reset) and compare with Expected: percent, window and reset time.

## S9.30 Credit-balance card.

- **Expected:** The user sees their purchased credit balance in one place, next to a way to add credits.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:500 (quoted code not found in the file now); apps/web/lib/hooks/useManagedUsageSummary.ts:73; apps/web/features/settings/sections/BillingSection.tsx:988 (quoted code not found in the file now)
- **Where to find it:** Account menu > Settings > Usage > Credit balances (labels found in the code)
- **Needs:** a paid account (the card is hidden on Free plans and on contract-priced accounts)
- **Steps:**
  1. Open the account menu, click Settings, then click Usage.
  2. Find the card titled Credit balances.
  3. Read the rows Bonus credits and Purchased credits with their amounts.
  4. Click Buy credits and see that it opens the Billing section. Compare with Expected: balance and an add-credits button in one place.

## S9.31 Permission summary.

- **Expected:** One view states in plain language what the assistant or a connected app is allowed to do (scopes, autonomy, allowed sites or tools).
- **Code:** done. Evidence present: apps/web/features/connectors/components/ConnectorScopeList.tsx:49; apps/web/features/connectors/components/ConnectorScopeList.tsx:37; apps/web/features/connectors/components/ConnectorScopeList.tsx:74; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1256
- **Where to find it:** Settings > Connectors > click a connector that uses sign-in > Permissions requested (labels found in the code)
- **Needs:** a connector that uses OAuth permissions; an outside account (for example Google) to finish connecting
- **Steps:**
  1. Open Settings, then click Connectors.
  2. Click a connector that asks for sign-in permissions.
  3. Find the Permissions requested box and read each permission sentence with its Read or Write badge.
  4. Click Connect; the dialog Connect <name>? repeats the list with Deny and Allow buttons. Compare with Expected: what the connector may do and whether it is read or write.

## S9.32 Approval card.

- **Expected:** When an action needs consent, an inline card names the action and offers approve and deny, and the choice resumes or stops the run.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:409; packages/ui/unified-chat/src/components/ToolCallCard.tsx:415; apps/web/features/chat/components/messages/MessageBubble.tsx:2678; apps/web/lib/hooks/useChatStream.ts:1676
- **Where to find it:** Settings > Capabilities > Tool approvals > Ask before every action, then in chat send a request that uses a tool (labels found in the code)
- **Needs:** a tool that asks for approval (the policy setting above must be on); a paid account may be needed for some tools
- **Steps:**
  1. Open Settings, click Capabilities, find the Tool approvals box and choose Ask before every action.
  2. Go to a chat and send a request that makes the assistant use a tool (for example a connected app or site action).
  3. When the action pauses, read the inline line that says the tool requires approval, and the buttons Allow, Allow for this chat and Deny.
  4. Click Deny and check that the run stops; repeat and click Allow and check that the run continues. Compare with Expected.

## S9.33 Integration connection card.

- **Expected:** Each integration shows a card with its connection state (connected, expired, not connected) and the action to connect or disconnect.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/ConnectorDetailView.tsx (text found, layout changed); packages/ui/ui/src/directory/ConnectorDetailView.tsx:323; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:686 (quoted code not found in the file now); packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250
- **Where to find it:** Settings > Connectors > click a connector (labels found in the code)
- **Needs:** an outside account for the connector (for example Google)
- **Steps:**
  1. Open Settings, click Connectors, then click a connector that is not connected.
  2. Read the notice You're not connected to <name> yet. and the Connect button.
  3. Click Connect and finish the sign-in; the button should change to Connected.
  4. Open the remove control for a connected card (Disconnect) and check that the state returns to not connected. Compare with Expected.

## S9.34 Capability-warning card.

- **Expected:** Before sending, a visible notice warns when the chosen model cannot handle something in the request (images, tools, attachments, context size).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx:21; apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx:28; apps/web/features/chat/components/Composer/model-compatibility.ts:97; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1756
- **Where to find it:** Chat > choose a model that cannot read images (model picker under the message box) > attach an image > read the notice above the message box (labels found in the code)
- **Needs:** a file to upload (an image); a model that cannot read images in your list
- **Steps:**
  1. In a chat, choose a model from the model picker below the message box.
  2. Attach an image file to the message, without sending.
  3. Read the notice above the message box that says the chosen model cannot read images.
  4. Change to a model that reads images and check the notice disappears. Compare with Expected: warning shown before sending.

## S9.35 Task-progress card.

- **Expected:** A running task shows a card with its current state and progress (steps done, latest action) that updates while it runs.
- **Code:** done. Evidence moved: apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:302 (quoted code not found in the file now); apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:787; apps/web/features/chat/pages/WebChatPage.tsx:7844
- **Where to find it:** Chat > start a task that runs several steps > open the Progress panel at the bottom of the chat (labels found in the code)
- **Needs:** a task that runs several steps (agent or work mode)
- **Steps:**
  1. Send a request that makes the assistant run a multi-step task.
  2. While it runs, click the Progress panel at the bottom of the chat.
  3. Read the count (for example 1/4) and the current action line; wait and see them change.
  4. When the task ends, check the final state and the count. Compare with Expected: state, progress and latest action updating.

## S9.36 Interactive result widget.

- **Expected:** An answer can embed a widget the user operates in place (choices, map, app card), and the choice or state feeds back into the conversation.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:116; apps/web/features/chat/components/messages/MessageBubble.tsx:2020 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7725
- **Where to find it:** Chat > ask a question the assistant needs to clarify > pick options on the card > Send answers (labels found in the code)
- **Steps:**
  1. Ask a vague request that needs a choice, such as planning a trip without a destination.
  2. When a card with options appears in the answer, click one or more options.
  3. Click Send answers and check that the card shows Sending, then that the answer continues using your choice.

## S9.37 Notification inbox.

- **Expected:** An inbox lists the user's notifications newest first, marks which are unread (visibly and for screen readers), and lets them open or mark them read.
- **Code:** done. Evidence present: apps/web/features/notifications/components/NotificationBell.tsx:74; apps/web/features/notifications/components/NotificationBell.tsx:95; apps/web/features/notifications/components/NotificationBell.tsx:103; apps/web/shared/components/layout/SidebarBrandRow.tsx:10
- **Where to find it:** Sidebar > the bell icon next to the app name > Notifications (labels found in the code)
- **Needs:** at least one notification (for example a finished scheduled run)
- **Steps:**
  1. Click the bell icon in the sidebar next to the app name.
  2. Read the Notifications list: newest first, unread items in bold with a dot.
  3. Click one unread item; it opens its page and is marked read.
  4. Click Mark all as read and check that the unread marks go away. Compare with Expected.

## S9.38 Keyboard-command palette.

- **Expected:** A keyboard shortcut opens a searchable list of commands and destinations; typing filters it and Enter runs the choice.
- **Code:** done. Evidence present: apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx:16; apps/web/shared/components/CommandPalette/CommandPalette.tsx:506; apps/web/shared/components/CommandPalette/CommandPalette.tsx:234; apps/web/app/AppRuntimeMounts.tsx:21
- **Where to find it:** Any signed-in screen > press Command+K (Ctrl+K on Windows or Linux) > type in the box Search chats and actions > press Return (labels found in the code)
- **Steps:**
  1. Press Command+K on the Mac keyboard.
  2. Type part of a command or chat name, such as Settings.
  3. Check that the list narrows as you type.
  4. Use the arrow keys and press Return on Go to Settings and check that the app opens Settings.
