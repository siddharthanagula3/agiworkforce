const mockLocaleState = {
  current: [{ languageCode: 'es', languageTag: 'es-US' }] as Array<{
    languageCode: string | null;
    languageTag: string;
  }>,
};

jest.mock('react-native', () => ({
  I18nManager: {
    isRTL: false,
    allowRTL: jest.fn(),
    forceRTL: jest.fn(),
    swapLeftAndRightInRTL: jest.fn(),
  },
}));

jest.mock('expo-localization', () => ({
  getLocales: () => mockLocaleState.current,
}));

const mockI18nManager = jest.requireMock('react-native').I18nManager as {
  isRTL: boolean;
  allowRTL: jest.Mock;
  forceRTL: jest.Mock;
  swapLeftAndRightInRTL: jest.Mock;
};

type I18nModule = typeof import('../src/i18n');
let i18nModule: I18nModule;

beforeAll(() => {
  i18nModule = jest.requireActual('../src/i18n') as I18nModule;
});

describe('Mobile i18n follows the device language within the selectable set', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockI18nManager.isRTL = false;
    mockLocaleState.current = [{ languageCode: 'es', languageTag: 'es-US' }];
    await i18nModule.default.changeLanguage('en');
  });

  it('adopts a selectable device language into the shared translation corpus', async () => {
    await expect(i18nModule.syncDeviceLanguage()).resolves.toEqual({
      language: 'es',
      directionChanged: false,
    });

    expect(i18nModule.default.language).toBe('es');
    expect(i18nModule.default.t('settings:language')).toBe('Idioma');
  });

  it('falls back to English for a device language the catalogue does not offer yet', async () => {
    mockLocaleState.current = [
      { languageCode: 'ar', languageTag: 'ar-SA' },
      { languageCode: 'fr', languageTag: 'fr-FR' },
    ];

    expect(i18nModule.getDeviceLanguage()).toBe('en');
    await expect(i18nModule.syncDeviceLanguage()).resolves.toEqual({
      language: 'en',
      directionChanged: false,
    });
    expect(mockI18nManager.forceRTL).not.toHaveBeenCalled();
  });

  it('returns a layout an earlier build forced right-to-left and asks for a reload', async () => {
    mockI18nManager.isRTL = true;

    await expect(i18nModule.syncDeviceLanguage()).resolves.toEqual({
      language: 'es',
      directionChanged: true,
    });
    expect(mockI18nManager.forceRTL).toHaveBeenCalledWith(false);
  });

  it('translates the chat time divider day names in every shipped locale', async () => {
    const { readdirSync, readFileSync } = jest.requireActual('fs') as typeof import('fs');
    const { join } = jest.requireActual('path') as typeof import('path');
    const localesDir = join(__dirname, '../../../packages/ui/i18n/locales');
    const read = (locale: string) =>
      JSON.parse(readFileSync(join(localesDir, locale, 'chat.json'), 'utf8')) as {
        timeDivider?: { today?: string; yesterday?: string };
      };
    const locales = readdirSync(localesDir);
    const english = read('en').timeDivider;

    expect(locales).toHaveLength(12);
    expect(english).toEqual({ today: 'Today', yesterday: 'Yesterday' });
    for (const locale of locales.filter((entry) => entry !== 'en')) {
      const divider = read(locale).timeDivider;
      expect(divider?.today).toBeTruthy();
      expect(divider?.yesterday).toBeTruthy();
      expect(divider?.today).not.toBe(english?.today);
      expect(divider?.yesterday).not.toBe(english?.yesterday);
    }

    await i18nModule.syncDeviceLanguage();
    expect(i18nModule.default.t('chat:timeDivider.today')).toBe('Hoy');
    expect(i18nModule.default.t('chat:timeDivider.yesterday')).toBe('Ayer');
  });
});
