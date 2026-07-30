# Desktop Artifacts Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own Desktop artifact panels, galleries, renderers, toolbars, version history, inline editing, and share dialogs.

## Boundaries

- Keep artifact-specific browsing, rendering, versioning, and sharing UI in this folder.
- Keep chat-local artifact message rendering in `apps/desktop/src/features/chat` until intentionally extracted.
- Import shared UI primitives from `@/components/ui/*`.
