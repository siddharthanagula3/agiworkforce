import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['CSRF_SECRET'] ||= 'a'.repeat(40);
process.env['NEXT_PUBLIC_APP_URL'] ||= 'https://app.agiworkforce.test';

const { mockRateLimit, mockGetE2BSession, mockBuildAdapter } = vi.hoisted(() => ({
  mockRateLimit: vi.fn(),
  mockGetE2BSession: vi.fn(),
  mockBuildAdapter: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/e2b/session-store', () => ({
  MANAGED_CLOUD_E2B_TENANT_ID: 'managed-cloud',
  getE2BSession: mockGetE2BSession,
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: mockBuildAdapter,
}));

import { DELETE, GET, POST } from './route';
import { mintProviderProxyToken } from '@/lib/e2b/provider-proxy-token';

const SESSION_ID = 'sess-1';

function request(
  init: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    path?: string[];
  } = {},
): { req: NextRequest; context: { params: Promise<{ sessionId: string; path: string[] }> } } {
  const path = init.path ?? ['v1', 'messages'];
  const req = new NextRequest(
    `http://localhost:3000/api/code/sessions/${SESSION_ID}/provider-proxy/${path.join('/')}`,
    {
      method: init.method ?? 'POST',
      body: init.body,
      headers: init.headers,
    },
  );
  return { req, context: { params: Promise.resolve({ sessionId: SESSION_ID, path }) } };
}

function token(overrides: { sessionId?: string; userId?: string; providerId?: string } = {}) {
  return mintProviderProxyToken(
    {
      sessionId: overrides.sessionId ?? SESSION_ID,
      userId: overrides.userId ?? 'user-1',
      providerId: overrides.providerId ?? 'anthropic',
    },
    60_000,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
  mockGetE2BSession.mockResolvedValue({ sandboxId: 'sbx-1', contexts: {} });
  mockBuildAdapter.mockImplementation((providerId: string) => {
    if (providerId === 'anthropic') {
      return { config: { apiKey: 'sk-managed-anthropic' } };
    }
    throw new Error(`no managed key for ${providerId}`);
  });
});

describe('provider-proxy route', () => {
  it('rejects a request with no session credential', async () => {
    const { req, context } = request({ headers: {} });
    const response = await POST(req, context);
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('provider_proxy_token_missing');
  });

  it('rejects a token whose sessionId does not match the URL', async () => {
    const { req, context } = request({ headers: { 'x-api-key': token({ sessionId: 'other' }) } });
    const response = await POST(req, context);
    expect(response.status).toBe(401);
  });

  it('rejects a token once the session has ended', async () => {
    mockGetE2BSession.mockResolvedValue(null);
    const { req, context } = request({ headers: { 'x-api-key': token() } });
    const response = await POST(req, context);
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('provider_proxy_session_ended');
  });

  it('injects the managed key server-side and forwards to the allowlisted upstream, streaming the response back', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { req, context } = request({
      headers: { 'x-api-key': token(), 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude' }),
    });
    const response = await POST(req, context);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Headers;
    expect(headers.get('x-api-key')).toBe('sk-managed-anthropic');
    expect(headers.get('authorization')).toBeNull();

    vi.unstubAllGlobals();
  });

  it('never forwards the caller-presented session token upstream', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response('ok', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionToken = token();
    const { req, context } = request({ headers: { 'x-api-key': sessionToken } });
    await POST(req, context);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('x-api-key')).not.toBe(sessionToken);

    vi.unstubAllGlobals();
  });

  it('refuses a provider the proxy does not cover', async () => {
    const { req, context } = request({
      headers: { 'x-api-key': token({ providerId: 'openai' }) },
    });
    const response = await POST(req, context);
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('provider_proxy_unavailable');
  });

  it('502s when the provider has no managed key configured', async () => {
    mockBuildAdapter.mockImplementation(() => {
      throw new Error('not configured');
    });
    const { req, context } = request({ headers: { 'x-api-key': token() } });
    const response = await POST(req, context);
    expect(response.status).toBe(502);
  });

  it('rate limits per session', async () => {
    mockRateLimit.mockResolvedValue(
      new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 }),
    );
    const { req, context } = request({ headers: { 'x-api-key': token() } });
    const response = await GET(req, context);
    expect(response.status).toBe(429);
  });

  it('does not forward a request body on a GET', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response('[]', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { req, context } = request({ method: 'GET', headers: { 'x-api-key': token() } });
    await GET(req, context);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it('forwards DELETE too', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { req, context } = request({ method: 'DELETE', headers: { 'x-api-key': token() } });
    const response = await DELETE(req, context);
    expect(response.status).toBe(204);

    vi.unstubAllGlobals();
  });
});
