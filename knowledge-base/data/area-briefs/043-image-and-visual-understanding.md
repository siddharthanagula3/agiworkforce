# Area 43. Image and visual understanding

20 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S43.01 Single-image questions.
- Should: User attaches one image and asks a question about it; the image reaches a vision-capable model with the question.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome done, api done
- Code: apps/web/lib/security/upload-scan.ts:274; apps/web/lib/security/upload-scan.ts:264; apps/mobile/services/api.ts:651; apps/cli/src/tui/tui_app.rs:3703; apps/cli/src/tui/tui_app.rs:3739; apps/cli/src/lib.rs:4686; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4962; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1289
- Unfinished: web: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | desktop: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read f

## S43.02 Multiple-image comparison.
- Should: User attaches two or more images to one message and the model receives all of them to compare.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome done, api done
- Code: apps/web/lib/security/upload-scan.ts:274; apps/web/lib/security/upload-scan.ts:264; apps/mobile/services/api.ts:651; apps/cli/src/tui/tui_app.rs:3703; apps/cli/src/tui/tui_app.rs:3739; apps/cli/src/lib.rs:4686; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4962; apps/cli/src/app_server/developer_host.rs:76
- Unfinished: web: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | desktop: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read f

## S43.03 Screenshot interpretation.
- Should: User shares a screenshot (captured or pasted) and the model explains what it shows.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome done, api done
- Code: apps/web/lib/security/upload-scan.ts:274; apps/web/lib/security/upload-scan.ts:264; apps/mobile/services/api.ts:651; apps/cli/src/tui/tui_app.rs:3703; apps/cli/src/tui/tui_app.rs:3739; apps/cli/src/lib.rs:4686; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4962; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1289
- Unfinished: web: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | desktop: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read f

## S43.04 Document-image interpretation.
- Should: User attaches a photo or scan of a document (incl. a scanned PDF) and the model reads and explains it.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome done, api done
- Code: apps/web/lib/security/upload-scan.ts:274; apps/web/lib/security/upload-scan.ts:264; apps/mobile/services/api.ts:651; apps/cli/src/tui/tui_app.rs:3703; apps/cli/src/tui/tui_app.rs:3739; apps/cli/src/lib.rs:4686; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4962; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1289
- Unfinished: web: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | desktop: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read f

## S43.05 Chart interpretation.
- Should: User attaches a chart image and the model interprets its data and trends.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome done, api done
- Code: apps/web/lib/security/upload-scan.ts:274; apps/web/lib/security/upload-scan.ts:264; apps/mobile/services/api.ts:651; apps/cli/src/tui/tui_app.rs:3703; apps/cli/src/tui/tui_app.rs:3739; apps/cli/src/lib.rs:4686; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4962; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1289
- Unfinished: web: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | desktop: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read f

## S43.06 Diagram interpretation.
- Should: User attaches a diagram image and the model explains its structure.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome done, api done
- Code: apps/web/lib/security/upload-scan.ts:274; apps/web/lib/security/upload-scan.ts:264; apps/mobile/services/api.ts:651; apps/cli/src/tui/tui_app.rs:3703; apps/cli/src/tui/tui_app.rs:3739; apps/cli/src/lib.rs:4686; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4962; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1289
- Unfinished: web: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | desktop: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read f

## S43.07 Handwriting recognition.
- Should: User attaches handwritten notes and the model transcribes or answers about them.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome done, api done
- Code: apps/web/lib/security/upload-scan.ts:274; apps/web/lib/security/upload-scan.ts:264; apps/mobile/services/api.ts:651; apps/cli/src/tui/tui_app.rs:3703; apps/cli/src/tui/tui_app.rs:3739; apps/cli/src/lib.rs:4686; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4962; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1289
- Unfinished: web: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | desktop: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read f

