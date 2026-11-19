import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockQuery,
  mockExecute,
  mockGetClerkAuthUser,
  mockRequireCsrfToken,
  mockWithRateLimit,
  mockRecordAuditEvent,
  mockGetNeonDb,
  mockOutsideQuery,
  mockCommitted,
  mockGetSubscription,
  stripeMocks,
} = vi.hoisted(() => ({
  mockGetSubscription: vi.fn(),
  stripeMocks: { retrieve: vi.fn(), update: vi.fn() },
  mockOutsideQuery: vi.fn((..._args: unknown[]) => {
    throw new Error('Outside callback');
  }),
  mockCommitted: vi.fn(),
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
  mockRequireCsrfToken: vi.fn(),
  mockWithRateLimit: vi.fn(),
  mockRecordAuditEvent: vi.fn(),
  mockGetNeonDb: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mockWithRateLimit(...args),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: (...args: unknown[]) => mockRequireCsrfToken(...args),
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: async (...args: unknown[]) => {
    const { userId } = (await mockGetClerkAuthUser(...args)) as { userId: string };
    return {
      db: {
        query: (...queryArgs: unknown[]) => mockOutsideQuery(...queryArgs),
        execute: (...executeArgs: unknown[]) => mockExecute(...executeArgs),
        transaction: async (callback: (tx: unknown) => unknown) => {
          const result = await callback({
            query: (...queryArgs: unknown[]) => mockQuery(...queryArgs),
            execute: (...executeArgs: unknown[]) => mockExecute(...executeArgs),
          });
          mockCommitted();
          return result;
        },
      },
      userId,
      organizationId: null,
    };
  },
}));

vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
  BLOCK_APPEAL_PATH: '/support',
  logAuthFailure: vi.fn(async () => undefined),
  getClientIp: vi.fn(),
  logRateLimitExceeded: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mockGetNeonDb }));

vi.mock('@/lib/server/pseudonymize', () => ({
  pseudonymizeIdentifier: vi.fn(() => 'subject-ref'),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
  },
}));

vi.mock('@/lib/server/stripe-client', () => {
  const client = {
    subscriptions: { retrieve: stripeMocks.retrieve, update: stripeMocks.update },
  };
  return { getStripeClient: () => client, getStripeClientOrNull: () => client };
});

import { ACCOUNT_DELETION_RENEWAL_METADATA_KEY } from '@/lib/server/payments/stripe-provider';
import { POST } from '../route';
import { PUT as PUT_SCHEDULE, OPTIONS } from '../../cancel-schedule/route';
import * as protectedRoute from '../../cancel-schedule/route';
import * as legacyRoute from '../route';

function cancelRequest() {
  return new Request('http://localhost:3000/api/user/delete-account/cancel', {
    method: 'POST',
  }) as never;
}

const SCHEDULED_FOR = '2026-11-13T09:30:00.250000Z';
const TAGGED_DEADLINE = '2026-11-13T09:30:00.250Z';

function pgError(code: string): Error {
  return Object.assign(new Error(`postgres error ${code}`), { code });
}

