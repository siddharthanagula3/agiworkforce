// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { chargeMicrousdForProviderCost, getRoutingSlotModel } from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({
  finalize: vi.fn(),
  backendCost: vi.fn(),
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
vi.mock('@/lib/voice/live-voice-backend-cost', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordLiveVoiceBackendCost: (...args: unknown[]) => mocks.backendCost(...args),
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  finalizeManagedUsageRequest: (...args: unknown[]) => mocks.finalize(...args),
}));

const { POST } = await import('./route');
const { liveSessionChargeMicrousd, liveVoiceBlockChargeMicrousd } =
  await import('@/lib/voice/live-voice-billing');
const { priceLiveVoiceBackend } = await import('@/lib/voice/live-voice-backend-cost');
const { voiceReservationIdentity } = await import('../../lib/voice-session-budget');

const SESSION_ID = 'live_1';
const LIVE_MODEL = getRoutingSlotModel('voice_live');
const PAID_BACKEND = getRoutingSlotModel('voice_live_backend');
const BLOCK = liveVoiceBlockChargeMicrousd(LIVE_MODEL, PAID_BACKEND)!;

interface StoredSession {
  started_at: string;
  closed_at: string | null;
  status: 'active' | 'closed';
}

function sessionRow(session: StoredSession): Record<string, unknown> {
  return {
    id: 'vs_1',
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

function scopeWith(session: StoredSession | null, reservedMicrousd = 5 * BLOCK) {
  const db = {
    query: async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ ready: true }];
      if (sql.includes('from public.managed_usage_requests request')) {
        return [
          { reserved_microusd: reservedMicrousd, extension_status: null, extension_microusd: null },
        ];
      }
      if (!session) return [];
      if (sql.trimStart().startsWith('select')) return [sessionRow(session)];
      if (session.status === 'closed') return [];
      return [sessionRow({ ...session, status: 'closed', closed_at: new Date().toISOString() })];
    },
  };
  mocks.userScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
}

function close(body: Record<string, unknown>): Promise<Response> {
  const request = new NextRequest(`http://localhost/api/voice/live/sessions/${SESSION_ID}/close`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ sessionId: SESSION_ID }) });
}

function finalized(): Record<string, unknown> {
  return mocks.finalize.mock.calls.at(-1)![0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.finalize.mockResolvedValue({});
  mocks.backendCost.mockResolvedValue(undefined);
});

describe('POST /api/voice/live/sessions/[sessionId]/close', () => {
  it('settles the record span and the backend tokens at the plan backend, from the shared budget', async () => {
    scopeWith({
      started_at: new Date(Date.now() - 130_000).toISOString(),
      closed_at: null,
      status: 'active',
    });
    const report = { inputTokens: 1_300, outputTokens: 250, cachedTokens: 700, webSearchCalls: 1 };

    const response = await close({ seconds: 0, backend: { ...report, model: 'a-cheaper-model' } });

    expect(response.status).toBe(200);
    const { billedSeconds } = (await response.json()) as { billedSeconds: number };
    expect(billedSeconds).toBeGreaterThanOrEqual(130);
    const backend = priceLiveVoiceBackend({
      provider: 'openai',
      backendModel: PAID_BACKEND,
      reported: report,
    });
    expect(finalized()).toMatchObject({
      ...voiceReservationIdentity('vs_1'),
      outcome: 'completed',
      actualCostMicrousd:
        liveSessionChargeMicrousd(billedSeconds, LIVE_MODEL)! +
        chargeMicrousdForProviderCost(backend.totalMicrousd),
      usage: expect.objectContaining({ operation: 'voice_live_session', billedSeconds }),
    });
    expect(mocks.backendCost).toHaveBeenCalledWith(
      expect.objectContaining({ backendModel: PAID_BACKEND, reported: report }),
    );
  });

  it('prices a free plan session against the free backend', async () => {
    scopeWith({ started_at: new Date().toISOString(), closed_at: null, status: 'active' });
    mocks.plan.mockResolvedValueOnce('free');

    await close({ seconds: 5, backend: { inputTokens: 1_000, outputTokens: 200 } });

    expect(mocks.backendCost).toHaveBeenCalledWith(
      expect.objectContaining({ backendModel: getRoutingSlotModel('voice_live_backend_free') }),
    );
  });

  it('answers a repeat close from the closed record and settles nothing twice', async () => {
    scopeWith({
      started_at: new Date(Date.now() - 120_000).toISOString(),
      closed_at: new Date(Date.now() - 60_000).toISOString(),
      status: 'closed',
    });

    const response = await close({ seconds: 60 });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { billedSeconds: number }).billedSeconds).toBe(60);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('closes nothing for a session id the server never started', async () => {
    scopeWith(null);

    expect((await close({ seconds: 5 })).status).toBe(404);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('refuses a close that carries no usage report at all', async () => {
    scopeWith({ started_at: new Date().toISOString(), closed_at: null, status: 'active' });

    expect((await close({})).status).toBe(400);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
});
