/**
 * MCP transport resolver.
 *
 * Maps an `McpServerConfig` to one of the three SDK-provided transport
 * classes. Pure factory — no IO until the caller calls `client.connect()`.
 *
 * SDK v2 (2026-07-28)
 * -------------------
 * The monolithic `@modelcontextprotocol/sdk` package was split in v2: client
 * code now lives in `@modelcontextprotocol/client`, with the process-spawning
 * stdio transport behind the `/stdio` subpath so browser and worker bundles
 * never pull `cross-spawn` in. The three transport classes are the same
 * concepts, so this file's shape is unchanged — only the import sources and
 * the added `authProvider` seam are new.
 *
 * The `authProvider` seam is what lets a caller hand us an
 * `OAuthClientProvider`; the SDK then performs RFC 9728 / RFC 8414 discovery
 * and the full authorization-code + PKCE dance on 401, instead of the caller
 * having to pre-mint a bearer token and pass it as a header.
 */

import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import {
  SSEClientTransport,
  StreamableHTTPClientTransport,
  type Transport,
} from '@modelcontextprotocol/client';

import type { McpServerConfig } from './types';

// AUDIT-FIX: H-5 — stdio transport spawn-guard error.
export class MCPTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MCPTransportError';
  }
}

const BLOCKED_ENV_KEYS = new Set([
  'PATH',
  'HOME',
  'SHELL',
  'USER',
  'LOGNAME',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'LD_AUDIT',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'DYLD_FRAMEWORK_PATH',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_EXTRA_CA_CERTS',
  'NODE_DEBUG',
  'ELECTRON_RUN_AS_NODE',
  'PYTHONPATH',
  'PYTHONSTARTUP',
  'PYTHONHOME',
  'RUBYOPT',
  'RUBYLIB',
  'PERL5OPT',
  'PERL5LIB',
  'PERLLIB',
  'JAVA_TOOL_OPTIONS',
  '_JAVA_OPTIONS',
  'BASH_ENV',
  'ENV',
  'CDPATH',
  'GLOBIGNORE',
  'PROMPT_COMMAND',
  'PS1',
  'PS2',
  'PS4',
  'IFS',
  'ZDOTDIR',
  'RUST_LOG',
]);

function isBlockedEnvKey(key: string): boolean {
  if (BLOCKED_ENV_KEYS.has(key.toUpperCase())) return true;
  if (key.toUpperCase().startsWith('BASH_FUNC_')) return true;
  return false;
}

function coerceEnv(
  env: Record<string, string | number | boolean> | undefined,
): Record<string, string> | undefined {
  if (!env) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (isBlockedEnvKey(key)) {
      console.warn(`[MCP transport] Blocked dangerous env var '${key}' from MCP server config.`);
      continue;
    }
    out[key] = String(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
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
  // When the caller supplies an OAuth provider the SDK drives discovery and
  // the authorization-code exchange itself on 401. A caller may still pass a
  // pre-minted bearer token via `headers` instead; the two are independent.
  const authProvider = config.authProvider;

  if (config.transport === 'sse') {
    return new SSEClientTransport(url, {
      ...(requestInit ? { requestInit } : {}),
      ...(authProvider ? { authProvider } : {}),
    });
  }
  // Default: streamable-http
  return new StreamableHTTPClientTransport(url, {
    ...(requestInit ? { requestInit } : {}),
    ...(authProvider ? { authProvider } : {}),
    // A 403 carrying `WWW-Authenticate: ... scope="..."` means the token we
    // hold is valid but too narrow. Re-running authorization for the wider
    // scope is the spec's step-up path; the alternative ('throw') would
    // surface an opaque 403 the user cannot act on.
    ...(authProvider ? { onInsufficientScope: 'reauthorize' as const } : {}),
  });
}
