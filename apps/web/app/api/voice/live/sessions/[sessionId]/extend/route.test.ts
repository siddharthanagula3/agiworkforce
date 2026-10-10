// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { getRoutingSlotModel } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/server/provider-training-opt-out');
type ScanModule1 = typeof import('@/lib/csrf');
type ScanModule2 = typeof import('@/lib/rate-limit');
type ScanModule3 = typeof import('@/lib/cors');
type ScanModule4 = typeof import('@/lib/logger');
type ScanModule5 = typeof import('@/lib/api-auth');
type ScanModule6 = typeof import('@/lib/server/rls-db');
type ScanModule7 = typeof import('@/lib/services/entitlement-resolution');
type ScanModule8 = typeof import('@/lib/services/managed-usage-request-service');
type ScanModule10 = typeof import('../../lib/voice-session-budget');
type ScanModule11 = typeof import('../../lib/voice-session-store');

const mocks = vi.hoisted(() => ({
  csrf: vi.fn(),
  auth: vi.fn(),
  userScopedDb: vi.fn(),
  entitlement: vi.fn(),
  reserveStep: vi.fn(),
  readReservation: vi.fn(),
  storeReady: vi.fn(),
  getSession: vi.fn(),
  touchSession: vi.fn(),
  keepsOutOfTraining: vi.fn<(modelId: string) => boolean | null>(() => null),
}));

vi.mock('@/lib/server/provider-training-opt-out', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    modelKeepsInputsOutOfTraining: (modelId: string) =>
      mocks.keepsOutOfTraining(modelId) ?? actual.modelKeepsInputsOutOfTraining(modelId),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  requireCsrfToken: (...args: unknown[]) => mocks.csrf(...args),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  getClerkAuthUser: (...args: unknown[]) => mocks.auth(...args),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  getUserScopedDb: (...args: unknown[]) => mocks.userScopedDb(...args),
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<ScanModule7>()),
  resolveEntitlementBundle: (...args: unknown[]) => mocks.entitlement(...args),
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule8>()),
  reserveManagedUsageProviderStep: (...args: unknown[]) => mocks.reserveStep(...args),
}));
vi.mock('../../lib/voice-session-budget', async (importOriginal) => ({
  ...(await importOriginal<ScanModule10>()),
  readVoiceReservation: (...args: unknown[]) => mocks.readReservation(...args),
}));
vi.mock('../../lib/voice-session-store', async (importOriginal) => ({
  ...(await importOriginal<ScanModule11>()),
  isVoiceSessionStoreReady: (...args: unknown[]) => mocks.storeReady(...args),
  getVoiceSessionByProviderId: (...args: unknown[]) => mocks.getSession(...args),
  touchVoiceSession: (...args: unknown[]) => mocks.touchSession(...args),
}));

const { POST, OPTIONS } = await import('./route');
const { createError } = await import('@/lib/errors');
const { ManagedUsageRequestError } = await import('@/lib/services/managed-usage-request-service');
const { LIVE_VOICE_BLOCK_SECONDS, liveVoiceBlockChargeMicrousd } =
  await import('@/lib/voice/live-voice-billing');
const { voiceReservationIdentity } = await import('../../lib/voice-session-budget');

const SESSION_ID = 'live_1';
const LIVE_MODEL = getRoutingSlotModel('voice_live');
const FIVE_HOUR_RESET = '2026-10-10T15:00:00.000Z';
const db = { query: vi.fn() };

function activeSession(status: 'active' | 'closed' = 'active') {
  return {
    id: 'vs_1',
    userId: 'user-1',
    provider: 'openai',
    providerSessionId: SESSION_ID,
    modelId: LIVE_MODEL,
    conversationId: 'conv-1',
    status,
    startedAt: new Date(Date.now() - 50_000).toISOString(),
  };
}

function extend(body: unknown): Promise<Response> {
  const request = new NextRequest(`http://localhost/api/voice/live/sessions/${SESSION_ID}/extend`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ sessionId: SESSION_ID }) });
}

async function errorBody(response: Response): Promise<Record<string, unknown>> {
  return ((await response.json()) as { error: Record<string, unknown> }).error;
}

function stepCalls(): Array<Record<string, unknown>> {
  return mocks.reserveStep.mock.calls.map((call) => call[0] as Record<string, unknown>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.keepsOutOfTraining.mockReturnValue(null);
  mocks.csrf.mockResolvedValue(null);
  mocks.auth.mockResolvedValue({ userId: 'user-1' });
  mocks.userScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
  mocks.entitlement.mockResolvedValue({ plan: 'pro', catalogVersion: 3 });
  mocks.storeReady.mockResolvedValue(true);
  mocks.getSession.mockResolvedValue(activeSession());
  mocks.touchSession.mockResolvedValue(activeSession());
  mocks.readReservation.mockResolvedValue({
    reservedMicrousd: 60_000,
    extensionStatus: null,
    extensionMicrousd: null,
  });
  mocks.reserveStep.mockResolvedValue({ operationResult: 'extended' });
});

