# apps/web/features/library

Status: Current
Owner role: Web lead
Last updated: 2026-07-10
Purpose: Library view — browse uploaded and model-generated files (images, documents, spreadsheets) over `media_assets`, with origin/kind filters, filename search, and authenticated downloads.

## Rules

- List data comes from `GET /api/library`; validate responses against the `@agiworkforce/services` library cloud contract.
- Downloads and previews go through the owner-scoped `/api/files/{id}` serve route — never mint public URLs.
- Reuse shared file-card components from `@agiworkforce/unified-chat`; do not fork a library-only card.
- Honest empty/error states only — no fabricated content or metrics.
