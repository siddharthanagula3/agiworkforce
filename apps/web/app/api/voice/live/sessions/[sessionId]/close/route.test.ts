// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getRoutingSlotModel } from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({
  settledCost: vi.fn(),
  backendCost: vi.fn(),
  finalize: vi.fn(),
  reserve: vi.fn(),
  userScopedDb: vi.fn(),
  plan: vi.fn(async () => 'pro'),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mocks.userScopedDb(...args),
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveEntitlementBundle: vi.fn(async () => ({ plan: await mocks.plan() })),
}));
vi.mock('@/lib/services/cogs-ledger-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordSettledProviderCost: (...args: unknown[]) => mocks.settledCost(...args),
}));
vi.mock('@/lib/voice/live-voice-backend-cost', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordLiveVoiceBackendCost: (...args: unknown[]) => mocks.backendCost(...args),
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  finalizeManagedUsageRequest: (...args: unknown[]) => mocks.finalize(...args),
  reserveManagedUsageRequest: (...args: unknown[]) => mocks.reserve(...args),
}));

const { POST } = await import('./route');
const { liveSessionProviderCostMicrousd } = await import('@/lib/voice/live-voice-billing');
const { ledgerCentsFromMicrousd } = await import('@/lib/services/credit-service');

const SESSION_ID = 'live_1';
const LIVE_MODEL = getRoutingSlotModel('voice_live');

interface StoredSession {
  started_at: string;
  closed_at: string | null;
  status: 'active' | 'closed';
}

function sessionRow(session: StoredSession): Record<string, unknown> {
  return {
    id: 'row-1',
    user_id: 'user-1',
    organization_id: null,
    conversation_id: 'conv-1',
    provider: 'openai',
    provider_session_id: SESSION_ID,
    model_id: LIVE_MODEL,
    surface: 'web',
    voice: 'marin',
    language: null,
    pace: 1,
    active_tools: [],
    last_turn_id: null,
    status: session.status,
    close_reason: null,
    started_at: session.started_at,
    last_seen_at: session.started_at,
    closed_at: session.closed_at,
  };
}

function scopeWith(session: StoredSession | null): { statements: string[] } {
  const statements: string[] = [];
  const db = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('to_regclass')) return [{ ready: true }];
      if (!session) return [];
      if (sql.trimStart().startsWith('select')) return [sessionRow(session)];
      if (session.status === 'closed') return [];
      return [sessionRow({ ...session, status: 'closed', closed_at: new Date().toISOString() })];
    },
  };
  mocks.userScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
  return { statements };
}

function close(body: Record<string, unknown>): Promise<Response> {
  const request = new NextRequest(`http://localhost/api/voice/live/sessions/${SESSION_ID}/close`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ sessionId: SESSION_ID }) });
}

function recordedSessionCost(): Record<string, unknown> {
  const [call] = mocks.settledCost.mock.calls as [[Record<string, unknown>]];
  return call[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settledCost.mockResolvedValue(undefined);
  mocks.backendCost.mockResolvedValue(undefined);
});

describe('POST /api/voice/live/sessions/[sessionId]/close', () => {
  it('closes the record and books the provider cost without charging any spend window', async () => {
    const startedAt = new Date(Date.now() - 184_000).toISOString();
    const { statements } = scopeWith({ started_at: startedAt, closed_at: null, status: 'active' });

    const response = await close({ seconds: 0 });

    expect(response.status).toBe(200);
    const { billedSeconds } = (await response.json()) as { billedSeconds: number };
    expect(billedSeconds).toBeGreaterThanOrEqual(184);
    expect(statements.some((sql) => sql.includes("set status = 'closed'"))).toBe(true);
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
    const cost = recordedSessionCost();
    const providerCost = liveSessionProviderCostMicrousd(billedSeconds, LIVE_MODEL) ?? 0;
    expect(cost).toMatchObject({
      userId: 'user-1',
      provider: 'openai',
      model: LIVE_MODEL,
      actualCostCents: ledgerCentsFromMicrousd(providerCost),
      customerCanonicalMicrousd: 0,
      sourceRef: `live_voice_session:${SESSION_ID}`,
    });
    expect(cost['usage']).toMatchObject({
      operation: 'voice_live_session',
      billedSeconds,
      reportedSeconds: 0,
    });
  });

  it('meters the span the record proves, not a larger report from the tab', async () => {
    scopeWith({
      started_at: new Date(Date.now() - 30_000).toISOString(),
      closed_at: null,
      status: 'active',
    });

    const { billedSeconds } = (await (await close({ seconds: 900 })).json()) as {
      billedSeconds: number;
    };

    expect(billedSeconds).toBeLessThan(40);
  });

  it('answers a repeat close from the closed record and books nothing twice', async () => {
    const startedAt = new Date(Date.now() - 120_000).toISOString();
    const closedAt = new Date(Date.now() - 60_000).toISOString();
    scopeWith({ started_at: startedAt, closed_at: closedAt, status: 'closed' });

    const response = await close({ seconds: 60 });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { billedSeconds: number }).billedSeconds).toBe(60);
    expect(mocks.settledCost).not.toHaveBeenCalled();
    expect(mocks.backendCost).not.toHaveBeenCalled();
  });

  it('books the delegated backend at the plan backend, ignoring a model the client names', async () => {
    scopeWith({ started_at: new Date().toISOString(), closed_at: null, status: 'active' });
    const report = { inputTokens: 1_300, outputTokens: 250, cachedTokens: 700, webSearchCalls: 1 };

    await close({ seconds: 30, backend: { ...report, model: 'a-cheaper-model' } });

    expect(mocks.backendCost).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        sessionId: SESSION_ID,
        backendModel: getRoutingSlotModel('voice_live_backend'),
        reported: report,
      }),
    );
  });

  it('books a free plan session against the backend the free plan delegated to', async () => {
    scopeWith({ started_at: new Date().toISOString(), closed_at: null, status: 'active' });
    mocks.plan.mockResolvedValueOnce('free');

    await close({ seconds: 30, backend: { inputTokens: 1_000, outputTokens: 200 } });

    expect(mocks.backendCost).toHaveBeenCalledWith(
      expect.objectContaining({ backendModel: getRoutingSlotModel('voice_live_backend_free') }),
    );
  });

  it('closes nothing for a session id the server never started', async () => {
    scopeWith(null);

    const response = await close({ seconds: 5 });

    expect(response.status).toBe(404);
    expect(mocks.settledCost).not.toHaveBeenCalled();
  });

  it('closes nothing while the session record cannot be read', async () => {
    const db = {
      query: async (sql: string) => {
        if (sql.includes('to_regclass')) return [{ ready: true }];
        throw new Error('database unavailable');
      },
    };
    mocks.userScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });

    expect((await close({ seconds: 5 })).status).toBe(503);
    expect(mocks.settledCost).not.toHaveBeenCalled();
  });

  it('refuses a close that carries no usage report at all', async () => {
    scopeWith({ started_at: new Date().toISOString(), closed_at: null, status: 'active' });

    expect((await close({})).status).toBe(400);
    expect(mocks.settledCost).not.toHaveBeenCalled();
  });
});
