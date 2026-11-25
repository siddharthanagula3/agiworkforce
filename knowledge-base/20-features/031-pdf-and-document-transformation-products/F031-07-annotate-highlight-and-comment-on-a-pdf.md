---
id: "F031-07"
type: "feature"
title: "Annotate, highlight and comment on a PDF"
aliases: ["PDF annotation", "Highlighting and comments", "S31.11", "S31.12", "Annotate, highlight and comment on a PDF"]
area: "31 PDF and document-transformation products"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S31.11", "S31.12"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-files-artifacts-and-storage", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-local-inference", "file:apps/web/lib/services/managed-office-file-service.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F031-07 Annotate, highlight and comment on a PDF

Annotating a PDF (notes, drawings, highlights, comments saved with the file) is not built on any AGI Workforce app. The apps can read PDFs for chat and show them in a viewer, and can create new text-only PDFs, but nothing marks up an existing PDF.

Area: [31. PDF and document-transformation products](README.md). Requirement items: [S31.11](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3111), [S31.12](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3112).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person draw notes on a PDF, highlight text and attach comments, and keep them in the file. Today it does nothing: no code for it was found (rg for annotation and highlight terms in apps and packages returned only unrelated hits such as a code editor's state annotation in apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx:13,40).

**Why it exists.** Brief items S31.11 and S31.12 set it as a required capability so AGI Workforce can match PDF markup that leading assistants and PDF tools offer (doc: knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md). The product contract also lists an 'Edit/annotate capability' per file viewer and 'Annotation/edit request into the conversation' (doc: docs/product/experience-contract.md:499,517).

**Who uses it.** Would be used by students, lawyers, reviewers and managers who mark up a contract, paper or report. No one can use it today.

**Problems it solves**

- Keeping review notes inside the PDF instead of in a separate chat or file.
- Sharing a marked-up PDF with someone who does not use AGI Workforce.

**Use cases**

- Highlight a clause in a contract and add a comment for the other side.
- Draw an arrow and a note on a floor-plan PDF on a phone.
- Ask the assistant to highlight every mention of a term and comment on each.

## 2. User experience

**Where to find it**

- Web: not available.
- Desktop: not available.
- Mobile: not available. The mobile PDF viewer is read-only; its build script only vendors the PDF reader library (apps/mobile/scripts/vendor-pdfjs-viewer.cjs:60-79) and no annotation setting was found.
- CLI, VS Code extension, Chrome extension: not available.

**Before you start**

- None, because there is nothing to use. Reading a PDF in chat needs an attached file and a chat model (see F031 reading features, not covered here).

**Screens and controls**

- No annotation toolbar, highlight tool, comment box or save-annotated-PDF control exists on any app. Exact labels: none found in the code.

**Journey**

1. 1. A person attaches a PDF to a chat (works today).
2. 2. They ask the assistant to highlight or comment on it.
3. 3. The assistant has no tool that edits an existing PDF: the create-file tool accepts only a title and text for a new PDF (apps/web/lib/services/managed-office-file-service.ts:190-196), and the PDF skill tells the model it cannot edit, merge or fill an existing PDF (.agents/skills/pdf-creation/SKILL.md, paragraph beginning 'The PDF holds text only').
4. 4. [inferred] The assistant can only reply in text, for example by quoting passages and describing notes in the chat.

**What the person sees and gets**

- No annotated file is produced. [inferred] Any output is chat text.

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Reading PDFs for chat: text and page access exist on web (apps/web/lib/server/pdf-attachment-content.ts) and are the nearest code; they only read.
- A read-only PDF viewer exists on mobile, built from a vendored PDF reader (apps/mobile/scripts/vendor-pdfjs-viewer.cjs:60-79; test apps/mobile/src/features/chat/components/artifact-viewers/__tests__/pdfViewerAsset.test.ts).
- New text-only PDFs can be created (apps/web/lib/services/managed-office-file-service.ts:796).

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- Annotation, highlighting, comments on a PDF: missing on web, desktop, mobile, CLI, VS Code and Chrome (brief S31.11, S31.12; no code found).
- Saving annotations with the file: not available.

## 4. Required behaviour

**Established requirements**

- The user can annotate a PDF (notes, drawings) and keep the annotations. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.11)
- The user can highlight text and add comments in a PDF. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.12)
- Each file viewer declares its edit/annotate capability, and a viewer sends annotation/edit requests into the conversation. (source: docs/product/experience-contract.md:499,517)

**Acceptance criteria**

