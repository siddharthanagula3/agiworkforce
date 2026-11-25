---
id: "F043-09"
type: "feature"
title: "Quality warnings and uncertainty flags (not built)"
aliases: ["Image input-quality warning (S43.19)", "Visual uncertainty presentation (S43.20)", "Blurry or small image warning", "Low-confidence reading flag"]
area: "43 Image and visual understanding"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S43.19", "S43.20"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "SYS-model-catalog-and-routing", "file:apps/web/lib/security/upload-scan.ts", "F043-07", "F043-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F043-09 Quality warnings and uncertainty flags (not built)

Planned warnings when an image is too small or blurry to read, and visible flags on uncertain readings in answers. Neither exists in any of the six apps. Only a safety check of file type and size on upload exists, and it does not judge image quality.

Area: [43. Image and visual understanding](README.md). Requirement items: [S43.19](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4319), [S43.20](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4320).

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

**What it does.** Would warn before answering when an attached image is too small, blurry or low quality, and would mark uncertain text or objects in the answer. Not built; the nearest existing code checks only that the file bytes match their declared image type (apps/web/lib/security/upload-scan.ts:85-92).

**Why it exists.** Brief S43.19 and S43.20 want people to know when a reading may be wrong, so they do not trust a guessed number or a misread word.

**Who uses it.** Anyone who photographs documents, receipts, screens or handwriting and asks about them. Nobody can use it today.

**Problems it solves**

- Prevents confident answers from unreadable images.
- Lets a person retake or resend a better picture before wasting time.
- Makes ambiguous readings visible in the answer.

**Use cases**

- Photograph a receipt in dim light and be told it is too dark to read before asking (not built).
- Ask for a serial number and see the uncertain digits marked (not built).
- Attach a tiny thumbnail and get a warning to send a larger one (not built).
- Read handwriting where one word is flagged as a guess (not built).

## 2. User experience

**Where to find it**

- Not available on Web, Desktop, Mobile, CLI, VS Code or Chrome (brief S43.19, S43.20 missing on all six).

**Before you start**

- None; feature absent.

**Screens and controls**

- No warning banner, confidence marker or uncertainty control found.

**Journey**

1. Not available. Today a person attaches an image and the model answers; the only refusals are for an unreadable file or an unsupported model: 'could not be read as an image' (apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts:15-18) and 'The selected model cannot read images. Choose a vision-capable model.' (request-processor.ts:5100-5112).

**What the person sees and gets**

- Existing related messages: the animated-image note '[<file> is animated; the model is shown its first frame only]' (model-image.ts:80-83) and the upload scan refusals (apps/web/lib/security/upload-scan.test.ts shows cases such as a ZIP disguised as a PNG).
- No quality warning text exists.

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Structural upload check: file signature must match the declared image type (JPEG, PNG, GIF, WebP) (apps/web/lib/security/upload-scan.ts:85-92,115-116).
- Server shrink and re-encode so the image fits the model's size envelope, with a floor of 256 pixels on the shrink loop; failure raises ModelImageUnreadableError (apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts:29-31,79-135).
- A note to the model when an image is animated (model-image.ts:80-83), which is a limited kind of reading caveat given to the model, not shown as a warning to the person [inferred].

**Incomplete**

- The shrink step can make an image smaller than the original with no warning to the person; the only signal is the note for animated images (model-image.ts:96-135) [inferred from code read].

**Present but disconnected or switched off**

- none found

**Not available**

- No check for image dimensions, blur or brightness on any app (search for blurry, too small and low quality terms found only desktop token counting code, apps/desktop/src-tauri/src/core/llm/token_counter.rs, unrelated to warnings).
- No confidence values in mobile text recognition results (apps/mobile/src/features/image/services/ocr.ts:3-12).
- No uncertainty marking in answers on any app.

## 4. Required behaviour

**Established requirements**

