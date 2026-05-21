# Desktop Connectors Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own Desktop connector gallery, connector detail cards, OAuth/API-key setup, connector health dashboard, and connector definitions used by settings and search.

## Boundaries

- Keep connector UI and connector catalog definitions in this folder.
- Keep MCP server health/state in `apps/desktop/src/stores` and `apps/desktop/src/features/mcp`.
- Import shared UI primitives from `@/components/ui/*`.
