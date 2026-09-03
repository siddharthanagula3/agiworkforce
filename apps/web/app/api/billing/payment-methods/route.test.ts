import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockGetUserScopedDb, mockQuery, mockRetrieveCustomer, mockListPaymentMethods } = vi.hoisted(
  () => {
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_dummy';
    return {
      mockGetUserScopedDb: vi.fn(),
      mockQuery: vi.fn(),
      mockRetrieveCustomer: vi.fn(),
      mockListPaymentMethods: vi.fn(),
    };
  },
);

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
    subscriptions = { retrieve: vi.fn(async () => ({ default_payment_method: null })) };
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

  it('rejects when authentication fails', async () => {
    mockGetUserScopedDb.mockRejectedValue(new Error('unauthorized'));

    const response = await GET(req());

    expect(response.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
