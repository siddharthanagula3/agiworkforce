---
id: "F031-06"
type: "feature"
title: "Compare documents and original versus transformed"
aliases: ["Document comparison", "Original versus transformed comparison", "Side-by-side compare", "S31.10", "S31.25"]
area: "31 PDF and document-transformation products"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S31.10", "S31.25"]
depends_on: ["F031-01", "F031-02", "F031-04", "F031-05", "surface:web", "surface:desktop", "surface:mobile", "SYS-files-artifacts-and-storage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F031-06 Compare documents and original versus transformed

Not built. The brief wants a way to compare two documents and to compare an original with its transformed version. No control or code for either was found in any app. A person can only ask the assistant in chat to describe differences between files attached to one turn.

Area: [31. PDF and document-transformation products](README.md). Requirement items: [S31.10](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3110), [S31.25](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3125).

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

**What it does.** Would show two documents side by side or mark their differences. Nothing does this today.

**Why it exists.** Brief S31.10: compare two documents and see differences. S31.25: after a transformation, compare original and transformed side by side (doc: knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md).

**Who uses it.** Would serve people checking contract revisions or the result of an edit.

**Problems it solves**

- Spotting what changed between two versions
- Trusting that a conversion kept the content

**Use cases**

- Compare two versions of a contract
- See what an edit changed in a workbook
- Check a converted file against its source

## 2. User experience

**Where to find it**

- Not available on any app (Web, Desktop, Mobile, CLI, VS Code, Chrome): the brief marks both items missing, and a text search of apps/web/features/chat and apps/web/features/projects for compare or diff-viewer terms found no matching file

**Before you start**

- not applicable

**Screens and controls**

- none found in the code

**Journey**

1. Workaround [inferred]: attach both files to one chat turn and ask the model to list differences; this uses the normal attach path (F031-01) and gives prose, not a diff view

**What the person sees and gets**

- No dedicated output

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Related but separate: when the assistant edits a Word or Excel file, the server records a preservation receipt that compares the original with the result (apps/web/lib/services/managed-office-file-service.ts, the workbookPreservationReceipt call in the xlsx case); it is a machine check, not a person-facing compare view [inferred from the call]

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- Document comparison (S31.10) on all six apps
- Original-versus-transformed side by side (S31.25) on all six apps

## 4. Required behaviour

**Established requirements**

- The user can compare two documents and see their differences. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.10)
- After a transformation, the user can compare the original and transformed documents side by side. (source: S31.25 (same brief))

**Acceptance criteria**

1. A control exists to pick two documents and open a comparison
2. Added, removed and changed text is marked
3. After an assistant edit, original and result can be viewed side by side
4. Works for PDF text, Word and spreadsheets, or states which are unsupported
5. Large files show a limit message instead of failing
6. Equivalent on Web, Desktop and Mobile, or the difference is recorded

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A comparison of PDFs would use the extracted page text from F031-02; layout differences would not show

**Proposed improvements** (suggestions, not requirements)

- [proposed] Start with a text diff of extracted text for PDFs and docx
- [proposed] Reuse the preservation receipt data to show edit changes for workbooks and documents

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | extractPdfAttachmentContent | `apps/web/lib/server/pdf-attachment-content.ts` | Would supply per-page text for a PDF side; no comparison code exists here |
| service | hydrateChatAttachments | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Lets several files ride in one turn, the only current way to ask for differences (up to the plan's attachment cap) |
| service | managed-office-file-service | `apps/web/lib/services/managed-office-file-service.ts` | Edits docx and xlsx with a source file and expected values; no person-facing diff |
| service | managed-office-preservation | `apps/web/lib/services/managed-office-preservation.ts` | Machine receipts that an edit preserved content; not a compare view |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Where a compare view could attach; none found |
| component | MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Shows generated files; no original-versus-result view |
| component | FilePreviewModal | `apps/web/features/projects/components/FilePreviewModal.tsx` | Single-file preview; no second pane |
| service | office-file-preview | `apps/web/features/chat/lib/office-file-preview.ts` | Reads one file at a time |
| service | parseDocument | `apps/mobile/services/docParser.ts` | Mobile text reader for one file; no compare |
| command | PDF read and search | `apps/desktop/src-tauri/src/features/document/pdf.rs` | Tauri single-file read and search; no compare |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No comparison flow exists. The only available route is the normal chat attachment flow with two files | our servers | apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:486 hydrates every attachment slot of a turn |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| none created by this feature | not applicable | not applicable | not applicable |

**Models and providers.** A model would describe differences in chat today; no dedicated routine uses one.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | not applicable (feature absent) |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code; chat attachment limits apply to the workaround |
| Feature flags | none found in the code |
| Model compatibility | Not applicable |
| Provider restrictions | Not applicable |
| Local mode | Not applicable; reading two files in one turn on Mobile Local is possible by the normal attach path [inferred] |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Any state | not handled in the code, because no comparison feature exists | none: no comparison code found in the folders searched |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `none found` (not found): No test for document comparison was found

**Test scenarios**

- **Absence check Web**
  1. Open a chat with two attached files
  2. Look for a compare control
  - Expected: No compare control
- **Absence check after edit**
  1. Ask the assistant to edit an attached workbook
  2. Look for an original-versus-result view
  - Expected: None
- **Workaround**
  1. Attach two versions of a text PDF
  2. Ask for the differences
  - Expected: A prose list from the model; a tester judges correctness

**Where to look when it fails**

- Not applicable

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Document comparison does not exist** Affects: All six apps. Evidence: Brief S31.10 missing on every app; no code found. Work needed: Design, build and test
- **Original-versus-transformed view does not exist** Affects: All six apps. Evidence: Brief S31.25 missing on every app; the server edit receipts are not shown to the person. Work needed: Show before and after for assistant edits
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F031-01
- F031-02
- F031-04
- F031-05
- surface:web
- surface:desktop
- surface:mobile
- SYS-files-artifacts-and-storage

## Unknown

- Whether any compare or diff view exists in code outside the folders searched
- Whether the workbook preservation receipt is shown to the person anywhere
- Whether Electron Desktop adds any compare feature of its own
