---
id: "PLAN-web-009"
type: "test-plan"
title: "Web · 9. Compound interface components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "9"
---
# Web · 9. Compound interface components

36 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S9.01 Searchable resource picker.

- **Expected:** A picker lists selectable resources (files, projects, models, skills) and narrows the list as the user types a query.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:298; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:88; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7094; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5612
- **Where to find it:** Chat composer > Files menu > Search library files (labels found in the code)
- **Needs:** a Free account or a paid account with a few library files
- **Steps:**
  1. Open a chat and click the files control in the composer (the Files menu).
  2. Click the search field labelled "Search library files".
  3. Type part of a file name.
  4. Compare: the list narrows to matching library files. Expected also lists projects, models and skills; the code found only a library-files picker here.

## S9.02 Model picker.

- **Expected:** A control lists the available models and switches the conversation to the one the user picks.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:736; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1171; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6734
- **Where to find it:** Chat composer > model name at the bottom of the composer > Models (some labels not found in the code; trust the screen)
- **Steps:**
  1. Open a new chat.
  2. Click the model name shown under the composer.
  3. Look for the list titled "Models" and click a different model.
  4. Compare: the model name shown in the composer changes to the one picked. If saving fails the toast says the previous model remains active.

## S9.03 Source picker.

- **Expected:** Before or while asking, the user can choose which sources (specific sites, files, connected apps) the answer may draw on.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchActivity.tsx:690; apps/web/features/chat/components/research/ResearchActivity.tsx:808; apps/web/features/chat/components/messages/MessageBubble.tsx:2626
- **Where to find it:** Deep Research plan card > "Sources for this run" (add a source before the run starts) (labels found in the code)
- **Needs:** a Deep Research run; a connected app or file for the connector and file options
- **Steps:**
  1. Start a Deep Research request and wait for the plan card.
  2. Read the line under the plan: "Searching the whole web. Add a source to narrow it."
  3. Use the add-source control on the plan card to add a source.
  4. Compare: the chosen source appears under "Sources for this run" and can be removed.

## S9.04 Connected-account picker.

- **Expected:** When a connector has more than one linked account, the user can pick which account a task or chat uses.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/web/features/connectors once for an account picker; found only ConnectorAccountSummary.tsx, which lists accounts, and no control to choose one for a task or chat.
- **Needs:** a connector with two linked accounts

## S9.05 Workspace picker.

- **Expected:** The user can see their personal and team workspaces in a list and switch the active one.
- **Code:** done. Evidence present: apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:180; apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:102; apps/web/shared/components/layout/AccountMenuItems.tsx:82
- **Where to find it:** Account menu > Workspace > Personal (team workspaces listed under it) (labels found in the code)
- **Needs:** a team workspace on the account
- **Steps:**
  1. Click the account menu.
  2. Open the submenu "Workspace".
  3. Look for "Personal" ("Only you") and any team workspaces listed below it.
  4. Click another workspace and read the confirm text if it appears; then compare the list and the active workspace with Expected.

## S9.06 Project picker.

- **Expected:** The user can pick one of their projects so the chat or task runs in that project.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7055; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2782
- **Where to find it:** Chat composer > project control > Search projects... (labels found in the code)
- **Needs:** a paid or Free account with at least one project
- **Steps:**
  1. Open a chat and click the project control in the composer.
  2. Click the search field "Search projects..." and type a project name.
  3. Pick a project from the list.
  4. Compare: the list narrows as you type and the chosen project is applied to the chat.

## S9.07 Repository picker.

- **Expected:** The user can choose which code repository a coding session works in, from a list or by URL/path.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. The code is partial and gated by E2B settings (apps/web/lib/e2b/gate.ts). Searched apps/web/features/code/components once for a repository picker: found only test files, no visible control.
- **Needs:** a code session with a connected repository and the managed compute switched on

## S9.08 Branch picker.

- **Expected:** The user can pick the branch a coding session starts from or works on from a list of the repository's branches.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. The code is partial and gated by E2B settings (apps/web/lib/e2b/gate.ts). Searched apps/web/features/code/components once for a branch picker: found only test files, no visible control.
- **Needs:** a code session with a connected repository and the managed compute switched on

## S9.09 Device picker.

