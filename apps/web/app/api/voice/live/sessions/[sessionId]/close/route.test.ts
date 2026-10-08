// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getRoutingSlotModel } from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({
  finalize: vi.fn(),
  clientDelivered: vi.fn(),
  backendCost: vi.fn(),
  priceBackend: vi.fn((..._args: unknown[]) => ({ totalMicrousd: 0 })),
  userScopedDb: vi.fn(),
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
vi.mock('@/lib/voice/live-voice-backend-cost', () => ({
  recordLiveVoiceBackendCost: (...args: unknown[]) => mocks.backendCost(...args),
  priceLiveVoiceBackend: (...args: unknown[]) => mocks.priceBackend(...args),
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    finalizeManagedUsageRequest: (...args: unknown[]) => mocks.finalize(...args),
    markManagedUsageClientDelivered: (...args: unknown[]) => mocks.clientDelivered(...args),
  };
});

const { POST } = await import('./route');
const { LIVE_SESSION_CEILING_SECONDS, liveSessionChargeMicrousd, liveSessionProviderCostMicrousd } =
  await import('@/lib/voice/live-voice-billing');

const SESSION_ID = 'live_1';
const LIVE_MODEL = getRoutingSlotModel('voice_live');
const SETTLEMENT = {
  idempotencyKey: 'agi.voice.live.test',
  leaseToken: 'lease',
  requestHash: 'hash',
};

function charge(seconds: number): number {
  return liveSessionChargeMicrousd(seconds, LIVE_MODEL) as number;
}

const ONE_BLOCK_MICROUSD = charge(LIVE_SESSION_CEILING_SECONDS);

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

function scopeWith(
  session: StoredSession | null,
  reservation: { reservedMicrousd: number } | 'unreadable' | null = {
    reservedMicrousd: ONE_BLOCK_MICROUSD,
  },
): { statements: string[] } {
  const statements: string[] = [];
  const db = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('from public.managed_usage_requests')) {
        if (reservation === 'unreadable') throw new Error('ledger unavailable');
        return reservation
          ? [
              {
                reserved_microusd: String(reservation.reservedMicrousd),
                extension_status: null,
                extension_microusd: null,
              },
            ]
          : [];
      }
      if (sql.includes('to_regclass')) return [{ ready: session !== null }];
      if (!session) return [];
      if (sql.startsWith('select')) return [sessionRow(session)];
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

function finalized(): Record<string, unknown> {
  const [call] = mocks.finalize.mock.calls as [[Record<string, unknown>]];
  return call[0];
}

function settledUsage(): Record<string, unknown> {
  return finalized()['usage'] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.finalize.mockResolvedValue({});
  mocks.clientDelivered.mockResolvedValue(undefined);
  mocks.backendCost.mockResolvedValue(undefined);
});

