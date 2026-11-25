---
id: "F031-10"
type: "feature"
title: "Shrink, redact and edit metadata"
aliases: ["Compression", "Redaction", "Metadata editing", "Shrink a PDF", "S31.18", "S31.19", "S31.20"]
area: "31 PDF and document-transformation products"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S31.18", "S31.19", "S31.20"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-local-inference", "file:apps/web/lib/server/chat-file-intake/pdf-inspection.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F031-10 Shrink, redact and edit metadata

Shrinking a PDF, permanently redacting content and viewing or editing title and author metadata are not built on any AGI Workforce app. Secret-redaction code that exists elsewhere in the repository is a log and chat scrubber, not document redaction.

Area: [31. PDF and document-transformation products](README.md). Requirement items: [S31.18](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3118), [S31.19](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3119), [S31.20](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3120).

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

**What it does.** Would reduce a PDF's file size (S31.18), permanently remove chosen content so it cannot be recovered (S31.19), and show or change title, author and other metadata (S31.20). Today it does none of these.

**Why it exists.** The area brief requires all three (doc: knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md). Size limits on email, privacy before sharing, and clean metadata are everyday needs.

**Who uses it.** Would be used by legal, finance and office staff and individuals sharing documents. No one can use it today.

**Problems it solves**

- Files too large to email.
- Names or numbers left visible in a shared document.
- Author or title fields that reveal internal details.

**Use cases**

- Shrink a 40 MB scan to under 10 MB.
- Black out account numbers permanently before sharing.
- Clear the author name from a report.

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile, CLI, VS Code, Chrome: not available.

**Before you start**

- None, because it does not exist.

**Screens and controls**

- No compress, redact or properties control exists. Labels: none found in the code.

**Journey**

1. 1. A person attaches a PDF and asks to shrink it, redact text or change its author.
2. 2. The model has no tool for editing an existing PDF (apps/web/lib/services/managed-office-file-service.ts:190-196; .agents/skills/pdf-creation/SKILL.md).
3. 3. [inferred] The assistant replies in text only.

**What the person sees and gets**

- No output file. [inferred] Text reply.

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Scanning uploaded PDFs for encryption, damage, page and time limits and active content before reading (apps/web/lib/server/chat-file-intake/pdf-inspection.ts:66-94). This is intake safety, not document redaction. The draft claim that lines 82-94 are a secret-redaction setting is not supported: those lines choose the file type passed to the malware scanner (pdfScanApplies, scannerMimeType).
- A general secret-redaction utility exists for logs and text (packages/platform/utils/src/secretRedaction.ts); it does not edit PDFs [inferred from its location and tests under packages/platform/utils/src/__tests__].

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- Compression: missing on all six apps (S31.18).
- Permanent redaction of PDF content: missing on all six apps (S31.19).
- Metadata view or edit: missing on all six apps (S31.20). The generated PDF code makes no metadata call (apps/web/lib/services/managed-office-file-service.ts:796-842 shows no property setting that was found).

## 4. Required behaviour

**Established requirements**

