/**
 * Shared i18n contract for every surface.
 *
 * Each app owns its own `i18next` instance — web needs the browser language
 * detector, mobile needs `expo-localization`, and desktop persists the choice
 * to its own store — but the language list, the fallback rule and the
 * translations themselves are defined once, here. Three copies of that list is
 * how web came to offer three languages while desktop offered twelve.
 */

import { resources } from './resources';

export { resources };

export interface SupportedLanguage {
  code: string;
  /** English name, for menus that group or search by it. */
  name: string;
  /** The language's own name — what a speaker of it expects to see. */
  nativeName: string;
  flag: string;
  /** Right-to-left script; hosts must set `dir` on the document. */
  rtl?: boolean;
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', rtl: true },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
] as const;

export const DEFAULT_LANGUAGE = 'en';

export const NAMESPACES = [
  'common',
  'chat',
  'settings',
  'auth',
  'errors',
  'models',
  'pricing',
  'v3',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

export function isSupportedLanguage(code: unknown): code is string {
  return typeof code === 'string' && SUPPORTED_LANGUAGES.some((lang) => lang.code === code);
}

export function languageFor(code: string): SupportedLanguage | undefined {
  return SUPPORTED_LANGUAGES.find((lang) => lang.code === code);
}

/** Shared `i18next.init` options. Hosts add their own detector and plugins. */
export const baseInitOptions = {
  resources,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common' as const,
  ns: NAMESPACES,
  // React already escapes; letting i18next escape again double-encodes
  // apostrophes and accented characters in the very languages this exists for.
  interpolation: { escapeValue: false },
} as const;
