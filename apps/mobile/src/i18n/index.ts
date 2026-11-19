import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';
import { create } from 'zustand';
import { mmkvStorage } from '@/lib/mmkv';
import {
  DEFAULT_LANGUAGE,
  SELECTABLE_LANGUAGES,
  SUPPORTED_LANGUAGES,
  baseInitOptions,
  isSelectableLanguage,
  languageFor,
} from '@agiworkforce/i18n';

export { SELECTABLE_LANGUAGES, SUPPORTED_LANGUAGES };
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
    if (base && isSelectableLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  ...baseInitOptions,
  lng: getDeviceLanguage(),
  supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
  react: { useSuspense: false },
});

export const useLanguagePreferenceStore = create<{ preference: string }>(() => ({
  preference: DEVICE_LANGUAGE_PREFERENCE,
}));

export function readStoredLanguagePreference(): string {
  try {
    const stored = mmkvStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (
      typeof stored === 'string' &&
      (stored === DEVICE_LANGUAGE_PREFERENCE || isSelectableLanguage(stored))
    ) {
      return stored;
    }
  } catch {
    return DEVICE_LANGUAGE_PREFERENCE;
  }
  return DEVICE_LANGUAGE_PREFERENCE;
}

function resolvePreference(preference: string): string {
  return preference === DEVICE_LANGUAGE_PREFERENCE ? getDeviceLanguage() : preference;
}

export async function restoreStoredLanguage(): Promise<LanguageChangeResult> {
  const preference = readStoredLanguagePreference();
  const language = resolvePreference(preference);
  useLanguagePreferenceStore.setState({ preference });
  if (language !== i18n.language) await i18n.changeLanguage(language);
  return { language, directionChanged: applyLayoutDirection(language) };
}

export async function setLanguage(preference: string): Promise<LanguageChangeResult | null> {
  if (preference !== DEVICE_LANGUAGE_PREFERENCE && !isSelectableLanguage(preference)) return null;
  const language = resolvePreference(preference);
  await i18n.changeLanguage(language);
  useLanguagePreferenceStore.setState({ preference });
  const directionChanged = applyLayoutDirection(language);
  try {
    mmkvStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
  } catch (err) {
    console.warn('[i18n] language preference was not saved:', err);
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
