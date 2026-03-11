import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en/common.json';
import es from './locales/es/common.json';
import zh from './locales/zh/common.json';
import ja from './locales/ja/common.json';
import ko from './locales/ko/common.json';
import fr from './locales/fr/common.json';
import de from './locales/de/common.json';
import pt from './locales/pt/common.json';
import it from './locales/it/common.json';
import ru from './locales/ru/common.json';
import ar from './locales/ar/common.json';
import hi from './locales/hi/common.json';

import enErrors from './locales/en/errors.json';
import esErrors from './locales/es/errors.json';
import zhErrors from './locales/zh/errors.json';
import jaErrors from './locales/ja/errors.json';
import koErrors from './locales/ko/errors.json';
import frErrors from './locales/fr/errors.json';
import deErrors from './locales/de/errors.json';
import ptErrors from './locales/pt/errors.json';
import itErrors from './locales/it/errors.json';
import ruErrors from './locales/ru/errors.json';
import arErrors from './locales/ar/errors.json';
import hiErrors from './locales/hi/errors.json';

import enAuth from './locales/en/auth.json';
import esAuth from './locales/es/auth.json';
import zhAuth from './locales/zh/auth.json';
import jaAuth from './locales/ja/auth.json';
import koAuth from './locales/ko/auth.json';
import frAuth from './locales/fr/auth.json';
import deAuth from './locales/de/auth.json';
import ptAuth from './locales/pt/auth.json';
import itAuth from './locales/it/auth.json';
import ruAuth from './locales/ru/auth.json';
import arAuth from './locales/ar/auth.json';
import hiAuth from './locales/hi/auth.json';

import enChat from './locales/en/chat.json';
import esChat from './locales/es/chat.json';
import zhChat from './locales/zh/chat.json';
import jaChat from './locales/ja/chat.json';
import koChat from './locales/ko/chat.json';
import frChat from './locales/fr/chat.json';
import deChat from './locales/de/chat.json';
import ptChat from './locales/pt/chat.json';
import itChat from './locales/it/chat.json';
import ruChat from './locales/ru/chat.json';
import arChat from './locales/ar/chat.json';
import hiChat from './locales/hi/chat.json';

import enSettings from './locales/en/settings.json';
import esSettings from './locales/es/settings.json';
import zhSettings from './locales/zh/settings.json';
import jaSettings from './locales/ja/settings.json';
import koSettings from './locales/ko/settings.json';
import frSettings from './locales/fr/settings.json';
import deSettings from './locales/de/settings.json';
import ptSettings from './locales/pt/settings.json';
import itSettings from './locales/it/settings.json';
import ruSettings from './locales/ru/settings.json';
import arSettings from './locales/ar/settings.json';
import hiSettings from './locales/hi/settings.json';

import enPricing from './locales/en/pricing.json';
import esPricing from './locales/es/pricing.json';
import zhPricing from './locales/zh/pricing.json';
import jaPricing from './locales/ja/pricing.json';
import koPricing from './locales/ko/pricing.json';
import frPricing from './locales/fr/pricing.json';
import dePricing from './locales/de/pricing.json';
import ptPricing from './locales/pt/pricing.json';
import itPricing from './locales/it/pricing.json';
import ruPricing from './locales/ru/pricing.json';
import arPricing from './locales/ar/pricing.json';
import hiPricing from './locales/hi/pricing.json';

import enModels from './locales/en/models.json';
import esModels from './locales/es/models.json';
import zhModels from './locales/zh/models.json';
import jaModels from './locales/ja/models.json';
import koModels from './locales/ko/models.json';
import frModels from './locales/fr/models.json';
import deModels from './locales/de/models.json';
import ptModels from './locales/pt/models.json';
import itModels from './locales/it/models.json';
import ruModels from './locales/ru/models.json';
import arModels from './locales/ar/models.json';
import hiModels from './locales/hi/models.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
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
  zh: {
    common: zh,
    errors: zhErrors,
    auth: zhAuth,
    chat: zhChat,
    settings: zhSettings,
    pricing: zhPricing,
    models: zhModels,
  },
  ja: {
    common: ja,
    errors: jaErrors,
    auth: jaAuth,
    chat: jaChat,
    settings: jaSettings,
    pricing: jaPricing,
    models: jaModels,
  },
  ko: {
    common: ko,
    errors: koErrors,
    auth: koAuth,
    chat: koChat,
    settings: koSettings,
    pricing: koPricing,
    models: koModels,
  },
  fr: {
    common: fr,
    errors: frErrors,
    auth: frAuth,
    chat: frChat,
    settings: frSettings,
    pricing: frPricing,
    models: frModels,
  },
  de: {
    common: de,
    errors: deErrors,
    auth: deAuth,
    chat: deChat,
    settings: deSettings,
    pricing: dePricing,
    models: deModels,
  },
  pt: {
    common: pt,
    errors: ptErrors,
    auth: ptAuth,
    chat: ptChat,
    settings: ptSettings,
    pricing: ptPricing,
    models: ptModels,
  },
  it: {
    common: it,
    errors: itErrors,
    auth: itAuth,
    chat: itChat,
    settings: itSettings,
    pricing: itPricing,
    models: itModels,
  },
  ru: {
    common: ru,
    errors: ruErrors,
    auth: ruAuth,
    chat: ruChat,
    settings: ruSettings,
    pricing: ruPricing,
    models: ruModels,
  },
  ar: {
    common: ar,
    errors: arErrors,
    auth: arAuth,
    chat: arChat,
    settings: arSettings,
    pricing: arPricing,
    models: arModels,
  },
  hi: {
    common: hi,
    errors: hiErrors,
    auth: hiAuth,
    chat: hiChat,
    settings: hiSettings,
    pricing: hiPricing,
    models: hiModels,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: defaultLanguage,
    // Suppress the i18next maintenance/locize promo log
    lowerCaseLng: false,
    appendNamespaceToCIMode: false,
    partialBundledLanguages: false,
    ignoreJSONStructure: false,
    missingKeyHandler: () => {},
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
