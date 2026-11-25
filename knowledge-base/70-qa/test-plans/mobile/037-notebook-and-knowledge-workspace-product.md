---
id: "PLAN-mobile-037"
type: "test-plan"
title: "Mobile · 37. Notebook and knowledge-workspace product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "37"
---
# Mobile · 37. Notebook and knowledge-workspace product

9 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S37.01 Notebook index.

- **Expected:** The user sees a list of their notebooks (knowledge workspaces) and can open one.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/projects.tsx:362; apps/mobile/src/features/projects/store.ts:137 (quoted code not found in the file now)
- **Where to find it:** Side menu > Projects (the list opens on the Projects screen, titled "Projects") (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and open the side menu.
  2. Tap "Projects" in the menu.
  3. Look for the "Projects" title and a list of your projects, each opening with a tap.

## S37.02 Notebook creation.

- **Expected:** The user can create a new notebook that is saved to the account.
- **Code:** done. Evidence present: apps/mobile/app/(app)/(tabs)/projects.tsx:441; apps/mobile/src/features/projects/store.ts:416
- **Where to find it:** Side menu > Projects > "New project" (floating button); when the list is empty, "Create Project" (labels found in the code)
- **Needs:** a signed-in account (Cloud mode to check the account save)
- **Steps:**
  1. Open Projects from the side menu.
  2. Tap "New project" at the bottom, or "Create Project" if no projects exist.
  3. Type a name in "Project name" and tap "Create project".
  4. Look for the new project in the list, then close and reopen the app to confirm it is still there.

## S37.03 Notebook title and description.

- **Expected:** A notebook has a title and description the user can set and later edit.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/projects.tsx:232 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/projects.tsx:548 (quoted code not found in the file now); apps/mobile/src/features/projects/store.ts:447
- **Where to find it:** Side menu > Projects > open a project > the "..." button at the top right > "Edit project" (labels found in the code)
- **Needs:** a project you own
- **Steps:**
  1. Open a project of your own from the Projects list.
  2. Tap the "..." button at the top right of the project screen (it has no visible text), then tap "Edit project".
  3. Look for the "Edit Project" sheet with "Project name" and "Description" fields.
  4. Change the Description, tap "Save project", then open "Edit project" again to check the new text.

## S37.04 Source rail.

- **Expected:** Inside a notebook, a source list sits beside the conversation so the user can see what grounds the answers.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2424; apps/mobile/src/features/projects/components/ProjectSourcesButton.tsx:17
- **Where to find it:** Open a chat that belongs to a project > folder icon at the top of the chat (opens a sheet titled "<project name> sources") (labels found in the code)
- **Needs:** a project with sources and a chat assigned to that project
- **Steps:**
  1. Open a chat that belongs to a project.
  2. Tap the folder icon in the chat header (accessibility label "Open project sources").
  3. Look for the sheet titled "<project name> sources" with the list of files, or "No sources added yet" if empty.

## S37.06 Add files.

- **Expected:** The user can add files (PDF, docs, text) to a notebook as sources and they are indexed for its chats.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now)
- **Where to find it:** Side menu > Projects > open a project > "Sources" tab > "Add sources" (labels found in the code)
- **Needs:** a file to upload (PDF) and a signed-in account
- **Steps:**
  1. Open a project and tap the "Sources" tab.
  2. Tap "Add sources" and choose a file in the system picker (for example a PDF).
  3. Watch the row for "Indexing" change to a final status.
  4. Look for the file name in the list, and check that a chat in this project can use it.

## S37.14 Source-grounded chat.

- **Expected:** Chats in the notebook answer from its sources.
- **Code:** done. Evidence present: apps/mobile/stores/chat/chatExecutionStore.ts:3276
- **Needs:** device
- **Where to find it:** Side menu > Projects > open a project > "Chats" tab > "New chat in project", then ask a question about a file in "Sources" (labels found in the code)
- **Needs:** a file to upload, and Local mode (the code adds source text to the chat only when the execution mode is local)
- **Steps:**
  1. Open a project that has a source file added under "Sources".
  2. Tap the "Chats" tab, then start a chat in the project.
  3. Ask a question that only the source file can answer.
  4. Compare the answer with the file's content: it should use the source.

## S37.15 Notebook instructions.

- **Expected:** The notebook has instructions that apply to every chat in it.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/projects.tsx:577 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2773
- **Where to find it:** Side menu > Projects > open a project > "Instructions" row > type text > "Save instructions" (labels found in the code)
- **Needs:** a project you own; Local mode for the chat to apply the text (see note)
- **Steps:**
  1. Open a project and tap the Instructions row (accessibility label "Instructions"), or tap "Add instructions".
  2. Type an instruction such as a reply style, then tap "Save instructions".
  3. Start a new chat in the same project and ask a question.
  4. Check the reply follows the instruction.

## S37.37 Notebook-to-main-chat context handoff.

- **Expected:** From the main chat the user can bring a notebook's context into the conversation.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx:127 (quoted code not found in the file now); apps/mobile/stores/chat/chatMessageStore.ts:696 (quoted code not found in the file now)
- **Where to find it:** Chats tab (main chat screen) > "No project" pill above the message box > pick a project in the "Projects" sheet (labels found in the code)
- **Needs:** a project with sources or instructions, and Local mode for the context to apply
- **Steps:**
  1. On the main chat screen, tap the "No project" pill.
  2. In the sheet titled "Projects", tap a project name.
  3. Look for the pill to change to that project's name.
  4. Send a question and check the reply uses that project's sources or instructions.

## S37.38 Cross-application notebook synchronization.

- **Expected:** A notebook and its sources and notes are available in every app the user signs into.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/projects/[id].tsx:172 (quoted code not found in the file now); apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx:538
- **Known to be unfinished:** ['flag-off']
- **Where to find it:** no screen of its own. Known unfinished and flag-off per the audit; no feature flag was found in the mobile project files, and the mobile app keeps local projects on the device ("Local project. Details, chats, and sources stay on this device." in apps/mobile/app/(app)/projects/[id].tsx).
- **Needs:** a second app signed into the same account (for example web or desktop)
