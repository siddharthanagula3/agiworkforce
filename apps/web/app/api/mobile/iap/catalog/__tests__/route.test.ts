import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/rate-limit');
type ScanModule1 = typeof import('@/lib/logger');
type ScanModule2 = typeof import('@/lib/server/neon-chat');
type ScanModule3 = typeof import('@/lib/server/neon-db');
type ScanModule4 = typeof import('@/lib/server/rls-db');
type ScanModule5 = typeof import('@/lib/feature-flags/capability-gate');
type ScanModule6 = typeof import('@/lib/feature-flags/flag-evaluation-service');

const { mockRequireCurrentUserId, mockDb, mockKillSwitchGate } = vi.hoisted(() => ({
  mockRequireCurrentUserId: vi.fn(),
  mockDb: { current: null as unknown, ownRows: null as unknown },
  mockKillSwitchGate: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  withRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-chat', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  requireCurrentUserId: mockRequireCurrentUserId,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  getNeonDb: () => mockDb.current,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  getUserScopedDb: vi.fn(async () => ({
    db: mockDb.ownRows,
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/feature-flags/capability-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  readKillSwitchGate: mockKillSwitchGate,
}));
vi.mock('@/lib/feature-flags/flag-evaluation-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  buildFlagSubject: vi.fn(() => ({ userId: 'user-1' })),
}));

import { GET } from '../route';

const PRODUCT_ID = 'com.agiworkforce.pro.monthly';
const TOP_UP_PRODUCT_ID = 'agi_topup_10';
const APP_ACCOUNT_TOKEN = '00000000-0000-4000-8000-000000000001';

function request(query = 'platform=android&storefront=US') {
  return new Request(
    `http://localhost:3000/api/mobile/iap/catalog?${query}`,
  ) as unknown as Parameters<typeof GET>[0];
}

function harness(options: {
  subscription?: Record<string, unknown>;
  accountRows?: Array<{ deletion_scheduled?: unknown }>;
  accountReadError?: boolean;
  planReadError?: boolean;
  consentWithdrawn?: boolean;
  consentReadError?: boolean;
}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('from public.profiles')) {
      if (options.accountReadError) throw new Error('account read unavailable');
      return options.accountRows ?? [{ deletion_scheduled: false }];
    }
    if (sql.includes('from subscriptions')) {
      if (options.planReadError) throw new Error('plan read unavailable');
      return options.subscription ? [options.subscription] : [];
    }
    throw new Error(`Unexpected scoped query: ${sql}`);
  });
  const adminQuery = vi.fn(async (sql: string) => {
    if (sql.includes('from public.mobile_app_transactions app')) {
      if (options.consentReadError) throw new Error('consent read unavailable');
      return options.consentWithdrawn ? [{ app_transaction_id: 'app-transaction-1' }] : [];
    }
    if (sql.includes('insert into public.mobile_iap_accounts')) {
      return [{ app_account_token: APP_ACCOUNT_TOKEN }];
    }
    throw new Error(`Unexpected privileged query: ${sql}`);
  });
  mockDb.ownRows = { query, execute: vi.fn(), transaction: vi.fn() };
  mockDb.current = { query: adminQuery, execute: vi.fn(), transaction: vi.fn() };
  return { query, adminQuery };
}

function productIds(body: { products: Array<{ productId: string }> }): string[] {
  return body.products.map((product) => product.productId);
}

const PAID_PLAY_PLAN = {
  plan_tier: 'pro',
  status: 'active',
  google_purchase_token: 'play-token-1',
};

