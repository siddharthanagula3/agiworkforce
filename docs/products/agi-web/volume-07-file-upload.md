# AGI Web — Volume 07 — File Upload

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/web/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon). Grounded in real repo paths: `apps/web/app/api/projects/[id]/knowledge-files/route.ts`, `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/route.ts`, `packages/types/src/chat.ts`, `packages/types/src/suite-contracts.ts`, `apps/web/lib/server/media-storage.ts`, `apps/web/lib/projects.ts`, `apps/web/lib/server/neon-types.ts`, `apps/web/db/neon/{0006_projects,0035_project_knowledge_file_lifecycle,0037_rls_user_isolation}.sql`, `apps/web/features/chat/components/{artifacts/ImageAttachmentPreview,Composer/DragDropOverlay}.tsx`.

## Overview & stance

AGI Web is the **cloud-only** surface: no BYOK, no Local mode. Every uploaded file is a **Managed-Cloud** object owned by a signed-in Clerk user and persisted in Neon with RLS. There is no local disk path and no user-key path to fall back to — so file upload here is squarely inside one trust boundary, and none of the "explicit Local→BYOK fork" machinery from Desktop/CLI applies. Uploads are a member of Managed Cloud, which is **public alpha, open by default** for signed-in users (founder decision 2026-06-27); present the capability as available, never waitlist-gated. Files attach to two contexts: (1) **chat attachments** via the composer, and (2) **project knowledge files** persisted per project. Bytes belong to the account, sync only through the Neon delta-sync APIs Web hosts, and never leak to BYOK or Local. This volume covers the accepted types, the extraction/index pipeline (largely design intent today), preview, limits, and deletion.

## Supported File Types

✅ Built — the accepted set is a single source of truth in `packages/types/src/chat.ts`: `ALLOWED_ATTACHMENT_MIME_PREFIXES` (`image/`, `application/pdf`, `text/`, `application/json`, `application/xml`), an extension fallback `ALLOWED_ATTACHMENT_EXTENSIONS` (png/jpg/jpeg/gif/webp/heic/pdf/txt/md/csv/json/xml plus common source extensions), and `ALLOWED_ATTACHMENT_ACCEPT` that feeds every `<input accept>`, drag-drop, and paste path. `validateAttachmentFile()` enforces order empty → too-large → unsupported and returns a structured `AttachmentValidation` reason the composer surfaces. The knowledge-file POST (`.../knowledge-files/route.ts`) additionally requires a non-empty `mimeType`. Requirement: picker, drag-drop, and paste MUST all validate against the same constant — no per-component allowlists.

## OCR

🔭 Planned — no OCR engine is wired on Web today (no Tesseract/vision extraction in `apps/web`). Design intent: image and scanned-PDF uploads run server-side OCR before indexing so text is searchable and citable. When built, the OCR engine is a **non-LLM engine identifier** (exempt from the models.json SSOT rule) but MUST be grounded in real dependency code and referenced, not invented. OCR MUST run inside the Managed-Cloud boundary against the stored object, never against a Local/BYOK payload, and its output must carry the same retention/deletion lifecycle as the source file.

## Chunking

🔭 Planned — there is no document chunker in `apps/web` (matches on `chunk` are streaming/SSE decode helpers in `lib/runtime/WebChatRuntime.ts` and `lib/chat/webChatPort.ts`, not text splitting). Design intent: parsed text is split into overlapping, token-bounded chunks with stable chunk IDs and byte offsets back to the source file, so retrieval can cite an exact span. Requirement when built: chunk rows are project-scoped and RLS-isolated like their parent `project_knowledge_files` row, and re-uploading an identical file (same `checksum_sha256`) reuses chunks rather than duplicating them.

## Parsing

🟡 Partial — the **record + storage** half exists; the **content-extraction** half does not. `POST .../knowledge-files` validates and inserts a metadata row (`file_name`, `mime_type`, `byte_count`, `checksum_sha256`, `source_surface`, `storage_uri`) via `mapKnowledgeFileRow` (`apps/web/lib/projects.ts`), and object bytes live in Vercel Blob (`apps/web/lib/server/media-storage.ts`, `put`/`del`, `BLOB_READ_WRITE_TOKEN`). The gap: the route assumes `storageUri` **already exists** — the signed-URL upload contract (`SignedUploadRequest`/`SignedUploadResponse` in `chat.ts`) has **no Web endpoint implementing it**, and no PDF/DOCX/CSV text extractor is present. So today a file can be recorded and stored but its text is not parsed for model context. Requirement: implement the signed-upload endpoint and a format-dispatched parser (PDF/text/CSV/JSON/XML → normalized text) before claiming "chat over your documents."

## Embeddings

🔭 Planned — no embedding call, `pgvector` column, or vector index exists in `apps/web` (grep for `embed(`/`text-embedding`/`vector(` returns nothing in web lib/app). Design intent: chunk text is embedded and stored for semantic retrieval feeding `app/api/memory/search`. The embedding model, when chosen, is an on-device/engine identifier that MUST be grounded in repo code (LLM catalog IDs still come only from `packages/types/src/models.json` — never invent one here). Embeddings are Managed-Cloud data, user-scoped, and MUST be deleted with their source file.

## Preview

🟡 Partial — image preview is built: `ImageAttachmentPreview.tsx` renders thumbnails with a lightbox (zoom, download, open-in-new), and `DragDropOverlay.tsx` gives composer drag-and-drop affordance. There is **no** in-app viewer for PDF, text, CSV, or source files yet — those render as file chips only. Requirement: non-image previews (paginated PDF, text/CSV with a size cap) are 🔭 and must fetch bytes through a **signed** storage read (`storage_uri` is not a public URL per the `ProjectKnowledgeFile` doc contract), never a raw public link.

