---
id: "PLAN-web-004"
type: "test-plan"
title: "Web · 4. Signed-in application destinations"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "4"
---
# Web · 4. Signed-in application destinations

40 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S4.01 New-chat home.

- **Expected:** Signed-in user lands on (or opens) an empty new-chat screen with a ready composer from which a new conversation starts.
- **Code:** done. Evidence present: apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/features/chat/pages/WebChatPage.tsx:7635; apps/web/features/chat/pages/WebChatPage.tsx:6651
- **Earlier check in the running app:** PASS: E001 [PASS; visible UI]: New chat renders personalized greeting, composer, and default model. Ordinary Project chip and recurring provider banner are absent. A draft-conflict toast was also visible and is tracked separately.
- **Where to find it:** Sidebar > New chat (labels found in the code)
- **Steps:**
  1. Sign in and look at the first screen, which opens on the new-chat home.
  2. If you are in a conversation, click the "New chat" button at the top of the sidebar.
  3. Check for an empty transcript, a ready composer and the default model; the greeting and composer should be visible.

## S4.02 Existing conversation.

- **Expected:** Opening a past conversation (from the list or a link) shows its transcript and lets the user continue it.
- **Code:** done. Evidence present: apps/web/app/chat/[sessionId]/page.tsx:14; apps/web/features/chat/pages/WebChatPage.tsx:1141; apps/web/features/chat/pages/WebChatPage.tsx:2369
- **Earlier check in the running app:** PASS: E040 [PASS; live generated answer]: Follow-up on (model name).8-max-0902 returned exact LIVE_QA_20260926_OK; served route labeled via free pool. Renamed own conversation Browser QA, Chat and rendering. The earlier Retry click on failed activity did not visibly restart a request; fresh send succeeded. Sources panel opens empty, no research performed.
- **Where to find it:** Sidebar > conversation title in the chat history list (labels found in the code)
- **Needs:** a conversation that already has messages
- **Steps:**
  1. In the sidebar, click a past conversation title.
  2. Check that its transcript loads in the main area.
  3. Type a follow-up in the composer and send it; the reply should continue the same conversation.

## S4.03 Conversation search.

- **Expected:** A search destination where the user types a keyword, gets past conversations matching titles or message text, and opens one.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:7115; packages/ui/ui/src/sidebar/Sidebar.tsx:518; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:378 (quoted code not found in the file now); apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:267; apps/web/features/chat/services/global-search-service.ts:189
- **Earlier check in the running app:** PASS: E003 [PASS; interaction]: Searching QA_CHECKLIST_OK returned three matching messages across two conversations with highlighted matches.
- **Where to find it:** Sidebar > Search (labels found in the code)
- **Needs:** at least one conversation containing a known word
- **Steps:**
  1. Click the "Search" item in the sidebar rail or the Search button.
  2. Type a word that appears in one of your conversations.
  3. Check that matching conversations are listed and that clicking one opens it.
  4. Optionally tick "Include archived conversations" and compare the results.

## S4.04 Archived conversations.

- **Expected:** A destination lists the user's archived conversations and lets them open, restore or delete them.
- **Code:** done. Evidence moved: apps/web/app/settings/archived/page.tsx:6; apps/web/features/settings/components/WebSettingsModal.tsx:200 (quoted code not found in the file now); apps/web/features/settings/sections/ArchivedChatsSection.tsx:59 (quoted code not found in the file now); apps/web/features/settings/sections/ArchivedChatsSection.tsx:110 (quoted code not found in the file now); packages/ui/ui/src/sidebar/Sidebar.tsx:610 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E012 [PASS; empty-state interaction]: Archived manager opens and settles to its empty state; restore behavior needs a test archived chat. | E094 [PASS; archive and restore workflow]: Archived synthetic Browser QA, Chat and rendering from menu; appeared in Archived chats. Restore returned named success status and list became empty. No user conversation deleted.
- **Where to find it:** Settings > Archived chats (labels found in the code)
- **Needs:** a test conversation you can archive
- **Steps:**
  1. Open Settings from the account menu.
  2. Click the "Archived chats" section.
  3. Check the list of archived conversations, and whether it opens, restores or deletes them.
  4. Archive a test conversation from its menu, then restore it from this list.

