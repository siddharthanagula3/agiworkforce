# Desktop Agent Status Monitor Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own the Desktop agent status monitor surface.

## Boundaries

- Keep agent-status-monitor feature-specific UI and local composition in this folder.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
