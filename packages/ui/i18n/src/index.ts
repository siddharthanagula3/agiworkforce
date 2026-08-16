
import { resources } from './resources';

export { resources };

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
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

export const baseInitOptions = {
  resources,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common' as const,
  ns: NAMESPACES,
  interpolation: { escapeValue: false },
} as const;
