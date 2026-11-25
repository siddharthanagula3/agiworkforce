---
id: "GAPS-AREA-043"
type: "gap-list"
title: "Gaps: Image and visual understanding"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 43. Image and visual understanding

68 open gaps that touch this area. Area page: [20-features/043-image-and-visual-understanding](../../20-features/043-image-and-visual-understanding/README.md).

## CMP-M161

**Add reference photos of yourself**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md), [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md), [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: No profile reference photos for image creation; images can only take photos attached per request.
- Evidence: searched: reference photos, profile photo reference in apps/mobile/src/features/image, apps/mobile/src/features/settings; apps/mobile/src/features/image/useImageReferences.ts

## CMP-MP16

**Mark up an image to point at a part of it**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F043-08](../../20-features/043-image-and-visual-understanding/F043-08-image-region-crop-and-annotated-answers-not-built.md)
- Detail: Brush marking exists only for generated images (to edit an area), not attached photos Brush marking exists only for generated images (to edit an area), not attached photos.
- Evidence: apps/mobile/src/features/chat/components/ImageFullScreen.tsx:822

## CMP-MP33

**PDF pages and embedded images read by the model**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F043-02](../../20-features/043-image-and-visual-understanding/F043-02-read-documents-charts-diagrams-and-handwriting-in.md), [F043-04](../../20-features/043-image-and-visual-understanding/F043-04-copy-text-out-of-an-image-ocr-on-mobile.md), [F076-01](../../20-features/076-model-capability-registry/F076-01-text-chat-input-and-output.md), [F076-02](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md), [F076-04](../../20-features/076-model-capability-registry/F076-04-tool-calls-and-multi-step-tool-use.md), [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md), [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md), [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md)
- Detail: No page-count rule or image-reading promise is shown in the app PDFs upload within shared size and count limits; no page-count rule or image-reading promise is shown in the app.
- Evidence: apps/mobile/src/features/chat/utils/attachmentValidation.ts:26-46; searched: page limit in src

## CMP-MP36

**Saved reference images for later requests**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md), [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md), [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: Named saved references are not shown The Images page lets you attach reference photos to a request; named saved references are not shown.
- Evidence: apps/mobile/src/features/image/ImagesScreen.tsx:222 useImageReferences; searched: @name references in apps/mobile/src/features/image

## CMP-VP17

**Generate and edit images from the chat**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F043-01](../../20-features/043-image-and-visual-understanding/F043-01-ask-a-question-about-one-or-more-attached-images.md), [F044-01](../../20-features/044-image-generation-studio/F044-01-make-an-image-from-a-prompt.md), [F044-02](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md), [F044-07](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md)
- Detail: The chat shows no image preview and takes no reference image The agent has a generate_image tool on eligible paid plans and saves the file in the workspace, but the chat shows no image preview and takes no reference image.
- Evidence: apps/cli/src/platform/runtime/tool_catalog.rs:1222; apps/cli/src/agent/mod.rs:1027-1034

## CMP-W286

**Saved reference photos reused with @name**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md), [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md), [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: No saved reference photos or @name mention exist for images.
- Evidence: searched: reference photo, @name in apps/web, unified-chat

## CMP-WP90

**Saved @name image references**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md), [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md), [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: They are not saved by name Reference images can be attached to one request; they are not saved by name.
- Evidence: apps/web/features/chat/lib/imageGenerationOptions.ts:145,153,182

## GAP-AREA043-LW05

**Scanner not required and not configured outside production means uploads get structural checks only, with no malware scan.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-043
- Detail: Area 43. Image and visual understanding
- Evidence: apps/web/lib/security/upload-scan.ts:415-431

## GAP-CAP-images-and-video-01

**Image input: ask about one or several images: Ledger asks for a production live check after deploy of the upload scanner on web and the Electron window. Wrong-answer risk was seen on phone width (see verification).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F043-01](../../20-features/043-image-and-visual-understanding/F043-01-ask-a-question-about-one-or-more-attached-images.md), [F043-03](../../20-features/043-image-and-visual-understanding/F043-03-read-the-scene-troubleshoot-from-a-photo-and-count.md)
- Requirement items: S43.01, S43.02, S43.03, S43.12, S43.13, S43.14
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-images-and-video-02

**Image formats, size limits and count: Ledger S43.18 high versus reduced detail choice is missing on web, desktop, mobile and Chrome. A second figure of 12 MiB exists at line 8 of the policy file whose scope was not checked.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F043-07](../../20-features/043-image-and-visual-understanding/F043-07-choose-how-much-detail-the-model-sees.md)
- Requirement items: S43.18
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-images-and-video-05

