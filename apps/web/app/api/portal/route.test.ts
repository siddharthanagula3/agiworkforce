import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  createPortalSession: vi.fn(),
  listCustomers: vi.fn(),
  listSubscriptions: vi.fn(),
}));

const waitlistAccessMocks = vi.hoisted(() => ({ hasAccess: vi.fn(async () => false) }));

vi.hoisted(() => {
  process.env['STRIPE_SECRET_KEY'] = 'sk_test_dummy';
  process.env['NEXT_PUBLIC_APP_URL'] = 'https://agiworkforce.com';
  process.env['ALLOWED_ORIGINS'] = 'https://agiworkforce.com';
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({
    userId: 'user-1',
    email: 'user@example.com',
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: mocks.query,
      execute: mocks.execute,
      transaction: mocks.transaction,
    },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('stripe', () => ({
  default: class StripeMock {
    billingPortal = {
      sessions: {
        create: mocks.createPortalSession,
      },
    };
    customers = {
      list: mocks.listCustomers,
    };
    subscriptions = {
      list: mocks.listSubscriptions,
      retrieve: vi.fn(),
    };
  },
}));
vi.mock('@/lib/server/billing-waitlist-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/billing-waitlist-access')>()),
  hasBillingWaitlistAccess: waitlistAccessMocks.hasAccess,
}));

import { POST } from './route';
import { getUserScopedDb } from '@/lib/server/rls-db';

function request(body?: Record<string, unknown>) {
  return new NextRequest('https://agiworkforce.com/api/portal', {
    method: 'POST',
    headers: { Origin: 'https://agiworkforce.com', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function activeSubscription() {
  return [
    {
      plan_tier: 'pro',
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123',
      status: 'active',
    },
  ];
}

describe('POST /api/portal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(1);
    mocks.createPortalSession.mockResolvedValue({
      id: 'bps_1',
      url: 'https://billing.stripe.com/session/test',
    });
    mocks.listSubscriptions.mockResolvedValue({ data: [] });
    waitlistAccessMocks.hasAccess.mockResolvedValue(false);
  });

  it('fails closed before Stripe when subscription state cannot be verified', async () => {
    mocks.query.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.listCustomers).not.toHaveBeenCalled();
    expect(mocks.createPortalSession).not.toHaveBeenCalled();
  });

  it('opens the portal for a verified linked customer', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        plan_tier: 'pro',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_123',
        status: 'active',
      },
    ]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.createPortalSession).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://agiworkforce.com/pricing',
    });
  });

  it.each([
    ['apple', { apple_original_transaction_id: 'apple-tx-1' }],
    ['google', { google_purchase_token: 'play-token-1' }],
    ['manual', { stripe_customer_id: null }],
    [
      'unverified',
      { stripe_subscription_id: 'sub_123', apple_original_transaction_id: 'apple-tx-1' },
    ],
  ])('refuses the Stripe portal for an active %s-owned subscription', async (_source, ids) => {
    mocks.query.mockResolvedValueOnce([
      {
        plan_tier: 'pro',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: null,
        status: 'active',
        ...ids,
      },
    ]);

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.createPortalSession).not.toHaveBeenCalled();
  });

  it('does not send an ended store subscription to a Stripe portal', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        plan_tier: 'pro',
        stripe_customer_id: 'cus_old',
        stripe_subscription_id: null,
        apple_original_transaction_id: 'apple-tx-ended',
        status: 'expired',
      },
    ]);

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.createPortalSession).not.toHaveBeenCalled();
  });

  describe('email fallback (BIZ-015: no cross-customer portal sessions)', () => {
    function unlinkedAccount() {
      mocks.query.mockImplementation(async (sql: string) =>
        sql.includes('select stripe_customer_id from profiles')
          ? [{ stripe_customer_id: null }]
          : [],
      );
    }

    it('refuses a customer matched only by email, and links nothing', async () => {
      unlinkedAccount();
      mocks.listCustomers.mockResolvedValueOnce({
        data: [{ id: 'cus_stranger', metadata: {} }],
      });

      const response = await POST(request());

      expect(response.status).toBe(403);
      expect(mocks.createPortalSession).not.toHaveBeenCalled();
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
        resolveOrganization: false,
      });
      expect(mocks.query).toHaveBeenCalledWith(
        'select stripe_customer_id from profiles where id = $1 limit 1',
        ['user-1'],
      );
    });

    it('picks the customer whose metadata names the caller, not the email twin', async () => {
      unlinkedAccount();
      mocks.listSubscriptions.mockResolvedValue({ data: [{ id: 'sub_recovered' }] });
      mocks.listCustomers.mockResolvedValueOnce({
        data: [
          { id: 'cus_stranger', metadata: {} },
          { id: 'cus_owned', metadata: { user_id: 'user-1' } },
        ],
      });

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(mocks.createPortalSession).toHaveBeenCalledWith({
        customer: 'cus_owned',
        return_url: 'https://agiworkforce.com/pricing',
      });
      expect(mocks.execute).toHaveBeenCalledWith(
        'update profiles set stripe_customer_id = $1 where id = $2',
        ['cus_owned', 'user-1'],
      );
    });
  });
});

