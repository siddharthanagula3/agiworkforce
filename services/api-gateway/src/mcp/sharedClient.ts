/**
 * @file Shared-package MCP client for the api-gateway.
 *
 * Replaces the legacy hand-rolled JSON-RPC implementation in `mcpProxy.ts`
 * with the official `@modelcontextprotocol/sdk` via the shared
 * `@agiworkforce/mcp` package's transport-discriminated client.
 *
 * Why the migration:
 *   - The legacy `mcpProxy.ts` implements stdio framing and HTTP polling by
 *     hand. The shared package uses the official MCP SDK, which now
 *     supports `streamable-http` (modern bidi stream), `sse` (legacy), AND
 *     stdio behind a single `Client` API. Less code, fewer bugs.
 *   - Tool catalogs across many servers can be built with a single
 *     `buildMcpToolCatalog()` call, and per-server failures are isolated.
 *   - Config validation already happens in `mcpConfig.ts`'s allowlist;
 *     this module assumes an already-validated config and focuses on
 *     lifecycle.
 *
 * Backward compatibility: `mcpProxy.ts` remains for existing callers; it
 * emits a deprecation warning on first use. New code should consume this
 * module's `getSharedMcpProxy()`.
 */

import {
  buildMcpToolCatalog,
  connectMcpServer,
  type McpCallToolResult,
  type McpServerConfig as SharedMcpServerConfig,
  type McpServerHandle,
  type McpToolCatalog,
} from '@agiworkforce/mcp';

import { logger } from '../lib/logger';
import { loadMcpConfig, type McpServerEntry } from './mcpConfig';

/** Maps the gateway's server-config shape onto the shared package's shape. */
function toSharedConfig(entry: McpServerEntry): SharedMcpServerConfig {
  if (entry.transport.type === 'stdio') {
    return {
      command: entry.transport.command,
      args: entry.transport.args,
      env: entry.transport.env,
    };
  }
  // HTTP transport — the shared package picks streamable-http by default
  // when no explicit `transport` field is present, which matches the SDK's
  // recommended direction. Pass any custom headers through.
  return {
    url: entry.transport.url,
    transport: 'streamable-http',
    headers: entry.transport.headers ?? undefined,
  };
}

interface SharedMcpProxyState {
  /** server id → live handle (lazy-opened on first use). */
  handles: Map<string, McpServerHandle>;
  /** Promise of the in-flight catalog build to coalesce concurrent calls. */
  catalogBuild: Promise<McpToolCatalog> | null;
}

const state: SharedMcpProxyState = {
  handles: new Map(),
  catalogBuild: null,
};

/**
 * Build a flat catalog across every configured server. Uses the shared
 * package's bulk builder, which isolates per-server failures. Caches the
 * full catalog in memory for `cacheTtlMs` (default: 60s).
 */
let catalogCacheValue: McpToolCatalog | null = null;
let catalogCacheExpiresAt = 0;
export async function getSharedMcpCatalog(cacheTtlMs = 60_000): Promise<McpToolCatalog> {
  const now = Date.now();
  if (catalogCacheValue && now < catalogCacheExpiresAt) {
    return catalogCacheValue;
  }
  if (state.catalogBuild) {
    return state.catalogBuild;
  }
  const servers = loadMcpConfig();
  const configs: Record<string, SharedMcpServerConfig> = {};
  for (const entry of servers) {
    configs[entry.id] = toSharedConfig(entry);
  }
  state.catalogBuild = (async () => {
    try {
      const { catalog, handles } = await buildMcpToolCatalog(configs);
      // Replace any existing handles, closing the old ones cleanly.
      const previous = state.handles;
      state.handles = new Map();
      for (const handle of handles) {
        state.handles.set(handle.serverName, handle);
      }
      for (const old of previous.values()) {
        await old.close().catch(() => undefined);
      }
      catalogCacheValue = catalog;
      catalogCacheExpiresAt = Date.now() + cacheTtlMs;
      return catalog;
    } finally {
      state.catalogBuild = null;
    }
  })();
  return state.catalogBuild;
}

/**
 * Call a tool on a server. Lazily ensures the server is connected;
 * subsequent calls reuse the cached handle.
 */
export async function callSharedMcpTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpCallToolResult> {
  let handle = state.handles.get(serverId);
  if (!handle) {
    const entry = loadMcpConfig().find((s: McpServerEntry) => s.id === serverId);
    if (!entry) {
      throw new Error(`MCP server "${serverId}" is not configured`);
    }
    handle = await connectMcpServer({ serverName: serverId, config: toSharedConfig(entry) });
    state.handles.set(serverId, handle);
  }
  return handle.callTool(toolName, args);
}

/** Close every open handle (call on graceful shutdown). */
export async function closeAllSharedMcpHandles(): Promise<void> {
  const handles = Array.from(state.handles.values());
  state.handles.clear();
  catalogCacheValue = null;
  catalogCacheExpiresAt = 0;
  await Promise.all(
    handles.map((h) =>
      h.close().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ message, serverName: h.serverName }, 'mcp.close failed');
      }),
    ),
  );
}
