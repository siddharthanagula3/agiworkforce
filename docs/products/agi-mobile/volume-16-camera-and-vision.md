# AGI Mobile — Volume 16 — Camera & Vision

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: Grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `apps/mobile/AGENTS.md`, `docs/products/README.md` (canon), and verified repo paths: `apps/mobile/app/(app)/camera.tsx`, `apps/mobile/app/(app)/scan.tsx`, `apps/mobile/src/features/image/services/{ocr,vision,imagegen}.ts`, `apps/mobile/src/features/media/photo-picker.ts`, `apps/mobile/src/features/companion/components/QRScanner.tsx`, `apps/mobile/native/ios/AGIVisionOCR.swift`, `apps/mobile/native/android/AGIVisionOCR.kt`, `apps/mobile/app.config.js`, and `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies how AGI Mobile turns the device camera and photo library into AI input: capture, import, on-device OCR, document scanning, AI image analysis, barcode detection, and privacy-preserving metadata handling.

Trust shapes everything here. Mobile exposes exactly two modes: **Local** (a small on-device LLM, free) and **Managed Cloud** (public alpha, real auth gate, no demo bypass). **Mobile has no BYOK** — there is no API-key affordance anywhere in this domain, and "provider configuration" on mobile means on-device model management, never keys. Pixel processing splits cleanly: OCR and text recognition run **fully on-device** (Apple Vision / ML Kit) with no network; true AI vision reasoning over an image routes to **Managed Cloud** vision-capable models because the on-device LLM is text-only today. Local capture must never silently upload — sending an image to Cloud is an explicit user action that crosses the trust boundary with a visible Cloud/model label and the standard auth gate (`apps/mobile/services/remoteChatGate.ts`, which fails closed when Cloud is disabled). Mobile is deliberately **not** the first heavy local image-gen surface: generation is cloud-backed.

## Camera Capture

✅ Built — `apps/mobile/app/(app)/camera.tsx`. A full-screen `CameraView` (`expo-camera`) capture flow: permission gating with a denied-state screen and Open Settings deep link, flash toggle, capture via `takePictureAsync({ quality: 0.85 })`, a post-capture preview with an editable prompt, and send into a new "Vision Analysis" conversation. Requirements: capture must request `NSCameraUsageDescription`/`CAMERA` (declared in `apps/mobile/app.config.js`); the shutter is disabled until `onCameraReady`; a slow-camera hint appears after a timeout; capture failures surface a non-fatal alert, never a crash. The captured URI is a local file — it is not uploaded until the user taps send.

## Gallery Import

✅ Built — `apps/mobile/src/features/media/photo-picker.ts`. `pickImageAssetsFromLibrary` wraps `ImagePicker.launchImageLibraryAsync` with image-only media types, optional multi-select with `selectionLimit`/`orderedSelection`, and `quality: 0.85`. `imageAssetsToChatAttachments` normalizes assets into chat `Attachment` records. Requirements: import requests `NSPhotoLibraryUsageDescription`/media-library permission via the permissions registry (`apps/mobile/src/features/settings/permissions/registry.ts`); the call returns `[]` on cancel (no throw); imported images stay local until an explicit Cloud send. Note: the picker sets `exif: false` (see Metadata Removal).

## OCR

✅ Built — `apps/mobile/src/features/image/services/ocr.ts` + native modules `apps/mobile/native/ios/AGIVisionOCR.swift` and `apps/mobile/native/android/AGIVisionOCR.kt`. `recognizeText(imageUri)` calls the `AGIVisionOCR` native module: iOS uses Apple Vision `VNRecognizeTextRequest`; Android uses ML Kit Text Recognition. Both are **fully on-device — no network** — so OCR works in Local mode for free, offline. It returns `{ text, regions[] }` where regions are bounding boxes. Requirements: when the native module is not linked, throw a clear "rebuild the app" error (the service does this) rather than fail silently; OCR output is treated as Local data and is never auto-sent to Cloud.

## Document Scanning — multi-page

🔭 Planned. `apps/mobile/app/(app)/scan.tsx` is a single-shot OCR/scan hero: viewfinder → capture → on-device OCR → preview with bounding rects → editable composer prefilled with the extracted text. There is **no** multi-page capture, page reordering, edge-detection/crop-to-document, or multi-page PDF assembly today. Planned scope: append-page capture, per-page reorder/delete, auto edge detection and perspective correction, and export to a single text bundle or a multi-page PDF. Text extraction from existing PDFs lives in `apps/mobile/services/docParser.ts` (Wave 0; image-from-PDF deferred) and must be reused rather than re-implemented. Mobile must not become the first heavy local PDF/PPTX/DOCX surface — heavy document assembly stays cloud-backed or deferred.

## Image Analysis — AI vision

🟡 Partial — `apps/mobile/src/features/image/services/vision.ts`. The Local route is honest about its limits: `resolveVisionRoute()` returns an **OCR-fallback** route only — it runs native OCR, then reasons over the extracted _text_ with the on-device LLM (`@agiworkforce/local-llm`). It does **not** do true on-device visual-language understanding; the code explicitly forbids advertising on-device VL until a native image-input bridge exists. Real image reasoning is **Cloud**: camera/gallery attachments are sent into chat and answered by vision-capable Managed-Cloud models. Model IDs come **only** from `packages/contracts/types/src/models.json` (which marks vision-capable models) — never hardcode one. Requirements: the active route must be labeled to the user (Local OCR vs Cloud vision + model name); crossing to Cloud requires the auth gate; never claim on-device VL until the bridge ships.

## Barcode Detection

🟡 Partial — `apps/mobile/src/features/companion/components/QRScanner.tsx`. The camera barcode pipeline exists today but is scoped to **QR only** (`barcodeScannerSettings={{ barcodeTypes: ['qr'] }}`) and is used exclusively for desktop/companion pairing (QR + HMAC), validated by `isValidPairingCode`. General 1D/2D **product** barcode detection (EAN/UPC/Code-128/etc.) feeding an AI lookup or chat is **not** built. Planned scope: a general-purpose scanner that recognizes common symbologies, debounces duplicate reads, and hands the decoded value to a Cloud lookup/chat with an explicit send. Reuse the existing `expo-camera` `onBarcodeScanned` surface; do not add a second camera stack.

## Metadata Removal — privacy

🟡 Partial — `apps/mobile/src/features/media/photo-picker.ts`. Gallery import already sets `exif: false`, so EXIF/GPS metadata is **not** ingested from library picks — a real, shipped privacy control. The gap: there is no unified strip-on-send pipeline guaranteeing that _every_ image path (camera capture via `takePictureAsync`, multi-page scans, barcode-attached frames) is scrubbed of EXIF/GPS/orientation-leaking metadata before any Cloud upload. Planned scope: a single egress-time sanitizer (coordinate with `apps/mobile/lib/egressGuard.ts`) that strips location and device metadata before an attachment leaves the device, with a visible "metadata removed" indicator. Requirement: Local images never leave the device at all unless the user explicitly sends to Cloud; once they do, metadata must be stripped by default.

## Repository map

- `apps/mobile/app/(app)/camera.tsx` — camera capture → vision chat flow.
- `apps/mobile/app/(app)/scan.tsx` — OCR/scan hero (single page).
- `apps/mobile/src/features/image/services/ocr.ts` — on-device OCR wrapper.
- `apps/mobile/src/features/image/services/vision.ts` — vision routing (OCR-fallback Local; Cloud for VL).
- `apps/mobile/src/features/image/services/imagegen.ts` — cloud-backed image generation client (catalog-owned model IDs).
- `apps/mobile/src/features/media/photo-picker.ts` — gallery import + attachment normalization.
- `apps/mobile/src/features/companion/components/QRScanner.tsx` — QR pairing scanner.
- `apps/mobile/native/ios/AGIVisionOCR.swift`, `apps/mobile/native/android/AGIVisionOCR.kt` — native OCR modules.
- `apps/mobile/services/docParser.ts` — document text extraction (reuse for scan exports).
- `apps/mobile/lib/egressGuard.ts` — egress control point for metadata stripping.
- `apps/mobile/app.config.js` — camera/photo permission strings and plugins.
- `packages/contracts/types/src/models.json` — sole source of vision-capable model IDs.

## Competitor notes

ChatGPT and Claude mobile both offer camera capture, photo import, and cloud vision; ChatGPT adds scan-to-document and barcode-style flows. All route image reasoning to a single first-party cloud model. AGI's deliberate divergence: (1) **multi-provider** vision through the catalog, not one locked model; (2) **on-device Local** OCR and text reasoning that work free and offline before any cloud call; (3) **per-surface trust** — image pixels stay local until an explicit, labeled Cloud send; (4) **no BYOK on mobile** — capability comes from Local or Managed Cloud, never user keys. We do not fake on-device visual-language understanding to match marketing.

## Acceptance / Definition of Done

Production-ready when: capture and import work with correct permission gating and graceful denials; OCR runs fully on-device with no network; every Cloud send is auth-gated, labeled with the resolved model, and metadata-stripped; no Local image is auto-uploaded; and no shipped capability is described beyond what its cited path proves.

- [ ] Build: camera, scan, picker, and QR scanner mount on a clean iOS build; native OCR module links (no "rebuild" error).
- [ ] Trust: image reasoning crossing to Cloud passes `remoteChatGate` and shows the resolved model from `models.json`; Local route advertised only as OCR.
- [ ] Security/privacy: gallery import keeps `exif: false`; egress-time metadata stripping confirmed before any Cloud upload; no Supabase reference anywhere.

## Anti-patterns

- Adding any BYOK / API-key field to camera, scan, or vision settings — mobile has no BYOK.
- Auto-sending Local captures, OCR text, or scans to Cloud without an explicit, labeled, auth-gated action.
- Advertising on-device visual-language analysis while the route is OCR-fallback only.
- Hardcoding or inventing a vision/image model ID instead of reading `packages/contracts/types/src/models.json`.
- Forwarding image attachments with EXIF/GPS intact, or skipping the egress sanitizer.
- Referencing Supabase (fully removed) or using removed tiers (Plus, pro_plus, Hobby) in any upsell.
- Spinning up a second camera stack for barcodes instead of reusing the `expo-camera` scanner.
