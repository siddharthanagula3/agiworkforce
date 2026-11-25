---
id: "PLAN-desktop-004"
type: "test-plan"
title: "Desktop · 4. Signed-in application destinations"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "4"
---
# Desktop · 4. Signed-in application destinations

40 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S4.01 New-chat home.

- **Expected:** Signed-in user lands on (or opens) an empty new-chat screen with a ready composer from which a new conversation starts.
- **Code:** done. Evidence present: apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/features/chat/pages/WebChatPage.tsx:7635; apps/web/features/chat/pages/WebChatPage.tsx:6651
- **Where to find it:** Sidebar > New chat (labels found in the code)
- **Steps:**
  1. Sign in and stay on the Chat screen with the left sidebar.
  2. Click "New chat" in the sidebar (the same control is in the collapsed rail).
  3. Look for an empty conversation with the message box ready to type in, then type a message and send it.
  4. Compare with Expected: a new empty chat with a ready composer.

## S4.02 Existing conversation.

- **Expected:** Opening a past conversation (from the list or a link) shows its transcript and lets the user continue it.
- **Code:** done. Evidence present: apps/web/app/chat/[sessionId]/page.tsx:14; apps/web/features/chat/pages/WebChatPage.tsx:1141; apps/web/features/chat/pages/WebChatPage.tsx:2369
- **Where to find it:** Sidebar > Recents > a conversation title (labels found in the code)
- **Needs:** a past conversation in the sidebar
- **Steps:**
  1. Sign in and look at the sidebar list under the "Recents" heading.
  2. Click a past conversation title.
  3. Look for its earlier messages (transcript) and a message box to continue the chat.
  4. Compare with Expected: transcript shown and the chat can be continued.

## S4.03 Conversation search.

- **Expected:** A search destination where the user types a keyword, gets past conversations matching titles or message text, and opens one.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:7115; packages/ui/ui/src/sidebar/Sidebar.tsx:518; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:378 (quoted code not found in the file now); apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:267; apps/web/features/chat/services/global-search-service.ts:189
- **Where to find it:** Sidebar > Search (labels found in the code)
- **Needs:** a past conversation with a known word in it
- **Steps:**
  1. Click "Search" in the sidebar.
  2. In the box "Search your workspace", type a word from a past chat title or message.
  3. Wait for matching past conversations to appear.
  4. Click one result and check that its conversation opens.

## S4.04 Archived conversations.

- **Expected:** A destination lists the user's archived conversations and lets them open, restore or delete them.
- **Code:** done. Evidence moved: apps/web/app/settings/archived/page.tsx:6; apps/web/features/settings/components/WebSettingsModal.tsx:200 (quoted code not found in the file now); apps/web/features/settings/sections/ArchivedChatsSection.tsx:59 (quoted code not found in the file now); apps/web/features/settings/sections/ArchivedChatsSection.tsx:110 (quoted code not found in the file now); packages/ui/ui/src/sidebar/Sidebar.tsx:610 (quoted code not found in the file now)
- **Where to find it:** Settings > Privacy > Archived chats > Manage (labels found in the code)
- **Needs:** at least one archived chat (archive one from its row menu first)
- **Steps:**
  1. Open the account menu and choose "Settings", then "Privacy".
  2. Find "Archived chats" and click "Manage".
  3. Check the list of archived chats; try "Restore" on one and check it returns to the sidebar.
  4. Try the sidebar "Archived (N)" button as a second route and compare with Expected: open, restore or delete.

## S4.05 Pinned conversations.

- **Expected:** Conversations the user pinned are shown together in a pinned section or filter and open from there.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:770; packages/ui/ui/src/sidebar/SessionItem.tsx:353; apps/web/features/chat/pages/WebChatPage.tsx:5369; apps/web/features/chat/pages/WebChatPage.tsx:7175
- **Where to find it:** Sidebar > Pinned section, set from a chat row's menu > Pin (labels found in the code)
- **Needs:** at least two chats
- **Steps:**
  1. Open the menu of a chat row in the sidebar and click "Pin".
  2. Look for the "Pinned" section at the top of the chat list.
  3. Click the pinned chat and check that it opens.
  4. Open its menu again and click "Unpin"; check that it leaves the Pinned section.

