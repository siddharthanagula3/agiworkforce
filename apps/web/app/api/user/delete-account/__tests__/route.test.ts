import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/server/account-erasure');

vi.mock('server-only', () => ({}));

const {
  mockExecute,
  mockQuery,
  mockEraseUserAccountData,
  mockDeleteUser,
  mockGetSubscription,
  stripeMocks,
} = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockQuery: vi.fn(),
  mockEraseUserAccountData: vi.fn(),
  mockDeleteUser: vi.fn(),
  mockGetSubscription: vi.fn(),
  stripeMocks: { retrieve: vi.fn(), update: vi.fn() },
}));

vi.mock('@/lib/server/stripe-client', () => {
  const client = {
    subscriptions: { retrieve: stripeMocks.retrieve, update: stripeMocks.update },
  };
  return { getStripeClient: () => client, getStripeClientOrNull: () => client };
});

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(async () => null),
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({
  isAccountUnavailableError: vi.fn(() => false),
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user_deleting' })),
}));

vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
  logAuthFailure: vi.fn(async () => undefined),
  getClientIp: vi.fn(),
  logRateLimitExceeded: vi.fn(),
}));

vi.mock('@/lib/server/pseudonymize', () => ({
  pseudonymizeIdentifier: vi.fn(() => 'subject-ref'),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    execute: (...args: unknown[]) => mockExecute(...args),
    query: (...args: unknown[]) => mockQuery(...args),
    transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        execute: (...args: unknown[]) => mockExecute(...args),
        query: (...args: unknown[]) => mockQuery(...args),
      }),
  })),
}));

vi.mock('@/lib/server/account-erasure', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  eraseUserAccountData: (...args: unknown[]) => mockEraseUserAccountData(...args),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({ users: { deleteUser: mockDeleteUser } })),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
  },
}));

import { BILLING_PLAN_PRICING } from '@agiworkforce/types';
import { parseAccountDeletionScheduleReceipt } from '@agiworkforce/cloud-contracts';
import { recordAuditEvent } from '@/lib/security-audit';
import { ACCOUNT_DELETION_RENEWAL_METADATA_KEY } from '@/lib/server/payments/stripe-provider';

import { STEP_UP_TOKEN_HEADER } from '@/lib/server/step-up-auth';
import { createStepUpGrant } from '@/lib/server/step-up/grant-token';
import { DELETE } from '../route';

process.env['CSRF_SECRET'] = 'account-delete-step-up-secret-long-enough';

function auditDetail(): Record<string, unknown> {
  const call = vi.mocked(recordAuditEvent).mock.calls.at(-1)?.[0] as
    { detail?: Record<string, unknown> } | undefined;
  return call?.detail ?? {};
}

function deleteRequest(url = 'http://localhost:3000/api/user/delete-account') {
  const { token } = createStepUpGrant({
    userId: 'user_deleting',
    action: 'account.delete',
    resourceId: null,
    method: 'first_factor',
  });
  return new Request(url, {
    method: 'DELETE',
    headers: { [STEP_UP_TOKEN_HEADER]: token },
  }) as never;
}

function pgError(code: string): Error {
  return Object.assign(new Error(`postgres error ${code}`), { code });
}

const completeErasure = {
  userId: 'user_deleting',
  mediaObjectsDeleted: 0,
  mediaObjectsFailed: 0,
  mediaRowsDeleted: 0,
  backupObjectsDeleted: 0,
  backupObjectsFailed: 0,
  knowledgeObjectsDeleted: 0,
  knowledgeObjectsFailed: 0,
  exportObjectsDeleted: 0,
  exportObjectsFailed: 0,
  avatarObjectsDeleted: 0,
  avatarObjectsFailed: 0,
  feedbackObjectsDeleted: 0,
  feedbackObjectsFailed: 0,
  cacheKeysDeleted: 0,
  cacheKeysFailed: 0,
  tables: { web_conversations: { deleted: true } },
  anonymized: {},
  complete: true,
  profileRetained: false,
};

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_row_1',
    user_id: 'user_deleting',
    plan_tier: 'pro',
    status: 'active',
    current_period_start: new Date('2026-08-01T00:00:00.000Z'),
    current_period_end: new Date('2026-09-01T00:00:00.000Z'),
    cancel_at_period_end: false,
    stripe_subscription_id: null,
    stripe_price_id: null,
    ...overrides,
  };
}

