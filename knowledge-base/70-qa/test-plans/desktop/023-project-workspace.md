---
id: "PLAN-desktop-023"
type: "test-plan"
title: "Desktop · 23. Project workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "23"
---
# Desktop · 23. Project workspace

23 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S23.01 Project creation.

- **Expected:** A signed-in user can create a named project that is saved to their account and opens as its own workspace.
- **Code:** done. Evidence present: apps/web/app/chat/projects/page.tsx:373; apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:71; apps/web/app/api/projects/route.ts:162
- **Where to find it:** Projects (sidebar) > New project > Create project (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and click Projects in the sidebar.
  2. Click New project.
  3. In the Create project dialog, type a name in Project name.
  4. Click the create button and wait for the project to open.
  5. Look: the new project opens on its own page with the name you typed, and it is listed on the Projects page.

## S23.02 Project name and description.

- **Expected:** A project has a name and an optional description that the user can set at creation and edit later.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSettingsDialog.tsx:294; apps/web/features/projects/components/ProjectSettingsDialog.tsx:189
- **Where to find it:** Projects > open a project > Project settings (labels found in the code)
- **Steps:**
  1. Open a project from the Projects page.
  2. Open the project's menu and click Project settings.
  3. Type a new name in Project name and text in Description.
  4. Save the settings and close the dialog.
  5. Look: the new name and description show on the project page and in the Projects list.

## S23.03 Project icon and color.

- **Expected:** The user can choose a project's icon and colour, and the choice is shown wherever the project appears.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ProjectGallery.tsx:313; packages/ui/unified-chat/src/components/ProjectGallery.tsx:341; packages/ui/unified-chat/src/components/ProjectCard.tsx:185
- **Where to find it:** Projects > New project > Project icon and Project colour (labels found in the code)
- **Steps:**
  1. Click Projects in the sidebar, then New project.
  2. Click the icon picker and choose an icon (control labelled Project icon).
  3. Choose a colour (control labelled Project colour).
  4. Create the project.
  5. Look: the chosen icon and colour appear on the project's card in the Projects list.

## S23.05 Project overview.

- **Expected:** Opening a project shows an overview: its name, description, counts and its main sections (chats, files, instructions).
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:1072; apps/web/app/chat/projects/[id]/page.tsx:302
- **Where to find it:** Projects > open a project (labels found in the code)
- **Needs:** a project with a few chats and files
- **Steps:**
  1. Click Projects in the sidebar and open a project.
  2. Look at the top of the page for the project name and description.
  3. Look for the tab bar labelled Project tabs with Chats, Artifacts, Work, Sources and Scheduled.
  4. Click Sources and then Chats to check that each section opens.
  5. Look: the name, description and sections match the Expected line; check whether any counts are shown.

## S23.06 Project conversations.

- **Expected:** A project lists its conversations, opens them, and starts new chats that are filed under the project.
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:1232; apps/web/app/chat/projects/[id]/page.tsx:240
- **Where to find it:** Projects > open a project > Chats (labels found in the code)
- **Needs:** a project with at least one chat
- **Steps:**
  1. Open a project and stay on the Chats tab.
  2. Look for the list of conversations and open one.
  3. Start a new chat from the project's chat box and send a message.
  4. Look: the new chat is listed under this project's Chats tab and not under other chats.

## S23.07 Project files.

- **Expected:** Users can upload files to a project, see them listed, preview/download and remove them, and project chats can use them.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now)
- **Where to find it:** Projects > open a project > Sources > Add sources > Upload (labels found in the code)
- **Needs:** a file to upload (for example a PDF or text file)
- **Steps:**
  1. Open a project and click the Sources tab.
  2. Click Add sources, then click Upload and choose a file.
  3. Wait for the upload to finish and look for the file in the list.
  4. Click the file's name to preview it, then close the preview.
  5. Click Remove file for the file and confirm; look that it leaves the list.

## S23.08 Project sources.

- **Expected:** A project's Sources tab lets the user add files, text or connected-service content that project chats use as reference.
- **Code:** partial. Evidence present: apps/web/app/api/connectors/google-drive/picker/route.ts:23
- **Known to be unfinished:** owner: set GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID (same GCP project as the Drive client; apps/web/app/api/connectors/google-drive/picker/route.ts:17); then live-check the Picker, including inside Electron
- **Where to find it:** Projects > open a project > Sources > Add sources > Google Drive (labels found in the code)
- **Needs:** a Google account connected to the Drive connector for the Google Drive step
- **Steps:**
  1. Open a project and click the Sources tab.
  2. Click Add sources and look at the choices: Upload, Google Drive and Add text.
  3. Click Add text, type some text and click Add text to save it.
  4. Look: the added text appears in the project's sources.
  5. Click Google Drive and look at what it shows (it may say it needs its connector).

## S23.09 Project instructions.

