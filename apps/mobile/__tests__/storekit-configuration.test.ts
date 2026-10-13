import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MOBILE_IAP_PRODUCT_DEFINITIONS,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  getBillingPlanPricing,
} from '@agiworkforce/types';

interface StoreKitSubscription {
  productID: string;
  displayPrice: string;
  groupNumber: number;
  recurringSubscriptionPeriod: string;
  subscriptionGroupID: string;
  type: string;
  familyShareable: boolean;
  localizations: Array<{ displayName: string }>;
}

interface StoreKitProduct {
  productID: string;
  displayPrice: string;
  type: string;
  localizations: Array<{ displayName: string }>;
}

const mobileRoot = join(__dirname, '..');
const repoRoot = join(mobileRoot, '..', '..');
const storeKit = JSON.parse(
  readFileSync(join(mobileRoot, 'store-listing/ios/AGIWorkforce.storekit'), 'utf8'),
) as {
  products: StoreKitProduct[];
  subscriptionGroups: Array<{ id: string; name: string; subscriptions: StoreKitSubscription[] }>;
};
const runbook = readFileSync(join(repoRoot, 'docs/runbooks/mobile-store-products.md'), 'utf8');

function fencedJson(heading: string): Record<string, unknown> {
  const start = runbook.indexOf(`\n${heading}\n`);
  if (start < 0) throw new Error(`The runbook has no "${heading}" block`);
  const section = runbook.slice(start);
  const match = /```json\n([\s\S]*?)\n```/.exec(section);
  if (!match?.[1]) throw new Error(`The runbook has no JSON block under "${heading}"`);
  return JSON.parse(match[1]) as Record<string, unknown>;
}

const appleIds = fencedJson('`MOBILE_IAP_APPLE_PRODUCT_IDS_JSON`') as Record<string, string>;
const googleIds = fencedJson('`MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON`') as Record<
  string,
  string | { productId: string; basePlanId: string }
>;
const subscriptions = MOBILE_IAP_PRODUCT_DEFINITIONS.flatMap((item) =>
  item.kind === 'subscription' ? [item] : [],
);
const topUps = MOBILE_IAP_PRODUCT_DEFINITIONS.flatMap((item) =>
  item.kind === 'top_up' ? [item] : [],
);

describe('the StoreKit configuration used for local purchase testing', () => {
  it('holds every plan in one subscription group, so a plan change is an upgrade or a downgrade', () => {
    expect(storeKit.subscriptionGroups).toHaveLength(1);
    const [group] = storeKit.subscriptionGroups;
    expect(group?.subscriptions).toHaveLength(subscriptions.length);
    for (const subscription of group?.subscriptions ?? []) {
      expect(subscription.subscriptionGroupID).toBe(group?.id);
      expect(subscription.type).toBe('RecurringSubscription');
      expect(subscription.recurringSubscriptionPeriod).toBe('P1M');
      expect(subscription.familyShareable).toBe(false);
    }
  });

  it('charges the catalog price for each plan and names it as buyers see it', () => {
    const [group] = storeKit.subscriptionGroups;
    for (const definition of subscriptions) {
      const configured = group?.subscriptions.find(
        (item) => item.productID === appleIds[definition.key],
      );
      expect([definition.key, configured?.displayPrice]).toEqual([
        definition.key,
        definition.intendedPriceUsd.toFixed(2),
      ]);
      expect(configured?.localizations[0]?.displayName).toBe(
        `AGI ${getBillingPlanPricing(definition.planTier).label}`,
      );
    }
  });

  it('ranks the plans in the order of the upgrade ladder, level 1 highest', () => {
    const [group] = storeKit.subscriptionGroups;
    const byLevel = [...(group?.subscriptions ?? [])].sort((a, b) => a.groupNumber - b.groupNumber);
    const expected = [...SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER]
      .reverse()
      .map((tier) => appleIds[`subscription_${tier}_monthly`]);
    expect(byLevel.map((item) => item.productID)).toEqual(expected);
    expect(byLevel.map((item) => item.groupNumber)).toEqual(expected.map((_, index) => index + 1));
  });

  it('sells every top-up as a consumable at its catalog amount', () => {
    expect(storeKit.products).toHaveLength(topUps.length);
    for (const definition of topUps) {
      const configured = storeKit.products.find(
        (item) => item.productID === appleIds[definition.key],
      );
      expect([definition.key, configured?.type, configured?.displayPrice]).toEqual([
        definition.key,
        'Consumable',
        definition.amountUsd.toFixed(2),
      ]);
      expect(configured?.localizations[0]?.displayName).toBe(
        `${definition.units.toLocaleString('en-US')} credits`,
      );
    }
  });
});

describe('the product ids the setup runbook proposes', () => {
  const keys = MOBILE_IAP_PRODUCT_DEFINITIONS.map((item) => item.key).sort();

  it('maps every product the contract defines, once, for each store', () => {
    expect(Object.keys(appleIds).sort()).toEqual(keys);
    expect(Object.keys(googleIds).sort()).toEqual(keys);
    expect(new Set(Object.values(appleIds)).size).toBe(keys.length);
  });

  it('keeps App Store product ids to lowercase letters, digits and periods under the bundle id', () => {
    for (const id of Object.values(appleIds)) {
      expect([id, /^com\.agiworkforce\.app\.[a-z0-9.]+$/.test(id)]).toEqual([id, true]);
    }
  });

  it('follows the Google Play product and base plan id rules', () => {
    for (const definition of MOBILE_IAP_PRODUCT_DEFINITIONS) {
      const entry = googleIds[definition.key];
      const id = typeof entry === 'string' ? entry : entry?.productId;
      expect([id, /^[a-z0-9][a-z0-9_.]{0,39}$/.test(id ?? '')]).toEqual([id, true]);
      if (definition.kind === 'subscription') {
        expect(typeof entry).toBe('object');
        expect(/^[a-z0-9][a-z0-9-]{0,62}$/.test((entry as { basePlanId: string }).basePlanId)).toBe(
          true,
        );
      } else {
        expect(typeof entry).toBe('string');
      }
    }
  });
});
