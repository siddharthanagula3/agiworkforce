---
id: "PLAN-mobile-023"
type: "test-plan"
title: "Mobile · 23. Project workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "23"
---
# Mobile · 23. Project workspace

11 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S23.01 Project creation.

- **Expected:** A signed-in user can create a named project that is saved to their account and opens as its own workspace.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/projects.tsx:441; apps/mobile/app/(app)/(tabs)/projects.tsx:186 (quoted code not found in the file now); apps/mobile/src/features/projects/store.ts:416; apps/web/app/api/projects/sync/route.ts:104
- **Where to find it:** Drawer (menu button, top left) > Projects > New project (bottom pill). Fill Name, then tap Create project. (labels found in the code)
- **Needs:** a signed-in account to save to the account; the project must appear after a sync
- **Steps:**
  1. Sign in and open the menu button at the top left, then tap Projects.
  2. Tap the New project pill at the bottom of the screen (or Create Project on the empty screen).
  3. Type a name in the Name field. The Create project button stays grey until a name is typed.
  4. Tap Create project.
  5. Look for the new project card in the Projects list, and compare with Expected. The code closes the sheet and does not open the new project by itself, so tap the card to open it as its own workspace.

## S23.02 Project name and description.

- **Expected:** A project has a name and an optional description that the user can set at creation and edit later.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/projects.tsx:232 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/projects.tsx:548 (quoted code not found in the file now); apps/mobile/src/features/projects/store.ts:447
- **Where to find it:** Projects > long-press a project card > Edit project. Or open the project and use the More project actions button (three dots, top right) > Edit project. (labels found in the code)
- **Needs:** a project you can edit (not archived or shared with you)
- **Steps:**
  1. Open Projects and press and hold a project card.
  2. Tap Edit project in the menu that opens.
  3. Change the Name, and type or change the Description. The Description field is optional.
  4. Tap Save project.
  5. Check the card in the Projects list (or the project header) shows the new name and description, as Expected says.

## S23.03 Project icon and color.

- **Expected:** The user can choose a project's icon and colour, and the choice is shown wherever the project appears.
- **Code:** done. Evidence moved: apps/mobile/src/features/projects/components/CloudProjectOverview.tsx:177; apps/mobile/src/features/projects/components/ProjectCard.tsx:30; apps/mobile/src/features/projects/service.ts:66 (quoted code not found in the file now)
- **Where to find it:** Projects > open a cloud project > tap the coloured project icon at the top left of the project header. The sheet shows Icon and Colour. (labels found in the code)
- **Needs:** a cloud project on a signed-in account (Cloud mode)
- **Steps:**
  1. Open Projects and tap a cloud project card.
  2. Tap the coloured icon at the top left of the header.
  3. In the sheet, tap a different Colour swatch, then tap a different icon under Icon.
  4. Close the sheet and look at the header icon. Then go back to Projects and check the card shows the same icon and colour, as Expected says.

## S23.05 Project overview.

- **Expected:** Opening a project shows an overview: its name, description, counts and its main sections (chats, files, instructions).
- **Code:** done. Evidence present: apps/mobile/src/features/projects/components/CloudProjectOverview.tsx:68; apps/mobile/src/features/projects/components/CloudProjectOverview.tsx:132
- **Where to find it:** Projects > tap a project card. The header shows the name, description and a line with chat and file counts; the tabs below are Chats, Work, Sources (and Artifacts, Routines on cloud projects). (labels found in the code)
- **Needs:** a project that has at least one chat or file (for counts)
- **Steps:**
  1. Open Projects and tap a project card.
  2. Look at the top header: the project name, then the description under it if one was set.
  3. Read the grey line under the description, which shows chat and file counts and Last used.
  4. Look at the tab row (Chats, Work, Sources) and tap Sources, then Chats to check the sections are there.

## S23.06 Project conversations.

- **Expected:** A project lists its conversations, opens them, and starts new chats that are filed under the project.
- **Code:** done. Evidence moved: apps/mobile/src/features/projects/components/ProjectChatsTab.tsx:110; apps/mobile/src/features/projects/components/ProjectChatsTab.tsx:71; apps/mobile/src/features/projects/components/ProjectChatsTab.tsx:86 (quoted code not found in the file now)
- **Where to find it:** Projects > tap a project card > Chats tab > New chat. Existing chats are listed in the same tab. (labels found in the code)
- **Needs:** a project with chats; a second chat is useful
- **Steps:**
  1. Open Projects and tap a project card, then stay on the Chats tab.
  2. Look for the list of chats. If there are none, the empty text says No chats yet.
  3. Tap a chat row to open it, then go back.
  4. Tap New chat, send a message, then go back to the project and check the new chat is listed under the project.

## S23.07 Project files.