## S4.05 Pinned conversations.

- **Expected:** Conversations the user pinned are shown together in a pinned section or filter and open from there.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:770; packages/ui/ui/src/sidebar/SessionItem.tsx:353; apps/web/features/chat/pages/WebChatPage.tsx:5369; apps/web/features/chat/pages/WebChatPage.tsx:7175
- **Where to find it:** Sidebar > Pinned (labels found in the code)
- **Needs:** a conversation you can pin
- **Steps:**
  1. Open the menu of a conversation in the sidebar and click "Pin".
  2. Look for the "Pinned" heading in the sidebar.
  3. Click the pinned conversation and check that it opens.

## S4.06 Projects index.

- **Expected:** A Projects destination lists the user's projects and lets them open or create one.
- **Code:** done. Evidence present: apps/web/shared/components/layout/app-nav-items.ts:106; apps/web/app/chat/projects/page.tsx:368; apps/web/features/projects/hooks/use-managed-cloud-projects.ts:36
- **Earlier check in the running app:** PASS: E031 [PASS; create and read result]: Created Browser QA, Live computer use. Empty name prevented submission; named project appears in index. Project ID 8ba08c3b-2c80-4d10-a5af-0c6702ec1496. Description not tested.
- **Where to find it:** Sidebar > Projects (labels found in the code)
- **Steps:**
  1. Click "Projects" in the sidebar rail.
  2. Check that the projects list appears.
  3. Click "New project" or the "+" next to the Projects heading, type a name and submit.
  4. Check that the new project appears in the list.

## S4.07 Project overview.

- **Expected:** Opening a project shows its home: name, description/instructions summary, and entry points to its chats and files.
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:1010; apps/web/app/chat/projects/[id]/page.tsx:1072; apps/web/app/chat/projects/[id]/page.tsx:112
- **Earlier check in the running app:** PASS: E033 [PASS; save and reload persistence]: Initial attempt interrupted by localhost server exit; retry saved successfully. Reload and reopen preserved description and PROJECT_QA_7391 instructions. Supersedes E032 pending-save result.
- **Where to find it:** Projects > open a project (labels found in the code)
- **Needs:** a project you have created
- **Steps:**
  1. Click "Projects" in the sidebar rail, then open a project.
  2. Check the project name and the entry points for its Chats, Artifacts, Work, Sources and Scheduled tabs.
  3. Open "Project options" to see the project's settings.

## S4.08 Project conversations.

- **Expected:** Within a project, a list of the project's conversations that open when selected.
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:1170; apps/web/app/chat/projects/[id]/page.tsx:1232; apps/web/app/chat/projects/[id]/page.tsx:130
- **Earlier check in the running app:** PARTIAL: Project conversation creation, listing and moving work; generation is blocked by Free-route/AGI Work entitlement errors. | E038 [BLOCKED; project generation gate]: Retried same turn with OpenRouter Free Auto: alert says AGI Work requires Pro or higher. Transcript and details retain prior Qwen error, creating inconsistent failure explanation. Project chat creation succeeded, generation blocked. | E043 [PASS; move and read result]: Moved only the synthetic ordinary conversation into QA project; project Chats lists it alongside project-context test. Copy-to-project not tested.
- **Where to find it:** Projects > open a project > Chats tab (labels found in the code)
- **Needs:** a project that has at least one conversation
- **Steps:**
  1. Open a project from Projects.
  2. Click the "Chats" tab.
  3. Check that the project's conversations are listed and that clicking one opens it.

## S4.09 Project files and sources.

