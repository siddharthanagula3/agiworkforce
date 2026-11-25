---
id: "PLAN-mobile-009"
type: "test-plan"
title: "Mobile · 9. Compound interface components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "9"
---
# Mobile · 9. Compound interface components

27 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S9.01 Searchable resource picker.

- **Expected:** A picker lists selectable resources (files, projects, models, skills) and narrows the list as the user types a query.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:806; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:809; apps/mobile/app/(app)/(tabs)/chat.tsx:1444
- **Where to find it:** Chat > Model button at the bottom of the message box > Search models… (labels found in the code)
- **Steps:**
  1. Sign in and open a new chat.
  2. Tap the model button at the bottom of the message box (its accessibility label starts with "Model:").
  3. In the sheet, tap the search field that says "Search models…" and type part of a model name.
  4. Check that the list narrows to matching models only. Note: this picker lists models; files, projects and skills are not in it (files are searched in Library > "Search library").

## S9.02 Model picker.

- **Expected:** A control lists the available models and switches the conversation to the one the user picks.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:148; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:522; apps/mobile/app/(app)/(tabs)/chat.tsx:942 (quoted code not found in the file now)
- **Where to find it:** Chat > Model button at the bottom of the message box > model list (labels found in the code)
- **Steps:**
  1. Sign in and open a new chat.
  2. Tap the model button at the bottom of the message box.
  3. In the sheet, tap a different model row (rows show "selected" for the current one).
  4. Send a message and check the model shown on the button or the reply matches the model you picked.

## S9.04 Connected-account picker.

- **Expected:** When a connector has more than one linked account, the user can pick which account a task or chat uses.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** not found in the code. Searched apps/mobile for account selection in connector code. Settings > Connectors > a connector shows an "Account" row that lists linked accounts (ConnectorAccountSummary.tsx), but I found no control to choose which account a task or chat uses.
- **Needs:** a connector with two or more linked accounts

## S9.05 Workspace picker.

- **Expected:** The user can see their personal and team workspaces in a list and switch the active one.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/workspace.tsx:451; apps/mobile/app/(app)/settings/workspace.tsx:108 (quoted code not found in the file now); apps/mobile/src/features/team/service.ts:123; apps/mobile/src/features/settings/index.tsx:451 (quoted code not found in the file now)
- **Where to find it:** Settings > Workspace (labels found in the code)
- **Needs:** a cloud account in a team workspace
- **Steps:**
  1. Sign in with a cloud account that belongs to a team workspace.
  2. Tap Settings, then the "Workspace" row.
  3. Read the list: "Personal" and each team workspace name are shown, with a check mark on the active one.
  4. Tap a row that is not checked; the screen switches workspace and the check mark moves to it.

## S9.06 Project picker.

- **Expected:** The user can pick one of their projects so the chat or task runs in that project.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx:220; apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx:167; apps/mobile/app/(app)/(tabs)/chat.tsx:1395
- **Where to find it:** Chat > project bar above the message box > No project > pick a project (labels found in the code)
- **Needs:** a Cloud account with at least one project
- **Steps:**
  1. Sign in and open a new chat.
  2. Tap the project bar that says "No project" (its accessibility label is "Select a project for this chat").
  3. In the picker, read the line "Choose the project context for this chat." and tap one of your projects.
  4. Check the bar now shows the project name (accessibility label "Active project: ...").

## S9.10 Permission-scope picker.

- **Expected:** When granting access (an API key, tool approvals or site automation), the user chooses how far the permission reaches: which capabilities, or once versus always.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/auto-approve.tsx:74; apps/mobile/src/features/settings/tool-approvals/useToolApprovalPolicySync.ts:74 (quoted code not found in the file now); apps/mobile/src/features/settings/capabilities/index.tsx:202
- **Where to find it:** Settings > Capabilities > Action approvals (scope of tool approvals); the approval card in chat shows "Allow once", "Allow for this chat" and "Always allow" (labels found in the code)
- **Needs:** a Cloud account; an action that asks for approval
- **Steps:**
  1. Open Settings and tap "Capabilities", then the "Action approvals" row.
  2. Read the three choices: "Ask before every action", "Run read-only actions without asking", "Skip approvals".
  3. In a Cloud chat, ask the assistant to do an action that needs approval.
  4. In the approval card, compare the choices "Allow once", "Allow for this chat", "Always allow" and "Deny" with Expected (once versus always).

## S9.12 Recurrence editor.