- **Expected:** Users can upload files to a project, see them listed, preview/download and remove them, and project chats can use them.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now)
- **Where to find it:** Projects > tap a project card > Sources tab > Add sources. Tap a file row to preview it. The remove icon on a row deletes it. (labels found in the code)
- **Needs:** a file to upload; a signed-in account for cloud projects
- **Steps:**
  1. Open Projects, tap a project card, then tap the Sources tab.
  2. Tap Add sources and pick a file from the document picker.
  3. Wait for the file row to appear in the list (it may show an indexing state).
  4. Tap the file row to preview it, then check the preview shows the file.
  5. Tap the trash icon on the row and confirm Remove, then check the file is gone from the list.

## S23.08 Project sources.

- **Expected:** A project's Sources tab lets the user add files, text or connected-service content that project chats use as reference.
- **Code:** partial. Evidence present: apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx:607
- **Known to be unfinished:** owner: files and text work on the phone; a Google Drive source waits on the owner's Google connector keys (Drive entry and GOOGLE_PICKER_API_KEY/APP_ID). Plan storage caps come from knowledgeStorageBytes in the billing catalog, which Team seats share as the team allowance (billing-catalog.ts:619, :693).
- **Where to find it:** Projects > tap a project card > Sources tab > Add sources (files) or Add text (typed text). (labels found in the code)
- **Needs:** a file to upload; a signed-in account for cloud projects
- **Steps:**
  1. Open Projects, tap a project card, then tap the Sources tab.
  2. Tap Add text, type a Title and some content, then tap Add.
  3. Check a new row appears in the Sources list with that title.
  4. Tap Add sources and add a file, then check it appears too.
  5. Check whether any Google Drive or connected-service option appears on the Sources screen (expected to be missing for now).

## S23.09 Project instructions.

- **Expected:** Instructions saved on a project are applied to every chat in that project.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/projects.tsx:565 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2773; apps/mobile/services/cloudSyncEngine.ts:786
- **Where to find it:** Projects > tap a project card > Instructions (the button under the header, next to the quick actions). Type in the box, then tap the check button at the top right. (labels found in the code)
- **Needs:** a project you can edit (not archived or shared with you)
- **Steps:**
  1. Open Projects and tap a project card.
  2. Tap Instructions under the project header.
  3. Type an instruction, such as a short style rule, then tap the check button at the top right to save.
  4. Reopen Instructions and check the text is still there.
  5. Open Chats > New chat in this project, ask a question, and check the reply follows the instruction as Expected says.

## S23.14 Project work tasks.

- **Expected:** Autonomous work tasks can be started in a project and the project lists their state.
- **Code:** done. Evidence present: apps/mobile/app/(app)/projects/[id].tsx:548; apps/mobile/src/features/projects/components/ProjectWorkTab.tsx:48; apps/mobile/src/features/tasks/components/StartWorkSheet.tsx:192
- **Where to find it:** AGI Work (in the drawer, under Projects; it may sit under More) > New task. Choose a project under Project (optional), fill the goal, then tap Start task. The project's Work tab lists its runs. (labels found in the code)
- **Needs:** a cloud account on a plan that includes AGI Work (the page says so if not)
- **Steps:**
  1. Open the menu button at the top left, then tap AGI Work (tap More if it is not shown).
  2. Tap New task (the floating button), and pick a project under Project (optional).
  3. Type a goal and tap Start task.
  4. Open Projects, tap the project, then tap the Work tab.
  5. Look for the new run in the Work list and its state, and compare with Expected. If the list is empty it says No work yet.

## S23.20 Project search.

- **Expected:** Users can search their projects by name or description.
- **Code:** done. Evidence present: apps/mobile/app/(app)/(tabs)/projects.tsx:451; apps/mobile/app/(app)/(tabs)/projects.tsx:162
- **Where to find it:** Projects (drawer) > Search projects bar at the bottom of the list. Type part of a name or description. (labels found in the code)
- **Needs:** a few projects with different names and descriptions
- **Steps:**
  1. Open Projects and make sure you have at least two projects with different names.
  2. Tap the Search projects bar at the bottom and type part of one project's name. Check only that project stays in the list.
  3. Clear the search and type a word that appears only in a project's description. Check that project appears.
  4. Type a word that matches nothing. Check the text No matches appears.

## S23.32 Delete.

- **Expected:** A project owner can delete a project after confirming; its files are removed and its chats are kept (unfiled).
- **Code:** done. Evidence moved: apps/web/app/api/projects/sync/route.ts:212 (quoted code not found in the file now); apps/web/lib/server/project-deletion.ts:93
- **Where to find it:** Projects > tap and hold a project card > Delete. Or open the project, tap More project actions (three dots, top right) > Delete. Confirm with Delete. (labels found in the code)
- **Needs:** a project you own, and a test chat inside it
- **Steps:**
  1. Note the project name and open its Chats tab to note a chat in it.
  2. Open Projects, press and hold the project card, then tap Delete.
  3. Read the Delete project? message, then tap Cancel first to check Cancel keeps the project.
  4. Repeat, and tap Delete to confirm.
  5. Check the project is gone from the Projects list, and its chat still appears in the chat list (not in the project), as Expected says.
