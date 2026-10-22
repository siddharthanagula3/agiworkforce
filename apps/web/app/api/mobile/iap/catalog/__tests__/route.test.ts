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
  mockDb: { current: null as unknown },
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
    db: mockDb.current,
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

function harness(options: { subscription?: Record<string, unknown> }) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('from subscriptions')) {
      return options.subscription ? [options.subscription] : [];
    }
    if (sql.includes('insert into public.mobile_iap_accounts')) {
      return [{ app_account_token: APP_ACCOUNT_TOKEN }];
    }
    return [];
  });
  mockDb.current = { query, execute: vi.fn(), transaction: vi.fn() };
  return { query };
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
  });

  it('keeps naming the kill switch when purchases are switched off', async () => {
    harness({});
    mockKillSwitchGate.mockResolvedValue({ capabilityAllowed: () => false });

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      enabled: false,
      products: [],
      unavailableReason: expect.stringContaining('temporarily switched off'),
    });
  });

  it('starts no purchase when the plan cannot be read', async () => {
    mockDb.current = {
      query: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
      execute: vi.fn(),
      transaction: vi.fn(),
    };

    const response = await GET(request());

    expect(response.status).toBe(503);
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
