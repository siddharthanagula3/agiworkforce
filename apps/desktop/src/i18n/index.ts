/**
 * Desktop's i18next instance.
 *
 * Translations and the language list come from `@agiworkforce/i18n`, shared
 * with Web and Mobile. Desktop previously held its own 12-locale corpus while
 * web held a separate 3-locale one; the merged package is that corpus plus
 * web's extra keys, so neither surface loses anything and they cannot drift
 * apart again.
 *
 * Desktop-specific here: localStorage detection (no cookies in a Tauri
 * webview, and no SSR to hydrate against) and RTL direction.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  baseInitOptions,
  languageFor,
} from '@agiworkforce/i18n';

export { SUPPORTED_LANGUAGES };
export type SupportedLanguage = string;
export const defaultLanguage = DEFAULT_LANGUAGE;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    ...baseInitOptions,
    // Suppress the i18next maintenance/locize promo log
    lowerCaseLng: false,
    appendNamespaceToCIMode: false,
    partialBundledLanguages: false,
    ignoreJSONStructure: false,
    missingKeyHandler: () => {},
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'agiworkforce-language',
    },
    react: {
      useSuspense: false,
    },
  });

/**
 * Mirror the active language onto the document, same as web.
 *
 * Arabic is in the shared corpus, and rendering it inside `dir="ltr"` misorders
 * punctuation and mixed Latin/Arabic runs — worse to read than the English it
 * replaced.
 */
if (typeof document !== 'undefined') {
  const apply = (code: string) => {
    document.documentElement.lang = code;
    document.documentElement.dir = languageFor(code)?.rtl ? 'rtl' : 'ltr';
  };
  i18n.on('languageChanged', apply);
  apply(i18n.language || DEFAULT_LANGUAGE);
}

export default i18n;
