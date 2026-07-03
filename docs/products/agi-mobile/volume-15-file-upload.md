# AGI Mobile — Volume 15 — File Upload

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: grounded in `AGENTS.md`, `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, and verified against `apps/mobile/services/docParser.ts`, `apps/mobile/storage/docChunks.ts`, `apps/mobile/src/features/memory/services/ragChunker.ts`, `apps/mobile/src/features/chat/components/AttachmentPreview.tsx`, `apps/mobile/src/features/chat/components/AddToChatSheet.tsx`, `apps/mobile/src/features/media/photo-picker.ts`, `apps/mobile/src/features/image/services/{ocr,vision}.ts`, `apps/mobile/app/(app)/{scan,camera}.tsx`, `apps/mobile/app/(app)/(tabs)/chat.tsx`, and `packages/types/src/models.json`.

## Overview & stance

This volume covers how AGI Mobile lets a user attach a file to a chat — pick, parse, chunk, preview, and route it. The governing constraint is from `apps/mobile/AGENTS.md`: **mobile must not become the heavy-compute surface first.** Light, on-device parsing (plain text, CSV, text-layer PDFs, native OCR) stays Local; heavy or generative work (image-only PDF rendering, Office binary parsing, image generation) is **cloud-backed** through the Managed Cloud gateway.

Mobile exposes only two trust modes: **Local** (small on-device LLM, free) and **Managed Cloud** (public alpha, open by default). There is **no BYOK on mobile** — never add an API-key affordance to the upload flow. A file destined for a Local chat is parsed and reasoned over on-device and never silently leaves the device; a file destined for a Cloud chat travels to Managed Cloud only after explicit send, with a visible per-file destination label. The `appMode` split is real today: the document picker in `AddToChatSheet.tsx` only surfaces the "File" card when `appMode === 'cloud'`, while Camera/Photos are available in both modes. Model IDs and vision/audio capability come only from `packages/types/src/models.json` — never hardcode one.

## PDFs

🟡 Partial — `apps/mobile/services/docParser.ts`. A pure-JS extractor decodes the PDF, rejects encrypted (`/Encrypt`) and corrupt files, counts pages, and pulls visible text from `BT…ET`/`Tj`/`TJ` content streams. It is best-effort for standard text-layer PDFs. **Gap:** image-only/scanned PDFs return `EMPTY_DOCUMENT` ("image-only PDFs require Wave 1 vision support"); there is no on-device PDF rasterizer. Requirements: text-layer extraction stays on-device; scanned/large PDFs must route to cloud parsing (🔭) rather than block; never claim full PDF fidelity from this extractor.

## Office Documents — Word/Excel/PowerPoint

🟡 Partial — picker accepts them, parser does not. `app/(app)/(tabs)/chat.tsx` `handleSheetFile` requests `application/msword` and the `.docx` MIME via `expo-document-picker`, but `docParser.detectDocType` only recognizes `pdf/txt/md/csv/code`, so `.doc/.docx/.xlsx/.pptx` raise `UNSUPPORTED_FORMAT`. **Gap:** no DOCX/XLSX/PPTX text extraction exists on-device, and per the no-heavy-compute rule it should not be built on mobile first. Requirement (🔭): Office binaries route to a cloud parser; until that ships, the picker must not advertise an Office type it will reject — fix the filter or show an explicit "open on Desktop / cloud-backed" path. Do not ship a half-parser that silently drops spreadsheet/slide structure.

## CSV

✅ Built — `apps/mobile/services/docParser.ts` (`parseCsvToText`). Quoted-field-aware CSV splitting flattens rows into `header: value` pairs and reports `rows`/`columns` metadata, fully on-device. Requirements: empty CSV raises `EMPTY_DOCUMENT`; very large CSVs must be chunked (see Chunking) before reaching a small Local context window; numeric analysis beyond text flattening (pivot/aggregation) is 🔭 and, when added, is cloud-backed not on-device.

## Images

✅ Built (capture/pick) / 🟡 Partial (understanding). Picking is `apps/mobile/src/features/media/photo-picker.ts` (`expo-image-picker`, EXIF stripped, quality 0.85) plus the Camera card; results become `Attachment` objects. Local image _understanding_ is OCR-plus-text-LLM only: `apps/mobile/src/features/image/services/vision.ts` explicitly does **not** advertise on-device vision-language until a native image bridge exists. Cloud chats send images to vision-capable models declared in `packages/types/src/models.json`. **Image generation is cloud-backed** via `imagegen.ts` (`FEATURES.imageGen`), never an on-device pass. Requirement: never present OCR-fallback as true multimodal vision.

## Audio

🔭 Planned (file upload). Mobile has on-device **voice** (STT/TTS) in `apps/mobile/src/features/voice/services/{voiceInput,voiceOutput}.ts` for live capture, but there is **no audio-file attach-and-transcribe** path. Requirement: when added, short clips may use on-device STT (Local); long-form transcription is cloud-backed. Mark 🔭 until a path and a transcription model (from `models.json`) exist — do not fake a transcript.

## Video

🔭 Planned. No video upload, frame extraction, or video understanding exists on mobile. This is explicitly out of scope for a first-heavy-compute-on-mobile reason. Requirement: any future video handling delegates frame/segment processing to cloud or the Desktop host (remote-control window), never on-device decode-and-analyze. Do not add a video picker that produces no analysis.

## OCR

✅ Built — `apps/mobile/src/features/image/services/ocr.ts` and `app/(app)/scan.tsx`. The `AGIVisionOCR` native module runs Apple Vision (iOS) / ML Kit (Android) **fully on-device, no network**, returning text plus bounding regions; the Scan screen overlays regions and pre-fills an editable composer. Requirements: OCR stays Local-trust (the image and text never leave the device unless the user sends to a Cloud chat); a missing native module must surface a clear "rebuild the app" error, not a silent empty result.

## Chunking

✅ Built — `apps/mobile/src/features/memory/services/ragChunker.ts` + `apps/mobile/storage/docChunks.ts`. Sliding-window chunking is sized to the selected model's `contextWindow` from `models.json` (target ≈25%, overlap ≈10%, retrieve 4 chunks for ≤8K-token models, 16 for larger). Chunks persist in the SQLite `doc_chunks` table keyed by conversation, with ID-ordered retrieval that preserves relevance ranking. Requirements: chunk sizing must read the live model context window (never a hardcoded constant); chunks for Local chats stay in on-device SQLite and are removed by "delete everything"; token estimation stays consistent with `ragIndex.ts`.

## Preview

✅ Built — `apps/mobile/src/features/chat/components/AttachmentPreview.tsx`. A horizontal strip above the composer shows image thumbnails or a file card (icon, name, human-readable size), a remove control, a count badge, and a **per-file privacy chip** (e.g. "Local") sourced from the send-preview presentation. Requirements: every attachment must show its outbound destination before send; removing an attachment is always available pre-send; the privacy label must reflect the real trust mode of the target chat, never a placeholder. The pre-send confirmation (`SendPreview.tsx`) is the consent gate when a Local-origin file is sent to a Cloud chat.

## Repository map

- `apps/mobile/services/docParser.ts` — PDF/TXT/MD/CSV/code on-device parsing.
- `apps/mobile/storage/docChunks.ts` — SQLite `doc_chunks` persistence.
- `apps/mobile/src/features/memory/services/ragChunker.ts`, `ragIndex.ts` — context-sized chunking + indexing.
- `apps/mobile/src/features/chat/components/{AttachmentPreview,AddToChatSheet,SendPreview}.tsx` — pick UI, preview, consent.
- `apps/mobile/src/features/media/photo-picker.ts` — image picking.
- `apps/mobile/src/features/image/services/{ocr,vision,imagegen}.ts` — OCR, vision routing, cloud image gen.
- `apps/mobile/app/(app)/{scan,camera,image,voice}.tsx` — capture/OCR/voice screens.
- `apps/mobile/app/(app)/(tabs)/chat.tsx`, `apps/mobile/app/(app)/chat/[id].tsx` — `expo-document-picker` entry.
- `apps/mobile/services/fileCreation.ts` — export (PDF/text) via `expo-print`.
- `packages/types/src/models.json` — vision/audio capability + context windows.

## Competitor notes

ChatGPT and Claude mobile attach files and parse them server-side under one managed account. AGI's deliberate divergence: **per-surface trust** — a file attached to a Local chat is parsed and reasoned over on-device (CSV, text PDF, OCR) and never uploaded; only Cloud-targeted files reach Managed Cloud, behind a visible per-file destination chip and a send-preview consent step. Multi-provider model selection drives chunk sizing from real `models.json` context windows rather than one vendor default. Unlike both competitors, mobile carries **no BYOK** path. Heavy parsing (Office, scanned PDF) and image generation are intentionally cloud-backed, keeping the phone light while Desktop remains the local-compute host (reachable as a remote-control window).

## Acceptance / Definition of Done

The domain is production-ready when on-device parsing (CSV, text PDF, OCR), context-sized chunking, and the preview/consent strip are correct, and every unsupported type fails loudly with a clear next step instead of a silent empty result.

- [ ] **Build:** picker MIME filter matches what `docParser` can actually parse (no advertised-but-rejected Office types); CSV/text-PDF/OCR + chunking verified by `pnpm --filter @agiworkforce/mobile test`.
- [ ] **Trust:** Local-origin files never leave the device without explicit send to a Cloud chat; `SendPreview` consent + per-file destination chip render the real trust mode.
- [ ] **Security:** encrypted/corrupt PDFs rejected; OCR/parse stay on-device; doc chunks live in SQLite and are wiped by "delete everything"; no model ID hardcoded — capability read from `models.json`.

## Anti-patterns

- Adding any BYOK / API-key field to the upload or parsing flow.
- Auto-sending a Local-origin file to Managed Cloud without preview + consent.
- Advertising an Office/scanned-PDF or vision/audio/video capability the code cannot deliver (faking transcripts, OCR-as-vision, or stub parsers).
- Building a heavy on-device DOCX/XLSX/PPTX or PDF-rasterizer parser on mobile first instead of cloud-backing it.
- Hardcoding a model ID or context window instead of reading `packages/types/src/models.json`.
- Referencing Supabase, or any removed tier (Plus / pro_plus / Hobby) in upload entitlement copy.
