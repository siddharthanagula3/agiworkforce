const mockLanguagePreferenceRead = jest.fn<Promise<string | null>, []>();
const mockLanguagePreferenceWrite = jest.fn<Promise<void>, [string, string]>();

jest.mock('react-native', () => ({
  I18nManager: {
    isRTL: false,
    allowRTL: jest.fn(),
    forceRTL: jest.fn(),
    swapLeftAndRightInRTL: jest.fn(),
  },
}));

const mockI18nManager = jest.requireMock('react-native').I18nManager as {
  isRTL: boolean;
  allowRTL: jest.Mock;
  forceRTL: jest.Mock;
  swapLeftAndRightInRTL: jest.Mock;
};

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
    mockI18nManager.isRTL = false;
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

  it('persists an RTL layout override when Arabic is selected', async () => {
    const result = await setLanguage('ar');

    expect(result).toEqual({ language: 'ar', directionChanged: true });
    expect(mockI18nManager.forceRTL).toHaveBeenCalledWith(true);
    expect(mockLanguagePreferenceWrite).toHaveBeenCalledWith(LANGUAGE_STORAGE_KEY, 'ar');
  });

  it('persists an LTR layout override when leaving an active RTL layout', async () => {
    mockI18nManager.isRTL = true;

    const result = await setLanguage('en');

    expect(result).toEqual({ language: 'en', directionChanged: true });
    expect(mockI18nManager.forceRTL).toHaveBeenCalledWith(false);
  });

  it('does not request a reload when the native direction already matches', async () => {
    const result = await setLanguage('es');

    expect(result).toEqual({ language: 'es', directionChanged: false });
    expect(mockI18nManager.forceRTL).not.toHaveBeenCalled();
  });

  it('fails unknown persisted values closed to Match device', async () => {
    mockLanguagePreferenceRead.mockResolvedValue('unknown');

    await expect(readStoredLanguagePreference()).resolves.toBe(DEVICE_LANGUAGE_PREFERENCE);
  });
});
