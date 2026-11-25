---
id: "F043-01"
type: "feature"
title: "Ask a question about one or more attached images"
aliases: ["Image questions", "Attach a photo or screenshot", "Vision chat", "Add photos & files", "Multi-image comparison", "Screenshot interpretation", "S43.01", "S43.02", "S43.03"]
area: "43 Image and visual understanding"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S43.01", "S43.02", "S43.03"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-local-inference", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-api-and-contracts", "file:packages/contracts/cloud-contracts/src/chat-attachment-policy.json", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "surface:desktop", "mode:cloud", "mode:local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F043-01 Ask a question about one or more attached images

The person attaches one or more pictures, or a screenshot, to a chat message and asks about them. The picture is checked, prepared and sent with the question to a model that can read images. Mobile Local mode cannot show the model the picture; it sends the on-device recognised text instead.

Area: [43. Image and visual understanding](README.md). Requirement items: [S43.01](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4301), [S43.02](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4302), [S43.03](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4303).

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

**What it does.** Lets a person put one image, several images or a screenshot into a chat message so a vision-capable model can answer a question about them. A screenshot is just an image file, so the same path covers captured and pasted screenshots.

**Why it exists.** Competing assistants answer questions about pictures, and the brief lists single-image questions, multi-image comparison and screenshot interpretation as required for every app (doc: knowledge-base/data/area-briefs/043-image-and-visual-understanding.md, items S43.01 to S43.03). The one-chat requirement says a user adds images to a normal chat rather than using a separate file chat (doc: docs/product/requirements.md, section 4.2).

**Who uses it.** Any signed-in chat user on web, desktop, mobile, CLI, VS Code and the Chrome extension, including developers who paste error screenshots into the CLI or VS Code.

**Problems it solves**

- Describing a picture in words is slow and loses detail.
- Comparing two pictures by hand is hard.
- Explaining a screenshot of an error or a screen to an assistant.

**Use cases**

- Attach a screenshot of an error in VS Code and ask what is wrong.
- Attach two photos on the web composer and ask what changed.
- Take a photo on the phone and ask about it.
- Run the CLI with a file option for a screenshot and ask for a summary.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron shows the hosted web app, AGENTS.md section 5): composer plus menu row 'Add photos & files' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:147), files menu entry 'Upload from device' (apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:33), clipboard attach from the plus menu (ChatComposerNew.tsx:6021).
- Mobile: add-to-chat sheet rows 'Camera', 'Photos', 'Paste image', 'File' (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:697-722); a separate camera screen (apps/mobile/app/(app)/camera.tsx) and a scan screen (apps/mobile/app/(app)/scan.tsx).
- CLI: launch option -f / --file (apps/cli/src/lib.rs:227), slash command /attach <file>, /attach --full <image>, /attach clipboard, and Ctrl+V (apps/cli/src/tui/tui_app.rs:6215-6275, 4095-4103).
- VS Code: the + button labelled 'Attach or use tools' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3356), drag and drop onto the composer (webviewContent.ts:7720) and paste (webviewContent.ts:7730).
- Chrome extension: side panel composer, paste (apps/extension/src/side_panel.ts:14584) and file picker (side_panel.ts:14688).

**Before you start**

- Web: a model that reads images; the server refuses otherwise (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5099-5113).
- Mobile Cloud: sign-in and consent to upload (apps/mobile/stores/chat/chatExecutionStore.ts:2484-2500; apps/mobile/src/features/chat/upload/uploadAttachment.ts:68). Camera permission for the Camera row (apps/mobile/app/(app)/chat/[id].tsx:1526).
- CLI: a vision model; /attach and Ctrl+V refuse otherwise (apps/cli/src/tui/tui_app.rs:853-856).
- Web free models: a text-only free model disables attaching (ChatComposerNew.tsx:6039-6042).

**Screens and controls**

