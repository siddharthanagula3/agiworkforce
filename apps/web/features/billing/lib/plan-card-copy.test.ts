import { createInstance } from 'i18next';
import { resources } from '@agiworkforce/i18n';
import { getBillingPlanProductLimits, type BillingPlanTier } from '@agiworkforce/types';
import { formatBytes } from '@shared/utils/format';
import { beforeAll, describe, expect, it } from 'vitest';
import { individualPlanFeatures, type PricingT } from './plan-card-copy';

let t: PricingT;

beforeAll(async () => {
  const instance = createInstance();
  await instance.init({
    lng: 'en',
    resources,
    ns: ['pricing', 'models'],
    defaultNS: 'pricing',
    interpolation: { escapeValue: false },
  });
  t = instance.getFixedT('en', 'pricing') as PricingT;
});

function storageOf(plan: BillingPlanTier): string {
  const bytes = getBillingPlanProductLimits(plan)?.knowledgeStorageBytes;
  if (typeof bytes !== 'number') throw new Error(`${plan} has no knowledge storage`);
  return formatBytes(bytes, 0);
}

describe('plan card projects and storage line', () => {
  it('states the project count and the storage for a plan with a project limit', () => {
    const projects = getBillingPlanProductLimits('free')?.projects;
    expect(typeof projects).toBe('number');
    expect(individualPlanFeatures('free', t)).toContain(
      `${projects} projects with ${storageOf('free')} of knowledge storage`,
    );
  });

  it('states no set limit and the storage for a plan whose projects are unlimited', () => {
    for (const plan of ['basic', 'pro'] as const) {
      expect(getBillingPlanProductLimits(plan)?.projects, plan).toBe('unlimited');
      expect(individualPlanFeatures(plan, t), `${plan} card`).toContain(
        `Projects with no set limit and ${storageOf(plan)} of storage`,
      );
    }
  });
});
