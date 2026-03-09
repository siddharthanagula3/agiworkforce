/**
 * @file MCP Server Configuration
 *
 * Defines which MCP servers are available for web/mobile clients via the API gateway proxy.
 * Servers are loaded from a JSON config file at startup, with a fallback to an empty list.
 *
 * Config file location (checked in order):
 *   1. MCP_CONFIG_PATH environment variable
 *   2. ./mcp-servers.json (relative to process cwd)
 *
 * Each server entry specifies a transport (stdio or http) and connection details.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';
import { logger } from '../lib/logger';

// =============================================================================
// SCHEMAS
// =============================================================================

const stdioTransportSchema = z.object({
  type: z.literal('stdio'),
  command: z.string().min(1),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string(), z.string()).optional().default({}),
});

const httpTransportSchema = z.object({
  type: z.literal('http'),
  url: z.url(),
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

// =============================================================================
// TYPES
// =============================================================================

export type StdioTransport = z.infer<typeof stdioTransportSchema>;
export type HttpTransport = z.infer<typeof httpTransportSchema>;
export type McpTransport = z.infer<typeof transportSchema>;
export type McpServerEntry = z.infer<typeof mcpServerEntrySchema>;

// =============================================================================
// CONFIG LOADING
// =============================================================================

let cachedConfig: McpServerEntry[] | null = null;

/**
 * Load MCP server configuration from the config file.
 * Results are cached after the first load.
 */
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

    // Filter to enabled servers only
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

/**
 * Get a specific server entry by ID.
 */
export function getServerEntry(serverId: string): McpServerEntry | undefined {
  const servers = loadMcpConfig();
  return servers.find((s) => s.id === serverId);
}

/**
 * Force-reload the configuration (useful for testing or hot-reload).
 */
export function reloadMcpConfig(): McpServerEntry[] {
  cachedConfig = null;
  return loadMcpConfig();
}

// =============================================================================
// INTERNALS
// =============================================================================

function resolveConfigPath(): string | null {
  // 1. Explicit env var
  const envPath = process.env['MCP_CONFIG_PATH'];
  if (envPath) {
    const resolved = resolve(envPath);
    if (existsSync(resolved)) return resolved;
    logger.warn({ path: resolved }, 'MCP_CONFIG_PATH set but file does not exist');
    return null;
  }

  // 2. Default location relative to cwd
  const defaultPath = resolve(process.cwd(), 'mcp-servers.json');
  if (existsSync(defaultPath)) return defaultPath;

  return null;
}
