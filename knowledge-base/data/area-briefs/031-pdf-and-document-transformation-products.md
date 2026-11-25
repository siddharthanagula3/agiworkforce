# Area 31. PDF and document-transformation products

25 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S31.01 Text-document to PDF conversion.
- Should: The user can turn a text document (Word, text, markdown) into a PDF file.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/services/managed-office-file-service.ts:162; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:508; apps/mobile/src/features/chat/utils/attachmentValidation.ts:78; apps/mobile/services/docParser.ts:110

## S31.02 Spreadsheet to PDF conversion.
- Should: The user can turn a spreadsheet into a PDF file.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/server/container-files.ts:196; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:466; apps/mobile/src/features/chat/utils/attachmentValidation.ts:78

## S31.03 Presentation to PDF conversion.
- Should: The user can turn a slide deck into a PDF with one page per slide.
- Status: web partial, desktop partial, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/scripts/build-e2b-office-template.mjs:29
- Unfinished: web: owner: run node apps/web/scripts/build-e2b-office-template.mjs with E2B credentials, set AGI_E2B_CHAT_TEMPLATE=agi-office-interpreter and AGI_E2B_EXECUTION=1; live-check a PPTX converts to PDF | desktop: owner: run node apps/web/scripts/build-e2b-office-template.mjs with E2B credentials, set AGI_E2B_CHAT_TEMPLATE=agi-office-interpreter and AGI_E2B_EXECUTION=1; live-check a PPTX converts to PDF

## S31.04 PDF summarization.
- Should: The user attaches a PDF and gets a summary of its content.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5228; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:450; apps/web/lib/server/pdf-attachment-content.ts:150; apps/mobile/app/(app)/chat/[id].tsx:849; apps/mobile/stores/chat/chatExecutionStore.ts:1095

## S31.05 PDF question answering.
- Should: The user attaches a PDF and gets answers to questions about its content.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5228; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:450; apps/web/lib/server/pdf-attachment-content.ts:150; apps/mobile/app/(app)/chat/[id].tsx:849; apps/mobile/stores/chat/chatExecutionStore.ts:1095

## S31.06 Page-specific questions.
- Should: The user can ask about a specific page of a PDF and the answer uses that page.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/server/pdf-attachment-content.ts:170; apps/web/lib/server/pdf-attachment-content.ts:217; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:479; apps/web/lib/server/project-knowledge-anchors.ts:50; apps/web/lib/services/project-context-service.ts:647; apps/web/lib/services/project-context-service.ts:692

## S31.07 PDF text extraction.
- Should: The user can get the plain text of a PDF.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:466; apps/web/lib/server/container-files.ts:196; apps/mobile/app/(app)/chat/[id].tsx:1052

## S31.08 Scanned-document OCR.
- Should: Text in a scanned (image-only) PDF is recognised and usable.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/server/pdf-attachment-content.ts:10; apps/web/lib/server/pdf-attachment-content.ts:211; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:474; apps/web/lib/server/project-knowledge-extraction.ts:162

## S31.09 Table extraction.
- Should: Tables in a PDF come out as structured rows and columns the user can use.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:466; apps/web/lib/server/container-files.ts:196; apps/mobile/stores/chat/chatExecutionStore.ts:1722

## S31.10 Document comparison.
- Should: The user can compare two documents and see their differences.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S31.11 PDF annotation.
- Should: The user can annotate a PDF (notes, drawings) and keep the annotations.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S31.12 Highlighting and comments.
- Should: The user can highlight text and add comments in a PDF.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S31.13 Native form-field filling where supported.
- Should: The product fills a PDF’s native form fields and returns the filled file.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S31.14 Visual form completion as a separate capability.
- Should: The product completes a non-fillable form by placing text on the page image.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S31.15 Page insertion/removal where offered.
- Should: The user can insert or remove pages in a PDF.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S31.16 Page reordering.
- Should: The user can reorder the pages of a PDF.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S31.17 Merge and split.
- Should: The user can merge several PDFs into one or split one into parts.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S31.18 Compression.
- Should: The user can shrink a PDF’s file size.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S31.19 Redaction.
- Should: The user can permanently redact content in a PDF.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S31.20 Metadata editing.
- Should: The user can view and edit a PDF’s title, author and other metadata.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S31.21 Searchable-PDF generation.
- Should: The product turns a scanned PDF into a searchable PDF with a text layer.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S31.22 Accessible/tagged-PDF generation where promised.
- Should: Generated PDFs are tagged for accessibility (structure, reading order, alt text) where the product promises it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S31.23 Signature-service integration.
- Should: The user can send a document for e-signature through a connected signature service.
- Status: web partial, desktop partial, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/connectors/catalog.ts:248
- Unfinished: web: owner: register the Docusign developer app (integration key, OAuth client pair, redirect URI) and set the DOCUSIGN_* env vars; catalog and endpoint entries exist (apps/web/lib/connectors/catalog.ts:248) | desktop: owner: register the Docusign developer app (integration key, OAuth client pair, redirect URI) and set the DOCUSIGN_* env vars; catalog and endpoint entries exist (apps/web/lib/connectors/catalog.ts:248)

## S31.24 Export fidelity preview.
- Should: Before a file is exported, the user sees a preview that matches the exported file.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/lib/office-file-preview.ts:21; apps/web/features/chat/lib/office-file-preview.ts:50; apps/web/features/chat/components/messages/MessageBubble.tsx:1368; apps/web/features/chat/components/messages/MessageBubble.tsx:1377; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:417

## S31.25 Original-versus-transformed comparison.
- Should: After a transformation, the user can compare the original and transformed documents side by side.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
