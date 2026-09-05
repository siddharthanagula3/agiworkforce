import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['CSRF_SECRET'] ||= 'a'.repeat(40);
process.env['NEXT_PUBLIC_APP_URL'] ||= 'https://app.agiworkforce.test';

const {
  mockRateLimit,
  mockGetE2BSession,
  mockBuildAdapter,
  mockGetSubscription,
  mockEvaluateManagedComputeAccess,
  mockResolveSessionOrganizationId,
  mockRecordSettledProviderCost,
  mockCalculateCost,
  mockReadCachedAccess,
  mockWriteCachedAccess,
  mockInvalidateCachedAccess,
  mockAfter,
} = vi.hoisted(() => ({
  mockRateLimit: vi.fn(),
  mockGetE2BSession: vi.fn(),
  mockBuildAdapter: vi.fn(),
  mockGetSubscription: vi.fn(),
  mockEvaluateManagedComputeAccess: vi.fn(),
  mockResolveSessionOrganizationId: vi.fn(),
  mockRecordSettledProviderCost: vi.fn(),
  mockCalculateCost: vi.fn(),
  mockReadCachedAccess: vi.fn(),
  mockWriteCachedAccess: vi.fn(),
  mockInvalidateCachedAccess: vi.fn(),
  mockAfter: vi.fn((value: unknown) => value),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: mockAfter };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/e2b/session-store', () => ({
  MANAGED_CLOUD_E2B_TENANT_ID: 'managed-cloud',
  getE2BSession: mockGetE2BSession,
  managedCloudCodeSessionScope: vi.fn(),
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: mockBuildAdapter,
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({}),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mockGetSubscription },
}));
vi.mock('@/lib/services/managed-compute-access', () => ({
  evaluateManagedComputeAccess: mockEvaluateManagedComputeAccess,
}));
vi.mock('@/lib/services/cloud-code-session-service', () => ({
  resolveCloudCodeSessionOwnerOrganizationId: mockResolveSessionOrganizationId,
}));
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  recordSettledProviderCost: mockRecordSettledProviderCost,
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: { calculateCost: mockCalculateCost },
}));
vi.mock('@/lib/e2b/provider-proxy-access-cache', () => ({
  readCachedProviderProxyAccess: mockReadCachedAccess,
  writeCachedProviderProxyAccess: mockWriteCachedAccess,
  invalidateCachedProviderProxyAccess: mockInvalidateCachedAccess,
}));

import { DELETE, GET, POST } from './route';
import { mintProviderProxyToken } from '@/lib/e2b/provider-proxy-token';

const SESSION_ID = 'sess-1';
const USER_ID = 'user-1';
const ALLOWED_DECISION = {
  allowed: true,
  code: 'allowed',
  reason: 'Subscription is entitled to managed compute.',
  organizationId: null,
};

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
      userId: overrides.userId ?? USER_ID,
      providerId: overrides.providerId ?? 'anthropic',
    },
    60_000,
  );
}

