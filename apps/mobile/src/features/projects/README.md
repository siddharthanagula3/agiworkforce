# apps/mobile/src/features/projects

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile project contexts, project state, and project-card presentation.

## Rules

- Import project UI through `@/src/features/projects`.
- Import project state from `@/src/features/projects/store`.
- Shared project contracts should come from API/shared types, not duplicated local shapes.
- Do not add project persistence directly in components.
