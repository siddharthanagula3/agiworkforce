# Desktop Canvas Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own the Desktop canvas workspace, canvas panel, artifact preview/list, and code editor used for generated artifacts and editable outputs.

## Boundaries

- Keep canvas workspace UI in this folder.
- Keep cross-feature editing state in `apps/desktop/src/stores/editingStore.ts` until a dedicated canvas store contract is extracted.
- Import shared UI primitives from `@/components/ui/*`.
