# apps/desktop/src/features/settings

Status: Current
Owner role: Desktop lead
Last updated: 2026-05-21
Purpose: Desktop settings panel, account/model/provider preferences, automation permissions, MCP settings, personalization, notifications, and privacy controls.

## Rules

- Keep Desktop settings presentation and tab composition here.
- Settings state remains in approved stores until a setting-specific store has a clear domain owner.
- Import shared primitives from `@/components/ui`; do not add settings UI back under `src/components/Settings`.
- Settings can compose MCP controls from `@/features/mcp`, but MCP transport/credential behavior remains MCP-owned.
