# Area 37. Notebook and knowledge-workspace product

39 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S37.01 Notebook index.
- Should: The user sees a list of their notebooks (knowledge workspaces) and can open one.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/ProjectGallery.tsx:230; apps/web/app/chat/projects/page.tsx:397; apps/web/app/api/projects/[id]/route.ts:105; apps/mobile/app/(app)/(tabs)/projects.tsx:402; apps/mobile/src/features/projects/store.ts:137; apps/cli/src/lib.rs:1831; apps/cli/src/cloud/mod.rs:202; apps/extension-vscode/src/features/projects/projectsTree.ts:87

## S37.02 Notebook creation.
- Should: The user can create a new notebook that is saved to the account.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:70; apps/web/app/api/projects/route.ts:201; apps/mobile/app/(app)/(tabs)/projects.tsx:444; apps/mobile/src/features/projects/store.ts:245; apps/cli/src/lib.rs:1853; apps/cli/src/cloud/mod.rs:202; apps/extension-vscode/src/core/commandSetup.ts:2253; apps/extension-vscode/src/features/projects/projectActions.ts:268

## S37.03 Notebook title and description.
- Should: A notebook has a title and description the user can set and later edit.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:190; apps/web/features/projects/components/ProjectSettingsDialog.tsx:208; apps/web/features/projects/components/ProjectSettingsDialog.tsx:112; apps/mobile/app/(app)/(tabs)/projects.tsx:232; apps/mobile/app/(app)/(tabs)/projects.tsx:548; apps/mobile/src/features/projects/store.ts:276; apps/cli/src/lib.rs:2168; apps/cli/src/cloud/mod.rs:310

## S37.04 Source rail.
- Should: Inside a notebook, a source list sits beside the conversation so the user can see what grounds the answers.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:6250; apps/web/features/projects/components/ProjectSourcesPanel.tsx:20; apps/mobile/app/(app)/chat/[id].tsx:1705; apps/mobile/src/features/projects/components/ProjectSourcesButton.tsx:16

## S37.05 Source checkboxes.
- Should: Each source has a checkbox so the user chooses which sources ground the next answer.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S37.06 Add files.
- Should: The user can add files (PDF, docs, text) to a notebook as sources and they are indexed for its chats.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227

## S37.07 Add website.
- Should: The user can add a website URL as a source; its text is fetched and indexed.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S37.08 Add video transcript.
- Should: The user can add a video (e.g. YouTube link) whose transcript becomes a source.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S37.09 Add audio.
- Should: The user can add an audio file that is transcribed into a source.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S37.10 Add connected document.
- Should: The user can add a document from a connected service (e.g. Google Drive) as a source.
- Status: web partial, desktop partial, mobile missing, cli missing, chrome missing
- Code: apps/web/app/api/connectors/google-drive/picker/route.ts:17
- Unfinished: web: owner: set GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID (same GCP project as the Drive client; apps/web/app/api/connectors/google-drive/picker/route.ts:17); then live-check the Picker, including inside Electron | desktop: owner: set GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID (same GCP project as the Drive client; apps/web/app/api/connectors/google-drive/picker/route.ts:17); then live-check the Picker, including inside Electron

## S37.11 Add written note.
- Should: The user can write or paste a note and add it to the notebook as a source.
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227

## S37.12 Source guide or summary.
- Should: Each source gets an automatic guide or summary the user can read.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S37.13 Source search.
- Should: The user can search across or for sources inside the notebook.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S37.14 Source-grounded chat.
- Should: Chats in the notebook answer from its sources.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/app/chat/projects/[id]/page.tsx:234; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2550; apps/web/lib/services/project-context-service.ts:568; apps/mobile/stores/chat/chatExecutionStore.ts:2219; apps/extension/src/side_panel.ts:7359; apps/extension/src/side_panel.ts:7342; apps/extension/src/features/cloud-bridge/conversationSync.ts:118; apps/extension/src/background.ts:4050

## S37.15 Notebook instructions.
- Should: The notebook has instructions that apply to every chat in it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/projects/components/ProjectSettingsDialog.tsx:230; apps/web/features/projects/components/ProjectSettingsDialog.tsx:107; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2550; apps/web/lib/services/project-context-service.ts:568; apps/mobile/app/(app)/(tabs)/projects.tsx:577; apps/mobile/stores/chat/chatExecutionStore.ts:1348; apps/cli/src/cloud/mod.rs:589; apps/cli/src/agent/mod.rs:605

## S37.16 Saved chat responses.
- Should: The user can save a chat response into the notebook (as a note or source) in one action.
- Status: not applicable anywhere