**Documents, scans and PDFs read with their images: Ledger marks the web, desktop and mobile cells partial until live checks run. MP33 is partial: embedded PDF images only partly read.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F043-02](../../20-features/043-image-and-visual-understanding/F043-02-read-documents-charts-diagrams-and-handwriting-in.md), [F043-04](../../20-features/043-image-and-visual-understanding/F043-04-copy-text-out-of-an-image-ocr-on-mobile.md)
- Requirement items: S43.04, S43.05, S43.06, S43.07, S43.08
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-images-and-video-06

**Image quality and uncertainty warnings: No pre-send warning and no uncertainty flags on any app.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F043-09](../../20-features/043-image-and-visual-understanding/F043-09-quality-warnings-and-uncertainty-flags-not-built.md)
- Requirement items: S43.19, S43.20
- Detail: Claude unknown, ChatGPT partly; AGI not built

## GAP-CAP-images-and-video-07

**Point at or select part of an image when asking: Region question missing on web, desktop and Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F043-08](../../20-features/043-image-and-visual-understanding/F043-08-image-region-crop-and-annotated-answers-not-built.md)
- Requirement items: S43.09
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-images-and-video-11

**Reference images and saved named references: No @name saving on web; mobile partial; no brand or avatar references.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md), [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md), [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Requirement items: S43.17, S44.04, S45.22, S45.34, S45.35
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-images-and-video-25

**Images in the coding tools: VS Code chat surface for generated images partial; CLI has no inline image preview.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F043-01](../../20-features/043-image-and-visual-understanding/F043-01-ask-a-question-about-one-or-more-attached-images.md), [F044-01](../../20-features/044-image-generation-studio/F044-01-make-an-image-from-a-prompt.md)
- Requirement items: S43.01, S44.01
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-F043-01-01

**No live production check of image chat on web and desktop is recorded.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-01](../../20-features/043-image-and-visual-understanding/F043-01-ask-a-question-about-one-or-more-attached-images.md)
- Detail: Affects: Web and Desktop users. Work needed: Run the production scenario, confirm no upload_scanner refusal, and record the result.
- Evidence: knowledge-base/data/area-briefs/043-image-and-visual-understanding.md S43.01 Unfinished

## GAP-F043-01-02

**The web composer does not warn before send that a paid model cannot read images; the refusal arrives from the server.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-01](../../20-features/043-image-and-visual-understanding/F043-01-ask-a-question-about-one-or-more-attached-images.md)
- Detail: Affects: Web and Desktop users on non-vision paid models. Work needed: Check the model capability in the composer and show the same text as the CLI.
- Evidence: request-processor.ts:5099-5113; no composer check found in ChatComposerNew.tsx searches

## GAP-F043-01-03

**Mobile Local mode answers from OCR text only, not from the picture.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-01](../../20-features/043-image-and-visual-understanding/F043-01-ask-a-question-about-one-or-more-attached-images.md)
- Detail: Affects: Mobile users in Local mode. Work needed: A local vision-capable model, or clear on-screen labelling, if the required behaviour is picture reading.
- Evidence: apps/mobile/stores/chat/chatExecutionStore.ts:1241-1262

## GAP-F043-01-04

**Image formats differ by app: VS Code accepts any image/ type, CLI also takes bmp, ico and tiff, web and Chrome only four types.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-01](../../20-features/043-image-and-visual-understanding/F043-01-ask-a-question-about-one-or-more-attached-images.md)
- Detail: Affects: VS Code and CLI users who attach other formats. Work needed: Decide one accepted list from the shared policy and apply it in every app.
- Evidence: ChatStateManager.ts:2207; apps/cli/src/lib.rs:8458-8465; chat-attachment-policy.json:59

## GAP-F043-01-05

**The brief's own code pointers are stale (upload-scan line 274, ChatComposerNew 2862, capabilityShortcuts file missing).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-01](../../20-features/043-image-and-visual-understanding/F043-01-ask-a-question-about-one-or-more-attached-images.md)
- Detail: Affects: Anyone using the brief to find code. Work needed: Refresh the brief pointers.
- Evidence: apps/web/lib/security/upload-scan.ts:408-419 holds the scanner variables; apps/mobile/src/features/shell has no capabilityShortcuts file

## GAP-F043-01-06

