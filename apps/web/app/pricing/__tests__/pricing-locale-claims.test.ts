import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SUPPORTED_LANGUAGES } from '@agiworkforce/i18n';
import { SURFACE_NAMES } from '@/lib/surface-status';
import { individualPlanFeatures } from '@/features/billing/lib/plan-card-copy';

import {
  BILLING_PLAN_PRICING,
  BILLING_PLAN_PRODUCT_LIMITS,
  MANAGED_USAGE_LIMITS,
  normalizeUIPlanTier,
} from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

/**
 * Claim guard for the published pricing bundles (ledger BILL-49, F-7).
 *
 * `proFeature2` shipped as "Priority routing across providers" while no router
 * reads the billing tier: `apps/web/app/sla/page.tsx` states outright that
 * "There is no plan-derived priority routing implemented". A paid-tier feature
 * bullet is a product-capability claim, so it has to name something the catalog
 * actually grants. The bullet now states Pro's concurrency and connector-tool
 * ceilings, and this suite pins it to `BILLING_PLAN_PRODUCT_LIMITS` so a limit
 * change cannot quietly leave the marketing copy behind.
 */

const LOCALES_DIR = path.resolve(__dirname, '../../../../../packages/ui/i18n/locales');

function pricingBundles(): Array<[string, Record<string, string>]> {
  return readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(
      (entry) =>
        [
          entry.name,
          JSON.parse(
            readFileSync(path.join(LOCALES_DIR, entry.name, 'pricing.json'), 'utf8'),
          ) as Record<string, string>,
        ] as [string, Record<string, string>],
    );
}

const ROUTING_PRIORITY_CLAIMS = [
  /priority\s+routing/iu,
  /routing\s+priority/iu,
  /enrutamiento\s+prioritario/iu,
  /prioritäre[sr]?\s+routing/iu,
  /routage\s+prioritaire/iu,
];

