import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BILLING_PLAN_PRICING,
  getModelsForTierAndSurface,
  MIN_PURCHASABLE_SEATS,
  type BillingPlanPricing,
} from '@agiworkforce/types';

const webRoot = resolve(import.meta.dirname, '../..');

function read(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MOBILE_PICKER_MODEL_TYPES = ['chat', 'reasoning', 'multimodal', 'search', 'code'] as const;

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
    expect(document.components.schemas.CheckoutRequest.properties.seats).toMatchObject({
      type: 'integer',
      minimum: MIN_PURCHASABLE_SEATS,
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

        expect(teamCopy).toMatch(/per seat|por licencia/i);
        expect(teamCopy).not.toMatch(/sales-assisted|asistid[oa] por ventas/i);

        expect(teamCopy).not.toMatch(/[$€₹]\s?\d/);

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

describe('App Store listing truth', () => {
  const listingPath = '../../docs/work/app-store-listing.md';

  it('prices each plan bullet at exactly what that plan charges', () => {
    const byLabel = new Map(
      Object.values(BILLING_PLAN_PRICING).map((plan): [string, BillingPlanPricing] => [
        plan.label,
        plan,
      ]),
    );

    let priced = 0;
    for (const line of read(listingPath).split('\n')) {
      const amounts = [...line.matchAll(/\$(\d+)(?:\.\d+)?\b/g)].map((match) => Number(match[1]));
      if (amounts.length === 0) continue;
      priced += 1;

      const label = /^[•*-]\s*([^—]+?)\s*—/.exec(line)?.[1]?.trim();
      const plan = label ? byLabel.get(label) : undefined;
      expect(
        plan,
        `priced line names no plan in the billing catalog: ${line.trim()}`,
      ).toBeDefined();

      const charged = [plan!.monthlyPriceUsd, plan!.yearlyPriceUsd].filter(
        (usd): usd is number => typeof usd === 'number' && usd > 0,
      );
      expect(
        [...amounts].sort((a, b) => a - b),
        `${label} is charged ${charged.join('/')} USD but the listing prints ${amounts.join('/')}`,
      ).toEqual(charged.sort((a, b) => a - b));
    }
    expect(priced, 'no priced plan bullet found — has the PRICING block moved?').toBeGreaterThan(0);
  });

  it('does not advertise iOS features that ship switched off', () => {
    const flags = read('../mobile/lib/v1FeatureFlags.ts');
    const claims: { flag: string; forbidden: RegExp }[] = [
      { flag: 'byokKeys', forbidden: /bring your own key|\bBYOK\b|your own API key/i },
      { flag: 'computerUse', forbidden: /computer use/i },
      {
        flag: 'crossDeviceSync',
        forbidden: /cross[- ]device sync|sync(?:s|ed)? (?:your )?conversation/i,
      },
    ];

    const listing = read(listingPath);
    for (const { flag, forbidden } of claims) {
      expect(flags, `${flag} is no longer a false flag in v1FeatureFlags.ts`).toMatch(
        new RegExp(`^\\s*${flag}: false,`, 'm'),
      );
      expect(listing, `${flag} is off on iOS but the listing sells it`).not.toMatch(forbidden);
    }
  });

  it('does not name a store or a purchase route that does not exist', () => {
    const listing = read(listingPath);

    const webManifest = read('package.json');
    expect(webManifest).not.toMatch(/supabase/i);
    expect(listing).not.toMatch(/supabase/i);

    const checkoutPlans = (
      JSON.parse(read('public/openapi.json')) as {
        components: { schemas: { CheckoutRequest: { properties: { plan: { enum: string[] } } } } };
      }
    ).components.schemas.CheckoutRequest.properties.plan.enum;
    expect(checkoutPlans).toContain('pro');
    expect(checkoutPlans).toContain('max');
    expect(listing).not.toMatch(/waitlist/i);
  });

  it('names only providers the iOS picker can actually select', () => {
    const selectable = new Set(
      getModelsForTierAndSurface('max', 'mobile/cloud-chat', {
        modelTypes: [...MOBILE_PICKER_MODEL_TYPES],
      }).map((model) => model.provider),
    );
    expect(selectable.size).toBeGreaterThan(0);

    const listing = read(listingPath);
    const providers = (
      JSON.parse(read('../../packages/contracts/types/src/models.json')) as {
        providers: Record<string, { label: string; aliases?: string[] }>;
      }
    ).providers;

    for (const [id, provider] of Object.entries(providers)) {
      if (selectable.has(id)) continue;
      if (id === 'managed_cloud') continue;
      for (const name of [id, provider.label, ...(provider.aliases ?? [])]) {
        expect(
          listing,
          `listing names ${name}, but ${id} is not selectable on mobile/cloud-chat`,
        ).not.toMatch(new RegExp(`(?<![A-Za-z0-9])${escapeForRegExp(name)}(?![A-Za-z0-9])`, 'i'));
      }
    }

    expect(listing, 'count providers by naming them, not with a number').not.toMatch(
      /\b\d+\+?\s+(?:more\s+)?providers\b/i,
    );
  });
});

describe('subprocessor disclosure', () => {
  it('names Expo while either Expo path still carries mobile personal data', () => {
    const page = read('app/subprocessors/page.tsx');
    const wired: { name: string; source: string; evidence: RegExp }[] = [
      {
        name: 'Expo',
        source: 'lib/services/push-notification-service.ts',
        evidence: /exp\.host\/--\/api\/v2\/push\/send/,
      },
      {
        name: 'Expo',
        source: '../mobile/app.config.js',
        evidence: /https:\/\/u\.expo\.dev\//,
      },
    ];

    let checked = 0;
    for (const { name, source, evidence } of wired) {
      if (!evidence.test(read(source))) continue;
      checked += 1;
      expect(page, `${source} routes through ${name} but it is undisclosed`).toContain(
        `name: '${name}'`,
      );
    }
    expect(checked, 'neither Expo path matched — this test is asserting nothing').toBeGreaterThan(
      0,
    );
  });
});