**Own-key and Local image behaviour on web, desktop and CLI is not documented in code read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-01](../../20-features/043-image-and-visual-understanding/F043-01-ask-a-question-about-one-or-more-attached-images.md)
- Detail: Affects: Own-key and Local users. Work needed: Trace the own-key and Local request paths for image parts.
- Evidence: none found in the code read

## GAP-F043-01-PARTLY

**Ask a question about one or more attached images: partly built on Web, Desktop, Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F043-01](../../20-features/043-image-and-visual-understanding/F043-01-ask-a-question-about-one-or-more-attached-images.md)
- Requirement items: S43.01, S43.02, S43.03
- Detail: Web S43.01: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | Web S43.02: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | Web S43.03: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-s

## GAP-F043-02-01

**No input-quality warning before the answer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-02](../../20-features/043-image-and-visual-understanding/F043-02-read-documents-charts-diagrams-and-handwriting-in.md)
- Detail: Affects: All apps. Work needed: Design and add a pre-send quality check and warning copy.
- Evidence: knowledge-base/data/area-briefs/043-image-and-visual-understanding.md S43.19 status missing on every app

## GAP-F043-02-02

**No uncertainty marking on answers about images.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-02](../../20-features/043-image-and-visual-understanding/F043-02-read-documents-charts-diagrams-and-handwriting-in.md)
- Detail: Affects: All apps. Work needed: Prompt guidance or UI flag for low-confidence readings.
- Evidence: brief S43.20 status missing

## GAP-F043-02-03

**Full-resolution choice exists only in the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-02](../../20-features/043-image-and-visual-understanding/F043-02-read-documents-charts-diagrams-and-handwriting-in.md)
- Detail: Affects: Web, mobile, VS Code and Chrome users with dense documents. Work needed: Expose detail choice in other composers.
- Evidence: apps/cli/src/tui/tui_app.rs:5485 versus no equivalent found elsewhere; brief S43.18 missing on web, desktop, mobile, chrome

## GAP-F043-02-04

**Mobile Local cannot read charts, diagrams or handwriting from pixels.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-02](../../20-features/043-image-and-visual-understanding/F043-02-read-documents-charts-diagrams-and-handwriting-in.md)
- Detail: Affects: Mobile Local users. Work needed: Local vision model or explicit limits in the UI.
- Evidence: chatExecutionStore.ts:1241-1262

## GAP-F043-02-05

**Web and Desktop live checks not recorded.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-02](../../20-features/043-image-and-visual-understanding/F043-02-read-documents-charts-diagrams-and-handwriting-in.md)
- Detail: Affects: Web and Desktop. Work needed: Run and record the production check.
- Evidence: brief S43.04 to S43.07 Unfinished

## GAP-F043-02-PARTLY

**Read documents, charts, diagrams and handwriting in an image: partly built on Web, Desktop, Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F043-02](../../20-features/043-image-and-visual-understanding/F043-02-read-documents-charts-diagrams-and-handwriting-in.md)
- Requirement items: S43.04, S43.05, S43.06, S43.07
- Detail: Web S43.04: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | Web S43.05: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | Web S43.06: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-s

## GAP-F043-03-01

**No confidence or uncertainty flag on counts and comparisons.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-03](../../20-features/043-image-and-visual-understanding/F043-03-read-the-scene-troubleshoot-from-a-photo-and-count.md)
- Detail: Affects: All apps. Work needed: Prompt and UI changes to mark uncertain readings.
- Evidence: brief S43.20

## GAP-F043-03-02

**No region selection to point at one object in a crowded photo.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-03](../../20-features/043-image-and-visual-understanding/F043-03-read-the-scene-troubleshoot-from-a-photo-and-count.md)
- Detail: Affects: Web, desktop, mobile, Chrome. Work needed: Region picker in composers.
- Evidence: brief S43.09 missing

## GAP-F043-03-03

**No live check on web and desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-03](../../20-features/043-image-and-visual-understanding/F043-03-read-the-scene-troubleshoot-from-a-photo-and-count.md)
- Detail: Affects: Web and Desktop. Work needed: Record production runs.
- Evidence: brief S43.12 to S43.14 Unfinished

## GAP-F043-03-04

**Mobile Local cannot compare scenes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-03](../../20-features/043-image-and-visual-understanding/F043-03-read-the-scene-troubleshoot-from-a-photo-and-count.md)
- Detail: Affects: Mobile Local. Work needed: Local vision model or clear labelling.
- Evidence: chatExecutionStore.ts:1241-1262

