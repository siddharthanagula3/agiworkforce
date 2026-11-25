---
id: "F043-02"
type: "feature"
title: "Read documents, charts, diagrams and handwriting in an image"
aliases: ["Document-image interpretation", "Chart interpretation", "Diagram interpretation", "Handwriting recognition", "Read a photo of a document", "S43.04", "S43.05", "S43.06", "S43.07"]
area: "43 Image and visual understanding"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S43.04", "S43.05", "S43.06", "S43.07"]
depends_on: ["F043-01", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-local-inference", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-files-artifacts-and-storage", "SYS-voice-and-media", "SYS-security-and-privacy", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F043-02 Read documents, charts, diagrams and handwriting in an image

The person attaches a photo or scan of a document, a chart, a diagram or handwriting and asks for a transcript or explanation. The product treats it as an ordinary image; the model does the reading. Scanned PDFs without a text layer are turned into page images. Mobile Local gives only recognised text.

Area: [43. Image and visual understanding](README.md). Requirement items: [S43.04](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4304), [S43.05](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4305), [S43.06](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4306), [S43.07](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4307).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built (this page lists unfinished parts) | partly built | not seen by a person |
| Desktop | built (this page lists unfinished parts) | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person ask a vision model to read a photographed or scanned document, explain a chart or diagram, or transcribe handwriting, using the same image attachment path as any picture. For PDFs with no text layer the web server attaches the pages as images.

**Why it exists.** The brief requires document-image, chart, diagram and handwriting reading on every app (doc: knowledge-base/data/area-briefs/043-image-and-visual-understanding.md, S43.04 to S43.07). Rivals offer this in chat.

**Who uses it.** Students, office workers and developers who hold a paper document, a whiteboard, a chart screenshot or handwritten notes.

**Problems it solves**

- Typing out a paper document by hand.
- Understanding a chart or diagram without the source data.
- Reading messy handwriting.

**Use cases**

- Photograph a receipt on the phone and ask for the total.
- Attach a chart screenshot on web and ask for the trend.
- Attach a whiteboard photo in the Chrome side panel and ask for a summary.
- Attach a scanned PDF with no text layer on web and ask a question.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): composer plus menu row 'Add photos & files' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:147).
- Mobile: add-to-chat sheet rows 'Camera', 'Photos', 'Paste image', 'File' (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:697-722).
- CLI: /attach <file> and /attach --full <image>, which the help describes as for fine detail (apps/cli/src/tui/tui_app.rs:5484-5485).
- VS Code: drag, paste or the + button 'Attach or use tools' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3356, 7720, 7730).
- Chrome extension: side panel composer paste or picker (apps/extension/src/side_panel.ts:14584, 14688).

**Before you start**

- A model that reads images (web refuses otherwise, request-processor.ts:5099-5113; CLI refuses at staging, tui_app.rs:853).
- Mobile Cloud needs sign-in and upload consent; Local needs the on-device model downloaded [inferred].
- A readable picture; the product has no quality check.

**Screens and controls**

- Attach controls as listed above; image previews on web and VS Code.
- CLI /attach --full to keep full resolution at a higher input cost (tui_app.rs:6256).
- Mobile scan screen for printed text: 'Scan Text' title, capture button label 'Capture and scan', 'Copy text' pill (apps/mobile/app/(app)/scan.tsx:457, 508, 389-396).

**Journey**

1. Take or choose the photo or scan of the document, chart, diagram or handwriting.
2. Attach it to a chat message in the app.
3. Type what you want: a transcript, a trend, a structure, a translation of the handwriting.
4. Send and read the answer.
5. If the details are lost, retry with a sharper or larger picture, or on the CLI use /attach --full.

**What the person sees and gets**

- Model answer in chat.
- A note '[name has no text layer; its N pages are attached as images]' appears in the model context for a scanned PDF (apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:738).
- A note when an animated image shows only its first frame (apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts:77-79).
- No quality warning or confidence flag is shown (brief S43.19, S43.20).

**Settings**

- CLI /attach --full keeps original size (tui_app.rs:5485).
- API image detail low, high, auto or original per image part (apps/web/app/api/llm/v1/chat/completions/lib/image-detail.ts:5).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: an attached PNG, JPEG, GIF or WebP goes through upload, scan, hydration and the model-image envelope exactly as in a single-image question (apps/web/lib/server/chat-attachment-completion.ts:397; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:654-676).
- Web: a PDF with no text layer has its pages attached as images with a text note (chat-attachment-hydration.ts:701-738); text-layer PDFs go as extracted text or a native file part (hydration.ts:679-700).
- CLI: images are resized to 2048 by 768 bounds (long edge by short edge, swapped for portrait) unless /attach --full keeps the original (crates/agiworkforce-utils-image/src/lib.rs:19-22, 82-100).
- VS Code and Chrome: images go through the same attach paths as F043-01 (ChatStateManager.ts:2207; side_panel.ts:10343).