- **Expected:** When creating a scheduled task, the user sets how it repeats (once, daily, weekly, monthly or a custom rule) and the schedule runs on that cadence.
- **Code:** done. Evidence present: apps/mobile/src/features/schedules/components/ScheduleForm.tsx:285; apps/mobile/src/features/schedules/service.ts:185; apps/mobile/app/(app)/schedules/create.tsx:336
- **Where to find it:** AGI Work > Scheduled tasks > Create schedule (labels found in the code)
- **Needs:** a plan that includes Scheduled tasks
- **Steps:**
  1. Open the menu and tap "AGI Work", then "Scheduled tasks".
  2. Tap "Create schedule".
  3. Open the repeat choice and pick "Once", "Daily", "Weekly" or "Monthly".
  4. Save, then check the task's list entry shows the chosen cadence.

## S9.13 File browser.

- **Expected:** The user can browse their stored files (uploads and generated outputs) in a list or grid, open one, and filter or search it.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:909; apps/mobile/src/features/library/libraryClient.ts:107; apps/mobile/app/(app)/library/index.tsx:4 (quoted code not found in the file now)
- **Where to find it:** Menu > Library (labels found in the code)
- **Needs:** none (a few saved files help)
- **Steps:**
  1. Open the menu (drawer) and tap "Library".
  2. Read the chips "All", "Images", "Videos", "Documents", "Uploads", "Generated files", "Artifacts" and tap one to filter.
  3. Tap the search bar that says "Search library" and type a name.
  4. Tap a file to open it, then compare with Expected.

## S9.15 Data table.

- **Expected:** Tabular data is shown in a table with column headers that the user can sort (and scroll) to inspect the rows.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:386; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:329 (quoted code not found in the file now)
- **Where to find it:** Chat > an answer that contains a table > tap a column header (path not confirmed in the code; trust the screen)
- **Needs:** a Cloud or Local chat that returns a table
- **Steps:**
  1. Ask the assistant for a table, for example a comparison of three items.
  2. Look for the table in the answer and scroll it sideways if it is wide.
  3. Tap a column header once; rows should reorder by that column.
  4. Tap it again to reverse the order and compare with Expected.

## S9.16 Resource grid.

- **Expected:** Resources (files, artifacts, projects) are shown as a grid of cards the user can scan and open.
- **Code:** done. Evidence present: apps/mobile/src/features/library/index.tsx:947; apps/mobile/src/features/library/libraryClient.ts:107
- **Where to find it:** Menu > Library (cards shown in the grid) (labels found in the code)
- **Needs:** none (a few saved files, artifacts or projects help)
- **Steps:**
  1. Open the menu and tap "Library".
  2. Check the items appear as cards in a grid.
  3. Tap a card to open it.
  4. Compare the card layout and opening with Expected.

## S9.17 Media gallery.

- **Expected:** The user can browse their images and videos as a gallery and open one in a larger viewer.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:205 (quoted code not found in the file now); apps/mobile/src/features/library/index.tsx:899; apps/mobile/src/features/library/libraryClient.ts:107
- **Where to find it:** Menu > Images (or Menu > Library > Images chip) (labels found in the code)
- **Needs:** a few images (generated or uploaded)
- **Steps:**
  1. Open the menu and tap "Images".
  2. Check the images show as a gallery of thumbnails.
  3. Tap one image to open it in a larger view.
  4. Compare the larger view with Expected.

## S9.19 Timeline.

- **Expected:** The steps of a run are shown in time order, each with its state and (where known) how long it took.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:795 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:1545
- **Where to find it:** Chat > a request that runs tools > the "Worked for" line under the reply (labels found in the code)
- **Needs:** a Cloud account; a request that runs tools
- **Steps:**
  1. Send a Cloud request that uses tools (for example one that searches or runs an action).
  2. When the reply is done, find the line that starts with "Worked for" and its elapsed time.
  3. Expand the activity to list the steps in order and check each step's state (for example Paused, Failed, Stopped wording).

## S9.20 Activity feed.

- **Expected:** The user can see a feed of recent account events (sign-ins, changes, runs), newest first.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/account-security/index.tsx:789; apps/mobile/src/features/settings/account-security/service.ts:211
- **Where to find it:** Settings > Security and login > Recent security activity (labels found in the code)
- **Needs:** a Cloud account (the row shows "Cloud mode required" in Local mode)
- **Steps:**
  1. Sign in with a cloud account and open Settings.
  2. Tap "Security and login".
  3. Find the section titled "Recent security activity".
  4. Read the rows and check they are newest first, or that the row says "No activity recorded yet" when empty.

## S9.22 Stepper.

- **Expected:** A multi-step flow shows which step the user is on out of how many (e.g. dots or "Step 2 of 4") and advances or goes back with it.
- **Code:** done. Evidence present: apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx:105; apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx:232; apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx:145; apps/mobile/app/(app)/companion/index.tsx:306
- **Where to find it:** Settings > Connections > remote control screen > Show companion walkthrough (labels found in the code)
- **Needs:** none (Remote Control may be hidden in some builds)
- **Steps:**
  1. Open Settings and tap "Connections".
  2. Open the companion screen from the remote control screen.
  3. Tap "Show companion walkthrough".
  4. Tap "Next step" to move forward and check the dots and the current step against Expected; "Finish walkthrough" appears on the last step.

