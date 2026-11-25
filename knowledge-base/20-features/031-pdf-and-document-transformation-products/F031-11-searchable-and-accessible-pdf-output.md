---
id: "F031-11"
type: "feature"
title: "Searchable and accessible PDF output"
aliases: ["Searchable-PDF generation", "Accessible/tagged-PDF generation", "OCR text layer", "S31.21", "S31.22"]
area: "31 PDF and document-transformation products"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S31.21", "S31.22"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-files-artifacts-and-storage", "SYS-voice-and-media", "SYS-local-inference", "SYS-execution-boundaries", "file:apps/web/lib/services/managed-office-file-service.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F031-11 Searchable and accessible PDF output

Turning a scanned PDF into a searchable PDF with a text layer, and tagging generated PDFs for accessibility, are not built on any AGI Workforce app. Scanned PDFs are read for chat, but the result is text in the chat, not a new file.

Area: [31. PDF and document-transformation products](README.md). Requirement items: [S31.21](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3121), [S31.22](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3122).

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

**What it does.** Would add a hidden text layer to a scanned PDF so it can be searched and copied (S31.21), and mark up generated PDFs with structure, reading order and alt text for screen readers (S31.22). Today neither exists.

**Why it exists.** The area brief requires both (doc: knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md). Scans are not searchable, and many organizations must publish accessible documents.

**Who uses it.** Would be used by archivists, public bodies, schools and people using screen readers. No one can use it today.

**Problems it solves**

- Cannot search or copy text from a scan.
- Screen readers cannot read a PDF without tags.

**Use cases**

- Make a scanned contract searchable.
- Create a tagged report PDF a screen reader can navigate.
- Archive a stack of scans as searchable files.

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile, CLI, VS Code, Chrome: not available as a file output.

**Before you start**

- None for output; reading scanned PDFs in chat has its own rules (see brief S31.08).

**Screens and controls**

- No make-searchable or accessible-output control exists. Labels: none found in the code.

**Journey**

1. 1. A person attaches a scanned PDF and asks for a searchable copy.
2. 2. The server can read the scan for chat (brief S31.08: apps/web/lib/server/pdf-attachment-content.ts:10,211) but the create tool makes only new text PDFs (apps/web/lib/services/managed-office-file-service.ts:190-196).
3. 3. [inferred] The assistant can give the text in chat, not a searchable PDF.

**What the person sees and gets**

- No searchable or tagged PDF. Generated PDFs are plain pages: text drawn with a built-in font (apps/web/lib/services/managed-office-file-service.ts:796-812).

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Reading scanned PDFs for chat is done on web, desktop and mobile per the brief (S31.08, apps/web/lib/server/pdf-attachment-content.ts:10,211); the output is chat text.
- Generated PDFs are real PDFs that start with a PDF header (apps/web/lib/services/managed-office-file-service.test.ts:200-212).

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- Searchable PDF output with a text layer: missing on all six apps (S31.21).
- Tagged/accessible PDF output: missing on all six apps (S31.22). The generator uses jsPDF with a built-in font and draws text lines; no tagging, language or title properties were found being set (apps/web/lib/services/managed-office-file-service.ts:796-842).

## 4. Required behaviour

**Established requirements**

- The product turns a scanned PDF into a searchable PDF with a text layer. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.21)
- Generated PDFs are tagged for accessibility (structure, reading order, alt text) where the product promises it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.22)

**Acceptance criteria**

