---
id: "PLAN-web-027"
type: "test-plan"
title: "Web · 27. Document and writing editor"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "27"
---
# Web · 27. Document and writing editor

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S27.01 Document title.

- **Expected:** A document shows its title in its card and viewer, falling back to a default when it has none.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1399; apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:297 (quoted code not found in the file now); apps/web/features/chat/stores/artifacts-store.ts:160
- **Where to find it:** Chat > open a Document artifact card > read the title at the top of the viewer; click the title to rename it (labels found in the code)
- **Needs:** a signed-in account and a Document artifact from a chat reply
- **Steps:**
  1. Sign in and open a chat that has a Document artifact (ask the assistant to write a document if none exists).
  2. Look at the Document artifact card in the chat and note its title.
  3. Click the card to open the viewer and read the title at the top.
  4. Click the title and look for the Rename action (tooltip text) to change it.
  5. Clear the title and compare: the card should show the default word Untitled and the viewer should show the default word Artifact.

## S27.03 Markdown editing mode.

- **Expected:** The user can switch a document to a Markdown source mode, edit the text and save it back as a new version.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1342 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1864 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:485 (quoted code not found in the file now)
- **Where to find it:** Chat > open a Document artifact > Source (header icon) or More > Edit source, type, then Save (labels found in the code)
- **Needs:** a signed-in account and a Document artifact from a chat reply
- **Steps:**
  1. Open a Document artifact from a chat reply (it must be the latest version).
  2. Click the Source icon in the viewer header, or open the More menu and click Edit source.
  3. Change some text in the Markdown source.
  4. Click Save (Save artifact source) to save it.
  5. Look for a new version in the version stepper and check that the text you typed is shown.

## S27.06 Bold, italic, underline, and links.

- **Expected:** The user can make text bold, italic or underlined and add links in a document.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:387; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:674 (quoted code not found in the file now)
- **Where to find it:** Chat > open a Document artifact > Edit source or Formatting toolbar > Bold, Italic, Link (labels found in the code)
- **Needs:** a signed-in account and a Document artifact from a chat reply
- **Steps:**
  1. Open a Document that the rich editor can keep (it opens in the formatting view, not the plain Markdown view).
  2. Select some words and click Bold, then Italic.
  3. Select words, click Link, type a web address and confirm.
  4. Click the Link text and check the address it opens.
  5. Compare what you see with the Expected: bold, italic and link should show on the text.

## S27.07 Lists and checklists.

- **Expected:** The user can create bulleted, numbered and checklist items in a document.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/taskList.ts:34; packages/ui/unified-chat/src/components/markdown/taskList.ts:40; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:438; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:501; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1162; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1183; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1934
- **Where to find it:** Chat > open a Document artifact > Formatting toolbar > Bulleted list, Numbered list, Checklist (labels found in the code)
- **Needs:** a signed-in account and a Document artifact from a chat reply
- **Steps:**
  1. Open a Document artifact in the formatting view.
  2. Click the Bulleted list button and type two lines.
  3. Click the Numbered list button on a new line.
  4. Click the Checklist button on a new line and type an item.
  5. Look at the result: three kinds of list should appear and the checklist should show a checkbox.

## S27.08 Tables.

- **Expected:** The user can insert and edit tables in a document.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:72; apps/web/lib/services/managed-office-file-service.ts:452
- **Where to find it:** Chat > open a Document artifact > Formatting toolbar > Insert table (labels found in the code)
- **Needs:** a signed-in account and a Document artifact from a chat reply
- **Steps:**
  1. Open a Document artifact in the formatting view.
  2. Click the Insert table button.
  3. Type text into the table cells and press Tab to move between cells.
  4. Look at the table: it should show rows and columns that can be edited.

## S27.09 Images.

- **Expected:** The user can insert images into a document and see them rendered.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:72
- **Where to find it:** not found in the code. Searched the artifacts folder for Insert image, Add image, Upload image and Insert: no image button exists in the document toolbar. Images render from Markdown, and the only image-replacement path found is for design artifacts (replaceImage in ArtifactPreview.tsx).
- **Needs:** a signed-in account and a Document artifact from a chat reply

## S27.11 Code and equation blocks.

- **Expected:** The user can add code blocks and math equations to a document and see them rendered.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:73; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:822
- **Where to find it:** Chat > open a Document artifact > Formatting toolbar > Code block; equations are typed in the Markdown source (labels found in the code)
- **Needs:** a signed-in account and a Document artifact from a chat reply
- **Steps:**
  1. Open a Document artifact in the formatting view.
  2. Click the Code block button and type some code.
  3. Open Source (or Edit source) and type a math line between dollar signs, for example a formula.
  4. Go back to the Preview and check that the code block shows as code and the formula renders as an equation.

