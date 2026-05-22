# Desktop Execution Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own the Desktop runtime execution dashboard, terminal/file/browser execution panels, timeout warning UI, and reflection/checkpoint views used by chat and agent workflows.

## Boundaries

- Keep execution-session UI in this folder.
- Keep shared stores, runtime bridges, and platform utilities in `apps/desktop/src/stores`, `apps/desktop/src/runtime`, or `apps/desktop/src/lib` until they are intentionally promoted into a shared package.
- Import shared UI primitives from `@/components/ui/*`.
