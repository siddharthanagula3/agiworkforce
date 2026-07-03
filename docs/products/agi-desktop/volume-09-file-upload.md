# AGI Desktop — Volume 09 — File Upload

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/desktop/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and real repo paths: `apps/desktop/src/features/file-upload/*`, `apps/desktop/src/features/chat/hooks/{useAttachments,useDragAndDrop}.ts`, `apps/desktop/src/features/chat/{DragDropOverlay,AttachmentPreview,AudioPreview}.tsx`, `apps/desktop/src-tauri/src/core/agi/executors/{ocr_executor,file_executor,media_executor}.rs`, `apps/desktop/src-tauri/src/core/embeddings/*`, `packages/types/src/chat.ts`, `packages/types/src/models.json`.

## Overview & stance

This volume specifies how AGI Desktop ingests files into a chat or task: the accepted formats, the drop/paste/picker entry points, preview, and the downstream extraction pipeline (OCR, chunking, embeddings). Desktop is the full-trust surface (Local + BYOK + Managed Cloud), so file upload is governed by one rule above all others: **local files stay on the host unless the user explicitly transfers them.** Attachments read client-side become part of the outbound payload only for the trust mode the user selected, and every attachment renders a per-file privacy label (`AttachmentPreview.tsx`, `privacyShortLabel`). A Local→BYOK fork surfaces attachments in the context-selection + payload-preview step so no local file crosses to a provider without consent. Native filesystem reads run through a path-validated Rust executor (`file_executor.rs`), never raw `fs` from the webview. Canonical limits live in `@agiworkforce/types` (`MAX_ATTACHMENT_BYTES = 25 MiB`, `packages/types/src/chat.ts`), keeping per-surface behavior aligned.

## PDF

🟡 Partial. In-app rendering exists via `pdfjs-dist` (`apps/desktop/src/features/file-upload/PDFViewer.tsx`; `application/pdf` branch in `FilePreviewModal.tsx`). Gaps: the pdf.js worker loads from a CDN URL, which breaks the local-first/offline promise (bundle the worker); and text extraction into model context is not proven — parsing PDF text/pages into a prompt-ready payload is 🔭 Planned. Requirement: extract selectable text locally, fall through to OCR for scanned pages, and never upload the file bytes outside the selected trust mode.

## Word

🔭 Planned. No `.docx` parser (e.g. a mammoth-class dependency) exists in `apps/desktop/package.json`. Requirement: local extraction of paragraphs, headings, tables, and embedded images to structured text before any send; extraction must run on-host for Local mode.

## Excel

🔭 Planned. No spreadsheet parser (SheetJS-class) is present. Requirement: parse `.xlsx`/`.xls` sheets to typed rows/columns locally, cap cell/row counts, and preview the sheet grid before send.

## PowerPoint

🔭 Planned. No `.pptx` upload parser exists (`PresentationArtifact.tsx` only _generates_ slide artifacts). Requirement: extract per-slide text, speaker notes, and image references locally.

## CSV

🟡 Partial. CSV is `text/*`, so it is readable today through the text branch of `FilePreviewModal.tsx` (`file_read_text` Tauri command). Structured parsing (typed columns, delimiter/encoding detection, row limits) is 🔭 Planned — no CSV parser dependency is present. Requirement: preview as a table, not raw text, and stream large files rather than base64-inlining them.

## TXT

✅ Built. Plain text is read locally via the `file_read_text` command and rendered in `FilePreviewModal.tsx` (`text/`, `json`, `xml` branches); small text files also attach as base64 through `useAttachments.ts`. Requirement holds: no network egress for Local mode; enforce the shared byte cap.

## Markdown

🟡 Partial. `.md` ingests as text via the same text path, and the chat renderer already displays Markdown, so round-trip display works. The gap: `.md` is treated as generic text rather than a first-class type with front-matter/heading awareness for chunking. Requirement: preserve structure for later embedding.

## ZIP

🔭 Planned. No archive-extraction dependency exists; `file_executor.rs` can read bytes but there is no unzip-and-enumerate pipeline. Requirement: expand locally in a sandboxed temp dir, enforce entry-count/size/zip-bomb limits, present a file tree for selective inclusion, and never auto-send archive contents.

## Images

✅ Built. Images attach as base64 data URLs and preview inline (`AttachmentPreview.tsx`, image/screenshot branch). Vision is gated on model capability — `ChatInputArea.tsx` blocks image sends when `capabilities.supportsVision` is false, with capability sourced from `packages/types/src/models.json` (never hardcode an ID). Requirement: respect the 25 MiB per-file / 10-attachment caps and the selected trust mode's provider.

## Videos

🔭 Planned for understanding. Video _generation_ exists server-side (`media_executor.rs`), and screen-share capture uses `getDisplayMedia`, but uploading a video for analysis (frame sampling, transcript extraction) is not built. Requirement: local frame/transcript extraction before any managed-cloud analysis; large files stream, never base64-inline.

## Audio

🟡 Partial. Audio attachments preview with playback (`AudioPreview.tsx`, audio branch of `AttachmentPreview.tsx`), and live voice input exists (`VoiceInputButton.tsx`). Transcription of an _uploaded_ audio file into chat context is 🔭 Planned; the STT engine choice (a non-LLM engine such as Deepgram `nova-3`, exempt from the models.json rule but grounded in real config) must be labeled by trust mode — local capture must not silently route to a cloud STT.

## Drag & Drop

