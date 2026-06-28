# Volume 15 — Files & Ingestion

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 15)
Authority: this manual, `docs/strategy/10-oss-corpus-port-plan.md` §7 (liteparse on-device ingestion), `docs/current/source-of-truth.md` (Surface Roles, one-chat), `docs/agent-context/repo-map.json`, `packages/types/src/suite-contracts.ts`, Vol 30 (secret scan).

## Philosophy & Cloud/Local stance

Files are how the world enters a chat: documents, images, screenshots, scans, clipboard pastes, camera captures, photos. Because the one-chat rule (Vol 9) means files attach into the _same_ thread as prompts, files inherit the thread's trust boundary — and that makes ingestion a privacy frontier, not a convenience. The defining stance: **on-device ingestion stays local.** Local file parsing (PDF/DOCX/PPTX → markdown/text via liteparse, an on-device Apache-2.0 parser; `docs/strategy/10` §7) runs on the device and the file content never leaves it unless the user explicitly transfers it. This satisfies the Local trust boundary for the highest-value file workflows.

Cloud/Local sets the storage scope and where parsing/OCR/embedding run. On Local, parse, OCR, index, and embed on-device. On BYOK/Managed, server-side ingestion is allowed within that boundary, but a Local-origin file never crosses into BYOK/Managed without the explicit fork (Vol 9). **Every ingested file is scanned and secret-checked on ingest** (Vol 30) and carries attachment metadata — privacy mode, source surface, and storage scope — so downstream code always knows the file's trust origin. Mobile should not be the first heavy local PDF/PPTX/DOCX _generation_ surface (source-of-truth), though on-device ingestion still applies.

## Binding rules