describe('POST /api/portal, upgrade access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(1);
    mocks.createPortalSession.mockResolvedValue({
      id: 'bps_1',
      url: 'https://billing.stripe.com/session/test',
    });
    mocks.listSubscriptions.mockResolvedValue({ data: [] });
    waitlistAccessMocks.hasAccess.mockResolvedValue(false);
  });

  it.each([
    ['active', 'active'],
    ['trialing', 'trialing'],
    ['past_due', 'past_due'],
    ['unpaid', 'unpaid'],
    ['paused', 'paused'],
    ['canceled with a period still running', 'canceled'],
  ])(
    'opens the portal for a paying account in %s without consulting the gate',
    async (_label, status) => {
      mocks.query.mockResolvedValueOnce([
        {
          plan_tier: 'pro',
          stripe_customer_id: 'cus_123',
          stripe_subscription_id: 'sub_123',
          current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
          status,
        },
      ]);

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(waitlistAccessMocks.hasAccess).not.toHaveBeenCalled();
      expect(mocks.createPortalSession).toHaveBeenCalledWith({
        customer: 'cus_123',
        return_url: 'https://agiworkforce.com/pricing',
      });
    },
  );

  it('opens the portal for an ended store purchase so the receipt stays reachable', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        plan_tier: 'free',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_ended',
        status: 'canceled',
      },
    ]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(waitlistAccessMocks.hasAccess).not.toHaveBeenCalled();
  });

  it('refuses an account that never paid and holds no upgrade access', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        plan_tier: 'free',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        status: 'active',
      },
    ]);

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'waitlist_access_required',
        message:
          'Paid upgrades are opening in stages. Join the waitlist or enter an access code to continue.',
      },
    });
    expect(mocks.createPortalSession).not.toHaveBeenCalled();
  });

  it('still opens the portal when Stripe is billing a customer the row does not name', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        plan_tier: 'byok',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: null,
        status: 'active',
      },
    ]);
    mocks.listSubscriptions.mockResolvedValue({ data: [{ id: 'sub_live' }] });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.listSubscriptions).toHaveBeenCalledWith({
      customer: 'cus_123',
      status: 'all',
      limit: 1,
    });
  });

  it('refuses a linked customer Stripe has never billed', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        plan_tier: 'byok',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: null,
        status: 'active',
      },
    ]);

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'waitlist_access_required' },
    });
    expect(mocks.createPortalSession).not.toHaveBeenCalled();
  });

  it('leaves an ungated free account to the ownership rules once access is redeemed', async () => {
    waitlistAccessMocks.hasAccess.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([
      {
        plan_tier: 'free',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        status: 'active',
      },
    ]);

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.listSubscriptions).not.toHaveBeenCalled();
  });

  it('fails closed without opening a session when access cannot be read', async () => {
    waitlistAccessMocks.hasAccess.mockRejectedValueOnce(new Error('database unavailable'));
    mocks.query.mockResolvedValueOnce([
      {
        plan_tier: 'free',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: null,
        status: 'active',
      },
    ]);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.createPortalSession).not.toHaveBeenCalled();
  });

  describe('self-healing lookup', () => {
    function unlinkedAccount(customerId: string | null) {
      mocks.query.mockImplementation(async (sql: string) =>
        sql.includes('select stripe_customer_id from profiles')
          ? [{ stripe_customer_id: customerId }]
          : [],
      );
    }

    it('heals a customer whose Stripe account really holds a subscription', async () => {
      unlinkedAccount('cus_real');
      mocks.listSubscriptions.mockResolvedValue({ data: [{ id: 'sub_real' }] });

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(mocks.createPortalSession).toHaveBeenCalledWith({
        customer: 'cus_real',
        return_url: 'https://agiworkforce.com/pricing',
      });
    });

    it('refuses a customer Stripe has never billed', async () => {
      unlinkedAccount('cus_empty');

      const response = await POST(request());

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'waitlist_access_required' },
      });
      expect(mocks.createPortalSession).not.toHaveBeenCalled();
    });

    it('spends no Stripe history call once upgrade access is redeemed', async () => {
      waitlistAccessMocks.hasAccess.mockResolvedValue(true);
      unlinkedAccount('cus_empty');

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(mocks.listSubscriptions).not.toHaveBeenCalled();
    });
  });
});

// The portal configuration is a Stripe Dashboard setting the API cannot read,
// so attempting the deep-link and reading the rejection is the only way to
// learn cancellation is switched off. That must become a route the user can
// still take, not a generic failure.
describe('cancel deep-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(1);
    mocks.createPortalSession.mockResolvedValue({
      id: 'bps_1',
      url: 'https://billing.stripe.com/session/test',
    });
  });

  it('asks Stripe for the cancellation flow scoped to the stored subscription', async () => {
    mocks.query.mockResolvedValueOnce(activeSubscription());

    const response = await POST(request({ flow: 'cancel' }));

    expect(response.status).toBe(200);
    expect(mocks.createPortalSession).toHaveBeenCalledWith(
      expect.objectContaining({
        flow_data: {
          type: 'subscription_cancel',
          subscription_cancel: { subscription: 'sub_123' },
        },
      }),
    );
  });

  it('opens the ordinary portal when no flow was asked for', async () => {
    mocks.query.mockResolvedValueOnce(activeSubscription());

    await POST(request());

    expect(mocks.createPortalSession).toHaveBeenCalledWith(
      expect.not.objectContaining({ flow_data: expect.anything() }),
    );
  });

  it('names a route that still works when the portal has cancellation disabled', async () => {
    mocks.query.mockResolvedValueOnce(activeSubscription());
    mocks.createPortalSession.mockRejectedValueOnce(
      Object.assign(new Error('flow_data is not enabled on this configuration'), {
        type: 'StripeInvalidRequestError',
      }),
    );

    const response = await POST(request({ flow: 'cancel' }));

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe('cancellation_unavailable');
    expect(body.message).toMatch(/Manage billing|contact support/);
  });

  it('does not report an unrelated Stripe outage as a disabled portal', async () => {
    mocks.query.mockResolvedValueOnce(activeSubscription());
    mocks.createPortalSession.mockRejectedValueOnce(
      Object.assign(new Error('Stripe is down'), { type: 'StripeAPIError' }),
    );

    const response = await POST(request({ flow: 'cancel' }));

    expect(response.status).not.toBe(409);
  });
});
