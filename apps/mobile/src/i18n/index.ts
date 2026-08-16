
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';
import { mmkvStorage } from '@/lib/mmkv';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  baseInitOptions,
  isSupportedLanguage,
  languageFor,
} from '@agiworkforce/i18n';

export { SUPPORTED_LANGUAGES };
export const LANGUAGE_STORAGE_KEY = 'agiworkforce-language';
export const DEVICE_LANGUAGE_PREFERENCE = 'device';

export interface LanguageChangeResult {
  language: string;
  directionChanged: boolean;
}

I18nManager.allowRTL(true);
I18nManager.swapLeftAndRightInRTL(true);

export function getDeviceLanguage(): string {
  for (const locale of getLocales()) {
    const base = locale.languageCode ?? locale.languageTag?.split('-')[0];
    if (base && isSupportedLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  ...baseInitOptions,
  lng: getDeviceLanguage(),
  supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
  react: { useSuspense: false },
});

export async function restoreStoredLanguage(): Promise<LanguageChangeResult> {
  const preference = await readStoredLanguagePreference();
  const language = preference === DEVICE_LANGUAGE_PREFERENCE ? getDeviceLanguage() : preference;
  if (language !== i18n.language) await i18n.changeLanguage(language);
  return {
    language,
    directionChanged: applyLayoutDirection(language),
  };
}

export async function readStoredLanguagePreference(): Promise<string> {
  try {
    const stored = await mmkvStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === DEVICE_LANGUAGE_PREFERENCE || isSupportedLanguage(stored)) return stored;
  } catch {
    // A failed preference read falls back to the device without blocking UI.
  }
  return DEVICE_LANGUAGE_PREFERENCE;
}

export async function setLanguage(code: string): Promise<LanguageChangeResult | null> {
  const language =
    code === DEVICE_LANGUAGE_PREFERENCE
      ? getDeviceLanguage()
      : isSupportedLanguage(code)
        ? code
        : undefined;
  if (!language) return null;

  await i18n.changeLanguage(language);
  const directionChanged = applyLayoutDirection(language);
  try {
    await mmkvStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // The language still changed for this session; only persistence failed.
  }
  return { language, directionChanged };
}

export function isRtl(code: string = i18n.language): boolean {
  return Boolean(languageFor(code)?.rtl);
}

export function applyLayoutDirection(code: string): boolean {
  const shouldUseRtl = isRtl(code);
  if (I18nManager.isRTL === shouldUseRtl) return false;
  I18nManager.forceRTL(shouldUseRtl);
  return true;
}

export default i18n;
