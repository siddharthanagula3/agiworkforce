import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const tx = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
const db = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
}));

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));

const stripeMocks = vi.hoisted(() => ({ listCustomers: vi.fn(), listSubscriptions: vi.fn() }));
vi.mock('stripe', () => ({
  default: class StripeMock {
    customers = { list: stripeMocks.listCustomers };
    subscriptions = { list: stripeMocks.listSubscriptions };
  },
}));

import { SubscriptionService } from './subscription-service';

describe('SubscriptionService.syncWithStripe', () => {
  const originalKey = process.env['STRIPE_SECRET_KEY'];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_dummy';
    tx.execute.mockResolvedValue(0);
    stripeMocks.listCustomers.mockResolvedValue({ data: [] });
    stripeMocks.listSubscriptions.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env['STRIPE_SECRET_KEY'];
    else process.env['STRIPE_SECRET_KEY'] = originalKey;
  });

  it('binds the caller as the tenant before reading stripe_customer_id from profiles', async () => {
    tx.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT stripe_customer_id FROM profiles')) {
        return [{ stripe_customer_id: null }];
      }
      return [];
    });

    const result = await SubscriptionService.syncWithStripe('user_123', 'user@example.com');

    expect(result).toBeNull();
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.execute).toHaveBeenCalledWith('set local role app_rls');
    expect(tx.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("set_config('request.jwt.claim.sub', $1, true)"),
      ['user_123', ''],
    );
    expect(tx.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('SELECT stripe_customer_id FROM profiles'),
      ['user_123'],
    );
  });

  it('binds the caller before backfilling stripe_customer_id found by email', async () => {
    tx.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT stripe_customer_id FROM profiles')) {
        return [{ stripe_customer_id: null }];
      }
      return [];
    });
    stripeMocks.listCustomers.mockResolvedValue({
      data: [{ id: 'cus_1', metadata: { user_id: 'user_123' } }],
    });

    await SubscriptionService.syncWithStripe('user_123', 'user@example.com');

    expect(tx.execute).toHaveBeenCalledWith(
      'UPDATE profiles SET stripe_customer_id = $1 WHERE id = $2',
      ['cus_1', 'user_123'],
    );
  });
});

describe('SubscriptionService.syncWithStripe tier resolution', () => {
  const originalKey = process.env['STRIPE_SECRET_KEY'];
  const NOW = Math.floor(Date.now() / 1000);

  function activeSubscription(price: Record<string, unknown>) {
    return {
      id: 'sub_1',
      status: 'active',
      canceled_at: null,
      metadata: {},
      items: { data: [{ price }] },
      current_period_start: NOW,
      current_period_end: NOW + 30 * 24 * 60 * 60,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_dummy';
    tx.execute.mockResolvedValue(0);
    stripeMocks.listCustomers.mockResolvedValue({ data: [] });
    db.query.mockResolvedValue([{ get_or_create_credit_account: 'account_1' }]);
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env['STRIPE_SECRET_KEY'];
    else process.env['STRIPE_SECRET_KEY'] = originalKey;
    vi.unstubAllEnvs();
  });

  it('resolves the enterprise tier from the price product before falling back to price id', async () => {
    vi.stubEnv('STRIPE_PRODUCT_ENTERPRISE', 'prod_enterprise_1');
    tx.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT stripe_customer_id FROM profiles')) {
        return [{ stripe_customer_id: 'cus_1' }];
      }
      if (sql.includes('INSERT INTO subscriptions')) {
        return [{ id: 'row_1', user_id: 'user_123', plan_tier: 'enterprise' }];
      }
      return [];
    });
    stripeMocks.listSubscriptions.mockResolvedValue({
      data: [activeSubscription({ id: 'price_ent', product: 'prod_enterprise_1' })],
    });

    await SubscriptionService.syncWithStripe('user_123', 'user@example.com');

    const insert = tx.query.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO subscriptions'),
    );
    expect(insert).toBeDefined();
    expect(insert![1]).toContain('enterprise');
  });

  it('keeps the stored paid tier and logs an error rather than downgrading on an unmapped price', async () => {
    const loggerModule = await import('@/lib/logger');
    tx.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT stripe_customer_id FROM profiles')) {
        return [{ stripe_customer_id: 'cus_1' }];
      }
      if (sql.includes('SELECT plan_tier FROM subscriptions')) {
        return [{ plan_tier: 'pro' }];
      }
      if (sql.includes('INSERT INTO subscriptions')) {
        return [{ id: 'row_1', user_id: 'user_123', plan_tier: 'pro' }];
      }
      return [];
    });
    stripeMocks.listSubscriptions.mockResolvedValue({
      data: [activeSubscription({ id: 'price_unmapped_xyz' })],
    });

    await SubscriptionService.syncWithStripe('user_123', 'user@example.com');

    const insert = tx.query.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO subscriptions'),
    );
    expect(insert).toBeDefined();
    expect(insert![1]).toContain('pro');
    expect(insert![1]).not.toContain('free');
    expect(loggerModule.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: 'price_unmapped_xyz', storedTier: 'pro' }),
      expect.stringContaining('keeping the stored paid tier'),
    );
  });

  it('defaults to free on an unmapped price with no paid tier on record', async () => {
    tx.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT stripe_customer_id FROM profiles')) {
        return [{ stripe_customer_id: 'cus_1' }];
      }
      if (sql.includes('SELECT plan_tier FROM subscriptions')) {
        return [];
      }
      if (sql.includes('INSERT INTO subscriptions')) {
        return [{ id: 'row_1', user_id: 'user_123', plan_tier: 'free' }];
      }
      return [];
    });
    stripeMocks.listSubscriptions.mockResolvedValue({
      data: [activeSubscription({ id: 'price_unmapped_new' })],
    });

    await SubscriptionService.syncWithStripe('user_123', 'user@example.com');

    const insert = tx.query.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO subscriptions'),
    );
    expect(insert).toBeDefined();
    expect(insert![1]).toContain('free');
  });
});
