---
id: "PLAN-mobile-027"
type: "test-plan"
title: "Mobile · 27. Document and writing editor"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "27"
---
# Mobile · 27. Document and writing editor

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S27.01 Document title.

- **Expected:** A document shows its title in its card and viewer, falling back to a default when it has none.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:153 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:310 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:1240
- **Where to find it:** Chat (first screen after signing in) > ask for a document > tap the document card in the answer > read the title at the top of the full-screen view, shown as the title followed by " · Document" (labels found in the code)
- **Needs:** A signed-in account that can generate documents in Chat
- **Steps:**
  1. Sign in and open Chat.
  2. Send a message that asks for a written document, for example a short one-page plan.
  3. Wait for the answer to show a document card, and read the title shown on the card.
  4. Tap the card to open the document full screen.
  5. Compare the title at the top of the full-screen view with the title on the card, and check that it is not blank.

## S27.29 Revision history.

- **Expected:** The user can browse a document's past revisions with their times and open or restore one.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1929; apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx:119; apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx:136
- **Where to find it:** Chat > open a document (tap its card) > tap the version counter in the top bar (accessibility hint "Opens the version history") > "Version history" sheet > tap a version row to view it, or tap "Restore" on an older row (labels found in the code)
- **Needs:** A document with at least two versions (ask for a change once, or edit it, before starting)
- **Steps:**
  1. Open a document that has been changed at least once, for example by asking for changes in Chat, so it has more than one version.
  2. In the document's top bar, tap the version counter (it shows the version number out of the total).
  3. Read the "Version history" sheet: check that each past version is listed with its time.
  4. Tap an older version row to view it, then check that the document shows that version's content.
  5. Tap "Restore" on that older row, then check that the document content returns to that version and that a newer entry is kept in the history.

## S27.35 Export to document formats.

- **Expected:** A document can be exported to office document formats (e.g. Word/DOCX).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/utils/artifactExport.ts:96; apps/mobile/services/docxExport.ts:182
- **Where to find it:** Chat > open a document (tap its card) > tap the download icon in the top bar (accessibility label "Download artifact") > "Download as" sheet > tap "Word" (labels found in the code)
- **Needs:** A signed-in account with a document open; a Mac app that opens .docx files
- **Steps:**
  1. Open a document in Chat so the full-screen view shows.
  2. Tap the download icon in the top bar. It has no visible words; VoiceOver reads it as "Download artifact".
  3. In the sheet headed "Download as", look for the option "Word" with the detail "A .docx document you can edit".
  4. Tap "Word" and wait for the share or save step to appear.
  5. Open the saved or shared file on the Mac and check that it is a Word document with the document's text.

## S27.36 Export to PDF.

- **Expected:** A document can be exported as a PDF.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/utils/artifactExport.ts:95; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1339
- **Where to find it:** Chat > open a document (tap its card) > tap the download icon in the top bar (accessibility label "Download artifact") > "Download as" sheet > tap "PDF" (labels found in the code)
- **Needs:** A signed-in account with a document open
- **Steps:**
  1. Open a document in Chat so the full-screen view shows.
  2. Tap the download icon in the top bar. It has no visible words; VoiceOver reads it as "Download artifact".
  3. In the sheet headed "Download as", look for the option "PDF" with the detail "A styled document".
  4. Tap "PDF" and wait for the share or save step to appear.
  5. Open the saved or shared file and check that it is a PDF with the document's title and text.

## S27.37 Export to Markdown.

- **Expected:** A document can be exported as a Markdown file.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/utils/artifactExport.ts:81; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1339
- **Where to find it:** Chat > open a document (tap its card) > tap the download icon in the top bar (accessibility label "Download artifact") > "Download as" sheet > tap "Markdown" (labels found in the code)
- **Needs:** A signed-in account with a document open
- **Steps:**
  1. Open a document in Chat so the full-screen view shows.
  2. Tap the download icon in the top bar. It has no visible words; VoiceOver reads it as "Download artifact".
  3. In the sheet headed "Download as", look for the option "Markdown" with the detail "A .md file that keeps the formatting".
  4. Tap "Markdown" and wait for the share or save step to appear.
  5. Open the saved or shared file and check that it is a .md file whose formatting (headings, lists) is kept as Markdown text.