describe('POST /api/user/delete-account/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_cancelling' });
    mockRequireCsrfToken.mockResolvedValue(null);
    mockWithRateLimit.mockResolvedValue(null);
    mockRecordAuditEvent.mockResolvedValue(undefined);
    mockGetSubscription.mockResolvedValue(null);
  });

  it('cancels a deletion inside the grace window and records it symmetrically with scheduling', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'user_cancelling' }])
      .mockResolvedValueOnce([
        { has_schedule: true, pair_matches: true, eligible: true, scheduled_for: SCHEDULED_FOR },
      ])
      .mockResolvedValueOnce([{ id: 'user_cancelling' }]);

    const response = await POST(cancelRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cancelled).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(3);
    const update = mockQuery.mock.calls.find(([sql]) => String(sql).startsWith('update profiles'));
    const [sql, params] = update as [string, unknown[]];
    expect(sql).toMatch(/deletion_requested_at\s*=\s*null/i);
    expect(sql).toMatch(/deletion_scheduled_for\s*=\s*null/i);
    expect(sql).toMatch(/deletion_scheduled_for\s*>\s*clock_timestamp\(\)/i);
    expect(params).toEqual(['user_cancelling']);

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'account_deletion_cancelled',
        detail: expect.objectContaining({ resourceType: 'account', subjectRef: 'subject-ref' }),
      }),
    );
  });

  it('is a clean no-op when nothing is pending, not a 500', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'user_cancelling' }])
      .mockResolvedValueOnce([
        { has_schedule: false, pair_matches: true, eligible: false, scheduled_for: null },
      ]);

    const response = await POST(cancelRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cancelled).toBe(false);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses to cancel once the grace window has closed, and does not touch the columns', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'user_cancelling' }])
      .mockResolvedValueOnce([
        { has_schedule: true, pair_matches: true, eligible: false, scheduled_for: SCHEDULED_FOR },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { has_schedule: true, pair_matches: true, eligible: false, scheduled_for: SCHEDULED_FOR },
      ]);

    const response = await POST(cancelRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.cancelled).toBe(false);
    expect(body.reason).toBe('grace_window_expired');
    expect(body.error).toContain('The cancellation window has closed.');
    expect(body.error).toContain('This does not confirm that erasure is complete.');
    expect(body.error).not.toMatch(/already underway|Nothing was restored/);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('fails instead of reporting nothing pending when the deletion columns are missing', async () => {
    mockQuery.mockRejectedValueOnce(pgError('42703'));

    const response = await POST(cancelRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.cancelled).toBeUndefined();
  });

  it('returns 401 when the caller is not authenticated, and never touches the database', async () => {
    mockGetClerkAuthUser.mockRejectedValue(new Error('no session'));

    const response = await POST(cancelRequest());

    expect(response.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is scoped to the caller: the UPDATE is parameterised by their own userId, not a client-supplied id', async () => {
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_other_caller' });
    mockQuery
      .mockResolvedValueOnce([{ id: 'user_other_caller' }])
      .mockResolvedValueOnce([
        { has_schedule: true, pair_matches: true, eligible: true, scheduled_for: SCHEDULED_FOR },
      ])
      .mockResolvedValueOnce([{ id: 'user_other_caller' }]);

    await POST(cancelRequest());

    const update = mockQuery.mock.calls.find(([sql]) => String(sql).startsWith('update profiles'));
    const [, params] = update as [string, unknown[]];
    expect(params).toEqual(['user_other_caller']);
  });

  it('runs the cancellation update on the caller-scoped client, never the schema owner', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'user_cancelling' }])
      .mockResolvedValueOnce([
        { has_schedule: true, pair_matches: true, eligible: true, scheduled_for: SCHEDULED_FOR },
      ])
      .mockResolvedValueOnce([{ id: 'user_cancelling' }]);

    await POST(cancelRequest());

    expect(mockGetNeonDb).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('deletion_requested_at'), [
      'user_cancelling',
    ]);
  });

  it('ignores an identity smuggled into the query string and cancels for the session user', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'user_cancelling' }])
      .mockResolvedValueOnce([
        { has_schedule: true, pair_matches: true, eligible: true, scheduled_for: SCHEDULED_FOR },
      ])
      .mockResolvedValueOnce([{ id: 'user_cancelling' }]);

    const response = await POST(
      new Request('http://localhost:3000/api/user/delete-account/cancel?userId=victim-user', {
        method: 'POST',
      }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cancelled).toBe(true);
    expect(
      mockQuery.mock.calls.some(
        ([, params]) => Array.isArray(params) && params.includes('victim-user'),
      ),
    ).toBe(false);
  });

  it('rejects the request when CSRF validation fails', async () => {
    const csrfResponse = new Response(JSON.stringify({ error: 'CSRF token invalid' }), {
      status: 403,
    });
    mockRequireCsrfToken.mockResolvedValue(csrfResponse);

    const response = await POST(cancelRequest());

    expect(response.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects the request when the rate limit is exceeded', async () => {
    const rateLimitResponse = new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
    });
    mockWithRateLimit.mockResolvedValue(rateLimitResponse);

    const response = await POST(cancelRequest());

    expect(response.status).toBe(429);
    expect(mockGetClerkAuthUser).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('does not hard-fail on an unexpected database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection terminated'));

    const response = await POST(cancelRequest());

    expect(response.status).toBe(500);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });
});

