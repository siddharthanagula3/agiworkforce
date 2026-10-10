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
type ScanModule11 = typeof import('../../lib/voice-session-store');

const mocks = vi.hoisted(() => ({
  csrf: vi.fn(),
  auth: vi.fn(),
  userScopedDb: vi.fn(),
  entitlement: vi.fn(),
  reserveStep: vi.fn(),
  assertAllowance: vi.fn(),
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
vi.mock('../../lib/voice-session-store', async (importOriginal) => ({
  ...(await importOriginal<ScanModule11>()),
  isVoiceSessionStoreReady: (...args: unknown[]) => mocks.storeReady(...args),
  getVoiceSessionByProviderId: (...args: unknown[]) => mocks.getSession(...args),
  touchVoiceSession: (...args: unknown[]) => mocks.touchSession(...args),
}));

const { POST, OPTIONS } = await import('./route');
const { createError } = await import('@/lib/errors');
const { ManagedUsageRequestError } = await import('@/lib/services/managed-usage-request-service');
const { LIVE_SESSION_CEILING_SECONDS } = await import('@/lib/voice/live-voice-billing');

const SESSION_ID = 'live_1';
const LIVE_MODEL = getRoutingSlotModel('voice_live');
const RESET_AT = '2026-11-01T00:00:00.000Z';
const STARTED_SECONDS_AGO = 540;
const db = { query: vi.fn() };

function activeSession(status: 'active' | 'closed' = 'active') {
  return {
    id: 'vs_1',
    userId: 'user-1',
    provider: 'openai',
    providerSessionId: SESSION_ID,
    modelId: LIVE_MODEL,
    status,
    startedAt: new Date(Date.now() - STARTED_SECONDS_AGO * 1_000).toISOString(),
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

function minutesLeft(hardLimit: number | null, consumed: number): void {
  mocks.assertAllowance.mockResolvedValue({
    unit: 'voice_minutes',
    hardLimit,
    softLimit: null,
    consumed,
    requested: 1,
    softLimitReached: false,
  });
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
  minutesLeft(300, 20);
});

describe('POST /api/voice/live/sessions/[sessionId]/extend', () => {
  it('extends a running session by the next block its voice minutes cover, with no money reserved', async () => {
    const response = await extend({ block: 2 });

    expect(response.status).toBe(200);
    const { ceilingSeconds } = (await response.json()) as { ceilingSeconds: number };
    expect(ceilingSeconds).toBeGreaterThanOrEqual(
      STARTED_SECONDS_AGO + LIVE_SESSION_CEILING_SECONDS,
    );
    expect(ceilingSeconds).toBeLessThanOrEqual(
      STARTED_SECONDS_AGO + LIVE_SESSION_CEILING_SECONDS + 2,
    );
    expect(mocks.assertAllowance).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', planTier: 'pro', unit: 'voice_minutes' }),
    );
    expect(mocks.reserveStep).not.toHaveBeenCalled();
    expect(mocks.touchSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.assertAllowance.mock.invocationCallOrder[0]!,
    );
  });

  it('holds the extension to the minutes the plan has left', async () => {
    minutesLeft(300, 297);

    const { ceilingSeconds } = (await (await extend({ block: 2 })).json()) as {
      ceilingSeconds: number;
    };

    expect(ceilingSeconds - STARTED_SECONDS_AGO).toBeGreaterThanOrEqual(180);
    expect(ceilingSeconds - STARTED_SECONDS_AGO).toBeLessThanOrEqual(182);
  });

  it('gives an unlimited plan a whole block', async () => {
    mocks.entitlement.mockResolvedValue({ plan: 'max', catalogVersion: 3 });
    minutesLeft(null, 0);

    const { ceilingSeconds } = (await (await extend({ block: 2 })).json()) as {
      ceilingSeconds: number;
    };

    expect(ceilingSeconds - STARTED_SECONDS_AGO).toBeGreaterThanOrEqual(
      LIVE_SESSION_CEILING_SECONDS,
    );
  });

  it('ends the call at the ceiling with the reset date once the minutes run out', async () => {
    const refusal = new ManagedUsageRequestError(
      'used up',
      429,
      'voice_minutes_monthly_limit_reached',
    );
    refusal.limitContext = { resetsAt: RESET_AT, alternativeModel: null };
    mocks.assertAllowance.mockRejectedValue(refusal);

    const response = await extend({ block: 2 });

    expect(response.status).toBe(429);
    const error = await errorBody(response);
    expect(error['code']).toBe('voice_minutes_monthly_limit_reached');
    expect(error['resets_at']).toBe(RESET_AT);
    expect(String(error['message'])).toContain('They reset on November 1.');
    expect(String(error['message'])).toContain('Continue in text');
  });

  it('refuses to extend a session that has ended or was never recorded', async () => {
    mocks.getSession.mockResolvedValue(activeSession('closed'));
    expect((await extend({ block: 2 })).status).toBe(409);

    mocks.getSession.mockResolvedValue(null);
    expect((await extend({ block: 2 })).status).toBe(409);
    expect(mocks.assertAllowance).not.toHaveBeenCalled();
  });

  it('rejects a body that names the first block', async () => {
    expect((await extend({ block: 1 })).status).toBe(400);
    expect((await extend({})).status).toBe(400);
  });

  it('refuses a caller whose scoped tenant is another user', async () => {
    mocks.userScopedDb.mockResolvedValue({ db, userId: 'user-2', organizationId: null });

    const response = await extend({ block: 2 });

    expect(response.status).toBe(403);
    expect((await errorBody(response))['code']).toBe('tenant_mismatch');
  });

  it('refuses an unauthenticated caller', async () => {
    mocks.auth.mockRejectedValue(createError.unauthorized('Authentication required'));

    expect((await extend({ block: 2 })).status).toBe(401);
    expect(mocks.assertAllowance).not.toHaveBeenCalled();
  });

  it('returns a CSRF refusal unchanged', async () => {
    mocks.csrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));

    const response = await extend({ block: 2 });

    expect(response.status).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it('answers 503 billing_unavailable when the plan cannot be read', async () => {
    mocks.entitlement.mockRejectedValue(new Error('entitlement store down'));

    const response = await extend({ block: 2 });

    expect(response.status).toBe(503);
    expect((await errorBody(response))['code']).toBe('billing_unavailable');
  });

  it('still extends when the session could not be marked as seen', async () => {
    mocks.touchSession.mockRejectedValue(new Error('write failed'));

    expect((await extend({ block: 2 })).status).toBe(200);
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

    const response = await extend({ block: 2 });

    expect(response.status).toBe(403);
    expect((await errorBody(response))['code']).toBe('model_may_train');
    expect(mocks.assertAllowance).not.toHaveBeenCalled();
  });
});
