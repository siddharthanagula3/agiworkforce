---
id: "F031-08"
type: "feature"
title: "Fill PDF forms"
aliases: ["Fill PDF forms", "Native form-field filling", "Visual form completion", "S31.13", "S31.14"]
area: "31 PDF and document-transformation products"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S31.13", "S31.14"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-files-artifacts-and-storage", "SYS-agents-tools-and-automation", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "file:apps/web/lib/services/managed-office-file-service.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F031-08 Fill PDF forms

Filling PDF forms is not built on any AGI Workforce app. Neither filling a PDF's own form fields nor placing text on a non-fillable form page exists. The PDF skill tells the model it cannot fill an existing PDF.

Area: [31. PDF and document-transformation products](README.md). Requirement items: [S31.13](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3113), [S31.14](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3114).

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

**What it does.** Would fill the interactive fields of a PDF form and return the filled file (S31.13), and separately complete a non-fillable form by placing text on the page image (S31.14). Today it does nothing.

**Why it exists.** The area brief requires both as separate capabilities (doc: knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md). People often receive forms such as tax, HR or visa forms and want help completing them.

**Who uses it.** Would be used by individuals and office staff completing forms. No one can use it today.

**Problems it solves**

- Typing the same details into many fields by hand.
- Completing a scanned form that has no fillable fields.

**Use cases**

- Fill a fillable job-application PDF from details in the chat.
- Complete a scanned paper form by placing text on the right lines.
- Check which fields a form has before filling.

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile, CLI, VS Code, Chrome: not available.

**Before you start**

- None, because it does not exist.

**Screens and controls**

- No form-fill screen, field list or place-text tool exists. Labels: none found in the code.

**Journey**

1. 1. A person attaches a form PDF and asks the assistant to fill it.
2. 2. The model has no fill tool. The create-file tool takes only a title and text for a new PDF (apps/web/lib/services/managed-office-file-service.ts:190-196) and the PDF skill says it cannot fill an existing PDF (.agents/skills/pdf-creation/SKILL.md, paragraph 'The PDF holds text only').
3. 3. [inferred] The assistant answers in text, for example listing what to type in each field.

**What the person sees and gets**

- No filled file is produced. [inferred] Output is chat text.

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- New text-only PDFs with no form fields can be created (apps/web/lib/services/managed-office-file-service.ts:796; the skill says no form fields).
- PDF text can be read for chat (apps/web/lib/server/pdf-attachment-content.ts).

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- Filling native PDF form fields: missing on all six apps (S31.13).
- Placing text on a non-fillable form page: missing on all six apps (S31.14).
- Listing a PDF's form fields: no code found.

## 4. Required behaviour

**Established requirements**

- The product fills a PDF's native form fields and returns the filled file. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.13)
- The product completes a non-fillable form by placing text on the page image, as a separate capability. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.14)

**Acceptance criteria**

1. Given a fillable PDF, the product lists its fields and fills the ones the person names.
2. The filled file opens in another PDF reader with the values shown and still editable.
3. Given a scanned non-fillable form, the product places text at the right positions, checked by viewing the output page.
4. The product does not invent values the person did not give; it asks for missing ones.
5. A signature field is left empty unless the person signs it themselves.
6. A password-protected or damaged PDF gives a clear message and no partial file.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Placing text on a page image needs a vision-capable model and page rendering, so model choice would matter [inferred].
- Form data is personal, so the trust rules in AGENTS.md section 6 would apply: Local forms must not silently go to a cloud model [inferred from doc: AGENTS.md].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build native field filling as a deterministic on-device function first; no model needed.
- [proposed] Show a preview of the filled page before saving, using the same preview approach as other exported files.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief items S31.13, S31.14 | `knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md` | Requirement; all apps missing. |
| service | generatePdf | `apps/web/lib/services/managed-office-file-service.ts` | Makes new text-only PDFs (line 796); no form fields. |
| schema | ManagedOfficeFileInputSchema pdf variant | `apps/web/lib/services/managed-office-file-service.ts` | Strict input with no source file (lines 190-196). |
| other | pdf-creation skill | `.agents/skills/pdf-creation/SKILL.md` | Says PDFs hold no form fields and cannot fill an existing PDF. |
| service | PDF attachment content reader | `apps/web/lib/server/pdf-attachment-content.ts` | Reads text and pages; would be the starting point to find form labels. |
| service | PDF range source | `apps/web/lib/server/chat-file-preparation/pdf-range-source.ts` | Reads parts of a PDF for chat preparation; read-only. |
| service | PDF inspection | `apps/web/lib/server/chat-file-intake/pdf-inspection.ts` | Checks uploaded PDFs for encryption, damage and size limits (constants near lines 66-75); does not read form fields. |
| service | Chat attachment hydration | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Puts attachment text into a chat turn; read path only. |
| test | skillRequirements test fixtures | `apps/mobile/src/features/skills/__tests__/skillRequirements.test.ts` | Lines 39-45 use skill names 'pdf-forms' and 'pdf-merge' as fixtures only; not real skills. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person attaches a form PDF and asks to fill it. | device | Chat input and attach are client actions [inferred]; no form code found. |
| The server reads the PDF text for the model. No step reads form fields or writes values. | our servers | apps/web/lib/server/pdf-attachment-content.ts; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts |
| A model replies in text. The only file tool makes a new PDF. | outside service | Provider choice per SYS-model-catalog-and-routing; file tool at apps/web/lib/services/managed-office-file-service.ts:190-196 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Filled form output | nowhere: none created | not applicable | not applicable |

