import 'server-only';

import { z } from 'zod';

import {
  buildMcpToolCatalog,
  connectMcpServer,
  type McpCallToolResult,
  type McpServerConfig,
  type McpServerHandle,
  type McpToolCatalog,
} from '@agiworkforce/mcp';

import { assertResolvedPublicHostname } from '@/lib/egress-policy';
import { MCP_EGRESS_POLICY } from '@/lib/mcp-egress-policy';
import { logger } from '@/lib/logger';
import { withSpan } from '@/lib/observability/span';

const httpSchema = z.object({
  type: z.literal('http'),
  url: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === 'https:', 'MCP endpoint must use HTTPS'),
  headers: z.record(z.string(), z.string()).optional().default({}),
});

const webMcpEntrySchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().default(''),
  transport: httpSchema,
  enabled: z.boolean().optional().default(true),
});

const webMcpFileSchema = z.object({
  servers: z.array(webMcpEntrySchema).max(64),
});

type WebMcpEntry = z.infer<typeof webMcpEntrySchema>;

let _configCache: WebMcpEntry[] | null = null;

function loadWebMcpConfig(): WebMcpEntry[] {
  if (_configCache !== null) return _configCache;

  const rawConfig = process.env['WEB_MCP_SERVERS_JSON'];
  if (!rawConfig) {
    logger.info({}, '[web-mcp] WEB_MCP_SERVERS_JSON is unset — no MCP tools available');
    _configCache = [];
    return _configCache;
  }

  try {
    const raw: unknown = JSON.parse(rawConfig);
    const parsed = webMcpFileSchema.parse(raw);
    _configCache = parsed.servers.filter((s) => s.enabled);
    logger.info({ count: _configCache.length }, '[web-mcp] loaded MCP server configuration');
  } catch (err) {
    logger.error({ error: err }, '[web-mcp] failed to parse MCP config — using empty list');
    _configCache = [];
  }
  return _configCache;
}

function entryToConfig(entry: WebMcpEntry): McpServerConfig {
  return {
    url: entry.transport.url,
    transport: 'streamable-http',
    headers: entry.transport.headers,
  };
}

interface CatalogState {
  catalog: McpToolCatalog | null;
  expiresAt: number;
  building: Promise<McpToolCatalog> | null;
  handles: Map<string, McpServerHandle>;
}

const _state: CatalogState = {
  catalog: null,
  expiresAt: 0,
  building: null,
  handles: new Map(),
};

const CATALOG_TTL_MS = 60_000;

export async function getWebMcpCatalog(): Promise<McpToolCatalog> {
  const now = Date.now();
  if (_state.catalog && now < _state.expiresAt) return _state.catalog;
  if (_state.building) return _state.building;

  const servers = loadWebMcpConfig();
  if (servers.length === 0) {
    const empty: McpToolCatalog = {
      version: 1,
      generatedAt: now,
      servers: {},
      tools: [],
    };
    _state.catalog = empty;
    _state.expiresAt = now + CATALOG_TTL_MS;
    return empty;
  }

  const configs: Record<string, McpServerConfig> = {};
  for (const entry of servers) {
    try {
      await assertResolvedPublicHostname(entry.transport.url);
      configs[entry.id] = entryToConfig(entry);
    } catch (error) {
      logger.warn(
        { error, serverId: entry.id },
        '[web-mcp] endpoint rejected by managed-cloud egress policy',
      );
    }
  }

  if (Object.keys(configs).length === 0) {
    const empty: McpToolCatalog = {
      version: 1,
      generatedAt: now,
      servers: {},
      tools: [],
    };
    _state.catalog = empty;
    _state.expiresAt = now + CATALOG_TTL_MS;
    return empty;
  }

  _state.building = (async () => {
    try {
      const { catalog, handles } = await buildMcpToolCatalog(configs);

      const old = Array.from(_state.handles.values());
      _state.handles = new Map();
      for (const h of handles) {
        _state.handles.set(h.serverName, h);
      }
      await Promise.all(old.map((h) => h.close().catch(() => undefined)));

      _state.catalog = catalog;
      _state.expiresAt = now + CATALOG_TTL_MS;
      return catalog;
    } finally {
      _state.building = null;
    }
  })();

  return _state.building;
}

export async function executeWebMcpTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpCallToolResult> {
  return withSpan(
    'mcp.call_tool',
    {
      kind: 'client',
      domain: 'tool',
      attributes: {
        'gen_ai.tool.name': toolName,
        'mcp.server.id': serverId,
        'mcp.tool.argument_count': Object.keys(args).length,
      },
    },
    async (span) => {
      let handle = _state.handles.get(serverId);
      if (!handle) {
        const entry = loadWebMcpConfig().find((s) => s.id === serverId);
        if (!entry) {
          throw new Error(`[web-mcp] server "${serverId}" is not in the config`);
        }
        await assertResolvedPublicHostname(entry.transport.url);
        handle = await connectMcpServer({
          egressPolicy: MCP_EGRESS_POLICY,
          serverName: serverId,
          config: entryToConfig(entry),
        });
        _state.handles.set(serverId, handle);
        span.setAttributes({ 'mcp.connection.cold_start': true });
      }
      const result = await handle.callTool(toolName, args);
      span.setAttributes({ 'mcp.tool.is_error': result.isError === true });
      return result;
    },
  );
}

export interface WebMcpToolDef {
  qualifiedName: string;
  serverId: string;
  toolName: string;
  description: string;
  origin?: 'operator' | 'connector';
  serverLabel?: string;
  inputSchema: Record<string, unknown>;
}

export function catalogToToolDefs(catalog: McpToolCatalog): WebMcpToolDef[] {
  return catalog.tools.map((t) => ({
    qualifiedName: `mcp__${t.serverName}__${t.toolName}`,
    serverId: t.serverName,
    toolName: t.toolName,
    description: t.description ?? t.fallbackDescription,
    origin: 'operator',
    inputSchema: t.inputSchema,
  }));
}

export function parseQualifiedToolName(
  qualifiedName: string,
): { serverId: string; toolName: string } | null {
  const match = /^mcp__([^_][^_]*)__(.+)$/.exec(qualifiedName);
  if (!match || !match[1] || !match[2]) return null;
  return { serverId: match[1], toolName: match[2] };
}

export function toOpenAiToolDef(def: WebMcpToolDef): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: def.qualifiedName,
      description: def.description,
      parameters: def.inputSchema,
    },
  };
}
