# Desktop Browser Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own Desktop browser visualization, replay, action log, viewer, and debug tabs for browser automation workflows.

## Boundaries

- Keep browser-specific display and diagnostics UI in this folder.
- Keep shared browser state in `apps/desktop/src/stores` until the browser runtime contract is promoted.
- Import shared UI primitives from `@/components/ui/*`.