**Models and providers.** No model is used to fill forms today. A future placement feature would need page-image input (a vision-capable model) [inferred]; which models qualify is read from the model catalog, not hard-coded (doc: AGENTS.md section 4).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for form filling. |
| Permissions | none found in the code |
| Subscription | none found in the code. [proposed] Native field filling on device should be free. |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Not applicable today. |
| Provider restrictions | none found in the code |
| Local mode | Nothing in Local mode: the feature does not exist. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Person asks to fill an attached form | No tool; text reply [inferred]; the skill says it cannot fill an existing PDF. | .agents/skills/pdf-creation/SKILL.md |
| Encrypted or damaged PDF | Handled for reading: PDF inspection labels them 'encrypted' or 'unreadable'. Nothing for forms. | apps/web/lib/server/chat-file-intake/pdf-inspection.ts:66-72 |
| Loading, retry, cancel, timeout, offline, accessibility | not handled in the code (no feature) | no form code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/managed-office-file-service.test.ts`: New PDF creation only (lines 200-212).
- `apps/web/lib/server/pdf-attachment-content.test.ts`: PDF text reading (by name; contents not opened).
- `apps/mobile/src/features/skills/__tests__/skillRequirements.test.ts`: Skill mention matching; 'pdf-forms' is only a fixture name (lines 39-45).

**Test scenarios**

- **Fillable form request**
  1. Attach a PDF with fillable fields.
  2. Ask the assistant to fill name and date.
  3. Look for a returned file.
  - Expected: Today: text reply, no file. When built: a filled PDF.
- **Scanned form (future)**
  1. Attach a scanned form image PDF.
  2. Provide values.
  3. Open the output.
  - Expected: Text lines up with the blanks.
- **Missing value (future)**
  1. Ask to fill a form without giving a required value.
  - Expected: The assistant asks instead of inventing it.
- **Confirm skill is not real**
  1. Search the skill list on mobile for 'pdf-forms'.
  - Expected: No such product skill; the name exists only in a test fixture.

**Where to look when it fails**

- No logs or tables exist for this feature.
- rg -i 'acroform|form.?field' apps packages returns no product form-filling code.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Native form-field filling is not built.** Affects: All users on all six apps.. Evidence: S31.13 in the area brief; no code found.. Work needed: Add a PDF library that reads and writes form fields, a tool, UI and tests.
- **Visual form completion is not built.** Affects: All users on all six apps.. Evidence: S31.14 in the area brief; no code found.. Work needed: Render pages, locate lines, place text, preview the result; add tests.
- **The create tool cannot accept an existing file.** Affects: Web and desktop assistant flows.. Evidence: apps/web/lib/services/managed-office-file-service.ts:190-196. Work needed: A new tool with a source input.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-files-artifacts-and-storage
- SYS-agents-tools-and-automation
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- file:apps/web/lib/services/managed-office-file-service.ts

## Unknown

- Whether any desktop-only (Tauri) code reads PDF form fields was not found by search but the Tauri tree was not fully read.
- Which library the team would choose is undecided.
