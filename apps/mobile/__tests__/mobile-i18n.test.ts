const mockLanguagePreferenceRead = jest.fn<Promise<string | null>, []>();
const mockLanguagePreferenceWrite = jest.fn<Promise<void>, [string, string]>();

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'es', languageTag: 'es-US' }],
}));

jest.mock('../lib/mmkv', () => ({
  mmkvStorage: {
    getItem: () => mockLanguagePreferenceRead(),
    setItem: (key: string, value: string) => mockLanguagePreferenceWrite(key, value),
  },
}));

import i18n, {
  DEVICE_LANGUAGE_PREFERENCE,
  LANGUAGE_STORAGE_KEY,
  readStoredLanguagePreference,
  restoreStoredLanguage,
  setLanguage,
} from '../src/i18n';

describe('Mobile i18n preference lifecycle', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockLanguagePreferenceRead.mockResolvedValue(null);
    mockLanguagePreferenceWrite.mockResolvedValue(undefined);
    await i18n.changeLanguage('en');
  });

  it('restores a supported persisted language into the shared translation corpus', async () => {
    mockLanguagePreferenceRead.mockResolvedValue('es');

    await restoreStoredLanguage();

    expect(i18n.language).toBe('es');
    expect(i18n.t('settings:language')).toBe('Idioma');
  });

  it('uses the device language by default and persists the preference marker', async () => {
    await setLanguage(DEVICE_LANGUAGE_PREFERENCE);

    expect(i18n.language).toBe('es');
    expect(mockLanguagePreferenceWrite).toHaveBeenCalledWith(
      LANGUAGE_STORAGE_KEY,
      DEVICE_LANGUAGE_PREFERENCE,
    );
  });

  it('fails unknown persisted values closed to Match device', async () => {
    mockLanguagePreferenceRead.mockResolvedValue('unknown');

    await expect(readStoredLanguagePreference()).resolves.toBe(DEVICE_LANGUAGE_PREFERENCE);
  });
});
