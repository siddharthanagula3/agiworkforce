import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  baseInitOptions,
  isSelectableLanguage,
  languageFor,
} from '@agiworkforce/i18n';

export { SUPPORTED_LANGUAGES };

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

export async function syncDeviceLanguage(): Promise<LanguageChangeResult> {
  const language = getDeviceLanguage();
  if (language !== i18n.language) await i18n.changeLanguage(language);
  return { language, directionChanged: applyLayoutDirection(language) };
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
