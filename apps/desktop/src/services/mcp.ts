/**
 * Desktop MCP service — TS-side wrapper using the shared `@agiworkforce/mcp`
 * package's transport-discriminated client.
 *
 * The Tauri Rust backend retains its own MCP implementation
 * (`apps/desktop/src-tauri/src/...`) for stdio servers spawned from the
 * desktop process. This service provides a parallel JS-side path used by:
 *  - the cloud-mode desktop (no Tauri) — talks to remote MCP servers
 *    directly over HTTP / SSE
 *  - tests + tooling that need to stand up a connection from the renderer
 *  - feature flags that route a connection through TS instead of Rust
 *    (useful when a server doesn't need elevated stdio access)
 *
 * Backward compatibility: this file is additive. The legacy `apps/desktop/
 * src/api/mcp.ts` (Tauri invoke wrapper) is unchanged. Callers that have
 * been using the old client should keep doing so until migrated; new code
 * should prefer this module.
 *
 * Transport coverage: the shared package exposes stdio + SSE +
 * streamable-http today. The full 8-transport surface (ws, ws-ide, sdk,
 * sse-ide, claudeai-proxy) is reserved for follow-up sprints — those need
 * additional MCP-SDK plumbing not yet in `packages/mcp`. Callers MUST
 * receive a typed "transport not supported in renderer" error rather than
 * a runtime crash.
 */

import {
  buildMcpToolCatalog,
  connectMcpServer,
  type McpCallToolResult,
  type McpServerConfig,
  type McpServerHandle,
  type McpToolCatalog,
} from '@agiworkforce/mcp';

export type { McpCallToolResult, McpServerConfig, McpServerHandle, McpToolCatalog };

/**
 * Connect to a single MCP server using the shared transport-discriminated
 * client. Caller owns the lifecycle — call `handle.close()` when done.
 */
export async function connectDesktopMcpServer(
  serverName: string,
  config: McpServerConfig,
): Promise<McpServerHandle> {
  return connectMcpServer({ serverName, config });
}

/**
 * Build a flat catalog across many MCP servers. Per-server failures are
 * isolated; a single bad server does not poison the rest.
 */
export async function buildDesktopMcpCatalog(
  servers: Record<string, McpServerConfig>,
): Promise<{ catalog: McpToolCatalog; handles: McpServerHandle[] }> {
  return buildMcpToolCatalog(servers);
}

/**
 * Convenience: open, list, close. For one-off "what tools does this server
 * expose" probes from the desktop UI without tracking a long-lived handle.
 */
export async function probeMcpServer(
  serverName: string,
  config: McpServerConfig,
): Promise<McpToolCatalog> {
  const handle = await connectMcpServer({ serverName, config });
  try {
    return {
      version: 1,
      generatedAt: Date.now(),
      servers: { [serverName]: handle.catalog },
      tools: handle.catalog.tools,
    };
  } finally {
    await handle.close();
  }
}
