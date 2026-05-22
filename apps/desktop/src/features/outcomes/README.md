# Desktop Outcomes Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own goal outcomes and outcomes dashboard UI.

## Boundaries

- Keep outcomes feature-specific UI and local composition in this folder.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
