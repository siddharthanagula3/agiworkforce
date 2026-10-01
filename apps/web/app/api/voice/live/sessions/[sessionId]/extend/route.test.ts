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
type ScanModule9 = typeof import('@/lib/services/tier-unit-quota-service');
type ScanModule10 = typeof import('../../lib/voice-session-budget');
type ScanModule11 = typeof import('../../lib/voice-session-store');

const mocks = vi.hoisted(() => ({
  csrf: vi.fn(),
  auth: vi.fn(),
  userScopedDb: vi.fn(),
  entitlement: vi.fn(),
  reserveStep: vi.fn(),
  assertAllowance: vi.fn(),
  planBlock: vi.fn(),
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
vi.mock('@/lib/services/tier-unit-quota-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule9>()),
  assertTierUnitAllowance: (...args: unknown[]) => mocks.assertAllowance(...args),
}));
vi.mock('../../lib/voice-session-budget', async (importOriginal) => ({
  ...(await importOriginal<ScanModule10>()),
  planVoiceSessionBlock: (...args: unknown[]) => mocks.planBlock(...args),
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
const {
  LIVE_SESSION_CEILING_SECONDS,
  LIVE_SESSION_MIN_BLOCK_SECONDS,
  liveSessionChargeMicrousd,
  liveSessionMinutes,
  liveSessionSecondsCoveredBy,
} = await import('@/lib/voice/live-voice-billing');

const SESSION_ID = 'live_1';
const LIVE_MODEL = getRoutingSlotModel('voice_live');
const FIVE_HOUR_RESET = '2026-09-27T20:00:00.000Z';
const WEEKLY_RESET = '2026-10-01T00:00:00.000Z';
const SETTLEMENT = {
  idempotencyKey: 'agi.voice.live.test',
  leaseToken: 'lease',
  requestHash: 'hash',
};
const db = { query: vi.fn() };

function charge(seconds: number): number {
  return liveSessionChargeMicrousd(seconds, LIVE_MODEL) as number;
}

const FIRST_BLOCK_MICROUSD = charge(LIVE_SESSION_CEILING_SECONDS);

function activeSession(status: 'active' | 'closed' = 'active') {
  return {
    id: 'vs_1',
    userId: 'user-1',
    provider: 'openai',
    providerSessionId: SESSION_ID,
    modelId: LIVE_MODEL,
    status,
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
    reservedMicrousd: FIRST_BLOCK_MICROUSD,
    extensionStatus: null,
    extensionMicrousd: null,
  });
  mocks.planBlock.mockResolvedValue({
    blockSeconds: LIVE_SESSION_CEILING_SECONDS,
    resetsAt: {
      rolling_five_hour_limit_reached: FIVE_HOUR_RESET,
      rolling_weekly_limit_reached: WEEKLY_RESET,
      insufficient_credits: null,
    },
  });
  mocks.assertAllowance.mockResolvedValue(undefined);
  mocks.reserveStep.mockImplementation(async (input: Record<string, unknown>) => {
    const step = Number(input['estimatedCostMicrousd']);
    return {
      operationResult: step > 0 ? 'extended' : 'covered',
      estimatedCostMicrousd: FIRST_BLOCK_MICROUSD + step,
      estimatedCostCents: 0,
    };
  });
});

describe('POST /api/voice/live/sessions/[sessionId]/extend', () => {
  it('reserves the next block against the plan and answers the ceiling the reservation covers', async () => {
    const response = await extend({ block: 2, settlement: SETTLEMENT });

    expect(response.status).toBe(200);
    const extendedMicrousd = FIRST_BLOCK_MICROUSD + charge(LIVE_SESSION_CEILING_SECONDS);
    expect(await response.json()).toEqual({
      ceilingSeconds: liveSessionSecondsCoveredBy(extendedMicrousd, LIVE_MODEL),
    });

    const [started, extension] = stepCalls();
    expect(started).toMatchObject({
      operationKey: 'provider:1',
      estimatedCostMicrousd: 0,
      planTier: 'pro',
      isFlagship: false,
    });
    expect(extension).toMatchObject({
      operationKey: 'provider:2',
      estimatedCostMicrousd: charge(LIVE_SESSION_CEILING_SECONDS),
      planTier: 'pro',
      isFlagship: false,
    });
    expect(extension?.['reservation']).toMatchObject({
      userId: 'user-1',
      idempotencyKey: SETTLEMENT.idempotencyKey,
      leaseToken: SETTLEMENT.leaseToken,
      requestHash: SETTLEMENT.requestHash,
      quotaFeature: 'voice_live',
      model: LIVE_MODEL,
    });
    expect(mocks.planBlock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', planTier: 'pro', catalogVersion: 3 }),
    );
    expect(mocks.readReservation).toHaveBeenCalledWith(
      expect.objectContaining({ operationKey: 'provider:2' }),
    );
    expect(mocks.touchSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', providerSessionId: SESSION_ID }),
    );
  });

  it('checks the voice minute allowance for everything reserved so far plus the new block', async () => {
    await extend({ block: 2, settlement: SETTLEMENT });

    expect(mocks.assertAllowance).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        planTier: 'pro',
        unit: 'voice_minutes',
        requestedUnits: liveSessionMinutes(
          liveSessionSecondsCoveredBy(FIRST_BLOCK_MICROUSD, LIVE_MODEL) +
            LIVE_SESSION_CEILING_SECONDS,
        ),
      }),
    );
  });

  it('sizes the extension to what the plan windows still cover', async () => {
    mocks.planBlock.mockResolvedValue({ blockSeconds: 150, resetsAt: {} });

    await extend({ block: 3, settlement: SETTLEMENT });

    expect(stepCalls()[1]).toMatchObject({
      operationKey: 'provider:3',
      estimatedCostMicrousd: charge(150),
    });
  });

  it('never asks for less than a minute, so an empty window is refused by the ledger', async () => {
    mocks.planBlock.mockResolvedValue({
      blockSeconds: 0,
      resetsAt: { rolling_five_hour_limit_reached: FIVE_HOUR_RESET },
    });
    mocks.reserveStep.mockImplementation(async (input: Record<string, unknown>) => {
      if (input['operationKey'] === 'provider:1') {
        return {
          operationResult: 'covered',
          estimatedCostMicrousd: FIRST_BLOCK_MICROUSD,
          estimatedCostCents: 0,
        };
      }
      throw new ManagedUsageRequestError('limit', 429, 'rolling_five_hour_limit_reached');
    });

    const response = await extend({ block: 2, settlement: SETTLEMENT });

    expect(stepCalls()[1]).toMatchObject({
      estimatedCostMicrousd: charge(LIVE_SESSION_MIN_BLOCK_SECONDS),
    });
    expect(response.status).toBe(429);
    const error = await errorBody(response);
    expect(error['code']).toBe('rolling_five_hour_limit_reached');
    expect(error['resets_at']).toBe(FIVE_HOUR_RESET);
  });

  it('keeps the status of a refusal and names the reset of the window that refused it', async () => {
    mocks.reserveStep.mockImplementation(async (input: Record<string, unknown>) => {
      if (input['operationKey'] === 'provider:1') {
        return {
          operationResult: 'covered',
          estimatedCostMicrousd: FIRST_BLOCK_MICROUSD,
          estimatedCostCents: 0,
        };
      }
      throw new ManagedUsageRequestError('weekly', 429, 'rolling_weekly_limit_reached');
    });

    const response = await extend({ block: 2, settlement: SETTLEMENT });

    expect(response.status).toBe(429);
    const error = await errorBody(response);
    expect(error['code']).toBe('rolling_weekly_limit_reached');
    expect(error['resets_at']).toBe(WEEKLY_RESET);
    expect(mocks.touchSession).not.toHaveBeenCalled();
  });

  it('refuses an extension past the voice minute allowance before reserving it', async () => {
    mocks.assertAllowance.mockRejectedValue(
      new ManagedUsageRequestError('minutes', 402, 'insufficient_credits'),
    );

    const response = await extend({ block: 2, settlement: SETTLEMENT });

    expect(response.status).toBe(402);
    expect(stepCalls().map((call) => call['operationKey'])).toEqual(['provider:1']);
  });

  it('answers an extension that already went through without reserving again', async () => {
    const extendedMicrousd = 2 * FIRST_BLOCK_MICROUSD;
    mocks.readReservation.mockResolvedValue({
      reservedMicrousd: extendedMicrousd,
      extensionStatus: 'extended',
      extensionMicrousd: FIRST_BLOCK_MICROUSD,
    });

    const response = await extend({ block: 2, settlement: SETTLEMENT });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ceilingSeconds: liveSessionSecondsCoveredBy(extendedMicrousd, LIVE_MODEL),
    });
    expect(mocks.reserveStep).not.toHaveBeenCalled();
    expect(mocks.assertAllowance).not.toHaveBeenCalled();
  });

  it('retries a pending extension at the amount it was first reserved for', async () => {
    mocks.readReservation.mockResolvedValue({
      reservedMicrousd: FIRST_BLOCK_MICROUSD,
      extensionStatus: 'pending',
      extensionMicrousd: 12_345,
    });

    await extend({ block: 2, settlement: SETTLEMENT });

    expect(mocks.assertAllowance).not.toHaveBeenCalled();
    expect(stepCalls()[1]).toMatchObject({ estimatedCostMicrousd: 12_345 });
  });

  it('refuses to extend a session that has ended or was never recorded', async () => {
    mocks.getSession.mockResolvedValue(activeSession('closed'));
    expect(await errorBody(await extend({ block: 2, settlement: SETTLEMENT }))).toMatchObject({
      code: 'voice_session_closed',
    });

    mocks.getSession.mockResolvedValue(null);
    const missing = await extend({ block: 2, settlement: SETTLEMENT });
    expect(missing.status).toBe(409);

    mocks.storeReady.mockResolvedValue(false);
    const unready = await extend({ block: 2, settlement: SETTLEMENT });
    expect(unready.status).toBe(409);
    expect(mocks.reserveStep).not.toHaveBeenCalled();
  });

  it('refuses to extend a session that holds no reservation', async () => {
    mocks.readReservation.mockResolvedValue(null);

    const response = await extend({ block: 2, settlement: SETTLEMENT });

    expect(response.status).toBe(409);
    expect((await errorBody(response))['code']).toBe('voice_session_unreserved');
    expect(mocks.reserveStep).not.toHaveBeenCalled();
  });

  it('rejects a body that names the first block or carries no settlement', async () => {
    for (const body of [
      { block: 1, settlement: SETTLEMENT },
      { block: 2 },
      { settlement: SETTLEMENT },
    ]) {
      const response = await extend(body);
      expect(response.status).toBe(400);
      expect((await errorBody(response))['code']).toBe('invalid_request');
    }
    expect(mocks.reserveStep).not.toHaveBeenCalled();
  });

  it('refuses a caller whose scoped tenant is another user', async () => {
    mocks.userScopedDb.mockResolvedValue({ db, userId: 'user-2', organizationId: null });

    const response = await extend({ block: 2, settlement: SETTLEMENT });

    expect(response.status).toBe(403);
    expect((await errorBody(response))['code']).toBe('tenant_mismatch');
  });

  it('refuses an unauthenticated caller', async () => {
    mocks.auth.mockRejectedValue(createError.unauthorized('Authentication required'));

    const response = await extend({ block: 2, settlement: SETTLEMENT });

    expect(response.status).toBe(401);
    expect(mocks.reserveStep).not.toHaveBeenCalled();
  });

  it('returns a CSRF refusal unchanged', async () => {
    mocks.csrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));

    const response = await extend({ block: 2, settlement: SETTLEMENT });

    expect(response.status).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it('answers 503 billing_unavailable when billing fails for another reason', async () => {
    mocks.entitlement.mockRejectedValue(new Error('entitlement store down'));

    const response = await extend({ block: 2, settlement: SETTLEMENT });

    expect(response.status).toBe(503);
    expect((await errorBody(response))['code']).toBe('billing_unavailable');
  });

  it('still extends when the session could not be marked as seen', async () => {
    mocks.touchSession.mockRejectedValue(new Error('write failed'));

    const response = await extend({ block: 2, settlement: SETTLEMENT });

    expect(response.status).toBe(200);
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
    mocks.getSession.mockResolvedValue({
      ...activeSession(),
      conversationId: '22222222-2222-4222-8222-222222222222',
    });
    db.query.mockImplementation(async (sql: string) =>
      sql.includes('as marked') ? [{ marked: true, project_id: null }] : [],
    );

    const response = await extend({ block: 2, settlement: SETTLEMENT });

    expect(response.status).toBe(403);
    expect((await errorBody(response))['code']).toBe('model_may_train');
    expect(mocks.reserveStep).not.toHaveBeenCalled();
  });
});
