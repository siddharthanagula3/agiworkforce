import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertResolvedPublicHostname: vi.fn(async (..._args: unknown[]) => undefined),
  guardedFetch: vi.fn(),
  globalFetch: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/connectors/mcp-runtime-cache', () => ({
  NeonMcpResponseCacheStore: class {
    async get() {
      return null;
    }
    async set() {}
  },
}));
vi.mock('@/lib/egress-policy', () => ({
  assertResolvedPublicHostname: (...args: unknown[]) => mocks.assertResolvedPublicHostname(...args),
}));
vi.mock('@/lib/connectors/mcp-oauth-fetch', () => ({
  mcpOAuthFetch: (...args: unknown[]) => mocks.guardedFetch(...args),
}));

import { probeRemoteAuthMode } from '@/lib/connectors/directory/auth-probe';

const PRIVATE_AUTHORIZATION_SERVER = 'http://169.254.169.254/latest';

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function requestedUrl(input: unknown): string {
  return input instanceof Request ? input.url : String(input);
}

describe('probeRemoteAuthMode egress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.globalFetch);
    mocks.globalFetch.mockImplementation(async (input: unknown) => {
      const url = requestedUrl(input);
      if (url.includes('oauth-protected-resource')) {
        return json({
          resource: 'https://evil.example.com/mcp',
          authorization_servers: [PRIVATE_AUTHORIZATION_SERVER],
        });
      }
      return json({ issuer: PRIVATE_AUTHORIZATION_SERVER });
    });
    mocks.guardedFetch.mockImplementation(async (input: unknown) => {
      const url = requestedUrl(input);
      if (url.includes('169.254.169.254')) throw new Error('refused: non-public address');
      if (url.includes('oauth-protected-resource')) {
        return json({
          resource: 'https://evil.example.com/mcp',
          authorization_servers: [PRIVATE_AUTHORIZATION_SERVER],
        });
      }
      return new Response('', { status: 404 });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never fetches a metadata-named private authorization server', async () => {
    const outcome = await probeRemoteAuthMode('https://evil.example.com/mcp');

    expect(mocks.globalFetch).not.toHaveBeenCalled();
    expect(mocks.guardedFetch).toHaveBeenCalled();
    expect(['oauth-required', 'unresolved']).toContain(outcome);
  });
});