describe('pricing locale bundles, plan feature claims', () => {
  it('ships at least the English bundle, so an empty glob cannot pass this suite', () => {
    const bundles = pricingBundles();
    expect(bundles.length).toBeGreaterThan(0);
    expect(bundles.map(([locale]) => locale)).toContain('en');
  });

  it('never promises tier-derived priority routing, which no router implements', () => {
    for (const [locale, bundle] of pricingBundles()) {
      for (const [key, value] of Object.entries(bundle)) {
        if (typeof value !== 'string') continue;
        for (const claim of ROUTING_PRIORITY_CLAIMS) {
          expect(
            claim.test(value),
            `${locale}/pricing.json ${key} claims priority routing: ${value}`,
          ).toBe(false);
        }
      }
    }
  });

  it('names no plan tier the billing catalog stopped selling', () => {
    const catalogKeys = new Set(
      Object.keys(BILLING_PLAN_PRICING).flatMap((id) => [
        id,
        id.replace(/[-_](\w)/gu, (_match, char: string) => char.toUpperCase()),
      ]),
    );
    const unrelated = 'byok';

    for (const [locale, bundle] of pricingBundles()) {
      for (const key of Object.keys(bundle)) {
        if (catalogKeys.has(key)) continue;
        const resolved = normalizeUIPlanTier(key, unrelated);
        expect(
          resolved === unrelated || resolved === key,
          `${locale}/pricing.json ships retired tier key "${key}" (now sold as "${resolved}")`,
        ).toBe(true);
      }
    }
  });

  it('carries the connector-free plan lines in every locale', () => {
    const bundles = pricingBundles();
    expect(bundles.map(([locale]) => locale).sort()).toEqual(
      SUPPORTED_LANGUAGES.map((language) => language.code).sort(),
    );
    for (const [locale, bundle] of bundles) {
      expect(bundle['chatsAtOnce'], `${locale}/pricing.json chatsAtOnce`).toContain('{{chats}}');
      expect(bundle['chatsAtOnce'], `${locale}/pricing.json chatsAtOnce`).not.toMatch(/\p{N}/u);
      expect(
        bundle['projectsNoSetLimitWithStorage'],
        `${locale}/pricing.json projectsNoSetLimitWithStorage`,
      ).not.toMatch(/MCP|\p{N}/u);
      expect(bundle['compareSubheading'], `${locale}/pricing.json compareSubheading`).not.toMatch(
        /Desktop|デスクトップ|桌面|데스크톱|डेस्कटॉप|سطح المكتب/u,
      );
    }
  });

  it('publishes no unlimited claim in any language', () => {
    const unlimitedClaims = [
      /unlimited|uncapped/iu,
      /ilimitad/iu,
      /illimit/iu,
      /unbegrenzt/iu,
      /неогранич|без ограничений/iu,
      /無制限|上限なし/u,
      /无限|不设上限/u,
      /무제한|상한 없는/u,
      /غير محدود|بلا سقف/u,
      /असीमित|बिना सीमा/u,
      /sin límite\b(?! fijo)|sem limite\b(?! fixo)|sans plafond|senza limiti/iu,
    ];
    for (const [locale, bundle] of pricingBundles()) {
      for (const [key, copy] of Object.entries(bundle)) {
        for (const claim of unlimitedClaims) {
          expect(copy, `${locale}/pricing.json ${key}`).not.toMatch(claim);
        }
      }
    }
  });

  it('states Max storage as the figure the catalog funds, never as unlimited', () => {
    for (const plan of ['max', 'max_15x'] as const) {
      const limits = BILLING_PLAN_PRODUCT_LIMITS[plan];
      expect(limits.projects, `${plan} projects`).toBe('unlimited');
      expect(limits.customMcpServers, `${plan} custom MCP servers`).toBe('unlimited');
      expect(
        typeof limits.knowledgeStorageBytes,
        `${plan} storage is no longer a funded figure; rewrite the Max card line with it`,
      ).toBe('number');
    }

    const bundles = pricingBundles();
    expect(bundles.map(([locale]) => locale).sort()).toEqual(
      SUPPORTED_LANGUAGES.map((language) => language.code).sort(),
    );
    for (const [locale, bundle] of bundles) {
      expect(bundle, `${locale}/pricing.json`).not.toHaveProperty('unlimitedProjectsAndStorage');
      for (const key of ['projectsNoSetLimitWithStorage', 'maxFeature4', 'max15xFeature4']) {
        const copy = bundle[key] ?? '';
        expect(copy, `${locale}/pricing.json ${key} omits the storage figure`).toContain(
          '{{storage}}',
        );
        expect(copy, `${locale}/pricing.json ${key} types a figure`).not.toMatch(/\p{N}/u);
      }
    }
    const english = bundles.find(([locale]) => locale === 'en')?.[1] ?? {};
    for (const key of ['projectsNoSetLimitWithStorage', 'maxFeature4', 'max15xFeature4']) {
      expect(english[key], `en/pricing.json ${key}`).not.toMatch(
        /unlimited projects(?:,| and) storage/iu,
      );
    }
  });

  it('states Pro concurrency and connector ceilings the billing catalog grants', () => {
    const { maxConcurrentTurns, maxConnectorTools } = BILLING_PLAN_PRODUCT_LIMITS.pro;
    expect(typeof maxConcurrentTurns).toBe('number');
    expect(typeof maxConnectorTools).toBe('number');

    const bundles = pricingBundles().filter(([, bundle]) => 'proFeature2' in bundle);
    expect(bundles.length).toBeGreaterThan(0);

    for (const [locale, bundle] of bundles) {
      const copy = bundle['proFeature2'];
      expect(copy, `${locale}/pricing.json proFeature2 omits ${maxConcurrentTurns}`).toMatch(
        new RegExp(`\\b${maxConcurrentTurns}\\b`, 'u'),
      );
      expect(copy, `${locale}/pricing.json proFeature2 omits ${maxConnectorTools}`).toMatch(
        new RegExp(`\\b${maxConnectorTools}\\b`, 'u'),
      );
    }
  });

  it('computes every plan card scheduled-task line from the catalog, with no release promise or typed quota in any locale', async () => {
    const bundles = pricingBundles();
    expect(bundles.map(([locale]) => locale).sort()).toEqual(
      SUPPORTED_LANGUAGES.map((language) => language.code).sort(),
    );
    expect(BILLING_PLAN_PRODUCT_LIMITS.pro.maxScheduledTasks).not.toBe(0);

    for (const [locale, bundle] of bundles) {
      for (const retired of ['basicFeature6', 'proFeature6', 'maxFeature6', 'max15xFeature6']) {
        expect(bundle, `${locale}/pricing.json still types ${retired}`).not.toHaveProperty(retired);
      }
      const forms = Object.entries(bundle).filter(([key]) =>
        key.startsWith('scheduledTasksAndSandboxes_'),
      );
      expect(forms.map(([key]) => key)).toContain('scheduledTasksAndSandboxes_other');
      for (const [key, copy] of forms) {
        expect(copy, `${locale}/pricing.json ${key}`).toContain('{{minutes}}');
        if (!key.endsWith('_one')) {
          expect(copy, `${locale}/pricing.json ${key}`).toContain('{{count}}');
        }
        expect(copy, `${locale}/pricing.json ${key} types a quota`).not.toMatch(/\p{N}/u);
        const compact = copy.replace(/\s/gu, '').toLowerCase();
        for (const surface of [SURFACE_NAMES.cli, SURFACE_NAMES.vscode]) {
          expect(
            compact,
            `${locale}/pricing.json ${key} promises an unreleased developer surface`,
          ).not.toContain(surface.replace(/\s/gu, '').toLowerCase());
        }
      }
    }

    const { createInstance } = await import('i18next');
    const { resources } = await import('@agiworkforce/i18n');
    const instance = createInstance();
    await instance.init({
      lng: 'en',
      resources,
      ns: ['pricing', 'models'],
      defaultNS: 'pricing',
      interpolation: { escapeValue: false },
    });
    const t = instance.getFixedT('en', 'pricing');
    for (const plan of ['basic', 'pro', 'max', 'max_15x'] as const) {
      const { maxScheduledTasks, sandboxTtlMs } = BILLING_PLAN_PRODUCT_LIMITS[plan];
      expect(
        individualPlanFeatures(plan, t, { image: null, video: null }),
        `${plan} card`,
      ).toContain(
        `${maxScheduledTasks} scheduled tasks and ${sandboxTtlMs / 60_000}-minute managed sandboxes`,
      );
    }
  });
});