- Web composer: plus menu with 'Add photos & files' and a note of the form 'Up to N files, size' (ChatComposerNew.tsx:920); attachment chips with previews (apps/web/features/chat/components/Composer/AttachmentPreview.tsx imported at ChatComposerNew.tsx:92).
- Mobile: add-to-chat sheet; in Local mode it shows the note 'On-device models read the text in photos, not the picture itself.' (AddToChatSheet.tsx:130, shown at 741).
- CLI: chip line listing staged files with '/attach remove to drop' (tui_app.rs:3280); /attach list and /attach remove [n|all] (tui_app.rs:6215-6245).
- VS Code: attachment strip, list aria-label 'Pending attachments', chip remove button aria-label 'Remove attachment <name>' (webviewContent.ts:3332, 7600-7610 area).

**Journey**

1. Open a chat in any app.
2. Attach one or more images: pick files, take a photo, paste, drag in, or stage them from the CLI.
3. See the chips or previews. Remove any you do not want.
4. Type the question and send.
5. The app uploads or encodes the images and sends them with the question to the chosen model.
6. Read the answer in the chat.

**What the person sees and gets**

- Chips with name and size in the CLI (tui_app.rs:866-875), previews on web and VS Code.
- Refusal text when the model cannot read images: web 'The selected model cannot read images. Choose a vision-capable model.' (request-processor.ts:5106); CLI '<model> does not accept images; switch to a vision model with /model first' (tui_app.rs:853-856).
- Too many images: 'The selected model takes up to N images in one request. Remove some images or split the request.' (request-processor.ts:5138).
- Answer text from the model.

**Settings**

- CLI: /attach --full sends the image without scaling it down (tui_app.rs:5485).
- Web API: image detail value auto, low, high or original on an image part (apps/web/app/api/llm/v1/chat/completions/lib/image-detail.ts:5).
- Model choice (Auto or a named model) decides whether images are accepted.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web upload path: file picked, uploaded through the presign and complete routes, then scanned for executable signatures, type confusion, credentials and, when configured, an external scanner; a rejected file is deleted (apps/web/lib/server/chat-attachment-completion.ts:397-420; apps/web/lib/security/upload-scan.ts:342, 601; doc: docs/security/upload-scanning.md).
- Web turn path: the stored image is re-encoded only when it is too large, too wide, animated or in an unreadable format, then handed to the model as a data URL (apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:654-676; apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts:63-121).
- Web refuses a turn whose model cannot read images, whose image detail value the model does not accept, or whose image count passes the model limit (request-processor.ts:5099-5147).
- Mobile Cloud: images are uploaded after consent with up to two retries (apps/mobile/src/features/chat/upload/uploadAttachment.ts:15, 83) and sent as file references (chatExecutionStore.ts:2745-2752).
- CLI: images are read from disk, resized to fit, base64 encoded and sent as image blocks; clipboard images and the full-size option also work (apps/cli/src/lib.rs:8383-8400; apps/cli/src/tui/tui_app.rs:836-885, 916-940).
- VS Code: drop and paste become pending image attachments stored as data URLs and are sent through the CLI app-server host, which caps 8 images per turn and 10 MB each (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2207-2214; apps/cli/src/app_server/developer_host.rs:132-138, 7573).
- Chrome extension: composer accepts PNG, JPEG, WebP and GIF by paste or picker, checks size and a per-model image limit, and sends images with the turn (apps/extension/src/side_panel.ts:10059, 10177, 10343, 9501).

**Incomplete**

- Web and Desktop have no recorded live check on production; the brief marks them partial pending a live check after deploy (doc: knowledge-base/data/area-briefs/043-image-and-visual-understanding.md, S43.01 Unfinished).
- Mobile Local mode: the on-device text model never sees the picture; it gets recognised text only (apps/mobile/stores/chat/chatExecutionStore.ts:1241-1262, 2731-2735).
- The web composer was not seen to warn before send that the chosen paid model cannot read images; the refusal is on the server after send [inferred from request-processor.ts:5099 and no composer check found].

**Present but disconnected or switched off**

- The CLI ACP server advertises image prompt capability as false (apps/cli/src/app_server/acp.rs:401), so that entry route does not take images.
- If the upload scanner is required in production and not configured, every upload is refused with an external_scanner or scan_unavailable finding (apps/web/lib/security/upload-scan.ts:408-440; doc: docs/security/upload-scanning.md).

**Not available**