- **Expected:** Within a project, a files/sources view lists the project's knowledge files and lets the user add and remove them.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now); apps/web/lib/services/entitlement-resolution.ts:431
- **Earlier check in the running app:** BLOCKED: E034 [BLOCKED; actual upload attempted]: Picked synthetic browser-qa-reference.txt. Upload progress appeared then explicit subscription error: current plan does not include project knowledge storage. No file was stored.
- **Where to find it:** Projects > open a project > Sources tab (labels found in the code)
- **Needs:** a Pro or higher account to add project knowledge files; a small text file to upload
- **Steps:**
  1. Open a project and click the "Sources" tab.
  2. Check the list of project files and the controls to add or remove them.
  3. Try to add a small text file and check the result.

## S4.10 Project instructions.

- **Expected:** A place to view and edit a project's instructions, which then apply to chats in that project.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSettingsDialog.tsx:321; apps/web/features/projects/components/ProjectSettingsDialog.tsx:189; apps/web/app/chat/projects/[id]/page.tsx:664
- **Earlier check in the running app:** PASS: E033 [PASS; save and reload persistence]: Initial attempt interrupted by localhost server exit; retry saved successfully. Reload and reopen preserved description and PROJECT_QA_7391 instructions. Supersedes E032 pending-save result.
- **Where to find it:** Projects > open a project > Project options (labels found in the code)
- **Needs:** a project you own
- **Steps:**
  1. Open a project and click "Project options".
  2. Open the project settings dialog and find the instructions field.
  3. Edit the instructions, save, close and reopen the dialog.
  4. Start a new chat in the project and check the instructions are applied.

## S4.11 Project members.

- **Expected:** A project members view shows who has access to a project and lets the owner add or remove people.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSharingControls.tsx:175; apps/web/features/projects/components/ProjectSharingControls.tsx:243; apps/web/lib/services/org-sharing-service.ts:91; apps/web/db/neon/0316_project_owner_sharing.sql:76
- **Where to find it:** Projects > open a project > sharing controls > Add people (labels found in the code)
- **Needs:** a second account in the same workspace
- **Steps:**
  1. Open a project you own.
  2. Find the sharing controls for the project.
  3. Click "Add people" and check the list of people with access.
  4. Remove a test person and check the list updates.

## S4.12 Project Memory.

- **Expected:** A project memory view shows what has been remembered for that project, with scope controls, separately from account memory.
- **Code:** done. Evidence moved: apps/web/features/projects/components/ProjectSettingsDialog.tsx:387; apps/web/features/projects/components/ProjectSettingsDialog.tsx:404; apps/web/features/projects/components/ProjectMemoryPanel.tsx:17 (quoted code not found in the file now)
- **Where to find it:** Projects > open a project > Project options (labels found in the code)
- **Needs:** a project you own
- **Steps:**
  1. Open a project and click "Project options".
  2. Look for the project memory area in the project settings dialog.
  3. Check the list of remembered facts for this project and the add control.

## S4.13 Work-task home.

- **Expected:** A home for agentic work where the user states a goal for an autonomous multi-step (AGI Work) run and can reach their recent work.
- **Code:** done. Evidence present: apps/web/app/chat/page.tsx:14; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2806; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1066; apps/web/features/tasks/components/TasksPage.tsx:43
- **Where to find it:** New chat > composer mode "Work" (labels found in the code)
- **Needs:** a paid account that includes Work mode
- **Steps:**
  1. On the new-chat screen, open the mode choice in the composer and pick "Work".
  2. Type a goal in the composer.
  3. Check that the screen is set up for an autonomous work run and that recent work is reachable.

## S4.14 Active-task dashboard.

- **Expected:** A dashboard lists the user's active/running work tasks with their live status, filterable from finished ones.
- **Code:** done. Evidence present: apps/web/app/tasks/page.tsx:16; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:555; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:247; apps/web/shared/components/CommandPalette/CommandPalette.tsx:230
- **Where to find it:** not found in the code. The Tasks page (apps/web/app/tasks/page.tsx) has filters Active, Needs you, All, Archived, but no rail, sidebar or menu link to it was found in the rail, Sidebar.tsx or the account menu; CommandPalette.tsx was searched for /tasks and gave no match.
- **Needs:** a paid account with work tasks

## S4.15 Task details and transcript.