describe('POST /api/voice/live/sessions/[sessionId]/extend', () => {
  it('reserves the next one-minute block at its real price against the shared budget', async () => {
    const response = await extend({ block: 2 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ceilingSeconds: 2 * LIVE_VOICE_BLOCK_SECONDS });
    const [initial, step] = stepCalls();
    expect(initial).toMatchObject({ operationKey: 'provider:1', estimatedCostMicrousd: 0 });
    expect(step).toMatchObject({
      operationKey: 'provider:2',
      estimatedCostMicrousd: liveVoiceBlockChargeMicrousd(
        LIVE_MODEL,
        getRoutingSlotModel('voice_live_backend'),
      ),
      planTier: 'pro',
      isFlagship: false,
    });
    expect(step?.['reservation']).toMatchObject({
      ...voiceReservationIdentity('vs_1'),
      userId: 'user-1',
      quotaFeature: 'voice_live',
    });
    expect(mocks.touchSession).toHaveBeenCalled();
  });

  it('prices a free plan block at the cheaper free backend', async () => {
    mocks.entitlement.mockResolvedValue({ plan: 'free', catalogVersion: 3 });

    await extend({ block: 2 });

    expect(stepCalls()[1]).toMatchObject({
      estimatedCostMicrousd: liveVoiceBlockChargeMicrousd(
        LIVE_MODEL,
        getRoutingSlotModel('voice_live_backend_free'),
      ),
    });
  });

  it('answers a block that already went through without reserving it again', async () => {
    mocks.readReservation.mockResolvedValue({
      reservedMicrousd: 120_000,
      extensionStatus: 'extended',
      extensionMicrousd: 60_000,
    });

    const response = await extend({ block: 2 });

    expect(await response.json()).toEqual({ ceilingSeconds: 2 * LIVE_VOICE_BLOCK_SECONDS });
    expect(mocks.reserveStep).not.toHaveBeenCalled();
  });

  it('refuses the next block with the binding window and its reset when the budget is spent', async () => {
    const refusal = new ManagedUsageRequestError(
      'Your rolling 5-hour usage limit is reached.',
      429,
      'rolling_five_hour_limit_reached',
    );
    refusal.limitContext = { resetsAt: FIVE_HOUR_RESET, alternativeModel: null };
    mocks.reserveStep
      .mockResolvedValueOnce({ operationResult: 'covered' })
      .mockRejectedValueOnce(refusal);

    const response = await extend({ block: 2 });

    expect(response.status).toBe(429);
    expect(await errorBody(response)).toMatchObject({
      code: 'rolling_five_hour_limit_reached',
      resets_at: FIVE_HOUR_RESET,
    });
  });

  it('refuses to extend a session that has ended, was never recorded or holds no reservation', async () => {
    mocks.getSession.mockResolvedValue(activeSession('closed'));
    expect((await extend({ block: 2 })).status).toBe(409);
    mocks.getSession.mockResolvedValue(null);
    expect((await extend({ block: 2 })).status).toBe(409);
    mocks.getSession.mockResolvedValue(activeSession());
    mocks.readReservation.mockResolvedValue(null);
    const unreserved = await extend({ block: 2 });
    expect(unreserved.status).toBe(409);
    expect((await errorBody(unreserved))['code']).toBe('voice_session_unreserved');
    expect(mocks.reserveStep).not.toHaveBeenCalled();
  });

  it('rejects a body that names the first block', async () => {
    expect((await extend({ block: 1 })).status).toBe(400);
  });

  it('refuses a caller whose scoped tenant is another user', async () => {
    mocks.userScopedDb.mockResolvedValue({ db, userId: 'user-2', organizationId: null });

    expect((await extend({ block: 2 })).status).toBe(403);
  });

  it('refuses an unauthenticated caller', async () => {
    mocks.auth.mockRejectedValue(createError.unauthorized('Authentication required'));

    expect((await extend({ block: 2 })).status).toBe(401);
    expect(mocks.reserveStep).not.toHaveBeenCalled();
  });

  it('returns a CSRF refusal unchanged', async () => {
    mocks.csrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));

    expect((await extend({ block: 2 })).status).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it('answers 503 billing_unavailable when the plan cannot be read', async () => {
    mocks.entitlement.mockRejectedValue(new Error('entitlement store down'));

    const response = await extend({ block: 2 });

    expect(response.status).toBe(503);
    expect((await errorBody(response))['code']).toBe('billing_unavailable');
  });

  it('answers a preflight with no body', async () => {
    const response = OPTIONS(
      new NextRequest(`http://localhost/api/voice/live/sessions/${SESSION_ID}/extend`, {
        method: 'OPTIONS',
      }),
    );

    expect(response.status).toBe(204);
  });
});

describe('a session whose chat now holds Google user data', () => {
  it('is not extended while the voice models may train', async () => {
    mocks.keepsOutOfTraining.mockReturnValue(false);
    db.query.mockImplementation(async (sql: string) =>
      sql.includes('as marked') ? [{ marked: true, project_id: null }] : [],
    );

    const response = await extend({ block: 2 });

    expect(response.status).toBe(403);
    expect((await errorBody(response))['code']).toBe('model_may_train');
    expect(mocks.reserveStep).not.toHaveBeenCalled();
  });
});