## GAP-F043-03-PARTLY

**Read the scene, troubleshoot from a photo and count objects: partly built on Web, Desktop, Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F043-03](../../20-features/043-image-and-visual-understanding/F043-03-read-the-scene-troubleshoot-from-a-photo-and-count.md)
- Requirement items: S43.12, S43.13, S43.14
- Detail: Web S43.12: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | Web S43.13: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | Web S43.14: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-s

## GAP-F043-04-01

**No in-app entry point to the scan screen was found; reach is by intent or link.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-04](../../20-features/043-image-and-visual-understanding/F043-04-copy-text-out-of-an-image-ocr-on-mobile.md)
- Detail: Affects: Mobile users. Work needed: Confirm or add a visible entry and correct the brief.
- Evidence: apps/mobile/app/_layout.tsx:304-309; brief points at a missing capabilityShortcuts file

## GAP-F043-04-02

**No text-extraction or copy-text action on web, desktop, CLI, VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-04](../../20-features/043-image-and-visual-understanding/F043-04-copy-text-out-of-an-image-ocr-on-mobile.md)
- Detail: Affects: Those apps. Work needed: Decide the required behaviour for each app and add it, or correct the brief statuses.
- Evidence: no OCR step found in their chat code; brief says partial or done

## GAP-F043-04-03

**The scan send path uploads the photo in Cloud mode although the person asked only to read text.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-04](../../20-features/043-image-and-visual-understanding/F043-04-copy-text-out-of-an-image-ocr-on-mobile.md)
- Detail: Affects: Mobile Cloud users. Work needed: Option to send text only.
- Evidence: scan.tsx:209-215; chatExecutionStore.ts:2484-2500

## GAP-F043-04-04

**No chat-level test for local OCR context building.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-04](../../20-features/043-image-and-visual-understanding/F043-04-copy-text-out-of-an-image-ocr-on-mobile.md)
- Detail: Affects: Mobile Local. Work needed: Add tests for buildLocalImageOcrContext.
- Evidence: search for 'On-device OCR text' in tests found none

## GAP-F043-04-05

**No recorded device test of recognition quality or language coverage.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-04](../../20-features/043-image-and-visual-understanding/F043-04-copy-text-out-of-an-image-ocr-on-mobile.md)
- Detail: Affects: Mobile. Work needed: Run device checks per language.
- Evidence: none found

## GAP-F043-04-NOTBUILT

**Copy text out of an image (OCR, on mobile): not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F043-04](../../20-features/043-image-and-visual-understanding/F043-04-copy-text-out-of-an-image-ocr-on-mobile.md)
- Requirement items: S43.08
- Detail: Web: S43.08; Desktop: S43.08; CLI: S43.08; VS Code: S43.08; Chrome: S43.08

## GAP-F043-04-PARTLY

**Copy text out of an image (OCR, on mobile): partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F043-04](../../20-features/043-image-and-visual-understanding/F043-04-copy-text-out-of-an-image-ocr-on-mobile.md)
- Requirement items: S43.08
- Detail: Web S43.08: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model | Desktop S43.08: live-check after the website deploy: attach the image(s) in production chat (web, and in the Electron app) and ask the question this cell names; expect no upload_scanner refusal (UPLOAD_SCAN_WEBHOOK_URL is read at apps/web/lib/security/upload-scan.ts:274) and an answer read from the image by a vision model

## GAP-F043-05-01

**No CSV or table-row output mode and no check beyond JSON schema.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-05](../../20-features/043-image-and-visual-understanding/F043-05-turn-an-image-into-structured-data-api.md)
- Detail: Affects: API callers wanting CSV or rows. Work needed: Decide whether the product should offer CSV and validate it.
- Evidence: only json_object and json_schema in request-processor.ts:682-705

## GAP-F043-05-02

**No app screen for image extraction.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-05](../../20-features/043-image-and-visual-understanding/F043-05-turn-an-image-into-structured-data-api.md)
- Detail: Affects: Web, desktop, mobile, CLI, VS Code, Chrome users. Work needed: Decide if an in-app extraction flow is required.
- Evidence: brief S43.15 status api done only

## GAP-F043-05-03

**No recorded live run of image extraction.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-05](../../20-features/043-image-and-visual-understanding/F043-05-turn-an-image-into-structured-data-api.md)
- Detail: Affects: API. Work needed: Run and record a receipt example.
- Evidence: none found in audit files read

