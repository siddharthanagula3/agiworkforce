# Desktop Auth Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own Desktop authentication forms and authentication page composition.

## Boundaries

- Keep auth feature-specific UI and local composition in this folder.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
