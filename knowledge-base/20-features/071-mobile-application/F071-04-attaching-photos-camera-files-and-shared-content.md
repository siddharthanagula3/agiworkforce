---
id: "F071-04"
type: "feature"
title: "Attaching photos, camera, files and shared content"
aliases: ["Attach sheet", "Add to chat", "Camera intake", "Photo picker", "File picker", "Share sheet intake", "Share preview", "Vision Analysis", "Background upload recovery", "S71.06", "S71.07", "S71.08", "S71.09", "S71.18"]
area: "71 Mobile application"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S71.06", "S71.07", "S71.08", "S71.09", "S71.18"]
depends_on: ["surface:mobile", "mode:local", "mode:cloud", "api:POST /api/uploads/presign", "store:upload-lifecycle", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-chat-turn-pipeline", "SYS-local-inference", "F071-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F071-04 Attaching photos, camera, files and shared content

Ways to put pictures, files and shared content into an AGI Mobile chat: the Add to chat sheet (Camera, Photos, Paste image, File, Library picks), an in-app camera page, and a share preview that opens when another app shares text, links, images or PDFs to AGI Mobile. Uploads do not resume by themselves.

Area: [71. Mobile application](README.md). Requirement items: [S71.06](../../10-requirements/capabilities/071-mobile-application.md#s7106), [S71.07](../../10-requirements/capabilities/071-mobile-application.md#s7107), [S71.08](../../10-requirements/capabilities/071-mobile-application.md#s7108), [S71.09](../../10-requirements/capabilities/071-mobile-application.md#s7109), [S71.18](../../10-requirements/capabilities/071-mobile-application.md#s7118).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Collects images and documents from the camera, the photo library, the Files app and the OS share sheet, checks them against mode and plan limits, and attaches them to the next message or starts a chat.

**Why it exists.** The brief requires camera intake, photo-picker intake, file-provider intake, share-sheet intake and background upload recovery (S71.06 to S71.09, S71.18). (doc: knowledge-base/data/area-briefs/071-mobile-application.md) Product requirements: selected files show chips, can be removed before send, and unsupported types show clear disabled states. (doc: docs/product/requirements.md M-US-004)

**Who uses it.** People who want to ask about a photo, a document, or a web page they found in another app.

**Problems it solves**

- Ask about what the camera sees.
- Send several photos at once.
- Bring a PDF from a storage provider.
- Send a link or selected text from a browser.

**Use cases**

- Take a photo of a receipt and ask what it says.
- Share a web page from the browser and tap 'Summarize this page'.
- Attach a PDF from the Files app to a question.
- Pick four photos from the library and compare them.

## 2. User experience

**Where to find it**

- Mobile: the plus control in the composer opens the Add to chat sheet with rows 'Camera', 'Photos', 'Paste image', 'File' and Library picks (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:697-722, 831-854).
- In-app camera page: route /(app)/camera, reached by intent links 'camera' and 'analyze_image' (apps/mobile/app/_layout.tsx:216-217, 313-320). No visible button was found that opens it from the chat.
- Share preview: opens after another app shares to 'AGI Mobile' (apps/mobile/app/_layout.tsx:281-292, 827-845).

**Before you start**

- Camera and photo library permissions through the OS (purpose strings in apps/mobile/app.config.js:62-75).
- Cloud sends need a signed-in account and Cloud consent (apps/mobile/src/features/chat/upload/uploadAttachment.ts:68-70).

**Screens and controls**

- Add to chat sheet and attachment chips with remove and retry (AttachmentPreview.tsx:185).
- In-app camera: shutter, flash, torch, flip, 'Retake photo', 'Close camera', text field for a question, send (camera.tsx).
- Share preview: shared text, file previews, truncation notice, 'Summarize this page', 'Ask about this page', primary button 'Send to Chat' or 'Add to chat' or 'Check chat', and 'Dismiss' (apps/mobile/src/features/share-preview/index.tsx:272-282, 454-471).

**Journey**

1. Plus control, then Camera: the system camera opens, you take a photo and it appears as a chip in the composer. Type a question and send.
2. Plus control, then Photos: pick one or more photos; the count is capped. They appear as chips.
3. Plus control, then File: pick one or more files; they are copied to the app cache and appear as chips.
4. Alternative: open the in-app camera page by an intent link; take a photo, review it, optionally type a question, send. With no chat open it starts a chat named 'Vision Analysis'. The default question is 'What do you see in this image?'.
5. From another app, Share to AGI Mobile. Check the preview. Tap 'Send to Chat' to start a chat with the text, or 'Add to chat' to stage files in the composer.
6. If an upload stops, tap retry on the chip.

**What the person sees and gets**

- Chips with upload progress ('Uploading 40%', 'Verifying', 'Uploaded') and failure labels ('Upload failed', 'Upload canceled', 'Upload stopped in the background') (apps/mobile/src/features/chat/upload/uploadLifecycle.ts:44-58).
- Alerts: 'Camera Access' with Open Settings, 'Camera', 'Photos', 'Paste image', 'Error', 'Capture failed', 'Send failed', 'Attachment not added' (chat/[id].tsx:1521-1620; camera.tsx:84-86, 134-146; share-preview/index.tsx:190-195).
- Notice 'Content was truncated to 100 KB before sending.' (share-preview/index.tsx:44-46).

**Settings**

- Photos and Camera permission in the OS settings; the app offers Open Settings (chat/[id].tsx:1535-1538).
- Image metadata is stripped before use; no setting.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The sheet's Camera opens the system camera through the image picker, then strips metadata; photos stage in the composer (apps/mobile/app/(app)/chat/[id].tsx:1521-1556; apps/mobile/src/features/media/photo-picker.ts:41-52).
- Library photos: multi-select, ordered, with metadata removed (photo-picker.ts:26-39). Selection limit is the per-message file limit, or the plan photo limit when that is null (chat/[id].tsx:1575-1595; apps/mobile/src/features/chat/utils/photoSelectionLimit.ts:3-5).
- Files: system document picker, multiple, copied to cache; types are PDF, text, markdown, CSV, plus Office types in Cloud (chat/[id].tsx:1601-1618; apps/mobile/services/docParser.ts:105-116).
- Paste image from clipboard (chat/[id].tsx:1558-1573).
- Validation: empty files rejected; size ceilings by mode; denied extensions; HEIC refused in Cloud with advice; Local refuses Office types (apps/mobile/src/features/chat/utils/attachmentValidation.ts:34-47, 100-126).
- Cloud uploads: POST /api/uploads/presign then transfer, up to 2 retries with 1 s, 2 s waits, consent first (apps/mobile/services/api.ts:700-715; apps/mobile/src/features/chat/upload/uploadAttachment.ts:15-18, 68-83).
- In-app camera: takes the photo with exif off, creates 'Vision Analysis' when no chat is open, sends with the selected model (apps/mobile/app/(app)/camera.tsx:73-76, 117-135).
- Share intake: Android intent filters for SEND, SEND_MULTIPLE (text, images, PDF) and PROCESS_TEXT (apps/mobile/app.config.js:318-338) with a native plugin that copies streams to cache and rewrites to a deep link (apps/mobile/native/android/withAGIShareIntent.cjs); iOS share extension and app-group inbox (apps/mobile/app.config.js:510-530; apps/mobile/src/features/share-preview/iosShareInbox.ts).
- Shared text is cut to 100 KB, tags stripped and wrapped in <shared_via_intent> so the model reads it as data (share-preview/index.tsx:43-66).
- Cloud offline: attachments cannot be queued; alert and the draft stays (chat/[id].tsx:859-866).

**Incomplete**

- Interrupted uploads are only marked: when the app goes to the background in-flight uploads get an interrupted flag; the person must tap retry. No automatic resume was found. (apps/mobile/stores/chat/chatExecutionStore.ts:1144-1147; uploadLifecycle.ts:116-130; AttachmentPreview.tsx:185)
- The in-app camera page has no visible entry from the chat; it is reached by intent links. (apps/mobile/app/_layout.tsx:216-217, 313-320)

**Present but disconnected or switched off**

- Android App Intents and quick actions are listed as not applicable in the brief (S71.23); the intent verbs camera, ask and summarize in _layout.tsx do exist but how they are launched was not traced.

**Not available**

- Automatic upload resume on any app (S71.18).
- Web, Desktop, CLI, VS Code, Chrome: not part of this feature.

## 4. Required behaviour

**Established requirements**

- The user can take a photo with the phone camera and it is attached to (or sent in) a chat. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.06)
- The user can pick up to several photos from the system photo library and they attach to the message. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.07)
- The user can attach a file from the OS document picker to a chat. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.08)
- Sharing text, links, images or PDFs to the app opens a preview that starts a chat or stages the files. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.09)
- An attachment upload interrupted by backgrounding continues or resumes automatically when the app returns. The brief marks this not applicable anywhere. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.18)
- Selected files show chips, removal before send works, unsupported types show clear states, and sending a file cannot cross Local to BYOK or Cloud without consent. (source: docs/product/requirements.md M-US-004 (doc: docs/product/requirements.md))

