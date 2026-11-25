---
id: "REQ-AREA-037"
type: "requirements"
title: "Requirement items: Notebook and knowledge-workspace product"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 37. Notebook and knowledge-workspace product

39 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S37.01

**Notebook index.** The user sees a list of their notebooks (knowledge workspaces) and can open one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F037-01 Notebook list and creation](../../20-features/037-notebook-and-knowledge-workspace-product/F037-01-notebook-list-and-creation.md)

## S37.02

**Notebook creation.** The user can create a new notebook that is saved to the account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F037-01 Notebook list and creation](../../20-features/037-notebook-and-knowledge-workspace-product/F037-01-notebook-list-and-creation.md)

## S37.03

**Notebook title and description.** A notebook has a title and description the user can set and later edit.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F037-02 Title, description and instructions](../../20-features/037-notebook-and-knowledge-workspace-product/F037-02-title-description-and-instructions.md)

## S37.04

**Source rail.** Inside a notebook, a source list sits beside the conversation so the user can see what grounds the answers.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F037-04 Source list, search and source rail](../../20-features/037-notebook-and-knowledge-workspace-product/F037-04-source-list-search-and-source-rail.md)

## S37.05

**Source checkboxes.** Each source has a checkbox so the user chooses which sources ground the next answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-04 Source list, search and source rail](../../20-features/037-notebook-and-knowledge-workspace-product/F037-04-source-list-search-and-source-rail.md)

## S37.06

**Add files.** The user can add files (PDF, docs, text) to a notebook as sources and they are indexed for its chats.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F037-05 Add files and text sources](../../20-features/037-notebook-and-knowledge-workspace-product/F037-05-add-files-and-text-sources.md)

## S37.07

**Add website.** The user can add a website URL as a source; its text is fetched and indexed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-06 Website, video, audio and connected documents](../../20-features/037-notebook-and-knowledge-workspace-product/F037-06-website-video-audio-and-connected-documents.md)

## S37.08

**Add video transcript.** The user can add a video (e.g. YouTube link) whose transcript becomes a source.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-06 Website, video, audio and connected documents](../../20-features/037-notebook-and-knowledge-workspace-product/F037-06-website-video-audio-and-connected-documents.md)

## S37.09

**Add audio.** The user can add an audio file that is transcribed into a source.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-06 Website, video, audio and connected documents](../../20-features/037-notebook-and-knowledge-workspace-product/F037-06-website-video-audio-and-connected-documents.md)

## S37.10

**Add connected document.** The user can add a document from a connected service (e.g. Google Drive) as a source.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile missing, CLI missing, Chrome missing
- Feature: [F037-06 Website, video, audio and connected documents](../../20-features/037-notebook-and-knowledge-workspace-product/F037-06-website-video-audio-and-connected-documents.md)

## S37.11

**Add written note.** The user can write or paste a note and add it to the notebook as a source.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F037-05 Add files and text sources](../../20-features/037-notebook-and-knowledge-workspace-product/F037-05-add-files-and-text-sources.md)

## S37.12

**Source guide or summary.** Each source gets an automatic guide or summary the user can read.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-07 Source guide and refresh](../../20-features/037-notebook-and-knowledge-workspace-product/F037-07-source-guide-and-refresh.md)

## S37.13

**Source search.** The user can search across or for sources inside the notebook.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-04 Source list, search and source rail](../../20-features/037-notebook-and-knowledge-workspace-product/F037-04-source-list-search-and-source-rail.md)

## S37.14

**Source-grounded chat.** Chats in the notebook answer from its sources.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F037-08 Source-grounded chat and citation links](../../20-features/037-notebook-and-knowledge-workspace-product/F037-08-source-grounded-chat-and-citation-links.md)

## S37.15

**Notebook instructions.** The notebook has instructions that apply to every chat in it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F037-02 Title, description and instructions](../../20-features/037-notebook-and-knowledge-workspace-product/F037-02-title-description-and-instructions.md)

## S37.16

**Saved chat responses.** The user can save a chat response into the notebook (as a note or source) in one action.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F037-09 Notebook notes](../../20-features/037-notebook-and-knowledge-workspace-product/F037-09-notebook-notes.md)

## S37.17

**Notebook notes.** The notebook holds user notes that can be listed, opened and edited.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F037-09 Notebook notes](../../20-features/037-notebook-and-knowledge-workspace-product/F037-09-notebook-notes.md)

## S37.18

**Editable notes beside sources.** Notes are editable in a panel next to the sources.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-09 Notebook notes](../../20-features/037-notebook-and-knowledge-workspace-product/F037-09-notebook-notes.md)

## S37.19

**Citation-linked navigation.** A citation in an answer links to the cited source passage, opening it at that place.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-08 Source-grounded chat and citation links](../../20-features/037-notebook-and-knowledge-workspace-product/F037-08-source-grounded-chat-and-citation-links.md)

## S37.20