- **Expected:** Instructions saved on a project are applied to every chat in that project.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSettingsDialog.tsx:321; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855
- **Where to find it:** Projects > open a project > Project settings > Instructions (labels found in the code)
- **Steps:**
  1. Open a project and choose Project settings from its menu.
  2. Type text in the Instructions box and save.
  3. Close the dialog, click the Chats tab and start a new chat in the project.
  4. Ask a simple question and look: the reply follows the instructions.

## S23.11 Project Memory.

- **Expected:** A project keeps its own memories, and the user can choose whether the project also draws on account-wide memory.
- **Code:** done. Evidence present: packages/contracts/cloud-contracts/src/projects.ts:45; apps/web/features/projects/services/managed-cloud-projects.ts:30
- **Where to find it:** Projects > open a project > Project settings > Memory (labels found in the code)
- **Needs:** a signed-in account with cloud memory ready
- **Steps:**
  1. Open a project and choose Project settings from its menu.
  2. Scroll to the Memory section and click Add a memory only this project uses.
  3. Type a memory and save it.
  4. Look: the memory is listed under the project's memories.
  5. Turn off Use memories from outside this project and look at the helper text under it.

## S23.12 Project artifacts.

- **Expected:** A project shows the artifacts produced in its chats, and each opens from there.
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:1316; apps/web/features/chat/hooks/use-artifact-index.ts:77
- **Where to find it:** Projects > open a project > Artifacts (labels found in the code)
- **Needs:** a chat in the project that has produced an artifact
- **Steps:**
  1. Open a project that has a chat which produced an artifact (for example ask for a document).
  2. Click the Artifacts tab.
  3. Look for the artifact in the list.
  4. Click the artifact and look: it opens from the project.

## S23.14 Project work tasks.

- **Expected:** Autonomous work tasks can be started in a project and the project lists their state.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectWorkPanel.tsx:55
- **Where to find it:** Projects > open a project > Work (labels found in the code)
- **Needs:** a project with a chat that can run Work
- **Steps:**
  1. Open a project and click the Work tab.
  2. Look for the list of Work runs, or the message that says to switch a chat to Work to see its runs.
  3. Start a work task from a chat in this project (the way to switch a chat to Work was not confirmed in code).
  4. Return to the Work tab and look at the task's state.

## S23.15 Project routines.

