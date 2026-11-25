---
id: "PLAN-web-037"
type: "test-plan"
title: "Web · 37. Notebook and knowledge-workspace product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "37"
---
# Web · 37. Notebook and knowledge-workspace product

20 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S37.01 Notebook index.

- **Expected:** The user sees a list of their notebooks (knowledge workspaces) and can open one.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ProjectGallery.tsx:247; apps/web/app/chat/projects/page.tsx:373; apps/web/app/api/projects/[id]/route.ts:106
- **Where to find it:** Sidebar > Projects (labels found in the code)
- **Needs:** a Free account with at least one notebook (or an empty account to see the empty list)
- **Steps:**
  1. Sign in and click Projects in the sidebar.
  2. Look for the list of your notebooks, with the search box that says Search projects....
  3. Click one notebook to open it.
  4. Compare the list and the opened notebook with Expected.

## S37.02 Notebook creation.

- **Expected:** The user can create a new notebook that is saved to the account.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:71; apps/web/app/api/projects/route.ts:215
- **Where to find it:** Sidebar > Projects > New project (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Click Projects in the sidebar.
  2. Click New project.
  3. Type a name in the Project name field and click Create project.
  4. Look for the new notebook in the list, and for the notebook page opening after creation.

## S37.03 Notebook title and description.

- **Expected:** A notebook has a title and description the user can set and later edit.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:186; apps/web/features/projects/components/ProjectSettingsDialog.tsx:294; apps/web/features/projects/components/ProjectSettingsDialog.tsx:189
- **Where to find it:** Sidebar > Projects > New project > Description, then open the notebook > Project options > Project settings (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Create a notebook with a name and a Description, as in S37.02.
  2. Open the notebook and click the Project options button.
  3. Click Project settings.
  4. Change the Name or the Description and save; look for the Project updated message and the new text.

## S37.04 Source rail.

- **Expected:** Inside a notebook, a source list sits beside the conversation so the user can see what grounds the answers.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7897; apps/web/features/projects/components/ProjectSourcesPanel.tsx:20
- **Where to find it:** Projects > open a notebook > Chats > open a chat > click the icon button titled Project sources (labels found in the code)
- **Needs:** a notebook with at least one source
- **Steps:**
  1. Open a notebook from Projects.
  2. Click the Chats tab and open a chat.
  3. Click the icon button whose tooltip is Project sources.
  4. Look for the source list beside the conversation, with the Add sources button and the file list.

## S37.06 Add files.

- **Expected:** The user can add files (PDF, docs, text) to a notebook as sources and they are indexed for its chats.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now)
- **Where to find it:** Projects > open a notebook > Sources > Add sources > Upload (labels found in the code)
- **Needs:** a file to upload (PDF, doc or text)
- **Steps:**
  1. Open a notebook and click the Sources tab.
  2. Click Add sources, then click Upload.
  3. Choose a PDF, doc or text file and wait for the progress to finish.
  4. Look for the file in the source list, then ask a chat in the notebook about it and compare with Expected.

## S37.10 Add connected document.

- **Expected:** The user can add a document from a connected service (e.g. Google Drive) as a source.
- **Code:** partial. Evidence present: apps/web/app/api/connectors/google-drive/picker/route.ts:23
- **Known to be unfinished:** owner: set GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID (same GCP project as the Drive client; apps/web/app/api/connectors/google-drive/picker/route.ts:17); then live-check the Picker, including inside Electron
- **Where to find it:** Projects > open a notebook > Sources > Add sources > Google Drive (labels found in the code)
- **Needs:** an outside account (Google) with Drive files
- **Steps:**
  1. Open a notebook and click the Sources tab.
  2. Click Add sources, then click Google Drive.
  3. Pick files in the Google picker window and confirm.
  4. Look for the picked files in the source list.

## S37.11 Add written note.

- **Expected:** The user can write or paste a note and add it to the notebook as a source.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now)
- **Where to find it:** Projects > open a notebook > Sources > Add sources > Text input (labels found in the code)
- **Steps:**
  1. Open a notebook, click the Sources tab, click Add sources.
  2. Click Text input.
  3. Type a title in the field with the placeholder e.g. Project notes, and paste or type text in the box.
  4. Save it as a source and look for the new text source in the list.

## S37.14 Source-grounded chat.

- **Expected:** Chats in the notebook answer from its sources.
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:240; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855; apps/web/lib/services/project-context-service.ts:606
- **Where to find it:** Projects > open a notebook > Chats (labels found in the code)
- **Needs:** a notebook with sources
- **Steps:**
  1. Open a notebook and open the Chats tab.
  2. Start a chat and type a question that the sources can answer.
  3. Read the answer and look for source names or citation chips under it.
  4. Compare the answer with the sources in the notebook.

## S37.15 Notebook instructions.

- **Expected:** The notebook has instructions that apply to every chat in it.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSettingsDialog.tsx:321; apps/web/features/projects/components/ProjectSettingsDialog.tsx:178; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855; apps/web/lib/services/project-context-service.ts:606
- **Where to find it:** Projects > open a notebook > Project options > Project settings > Instructions (labels found in the code)
- **Steps:**
  1. Open the notebook and click the Project options button.
  2. Click Project settings.
  3. Type a rule in the Instructions box, for example Respond in Spanish, and save.
  4. Start a new chat in the notebook, ask a question, and check that the reply follows the rule.

## S37.19 Citation-linked navigation.