- Before answering, the product warns when an input image is too small, blurry or low quality to read reliably. (source: S43.19 (brief))
- Answers about images visibly flag uncertain readings (low-confidence text, ambiguous objects). (source: S43.20 (brief))
- Never fabricate behaviour or status; an unverifiable claim stays marked unknown. (source: doc: AGENTS.md section 1)
- No silent failures; a user-visible condition needs visible feedback. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Attaching an image below a documented minimum size shows a warning before the model answers (when built).
2. Attaching a visibly blurry image shows a warning that names the problem.
3. A person can proceed anyway after a warning.
4. An answer containing an uncertain reading marks it in text in the same way on web, desktop, mobile, CLI, VS Code and Chrome.
5. Today: attaching a tiny or blurry image shows no warning on any app (absence check).
6. A file whose bytes do not match its declared type is refused by the upload scan (existing behaviour).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A warning needs a cheap measurement on the device before upload; thresholds should be configuration, not constants (doc: AGENTS.md section 8 rate limits are configuration; applied by inference).
- Uncertainty flags can come from the model's own wording; no provider confidence field was found in the code read.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Run a size and sharpness check at attach time in the shared chat UI package and show one line under the image chip.
- [proposed] Add a short instruction to the image prompt asking the model to mark uncertain readings in a fixed form, then render the mark visibly.
- [proposed] Expose mobile recognition confidence where the native module can supply it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | upload-scan | `apps/web/lib/security/upload-scan.ts` | Structural check: signature against declared type and size; not a quality check (lines 85-92,115-116). |
| test | upload-scan tests | `apps/web/lib/security/upload-scan.test.ts` | Cases such as ZIP disguised as PNG and WebP container reading (lines 65-132). |
| service | prepareModelImage | `apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts` | Shrink and re-encode to fit the model envelope; unreadable error; animated note. |
| service | chat attachment hydration | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Calls prepareModelImage for stored images and degrades or fails on unreadable ones (lines 655-680). |
| service | model vision guard | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Refuses images for a model that cannot read them (lines 5100-5112) and refuses too many images (5126-5135). |
| service | recognizeText | `apps/mobile/src/features/image/services/ocr.ts` | On-device text recognition; result has text and regions, no confidence. |
| screen | Mobile Scan screen | `apps/mobile/app/(app)/scan.tsx` | Shows 'No text detected' or 'No text found' badge, the only quality-like message on mobile. |
| service | CLI image encoder | `crates/agiworkforce-utils-image/src/lib.rs` | Decode and resize for the CLI; decode failure returns an error, no quality check. |
| command | CLI stage_image_path_with | `apps/cli/src/tui/tui_app.rs` | Refuses non-image files and non-vision models; no quality check (lines 842-859). |
| service | desktop attachment mapper | `apps/desktop/src-tauri/src/sys/commands/chat/attachments.rs` | Decodes image attachments and warns in logs on failure (lines 455-470); no person-facing quality warning found. |
| service | chrome extension image paths | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Builds image parts for AGI Cloud; no quality check found (lines 515-569). |
| service | vscode webview image attach | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Brief cites line 1289 as image handling; no quality check read. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A person attaches an image in an app. | device | Brief S43.01 code list (apps/mobile/services/api.ts:651; apps/cli/src/tui/tui_app.rs:3703) |
| Web upload: the server checks that the file signature matches its declared image type and size. | our servers | apps/web/lib/security/upload-scan.ts:85-92 |
| At send time the server re-encodes and shrinks the image to fit the model's size envelope; an undecodable file raises an error. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts:79-135 |
| The vision model reads the image and answers; any uncertainty depends only on the model's wording. | outside service | packages/ai/providers/openai/src/translate.ts:51-57 (example provider); no quality hook found |
| No quality measurement or uncertainty step exists in this flow. | device and our servers | none found in the code read |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Uploaded image bytes and scan result | Handled by the upload route and file storage (SYS-files-artifacts-and-storage); exact table not traced | unknown | unknown |

