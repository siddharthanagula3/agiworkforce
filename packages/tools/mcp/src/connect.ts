
import { Client, isInputRequiredResult } from '@modelcontextprotocol/client';

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

const VERSION_NEGOTIATION = { mode: 'auto' } as const;

const MCP_TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;
const MCP_TOOL_NAME_MAX_LENGTH = 128;

export function isAcceptableMcpToolName(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  if (name.length === 0 || name.length > MCP_TOOL_NAME_MAX_LENGTH) return false;
  if (!MCP_TOOL_NAME_PATTERN.test(name)) return false;
  if (name.includes('__')) return false;
  return true;
}

export interface SchemaValidationResult {
  ok: boolean;
  reason?: string;
}

const SCHEMA_MAX_DEPTH = 16;
const SCHEMA_MAX_REFS = 64;
const SCHEMA_MAX_KEYS = 512;

const NETWORK_REF_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const LOCAL_REF_PREFIXES = ['#'];

function isNetworkRef(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (LOCAL_REF_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return false;
  return NETWORK_REF_SCHEME.test(trimmed);
}

export function validateMcpInputSchema(schema: unknown): SchemaValidationResult {
  if (schema === null || typeof schema !== 'object') {
    return { ok: false, reason: 'schema is not an object' };
  }
  let totalRefs = 0;
  let totalKeys = 0;
  function walk(node: unknown, depth: number): SchemaValidationResult {
    if (node === null || typeof node !== 'object') return { ok: true };
    if (depth > SCHEMA_MAX_DEPTH) {
      return { ok: false, reason: `depth exceeded ${SCHEMA_MAX_DEPTH}` };
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const r = walk(item, depth + 1);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      totalKeys += 1;
      if (totalKeys > SCHEMA_MAX_KEYS) {
        return { ok: false, reason: `key count exceeded ${SCHEMA_MAX_KEYS}` };
      }
      if (key === '$ref') {
        totalRefs += 1;
        if (totalRefs > SCHEMA_MAX_REFS) {
          return { ok: false, reason: `$ref count exceeded ${SCHEMA_MAX_REFS}` };
        }
        if (isNetworkRef(obj[key])) {
          return { ok: false, reason: 'network $ref is not resolvable and must not be fetched' };
        }
      }
      const r = walk(obj[key], depth + 1);
      if (!r.ok) return r;
    }
    return { ok: true };
  }
  return walk(schema, 0);
}

function toSafeServerName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9_]{1,128}/g, '_')
    .replace(/^_{1,128}|_{1,128}$/g, '')
    .slice(0, 48);
}

export interface McpServerHandle {
  serverName: string;
  safeServerName: string;
  catalog: McpServerCatalog;
  client: Client;
  protocolEra: 'modern' | 'legacy';
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
  const client = new Client(
    { name: CLIENT_NAME, version: CLIENT_VERSION },
    { versionNegotiation: VERSION_NEGOTIATION },
  );

  const timeoutMs = config.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS;
  await withTimeout(client.connect(transport), timeoutMs, 'mcp.connect');

  const protocolEra: 'modern' | 'legacy' = client.getDiscoverResult() ? 'modern' : 'legacy';

  let listed: Awaited<ReturnType<Client['listTools']>>;
  try {
    listed = await client.listTools();
  } catch (err) {
    await client.close().catch(() => undefined);
    throw err;
  }
  const tools: McpCatalogTool[] = [];
  for (const t of listed.tools ?? []) {
    if (!isAcceptableMcpToolName(t.name)) {
      console.warn('[mcp] rejecting tool with non-canonical name', {
        serverName,
        toolName: t.name,
      });
      continue;
    }
    const rawSchema = (t.inputSchema as Record<string, unknown> | undefined) ?? {
      type: 'object',
      properties: {},
    };
    const schemaResult = validateMcpInputSchema(rawSchema);
    if (!schemaResult.ok) {
      console.warn('[mcp] rejecting tool whose inputSchema failed validation', {
        serverName,
        toolName: t.name,
        reason: schemaResult.reason,
      });
      continue;
    }
    tools.push({
      serverName,
      safeServerName,
      toolName: t.name,
      ...(t.title ? { title: t.title } : {}),
      ...(t.description ? { description: t.description } : {}),
      inputSchema: rawSchema,
      fallbackDescription: `Tool ${t.name} on MCP server ${serverName}`,
    });
  }

  const serverCatalog: McpServerCatalog = { serverName, safeServerName, tools };

  return {
    serverName,
    safeServerName,
    catalog: serverCatalog,
    client,
    protocolEra,
    async callTool(name: string, args: Record<string, unknown>): Promise<McpCallToolResult> {
      const res = await client.callTool({ name, arguments: args });

      if (isInputRequiredResult(res)) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text:
                `Tool ${name} on MCP server ${serverName} paused for additional input ` +
                `(MCP input_required). This client cannot answer that request, so the ` +
                `call did not complete.`,
            },
          ],
        };
      }

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
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[mcp] failed to connect to server "${serverName}": ${message}`);
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
