import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
            properties: { plan: { enum: string[] }; billingInterval: { enum: string[] } };
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
    ]);
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
    expect(example).not.toContain('STRIPE_PRICE_TEAM_');
    expect(example).not.toContain('STRIPE_PRICE_BASIC_YEARLY');
    expect(example).not.toContain('STRIPE_PRICE_MAX_YEARLY');
  });

  it('does not prepend a second currency symbol to localized annual prices', () => {
    for (const locale of ['en', 'es']) {
      const pricing = JSON.parse(read(`app/i18n/locales/${locale}/pricing.json`)) as {
        compareProInterval: string;
        compareTeamBilling: string;
      };

      expect(pricing.compareProInterval).not.toContain('${{yearly}}');
      expect(pricing.compareTeamBilling).not.toMatch(/\{\{|\$|€/);
    }
  });

  it('keeps Local on-device while describing BYOK as an explicit provider boundary', () => {
    const english = JSON.parse(read('app/i18n/locales/en/pricing.json')) as {
      heroLedePart1: string;
      wedgeLede: string;
    };
    const spanish = JSON.parse(read('app/i18n/locales/es/pricing.json')) as {
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
      const pricing = JSON.parse(read(`app/i18n/locales/${locale}/pricing.json`)) as {
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

  it('presents Team as sales-assisted contracted capacity without a fictional seat price', () => {
    for (const locale of ['en', 'es']) {
      const pricing = JSON.parse(read(`app/i18n/locales/${locale}/pricing.json`)) as {
        teamTierBody: string;
        teamFeature1: string;
        teamFeature4: string;
        teamCta: string;
        compareTeamBilling: string;
        compareTeamUsage: string;
      };
      const teamCopy = `${pricing.teamTierBody} ${pricing.teamFeature1} ${pricing.teamFeature4} ${pricing.teamCta} ${pricing.compareTeamBilling} ${pricing.compareTeamUsage}`;

      expect(teamCopy).toMatch(/sales-assisted|ventas/i);
      expect(teamCopy).toMatch(/contracted|contratad/i);
      expect(teamCopy).not.toMatch(/\$|€|per seat|por asiento/i);
    }
  });

  it('keeps annual savings percentage-driven instead of publishing a stale fixed rate', () => {
    for (const locale of ['en', 'es']) {
      const pricing = JSON.parse(read(`app/i18n/locales/${locale}/pricing.json`)) as {
        annualSave: string;
      };

      expect(pricing.annualSave.match(/{{pct}}/g)).toHaveLength(1);
      expect(pricing.annualSave).not.toMatch(/14%/);
    }
  });
});