- Region selection, crop or zoom, annotated answers and input-quality warnings are not available on any app (doc: knowledge-base/data/area-briefs/043-image-and-visual-understanding.md, S43.09 to S43.11, S43.19).
- Own-key and Local-mode image handling on web, desktop and CLI: not established.

## 4. Required behaviour

**Established requirements**

- A user attaches one image and asks a question; the image reaches a vision-capable model with the question. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.01)
- A user attaches two or more images to one message and the model receives all of them to compare. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.02)
- A user shares a captured or pasted screenshot and the model explains what it shows. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.03)
- AGI keeps one chat: files, images and references are added to a normal chat, not a separate file chat. (source: docs/product/requirements.md section 4.2)
- Ask for consent before sending files to a provider and show the provider and model before use. (source: docs/product/requirements.md section 2.5 (native-first trust rules))
- Local, own-key and Cloud are separate trust boundaries; nothing silently routes a Local file to another mode. (source: AGENTS.md section 6)

**Acceptance criteria**

1. Attaching a PNG, JPEG, GIF or WebP file on the web composer shows a chip and the question is answered from the picture by a vision model.
2. Attaching two images in one message sends both; the answer refers to both.
3. Selecting a model that cannot read images and sending a picture returns a clear refusal and no model request is made.
4. A file whose bytes do not match its image type is rejected and deleted, with no answer.
5. On mobile in Local mode the app says the model reads only the text in the photo, and the picture is not uploaded.
6. In the CLI, /attach on a non-vision model refuses with the switch-model message; on a vision model it shows a chip.
7. Sending more images than the model allows is refused with the model's image limit in the message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A picture sent in Cloud mode should be visible to the person as the same picture the model read, including a note when it was shrunk or animated; web adds a note for an animated image (model-image.ts:77-79) [inferred].
- Paid-plan attachment limits should be the single source for every app that uploads [inferred from apps/web/lib/server/attachment-allowance.ts:83-97 and apps/mobile/src/features/chat/utils/attachmentValidation.ts:24-47].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Disable or badge the attach control on web when the selected paid model cannot read images, as the free text-only model already does.
- [proposed] Record a production run for each app with the S43.01 scenario and store the result in the audit register.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Web composer plus menu | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Row 'Add photos & files', attach note, not-supported badge for text-only free models. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Hosts useAttachments with plan limits, clipboard attach, image previews and send. |
| hook | useAttachments | `apps/web/features/chat/hooks/use-attachments.ts` | Checks count, size, image size and plan limits before upload. |
| config | chat-attachment-policy | `packages/contracts/cloud-contracts/src/chat-attachment-policy.json` | Accepted image types, size caps, model-image envelope (5,000,000 base64 bytes, 8000 px edge). |
| service | chat-attachments contract | `packages/contracts/cloud-contracts/src/chat-attachments.ts` | Supported types check, presign and complete paths, image envelope constants. |
| endpoint | chat attachment complete route | `apps/web/app/api/uploads/chat-attachment/complete/route.ts` | Finishes an upload and calls completeChatAttachmentUpload. |
| service | chat-attachment-completion | `apps/web/lib/server/chat-attachment-completion.ts` | Scans the stored bytes, purges rejected objects, runs outbound content inspection. |
| service | upload-scan | `apps/web/lib/security/upload-scan.ts` | Signatures, type confusion, credential scan, external malware scanner call. |
| service | chat-attachment-hydration | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Turns an attached asset into an image_url part for the model. |
| service | model-image | `apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts` | Re-encodes an image to fit the model envelope; notes animated frames. |
| endpoint | request-processor image checks | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Schema for image parts, model_no_vision, image_detail_unsupported, too_many_images. |
| service | media-input | `apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts` | Per-model and per-route maximum images per request. |
| service | attachment-allowance | `apps/web/lib/server/attachment-allowance.ts` | Plan byte, per-message and daily upload allowances. |
| service | free-quota-turn | `apps/web/lib/server/free-quota-turn.ts` | Free-model image rules and refusal copy. |
| service | mobile uploadFile | `apps/mobile/services/api.ts` | Mobile attachment upload with size and type checks. |
| service | mobile uploadAttachment | `apps/mobile/src/features/chat/upload/uploadAttachment.ts` | Consent, retries, progress and failure copy. |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Camera, Photos, Paste image, File rows and Local-mode note. |
| store | chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Sends image file references in Cloud; builds OCR context in Local. |
| command | CLI TUI attach | `apps/cli/src/tui/tui_app.rs` | /attach, /attach --full, /attach clipboard, Ctrl+V, vision refusal, chips. |
| service | CLI image encoder | `apps/cli/src/lib.rs` | load_image_attachment, is_image_extension, --file reader. |
| service | utils-image crate | `crates/agiworkforce-utils-image/src/lib.rs` | Resizes to 2048 by 768 bounds or keeps original; caches 32 results. |
| service | CLI image limit refusal | `apps/cli/src/agent/chat.rs` | Refuses a message over the model's image limit. |
| hook | VS Code composer drop and paste | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Drop, paste and chip rendering in the sidebar webview. |
| store | VS Code ChatStateManager | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Stores pending image attachments as data URLs. |
| service | CLI developer host | `apps/cli/src/app_server/developer_host.rs` | Validates image data URLs and local images, 8 images and 10 MB caps. |
| component | Chrome side panel composer | `apps/extension/src/side_panel.ts` | Accepts images by paste or picker, per-model limit notice, sends them. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web and Desktop: the person picks, pastes or drops an image; the composer checks count, size and plan limits. | device | apps/web/features/chat/hooks/use-attachments.ts:412; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:943-952 |
| The browser uploads the file through the presign and complete routes into private storage. | our servers | packages/contracts/cloud-contracts/src/chat-attachments.ts:15-16; apps/web/app/api/uploads/chat-attachment/complete/route.ts:19-45 |
| The server inspects the bytes (signatures, type confusion, credentials, data policy) and posts them to the upload scanner; a failure deletes the object and refuses. | our servers | apps/web/lib/server/chat-attachment-completion.ts:397-440; apps/web/lib/security/upload-scan.ts:418-460; doc: docs/security/upload-scanning.md says the scanner service is our own |
| At send time the chat endpoint loads the stored asset, re-encodes it only if needed and builds an image_url data URL part. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:654-676 |
| The server refuses if the resolved model cannot read images, rejects an unsupported detail value, and refuses over the image limit. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5099-5147 |
| The request, with the picture, goes to the chosen model provider and the answer streams back. | outside service | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5099 (route resolved before); provider name depends on the route, not fixed |
| CLI: the image file is read, resized (or kept with --full), base64 encoded, held as a pending block and sent with the next message. | device | apps/cli/src/tui/tui_app.rs:836-885; apps/cli/src/lib.rs:8383-8400; crates/agiworkforce-utils-image/src/lib.rs:19-22 |
| VS Code: the webview reads the dropped or pasted file; the extension holds a data URL; the CLI host validates and passes it as an image block. | device | apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7720-7744; ChatStateManager.ts:2207-2214; apps/cli/src/app_server/developer_host.rs:1672-1679 |
| Mobile Cloud: after consent the app uploads the image and sends an asset reference; Mobile Local: the app runs on-device OCR and sends text. | device and our servers | apps/mobile/stores/chat/chatExecutionStore.ts:2484-2500, 2731-2735, 2745-2752 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Uploaded chat image (original bytes) | Private object storage; asset record behind /api/files/ (table name not established) | Yes, through the account on web and mobile Cloud | Deleted on a failed scan (chat-attachment-completion.ts:420). Mobile note: kept in the Library until deleted, or deleted with a temporary chat (AddToChatSheet.tsx:132-135). |
| Model copy of the image | Built in memory per request; the stored file is not changed | No | Per request only (model-image.ts:56-62 comment). |
| CLI pending image block and staged chip | Session memory in the CLI process | No | Drained when the turn is sent; /attach remove drops it (tui_app.rs:943-965). Whether stored in conversation history files: unknown. |
| VS Code pending attachment | Extension memory (_pendingAttachments) | No | Cleared on send or reset (ChatStateManager.ts:2986, 4240). |

