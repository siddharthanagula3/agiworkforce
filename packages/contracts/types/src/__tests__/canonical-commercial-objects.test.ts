import { describe, expect, it } from 'vitest';

import {
  BILLING_PLAN_CAPABILITY_TIERS,
  BILLING_PLAN_PRICING,
  BILLING_PLAN_PRODUCT_LIMITS,
  SELF_SERVE_PAID_PLAN_TIERS,
  getPlanPriceCents,
  type BillingPlanCapability,
  type BillingPlanTier,
} from '../billing-catalog';
import {
  creditLedgerRemainingMicroUsd,
  entitlementGrants,
  isProductId,
  listPlans,
  listPlansForProduct,
  listProducts,
  toEntitlement,
  toProduct,
  type CreditLedger,
  type Entitlement,
  type Plan,
  type Product,
} from '../product-plan';

describe('Product', () => {
  it('names one product per catalog entry and nothing else', () => {
    const products = listProducts();
    expect(products.map((product) => product.id).sort()).toEqual(
      (Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[]).sort(),
    );
  });

  it('takes its label from the catalog rather than restating it', () => {
    for (const product of listProducts()) {
      expect(product.label).toBe(BILLING_PLAN_PRICING[product.id].label);
    }
  });

  it('marks exactly the self-serve tiers as sellable without a contract', () => {
    const sellable = listProducts()
      .filter((product) => product.selfServeSellable)
      .map((product) => product.id)
      .sort();
    expect(sellable).toEqual([...SELF_SERVE_PAID_PLAN_TIERS].sort());
  });

  it('marks Enterprise contract priced and Team per seat', () => {
    expect(toProduct('enterprise')).toMatchObject({
      contractPriced: true,
      audience: 'enterprise',
    });
    expect(toProduct('team')).toMatchObject({ perSeat: true, audience: 'workspace' });
  });

  it('normalizes an unknown or legacy id instead of inventing a product', () => {
    expect(toProduct('not-a-plan').id).toBe('free');
    expect(isProductId('not-a-plan')).toBe(false);
    expect(isProductId('max_15x')).toBe(true);
  });
});

describe('Plan', () => {
  it('prices every plan from the catalog, in minor units', () => {
    for (const plan of listPlans().filter((entry) => entry.currency === 'usd')) {
      expect(plan.priceMinorUnits).toBe(getPlanPriceCents(plan.productId, plan.interval));
    }
  });

  it('publishes no plan for a contract-priced product', () => {
    expect(listPlansForProduct('enterprise')).toEqual([]);
  });

  it('omits a yearly plan the catalog does not price', () => {
    const intervals = listPlansForProduct('max')
      .filter((plan) => plan.currency === 'usd')
      .map((plan) => plan.interval);
    expect(intervals).toEqual(['monthly']);
  });

  it('keeps the free product priced at zero on both intervals', () => {
    const free = listPlansForProduct('free').filter((plan) => plan.currency === 'usd');
    expect(free.map((plan) => plan.priceMinorUnits)).toEqual([0, 0]);
  });

  it('carries the rupee price as its own plan rather than a converted dollar one', () => {
    const inr = listPlansForProduct('pro').find((plan) => plan.currency === 'inr');
    expect(inr).toMatchObject({ interval: 'monthly', priceMinorUnits: 199900 });
  });

  it('carries the per-seat flag onto each of a per-seat product plans', () => {
    expect(listPlansForProduct('team').every((plan: Plan) => plan.perSeat)).toBe(true);
  });
});

describe('Entitlement', () => {
  it('grants exactly the capabilities the catalog lists for the product', () => {
    for (const product of listProducts()) {
      const entitlement: Entitlement = toEntitlement(product.id);
      const expected = (Object.keys(BILLING_PLAN_CAPABILITY_TIERS) as BillingPlanCapability[])
        .filter((capability) => BILLING_PLAN_CAPABILITY_TIERS[capability].includes(product.id))
        .sort();
      expect(entitlement.capabilities).toEqual(expected);
    }
  });

  it('carries the catalog limits object, not a copy of its numbers', () => {
    expect(toEntitlement('pro').limits).toBe(BILLING_PLAN_PRODUCT_LIMITS['pro']);
  });

  it('answers a capability question', () => {
    expect(entitlementGrants(toEntitlement('enterprise'), 'enterprise_controls')).toBe(true);
    expect(entitlementGrants(toEntitlement('free'), 'enterprise_controls')).toBe(false);
    expect(entitlementGrants(toEntitlement('byok'), 'managed_chat')).toBe(false);
  });
});

describe('CreditLedger', () => {
  const ledger: CreditLedger = {
    balance: {
      subjectId: 'user-1',
      allocatedMicroUsd: 5_000_000,
      usedMicroUsd: 1_500_000,
      topUpAllocatedMicroUsd: 500_000,
      flagshipUsedTodayMicroUsd: 250_000,
    },
    entries: [
      {
        id: 'entry-1',
        subjectId: 'user-1',
        kind: 'allocation',
        amountMicroUsd: 5_000_000,
        idempotencyKey: 'cycle-2026-09',
        occurredAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  };

  it('computes what is left from allocation plus top-up minus use', () => {
    expect(creditLedgerRemainingMicroUsd(ledger.balance)).toBe(4_000_000);
  });

  it('never reports a negative balance when use overran the allocation', () => {
    expect(creditLedgerRemainingMicroUsd({ ...ledger.balance, usedMicroUsd: 9_000_000 })).toBe(0);
  });
});

describe('the naming layer does not fork the catalog', () => {
  it('derives every product field from the catalog objects', () => {
    const product: Product = toProduct('basic');
    expect(product).toEqual({
      id: 'basic',
      label: BILLING_PLAN_PRICING['basic'].label,
      audience: 'individual',
      selfServeSellable: true,
      contractPriced: false,
      perSeat: false,
    });
  });
});
