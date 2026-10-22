const mockGet = jest.fn();
const mockGetStorefront = jest.fn();

jest.mock('@/services/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));

jest.mock('expo-iap', () => ({
  getStorefront: () => mockGetStorefront(),
}));

import { Platform } from 'react-native';
import {
  fetchMobileIapCatalog,
  parseMobileIapCatalogResponse,
} from '@/src/features/billing/mobileIapService';

function disabledCatalog(extra: Record<string, unknown>) {
  return {
    enabled: false,
    platform: 'android',
    appAccountToken: null,
    products: [],
    unavailableReason: 'Native purchases are not enabled for this deployment.',
    ...extra,
  };
}

describe('native catalog request', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(disabledCatalog({}));
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  });

  it.each([
    ['ios', 'JPN'],
    ['android', 'JP'],
  ])('sends the %s store country so the server can withhold top-ups', async (os, storefront) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    mockGetStorefront.mockResolvedValue(storefront);

    await fetchMobileIapCatalog();

    expect(mockGet).toHaveBeenCalledWith(
      `/api/mobile/iap/catalog?platform=${os}&storefront=${storefront}`,
    );
  });

  it('still loads plans when the store country cannot be read', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    mockGetStorefront.mockRejectedValue(new Error('not-prepared'));

    await fetchMobileIapCatalog();

    expect(mockGet).toHaveBeenCalledWith('/api/mobile/iap/catalog?platform=ios');
  });
});

describe('native catalog parsing', () => {
  it('reads an unavailable catalog without any access gate', () => {
    const catalog = parseMobileIapCatalogResponse(
      disabledCatalog({ unavailableCode: 'waitlist_access_required' }),
    );

    expect(catalog).not.toHaveProperty('unavailableCode');
    expect(catalog.enabled).toBe(false);
    expect(catalog.products).toEqual([]);
  });

  const accountToken = '00000000-0000-4000-8000-000000000001';
  const pro = {
    key: 'subscription_pro_monthly',
    kind: 'subscription',
    planTier: 'pro',
    interval: 'monthly',
    intendedPriceUsd: 20,
    productId: 'agi_pro',
  };

  function sellingCatalog(extra: Record<string, unknown>) {
    return {
      enabled: true,
      platform: 'android',
      appAccountToken: accountToken,
      products: [pro],
      unavailableReason: null,
      ...extra,
    };
  }

  it('carries the configured Google Play base plan and offer through to the purchase', () => {
    const catalog = parseMobileIapCatalogResponse(
      sellingCatalog({
        products: [{ ...pro, googleOffer: { basePlanId: 'monthly', offerId: null } }],
      }),
    );

    expect(catalog.products[0]).toMatchObject({
      productId: 'agi_pro',
      googleOffer: { basePlanId: 'monthly', offerId: null },
    });
  });

  it('drops an offer it cannot read instead of guessing one', () => {
    const catalog = parseMobileIapCatalogResponse(
      sellingCatalog({ products: [{ ...pro, googleOffer: { offerId: 'launch' } }] }),
    );

    expect(catalog.products[0]).not.toHaveProperty('googleOffer');
  });

  it('accepts only replacement modes Play defines', () => {
    expect(
      parseMobileIapCatalogResponse(
        sellingCatalog({
          androidReplacementModes: { upgrade: 'charge-prorated-price', downgrade: 'deferred' },
        }),
      ).androidReplacementModes,
    ).toEqual({ upgrade: 'charge-prorated-price', downgrade: 'deferred' });
    expect(
      parseMobileIapCatalogResponse(
        sellingCatalog({ androidReplacementModes: { upgrade: 'instant', downgrade: 'deferred' } }),
      ),
    ).not.toHaveProperty('androidReplacementModes');
  });

  it('reads top-ups the catalog sells', () => {
    const catalog = parseMobileIapCatalogResponse(
      sellingCatalog({
        products: [
          pro,
          {
            key: 'top_up_10',
            kind: 'top_up',
            amountUsd: 10,
            units: 500,
            productId: 'agi_topup_10',
          },
        ],
      }),
    );

    expect(catalog.products.map((product) => product.kind)).toEqual(['subscription', 'top_up']);
  });

  it('reads why plans are withheld and which products the device must consume', () => {
    const catalog = parseMobileIapCatalogResponse(
      sellingCatalog({
        products: [],
        subscriptionsUnavailableReason: 'This account already has an active web subscription.',
        consumableProductIds: ['agi_topup_10', 7, ''],
      }),
    );

    expect(catalog.subscriptionsUnavailableReason).toMatch(/active web subscription/);
    expect(catalog.consumableProductIds).toEqual(['agi_topup_10']);
  });

  it('reads a catalog from a server that sends neither field', () => {
    const catalog = parseMobileIapCatalogResponse(sellingCatalog({}));

    expect(catalog).not.toHaveProperty('subscriptionsUnavailableReason');
    expect(catalog).not.toHaveProperty('consumableProductIds');
  });
});
