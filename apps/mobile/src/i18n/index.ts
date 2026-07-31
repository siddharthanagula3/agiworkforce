/**
 * Mobile's i18next instance.
 *
 * Mobile shipped no translations at all — the language a user picked on web or
 * desktop did nothing here, on the surface where the device already knows what
 * language its owner reads. It now loads the same `@agiworkforce/i18n` corpus
 * as the other two.
 *
 * Mobile-specific: there is no browser language detector and no localStorage,
 * so the initial language comes from `expo-localization` and the choice
 * persists through MMKV — the store every other mobile preference already
 * uses, rather than a second storage engine just for this.
 */

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

// Enable native RTL support before the first React tree mounts. Explicit
// language choices are synchronized below and persisted by React Native.
I18nManager.allowRTL(true);
I18nManager.swapLeftAndRightInRTL(true);

/**
 * The device's preferred language, if we translate it.
 *
 * `getLocales()` returns tags like `pt-BR` or `zh-Hans-CN`; the corpus is keyed
 * by the base subtag, so a Brazilian device gets Portuguese rather than falling
 * all the way back to English over a region suffix.
 */
export function getDeviceLanguage(): string {
  for (const locale of getLocales()) {
    const base = locale.languageCode ?? locale.languageTag?.split('-')[0];
    if (base && isSupportedLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  ...baseInitOptions,
  // Start on the device language so the very first frame is already correct;
  // a stored override is applied by `restoreStoredLanguage` once encrypted
  // MMKV is ready.
  lng: getDeviceLanguage(),
  supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
  react: { useSuspense: false },
});

/**
 * Apply a previously chosen language. Call once during app startup.
 *
 * MMKV is not ready at module-eval time on a cold start, so this is a function
 * the app calls rather than work done on import.
 */
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

/** Change language and remember it across launches. */
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

/** Whether the active language is right-to-left, for `I18nManager`/styles. */
export function isRtl(code: string = i18n.language): boolean {
  return Boolean(languageFor(code)?.rtl);
}

/**
 * Persist the native layout direction for the selected app language.
 *
 * React Native applies a changed direction on the next app start, so callers
 * use the returned value to reload the current bundle exactly once.
 */
export function applyLayoutDirection(code: string): boolean {
  const shouldUseRtl = isRtl(code);
  if (I18nManager.isRTL === shouldUseRtl) return false;
  I18nManager.forceRTL(shouldUseRtl);
  return true;
}

export default i18n;
