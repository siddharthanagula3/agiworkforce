# Desktop File Upload Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own file upload, download, preview, drop zone, and PDF viewer primitives.

## Boundaries

- Keep file-upload feature-specific UI and local composition in this folder.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