- **Expected:** Opening one task shows its status, step-by-step activity/transcript, outputs, and any pending decision.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:651; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:129; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:404
- **Where to find it:** not found in the code. A TaskDetailPanel exists (packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx), but its entry point is the same unlinked Tasks page as S4.14.
- **Needs:** a paid account with a work task

## S4.16 Approvals inbox.

- **Expected:** An approvals inbox gathers every pending approval across the user's tasks and lets them approve or reject each.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:60; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:72
- **Where to find it:** not found in the code. Approve and reject controls are in ApprovalCard on the Tasks page; the Needs you filter is the closest inbox, but the page has no confirmed entry point, so the approvals inbox is unsure.
- **Needs:** a paid account with a task waiting for approval

## S4.17 Scheduled-task manager.

- **Expected:** A scheduled-task manager lists the user's schedules with cadence/status and lets them create, edit, pause/resume, run now and delete.
- **Code:** done. Evidence moved: apps/web/shared/components/layout/app-nav-items.ts:156; apps/web/app/chat/schedules/page.tsx:15; apps/web/features/schedules/components/SchedulesPage.tsx:683 (quoted code not found in the file now); apps/web/features/schedules/components/SchedulesPage.tsx:334
- **Earlier check in the running app:** PASS: E054 [PASS; destination and empty state]: Schedules loaded no schedules yet; creation requires Basic or higher. No automation created.
- **Where to find it:** Sidebar > Scheduled (labels found in the code)
- **Needs:** a Basic or higher account to create schedules; a test schedule
- **Steps:**
  1. Click "Scheduled" in the sidebar rail.
  2. Check the schedules list with cadence and status.
  3. Click "Run now" on a schedule's menu, then "Pause" or "Resume", and check the status changes.
  4. Open the menu and check "Delete"; read the confirmation before confirming.

## S4.18 Routine details.

- **Expected:** Opening one routine/schedule shows its configuration (prompt, cadence, next run) and its run history.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleCard.tsx:395; apps/web/features/schedules/components/SchedulesPage.tsx:554; apps/web/features/schedules/components/ScheduleRunHistory.tsx:178
- **Where to find it:** Sidebar > Scheduled > open a schedule card (labels found in the code)
- **Needs:** a schedule with at least one run
- **Steps:**
  1. Click "Scheduled" in the sidebar rail.
  2. Open one schedule card.
  3. Check its prompt, cadence and next run.
  4. Find the run history section and check its past runs.

## S4.19 Coding-session home.

- **Expected:** A coding home lists the user's coding sessions and starts a new one on a repository or runtime.
- **Code:** done. Evidence moved: apps/web/app/code/page.tsx:11; packages/ui/ui/src/sidebar/Sidebar.tsx:516; apps/web/features/code/CloudCodePage.tsx:972 (quoted code not found in the file now); apps/web/features/code/services/cloud-code-api.ts:356 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E055 [PASS; destination opens]: AGI Code opens cloud isolated task composer, repository picker, branch field, approvals/model controls. No repository connected and no coding runtime executed; cannot infer execution works from shell.
- **Where to find it:** Sidebar > Code (labels found in the code)
- **Needs:** a repository connected to the account for a real start
- **Steps:**
  1. Click "Code" in the sidebar switch next to "Home".
  2. Check the list of coding sessions.
  3. Click the new coding session action, choose a repository or runtime, and check the composer.

## S4.20 Coding-session workspace.

- **Expected:** A coding-session workspace shows the session transcript, file changes/diffs and a composer to steer the next turn.
- **Code:** done. Evidence moved: apps/web/app/code/[sessionId]/page.tsx:16; apps/web/features/code/CloudCodePage.tsx:2646; apps/web/features/code/CloudCodePage.tsx:2886; apps/web/features/code/services/cloud-code-api.ts:364 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Code > open a coding session (labels found in the code)
- **Needs:** an existing coding session
- **Steps:**
  1. Click "Code" in the sidebar switch.
  2. Open one coding session from the list.
  3. Check the transcript, file changes or diffs, and the composer to send the next turn.