1. On web, desktop and mobile, a PDF opened in the viewer offers a highlight tool, a note tool and a drawing tool.
2. A highlight with a comment is still present and visible when the saved file is opened in another PDF reader.
3. Annotations survive closing and reopening the file in the app.
4. The original file is kept unchanged unless the person chooses to overwrite it.
5. If the PDF is password-protected or damaged, the person sees a clear message and nothing is saved.
6. Annotating a file in Local mode does not send the file to any server.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the product contract gives each viewer an annotate capability and mobile has only a read viewer, mobile would need its own annotation layer or a server-side step [inferred].
- An assistant-driven version (highlight every mention of X) would need a tool that edits an existing PDF, which does not exist [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build annotation as a shared capability in one package so web, desktop and mobile show the same tools, with local on-device editing so it works without a subscription.
- [proposed] Add a model-callable tool for annotation that is separate from create_office_file, whose schema is strictly for new files.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief items S31.11 and S31.12 | `knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md` | States the requirement and marks every app missing. |
| service | generatePdf | `apps/web/lib/services/managed-office-file-service.ts` | Creates a new text-only PDF with jsPDF; line 796. No annotation or editing of an existing PDF. |
| schema | ManagedOfficeFileInputSchema pdf variant | `apps/web/lib/services/managed-office-file-service.ts` | Strict input for create_office_file pdf: format, filename, title, content, verify_render (lines 190-196). No source file, so an existing PDF cannot be passed. |
| other | pdf-creation skill | `.agents/skills/pdf-creation/SKILL.md` | Product skill that tells the model PDFs hold text only and cannot be edited, merged or filled. |
| service | PDF attachment content reader | `apps/web/lib/server/pdf-attachment-content.ts` | Reads text and pages from an attached PDF for chat; read-only. |
| service | PDF chat-file preparation | `apps/web/lib/server/chat-file-preparation/pdf.ts` | Prepares an uploaded PDF for reading; read-only. |
| service | Mobile PDF viewer build | `apps/mobile/scripts/vendor-pdfjs-viewer.cjs` | Vendors the PDF reader library into the mobile viewer page; viewer only. |
| component | Mobile PDF viewer HTML (Android) | `apps/mobile/src/features/chat/components/artifact-viewers/pdfViewerHtml.android.ts` | Shows a PDF on Android; no annotation tools found. |
| other | Viewer contract | `docs/product/experience-contract.md` | Requires an edit/annotate capability declaration per renderer (line 499). |
| test | managed-office-file-service test | `apps/web/lib/services/managed-office-file-service.test.ts` | Covers PDF creation only (lines 200-212). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A person attaches a PDF and asks for highlights or comments in a chat on web, desktop (hosted web app) or mobile. | device | Attachment reading described at apps/web/lib/server/pdf-attachment-content.ts; chat input is a client action [inferred]. |
| The chat server reads the PDF text and sends it to a model for a text answer. No step edits the PDF file. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts (brief S31.04 code list); no annotation code found by search. |
| If a file is requested, only create_office_file can run and it makes a new text-only PDF, not an annotated copy. | our servers | apps/web/lib/services/managed-office-file-service.ts:190-196,796 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Annotations | nowhere: no annotation data exists | not applicable | not applicable |

**Models and providers.** No model takes part in annotation today. A chat model only answers in text about the PDF. Which provider answers depends on the chat route (SYS-model-catalog-and-routing).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for annotation. Reading a PDF in chat follows the normal chat sign-in rules (SYS-authentication-and-identity). |
| Permissions | none found in the code |
| Subscription | none found in the code for annotation. [proposed] Local annotation on mobile and desktop should need no paid plan, as the product rule says local inference is free. |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Not applicable: no model feature is involved. |
| Provider restrictions | none found in the code |
| Local mode | Nothing happens in Local mode because the feature does not exist. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Person asks the assistant to annotate an attached PDF | The model has no tool for it and is told in the PDF skill that it cannot edit an existing PDF; reply is text only [inferred from the skill]. | .agents/skills/pdf-creation/SKILL.md; apps/web/lib/services/managed-office-file-service.ts:190-196 |
| Loading, empty, error, retry, cancel, timeout, offline, reconnect | not handled in the code (no feature) | no annotation code found |
| Accessibility of annotation controls | not handled in the code (no controls) | no annotation code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/managed-office-file-service.test.ts`: Creating a real PDF and CSV; the PDF starts with the PDF header (lines 200-212). Nothing on annotation.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/pdfViewerAsset.test.ts`: The mobile PDF viewer asset (by file name; contents not opened). Not annotation.

**Test scenarios**

- **Confirm absence in the apps**
  1. Open a chat on web and attach a PDF.
  2. Open the PDF preview.
  3. Look for highlight, note or draw controls.
  - Expected: No annotation controls appear (current behaviour). When built, tools appear.
- **Ask the assistant to highlight**
  1. Attach a PDF.
  2. Ask: highlight the word 'total' and comment on it.
  3. Check for a file in the reply.
  - Expected: Today: a text reply and no annotated file. When built: a downloadable PDF with highlights.
- **Round trip in another reader (future)**
  1. Annotate a PDF.
  2. Save it.
  3. Open it in a different PDF reader.
  - Expected: Highlights and comments are visible there.
- **Local mode offline (future)**
  1. Turn off the network.
  2. Annotate a PDF on desktop or mobile in Local mode.
  - Expected: Annotation works and saves with no network call.

**Where to look when it fails**

- No log lines or tables exist because the feature does not exist.
- Search the tree for annotation code before any claim of support: rg -i 'annotat' apps packages.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Annotation, drawing, highlight and comment on a PDF are not built.** Affects: All users on web, desktop, mobile, CLI, VS Code, Chrome.. Evidence: S31.11, S31.12 in the area brief; no code found.. Work needed: Choose an annotation engine, add viewer tools and save-to-file on each app, then add tests and a model tool if the assistant should annotate.
- **Mobile PDF viewer is read-only.** Affects: Mobile users.. Evidence: apps/mobile/scripts/vendor-pdfjs-viewer.cjs:60-79. Work needed: Add an annotation layer to the viewer page or a native editor.
- **The PDF create tool cannot take an existing file.** Affects: Assistant-driven annotation on web and desktop.. Evidence: apps/web/lib/services/managed-office-file-service.ts:190-196. Work needed: Add a separate tool with a source-file input.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-files-artifacts-and-storage
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-local-inference
- file:apps/web/lib/services/managed-office-file-service.ts

## Unknown

- Whether a desktop or web PDF viewer outside apps/mobile exposes annotation tools was not opened beyond search; search found none.
- Which engine the team would use for writing annotations is undecided (no document found).
