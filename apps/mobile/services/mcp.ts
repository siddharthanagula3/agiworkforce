/**
 * Mobile MCP service.
 *
 * Routes through the api-gateway's `/api/mcp/...` endpoints — React Native
 * cannot run `@modelcontextprotocol/sdk` directly (no `child_process`, no
 * `node:fs`). We import the canonical *types* from `@agiworkforce/mcp` so
 * server and client agree on the wire shape, and the runtime calls are
 * plain `fetch` against the gateway. Metro tree-shakes `import type` cleanly
 * — no Node-only code reaches the bundle.
 *
 * Bundle size impact: <2 KB minified+gzipped (types-only import; the wire
 * helpers below are vanilla `fetch`). Verified by inspecting Metro's
 * post-bundle dependency tree — no transitive resolution of @modelcontextprotocol/sdk.
 *
 * Backward compatibility: this module is additive. Mobile previously had
 * no MCP surface; this introduces it.
 */

import type {
  McpCallToolResult,
  McpServerCatalog,
  McpServerConfig,
  McpToolCatalog,
} from '@agiworkforce/mcp';

import { API_URL } from '@/lib/constants';
import { secureFetch } from './secureFetch';
import { supabase } from './supabase';

export type { McpCallToolResult, McpServerCatalog, McpServerConfig, McpToolCatalog };

async function getAuthHeader(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? `Bearer ${token}` : null;
}

/**
 * List MCP servers configured at the api-gateway. Mobile clients cannot
 * stand up servers themselves — they consume what the gateway provides.
 */
export async function listMcpServers(): Promise<{ servers: string[] }> {
  const auth = await getAuthHeader();
  const res = await secureFetch(`${API_URL}/api/mcp/servers`, {
    headers: auth ? { Authorization: auth } : {},
  });
  if (!res.ok) {
    throw new Error(`mcp.listServers failed: HTTP ${res.status}`);
  }
  return (await res.json()) as { servers: string[] };
}

/**
 * List tools for a server. Mirrors the api-gateway's server-side response
 * shape against `McpServerCatalog`.
 */
export async function listMcpTools(serverId: string): Promise<McpServerCatalog> {
  const auth = await getAuthHeader();
  const res = await secureFetch(
    `${API_URL}/api/mcp/servers/${encodeURIComponent(serverId)}/tools`,
    { headers: auth ? { Authorization: auth } : {} },
  );
  if (!res.ok) {
    throw new Error(`mcp.listTools failed: HTTP ${res.status}`);
  }
  return (await res.json()) as McpServerCatalog;
}

/**
 * Call an MCP tool. Returns the canonical `McpCallToolResult` content shape.
 */
export async function callMcpTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<McpCallToolResult> {
  const auth = await getAuthHeader();
  const res = await secureFetch(
    `${API_URL}/api/mcp/servers/${encodeURIComponent(serverId)}/tools/${encodeURIComponent(toolName)}/call`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify({ arguments: args }),
    },
  );
  if (!res.ok) {
    throw new Error(`mcp.callTool failed: HTTP ${res.status}`);
  }
  return (await res.json()) as McpCallToolResult;
}
