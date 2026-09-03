import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { BILLING_PLAN_PRODUCT_LIMITS, toEnforceableBillingPlanLimit } from '@agiworkforce/types';

describe('organization limit conversion', () => {
  it('never converts a negotiated Enterprise limit to zero', () => {
    const enterprise = BILLING_PLAN_PRODUCT_LIMITS['enterprise'];

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
        if (declared !== undefined && declared !== 0) {
          expect(converted, `${plan}.${key} declared ${String(declared)} converted to 0`).not.toBe(
            0,
          );
        }
      }
    }
  });

  it('still fails closed for an unknown limit', () => {
    expect(toEnforceableBillingPlanLimit(undefined)).toBe(0);
  });

  it('no workspace surface redeclares the limit conversion', async () => {
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

    const canonical = path.join('packages', 'contracts', 'types', 'src', 'billing-catalog.ts');
    expect(
      fs.existsSync(path.join(repoRoot, canonical)),
      `${canonical} is the canonical converter this guard exempts; it moved or was renamed`,
    ).toBe(true);

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
    expect(sources.length).toBeGreaterThan(500);

    const offenders: string[] = [];
    let next = 0;
    const reader = async (): Promise<void> => {
      while (next < sources.length) {
        const rel = sources[next++];
        if (rel === undefined) return;
        let raw: string;
        try {
          raw = await fsp.readFile(path.join(repoRoot, rel), 'utf8');
        } catch {
          continue;
        }
        if (!raw.includes('BillingPlanLimit') && !raw.includes("'unlimited'")) continue;

        const src = stripComments(raw);
        for (const { why, re } of patterns) {
          if (re.test(src)) {
            offenders.push(`${rel}, ${why}`);
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
