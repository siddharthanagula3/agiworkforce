---
id: "AREA-043"
type: "area"
title: "Image and visual understanding"
features: ["F043-01", "F043-02", "F043-03", "F043-04", "F043-05", "F043-06", "F043-07", "F043-08", "F043-09"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 43. Image and visual understanding

A person attaches a picture (a photo, screenshot, chart, diagram, handwritten note or scan) and asks the assistant about it. The model reads the picture and answers, so the person does not have to describe it by hand. This matters because much real help starts from something seen on a screen or on paper, such as an error, a setup problem or a receipt.

**Who uses it.** Every chat user on a surface whose chosen model accepts images (the code checks a model flag named supports_vision in the CLI and the model metadata in the web API). The code I read has no plan gate on sending an image to a vision model. Developers use the same path through the web OpenAI-style chat endpoint (apps/web/app/api/llm/v1/chat/completions), which accepts image parts with a detail setting. Workspace admins: not found in the code I read. Paid plans only: not found for this area in the code I read.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F043-01](F043-01-ask-a-question-about-one-or-more-attached-images.md) | Ask a question about one or more attached images | partly | partly | partly | built | built | built |
| [F043-02](F043-02-read-documents-charts-diagrams-and-handwriting-in.md) | Read documents, charts, diagrams and handwriting in an image | partly | partly | partly | built | built | built |
| [F043-03](F043-03-read-the-scene-troubleshoot-from-a-photo-and-count.md) | Read the scene, troubleshoot from a photo and count objects | partly | partly | partly | built | built | built |
| [F043-04](F043-04-copy-text-out-of-an-image-ocr-on-mobile.md) | Copy text out of an image (OCR, on mobile) | no | no | built | no | no | no |
| [F043-05](F043-05-turn-an-image-into-structured-data-api.md) | Turn an image into structured data (API) | n/a | n/a | n/a | n/a | n/a | n/a |
| [F043-06](F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md) | Use an existing image as the reference for a new task | built | built | built | no | n/a | no |
| [F043-07](F043-07-choose-how-much-detail-the-model-sees.md) | Choose how much detail the model sees | no | no | no | built | n/a | no |
| [F043-08](F043-08-image-region-crop-and-annotated-answers-not-built.md) | Image region, crop and annotated answers (not built) | no | no | no | n/a | no | no |
| [F043-09](F043-09-quality-warnings-and-uncertainty-flags-not-built.md) | Quality warnings and uncertainty flags (not built) | no | no | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/043-image-and-visual-understanding.md](../../10-requirements/capabilities/043-image-and-visual-understanding.md).

## How this area works in the code

