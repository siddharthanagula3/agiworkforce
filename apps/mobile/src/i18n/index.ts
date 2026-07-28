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

/**
 * The device's preferred language, if we translate it.
 *
 * `getLocales()` returns tags like `pt-BR` or `zh-Hans-CN`; the corpus is keyed
 * by the base subtag, so a Brazilian device gets Portuguese rather than falling
 * all the way back to English over a region suffix.
 */
function deviceLanguage(): string {
  for (const locale of getLocales()) {
    const base = locale.languageCode ?? locale.languageTag?.split('-')[0];
    if (base && isSupportedLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  ...baseInitOptions,
  // Start on the device language so the very first frame is already correct;
  // a stored override is applied by `restoreStoredLanguage` once AsyncStorage
  // answers, which it cannot do synchronously.
  lng: deviceLanguage(),
  supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
  react: { useSuspense: false },
});

/**
 * Apply a previously chosen language. Call once during app startup.
 *
 * MMKV is not ready at module-eval time on a cold start, so this is a function
 * the app calls rather than work done on import.
 */
export async function restoreStoredLanguage(): Promise<void> {
  try {
    const stored = await mmkvStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && isSupportedLanguage(stored) && stored !== i18n.language) {
      await i18n.changeLanguage(stored);
    }
  } catch {
    // A failed preference read must not stop the app from rendering; the
    // device language stands.
  }
}

/** Change language and remember it across launches. */
export async function setLanguage(code: string): Promise<void> {
  if (!isSupportedLanguage(code)) return;
  await i18n.changeLanguage(code);
  try {
    await mmkvStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // The language still changed for this session; only persistence failed.
  }
}

/** Whether the active language is right-to-left, for `I18nManager`/styles. */
export function isRtl(code: string = i18n.language): boolean {
  return Boolean(languageFor(code)?.rtl);
}

export default i18n;