## S4.06 Projects index.

- **Expected:** A Projects destination lists the user's projects and lets them open or create one.
- **Code:** done. Evidence present: apps/web/shared/components/layout/app-nav-items.ts:106; apps/web/app/chat/projects/page.tsx:368; apps/web/features/projects/hooks/use-managed-cloud-projects.ts:36
- **Where to find it:** Sidebar > Projects (left rail item "Projects") (labels found in the code)
- **Needs:** none (one project helps)
- **Steps:**
  1. Click "Projects" in the left rail.
  2. Look for the list of your projects.
  3. Click "New project" and check that a create dialog opens.
  4. Click an existing project card and check that it opens.

## S4.07 Project overview.

- **Expected:** Opening a project shows its home: name, description/instructions summary, and entry points to its chats and files.
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:1010; apps/web/app/chat/projects/[id]/page.tsx:1072; apps/web/app/chat/projects/[id]/page.tsx:112
- **Where to find it:** Projects > a project card (labels found in the code)
- **Needs:** a project
- **Steps:**
  1. Click "Projects" in the left rail and open a project card.
  2. Check the project name heading at the top.
  3. Check the tabs "Chats", "Artifacts", "Work", "Sources", "Scheduled".
  4. Compare with Expected: name, description or instructions, and entries to its chats and files.

## S4.08 Project conversations.

- **Expected:** Within a project, a list of the project's conversations that open when selected.
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:1170; apps/web/app/chat/projects/[id]/page.tsx:1232; apps/web/app/chat/projects/[id]/page.tsx:130
- **Where to find it:** Projects > a project > Chats tab (labels found in the code)
- **Needs:** a project with at least one chat in it
- **Steps:**
  1. Open a project.
  2. Click the "Chats" tab.
  3. Check the list of this project's conversations.
  4. Click one and check that it opens.

## S4.09 Project files and sources.

- **Expected:** Within a project, a files/sources view lists the project's knowledge files and lets the user add and remove them.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now); apps/web/lib/services/entitlement-resolution.ts:431
- **Where to find it:** Projects > a project > Sources tab > Add sources (some labels not found in the code; trust the screen)
- **Needs:** a file to upload
- **Steps:**
  1. Open a project and click the "Sources" tab.
  2. Click "Add sources" and choose a file, Google Drive, or "Add text".
  3. Check that the new item appears in the Sources list.
  4. Look for a remove control on that item and check that it removes it.

## S4.10 Project instructions.

- **Expected:** A place to view and edit a project's instructions, which then apply to chats in that project.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSettingsDialog.tsx:321; apps/web/features/projects/components/ProjectSettingsDialog.tsx:189; apps/web/app/chat/projects/[id]/page.tsx:664
- **Where to find it:** Projects > a project > Project options > Project settings > Instructions (labels found in the code)
- **Needs:** a project
- **Steps:**
  1. Open a project and click "Project options".
  2. Click "Project settings".
  3. Type text in the "Instructions" box and click "Save".
  4. Open a new chat in that project and check that the reply follows the instructions.

## S4.11 Project members.

- **Expected:** A project members view shows who has access to a project and lets the owner add or remove people.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSharingControls.tsx:175; apps/web/features/projects/components/ProjectSharingControls.tsx:243; apps/web/lib/services/org-sharing-service.ts:91; apps/web/db/neon/0316_project_owner_sharing.sql:76
- **Where to find it:** Projects > a project > Project options > Share (labels found in the code)
- **Needs:** a second account in the same workspace
- **Steps:**
  1. Open a project, click "Project options", then "Share".
  2. Click "Add people" and pick a person from the workspace.
  3. Choose "Can view" or "Can edit" for that person.
  4. Check that the person appears in the member list; then check it from the second account.

## S4.12 Project Memory.

- **Expected:** A project memory view shows what has been remembered for that project, with scope controls, separately from account memory.
- **Code:** done. Evidence moved: apps/web/features/projects/components/ProjectSettingsDialog.tsx:387; apps/web/features/projects/components/ProjectSettingsDialog.tsx:404; apps/web/features/projects/components/ProjectMemoryPanel.tsx:17 (quoted code not found in the file now)
- **Where to find it:** Projects > a project > Project options > Project settings > Memory (labels found in the code)
- **Needs:** a project
- **Steps:**
  1. Open a project's "Project settings".
  2. Scroll to the "Memory" section and read the "Project memories" list.
  3. Add a memory in the box "Add a memory only this project uses".
  4. Check it appears only in this project and that the "Use memories from outside this project" checkbox is shown separately from account memory.