describe('POST /api/voice/live/sessions/[sessionId]/close', () => {
  it('bills the span the session record proves when the client reports nothing', async () => {
    const startedAt = new Date(Date.now() - 184_000).toISOString();
    scopeWith({ started_at: startedAt, closed_at: null, status: 'active' });

    const response = await close({ seconds: 0, settlement: SETTLEMENT });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    const billedSeconds = body['billedSeconds'] as number;
    expect(billedSeconds).toBeGreaterThanOrEqual(184);
    expect(body).not.toHaveProperty('actualCostCents');
    expect(finalized()['outcome']).toBe('completed');
    expect(finalized()['actualCostMicrousd']).toBe(charge(billedSeconds));
    expect(finalized()['providerCostMicrousd']).toBe(
      liveSessionProviderCostMicrousd(billedSeconds, LIVE_MODEL),
    );
    const usage = settledUsage();
    expect(usage['reportedSeconds']).toBe(0);
    expect(Number(usage['billedSeconds'])).toBe(billedSeconds);
    expect(usage['costSource']).toBe('provider_published_rate');
  });

  it('never bills less than the client reported', async () => {
    scopeWith({ started_at: new Date().toISOString(), closed_at: null, status: 'active' });

    const response = await close({ seconds: 45, settlement: SETTLEMENT });

    const body = (await response.json()) as { billedSeconds: number };
    expect(body.billedSeconds).toBe(45);
    expect(finalized()['actualCostMicrousd']).toBe(charge(45));
  });

  it('stops at what the reservation covers', async () => {
    const startedAt = new Date(
      Date.now() - (LIVE_SESSION_CEILING_SECONDS + 3_600) * 1_000,
    ).toISOString();
    scopeWith({ started_at: startedAt, closed_at: null, status: 'active' });

    const response = await close({ seconds: 0, settlement: SETTLEMENT });

    const body = (await response.json()) as { billedSeconds: number };
    expect(body.billedSeconds).toBe(LIVE_SESSION_CEILING_SECONDS);
    expect(finalized()['actualCostMicrousd']).toBe(ONE_BLOCK_MICROUSD);
    expect(finalized()['estimatedCostMicrousd']).toBe(ONE_BLOCK_MICROUSD);
  });

  it('bills an extended session up to the blocks it reserved, never past them', async () => {
    const extendedMicrousd = charge(2 * LIVE_SESSION_CEILING_SECONDS);
    const startedAt = new Date(Date.now() - 3 * LIVE_SESSION_CEILING_SECONDS * 1_000).toISOString();
    scopeWith(
      { started_at: startedAt, closed_at: null, status: 'active' },
      { reservedMicrousd: extendedMicrousd },
    );

    const response = await close({ seconds: 0, settlement: SETTLEMENT });

    const body = (await response.json()) as { billedSeconds: number };
    expect(body.billedSeconds).toBe(2 * LIVE_SESSION_CEILING_SECONDS);
    expect(finalized()['actualCostMicrousd']).toBe(extendedMicrousd);
  });

  it('settles against one block when the reservation cannot be read', async () => {
    const startedAt = new Date(Date.now() - 2 * LIVE_SESSION_CEILING_SECONDS * 1_000).toISOString();
    scopeWith({ started_at: startedAt, closed_at: null, status: 'active' }, 'unreadable');

    const response = await close({ seconds: 0, settlement: SETTLEMENT });

    const body = (await response.json()) as { billedSeconds: number };
    expect(body.billedSeconds).toBe(LIVE_SESSION_CEILING_SECONDS);
    expect(finalized()['estimatedCostMicrousd']).toBe(ONE_BLOCK_MICROUSD);
  });

  it('settles a repeat close against the same span, so the minutes are metered once', async () => {
    const startedAt = new Date(Date.now() - 120_000).toISOString();
    const closedAt = new Date(Date.now() - 60_000).toISOString();
    scopeWith({ started_at: startedAt, closed_at: closedAt, status: 'closed' });

    const response = await close({ seconds: 0, settlement: SETTLEMENT });

    const body = (await response.json()) as { billedSeconds: number };
    expect(body.billedSeconds).toBe(60);
    expect(finalized()['idempotencyKey']).toBe(SETTLEMENT.idempotencyKey);
    expect(finalized()['leaseToken']).toBe(SETTLEMENT.leaseToken);
  });

  it('falls back to the report on a deployment with no session store', async () => {
    scopeWith(null);

    const response = await close({ seconds: 30, settlement: SETTLEMENT });

    const body = (await response.json()) as { billedSeconds: number };
    expect(body.billedSeconds).toBe(30);
  });

  it('charges the delegated backend spend with the session and records its cost row', async () => {
    scopeWith({ started_at: new Date().toISOString(), closed_at: null, status: 'active' });
    const backend = { inputTokens: 1_000, outputTokens: 200, webSearchCalls: 2 };
    mocks.priceBackend.mockReturnValueOnce({ totalMicrousd: 32_000 });

    await close({ seconds: 30, settlement: SETTLEMENT, backend });

    expect(mocks.priceBackend).toHaveBeenCalledWith(expect.objectContaining({ reported: backend }));
    expect(mocks.backendCost).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', sessionId: SESSION_ID, reported: backend }),
    );
    expect(finalized()['actualCostMicrousd']).toBe(charge(30) + 32_000);
  });

  it('settles nothing for a session id the server never started', async () => {
    const db = {
      query: async (sql: string) => (sql.includes('to_regclass') ? [{ ready: true }] : []),
    };
    mocks.userScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });

    const response = await close({ seconds: 5, settlement: SETTLEMENT });

    expect(response.status).toBe(404);
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.clientDelivered).not.toHaveBeenCalled();
  });

  it('settles nothing while the session record cannot be read', async () => {
    const db = {
      query: async (sql: string) => {
        if (sql.includes('to_regclass')) return [{ ready: true }];
        throw new Error('database unavailable');
      },
    };
    mocks.userScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });

    const response = await close({ seconds: 5, settlement: SETTLEMENT });

    expect(response.status).toBe(503);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('refuses a close that carries no usage report at all', async () => {
    scopeWith({ started_at: new Date().toISOString(), closed_at: null, status: 'active' });

    const response = await close({ settlement: SETTLEMENT });

    expect(response.status).toBe(400);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
});
