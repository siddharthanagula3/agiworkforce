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

// AUDIT-FIX: H-5 — stdio transport spawn-guard error.
export class MCPTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MCPTransportError';
  }
}

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

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function resolveMcpTransport(config: McpServerConfig): Transport {
  if (config.command) {
    // AUDIT-FIX: H-5 + FIX (audit 2026-05-20, §2): never spawn an arbitrary
    // local command without a signed manifest. The userConsent fallback is
    // ONLY honored when developerMode is on AND the consent matches BOTH
    // the command and the args exactly (argv-level pin, not just executable
    // name). The string-equality consent bypass is closed.
    const consent = config.userConsent;
    const expectedArgs = config.args ?? [];
    const consentMatchesCommand = !!consent && consent.for_command === config.command;
    const consentMatchesArgs =
      !!consent &&
      (consent.for_args !== undefined
        ? arraysEqual(consent.for_args, expectedArgs)
        : // No for_args on the consent record means "command only" — that's
          // the legacy string-equality consent shape; refuse it.
          false);
    const consentValid = !!config.developerMode && consentMatchesCommand && consentMatchesArgs;
    if (!config.signedManifest && !consentValid) {
      throw new MCPTransportError(
        'Stdio transport requires a signed manifest. ' +
          'Legacy userConsent is honored only when developerMode is enabled AND ' +
          'the consent record pins both `for_command` and `for_args` exactly.',
      );
    }
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
