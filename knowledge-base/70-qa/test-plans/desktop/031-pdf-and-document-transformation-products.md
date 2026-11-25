---
id: "PLAN-desktop-031"
type: "test-plan"
title: "Desktop · 31. PDF and document-transformation products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "31"
---
# Desktop · 31. PDF and document-transformation products

11 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S31.01 Text-document to PDF conversion.

- **Expected:** The user can turn a text document (Word, text, markdown) into a PDF file.
- **Code:** done. Evidence moved: apps/web/lib/services/managed-office-file-service.ts:162 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:755
- **Where to find it:** Library > open a text document artifact > its download menu > Download as PDF (labels found in the code)
- **Needs:** a text document artifact (create one in chat first, or use an existing one)
- **Steps:**
  1. From the first screen after sign-in, click Library in the sidebar and open a saved text document (a document-type artifact).
  2. Open the artifact's download menu in its preview (the menu that holds Download as HTML, Download as Markdown).
  3. Click Download as PDF. The option appears only for document artifacts that are not Word or PDF files.
  4. Compare with Expected: a PDF file should download. Also check Export as PDF in the library export menu, which lists PDF when the artifact allows it.

## S31.02 Spreadsheet to PDF conversion.

- **Expected:** The user can turn a spreadsheet into a PDF file.
- **Code:** done. Evidence present: apps/web/lib/server/container-files.ts:197; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:666
- **Where to find it:** not found in the code. No spreadsheet-to-PDF option was found. The PDF options are only for document artifacts and presentations (ArtifactPreview.tsx), and the support page apps/web/content/support/artifacts.md says there is no spreadsheet export on web. Spreadsheet export offers Excel only (ArtifactRenderer.tsx). Searched for the PDF labels and for container-files.ts usage.

## S31.03 Presentation to PDF conversion.

- **Expected:** The user can turn a slide deck into a PDF with one page per slide.
- **Code:** partial. Evidence present: apps/web/scripts/build-e2b-office-template.mjs:39
- **Known to be unfinished:** owner: run node apps/web/scripts/build-e2b-office-template.mjs with E2B credentials, set AGI_E2B_CHAT_TEMPLATE=agi-office-interpreter and AGI_E2B_EXECUTION=1; live-check a PPTX converts to PDF
- **Where to find it:** Library > open a presentation artifact > its download menu > Download as PDF (labels found in the code)
- **Needs:** a presentation artifact (create a slide deck in chat first)
- **Steps:**
  1. From the first screen after sign-in, click Library in the sidebar and open a saved presentation (slide deck) artifact.
  2. Open the artifact's download menu in its preview.
  3. Click Download as PDF. The export runs through the local deck PDF code (presentation/deck-pdf) and shows the toast Preparing the PDF.
  4. Compare with Expected: the PDF should download with one page per slide. Toast text: PDF downloaded.

## S31.04 PDF summarization.

- **Expected:** The user attaches a PDF and gets a summary of its content.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7013; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:683; apps/web/lib/server/pdf-attachment-content.ts:208
- **Where to find it:** New chat > attach a PDF with the attachment control in the message box > type a request for a summary > send (labels found in the code)
- **Needs:** a PDF file to upload
- **Steps:**
  1. From the first screen after sign-in, start a new chat.
  2. Attach a PDF using the attachment control in the message box. The hidden file input is labelled File upload; its visible button label was not found.
  3. Type a request such as Summarize this PDF, then send the message.
  4. Compare with Expected: the answer should be a summary of the PDF content. A PDF attachment also opens a preview in the message.

## S31.05 PDF question answering.

- **Expected:** The user attaches a PDF and gets answers to questions about its content.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7013; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:683; apps/web/lib/server/pdf-attachment-content.ts:208
- **Where to find it:** Library > select a PDF file > Ask about this file > type a question > send (labels found in the code)
- **Needs:** a PDF file saved in the Library
- **Steps:**
  1. From the first screen after sign-in, click Library in the sidebar and select a PDF file that was saved there.
  2. In the viewer, click the Ask about this file box at the bottom.
  3. Type a question about the PDF content and send it. A new chat opens with the file attached and the question written.
  4. Compare with Expected: the answer should use facts from the PDF.

## S31.06 Page-specific questions.

