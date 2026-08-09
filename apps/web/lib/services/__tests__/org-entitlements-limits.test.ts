import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
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
   *
   * BIZ-005 — this guard used to walk `apps/web` only and match the single
   * literal `function toEnforceable<...>Limit(`. Both limits were wrong for the
   * defect it names:
   *
   *   - `BILLING_PLAN_PRODUCT_LIMITS` and the converter live in
   *     `packages/contracts/types` and are read by web, desktop AND mobile
   *     (`getPlanMaxScheduledTasks` in `apps/desktop/src/features/schedules`,
   *     `apps/mobile/app/(app)/schedules`). A third copy on any of those
   *     surfaces was invisible here while the failure message said "no surface".
   *   - Both historical copies happened to be named `toEnforceableLimit` and
   *     declared with the `function` keyword. `const toEnforceableLimit = (…)`,
   *     or the same body under any other name, walked straight past.
   *
   * So the walk now covers every workspace app and package, and the match is on
   * the SHAPE — a `BillingPlanLimit`-typed parameter converted to a number, or
   * the exact `typeof x === 'number' ? x : 0` fallback that produced the zero.
   * Display formatters (`formatLimit`, `limitLabel`, `formatPlanLimit`) take the
   * same input but return a string, so they are not conversions and do not trip.
   */
  it('no workspace surface redeclares the limit conversion', async () => {
    // apps/web/lib/services/__tests__ -> repo root.
    const repoRoot = path.resolve(import.meta.dirname, '../../../../..');
    const skip = new Set([
      'node_modules',
      '.next',
      '.turbo',
      '.git',
      'dist',
      'build',
      'out',
      'target',
      'coverage',
      'e2e',
      '__tests__',
      '__mocks__',
    ]);

    /**
     * The module that OWNS the conversion. Everything else must import it.
     * Anchored to the real path so a rename cannot silently exempt a copy.
     */
    const canonical = path.join('packages', 'contracts', 'types', 'src', 'billing-catalog.ts');
    expect(
      fs.existsSync(path.join(repoRoot, canonical)),
      `${canonical} is the canonical converter this guard exempts; it moved or was renamed`,
    ).toBe(true);

    // Comments quote the defective body on purpose (see the block above
    // `getOrganizationEntitlements`), so match code only.
    const stripComments = (src: string): string =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

    const patterns: ReadonlyArray<{ readonly why: string; readonly re: RegExp }> = [
      {
        why: 'declares its own toEnforceable…Limit',
        re: /\b(?:function|const|let|var)\s+toEnforceable\w*Limit\b/,
      },
      {
        why: 'converts a BillingPlanLimit parameter to a number',
        re: /:\s*BillingPlanLimit(?:\s*\|\s*undefined)?\s*\)\s*:\s*(?:number|null)\b/,
      },
      {
        why: "reproduces the `typeof x === 'number' ? x : 0` collapse",
        re: /typeof\s+([A-Za-z_$][\w$]*)\s*===\s*'number'\s*\?\s*\1\s*:\s*0/,
      },
    ];

    const sources: string[] = [];
    const collect = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collect(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const rel = path.relative(repoRoot, full);
        if (rel === canonical) continue;
        sources.push(rel);
      }
    };

    for (const workspace of ['apps', 'packages']) {
      const root = path.join(repoRoot, workspace);
      expect(fs.existsSync(root), `${workspace}/ not found from ${repoRoot}`).toBe(true);
      collect(root);
    }
    // A workspace-wide walk that silently found nothing would pass forever.
    expect(sources.length).toBeGreaterThan(500);

    const offenders: string[] = [];
    let next = 0;
    // Reading ~4k files one at a time costs seconds of wall clock; the reads
    // are independent, so a small pool keeps this inside a normal test budget.
    const reader = async (): Promise<void> => {
      while (next < sources.length) {
        const rel = sources[next++];
        if (rel === undefined) return;
        let raw: string;
        try {
          raw = await fsp.readFile(path.join(repoRoot, rel), 'utf8');
        } catch {
          // Another worktree operation removed the file mid-walk; nothing to scan.
          continue;
        }
        // Cheap pre-filter: the third pattern is the only one that can fire
        // without one of these tokens, and it is a limit conversion only when
        // the file also talks about the catalog's non-numeric limit states.
        if (!raw.includes('BillingPlanLimit') && !raw.includes("'unlimited'")) continue;

        const src = stripComments(raw);
        for (const { why, re } of patterns) {
          if (re.test(src)) {
            offenders.push(`${rel} — ${why}`);
            break;
          }
        }
      }
    };
    await Promise.all(Array.from({ length: 32 }, reader));
    offenders.sort();

    expect(
      offenders,
      `these files convert a BillingPlanLimit themselves instead of importing ` +
        `toEnforceableBillingPlanLimit from @agiworkforce/types. Every copy so far has omitted ` +
        `the 'custom' arm and silently denied Enterprise the feature:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
    // Cold CI disks make a workspace-wide read slower than the default budget.
  }, 60_000);
});
