# Desktop Background Tasks Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own background task indicators and task panel UI used by Desktop chat and shell surfaces.

## Boundaries

- Keep background-tasks feature-specific UI and local composition in this folder.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
