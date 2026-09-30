// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { getModelMetadataById, getRoutingSlotModel } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  managedGate: vi.fn(),
  modelPolicyGate: vi.fn(),
  sideCallProviderAllowed: vi.fn(),
  getUserScopedDb: vi.fn(),
  resolveEntitlementBundle: vi.fn(),
  evaluateManagedComputeAccess: vi.fn(),
  buildManagedComputeAccessGateResponse: vi.fn(),
  reserve: vi.fn(),
  finalize: vi.fn(),
  providerStarted: vi.fn(),
  clientDelivered: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  assertAccountActive: vi.fn(),
  getClerkAuthorizedParties: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  getClerkAuthUser: mocks.getClerkAuthUser,
}));
vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  getSessionIdFromRequest: vi.fn(),
  isBearerTokenValid: vi.fn(),
  readCookie: vi.fn(),
  resetCsrfCache: vi.fn(),
  validateCsrfFromRequest: vi.fn(),
  verifyCsrfToken: vi.fn(),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/cors', () => ({
  appendVary: vi.fn(),
  isOriginAllowed: vi.fn(),
  jsonResponseWithCors: vi.fn(),
  requireValidOrigin: vi.fn(),
  withCorsAndSecurityHeaders: vi.fn(),
  withCorsRoute: vi.fn(),
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@shared/utils/env', () => ({
  getEnv: vi.fn(),
  requireEnv: vi.fn(() => 'sk-test'),
  getOptionalEnv: vi.fn(() => undefined),
}));
vi.mock('@/lib/managed-compute-gate', () => ({
  MANAGED_COMPUTE_BETA_HEADER: 'x-agi-managed-compute-beta',
  MANAGED_COMPUTE_ORG_HEADER: vi.fn(),
  MANAGED_COMPUTE_PRIVATE_BETA_ENV: 'AGI_MANAGED_COMPUTE_PRIVATE_BETA',
  buildExternalSharingGateResponse: vi.fn(),
  buildOrganizationPolicyGateResponse: vi.fn(),
  buildProviderEgressGateResponse: vi.fn(),
  buildSpendLimitGateResponse: vi.fn(),
  buildWorkspaceFeatureGateResponse: vi.fn(),
  isManagedComputePrivateBetaEnabled: vi.fn(),
  resolveWorkspaceControlsForRequest: vi.fn(),
  buildManagedComputeGateResponse: mocks.managedGate,
  buildModelPolicyGateResponse: mocks.modelPolicyGate,
}));
vi.mock('@/lib/free-chat-surface-policy', () => ({
  bindSurfaceFromClaims: vi.fn(),
  canUseManagedCloudChatSurface: vi.fn(),
  getCloudChatSurfaceCapability: vi.fn(),
  readSurfaceHint: vi.fn(),
  resolveCloudChatSurface: vi.fn(() => 'web'),
}));
vi.mock('@/lib/server/provider-endpoints', () => ({
  googleVideoOutputHostDisposition: vi.fn(),
  isManagedProviderId: vi.fn(),
  resolveProviderApiRoot: vi.fn(),
  providerApiUrl: vi.fn(() => 'https://provider.test/v1/audio/speech'),
}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/services/entitlement-resolution', () => ({
  ensureSeatMemberCreditAccount: vi.fn(),
  isSeatBearingBillingPlan: vi.fn(),
  resolveEffectiveSubscription: vi.fn(),
  resolveEntitledPlanTier: vi.fn(),
  resolveEntitlementBundle: mocks.resolveEntitlementBundle,
}));
vi.mock('@/lib/services/managed-compute-access', () => ({
  evaluateManagedComputeSubscriptionAccess: vi.fn(),
  evaluateManagedComputeWorkspaceAccess: vi.fn(),
  evaluateManagedComputeAccess: mocks.evaluateManagedComputeAccess,
  buildManagedComputeAccessGateResponse: mocks.buildManagedComputeAccessGateResponse,
}));
vi.mock('@/lib/server/side-call-training-policy', () => ({
  noTrainingProviderIds: vi.fn(),
  sideCallRoutingRequest: vi.fn(),
  sideCallTrainingOptOut: vi.fn(),
  sideCallProviderAllowed: mocks.sideCallProviderAllowed,
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  reserveManagedUsageRequest: mocks.reserve,
  finalizeManagedUsageRequest: mocks.finalize,
  markManagedUsageProviderStarted: mocks.providerStarted,
  markManagedUsageClientDelivered: mocks.clientDelivered,
}));

import { createError } from '@/lib/errors';
import { ManagedUsageRequestError } from '@/lib/services/managed-usage-request-service';
import { POST } from '../route';

const MODEL = getModelMetadataById(getRoutingSlotModel('voice_speech'))!;
const db = { query: vi.fn() };
const reservation = { db, userId: 'user-1', requestId: 'req-1' };

