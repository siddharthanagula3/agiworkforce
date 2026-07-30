# Desktop Dynamic Canvas Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own the dynamic canvas experience used by chat sidecars and generated artifacts.

## Boundaries

- Keep dynamic-canvas feature-specific UI and local composition in this folder.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
