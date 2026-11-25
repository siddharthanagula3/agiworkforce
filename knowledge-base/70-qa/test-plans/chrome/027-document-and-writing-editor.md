---
id: "PLAN-chrome-027"
type: "test-plan"
title: "Chrome · 27. Document and writing editor"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "27"
---
# Chrome · 27. Document and writing editor

18 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S27.01 Document title.

- **Expected:** A document shows its title in its card and viewer, falling back to a default when it has none.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The extension has no document type. Searched apps/extension for document, title and untitled. The closest is artifact cards and the artifact panel title, which fall back to "Untitled artifact" (spArtifactsUntitled in apps/extension/_locales/en/messages.json), but that is not a document.

## S27.03 Markdown editing mode.

- **Expected:** The user can switch a document to a Markdown source mode, edit the text and save it back as a new version.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No Markdown source mode or save-as-new-version found. The artifact panel has a Preview and Code view toggle (apps/extension/src/features/side-panel/artifactPanel.ts), and the Code view shows text with no editing or save found.

## S27.06 Bold, italic, underline, and links.

- **Expected:** The user can make text bold, italic or underlined and add links in a document.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No bold, italic, underline or link controls found. The chat composer is a plain textarea (sp-input in apps/extension/src/side_panel.ts). Markdown bold and links appear only in assistant replies.

## S27.07 Lists and checklists.

- **Expected:** The user can create bulleted, numbered and checklist items in a document.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel chat box > ask the assistant for a checklist (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open the side panel and click in the chat box.
  2. Type a request such as: make a checklist for packing a suitcase, then send it.
  3. In the reply, find the checklist items shown with checkboxes.
  4. Tick one box and check that the item is marked done, compared with the Expected line.

## S27.08 Tables.

- **Expected:** The user can insert and edit tables in a document.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No insert or edit table control found in apps/extension. Tables are not shown as editable in any place searched.

## S27.09 Images.

- **Expected:** The user can insert images into a document and see them rendered.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel chat box > Add attachment button > Upload from device > choose a PNG, JPEG, WebP or GIF image (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Open the side panel and click the Add attachment button beside the chat box.
  2. Click Upload from device and pick a PNG, JPEG, WebP or GIF image.
  3. Check the image appears as an attachment in the chat box before sending.
  4. Send, and check the image is rendered in the sent message, compared with the Expected line.

## S27.11 Code and equation blocks.

- **Expected:** The user can add code blocks and math equations to a document and see them rendered.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel chat box > ask the assistant for a code sample and a math formula (labels found in the code)
- **Steps:**
  1. Open the side panel and click in the chat box.
  2. Type a request such as: show a short Python function and the quadratic formula in LaTeX, then send it.
  3. In the reply, check the code block has a Copy code button.
  4. Check the formula is shown as typeset math and not as raw LaTeX, compared with the Expected line.

## S27.12 Outline panel.

- **Expected:** A document view offers an outline of its headings that jumps to each section.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No outline or heading navigation panel found in apps/extension. Searched for outline and heading terms.

## S27.21 Translate selection.

- **Expected:** The user can translate a selected passage into another language.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:16289; apps/extension/src/side_panel.ts:14725 (quoted code not found in the file now)
- **Where to find it:** Web page > select some text > right-click the selection > Translate this (labels found in the code)
- **Steps:**
  1. Open any web page with readable text and select a sentence or two.
  2. Right-click the selection and choose Translate this.
  3. Check that the side panel opens and the chat box is filled with a prompt to translate the selected text into your browser language.
  4. Send the prompt and check the reply is the translation, compared with the Expected line.

## S27.27 Autosave indicator.

- **Expected:** While editing, the document saves automatically and shows its save state (saving / saved).
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No document editor, so no autosave or saving or saved indicator for documents was found. The only saved state found is on the options page (apps/extension/src/options.ts).

## S27.28 Undo and redo.

- **Expected:** Undo and redo work while editing a document.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No document undo or redo found. The only undo found is Undo insertion after Rewrite selection on a web page text field (spRewriteUndo in apps/extension/_locales/en/messages.json).

## S27.29 Revision history.

- **Expected:** The user can browse a document's past revisions with their times and open or restore one.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No revision history in apps/extension. The version history component (packages/ui/unified-chat/src/components/artifact-components/ArtifactVersionHistory.tsx) is not imported by the extension.

## S27.34 Citation management.

- **Expected:** The user can add, edit and format citations and a bibliography in a document.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No citation add, edit or bibliography control found. Source citations appear only in replies (spCitationMore in apps/extension/_locales/en/messages.json).

## S27.35 Export to document formats.

- **Expected:** A document can be exported to office document formats (e.g. Word/DOCX).
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No DOCX export found. The artifact panel Download covers only html, react, svg and mermaid types (ARTIFACT_FILE_EXTENSION in apps/extension/src/features/side-panel/artifactPanel.ts). Server answer files were not traced for DOCX.

## S27.36 Export to PDF.

- **Expected:** A document can be exported as a PDF.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No PDF export found in apps/extension. Searched for pdf and export terms. Server answer files were not traced for PDF.

## S27.37 Export to Markdown.

- **Expected:** A document can be exported as a Markdown file.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No Markdown file export found. The artifact panel Copy copies the source text, and Download covers only html, react, svg and mermaid types.

## S27.39 Email draft presentation.

- **Expected:** An email the assistant drafts is presented as an email (subject, recipients, body) rather than plain text.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel chat box > ask the assistant to draft an email (labels found in the code)
- **Steps:**
  1. Open the side panel and click in the chat box.
  2. Type a request such as: draft an email to a colleague about Thursday's review, then send it.
  3. In the reply, find the section headed Email with a Copy email button.
  4. Check that To and Subject lines are shown with the body, compared with the Expected line.

## S27.40 Recipient, subject, and attachment fields.

- **Expected:** An email draft has editable recipient, subject and attachment fields.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The extension renders email drafts as static text (apps/extension/src/features/side-panel/markdown.ts). Editable To, Subject and body fields exist only in the shared React EmailBlock (packages/ui/unified-chat/src/components/markdown/EmailBlock.tsx), which the extension does not use. EmailDraft has no attachment field.
