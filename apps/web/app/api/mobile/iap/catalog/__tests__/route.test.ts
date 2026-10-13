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

function request() {
  return new Request(
    'http://localhost:3000/api/mobile/iap/catalog?platform=android',
  ) as unknown as Parameters<typeof GET>[0];
}

function harness(options: { subscription?: Record<string, unknown>; redeemed?: boolean }) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('from subscriptions')) {
      return options.subscription ? [options.subscription] : [];
    }
    if (sql.includes('beta_redemptions')) return [{ granted: options.redeemed === true }];
    if (sql.includes('to_regclass')) return [{ ready: true }];
    if (sql.includes('insert into public.mobile_iap_accounts')) {
      return [{ app_account_token: APP_ACCOUNT_TOKEN }];
    }
    return [];
  });
  mockDb.current = { query, execute: vi.fn(), transaction: vi.fn() };
  return { query };
}

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
  });

  afterEach(() => vi.unstubAllEnvs());

  it('offers nothing to buy to an account with no paid history and no upgrade access', async () => {
    harness({ redeemed: false });

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      enabled: false,
      products: [],
      appAccountToken: null,
      unavailableCode: 'waitlist_access_required',
      unavailableReason: expect.stringContaining('Paid upgrades are opening in stages'),
    });
  });

  it('keeps code redemption and the waitlist available before store products are enabled', async () => {
    vi.stubEnv('MOBILE_IAP_ENABLED', 'false');
    const h = harness({ redeemed: false });

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      enabled: false,
      products: [],
      appAccountToken: null,
      unavailableCode: 'waitlist_access_required',
      unavailableReason: expect.stringContaining('store products are ready'),
    });
    expect(h.query).not.toHaveBeenCalledWith(
      expect.stringContaining('insert into public.mobile_iap_accounts'),
      expect.anything(),
    );
  });

  it('keeps purchases disabled after a code is redeemed if store products are not enabled', async () => {
    vi.stubEnv('MOBILE_IAP_ENABLED', 'false');
    harness({ redeemed: true });

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      enabled: false,
      products: [],
      appAccountToken: null,
      unavailableCode: null,
      unavailableReason: expect.stringContaining('not enabled'),
    });
  });

  it('hides the access gate when the waitlist is turned off and purchases are not configured', async () => {
    vi.stubEnv('MOBILE_IAP_ENABLED', 'false');
    vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', '1');
    const h = harness({ redeemed: false });

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      enabled: false,
      products: [],
      unavailableCode: null,
    });
    expect(h.query).not.toHaveBeenCalled();
  });

  it('offers configured store products without a code after the waitlist is turned off', async () => {
    vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', '1');
    const h = harness({ redeemed: false });

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      enabled: true,
      appAccountToken: APP_ACCOUNT_TOKEN,
      products: [expect.objectContaining({ productId: PRODUCT_ID })],
      unavailableCode: null,
    });
    expect(h.query).not.toHaveBeenCalledWith(
      expect.stringContaining('beta_redemptions'),
      expect.anything(),
    );
  });

  it('offers the catalogue once upgrade access is redeemed', async () => {
    harness({ redeemed: true });

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      enabled: true,
      appAccountToken: APP_ACCOUNT_TOKEN,
      products: [expect.objectContaining({ productId: PRODUCT_ID })],
      unavailableCode: null,
    });
  });

  it('offers the catalogue to an account the store already bills', async () => {
    const h = harness({
      redeemed: false,
      subscription: {
        plan_tier: 'pro',
        status: 'active',
        google_purchase_token: 'play-token-1',
      },
    });

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({ enabled: true });
    expect(h.query).not.toHaveBeenCalledWith(
      expect.stringContaining('beta_redemptions'),
      expect.anything(),
    );
  });

  it('keeps naming the kill switch rather than the gate when purchases are switched off', async () => {
    harness({ redeemed: false });
    mockKillSwitchGate.mockResolvedValue({ capabilityAllowed: () => false });

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      enabled: false,
      unavailableCode: null,
      unavailableReason: expect.stringContaining('temporarily switched off'),
    });
  });

  it('starts no purchase when upgrade access cannot be read', async () => {
    mockDb.current = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('from subscriptions')) return [];
        throw new Error('database unavailable');
      }),
      execute: vi.fn(),
      transaction: vi.fn(),
    };

    const response = await GET(request());

    expect(response.status).toBe(503);
  });
  it('sells top-ups in the app only to an account that holds a paid plan', async () => {
    harness({
      redeemed: false,
      subscription: { plan_tier: 'pro', status: 'active', google_purchase_token: 'play-token-1' },
    });
    const paid = await (await GET(request())).json();
    expect(paid.products.map((product: { productId: string }) => product.productId)).toEqual([
      PRODUCT_ID,
      TOP_UP_PRODUCT_ID,
    ]);

    harness({ redeemed: true });
    const free = await (await GET(request())).json();
    expect(free.products.map((product: { productId: string }) => product.productId)).toEqual([
      PRODUCT_ID,
    ]);

    harness({
      redeemed: true,
      subscription: { plan_tier: 'pro', status: 'canceled', google_purchase_token: 'play-token-1' },
    });
    const lapsed = await (await GET(request())).json();
    expect(lapsed.products.map((product: { productId: string }) => product.productId)).toEqual([
      PRODUCT_ID,
    ]);
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
      expect(body.products.map((product: { productId: string }) => product.productId)).toEqual([
        TOP_UP_PRODUCT_ID,
      ]);
      expect(body.subscriptionsUnavailableReason).toMatch(reason);
    },
  );

  it('offers plans again once the other channel has stopped billing the account', async () => {
    harness({
      subscription: { plan_tier: 'free', status: 'canceled', stripe_subscription_id: 'sub_old123' },
    });

    const body = await (await GET(request())).json();

    expect(body.products.map((product: { productId: string }) => product.productId)).toEqual([
      PRODUCT_ID,
    ]);
    expect(body.subscriptionsUnavailableReason).toBeNull();
  });

  it('names every consumable the device must consume, including ones it is not offering', async () => {
    harness({ redeemed: true });

    const body = await (await GET(request())).json();

    expect(body.products.map((product: { productId: string }) => product.productId)).toEqual([
      PRODUCT_ID,
    ]);
    expect(body.consumableProductIds).toEqual([TOP_UP_PRODUCT_ID]);
  });

  it('returns the Google Play base plan and the replacement mode for each direction', async () => {
    harness({ redeemed: true });

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