## S27.12 Outline panel.

- **Expected:** A document view offers an outline of its headings that jumps to each section.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:202 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:327
- **Where to find it:** Chat > open a Document artifact in Preview > Outline (click to open) > click a heading (labels found in the code)
- **Needs:** a signed-in account and a Document artifact with 3 or more headings
- **Steps:**
  1. Open a Document artifact that has at least three headings, in Preview.
  2. Click Outline to open the list of headings.
  3. Click a heading in the list.
  4. Check that the document scrolls to that section.

## S27.27 Autosave indicator.

- **Expected:** While editing, the document saves automatically and shows its save state (saving / saved).
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1086; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:669 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2733
- **Where to find it:** Chat > open a Document artifact > Edit source or Formatting view; watch the Save button and the status text (labels found in the code)
- **Needs:** a signed-in account and a Document artifact from a chat reply
- **Steps:**
  1. Open a Document artifact and start editing it (Source, or Edit source).
  2. Type a few words and pause.
  3. Look at the header for the status text (Draft kept on this device or Draft not kept) and the Save button.
  4. Click Save and check that the status text and the new version appear.
  5. Compare with Expected: there should be a saving and a saved indicator.

## S27.28 Undo and redo.

- **Expected:** Undo and redo work while editing a document.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1864 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:485 (quoted code not found in the file now)
- **Where to find it:** Chat > open a Document artifact > More > Undo / Redo; in the formatting view, Formatting toolbar > Undo / Redo (labels found in the code)
- **Needs:** a signed-in account and a Document artifact with at least two saved versions
- **Steps:**
  1. Open a Document artifact that has at least two versions (edit and save once more).
  2. Open More and click Undo; check that the text goes back to the previous version.
  3. Open More again and click Redo; check that the newer text returns.
  4. In the formatting view, type text, then click Undo and Redo in the Formatting toolbar.
  5. Compare with Expected: undo and redo should move through the changes.

## S27.29 Revision history.

- **Expected:** The user can browse a document's past revisions with their times and open or restore one.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2672; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2981; apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:69; apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:152; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1022
- **Where to find it:** Chat > open a Document artifact > Version history (clock icon in the header) > Restore (labels found in the code)
- **Needs:** a signed-in account and a Document artifact with at least two versions
- **Steps:**
  1. Open a Document artifact that has at least two versions.
  2. Click the Version history button in the header.
  3. Read the list: each entry shows Version N and its time.
  4. Click Restore on an earlier version and confirm the Restore dialog.
  5. Check that the earlier text is shown and a new version was added.

## S27.35 Export to document formats.

- **Expected:** A document can be exported to office document formats (e.g. Word/DOCX).
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1655; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3504
- **Where to find it:** Chat > open a Document artifact > Download artifact > Download as Word (.docx) (labels found in the code)
- **Needs:** a signed-in account and a Document artifact from a chat reply
- **Steps:**
  1. Open a Document artifact in the viewer.
  2. Click the Download artifact button in the header.
  3. Click Download as Word (.docx).
  4. Open the downloaded file in Word or Pages.
  5. Compare with Expected: a Word document with the same text should open.

## S27.36 Export to PDF.

- **Expected:** A document can be exported as a PDF.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1655; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3504
- **Where to find it:** Chat > open a Document artifact > Download artifact > Download as PDF (labels found in the code)
- **Needs:** a signed-in account and a Document artifact from a chat reply
- **Steps:**
  1. Open a Document artifact in the viewer.
  2. Click the Download artifact button in the header.
  3. Click Download as PDF.
  4. Open the downloaded file in a PDF viewer.
  5. Compare with Expected: a PDF with the document text should open.

## S27.37 Export to Markdown.

- **Expected:** A document can be exported as a Markdown file.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2394; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1396
- **Where to find it:** Chat > open an artifact > Download artifact > Download as Markdown (labels found in the code)
- **Needs:** a signed-in account and an artifact from a chat reply
- **Steps:**
  1. Open a Document artifact in the viewer.
  2. Click the Download artifact button in the header.
  3. Click Download as Markdown.
  4. Open the downloaded .md file in a text editor.
  5. Compare with Expected: the file should contain the document as Markdown text.