**Acceptance criteria**

1. Camera, Photos, Paste image and File each add chips or show an alert that explains why not.
2. A denied camera permission shows 'Camera Access' with an Open Settings button.
3. In Cloud, selecting more files than the limit rejects the extras with a message naming the limit.
4. In Local, Office files are refused with advice to use Cloud.
5. Sharing 200 KB of text shows the truncation notice and sends at most 100 KB.
6. 'Summarize this page' appears only when the shared text holds a web link.
7. An offline Cloud send with a photo keeps the photo and the text and shows the alert.
8. Backgrounding mid-upload leaves a chip with a retry control after return.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Upload interruption leaves the chip in a failed state until the request errors; the phase is not changed by the background flag alone. [inferred from uploadLifecycle.ts:116-130]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Resume or restart interrupted Cloud uploads on return to the foreground, or record S71.18 as intentionally manual.
- [proposed] Add a visible entry to the in-app camera or retire it in favour of the sheet camera.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Camera, Photos, Paste image, File rows and Library picks. |
| screen | Chat screen attach handlers | `apps/mobile/app/(app)/chat/[id].tsx` | handleSheetCamera, handleSheetPhotos, handleSheetFile, handleSheetPasteImage and offline attachment rule. |
| screen | In-app camera page | `apps/mobile/app/(app)/camera.tsx` | Capture, review, send with a default question. |
| service | photo-picker | `apps/mobile/src/features/media/photo-picker.ts` | Library and camera pickers that strip metadata. |
| other | image-metadata and image-normalization | `apps/mobile/src/features/media/image-metadata.ts` | Removes picture metadata; picker options and file naming. |
| other | attachmentValidation | `apps/mobile/src/features/chat/utils/attachmentValidation.ts` | Per-mode size, count and type rules. |
| other | photoSelectionLimit | `apps/mobile/src/features/chat/utils/photoSelectionLimit.ts` | Plan limit of attachments per message. |
| service | docParser | `apps/mobile/services/docParser.ts` | Allowed document types and on-device parsing for Local. |
| service | uploadAttachment and uploadLifecycle | `apps/mobile/src/features/chat/upload/uploadAttachment.ts` | Cloud upload with retries, progress state and background flag. |
| store | useUploadLifecycleStore | `apps/mobile/src/features/chat/upload/uploadLifecycle.ts` | Per-file upload phase, progress, interrupted flag. |
| service | api.uploadFile | `apps/mobile/services/api.ts` | Presign request then upload for Cloud attachments. |
| endpoint | POST /api/uploads/presign | `apps/web/app/api/uploads/presign` | Server route that issues the upload target (route folder exists; method not read). |
| screen | Share preview | `apps/mobile/src/features/share-preview/index.tsx` | Shows shared content and sends or stages it. |
| service | iOS share inbox | `apps/mobile/src/features/share-preview/iosShareInbox.ts` | Claims and acknowledges shares left by the iOS extension. |
| integration | Android share intent plugin | `apps/mobile/native/android/withAGIShareIntent.cjs` | Rewrites SEND, SEND_MULTIPLE, PROCESS_TEXT intents into a deep link. |
| config | Expo app config share and permissions | `apps/mobile/app.config.js` | Intent filters, permission purposes, iOS share extension target. |
| screen | Root layout intent handling | `apps/mobile/app/_layout.tsx` | Opens camera, share-preview and other verbs from intent links. |
| other | composerHandoff | `apps/mobile/src/features/chat/composerHandoff.ts` | Stages attachments and text for the composer. |
| component | AttachmentPreview | `apps/mobile/src/features/chat/components/AttachmentPreview.tsx` | Chips with progress, remove and retry. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person picks an image or file with an OS picker; metadata is removed from images and files are copied to the app cache. | device | photo-picker.ts:26-52; chat/[id].tsx:1601-1618 |
| The app checks type, size and count against mode and plan rules. | device | attachmentValidation.ts:34-47, 100-175 |
| Local send: documents are parsed on the phone and added to the prompt; nothing is uploaded. | device | attachmentValidation.ts:19-27 (comment on Local parsing); apps/mobile/services/docParser.ts |
| Cloud send: after consent the app asks our servers for an upload target, then uploads, with up to two retries. | device and our servers | uploadAttachment.ts:68-83; services/api.ts:700-715; MANAGED_CLOUD_CHAT_ATTACHMENT_PRESIGN_PATH packages/contracts/cloud-contracts/src/chat-attachments.ts:18 |
| The storage step after presign (where the bytes go) is not traced here. | outside service | unknown; services/api.ts after line 730 not read |
| Another app shares content; Android rewrites the intent, iOS leaves it in an app-group inbox; the root layout opens the share preview. | device | native/android/withAGIShareIntent.cjs; iosShareInbox.ts:44-50; apps/mobile/app/_layout.tsx:827-845 |
| Send to Chat creates a chat and sends the wrapped text with the model the person last selected for a new chat. | device and our servers | share-preview/index.tsx:213-225; model may be Local or Cloud |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Picked and captured images and files | app cache on the device | Cloud uploads go to our storage; Local never leaves the device | pasted text files are removed after send (ChatInput.tsx:1066-1072); other cache cleanup not traced |
| Upload progress and phase | in-memory store | no | cleared after send (ChatInput.tsx:1066-1072) |
| Shared text and file handoff | memory handoff key and iOS app-group inbox | no | iOS receipts are acknowledged after adoption (iosShareInbox.ts:44-60, shareReceiptSettlement.ts) |

