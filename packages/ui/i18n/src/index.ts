import { resources } from './resources';

export { resources };
export {
  DEFAULT_LANGUAGE,
  NAMESPACES,
  SELECTABLE_LANGUAGE_CODES,
  SELECTABLE_LANGUAGES,
  SUPPORTED_LANGUAGES,
  isSelectableLanguage,
  isSupportedLanguage,
  languageFor,
  selectableLanguageOrDefault,
  type Namespace,
  type SupportedLanguage,
} from './languages';
import { DEFAULT_LANGUAGE, NAMESPACES } from './languages';

export const baseInitOptions = {
  resources,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common' as const,
  ns: NAMESPACES,
  interpolation: { escapeValue: false },
} as const;
