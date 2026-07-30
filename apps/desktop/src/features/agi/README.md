# Desktop AGI Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own AGI task panels, progress indicators, reflection insight cards, operator drill-downs, and agent task creation/monitoring UI.

## Boundaries

- Keep agi feature-specific UI and local composition in this folder.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
