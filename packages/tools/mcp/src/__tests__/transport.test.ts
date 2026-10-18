import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSSETransport, mockStreamableTransport } = vi.hoisted(() => ({
  mockSSETransport: vi.fn(),
  mockStreamableTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/client', () => ({
  SSEClientTransport: mockSSETransport,
  StreamableHTTPClientTransport: mockStreamableTransport,
}));

import { MCPTransportError, resolveMcpTransport, type McpFetch } from '../transport';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('http transport egress guard', () => {
  const SERVER_URL = 'https://mcp.example.com/mcp';
  const INTERNAL_URL = 'http://169.254.169.254/latest/meta-data/';
  const INTERNAL_HTTPS_URL = 'https://169.254.169.254/latest/meta-data/';

  function redirectTo(location: string, status = 302): Response {
    return { status, headers: new Headers({ location }), body: null } as unknown as Response;
  }

  function okResponse(): Response {
    return { status: 200, headers: new Headers(), body: null } as unknown as Response;
  }

  function guardedFetchFrom(mock: typeof mockStreamableTransport): McpFetch {
    const opts = mock.mock.calls[0][1] as { fetch?: McpFetch };
    if (!opts?.fetch) {
      throw new Error('transport was constructed without an egress-guarded fetch');
    }
    return opts.fetch;
  }

  it('never reaches an internal host a redirect points at', async () => {
    const baseFetch = vi.fn(async (input: string | URL) => {
      const href = typeof input === 'string' ? input : input.toString();
      if (href === SERVER_URL) return redirectTo(INTERNAL_URL);
      return okResponse();
    });

    resolveMcpTransport({ url: SERVER_URL }, { fetch: baseFetch });
    const guarded = guardedFetchFrom(mockStreamableTransport);

    await expect(guarded(SERVER_URL)).rejects.toBeInstanceOf(MCPTransportError);
    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(baseFetch.mock.calls[0][0]).toBe(SERVER_URL);
  });

  it('requests every hop with manual redirect handling', async () => {
    const baseFetch = vi.fn(async () => okResponse());
    resolveMcpTransport({ url: SERVER_URL }, { fetch: baseFetch });
    const guarded = guardedFetchFrom(mockStreamableTransport);

    await guarded(SERVER_URL, { method: 'POST' });

    expect(baseFetch).toHaveBeenCalledWith(
      SERVER_URL,
      expect.objectContaining({ method: 'POST', redirect: 'manual' }),
    );
  });

  it('re-validates the injected egress policy on every hop', async () => {
    const hops: string[] = [];
    const assertAllowedUrl = vi.fn(async (url: string) => {
      hops.push(url);
      if (new URL(url).hostname === '169.254.169.254') {
        throw new MCPTransportError('blocked by egress policy');
      }
    });
    const baseFetch = vi.fn(async (input: string | URL) => {
      const href = typeof input === 'string' ? input : input.toString();
      if (href === SERVER_URL) return redirectTo('https://redirector.example.com/next');
      if (href === 'https://redirector.example.com/next') return redirectTo(INTERNAL_HTTPS_URL);
      return okResponse();
    });

    resolveMcpTransport({ url: SERVER_URL }, { fetch: baseFetch, assertAllowedUrl });
    const guarded = guardedFetchFrom(mockStreamableTransport);

    await expect(guarded(SERVER_URL)).rejects.toThrow('blocked by egress policy');
    expect(hops).toEqual([SERVER_URL, 'https://redirector.example.com/next', INTERNAL_HTTPS_URL]);
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });

  it('drops the bearer credential when a policy-approved redirect leaves the origin', async () => {
    const seen: Array<Headers | undefined> = [];
    const baseFetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      seen.push(init?.headers ? new Headers(init.headers) : undefined);
      const href = typeof input === 'string' ? input : input.toString();
      if (href === SERVER_URL) return redirectTo('https://cdn.example.net/mcp');
      return okResponse();
    });

    resolveMcpTransport(
      { url: SERVER_URL },
      { fetch: baseFetch, assertAllowedUrl: async () => undefined },
    );
    const guarded = guardedFetchFrom(mockStreamableTransport);

    await guarded(SERVER_URL, {
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
    });

    expect(seen[0]?.get('authorization')).toBe('Bearer secret');
    expect(seen[1]?.get('authorization')).toBeNull();
    expect(seen[1]?.get('content-type')).toBe('application/json');
  });

  it('refuses a redirect that downgrades https to http even when the policy allows the host', async () => {
    const baseFetch = vi.fn(async (input: string | URL) => {
      const href = typeof input === 'string' ? input : input.toString();
      if (href === SERVER_URL) return redirectTo('http://mcp.example.com/mcp');
      return okResponse();
    });

    resolveMcpTransport(
      { url: SERVER_URL },
      { fetch: baseFetch, assertAllowedUrl: async () => undefined },
    );
    const guarded = guardedFetchFrom(mockStreamableTransport);

    await expect(guarded(SERVER_URL)).rejects.toThrow('refusing the downgrade');
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it('follows a same-origin redirect', async () => {
    const baseFetch = vi.fn(async (input: string | URL) => {
      const href = typeof input === 'string' ? input : input.toString();
      if (href === SERVER_URL) return redirectTo('/mcp/v2');
      return okResponse();
    });

    resolveMcpTransport({ url: SERVER_URL }, { fetch: baseFetch });
    const guarded = guardedFetchFrom(mockStreamableTransport);

    const response = await guarded(SERVER_URL);

    expect(response.status).toBe(200);
    expect(baseFetch.mock.calls[1][0]).toBe('https://mcp.example.com/mcp/v2');
  });

  it('stops after the redirect budget is spent', async () => {
    const baseFetch = vi.fn(async (input: string | URL) => {
      const href = typeof input === 'string' ? input : input.toString();
      return redirectTo(`${href}/again`);
    });

    resolveMcpTransport({ url: SERVER_URL }, { fetch: baseFetch, maxRedirects: 2 });
    const guarded = guardedFetchFrom(mockStreamableTransport);

    await expect(guarded(SERVER_URL)).rejects.toThrow('exceeded 2 redirects');
    expect(baseFetch).toHaveBeenCalledTimes(3);
  });

  it('guards the sse transport too', async () => {
    const baseFetch = vi.fn(async () => redirectTo(INTERNAL_URL));
    resolveMcpTransport({ url: SERVER_URL, transport: 'sse' }, { fetch: baseFetch });
    const guarded = guardedFetchFrom(mockSSETransport);

    await expect(guarded(SERVER_URL)).rejects.toBeInstanceOf(MCPTransportError);
  });
});
