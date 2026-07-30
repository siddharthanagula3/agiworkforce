# Desktop Marketplace Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own the Desktop workflow marketplace page, discovery tabs, workflow cards, publishing flow, cloning/favorites, sharing, and marketplace-local state.

## Boundaries

- Keep workflow marketplace UI and local marketplace store in this folder.
- Keep marketplace API clients and shared workflow types in `apps/desktop/src/api` and `apps/desktop/src/types` until a package boundary exists.
- Import shared UI primitives from `@/components/ui/*`.