**Models and providers.** Any model whose registry metadata says it reads images may be used; the server checks the capability on the resolved model, including a model Auto picked (request-processor.ts:5098-5113). Routing treats an image attachment as an image signal (request-processor.ts:4502-4510). Per-route and per-model image counts come from the model registry and harness data (media-input.ts:60-66). The provider is not fixed by this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web upload routes need a signed-in user and a scoped database (apps/web/app/api/uploads/chat-attachment/complete/route.ts:19). A guest chat route exists (apps/web/app/api/llm/v1/chat/completions/guest); its image handling was not read: unknown. CLI Local and own-key use without an account: not established. |
| Permissions | Mobile camera permission for the Camera row and scan screens (apps/mobile/app/(app)/chat/[id].tsx:1526-1540); the capability canUseCamera gates the camera screens (scan.tsx:43). Mobile Cloud asks consent before the first upload (apps/mobile/src/features/chat/utils/cloudUploadConsent.ts). |
| Subscription | Reading images has no plan entitlement of its own that was found. Plan limits apply to attachments: bytes per file, files per message and daily uploads (apps/web/lib/server/attachment-allowance.ts:83-97, 179; packages/contracts/types/src/billing-catalog.ts:757-785). Free text-only models cannot take attachments and a free model with image input has its own rules (apps/web/lib/server/free-quota-turn.ts:761-770). Plan values per plan not read; see SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | Image up to 20,971,520 bytes with handshake, 12,582,912 without; 20 files per message (10 without handshake) (packages/contracts/cloud-contracts/src/chat-attachment-policy.json:2-12). Model copy up to 5,000,000 base64 bytes and 8000 px (same file:60-64). CLI app-server: 8 images, 10 MB each, 20,000,000 combined (apps/cli/src/app_server/developer_host.rs:132-134). VS Code attachment 10,000,000 bytes (apps/extension-vscode/src/protocol/webviewMessages.ts:171). Token metering for image input: the free-trial estimator counts per-image tokens (apps/web/lib/services/free-trial-service.ts:197-209); the paid metering rule for image tokens was not read. |
| Feature flags | UPLOAD_SCAN_WEBHOOK_URL, UPLOAD_SCAN_WEBHOOK_TOKEN and UPLOAD_SCAN_REQUIRED control the malware scanner (apps/web/lib/security/upload-scan.ts:408-440). Mobile feature flags for attachments: none found in the code read. |
| Model compatibility | Only models with the vision capability; others get code model_no_vision, HTTP 400 (request-processor.ts:5099-5113). The CLI checks supports_vision from its model catalog (apps/cli/src/model_catalog.rs:213, tui_app.rs:853). Detail values beyond auto, low, high may be refused per model (image-detail.ts:5-28). |
| Provider restrictions | Provider routes may take fewer images; the strictest route bounds the inline image size (chat-attachments.ts comment on CHAT_MODEL_IMAGE_ENVELOPE). Animated images show only the first frame (model-image.ts:77-79). Provider support for original detail: unknown beyond the model registry. |
| Local mode | Mobile Local: no upload, no subscription; on-device OCR text is added to the prompt, and the sheet says the model reads text not the picture (chatExecutionStore.ts:1241-1262; AddToChatSheet.tsx:130). Desktop, web and CLI Local image handling: unknown. The CLI app-server marks the ACP entry as image false (acp.rs:401). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web: an attachment preparing blocks send until it lands (ChatComposerNew.tsx:2342-2344). Mobile: upload progress is reported per attachment (uploadAttachment.ts:83-90). VS Code: chips show 'uploading' until the host acknowledges (webviewContent.ts:7467-7475). | as listed |
| Empty | Web and mobile composer empty-state copy for images was not read: not established. Mobile: 'The file is empty and cannot be attached.' text for a zero-byte file (apps/mobile/services/api.ts:668-672). | apps/mobile/services/api.ts:668-672 |
| Unsupported type | Web refuses a file the policy does not list; mobile says 'Chat supports images, PDFs, and text/code files.'; Chrome shows 'cannot be attached. Attach a PNG, JPEG, WebP or GIF image, a PDF, or a text or Markdown file.' | packages/contracts/cloud-contracts/src/chat-attachments.ts:339-350; apps/mobile/services/api.ts:659-664; apps/extension/_locales/en/messages.json:1458 |
| Too large | Web image over the image cap shows '<name> is too large.' with the limit (use-attachments.ts:170); VS Code skips with 'file too large (>10 MB)' (ChatStateManager.ts:2204); mobile throws 413 with size refusal text. | apps/web/features/chat/hooks/use-attachments.ts:170; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2204; apps/mobile/services/api.ts:673-680 |
| Unsafe or unreadable file | A failed scan purges the object and refuses with the safety-check message; an unreadable image returns 400 unreadable_attachment naming the file. | apps/web/lib/server/chat-attachment-completion.ts:420; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:657-661 |
| Model cannot read images | Refused before any model call: web model_no_vision; CLI chat refusal at staging. | request-processor.ts:5099-5113; tui_app.rs:853-856 |
| Retry and cancel | Mobile retries an upload up to two extra times and treats an abort as cancel; web has retry and remove callbacks for failed uploads. | apps/mobile/src/features/chat/upload/uploadAttachment.ts:15-110; ChatComposerNew.tsx:474-475 |
| Offline or timeout | Mobile upload has a timeout and an abort signal (api.ts:683-690). Offline copy for image uploads on web: not established. | apps/mobile/services/api.ts:683-690 |
| Accessibility | VS Code attachment list has role list and aria labels; mobile scan controls have accessibility labels. Web composer image accessibility: not established. | webviewContent.ts:3332; scan.tsx:392-417 |
| Account switch | Mobile discards uploads and sends if the account changed mid-turn. | apps/mobile/stores/chat/chatExecutionStore.ts:2287, 2470; apps/mobile/src/features/chat/upload/uploadAttachment.ts:64-66 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/security/upload-scan.test.ts`: ZIP disguised as PNG, PDF as JPEG, WebP gate, scanner required or not, timeout, fail closed.
- `apps/web/app/api/uploads/__tests__/chat-attachment-moderation.test.ts`: Complete route registers, rejects and purges, hash denylist, size overgrowth.
- `apps/web/app/api/llm/v1/chat/completions/lib/model-image.test.ts`: Photo that fits is sent as stored, shrink to 5 MB base64, PNG transparency, animated GIF first frame, unreadable file named.
- `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.test.ts`: Hydration of attachments into model parts (envelope use confirmed by search; case list not read).
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.model-compatibility.test.ts`: Refuses images for a model that cannot read them and lets them through otherwise.
- `apps/cli/src/tui/tui_app.rs`: In-file tests for staged chips, removing a staged image and a non-image path refusal (around lines 10773-10815).
- `apps/mobile/__tests__/ScanSendFailure.test.tsx`: Scan send keeps image and question when the store refuses; uses chosen model.
- `apps/extension-vscode/src/__tests__/routingTask.test.ts`: Image input counts as a routing attachment (file named by search; cases not read).

