'use client';

import { useCallback, useMemo } from 'react';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';

import {
  englishPlural,
  interpolate,
  pluralOptions,
  type PluralCopy,
  type UiNamespace,
} from './lib/translate';

export type { PluralCopy, UiNamespace };

export interface UiTranslate {
  /**
   * @param key Key inside the namespace passed to `useUiTranslation`.
   * @param english Source copy. Required, and used verbatim when the key has
   *   no translation in the active locale.
   * @param values Interpolation values for `{{placeholders}}` in the copy.
   */
  (key: string, english: string, values?: Record<string, unknown>): string;
}

export interface UiTranslatePlural {
  (key: string, count: number, english: PluralCopy, values?: Record<string, unknown>): string;
}

export interface UiTranslation {
  t: UiTranslate;
  plural: UiTranslatePlural;
}

export function useUiTranslation(namespace: UiNamespace): UiTranslation {
  const { t } = useTranslation(namespace, { i18n: i18next, useSuspense: false });
  const hasInstance = i18next.isInitialized;

  const translate = useCallback<UiTranslate>(
    (key, english, values) => {
      if (!hasInstance) return interpolate(english, values);
      return t(key, { ...values, defaultValue: english }) as string;
    },
    [t, hasInstance],
  );

  const plural = useCallback<UiTranslatePlural>(
    (key, count, english, values) => {
      if (!hasInstance) return englishPlural(count, english, values);
      return t(key, pluralOptions(count, english, values)) as string;
    },
    [t, hasInstance],
  );

  return useMemo(() => ({ t: translate, plural }), [translate, plural]);
}
