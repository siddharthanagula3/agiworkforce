import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BILLING_PLAN_CAPABILITY_TIERS,
  BILLING_PLAN_PRICING,
  BILLING_PLAN_PRODUCT_LIMITS,
  PLAN_SURFACE_VISIBILITY,
  listPlanCatalog,
  type BillingPlanTier,
} from '@agiworkforce/types';

import { MANAGED_USAGE_LIMITS } from './managed-usage-caps';
import { PLAN_CREDIT_ALLOWANCES } from './plan-credits';

/**
 * Adding a plan means editing every registry keyed by tier. TypeScript forces
 * each one to be exhaustive, but nothing said how many there were, so the cost
 * of a new plan was unknowable until the build broke. This pins the list.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../..');

const PER_TIER_REGISTRY_FILES = [
  'apps/web/lib/billing/managed-usage-caps.ts',
  'apps/web/lib/billing/plan-credits.ts',
  'packages/contracts/types/src/billing-catalog.ts',
  'packages/contracts/types/src/billing-plan-catalog.ts',
];

const TIERS = Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[];

function registryFilesInTree(): string[] {
  // --untracked, or a registry added in this very change is invisible to the
  // guard that exists to notice it.
  const output = execFileSync(
    'git',
    ['grep', '--untracked', '-l', '--', 'Record<BillingPlanTier', '--', 'apps', 'packages'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  return output
    .split('\n')
    .filter((line) => line.length > 0 && !/\.test\.tsx?$/u.test(line) && !line.includes('/dist/'))
    .sort();
}

describe('every registry keyed by plan tier covers every plan', () => {
  it.each([
    ['BILLING_PLAN_PRICING', BILLING_PLAN_PRICING],
    ['BILLING_PLAN_PRODUCT_LIMITS', BILLING_PLAN_PRODUCT_LIMITS],
    ['PLAN_SURFACE_VISIBILITY', PLAN_SURFACE_VISIBILITY],
    ['MANAGED_USAGE_LIMITS', MANAGED_USAGE_LIMITS],
    ['PLAN_CREDIT_ALLOWANCES', PLAN_CREDIT_ALLOWANCES],
  ])('%s', (_name, registry) => {
    expect(Object.keys(registry).sort()).toEqual([...TIERS].sort());
  });

  it('places every plan in every capability tier list or deliberately out of it', () => {
    const listed = new Set(Object.values(BILLING_PLAN_CAPABILITY_TIERS).flat());
    for (const tier of TIERS) {
      const capable = Object.values(BILLING_PLAN_CAPABILITY_TIERS).some((tiers) =>
        tiers.includes(tier),
      );
      expect(capable || !listed.has(tier), `${tier} is in no capability list`).toBe(true);
    }
  });

  it('gives every plan a catalog entry, so a new plan is never unsellable by omission', () => {
    expect(
      listPlanCatalog()
        .map((entry) => entry.tier)
        .sort(),
    ).toEqual([...TIERS].sort());
  });
});

describe('the cost of adding a plan is a known list of files', () => {
  it('finds no per-tier registry outside the pinned list', () => {
    expect(
      registryFilesInTree(),
      'a new Record<BillingPlanTier,...> means another file to edit for every plan; add it here and to docs if it is genuinely needed',
    ).toEqual([...PER_TIER_REGISTRY_FILES].sort());
  });
});
