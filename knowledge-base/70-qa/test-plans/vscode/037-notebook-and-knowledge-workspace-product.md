---
id: "PLAN-vscode-037"
type: "test-plan"
title: "VS Code · 37. Notebook and knowledge-workspace product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "37"
---
# VS Code · 37. Notebook and knowledge-workspace product

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S37.01 Notebook index.

- **Expected:** The user sees a list of their notebooks (knowledge workspaces) and can open one.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/projects/projectsTree.ts:87; apps/extension-vscode/src/features/projects/projectActions.ts:182
- **Where to find it:** AGI Code sidebar > More > Projects (or Command Palette > Code: Show Projects) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with at least one project
- **Steps:**
  1. Open the AGI Code sidebar and click the More button (tooltip More).
  2. Click Projects in the menu.
  3. Look for a list of your projects with the placeholder Open a project. If you are signed out, the list shows Sign in to see your projects instead.
  4. Click one project in the list and check that its detail menu opens with the project name as its title.

## S37.02 Notebook creation.

- **Expected:** The user can create a new notebook that is saved to the account.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2606; apps/extension-vscode/src/features/projects/projectActions.ts:460
- **Where to find it:** AGI Code sidebar > More > Projects > New project (or Command Palette > Code: New Project) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Click More in the AGI Code sidebar, then click Projects.
  2. Click the New project icon at the top of the list (tooltip New project).
  3. Type a name such as QA test notebook and press Enter. An empty name is refused with the message A project needs a name.
  4. Leave Instructions empty and press Enter, or type some and press Enter.
  5. Look for the message saying the project is on your account, on every client, and check that the project now appears in the list.

## S37.03 Notebook title and description.

- **Expected:** A notebook has a title and description the user can set and later edit.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/projects/projectActions.ts:143; apps/extension-vscode/src/features/projects/projectActions.ts:359
- **Where to find it:** AGI Code sidebar > More > Projects > [project name] > Rename or Description (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with at least one project
- **Steps:**
  1. Open Projects from the More menu and click a project.
  2. Click Rename, type a new name, and press Enter.
  3. Open the same project again, click Description, type a description, and press Enter.
  4. Look for the message saying the project was saved to your account, and check that the new name is the menu title and the description shows under it.

## S37.15 Notebook instructions.

- **Expected:** The notebook has instructions that apply to every chat in it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/projects/projectActions.ts:153; apps/extension-vscode/src/features/projects/projectActions.ts:359
- **Where to find it:** AGI Code sidebar > More > Projects > [project name] > Instructions (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with at least one project
- **Steps:**
  1. Open Projects from the More menu and click a project.
  2. Click Instructions under the Edit heading, type text such as Always answer in bullet points, and press Enter.
  3. Open the project again and check that Instructions now shows Set.
  4. Click Use in this chat on the project, then send a message in this workspace's chat and compare the reply with the instructions.

## S37.37 Notebook-to-main-chat context handoff.

- **Expected:** From the main chat the user can bring a notebook's context into the conversation.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5403; apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:602
- **Where to find it:** AGI Code chat start screen > Projects group > Use in this chat (then Use in this chat in the project menu) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with at least one project
- **Steps:**
  1. Open a new chat in the AGI Code sidebar.
  2. In the Projects group of the start suggestions, click the Use in this chat button on a project row. The project menu opens.
  3. Click Use in this chat in that menu.
  4. Look at the chip above the message box with a folder icon and the project name (labelled Active project), then send a message in the chat.
