---
id: "F043-04"
type: "feature"
title: "Copy text out of an image (OCR, on mobile)"
aliases: ["Scan Text", "Scan with AGI", "On-device OCR", "Visual text extraction", "Copy text from an image", "S43.08"]
area: "43 Image and visual understanding"
available_on: ["mobile"]
implementation: {web: "missing", desktop: "missing", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S43.08"]
depends_on: ["F043-01", "SYS-local-inference", "SYS-execution-boundaries", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-chat-turn-pipeline", "surface:mobile", "mode:local", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F043-04 Copy text out of an image (OCR, on mobile)

On a phone, the Scan Text screen captures a picture, reads the text on the device, shows where the text was found, lets the person copy it, and sends it with the photo to a chat. Other apps have no separate text-extraction step; they ask the model to read the picture.

Area: [43. Image and visual understanding](README.md). Requirement items: [S43.08](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4308).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Desktop | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Reads the text in a camera capture or a handed-over image using the phone's own recogniser, shows it over the picture, offers 'Copy text', prefills a question and sends the image and question to a new chat.

**Why it exists.** The brief requires users to extract the text in an image and copy or reuse it (doc: knowledge-base/data/area-briefs/043-image-and-visual-understanding.md, S43.08). On-device recognition also feeds Local mode, where the text model cannot see pixels.

**Who uses it.** Phone users who want text from signs, paper, labels or screens, including those in Local mode with no upload.

**Problems it solves**

- Retyping text from paper or a screen.
- Giving a text-only on-device model something to read from a photo.

**Use cases**

- Scan a printed letter and ask for a summary.
- Copy the text from a photo of a sign.
- Hand a photo over from an iOS shortcut for a scan.
- In Local mode, attach a photo of a page so the on-device model reads its recognised text.

## 2. User experience

**Where to find it**

- Mobile: screen route /(app)/scan, titled 'Scan Text' (apps/mobile/app/(app)/scan.tsx:457). Entry points found: the app deep-link verb 'scan' (apps/mobile/app/_layout.tsx:304-309) and the iOS intent titled 'Scan with AGI' (apps/mobile/native/ios/AGIAppIntents/ScanIntent.swift:5). An in-app button entry was not found in apps/mobile/app, apps/mobile/src or apps/mobile/components searches; the file the brief names (apps/mobile/src/features/shell/capabilityShortcuts.ts) does not exist: unknown.
- Mobile Local chat: attaching a photo runs the same recogniser inside the chat send (apps/mobile/stores/chat/chatExecutionStore.ts:2731-2735).
- Web, Desktop, CLI, VS Code, Chrome: no separate text-extraction screen found.

**Before you start**

- Camera permission and the canUseCamera capability for live capture (scan.tsx:43-44). A supplied image needs no camera access (apps/mobile/__tests__/SuppliedImageNeedsNoCamera.test.tsx:67).
- The native recogniser module linked in the build (ocr.ts:15-28).
- To send: a model selected; Cloud mode also needs sign-in and upload consent.

**Screens and controls**

- Camera view with scan corners, switch camera, flash toggle and capture button labelled 'Capture and scan' (scan.tsx:508).
- After capture: image with text-region overlay, a badge such as '2 text blocks' or 'No text detected', a Retake button, a 'Copy text' pill (shows 'Copied' for a moment), a prompt box with placeholder 'Ask about this text…' (max 2000 characters) and a send button labelled 'Send to AI' (scan.tsx:389-417).

**Journey**

1. Open Scan Text.
2. Allow camera access if asked.
3. Point at the text and tap capture.
4. Wait while the phone reads the text; a success haptic plays if text was read (scan.tsx:110-112).
5. Check the overlay. Tap 'Copy text' to copy, or Retake.
6. Edit the prefilled question ('Summarize this:' plus the text, or 'What does this image say?' if none).
7. Send. The app creates a conversation named Scan, attaches the photo and opens the chat.

**What the person sees and gets**

- Overlay boxes over recognised regions and a text-block count.
- Error text 'Text could not be read from this image. Retake the scan or type your question.' (scan.tsx:106).
- Alert 'No text to send' when the prompt is empty (scan.tsx:185-186).
- Alerts 'Send failed' with 'The scan could not be sent. Check your model and try again.' or '... Check your connection and try again.' (scan.tsx:216, 224).
- Copied text on the clipboard.

**Settings**

- Haptic Feedback setting changes whether success haptics play (apps/mobile/__tests__/ScanSendFailure.test.tsx:77-96).
- The model selected for new chats decides where the question goes (ScanSendFailure.test.tsx:120).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The scan screen calls the on-device recogniser, shows regions and text, offers copy, retake and send (apps/mobile/app/(app)/scan.tsx:83-112, 171-228, 389-417).
- The recogniser bridge calls native module AGIVisionOCR: Apple Vision on iOS and a bundled Latin-script recogniser on Android, described in source as making no network calls (apps/mobile/native/ios/AGIVisionOCR.swift:6-7; apps/mobile/native/android/AGIVisionOCR.kt:12; apps/mobile/src/features/image/services/ocr.ts:15-31).
- Local-mode chat appends recognised text for each locally attached image and caches up to 64 results (apps/mobile/stores/chat/chatExecutionStore.ts:1225-1262, 2731-2735); earlier-turn images are re-read the same way (chatExecutionStore.ts:2696).
- The send step reuses the normal send path with the image attached as a JPEG named scan_<time>.jpg (scan.tsx:197-210).

**Incomplete**

- Sending is not on-device only: in Cloud mode the photo is uploaded, and the prefilled text is sent as the question (scan.tsx:209-215; chatExecutionStore.ts:2484-2500).
- An in-app entry to the scan screen was not found; reach is through intents and links (apps/mobile/app/_layout.tsx:304-309).
- The brief marks Web and Desktop partial; no separate OCR step exists there (doc: knowledge-base/data/area-briefs/043-image-and-visual-understanding.md S43.08).

**Present but disconnected or switched off**

- If the native module is not linked the screen shows the 'could not be read' text and the thrown error is 'AGIVisionOCR native module not linked, rebuild the iOS app' or the Android variant (ocr.ts:21-26).

**Not available**

- No OCR or copy-text control exists in the web, desktop, CLI, VS Code or Chrome chat code found.
- The web server OCR module apps/web/lib/server/tools/scanned-page-reader.ts and apps/web/lib/server/scanned-document-text.ts serve scanned documents and project knowledge files, not a chat 'copy text' control (apps/web/lib/server/project-knowledge-extraction.ts imports it).

## 4. Required behaviour

**Established requirements**

- The user extracts the text in an image (OCR) and can copy or reuse it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.08)
- Never describe a capability as intrinsic when it depends on a harness or route. (source: AGENTS.md section 4)
- Local inference on mobile is free of any paid subscription. (source: task statement for this knowledge base (established requirement))

**Acceptance criteria**

1. Capturing printed text shows an overlay and a block count, and 'Copy text' puts the text on the clipboard.
2. Capturing a picture with no text shows 'Text could not be read from this image. Retake the scan or type your question.'.
3. Send creates a conversation and opens it with the photo attached and the question as the first message.
4. Opening the screen with a supplied image does not ask for camera access.
5. If a send is refused by the store, the scan and the question are kept on screen.
6. In Local mode attaching a photo adds the recognised text to the prompt and nothing is uploaded.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web and desktop users would need a copy-text action on an attached image to meet S43.08 [inferred].
- The on-device recogniser should work without a signed-in account in Local mode [inferred from no sign-in check in ocr.ts].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an in-app entry to Scan Text from the add-to-chat sheet.
- [proposed] Add a 'Copy text' action on image previews on web and desktop, reading text with a model when no device recogniser exists.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Scan Text screen | `apps/mobile/app/(app)/scan.tsx` | Camera, recognise, overlay, copy, send. |
| screen | Camera screen | `apps/mobile/app/(app)/camera.tsx` | Photo question screen (not text extraction) that shares the capture pattern. |
| service | OCR bridge | `apps/mobile/src/features/image/services/ocr.ts` | Calls NativeModules.AGIVisionOCR.recognizeText. |
| service | iOS recogniser | `apps/mobile/native/ios/AGIVisionOCR.swift` | Apple Vision text recognition. |
| service | iOS bridge header | `apps/mobile/native/ios/AGIVisionOCR.m` | Exports the module to React Native. |
| service | Android recogniser | `apps/mobile/native/android/AGIVisionOCR.kt` | Bundled text recogniser, Latin script. |
| config | Android build plugin | `apps/mobile/native/android/withAGIVisionOCR.cjs` | Adds the recogniser dependency. |
| config | iOS build plugin | `apps/mobile/native/ios/withAGINativeModulesIOS.cjs` | Registers native modules for iOS builds. |
| store | chatExecutionStore Local OCR | `apps/mobile/stores/chat/chatExecutionStore.ts` | buildLocalImageOcrContext and 64-entry cache. |
| command | Scan app intent | `apps/mobile/native/ios/AGIAppIntents/ScanIntent.swift` | 'Scan with AGI' shortcut hands an image to the screen. |
| command | Analyze image intent | `apps/mobile/native/ios/AGIAppIntents/AnalyzeImageIntent.swift` | Hands an image and question to the camera screen. |
| hook | Deep link router | `apps/mobile/app/_layout.tsx` | Maps verbs scan, camera and analyze_image to routes. |
| test | OcrScan test | `apps/mobile/__tests__/OcrScan.test.tsx` | Tests the bridge. |
| test | Scan send failure test | `apps/mobile/__tests__/ScanSendFailure.test.tsx` | Tests keep-on-failure and haptics. |
| test | Scan retake test | `apps/mobile/__tests__/ScanRetakeLifetime.test.tsx` | Tests retake before send. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person captures a photo or a supplied image URI arrives from an intent. | device | apps/mobile/app/(app)/scan.tsx:83-135; apps/mobile/app/_layout.tsx:304-309 |
| The app calls the native recogniser with the image URI and gets text and regions back. | device | apps/mobile/src/features/image/services/ocr.ts:15-31; native/ios/AGIVisionOCR.swift:6-7; native/android/AGIVisionOCR.kt:12 |
| The screen shows overlay and text, prefills a question, and copies text on request. | device | scan.tsx:94-101, 171-178, 389-417 |
| On Send the app creates a conversation called Scan and calls the normal send with the image attached. | device | scan.tsx:197-228 |
| In Cloud mode the image is uploaded after consent and the question goes to the Cloud model; in Local mode the text is added to the prompt for the on-device model. | device and our servers | apps/mobile/stores/chat/chatExecutionStore.ts:2472, 2484-2500, 2731-2735 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Captured photo | Device cache until sent; scanned attachment URI | Only if sent in Cloud mode | Cloud copy kept in the Library until deleted, or deleted with a temporary chat (AddToChatSheet.tsx:132-135). Device cache cleanup: unknown. |
| Recognised text and regions | Screen state; Local chat prompt text; in-memory cache of 64 entries | Text is in the chat message once sent | Cache cleared with the process (chatExecutionStore.ts:1225-1226). |
| Copied text | Device clipboard | No | By the OS clipboard. |

**Models and providers.** Recognition uses no model of ours: Apple Vision on iOS and a bundled recogniser on Android. The follow-up question goes to the selected chat model in the selected mode.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Recognition needs no account in the code read (ocr.ts has no check). Sending in Cloud mode needs sign-in (chatExecutionStore.ts:2349). |
| Permissions | Camera permission, capability canUseCamera, with 'Allow camera access' and 'Open device settings' controls when denied (scan.tsx:43-44, 284, 294). |
| Subscription | No entitlement gates recognition (none found in scan.tsx or ocr.ts). Cloud upload follows plan attachment limits (apps/mobile/src/features/chat/utils/attachmentValidation.ts:24-47). |
| Limits and metering | Prompt box 2000 characters (scan.tsx:407). Local OCR cache 64 images (chatExecutionStore.ts:1225). Recognition has no metering. |
| Feature flags | The camera capability flag canUseCamera (scan.tsx:43). No other flag found. |
| Model compatibility | Not model-dependent for recognition; the follow-up works with any selected chat model, Local or Cloud. |
| Provider restrictions | None for recognition. Cloud sending follows the chosen Cloud route. |
| Local mode | Recognition always runs on the device. In Local mode the photo is not uploaded and only text reaches the on-device model (chatExecutionStore.ts:2731-2735). No subscription is needed for recognition. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Phase 'processing' while reading; a slow-camera hint after 3.5 seconds. | scan.tsx:53-60, 88-91 |
| Empty | Badge 'No text detected' and prefill 'What does this image say?' | scan.tsx:94-100, 355-366 |
| Error | 'Text could not be read from this image. Retake the scan or type your question.' and an empty prompt. | scan.tsx:104-108 |
| Send with empty prompt | Alert 'No text to send'. | scan.tsx:182-188 |
| Send failure | Alert 'Send failed'; screen keeps the scan. | scan.tsx:214-228; ScanSendFailure.test.tsx:98 |
| Retake while sending | A generation counter discards a stale scan or send. | scan.tsx:68, 80-82, 192-205; ScanRetakeLifetime.test.tsx:80 |
| Camera denied | CapabilityUnavailable view with Open Settings; supplied image needs no camera. | scan.tsx:245-250, 284-294; SuppliedImageNeedsNoCamera.test.tsx:67-91 |
| Module not linked | The thrown error is caught and shown as the could-not-read text. | ocr.ts:16-28; scan.tsx:104-108 |
| Accessibility | Labels 'Copy extracted text', 'Prompt for AI', 'Send to AI', 'Capture and scan', 'Switch to front camera' and flash labels. | scan.tsx:392, 410, 417, 465-476, 508 |
| Offline | Recognition works offline; Cloud send fails with a 'Check your connection' alert. Detailed offline copy: not established. | scan.tsx:222-227 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/OcrScan.test.tsx`: Native bridge returns text and regions, propagates errors, throws when the module is absent, handles empty results.
- `apps/mobile/__tests__/ScanSendFailure.test.tsx`: Haptics on and off, keeps the scan when send is refused, uses the new-chat model.
- `apps/mobile/__tests__/ScanRetakeLifetime.test.tsx`: Retake before and after conversation creation.
- `apps/mobile/__tests__/SuppliedImageNeedsNoCamera.test.tsx`: Supplied image skips camera permission.
- `apps/mobile/__tests__/AppIntentPayloadDelivery.test.tsx`: Intent payloads reach the scan screen (file named by search; cases not read).

**Test scenarios**

- **Scan and copy**
  1. Open Scan Text from a shortcut.
  2. Capture a printed paragraph.
  3. Tap 'Copy text' and paste elsewhere.
  - Expected: Overlay and block count appear; pasted text matches the paragraph.
- **No text**
  1. Capture a blank wall.
  - Expected: Badge 'No text detected' or the 'Text could not be read' message; prompt is the empty or default text.
- **Send in Cloud mode**
  1. Choose a Cloud model.
  2. Scan and send.
  - Expected: Upload consent, a new conversation 'Scan' opens, and the photo is attached.
- **Local mode photo**
  1. Choose an on-device model.
  2. Attach a photo of text in a chat.
  - Expected: No upload; the prompt contains 'On-device OCR text'.
- **Unlinked module**
  1. Run a build without the native module.
  - Expected: Scan shows the could-not-read message; the error names AGIVisionOCR.

**Where to look when it fails**

- Error string 'AGIVisionOCR native module not linked' (ocr.ts:21-26).
- Alert titles 'Send failed' and 'No text to send'.
- Android dependency line in withAGIVisionOCR.cjs:13 when the module is missing from the build.
- No recorded device run of the scan on iOS or Android was found.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/043-image-and-visual-understanding.md](../../70-qa/test-plans/mobile/043-image-and-visual-understanding.md)

## 10. Gaps and dependencies

- **No in-app entry point to the scan screen was found; reach is by intent or link.** Affects: Mobile users. Evidence: apps/mobile/app/_layout.tsx:304-309; brief points at a missing capabilityShortcuts file. Work needed: Confirm or add a visible entry and correct the brief.
- **No text-extraction or copy-text action on web, desktop, CLI, VS Code and Chrome.** Affects: Those apps. Evidence: no OCR step found in their chat code; brief says partial or done. Work needed: Decide the required behaviour for each app and add it, or correct the brief statuses.
- **The scan send path uploads the photo in Cloud mode although the person asked only to read text.** Affects: Mobile Cloud users. Evidence: scan.tsx:209-215; chatExecutionStore.ts:2484-2500. Work needed: Option to send text only.
- **No chat-level test for local OCR context building.** Affects: Mobile Local. Evidence: search for 'On-device OCR text' in tests found none. Work needed: Add tests for buildLocalImageOcrContext.
- **No recorded device test of recognition quality or language coverage.** Affects: Mobile. Evidence: none found. Work needed: Run device checks per language.
- Not built on: Web, Desktop, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F043-01
- SYS-local-inference
- SYS-execution-boundaries
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-chat-turn-pipeline
- surface:mobile
- mode:local
- mode:cloud

## Unknown

- Whether any visible in-app button opens the scan screen.
- Language coverage in practice on each platform.
- What cleans captured photos from device cache.
- Whether Local mode scan send works offline end to end.
- What S43.08 'done' means for CLI, VS Code and Chrome since no OCR step was found.