/** The promise the route handed to `after()` for the most recent call. */
function lastAfterPromise(): Promise<unknown> {
  const call = mockAfter.mock.calls.at(-1);
  if (!call) throw new Error('after() was never called');
  return call[0] as Promise<unknown>;
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
  mockGetSubscription.mockResolvedValue({ plan_tier: 'pro', status: 'active' });
  mockResolveSessionOrganizationId.mockResolvedValue(null);
  mockEvaluateManagedComputeAccess.mockResolvedValue({ ...ALLOWED_DECISION });
  mockReadCachedAccess.mockResolvedValue(null);
  mockWriteCachedAccess.mockResolvedValue(undefined);
  mockInvalidateCachedAccess.mockResolvedValue(undefined);
  mockRecordSettledProviderCost.mockResolvedValue(undefined);
  mockCalculateCost.mockReturnValue(7);
  mockAfter.mockImplementation((value: unknown) => value);
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
      headers: { 'x-api-key': token({ providerId: 'google' }) },
    });
    const response = await POST(req, context);
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('provider_proxy_unavailable');
  });

  it('forwards an openai-proxied call as a Bearer-authenticated request, with no doubled /v1', async () => {
    mockBuildAdapter.mockImplementation((providerId: string) => {
      if (providerId === 'openai') return { config: { apiKey: 'sk-managed-openai' } };
      throw new Error(`no managed key for ${providerId}`);
    });
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { req, context } = request({
      path: ['responses'],
      headers: {
        authorization: `Bearer ${token({ providerId: 'openai' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'test-openai-model' }),
    });
    const response = await POST(req, context);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const headers = init.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer sk-managed-openai');
    expect(headers.get('x-api-key')).toBeNull();

    vi.unstubAllGlobals();
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

  describe('managed-compute gate', () => {
    it('refuses a proxied call the gate denies, in the provider error shape, without forwarding upstream', async () => {
      mockEvaluateManagedComputeAccess.mockResolvedValue({
        allowed: false,
        code: 'billing_read_only',
        reason:
          'Your workspace is read-only: enterprise billing collection is past the read-only threshold.',
        organizationId: 'org-1',
      });
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({ headers: { 'x-api-key': token() } });
      const response = await POST(req, context);

      expect(response.status).toBe(403);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('billing_read_only');
      expect(body.error.message).toContain('read-only');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockInvalidateCachedAccess).toHaveBeenCalledWith(SESSION_ID);
      expect(mockWriteCachedAccess).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('skips the subscription and gate database reads when a cached allow decision exists', async () => {
      mockReadCachedAccess.mockResolvedValue({ ...ALLOWED_DECISION });
      const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({ headers: { 'x-api-key': token() } });
      const response = await POST(req, context);

      expect(response.status).toBe(200);
      expect(mockEvaluateManagedComputeAccess).not.toHaveBeenCalled();
      expect(mockGetSubscription).not.toHaveBeenCalled();
      expect(mockResolveSessionOrganizationId).not.toHaveBeenCalled();
      expect(mockWriteCachedAccess).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it('caches a fresh allow decision after the first proxied call', async () => {
      const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({ headers: { 'x-api-key': token() } });
      await POST(req, context);

      expect(mockEvaluateManagedComputeAccess).toHaveBeenCalledTimes(1);
      expect(mockWriteCachedAccess).toHaveBeenCalledWith(SESSION_ID, ALLOWED_DECISION);

      vi.unstubAllGlobals();
    });
  });

  describe('provider spend settlement', () => {
    it('records settled provider cost for a non-streaming JSON response', async () => {
      mockCalculateCost.mockReturnValue(12);
      const fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: 'test-anthropic-model',
              usage: {
                input_tokens: 100,
                output_tokens: 40,
                cache_read_input_tokens: 5,
                cache_creation_input_tokens: 2,
                cache_creation: { ephemeral_1h_input_tokens: 1 },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({
        headers: { 'x-api-key': token(), 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'test-anthropic-model' }),
      });
      const response = await POST(req, context);
      expect(response.status).toBe(200);
      await response.text();
      await lastAfterPromise();

      expect(mockCalculateCost).toHaveBeenCalledWith(
        'anthropic',
        'test-anthropic-model',
        expect.objectContaining({
          promptTokens: 100,
          completionTokens: 40,
          totalTokens: 140,
          cacheReadInputTokens: 5,
          cacheCreationInputTokens: 2,
          cacheCreation1hInputTokens: 1,
        }),
      );
      expect(mockRecordSettledProviderCost).toHaveBeenCalledTimes(1);
      const call = mockRecordSettledProviderCost.mock.calls.at(0)?.[0] as
        | {
            userId: string;
            provider: string;
            model: string;
            actualCostCents: number;
            sourceRef: string;
            taskOutcome: string;
            taskRef: string;
            usage: Record<string, number>;
          }
        | undefined;
      if (!call) throw new Error('recordSettledProviderCost was not called');
      expect(call.userId).toBe(USER_ID);
      expect(call.provider).toBe('anthropic');
      expect(call.model).toBe('test-anthropic-model');
      expect(call.actualCostCents).toBe(12);
      expect(call.taskOutcome).toBe('delivered');
      expect(call.taskRef).toBe(SESSION_ID);
      expect(call.sourceRef.startsWith(`provider_proxy:${SESSION_ID}:`)).toBe(true);
      expect(call.usage).toEqual({
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 5,
        cacheWriteTokens: 2,
        cacheWrite1hTokens: 1,
      });

      vi.unstubAllGlobals();
    });

    it('records settled provider cost for a streaming SSE response, combining message_start and message_delta usage', async () => {
      mockCalculateCost.mockReturnValue(31);
      const sseBody =
        'event: message_start\n' +
        `data: ${JSON.stringify({
          type: 'message_start',
          message: {
            model: 'test-anthropic-model',
            usage: {
              input_tokens: 300,
              cache_read_input_tokens: 20,
              cache_creation_input_tokens: 10,
            },
          },
        })}\n\n` +
        'event: content_block_delta\n' +
        `data: ${JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'hi' },
        })}\n\n` +
        'event: message_delta\n' +
        `data: ${JSON.stringify({
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 77 },
        })}\n\n`;

      const fetchMock = vi.fn(
        async () =>
          new Response(sseBody, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({
        headers: { 'x-api-key': token(), 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'test-anthropic-model', stream: true }),
      });
      const response = await POST(req, context);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe(sseBody);
      await lastAfterPromise();

      expect(mockRecordSettledProviderCost).toHaveBeenCalledTimes(1);
      const call = mockRecordSettledProviderCost.mock.calls.at(0)?.[0] as
        | {
            model: string;
            actualCostCents: number;
            taskOutcome: string;
            usage: Record<string, number>;
          }
        | undefined;
      if (!call) throw new Error('recordSettledProviderCost was not called');
      expect(call.model).toBe('test-anthropic-model');
      expect(call.actualCostCents).toBe(31);
      expect(call.taskOutcome).toBe('delivered');
      expect(call.usage).toEqual({
        inputTokens: 300,
        outputTokens: 77,
        cacheReadTokens: 20,
        cacheWriteTokens: 10,
        cacheWrite1hTokens: 0,
      });

      vi.unstubAllGlobals();
    });

    it('does not record a response with no usage', async () => {
      const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({ headers: { 'x-api-key': token() } });
      const response = await POST(req, context);
      await response.text();
      await lastAfterPromise();

      expect(mockRecordSettledProviderCost).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('does not fail the proxied response when settlement recording fails', async () => {
      mockRecordSettledProviderCost.mockRejectedValue(new Error('ledger unavailable'));
      const fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: 'test-anthropic-model',
              usage: { input_tokens: 5, output_tokens: 5 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({ headers: { 'x-api-key': token() } });
      const response = await POST(req, context);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('test-anthropic-model');

      await expect(lastAfterPromise()).resolves.toBeUndefined();
      expect(mockRecordSettledProviderCost).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });
  });
});