**Incomplete**

- No code path treats documents, charts, diagrams or handwriting differently; accuracy depends on the model and the picture [inferred from no separate branch found].
- Shrinking can blur small print: web caps at 8000 px and 5,000,000 base64 bytes (packages/contracts/cloud-contracts/src/chat-attachment-policy.json:60-64) and CLI default caps at 2048 by 768 (utils-image lib.rs:19-22) [inferred effect].
- Web and Desktop have no recorded live check (brief S43.04 to S43.07 Unfinished).

**Present but disconnected or switched off**

- Server tool apps/web/lib/server/tools/scanned-page-reader.ts reads scanned pages as a tool; whether the chat path uses it for images was not read: unknown.

**Not available**

- Mobile Local mode cannot read charts, diagrams or handwriting from pixels; it gives text recognised by the phone (apps/mobile/stores/chat/chatExecutionStore.ts:1241-1262).
- Warnings for unreadable or low-quality input (brief S43.19) and uncertainty flags (S43.20) on every app.

## 4. Required behaviour

**Established requirements**

- The user attaches a photo or scan of a document, including a scanned PDF, and the model reads and explains it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.04)
- The user attaches a chart image and the model interprets data and trends. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.05)
- The user attaches a diagram image and the model explains its structure. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.06)
- The user attaches handwritten notes and the model transcribes or answers about them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.07)
- Before answering, the product warns when an input image is too small, blurry or low quality to read reliably. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.19)
- Answers about images flag uncertain readings. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.20)

**Acceptance criteria**