- **Expected:** Scheduled routines can be created inside a project and are listed on the project.
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:1345; apps/web/features/schedules/components/SchedulesPage.tsx:449
- **Where to find it:** Projects > open a project > Scheduled (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open a project and click the Scheduled tab.
  2. Look for scheduled routines listed for this project.
  3. Use the create control for a routine on this tab (its exact label was not found).
  4. Look: the new routine is listed on the project's Scheduled tab.

## S23.16 Default model/profile.

- **Expected:** A project can set a default model (or profile) that new chats in it start with.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectDefaultModelField.tsx:53; apps/web/features/chat/pages/WebChatPage.tsx:2141
- **Where to find it:** Projects > open a project > Project settings > Default model (labels found in the code)
- **Steps:**
  1. Open a project and choose Project settings from its menu.
  2. Find the Default model field and choose a model.
  3. Save the settings.
  4. Start a new chat in the project.
  5. Look: the new chat starts with the model you chose.

## S23.20 Project search.

- **Expected:** Users can search their projects by name or description.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ProjectGallery.tsx:247; packages/ui/unified-chat/src/components/ProjectGallery.tsx:118
- **Where to find it:** Projects (sidebar) > search box (labels found in the code)
- **Needs:** several projects, one with a description
- **Steps:**
  1. Click Projects in the sidebar and make sure you have several projects.
  2. Click the box labelled Search projects... and type part of a project name.
  3. Look: only matching projects stay in the list.
  4. Type a word from a project's description and look whether it matches.

## S23.21 Project members.

- **Expected:** A project shows who can access it (owner and members) and a member can see a project is shared with them.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSharingControls.tsx:175; apps/web/features/projects/components/ProjectShareDialog.tsx:86; apps/web/app/api/settings/organization/shared/route.ts:98
- **Where to find it:** Projects > open a project > Share > (member list) (labels found in the code)
- **Needs:** a second account in the same workspace
- **Steps:**
  1. Open a project and click Share from its menu.
  2. Look at the sharing dialog for the owner and the list of people with access.
  3. Sign in as a second account in the same workspace and look at the project list.
  4. Open the shared project and look for the Shared with you label.

## S23.22 Member roles.

- **Expected:** Project members hold distinct roles (owner, can edit, can view, no access) that the server enforces.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/OrganizationSharingSection.tsx:317 (quoted code not found in the file now); apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:154; apps/web/lib/services/org-sharing-service.ts:295; apps/web/app/api/projects/[id]/route.ts:261
- **Where to find it:** Projects > open a project > Share > member role (labels found in the code)
- **Needs:** a second account in the same workspace
- **Steps:**
  1. Open a project shared with a second account and click Share.
  2. Open the access choice for a member.
  3. Look at the choices: Can view, Can edit and No access.
  4. Set a role, then sign in as that member and check what they can do.

## S23.23 Invite and remove members.

- **Expected:** An owner or manager can add a person to a specific project and remove them from it.
- **Code:** done. Evidence moved: apps/web/db/neon/0315_private_shared_projects.sql:41; apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:83; apps/web/features/projects/components/ProjectShareDialog.tsx:120 (quoted code not found in the file now); apps/web/lib/services/org-sharing-service.ts:198
- **Where to find it:** Projects > open a project > Share > Add people (labels found in the code)
- **Needs:** an owner account and a second account in the same workspace
- **Steps:**
  1. Open a project and click Share.
  2. Click Add people and choose a person in the workspace.
  3. Look: the person appears in the member list with a role.
  4. Remove the person from the project (the remove control was not located in code) and look that they lose access.

## S23.24 Shared Project links.

- **Expected:** A user can get a link to a project that opens it for the people it is shared with.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectShareDialog.tsx:103; apps/web/features/projects/components/ProjectShareDialog.tsx:163; apps/web/app/chat/projects/[id]/page.tsx:623; apps/web/app/chat/projects/page.tsx:516
- **Where to find it:** Projects > project card menu > Share > Copy link (labels found in the code)
- **Needs:** an owner account and a second account in the same workspace
- **Steps:**
  1. On the Projects page, open a project card's menu and click Share.
  2. Click Copy link in the dialog.
  3. Open the copied link in a new private window signed in as a shared member.
  4. Look: the project opens for that member.

## S23.29 Duplicate a Project.

- **Expected:** A project owner can duplicate a project, getting a copy with its settings, instructions and files.
- **Code:** done. Evidence present: apps/web/app/api/projects/[id]/duplicate/route.ts:72
- **Where to find it:** Projects > open a project > Project settings > Duplicate (labels found in the code)
- **Needs:** a project owner account
- **Steps:**
  1. Open a project as its owner and choose Project settings from its menu.
  2. Click Duplicate.
  3. Look: a copy appears in the Projects list.
  4. Open the copy and check its settings, instructions and files.

## S23.30 Archive and restore.

- **Expected:** A project can be archived out of the active list and restored later with its contents intact.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/route.ts:246 (quoted code not found in the file now)
- **Where to find it:** Projects > project card menu > Archive; then Archived (n) > Unarchive (labels found in the code)
- **Needs:** a project to archive
- **Steps:**
  1. On the Projects page, open a project card's menu and click Archive.
  2. Look: the project leaves the active list.
  3. Click the Archived button at the top of the page.
  4. Click Unarchive on the project and look: it returns to the active list with its chats and files.

## S23.32 Delete.

- **Expected:** A project owner can delete a project after confirming; its files are removed and its chats are kept (unfiled).
- **Code:** done. Evidence moved: apps/web/features/projects/components/ProjectSettingsDialog.tsx:231; packages/ui/unified-chat/src/components/ProjectCard.tsx:327; apps/web/app/chat/projects/page.tsx:144; apps/web/app/api/projects/[id]/route.ts:326 (quoted code not found in the file now)
- **Where to find it:** Projects > project card menu > Delete; or Projects > open a project > Project settings > Delete project (labels found in the code)
- **Needs:** a project owner account and a project you can delete
- **Steps:**
  1. Open a project's menu and click Delete (or use Delete project in Project settings).
  2. Read the confirmation dialog and check what it says about files and chats.
  3. Confirm the deletion.
  4. Look: the project is gone, and its chats still appear (not in a project).

## S23.33 Project-only context mode.

- **Expected:** A user can switch a project to use only its own context (its memories, chats and files), excluding account-wide memory and other chats.
- **Code:** done. Evidence present: packages/contracts/cloud-contracts/src/projects.ts:45; apps/web/features/projects/services/managed-cloud-projects.ts:30
- **Where to find it:** Projects > open a project > Project settings > Memory > Use memories from outside this project (labels found in the code)
- **Needs:** a signed-in account with some account-wide memories
- **Steps:**
  1. Open a project and choose Project settings from its menu.
  2. Find the Memory section and turn off Use memories from outside this project.
  3. Save and start a new chat in the project.
  4. Look at the helper text: it says chats here use only this project's memories.

## S23.34 Shared versus personal-context explanation.

- **Expected:** Where a project is shared, the product explains which context is shared with members (instructions, files) and which stays personal (chats, memories).
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:1030
- **Where to find it:** Projects > open a shared project (as a member) (labels found in the code)
- **Needs:** a second account in the same workspace and a project shared with it
- **Steps:**
  1. Sign in as a member of a project shared with you and open it from the Projects page.
  2. Look for the Shared with you label under the project name.
  3. Read the explanation under it.
  4. Look: it says instructions and files are shared, and chats and memories stay private.