describe('GET /api/mobile/iap/catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentUserId.mockResolvedValue('user-1');
    mockKillSwitchGate.mockResolvedValue({ capabilityAllowed: () => true });
    vi.stubEnv('MOBILE_IAP_ENABLED', 'true');
    vi.stubEnv(
      'MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON',
      JSON.stringify({
        subscription_pro_monthly: { productId: PRODUCT_ID, basePlanId: 'monthly' },
        top_up_10: TOP_UP_PRODUCT_ID,
      }),
    );
    vi.stubEnv(
      'MOBILE_IAP_APPLE_PRODUCT_IDS_JSON',
      JSON.stringify({
        subscription_pro_monthly: PRODUCT_ID,
        top_up_10: TOP_UP_PRODUCT_ID,
      }),
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it('offers store plans to an account with no paid history, with no waitlist or access code', async () => {
    const h = harness({});

    const response = await GET(request());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      enabled: true,
      appAccountToken: APP_ACCOUNT_TOKEN,
      unavailableReason: null,
    });
    expect(body).not.toHaveProperty('unavailableCode');
    expect(productIds(body)).toEqual([PRODUCT_ID]);
    expect(h.adminQuery).toHaveBeenCalledTimes(2);
    expect(h.adminQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('from public.mobile_app_transactions app'),
      ['user-1'],
    );
    expect(h.adminQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('insert into public.mobile_iap_accounts'),
      ['user-1'],
    );
    expect(h.query).not.toHaveBeenCalledWith(
      expect.stringContaining('beta_redemptions'),
      expect.anything(),
    );
  });

  it('names the deployment, not an access gate, when store products are not enabled', async () => {
    vi.stubEnv('MOBILE_IAP_ENABLED', 'false');
    const h = harness({});

    const body = await (await GET(request())).json();

    expect(body).toMatchObject({
      enabled: false,
      products: [],
      appAccountToken: null,
      unavailableReason: expect.stringContaining('not enabled'),
    });
    expect(body).not.toHaveProperty('unavailableCode');
    expect(h.query).not.toHaveBeenCalled();
    expect(h.adminQuery).not.toHaveBeenCalled();
  });

  it('keeps naming the kill switch when purchases are switched off', async () => {
    const h = harness({});
    mockKillSwitchGate.mockResolvedValue({ capabilityAllowed: () => false });

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      enabled: false,
      products: [],
      unavailableReason: expect.stringContaining('temporarily switched off'),
    });
    expect(h.query).not.toHaveBeenCalled();
    expect(h.adminQuery).not.toHaveBeenCalled();
  });

  it.each(['ios', 'android'])(
    'withholds every %s offer and binding while deletion is scheduled, retaining consumption metadata',
    async (platform) => {
      const h = harness({
        subscription: PAID_PLAY_PLAN,
        accountRows: [{ deletion_scheduled: true }],
      });

      const response = await GET(request(`platform=${platform}&storefront=US`));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        enabled: false,
        platform,
        appAccountToken: null,
        products: [],
        unavailableReason: 'Cancel the account deletion to change your plan.',
        consumableProductIds: [TOP_UP_PRODUCT_ID],
      });
      expect(h.query).toHaveBeenCalledTimes(1);
      expect(h.query).toHaveBeenCalledWith(
        expect.stringMatching(/select \(deletion_scheduled_for is not null\) as deletion_scheduled\s+from public\.profiles where id = \$1 limit 1/u),
        ['user-1'],
      );
      expect(h.adminQuery).not.toHaveBeenCalled();
    },
  );

  it.each([
    { name: 'missing profile', accountRows: [] },
    { name: 'missing field', accountRows: [{}] },
    { name: 'null field', accountRows: [{ deletion_scheduled: null }] },
    { name: 'string field', accountRows: [{ deletion_scheduled: 'false' }] },
    { name: 'account lookup rejection', accountReadError: true },
  ])('starts no purchase when account state is unavailable: $name', async (options) => {
    const h = harness(options);

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.adminQuery).not.toHaveBeenCalled();
  });

  it('starts no purchase when the plan cannot be read', async () => {
    const h = harness({ planReadError: true });

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(h.query).toHaveBeenCalledTimes(2);
    expect(h.adminQuery).toHaveBeenCalledTimes(1);
    expect(h.adminQuery).toHaveBeenCalledWith(
      expect.stringContaining('from public.mobile_app_transactions app'),
      ['user-1'],
    );
  });

  it.each(['ios', 'android'])(
    'withholds every %s offer after account-wide consent withdrawal, preserving recovery metadata',
    async (platform) => {
      const h = harness({
        subscription: {
          ...PAID_PLAY_PLAN,
          google_purchase_token: platform === 'android' ? 'play-token-1' : null,
          apple_original_transaction_id: platform === 'ios' ? 'apple-original-1' : null,
        },
        consentWithdrawn: true,
      });

      const response = await GET(request(`platform=${platform}&storefront=US`));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        enabled: false,
        platform,
        appAccountToken: null,
        products: [],
        unavailableReason:
          "A parent or guardian withdrew consent for this account's use of the app, so store purchases can't be added to it.",
        consumableProductIds: [TOP_UP_PRODUCT_ID],
      });
      expect(h.query).toHaveBeenCalledTimes(1);
      expect(h.query).toHaveBeenCalledWith(
        expect.stringContaining('from public.profiles where id = $1'),
        ['user-1'],
      );
      expect(h.adminQuery).toHaveBeenCalledTimes(1);
      expect(h.adminQuery).toHaveBeenCalledWith(
        expect.stringMatching(
          /from public\.mobile_app_transactions app\s+join public\.mobile_app_consent_rescissions rescission[\s\S]+where app\.user_id = \$1/u,
        ),
        ['user-1'],
      );
    },
  );

  it('starts no purchase when account-wide consent cannot be read', async () => {
    const h = harness({ consentReadError: true });

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.adminQuery).toHaveBeenCalledTimes(1);
    expect(h.adminQuery).toHaveBeenCalledWith(
      expect.stringContaining('from public.mobile_app_transactions app'),
      ['user-1'],
    );
  });

  it('sells top-ups in the app only to an account that holds a paid plan', async () => {
    harness({ subscription: PAID_PLAY_PLAN });
    expect(productIds(await (await GET(request())).json())).toEqual([
      PRODUCT_ID,
      TOP_UP_PRODUCT_ID,
    ]);

    harness({});
    expect(productIds(await (await GET(request())).json())).toEqual([PRODUCT_ID]);

    harness({ subscription: { ...PAID_PLAY_PLAN, status: 'canceled' } });
    expect(productIds(await (await GET(request())).json())).toEqual([PRODUCT_ID]);
  });

  it.each([
    ['an App Store storefront', 'platform=ios&storefront=JPN'],
    ['a Google Play country', 'platform=android&storefront=JP'],
  ])('sells plans but no top-up in Japan through %s', async (_store, query) => {
    harness({
      subscription: {
        ...PAID_PLAY_PLAN,
        google_purchase_token: null,
        apple_original_transaction_id: null,
        stripe_subscription_id: null,
      },
    });

    const body = await (await GET(request(query))).json();

    expect(body.enabled).toBe(true);
    expect(productIds(body)).toEqual([PRODUCT_ID]);
    expect(body.consumableProductIds).toEqual([TOP_UP_PRODUCT_ID]);
  });

  it.each([
    ['an App Store storefront', 'platform=ios&storefront=USA'],
    ['a Google Play country', 'platform=android&storefront=us'],
  ])('sells top-ups outside Japan through %s', async (_store, query) => {
    harness({ subscription: PAID_PLAY_PLAN });

    const body = await (await GET(request(query))).json();

    expect(body.products.map((product: { kind: string }) => product.kind)).toContain('top_up');
  });

  it('sells no top-up when the app could not read the store country', async () => {
    harness({ subscription: PAID_PLAY_PLAN });

    const body = await (await GET(request('platform=android'))).json();

    expect(productIds(body)).toEqual([PRODUCT_ID]);
  });

  it('refuses a storefront that is not a store country code', async () => {
    harness({ subscription: PAID_PLAY_PLAN });

    const response = await GET(request('platform=android&storefront=J1P'));

    expect(response.status).toBe(400);
  });

  it.each([
    ['the web', { stripe_subscription_id: 'sub_live123' }, /web subscription/i],
    [
      'the App Store',
      { apple_original_transaction_id: '2000000123', current_period_end: '2999-01-01T00:00:00Z' },
      /another billing provider/i,
    ],
  ])(
    'offers no plan the ledger would refuse to an account still billed through %s',
    async (_owner, owner, reason) => {
      harness({ subscription: { plan_tier: 'pro', status: 'active', ...owner } });

      const body = await (await GET(request())).json();

      expect(body.enabled).toBe(true);
      expect(productIds(body)).toEqual([TOP_UP_PRODUCT_ID]);
      expect(body.subscriptionsUnavailableReason).toMatch(reason);
    },
  );

  it('offers plans again once the other channel has stopped billing the account', async () => {
    harness({
      subscription: { plan_tier: 'free', status: 'canceled', stripe_subscription_id: 'sub_old123' },
    });

    const body = await (await GET(request())).json();

    expect(productIds(body)).toEqual([PRODUCT_ID]);
    expect(body.subscriptionsUnavailableReason).toBeNull();
  });

  it('names every consumable the device must consume, including ones it is not offering', async () => {
    harness({});

    const body = await (await GET(request())).json();

    expect(productIds(body)).toEqual([PRODUCT_ID]);
    expect(body.consumableProductIds).toEqual([TOP_UP_PRODUCT_ID]);
  });

  it('returns the Google Play base plan and the replacement mode for each direction', async () => {
    harness({});

    const body = await (await GET(request())).json();

    expect(body.products[0]).toMatchObject({
      productId: PRODUCT_ID,
      googleOffer: { basePlanId: 'monthly', offerId: null },
    });
    expect(body.androidReplacementModes).toEqual({
      upgrade: 'charge-prorated-price',
      downgrade: 'deferred',
    });
  });
});
