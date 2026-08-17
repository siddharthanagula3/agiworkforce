import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const RETIRED_GATE_MODULES = [
  'utils/featureGates.ts',
  'constants/pricing.ts',
  'constants/planFeatures.ts',
];

const RETIRED_GATE_SYMBOLS = [
  'checkFeatureAccess',
  'checkUsageLimit',
  'checkAutomationLimit',
  'checkApiCallLimit',
  'checkStorageLimit',
  'shouldShowUsageWarning',
  'getRecommendedUpgrade',
  'isInGracePeriod',
  'getGracePeriodDaysRemaining',
  'getDaysUntilRenewal',
  'PLAN_FEATURES',
  'PRICING_PLANS',
  'getPlanById',
  'getStripePriceId',
];

function sourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      sourceFiles(full, files);
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

describe('desktop plan-gate subsystem stays retired', () => {
  it('keeps the unenforced gate modules deleted', () => {
    const stillPresent = RETIRED_GATE_MODULES.filter((relative) =>
      existsSync(path.join(SRC, relative)),
    );
    expect(stillPresent).toEqual([]);
  });

  it('has no source referencing the retired gate symbols', () => {
    const selfPath = fileURLToPath(import.meta.url);
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      if (file === selfPath) continue;
      const source = readFileSync(file, 'utf8');
      for (const symbol of RETIRED_GATE_SYMBOLS) {
        if (new RegExp(`\\b${symbol}\\b`).test(source)) {
          offenders.push(`${path.relative(SRC, file)} -> ${symbol}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
