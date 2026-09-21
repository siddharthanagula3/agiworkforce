import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequireCurrentUserId, mockDb, mockKillSwitchGate } = vi.hoisted(() => ({
  mockRequireCurrentUserId: vi.fn(),
  mockDb: { current: null as unknown },
  mockKillSwitchGate: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-chat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-chat')>()),
  requireCurrentUserId: mockRequireCurrentUserId,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-db')>()),
  getNeonDb: () => mockDb.current,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: vi.fn(async () => ({
    db: mockDb.current,
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/feature-flags/capability-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/feature-flags/capability-gate')>()),
  readKillSwitchGate: mockKillSwitchGate,
}));
vi.mock('@/lib/feature-flags/flag-evaluation-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/feature-flags/flag-evaluation-service')>()),
  buildFlagSubject: vi.fn(() => ({ userId: 'user-1' })),
}));

import { GET } from '../route';

const PRODUCT_ID = 'com.agiworkforce.pro.monthly';
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
      JSON.stringify({ subscription_pro_monthly: PRODUCT_ID }),
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
});
