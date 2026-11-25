---
id: "PLAN-vscode-023"
type: "test-plan"
title: "VS Code · 23. Project workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "23"
---
# VS Code · 23. Project workspace

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S23.01 Project creation.

- **Expected:** A signed-in user can create a named project that is saved to their account and opens as its own workspace.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2606; apps/extension-vscode/src/features/projects/projectActions.ts:460
- **Where to find it:** Sidebar > More > Projects > New project (or Command Palette > Code: New Project) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Sign in to AGI Code from the sidebar if asked.
  2. Click the More button (…) in the AGI Code sidebar header and click Projects.
  3. Click the New project icon in the Projects title bar, or run Code: New Project from the Command Palette.
  4. Type a project name and press Enter. Leave the instructions box empty or type some, then press Enter.
  5. Look for the message saying the project is on your account, on every client, and for the new project in the Projects list.

## S23.02 Project name and description.

- **Expected:** A project has a name and an optional description that the user can set at creation and edit later.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/projects/projectActions.ts:143; apps/extension-vscode/src/features/projects/projectActions.ts:148; apps/extension-vscode/src/features/projects/projectActions.ts:359
- **Where to find it:** Sidebar > More > Projects > pick a project > Edit > Rename or Description (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and a project you can edit
- **Steps:**
  1. Open Projects from the More menu in the AGI Code sidebar header and pick a project.
  2. Under Edit, pick Rename, type a new name, and press Enter.
  3. Back in the project list, pick Description, type a short description, and press Enter.
  4. Look for the saved-to-your-account message, then check that the new name and description show in the project's title and row.

## S23.05 Project overview.

- **Expected:** Opening a project shows an overview: its name, description, counts and its main sections (chats, files, instructions).
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2600; apps/extension-vscode/src/features/projects/projectActions.ts:100; apps/extension-vscode/src/features/projects/projectActions.ts:182
- **Where to find it:** Sidebar > More > Projects > pick a project (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and a project with a description, instructions, files and conversations
- **Steps:**
  1. Open Projects from the More menu in the AGI Code sidebar header.
  2. Pick a project from the list.
  3. Look at the top of the quick pick: the project name is the title and the description line is shown as the placeholder.
  4. Scroll through the sections About, Knowledge files, Recent conversations, Actions and Edit, and compare with Expected.

## S23.06 Project conversations.

- **Expected:** A project lists its conversations, opens them, and starts new chats that are filed under the project.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/projects/projectActions.ts:256
- **Where to find it:** Sidebar > More > Projects > pick a project > Recent conversations > pick a conversation (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and a project that already has chats
- **Steps:**
  1. Open Projects from the More menu and pick a project that has chats.
  2. Look under the Recent conversations section and compare the listed chats with Expected.
  3. Pick one conversation; it opens in the web browser on the chat page.
  4. Look at the browser tab to see that the chat opens.

## S23.09 Project instructions.

- **Expected:** Instructions saved on a project are applied to every chat in that project.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/projects/projectActions.ts:153; apps/extension-vscode/src/features/projects/projectActions.ts:359
- **Where to find it:** Sidebar > More > Projects > pick a project > Edit > Instructions (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and a project you can edit
- **Steps:**
  1. Open Projects from the More menu and pick a project.
  2. Under Edit, pick Instructions, type an instruction such as a style rule, and press Enter.
  3. Pick the project again and choose Use in this chat.
  4. Open the chat in the AGI Code sidebar and look for the Active project chip, then send a message and compare the reply with Expected.

## S23.16 Default model/profile.

- **Expected:** A project can set a default model (or profile) that new chats in it start with.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/projects/projectActions.ts:160; apps/extension-vscode/src/features/projects/projectActions.ts:411
- **Where to find it:** Sidebar > More > Projects > pick a project > Edit > Default model (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open Projects from the More menu and pick a project.
  2. Under Edit, pick Default model.
  3. Choose the option offered (Use your model, or No default model) and confirm.
  4. Back in the project list, check the Default model description; then pick Use in this chat and check whether a Choose the model prompt appears.

## S23.18 Local-folder association.

- **Expected:** A project can be associated with a local folder so work in that folder uses the project.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/projects/activeProject.ts:30; apps/extension-vscode/src/core/commandSetup.ts:2618
- **Where to find it:** Sidebar > More > Projects > pick a project > Use in this chat (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and a local folder open in VS Code
- **Steps:**
  1. Open the folder you want to work in with File > Open Folder in VS Code.
  2. Open Projects from the More menu, pick a project, and choose Use in this chat.
  3. Look for the Active project chip above the chat composer in the AGI Code sidebar.
  4. Open a different folder and check whether the Active project chip is gone, then compare with Expected.

## S23.32 Delete.

- **Expected:** A project owner can delete a project after confirming; its files are removed and its chats are kept (unfiled).
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:2611; apps/extension-vscode/src/features/projects/projectActions.ts:497; packages/contracts/cloud-contracts/src/managed-cloud-projects-client.ts:246; apps/web/app/api/projects/[id]/route.ts:326 (quoted code not found in the file now)
- **Where to find it:** Sidebar > More > Projects > pick a project > Delete project (labels found in the code)
- **Needs:** a signed-in AGI Cloud account, a project you own, and a chat that was in it
- **Steps:**
  1. Open Projects from the More menu, pick a project you own, then pick Delete project under Actions.
  2. In the modal, read the warning text for the knowledge files and conversations, then click Delete project.
  3. Look for the message saying the project was deleted from your account.
  4. Reopen Projects and check the project is gone; then open a chat that was in it on the web and check it still exists.
