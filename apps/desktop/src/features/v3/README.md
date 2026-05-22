# Desktop V3 Shell Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own the v3 Desktop shell, sidebar, composer, account flows, plugin/skills views, and v3-specific chat UI.

## Boundaries

- Keep v3 feature-specific UI and local composition in this folder.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