**Test scenarios**

- **Web single image question**
  1. Sign in on web with a vision-capable model.
  2. Attach a PNG screenshot through 'Add photos & files'.
  3. Ask what the screenshot shows and send.
  - Expected: Chip appears, no upload refusal, answer reads content from the picture.
- **Web non-vision model**
  1. Choose a model without image input.
  2. Attach a JPEG and send.
  - Expected: HTTP 400 with code model_no_vision and the message 'The selected model cannot read images. Choose a vision-capable model.'
- **Two-image comparison on web**
  1. Attach two photos of the same room with a change between them.
  2. Ask what is different.
  - Expected: Both images are in the request; the answer names a difference; a model with a lower image cap returns too_many_images when exceeded.
- **CLI staging**
  1. Start the CLI with a vision model.
  2. Run /attach path/to/shot.png then /attach list.
  3. Send a question.
  - Expected: Chip 'Attached ...', list shows one row, the answer uses the image; with a non-vision model /attach prints the switch-model message.
- **VS Code paste**
  1. Copy an image to the clipboard.
  2. Paste into the sidebar composer.
  3. Send with a question.
  - Expected: Chip appears with a thumbnail; the turn contains an image block; a file over 10 MB is skipped with a reason.
- **Mobile Local**
  1. Switch the chat to an on-device model.
  2. Attach a photo of printed text through Photos.
  3. Ask a question.
  - Expected: The sheet note appears, no upload happens, the prompt carries the on-device OCR text.