describe('DELETE /api/user/delete-account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEraseUserAccountData.mockResolvedValue(completeErasure);
    mockDeleteUser.mockResolvedValue(undefined);
    mockGetSubscription.mockResolvedValue(null);
    mockExecute.mockReset().mockResolvedValue(1);
    mockQuery.mockReset().mockResolvedValue([]);
    stripeMocks.retrieve.mockReset();
    stripeMocks.update.mockReset();
  });

  function ownsAlone(...workspaces: Array<{ id: string; name: string | null }>) {
    mockQuery.mockImplementation(async (sql: unknown) =>
      String(sql).includes('organization_members') ? workspaces : [],
    );
  }

  it('refuses while the account is the only owner of a workspace, and deletes nothing', async () => {
    // The owner invariant is already enforced when a sole owner tries to leave,
    // be demoted, or be removed. Deleting the account reached the same end by a
    // route that never asked, leaving a workspace nobody could administer.
    mockExecute.mockResolvedValue(1);
    ownsAlone({ id: 'org-1', name: 'Acme' });

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.reason).toBe('sole_organization_owner');
    expect(body.error).toContain('Acme');
    expect(body.workspaces).toEqual([{ id: 'org-1', name: 'Acme' }]);
    expect(mockExecute).not.toHaveBeenCalledWith(
      expect.stringContaining('deletion_requested_at'),
      expect.anything(),
    );
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('names every workspace the account owns alone, so the user knows what to hand over', async () => {
    mockExecute.mockResolvedValue(1);
    ownsAlone({ id: 'org-1', name: 'Acme' }, { id: 'org-2', name: 'Globex' });

    const body = await (await DELETE(deleteRequest())).json();

    expect(body.error).toContain('Acme');
    expect(body.error).toContain('Globex');
  });

  it('still refuses when the workspace has no name', async () => {
    mockExecute.mockResolvedValue(1);
    ownsAlone({ id: 'org-1', name: null });

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(409);
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
  });

  it('proceeds when the sole-owned workspace is already scheduled for deletion', async () => {
    // The query excludes those rows, so an owner who decommissioned the
    // workspace first is not trapped between two deletions.
    mockExecute.mockResolvedValue(1);
    let ownershipSql = '';
    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('organization_members')) ownershipSql = String(sql);
      return [];
    });

    expect((await DELETE(deleteRequest())).status).toBe(200);
    expect(ownershipSql).toContain('deletion_scheduled_for is null');
  });

  it('proceeds when the account owns nothing alone', async () => {
    mockExecute.mockResolvedValue(1);

    expect((await DELETE(deleteRequest())).status).toBe(200);
  });

  it('deletes nothing when the ownership lookup fails, rather than assuming nobody is owned', async () => {
    mockExecute.mockResolvedValue(1);
    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('organization_members')) throw new Error('connection reset');
      return [];
    });

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(503);
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('schedules deletion when the update touches the profile row', async () => {
    mockExecute.mockResolvedValue(1);

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scheduledFor).toBeTruthy();
    expect(body.message).toContain(`Cancellation deadline: ${body.scheduledFor}.`);
    expect(body.message).toContain('before this deadline');
    expect(body.message).toContain('Erasure is processed after the deadline and may take longer.');
    expect(body.message).not.toMatch(/first daily|all its data|starts 24 hours/);
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(auditDetail()).toMatchObject({
      status: 'pending',
      reason: expect.stringContaining(body.scheduledFor),
    });
  });

  describe('existing deletion schedules', () => {
    function requestedAuditCalls() {
      return vi
        .mocked(recordAuditEvent)
        .mock.calls.filter(([event]) => event.eventType === 'account_deletion_requested');
    }

    function modelSchedule(initialDeadline: string | Date | null) {
      const state = {
        requestedAt: initialDeadline === null ? null : '2026-01-01T00:00:00.000Z',
        deadline: initialDeadline,
        writes: 0,
      };
      mockExecute.mockImplementation(async (sql: unknown, params: unknown[]) => {
        if (!String(sql).includes('update profiles')) return 0;
        expect(String(sql)).toMatch(/and\s+deletion_scheduled_for\s+is\s+null/i);
        expect(params[2]).toBe('user_deleting');
        if (state.deadline !== null) return 0;
        state.requestedAt = String(params[0]);
        state.deadline = String(params[1]);
        state.writes += 1;
        return 1;
      });
      mockQuery.mockImplementation(async (sql: unknown, params: unknown[]) => {
        if (!String(sql).includes('select deletion_scheduled_for')) return [];
        expect(params).toEqual(['user_deleting']);
        return [
          {
            deletion_requested_at: state.requestedAt,
            deletion_scheduled_for: state.deadline,
          },
        ];
      });
      return state;
    }

    it('preserves the original future deadline and complete receipt without another audit event', async () => {
      const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const state = modelSchedule(deadline);
      const requestedAt = state.requestedAt;

      const response = await DELETE(deleteRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        scheduledFor: deadline,
        status: 'pending',
        statusReason: expect.stringContaining(deadline),
        message: expect.stringContaining(`Cancellation deadline: ${deadline}.`),
      });
      expect(body.message).toContain('already scheduled');
      expect(state).toEqual({ requestedAt, deadline, writes: 0 });
      expect(requestedAuditCalls()).toHaveLength(0);
    });

    it.each(['expired', 'invalid'])('refuses an %s deadline without resetting it', async (kind) => {
      const deadline =
        kind === 'expired' ? new Date(Date.now() - 60 * 60 * 1000).toISOString() : 'not-a-date';
      const state = modelSchedule(deadline);
      const requestedAt = state.requestedAt;

      const response = await DELETE(deleteRequest());
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.error).toContain('The schedule was not changed.');
      if (kind === 'expired') {
        expect(body.error).toContain('cancellation window has closed');
        expect(body.error).toContain('does not confirm that erasure is complete');
      } else {
        expect(body.error).toContain('could not be verified');
      }
      expect(body.scheduledFor).toBeUndefined();
      expect(state).toEqual({ requestedAt, deadline, writes: 0 });
      expect(requestedAuditCalls()).toHaveLength(0);
      expect(mockEraseUserAccountData).not.toHaveBeenCalled();
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });

    it.each(['future', 'expired', 'invalid'])('handles a driver Date value: %s', async (kind) => {
      const now = Date.parse('2026-11-05T12:00:00.500Z');
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
      try {
        const deadline = new Date(kind === 'invalid' ? NaN : now + (kind === 'future' ? 1 : -1));
        const state = modelSchedule(deadline);

        const response = await DELETE(deleteRequest());
        const body = await response.json();

        if (kind === 'future') {
          expect(response.status).toBe(200);
          expect(body.scheduledFor).toBe(deadline.toISOString());
          expect(body.message).toContain(`Cancellation deadline: ${deadline.toISOString()}.`);
          expect(body.statusReason).toContain(deadline.toISOString());
        } else {
          expect(response.status).toBe(409);
          expect(body.scheduledFor).toBeUndefined();
        }
        expect(state.deadline).toBe(deadline);
        expect(state.writes).toBe(0);
        expect(requestedAuditCalls()).toHaveLength(0);
      } finally {
        clock.mockRestore();
      }
    });

    it('keeps the winning schedule when two requests compete', async () => {
      const state = modelSchedule(null);

      const responses = await Promise.all([DELETE(deleteRequest()), DELETE(deleteRequest())]);
      const receipts = await Promise.all(responses.map((response) => response.json()));

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(state.writes).toBe(1);
      expect(receipts.map((receipt) => receipt.scheduledFor)).toEqual([
        state.deadline,
        state.deadline,
      ]);
      expect(requestedAuditCalls()).toHaveLength(1);
      expect(
        mockExecute.mock.calls.filter(([sql]) => String(sql).includes('update profiles')),
      ).toHaveLength(2);
    });

    it('refuses a cleared schedule after an update miss without retrying the write', async () => {
      mockExecute.mockResolvedValue(0);
      mockQuery.mockImplementation(async (sql: unknown) =>
        String(sql).includes('select deletion_scheduled_for')
          ? [{ deletion_requested_at: null, deletion_scheduled_for: null }]
          : [],
      );

      const response = await DELETE(deleteRequest());
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.error).toContain('state changed');
      expect(body.scheduledFor).toBeUndefined();
      expect(
        mockExecute.mock.calls.filter(([sql]) => String(sql).includes('update profiles')),
      ).toHaveLength(1);
      expect(requestedAuditCalls()).toHaveLength(0);
    });

    it('still requires step-up before returning an existing schedule', async () => {
      const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const state = modelSchedule(deadline);

      const response = await DELETE(
        new Request('http://localhost:3000/api/user/delete-account', { method: 'DELETE' }) as never,
      );

      expect(response.status).toBe(403);
      expect(mockExecute).not.toHaveBeenCalled();
      expect(state.deadline).toBe(deadline);
      expect(state.writes).toBe(0);
      expect(requestedAuditCalls()).toHaveLength(0);
      expect(
        vi
          .mocked(recordAuditEvent)
          .mock.calls.some(([event]) => event.eventType === 'step_up_challenged'),
      ).toBe(true);
    });

    it('returns a failure when the existing schedule cannot be read', async () => {
      mockExecute.mockResolvedValue(0);
      mockQuery.mockImplementation(async (sql: unknown) => {
        if (String(sql).includes('select deletion_scheduled_for')) throw new Error('read failed');
        return [];
      });

      const response = await DELETE(deleteRequest());
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.scheduledFor).toBeUndefined();
      expect(requestedAuditCalls()).toHaveLength(0);
    });
  });

  it('schedules nothing and erases nothing when the deletion columns are missing (42703)', async () => {
    mockExecute.mockRejectedValue(pgError('42703'));

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.scheduledFor).toBeUndefined();
    expect(body.error).toMatch(/Nothing was deleted/i);
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('does not hard-delete on a transient database error', async () => {
    mockExecute.mockRejectedValue(
      Object.assign(new Error('terminating connection due to administrator command'), {
        code: '57P01',
      }),
    );

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(body.error).toMatch(/Nothing was deleted/i);
  });

  it('does not hard-delete on an error carrying no Postgres code', async () => {
    mockExecute.mockRejectedValue(new Error('fetch failed'));

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(500);
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('fails loudly when the update matches no profile row', async () => {
    mockExecute.mockResolvedValue(0);

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.scheduledFor).toBeUndefined();
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it.each(['active', 'trialing'])(
    'refuses a renewing %s plan that matches no purchase it can cancel',
    async (status) => {
      mockGetSubscription.mockResolvedValue(subscription({ status }));

      const response = await DELETE(deleteRequest());
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.reason).toBe('active_subscription');
      expect(body.error).toContain('could not be matched to a purchase');
      expect(mockExecute).not.toHaveBeenCalled();
      expect(stripeMocks.update).not.toHaveBeenCalled();
      expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['web', { stripe_subscription_id: 'sub_live1' }],
    ['App Store', { apple_original_transaction_id: '2000000000000001' }],
  ])(
    'still refuses a renewing past-due %s plan while its payment is collected',
    async (_l, ids) => {
      mockGetSubscription.mockResolvedValue(subscription({ status: 'past_due', ...ids }));

      const response = await DELETE(deleteRequest());
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.reason).toBe('active_subscription');
      expect(body.error).toContain('still being collected');
      expect(mockExecute).not.toHaveBeenCalled();
      expect(stripeMocks.retrieve).not.toHaveBeenCalled();
    },
  );

  describe('a renewing web plan', () => {
    function renewingStripeSubscription(overrides: Record<string, unknown> = {}) {
      return {
        id: 'sub_live1',
        status: 'active',
        cancel_at_period_end: false,
        cancel_at: null,
        schedule: null,
        metadata: {},
        ...overrides,
      };
    }

    beforeEach(() => {
      mockGetSubscription.mockResolvedValue(subscription({ stripe_subscription_id: 'sub_live1' }));
      stripeMocks.retrieve.mockResolvedValue(renewingStripeSubscription());
      stripeMocks.update.mockImplementation(async (id: string, params: Record<string, unknown>) =>
        renewingStripeSubscription({ id, ...params, canceled_at: 1_790_000_000 }),
      );
    });

    function profileUpdates() {
      return mockExecute.mock.calls.filter(([sql]) => String(sql).includes('update profiles'));
    }

    it('schedules deletion and sets the plan to end at period end, tagged with the deadline', async () => {
      const response = await DELETE(deleteRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.scheduledFor).toBeTruthy();
      expect(stripeMocks.update).toHaveBeenCalledTimes(1);
      expect(stripeMocks.update).toHaveBeenCalledWith(
        'sub_live1',
        {
          cancel_at_period_end: true,
          metadata: { [ACCOUNT_DELETION_RENEWAL_METADATA_KEY]: body.scheduledFor },
        },
        { idempotencyKey: `account-deletion-stop-renewal:sub_live1:${body.scheduledFor}` },
      );
      expect(profileUpdates()).toHaveLength(1);
      expect(profileUpdates()[0]?.[1]).toEqual(expect.arrayContaining([body.scheduledFor]));
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('update public.subscriptions'),
        ['user_deleting', 'sub_live1', true, new Date(1_790_000_000 * 1000).toISOString()],
      );
      expect(body.message).toContain(`${BILLING_PLAN_PRICING.pro.label} plan no longer renews`);
      expect(body.message).toContain('instead of on 2026-09-01');
      expect(body.message).toContain('does not refund the unused time');
      expect(body.message).toContain('Cancelling the deletion turns renewal back on.');
      expect(body.storeBilling).toBeUndefined();
      expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    });

    it('stops renewal only after step-up and the workspace guard', async () => {
      ownsAlone({ id: 'org-1', name: 'Acme' });
      expect((await DELETE(deleteRequest())).status).toBe(409);

      mockQuery.mockReset().mockResolvedValue([]);
      const unverified = await DELETE(
        new Request('http://localhost:3000/api/user/delete-account', { method: 'DELETE' }) as never,
      );
      expect(unverified.status).toBe(403);
      expect(stripeMocks.retrieve).not.toHaveBeenCalled();
      expect(stripeMocks.update).not.toHaveBeenCalled();
    });

    it('deletes nothing when Stripe cannot stop the renewal', async () => {
      stripeMocks.update.mockRejectedValue(new Error('stripe unavailable'));

      const response = await DELETE(deleteRequest());
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.error).toMatch(/nothing was deleted/i);
      expect(profileUpdates()).toHaveLength(0);
    });

    it('refuses without scheduling while a plan change is scheduled', async () => {
      stripeMocks.retrieve.mockResolvedValue(
        renewingStripeSubscription({ schedule: 'sub_sched_1' }),
      );

      const response = await DELETE(deleteRequest());
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.reason).toBe('active_subscription');
      expect(body.error).toContain('scheduled change');
      expect(stripeMocks.update).not.toHaveBeenCalled();
      expect(profileUpdates()).toHaveLength(0);
    });

    it('treats a plan Stripe already ends as an ending plan and changes nothing in Stripe', async () => {
      stripeMocks.retrieve.mockResolvedValue(
        renewingStripeSubscription({ cancel_at_period_end: true }),
      );

      const response = await DELETE(deleteRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(stripeMocks.update).not.toHaveBeenCalled();
      expect(body.message).toContain(`${BILLING_PLAN_PRICING.pro.label} plan, already cancelled`);
    });

    it('turns renewal back on when the deletion could not be scheduled', async () => {
      mockExecute.mockImplementation(async (sql: unknown) => {
        if (String(sql).includes('update profiles')) throw new Error('write failed');
        return 1;
      });
      stripeMocks.update
        .mockImplementationOnce(async (id: string, params: Record<string, unknown>) => {
          stripeMocks.retrieve.mockResolvedValue(
            renewingStripeSubscription({ id, ...params, canceled_at: 1_790_000_000 }),
          );
          return renewingStripeSubscription({ id, ...params, canceled_at: 1_790_000_000 });
        })
        .mockImplementationOnce(async (id: string, params: Record<string, unknown>) =>
          renewingStripeSubscription({ id, ...params }),
        );

      const response = await DELETE(deleteRequest());

      expect(response.status).toBe(500);
      expect(stripeMocks.update).toHaveBeenCalledTimes(2);
      expect(stripeMocks.update.mock.calls[1]?.[1]).toEqual({
        cancel_at_period_end: false,
        metadata: { [ACCOUNT_DELETION_RENEWAL_METADATA_KEY]: '' },
      });
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('update public.subscriptions'),
        ['user_deleting', 'sub_live1', false, null],
      );
    });
  });

  it.each([
    ['App Store', 'apple', { apple_original_transaction_id: '2000000000000001' }, 'Apple'],
    ['Google Play', 'google', { google_purchase_token: 'play-token-1' }, 'Google Play'],
  ])(
    'schedules deletion for a renewing %s plan and says billing continues there',
    async (_label, store, ids, storeName) => {
      mockGetSubscription.mockResolvedValue(subscription(ids));

      const response = await DELETE(deleteRequest());
      const body = await response.json();
      const manageUrl =
        store === 'apple'
          ? 'https://apps.apple.com/account/subscriptions'
          : 'https://play.google.com/store/account/subscriptions';

      expect(response.status).toBe(200);
      expect(body.scheduledFor).toBeTruthy();
      expect(body.message).toContain(
        `Your ${BILLING_PLAN_PRICING.pro.label} plan is billed by ${storeName}, and deleting your account does not cancel it.`,
      );
      expect(body.message).toContain(`${storeName} keeps charging you until you cancel it there`);
      expect(body.message).toContain(manageUrl);
      expect(body.storeBilling).toEqual({ store, manageUrl });
      expect(parseAccountDeletionScheduleReceipt(body).storeBilling).toEqual({ store, manageUrl });
      expect(stripeMocks.retrieve).not.toHaveBeenCalled();
      expect(stripeMocks.update).not.toHaveBeenCalled();
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('deletion_requested_at'),
        expect.anything(),
      );
    },
  );

  it.each(['active', 'trialing'])(
    'schedules deletion at once for a %s plan that is already cancelled, and says what ends',
    async (status) => {
      mockExecute.mockResolvedValue(1);
      mockGetSubscription.mockResolvedValue(subscription({ status, cancel_at_period_end: true }));

      const response = await DELETE(deleteRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.scheduledFor).toBeTruthy();
      expect(body.message).toContain(`${BILLING_PLAN_PRICING.pro.label} plan, already cancelled`);
      expect(body.message).toContain('instead of on 2026-09-01');
      expect(body.message).toContain('does not refund the unused time');
      expect(body.message).toContain('will not be charged again');
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('deletion_requested_at'),
        expect.anything(),
      );
      expect(body.storeBilling).toBeUndefined();
      expect(stripeMocks.update).not.toHaveBeenCalled();
      expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    },
  );

  it('keeps step-up for a cancelled paid plan before scheduling anything', async () => {
    mockExecute.mockResolvedValue(1);
    mockGetSubscription.mockResolvedValue(subscription({ cancel_at_period_end: true }));

    const response = await DELETE(
      new Request('http://localhost:3000/api/user/delete-account', { method: 'DELETE' }) as never,
    );

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalledWith(
      expect.stringContaining('deletion_requested_at'),
      expect.anything(),
    );
  });

  it('keeps the sole-owner guard for a cancelled paid plan', async () => {
    mockGetSubscription.mockResolvedValue(subscription({ cancel_at_period_end: true }));
    ownsAlone({ id: 'org-1', name: 'Acme' });

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe('sole_organization_owner');
  });

  it('still refuses a cancelled plan whose payment is outstanding', async () => {
    mockGetSubscription.mockResolvedValue(
      subscription({ status: 'past_due', cancel_at_period_end: true }),
    );

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.reason).toBe('active_subscription');
    expect(body.error).toContain('still being collected');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it.each([
    ['no subscription row', null],
    ['a free plan', subscription({ plan_tier: 'free' })],
    ['a canceled paid plan', subscription({ status: 'canceled' })],
  ])('schedules deletion for %s', async (_label, sub) => {
    mockExecute.mockResolvedValue(1);
    mockGetSubscription.mockResolvedValue(sub);

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scheduledFor).toBeTruthy();
    expect(body.message).not.toMatch(/plan/);
    expect(body.storeBilling).toBeUndefined();
    expect(stripeMocks.retrieve).not.toHaveBeenCalled();
    expect(stripeMocks.update).not.toHaveBeenCalled();
  });

  it('does not delete anything when the subscription lookup fails', async () => {
    mockGetSubscription.mockRejectedValue(new Error('connection terminated'));

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/nothing was deleted/i);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('binds the scheduling update to the claimed session scope', async () => {
    mockExecute.mockResolvedValue(1);

    await DELETE(deleteRequest());

    expect(mockExecute).toHaveBeenCalledWith('set local role app_rls');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("set_config('request.jwt.claim.sub', $1, true)"),
      ['user_deleting', ''],
    );
  });

  it('ignores an identity smuggled into the query string and schedules deletion for the session user', async () => {
    mockExecute.mockResolvedValue(1);

    const response = await DELETE(
      deleteRequest('http://localhost:3000/api/user/delete-account?userId=victim-user'),
    );

    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('where id = $3'),
      expect.arrayContaining(['user_deleting']),
    );
    expect(
      mockExecute.mock.calls.some(
        ([, params]) => Array.isArray(params) && params.includes('victim-user'),
      ),
    ).toBe(false);
  });
});
