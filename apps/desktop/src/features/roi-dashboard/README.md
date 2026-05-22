# Desktop ROI Dashboard Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own ROI dashboard charts, stats, report export, milestones, and local ROI store.

## Boundaries

- Keep roi-dashboard feature-specific UI and local composition in this folder.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
