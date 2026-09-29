import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { encodeKeysetCursor } from '@/lib/identity/pagination';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  isAuthGateRefusal: vi.fn(),
  unauthorizedResponseFor: vi.fn(),
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
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/api-auth-response', () => ({
  isAuthGateRefusal: mocks.isAuthGateRefusal,
  unauthorizedResponseFor: mocks.unauthorizedResponseFor,
}));

import { GET } from '../route';

const ID_1 = '11111111-1111-4111-8111-111111111111';
const ID_2 = '22222222-2222-4222-8222-222222222222';
const ID_3 = '33333333-3333-4333-8333-333333333333';
const db = { query: vi.fn() };

function get(query = '') {
  return GET(new NextRequest(`http://localhost/api/settings/approvals${query}`));
}

function row(id: string, decision: string | null, toolName: string | null = 'send_email') {
  return {
    id,
    tool_name: toolName,
    decision,
    conversation_id: 'conv-1',
    created_at: '2026-09-01T00:00:00.000Z',
    page_sort_key: '2026-09-01T00:00:00.000000Z',
  };
}

describe('GET /api/settings/approvals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.query.mockReset();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
    mocks.isAuthGateRefusal.mockReturnValue(false);
  });

  it('returns the rate limit response', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await get();

    expect(response.status).toBe(429);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getUserScopedDb.mockRejectedValue(new Error('no session'));

    const response = await get();

    expect(response.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns the gate refusal response for an mfa or ip gate refusal', async () => {
    const refusal = new Error('mfa required');
    mocks.getUserScopedDb.mockRejectedValue(refusal);
    mocks.isAuthGateRefusal.mockReturnValue(true);
    mocks.unauthorizedResponseFor.mockReturnValue(
      NextResponse.json({ error: { code: 'MFA_REQUIRED' } }, { status: 403 }),
    );

    const response = await get();

    expect(response.status).toBe(403);
    expect(mocks.unauthorizedResponseFor).toHaveBeenCalledWith(refusal);
  });

  it.each([
    ['a limit above 100', '?limit=101'],
    ['a non numeric limit', '?limit=abc'],
    ['an undecodable cursor', '?cursor=garbage'],
    ['a cursor with a bad sort key', `?cursor=${encodeKeysetCursor({ sortValue: 'x', id: ID_1 })}`],
  ])('rejects %s with 400', async (_label, query) => {
    const response = await get(query);

    expect(response.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('lists only the caller decided approvals and pages with a cursor', async () => {
    db.query.mockResolvedValue([
      row(ID_1, 'approved'),
      row(ID_2, 'pending'),
      row(ID_3, 'rejected', null),
    ]);

    const response = await get('?limit=2');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      approvals: [
        {
          id: ID_1,
          toolName: 'send_email',
          decision: 'approved',
          conversationId: 'conv-1',
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      limit: 2,
      hasMore: true,
      nextCursor: expect.any(String),
    });
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(db.query.mock.calls[0]?.[1]).toEqual(['user-1', 3]);
  });

  it('applies a valid cursor as keyset params after the caller id', async () => {
    db.query.mockResolvedValue([]);
    const cursor = encodeKeysetCursor({ sortValue: '2026-09-01T00:00:00.000000Z', id: ID_1 });

    const response = await get(`?cursor=${cursor}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      approvals: [],
      limit: 50,
      hasMore: false,
      nextCursor: null,
    });
    const params = db.query.mock.calls[0]?.[1] as unknown[];
    expect(params.slice(0, 2)).toEqual(['user-1', 51]);
    expect(params).toContain(ID_1);
  });

  it('hides database failures behind a 500', async () => {
    db.query.mockRejectedValue(new Error('connection reset'));

    const response = await get();

    expect(response.status).toBe(500);
  });
});
