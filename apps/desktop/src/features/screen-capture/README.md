# Desktop Screen Capture Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own screen capture button, region/window selectors, capture preview, OCR viewer, and tests.

## Boundaries

- Keep screen-capture feature-specific UI and local composition in this folder.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