**Where to look when it fails**

- Server log '[uploads] rejected an attachment that failed content inspection' with findings (chat-attachment-completion.ts:410).
- Log event upload_scanner_unconfigured (upload-scan.ts:433).
- Error codes model_no_vision, too_many_images, image_detail_unsupported, unreadable_attachment, attachment_context_too_large, free_quota_image_unsupported.
- CLI status line after Ctrl+V and notices from /attach.
- No recorded live run exists for web or desktop (brief S43.01 Unfinished).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/043-image-and-visual-understanding.md](../../70-qa/test-plans/web/043-image-and-visual-understanding.md)
- Desktop: [70-qa/test-plans/desktop/043-image-and-visual-understanding.md](../../70-qa/test-plans/desktop/043-image-and-visual-understanding.md)
- Mobile: [70-qa/test-plans/mobile/043-image-and-visual-understanding.md](../../70-qa/test-plans/mobile/043-image-and-visual-understanding.md)
- CLI: [70-qa/test-plans/cli/043-image-and-visual-understanding.md](../../70-qa/test-plans/cli/043-image-and-visual-understanding.md)
- VS Code: [70-qa/test-plans/vscode/043-image-and-visual-understanding.md](../../70-qa/test-plans/vscode/043-image-and-visual-understanding.md)
- Chrome: [70-qa/test-plans/chrome/043-image-and-visual-understanding.md](../../70-qa/test-plans/chrome/043-image-and-visual-understanding.md)