- **Expected:** The user can ask about a specific page of a PDF and the answer uses that page.
- **Code:** done. Evidence moved: apps/web/lib/server/pdf-attachment-content.ts:170 (quoted code not found in the file now); apps/web/lib/server/pdf-attachment-content.ts:217 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:702; apps/web/lib/server/project-knowledge-anchors.ts:52; apps/web/lib/services/project-context-service.ts:684; apps/web/lib/services/project-context-service.ts:729
- **Where to find it:** Library > select a PDF file > Ask about this file > type a question naming a page > send (labels found in the code)
- **Needs:** a multi-page PDF file saved in the Library
- **Steps:**
  1. From the first screen after sign-in, click Library and select a multi-page PDF.
  2. In the Ask about this file box, type a question that names a page, for example What does page 3 say?
  3. Send the question and wait for the new chat to answer.
  4. Compare with Expected: the answer should match the text of that page. The page content is marked [Page n] in the extracted text.

## S31.07 PDF text extraction.

- **Expected:** The user can get the plain text of a PDF.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:666; apps/web/lib/server/container-files.ts:197
- **Where to find it:** Library > select a PDF file > Ask about this file > type a request for the full text > send (labels found in the code)
- **Needs:** a PDF file with selectable text
- **Steps:**
  1. From the first screen after sign-in, click Library and select a PDF file.
  2. In the Ask about this file box, type a request such as Give me the plain text of this PDF, then send it.
  3. Compare with Expected: the reply should contain the document's text in plain form.

## S31.08 Scanned-document OCR.

- **Expected:** Text in a scanned (image-only) PDF is recognised and usable.
- **Code:** done. Evidence present: apps/web/lib/server/pdf-attachment-content.ts:10; apps/web/lib/server/pdf-attachment-content.ts:248; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:708; apps/web/lib/server/project-knowledge-extraction.ts:193
- **Where to find it:** no screen of its own. There is no OCR button; recognition happens when the model reads the page image, as described at apps/web/lib/server/pdf-attachment-content.ts (scanned page, attached as an image).
- **Needs:** a scanned image-only PDF file
- **Steps:**
  1. Click Library, select a scanned PDF (image-only pages), and use the Ask about this file box to ask for its text.
  2. Compare with Expected: the reply should contain readable text from the scanned pages. A page that is only an image is sent to the model as an image.

## S31.09 Table extraction.

- **Expected:** Tables in a PDF come out as structured rows and columns the user can use.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:666; apps/web/lib/server/container-files.ts:197
- **Where to find it:** not found in the code. No table-specific control or structured table output was found in the UI. Searched container-files.ts and chat-attachment-hydration.ts for table handling and the UI for table export; the only export options seen are PDF, Word and Excel for artifacts.
- **Needs:** a PDF containing a table

## S31.23 Signature-service integration.

- **Expected:** The user can send a document for e-signature through a connected signature service.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/catalog.ts:248 (quoted code not found in the file now)
- **Known to be unfinished:** owner: register the Docusign developer app (integration key, OAuth client pair, redirect URI) and set the DOCUSIGN_* env vars; catalog and endpoint entries exist (apps/web/lib/connectors/catalog.ts:248)
- **Where to find it:** not found in the code. The docusign entry is in apps/web/lib/connectors/catalog.ts at line 256 (the audit said 248). A connectors area exists in settings (PrivacySection.tsx and ToolApprovalDefaultsPanel.tsx mention Connectors), but the exact menu path to the DocuSign card was not found. Signature sending was not located in the UI.
- **Needs:** a DocuSign developer app and the DOCUSIGN_* environment variables (owner-only setup, not yet done)

## S31.24 Export fidelity preview.

- **Expected:** Before a file is exported, the user sees a preview that matches the exported file.
- **Code:** done. Evidence moved: apps/web/features/chat/lib/office-file-preview.ts:173; apps/web/features/chat/lib/office-file-preview.ts:50 (quoted code not found in the file now); apps/web/features/chat/components/messages/MessageBubble.tsx:1703; apps/web/features/chat/components/messages/MessageBubble.tsx:1712; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:734
- **Where to find it:** Chat > open a presentation or Word artifact in the artifact panel > its preview > download menu > Download as PDF (labels found in the code)
- **Needs:** a presentation or document artifact
- **Steps:**
  1. From the first screen after sign-in, open a chat that produced a presentation or document artifact and open it in the artifact panel.
  2. Look at the preview shown before export (presentation slides or document view).
  3. Open the download menu and click Download as PDF.
  4. Compare with Expected: the downloaded PDF should match the preview. For documents there is no separate preview step before the file downloads.
