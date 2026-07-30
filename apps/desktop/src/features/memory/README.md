# Desktop Memory Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own the Desktop user-memory management components, memory cards, memory import/export controls, settings panel integration, and save-to-memory actions.

## Boundaries

- Keep memory-specific user-facing UI in this folder.
- Keep API contracts in `apps/desktop/src/api` and state in `apps/desktop/src/stores` until a shared memory package exists.
- Import shared UI primitives from `@/components/ui/*`.
