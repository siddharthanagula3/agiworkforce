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
  mockCalculateListCost,
  mockEstimateListCost,
  mockEstimateCost,
  mockReserve,
  mockMarkProviderStarted,
  mockFinalize,
  mockDbQuery,
  mockReadCachedAccess,
  mockWriteCachedAccess,
  mockInvalidateCachedAccess,
  mockAfter,
  MockUnpricedModelError,
  MockManagedUsageRequestError,
} = vi.hoisted(() => ({
  mockRateLimit: vi.fn(),
  mockGetE2BSession: vi.fn(),
  mockBuildAdapter: vi.fn(),
  mockGetSubscription: vi.fn(),
  mockEvaluateManagedComputeAccess: vi.fn(),
  mockResolveSessionOrganizationId: vi.fn(),
  mockRecordSettledProviderCost: vi.fn(),
  mockCalculateCost: vi.fn(),
  mockCalculateListCost: vi.fn(),
  mockEstimateListCost: vi.fn(),
  mockEstimateCost: vi.fn(),
  mockReserve: vi.fn(),
  mockMarkProviderStarted: vi.fn(),
  mockFinalize: vi.fn(),
  mockDbQuery: vi.fn(),
  mockReadCachedAccess: vi.fn(),
  mockWriteCachedAccess: vi.fn(),
  mockInvalidateCachedAccess: vi.fn(),
  mockAfter: vi.fn((value: unknown) => value),
  MockUnpricedModelError: class extends Error {
    readonly code = 'unpriced_model';
    constructor(
      readonly provider: string,
      readonly model: string,
    ) {
      super(`no price for ${provider}/${model}`);
      this.name = 'UnpricedModelError';
    }
  },
  MockManagedUsageRequestError: class extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly code: string,
    ) {
      super(message);
      this.name = 'ManagedUsageRequestError';
    }
  },
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
  getNeonDb: () => ({ query: mockDbQuery }),
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
  UnpricedModelError: MockUnpricedModelError,
  LLMCostCalculator: {
    calculateListCost: mockCalculateListCost,
    estimateListCost: mockEstimateListCost,
    estimateCost: mockEstimateCost,
    calculateCost: mockCalculateCost,
  },
}));
vi.mock('@/lib/services/managed-usage-request-service', () => ({
  ManagedUsageRequestError: MockManagedUsageRequestError,
  fingerprintManagedUsageRequest: () => 'a'.repeat(64),
  reserveManagedUsageRequest: mockReserve,
  markManagedUsageProviderStarted: mockMarkProviderStarted,
  finalizeManagedUsageRequest: mockFinalize,
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
const MODEL = 'test-anthropic-model';
const MODELS_PATH = ['v1', 'models'];
const RESERVATION = {
  db: { query: mockDbQuery },
  userId: USER_ID,
  idempotencyKey: `code-proxy:${SESSION_ID}:reserved`,
  requestHash: 'a'.repeat(64),
  leaseToken: 'lease-1',
  estimatedCostCents: 20,
  provider: 'anthropic',
  model: MODEL,
  routeId: `anthropic/${MODEL}`,
  quotaFeature: 'code_harness',
};
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
  const method = init.method ?? 'POST';
  const sendsBody = method !== 'GET' && method !== 'HEAD';
  const body = sendsBody ? (init.body ?? JSON.stringify({ model: MODEL })) : undefined;
  const req = new NextRequest(
    `http://localhost:3000/api/code/sessions/${SESSION_ID}/provider-proxy/${path.join('/')}`,
    { method, body, headers: init.headers },
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
  mockCalculateListCost.mockReturnValue(9);
  mockEstimateListCost.mockReturnValue(20);
  mockEstimateCost.mockReturnValue(20);
  mockDbQuery.mockResolvedValue([{ spent_cents: 0 }]);
  mockReserve.mockResolvedValue({ ...RESERVATION });
  mockMarkProviderStarted.mockResolvedValue(undefined);
  mockFinalize.mockResolvedValue({
    requestStatus: 'completed',
    operationResult: 'finalized',
    settlementStatus: 'succeeded',
    actualCostCents: 9,
  });
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

    const { req, context } = request({
      method: 'GET',
      path: MODELS_PATH,
      headers: { 'x-api-key': token() },
    });
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

    const { req, context } = request({
      method: 'DELETE',
      path: MODELS_PATH,
      headers: { 'x-api-key': token() },
    });
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

      const { req, context } = request({
        method: 'GET',
        path: MODELS_PATH,
        headers: { 'x-api-key': token() },
      });
      const response = await GET(req, context);

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

  describe('managed usage ledger', () => {
    it('reserves the list-price estimate before egress and finalizes a non-stream Anthropic call at list price with the route cost', async () => {
      mockCalculateCost.mockReturnValue(12);
      mockCalculateListCost.mockReturnValue(18);
      const fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: MODEL,
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
        body: JSON.stringify({ model: MODEL, max_tokens: 512, messages: [{ role: 'user' }] }),
      });
      const response = await POST(req, context);
      expect(response.status).toBe(200);
      await response.text();
      await lastAfterPromise();

      expect(mockReserve).toHaveBeenCalledTimes(1);
      const reserved = mockReserve.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(reserved['userId']).toBe(USER_ID);
      expect(reserved['provider']).toBe('anthropic');
      expect(reserved['model']).toBe(MODEL);
      expect(reserved['estimatedCostCents']).toBe(20);
      expect(reserved['quotaFeature']).toBe('code_harness');
      expect(String(reserved['idempotencyKey'])).toMatch(new RegExp(`^code-proxy:${SESSION_ID}:`));
      expect(mockEstimateListCost).toHaveBeenCalledWith(MODEL, expect.any(Number), 512);
      expect(mockMarkProviderStarted).toHaveBeenCalledTimes(1);
      expect(mockReserve.mock.invocationCallOrder[0]!).toBeLessThan(
        fetchMock.mock.invocationCallOrder[0]!,
      );

      expect(mockFinalize).toHaveBeenCalledTimes(1);
      const finalized = mockFinalize.mock.calls[0]?.[0] as {
        outcome: string;
        actualCostCents: number;
        providerCostCents: number;
        leaseToken: string;
        usage: Record<string, unknown>;
      };
      expect(finalized.outcome).toBe('completed');
      expect(finalized.actualCostCents).toBe(18);
      expect(finalized.providerCostCents).toBe(12);
      expect(finalized.leaseToken).toBe(RESERVATION.leaseToken);
      expect(mockCalculateListCost).toHaveBeenCalledWith(
        MODEL,
        expect.objectContaining({ promptTokens: 100, completionTokens: 40 }),
      );
      expect(mockCalculateCost).toHaveBeenCalledWith(
        'anthropic',
        MODEL,
        expect.objectContaining({
          promptTokens: 100,
          completionTokens: 40,
          cacheReadInputTokens: 5,
          cacheCreationInputTokens: 2,
          cacheCreation1hInputTokens: 1,
        }),
        undefined,
        `anthropic/${MODEL}`,
      );
      expect(finalized.usage['providerCallObservations']).toEqual([
        { provider: 'anthropic', model: MODEL, routeId: `anthropic/${MODEL}` },
      ]);
      expect(mockRecordSettledProviderCost).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('refuses a call the ledger cannot fund, in the provider error shape, without reaching upstream', async () => {
      mockReserve.mockRejectedValue(
        new MockManagedUsageRequestError(
          'Usage budget exhausted for this billing period.',
          402,
          'insufficient_credits',
        ),
      );
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({ headers: { 'x-api-key': token() } });
      const response = await POST(req, context);

      expect(response.status).toBe(402);
      const body = (await response.json()) as {
        type: string;
        error: { type: string; code: string };
      };
      expect(body.type).toBe('error');
      expect(body.error.type).toBe('permission_error');
      expect(body.error.code).toBe('insufficient_credits');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockMarkProviderStarted).not.toHaveBeenCalled();
      expect(mockFinalize).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('maps a rolling-window block to 429 in the provider error shape', async () => {
      mockReserve.mockRejectedValue(
        new MockManagedUsageRequestError(
          'Your rolling 5-hour usage limit is reached.',
          429,
          'rolling_five_hour_limit_reached',
        ),
      );
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({ headers: { 'x-api-key': token() } });
      const response = await POST(req, context);

      expect(response.status).toBe(429);
      const body = (await response.json()) as { error: { type: string; code: string } };
      expect(body.error.type).toBe('rate_limit_error');
      expect(body.error.code).toBe('rolling_five_hour_limit_reached');
      expect(fetchMock).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('captures the final usage chunk of a streamed OpenAI chat call, opting the stream into usage', async () => {
      mockBuildAdapter.mockImplementation((providerId: string) => {
        if (providerId === 'openai') return { config: { apiKey: 'sk-managed-openai' } };
        throw new Error(`no managed key for ${providerId}`);
      });
      mockCalculateCost.mockReturnValue(4);
      mockCalculateListCost.mockReturnValue(6);
      const sseBody =
        `data: ${JSON.stringify({ id: 'c1', model: 'test-openai-model', choices: [{ delta: { content: 'hi' } }] })}\n\n` +
        `data: ${JSON.stringify({
          id: 'c1',
          model: 'test-openai-model',
          choices: [],
          usage: {
            prompt_tokens: 210,
            completion_tokens: 60,
            prompt_tokens_details: { cached_tokens: 30 },
          },
        })}\n\n` +
        'data: [DONE]\n\n';
      const fetchMock = vi.fn(
        async (_url: string, _init?: RequestInit) =>
          new Response(sseBody, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({
        path: ['v1', 'chat', 'completions'],
        headers: {
          authorization: `Bearer ${token({ providerId: 'openai' })}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'test-openai-model',
          stream: true,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      const response = await POST(req, context);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(sseBody);
      await lastAfterPromise();

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toMatchObject({
        stream_options: { include_usage: true },
      });

      expect(mockFinalize).toHaveBeenCalledTimes(1);
      const finalized = mockFinalize.mock.calls[0]?.[0] as {
        outcome: string;
        actualCostCents: number;
        providerCostCents: number;
        usage: Record<string, unknown>;
      };
      expect(finalized.outcome).toBe('completed');
      expect(finalized.actualCostCents).toBe(6);
      expect(finalized.providerCostCents).toBe(4);
      expect(finalized.usage).toMatchObject({
        inputTokens: 210,
        outputTokens: 60,
        cacheReadTokens: 30,
      });

      vi.unstubAllGlobals();
    });

    it('refunds in full when the upstream call returns no usage', async () => {
      const fetchMock = vi.fn(
        async () => new Response('{"error":{"message":"upstream is down"}}', { status: 500 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({ headers: { 'x-api-key': token() } });
      const response = await POST(req, context);
      await response.text();
      await lastAfterPromise();

      expect(mockFinalize).toHaveBeenCalledTimes(1);
      expect(mockFinalize.mock.calls[0]?.[0]).toMatchObject({
        outcome: 'failed',
        actualCostCents: 0,
      });

      vi.unstubAllGlobals();
    });

    it('releases the reservation when the upstream request never completes', async () => {
      const fetchMock = vi.fn(async () => {
        throw new Error('socket hang up');
      });
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({ headers: { 'x-api-key': token() } });
      const response = await POST(req, context);
      expect(response.status).toBe(502);
      await lastAfterPromise();

      expect(mockFinalize).toHaveBeenCalledTimes(1);
      expect(mockFinalize.mock.calls[0]?.[0]).toMatchObject({ outcome: 'failed' });

      vi.unstubAllGlobals();
    });

    it('does not fail the proxied response when finalization fails', async () => {
      mockFinalize.mockRejectedValue(new Error('ledger unavailable'));
      const fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({ model: MODEL, usage: { input_tokens: 5, output_tokens: 5 } }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({ headers: { 'x-api-key': token() } });
      const response = await POST(req, context);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(MODEL);

      await expect(lastAfterPromise()).resolves.toBeUndefined();
      expect(mockFinalize).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it('never reserves for count_tokens or models', async () => {
      const fetchMock = vi.fn(async () => new Response('{"input_tokens":11}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const counted = request({
        path: ['v1', 'messages', 'count_tokens'],
        headers: { 'x-api-key': token(), 'content-type': 'application/json' },
      });
      expect((await POST(counted.req, counted.context)).status).toBe(200);

      const models = request({
        method: 'GET',
        path: MODELS_PATH,
        headers: { 'x-api-key': token() },
      });
      expect((await GET(models.req, models.context)).status).toBe(200);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(mockReserve).not.toHaveBeenCalled();
      expect(mockFinalize).not.toHaveBeenCalled();
      expect(mockAfter).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('refuses an unpriced model with 400 and never forwards it', async () => {
      mockEstimateListCost.mockImplementation(() => {
        throw new MockUnpricedModelError('anthropic', 'made-up-model');
      });
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({
        headers: { 'x-api-key': token(), 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'made-up-model', messages: [] }),
      });
      const response = await POST(req, context);

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe('provider_proxy_model_unpriced');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockReserve).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });
  });

  describe('coding-harness daily ceiling', () => {
    it('refuses a call whose estimate takes the plan over its 24-hour ceiling', async () => {
      mockDbQuery.mockResolvedValue([{ spent_cents: 495 }]);
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({ headers: { 'x-api-key': token() } });
      const response = await POST(req, context);

      expect(response.status).toBe(402);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe('code_harness_daily_ceiling_reached');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockReserve).not.toHaveBeenCalled();

      const [sql, params] = mockDbQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('managed_usage_requests');
      expect(sql).toContain("interval '24 hours'");
      expect(params).toEqual([USER_ID, 'code_harness', 'code-proxy:%']);

      vi.unstubAllGlobals();
    });

    it('admits a call that still fits under the ceiling', async () => {
      mockDbQuery.mockResolvedValue([{ spent_cents: 100 }]);
      const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({ headers: { 'x-api-key': token() } });
      const response = await POST(req, context);

      expect(response.status).toBe(200);
      expect(mockReserve).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it('refuses a plan that is granted no coding-harness ceiling at all', async () => {
      mockGetSubscription.mockResolvedValue({ plan_tier: 'free', status: 'active' });
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const { req, context } = request({ headers: { 'x-api-key': token() } });
      const response = await POST(req, context);

      expect(response.status).toBe(402);
      expect(mockDbQuery).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });
  });
});
