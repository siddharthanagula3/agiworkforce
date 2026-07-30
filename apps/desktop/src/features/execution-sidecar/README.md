# Desktop Execution Sidecar Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own the Desktop execution sidecar shell, timeline, screenshots, terminal view, approvals, and filmstrip that accompany live chat/tool execution.

## Boundaries

- Keep sidecar-specific composition and display components in this folder.
- Keep cross-chat execution state in `apps/desktop/src/stores` until the store contract is intentionally moved.
- Import shared UI primitives from `@/components/ui/*`.
