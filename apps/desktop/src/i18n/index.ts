
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

if (typeof document !== 'undefined') {
  const apply = (code: string) => {
    document.documentElement.lang = code;
    document.documentElement.dir = languageFor(code)?.rtl ? 'rtl' : 'ltr';
  };
  i18n.on('languageChanged', apply);
  apply(i18n.language || DEFAULT_LANGUAGE);
}

export default i18n;