- **Expected:** A citation in an answer links to the cited source passage, opening it at that place.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3577; packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx:17 (quoted code not found in the file now); apps/web/features/projects/components/SourcesPanel.tsx:164; apps/web/lib/services/project-context-service.ts:792
- **Where to find it:** Projects > open a notebook > Chats > ask a question > click the source chip under the answer (labels found in the code)
- **Needs:** a notebook with sources
- **Steps:**
  1. Open a notebook and ask a question in a chat that the sources answer.
  2. Look under the answer for a source chip with the file name and page.
  3. Click the chip.
  4. Check that the source preview opens at the cited page.

## S37.23 Briefing document.

- **Expected:** One click turns the sources into a briefing document.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectStudio.tsx:39; apps/web/app/chat/projects/[id]/page.tsx:1321
- **Where to find it:** Projects > open a notebook > Sources > Briefing doc (labels found in the code)
- **Needs:** a notebook with sources
- **Steps:**
  1. Open a notebook with sources and click the Sources tab.
  2. Click Briefing doc in the studio section.
  3. Look for a new chat in the notebook that produces a briefing document.

## S37.24 Study guide.

- **Expected:** One click turns the sources into a study guide.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectStudio.tsx:46; apps/web/app/chat/projects/[id]/page.tsx:1321
- **Where to find it:** Projects > open a notebook > Sources > Study guide (labels found in the code)
- **Needs:** a notebook with sources
- **Steps:**
  1. Open a notebook with sources and click the Sources tab.
  2. Click Study guide in the studio section.
  3. Look for a new chat that produces a study guide.

## S37.25 Frequently asked questions.

- **Expected:** One click turns the sources into an FAQ.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectStudio.tsx:53; apps/web/app/chat/projects/[id]/page.tsx:1321
- **Where to find it:** Projects > open a notebook > Sources > FAQ (labels found in the code)
- **Needs:** a notebook with sources
- **Steps:**
  1. Open a notebook with sources and click the Sources tab.
  2. Click FAQ in the studio section.
  3. Look for a new chat that produces an FAQ.

## S37.26 Timeline.

- **Expected:** One click turns the sources into a timeline.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectStudio.tsx:60; apps/web/app/chat/projects/[id]/page.tsx:1321
- **Where to find it:** Projects > open a notebook > Sources > Timeline (labels found in the code)
- **Needs:** a notebook with sources
- **Steps:**
  1. Open a notebook with sources and click the Sources tab.
  2. Click Timeline in the studio section.
  3. Look for a new chat that produces a timeline.

## S37.27 Mind map.

- **Expected:** One click turns the sources into a mind map.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectStudio.tsx:67; apps/web/app/chat/projects/[id]/page.tsx:1321
- **Where to find it:** Projects > open a notebook > Sources > Mind map (labels found in the code)
- **Needs:** a notebook with sources
- **Steps:**
  1. Open a notebook with sources and click the Sources tab.
  2. Click Mind map in the studio section.
  3. Look for a new chat that produces a mind map.

## S37.28 Data table.

- **Expected:** One click extracts a data table from the sources.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectStudio.tsx:74; apps/web/app/chat/projects/[id]/page.tsx:1321
- **Where to find it:** Projects > open a notebook > Sources > Data table (labels found in the code)
- **Needs:** a notebook with sources
- **Steps:**
  1. Open a notebook with sources and click the Sources tab.
  2. Click Data table in the studio section.
  3. Look for a new chat that produces a data table.

## S37.30 Slide deck.

- **Expected:** One click turns the sources into a slide deck.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectStudio.tsx:109; apps/web/app/chat/projects/[id]/page.tsx:1321
- **Where to find it:** Projects > open a notebook > Sources > Slide deck (labels found in the code)
- **Needs:** a notebook with sources
- **Steps:**
  1. Open a notebook with sources and click the Sources tab.
  2. Click Slide deck in the studio section.
  3. Look for a new chat that produces a slide deck file.

## S37.34 Notebook sharing.

- **Expected:** The user can share a notebook with others with a chosen access level.
- **Code:** done. Evidence moved: apps/web/app/chat/projects/page.tsx:484 (quoted code not found in the file now); apps/web/app/chat/projects/page.tsx:139 (quoted code not found in the file now); apps/web/app/api/projects/[id]/route.ts:116
- **Known to be unfinished:** ['ui']
- **Where to find it:** Projects > open a notebook > Project options > Share (labels found in the code)
- **Needs:** a team workspace and a second account in the same workspace
- **Steps:**
  1. Open the notebook and click the Project options button.
  2. Click Share. The dialog title is Share followed by the notebook name.
  3. Choose Everyone in the workspace can view, or set a member to Can view or Can edit.
  4. Sign in as the other account and check that it can open the notebook with that access.

## S37.37 Notebook-to-main-chat context handoff.

- **Expected:** From the main chat the user can bring a notebook's context into the conversation.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:5019; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2782; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855
- **Known to be unfinished:** ['ui']
- **Where to find it:** Main chat > composer bar Project button > pick a notebook (labels found in the code)
- **Needs:** a notebook with sources
- **Steps:**
  1. In the main chat, click the Project button in the composer bar.
  2. Pick a notebook from the list.
  3. Send a question that needs the notebook sources.
  4. Check that the answer uses the notebook sources.

## S37.38 Cross-application notebook synchronization.

- **Expected:** A notebook and its sources and notes are available in every app the user signs into.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ProjectGallery.tsx:247; apps/web/app/api/projects/[id]/route.ts:106
- **Where to find it:** no screen of its own. Sync is server-side; no control was found in the code, and the other apps were not checked.
- **Needs:** a second app signed in with the same account
- **Steps:**
  1. Sign in with the same account in another app (desktop, mobile or the Chrome extension).
  2. Open Projects in that app.
  3. Check that the same notebook list appears and that the notebook opens with its sources.
