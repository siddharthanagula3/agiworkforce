
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';
import { logger } from '../lib/logger';

const ALLOWED_MCP_COMMANDS = new Set([
  'npx',
  'node',
  'python',
  'python3',
  'uvx',
  'deno',
  'bun',
  'mcp-server-fetch',
  'mcp-server-filesystem',
  'mcp-server-git',
  'mcp-server-github',
  'mcp-server-postgres',
  'mcp-server-sqlite',
  'mcp-server-memory',
  'mcp-server-brave-search',
  'mcp-server-puppeteer',
  'mcp-server-sequential-thinking',
]);

function validateStdioCommand(command: string): boolean {
  if (command.includes('/') || command.includes('\\')) {
    return false;
  }
  if (/[;&|`$(){}]/.test(command)) {
    return false;
  }
  return ALLOWED_MCP_COMMANDS.has(command);
}

const stdioTransportSchema = z.object({
  type: z.literal('stdio'),
  command: z
    .string()
    .min(1)
    .refine((cmd) => validateStdioCommand(cmd), {
      message: 'Command not in MCP server allowlist or contains disallowed characters',
    }),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string(), z.string()).optional().default({}),
});

const httpTransportSchema = z.object({
  type: z.literal('http'),
  url: z.url().refine(
    (urlStr) => {
      try {
        const hostname = new URL(urlStr).hostname;
        return !/(^localhost$|^127\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\.|^169\.254\.|^0\.0\.0\.0$|^::1$|^::ffff:127\.|^\[::1\]$)/i.test(
          hostname,
        );
      } catch {
        return false;
      }
    },
    { message: 'Private/internal URLs are not allowed for MCP HTTP transport' },
  ),
  headers: z.record(z.string(), z.string()).optional().default({}),
});

const transportSchema = z.discriminatedUnion('type', [stdioTransportSchema, httpTransportSchema]);

const mcpServerEntrySchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().default(''),
  transport: transportSchema,
  enabled: z.boolean().optional().default(true),
});

const mcpConfigFileSchema = z.object({
  servers: z.array(mcpServerEntrySchema),
});

export type StdioTransport = z.infer<typeof stdioTransportSchema>;
export type HttpTransport = z.infer<typeof httpTransportSchema>;
export type McpTransport = z.infer<typeof transportSchema>;
export type McpServerEntry = z.infer<typeof mcpServerEntrySchema>;

let cachedConfig: McpServerEntry[] | null = null;

export function loadMcpConfig(): McpServerEntry[] {
  if (cachedConfig !== null) {
    return cachedConfig;
  }

  const configPath = resolveConfigPath();

  if (!configPath) {
    logger.info({}, 'No MCP config file found — no servers will be available');
    cachedConfig = [];
    return cachedConfig;
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const validated = mcpConfigFileSchema.parse(parsed);

    cachedConfig = validated.servers.filter((s) => s.enabled);
    logger.info(
      { count: cachedConfig.length, path: configPath },
      'Loaded MCP server configuration',
    );
    return cachedConfig;
  } catch (err) {
    logger.error({ error: err, path: configPath }, 'Failed to load MCP config file');
    cachedConfig = [];
    return cachedConfig;
  }
}

export function getServerEntry(serverId: string): McpServerEntry | undefined {
  const servers = loadMcpConfig();
  return servers.find((s) => s.id === serverId);
}

export function reloadMcpConfig(): McpServerEntry[] {
  cachedConfig = null;
  return loadMcpConfig();
}

function resolveConfigPath(): string | null {
  const envPath = process.env['MCP_CONFIG_PATH'];
  if (envPath) {
    const resolved = resolve(envPath);
    if (existsSync(resolved)) return resolved;
    logger.warn({ path: resolved }, 'MCP_CONFIG_PATH set but file does not exist');
    return null;
  }

  const defaultPath = resolve(process.cwd(), 'mcp-servers.json');
  if (existsSync(defaultPath)) return defaultPath;

  return null;
}
