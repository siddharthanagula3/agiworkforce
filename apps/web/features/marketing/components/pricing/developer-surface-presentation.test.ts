import { createInstance, type TFunction } from 'i18next';
import { resources, SUPPORTED_LANGUAGES } from '@agiworkforce/i18n';
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
  pricingDeveloperSurfaceNote,
  pricingManagedChatSurfaceNote,
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
      expect(pricingDeveloperSurfaceNote(t, statusMap(cli, vscode))).toBe(
        `${SURFACE_NAMES.cli}: ${cli}; ${SURFACE_NAMES.vscode}: ${vscode}`,
      );
    },
  );

  it.each(STATUS_CASES)(
    'qualifies the Local and BYOK note with the CLI alone: %s',
    async (_, cli, vscode) => {
      const t = await translator();
      const note = t('compareLocalByokNote', {
        localLabel: 'Local',
        byokLabel: 'BYOK',
        surface: SURFACE_NAMES.cli,
        status: pricingSurfaceStatus('cli', t, statusMap(cli, vscode)),
      });
      expect(note).toContain(`${SURFACE_NAMES.cli}: ${cli}.`);
      expect(note).not.toContain(SURFACE_NAMES.vscode);
    },
  );

  it('reads current maps on every call without mutating or retaining a previous release state', async () => {
    const t = await translator();
    const canonicalBefore = { ...SURFACE_STATUS };
    const pending = statusMap(COMING_SOON_LABEL, COMING_SOON_LABEL);
    const released = statusMap(AVAILABLE_NOW_LABEL, AVAILABLE_NOW_LABEL);
    expect(pricingDeveloperSurfaceNote(t)).toBe(pricingDeveloperSurfaceNote(t, SURFACE_STATUS));
    const firstPending = pricingDeveloperSurfaceNote(t, pending);
    expect(pricingDeveloperSurfaceNote(t, released)).not.toBe(firstPending);
    expect(pricingDeveloperSurfaceNote(t, pending)).toBe(firstPending);
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
    expect(pricingDeveloperSurfaceNote(t, changed)).toBe(pricingDeveloperSurfaceNote(t));
  });

  it.each(SUPPORTED_LANGUAGES.map(({ code }) => code))(
    'renders translated statuses and interpolation for %s',
    async (language) => {
      const t = await translator(language);
      const pending = statusMap(COMING_SOON_LABEL, COMING_SOON_LABEL);
      expect(
        pricingSurfaceStatus('cli', t, statusMap(COMING_SOON_LABEL, AVAILABLE_NOW_LABEL)),
      ).toBe(t('models:selector.comingSoon'));
      expect(
        pricingSurfaceStatus('vscode', t, statusMap(COMING_SOON_LABEL, AVAILABLE_NOW_LABEL)),
      ).toBe(t('surfaceAvailableNow'));
      const copies = [
        pricingDeveloperSurfaceNote(t, pending),
        t('compareLocalByokNote', {
          localLabel: 'Local',
          byokLabel: 'BYOK',
          surface: SURFACE_NAMES.cli,
          status: pricingSurfaceStatus('cli', t, pending),
        }),
      ];
      for (const copy of copies) {
        expect(copy).toContain(SURFACE_NAMES.cli);
        expect(copy).toContain(t('models:selector.comingSoon'));
        expect(copy).not.toMatch(/\{\{|compare(?:LocalByokNote|DeveloperSurfaceStatus)/u);
      }
      expect(copies[0]).toContain(SURFACE_NAMES.vscode);
      expect(t('surfaceAvailableNow')).not.toBe('surfaceAvailableNow');
      expect(t('models:selector.comingSoon')).not.toBe('selector.comingSoon');
    },
  );

  it('names only the managed chat surfaces that are not released', async () => {
    const t = await translator();
    expect(pricingManagedChatSurfaceNote(t)).toBe(
      (['desktop', 'mobile', 'chrome'] as const)
        .filter((surface) => SURFACE_STATUS[surface] === COMING_SOON_LABEL)
        .map((surface) => `${SURFACE_NAMES[surface]}: ${COMING_SOON_LABEL}`)
        .join('; ') || undefined,
    );
    expect(
      pricingManagedChatSurfaceNote(t, {
        ...SURFACE_STATUS,
        desktop: AVAILABLE_NOW_LABEL,
        mobile: COMING_SOON_LABEL,
        chrome: AVAILABLE_NOW_LABEL,
      }),
    ).toBe(`${SURFACE_NAMES.mobile}: ${COMING_SOON_LABEL}`);
    expect(
      pricingManagedChatSurfaceNote(t, {
        ...SURFACE_STATUS,
        desktop: AVAILABLE_NOW_LABEL,
        mobile: AVAILABLE_NOW_LABEL,
        chrome: AVAILABLE_NOW_LABEL,
      }),
    ).toBeUndefined();
  });
});
