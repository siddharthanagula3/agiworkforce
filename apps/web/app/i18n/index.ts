'use client';

/**
 * Web's i18next instance.
 *
 * The translations and the language list now come from `@agiworkforce/i18n`,
 * shared with Desktop and Mobile. They used to live here, in a copy that
 * carried 3 locales while Desktop's copy carried 12 — so the same product
 * offered a different set of languages depending on which app you opened, and
 * a string corrected in one stayed wrong in the other.
 *
 * What stays here is the part that is genuinely web-specific: browser language
 * detection, the SSR hydration dance below, and setting `dir` for RTL.
 */

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
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
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

/**
 * Keep `<html lang>` and `<html dir>` in step with the active language.
 *
 * Arabic arrived with the shared corpus, and a right-to-left language rendered
 * inside `dir="ltr"` does not merely look wrong — punctuation and mixed
 * Latin/Arabic runs order incorrectly, so the text is harder to read than the
 * untranslated English was. `lang` matters too: screen readers pick a voice
 * from it, and it is what CSS `:lang()` and hyphenation rules key on.
 */
function applyDocumentLanguage(code: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = code;
  document.documentElement.dir = languageFor(code)?.rtl ? 'rtl' : 'ltr';
}

if (typeof window !== 'undefined') {
  i18n.on('languageChanged', applyDocumentLanguage);
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