## S4.21 Remote devices.

- **Expected:** A devices destination lists the user's linked devices with status/last activity and lets them manage (rename, unlink, pair) them.
- **Code:** done. Evidence present: apps/web/features/settings/sections/AccountSection.tsx:629; apps/web/features/settings/components/LinkedDevicesPanel.tsx:154; apps/web/features/settings/components/LinkedDevicesPanel.tsx:107
- **Where to find it:** Settings > Account > linked devices list (labels found in the code)
- **Needs:** at least one linked device
- **Steps:**
  1. Open Settings from the account menu and open the Account section.
  2. Find the linked devices list with its Last active column.
  3. Click "Rename" on a device and save a new name.
  4. Click the unlink action and read the confirmation before confirming.

## S4.23 Library.

- **Expected:** A Library destination lists everything the account produced or uploaded (files, images, videos, documents, artifacts) with filters and open/download actions.
- **Code:** done. Evidence present: apps/web/shared/components/layout/app-nav-items.ts:118; apps/web/app/chat/library/page.tsx:17; packages/ui/unified-chat/src/components/library/LibraryView.tsx:94; apps/web/features/library/components/LibraryView.tsx:155
- **Earlier check in the running app:** PASS: E049 [PASS; actual upload and filtered result]: Uploaded browser-qa-reference.txt to Library successfully (198 bytes), switched grid to list, searched exact stem and saw only the uploaded file. Project knowledge plan gate is distinct from Library upload.
- **Where to find it:** Sidebar > Library (labels found in the code)
- **Needs:** a file to upload to Library
- **Steps:**
  1. Click "Library" in the sidebar rail.
  2. Switch between grid and list views.
  3. Search for a file you uploaded and check that only matching items show.
  4. Open or download one item.

## S4.24 Shared-with-me resources.

- **Expected:** A destination lists resources (projects, conversations, artifacts, connectors) that other people shared with the user, and opens them.
- **Code:** done. Evidence moved: apps/web/app/workspace/sharing/page.tsx:17; apps/web/features/settings/sections/OrganizationSharingSection.tsx:440; apps/web/app/api/settings/organization/shared/route.ts:54 (quoted code not found in the file now); apps/web/app/chat/projects/[id]/page.tsx:1025
- **Where to find it:** Settings > Workspace console > Sharing (labels found in the code)
- **Needs:** a second account that shared something with you in the same workspace
- **Steps:**
  1. Open the workspace console from Settings.
  2. Click "Sharing" in the console navigation.
  3. Check the list of shared projects, conversations, artifacts and connectors.
  4. Open one shared item and check it loads.

## S4.25 Artifact gallery.

- **Expected:** An artifact gallery lists the user's generated artifacts and opens any of them.
- **Code:** done. Evidence present: apps/web/app/chat/artifacts/page.tsx:8; packages/ui/unified-chat/src/components/library/LibraryView.tsx:97; apps/web/features/library/components/LibraryView.tsx:155
- **Where to find it:** Sidebar > Library (artifact filter) (labels found in the code)
- **Needs:** an artifact you have generated
- **Steps:**
  1. Click "Library" in the sidebar rail.
  2. Filter the list to artifacts.
  3. Open one artifact and check it appears.

## S4.26 Artifact editor.

- **Expected:** An artifact editor lets the user edit an artifact's content directly and saves the result as a new version.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1340 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1124
- **Where to find it:** Chat > open an artifact > Edit (labels found in the code)
- **Needs:** an artifact you have generated
- **Steps:**
  1. Open an artifact in a conversation.
  2. Click "Edit" or the "Edit document" control, or pick "Edit artifact source" from its menu.
  3. Change the content and pause, then check the message "Checklist changes save as a new version when you pause."
  4. Reopen the artifact and check a new version was saved.

## S4.27 Image studio.

