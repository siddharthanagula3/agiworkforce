import { createInstance, type TFunction } from 'i18next';
import { resources, SUPPORTED_LANGUAGES } from '@agiworkforce/i18n';
import {
  BILLING_PLAN_PRICING,
  canUseBillingPlanCapability,
  isByokPlanTier,
  isLocalOnlyPlanTier,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';
import {
  AVAILABLE_NOW_LABEL,
  COMING_SOON_LABEL,
  SURFACE_NAMES,
  SURFACE_STATUS,
  type SurfaceStatusLabel,
  type SurfaceStatusMap,
} from '@/lib/surface-status';
import {
  pricingDeveloperSurfaceCell,
  pricingSurfaceStatus,
} from './developer-surface-presentation';

async function translator(language = 'en'): Promise<TFunction<'pricing'>> {
  const instance = createInstance();
  await instance.init({
    lng: language,
    fallbackLng: false,
    resources,
    ns: ['pricing', 'models'],
    defaultNS: 'pricing',
    interpolation: { escapeValue: false },
  });
  return instance.getFixedT(language, 'pricing');
}

function statusMap(cli: SurfaceStatusLabel, vscode: SurfaceStatusLabel): SurfaceStatusMap {
  return { ...SURFACE_STATUS, cli, vscode };
}

const STATUS_CASES = [
  ['both pending', COMING_SOON_LABEL, COMING_SOON_LABEL],
  ['CLI released', AVAILABLE_NOW_LABEL, COMING_SOON_LABEL],
  ['VS Code released', COMING_SOON_LABEL, AVAILABLE_NOW_LABEL],
  ['both released', AVAILABLE_NOW_LABEL, AVAILABLE_NOW_LABEL],
] as const;

describe('pricing developer surface availability presentation', () => {
  it.each(STATUS_CASES)(
    'qualifies each entitled surface independently: %s',
    async (_, cli, vscode) => {
      const t = await translator();
      const statuses = statusMap(cli, vscode);
      expect(pricingDeveloperSurfaceCell('pro', 'Yes', t, statuses)).toBe(
        `Yes · ${SURFACE_NAMES.cli}: ${cli}; ${SURFACE_NAMES.vscode}: ${vscode}`,
      );
    },
  );

  it.each(STATUS_CASES)('preserves every managed plan entitlement: %s', async (_, cli, vscode) => {
    const t = await translator();
    const statuses = statusMap(cli, vscode);
    for (const plan of Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[]) {
      if (isLocalOnlyPlanTier(plan) || isByokPlanTier(plan)) continue;
      const entitled = canUseBillingPlanCapability(plan, 'developer_surfaces');
      const raw = entitled ? 'Yes' : 'No';
      const presented = pricingDeveloperSurfaceCell(plan, raw, t, statuses);
      expect(presented.startsWith(raw), `${plan} changed its entitlement`).toBe(true);
      if (!entitled) expect(presented).toBe('No');
      expect(canUseBillingPlanCapability(plan, 'developer_surfaces')).toBe(entitled);
    }
  });

  it.each(STATUS_CASES)('qualifies Local and BYOK with CLI alone: %s', async (_, cli, vscode) => {
    const t = await translator();
    const statuses = statusMap(cli, vscode);
    expect(pricingDeveloperSurfaceCell('local-only', 'Local in the CLI', t, statuses)).toBe(
      `Local in ${SURFACE_NAMES.cli} · ${cli}`,
    );
    expect(pricingDeveloperSurfaceCell('byok', 'Your keys in the CLI', t, statuses)).toBe(
      `Your keys in ${SURFACE_NAMES.cli} · ${cli}`,
    );
  });

  it('reads current maps on every call without mutating or retaining a previous release state', async () => {
    const t = await translator();
    const canonicalBefore = { ...SURFACE_STATUS };
    const pending = statusMap(COMING_SOON_LABEL, COMING_SOON_LABEL);
    const released = statusMap(AVAILABLE_NOW_LABEL, AVAILABLE_NOW_LABEL);
    expect(pricingDeveloperSurfaceCell('pro', 'Yes', t)).toBe(
      pricingDeveloperSurfaceCell('pro', 'Yes', t, SURFACE_STATUS),
    );
    const firstPending = pricingDeveloperSurfaceCell('pro', 'Yes', t, pending);
    expect(pricingDeveloperSurfaceCell('pro', 'Yes', t, released)).not.toBe(firstPending);
    expect(pricingDeveloperSurfaceCell('pro', 'Yes', t, pending)).toBe(firstPending);
    expect(pending).toEqual(statusMap(COMING_SOON_LABEL, COMING_SOON_LABEL));
    expect(released).toEqual(statusMap(AVAILABLE_NOW_LABEL, AVAILABLE_NOW_LABEL));
    expect(SURFACE_STATUS).toEqual(canonicalBefore);
  });

  it('ignores release changes on surfaces outside the developer comparison', async () => {
    const t = await translator();
    const changed: SurfaceStatusMap = {
      ...SURFACE_STATUS,
      web: COMING_SOON_LABEL,
      desktop: AVAILABLE_NOW_LABEL,
      chrome: AVAILABLE_NOW_LABEL,
      mobile: AVAILABLE_NOW_LABEL,
    };
    for (const [plan, entitlement] of [
      ['pro', 'Yes'],
      ['free', 'No'],
      ['local-only', 'Local in the CLI'],
      ['byok', 'Your keys in the CLI'],
    ] as const) {
      expect(pricingDeveloperSurfaceCell(plan, entitlement, t, changed)).toBe(
        pricingDeveloperSurfaceCell(plan, entitlement, t),
      );
    }
  });

  it.each(SUPPORTED_LANGUAGES.map(({ code }) => code))(
    'renders translated statuses and interpolation for %s',
    async (language) => {
      const t = await translator(language);
      expect(
        pricingSurfaceStatus('cli', t, statusMap(COMING_SOON_LABEL, AVAILABLE_NOW_LABEL)),
      ).toBe(t('models:selector.comingSoon'));
      expect(
        pricingSurfaceStatus('vscode', t, statusMap(COMING_SOON_LABEL, AVAILABLE_NOW_LABEL)),
      ).toBe(t('surfaceAvailableNow'));
      for (const [plan, entitlement] of [
        ['pro', 'Yes'],
        ['local-only', 'Local in the CLI'],
        ['byok', 'Your keys in the CLI'],
      ] as const) {
        const copy = pricingDeveloperSurfaceCell(
          plan,
          entitlement,
          t,
          statusMap(COMING_SOON_LABEL, COMING_SOON_LABEL),
        );
        expect(copy).toContain(SURFACE_NAMES.cli);
        expect(copy).toContain(t('models:selector.comingSoon'));
        expect(copy).not.toMatch(/\{\{|compare(?:Local|Byok|Managed)DeveloperSurfaces/u);
      }
      expect(t('surfaceAvailableNow')).not.toBe('surfaceAvailableNow');
      expect(t('models:selector.comingSoon')).not.toBe('selector.comingSoon');
    },
  );
});