## S4.13 Work-task home.

- **Expected:** A home for agentic work where the user states a goal for an autonomous multi-step (AGI Work) run and can reach their recent work.
- **Code:** done. Evidence present: apps/web/app/chat/page.tsx:14; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2806; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1066; apps/web/features/tasks/components/TasksPage.tsx:43
- **Where to find it:** Chat screen > message box > mode "Work" (labels found in the code)
- **Needs:** a paid account (the code hides Work on a free trial)
- **Steps:**
  1. On the new chat screen, open the mode control in the message box and choose "Work".
  2. Type a goal for an autonomous task and send it.
  3. Check that the screen shows the work run and that "Work history" is reachable from the command palette or the home screen.
  4. Compare with Expected: a place to state a goal and reach recent work.

## S4.14 Active-task dashboard.

- **Expected:** A dashboard lists the user's active/running work tasks with their live status, filterable from finished ones.
- **Code:** done. Evidence present: apps/web/app/tasks/page.tsx:16; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:555; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:247; apps/web/shared/components/CommandPalette/CommandPalette.tsx:230
- **Where to find it:** Work history (command palette "Work history", or the "Work history" link on the home screen when there are many runs) (labels found in the code)
- **Needs:** none (a work task helps)
- **Steps:**
  1. Press Command plus K and choose "Work history", or go to the home screen and click "Work history" if it appears.
  2. Click the filter "Active".
  3. Check that running work tasks show their live status.
  4. Click "All" and check that finished tasks also appear.

## S4.15 Task details and transcript.

- **Expected:** Opening one task shows its status, step-by-step activity/transcript, outputs, and any pending decision.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:651; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:129; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:404
- **Where to find it:** Work history > a task row (labels found in the code)
- **Needs:** a work task
- **Steps:**
  1. Open "Work history" and click a task.
  2. Check the "Task details" panel for the status, the "Task goal" and the "Task plan".
  3. Look for any pending decision or approval on the panel.
  4. Compare with Expected: status, step-by-step activity, outputs and pending decision.

## S4.16 Approvals inbox.

- **Expected:** An approvals inbox gathers every pending approval across the user's tasks and lets them approve or reject each.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:60; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:72
- **Where to find it:** Work history > filter "Needs you" (labels found in the code)
- **Needs:** a work task that is waiting for approval
- **Steps:**
  1. Open "Work history" and click the filter "Needs you".
  2. Check the tasks waiting for a decision and their approval cards.
  3. Click the approve or deny button on one card.
  4. Check that the card updates to show the decision.

## S4.17 Scheduled-task manager.

- **Expected:** A scheduled-task manager lists the user's schedules with cadence/status and lets them create, edit, pause/resume, run now and delete.
- **Code:** done. Evidence moved: apps/web/shared/components/layout/app-nav-items.ts:156; apps/web/app/chat/schedules/page.tsx:15; apps/web/features/schedules/components/SchedulesPage.tsx:683 (quoted code not found in the file now); apps/web/features/schedules/components/SchedulesPage.tsx:334
- **Where to find it:** Sidebar > Scheduled (labels found in the code)
- **Steps:**
  1. Click "Scheduled" in the sidebar.
  2. Click "Create a task" (or "New task") and fill in and save a schedule.
  3. On a schedule card, use the menu item "Run now", then "Pause" or "Resume".
  4. Click the edit control ("Edit Schedule") and the "Delete" menu item, and compare with Expected.

## S4.18 Routine details.

- **Expected:** Opening one routine/schedule shows its configuration (prompt, cadence, next run) and its run history.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleCard.tsx:395; apps/web/features/schedules/components/SchedulesPage.tsx:554; apps/web/features/schedules/components/ScheduleRunHistory.tsx:178
- **Where to find it:** Sidebar > Scheduled > a schedule card > Run History (labels found in the code)
- **Needs:** a schedule that has run at least once
- **Steps:**
  1. Click "Scheduled" in the sidebar.
  2. On a schedule card click the "Run History" button to expand its run history.
  3. Click "Edit Schedule" to see the prompt and cadence.
  4. Compare with Expected: prompt, cadence, next run and run history.