## GAP-F043-05-04

**Brief code pointers for this item are stale (request-processor lines 3858 and 3868 are project-context code).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-05](../../20-features/043-image-and-visual-understanding/F043-05-turn-an-image-into-structured-data-api.md)
- Detail: Affects: Readers of the brief. Work needed: Update the brief pointers.
- Evidence: request-processor.ts:3850-3875

## GAP-F043-06-01

**CLI has no reference-image picker.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md)
- Detail: Affects: CLI users. Work needed: Add a staging command that downloads a Library image into /attach.
- Evidence: brief S43.17 status missing; apps/cli/src/cloud/library.rs has list and download only

## GAP-F043-06-02

**Chrome extension has no reference-image picker.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md)
- Detail: Affects: Chrome users. Work needed: Add a Library attach option to the side panel.
- Evidence: brief S43.17 status missing

## GAP-F043-06-03

**Mobile Local has no way to reuse an image.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md)
- Detail: Affects: Mobile Local users. Work needed: Decide the required Local behaviour; reuse of local photos is possible without Cloud.
- Evidence: AddToChatSheet.tsx:374 filters out images

## GAP-F043-06-04

**No live check recorded and no route test located for image reference handling.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Record a live run and add a route test.
- Evidence: brief marks done; no test for apps/web/app/api/media/image/generate/route.ts found in this search

## GAP-F043-06-05

**Outpaint is not offered.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md)
- Detail: Affects: Web users. Work needed: Canvas and mask authoring if required.
- Evidence: ChatComposerNew.tsx:271-276

## GAP-F043-06-06

**The brief's code pointers for this item are stale (ChatComposerNew 2862 is draft-editing code).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md)
- Detail: Affects: Readers. Work needed: Update the brief.
- Evidence: ChatComposerNew.tsx:2840-2900

## GAP-F043-06-NOTBUILT

**Use an existing image as the reference for a new task: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md)
- Requirement items: S43.17
- Detail: CLI: S43.17; Chrome: S43.17

## GAP-F043-07-01

**No detail choice for people in web chat, Electron desktop, mobile or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-07](../../20-features/043-image-and-visual-understanding/F043-07-choose-how-much-detail-the-model-sees.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome people using images. Work needed: Design a shared control or automatic rule in the shared chat UI and pass detail through the attachment path.
- Evidence: Brief S43.18 status missing; no detail control found; chat-attachment-hydration.ts:671-676 sets none; desktop attachments hard set Auto (attachments.rs:465)

## GAP-F043-07-02

**CLI full-size attach is not a detail value; the CLI block has no detail field.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-07](../../20-features/043-image-and-visual-understanding/F043-07-choose-how-much-detail-the-model-sees.md)
- Detail: Affects: CLI users. Work needed: Decide whether the CLI should also send a detail value and add it to the block and provider calls.
- Evidence: apps/cli/src/lib.rs:8364-8368

## GAP-F043-07-03

**Desktop (Tauri) vision command and cloud provider do not support original.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-07](../../20-features/043-image-and-visual-understanding/F043-07-choose-how-much-detail-the-model-sees.md)
- Detail: Affects: Tauri build only (internal). Work needed: Extend the enum or confirm the build is out of scope.
- Evidence: vision.rs:335-342; managed_cloud_provider.rs:366-372

## GAP-F043-07-04

**No tests for the detail refusal.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-07](../../20-features/043-image-and-visual-understanding/F043-07-choose-how-much-detail-the-model-sees.md)
- Detail: Affects: Cloud API. Work needed: Add unit tests for image-detail.ts and a route test.
- Evidence: No test file referencing image_detail_unsupported or unsupportedImageDetail found

## GAP-F043-07-05

**Detail support for non-OpenAI providers unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-07](../../20-features/043-image-and-visual-understanding/F043-07-choose-how-much-detail-the-model-sees.md)
- Detail: Affects: Models served through other providers. Work needed: Read each adapter and record behaviour or add translation.
- Evidence: No detail reference found in anthropic or google provider sources

## GAP-F043-07-06

**Brief cited CLI lines (apps/cli/src/lib.rs:6478, tui_app.rs:4595, 662) do not show the resize or original choice; the real code is at tui_app.rs:832-877, 6251 and lib.rs:8383.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-07](../../20-features/043-image-and-visual-understanding/F043-07-choose-how-much-detail-the-model-sees.md)
- Detail: Affects: Documentation accuracy. Work needed: Correct the brief's code references.
- Evidence: Lines read at those locations

