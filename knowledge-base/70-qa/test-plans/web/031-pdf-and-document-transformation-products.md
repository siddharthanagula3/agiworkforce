---
id: "PLAN-web-031"
type: "test-plan"
title: "Web · 31. PDF and document-transformation products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "31"
---
# Web · 31. PDF and document-transformation products

11 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S31.01 Text-document to PDF conversion.

- **Expected:** The user can turn a text document (Word, text, markdown) into a PDF file.
- **Code:** done. Evidence moved: apps/web/lib/services/managed-office-file-service.ts:162 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:755
- **Where to find it:** Open a text document artifact in a chat reply > Download artifact (the Download button) > Download as PDF (labels found in the code)
- **Needs:** a chat that already has a text document artifact
- **Steps:**
  1. Open a chat that has a text document (Word-style or markdown) shown as an artifact.
  2. Click the Download button on the artifact card (its title is Download).
  3. Click Download as PDF in the menu.
  4. Open the downloaded PDF and compare its text with the Expected line: a PDF of the document.

## S31.02 Spreadsheet to PDF conversion.

- **Expected:** The user can turn a spreadsheet into a PDF file.
- **Code:** done. Evidence present: apps/web/lib/server/container-files.ts:197; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:666
- **Where to find it:** not found in the code. Searched ArtifactPreview.tsx for PDF export; the spreadsheet/table download menu offers Download as CSV only, and PDF export is limited to text documents and presentations. The Code line pointed to apps/web/lib/server/container-files.ts:197, which is server code with no visible control.
- **Needs:** a spreadsheet artifact in a chat

## S31.03 Presentation to PDF conversion.

- **Expected:** The user can turn a slide deck into a PDF with one page per slide.
- **Code:** partial. Evidence present: apps/web/scripts/build-e2b-office-template.mjs:39
- **Known to be unfinished:** owner: run node apps/web/scripts/build-e2b-office-template.mjs with E2B credentials, set AGI_E2B_CHAT_TEMPLATE=agi-office-interpreter and AGI_E2B_EXECUTION=1; live-check a PPTX converts to PDF
- **Where to find it:** Open a presentation artifact in a chat reply > Download artifact (the Download button) > Download as PDF (labels found in the code)
- **Needs:** a chat that already has a presentation artifact
- **Steps:**
  1. Open a chat that has a presentation (slide deck) artifact.
  2. Click the Download button on the artifact card.
  3. Click Download as PDF in the menu.
  4. Open the downloaded PDF and check that it has one page per slide, compared with Expected.

## S31.04 PDF summarization.

- **Expected:** The user attaches a PDF and gets a summary of its content.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7013; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:683; apps/web/lib/server/pdf-attachment-content.ts:208
- **Where to find it:** Composer > Files > Upload from device, choose a PDF, then ask for a summary (labels found in the code)
- **Needs:** a PDF file to upload
- **Steps:**
  1. Click the Files button in the message box.
  2. Click Upload from device and choose a PDF file.
  3. Wait until the PDF shows in the message box, type Summarize this PDF and send.
  4. Compare the reply with the PDF content, compared with Expected.

## S31.05 PDF question answering.

- **Expected:** The user attaches a PDF and gets answers to questions about its content.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7013; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:683; apps/web/lib/server/pdf-attachment-content.ts:208
- **Where to find it:** Composer > Files > Upload from device, choose a PDF, then ask a question about it (labels found in the code)
- **Needs:** a PDF file to upload
- **Steps:**
  1. Click the Files button in the message box.
  2. Click Upload from device and choose a PDF file.
  3. Type a question about a fact in the PDF and send.
  4. Check that the answer matches the PDF, compared with Expected.

## S31.06 Page-specific questions.