## S4.19 Coding-session home.

- **Expected:** A coding home lists the user's coding sessions and starts a new one on a repository or runtime.
- **Code:** done. Evidence moved: apps/web/app/code/page.tsx:11; packages/ui/ui/src/sidebar/Sidebar.tsx:516; apps/web/features/code/CloudCodePage.tsx:972 (quoted code not found in the file now); apps/web/features/code/services/cloud-code-api.ts:356 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Code (surface switch: "Home" / "Code") > New (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Click "Code" in the sidebar switch.
  2. Look for the "Cloud sessions" list.
  3. Click "New" and choose a repository with "Select repository".
  4. Click "Start the task" and check that a new session starts.

## S4.20 Coding-session workspace.

- **Expected:** A coding-session workspace shows the session transcript, file changes/diffs and a composer to steer the next turn.
- **Code:** done. Evidence moved: apps/web/app/code/[sessionId]/page.tsx:16; apps/web/features/code/CloudCodePage.tsx:2646; apps/web/features/code/CloudCodePage.tsx:2886; apps/web/features/code/services/cloud-code-api.ts:364 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Code > Cloud sessions > a session (labels found in the code)
- **Needs:** a Code session that has run
- **Steps:**
  1. Click "Code" in the sidebar switch and open a session in the "Cloud sessions" list.
  2. Check the session transcript.
  3. Click "Changes" to see the file changes and the diff.
  4. Look for a message box to send the next instruction and compare with Expected.

## S4.21 Remote devices.

- **Expected:** A devices destination lists the user's linked devices with status/last activity and lets them manage (rename, unlink, pair) them.
- **Code:** done. Evidence present: apps/web/features/settings/sections/AccountSection.tsx:629; apps/web/features/settings/components/LinkedDevicesPanel.tsx:154; apps/web/features/settings/components/LinkedDevicesPanel.tsx:107
- **Where to find it:** Settings > Account > Linked devices (labels found in the code)
- **Needs:** at least one linked device
- **Steps:**
  1. Open the account menu, choose "Settings", then "Account".
  2. Scroll to "Linked devices" and read each device's status.
  3. Click "Rename", type a new name, click "Save", and check the new name.
  4. Click "Unlink" and confirm "Unlink device"; check that the device leaves the list.

## S4.23 Library.

- **Expected:** A Library destination lists everything the account produced or uploaded (files, images, videos, documents, artifacts) with filters and open/download actions.
- **Code:** done. Evidence present: apps/web/shared/components/layout/app-nav-items.ts:118; apps/web/app/chat/library/page.tsx:17; packages/ui/unified-chat/src/components/library/LibraryView.tsx:94; apps/web/features/library/components/LibraryView.tsx:155
- **Where to find it:** Sidebar > Library (labels found in the code)
- **Needs:** some uploaded or generated files
- **Steps:**
  1. Click "Library" in the sidebar.
  2. Look at the filter tabs "All", "Images", "Videos", "Documents", "Artifacts", "Uploads", "Generated files".
  3. Choose a file and open its menu or "Download" action.
  4. Compare with Expected: files, images, videos, documents and artifacts, with filters and open or download.

## S4.24 Shared-with-me resources.

- **Expected:** A destination lists resources (projects, conversations, artifacts, connectors) that other people shared with the user, and opens them.
- **Code:** done. Evidence moved: apps/web/app/workspace/sharing/page.tsx:17; apps/web/features/settings/sections/OrganizationSharingSection.tsx:440; apps/web/app/api/settings/organization/shared/route.ts:54 (quoted code not found in the file now); apps/web/app/chat/projects/[id]/page.tsx:1025
- **Where to find it:** not found in the code. Found only the workspace console page "Sharing" (apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx), which lists what the workspace shares, not what others share with the user. Shared projects show the label "Shared with you" on the project page (apps/web/app/chat/projects/[id]/page.tsx). No list of items shared with the user was found.
- **Needs:** a second account in the same workspace

## S4.25 Artifact gallery.

- **Expected:** An artifact gallery lists the user's generated artifacts and opens any of them.
- **Code:** done. Evidence present: apps/web/app/chat/artifacts/page.tsx:8; packages/ui/unified-chat/src/components/library/LibraryView.tsx:97; apps/web/features/library/components/LibraryView.tsx:155
- **Where to find it:** Sidebar > Library > Artifacts (labels found in the code)
- **Needs:** at least one artifact
- **Steps:**
  1. Click "Library" in the sidebar.
  2. Click the filter "Artifacts".
  3. Click one artifact to open it.
  4. Compare with Expected: a gallery of generated artifacts that opens any one of them.

## S4.26 Artifact editor.

- **Expected:** An artifact editor lets the user edit an artifact's content directly and saves the result as a new version.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1340 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1124
- **Where to find it:** A chat > artifact side panel > more menu (...) > Edit source (labels found in the code)
- **Needs:** a chat with a text document artifact
- **Steps:**
  1. Open a chat that produced a text document artifact and open it in the side panel.
  2. Open the more menu and click "Edit source".
  3. Change the text, then click "Save" (tooltip "Save as a new version").
  4. Open the version history and check that a new version exists with the change.

## S4.27 Image studio.

- **Expected:** A dedicated image studio where the user writes a prompt, picks style/size options, generates images and sees results/history in one place.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Chat > the + button in the composer > Generate image (no separate studio page) (labels found in the code)
- **Needs:** a signed-in account; image generation may depend on plan (not verified)
- **Steps:**
  1. Click Chat in the left rail to open a new chat.
  2. Click the + button in the composer and choose Generate image.
  3. Look for the Image chip in the composer, then open the aspect ratio control (Select aspect ratio) and the Add a style to the prompt control.
  4. Type a description and send. Compare with Expected: the picture should appear in the chat. There is no studio page with prompt, style, size and history in one place; /chat/images only redirects to Library > Images.

## S4.28 Image collection.

- **Expected:** An image collection view shows all images the user generated or uploaded, with open/download/remix actions.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:94; packages/ui/unified-chat/src/components/library/LibraryView.tsx:110; apps/web/features/library/components/LibraryView.tsx:155
- **Where to find it:** Library > Images (labels found in the code)
- **Needs:** a few generated or uploaded images in the account
- **Steps:**
  1. Click Library in the left rail.
  2. Click the Images tab.
  3. Hover an image and look for its download control and any Remix action in its row menu (Remix shows only where the host supports it).
  4. Check that generated and uploaded images both appear here, and compare with Expected: open, download and remix actions.

## S4.30 Media job history.

- **Expected:** A media job history lists image/video generation jobs with their status (queued, running, failed, done) and links to results.
- **Code:** done. Evidence present: apps/web/app/api/media/jobs/route.ts:20; apps/web/lib/server/media-job-history.ts:185; packages/ui/unified-chat/src/components/library/LibraryView.tsx:974; packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:49; apps/web/features/library/components/LibraryView.tsx:242; apps/desktop/src/features/library/DesktopLibrary.tsx:186
- **Where to find it:** Library > Generations (section above the tabs) (labels found in the code)
- **Needs:** at least one image or video generation job in the account
- **Steps:**
  1. Click Library in the left rail.
  2. Look for the Generations heading above the tabs.
  3. Check the status words on each job: Queued, Generating, Failed, Done, Cancelled.
  4. Open a finished job and see whether it links to its result, then compare with Expected.

## S4.31 Notebook workspace.

- **Expected:** A notebook workspace holds a set of sources and notes that the user reads, annotates and chats over, with generated outputs (NotebookLM-style).
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSourcesPanel.tsx:20; apps/web/features/chat/pages/web-chat-layout.ts:3; apps/web/features/projects/components/ProjectStudio.tsx:37; apps/web/features/projects/components/AddSourcesModal.tsx:114
- **Where to find it:** Projects > (open a project) > Sources (labels found in the code)
- **Needs:** a project; a file to upload (optional)
- **Steps:**
  1. Click Projects in the left rail and open a project.
  2. Click the Sources tab.
  3. Click Add sources, add a text note or a file, and check it is listed.
  4. Look at the Studio tiles (Briefing doc, Study guide and others) and compare with Expected: the sources are the notebook, and the outputs appear from them.

## S4.32 Research report reader.

- **Expected:** A research report reader lists the user's research reports and opens one with its sections and cited sources.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7873; apps/web/features/chat/components/research/ResearchReportsGallery.tsx:142; apps/web/features/chat/components/research/ResearchPanel.tsx:475
- **Where to find it:** Chat > a conversation with research sources > Open sources panel (title Research sources) > Library tab (labels found in the code)
- **Needs:** a conversation that has run Deep Research
- **Steps:**
  1. Open a conversation that ran Deep Research.
  2. Hover the sources button; its title is Research sources, and click it to open the panel.
  3. Click the Library tab, then open a report.
  4. Check the report's sections (Report tab) and cited sources, and compare with Expected.

## S4.35 Skills manager.

- **Expected:** A skills manager lists installed and available skills and lets the user install, enable/disable, author and remove them.
- **Code:** done. Evidence present: apps/web/app/skills/page.tsx:44; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1407; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1508
- **Where to find it:** Account menu > Settings > Customize > Skills (labels found in the code)
- **Needs:** a signed-in account; skills may be limited by plan
- **Steps:**
  1. Open the account menu and click Settings.
  2. Under Customize, click Skills.
  3. Click New skill, fill in the editor, and click Create skill.
  4. Check the list for installed and available skills and their controls, then compare with Expected.

## S4.36 Plugins manager.

- **Expected:** A plugins manager lists installed and available plugins and lets the user install, configure, update and remove them.
- **Code:** done. Evidence present: apps/web/app/chat/customize/page.tsx:5; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1509; apps/web/features/directory/services/plugins-directory.ts:1433
- **Where to find it:** Account menu > Settings > Customize > Plugins (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the account menu, click Settings, then Customize > Plugins.
  2. Compare the installed and available plugin lists.
  3. Click Install on an available plugin.
  4. Open a plugin's remove action and look for the Remove plugin? confirmation, then compare with Expected.

## S4.37 Connected accounts.

- **Expected:** A connected-accounts destination lists the third-party services the user has connected and lets them connect, reconnect and disconnect each.
- **Code:** done. Evidence moved: apps/web/app/settings/connections/page.tsx:13; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:998; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:686 (quoted code not found in the file now)
- **Where to find it:** Account menu > Settings > Customize > Connectors (labels found in the code)
- **Needs:** an outside account for the service to connect
- **Steps:**
  1. Open the account menu, click Settings, then Connectors under Customize.
  2. Look at the Connected tab and the list of services.
  3. Click Connect on one service, then Reconnect or Disconnect on a connected one (Disconnect asks to confirm).
  4. Compare with Expected: the list should update to the new state.

## S4.38 Model catalog.

- **Expected:** A model catalog lists the models the user can reach with capabilities/context/price and lets them pick one or set a default.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1733; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:324; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:494; apps/web/features/models/components/ModelCard.tsx:135; apps/web/lib/server/model-catalogue.ts:242 (quoted code not found in the file now); apps/web/features/settings/sections/GeneralSection.tsx:416; apps/web/features/settings/sections/GeneralSection.tsx:416
- **Where to find it:** Composer model picker (Models panel) and Settings > General > Preferences > Default model (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open a new chat and open the model control in the composer.
  2. Look for the Models panel with Search models, Context ceiling and Capabilities for each model.
  3. Pick a model, then open Settings > General.
  4. Under Preferences, check the Default model row, choose a model, and compare with Expected.

## S4.39 Usage dashboard.

- **Expected:** A usage dashboard shows current usage against plan limits per window (session/weekly/credits), reset times and recent usage history.
- **Code:** done. Evidence moved: apps/web/app/settings/usage/page.tsx:6; apps/web/features/settings/components/WebSettingsModal.tsx:291; apps/web/features/settings/sections/UsageSection.tsx:1201; apps/web/features/settings/sections/UsageSection.tsx:218 (quoted code not found in the file now)
- **Where to find it:** Account menu > Settings > Usage (labels found in the code)
- **Needs:** a signed-in account with some usage
- **Steps:**
  1. Open the account menu, click Settings, then Usage.
  2. Read Plan usage limits and Credit balances, and check the Resets section.
  3. Scroll to Monthly spend limit and check its figure.
  4. Scroll to Where your usage went, switch between By day, By week and By month, and compare with Expected.

## S4.40 Billing settings.

- **Expected:** A billing settings destination shows the current plan, renewal, payment method and invoices, and lets the user change or cancel the plan.
- **Code:** partial. Evidence present: apps/web/features/settings/sections/BillingSection.tsx:94
- **Known to be unfinished:** live-check: with a beta_redemptions-granted test account run Stripe test checkout, then /settings/billing on web and in Electron: plan, invoices, portal (opens externally in Electron) and the overage toggle work; migration 0281 is applied
- **Where to find it:** Account menu > Settings > Billing (labels found in the code)
- **Needs:** a paid account for the plan and invoice views (test checkout per the product note)
- **Steps:**
  1. Open the account menu, click Settings, then Billing.
  2. Check the plan name, Renews on date and the Payment section.
  3. Check the Invoices table, then click Adjust plan (or Upgrade plan on Free) and look at the options.
  4. Click Manage billing and compare with Expected (in Electron it opens outside the app).

## S4.41 Personal settings.

- **Expected:** A personal settings destination lets the signed-in user view and change their own preferences (profile, appearance, personalization, notifications) and saves them.
- **Code:** done. Evidence moved: apps/web/app/settings/general/page.tsx:6; apps/web/features/settings/sections/GeneralSection.tsx:320 (quoted code not found in the file now); apps/web/app/settings/_lib/preferences-client.ts:200
- **Where to find it:** Account menu > Settings > General (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the account menu, click Settings, then General.
  2. Under Profile, change Full name.
  3. Scroll to Preferences and change Default model or Display Language.
  4. Leave the screen, come back, and check the change was kept, then compare with Expected.

## S4.42 Workspace administration.

- **Expected:** A workspace administration destination lets an admin manage members, roles, invitations, policies and workspace settings.
- **Code:** done. Evidence present: apps/web/features/settings/components/WebSettingsModal.tsx:272; apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:54; apps/web/app/workspace/people/page.tsx:17; apps/web/features/settings/sections/TeamSection.tsx:636
- **Where to find it:** Account menu > Settings > Workspace (then the workspace console: Members, Roles, Policy) (labels found in the code)
- **Needs:** an admin or owner account; a second account to invite
- **Steps:**
  1. Open the account menu, click Settings, then Workspace.
  2. Follow the link to the workspace console and look at Overview, Members, Roles, Identity and Policy.
  3. On Members or Roles, check invitations and seats, and invite a second account.
  4. Compare with Expected: an admin can manage members, roles, invitations and policy.

## S4.43 Developer console.

- **Expected:** A developer console lets the user create/revoke API keys, see API usage per key, read API docs and try requests.
- **Code:** done. Evidence present: apps/web/features/settings/components/Settings/ApiKeys.tsx:257; apps/web/features/settings/components/Settings/ApiKeys.tsx:77; apps/web/app/api/developers/usage/route.ts:20; apps/web/lib/services/developer-usage-service.ts:37; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6170
- **Where to find it:** not found in the code. The page exists at /developers (apps/web/app/developers/page.tsx, heading Developer console in apps/web/features/developers/components/DeveloperConsolePage.tsx) with API keys (apps/web/features/settings/components/Settings/ApiKeys.tsx). Searched for links to /developers and the navDeveloperConsole string in the signed-in nav, Settings and Account menu: none found, so no UI path was confirmed.
- **Needs:** a signed-in account

## S4.44 Help and feedback.

- **Expected:** A help-and-feedback destination links to help/docs/status and lets the user send product feedback or a bug report from inside the product.
- **Code:** done. Evidence present: apps/web/features/settings/components/WebSettingsModal.tsx:301; apps/web/shared/components/layout/AccountMenuItems.tsx:105; apps/web/shared/components/layout/WebAppShell.tsx:515; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:166
- **Where to find it:** Account menu > Get help > Send feedback; Settings > Help (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the account menu and hover Get help.
  2. Click Send feedback and choose a feedback type in the dialog, then send.
  3. Open Settings > Help and check the links: Documentation, Help center, Contact support, Report a bug, Release notes, System status, Legal.
  4. Compare with Expected: help links and a feedback path should both be there.
