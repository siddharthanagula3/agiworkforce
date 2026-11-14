const mockStored: { value: string | null; throwOnRead: boolean; throwOnWrite: boolean } = {
  value: null,
  throwOnRead: false,
  throwOnWrite: false,
};
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

jest.mock('../lib/mmkv', () => ({
  mmkvStorage: {
    getItem: () => {
      if (mockStored.throwOnRead) throw new Error('storage unavailable');
      return mockStored.value;
    },
    setItem: (_key: string, value: string) => {
      if (mockStored.throwOnWrite) throw new Error('storage unavailable');
      mockStored.value = value;
    },
  },
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

describe('Mobile i18n applies the stored app language within the selectable set', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockI18nManager.isRTL = false;
    mockLocaleState.current = [{ languageCode: 'es', languageTag: 'es-US' }];
    mockStored.value = null;
    mockStored.throwOnRead = false;
    mockStored.throwOnWrite = false;
    await i18nModule.default.changeLanguage('en');
  });

  it('adopts a selectable device language into the shared translation corpus', async () => {
    await expect(i18nModule.restoreStoredLanguage()).resolves.toEqual({
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
    await expect(i18nModule.restoreStoredLanguage()).resolves.toEqual({
      language: 'en',
      directionChanged: false,
    });
    expect(mockI18nManager.forceRTL).not.toHaveBeenCalled();
  });

  it('returns a layout an earlier build forced right-to-left and asks for a reload', async () => {
    mockI18nManager.isRTL = true;

    await expect(i18nModule.restoreStoredLanguage()).resolves.toEqual({
      language: 'es',
      directionChanged: true,
    });
    expect(mockI18nManager.forceRTL).toHaveBeenCalledWith(false);
  });

  it('applies a stored explicit choice over the device language', async () => {
    mockLocaleState.current = [{ languageCode: 'en', languageTag: 'en-US' }];
    mockStored.value = 'es';

    await expect(i18nModule.restoreStoredLanguage()).resolves.toEqual({
      language: 'es',
      directionChanged: false,
    });
    expect(i18nModule.useLanguagePreferenceStore.getState().preference).toBe('es');
  });

  it.each([
    ['a missing value', null],
    ['an unknown value', 'xx'],
    ['a language that is not offered', 'ar'],
  ])('falls back to the device language for %s', async (_label, stored) => {
    mockStored.value = stored;

    await expect(i18nModule.restoreStoredLanguage()).resolves.toEqual({
      language: 'es',
      directionChanged: false,
    });
    expect(i18nModule.useLanguagePreferenceStore.getState().preference).toBe('device');
  });

  it('falls back to the device language when the stored value cannot be read', async () => {
    mockStored.throwOnRead = true;

    await expect(i18nModule.restoreStoredLanguage()).resolves.toEqual({
      language: 'es',
      directionChanged: false,
    });
  });

  it('changes language at once, stores the choice, and matches the device again on request', async () => {
    mockLocaleState.current = [{ languageCode: 'en', languageTag: 'en-US' }];

    await expect(i18nModule.setLanguage('es')).resolves.toEqual({
      language: 'es',
      directionChanged: false,
    });
    expect(i18nModule.default.language).toBe('es');
    expect(mockStored.value).toBe('es');
    expect(i18nModule.useLanguagePreferenceStore.getState().preference).toBe('es');

    await i18nModule.setLanguage('device');
    expect(i18nModule.default.language).toBe('en');
    expect(mockStored.value).toBe('device');
  });

  it('refuses a language the catalogue does not offer', async () => {
    await expect(i18nModule.setLanguage('ar')).resolves.toBeNull();
    expect(mockStored.value).toBeNull();
  });

  it('keeps the new language for the session when saving it fails', async () => {
    mockStored.throwOnWrite = true;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(i18nModule.setLanguage('es')).resolves.toEqual({
      language: 'es',
      directionChanged: false,
    });
    expect(i18nModule.default.language).toBe('es');
    warn.mockRestore();
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

    await i18nModule.restoreStoredLanguage();
    expect(i18nModule.default.t('chat:timeDivider.today')).toBe('Hoy');
    expect(i18nModule.default.t('chat:timeDivider.yesterday')).toBe('Ayer');
  });
});