- **Expected:** The user can pick which device is used (microphone, speaker, camera or paired computer) from a list.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:12; apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:92; apps/web/features/chat/components/Voice/VoiceComposer.tsx:139 (quoted code not found in the file now)
- **Where to find it:** Start voice mode (composer) > voice screen > Audio output (labels found in the code)
- **Needs:** a microphone and a speaker or headphones; a browser that supports output device selection
- **Steps:**
  1. Click the composer button "Start voice mode".
  2. On the voice screen, click the control labelled "Audio output".
  3. Look at the list titled "Audio output device" and the entry "System default".
  4. Pick another output device if one is listed and check that the next reply plays through it.

## S9.10 Permission-scope picker.

- **Expected:** When granting access (an API key, tool approvals or site automation), the user chooses how far the permission reaches: which capabilities, or once versus always.
- **Code:** done. Evidence moved: apps/web/features/settings/components/Settings/ApiKeys.tsx:354; apps/web/features/settings/services/user-preferences.ts:541 (quoted code not found in the file now); apps/web/features/settings/sections/AccountSection.tsx:40
- **Where to find it:** Settings > Account > API keys > create a key > Scopes (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings and go to the Account section.
  2. Find the row "API keys" and open it.
  3. Start creating a key and look at the "Scopes" checkboxes.
  4. Compare: the chosen scopes are listed on the created key. A once-versus-always choice was not found.

## S9.11 Member and recipient picker.

- **Expected:** The user can pick one or more people (workspace members or recipients) by name or email to share with, invite or assign.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:407; apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:230; apps/web/app/chat/projects/[id]/page.tsx:626; apps/web/features/projects/components/ProjectSharingControls.tsx:243
- **Where to find it:** Project > People with access > Add people (labels found in the code)
- **Needs:** a second account in the same workspace
- **Steps:**
  1. Open a project that you own.
  2. Open its sharing controls (the control that shows "People with access to" the project name).
  3. Click "Add people", pick one or more members, choose the access level and click "Add".
  4. Compare: the added members appear in the access list.

## S9.12 Recurrence editor.

- **Expected:** When creating a scheduled task, the user sets how it repeats (once, daily, weekly, monthly or a custom rule) and the schedule runs on that cadence.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:312; apps/web/lib/services/schedule-service.ts:807; apps/web/features/schedules/components/SchedulesPage.tsx:278
- **Where to find it:** Schedules page > new schedule form > Repeat Every (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the schedules page (the sidebar label was not confirmed) and start a new schedule.
  2. Open the frequency list and pick "Daily", "Weekly" or "Monthly", or "Custom Cron" or "Recurrence Rule".
  3. Set "Repeat Every" and read the line "Reads as:" below the rule.
  4. Save and compare the next run time with the chosen cadence.

## S9.13 File browser.

- **Expected:** The user can browse their stored files (uploads and generated outputs) in a list or grid, open one, and filter or search it.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1003; apps/web/app/api/library/route.ts:148; apps/web/app/chat/library/page.tsx:17
- **Where to find it:** Sidebar > Library > Search the library by name (labels found in the code)
- **Needs:** a few files uploaded or generated in the account
- **Steps:**
  1. Click "Library" in the sidebar.
  2. Click the search field "Search the library by name" and type a file name.
  3. Open the control "Filter the library" and pick a filter.
  4. Compare: the list shows matching files and open one by clicking it.

## S9.14 Folder tree.

- **Expected:** Files are shown in a nested folder tree the user can expand and collapse to reach a file.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/SkillFileViewer.tsx:124; packages/ui/ui/src/directory/SkillFileViewer.tsx:99; packages/ui/ui/src/directory/SkillDetailView.tsx:256; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250
- **Where to find it:** not found in the code. Searched LibraryView.tsx and SkillFileViewer.tsx: the expand and collapse tree found is for skill files, and the library folder list is flat. No nested folder tree in the user's files was found.
- **Needs:** a file list with folders

## S9.15 Data table.

- **Expected:** Tabular data is shown in a table with column headers that the user can sort (and scroll) to inspect the rows.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx:242; packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx:32 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1947; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:200
- **Where to find it:** Chat > spreadsheet artifact > Artifacts panel > Worksheets table; click a column header to sort (labels found in the code)
- **Needs:** a chat that produced a spreadsheet artifact
- **Steps:**
  1. Open a chat whose answer produced a spreadsheet artifact.
  2. Open the artifact in the Artifacts panel.
  3. Click a column header in the table to sort; click again to change the sort.
  4. Compare: the rows reorder by that column and the table scrolls.

## S9.16 Resource grid.

- **Expected:** Resources (files, artifacts, projects) are shown as a grid of cards the user can scan and open.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1048; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1109; apps/web/app/api/library/route.ts:148; apps/web/app/chat/library/page.tsx:17
- **Where to find it:** Sidebar > Library > Library layout (grid) (labels found in the code)
- **Needs:** a few files in the library
- **Steps:**
  1. Click "Library" in the sidebar.
  2. Click the control labelled "Library layout" and pick the grid view.
  3. Look at the files shown as cards.
  4. Click a card to open it and compare with Expected.

## S9.17 Media gallery.

- **Expected:** The user can browse their images and videos as a gallery and open one in a larger viewer.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:94; packages/ui/unified-chat/src/components/library/LibraryView.tsx:810; packages/ui/unified-chat/src/components/library/LibraryView.tsx:930; apps/web/app/chat/library/page.tsx:17
- **Where to find it:** Sidebar > Library > Images or Videos tab > open a tile (labels found in the code)
- **Needs:** images and videos in the library
- **Steps:**
  1. Click "Library" in the sidebar.
  2. Click the filter tab "Images" or "Videos".
  3. Click a picture or video tile; the viewer labelled "<file name> viewer" opens.
  4. Use "Zoom in" / "Zoom out" for images and "Close file viewer" to leave; compare with Expected.

## S9.19 Timeline.

- **Expected:** The steps of a run are shown in time order, each with its state and (where known) how long it took.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:978; apps/web/features/chat/components/messages/MessageBubble.tsx:2664; apps/web/lib/hooks/useChatStream.ts:2107
- **Where to find it:** Chat > an agent run's activity under the reply (step list with "Working" or "Thinking") (labels found in the code)
- **Needs:** an account that can start an agent run
- **Steps:**
  1. Send a request that starts an agent run.
  2. Watch the activity block under the reply while it runs.
  3. Look at each step with its label and the elapsed time shown after it, like "Thinking · 12s".
  4. Compare: the steps are in time order and each shows its state when the run finishes.

## S9.20 Activity feed.

- **Expected:** The user can see a feed of recent account events (sign-ins, changes, runs), newest first.
- **Code:** done. Evidence moved: apps/web/features/settings/components/RecentActivityPanel.tsx:63 (quoted code not found in the file now); apps/web/features/settings/components/RecentActivityPanel.tsx:123; apps/web/features/settings/hooks/use-settings-queries.ts:1419; apps/web/features/settings/sections/AccountSection.tsx:883
- **Where to find it:** Settings > Account > Recent activity (labels found in the code)
- **Needs:** a signed-in account with some recent activity
- **Steps:**
  1. Open Settings and go to the Account section.
  2. Scroll to the panel titled "Recent activity".
  3. Check the entries: sign-ins, changes and runs.
  4. Compare the order: newest first is expected.

## S9.21 Task board.

- **Expected:** Tasks are laid out as a board with a column per status so the user sees and manages work by stage.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:84; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:617; packages/ui/unified-chat/src/components/tasks/TasksBoard.tsx:50
- **Where to find it:** Tasks page > Task layout > Board (labels found in the code)
- **Needs:** a few tasks in different states
- **Steps:**
  1. Open the Tasks page (the sidebar label was not confirmed).
  2. Click the layout control "Task layout" and pick "Board".
  3. Look for the columns per status.
  4. Compare: tasks sit in the column for their stage.

## S9.22 Stepper.

- **Expected:** A multi-step flow shows which step the user is on out of how many (e.g. dots or "Step 2 of 4") and advances or goes back with it.
- **Code:** done. Evidence present: apps/web/app/gallery/GalleryClient.tsx:712; apps/web/app/gallery/GalleryClient.tsx:751; apps/web/app/gallery/GalleryClient.tsx:650; apps/web/app/gallery/GalleryClient.tsx:1727
- **Where to find it:** Gallery > Choose artifact type > pick a type > Next (labels found in the code)
- **Steps:**
  1. Open the gallery (the route is apps/web/app/gallery; the sidebar label was not confirmed).
  2. Click "Choose artifact type" and pick an artifact type.
  3. Read "Step 1 of" and the dots, then click "Next".
  4. Click "Create" on the last step and compare the count and the dots.

## S9.23 Multi-step setup wizard.

- **Expected:** A guided setup runs as ordered steps that collect the user's choices (name, model, sign-in) and saves them when it finishes.
- **Code:** done. Evidence present: apps/web/features/onboarding/components/OnboardingWizard.tsx:125; apps/web/features/onboarding/components/OnboardingWizard.tsx:153; apps/web/features/onboarding/components/OnboardingWizard.tsx:89; apps/web/features/onboarding/lib/onboarding-preferences.ts:65; apps/web/app/welcome/page.tsx:32
- **Where to find it:** Welcome screen (/welcome) > Preferred name > Continue > Finish (labels found in the code)
- **Needs:** a new account (or a reset onboarding state)
- **Steps:**
  1. Sign in with a new account, or open the welcome page.
  2. Type a name in "Preferred name" and read "Step 1 of 2".
  3. Click "Continue" to go to step 2 and click "Back" or "Finish".
  4. Check the saved name in Settings.

## S9.24 Split-pane container.

- **Expected:** Two panes sit side by side (e.g. chat and artifact) and the user can resize the split, by pointer and by keyboard.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:471 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:412 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:428 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:5834 (quoted code not found in the file now)
- **Where to find it:** Chat > open an artifact > drag the "Resize artifacts panel" handle, or focus it and press Left or Right arrow (labels found in the code)
- **Needs:** a desktop-width window and an artifact
- **Steps:**
  1. Open a chat with an artifact so the Artifacts panel opens.
  2. Tab to the separator labelled "Resize artifacts panel".
  3. Press the Left or Right arrow key and watch the split move.
  4. Drag the same separator with the mouse and compare both panes.

## S9.26 Version-history panel.

- **Expected:** A panel lists a resource's saved versions (when, what) and lets the user open or restore one.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:76; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2672
- **Where to find it:** Chat > artifact toolbar > version counter (v<n>/<total>) > Restore (labels found in the code)
- **Needs:** an artifact with several versions
- **Steps:**
  1. Open an artifact that has more than one version.
  2. Click the version counter in the artifact toolbar to open "Version history".
  3. Click a version and then "Restore" on the one you want.
  4. Compare: the artifact returns to that version and the list shows it.

## S9.27 Diff viewer.

- **Expected:** Changes to a file are shown as a diff (added and removed lines marked) that the user can read before accepting.
- **Code:** done. Evidence moved: apps/web/features/code/components/CodeChangesPanel.tsx:39 (quoted code not found in the file now); apps/web/features/code/components/CodeChangesPanel.tsx:273; apps/web/features/code/services/cloud-code-api.ts:398 (quoted code not found in the file now); apps/web/features/code/CloudCodePage.tsx:2886
- **Where to find it:** Code > a session > Changes panel > file diff with "Include in the commit:" and "Discard the changes to" (labels found in the code)
- **Needs:** a code session that has file changes
- **Steps:**
  1. Open Code and select a session that has file changes.
  2. Open the Changes panel for the session.
  3. Click a file to read its diff with added and removed lines.
  4. Compare with Expected; use the include or discard controls only as a test, and cancel if prompted.

## S9.28 Source inspector.

- **Expected:** The user can open an answer's sources and see each one's title, origin and the excerpt it contributed, then open it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3595; apps/web/features/chat/components/research/ResearchPanel.tsx:556 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchPanel.tsx:141 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:115
- **Where to find it:** Chat answer > "Sources" button under the answer (aria-label "View N sources") > panel tab "Sources" (labels found in the code)
- **Needs:** a Free account or paid account; a question that triggers web research
- **Steps:**
  1. Send a question that uses web research, so the answer has sources.
  2. Under the answer, click the "Sources" button (or "Sources · N" when there are more than 3).
  3. In the side panel on the "Sources" tab, read each source's title, site name, date and snippet.
  4. Click a source row; it opens in a new browser tab.
  5. Compare with Expected: title, origin and excerpt visible, and the source opens.

## S9.29 Usage meter.

- **Expected:** A meter shows how much of the plan allowance is used (per window) with the reset time, readable by assistive tech.
- **Code:** done. Evidence present: apps/web/features/settings/sections/UsageSection.tsx:326; apps/web/lib/hooks/useManagedUsageSummary.ts:73; apps/web/app/settings/usage/page.tsx:6
- **Where to find it:** Account menu > Settings > Usage (labels found in the code)
- **Needs:** a Free account or paid account
- **Steps:**
  1. Open the account menu and choose Settings.
  2. Click "Usage" in the Settings list.
  3. Read the usage bars: each shows its label, "% used" and a reset time in the detail line.
  4. Check that the bars are readable by a screen reader (each bar has an aria-label such as "<label> usage" and an aria-valuetext).
  5. Compare with Expected: per-window meter with reset time.

## S9.30 Credit-balance card.

- **Expected:** The user sees their purchased credit balance in one place, next to a way to add credits.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:500 (quoted code not found in the file now); apps/web/lib/hooks/useManagedUsageSummary.ts:73; apps/web/features/settings/sections/BillingSection.tsx:988 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage > "Credit balances" card (labels found in the code)
- **Needs:** a Free account or paid account
- **Steps:**
  1. Open Settings and click "Usage".
  2. Find the "Credit balances" card.
  3. Read the "Purchased credits" and "Bonus credits" rows.
  4. Click the "Buy credits" button beside the card title; it opens Settings > Billing.
  5. Compare with Expected: purchased balance shown with a way to add credits.

## S9.31 Permission summary.

- **Expected:** One view states in plain language what the assistant or a connected app is allowed to do (scopes, autonomy, allowed sites or tools).
- **Code:** done. Evidence present: apps/web/features/connectors/components/ConnectorScopeList.tsx:49; apps/web/features/connectors/components/ConnectorScopeList.tsx:37; apps/web/features/connectors/components/ConnectorScopeList.tsx:74; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1256
- **Where to find it:** Settings > Connectors > select a connector > "Permissions requested" panel (labels found in the code)
- **Needs:** a Free account or paid account; a connector that uses OAuth scopes (otherwise a short "This provider does not use OAuth scopes" message shows)
- **Steps:**
  1. Open Settings and click "Connectors".
  2. Click a connector that shows a permission list.
  3. Read the "Permissions requested" list: each scope has a sentence and a "Read" or "Write" badge.
  4. Read the "Before you connect" notice and the "Tool permissions" button for the allowed tools.
  5. Compare with Expected: plain-language view of what the connector may do.

## S9.32 Approval card.

- **Expected:** When an action needs consent, an inline card names the action and offers approve and deny, and the choice resumes or stops the run.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:409; packages/ui/unified-chat/src/components/ToolCallCard.tsx:415; apps/web/features/chat/components/messages/MessageBubble.tsx:2678; apps/web/lib/hooks/useChatStream.ts:1676
- **Where to find it:** Chat > a message where the assistant wants to run a tool > approval card text "This tool requires approval before execution." (labels found in the code)
- **Needs:** a paid account or a connected app that triggers approval; a prompt that makes the assistant use a tool
- **Steps:**
  1. Use a chat where the assistant asks to run a tool that needs approval (for example a connected app action).
  2. Read the inline card: it names the tool and shows "This tool requires approval before execution."
  3. Use the card's allow button (label from TOOL_APPROVAL_ACTION_LABELS, not read as visible text) or the deny control if shown.
  4. Watch whether the run continues or stops after the choice.
  5. Compare with Expected: an inline card with approve and deny that resumes or stops the run.

## S9.33 Integration connection card.

- **Expected:** Each integration shows a card with its connection state (connected, expired, not connected) and the action to connect or disconnect.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/ConnectorDetailView.tsx (text found, layout changed); packages/ui/ui/src/directory/ConnectorDetailView.tsx:323; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:686 (quoted code not found in the file now); packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250
- **Where to find it:** Settings > Connectors > each connector card (status shown as "Connected", "Not connected" or "Reconnect") (labels found in the code)
- **Needs:** a paid account or a Free account; an outside account for a real connection (Google, GitHub or similar); an expired connection to see "Reconnect"
- **Steps:**
  1. Open Settings and click "Connectors".
  2. Use the tabs "All", "Connected" and "Not connected" to filter the list.
  3. Open a connector; the header button shows "Connected" when linked, or "Reconnect" when the grant needs reconnecting.
  4. For a connected connector, check the "Disconnect" action; for a not-connected one, check the connect action.
  5. Compare with Expected: state shown on each card, and the connect or disconnect action.

## S9.34 Capability-warning card.

- **Expected:** Before sending, a visible notice warns when the chosen model cannot handle something in the request (images, tools, attachments, context size).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx:21; apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx:28; apps/web/features/chat/components/Composer/model-compatibility.ts:97; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1756
- **Where to find it:** Chat composer > model picker (below the message box) > choose a model that lacks a feature > notice "Model compatibility" above the message box (labels found in the code)
- **Needs:** a Free account (free models) or a paid account with a model that has limits; an image or file to upload
- **Steps:**
  1. In the chat composer, open the model picker and choose a free model.
  2. Attach an image or a file, or keep tools turned on.
  3. Read the notice above the message box (role status, labelled "Model compatibility"): it says, for example, "Turn off tools to use this free model."
  4. Remove the attachment or turn tools off, and check that the notice goes away.
  5. Compare with Expected: a visible warning before sending when the model cannot handle the request.

## S9.35 Task-progress card.

- **Expected:** A running task shows a card with its current state and progress (steps done, latest action) that updates while it runs.
- **Code:** done. Evidence moved: apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:302 (quoted code not found in the file now); apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:787; apps/web/features/chat/pages/WebChatPage.tsx:7844
- **Where to find it:** Chat > side panel "Chat details" (work-session panel) during a running task (labels found in the code)
- **Needs:** a paid account or a Free account that can start a task; a task that runs several steps
- **Steps:**
  1. Start a task in chat that runs steps (for example a coding or agent task).
  2. Open the side panel for work from the chat toolbar; the panel is labelled "Chat details" (or the work-session dock label on agent-work conversations).
  3. Watch the card: it shows the current state, steps done and latest action, and updates while the run is going.
  4. Compare with Expected: state and progress that update while the task runs.

## S9.36 Interactive result widget.

- **Expected:** An answer can embed a widget the user operates in place (choices, map, app card), and the choice or state feeds back into the conversation.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:116; apps/web/features/chat/components/messages/MessageBubble.tsx:2020 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7725
- **Where to find it:** not found in the code. InteractiveCardBlock.tsx renders the widget, and WebChatPage.tsx wires the resume handler, but no visible control label was found. The MessageBubble.tsx:2020 reference is not in the file now. The trigger for an interactive card in a normal chat is not confirmed from code.
- **Needs:** a question that makes the assistant send an interactive card (choices or app card)

## S9.37 Notification inbox.

- **Expected:** An inbox lists the user's notifications newest first, marks which are unread (visibly and for screen readers), and lets them open or mark them read.
- **Code:** done. Evidence present: apps/web/features/notifications/components/NotificationBell.tsx:74; apps/web/features/notifications/components/NotificationBell.tsx:95; apps/web/features/notifications/components/NotificationBell.tsx:103; apps/web/shared/components/layout/SidebarBrandRow.tsx:10
- **Where to find it:** Sidebar > bell icon beside the AGI wordmark (labelled "Notifications") > list > "Mark all as read" (labels found in the code)
- **Needs:** a signed-in account that has notifications (unread ones give a count on the bell)
- **Steps:**
  1. Sign in and look at the sidebar top row, next to the wordmark.
  2. Click the bell; the panel titled "Notifications" opens, newest first.
  3. Look for unread items: they show in a bolder weight, with a count badge on the bell and ", unread" for screen readers.
  4. Click an item that has a link; it opens its page and is marked read. Or click "Mark all as read".
  5. Compare with Expected: list newest first, unread marked, open or mark read.

## S9.38 Keyboard-command palette.

- **Expected:** A keyboard shortcut opens a searchable list of commands and destinations; typing filters it and Enter runs the choice.
- **Code:** done. Evidence present: apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx:16; apps/web/shared/components/CommandPalette/CommandPalette.tsx:506; apps/web/shared/components/CommandPalette/CommandPalette.tsx:234; apps/web/app/AppRuntimeMounts.tsx:21
- **Where to find it:** Press Cmd+K (Ctrl+K on Windows or Linux) on any page > command palette (labels found in the code)
- **Steps:**
  1. On any page after signing in, press Command+K (Mac).
  2. Read the search box with the placeholder "Search chats and actions".
  3. Type part of a command, for example "settings", and watch the list narrow.
  4. Use the arrow keys to pick "Go to Settings" and press Enter.
  5. Compare with Expected: list filters as you type and Enter runs the choice.
