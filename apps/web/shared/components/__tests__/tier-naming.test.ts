import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BILLING_PLAN_PRICING } from '@agiworkforce/types';

const WEB_ROOT = join(__dirname, '..', '..', '..');
const SKIP_DIRS = /^(?:\.|node_modules$|\.next$|dist$|build$|coverage$|e2e$|__snapshots__$)/;
const PRODUCT_FILE = /\.tsx?$/;
const TEST_FILE = /\.(?:test|spec)\.tsx?$/;

/**
 * `packages/contracts/types/src/billing-catalog.ts` is the one tier owner:
 * `BillingPlanTier` names them, `BILLING_PLAN_PRICING` labels them. A `Hobby`
 * tier the catalogue has never defined reached users through a code sample, and
 * an unused interface carried four more names from a taxonomy of its own.
 *
 * Scope is product source, not tests. A test that hands `resolveTierRateLimit`
 * or `isValidUpgrade` a retired value is exercising tolerance for rows stored
 * before the rename, which is the behaviour we want kept, not a leak.
 */
const RETIRED_TIER_NAMES = ['hobby', 'pro_plus'] as const;

/**
 * Files allowed to name a retired tier, each because it maps that stored value
 * onto a canonical one before anything renders it.
 */
const LEGACY_NORMALISERS: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'features/chat/components/InlinePaywallCard.tsx',
    why: 'maps a stored hobby value to basic before rendering the card',
  },
  {
    file: 'features/billing/hooks/use-billing-queries.ts',
    why: 'maps stored hobby and pro_plus values onto the catalogue names',
  },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.test(entry.name) ? [] : sourceFiles(full);
    return PRODUCT_FILE.test(entry.name) ? [full] : [];
  });
}

/**
 * Comments are stripped before matching. A doc comment that explains which
 * stored values `normalizeTier` folds has to name them, and that is the
 * tolerance working, not a tier reaching a user.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function productFiles(): Array<{ file: string; source: string }> {
  return sourceFiles(WEB_ROOT)
    .filter((path) => !TEST_FILE.test(path))
    .map((path) => ({
      file: relative(WEB_ROOT, path).split('\\').join('/'),
      source: withoutComments(readFileSync(path, 'utf8')),
    }));
}

/** A tier is always a quoted literal, in code and in copy. */
function productFilesNaming(names: readonly string[]): string[] {
  const pattern = new RegExp(`['"\`](?:${names.join('|')})['"\`]`);
  return productFiles()
    .filter(({ source }) => pattern.test(source))
    .map(({ file }) => file)
    .sort();
}

describe('web tier naming follows the billing catalogue', () => {
  it('names a retired tier only where a stored value is mapped onto a live one', () => {
    const allowed = new Set(LEGACY_NORMALISERS.map((entry) => entry.file));
    const unexpected = productFilesNaming(RETIRED_TIER_NAMES).filter((file) => !allowed.has(file));

    expect(
      unexpected,
      'these name a tier the billing catalogue does not define; use a BillingPlanTier',
    ).toEqual([]);
  });

  it('has no allowlist entry that stopped naming a retired tier', () => {
    const naming = new Set(productFilesNaming(RETIRED_TIER_NAMES));
    const stale = LEGACY_NORMALISERS.map((entry) => entry.file).filter((file) => !naming.has(file));

    expect(stale, 'drop these from the allowlist, the list may only shrink').toEqual([]);
  });

  it('declares no plan tier union of its own beside the catalogue', () => {
    // Scoped to a plan field. A model's own `tier` is a capability band that
    // happens to share three names, and it is not this catalogue's business.
    const declarations = productFiles()
      .filter(({ source }) =>
        /(?:subscription_tier|plan_tier|planTier)\s*[?]?\s*:\s*'[^']+'\s*\|/.test(source),
      )
      .map(({ file }) => file);

    expect(
      declarations,
      'a tier field must reference BillingPlanTier or SubscriptionTier, not a literal union',
    ).toEqual([]);
  });

  it('agrees with the catalogue about which tiers exist', () => {
    const catalogue = Object.keys(BILLING_PLAN_PRICING);
    for (const retired of RETIRED_TIER_NAMES) {
      expect(catalogue, `${retired} is back in the catalogue, update this guard`).not.toContain(
        retired,
      );
    }
    for (const foreign of ['starter', 'professional', 'business']) {
      expect(catalogue).not.toContain(foreign);
    }
    expect(catalogue).toContain('basic');
  });
});
