'use client';

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

const LANGUAGE_STORAGE_KEY = 'agiworkforce-language';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    ...baseInitOptions,
    lng: defaultLanguage,
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    detection: {
      order: ['cookie', 'localStorage', 'navigator'],
      caches: ['cookie', 'localStorage'],
      lookupCookie: LANGUAGE_STORAGE_KEY,
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      cookieOptions: {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      },
    },
    react: {
      useSuspense: false,
    },
  });

function applyDocumentLanguage(code: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = code;
  document.documentElement.dir = languageFor(code)?.rtl ? 'rtl' : 'ltr';
}

if (typeof window !== 'undefined') {
  i18n.on('languageChanged', applyDocumentLanguage);
  window.setTimeout(() => {
    void i18n.changeLanguage();
  }, 0);
}

export default i18n;
