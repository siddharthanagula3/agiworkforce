---
id: "PLAN-desktop-027"
type: "test-plan"
title: "Desktop · 27. Document and writing editor"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "27"
---
# Desktop · 27. Document and writing editor

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S27.01 Document title.

- **Expected:** A document shows its title in its card and viewer, falling back to a default when it has none.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1399; apps/web/features/chat/stores/artifacts-store.ts:160
- **Where to find it:** Chat > open a conversation that has a document > the document card in the reply shows its title. Open it: the viewer header shows the same title. (labels found in the code)
- **Needs:** a signed-in account and a document made in chat
- **Steps:**
  1. Sign in and open a chat that has a document made by Claude.
  2. Look at the document card in the reply: it shows the document title.
  3. Click the card to open the document in the side panel.
  4. Look at the viewer title. Compare with Expected: a title shows, and a document with no title shows Untitled.

## S27.03 Markdown editing mode.

- **Expected:** The user can switch a document to a Markdown source mode, edit the text and save it back as a new version.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1342 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:485 (quoted code not found in the file now)
- **Where to find it:** Chat > open a document > Preview tab > Edit (Edit document). Or More menu > Edit source. Then Save or Cancel. (labels found in the code)
- **Needs:** a signed-in account and a document made in chat (not a code artifact)
- **Steps:**
  1. Open a document made in chat in the side panel. Stay on the Preview tab.
  2. Click Edit in the header (or open the More menu and choose Edit source).
  3. Change the text in the editor.
  4. Click Save. Compare with Expected: the text is saved as a new version and the viewer shows it.

## S27.06 Bold, italic, underline, and links.

- **Expected:** The user can make text bold, italic or underlined and add links in a document.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:387; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:674 (quoted code not found in the file now)
- **Where to find it:** Chat > open a document > Preview tab > Edit > select text > formatting toolbar: Bold, Italic, Link. (labels found in the code)
- **Needs:** a signed-in account and a document made in chat
- **Steps:**
  1. Open a document in the side panel and click Edit.
  2. Select some words.
  3. Click Bold, then Italic, then Link (Link asks for a web address and adds it to the selection).
  4. Look at the text. Compare with Expected: bold and italic show, and the link is set. Underline was not found in the toolbar.

## S27.07 Lists and checklists.

- **Expected:** The user can create bulleted, numbered and checklist items in a document.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/taskList.ts:34; packages/ui/unified-chat/src/components/markdown/taskList.ts:40; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:438; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:501; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1162; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1183; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1934
- **Where to find it:** Chat > open a document > Preview tab > Edit > formatting toolbar: Bulleted list, Numbered list, Checklist. (labels found in the code)
- **Needs:** a signed-in account and a document made in chat
- **Steps:**
  1. Open a document in the side panel and click Edit.
  2. Click Bulleted list, then Numbered list, and type items.
  3. Click Checklist and type a few items.
  4. Tick a checklist box in the Preview tab. Compare with Expected: all three list types appear and checkboxes toggle.

## S27.08 Tables.

- **Expected:** The user can insert and edit tables in a document.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:72; apps/web/lib/services/managed-office-file-service.ts:452
- **Where to find it:** Chat > open a document > Preview tab > Edit > formatting toolbar: Insert table. (labels found in the code)
- **Needs:** a signed-in account and a document made in chat
- **Steps:**
  1. Open a document in the side panel and click Edit.
  2. Click Insert table in the formatting toolbar.
  3. Type text into the table cells.
  4. Look at the table. Compare with Expected: a table is inserted and it can be edited.

## S27.09 Images.

- **Expected:** The user can insert images into a document and see them rendered.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:72
- **Where to find it:** not found in the code. Images render in the Markdown preview (MarkdownContent.tsx renders img and asks approval for external hosts), but no insert-image control was found in DocumentFormattingToolbar.tsx or ArtifactPreview.tsx; searched for Insert image and label="Image" under apps/web/features/chat/components/artifacts and packages/ui/unified-chat.
- **Needs:** a document that has an image link

## S27.11 Code and equation blocks.