- **Expected:** A dedicated image studio where the user writes a prompt, picks style/size options, generates images and sees results/history in one place.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No image studio screen exists. /chat/images only redirects to Library > Images, and images are made in chat through Composer + > Create image (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx). Searched apps/web and packages/ui for 'image studio': only a test that asserts the studio is not promised (apps/web/app/features/images/page.test.tsx).
- **Needs:** a signed-in account

## S4.28 Image collection.

- **Expected:** An image collection view shows all images the user generated or uploaded, with open/download/remix actions.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:94; packages/ui/unified-chat/src/components/library/LibraryView.tsx:110; apps/web/features/library/components/LibraryView.tsx:155
- **Where to find it:** Library > Images (labels found in the code)
- **Needs:** an account with at least one generated or uploaded image
- **Steps:**
  1. Click Library in the left rail.
  2. Click the Images tab.
  3. Open the menu on one image and check that Download and Remix are offered.
  4. Compare with Expected: the images are listed with open, download and remix actions.

## S4.30 Media job history.

- **Expected:** A media job history lists image/video generation jobs with their status (queued, running, failed, done) and links to results.
- **Code:** done. Evidence present: apps/web/app/api/media/jobs/route.ts:20; apps/web/lib/server/media-job-history.ts:185; packages/ui/unified-chat/src/components/library/LibraryView.tsx:974; packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:49; apps/web/features/library/components/LibraryView.tsx:242; apps/desktop/src/features/library/DesktopLibrary.tsx:186
- **Where to find it:** Library > Generations (section above the file list) (labels found in the code)
- **Needs:** an account that has run at least one image or video generation
- **Steps:**
  1. Click Library in the left rail.
  2. Look at the Generations section at the top of the page.
  3. Check the status words on each job: Queued, Generating, Failed, Done, Cancelled.
  4. Compare with Expected: each image or video job shows its status and links to its result.

## S4.31 Notebook workspace.

- **Expected:** A notebook workspace holds a set of sources and notes that the user reads, annotates and chats over, with generated outputs (NotebookLM-style).
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSourcesPanel.tsx:20; apps/web/features/chat/pages/web-chat-layout.ts:3; apps/web/features/projects/components/ProjectStudio.tsx:37; apps/web/features/projects/components/AddSourcesModal.tsx:114
- **Where to find it:** Projects > open a project > Sources (labels found in the code)
- **Needs:** a project with at least one source
- **Steps:**
  1. Click Projects in the left rail.
  2. Open a project that has sources.
  3. Click the Sources tab.
  4. Look for the studio outputs such as Briefing doc and Study guide, then compare with Expected (sources, notes, reading and chat over them).

## S4.32 Research report reader.

- **Expected:** A research report reader lists the user's research reports and opens one with its sections and cited sources.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7873; apps/web/features/chat/components/research/ResearchReportsGallery.tsx:142; apps/web/features/chat/components/research/ResearchPanel.tsx:475
- **Where to find it:** Composer + > Deep Research (labels found in the code)
- **Needs:** a signed-in account; reports appear only after a research run
- **Steps:**
  1. Open a chat and click + in the composer.
  2. Click Deep Research.
  3. Open the Research panel and look for the reports list. An empty list shows No reports yet.
  4. Open one report and compare with Expected: its sections and cited sources are shown.

## S4.35 Skills manager.

