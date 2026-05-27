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

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: defaultLanguage,
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'agiworkforce-language',
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