- **Expected:** The user can ask about a specific page of a PDF and the answer uses that page.
- **Code:** done. Evidence moved: apps/web/lib/server/pdf-attachment-content.ts:170 (quoted code not found in the file now); apps/web/lib/server/pdf-attachment-content.ts:217 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:702; apps/web/lib/server/project-knowledge-anchors.ts:52; apps/web/lib/services/project-context-service.ts:684; apps/web/lib/services/project-context-service.ts:729
- **Where to find it:** no screen of its own. No control of its own; the page selection is done by the server, and the Code line's quoted code was not found in the file.
- **Needs:** a multi-page PDF file
- **Steps:**
  1. Attach a multi-page PDF using Files > Upload from device.
  2. Ask a question that names one page, for example what is on page 3.
  3. Check that the answer uses the content of that page, compared with Expected.

## S31.07 PDF text extraction.

- **Expected:** The user can get the plain text of a PDF.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:666; apps/web/lib/server/container-files.ts:197
- **Where to find it:** Composer > Files > Upload from device, choose a PDF, then ask for its plain text (labels found in the code)
- **Needs:** a PDF file to upload
- **Steps:**
  1. Click the Files button in the message box.
  2. Click Upload from device and choose a PDF file.
  3. Type Give me the plain text of this PDF and send.
  4. Compare the reply with the text in the PDF, compared with Expected.

## S31.08 Scanned-document OCR.

- **Expected:** Text in a scanned (image-only) PDF is recognised and usable.
- **Code:** done. Evidence present: apps/web/lib/server/pdf-attachment-content.ts:10; apps/web/lib/server/pdf-attachment-content.ts:248; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:708; apps/web/lib/server/project-knowledge-extraction.ts:193
- **Where to find it:** Composer > Files > Upload from device, choose a scanned PDF (image only), then ask for its text (labels found in the code)
- **Needs:** a scanned PDF with no text layer
- **Steps:**
  1. Click the Files button in the message box.
  2. Click Upload from device and choose a scanned PDF with no text layer.
  3. Type Read the text in this scanned PDF and send.
  4. Check whether the reply contains the readable text of the scan, compared with Expected.

## S31.09 Table extraction.

- **Expected:** Tables in a PDF come out as structured rows and columns the user can use.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:666; apps/web/lib/server/container-files.ts:197
- **Where to find it:** Composer > Files > Upload from device, choose a PDF with a table, ask for the table, then the spreadsheet artifact > Download as CSV (labels found in the code)
- **Needs:** a PDF file that contains a table
- **Steps:**
  1. Attach a PDF with a table using Files > Upload from device.
  2. Type Extract the table from this PDF as rows and columns and send.
  3. If a table artifact appears, click the Download button on its card.
  4. Click Download as CSV and open the file; compare the rows and columns with Expected.

## S31.23 Signature-service integration.

- **Expected:** The user can send a document for e-signature through a connected signature service.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/catalog.ts:248 (quoted code not found in the file now)
- **Known to be unfinished:** owner: register the Docusign developer app (integration key, OAuth client pair, redirect URI) and set the DOCUSIGN_* env vars; catalog and endpoint entries exist (apps/web/lib/connectors/catalog.ts:248)
- **Where to find it:** Connectors (web address /connectors) > DocuSign card (labels found in the code)
- **Needs:** a DocuSign developer app (the owner step is unfinished) and an outside account (DocuSign)
- **Steps:**
  1. Open the Connectors page from the web app.
  2. Find the DocuSign card.
  3. Click it and follow the connect steps.
  4. Check that a DocuSign connection appears as connected, compared with Expected.

## S31.24 Export fidelity preview.

- **Expected:** Before a file is exported, the user sees a preview that matches the exported file.
- **Code:** done. Evidence moved: apps/web/features/chat/lib/office-file-preview.ts:173; apps/web/features/chat/lib/office-file-preview.ts:50 (quoted code not found in the file now); apps/web/features/chat/components/messages/MessageBubble.tsx:1703; apps/web/features/chat/components/messages/MessageBubble.tsx:1712; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:734
- **Where to find it:** Generated Word, Excel or PowerPoint file in a chat reply > Preview (the Preview button on the artifact card) (labels found in the code)
- **Needs:** a chat that produced an office file
- **Steps:**
  1. Open a chat that produced an office file (docx, xlsx or pptx) as an artifact.
  2. Click the Preview button on the artifact card.
  3. Look at the preview next to the file's download option.
  4. Compare the preview with the Expected line: a preview that matches the exported file.