✅ Built. Window-level drag/drop is handled by `apps/desktop/src/features/chat/hooks/useDragAndDrop.ts` and `DragDropOverlay.tsx`: both filter for `dataTransfer.types.includes('Files')`, track drag depth to avoid flicker, apply an `accept` filter and `maxFiles` cap, and hand `File[]` to `useAttachments`. Requirement: enforce per-file/total caps and show the trust-mode label on the drop overlay.

## Clipboard Files

🟡 Partial. Paste handling in `useAttachments.ts` covers **images only** (`clipboardData.items` filtered to `image/`, 10 MB paste cap, vision-capability check), with a `PastedBadge.tsx` marker. Pasting non-image files (a copied PDF/doc) is not handled → 🔭. Requirement: extend paste to file items with the same caps and privacy labeling; keep the vision gate.

## Preview

✅ Built. `FilePreviewModal.tsx` previews images, text/JSON/XML, and PDFs; `AttachmentPreview.tsx` shows compact chips with remove controls and the per-file privacy label; `AudioPreview.tsx` handles audio. Gap: office formats and video fall back to a generic "no preview" state until their parsers land.

## OCR

🟡 Partial. `apps/desktop/src-tauri/src/core/agi/executors/ocr_executor.rs` implements Tesseract-based extraction (PNG/JPEG/WebP/BMP/TIFF/GIF) with path validation, **but it is behind an optional `ocr` Cargo feature** (`apps/desktop/src-tauri/Cargo.toml`) that is off in default builds and returns a graceful "not available" error otherwise. Requirement: ship OCR in a supported build target or clearly gate it in the UI; OCR runs on-host (Local-safe).

## Chunking

✅ Built for code / 🔭 for uploads. A real chunker exists at `apps/desktop/src-tauri/src/core/embeddings/chunker.rs`, feeding the code semantic-search index. General document chunking (token-windowed, overlap-aware, format-structure-aware) for uploaded PDFs/docs is 🔭 Planned. Requirement: reuse the existing chunker primitives rather than adding a parallel path.

## Embeddings

✅ Built (local) / 🔭 for attachment RAG. A local embedding service exists (`apps/desktop/src-tauri/src/core/embeddings/{generator,indexer,similarity,cache}.rs`, initialized in `src-tauri/src/lib.rs` with a degraded fallback), storing per-model vectors in SQLite with model-ID isolation (cross-model comparison is blocked). It currently powers code search (`semantic_search.rs`), not uploaded-document RAG. The embedding model is a non-LLM engine (exempt from the models.json rule) and must stay referenced in code, not re-listed. Requirement: attachment embeddings run locally for Local mode and never silently sync.

## Repository map

- `apps/desktop/src/features/file-upload/{FileUploadButton,FileDropZone,FilePreviewModal,PDFViewer,FileDownloadButton,index}.tsx`
- `apps/desktop/src/features/chat/hooks/{useAttachments,useDragAndDrop}.ts`
- `apps/desktop/src/features/chat/{DragDropOverlay,AttachmentPreview,AudioPreview,ChatInputArea}.tsx`, `MessageBubble/{MessageAttachments,PastedBadge}.tsx`
- `apps/desktop/src-tauri/src/core/agi/executors/{ocr_executor,file_executor,media_executor}.rs`
- `apps/desktop/src-tauri/src/core/embeddings/{chunker,generator,indexer,similarity,cache}.rs`, `core/agi/semantic_search.rs`
- `packages/types/src/chat.ts` (`MAX_ATTACHMENT_BYTES`, attachment validation), `packages/types/src/models.json` (vision capability)

## Competitor notes

Claude, ChatGPT, and Codex upload files to the provider's cloud, extract server-side, and embed into a hosted store. AGI's deliberate divergence: on Desktop, extraction, OCR, chunking, and embeddings run **on the host** so Local files never leave the machine; the outbound payload is bound to the user's chosen trust mode (Local / BYOK / Managed Cloud) with a visible per-file label; and Local→BYOK is an explicit, secret-scanned, preview-gated fork rather than a silent upload. Vision/format support is multi-provider, gated by real `models.json` capability rather than one vendor's fixed set.

## Acceptance / Definition of Done

- [ ] Build: every listed format either extracts locally or shows an explicit "no parser yet / preview only" state; caps from `@agiworkforce/types` enforced across drop, paste, and picker; PDF worker bundled (no CDN).
- [ ] Trust: no attachment crosses a boundary without the correct visible label; Local→BYOK includes attachments in context selection + payload preview + secret scan + consent; Local mode performs zero network egress for extraction/OCR/embeddings.
- [ ] Security: `file_executor.rs` path validation covers every native read; archive/zip extraction is sandboxed with entry/size limits; vision sends blocked when the selected model lacks `supportsVision`.

## Anti-patterns

- Silently uploading a Local file to BYOK or Managed Cloud, or omitting the per-file privacy label.
- Reading files with raw webview `fs` instead of the path-validated Rust executor.
- Loading the pdf.js worker (or any parser) from a remote CDN in a local-first build.
- Claiming Word/Excel/PowerPoint/ZIP/video ingestion as shipped — they are 🔭 Planned with no parser dependency in the repo.
- Hardcoding a model ID or vision capability instead of reading `packages/types/src/models.json`.
- Introducing removed tiers (Plus/Hobby/`pro_plus`), credit top-ups, or Supabase; billing/tier language must match the canon (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise).
