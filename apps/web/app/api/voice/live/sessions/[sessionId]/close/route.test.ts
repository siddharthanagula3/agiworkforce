// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  finalize: vi.fn(),
  clientDelivered: vi.fn(),
  backendCost: vi.fn(),
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
const { LIVE_SESSION_BLOCK_MINUTES, liveSessionCostCents } =
  await import('@/lib/voice/live-voice-billing');

const SESSION_ID = 'live_1';
const CEILING_SECONDS = LIVE_SESSION_BLOCK_MINUTES * 60;
const SETTLEMENT = {
  idempotencyKey: 'agi.voice.live.test',
  leaseToken: 'lease',
  requestHash: 'hash',
  estimatedCostCents: liveSessionCostCents(CEILING_SECONDS),
  ceilingSeconds: CEILING_SECONDS,
};

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
    model_id: 'live-model',
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

function settledUsage(): Record<string, unknown> {
  const [call] = mocks.finalize.mock.calls as [[Record<string, unknown>]];
  return call[0]['usage'] as Record<string, unknown>;
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
    const body = (await response.json()) as { billedSeconds: number; actualCostCents: number };
    expect(body.billedSeconds).toBeGreaterThanOrEqual(184);
    expect(body.actualCostCents).toBe(liveSessionCostCents(body.billedSeconds));
    const usage = settledUsage();
    expect(usage['reportedSeconds']).toBe(0);
    expect(Number(usage['billedSeconds'])).toBe(body.billedSeconds);
  });

  it('never bills less than the client reported', async () => {
    scopeWith({ started_at: new Date().toISOString(), closed_at: null, status: 'active' });

    const response = await close({ seconds: 45, settlement: SETTLEMENT });

    const body = (await response.json()) as { billedSeconds: number };
    expect(body.billedSeconds).toBe(45);
  });

  it('stops at the ceiling the reservation was taken against', async () => {
    const startedAt = new Date(Date.now() - (CEILING_SECONDS + 3_600) * 1_000).toISOString();
    scopeWith({ started_at: startedAt, closed_at: null, status: 'active' });

    const response = await close({ seconds: 0, settlement: SETTLEMENT });

    const body = (await response.json()) as { billedSeconds: number; actualCostCents: number };
    expect(body.billedSeconds).toBe(CEILING_SECONDS);
    expect(body.actualCostCents).toBe(SETTLEMENT.estimatedCostCents);
  });

  it('settles a repeat close against the same span, so the minutes are metered once', async () => {
    const startedAt = new Date(Date.now() - 120_000).toISOString();
    const closedAt = new Date(Date.now() - 60_000).toISOString();
    scopeWith({ started_at: startedAt, closed_at: closedAt, status: 'closed' });

    const response = await close({ seconds: 0, settlement: SETTLEMENT });

    const body = (await response.json()) as { billedSeconds: number };
    expect(body.billedSeconds).toBe(60);
    const [call] = mocks.finalize.mock.calls as [[Record<string, unknown>]];
    expect(call[0]['idempotencyKey']).toBe(SETTLEMENT.idempotencyKey);
    expect(call[0]['leaseToken']).toBe(SETTLEMENT.leaseToken);
  });

  it('falls back to the report on a deployment with no session store', async () => {
    scopeWith(null);

    const response = await close({ seconds: 30, settlement: SETTLEMENT });

    const body = (await response.json()) as { billedSeconds: number };
    expect(body.billedSeconds).toBe(30);
  });

  it('refuses a close that carries no usage report at all', async () => {
    scopeWith({ started_at: new Date().toISOString(), closed_at: null, status: 'active' });

    const response = await close({ settlement: SETTLEMENT });

    expect(response.status).toBe(400);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
});
