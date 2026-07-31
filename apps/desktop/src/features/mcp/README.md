# apps/desktop/src/features/mcp

Status: Current
Owner role: Desktop lead
Last updated: 2026-05-21
Purpose: Desktop MCP server management, tool browsing, connection status, credentials, logs, and workspace UI.

## Rules

- Keep MCP server-management and tool-browser presentation here.
- MCP client calls stay behind `api/mcp`, MCP stores, or typed MCP services.
- Import shared primitives from `@/components/ui`; do not add MCP UI back under `src/components/MCP`.
- Credential handling must preserve local/BYOK privacy boundaries and avoid logging secrets.
- Do not present arbitrary tool-result HTML, URLs, or private component schemas as MCP Apps. A future host must implement the standard `ui://` resource, registered MIME type, tool metadata, resource retrieval, CSP/permission policy, and JSON-RPC bridge end to end before mounting embedded UI.
