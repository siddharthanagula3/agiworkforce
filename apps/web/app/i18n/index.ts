'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import {
  DEFAULT_LANGUAGE,
  SELECTABLE_LANGUAGES,
  SUPPORTED_LANGUAGES,
  baseInitOptions,
  languageFor,
  selectableLanguageOrDefault,
} from '@agiworkforce/i18n';

export { SELECTABLE_LANGUAGES, SUPPORTED_LANGUAGES, selectableLanguageOrDefault };
export type SupportedLanguage = string;
export const defaultLanguage = DEFAULT_LANGUAGE;

const LANGUAGE_STORAGE_KEY = 'agiworkforce-language';

function readLanguageCache(): string | null {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${LANGUAGE_STORAGE_KEY}=`));
  if (cookie) {
    const value = decodeURIComponent(cookie.slice(LANGUAGE_STORAGE_KEY.length + 1));
    if (value) return value;
  }
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

// Read before init(). init() with an explicit `lng` fires languageChanged, and
// the detector caches that, overwriting the choice this device had stored: the
// display language did not survive a reload until the bootstrap below put the
// captured value back.
const cachedLanguageAtLoad = readLanguageCache();

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
    void i18n.changeLanguage(selectableLanguageOrDefault(cachedLanguageAtLoad));
  }, 0);
}

export default i18n;
