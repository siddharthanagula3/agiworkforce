import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BILLING_PLAN_PRODUCT_LIMITS, toEnforceableBillingPlanLimit } from '@agiworkforce/types';

/**
 * CRIT-002 — a contract limit must never be converted to zero.
 *
 * `getOrganizationEntitlements` cannot be called here without a database, so
 * this pins the conversion it performs plus the property that made the bug
 * reachable: `shareProject`/`shareConnector` refuse outright at `=== 0`, so a
 * limit that converts to 0 is a total denial of the feature rather than a
 * smaller allowance.
 *
 * The defect: a local `toEnforceableLimit` copy handled 'unlimited' but had no
 * 'custom' arm, so it fell through to `typeof limit === 'number' ? limit : 0`.
 * Every Enterprise product limit is declared 'custom', so the only tier that
 * negotiates its limits became the only tier that could not share anything.
 */
describe('organization limit conversion', () => {
  it('never converts a negotiated Enterprise limit to zero', () => {
    const enterprise = BILLING_PLAN_PRODUCT_LIMITS['enterprise'];

    // Guards the premise: if the catalog stops declaring these 'custom', this
    // test would pass for the wrong reason.
    expect(enterprise?.projects).toBe('custom');
    expect(enterprise?.customMcpServers).toBe('custom');

    expect(toEnforceableBillingPlanLimit(enterprise?.projects)).toBeNull();
    expect(toEnforceableBillingPlanLimit(enterprise?.customMcpServers)).toBeNull();
  });

  it('converts every declared plan limit to a usable ceiling', () => {
    for (const [plan, limits] of Object.entries(BILLING_PLAN_PRODUCT_LIMITS)) {
      for (const key of ['projects', 'customMcpServers'] as const) {
        const declared = limits[key];
        const converted = toEnforceableBillingPlanLimit(declared);
        // A plan that declares a limit at all must not be denied the feature.
        // `null` (uncapped) and a positive number are both fine; 0 is only
        // correct when the catalog itself says 0.
        if (declared !== undefined && declared !== 0) {
          expect(converted, `${plan}.${key} declared ${String(declared)} converted to 0`).not.toBe(
            0,
          );
        }
      }
    }
  });

  it('still fails closed for an unknown limit', () => {
    // An unrecognised plan yields `undefined`, which must deny rather than
    // silently grant. This is the half of the behaviour that must NOT change.
    expect(toEnforceableBillingPlanLimit(undefined)).toBe(0);
  });

  /**
   * The fix above went to the second copy of this defect; the first was fixed
   * in `free-plan-entitlements.ts` and the copy here survived because the fix
   * went to a call site rather than to the owner. This is what stops a third.
   */
  it('no surface redeclares the limit conversion', () => {
    const webRoot = path.resolve(import.meta.dirname, '../../..');
    const skip = new Set(['node_modules', '.next', 'dist', '.turbo', 'e2e', '__tests__']);
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;

        const src = fs.readFileSync(full, 'utf8');
        // A local FUNCTION that maps BillingPlanLimit to a number. Importing
        // the canonical one is the whole point and must not trip this.
        if (/function\s+toEnforceable\w*Limit\s*\(/.test(src)) {
          offenders.push(path.relative(webRoot, full));
        }
      }
    };
    walk(webRoot);

    expect(
      offenders,
      `these files declare their own BillingPlanLimit converter instead of importing ` +
        `toEnforceableBillingPlanLimit. Every copy so far has omitted the 'custom' arm and ` +
        `silently denied Enterprise the feature:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