## S9.23 Multi-step setup wizard.

- **Expected:** A guided setup runs as ordered steps that collect the user's choices (name, model, sign-in) and saves them when it finishes.
- **Code:** done. Evidence moved: apps/mobile/app/(public)/onboarding.tsx:129 (quoted code not found in the file now); apps/mobile/app/(public)/onboarding.tsx:321; apps/mobile/app/(public)/onboarding.tsx:256; apps/mobile/app/index.tsx:8 (quoted code not found in the file now)
- **Where to find it:** First launch > onboarding (name, model, Cloud sign-in) (labels found in the code)
- **Needs:** a fresh install (no account yet)
- **Steps:**
  1. Install or reset to a fresh state and open the app.
  2. Enter your name in the field labelled "Your name" and tap "Continue".
  3. Choose a model and tap "Continue" or "Download model".
  4. Look for "Sign in to use Cloud", then check that your choices were kept when the setup finishes.

## S9.26 Version-history panel.

- **Expected:** A panel lists a resource's saved versions (when, what) and lets the user open or restore one.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1929
- **Where to find it:** Chat > open an artifact full screen > the "Version" control (shows Version N of M) (labels found in the code)
- **Needs:** an artifact with at least two versions
- **Steps:**
  1. Open an artifact from a chat that has several saved versions.
  2. Tap the version control that reads "Version N of M".
  3. In the history sheet, read each version and tap "Restore version" for the one you want.
  4. Use "Previous version" and "Next version" to step through; compare with Expected.

## S9.27 Diff viewer.

- **Expected:** Changes to a file are shown as a diff (added and removed lines marked) that the user can read before accepting.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionView.tsx:336 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:345 (quoted code not found in the file now); apps/mobile/app/(app)/companion/code/[threadId].tsx:78
- **Where to find it:** not found in the code. The diff counts (file and line counts ending in "changed.") are in apps/mobile/src/features/companion/components/CodeSessionView.tsx, but I did not confirm the menu path that opens a session or the on-screen diff view.
- **Needs:** a Cloud Code session with changed files

## S9.28 Source inspector.

- **Expected:** The user can open an answer's sources and see each one's title, origin and the excerpt it contributed, then open it.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/CollapsibleSources.tsx:191 (quoted code not found in the file now)
- **Where to find it:** Chat > an answer with sources > "View N sources" (labels found in the code)
- **Needs:** a Cloud account with web search enabled
- **Steps:**
  1. Ask a question that uses web search so the answer has sources.
  2. Tap the line that says "View 3 sources" (count varies) or "Sources so far" while streaming.
  3. Read each source's title and origin, then tap one to open it.
  4. Compare with Expected; the excerpt display was not traced.

## S9.29 Usage meter.

- **Expected:** A meter shows how much of the plan allowance is used (per window) with the reset time, readable by assistive tech.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-usage/index.tsx:1120; apps/mobile/services/usage.ts:89
- **Where to find it:** Settings > Usage > Plan usage (labels found in the code)
- **Needs:** a Cloud account
- **Steps:**
  1. Sign in with a Cloud account and open Settings.
  2. Tap "Usage".
  3. Read the "Plan usage" section: each meter shows its label and a reset line below the bar.
  4. Tap the info control labelled "About usage limits" and compare the reset time with Expected.

## S9.31 Permission summary.

- **Expected:** One view states in plain language what the assistant or a connected app is allowed to do (scopes, autonomy, allowed sites or tools).
- **Code:** done. Evidence present: apps/mobile/src/features/settings/capabilities/index.tsx:339; apps/mobile/src/features/settings/capabilities/index.tsx:199; apps/mobile/src/features/settings/capabilities/index.tsx:374
- **Where to find it:** Settings > Capabilities (labels found in the code)
- **Needs:** none (some rows need a Cloud account)
- **Steps:**
  1. Open Settings and tap "Capabilities".
  2. Read the header "What AGI can use" and the rows (for example "Action approvals", "Web search", "Image generation").
  3. Each row shows its state as a value on the right.
  4. Tap "Action approvals" to see the approval choices, then compare with Expected.

## S9.32 Approval card.

- **Expected:** When an action needs consent, an inline card names the action and offers approve and deny, and the choice resumes or stops the run.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:226 (quoted code not found in the file now); apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:372; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:526
- **Where to find it:** Chat (Cloud) > an action that needs approval > approval card with "Allow once", "Allow for this chat", "Always allow", "Deny" (labels found in the code)
- **Needs:** a Cloud account; a tool action that needs approval
- **Steps:**
  1. Set Settings > Capabilities > Action approvals to "Ask before every action".
  2. In a Cloud chat, ask the assistant to do an action that needs approval (for example a write or send action).
  3. Read the approval card: it names the action and shows the choices.
  4. Tap "Allow once" or "Deny" and check the run continues or stops, as Expected says.