**Models and providers.** Image understanding depends on the selected model's input support. The attach rules treat Local and Cloud separately; which models accept images is decided elsewhere (SYS-model-catalog-and-routing). A shared-content chat uses the selected model and, for Cloud, passes the Cloud consent gate in the send path (not traced here).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Local: none. Cloud uploads need a signed-in account (upload requests carry the session, services/api.ts:700-715). |
| Permissions | Camera permission, photo library permission (iOS purpose strings and Android permissions in app.config.js:62-75, 300-312). The app offers Open Settings when camera permission is off. |
| Subscription | Files per message in Cloud is the smaller of the server limit and the plan limit (attachmentValidation.ts:34-47). A daily upload limit message exists (uploadAttachment.ts:7). |
| Limits and metering | Cloud: per-file size by type, files per message and bytes per message from the server limits (attachmentLimits). Local: a device ceiling per file, no count limit (attachmentValidation.ts:34-47). Shared text: 100 KB (share-preview/index.tsx:43). |
| Feature flags | none found in the code for these controls |
| Model compatibility | Not checked at attach time except type and size; model image support not traced. NewChatPhotoPickerLimit test covers server-announced limits. |
| Provider restrictions | Cloud rejects HEIC and image types outside JPEG, PNG, GIF, WebP (attachmentValidation.ts:100-118). |
| Local mode | Works with no account and no payment. Documents are limited to PDF, text, markdown and CSV, parsed on the phone; Office files are refused. Photo picker limit falls back to the plan limit even in Local (chat/[id].tsx:1582-1586; test NewChatPhotoPickerLimit). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Camera or photos permission denied | 'Camera Access' alert with Not now and Open Settings. | chat/[id].tsx:1521-1540 |
| Picker failure | Alerts 'Camera', 'Photos', 'Error', and a metadata recovery message on PictureMetadataError. | chat/[id].tsx:1546-1620 |
| Clipboard has no image | Alert 'Paste image' with 'There is no image on the clipboard to paste.' | chat/[id].tsx:1558-1573 |
| Too many or too large files | Rejected with named reason; others kept. | attachmentValidation.ts:140-175 |
| Upload in flight | Send is held until it settles. | ChatInput.tsx:874-877 |
| Upload fails or is canceled | Chip shows failed or canceled with retry; not retried after cancel. | uploadLifecycle.ts:38-58; AttachmentPreview.tsx:185; test:apps/mobile/__tests__/FileUploadLifecycle.test.tsx |
| App goes to background during upload | interrupted flag set; label 'Upload stopped in the background' once the upload has failed; no auto resume. | chatExecutionStore.ts:1144-1147; uploadLifecycle.ts:56-58, 116-130 |
| Offline Cloud with attachments | Alert 'Connect to send attachments'; draft kept. | chat/[id].tsx:859-866 |
| File no longer available after restore | Alert 'File no longer available'. | ChatInput.tsx:866-872 |
| Share text over 100 KB | Cut with a notice. | share-preview/index.tsx:43-60 |
| Share while mode or account changes | The preview's send is invalidated so content does not cross modes. | share-preview/index.tsx:94-165 |
| Cloud consent declined | Nothing uploaded; file marked failed. | uploadAttachment.ts:68-70; test FileUploadLifecycle 'uploads nothing and marks the file failed when consent is declined' |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/attachment-validation.test.ts`: Images accepted without the parser, parseable documents accepted, unsupported types rejected with a reason, oversize rejected first.
- `apps/mobile/__tests__/NewChatPhotoPickerLimit.test.tsx`: Cloud photo limit follows the server and plan; Local keeps the plan limit.
- `apps/mobile/__tests__/CameraDeepLinkTarget.test.tsx`: Capture goes into the open chat or starts a chat; model used.
- `apps/mobile/__tests__/FileUploadLifecycle.test.tsx`: Progress never goes backwards, progress bar accessibility, no upload when consent declined, no retry after cancel.
- `apps/mobile/__tests__/SharePreviewAdmission.test.ts`: Locks across Send and Summarize, refused send retry, stale lifetime, no duplicate chat.
- `apps/mobile/__tests__/SharePreviewButtonNames.test.tsx`: Button names match visible words and Dismiss is a button.
- `apps/mobile/__tests__/SharePreviewSizeCopy.test.ts`: Size text uses KB and equals the truncation size.
- `apps/mobile/__tests__/share-intent-plugin.test.ts`: Android plugin rewrites SEND and PROCESS_TEXT, copies streams to cache.
- `apps/mobile/__tests__/ios-share-extension.test.ts`: iOS share extension registration, accepted types and signing target.
- `apps/mobile/__tests__/ios-share-inbox.test.ts`: iOS share inbox (titles not read).
- `apps/mobile/__tests__/android-shared-files.test.ts`: Android shared files (titles not read).
- `apps/mobile/__tests__/offline-cloud-attachments.source.test.ts`: Offline Cloud branch refuses files before queueing.
- `apps/mobile/__tests__/local-chat-attachments.test.ts`: Local chat attachments (titles not read).
- `apps/mobile/src/features/media/__tests__/image-metadata.test.ts`: Metadata removal (titles not read).

**Test scenarios**

- **Photos over the limit**
  1. In a Cloud chat open Add to chat, then Photos.
  2. Select more photos than the message limit.
  - Expected: The picker caps the selection; extra files are rejected with the limit named.
- **Camera permission off**
  1. Turn camera permission off in OS settings.
  2. Choose Camera in the sheet.
  - Expected: 'Camera Access' alert with Open Settings.
- **Share a web page**
  1. In a browser, Share, choose AGI Mobile.
  2. Tap 'Summarize this page'.
  - Expected: A chat opens with the page link wrapped as data and a summary request is sent.
- **Share a PDF**
  1. Share a PDF from the Files app to AGI Mobile.
  2. Tap 'Add to chat'.
  - Expected: The PDF is a chip in the composer of the open or new chat.
- **Background during upload**
  1. Start a large Cloud upload.
  2. Switch to another app for a minute and return.
  - Expected: Chip shows a stopped or failed label with retry; nothing resumes by itself.
- **Offline with photo**
  1. Go offline in a Cloud chat, attach a photo, send.
  - Expected: 'Connect to send attachments' alert; draft intact.

**Where to look when it fails**

- Console warnings with prefix '[RootLayout]' for iOS share inbox import errors (app/_layout.tsx:840-842).
- Upload errors surface as chip labels; server-side check POST /api/uploads/presign logs (not read).
- Upload phase store: useUploadLifecycleStore.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/071-mobile-application.md](../../70-qa/test-plans/mobile/071-mobile-application.md)

## 10. Gaps and dependencies

- **No automatic resume of interrupted uploads.** Affects: Mobile users in Cloud mode who background the app during an upload.. Evidence: apps/mobile/src/features/chat/upload/uploadLifecycle.ts:116-130; chatExecutionStore.ts:1144-1147; S71.18. Work needed: Restart failed-by-interruption uploads on foreground, or accept manual retry and update the brief.
- **Two different camera paths exist; the in-app camera page has no visible entry.** Affects: Mobile users.. Evidence: app/_layout.tsx:216-217, 313-320; AddToChatSheet.tsx:697. Work needed: Decide which path is the product; remove or expose the other.
- **Local mode still caps photos by the plan limit even though nothing is uploaded.** Affects: Mobile Local users on low plans.. Evidence: chat/[id].tsx:1582-1586; test NewChatPhotoPickerLimit 'keeps the plan limit in Local'. Work needed: Confirm intent against 'local inference is free of any paid subscription'.
- **Where Cloud upload bytes are stored after presign was not traced.** Affects: Documentation of the data flow.. Evidence: services/api.ts after 730 not read. Work needed: Read the rest of api.uploadFile and the presign route.

**Depends on**

- surface:mobile
- mode:local
- mode:cloud
- api:POST /api/uploads/presign
- store:upload-lifecycle
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-chat-turn-pipeline
- SYS-local-inference
- F071-02

## Unknown

- What happens to uploaded bytes after presign (storage service not read).
- Whether any visible control opens the in-app camera page; only intent links were found.
- How Local-mode vision works for images (model support) and whether Local rejects images for text-only models.
- Cleanup timing of cached copies of picked files.
- Contents of SAFE_IMAGE_PICKER_OPTIONS (image-normalization.ts not opened).
- Whether the app prompts for Cloud consent when a share starts a Cloud chat (llmGate not traced for that path).
