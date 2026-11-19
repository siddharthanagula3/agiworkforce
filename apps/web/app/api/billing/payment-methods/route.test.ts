import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockGetUserScopedDb,
  mockQuery,
  mockRetrieveCustomer,
  mockRetrieveSubscription,
  mockListPaymentMethods,
} = vi.hoisted(() => {
  process.env['STRIPE_SECRET_KEY'] = 'sk_test_dummy';
  return {
    mockGetUserScopedDb: vi.fn(),
    mockQuery: vi.fn(),
    mockRetrieveCustomer: vi.fn(),
    mockRetrieveSubscription: vi.fn(),
    mockListPaymentMethods: vi.fn(),
  };
});

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mockGetUserScopedDb(...args),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('stripe', () => ({
  default: class StripeMock {
    customers = { retrieve: mockRetrieveCustomer };
    subscriptions = { retrieve: mockRetrieveSubscription };
    paymentMethods = { list: mockListPaymentMethods };
  },
}));

import { GET } from './route';

function req() {
  return new Request('http://localhost:3000/api/billing/payment-methods') as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: mockQuery },
    userId: 'user-1',
    organizationId: null,
  });
  mockRetrieveCustomer.mockResolvedValue({
    deleted: false,
    invoice_settings: { default_payment_method: null },
  });
  mockRetrieveSubscription.mockResolvedValue({ default_payment_method: null });
  mockListPaymentMethods.mockResolvedValue({ data: [] });
});

describe('GET /api/billing/payment-methods', () => {
  it('looks up the stripe customer through the rls-scoped connection', async () => {
    mockQuery.mockResolvedValue([{ stripe_customer_id: 'cus_1', stripe_subscription_id: null }]);

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['user-1']);
    expect(mockRetrieveCustomer).toHaveBeenCalledWith('cus_1');
  });

  it('reports an unreadable billing account instead of an empty card list', async () => {
    mockQuery.mockRejectedValue(new Error('db unavailable'));

    const response = await GET(req());

    expect(response.status).toBe(503);
    expect(mockRetrieveCustomer).not.toHaveBeenCalled();
  });

  it('rejects when authentication fails', async () => {
    mockGetUserScopedDb.mockRejectedValue(new Error('unauthorized'));

    const response = await GET(req());

    expect(response.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  describe('which saved method is marked default', () => {
    const card = (id: string) => ({
      id,
      type: 'card',
      card: { brand: 'visa', last4: id.slice(-4), exp_month: 1, exp_year: 2030 },
      billing_details: { name: null, email: null, address: null },
      created: 1_800_000_000,
    });

    beforeEach(() => {
      mockQuery.mockResolvedValue([
        { stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' },
      ]);
      mockRetrieveCustomer.mockResolvedValue({
        deleted: false,
        invoice_settings: { default_payment_method: 'pm_customer_bbbb' },
      });
      mockListPaymentMethods.mockResolvedValue({
        data: [card('pm_subscription_aaaa'), card('pm_customer_bbbb')],
      });
    });

    async function defaults() {
      const response = await GET(req());
      const body = (await response.json()) as {
        payment_methods: { id: string; is_default: boolean }[];
      };
      return {
        status: response.status,
        marked: body.payment_methods.filter((pm) => pm.is_default).map((pm) => pm.id),
      };
    }

    it('marks the subscription’s own default over the customer default', async () => {
      mockRetrieveSubscription.mockResolvedValue({
        default_payment_method: { id: 'pm_subscription_aaaa' },
      });

      expect(await defaults()).toEqual({ status: 200, marked: ['pm_subscription_aaaa'] });
    });

    it('falls back to the customer default once the subscription is read and has none', async () => {
      mockRetrieveSubscription.mockResolvedValue({ default_payment_method: null });

      expect(await defaults()).toEqual({ status: 200, marked: ['pm_customer_bbbb'] });
    });

    it('falls back to the customer default when Stripe says the subscription does not exist', async () => {
      mockRetrieveSubscription.mockRejectedValue(
        Object.assign(new Error('No such subscription'), { code: 'resource_missing' }),
      );

      expect(await defaults()).toEqual({ status: 200, marked: ['pm_customer_bbbb'] });
    });

    it('fails the list instead of naming the customer default when the subscription cannot be read', async () => {
      mockRetrieveSubscription.mockRejectedValue(new Error('stripe timed out'));

      const response = await GET(req());

      expect(response.status).toBe(500);
      const body = (await response.json()) as { payment_methods?: unknown };
      expect(body.payment_methods).toBeUndefined();
    });
  });
});