const expectedSchedule = {
  scheduledFor: '2026-11-08T00:00:00.123456Z',
  requestedAt: '2026-11-07T00:00:00.654321Z',
};
const state = {
  has_schedule: true,
  pair_matches: true,
  eligible: true,
  scheduled_for: expectedSchedule.scheduledFor,
};
function pairRequest(body: string | undefined = JSON.stringify({ expectedSchedule })) {
  return new Request('http://localhost:3000/api/user/delete-account/cancel-schedule', {
    method: 'PUT',
    body,
  }) as never;
}

describe('undoing a deletion that stopped a web plan renewal', () => {
  function stripeSubscription(overrides: Record<string, unknown> = {}) {
    return {
      id: 'sub_live1',
      status: 'active',
      cancel_at_period_end: true,
      cancel_at: null,
      schedule: null,
      metadata: { [ACCOUNT_DELETION_RENEWAL_METADATA_KEY]: TAGGED_DEADLINE },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_cancelling' });
    mockRequireCsrfToken.mockResolvedValue(null);
    mockWithRateLimit.mockResolvedValue(null);
    mockRecordAuditEvent.mockResolvedValue(undefined);
    mockExecute.mockResolvedValue(1);
    mockGetSubscription.mockResolvedValue({ stripe_subscription_id: 'sub_live1' });
    stripeMocks.retrieve.mockResolvedValue(stripeSubscription());
    stripeMocks.update.mockImplementation(async (id: string, params: Record<string, unknown>) =>
      stripeSubscription({ id, ...params }),
    );
    mockQuery
      .mockResolvedValueOnce([{ id: 'user_cancelling' }])
      .mockResolvedValueOnce([
        { has_schedule: true, pair_matches: true, eligible: true, scheduled_for: SCHEDULED_FOR },
      ])
      .mockResolvedValueOnce([{ id: 'user_cancelling' }]);
  });

  it('turns renewal back on after the cancellation commits and says so', async () => {
    stripeMocks.update.mockImplementation(async (id: string, params: Record<string, unknown>) => {
      expect(mockCommitted).toHaveBeenCalledTimes(1);
      return stripeSubscription({ id, ...params });
    });

    const response = await POST(cancelRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      cancelled: true,
      planRenewal: 'restored',
      message: 'Account deletion cancelled. Your plan renews again.',
    });
    expect(stripeMocks.update).toHaveBeenCalledWith(
      'sub_live1',
      {
        cancel_at_period_end: false,
        metadata: { [ACCOUNT_DELETION_RENEWAL_METADATA_KEY]: '' },
      },
      { idempotencyKey: `account-deletion-restore-renewal:sub_live1:${SCHEDULED_FOR}` },
    );
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('update public.subscriptions'),
      ['user_cancelling', 'sub_live1', false, null],
    );
  });

  it('leaves a cancellation the person made alone', async () => {
    stripeMocks.retrieve.mockResolvedValue(stripeSubscription({ metadata: {} }));

    const body = await (await POST(cancelRequest())).json();

    expect(body).toMatchObject({ cancelled: true, message: 'Account deletion cancelled.' });
    expect(body.planRenewal).toBeUndefined();
    expect(stripeMocks.update).not.toHaveBeenCalled();
  });

  it('leaves a renewal turned off by a different deletion alone', async () => {
    stripeMocks.retrieve.mockResolvedValue(
      stripeSubscription({
        metadata: { [ACCOUNT_DELETION_RENEWAL_METADATA_KEY]: '2026-10-01T00:00:00.000Z' },
      }),
    );

    const body = await (await POST(cancelRequest())).json();

    expect(body.planRenewal).toBeUndefined();
    expect(stripeMocks.update).not.toHaveBeenCalled();
  });

  it('clears the tag without turning renewal on when the person already resumed the plan', async () => {
    stripeMocks.retrieve.mockResolvedValue(stripeSubscription({ cancel_at_period_end: false }));

    const body = await (await POST(cancelRequest())).json();

    expect(body.planRenewal).toBeUndefined();
    expect(stripeMocks.update).toHaveBeenCalledWith(
      'sub_live1',
      { metadata: { [ACCOUNT_DELETION_RENEWAL_METADATA_KEY]: '' } },
      expect.anything(),
    );
  });

  it('keeps the account and says renewal may still be off when Stripe fails', async () => {
    stripeMocks.update.mockRejectedValue(new Error('stripe unavailable'));

    const response = await POST(cancelRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ cancelled: true, planRenewal: 'not_restored' });
    expect(body.message).toContain('turn it back on in Settings > Billing');
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'account_deletion_cancelled' }),
    );
  });

  it('does not touch Stripe when there is no web subscription', async () => {
    mockGetSubscription.mockResolvedValue({ stripe_subscription_id: null });

    const body = await (await POST(cancelRequest())).json();

    expect(body).toMatchObject({ cancelled: true, message: 'Account deletion cancelled.' });
    expect(stripeMocks.retrieve).not.toHaveBeenCalled();
  });
});

