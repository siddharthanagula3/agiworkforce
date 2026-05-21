# Desktop Filesystem Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own filesystem workspace UI for local file browsing and operations.

## Boundaries

- Keep filesystem feature-specific UI and local composition in this folder.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
