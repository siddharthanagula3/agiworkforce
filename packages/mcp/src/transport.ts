/**
 * MCP transport resolver.
 *
 * Maps an `McpServerConfig` to one of the three SDK-provided transport
 * classes. Pure factory — no IO until the caller calls `client.connect()`.
 */

import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import type { McpServerConfig } from './types';

function coerceEnv(
  env: Record<string, string | number | boolean> | undefined,
): Record<string, string> | undefined {
  if (!env) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] = String(value);
  }
  return out;
}

function coerceHeaders(
  headers: Record<string, string | number | boolean> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = String(value);
  }
  return out;
}

export function resolveMcpTransport(config: McpServerConfig): Transport {
  if (config.command) {
    const env = coerceEnv(config.env);
    return new StdioClientTransport({
      command: config.command,
      ...(config.args ? { args: config.args } : {}),
      ...(env ? { env } : {}),
      ...(config.cwd ? { cwd: config.cwd } : {}),
    });
  }
  if (!config.url) {
    throw new Error('MCP server config must provide either `command` (stdio) or `url` (HTTP).');
  }
  const url = new URL(config.url);
  const headers = coerceHeaders(config.headers);
  const requestInit: RequestInit | undefined = headers ? { headers } : undefined;

  if (config.transport === 'sse') {
    return new SSEClientTransport(url, {
      ...(requestInit ? { requestInit } : {}),
    });
  }
  // Default: streamable-http
  return new StreamableHTTPClientTransport(url, {
    ...(requestInit ? { requestInit } : {}),
  });
}