## GAP-F043-07-NOTBUILT

**Choose how much detail the model sees: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F043-07](../../20-features/043-image-and-visual-understanding/F043-07-choose-how-much-detail-the-model-sees.md)
- Requirement items: S43.18
- Detail: Web: S43.18; Desktop: S43.18; Mobile: S43.18; Chrome: S43.18

## GAP-F043-08-01

**Region selection not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-08](../../20-features/043-image-and-visual-understanding/F043-08-image-region-crop-and-annotated-answers-not-built.md)
- Detail: Affects: Web, desktop, mobile, Chrome people (VS Code per brief). Work needed: Decide the interaction, build a shared region picker and send the crop or coordinates with the question.
- Evidence: Brief S43.09 missing; the overlay is display only (scan.tsx:346-371)

## GAP-F043-08-02

**Annotated answers not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-08](../../20-features/043-image-and-visual-understanding/F043-08-image-region-crop-and-annotated-answers-not-built.md)
- Detail: Affects: Web, desktop, mobile, VS Code, Chrome and API. Work needed: Choose models that return coordinates and a drawing layer that saves a new image.
- Evidence: Brief S43.11 missing

## GAP-F043-08-03

**Crop and zoom, and image to table are not applicable per the brief, though the Should lines state them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-08](../../20-features/043-image-and-visual-understanding/F043-08-image-region-crop-and-annotated-answers-not-built.md)
- Detail: Affects: All apps. Work needed: Owner decision on whether they stay out of scope; brief wording and status disagree on intent.
- Evidence: Brief S43.10, S43.16 'not applicable anywhere'

## GAP-F043-08-04

**OCR result has no confidence or selection hooks.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-08](../../20-features/043-image-and-visual-understanding/F043-08-image-region-crop-and-annotated-answers-not-built.md)
- Detail: Affects: Mobile. Work needed: Extend the native result only if region features need it.
- Evidence: ocr.ts:3-12

## GAP-F043-08-NOTBUILT

**Image region, crop and annotated answers (not built): not built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F043-08](../../20-features/043-image-and-visual-understanding/F043-08-image-region-crop-and-annotated-answers-not-built.md)
- Requirement items: S43.09, S43.11
- Detail: Web: S43.09, S43.11; Desktop: S43.09, S43.11; Mobile: S43.09, S43.11; VS Code: S43.11; Chrome: S43.09, S43.11

## GAP-F043-09-01

**No image-quality warning (too small, blurry, dark) on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-09](../../20-features/043-image-and-visual-understanding/F043-09-quality-warnings-and-uncertainty-flags-not-built.md)
- Detail: Affects: All six apps. Work needed: Add a quality measure at attach time and a visible warning that allows proceeding.
- Evidence: Brief S43.19 missing everywhere; only structural scan at upload-scan.ts:85-92

## GAP-F043-09-02

**No uncertainty flags in answers.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-09](../../20-features/043-image-and-visual-understanding/F043-09-quality-warnings-and-uncertainty-flags-not-built.md)
- Detail: Affects: All six apps. Work needed: Define a marking format, instruct the model, render it in shared chat UI.
- Evidence: Brief S43.20 missing everywhere; no confidence in ocr.ts:3-12

## GAP-F043-09-03

**Server shrinks images silently; the person is not told when a large image was scaled down.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-09](../../20-features/043-image-and-visual-understanding/F043-09-quality-warnings-and-uncertainty-flags-not-built.md)
- Detail: Affects: Web users. Work needed: Return a notice when the delivered image differs materially from the original.
- Evidence: model-image.ts:96-135 (note only for animated images)

## GAP-F043-09-04

**No test of image quality handling because none exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F043-09](../../20-features/043-image-and-visual-understanding/F043-09-quality-warnings-and-uncertainty-flags-not-built.md)
- Detail: Affects: Quality assurance. Work needed: Write tests with the feature.
- Evidence: Search for blur or small-image terms found none

## GAP-F043-09-NOTBUILT

**Quality warnings and uncertainty flags (not built): not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F043-09](../../20-features/043-image-and-visual-understanding/F043-09-quality-warnings-and-uncertainty-flags-not-built.md)
- Requirement items: S43.19, S43.20
- Detail: Web: S43.19, S43.20; Desktop: S43.19, S43.20; Mobile: S43.19, S43.20; CLI: S43.19, S43.20; VS Code: S43.19, S43.20; Chrome: S43.19, S43.20
