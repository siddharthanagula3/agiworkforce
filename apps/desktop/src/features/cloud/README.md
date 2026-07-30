# Desktop Cloud Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own cloud storage panel UI while managed cloud remains gated by privacy and commercial controls.

## Boundaries

- Keep cloud feature-specific UI and local composition in this folder.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