- **Expected:** A skills manager lists installed and available skills and lets the user install, enable/disable, author and remove them.
- **Code:** done. Evidence present: apps/web/app/skills/page.tsx:44; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1407; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1508; apps/web/features/directory/services/skills-directory.ts:295
- **Earlier check in the running app:** PASS: E018 [PASS; empty-state interaction]: Personal skill manager loads with no user skills and Browse/Add controls; no installation or imported executable content used.
- **Where to find it:** Account menu > Settings > Customize > Skills (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click your account at the bottom of the left rail.
  2. Click Settings.
  3. Under Customize, click Skills.
  4. Compare with Expected: installed and available skills are listed, with controls to install, enable or disable, author and remove.

## S4.36 Plugins manager.

- **Expected:** A plugins manager lists installed and available plugins and lets the user install, configure, update and remove them.
- **Code:** done. Evidence present: apps/web/app/chat/customize/page.tsx:5; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1509; apps/web/features/directory/services/plugins-directory.ts:1433; apps/web/features/directory/services/plugins-directory.ts:1491
- **Earlier check in the running app:** PASS: E021 [PASS; empty-state interaction]: Plugin manager loads with Browse/Add and an empty installed list. No third-party software installed.
- **Where to find it:** Account menu > Settings > Customize > Plugins (labels found in the code)
- **Needs:** a signed-in account; Free accounts may see a notice instead of controls
- **Steps:**
  1. Click your account at the bottom of the left rail.
  2. Click Settings.
  3. Under Customize, click Plugins.
  4. Compare with Expected: installed and available plugins are listed, with install, configure, update and remove controls.

## S4.37 Connected accounts.

- **Expected:** A connected-accounts destination lists the third-party services the user has connected and lets them connect, reconnect and disconnect each.
- **Code:** done. Evidence moved: apps/web/app/settings/connections/page.tsx:13; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:998; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:686 (quoted code not found in the file now); apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:780 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E016 [UI_ONLY; directory UI]: After search settled, github narrowed the curated list to exactly GitHub (Showing 1 of 1). The wider directory reports 0 indexed connectors and incomplete indexing. External authorization and connection testing remain blocked by setup/permission.
- **Where to find it:** Account menu > Settings > Customize > Connectors (labels found in the code)
- **Needs:** a signed-in account; an outside account (for example GitHub) to really connect
- **Steps:**
  1. Click your account at the bottom of the left rail.
  2. Click Settings.
  3. Under Customize, click Connectors.
  4. Compare with Expected: connected services are listed, with connect, reconnect and disconnect actions.

## S4.38 Model catalog.

- **Expected:** A model catalog lists the models the user can reach with capabilities/context/price and lets them pick one or set a default.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1733; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:324; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:494; apps/web/features/models/components/ModelCard.tsx:135; apps/web/lib/server/model-catalogue.ts:242 (quoted code not found in the file now); apps/web/features/settings/sections/GeneralSection.tsx:416; apps/web/features/settings/sections/GeneralSection.tsx:416
- **Where to find it:** Composer model button > Models; then Settings > General > Default model (labels found in the code)
- **Steps:**
  1. In the composer footer, click the model name.
  2. Look at the Models list: each entry shows Context ceiling and Capabilities.
  3. Pick a model, then open Settings > General.
  4. Find Default model, set it, and compare with Expected: the catalog shows capabilities, context and price, and a default can be set.

## S4.39 Usage dashboard.

- **Expected:** A usage dashboard shows current usage against plan limits per window (session/weekly/credits), reset times and recent usage history.
- **Code:** done. Evidence moved: apps/web/app/settings/usage/page.tsx:6; apps/web/features/settings/components/WebSettingsModal.tsx:291; apps/web/features/settings/sections/UsageSection.tsx:1201; apps/web/features/settings/sections/UsageSection.tsx:218 (quoted code not found in the file now)
- **Earlier check in the running app:** PARTIAL: E009 [PARTIAL; interaction]: Usage view opens but only offers paid-plan waitlist text; no usage meter, breakdown or report is available in this Free account.
- **Where to find it:** Account menu > Settings > Usage (labels found in the code)
- **Needs:** none; a Free account may show only a paid-plan notice
- **Steps:**
  1. Click your account at the bottom of the left rail.
  2. Click Settings.
  3. Click Usage.
  4. Compare with Expected: usage against limits for each window, reset times and recent history are shown.

## S4.40 Billing settings.

- **Expected:** A billing settings destination shows the current plan, renewal, payment method and invoices, and lets the user change or cancel the plan.
- **Code:** partial. Evidence present: apps/web/features/settings/sections/BillingSection.tsx:94
- **Known to be unfinished:** live-check: with a beta_redemptions-granted test account run Stripe test checkout, then /settings/billing on web and in Electron: plan, invoices, portal (opens externally in Electron) and the overage toggle work; migration 0281 is applied
- **Earlier check in the running app:** PASS: E010 [PASS; interaction]: Billing shows current Free plan, credit-history and invoice areas. No paid invoice, purchase or payment flow exercised.
- **Where to find it:** Account menu > Settings > Billing (labels found in the code)
- **Needs:** a paid account for renewal and invoices; a Free account shows the current plan and credit history
- **Steps:**
  1. Click your account at the bottom of the left rail.
  2. Click Settings.
  3. Click Billing.
  4. Compare with Expected: the current plan, renewal date, payment and Invoices are shown.

## S4.41 Personal settings.

- **Expected:** A personal settings destination lets the signed-in user view and change their own preferences (profile, appearance, personalization, notifications) and saves them.
- **Code:** done. Evidence moved: apps/web/app/settings/general/page.tsx:6; apps/web/features/settings/sections/GeneralSection.tsx:320 (quoted code not found in the file now); apps/web/app/settings/_lib/preferences-client.ts:200
- **Earlier check in the running app:** PASS: E008 [PASS; interaction]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Account menu > Settings > General (Appearance is the next item) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click your account at the bottom of the left rail.
  2. Click Settings, then General.
  3. Change one field, for example Send with Enter, and close Settings.
  4. Reopen Settings and compare with Expected: the change is kept. Then open Appearance and check Theme.

## S4.42 Workspace administration.

- **Expected:** A workspace administration destination lets an admin manage members, roles, invitations, policies and workspace settings.
- **Code:** done. Evidence present: apps/web/features/settings/components/WebSettingsModal.tsx:272; apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:54; apps/web/app/workspace/people/page.tsx:17; apps/web/features/settings/sections/TeamSection.tsx:636
- **Earlier check in the running app:** BLOCKED: E023 [BLOCKED; plan gate]: Free account shown; workspace administration requires Team or Enterprise and at least two seats.
- **Where to find it:** Settings > Workspace (labels found in the code)
- **Needs:** a Team or Enterprise admin account with at least two seats
- **Steps:**
  1. Click your account at the bottom of the left rail.
  2. Click Settings, then Workspace.
  3. Compare with Expected: members, roles, invitations and policies are shown for an admin.
  4. A Free account is blocked and sees a plan notice.

## S4.43 Developer console.

- **Expected:** A developer console lets the user create/revoke API keys, see API usage per key, read API docs and try requests.
- **Code:** done. Evidence present: apps/web/features/settings/components/Settings/ApiKeys.tsx:257; apps/web/features/settings/components/Settings/ApiKeys.tsx:77; apps/web/app/api/developers/usage/route.ts:20; apps/web/lib/services/developer-usage-service.ts:37; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6170
- **Where to find it:** not found in the code. The developer console is the page at /developers (apps/web/app/developers/page.tsx, title Developer console). No link to it was found in the shell, the settings or the account menu. The key navDeveloperConsole exists in packages/ui/i18n/locales/en/common.json but no code uses it. Only the public /api-docs page links to /developers.
- **Needs:** a signed-in account

## S4.44 Help and feedback.

- **Expected:** A help-and-feedback destination links to help/docs/status and lets the user send product feedback or a bug report from inside the product.
- **Code:** done. Evidence present: apps/web/features/settings/components/WebSettingsModal.tsx:301; apps/web/shared/components/layout/AccountMenuItems.tsx:105; apps/web/shared/components/layout/WebAppShell.tsx:515; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:166
- **Earlier check in the running app:** PASS: E030 [PASS; scoped settings observation]: Help destination opened; ticket list later settled empty. Support, status, legal and documentation links visible; no messages sent.
- **Where to find it:** Account menu > Get help; Account menu > Send feedback; Settings > Help (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click your account at the bottom of the left rail, then Get help. Check that the help page opens.
  2. Click your account again, then Send feedback. Check that the feedback dialog opens and close it.
  3. Click Settings, then Help.
  4. Compare with Expected: Documentation, Help center, Contact support, Report a bug, Release notes and System status links are shown.
