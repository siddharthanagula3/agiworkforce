
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

function toSharedConfig(entry: McpServerEntry): SharedMcpServerConfig {
  if (entry.transport.type === 'stdio') {
    return {
      command: entry.transport.command,
      args: entry.transport.args,
      env: entry.transport.env,
    };
  }
  return {
    url: entry.transport.url,
    transport: 'streamable-http',
    headers: entry.transport.headers ?? undefined,
  };
}

interface SharedMcpProxyState {
  handles: Map<string, McpServerHandle>;
  catalogBuild: Promise<McpToolCatalog> | null;
}

const state: SharedMcpProxyState = {
  handles: new Map(),
  catalogBuild: null,
};

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