## 10. Gaps and dependencies

- **No live production check of image chat on web and desktop is recorded.** Affects: Web and Desktop users. Evidence: knowledge-base/data/area-briefs/043-image-and-visual-understanding.md S43.01 Unfinished. Work needed: Run the production scenario, confirm no upload_scanner refusal, and record the result.
- **The web composer does not warn before send that a paid model cannot read images; the refusal arrives from the server.** Affects: Web and Desktop users on non-vision paid models. Evidence: request-processor.ts:5099-5113; no composer check found in ChatComposerNew.tsx searches. Work needed: Check the model capability in the composer and show the same text as the CLI.
- **Mobile Local mode answers from OCR text only, not from the picture.** Affects: Mobile users in Local mode. Evidence: apps/mobile/stores/chat/chatExecutionStore.ts:1241-1262. Work needed: A local vision-capable model, or clear on-screen labelling, if the required behaviour is picture reading.
- **Image formats differ by app: VS Code accepts any image/ type, CLI also takes bmp, ico and tiff, web and Chrome only four types.** Affects: VS Code and CLI users who attach other formats. Evidence: ChatStateManager.ts:2207; apps/cli/src/lib.rs:8458-8465; chat-attachment-policy.json:59. Work needed: Decide one accepted list from the shared policy and apply it in every app.
- **The brief's own code pointers are stale (upload-scan line 274, ChatComposerNew 2862, capabilityShortcuts file missing).** Affects: Anyone using the brief to find code. Evidence: apps/web/lib/security/upload-scan.ts:408-419 holds the scanner variables; apps/mobile/src/features/shell has no capabilityShortcuts file. Work needed: Refresh the brief pointers.
- **Own-key and Local image behaviour on web, desktop and CLI is not documented in code read.** Affects: Own-key and Local users. Evidence: none found in the code read. Work needed: Trace the own-key and Local request paths for image parts.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-local-inference
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-api-and-contracts
- file:packages/contracts/cloud-contracts/src/chat-attachment-policy.json
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- surface:desktop
- mode:cloud
- mode:local

## Unknown

- Whether guest chat accepts images.
- The exact asset table name for uploaded chat files.
- How the paid-plan meter charges image input tokens.
- Whether CLI conversation history files keep image blocks.
- Own-key image handling on web and desktop, and Local handling on CLI and desktop.
- The string literal of the web not-supported badge.
- Whether the desktop Electron wrapper adds any image capture beyond the hosted web app.