/**
 * Pre-release claim audit, 2026-09-12.
 *
 * `compareEnterpriseUsage` shipped as "Dedicated capacity, scoped to your org"
 * in all twelve bundles. Nothing in the codebase reserves capacity for a
 * workspace: `MANAGED_USAGE_LIMITS.enterprise` is the same shared managed pool
 * as every other tier with `unlimited: true` set on it, and both
 * `apps/web/app/faq/page.tsx` and `apps/web/app/contact-sales/page.tsx` already
 * state that dedicated capacity is not built. The row now says what the tier
 * actually grants, and the ban below is per-language so a translation cannot
 * carry the old promise back in.
 */

const DEDICATED_CAPACITY_CLAIMS = [
  /dedicated\s+capacity/iu,
  /reserved\s+capacity/iu,
  /capacidad\s+dedicada/iu,
  /capacité\s+dédiée/iu,
  /dedizierte\s+kapazität/iu,
  /capacità\s+dedicata/iu,
  /capacidade\s+dedicada/iu,
  /выделенная\s+мощность/iu,
  /専用容量/u,
  /专属容量/u,
  /전용\s*용량/u,
  /سعة\s+مخصصة/u,
  /समर्पित\s+क्षमता/u,
];

describe('pricing locale bundles, enterprise capacity claims', () => {
  it('describes enterprise managed usage the way the usage table configures it', () => {
    expect(
      MANAGED_USAGE_LIMITS.enterprise.unlimited,
      'enterprise is no longer uncapped; the pricing row has to be rewritten with it',
    ).toBe(true);

    const bundle = pricingBundles().find(([locale]) => locale === 'en');
    expect(bundle).toBeDefined();
    expect(bundle![1]['compareEnterpriseUsage']).toBe('Managed usage set by your contract');
  });

  it('promises dedicated or reserved capacity in no language', () => {
    const bundles = pricingBundles();
    expect(bundles.length).toBeGreaterThan(0);

    for (const [locale, bundle] of bundles) {
      for (const [key, value] of Object.entries(bundle)) {
        if (typeof value !== 'string') continue;
        for (const claim of DEDICATED_CAPACITY_CLAIMS) {
          expect(
            claim.test(value),
            `${locale}/pricing.json ${key} promises capacity nothing reserves: ${value}`,
          ).toBe(false);
        }
      }
    }
  });
});

describe('pricing locale bundles, accessible names', () => {
  it('names the access code button with its visible label in every language, so speech input can say it', () => {
    const bundles = pricingBundles().filter(([, bundle]) => 'enterAccessCodeForPlan' in bundle);
    expect(bundles.map(([locale]) => locale)).toContain('en');

    for (const [locale, bundle] of bundles) {
      const visible = bundle['enterAccessCodeCta'] as string;
      const accessibleName = (bundle['enterAccessCodeForPlan'] as string).replace(
        '{{plan}}',
        BILLING_PLAN_PRICING.basic.label,
      );
      expect(
        accessibleName.startsWith(visible),
        `${locale}/pricing.json enterAccessCodeForPlan "${accessibleName}" does not start with the visible label "${visible}"`,
      ).toBe(true);
    }
  });
});
