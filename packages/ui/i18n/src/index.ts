import { resources } from './resources';

export { resources };
export {
  DEFAULT_LANGUAGE,
  NAMESPACES,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  languageFor,
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