1. A photo of printed text attached on web is transcribed by a vision model.
2. A chart screenshot attached on any app gets an answer that names the trend.
3. A PDF with no text layer attached on web is answered from its page images and the context carries the no-text-layer note.
4. A handwriting photo attached in the CLI with /attach --full is sent at original size.
5. On mobile in Local mode the prompt carries the recognised text and the app says it cannot see the picture.
6. A very small or blurred image produces a warning before the answer (required, currently not met).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Document and handwriting use needs the highest practical resolution; the default shrink on CLI is a risk for dense pages [inferred].
- The warning for S43.19 would need image size and sharpness checks on the device before send [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer the full-resolution option on web, mobile and VS Code as the CLI does.
- [proposed] Add a pre-send check for tiny images and show a low-quality warning.
- [proposed] Ask models to mark unreadable words and surface the mark in the answer.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | chat-attachment-hydration (images and scanned PDF pages) | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Builds image parts and page-image parts for the model. |
| service | model-image | `apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts` | Shrinks to the model envelope while keeping format where possible. |
| config | chat-attachment-policy | `packages/contracts/cloud-contracts/src/chat-attachment-policy.json` | Image caps and PDF scan and page-image limits (kinds.pdf). |
| service | image-detail | `apps/web/app/api/llm/v1/chat/completions/lib/image-detail.ts` | Accepts auto, low, high, original per model. |
| service | upload-scan | `apps/web/lib/security/upload-scan.ts` | Same upload checks as F043-01. |
| service | chat-attachment-completion | `apps/web/lib/server/chat-attachment-completion.ts` | Scans stored uploads and purges rejected ones. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web attach and send. |
| service | utils-image crate | `crates/agiworkforce-utils-image/src/lib.rs` | CLI resize bounds and Original mode. |
| command | CLI /attach --full | `apps/cli/src/tui/tui_app.rs` | Full-resolution attach. |
| store | mobile chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Local OCR context or Cloud file reference. |
| service | mobile OCR service | `apps/mobile/src/features/image/services/ocr.ts` | Calls the native on-device text recogniser. |
| component | mobile scan screen | `apps/mobile/app/(app)/scan.tsx` | Capture, recognise and send printed text. |
| service | VS Code ChatStateManager | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Pending image attachments. |
| component | Chrome side panel | `apps/extension/src/side_panel.ts` | Composer image intake. |
| service | scanned-page-reader tool | `apps/web/lib/server/tools/scanned-page-reader.ts` | Reads scanned pages as a server tool; chat use not confirmed. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person attaches the photo or scan (picker, camera, paste or drag). | device | AddToChatSheet.tsx:697-722; ChatComposerNew.tsx:943-952; webviewContent.ts:7720-7744 |
| Web and mobile Cloud upload the file; our server checks bytes and scans them. | our servers | apps/web/lib/server/chat-attachment-completion.ts:397-420 |
| For an image, the server builds a data URL image part, re-encoding only if the file exceeds the envelope. For a PDF with no text layer it renders page images and adds a note. | our servers | chat-attachment-hydration.ts:654-676, 701-738 |
| The model provider reads the picture and writes the transcript or explanation. | outside service | request-processor.ts:5099-5113 (vision model required); provider depends on route |
| CLI: the file is resized (default) or kept (--full) on the device and sent as an image block. | device | tui_app.rs:6215-6275; crates/agiworkforce-utils-image/src/lib.rs:78-118 |
| Mobile Local: the phone recognises text on the device and adds it to the prompt; the picture stays on the device. | device | chatExecutionStore.ts:1241-1262, 2731-2735; apps/mobile/native/ios/AGIVisionOCR.swift:6-7 and native/android/AGIVisionOCR.kt:12 say no network calls |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Uploaded document photo or scan | Private object storage (Cloud) | Yes with the account | Deleted if the scan fails; otherwise kept in the Library until deleted (mobile note AddToChatSheet.tsx:132-135). |
| Page images rendered from a scanned PDF | Built in memory for the request | No | Per request (chat-attachment-hydration.ts:701-706). |
| Local OCR cache of recognised text | In-memory map of up to 64 entries in the mobile app | No | Lost when the app process ends (chatExecutionStore.ts:1225-1226). |

**Models and providers.** Reading quality is the model's. Only models with the vision capability are accepted (request-processor.ts:5099). Auto routing treats an image as an image task (request-processor.ts:4502-4510). No provider is hard-wired by this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and mobile Cloud need sign-in; CLI own-key and Local without account: not established. |
| Permissions | Mobile camera permission for the Camera row and scan screens (scan.tsx:43-44). |
| Subscription | No entitlement named for reading document images was found. Attachment bytes, count and daily upload limits are plan based (apps/web/lib/server/attachment-allowance.ts:83-97, 179). PDF page and OCR page limits are in policy (chat-attachment-policy.json kinds.pdf); who they apply to by plan: unknown. See SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | Image 20,971,520 bytes (12,582,912 without handshake); model copy 5,000,000 base64 bytes and 8000 px; PDF maxOcrPagesPerFile 100 and ocrPagesPerTurn 8 (packages/contracts/cloud-contracts/src/chat-attachment-policy.json:4, 8, 60-64, kinds.pdf). CLI 2048 by 768 bounds (crates/agiworkforce-utils-image/src/lib.rs:19-22). |
| Feature flags | UPLOAD_SCAN_WEBHOOK_URL, UPLOAD_SCAN_REQUIRED (apps/web/lib/security/upload-scan.ts:408-419). No other flag found. |
| Model compatibility | Vision capability required. Detail value original is refused by models that do not list it (image-detail.ts:5-28). |
| Provider restrictions | Some routes take fewer images or smaller images; the envelope is the strictest route's (chat-attachments.ts comment above CHAT_MODEL_IMAGE_ENVELOPE). |
| Local mode | Mobile Local: recognised text only, no pixels, no upload, no payment. Android uses a bundled Latin script recogniser and iOS uses Apple Vision (AGIVisionOCR.kt:12; AGIVisionOCR.swift:6-7). Handwriting recognition quality of these recognisers: unknown. Other apps in Local: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Scanned PDF with no text layer | Pages are attached as images and a note says so; extra pages are omitted past limits and the truncation callback fires. | chat-attachment-hydration.ts:679-740 |
| Unreadable image | Live turn fails 400 unreadable_attachment; a degraded earlier attachment is skipped. | chat-attachment-hydration.ts:657-662 |
| Animated image | Only the first frame is shown and a note says so. | model-image.ts:77-79 |
| Model cannot read images | Refused with model_no_vision. | request-processor.ts:5099-5113 |
| Mobile Local, no text found | Context says 'On-device OCR found no readable text. The local text model cannot inspect the image pixels directly.' | chatExecutionStore.ts:1255-1257 |
| Low quality image | not handled in the code; no warning exists. | searched apps/web, apps/mobile, apps/cli; brief S43.19 status missing |
| Over budget | attachment_context_too_large 413 'The files attached to this message are too large to send together. Remove one and try again.' | chat-attachment-hydration.ts:625-628 |
| Offline, retry, cancel | Same as F043-01 upload states; no document-specific handling. | apps/mobile/src/features/chat/upload/uploadAttachment.ts:15-110 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/model-image.test.ts`: Large photo downscaled to the envelope, transparency kept, animated first frame, unreadable image named.
- `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.test.ts`: Attachment hydration into model parts; case list not read.
- `apps/web/lib/security/upload-scan.test.ts`: Type confusion and scanner gates for image uploads.
- `apps/mobile/__tests__/OcrScan.test.tsx`: OCR bridge returns text and regions, propagates native errors, throws when the module is unlinked, handles empty results.
- `apps/mobile/__tests__/ScanSendFailure.test.tsx`: Scan send keeps image and question on refusal.

**Test scenarios**

- **Printed page photo**
  1. On web, attach a phone photo of a printed page.
  2. Ask for the text.
  - Expected: The answer transcribes the text from the picture; no scanner refusal.
- **Chart trend**
  1. Attach a line chart screenshot in the VS Code sidebar.
  2. Ask what the trend is.
  - Expected: Answer states the direction and notable points; chip shows the image.
- **Scanned PDF**
  1. Attach a PDF with no text layer on web.
  2. Ask a question about page one.
  - Expected: Context includes the no-text-layer note; the answer reads the page image.
- **CLI fine detail**
  1. Attach a dense page photo with /attach --full.
  2. Send a question and note the input cost.
  - Expected: The attach message says it is sent without scaling; the answer reads small text better than the default [inferred].
- **Mobile Local handwriting**
  1. Choose an on-device model.
  2. Attach a handwriting photo.
  3. Ask for a transcript.
  - Expected: Prompt carries recogniser text or the no-text message; the app does not claim to see the picture.

**Where to look when it fails**

- Error codes unreadable_attachment, model_no_vision, attachment_context_too_large.
- Server log line for rejected attachments (chat-attachment-completion.ts:410).
- Mobile error text 'AGIVisionOCR native module not linked, rebuild the iOS app' or Android equivalent (apps/mobile/src/features/image/services/ocr.ts:21-26).
- No recorded production run exists for these cells.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/043-image-and-visual-understanding.md](../../70-qa/test-plans/web/043-image-and-visual-understanding.md)
- Desktop: [70-qa/test-plans/desktop/043-image-and-visual-understanding.md](../../70-qa/test-plans/desktop/043-image-and-visual-understanding.md)
- Mobile: [70-qa/test-plans/mobile/043-image-and-visual-understanding.md](../../70-qa/test-plans/mobile/043-image-and-visual-understanding.md)
- CLI: [70-qa/test-plans/cli/043-image-and-visual-understanding.md](../../70-qa/test-plans/cli/043-image-and-visual-understanding.md)
- VS Code: [70-qa/test-plans/vscode/043-image-and-visual-understanding.md](../../70-qa/test-plans/vscode/043-image-and-visual-understanding.md)
- Chrome: [70-qa/test-plans/chrome/043-image-and-visual-understanding.md](../../70-qa/test-plans/chrome/043-image-and-visual-understanding.md)

## 10. Gaps and dependencies

- **No input-quality warning before the answer.** Affects: All apps. Evidence: knowledge-base/data/area-briefs/043-image-and-visual-understanding.md S43.19 status missing on every app. Work needed: Design and add a pre-send quality check and warning copy.
- **No uncertainty marking on answers about images.** Affects: All apps. Evidence: brief S43.20 status missing. Work needed: Prompt guidance or UI flag for low-confidence readings.
- **Full-resolution choice exists only in the CLI.** Affects: Web, mobile, VS Code and Chrome users with dense documents. Evidence: apps/cli/src/tui/tui_app.rs:5485 versus no equivalent found elsewhere; brief S43.18 missing on web, desktop, mobile, chrome. Work needed: Expose detail choice in other composers.
- **Mobile Local cannot read charts, diagrams or handwriting from pixels.** Affects: Mobile Local users. Evidence: chatExecutionStore.ts:1241-1262. Work needed: Local vision model or explicit limits in the UI.
- **Web and Desktop live checks not recorded.** Affects: Web and Desktop. Evidence: brief S43.04 to S43.07 Unfinished. Work needed: Run and record the production check.

**Depends on**

- F043-01
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-local-inference
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-files-artifacts-and-storage
- SYS-voice-and-media
- SYS-security-and-privacy
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:cloud

## Unknown

- Whether scanned-page-reader is used by chat for images.
- Recogniser quality on handwriting on iOS and Android.
- Which plans get PDF page-image limits.
- Whether web Local or own-key routes keep image detail.
- Whether the Chrome extension sends images at detail high or auto for composer images.