**Models and providers.** The vision model alone decides how it words uncertainty. No catalog field for confidence or quality handling was found. Provider behaviour: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for a quality warning (feature absent). Web upload scanning applies to signed-in uploads [inferred]. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | Existing envelope limits: maximum edge pixels and base64 size from the shared chat model image envelope, and an image count limit per model (model-image.ts:79-96; media-input.ts:60-66). Exact numbers not read. |
| Feature flags | The upload scanner reads an external webhook setting named UPLOAD_SCAN_WEBHOOK_URL (brief; apps/web/lib/security/upload-scan.ts:274); a refusal 'upload_scanner' appears when it fails. Value not recorded. |
| Model compatibility | A model that cannot read images gets 400 model_no_vision (request-processor.ts:5100-5112). No model-specific quality rule found. |
| Provider restrictions | none found in the code. |
| Local mode | No quality check exists in Local mode. On the phone, local text recognition returns text and boxes with no confidence (ocr.ts:3-12). CLI attach runs on device without any quality check (tui_app.rs:842-879). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Tiny or blurry image | Not handled in the code: the image is sent as is and the model answers. | none found; prepareModelImage only shrinks (model-image.ts:79-135) |
| Undecodable image on web | Raises ModelImageUnreadableError ('<file> could not be read as an image.'); on a live turn it becomes a 400 unreadable_attachment, otherwise the attachment is degraded. | model-image.ts:15-18; chat-attachment-hydration.ts:655-665 |
| Animated image | Only the first frame is shown to the model and a note says so. | model-image.ts:80-83 |
| Signature mismatch | Upload refused by the scan. | apps/web/lib/security/upload-scan.test.ts:75-94 |
| Model cannot read images | 400 model_no_vision. | request-processor.ts:5100-5112 |
| Mobile no text | Badge 'No text detected' or 'No text found'. | scan.tsx:365-369 |
| Retry, cancel, timeout, offline for quality warning | not handled in the code; feature absent. | none found |
| Accessibility | not handled in the code; no warning exists to announce. | none found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/security/upload-scan.test.ts`: Structural upload checks: text file accepted, charset tolerated, ZIP disguised as PNG and PDF disguised as JPEG rejected, unknown image bytes rejected, WebP container reading, WebP disguised as PNG named correctly.
- `apps/mobile/__tests__/OcrScan.test.tsx`: Mobile recognition wrapper returns text and regions; no confidence tested.

**Test scenarios**

- **Tiny image absence check**
  1. On each app attach a 16 by 16 pixel image.
  2. Ask 'what does this say?'.
  - Expected: No warning appears before the answer (current behaviour; the brief wants one).
- **Blurry photo absence check**
  1. Attach a strongly blurred photo of text.
  2. Ask for the text.
  - Expected: The model answers; no warning or uncertainty flag is added by the product.
- **Fake image refused**
  1. Rename a ZIP file to .png and upload it on web.
  - Expected: Upload is refused naming what the file really is.
- **Non-vision model**
  1. Choose a model that cannot read images.
  2. Send an image.
  - Expected: 400 model_no_vision with the message to choose a vision-capable model.
- **Mobile empty scan**
  1. Open Scan and photograph a blank surface.
  - Expected: Badge reads 'No text detected'.

**Where to look when it fails**

- Error code model_no_vision or unreadable_attachment in the chat response.
- ModelImageUnreadableError from apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts.
- Upload scan refusal code upload_scanner (brief live-check note).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No image-quality warning (too small, blurry, dark) on any app.** Affects: All six apps. Evidence: Brief S43.19 missing everywhere; only structural scan at upload-scan.ts:85-92. Work needed: Add a quality measure at attach time and a visible warning that allows proceeding.
- **No uncertainty flags in answers.** Affects: All six apps. Evidence: Brief S43.20 missing everywhere; no confidence in ocr.ts:3-12. Work needed: Define a marking format, instruct the model, render it in shared chat UI.
- **Server shrinks images silently; the person is not told when a large image was scaled down.** Affects: Web users. Evidence: model-image.ts:96-135 (note only for animated images). Work needed: Return a notice when the delivered image differs materially from the original.
- **No test of image quality handling because none exists.** Affects: Quality assurance. Evidence: Search for blur or small-image terms found none. Work needed: Write tests with the feature.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- SYS-model-catalog-and-routing
- file:apps/web/lib/security/upload-scan.ts
- F043-07
- F043-08

## Unknown

- Exact envelope numbers (maximum edge pixels and base64 size) in the shared chat image envelope; not read.
- Whether any provider returns a confidence signal for image reading.
- Desktop and VS Code image handling beyond the brief's cited lines; not traced.
- Whether the web chat composer shows any client-side image size message (not found in code read).
- Where uploaded image bytes are stored and for how long.
