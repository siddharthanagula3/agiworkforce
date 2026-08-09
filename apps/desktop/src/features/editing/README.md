# Desktop Editing Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own enhanced diff, conflict resolver, and file-change review UI.

The visual-editor shell and live-preview pane that this folder once held were
removed; the remaining components have no importer outside this folder, so
nothing here renders in the shipped desktop app yet.

## Boundaries

- Keep editing feature-specific UI and local composition in this folder.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
