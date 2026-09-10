// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getModelMetadataById, getRoutingSlotModel } from '@agiworkforce/types';

const LIVE_MODEL = getModelMetadataById(getRoutingSlotModel('voice_live'))!;
const BACKEND_MODEL = getModelMetadataById(getRoutingSlotModel('voice_live_backend'))!;

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  finalize: vi.fn(),
  providerStarted: vi.fn(),
  clientDelivered: vi.fn(),
  getSubscription: vi.fn(),
  userScopedDb: vi.fn(),
  fetch: vi.fn(),
  assertTierUnitAllowance: vi.fn(),
  requireEnv: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));
vi.mock('@/lib/managed-compute-gate', () => ({
  buildManagedComputeGateResponse: vi.fn(() => null),
  buildOrganizationPolicyGateResponse: vi.fn(async () => null),
  buildModelPolicyGateResponse: vi.fn(async () => null),
  buildSpendLimitGateResponse: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@shared/utils/env', () => ({
  requireEnv: (...args: unknown[]) => mocks.requireEnv(...args),
  getOptionalEnv: vi.fn(() => undefined),
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mocks.userScopedDb(...args),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: (...args: unknown[]) => mocks.getSubscription(...args) },
}));
vi.mock('@/lib/services/managed-compute-access', () => ({
  evaluateManagedComputeSubscriptionAccess: vi.fn(async () => ({ allowed: true })),
  buildManagedComputeAccessGateResponse: vi.fn(() => null),
}));
vi.mock('@/lib/services/tier-unit-quota-service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    assertTierUnitAllowance: (...args: unknown[]) => mocks.assertTierUnitAllowance(...args),
  };
});
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    reserveManagedUsageRequest: (...args: unknown[]) => mocks.reserve(...args),
    finalizeManagedUsageRequest: (...args: unknown[]) => mocks.finalize(...args),
    markManagedUsageProviderStarted: (...args: unknown[]) => mocks.providerStarted(...args),
    markManagedUsageClientDelivered: (...args: unknown[]) => mocks.clientDelivered(...args),
  };
});

const { POST } = await import('./route');
const { LIVE_SESSION_BLOCK_MINUTES, liveSessionCostCents } =
  await import('@/lib/voice/live-voice-billing');

const OFFER = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n';
const RESERVATION = {
  db: {},
  userId: 'user-1',
  idempotencyKey: 'agi.voice.live.test',
  requestHash: 'hash',
  leaseToken: 'lease',
  estimatedCostCents: liveSessionCostCents(LIVE_SESSION_BLOCK_MINUTES * 60),
};

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/voice/live/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/voice/live/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.requireEnv.mockReturnValue('sk-test-openai-key');
    mocks.userScopedDb.mockResolvedValue({ db: {}, userId: 'user-1' });
    mocks.getSubscription.mockResolvedValue({ plan_tier: 'pro' });
    mocks.assertTierUnitAllowance.mockResolvedValue(undefined);
    mocks.reserve.mockResolvedValue(RESERVATION);
    mocks.finalize.mockResolvedValue({});
    mocks.providerStarted.mockResolvedValue(undefined);
  });

  it('creates the session server-side with the live model, webrtc transport and delegation', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ session: { id: 'live_1' }, transport: { type: 'webrtc', sdp: 'answer' } }),
        { status: 201 },
      ),
    );

    const response = await POST(request({ sdp: OFFER, voice: 'quartz' }));
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      sessionId: string;
      sdp: string;
      settlement: { idempotencyKey: string; ceilingSeconds: number };
    };
    expect(body.sessionId).toBe('live_1');
    expect(body.sdp).toBe('answer');
    expect(body.settlement.idempotencyKey).toBe(RESERVATION.idempotencyKey);
    expect(body.settlement.ceilingSeconds).toBe(LIVE_SESSION_BLOCK_MINUTES * 60);

    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/live/sessions');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer sk-test-openai-key',
    );
    const sent = JSON.parse(String(init.body)) as {
      session: {
        model: string;
        audio: { output: { voice: string } };
        delegation: { type: string; responses: { model: string; tools: { type: string }[] } };
      };
      transport: { type: string; sdp: string };
    };
    expect(sent.session.model).toBe(LIVE_MODEL.apiModelId ?? LIVE_MODEL.id);
    expect(sent.session.audio.output.voice).toBe('quartz');
    expect(sent.session.delegation.type).toBe('responses');
    expect(sent.session.delegation.responses.model).toBe(
      BACKEND_MODEL.apiModelId ?? BACKEND_MODEL.id,
    );
    expect(sent.session.delegation.responses.tools).toEqual([{ type: 'web_search' }]);
    expect(sent.transport).toEqual({ type: 'webrtc', sdp: OFFER });
    expect(mocks.assertTierUnitAllowance).toHaveBeenCalledWith(
      expect.objectContaining({
        unit: 'voice_minutes',
        requestedUnits: LIVE_SESSION_BLOCK_MINUTES,
      }),
    );
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('answers 503 with a configuration code when the provider key is missing', async () => {
    mocks.requireEnv.mockImplementation(() => {
      throw new Error('FATAL: OPENAI_API_KEY environment variable is required but not set.');
    });

    const response = await POST(request({ sdp: OFFER }));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('live_voice_not_configured');
    expect(body.error.message).toContain('OPENAI_API_KEY');
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('surfaces a provider access refusal and releases the reservation', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'model_not_found',
            message: 'The model does not exist',
            type: 'invalid_request_error',
          },
        }),
        { status: 404 },
      ),
    );

    const response = await POST(request({ sdp: OFFER }));
    expect(response.status).toBe(403);
    const body = (await response.json()) as {
      error: { code: string; upstreamCode: string; upstreamStatus: number };
    };
    expect(body.error.code).toBe('live_voice_access_denied');
    expect(body.error.upstreamCode).toBe('model_not_found');
    expect(body.error.upstreamStatus).toBe(404);
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed', actualCostCents: 0 }),
    );
  });

  it('rejects a body without an offer before any reservation', async () => {
    const response = await POST(request({ voice: 'marin' }));
    expect(response.status).toBe(400);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});