## S43.08 Visual text extraction.
- Should: User extracts the text in an image (OCR) and can copy or reuse it.
- Status: web partial, desktop partial, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/lib/security/upload-scan.ts:274; apps/mobile/src/features/shell/capabilityShortcuts.ts:19; apps/mobile/app/(app)/scan.tsx:83; apps/mobile/app/(app)/scan.tsx:356; apps/mobile/src/features/image/services/ocr.ts:15; apps/cli/src/tui/tui_app.rs:3703; apps/cli/src/tui/tui_app.rs:3739; apps/cli/src/lib.rs:4686
- Unfinished: web: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | desktop: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read f

## S43.09 Image-region selection.
- Should: User selects a region of an image so the question applies only to that area.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S43.10 Crop-and-zoom inspection.
- Should: User can zoom into, or crop, part of an image to inspect detail (and ask about the crop).
- Status: not applicable anywhere

## S43.11 Annotated visual answers.
- Should: The answer returns the image with marks (boxes, arrows, labels) showing what it refers to.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing, api missing

## S43.12 Object counting.
- Should: User asks how many of something appear in an image and the vision model answers.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome done, api done
- Code: apps/web/lib/security/upload-scan.ts:274; apps/web/lib/security/upload-scan.ts:264; apps/mobile/services/api.ts:651; apps/cli/src/tui/tui_app.rs:3703; apps/cli/src/tui/tui_app.rs:3739; apps/cli/src/lib.rs:4686; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4962; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1289
- Unfinished: web: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | desktop: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read f

## S43.13 Scene comparison.
- Should: User attaches two scenes and the model describes the differences between them.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome done, api done
- Code: apps/web/lib/security/upload-scan.ts:274; apps/web/lib/security/upload-scan.ts:264; apps/mobile/services/api.ts:651; apps/cli/src/tui/tui_app.rs:3703; apps/cli/src/tui/tui_app.rs:3739; apps/cli/src/lib.rs:4686; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4962; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1289
- Unfinished: web: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | desktop: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read f

## S43.14 Visual troubleshooting.
- Should: User shares a photo or screenshot of a problem (device, error, setup) and gets troubleshooting steps.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome done, api done
- Code: apps/web/lib/security/upload-scan.ts:274; apps/web/lib/security/upload-scan.ts:264; apps/mobile/services/api.ts:651; apps/cli/src/tui/tui_app.rs:3703; apps/cli/src/tui/tui_app.rs:3739; apps/cli/src/lib.rs:4686; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4962; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1289
- Unfinished: web: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | desktop: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read f

## S43.15 Image-to-structured-data extraction.
- Should: User turns an image (receipt, form, card) into structured fields (JSON/CSV/rows) they can reuse.
- Status: api done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3858; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3868; apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:314; apps/web/public/openapi.json:626

## S43.16 Image-to-table workflow.
- Should: User turns a table in an image into an editable table or spreadsheet in a guided step.
- Status: not applicable anywhere

## S43.17 Reference-image selection for another task.
- Should: User picks an existing image (upload, library item or earlier output) as the reference input for a generation or edit.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/library/components/LibraryView.tsx:207; apps/web/features/library/lib/library-chat-handoff.ts:27; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2862; apps/web/app/api/media/image/generate/route.ts:300; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:376; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:235; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:142

## S43.18 High-resolution versus reduced-resolution handling.
- Should: Images are processed at a resolution suited to the task, with a high-detail vs reduced-detail choice honoured end to end.
- Status: web missing, desktop missing, mobile missing, cli done, chrome missing, api done
- Code: apps/cli/src/lib.rs:6478; apps/cli/src/tui/tui_app.rs:4595; apps/cli/src/tui/tui_app.rs:662; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:347; packages/ai/provider-protocol/src/openai-wire-compat.ts:118; packages/contracts/types/src/provider-adapter.ts:90; packages/ai/providers/openai/src/translate.ts:51; packages/ai/providers/openai/src/translate-responses.ts:54

## S43.19 Image input-quality warning.
- Should: Before answering, the product warns when an input image is too small, blurry or low quality to read reliably.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S43.20 Visual uncertainty presentation.
- Should: Answers about images visibly flag uncertain readings (low-confidence text, ambiguous objects).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