1. Searching a text word in the output of a scanned PDF finds it on the right page.
2. The output looks the same as the scan.
3. A tagged PDF passes an accessibility checker for structure and reading order.
4. Headings in the source appear as headings in the tag tree.
5. Document language and title are set.
6. Scans with several languages or poor quality give a visible warning.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief says 'where the product promises it'; no public promise of tagged PDFs was found, so S31.22 may apply only if a promise is made [inferred].
- The PDF skill already limits generated PDFs to Latin-script text (.agents/skills/pdf-creation/SKILL.md), so accessibility for other scripts is a related gap [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a tag tree to the PDF generator, or generate accessible PDFs from the Word route that the skill already recommends for editable documents.
- [proposed] Run OCR on device for Local mode.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief items S31.21, S31.22 | `knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md` | Requirement; all apps missing. |
| service | generatePdf | `apps/web/lib/services/managed-office-file-service.ts` | Writes plain text pages with jsPDF (line 796); no tagging. |
| service | Managed office file generator switch | `apps/web/lib/services/managed-office-file-service.ts` | Case 'pdf' creates the file and can request a render check (lines 1034-1050). |
| other | pdf-creation skill | `.agents/skills/pdf-creation/SKILL.md` | Declares PDF output is text only; Latin script only. |
| service | PDF attachment content reader | `apps/web/lib/server/pdf-attachment-content.ts` | Reads text; scan handling referenced at brief lines 10 and 211. |
| service | Project knowledge extraction | `apps/web/lib/server/project-knowledge-extraction.ts` | Extracts document text for project knowledge (brief S31.08 line 162); output is text, not a PDF. |
| service | Chat attachment hydration | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Puts extracted text into the chat turn (brief S31.08 line 474). |
| other | Office render template build | `apps/web/scripts/build-e2b-office-template.mjs` | Builds a sandbox image with office tools and poppler-utils for render checks (lines 10-17); no OCR or tagging tool named. |
| test | pdf-attachment-content test | `apps/web/lib/server/pdf-attachment-content.test.ts` | Tests PDF reading (not opened in detail). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person attaches a scanned PDF and asks for a searchable copy. | device | Client action [inferred]. |
| The server extracts text from the PDF, including scans per the brief, for the model. | our servers | apps/web/lib/server/pdf-attachment-content.ts:10,211 (brief S31.08) |
| No step writes the text back as a hidden layer; a new PDF can only be generated from text. | our servers | apps/web/lib/services/managed-office-file-service.ts:796,1034-1050 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Searchable or tagged PDFs | nowhere: none created | not applicable | not applicable |

**Models and providers.** How scans are recognised on each app (a model or an OCR engine) was not established here; see brief S31.08. unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for these outputs. |
| Permissions | none found in the code |
| Subscription | none found in the code. [proposed] OCR on device free of any plan. |
| Limits and metering | none found in the code for output. Reading scans is bounded by inspection limits (apps/web/lib/server/chat-file-intake/pdf-inspection.ts:66-75). |
| Feature flags | The render-check sandbox is switched by AGI_E2B_EXECUTION and AGI_E2B_CHAT_TEMPLATE (names only), per apps/web/lib/e2b/gate.ts:6-14; they do not enable this feature. |
| Model compatibility | Not applicable for output. |
| Provider restrictions | none found in the code |
| Local mode | Nothing in Local mode: the feature does not exist. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Scanned PDF too long | Reading stops with the 'scan_pages' or 'scan_time' reason. | apps/web/lib/server/chat-file-intake/pdf-inspection.ts:66-75 |
| Request for searchable output | No tool; text reply [inferred]. | apps/web/lib/services/managed-office-file-service.ts:190-196 |
| Non-Latin text in generated PDF | Not supported by the built-in font; skill advises a Word document. | .agents/skills/pdf-creation/SKILL.md |
| Retry, cancel, offline, accessibility of controls | not handled in the code (no feature) | no code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/managed-office-file-service.test.ts`: Real PDF creation (lines 200-212). No tag checks.
- `apps/web/lib/server/pdf-attachment-content.test.ts`: PDF reading (by name; not opened).
- `apps/web/lib/services/managed-office-render.integration.test.ts`: Rendering of office files (by name; not opened).

**Test scenarios**

- **Scan to searchable today**
  1. Attach a scanned PDF.
  2. Ask for a searchable copy.
  - Expected: No new searchable file (current).
- **Search the output (future)**
  1. Make a scan searchable.
  2. Open in another reader.
  3. Search a word from the page.
  - Expected: Hit on correct page.
- **Tag check of generated PDF**
  1. Generate a PDF with headings.
  2. Run an accessibility checker on it.
  - Expected: Today the checker is expected to report no tags; when built, headings are tagged.
- **Offline OCR (future)**
  1. Go offline in Local mode.
  2. Make a scan searchable.
  - Expected: Works on device.

**Where to look when it fails**

- No logs or tables exist for output.
- For reading failures look for inspection reasons 'encrypted', 'unreadable', 'scan_pages', 'scan_time' in apps/web/lib/server/chat-file-intake/pdf-inspection.ts.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No searchable-PDF output.** Affects: All users with scans, six apps.. Evidence: S21 equivalent S31.21 in the area brief.. Work needed: Add an OCR step that writes an invisible text layer, with on-device option.
- **Generated PDFs are untagged and plain.** Affects: Screen reader users on every app that creates PDFs (web, desktop, mobile per brief S31.01).. Evidence: apps/web/lib/services/managed-office-file-service.ts:796-842. Work needed: Tag tree, language, title and alt text support, or route accessible output through another format.
- **Non-Latin scripts are not supported in generated PDFs.** Affects: Users writing Chinese, Arabic or Hindi.. Evidence: .agents/skills/pdf-creation/SKILL.md. Work needed: Embed fonts.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-files-artifacts-and-storage
- SYS-voice-and-media
- SYS-local-inference
- SYS-execution-boundaries
- file:apps/web/lib/services/managed-office-file-service.ts

## Unknown

- How scanned pages are recognised (engine or model) on each app was not traced for this page.
- Whether the product makes any public promise of tagged PDFs was not searched in marketing copy.