1. **On-device ingestion stays local.** Local file parsing/OCR/indexing/embedding run on-device (e.g., liteparse) and the content never egresses unless the user explicitly transfers it.
2. **Scan + secret-check on ingest.** Every file is scanned for malware-class risk and secret-checked on ingestion, before it can enter context or cross a boundary (Vol 30; fail-closed).
3. **Every attachment carries metadata.** Privacy mode, source surface (which app/surface produced it), and storage scope (local/account/managed) are recorded on every attachment.
4. **Files inherit the thread's trust boundary.** An attached file takes the conversation's trust mode; a Local-origin file never enters a BYOK/Managed request without a fork.
5. **One-chat attachment.** Files attach into the normal chat thread (prompts + files + reference files + images together) — never a separate file-chat (Vol 9, P0 #3).
6. **Ingestion validates input.** File type, size, and content are validated before processing; untrusted file content is treated as guarded data, not instructions (Vol 11/30).
7. **Storage scope is explicit and honored.** Local files persist on-device; account/managed files follow retention/deletion + DSAR (Vol 25/30); no silent upload.
8. **Indexing/search is trust-scoped.** File search returns only files the active trust boundary permits; Local files never surface in a BYOK/Managed-scoped query.
9. **Versioning is supported.** Re-uploaded/edited files version with provenance; downloads reflect the selected version.
10. **OCR/preview run in the file's boundary.** OCR, preview generation, and thumbnailing respect the file's trust mode and storage scope.

## Repository map

- Desktop file UI: `apps/desktop/src/features/file-upload/` — `FileDropZone.tsx`, `FileUploadButton.tsx`, `FilePreviewModal.tsx`, `PDFViewer.tsx`, `FileDownloadButton.tsx`.
- Desktop filesystem/local files: `apps/desktop/src/features/filesystem/` (local-private host, source-of-truth).
- Chat attachment plumbing: `apps/desktop/src/features/chat/AttachmentPreview.tsx`, `packages/unified-chat/src/`.
- Mobile ingestion/capture: `apps/mobile/services/docParser.ts`, `apps/mobile/services/fileCreation.ts`.
- On-device parser dependency: liteparse (`docs/strategy/10` §7 — Apache-2.0 + PDFium BSD + Tesseract Apache; keep AGPL out of the binary).
- Secret scan / ingest safety: Vol 30 paths (Local→BYOK fork scan), `packages/compliance/`.
- Attachment metadata + trust contracts: `packages/types/src/suite-contracts.ts` (`PrivacyMode`), `packages/types/src/` (Vol 38).
- Storage scopes: `apps/web/db/neon` (account/managed), local SQLite/SecureStore/filesystem (Vol 25).
- Sandbox preview rendering (untrusted file previews): `apps/sandbox` (Vol 14).

## Competitor notes

Per source-of-truth Competitive Baseline: ChatGPT and Claude both ship file uploads, image input, screenshot attach, and data analysis over files; Claude desktop and ChatGPT macOS support file/photo/screenshot attach and (ChatGPT) camera/voice. AGI's parity target is that full capture set (upload/download/drag&drop/clipboard/camera/photos/scanner/OCR/preview). AGI's divergence: **on-device ingestion that never egresses** — incumbents upload files to their cloud to parse them, while AGI parses Local files on the device, satisfying the trust boundary that is the product (gap analysis §2/§4). Web currently lacks attachment ingestion for non-images (gap analysis §3) — a parity gap to close. Match the capture/preview workflow; never copy proprietary file UI.

## Checklists

### Build — capture & ingestion

- [ ] Support upload, download, drag&drop, clipboard paste, camera, photos, scanner.
- [ ] On-device parse for PDF/DOCX/PPTX → text/markdown (liteparse) on Local; content never egresses.
- [ ] OCR for images/scans, run in the file's trust boundary.
- [ ] File preview (PDF/image/text) — untrusted previews render via the sandbox (Vol 14).
- [ ] Index files for search; embed on-device on Local.
- [ ] Version re-uploaded/edited files with provenance.

### Build — metadata & one-chat

- [ ] Record privacy mode + source surface + storage scope on every attachment.
- [ ] Attach files into the normal chat thread (one-chat), alongside prompts/reference files/images.
- [ ] Storage scope routes persistence: local on-device, account/managed to Neon/blob with retention.

### Review & security

- [ ] Scan + secret-check every file on ingest, before context entry or boundary crossing (fail-closed).
- [ ] Validate file type/size/content before processing; treat content as guarded data, not instructions.
- [ ] Local-origin files never enter a BYOK/Managed request without a fork (trust-boundary test).
- [ ] File search is trust-scoped; Local files never surface cross-boundary.
- [ ] Managed/account files honor retention/deletion + DSAR; no silent upload of Local files.

### Per-surface

- [ ] Desktop is the primary local file host (filesystem + local generated files stay local).
- [ ] Web closes the non-image attachment-ingestion gap (gap analysis §3).
- [ ] Mobile does on-device ingestion but is not the first heavy local doc-_generation_ surface.

## Definition of Done

Files can be captured via upload/download/drag&drop/clipboard/camera/photos/scanner; Local files are parsed/OCR'd/indexed/embedded on-device and never egress without an explicit transfer. Every attachment carries privacy mode + source surface + storage scope, attaches into the one-chat thread, and is scanned + secret-checked on ingest (fail-closed). File search is trust-scoped; Local-origin files never cross into BYOK/Managed without a fork (trust-boundary test passes). Previews render via the sandbox; Managed/account files honor retention/deletion/DSAR. The attach→ingest→use flow is verified end-to-end on the active surface (not build-only).

## Anti-patterns

- Uploading a Local file to parse it server-side (breaks the on-device-ingestion stance).
- A separate file-chat instead of attaching into the one-chat thread.
- Skipping the ingest scan/secret-check, or running it fail-open.
- Attachments without privacy-mode / source-surface / storage-scope metadata.
- File search that surfaces Local files into a BYOK/Managed-scoped query.
- Treating file content as instructions instead of guarded data (prompt-injection vector).
- Bundling an AGPL parser (e.g., PyMuPDF) into the shipped binary instead of liteparse/network-interop (license gate, `docs/strategy/10` §8).
