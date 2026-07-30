# apps/desktop/src/features/mcp

Status: Current
Owner role: Desktop lead
Last updated: 2026-05-21
Purpose: Desktop MCP server management, MCP app rendering, tool browsing, connection status, credentials, logs, and workspace UI.

## Rules

- Keep MCP presentation and MCP app UI here.
- MCP client calls stay behind `api/mcp`, MCP stores, or typed MCP services.
- Import shared primitives from `@/components/ui`; do not add MCP UI back under `src/components/MCP`.
- Credential handling must preserve local/BYOK privacy boundaries and avoid logging secrets.