- The user can shrink a PDF's file size. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.18)
- The user can permanently redact content in a PDF. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.19)
- The user can view and edit a PDF's title, author and other metadata. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.20)
- An action a user cannot undo asks first, naming the consequence; files removed or overwritten go to Trash first. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. A compressed PDF is smaller than the original and its text is still readable.
2. After redaction, the covered text cannot be found by searching or copying the output file.
3. Redaction asks for confirmation naming that it cannot be undone, and keeps the original (or sends it to Trash).
4. Metadata shows the current title and author and a saved change shows in another reader.
5. The original file is not overwritten without consent.
6. Encrypted or damaged PDFs give a clear message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Permanent redaction must remove the underlying text, not only draw a black box [inferred from the meaning of 'permanently'].
- Compression and metadata need no model and could run on device [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer low, medium and high compression with the size saved shown before saving.
- [proposed] Let the assistant propose items to redact (names, numbers) but have the person approve each.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief items S31.18-S31.20 | `knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md` | Requirement; all apps missing. |
| service | PDF inspection | `apps/web/lib/server/chat-file-intake/pdf-inspection.ts` | Intake checks: encrypted, damaged, too many pages, too slow (lines 66-75); scanner type choice (lines 82-94). Not redaction. |
| service | generatePdf | `apps/web/lib/services/managed-office-file-service.ts` | Makes new text PDFs (line 796); no compression or metadata calls found. |
| schema | ManagedOfficeFileInputSchema pdf variant | `apps/web/lib/services/managed-office-file-service.ts` | Strict input; fields are format, filename, title, content, verify_render (lines 190-196). The title field is the heading text in the page, per generatePdf. |
| service | Secret redaction utility | `packages/platform/utils/src/secretRedaction.ts` | Scrubs secrets from text for logs and chat; not a PDF tool. |
| service | PDF attachment content reader | `apps/web/lib/server/pdf-attachment-content.ts` | Reads PDF text for chat; read-only. |
| other | pdf-creation skill | `.agents/skills/pdf-creation/SKILL.md` | Says the PDF has text only and cannot edit an existing PDF. |
| other | Dependencies list | `apps/web/package.json` | jspdf (line 141) writer and pdfjs-dist (line 151) reader only. |
| test | managed-office-file-service test | `apps/web/lib/services/managed-office-file-service.test.ts` | Covers PDF creation only (lines 200-212). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person attaches a PDF and asks to shrink, redact or change metadata. | device | Client action [inferred]; no code found. |
| On upload the server checks the PDF for encryption, size and active content, and reads text for the model. | our servers | apps/web/lib/server/chat-file-intake/pdf-inspection.ts:66-94; apps/web/lib/server/pdf-attachment-content.ts |
| No step writes a smaller, redacted or re-labelled PDF. | our servers | apps/web/lib/services/managed-office-file-service.ts:190-196 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Compressed, redacted or re-labelled PDFs | nowhere: none created | not applicable | not applicable |

**Models and providers.** No model is used. Redaction suggestions by a model would be an add-on, subject to Local, own-key and Cloud trust rules (doc: AGENTS.md section 6).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for these operations. |
| Permissions | none found in the code |
| Subscription | none found in the code. [proposed] Local on-device compression, redaction and metadata free of any plan. |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code |
| Local mode | Nothing in Local mode: the feature does not exist. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Request to redact an attached PDF | No tool; text reply [inferred]. The assistant must not claim a redacted file exists (the skill says do not claim a file exists until the tool succeeds). | .agents/skills/pdf-creation/SKILL.md |
| Encrypted PDF on upload | Labelled 'encrypted' by inspection. | apps/web/lib/server/chat-file-intake/pdf-inspection.ts:70 |
| Loading, retry, cancel, timeout, offline, accessibility | not handled in the code (no feature) | no code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/managed-office-file-service.test.ts`: PDF creation (lines 200-212).
- `packages/platform/utils/src/__tests__/secretRedaction.parity.test.ts`: Secret-text redaction parity (by name; contents not opened). Not PDF redaction.
- `apps/web/lib/server/pdf-attachment-content.test.ts`: PDF reading (by name; not opened).

**Test scenarios**

- **Compression request today**
  1. Attach a large PDF.
  2. Ask to shrink it.
  3. Look for a file.
  - Expected: No smaller PDF is produced (current).
- **Redaction proof (future)**
  1. Redact a name.
  2. Search the output file for the name.
  3. Try to copy text beneath the box.
  - Expected: Name not found anywhere.
- **Metadata round trip (future)**
  1. Set author to a test value.
  2. Open file properties in another reader.
  - Expected: Author matches.
- **Confirmation (future)**
  1. Start a redaction.
  - Expected: A prompt names that it cannot be undone and the original is kept or goes to Trash.

**Where to look when it fails**

- No logs or tables exist for this feature.
- rg -i 'redact' returns only secret-scrubbing code, not document redaction.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Compression is not built.** Affects: All users, all six apps.. Evidence: S31.18 in the area brief.. Work needed: Pick an engine, expose levels, show size saved, test.
- **Permanent redaction is not built.** Affects: All users, all six apps.. Evidence: S31.19 in the area brief; secret scrubbing is a different feature.. Work needed: Remove underlying text, add confirmation, prove removal with tests.
- **Metadata view and edit are not built.** Affects: All users, all six apps.. Evidence: S31.20 in the area brief; no property calls found in apps/web/lib/services/managed-office-file-service.ts:796-842.. Work needed: Read and write document info, add UI and tests.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-local-inference
- file:apps/web/lib/server/chat-file-intake/pdf-inspection.ts

## Unknown

- What lines 1-20 of pdf-inspection.ts mean by 'redaction' in a comment was not read closely; the file's purpose is intake checks.
- Whether any PDF compression happens in an upload path was not found.