// Deterministic SQL mocks assert protocol shape, not database, clock, RLS or concurrency behavior.
describe('required schedule pair cancellation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_cancelling' });
    mockRequireCsrfToken.mockResolvedValue(null);
    mockWithRateLimit.mockResolvedValue(null);
  });

  it.each([
    '',
    ' ',
    '{',
    'null',
    '[]',
    '1',
    '"text"',
    '{}',
    JSON.stringify({ expectedSchedule: { scheduledFor: expectedSchedule.scheduledFor } }),
    JSON.stringify({ expectedSchedule, userId: 'victim' }),
    JSON.stringify({ expectedSchedule: { ...expectedSchedule, extra: true } }),
  ])('rejects an invalid body without queries: %s', async (body) => {
    expect((await PUT_SCHEDULE(pairRequest(body))).status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockOutsideQuery).not.toHaveBeenCalled();
  });

  it('rejects an absent body', async () => {
    expect(
      (
        await PUT_SCHEDULE(
          new Request('http://localhost:3000/api/user/delete-account/cancel-schedule', {
            method: 'PUT',
          }) as never,
        )
      ).status,
    ).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it.each([expectedSchedule.requestedAt, null])(
    'binds untouched pair, null-safe equality and fresh deadline: %s',
    async (requestedAt) => {
      mockQuery
        .mockResolvedValueOnce([{ id: 'user_cancelling' }])
        .mockResolvedValueOnce([state])
        .mockResolvedValueOnce([{ id: 'user_cancelling' }]);
      mockRecordAuditEvent.mockImplementation(() => {
        expect(mockCommitted).toHaveBeenCalledTimes(1);
      });
      const response = await PUT_SCHEDULE(
        pairRequest(JSON.stringify({ expectedSchedule: { ...expectedSchedule, requestedAt } })),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ cancelled: true });
      expect(mockQuery.mock.calls[0]).toEqual([
        'select id from profiles where id = $1 for update',
        ['user_cancelling'],
      ]);
      const [sql, params] = mockQuery.mock.calls[2]!;
      expect(sql).toContain('where id = $1');
      expect(sql).toContain('deletion_scheduled_for = $2::timestamptz');
      expect(sql).toContain('deletion_requested_at is not distinct from $3::timestamptz');
      expect(sql).toContain('deletion_scheduled_for > clock_timestamp()');
      expect(sql).not.toMatch(/\bnow\(/);
      expect(params).toEqual(['user_cancelling', expectedSchedule.scheduledFor, requestedAt]);
      expect(mockOutsideQuery).not.toHaveBeenCalled();
      expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { ...expectedSchedule, scheduledFor: '2026-11-08T00:00:00.123457Z' },
    { ...expectedSchedule, requestedAt: '2026-11-07T00:00:00.654322Z' },
    { ...expectedSchedule, requestedAt: null },
  ])('refuses either value mismatch, including microseconds: %j', async (pair) => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'user_cancelling' }])
      .mockResolvedValueOnce([{ ...state, pair_matches: false, eligible: false }]);
    const response = await PUT_SCHEDULE(pairRequest(JSON.stringify({ expectedSchedule: pair })));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'schedule_changed', cancelled: false });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[1]![1]).toEqual([
      'user_cancelling',
      pair.scheduledFor,
      pair.requestedAt,
    ]);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it.each(['exact deadline', 'past deadline', 'lock wait across deadline'])(
    'refuses %s using database eligibility after the lock',
    async () => {
      mockQuery
        .mockResolvedValueOnce([{ id: 'user_cancelling' }])
        .mockResolvedValueOnce([state])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...state, eligible: false }]);
      const response = await PUT_SCHEDULE(pairRequest());
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ reason: 'grace_window_expired' });
      expect(mockQuery.mock.calls[3]![0]).toContain('clock_timestamp()');
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    },
  );

  it.each([[], [{ id: 'user_cancelling' }]].map((rows) => ({ rows })))(
    'does not audit missing or unscheduled rows: %j',
    async ({ rows }) => {
      mockQuery
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([{ ...state, has_schedule: false }]);
      const response = await PUT_SCHEDULE(pairRequest());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ cancelled: false });
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    },
  );

  it.each(
    [
      undefined,
      null,
      {},
      [{}],
      [{ id: 'victim' }],
      [{ id: 'user_cancelling' }, { id: 'user_cancelling' }],
    ].map((rows) => ({ rows })),
  )('fails closed on malformed lock output: %j', async ({ rows }) => {
    mockQuery.mockResolvedValueOnce(rows);
    expect((await PUT_SCHEDULE(pairRequest())).status).toBe(500);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it.each([undefined, [], [{}], [{ ...state, pair_matches: null }]].map((rows) => ({ rows })))(
    'fails closed on malformed state: %j',
    async ({ rows }) => {
      mockQuery.mockResolvedValueOnce([{ id: 'user_cancelling' }]).mockResolvedValueOnce(rows);
      expect((await PUT_SCHEDULE(pairRequest())).status).toBe(500);
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null, [{}], [{ id: 'victim' }]].map((rows) => ({ rows })))(
    'fails closed on malformed update results: %j',
    async ({ rows }) => {
      mockQuery
        .mockResolvedValueOnce([{ id: 'user_cancelling' }])
        .mockResolvedValueOnce([state])
        .mockResolvedValueOnce(rows);
      expect((await PUT_SCHEDULE(pairRequest())).status).toBe(500);
      expect(mockCommitted).not.toHaveBeenCalled();
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    },
  );

  it('does not invent expiry for an unexplained empty update', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'user_cancelling' }])
      .mockResolvedValueOnce([state])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([state]);
    const response = await PUT_SCHEDULE(pairRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty('reason');
    expect(mockCommitted).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('does not audit a failed transaction', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'user_cancelling' }])
      .mockRejectedValueOnce(new Error('connection terminated'));
    expect((await PUT_SCHEDULE(pairRequest())).status).toBe(500);
    expect(mockCommitted).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('does not claim rollback when audit fails after commit', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'user_cancelling' }])
      .mockResolvedValueOnce([state])
      .mockResolvedValueOnce([{ id: 'user_cancelling' }]);
    mockRecordAuditEvent.mockRejectedValue(new Error('audit unavailable'));
    const response = await PUT_SCHEDULE(pairRequest());
    expect(mockCommitted).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.cancelled).toBeUndefined();
    expect(body.error).not.toMatch(/rollback|nothing changed|restored/i);
  });

  it('legacy mode ignores even malformed bodies', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'user_cancelling' }])
      .mockResolvedValueOnce([state])
      .mockResolvedValueOnce([{ id: 'user_cancelling' }]);
    expect((await POST(pairRequest('{'))).status).toBe(200);
    expect(mockQuery.mock.calls[2]![1]).toEqual(['user_cancelling']);
    expect(mockQuery.mock.calls[2]![0]).not.toContain('$2');
  });

  it.each([POST, PUT_SCHEDULE])('uses the same rate bucket and gates', async (post) => {
    mockWithRateLimit.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await post(pairRequest())).status).toBe(429);
    expect(mockWithRateLimit).toHaveBeenCalledWith(expect.anything(), 'account-deletion-cancel');
    expect(mockRequireCsrfToken).not.toHaveBeenCalled();
    mockRequireCsrfToken.mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect((await post(pairRequest())).status).toBe(403);
    expect(mockGetClerkAuthUser).not.toHaveBeenCalled();
    mockGetClerkAuthUser.mockRejectedValueOnce(new Error('no session'));
    expect((await post(pairRequest())).status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('preserves preflight behavior', () => {
    expect(OPTIONS(pairRequest()).status).toBe(204);
  });
});

describe('cancellation method export separation (UNRUN, not HTTP-router acceptance)', () => {
  it('exposes only PUT for required-pair mutation and retains POST only on legacy', () => {
    expect(protectedRoute.PUT).toBe(PUT_SCHEDULE);
    expect(protectedRoute).not.toHaveProperty('POST');
    expect(protectedRoute).not.toHaveProperty('DELETE');
    expect(legacyRoute.POST).toBe(POST);
    expect(legacyRoute).not.toHaveProperty('PUT');
  });
});
