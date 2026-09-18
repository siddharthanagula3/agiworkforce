import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { BILLING_PLAN_CATALOG_VERSION, BILLING_PLAN_PRICING } from '@agiworkforce/types';

import {
  catalogOffer,
  listCatalogOffers,
  listPurchasableOffers,
  resolveCheckoutPlan,
  resolveSubscriberPlan,
} from '../plan-catalog-service';

describe('catalog offers', () => {
  it('offers one entry per catalog plan, assembled rather than restated', () => {
    expect(
      listCatalogOffers()
        .map((offer) => offer.product.id)
        .sort(),
    ).toEqual(Object.keys(BILLING_PLAN_PRICING).sort());
  });

  it('carries the product, the catalog entry, the prices and the entitlement together', () => {
    const offer = catalogOffer('pro');
    expect(offer.product.id).toBe('pro');
    expect(offer.catalog.sellability).toBe('self_serve');
    expect(offer.plans.length).toBeGreaterThan(0);
    expect(offer.entitlement.productId).toBe('pro');
  });

  it('leaves the contract-priced plan out of what can be bought without sales', () => {
    const purchasable = listPurchasableOffers().map((offer) => offer.product.id);
    expect(purchasable).not.toContain('enterprise');
    expect(purchasable).toContain('pro');
  });
});

describe('checkout resolution', () => {
  it('sends a buyer to the plan they asked for while it is on sale', () => {
    expect(resolveCheckoutPlan('max')).toBe('max');
  });

  it('sends nobody to checkout for a contract-priced plan', () => {
    expect(resolveCheckoutPlan('enterprise')).toBeNull();
  });
});

describe('subscriber resolution', () => {
  it('keeps a subscriber on the plan they bought', () => {
    expect(resolveSubscriberPlan({ tier: 'max_15x', soldUnderCatalogVersion: null })).toMatchObject(
      {
        soldAs: 'max_15x',
        effective: 'max_15x',
        grandfathered: false,
        repriced: false,
      },
    );
  });

  it('flags a subscriber bought under an older catalog rather than reading them as current', () => {
    const resolution = resolveSubscriberPlan({
      tier: 'pro',
      soldUnderCatalogVersion: BILLING_PLAN_CATALOG_VERSION - 1,
    });

    expect(resolution.repriced).toBe(true);
    expect(resolution.soldUnderCatalogVersion).toBe(BILLING_PLAN_CATALOG_VERSION - 1);
    expect(resolution.effective).toBe('pro');
  });
});