**Studio/output panel.** A Studio/output panel lists one-click outputs generated from the notebook sources.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-10 Studio one-click outputs](../../20-features/037-notebook-and-knowledge-workspace-product/F037-10-studio-one-click-outputs.md)

## S37.21

**Audio overview.** One click generates a spoken audio overview of the sources.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-11 Audio, video, quiz, flashcards and learning overview](../../20-features/037-notebook-and-knowledge-workspace-product/F037-11-audio-video-quiz-flashcards-and-learning-overview.md)

## S37.22

**Video overview.** One click generates a narrated video overview of the sources.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-11 Audio, video, quiz, flashcards and learning overview](../../20-features/037-notebook-and-knowledge-workspace-product/F037-11-audio-video-quiz-flashcards-and-learning-overview.md)

## S37.23

**Briefing document.** One click turns the sources into a briefing document.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-10 Studio one-click outputs](../../20-features/037-notebook-and-knowledge-workspace-product/F037-10-studio-one-click-outputs.md)

## S37.24

**Study guide.** One click turns the sources into a study guide.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-10 Studio one-click outputs](../../20-features/037-notebook-and-knowledge-workspace-product/F037-10-studio-one-click-outputs.md)

## S37.25

**Frequently asked questions.** One click turns the sources into an FAQ.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-10 Studio one-click outputs](../../20-features/037-notebook-and-knowledge-workspace-product/F037-10-studio-one-click-outputs.md)

## S37.26

**Timeline.** One click turns the sources into a timeline.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-10 Studio one-click outputs](../../20-features/037-notebook-and-knowledge-workspace-product/F037-10-studio-one-click-outputs.md)

## S37.27

**Mind map.** One click turns the sources into a mind map.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-10 Studio one-click outputs](../../20-features/037-notebook-and-knowledge-workspace-product/F037-10-studio-one-click-outputs.md)

## S37.28

**Data table.** One click extracts a data table from the sources.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-10 Studio one-click outputs](../../20-features/037-notebook-and-knowledge-workspace-product/F037-10-studio-one-click-outputs.md)

## S37.29

**Infographic.** One click turns the sources into an infographic.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-11 Audio, video, quiz, flashcards and learning overview](../../20-features/037-notebook-and-knowledge-workspace-product/F037-11-audio-video-quiz-flashcards-and-learning-overview.md)

## S37.30

**Slide deck.** One click turns the sources into a slide deck.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-10 Studio one-click outputs](../../20-features/037-notebook-and-knowledge-workspace-product/F037-10-studio-one-click-outputs.md)

## S37.31

**Quiz.** One click generates a quiz from the sources that the user can answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-11 Audio, video, quiz, flashcards and learning overview](../../20-features/037-notebook-and-knowledge-workspace-product/F037-11-audio-video-quiz-flashcards-and-learning-overview.md)

## S37.32

**Flashcard set.** One click generates a flashcard set from the sources.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-11 Audio, video, quiz, flashcards and learning overview](../../20-features/037-notebook-and-knowledge-workspace-product/F037-11-audio-video-quiz-flashcards-and-learning-overview.md)

## S37.33

**Interactive learning overview.** One click generates an interactive learning overview of the sources.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-11 Audio, video, quiz, flashcards and learning overview](../../20-features/037-notebook-and-knowledge-workspace-product/F037-11-audio-video-quiz-flashcards-and-learning-overview.md)

## S37.34

**Notebook sharing.** The user can share a notebook with others with a chosen access level.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-03 Sharing and cross-app sync](../../20-features/037-notebook-and-knowledge-workspace-product/F037-03-sharing-and-cross-app-sync.md)

## S37.35

**Notebook export.** The user can export a notebook (sources, notes, chats) as a file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F037-12 Notebook allowance, storage and export](../../20-features/037-notebook-and-knowledge-workspace-product/F037-12-notebook-allowance-storage-and-export.md)

## S37.36

**Source refresh.** A source added from a live location can be refreshed to pick up changes.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-07 Source guide and refresh](../../20-features/037-notebook-and-knowledge-workspace-product/F037-07-source-guide-and-refresh.md)

## S37.37

**Notebook-to-main-chat context handoff.** From the main chat the user can bring a notebook's context into the conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F037-08 Source-grounded chat and citation links](../../20-features/037-notebook-and-knowledge-workspace-product/F037-08-source-grounded-chat-and-citation-links.md)

## S37.38

**Cross-application notebook synchronization.** A notebook and its sources and notes are available in every app the user signs into.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F037-03 Sharing and cross-app sync](../../20-features/037-notebook-and-knowledge-workspace-product/F037-03-sharing-and-cross-app-sync.md)

## S37.39

**Notebook-specific compute and generation allowance.** Notebooks have their own generation/compute allowance shown to the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F037-12 Notebook allowance, storage and export](../../20-features/037-notebook-and-knowledge-workspace-product/F037-12-notebook-allowance-storage-and-export.md)