## S37.17 Notebook notes.
- Should: The notebook holds user notes that can be listed, opened and edited.
- Status: not applicable anywhere

## S37.18 Editable notes beside sources.
- Should: Notes are editable in a panel next to the sources.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S37.19 Citation-linked navigation.
- Should: A citation in an answer links to the cited source passage, opening it at that place.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2724; packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx:17; apps/web/features/projects/components/SourcesPanel.tsx:107; apps/web/lib/services/project-context-service.ts:735

## S37.20 Studio/output panel.
- Should: A Studio/output panel lists one-click outputs generated from the notebook sources.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S37.21 Audio overview.
- Should: One click generates a spoken audio overview of the sources.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S37.22 Video overview.
- Should: One click generates a narrated video overview of the sources.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S37.23 Briefing document.
- Should: One click turns the sources into a briefing document.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/projects/components/ProjectStudio.tsx:32; apps/web/app/chat/projects/[id]/page.tsx:1296

## S37.24 Study guide.
- Should: One click turns the sources into a study guide.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/projects/components/ProjectStudio.tsx:39; apps/web/app/chat/projects/[id]/page.tsx:1296

## S37.25 Frequently asked questions.
- Should: One click turns the sources into an FAQ.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/projects/components/ProjectStudio.tsx:46; apps/web/app/chat/projects/[id]/page.tsx:1296

## S37.26 Timeline.
- Should: One click turns the sources into a timeline.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/projects/components/ProjectStudio.tsx:53; apps/web/app/chat/projects/[id]/page.tsx:1296

## S37.27 Mind map.
- Should: One click turns the sources into a mind map.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/projects/components/ProjectStudio.tsx:60; apps/web/app/chat/projects/[id]/page.tsx:1296

## S37.28 Data table.
- Should: One click extracts a data table from the sources.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/projects/components/ProjectStudio.tsx:67; apps/web/app/chat/projects/[id]/page.tsx:1296

## S37.29 Infographic.
- Should: One click turns the sources into an infographic.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S37.30 Slide deck.
- Should: One click turns the sources into a slide deck.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/projects/components/ProjectStudio.tsx:74; apps/web/app/chat/projects/[id]/page.tsx:1296

## S37.31 Quiz.
- Should: One click generates a quiz from the sources that the user can answer.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S37.32 Flashcard set.
- Should: One click generates a flashcard set from the sources.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S37.33 Interactive learning overview.
- Should: One click generates an interactive learning overview of the sources.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S37.34 Notebook sharing.
- Should: The user can share a notebook with others with a chosen access level.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/app/chat/projects/page.tsx:484; apps/web/app/chat/projects/page.tsx:139; apps/web/app/api/projects/[id]/route.ts:115
- Unfinished: web: ['ui'] | desktop: ['ui']

## S37.35 Notebook export.
- Should: The user can export a notebook (sources, notes, chats) as a file.
- Status: not applicable anywhere

## S37.36 Source refresh.
- Should: A source added from a live location can be refreshed to pick up changes.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/projects/components/KnowledgeFilesPanel.tsx:606; apps/web/features/projects/components/KnowledgeFilesPanel.tsx:123
- Unfinished: web: Only "Retry indexing" for a file whose indexing failed; sources are uploaded copies, so nothing can be re-fetched from where it came from. | desktop: Only "Retry indexing" for a file whose indexing failed; sources are uploaded copies, so nothing can be re-fetched from where it came from.

## S37.37 Notebook-to-main-chat context handoff.
- Should: From the main chat the user can bring a notebook's context into the conversation.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:3867; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2213; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2550; apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx:127; apps/mobile/stores/chat/chatMessageStore.ts:696; apps/cli/src/agent/chat.rs:619; apps/cli/src/agent/chat.rs:992; apps/cli/src/cloud/mod.rs:148
- Unfinished: web: ['ui'] | desktop: ['ui']

## S37.38 Cross-application notebook synchronization.
- Should: A notebook and its sources and notes are available in every app the user signs into.
- Status: web done, desktop done, mobile done, cli done
- Code: packages/ui/unified-chat/src/components/ProjectGallery.tsx:230; apps/web/app/api/projects/[id]/route.ts:105; apps/mobile/app/(app)/projects/[id].tsx:172; apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx:199; apps/cli/src/lib.rs:2101; apps/cli/src/lib.rs:1893
- Unfinished: mobile: ['flag-off']

## S37.39 Notebook-specific compute and generation allowance.
- Should: Notebooks have their own generation/compute allowance shown to the user.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
