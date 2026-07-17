/**
 * @file Web-side MCP catalog and tool dispatcher.
 *
 * Server-only module — imported exclusively from route handlers and server
 * actions running in the Next.js Node.js runtime. Never import from 'use client'
 * modules.
 *
 * Responsibilities:
 *   1. Load a runtime-validated, remote-only MCP server list from
 *      WEB_MCP_SERVERS_JSON.
 *   2. Build and cache a flat tool catalog across all enabled servers.
 *   3. Dispatch individual tool calls to the right server.
 *
 * Design notes:
 *   - Uses `@agiworkforce/mcp` (the shared MCP SDK wrapper) so we get
 *     transport-discriminated connect, tool-name validation, and schema
 *     depth-caps without reimplementing them here.
 *   - Catalog is cached for 60 s in the route-handler process memory.
 *     The first warm-up call is lazy (on the first request that needs tools).
 *   - Managed Web never starts stdio MCP processes. Operator endpoints must be
 *     HTTPS and pass DNS-aware egress validation before discovery and execution.
 *   - No user-supplied URLs flow through this path.
 */

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
import { logger } from '@/lib/logger';

// ─── Config schema (same shape as the gateway's mcpConfig.ts) ─────────────────

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

// ─── Config loading ────────────────────────────────────────────────────────────

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

// ─── Catalog cache ────────────────────────────────────────────────────────────

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

/**
 * Return the cached tool catalog (or build it on first call).
 * Parallel callers coalesce into a single build promise.
 */
export async function getWebMcpCatalog(): Promise<McpToolCatalog> {
  const now = Date.now();
  if (_state.catalog && now < _state.expiresAt) return _state.catalog;
  if (_state.building) return _state.building;

  const servers = loadWebMcpConfig();
  if (servers.length === 0) {
    // No servers configured: return an empty catalog immediately.
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

      // Replace old handles cleanly.
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

/**
 * Call a single MCP tool by (serverId, toolName, args).
 * Lazily connects if the handle isn't cached yet.
 */
export async function executeWebMcpTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpCallToolResult> {
  let handle = _state.handles.get(serverId);
  if (!handle) {
    const entry = loadWebMcpConfig().find((s) => s.id === serverId);
    if (!entry) {
      throw new Error(`[web-mcp] server "${serverId}" is not in the config`);
    }
    await assertResolvedPublicHostname(entry.transport.url);
    handle = await connectMcpServer({
      serverName: serverId,
      config: entryToConfig(entry),
    });
    _state.handles.set(serverId, handle);
  }
  return handle.callTool(toolName, args);
}

/**
 * Return tool definitions in the OpenAI function-calling shape so they can be
 * injected into an LLM request's `tools` array.
 */
export interface WebMcpToolDef {
  /** Qualified name used in LLM requests: `mcp__<serverId>__<toolName>`. */
  qualifiedName: string;
  serverId: string;
  toolName: string;
  description: string;
  /** JSON Schema for the tool's input. */
  inputSchema: Record<string, unknown>;
}

/**
 * Convert the tool catalog into the flat list of tool defs the tool loop injects.
 */
export function catalogToToolDefs(catalog: McpToolCatalog): WebMcpToolDef[] {
  return catalog.tools.map((t) => ({
    qualifiedName: `mcp__${t.serverName}__${t.toolName}`,
    serverId: t.serverName,
    toolName: t.toolName,
    description: t.description ?? t.fallbackDescription,
    inputSchema: t.inputSchema,
  }));
}

/**
 * Parse a qualified tool name back to (serverId, toolName).
 * Returns null if the name is not in `mcp__<serverId>__<toolName>` form.
 */
export function parseQualifiedToolName(
  qualifiedName: string,
): { serverId: string; toolName: string } | null {
  const match = /^mcp__([^_][^_]*)__(.+)$/.exec(qualifiedName);
  if (!match || !match[1] || !match[2]) return null;
  return { serverId: match[1], toolName: match[2] };
}

/**
 * Format MCP tool defs into the OpenAI-compatible shape expected by
 * `ProcessedRequest.llmRequest.tools`.
 */
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
