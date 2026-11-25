---
id: "PLAN-desktop-037"
type: "test-plan"
title: "Desktop · 37. Notebook and knowledge-workspace product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "37"
---
# Desktop · 37. Notebook and knowledge-workspace product

20 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S37.01 Notebook index.

- **Expected:** The user sees a list of their notebooks (knowledge workspaces) and can open one.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ProjectGallery.tsx:247; apps/web/app/chat/projects/page.tsx:373; apps/web/app/api/projects/[id]/route.ts:106
- **Where to find it:** Sidebar > Projects (the Projects page lists every project as cards, with the search box "Search projects...") (labels found in the code)
- **Needs:** a signed-in account (a project already created helps, to see a list)
- **Steps:**
  1. Sign in and click "Projects" in the left sidebar.
  2. Look for the page heading "Projects" and the search box "Search projects...".
  3. Each card is one project. Click a card's name ("Open project <name>") to open it.
  4. Compare: you should see your list of projects and open one. If there are none, the text "Create one to group conversations, attach files, and share instructions." shows.

## S37.02 Notebook creation.

- **Expected:** The user can create a new notebook that is saved to the account.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:71; apps/web/app/api/projects/route.ts:215
- **Where to find it:** Sidebar > Projects > New project > Create project (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click "Projects" in the sidebar.
  2. Click "New project" at the top of the page.
  3. In the dialog titled "Create project", type a name in the field "Project name" (optional: pick a template under "Start from").
  4. Click the "Create project" button at the bottom right. Compare: the dialog closes and the new project appears in the Projects list and stays there after you reload.

## S37.03 Notebook title and description.

- **Expected:** A notebook has a title and description the user can set and later edit.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:186; apps/web/features/projects/components/ProjectSettingsDialog.tsx:294; apps/web/features/projects/components/ProjectSettingsDialog.tsx:189
- **Where to find it:** Sidebar > Projects > open a project > Project options > Project settings (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Create a project (see S37.02) and open it from Projects.
  2. Fill the "Description" box in the "Create project" dialog, or later click "Project options" at the top right of the project and then "Project settings".
  3. In "Project settings", change the "Project name" or "Description" text.
  4. Click "Save". Compare: the new title and description show on the project page and stay after reload.

## S37.04 Source rail.

- **Expected:** Inside a notebook, a source list sits beside the conversation so the user can see what grounds the answers.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7897; apps/web/features/projects/components/ProjectSourcesPanel.tsx:20
- **Where to find it:** Sidebar > Projects > open a project > New chat in <project name> (send a message) > Panels > Project sources (labels found in the code)
- **Needs:** a project with at least one source file added (see S37.06)
- **Steps:**
  1. Open a project from Projects and send a first message in its composer (placeholder "New chat in <project name>").
  2. In the chat, click the "Panels" button in the top bar.
  3. Click the folder icon labelled "Project sources" (its tooltip; it toggles to "Close project sources").
  4. Compare: a list of the project's sources opens beside the conversation.

## S37.06 Add files.

- **Expected:** The user can add files (PDF, docs, text) to a notebook as sources and they are indexed for its chats.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Projects > open a project > Sources tab > Add sources > Upload (labels found in the code)
- **Needs:** a PDF or text file on the Mac
- **Steps:**
  1. Open a project and click the "Sources" tab.
  2. Click "Add sources" (or "+ Add sources" when files already exist).
  3. Click "Upload" ("Files from your device") and choose a PDF or text file from the Mac file picker.
  4. Compare: an "Uploading" banner shows the progress, then the file appears in the source list.

## S37.10 Add connected document.

- **Expected:** The user can add a document from a connected service (e.g. Google Drive) as a source.
- **Code:** partial. Evidence present: apps/web/app/api/connectors/google-drive/picker/route.ts:23
- **Known to be unfinished:** owner: set GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID (same GCP project as the Drive client; apps/web/app/api/connectors/google-drive/picker/route.ts:17); then live-check the Picker, including inside Electron
- **Where to find it:** Sidebar > Projects > open a project > Sources tab > Add sources > Google Drive (shows Coming soon) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open a project and click the "Sources" tab.
  2. Click "Add sources", then look at the "Google Drive" card.
  3. Compare: the card is disabled and shows "Coming soon", so a Drive file cannot be picked in this build.

## S37.11 Add written note.

- **Expected:** The user can write or paste a note and add it to the notebook as a source.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Projects > open a project > Sources tab > Add sources > Text input (labels found in the code)
- **Needs:** none beyond a signed-in account
- **Steps:**
  1. Open a project and click the "Sources" tab.
  2. Click "Add sources", then "Text input" ("Paste or type text").
  3. Optionally type a title in "Title (optional)", then paste or type text in the large box.
  4. Click "Add text". Compare: a new source with that title appears in the Sources list.

## S37.14 Source-grounded chat.

- **Expected:** Chats in the notebook answer from its sources.
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:240; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855; apps/web/lib/services/project-context-service.ts:606
- **Where to find it:** Sidebar > Projects > open a project > composer "New chat in <project name>" (labels found in the code)
- **Needs:** a project with a source file added
- **Steps:**
  1. Open a project that has at least one source file added (see S37.06).
  2. Click the composer box with the placeholder "New chat in <project name>" and type a question about the file's content.
  3. Send it and wait for the answer.
  4. Compare: the answer uses the project's sources and points to them (citation chips such as "p. 2" appear in the answer).

## S37.15 Notebook instructions.

- **Expected:** The notebook has instructions that apply to every chat in it.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSettingsDialog.tsx:321; apps/web/features/projects/components/ProjectSettingsDialog.tsx:178; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855; apps/web/lib/services/project-context-service.ts:606
- **Where to find it:** Sidebar > Projects > open a project > Project options > Project settings > Instructions (labels found in the code)
- **Needs:** a project
- **Steps:**
  1. Open a project and click "Project options" at the top right.
  2. Click "Project settings", then type in the "Instructions" box (for example: answer in one sentence).
  3. Click "Save".
  4. Open a new chat in the project and ask a question. Compare: the reply follows the instruction.

## S37.19 Citation-linked navigation.

- **Expected:** A citation in an answer links to the cited source passage, opening it at that place.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3577; packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx:17 (quoted code not found in the file now); apps/web/features/projects/components/SourcesPanel.tsx:164; apps/web/lib/services/project-context-service.ts:792
- **Where to find it:** Sidebar > Projects > open a project > ask a question in a project chat > click the citation chip under the answer (labels found in the code)
- **Needs:** a project with a PDF source and a question that uses it
- **Steps:**
  1. In a project chat that has sources, ask a question whose answer comes from a file.
  2. Look for the citation chip under the answer, showing the file name and a place such as "p. 2".
  3. Click the chip.
  4. Compare: the project's Sources tab opens with a preview of that file at the cited page.

## S37.23 Briefing document.

- **Expected:** One click turns the sources into a briefing document.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectStudio.tsx:39; apps/web/app/chat/projects/[id]/page.tsx:1321
- **Where to find it:** Sidebar > Projects > open a project > Sources tab > Create from your sources > Briefing doc (labels found in the code)
- **Needs:** a project with source files
- **Steps:**
  1. Open a project with a source file and click the "Sources" tab.
  2. Under "Create from your sources", click "Briefing doc".
  3. Compare: a new chat in this project opens and starts writing a briefing from the sources.

## S37.24 Study guide.

- **Expected:** One click turns the sources into a study guide.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectStudio.tsx:46; apps/web/app/chat/projects/[id]/page.tsx:1321
- **Where to find it:** Sidebar > Projects > open a project > Sources tab > Create from your sources > Study guide (labels found in the code)
- **Needs:** a project with source files
- **Steps:**
  1. Open a project with source files and click the "Sources" tab.
  2. Click "Study guide" under "Create from your sources".
  3. Compare: a new chat opens and writes a study guide (quiz, essay questions, glossary) from the sources.

## S37.25 Frequently asked questions.

- **Expected:** One click turns the sources into an FAQ.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectStudio.tsx:53; apps/web/app/chat/projects/[id]/page.tsx:1321
- **Where to find it:** Sidebar > Projects > open a project > Sources tab > Create from your sources > FAQ (labels found in the code)
- **Needs:** a project with source files
- **Steps:**
  1. Open a project with source files and click the "Sources" tab.
  2. Click "FAQ" under "Create from your sources".
  3. Compare: a new chat opens and writes a list of questions and answers from the sources.

## S37.26 Timeline.

- **Expected:** One click turns the sources into a timeline.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectStudio.tsx:60; apps/web/app/chat/projects/[id]/page.tsx:1321
- **Where to find it:** Sidebar > Projects > open a project > Sources tab > Create from your sources > Timeline (labels found in the code)
- **Needs:** a project with source files
- **Steps:**
  1. Open a project with source files and click the "Sources" tab.
  2. Click "Timeline" under "Create from your sources".
  3. Compare: a new chat opens and writes a dated timeline (as a Mermaid diagram plus a list) from the sources.

## S37.27 Mind map.

- **Expected:** One click turns the sources into a mind map.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectStudio.tsx:67; apps/web/app/chat/projects/[id]/page.tsx:1321
- **Where to find it:** Sidebar > Projects > open a project > Sources tab > Create from your sources > Mind map (labels found in the code)
- **Needs:** a project with source files
- **Steps:**
  1. Open a project with source files and click the "Sources" tab.
  2. Click "Mind map" under "Create from your sources".
  3. Compare: a new chat opens and draws a mind map of the sources' topics.

## S37.28 Data table.

- **Expected:** One click extracts a data table from the sources.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectStudio.tsx:74; apps/web/app/chat/projects/[id]/page.tsx:1321
- **Where to find it:** Sidebar > Projects > open a project > Sources tab > Create from your sources > Data table (labels found in the code)
- **Needs:** a project with source files
- **Steps:**
  1. Open a project with source files and click the "Sources" tab.
  2. Click "Data table" under "Create from your sources".
  3. Compare: a new chat opens and returns a markdown table of facts from the sources.

## S37.30 Slide deck.

- **Expected:** One click turns the sources into a slide deck.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectStudio.tsx:109; apps/web/app/chat/projects/[id]/page.tsx:1321
- **Where to find it:** Sidebar > Projects > open a project > Sources tab > Create from your sources > Slide deck (labels found in the code)
- **Needs:** a project with source files
- **Steps:**
  1. Open a project with source files and click the "Sources" tab.
  2. Click "Slide deck" under "Create from your sources".
  3. Compare: a new chat opens with a request for a PowerPoint file built from the sources.

## S37.34 Notebook sharing.

- **Expected:** The user can share a notebook with others with a chosen access level.
- **Code:** done. Evidence moved: apps/web/app/chat/projects/page.tsx:484 (quoted code not found in the file now); apps/web/app/chat/projects/page.tsx:139 (quoted code not found in the file now); apps/web/app/api/projects/[id]/route.ts:116
- **Known to be unfinished:** ['ui']
- **Where to find it:** Sidebar > Projects > project card menu > Share > Share <project name> (labels found in the code)
- **Needs:** a team workspace with a second member account in it
- **Steps:**
  1. Click "Projects" in the sidebar, then open the menu on a project card ("Project options").
  2. Click "Share". The dialog titled "Share <project name>" opens.
  3. Choose "Everyone in the workspace can view" or "Only people you invite", then click "Share".
  4. Compare: the access list shows "Can view" or "Can edit" for members. On a personal account the dialog only says "Only you can open this project. Switch to a team workspace to share it."

## S37.37 Notebook-to-main-chat context handoff.

- **Expected:** From the main chat the user can bring a notebook's context into the conversation.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:5019; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2782; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855
- **Known to be unfinished:** ['ui']
- **Where to find it:** New chat (main chat) > the "Project" button in the composer > pick a project in "Search projects..." (labels found in the code)
- **Needs:** a project with a source file
- **Steps:**
  1. On the main chat screen, click the "Project" button in the composer's bottom bar.
  2. Type part of a project name in "Search projects..." and click the project.
  3. Type a question about that project's content and send it.
  4. Compare: the reply uses that project's sources and instructions, and the chat is shown as part of that project.

## S37.38 Cross-application notebook synchronization.

- **Expected:** A notebook and its sources and notes are available in every app the user signs into.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ProjectGallery.tsx:247; apps/web/app/api/projects/[id]/route.ts:106
- **Where to find it:** no screen of its own. Sync is server-side (apps/web/app/api/projects/[id]/route.ts); the Desktop app shows the hosted web app, so this is the same screen on both.
- **Needs:** a second app or browser signed in to the same account
- **Steps:**
  1. On the Desktop app, open "Projects" and note a project name, its sources and its notes.
  2. Sign in to the web app with the same account and click "Projects".
  3. Compare: the same project, with the same sources, appears there.
