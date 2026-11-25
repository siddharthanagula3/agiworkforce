---
id: "PLAN-chrome-023"
type: "test-plan"
title: "Chrome · 23. Project workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "23"
---
# Chrome · 23. Project workspace

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S23.01 Project creation.

- **Expected:** A signed-in user can create a named project that is saved to their account and opens as its own workspace.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension for 'project', 'create project', 'new project' and the project strings in _locales/en/messages.json; the extension only lists existing projects, so no create control was found here.
- **Needs:** a signed-in account

## S23.02 Project name and description.

- **Expected:** A project has a name and an optional description that the user can set at creation and edit later.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension for 'project', 'project name', 'description' and project strings; no screen to set or edit a project name or description was found in the extension.
- **Needs:** a signed-in account

## S23.05 Project overview.

- **Expected:** Opening a project shows an overview: its name, description, counts and its main sections (chats, files, instructions).
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension for 'project', 'overview' and project strings; no project overview screen was found in the extension.
- **Needs:** a signed-in account

## S23.06 Project conversations.

- **Expected:** A project lists its conversations, opens them, and starts new chats that are filed under the project.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Composer: type @ > Projects > project name (starts the chat in that project). Recent chats > More actions for a chat > Move to project (files an existing chat under a project). (labels found in the code)
- **Needs:** a signed-in account with at least one project
- **Steps:**
  1. Sign in to the side panel with an account that already has at least one project.
  2. Click the message box and type @. The menu titled Tabs and projects opens.
  3. Under the Projects heading, click a project name. The chat is started in that project.
  4. Look for the header chip that reads Project · followed by the project name. Type a message to start the chat, then check it appears under that project.
  5. Click the Recent chats button, then More actions for a chat, then Move to project. Choose a project in the menu Project for this chat.
  6. Look for the confirmation Moved to <project name>. and check the chat is now filed under that project.

## S23.09 Project instructions.

- **Expected:** Instructions saved on a project are applied to every chat in that project.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension for 'project', 'instructions' and project strings; the only instruction screens found are for scheduled tasks, not for projects.
- **Needs:** a signed-in account

## S23.32 Delete.

- **Expected:** A project owner can delete a project after confirming; its files are removed and its chats are kept (unfiled).
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension for 'delete project', 'project' and archive strings; no project delete control was found, only chat archive and chat move actions.
- **Needs:** a signed-in account