## Limits

✅ Built — hard per-file cap `MAX_ATTACHMENT_BYTES = 25 MiB` (`packages/types/src/chat.ts`), enforced both client-side in `validateAttachmentFile()` and server-side in the knowledge-file POST (rejects `byteCount > MAX_ATTACHMENT_BYTES` with a MiB-accurate message). Additional enforced limits: MIME/extension allowlist (above), positive `byteCount`, required `checksum_sha256`, project-ownership check against `user_projects`, CSRF token (`requireCsrfToken`), and rate limiting (`withRateLimit(..., 'chat-conversation')`). 🔭 Planned: **per-tier** quotas (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) for total storage and monthly upload volume — do not invent per-tier byte numbers until they are set; no credit top-ups apply.

## Deletion

🟡 Partial — soft-delete **is implemented**: `DELETE .../knowledge-files/[fileId]` (`apps/web/app/api/projects/[id]/knowledge-files/[fileId]/route.ts`, `handleDeleteKnowledgeFile`) sets `deleted_at = now()` after a project-ownership check, behind `requireCsrfToken` + `withRateLimit`, and returns `{ success: true }`. The `deleted_at` and `retention_expires_at` columns exist (`0035_project_knowledge_file_lifecycle.sql`), the list query filters `deleted_at is null`, RLS forces user isolation (`0037_rls_user_isolation.sql`), and the uploader FK is `ON DELETE SET NULL` so a deleted uploader tombstones (not drops) the row. **Gaps:** the DELETE is a _soft_ delete only — it does not `del()` the underlying Blob object, does not cascade to derived chunks/embeddings/OCR text (none exist yet), and nothing enforces `retention_expires_at` (no sweeper job). Requirement when the pipeline lands: a hard-purge path that removes the Blob bytes + all derivatives and honors retention windows and account-deletion so no orphaned bytes survive. Reconciliation flag 🟡: the `SignedUploadResponse` comment in `chat.ts` still says "waitlist-gated in v1" — stale versus the public-alpha, open-by-default stance; treat as a tracked doc/code gap.

## Repository map

- `apps/web/app/api/projects/[id]/knowledge-files/route.ts` — list/record knowledge files (GET/POST).
- `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/route.ts` — soft-delete a knowledge file (DELETE).
- `apps/web/lib/projects.ts` — `mapKnowledgeFileRow`; `apps/web/lib/server/neon-types.ts` — `ProjectKnowledgeFileRow`.
- `apps/web/lib/server/media-storage.ts` — Vercel Blob object storage (`put`/`del`).
- `packages/types/src/chat.ts` — attachment allowlist, `MAX_ATTACHMENT_BYTES`, `validateAttachmentFile`, signed-upload contracts.
- `packages/types/src/suite-contracts.ts` — `ProjectKnowledgeFile`, source-surface sets.
- `apps/web/db/neon/{0006_projects,0035_project_knowledge_file_lifecycle,0037_rls_user_isolation}.sql` — table, lifecycle columns, RLS.
- `apps/web/features/chat/components/{artifacts/ImageAttachmentPreview,Composer/DragDropOverlay}.tsx` — preview + drop UI.

## Competitor notes

Claude (Projects knowledge, PDF vision), ChatGPT (file uploads + Advanced Data Analysis), and Codex (repo/file context) all offer parse-and-retrieve over uploads. AGI's deliberate divergence: **per-surface trust**. On Web there is no local or BYOK escape hatch — uploads are unambiguously Managed-Cloud, RLS-scoped, and sync only via AGI's own Neon delta-sync (Web ↔ Mobile ↔ Desktop). Desktop/CLI/VS Code can keep uploads Local or route via BYOK; Web cannot, by design. Provider-neutrality applies at the model layer (IDs from `models.json`), not by exposing user keys on this surface.

## Acceptance / Definition of Done

Production-ready when: uploads flow through a signed-URL endpoint (bytes never traverse the chat body), files parse → chunk → embed for retrieval, previews fetch via signed reads, and delete fully purges bytes + derivatives.

- [ ] Build: signed-upload endpoint + format-dispatched parser + chunker/embedder implemented and tested; `MAX_ATTACHMENT_BYTES` enforced client and server.
- [ ] Trust: no Local/BYOK affordance anywhere in the upload path; files are user-scoped Managed-Cloud objects; sync only via `apps/web/app/api/{chat,memory,projects}/sync`.
- [ ] Security: RLS + `FORCE ROW LEVEL SECURITY` verified; CSRF + rate limit on writes; signed reads only; `DELETE` purges Blob + chunks + embeddings + OCR text and honors retention/account-deletion.

## Anti-patterns

- Adding a BYOK or Local upload option to Web (trust-boundary violation).
- Claiming OCR/chunking/embeddings/parsing ship when no code path exists — keep them 🔭 until a real path lands.
- Serving `storage_uri` as a public URL instead of a signed read.
- Recording a knowledge-file row without a real stored object (metadata-without-bytes).
- Inventing per-tier byte quotas, INR prices, or LLM/embedding model IDs; referencing removed tiers ("Plus"/`pro_plus`/"Hobby"); adding credit top-ups.
- Referencing Supabase, or using `middleware.ts` instead of `proxy.ts`.
- Leaving files undeletable, or deleting the row while orphaning the Blob object and its derivatives.
