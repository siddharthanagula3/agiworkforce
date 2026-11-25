---
id: "PLAN-web-023"
type: "test-plan"
title: "Web · 23. Project workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "23"
---
# Web · 23. Project workspace

23 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S23.01 Project creation.

- **Expected:** A signed-in user can create a named project that is saved to their account and opens as its own workspace.
- **Code:** done. Evidence moved: apps/web/app/chat/projects/page.tsx:373; apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:71; apps/web/app/api/projects/route.ts:162; apps/web/app/api/projects/route.ts:199 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E031 [PASS; create and read result]: Created Browser QA, Live computer use. Empty name prevented submission; named project appears in index. Project ID 8ba08c3b-2c80-4d10-a5af-0c6702ec1496. Description not tested.
- **Where to find it:** Sidebar > Projects > New project > Project name > Create project (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click Projects in the left sidebar.
  2. Click New project.
  3. Type a name in the Project name box. Leave it empty first and check that submitting does nothing.
  4. Click Create project (or press Enter in the name box).
  5. Check that the new project opens as its own page with that name shown.

## S23.02 Project name and description.

- **Expected:** A project has a name and an optional description that the user can set at creation and edit later.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:186; apps/web/features/projects/components/ProjectSettingsDialog.tsx:294; apps/web/features/projects/components/ProjectSettingsDialog.tsx:189; apps/web/app/api/projects/[id]/route.ts:191
- **Earlier check in the running app:** PASS: E031 [PASS; create and read result]: Created Browser QA, Live computer use. Empty name prevented submission; named project appears in index. Project ID 8ba08c3b-2c80-4d10-a5af-0c6702ec1496. Description not tested. | E033 [PASS; save and reload persistence]: Initial attempt interrupted by localhost server exit; retry saved successfully. Reload and reopen preserved description and PROJECT_QA_7391 instructions. Supersedes E032 pending-save result.
- **Where to find it:** Projects > New project > Description (at creation); later Projects > open a project > Project options > Project settings (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. At creation, type a name and a Description, then click Create project.
  2. Open the project, click the Project options button (top right of the project page).
  3. Click Project settings and change the name or description.
  4. Save, reload the page, and check the new name and description are still shown.

## S23.03 Project icon and color.

- **Expected:** The user can choose a project's icon and colour, and the choice is shown wherever the project appears.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ProjectGallery.tsx:313; packages/ui/unified-chat/src/components/ProjectGallery.tsx:341; packages/ui/unified-chat/src/components/ProjectCard.tsx:185
- **Earlier check in the running app:** UI_ONLY: E031 [UI_ONLY; emoji picker control]: Created Browser QA, Live computer use. Empty name prevented submission; named project appears in index. Project ID 8ba08c3b-2c80-4d10-a5af-0c6702ec1496. Description not tested.
- **Where to find it:** Projects > New project > icon button beside the name; later open a project and use its icon and colour control (labels found in the code)
- **Steps:**
  1. Click New project and click the icon button next to the Project name box to open the icon list.
  2. Pick an icon, then pick a colour swatch.
  3. Click Create project.
  4. Look at the project card in the Projects list and at the project page header; both should show the chosen icon and colour.

## S23.05 Project overview.

- **Expected:** Opening a project shows an overview: its name, description, counts and its main sections (chats, files, instructions).
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:1072; apps/web/app/chat/projects/[id]/page.tsx:53; apps/web/app/chat/projects/[id]/page.tsx:302; apps/web/app/api/projects/[id]/route.ts:106
- **Earlier check in the running app:** PASS: E033 [PASS; save and reload persistence]: Initial attempt interrupted by localhost server exit; retry saved successfully. Reload and reopen preserved description and PROJECT_QA_7391 instructions. Supersedes E032 pending-save result.
- **Where to find it:** Projects > click a project card (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click Projects in the sidebar, then click a project card.
  2. Look at the page title and the description under it.
  3. Look at the tabs: Chats, Artifacts, Work, Sources, Scheduled.
  4. Compare with Expected: name, description, counts and the main sections.

## S23.06 Project conversations.

- **Expected:** A project lists its conversations, opens them, and starts new chats that are filed under the project.
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:1213; apps/web/app/chat/projects/[id]/page.tsx:1232; apps/web/app/chat/projects/[id]/page.tsx:240; apps/web/lib/hooks/useConversations.ts:1031
- **Earlier check in the running app:** PASS: E043 [PASS; move and read result]: Moved only the synthetic ordinary conversation into QA project; project Chats lists it alongside project-context test. Copy-to-project not tested.
- **Where to find it:** Projects > open a project > Chats tab (labels found in the code)
- **Needs:** a signed-in account with a chat that can generate
- **Steps:**
  1. Open a project and stay on the Chats tab.
  2. Check the list of conversations; click one to open it.
  3. Type in the box that says 'New chat in <project name>' and send a message.
  4. Go back to the project's Chats tab and check the new chat is listed.

## S23.07 Project files.

- **Expected:** Users can upload files to a project, see them listed, preview/download and remove them, and project chats can use them.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now)
- **Earlier check in the running app:** BLOCKED: E034 [BLOCKED; actual upload attempted]: Picked synthetic browser-qa-reference.txt. Upload progress appeared then explicit subscription error: current plan does not include project knowledge storage. No file was stored.
- **Where to find it:** Projects > open a project > Sources tab (labels found in the code)
- **Needs:** a paid account with project knowledge storage (a Free account is blocked) and a file to upload
- **Steps:**
  1. Open a project and click the Sources tab.
  2. Find the upload control in the Sources panel and choose a small text file.
  3. Check the file appears in the list with a Preview button and a Remove button.
  4. Preview and then remove it, and check the list updates.

## S23.08 Project sources.

- **Expected:** A project's Sources tab lets the user add files, text or connected-service content that project chats use as reference.
- **Code:** partial. Evidence present: apps/web/app/api/connectors/google-drive/picker/route.ts:23
- **Known to be unfinished:** owner: set GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID (same GCP project as the Drive client; apps/web/app/api/connectors/google-drive/picker/route.ts:17); then live-check the Picker, including inside Electron
- **Earlier check in the running app:** BLOCKED: E046 [UI_ONLY; Project Sources entry and empty state]: Read-only project tab inspection. | E048 [BLOCKED; save attempted]: Synthetic Browser QA reference note entered and submitted. Save returned project knowledge storage plan gate; text retained, no note stored.
- **Where to find it:** Projects > open a project > Sources tab (labels found in the code)
- **Needs:** a paid account; for Google Drive the owner must set the Picker keys
- **Steps:**
  1. Open a project and click the Sources tab.
  2. Look for the add-source options (files, text, Google Drive).
  3. Try adding a Google Drive file if the picker is shown.
  4. Check the added source appears in the Sources list.

## S23.09 Project instructions.

- **Expected:** Instructions saved on a project are applied to every chat in that project.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSettingsDialog.tsx:321; apps/web/features/projects/components/ProjectSettingsDialog.tsx:178; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855; apps/web/lib/services/project-context-service.ts:606
- **Earlier check in the running app:** PASS: E033 [PASS; save and reload persistence]: Initial attempt interrupted by localhost server exit; retry saved successfully. Reload and reopen preserved description and PROJECT_QA_7391 instructions. Supersedes E032 pending-save result.
- **Where to find it:** Projects > open a project > Project options > Project settings > Instructions (labels found in the code)
- **Needs:** a signed-in account and a chat that can generate
- **Steps:**
  1. Open a project, click Project options, then Project settings.
  2. Type text in the Instructions box and save.
  3. Reload, reopen Project settings and check the text is kept.
  4. Start a new chat in this project, ask a question the instruction would change, and compare the answer.

## S23.11 Project Memory.

- **Expected:** A project keeps its own memories, and the user can choose whether the project also draws on account-wide memory.
- **Code:** done. Evidence present: packages/contracts/cloud-contracts/src/projects.ts:45; apps/web/features/projects/services/managed-cloud-projects.ts:30
- **Earlier check in the running app:** UI_ONLY: E032 [UI_ONLY; settings controls]: Save remained disabled with no success or error, and knowledge files remained Loading across repeated settled observations. Next check reload persistence.
- **Where to find it:** Projects > open a project > Project options > Project settings > Memory (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Project settings and find the Memory section.
  2. Tick or untick 'Use memories from outside this project'.
  3. Save, reload and reopen Project settings.
  4. Check the box state and the explanation text under it are kept.

## S23.12 Project artifacts.

- **Expected:** A project shows the artifacts produced in its chats, and each opens from there.
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:1316; apps/web/features/projects/components/ProjectArtifactsPanel.tsx:28; apps/web/features/chat/hooks/use-artifact-index.ts:77
- **Earlier check in the running app:** UI_ONLY: E044 [UI_ONLY; Project Artifacts tab empty state]: Read-only project tab inspection.
- **Where to find it:** Projects > open a project > Artifacts tab (labels found in the code)
- **Needs:** a signed-in account with a chat that can make an artifact
- **Steps:**
  1. Open a project and click the Artifacts tab.
  2. Check the list of artifacts, or the empty state if none.
  3. Create an artifact in a chat in this project, then return to the Artifacts tab.
  4. Click the artifact and check it opens.

## S23.14 Project work tasks.

- **Expected:** Autonomous work tasks can be started in a project and the project lists their state.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectWorkPanel.tsx:55
- **Earlier check in the running app:** UI_ONLY: E045 [UI_ONLY; Project Work tab empty state]: Read-only project tab inspection.
- **Where to find it:** Projects > open a project > Work tab (labels found in the code)
- **Needs:** a paid plan that allows Work
- **Steps:**
  1. Open a project and click the Work tab.
  2. Read the empty-state text.
  3. Switch a chat in the project to Work and run a task.
  4. Return to the Work tab and check the run is listed with its state.

## S23.15 Project routines.

- **Expected:** Scheduled routines can be created inside a project and are listed on the project.
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:1345; apps/web/features/schedules/components/SchedulesPage.tsx:449; apps/web/features/schedules/components/SchedulesPage.tsx:337
- **Earlier check in the running app:** BLOCKED: E047 [BLOCKED; Project schedules require Basic or higher]: Read-only project tab inspection.
- **Where to find it:** Projects > open a project > Scheduled tab (labels found in the code)
- **Needs:** a paid plan (Basic or higher); earlier run was blocked by the plan gate
- **Steps:**
  1. Open a project and click the Scheduled tab.
  2. Click the control that creates a routine or scheduled task.
  3. Fill it in and save.
  4. Check the new routine is listed on the project's Scheduled tab.

## S23.16 Default model/profile.

- **Expected:** A project can set a default model (or profile) that new chats in it start with.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectDefaultModelField.tsx:53; apps/web/features/chat/pages/WebChatPage.tsx:2141
- **Where to find it:** Projects > open a project > Project options > Project settings > Default model (labels found in the code)
- **Needs:** a signed-in account; the chosen model must be allowed on the plan
- **Steps:**
  1. Open Project settings.
  2. Find the Default model field and choose a model.
  3. Save, then start a new chat inside the project.
  4. Check the new chat's model selector shows the chosen default.

## S23.20 Project search.

- **Expected:** Users can search their projects by name or description.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ProjectGallery.tsx:247; packages/ui/unified-chat/src/components/ProjectGallery.tsx:118; apps/web/app/chat/projects/page.tsx:373
- **Where to find it:** Projects (sidebar) > search box at the top of the Projects page (labels found in the code)
- **Needs:** at least two projects with different names and descriptions
- **Steps:**
  1. Click Projects in the sidebar.
  2. Click the search box with the placeholder 'Search projects...'.
  3. Type part of a project's name, then part of its description.
  4. Check that only matching projects stay in the list.

## S23.21 Project members.

- **Expected:** A project shows who can access it (owner and members) and a member can see a project is shared with them.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSharingControls.tsx:175; apps/web/features/projects/components/ProjectShareDialog.tsx:86; apps/web/app/api/settings/organization/shared/route.ts:98
- **Where to find it:** Projects > open a project > Project options > Share (labels found in the code)
- **Needs:** a team workspace and a second account in it
- **Steps:**
  1. Open a project in a team workspace and click Project options, then Share.
  2. Read the dialog title 'Share <project name>' and the list of people.
  3. Check the owner is shown with the detail 'Owner'.
  4. Sign in as a second member and open the same project; check it appears as shared with you.

## S23.22 Member roles.

- **Expected:** Project members hold distinct roles (owner, can edit, can view, no access) that the server enforces.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/OrganizationSharingSection.tsx:317 (quoted code not found in the file now); apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:154; apps/web/lib/services/org-sharing-service.ts:295; apps/web/app/api/projects/[id]/route.ts:261; apps/web/lib/services/org-sharing-service.ts:146 (quoted code not found in the file now)
- **Where to find it:** Projects > open a project > Project options > Share > access dropdown next to a member (labels found in the code)
- **Needs:** two accounts in the same workspace with different roles
- **Steps:**
  1. Open Share for a shared project as the owner.
  2. Change a member's access between Can view, Can edit and No access.
  3. As that member, try to edit the project's instructions and try to view it.
  4. Check the owner and member see what the role allows and that the server refuses edits from a view-only member.

## S23.23 Invite and remove members.

- **Expected:** An owner or manager can add a person to a specific project and remove them from it.
- **Code:** done. Evidence moved: apps/web/db/neon/0315_private_shared_projects.sql:41; apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:83; apps/web/features/projects/components/ProjectShareDialog.tsx:120 (quoted code not found in the file now); apps/web/lib/services/org-sharing-service.ts:198
- **Where to find it:** Projects > open a project > Project options > Share > Add people (labels found in the code)
- **Needs:** an owner or manager account and a second member account
- **Steps:**
  1. Open Share as the owner or a manager.
  2. Click Add people and pick a workspace member.
  3. Check the person appears in the list with a role.
  4. Set that person to No access to remove them from the project, then check they lose it.

## S23.24 Shared Project links.

- **Expected:** A user can get a link to a project that opens it for the people it is shared with.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectShareDialog.tsx:103; apps/web/features/projects/components/ProjectShareDialog.tsx:163; apps/web/app/chat/projects/[id]/page.tsx:623; apps/web/app/chat/projects/page.tsx:516
- **Where to find it:** Projects > open a project > Project options > Share > Copy link (labels found in the code)
- **Needs:** a team workspace and a second account in it
- **Steps:**
  1. Open a shared project as the owner and click Project options, then Share.
  2. Click Copy link.
  3. Open the copied link in a private window signed in as a shared member.
  4. Check the project opens for that member.

## S23.29 Duplicate a Project.

- **Expected:** A project owner can duplicate a project, getting a copy with its settings, instructions and files.
- **Code:** done. Evidence present: apps/web/app/api/projects/[id]/duplicate/route.ts:72
- **Earlier check in the running app:** UI_ONLY: E032 [UI_ONLY; settings controls]: Save remained disabled with no success or error, and knowledge files remained Loading across repeated settled observations. Next check reload persistence.
- **Where to find it:** Projects > open a project > Project options > Project settings > Duplicate (labels found in the code)
- **Needs:** a project owner; file copy needs a plan with project knowledge storage
- **Steps:**
  1. Open Project settings as the project owner.
  2. Click Duplicate.
  3. Wait until the button stops showing 'Duplicating…'.
  4. Check the copy appears in the Projects list with the same instructions and settings, and that its files are copied too.

## S23.30 Archive and restore.

- **Expected:** A project can be archived out of the active list and restored later with its contents intact.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/route.ts:246 (quoted code not found in the file now)
- **Where to find it:** Projects > card menu (More) > Archive; then Show archived toggle > Unarchive (labels found in the code)
- **Needs:** a signed-in account with a project
- **Steps:**
  1. On the Projects page, open a project card's menu and click Archive.
  2. Check the project leaves the active list.
  3. Click the toggle that shows 'Archived (<n>)' and find the project.
  4. Click Unarchive and check the project is back in the active list with its chats and files still there.

## S23.32 Delete.

- **Expected:** A project owner can delete a project after confirming; its files are removed and its chats are kept (unfiled).
- **Code:** done. Evidence moved: apps/web/features/projects/components/ProjectSettingsDialog.tsx:231; packages/ui/unified-chat/src/components/ProjectCard.tsx:327; apps/web/app/chat/projects/page.tsx:458; apps/web/app/chat/projects/page.tsx:144; apps/web/app/api/projects/[id]/route.ts:326 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E032 [UI_ONLY; settings controls]: Save remained disabled with no success or error, and knowledge files remained Loading across repeated settled observations. Next check reload persistence.
- **Where to find it:** Projects > card menu (More) > Delete > confirm Delete; or Project options > Project settings > Delete project? (labels found in the code)
- **Needs:** a project owner and a test project
- **Steps:**
  1. On the Projects page, open a project card's menu and click Delete.
  2. Read the confirmation 'Delete "<name>"?' and click Delete to confirm.
  3. Check the project is gone from the Projects list.
  4. Open an existing chat that was in the project and check it still exists and is no longer filed under the project.

## S23.33 Project-only context mode.

- **Expected:** A user can switch a project to use only its own context (its memories, chats and files), excluding account-wide memory and other chats.
- **Code:** done. Evidence present: packages/contracts/cloud-contracts/src/projects.ts:45; apps/web/features/projects/services/managed-cloud-projects.ts:30
- **Earlier check in the running app:** BLOCKED: E037 [BLOCKED; live generation error]: Plain text project question with no attachments failed: QwenCloud free models answer text prompts in Chat; turn off tools/remove attachments. Could not verify project instruction influence. Error restored text to composer and Retry offered; details panel shows failed state. | E038 [BLOCKED; project generation gate]: Retried same turn with OpenRouter Free Auto: alert says AGI Work requires Pro or higher. Transcript and details retain prior Qwen error, creating inconsistent failure explanation. Project chat creation succeeded, generation blocked.
- **Where to find it:** Projects > open a project > Project options > Project settings > Memory and Personalization (labels found in the code)
- **Needs:** a signed-in account with some account-wide memories and chats
- **Steps:**
  1. Open Project settings.
  2. Untick 'Use memories from outside this project' and untick 'Use your profile and instructions for AGI'.
  3. Save and reopen Project settings.
  4. Ask a project chat a question about a memory or chat from outside the project, and check the answer does not use it.

## S23.34 Shared versus personal-context explanation.

- **Expected:** Where a project is shared, the product explains which context is shared with members (instructions, files) and which stays personal (chats, memories).
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:1030
- **Earlier check in the running app:** UI_ONLY: E032 [UI_ONLY; settings controls]: Save remained disabled with no success or error, and knowledge files remained Loading across repeated settled observations. Next check reload persistence.
- **Where to find it:** Projects > open a project shared with you (you are a member) > read the line under the title (labels found in the code)
- **Needs:** a second account and a project shared with it
- **Steps:**
  1. Sign in as a member of a team workspace and open a project shared with you.
  2. Look for the label 'Shared with you' next to the title.
  3. Read the line under the title: instructions and files are shared, your chats and memories stay private.
  4. Compare with Expected; then open the owner's view and check the explanation is not shown there.
