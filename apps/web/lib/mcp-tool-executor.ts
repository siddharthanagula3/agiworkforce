/**
 * @file Web-side MCP catalog and tool dispatcher.
 *
 * Server-only module — imported exclusively from route handlers and server
 * actions running in the Next.js Node.js runtime. Never import from 'use client'
 * modules.
 *
 * Responsibilities:
 *   1. Load the MCP server list from the same env-var-pointed config file that
 *      `services/api-gateway/src/mcp/mcpConfig.ts` reads
 *      (MCP_WEB_CONFIG_PATH, falling back to WEB_MCP_SERVERS_JSON).
 *   2. Build and cache a flat tool catalog across all enabled servers.
 *   3. Dispatch individual tool calls to the right server.
 *
 * Design notes:
 *   - Uses `@agiworkforce/mcp` (the shared MCP SDK wrapper) so we get
 *     transport-discriminated connect, tool-name validation, and schema
 *     depth-caps without reimplementing them here.
 *   - Catalog is cached for 60 s in the route-handler process memory.
 *     The first warm-up call is lazy (on the first request that needs tools).
 *   - SSRF: only servers already declared in the config file are reachable.
 *     No user-supplied URLs flow through this path.
 */

import 'server-only';

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

import {
  buildMcpToolCatalog,
  connectMcpServer,
  type McpCallToolResult,
  type McpServerConfig,
  type McpServerHandle,
  type McpToolCatalog,
} from '@agiworkforce/mcp';

import { logger } from '@/lib/logger';

// ─── Config schema (same shape as the gateway's mcpConfig.ts) ─────────────────

const stdioSchema = z.object({
  type: z.literal('stdio'),
  command: z.string().min(1),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string(), z.string()).optional().default({}),
});

const httpSchema = z.object({
  type: z.literal('http'),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional().default({}),
});

const webMcpEntrySchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().default(''),
  transport: z.discriminatedUnion('type', [stdioSchema, httpSchema]),
  enabled: z.boolean().optional().default(true),
});

const webMcpFileSchema = z.object({
  servers: z.array(webMcpEntrySchema),
});

type WebMcpEntry = z.infer<typeof webMcpEntrySchema>;

// ─── Config loading ────────────────────────────────────────────────────────────

let _configCache: WebMcpEntry[] | null = null;

function resolveConfigPath(): string | null {
  // Prefer a dedicated env var so the web app can point at a different server
  // list from the gateway. Fall back to a well-known default.
  const candidates = [
    process.env['MCP_WEB_CONFIG_PATH'],
    process.env['MCP_CONFIG_PATH'],
    resolve(process.cwd(), 'mcp-servers.json'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const abs = resolve(candidate);
    if (existsSync(abs)) return abs;
  }
  return null;
}

function loadWebMcpConfig(): WebMcpEntry[] {
  if (_configCache !== null) return _configCache;

  const path = resolveConfigPath();
  if (!path) {
    logger.info({}, '[web-mcp] no config file found — no MCP tools available');
    _configCache = [];
    return _configCache;
  }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    const parsed = webMcpFileSchema.parse(raw);
    _configCache = parsed.servers.filter((s) => s.enabled);
    logger.info({ count: _configCache.length, path }, '[web-mcp] loaded MCP server configuration');
  } catch (err) {
    logger.error({ error: err, path }, '[web-mcp] failed to parse MCP config — using empty list');
    _configCache = [];
  }
  return _configCache;
}

function entryToConfig(entry: WebMcpEntry): McpServerConfig {
  if (entry.transport.type === 'stdio') {
    return {
      command: entry.transport.command,
      args: entry.transport.args,
      env: entry.transport.env,
      // signedManifest: false means only userConsent path is available.
      // For our system-configured servers we trust the config file itself
      // (operator-deployed), so we set developerMode:true to allow stdio
      // without a signed manifest. This is only used in the server process.
      developerMode: true,
      userConsent: {
        granted_at: new Date().toISOString(),
        for_command: entry.transport.command,
        for_args: entry.transport.args ?? [],
      },
    };
  }
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
    configs[entry.id] = entryToConfig(entry);
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