- **Expected:** The user can add code blocks and math equations to a document and see them rendered.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:73; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:822
- **Where to find it:** Chat > open a document > Preview tab > Edit > formatting toolbar: Code block (also under the Text style menu). (labels found in the code)
- **Needs:** a signed-in account and a document made in chat
- **Steps:**
  1. Open a document in the side panel and click Edit.
  2. Click Code block in the toolbar and type a few lines of code.
  3. Click Save and go to the Preview tab.
  4. Look at the code block. Compare with Expected: it shows as a code block. Math has no toolbar control.

## S27.12 Outline panel.

- **Expected:** A document view offers an outline of its headings that jumps to each section.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:202 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:327
- **Where to find it:** Chat > open a document with 3 or more headings > Preview tab > Outline. (labels found in the code)
- **Needs:** a document with 3 or more headings
- **Steps:**
  1. Open a document that has at least 3 headings in the side panel.
  2. Stay on the Preview tab and click Outline.
  3. Click one heading in the list.
  4. Look at the page. Compare with Expected: the view jumps to that section.

## S27.27 Autosave indicator.

- **Expected:** While editing, the document saves automatically and shows its save state (saving / saved).
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1086; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:669 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2733
- **Where to find it:** Chat > open a document > Preview tab > Edit > type text > look at the header next to Save. (labels found in the code)
- **Needs:** a signed-in account and a document made in chat
- **Steps:**
  1. Open a document in the side panel and click Edit.
  2. Type a sentence.
  3. Look at the header next to Save: it shows Draft kept on this device, or Draft not kept.
  4. Click Save and check that a new version is listed in Version history. Compare with Expected: the document saves on its own and shows saving and saved states.

## S27.28 Undo and redo.

- **Expected:** Undo and redo work while editing a document.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1864 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:485 (quoted code not found in the file now)
- **Where to find it:** Chat > open a document with more than one version > side panel header: Undo last change and Redo change buttons (also in the More menu as Undo and Redo). (labels found in the code)
- **Needs:** a signed-in account and a document with more than one saved version
- **Steps:**
  1. Open a saved document that has been edited at least once, in the side panel.
  2. Click Edit, change text, and click Save so a new version exists.
  3. Click the Undo last change button in the header.
  4. Click Redo change, and compare with Expected: the previous text returns and then the newer text returns.

## S27.29 Revision history.

- **Expected:** The user can browse a document's past revisions with their times and open or restore one.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2672; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2981; apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:69; apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:152; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1022
- **Where to find it:** Chat > open a document with more than one version > Version history button in the header > click Version 1 (or any version) > Restore. (labels found in the code)
- **Needs:** a signed-in account and a document with several versions
- **Steps:**
  1. Open a document that has several versions in the side panel.
  2. Click the Version history button in the header.
  3. Read the list: each version shows its number, Latest on the newest, and its date and time.
  4. Click a version to open it, click Restore, confirm Restore in the dialog, and compare with Expected: the restored text shows and a new version is added.

## S27.35 Export to document formats.

- **Expected:** A document can be exported to office document formats (e.g. Word/DOCX).
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1655; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3504
- **Where to find it:** Chat > open a document > Download (the Download artifact button) > Download as Word (.docx). (labels found in the code)
- **Needs:** a signed-in account and a document made in chat
- **Steps:**
  1. Open a document in the side panel.
  2. Click the Download button in the header (aria label Download artifact).
  3. Click Download as Word (.docx).
  4. Open the saved file in Word or Pages. Compare with Expected: a .docx file with the document text opens.

## S27.36 Export to PDF.

- **Expected:** A document can be exported as a PDF.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1655; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3504
- **Where to find it:** Chat > open a document > Download (the Download artifact button) > Download as PDF. (labels found in the code)
- **Needs:** a signed-in account and a document made in chat
- **Steps:**
  1. Open a document in the side panel.
  2. Click the Download button in the header.
  3. Click Download as PDF.
  4. Open the saved PDF. Compare with Expected: a PDF file with the document text opens.

## S27.37 Export to Markdown.

- **Expected:** A document can be exported as a Markdown file.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2394; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1396
- **Where to find it:** Chat > open a document > Download (the Download artifact button) > Download as Markdown. (labels found in the code)
- **Needs:** a signed-in account and a document made in chat
- **Steps:**
  1. Open a document in the side panel.
  2. Click the Download button in the header.
  3. Click Download as Markdown.
  4. Open the saved .md file in a text editor. Compare with Expected: the file is Markdown text with the document content.
