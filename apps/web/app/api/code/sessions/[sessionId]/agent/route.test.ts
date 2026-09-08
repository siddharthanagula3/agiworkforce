import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetUserScopedDb,
  mockRateLimit,
  mockCsrf,
  mockE2bReady,
  mockBetaEnabled,
  mockRunTurn,
  mockGetSubscription,
  mockEvaluateAccess,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockRateLimit: vi.fn(),
  mockCsrf: vi.fn(),
  mockE2bReady: vi.fn(),
  mockBetaEnabled: vi.fn(),
  mockRunTurn: vi.fn(),
  mockGetSubscription: vi.fn(),
  mockEvaluateAccess: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/e2b/gate', () => ({
  e2bProvisioningReady: mockE2bReady,
  E2B_API_KEY_ENV: 'E2B_API_KEY',
  e2bExecutionEnabled: vi.fn(),
}));
vi.mock('@/lib/managed-compute-gate', () => ({
  isManagedComputePrivateBetaEnabled: mockBetaEnabled,
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mockGetSubscription },
}));
vi.mock('@/lib/services/managed-compute-access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/managed-compute-access')>();
  return { ...actual, evaluateManagedComputeAccess: mockEvaluateAccess };
});
vi.mock('@/lib/services/cloud-code-turn-transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-turn-transport')>();
  return { ...actual, runCloudCodeTurn: mockRunTurn };
});

import {
  CloudCodeConflictError,
  CloudCodeNotFoundError,
} from '@/lib/services/cloud-code-session-service';
import { CloudCodeTurnStillRunningError } from '@/lib/services/cloud-code-turn-transport';
import { POST } from './route';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const IDEMPOTENCY_KEY = '44444444-4444-4444-8444-444444444444';
const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };

function turnRequest(
  body: unknown = { goal: 'fix the failing test', model: 'a-model' },
  headers: Record<string, string> = { 'idempotency-key': IDEMPOTENCY_KEY },
): NextRequest {
  return new NextRequest(`http://localhost:3000/api/code/sessions/${SESSION_ID}/agent`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockResolvedValue(null);
  mockE2bReady.mockReturnValue(true);
  mockBetaEnabled.mockReturnValue(true);
  mockGetSubscription.mockResolvedValue({ plan_tier: 'pro', status: 'active' });
  mockEvaluateAccess.mockResolvedValue({ allowed: true });
  mockGetUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
  mockRunTurn.mockResolvedValue({
    turnId: '22222222-2222-4222-8222-222222222222',
    stopReason: 'done',
    stepsUsed: 2,
    inputTokens: 10,
    outputTokens: 3,
    finalMessage: 'renamed the fixture',
    steps: [],
  });
});

describe('POST /api/code/sessions/[sessionId]/agent', () => {
  it('runs the turn and answers with what it did', async () => {
    const response = await POST(turnRequest(), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      stopReason: 'done',
      finalMessage: 'renamed the fixture',
    });
    expect(mockRunTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        goal: 'fix the failing test',
        model: 'a-model',
        idempotencyKey: IDEMPOTENCY_KEY,
        planTier: 'pro',
      }),
    );
  });

  it('refuses when managed Code is not enabled for this deployment', async () => {
    mockE2bReady.mockReturnValue(false);
    const response = await POST(turnRequest(), context);
    expect(response.status).toBe(503);
    expect(mockRunTurn).not.toHaveBeenCalled();
  });

  it('refuses while managed compute is switched off', async () => {
    mockBetaEnabled.mockReturnValue(false);
    const response = await POST(turnRequest(), context);
    expect(response.status).toBe(503);
    expect(mockRunTurn).not.toHaveBeenCalled();
  });

  it('refuses when the plan does not reach managed compute, in the gate own words', async () => {
    mockEvaluateAccess.mockResolvedValue({
      allowed: false,
      reason: 'Your plan does not include managed compute.',
      code: 'managed_compute_not_entitled',
    });
    const response = await POST(turnRequest(), context);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'managed_compute_not_entitled' },
    });
    expect(mockRunTurn).not.toHaveBeenCalled();
  });

  it('refuses without a csrf token', async () => {
    mockCsrf.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await POST(turnRequest(), context);
    expect(response.status).toBe(403);
    expect(mockRunTurn).not.toHaveBeenCalled();
  });

  it('refuses without an idempotency key, because the ledger cannot bill the turn without one', async () => {
    const response = await POST(turnRequest(undefined, {}), context);
    expect(response.status).toBe(400);
    expect(mockRunTurn).not.toHaveBeenCalled();
  });

  it('refuses a goal or model that is not there', async () => {
    for (const body of [
      { model: 'a-model' },
      { goal: '   ', model: 'a-model' },
      { goal: 'fix it' },
    ]) {
      const response = await POST(turnRequest(body), context);
      expect(response.status).toBe(400);
    }
    expect(mockRunTurn).not.toHaveBeenCalled();
  });

  it('passes a closed or archived refusal through as a 409', async () => {
    mockRunTurn.mockRejectedValue(
      new CloudCodeConflictError(
        'This Code session is archived. Unarchive it to run agent turns in this session.',
      ),
    );
    const response = await POST(turnRequest(), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringMatching(/unarchive/i) },
    });
  });

  it('answers 404 for a session this account does not own', async () => {
    mockRunTurn.mockRejectedValue(new CloudCodeNotFoundError());
    const response = await POST(turnRequest(), context);
    expect(response.status).toBe(404);
  });

  it('says the turn is still running rather than reporting a failure', async () => {
    mockRunTurn.mockRejectedValue(new CloudCodeTurnStillRunningError());
    const response = await POST(turnRequest(), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringMatching(/still running/i) },
    });
  });
});
