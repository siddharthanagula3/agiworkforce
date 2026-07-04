'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en/common.json';
import es from './locales/es/common.json';
import hi from './locales/hi/common.json';
import enErrors from './locales/en/errors.json';
import esErrors from './locales/es/errors.json';
import hiErrors from './locales/hi/errors.json';
import enAuth from './locales/en/auth.json';
import esAuth from './locales/es/auth.json';
import enChat from './locales/en/chat.json';
import esChat from './locales/es/chat.json';
import enSettings from './locales/en/settings.json';
import esSettings from './locales/es/settings.json';
import hiSettings from './locales/hi/settings.json';
import enPricing from './locales/en/pricing.json';
import esPricing from './locales/es/pricing.json';
import enModels from './locales/en/models.json';
import esModels from './locales/es/models.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const defaultLanguage: SupportedLanguage = 'en';

const resources = {
  en: {
    common: en,
    errors: enErrors,
    auth: enAuth,
    chat: enChat,
    settings: enSettings,
    pricing: enPricing,
    models: enModels,
  },
  es: {
    common: es,
    errors: esErrors,
    auth: esAuth,
    chat: esChat,
    settings: esSettings,
    pricing: esPricing,
    models: esModels,
  },
  hi: {
    common: hi,
    errors: hiErrors,
    settings: hiSettings,
  },
};

const LANGUAGE_STORAGE_KEY = 'agiworkforce-language';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // Pin the first-render language to `defaultLanguage` instead of letting
    // LanguageDetector resolve it synchronously here. This module runs both
    // during SSR (no `window`/`document`, always falls back to `en`) and in
    // the browser (where a cached locale like `es` would otherwise be applied
    // *before* React hydrates). Without this, a returning non-English user's
    // client render diverges from the server-rendered HTML on every page
    // load, producing a hydration mismatch. The real, persisted locale is
    // detected and applied right after hydration completes (see below), so
    // the mismatch window disappears while the saved preference still wins.
    lng: defaultLanguage,
    fallbackLng: defaultLanguage,
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['cookie', 'localStorage', 'navigator'],
      // Cache to both a cookie and localStorage. localStorage alone is
      // invisible to the server; mirroring the preference into a cookie
      // lets a server-rendered request (e.g. a layout/middleware reading
      // `next/headers` cookies()) resolve the same locale up front, closing
      // the gap that caused the hydration mismatch in the first place.
      caches: ['cookie', 'localStorage'],
      lookupCookie: LANGUAGE_STORAGE_KEY,
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      cookieOptions: {
        path: '/',
        sameSite: 'lax',
        // 1 year
        maxAge: 60 * 60 * 24 * 365,
      },
    },
    react: {
      useSuspense: false,
    },
  });

if (typeof window !== 'undefined') {
  // Defer detection until after the current task so React finishes
  // hydrating with the SSR-matching `defaultLanguage` first. Calling
  // `changeLanguage()` with no argument re-runs the configured
  // LanguageDetector (cookie -> localStorage -> navigator) exactly as it
  // would have run at init time, then re-caches the result to both the
  // cookie and localStorage via react-i18next's normal change flow.
  window.setTimeout(() => {
    void i18n.changeLanguage();
  }, 0);
}

export default i18n;