1. **Person adds the image.** The image comes in by the attach control, paste, drop, the mobile scan screen, the Library, or the CLI image option. Each surface reads the file bytes and a MIME type (image/png, image/jpeg, image/gif, image/webp). (`apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7575`, `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2207-2214`, `apps/mobile/app/(app)/scan.tsx:83-106`, `apps/cli/src/tui/tui_app.rs:830-885`)
2. **Check the file type.** The chat attachment rule maps the file name and declared type to an allowed type. Anything else is refused. Unknown types with a text-like extension become text/plain. (`packages/contracts/cloud-contracts/src/chat-attachments.ts:339-350`, `apps/mobile/services/api.ts:648-660`)
3. **Mobile on-device text (Local mode only).** On a phone in Local mode, the picture is run through the on-device text recogniser. The text is sent to the local text model with the note that the model cannot see pixels. If no text is found, that is said in the note. (`apps/mobile/src/features/image/services/ocr.ts:15-28`, `apps/mobile/stores/chat/chatExecutionStore.ts:1226-1262`)
4. **Upload and scan (Cloud and web).** The web server reads the bytes, checks the image structure (signature, size), looks for credential strings, and asks the external malware scanner if one is configured. If the scanner is required and missing, the upload is refused with scan_unavailable. (`apps/web/lib/security/upload-scan.ts:601-620`, `apps/web/lib/security/upload-scan.ts:408-431`, `apps/web/lib/security/upload-scan.ts:36-40`)
5. **Check the image detail setting.** Each image part may carry a detail value. The server accepts auto, low, high or original. It then checks that the chosen model accepts that value; a model metadata list is used, with a default list of auto, low and high. Auto is always allowed. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:616`, `apps/web/app/api/llm/v1/chat/completions/lib/image-detail.ts:5-40`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5115-5124`)
6. **Parse the wire format into content blocks.** The OpenAI-style chat body is turned into internal content blocks. An image part with a URL or a data URL becomes an image block with its source and detail. (`packages/ai/provider-protocol/src/openai-wire-compat.ts:112-145`, `packages/contracts/types/src/provider-adapter.ts:75-95`)
7. **Translate for the chosen provider.** Each provider adapter turns image blocks into its own request shape: an image URL part for chat-style APIs (base64 images become data URLs), or an input image part for the responses-style API. (`packages/ai/providers/openai/src/translate.ts:45-60`, `packages/ai/providers/openai/src/translate-responses.ts:48-60`)
8. **Routing and the reply.** The request then goes through the normal routing and model-choice code, which sends it to a provider route the account can use. Model choice and routing for images were not traced end to end. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5115`)
9. **Show the answer.** The answer comes back as ordinary assistant text. Image-related answers have no separate display or annotation layer (see S43.11). (`apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:305-320`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/security/upload-scan.ts` | Scans uploaded bytes: structure, credential strings, and the external malware scanner gate (scanUploadBytes at 601; scanner settings at 408-431). |
| `apps/web/app/api/llm/v1/chat/completions/lib/image-detail.ts` | Accepted image detail values and the refusal when a model does not accept one. |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Chat request handling; validates image detail (line 616) and refuses unsupported detail (5115-5124). |
| `packages/ai/provider-protocol/src/openai-wire-compat.ts` | Reads image parts from the OpenAI-style wire format into content blocks (112-145). |
| `packages/ai/providers/openai/src/translate.ts` | Turns image blocks into the chat-style image part sent to the provider (45-60). |
| `packages/ai/providers/openai/src/translate-responses.ts` | Turns image blocks into the responses-style input image part (48-60). |
| `packages/contracts/cloud-contracts/src/chat-attachments.ts` | Allowed attachment types and MIME inference shared by apps. |
| `apps/mobile/app/(app)/scan.tsx` | Mobile scan screen: capture, on-device OCR overlay, send as attachment. |
| `apps/mobile/src/features/image/services/ocr.ts` | Bridge to the native on-device OCR module; errors if it is not linked. |
| `apps/mobile/stores/chat/chatExecutionStore.ts` | Mobile Local mode: builds OCR-text context for images (1226-1262). |
| `apps/cli/src/lib.rs` | Loads an image file, resizes or keeps it, and builds the image block (load_image_attachment_with at 8383; is_image_extension at 8458). |
| `apps/cli/src/tui/tui_app.rs` | CLI staging of images for the next turn, with the vision-model check (830-925). |
| `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | VS Code image attachments as data URLs (2196-2216). |
| `apps/web/features/library/lib/library-chat-handoff.ts` | Turns a Library file into an attachment for a new chat, with the too-large message. |

## What is stored

- Uploaded image bytes in a chat (web and desktop) - storage place not established; a test file refers to an asset record with mimeType image/png (apps/web/lib/server/chat-attachment-staging-cleanup.test.ts:68).: Not established in the code I read beyond that test reference.
- On-device OCR text cache, up to 64 images, first-in first-out: Memory only, in the mobile chat store (apps/mobile/stores/chat/chatExecutionStore.ts:1226-1239). Lost on app restart.
- Images staged for the next CLI turn (base64 image blocks and labels): Session memory in the CLI (apps/cli/src/tui/tui_app.rs around 592-600 and 880-885; apps/cli/src/lib.rs:8364).
- VS Code pending image attachments (data URL and name): Extension memory (_pendingAttachments in apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2207-2214).
- Scanner findings: credential findings and structural findings for an upload: Returned in the scan result; storage of findings not traced.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **UPLOAD_SCAN_WEBHOOK_URL**: Sets the external malware scanner endpoint. When set, uploads are sent to it. When unset and a scanner is required, uploads are refused with scan_unavailable. (apps/web/lib/security/upload-scan.ts:409 and 419)
- **UPLOAD_SCAN_REQUIRED**: true forces a scanner requirement, false turns it off; when unset the scanner is required only when NODE_ENV is production. (apps/web/lib/security/upload-scan.ts:410-414)
- **NODE_ENV**: Decides the default for scanner requirement when UPLOAD_SCAN_REQUIRED is unset; also controls a one-time warning in production. (apps/web/lib/security/upload-scan.ts:414 and 432-434)
- **Model image detail values (imageInput.detailValues)**: Lists the detail values a model accepts; default auto, low, high. (apps/web/app/api/llm/v1/chat/completions/lib/image-detail.ts:22-23)
- **Vision support flag (supports_vision)**: Refuses image staging on a model without vision; also reported in CLI model listings. (apps/cli/src/tui/tui_app.rs:853 and 918; apps/cli/src/lib.rs:4844 and 4878)
- **CLI image mode (ResizeToFit or Original)**: Resize to fit the model bounds, or send the original file. (apps/cli/src/tui/tui_app.rs:830-840 and 871; crates/agiworkforce-utils-image/src/lib.rs:103)
- **Native OCR module (AGIVisionOCR)**: Required for mobile scan and Local-mode image text; missing means an error asking for a rebuild. (apps/mobile/src/features/image/services/ocr.ts:16-24)
- **Composer attachment size limit (10 MB)**: Refuses larger VS Code attachments with the message file too large. (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2198-2200 (MAX_COMPOSER_ATTACHMENT_BYTES))

## Shared between apps

Shared: the attachment type rules (packages/contracts/cloud-contracts/src/chat-attachments.ts); the wire-format reader and provider translators (packages/ai/provider-protocol, packages/ai/providers/openai); the web upload scanner (apps/web/lib/security/upload-scan.ts, also called by audio transcription, project knowledge and chat completion); the image processing crate (crates/agiworkforce-utils-image) used by the CLI. Separate per app: the web chat route, mobile scan screen and OCR bridge, the CLI TUI and loader, the VS Code webview and chat state, and the Chrome extension's upload helper.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief's code citations for many items point at unrelated code. apps/cli/src/tui/tui_app.rs:3703 and :3739 are status-bar rendering; apps/cli/src/lib.rs:4686 is scheduled-trigger code; apps/cli/src/lib.rs:6478 is also not image code; apps/cli/src/app_server/developer_host.rs:76 is an import block; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4962 is prompt-cache display; ChatStateManager.ts:1289 is model effort settings; apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:314 is error settlement; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:347 and 3858-3868 are project-context code; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2862 is the mention handler; apps/mobile/src/features/shell/capabilityShortcuts.ts does not exist. (As listed; the brief's file list needs re-checking.)
- Brief's live-check text says an expected refusal would be an upload_scanner refusal. The code's refusal code is scan_unavailable with the message 'A malware scanner is required for uploads and none is configured'. (apps/web/lib/security/upload-scan.ts:421-427; apps/web/app/api/files/uploads/resumable-upload.ts:267)
- Mobile add-to-chat sheet removes image files from the Local-mode library list, so a person in Local mode cannot pick a stored image there, while the brief marks mobile reference-image selection done. (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:366-378)
- Mobile Local-mode images are not seen by the model; the model gets OCR text only, and the answer for a picture with no text is a fixed note. This is by design in the code but the brief's S43.01-S43.07 statuses say partial without saying so. (apps/mobile/stores/chat/chatExecutionStore.ts:1245-1258)
- Scanner not required and not configured outside production means uploads get structural checks only, with no malware scan. (apps/web/lib/security/upload-scan.ts:415-431)

## Not established

- Whether a web or desktop chat image reaches the vision model on production: the brief says a live check is pending, and I did not run anything (read-only task).
- Where web chat attachments are stored (storage table or bucket) and how long they live.
- End-to-end path from the web chat route to the model call, including routing and model selection for images. I opened only the detail check and the wire and provider translators.
- Whether the CLI honours the detail value end to end: I saw the resize or original choice, not a detail field.
- Structured-data output (S43.15): no code opened beyond the API detail parameter; the brief's cited lines for it were not confirmed.
- S43.08 on web, desktop, CLI, VS Code and Chrome: I did not find a chat OCR step there; the brief's status may refer to something I did not find.
- Plan or subscription gates for image input: none found in the paths I opened; not exhaustively searched.
- Empty, waiting and failure messages for the web composer's image upload: not traced.
- Whether missing items S43.19 and S43.20 are absent everywhere: I searched only the files named in the brief, not the whole repository.
- Chrome extension image handling beyond apps/extension/src/features/computer-use/userFileUpload.ts: not opened.
