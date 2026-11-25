---
id: "PLAN-mobile-031"
type: "test-plan"
title: "Mobile · 31. PDF and document-transformation products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "31"
---
# Mobile · 31. PDF and document-transformation products

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S31.01 Text-document to PDF conversion.

- **Expected:** The user can turn a text document (Word, text, markdown) into a PDF file.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/utils/attachmentValidation.ts:121; apps/mobile/services/docParser.ts:112
- **Where to find it:** Chat > long-press an answer > Export Message… > Export as PDF (some labels not found in the code; trust the screen)
- **Needs:** none; a chat with a finished assistant answer
- **Steps:**
  1. Open a chat that has an assistant answer with text.
  2. Long-press the answer (or use the More message actions control under it).
  3. Tap Export Message….
  4. Tap Export as PDF and wait for the share sheet.
  5. Compare: a PDF of the answer text opens or shares, with the formatting kept. Compare with Expected.

## S31.02 Spreadsheet to PDF conversion.

- **Expected:** The user can turn a spreadsheet into a PDF file.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/utils/attachmentValidation.ts:121
- **Where to find it:** not found in the code. Searched apps/mobile for spreadsheet, xlsx and PDF export. Spreadsheet attachments are accepted in Cloud mode (apps/mobile/src/features/chat/utils/attachmentValidation.ts), but the only PDF export options found are for answers, conversations and text or markdown artifacts (apps/mobile/src/features/chat/utils/artifactExport.ts, apps/mobile/src/features/chat/components/ConversationExportSheet.tsx). No spreadsheet-to-PDF control was found.

## S31.04 PDF summarization.

- **Expected:** The user attaches a PDF and gets a summary of its content.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/chat/[id].tsx:849 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:1095 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:683
- **Where to find it:** Chat > Add to chat > File, pick a PDF, then send a request to summarize it (labels found in the code)
- **Needs:** a PDF file with readable text; Cloud mode (the File row is shown only in Cloud mode)
- **Steps:**
  1. Open a chat (Cloud mode) or start a new one.
  2. Tap Add to chat (the plus button by the message box).
  3. Tap File and choose a PDF file.
  4. Wait until the file chip above the message box is ready, type "Summarize this PDF", and send.
  5. Compare: the answer gives a summary of the PDF content. Compare with Expected.

## S31.05 PDF question answering.

- **Expected:** The user attaches a PDF and gets answers to questions about its content.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/chat/[id].tsx:849 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:1095 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:683
- **Where to find it:** Chat > Add to chat > File, pick a PDF, then ask a question about it (labels found in the code)
- **Needs:** a PDF file with readable text; Cloud mode
- **Steps:**
  1. Open a chat in Cloud mode.
  2. Tap Add to chat, then tap File and choose a PDF file.
  3. Type a specific question about a fact in the PDF and send.
  4. Compare: the answer gives the fact as it appears in the PDF. Compare with Expected.

## S31.06 Page-specific questions.

- **Expected:** The user can ask about a specific page of a PDF and the answer uses that page.
- **Code:** done. Evidence moved: apps/web/lib/server/pdf-attachment-content.ts:170 (quoted code not found in the file now); apps/web/lib/server/pdf-attachment-content.ts:217 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:702; apps/web/lib/server/project-knowledge-anchors.ts:52; apps/web/lib/services/project-context-service.ts:684; apps/web/lib/services/project-context-service.ts:729
- **Where to find it:** no screen of its own. Page handling is server-side: each page is sent as a [Page n] marker and image (apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:702). The page markers are not shown to the user. The page viewer shows Page N of M (apps/mobile/src/features/chat/components/artifact-viewers/PdfFileView.tsx:197).
- **Needs:** a multi-page PDF file; Cloud mode
- **Steps:**
  1. Attach a multi-page PDF with Add to chat > File in Cloud mode.
  2. Type "What is on page 3?" (use a page number that exists in the file) and send.
  3. Compare: the answer describes page 3 and not another page. Compare with Expected.

## S31.07 PDF text extraction.

- **Expected:** The user can get the plain text of a PDF.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/chat/[id].tsx:1052 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. No button that shows or copies the extracted plain text was found. Local mode extracts PDF text on the phone (apps/mobile/services/docParser.ts, extractTextFromPdfBuffer). The old code location apps/mobile/app/(app)/chat/[id].tsx:1052 now holds research-decision code, so it was not used.
- **Needs:** a PDF with a text layer; a Cloud or local-mode chat
- **Steps:**
  1. Attach a PDF with Add to chat > File.
  2. Type "Write out all of the text in this PDF exactly as it appears" and send.
  3. Compare: the answer contains the plain text of the PDF, without layout or tables. Compare with Expected.

## S31.08 Scanned-document OCR.

- **Expected:** Text in a scanned (image-only) PDF is recognised and usable.
- **Code:** done. Evidence present: apps/web/lib/server/pdf-attachment-content.ts:10; apps/web/lib/server/pdf-attachment-content.ts:248; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:708; apps/web/lib/server/project-knowledge-extraction.ts:193
- **Where to find it:** Projects > open a project > Add sources (choose a scanned PDF), then ask about text that appears only in the scan (labels found in the code)
- **Needs:** a scanned (image-only) PDF; a project you can edit
- **Steps:**
  1. Open the Projects tab and open a project.
  2. Tap Add sources and choose an image-only (scanned) PDF.
  3. Wait until the source row leaves the Indexing state.
  4. Ask a question whose answer is only in the scanned pages, in a chat inside that project.
  5. Compare: the answer uses text from the scan, and a failed source shows Couldn’t read. Compare with Expected.

## S31.09 Table extraction.

- **Expected:** Tables in a PDF come out as structured rows and columns the user can use.
- **Code:** done. Evidence present: apps/mobile/stores/chat/chatExecutionStore.ts:1702
- **Where to find it:** not found in the code. Searched apps/mobile and apps/web for table and tabular handling in PDF code. The only PDF path returns plain text and page text (apps/mobile/services/docParser.ts, apps/web/lib/server/pdf-attachment-content.ts); table rows and columns exist only for CSV files (docParser.ts parseCsvToText, rows and columns metadata). The cited apps/mobile/stores/chat/chatExecutionStore.ts:1702 is attachment replay, not table extraction.
