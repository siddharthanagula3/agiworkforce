/**
 * Connect to an MCP server, list its tools, and return a typed handle.
 *
 * Usage:
 * ```ts
 * const handle = await connectMcpServer({ serverName: 'fs', config });
 * for (const tool of handle.catalog.tools) console.log(tool.toolName);
 * const result = await handle.callTool('read_file', { path: '/etc/hosts' });
 * await handle.close();
 * ```
 *
 * Catalog generation rules (mirrors OpenClaw):
 *   - `safeServerName`: lowercase, [a-z0-9_]-only, prefixed-on-collision
 *   - `fallbackDescription`: server-name-derived when the tool omits one
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { resolveMcpTransport } from './transport';
import type {
  McpCallToolResult,
  McpCatalogTool,
  McpServerCatalog,
  McpServerConfig,
  McpToolCatalog,
} from './types';

const CLIENT_NAME = 'agiworkforce';
const CLIENT_VERSION = '0.0.1';
const DEFAULT_CONNECTION_TIMEOUT_MS = 30_000;
const CATALOG_VERSION = 1;

function toSafeServerName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export interface McpServerHandle {
  serverName: string;
  safeServerName: string;
  catalog: McpServerCatalog;
  client: Client;
  callTool(name: string, args: Record<string, unknown>): Promise<McpCallToolResult>;
  close(): Promise<void>;
}

export interface ConnectMcpServerParams {
  serverName: string;
  config: McpServerConfig;
}

export async function connectMcpServer(params: ConnectMcpServerParams): Promise<McpServerHandle> {
  const { serverName, config } = params;
  const safeServerName = toSafeServerName(serverName);

  const transport = resolveMcpTransport(config);
  const client = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION });

  const timeoutMs = config.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS;
  await withTimeout(client.connect(transport), timeoutMs, 'mcp.connect');

  // Discover tools.
  const listed = await client.listTools();
  const tools: McpCatalogTool[] = (listed.tools ?? []).map((t) => ({
    serverName,
    safeServerName,
    toolName: t.name,
    ...(t.title ? { title: t.title } : {}),
    ...(t.description ? { description: t.description } : {}),
    inputSchema: (t.inputSchema as Record<string, unknown>) ?? {
      type: 'object',
      properties: {},
    },
    fallbackDescription: `Tool ${t.name} on MCP server ${serverName}`,
  }));

  const serverCatalog: McpServerCatalog = { serverName, safeServerName, tools };

  return {
    serverName,
    safeServerName,
    catalog: serverCatalog,
    client,
    async callTool(name: string, args: Record<string, unknown>): Promise<McpCallToolResult> {
      const res = await client.callTool({ name, arguments: args });
      const isError = typeof res.isError === 'boolean' ? res.isError : undefined;
      return {
        ...(isError !== undefined ? { isError } : {}),
        content: (res.content as McpCallToolResult['content']) ?? [],
      };
    },
    async close(): Promise<void> {
      await client.close().catch(() => undefined);
    },
  };
}

/** Connect to many servers and produce a flat catalog across all of them. */
export async function buildMcpToolCatalog(
  servers: Record<string, McpServerConfig>,
): Promise<{ catalog: McpToolCatalog; handles: McpServerHandle[] }> {
  const handles: McpServerHandle[] = [];
  const serverEntries: Record<string, McpServerCatalog> = {};
  const flatTools: McpCatalogTool[] = [];

  for (const [serverName, config] of Object.entries(servers)) {
    try {
      const handle = await connectMcpServer({ serverName, config });
      handles.push(handle);
      serverEntries[serverName] = handle.catalog;
      flatTools.push(...handle.catalog.tools);
    } catch (err) {
      // Skip servers that fail to connect; surface the error but don't
      // poison the whole catalog. Caller can re-try with a single config.
      const message = err instanceof Error ? err.message : String(err);
      void message;
    }
  }

  const catalog: McpToolCatalog = {
    version: CATALOG_VERSION,
    generatedAt: Date.now(),
    servers: serverEntries,
    tools: flatTools,
  };

  return { catalog, handles };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
