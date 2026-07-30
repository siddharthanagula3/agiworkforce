# Desktop Git Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own Git status, diff, commit, and panel UI for local repository workflows.

## Boundaries

- Keep git feature-specific UI and local composition in this folder.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
