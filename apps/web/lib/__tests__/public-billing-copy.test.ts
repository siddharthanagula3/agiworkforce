import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_PURCHASABLE_SEATS, MIN_PURCHASABLE_SEATS } from '@agiworkforce/types';

const webRoot = resolve(import.meta.dirname, '../..');

function read(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

describe('public billing truth', () => {
  it('does not publish the retired Hobby plan or waitlist-only paid tiers', () => {
    const publicSources = [
      'app/refund-policy/page.tsx',
      'app/terms/page.tsx',
      'app/privacy/page.tsx',
      'app/pricing/layout.tsx',
      'app/changelog/page.tsx',
      'lib/support/static-data.ts',
    ].map(read);

    for (const source of publicSources) {
      expect(source).not.toMatch(/\bHobby\b/);
      expect(source).not.toMatch(/Pro (?:and Max are|tier.*) currently waitlisted/i);
    }
  });

  it('keeps the public checkout schema aligned with the production validator', () => {
    const document = JSON.parse(read('public/openapi.json')) as {
      components: {
        schemas: {
          CheckoutRequest: {
            properties: {
              plan: { enum: string[] };
              billingInterval: { enum: string[] };
              seats?: { type: string; minimum: number };
            };
          };
          User: { properties: { subscription: { properties: { plan_tier: { enum: string[] } } } } };
        };
      };
    };

    expect(document.components.schemas.CheckoutRequest.properties.plan.enum).toEqual([
      'basic',
      'pro',
      'max',
      'max_15x',
      'team',
    ]);
    // Team is per-seat, so the published contract must expose the seat count
    // clients have to send. A documented plan with an undocumented required
    // field is worse than no documentation.
    // Asserted against the shared constants, NOT literals. This test previously
    // pinned `minimum: 1`, so when the seat floor moved to 2 (2026-08-08) it
    // stayed green while the published contract drifted from the validator —
    // an integrator following the docs would have got an undocumented 400.
    expect(document.components.schemas.CheckoutRequest.properties.seats).toMatchObject({
      type: 'integer',
      minimum: MIN_PURCHASABLE_SEATS,
      maximum: MAX_PURCHASABLE_SEATS,
    });
    expect(document.components.schemas.CheckoutRequest.properties.billingInterval.enum).toEqual([
      'monthly',
      'yearly',
    ]);
    expect(
      document.components.schemas.User.properties.subscription.properties.plan_tier.enum,
    ).toEqual(['free', 'basic', 'pro', 'max', 'max_15x', 'team', 'enterprise']);
  });

  it('documents every live Stripe price variable and no retired price variable', () => {
    const example = read('.env.example');
    const expected = [
      'STRIPE_PRICE_BASIC_MONTHLY_USD',
      'STRIPE_PRICE_BASIC_MONTHLY_INR',
      'STRIPE_PRICE_PRO_MONTHLY',
      'STRIPE_PRICE_PRO_YEARLY',
      'STRIPE_PRICE_MAX_MONTHLY',
      'STRIPE_PRICE_MAX_15X_MONTHLY',
    ];

    for (const variable of expected) expect(example).toContain(`${variable}=price_...`);
    expect(example).not.toContain('STRIPE_PRICE_BASIC_YEARLY');
    expect(example).not.toContain('STRIPE_PRICE_MAX_YEARLY');
  });

  it('reads the Team seat Prices from dedicated STRIPE_PRICE_TEAM_* variables', () => {
    // Team joined self-serve checkout, so its Prices must come from env vars on
    // the same STRIPE_PRICE_* convention as every other tier — not a hardcoded
    // id and not a PRICE_ID_OVERRIDES entry.
    //
    // KNOWN GAP: apps/web/.env.example does not yet list these two variables.
    // This assertion pins the variable NAMES against the code so the contract
    // cannot drift while that documentation is added.
    const pricing = read('lib/pricing.ts');
    expect(pricing).toContain('STRIPE_PRICE_TEAM_MONTHLY_USD');
    expect(pricing).toContain('STRIPE_PRICE_TEAM_MONTHLY_INR');

    const mapping = read('lib/price-tier-mapping.ts');
    expect(mapping).toContain('STRIPE_PRICE_TEAM_MONTHLY_USD');
    expect(mapping).toContain('STRIPE_PRICE_TEAM_MONTHLY_INR');
  });

  it('does not prepend a second currency symbol to localized annual prices', () => {
    for (const locale of ['en', 'es']) {
      const pricing = JSON.parse(read(`../../packages/ui/i18n/locales/${locale}/pricing.json`)) as {
        compareProInterval: string;
        compareTeamBilling: string;
      };

      expect(pricing.compareProInterval).not.toContain('${{yearly}}');
      expect(pricing.compareTeamBilling).not.toMatch(/\{\{|\$|€/);
    }
  });

  it('keeps Local on-device while describing BYOK as an explicit provider boundary', () => {
    const english = JSON.parse(read('../../packages/ui/i18n/locales/en/pricing.json')) as {
      heroLedePart1: string;
      wedgeLede: string;
    };
    const spanish = JSON.parse(read('../../packages/ui/i18n/locales/es/pricing.json')) as {
      heroLedePart1: string;
      wedgeLede: string;
    };

    expect(english.heroLedePart1).toMatch(/Local.*on your device/i);
    expect(english.heroLedePart1).toMatch(/BYOK.*provider/i);
    expect(english.heroLedePart1).not.toMatch(/BYOK.*zero data leaving/i);
    expect(english.wedgeLede).toMatch(/BYOK.*provider/i);

    expect(spanish.heroLedePart1).toMatch(/Local.*dispositivo/i);
    expect(spanish.heroLedePart1).toMatch(/BYOK.*proveedor/i);
    expect(spanish.heroLedePart1).not.toMatch(/BYOK.*sin que ningún dato salga/i);
    expect(spanish.wedgeLede).toMatch(/BYOK.*proveedor/i);
  });

  it('aligns both locales with the canonical paid-plan usage ratios', () => {
    for (const locale of ['en', 'es']) {
      const pricing = JSON.parse(read(`../../packages/ui/i18n/locales/${locale}/pricing.json`)) as {
        basicTierBody: string;
        proTierBody: string;
        proFeature1: string;
        maxTierBody: string;
        maxFeature1: string;
        compareSubheading: string;
        compareBasicUsage: string;
        compareProUsage: string;
        compareMaxUsage: string;
      };

      expect(pricing.basicTierBody).toMatch(/base|starting paid|plan inicial de pago/i);
      expect(pricing.compareBasicUsage).toMatch(/base|básico/i);
      expect(`${pricing.proTierBody} ${pricing.proFeature1}`).toMatch(/5x|cinco veces/i);
      expect(`${pricing.proTierBody} ${pricing.proFeature1}`).toMatch(/Basic/i);
      expect(`${pricing.maxTierBody} ${pricing.maxFeature1}`).toMatch(/5x|cinco veces/i);
      expect(`${pricing.maxTierBody} ${pricing.maxFeature1}`).toMatch(/Pro/i);
      expect(pricing.compareProUsage).toMatch(/5x|cinco veces/i);
      expect(pricing.compareProUsage).toMatch(/Basic/i);
      expect(pricing.compareMaxUsage).toMatch(/5x|cinco veces/i);
      expect(pricing.compareMaxUsage).toMatch(/Pro/i);
      expect(pricing.compareSubheading).toMatch(/Max 15x/i);
    }
  });

  it('presents Team as self-serve and per-seat, at Pro capacity', () => {
    // 2026-08-05 consolidation: `packages/ui/i18n/locales` is the ONLY runtime
    // locale root (packages/ui/i18n/src/resources.ts imports it statically;
    // apps/web/app/i18n re-exports from @agiworkforce/i18n). The legacy
    // apps/web/app/i18n/locales copy was dead at runtime and has been deleted,
    // so the old two-root drift check collapses to the single live root.
    const bundles = [(locale: string) => `../../packages/ui/i18n/locales/${locale}/pricing.json`];
    for (const bundle of bundles) {
      for (const locale of ['en', 'es']) {
        const pricing = JSON.parse(read(bundle(locale))) as Record<string, string>;
        const teamCopy = [
          pricing['teamTierBody'],
          pricing['teamFeature1'],
          pricing['teamFeature4'],
          pricing['teamCta'],
          pricing['compareTeamBilling'],
          pricing['compareTeamUsage'],
        ].join(' ');

        // Team is now bought without sales. Copy that still routes buyers to a
        // sales conversation would send a self-serve customer down a dead end.
        expect(teamCopy).toMatch(/per seat|por licencia/i);
        expect(teamCopy).not.toMatch(/sales-assisted|asistid[oa] por ventas/i);

        // The price itself must NOT be hardcoded into copy: it is rendered from
        // the localized catalog, so a literal currency amount here would drift
        // from what Checkout actually charges (and from INR buyers entirely).
        expect(teamCopy).not.toMatch(/[$€₹]\s?\d/);

        // Team's managed-usage allowance is byte-identical to Pro's in
        // apps/web/lib/server/managed-usage-policy.ts, and no per-org override
        // exists anywhere. Copy claiming negotiated or contracted CAPACITY sells a
        // dimension the product does not have — the in-product badge already says
        // "Same usage as Pro". Sales-assisted BILLING is real and stays allowed.
        expect(pricing['compareTeamUsage']).not.toMatch(/contracted|contratad/i);
        expect(pricing['teamTierBody']).not.toMatch(
          /contracted (managed )?capacity|capacidad contratada/i,
        );
      }
    }
  });

  it('keeps annual savings percentage-driven instead of publishing a stale fixed rate', () => {
    for (const locale of ['en', 'es']) {
      const pricing = JSON.parse(read(`../../packages/ui/i18n/locales/${locale}/pricing.json`)) as {
        annualSave: string;
      };

      expect(pricing.annualSave.match(/{{pct}}/g)).toHaveLength(1);
      expect(pricing.annualSave).not.toMatch(/14%/);
    }
  });
});
