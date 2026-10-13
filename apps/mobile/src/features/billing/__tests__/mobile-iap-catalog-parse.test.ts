import { parseMobileIapCatalogResponse } from '@/src/features/billing/mobileIapService';

function disabledCatalog(extra: Record<string, unknown>) {
  return {
    enabled: false,
    platform: 'android',
    appAccountToken: null,
    products: [],
    unavailableReason: 'Paid upgrades are opening in stages.',
    ...extra,
  };
}

describe('native catalog parsing', () => {
  it('carries the upgrade-gate reason through to the client', () => {
    const catalog = parseMobileIapCatalogResponse(
      disabledCatalog({ unavailableCode: 'waitlist_access_required' }),
    );

    expect(catalog.unavailableCode).toBe('waitlist_access_required');
    expect(catalog.enabled).toBe(false);
    expect(catalog.products).toEqual([]);
  });

  it('reads a server that sends no reason code as an unavailable catalog', () => {
    expect(parseMobileIapCatalogResponse(disabledCatalog({})).unavailableCode).toBeNull();
    expect(
      parseMobileIapCatalogResponse(disabledCatalog({ unavailableCode: 'something_else' }))
        .unavailableCode,
    ).toBeNull();
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
      unavailableCode: null,
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