## S9.33 Integration connection card.

- **Expected:** Each integration shows a card with its connection state (connected, expired, not connected) and the action to connect or disconnect.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/index.tsx:430 (quoted code not found in the file now); apps/mobile/src/features/settings/cloud-connectors/index.tsx:699 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors (labels found in the code)
- **Needs:** a Cloud account; at least one connector
- **Steps:**
  1. Sign in with a Cloud account and open Settings.
  2. Tap "Connectors".
  3. Read each connector card: the "Connected" filter and the connected state shown on the card.
  4. Open a connector and tap "Disconnect" (a confirmation asks first), then compare with Expected.

## S9.34 Capability-warning card.

- **Expected:** Before sending, a visible notice warns when the chosen model cannot handle something in the request (images, tools, attachments, context size).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:880 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched apps/mobile/src/features/chat and apps/mobile/src/features/model-picker for "not support", "doesn't support", "can't send" and similar; ChatInput.tsx near line 880 is attachment handling, and no visible capability-warning notice was found.
- **Needs:** a Cloud or Local chat with a model that lacks a feature

## S9.35 Task-progress card.

- **Expected:** A running task shows a card with its current state and progress (steps done, latest action) that updates while it runs.
- **Code:** done. Evidence present: apps/mobile/app/(app)/companion/agent/[id].tsx:256; apps/mobile/src/features/companion/components/AgentDashboard.tsx:121
- **Where to find it:** Remote control (AGI Work > Tasks > open a running task) > agent detail (some labels not found in the code; trust the screen)
- **Needs:** a Cloud account; a running task; Remote Control may be hidden in some builds
- **Steps:**
  1. Start a long task in Cloud mode so it runs in the background.
  2. Open the task from the task list and check the card shows its progress bar and current state.
  3. Watch the card update while the task runs, then tap "Expand tool call log" to see the latest actions.
  4. Compare with Expected (steps done, latest action).

## S9.36 Interactive result widget.

- **Expected:** An answer can embed a widget the user operates in place (choices, map, app card), and the choice or state feeds back into the conversation.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:1077
- **Where to find it:** Chat > ask for a place or an itinerary > the map card in the answer (labels found in the code)
- **Needs:** a Cloud or Local chat that returns an interactive card
- **Steps:**
  1. Ask the assistant for a place, for example "show me a map of a city" or a day plan.
  2. Find the map card in the answer and tap its action buttons.
  3. Check the map shows the place with its overlay labels (route pill, attribution).
  4. Tap a choice or action and see whether the answer or conversation updates, as Expected says.

## S9.37 Notification inbox.

- **Expected:** An inbox lists the user's notifications newest first, marks which are unread (visibly and for screen readers), and lets them open or mark them read.
- **Code:** done. Evidence present: apps/mobile/app/(app)/notifications/index.tsx:143
- **Where to find it:** Chats > search icon in the header > type Notifications > under Go to, tap Notifications (labels found in the code)
- **Needs:** a signed-in account; at least one notification (an unread one shows the unread style); the cloud chat feature must be on, otherwise the screen shows nothing
- **Steps:**
  1. Sign in and open the Chats screen.
  2. Tap the search icon in the header (it has no visible text; the code labels it 'search').
  3. Type Notifications (or inbox) in the Search box and tap Notifications under Go to.
  4. Look at the title Notifications and the line under it: 'N unread notifications' or 'All caught up'. Unread rows show a bold title and a small dot, and their screen-reader label starts with 'Unread,'.
  5. Tap an unread row to open it, or tap Mark read on it, then check that the row turns to the read style and the count goes down.
  6. Check that the newest item is at the top.

## S9.38 Keyboard-command palette.

- **Expected:** A keyboard shortcut opens a searchable list of commands and destinations; typing filters it and Enter runs the choice.
- **Code:** partial. Evidence moved: apps/mobile/src/features/search/mobileDestinations.ts:180 (quoted code not found in the file now)
- **Known to be unfinished:** D-2026-09-28-27: a global command palette is not built on mobile.
- **Where to find it:** not found in the code. Not built on mobile, as the plan's ledger says (D-2026-09-28-27). I searched apps/mobile for keyboard handlers (keyCommand, useKeyCommands, onKeyPress, hardwareKey, keydown, shortcut) and found only Android launcher shortcuts in native/android/withAGIShortcuts.cjs, which are not an in-app palette. The Search screen (app/(app)/search.tsx) has no keyboard shortcut and no Enter-to-run.
