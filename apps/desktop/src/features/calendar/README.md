# Desktop Calendar Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own calendar day/week/month views, event dialogs, and calendar workspace UI.

## Boundaries

- Keep calendar feature-specific UI and local composition in this folder.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