function request(body: unknown, idempotencyKey: string | null = 'speech-key-0001'): NextRequest {
  return new NextRequest('http://localhost/api/voice/speech', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/voice/speech', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-1' });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.managedGate.mockReturnValue(null);
    mocks.modelPolicyGate.mockResolvedValue(null);
    mocks.sideCallProviderAllowed.mockResolvedValue(true);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1' });
    mocks.resolveEntitlementBundle.mockResolvedValue({
      plan: 'pro',
      subscription: { tier: 'pro' },
    });
    mocks.evaluateManagedComputeAccess.mockResolvedValue({ allowed: true });
    mocks.buildManagedComputeAccessGateResponse.mockReturnValue(null);
    mocks.reserve.mockResolvedValue(reservation);
    mocks.finalize.mockResolvedValue(undefined);
    mocks.providerStarted.mockResolvedValue(undefined);
    mocks.clientDelivered.mockResolvedValue(undefined);
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses a request without a session', async () => {
    mocks.getClerkAuthUser.mockRejectedValue(createError.unauthorized());

    const response = await POST(request({ text: 'Hello' }));

    expect(response.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refuses a request that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));

    const response = await POST(request({ text: 'Hello' }));

    expect(response.status).toBe(403);
    expect(mocks.getClerkAuthUser).not.toHaveBeenCalled();
  });

  it('returns the rate limit response', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({}, { status: 429 }));

    const response = await POST(request({ text: 'Hello' }));

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(expect.anything(), 'voice-speech');
  });

  it('returns the managed compute gate response when the feature is off', async () => {
    mocks.managedGate.mockReturnValue(NextResponse.json({}, { status: 503 }));

    const response = await POST(request({ text: 'Hello' }));

    expect(response.status).toBe(503);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('rejects empty text', async () => {
    const response = await POST(request({ text: '   ' }));

    expect(response.status).toBe(400);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('rejects text over the 4,000 character ceiling', async () => {
    const response = await POST(request({ text: 'a'.repeat(4_001) }));

    expect(response.status).toBe(400);
  });

  it('rejects an unknown voice', async () => {
    const response = await POST(request({ text: 'Hello', voice: 'not-a-voice' }));

    expect(response.status).toBe(400);
  });

  it('refuses when the privacy setting excludes the speech provider', async () => {
    mocks.sideCallProviderAllowed.mockResolvedValue(false);

    const response = await POST(request({ text: 'Hello' }));

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('model_may_train');
    expect(mocks.sideCallProviderAllowed).toHaveBeenCalledWith(null, 'user-1', MODEL.provider);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('returns the organization model policy refusal', async () => {
    mocks.modelPolicyGate.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    const response = await POST(request({ text: 'Hello' }));

    expect(response.status).toBe(403);
    expect(mocks.modelPolicyGate).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
      { provider: String(MODEL.provider), modelId: MODEL.id },
      expect.anything(),
    );
  });

  it('refuses when the scoped database belongs to another user', async () => {
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-2' });

    const response = await POST(request({ text: 'Hello' }));

    expect(response.status).toBe(403);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('requires an Idempotency-Key header', async () => {
    const response = await POST(request({ text: 'Hello' }, null));

    expect(response.status).toBe(400);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('rejects a malformed Idempotency-Key', async () => {
    const response = await POST(request({ text: 'Hello' }, 'bad key!'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('invalid_idempotency_key');
  });

  it('returns the managed compute access gate when the plan has no allowance', async () => {
    mocks.evaluateManagedComputeAccess.mockResolvedValue({ allowed: false });
    mocks.buildManagedComputeAccessGateResponse.mockReturnValue(
      NextResponse.json({ error: 'upgrade' }, { status: 402 }),
    );

    const response = await POST(request({ text: 'Hello' }));

    expect(response.status).toBe(402);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('maps an exhausted quota to insufficient_quota', async () => {
    mocks.reserve.mockRejectedValue(
      new ManagedUsageRequestError('Out of credits', 402, 'quota_exhausted'),
    );

    const response = await POST(request({ text: 'Hello' }));

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.error.type).toBe('insufficient_quota');
    expect(body.error.code).toBe('quota_exhausted');
  });

  it('releases the reservation and returns 502 when the provider fails', async () => {
    mocks.fetch.mockResolvedValue(new Response('boom', { status: 500 }));

    const response = await POST(request({ text: 'Hello' }));

    expect(response.status).toBe(502);
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed', actualCostMicrousd: 0 }),
    );
    expect(mocks.clientDelivered).not.toHaveBeenCalled();
  });

  it('reserves usage for the caller, proxies the provider and returns audio', async () => {
    const response = await POST(request({ text: 'Hello there', voice: 'marin', speed: 1.25 }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(mocks.resolveEntitlementBundle).toHaveBeenCalledWith(db, 'user-1');
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        db,
        userId: 'user-1',
        idempotencyKey: 'speech-key-0001',
        provider: MODEL.provider,
        model: MODEL.id,
        planTier: 'pro',
        isFlagship: false,
      }),
    );
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://provider.test/v1/audio/speech');
    expect(JSON.parse(init.body)).toEqual({
      model: MODEL.apiModelId ?? MODEL.id,
      input: 'Hello there',
      voice: 'marin',
      response_format: 'mp3',
      speed: 1.25,
    });
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(mocks.providerStarted).toHaveBeenCalledWith(reservation);
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'completed', userId: 'user-1' }),
    );
    expect(mocks.clientDelivered).toHaveBeenCalledWith(reservation);
  });
});
