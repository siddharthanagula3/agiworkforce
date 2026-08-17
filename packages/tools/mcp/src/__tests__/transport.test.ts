import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStdioTransport, mockSSETransport, mockStreamableTransport } = vi.hoisted(() => ({
  mockStdioTransport: vi.fn(),
  mockSSETransport: vi.fn(),
  mockStreamableTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/client/stdio', () => ({
  StdioClientTransport: mockStdioTransport,
}));
vi.mock('@modelcontextprotocol/client', () => ({
  SSEClientTransport: mockSSETransport,
  StreamableHTTPClientTransport: mockStreamableTransport,
}));

import { MCPTransportError, resolveMcpTransport, type McpFetch } from '../transport';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('env var filtering', () => {
  const baseConfig = {
    command: 'node',
    args: ['server.js'],
    signedManifest: true,
  };

  it('passes safe env vars through', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { MY_API_KEY: 'sk-123', CUSTOM_VAR: 'value' },
    });
    expect(mockStdioTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        env: { MY_API_KEY: 'sk-123', CUSTOM_VAR: 'value' },
      }),
    );
  });

  it('filters LD_PRELOAD', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { LD_PRELOAD: '/evil.so', SAFE_VAR: 'ok' },
    });
    const passedEnv = mockStdioTransport.mock.calls[0][0].env;
    expect(passedEnv).toEqual({ SAFE_VAR: 'ok' });
  });

  it('filters DYLD_INSERT_LIBRARIES', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { DYLD_INSERT_LIBRARIES: '/evil.dylib', SAFE: '1' },
    });
    const passedEnv = mockStdioTransport.mock.calls[0][0].env;
    expect(passedEnv).toEqual({ SAFE: '1' });
  });

  it('filters NODE_OPTIONS', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { NODE_OPTIONS: '--require /tmp/evil.js', OK: 'yes' },
    });
    const passedEnv = mockStdioTransport.mock.calls[0][0].env;
    expect(passedEnv).toEqual({ OK: 'yes' });
  });

  it('filters BASH_ENV and IFS', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { BASH_ENV: '/tmp/evil.sh', IFS: '/', GOOD: 'val' },
    });
    const passedEnv = mockStdioTransport.mock.calls[0][0].env;
    expect(passedEnv).toEqual({ GOOD: 'val' });
  });

  it('filters PATH and HOME', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { PATH: '/evil/bin', HOME: '/tmp', API_KEY: 'abc' },
    });
    const passedEnv = mockStdioTransport.mock.calls[0][0].env;
    expect(passedEnv).toEqual({ API_KEY: 'abc' });
  });

  it('filters BASH_FUNC_ prefixed vars', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { 'BASH_FUNC_evil%%': '() { evil; }', SAFE: 'ok' },
    });
    const passedEnv = mockStdioTransport.mock.calls[0][0].env;
    expect(passedEnv).toEqual({ SAFE: 'ok' });
  });

  it('case-insensitive blocking', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { ld_preload: '/evil.so', safe: 'ok' },
    });
    const passedEnv = mockStdioTransport.mock.calls[0][0].env;
    expect(passedEnv).toEqual({ safe: 'ok' });
  });

  it('returns undefined env when all keys are blocked', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { LD_PRELOAD: '/evil.so', PATH: '/evil' },
    });
    const passedConfig = mockStdioTransport.mock.calls[0][0];
    expect(passedConfig.env).toBeUndefined();
  });

  it('omits env entirely when not provided', () => {
    resolveMcpTransport(baseConfig);
    const passedConfig = mockStdioTransport.mock.calls[0][0];
    expect('env' in passedConfig).toBe(false);
  });
});

describe('http transport egress guard', () => {
  const SERVER_URL = 'https://mcp.example.com/mcp';
  const INTERNAL_URL = 'http://169.254.169.254/latest/meta-data/';

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
      if (href === 'https://redirector.example.com/next') return redirectTo(INTERNAL_URL);
      return okResponse();
    });

    resolveMcpTransport({ url: SERVER_URL }, { fetch: baseFetch, assertAllowedUrl });
    const guarded = guardedFetchFrom(mockStreamableTransport);

    await expect(guarded(SERVER_URL)).rejects.toThrow('blocked by egress policy');
    expect(hops).toEqual([SERVER_URL, 'https://redirector.example.com/next', INTERNAL_URL]);
    expect(baseFetch).toHaveBeenCalledTimes(2);
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
