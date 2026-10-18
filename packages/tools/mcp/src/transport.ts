import {
  SSEClientTransport,
  StreamableHTTPClientTransport,
  type Transport,
} from '@modelcontextprotocol/client';

import type { McpServerConfig } from './types';

export class MCPTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MCPTransportError';
  }
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

export type McpFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface McpEgressPolicy {
  assertAllowedUrl?: (url: string) => void | Promise<void>;
  fetch?: McpFetch;
  maxRedirects?: number;
}

const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function assertFollowableUrl(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new MCPTransportError(
      `MCP HTTP transport refused scheme "${url.protocol}", only http/https are allowed.`,
    );
  }
  if (url.username !== '' || url.password !== '') {
    throw new MCPTransportError('MCP HTTP transport refused a URL with embedded credentials.');
  }
}

const CREDENTIAL_HEADERS = ['authorization', 'proxy-authorization', 'cookie'];

function withoutCredentialHeaders(init: RequestInit | undefined): RequestInit | undefined {
  if (!init?.headers) return init;
  const headers = new Headers(init.headers);
  for (const name of CREDENTIAL_HEADERS) headers.delete(name);
  return { ...init, headers };
}

export function createEgressGuardedFetch(policy: McpEgressPolicy = {}): McpFetch {
  const baseFetch: McpFetch = policy.fetch ?? ((input, init) => fetch(input, init));
  const maxRedirects = policy.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const assertAllowedUrl = policy.assertAllowedUrl;

  return async (input, init) => {
    let current = new URL(typeof input === 'string' ? input : input.toString());
    const pinnedOrigin = current.origin;
    let hopInit = init;

    for (let hop = 0; ; hop++) {
      assertFollowableUrl(current);
      if (assertAllowedUrl) await assertAllowedUrl(current.href);

      const response = await baseFetch(current.href, { ...hopInit, redirect: 'manual' });
      if (!REDIRECT_STATUSES.has(response.status)) return response;

      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location) {
        throw new MCPTransportError(
          `MCP server answered HTTP ${response.status} without a Location header.`,
        );
      }
      if (hop >= maxRedirects) {
        throw new MCPTransportError(`MCP request exceeded ${maxRedirects} redirects.`);
      }

      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new MCPTransportError(`MCP server redirected to a malformed URL: ${location}`);
      }
      if (current.protocol === 'https:' && next.protocol !== 'https:') {
        throw new MCPTransportError(
          `MCP server redirected from https to ${next.protocol}; refusing the downgrade.`,
        );
      }
      if (next.origin !== pinnedOrigin) {
        if (!assertAllowedUrl) {
          throw new MCPTransportError(
            `MCP server redirected to ${next.origin}, which no egress policy was supplied to re-validate.`,
          );
        }
        hopInit = withoutCredentialHeaders(hopInit);
      }
      current = next;
    }
  };
}

export function resolveMcpTransport(
  config: McpServerConfig,
  egressPolicy: McpEgressPolicy = {},
): Transport {
  if (!config.url) {
    throw new Error('MCP server config must provide a `url`.');
  }
  const url = new URL(config.url);
  const headers = coerceHeaders(config.headers);
  const requestInit: RequestInit | undefined = headers ? { headers } : undefined;
  const authProvider = config.authProvider;

  const guardedFetch = createEgressGuardedFetch(egressPolicy);

  if (config.transport === 'sse') {
    return new SSEClientTransport(url, {
      fetch: guardedFetch,
      ...(requestInit ? { requestInit } : {}),
      ...(authProvider ? { authProvider } : {}),
    });
  }
  return new StreamableHTTPClientTransport(url, {
    fetch: guardedFetch,
    ...(requestInit ? { requestInit } : {}),
    ...(authProvider ? { authProvider } : {}),
    ...(authProvider ? { onInsufficientScope: 'reauthorize' as const } : {}),
  });
}
