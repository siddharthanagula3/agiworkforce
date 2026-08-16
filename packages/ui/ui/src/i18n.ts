'use client';

import { useCallback, useMemo } from 'react';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';

export type UiNamespace =
  | 'common'
  | 'chat'
  | 'settings'
  | 'auth'
  | 'errors'
  | 'models'
  | 'pricing'
  | 'v3';

export interface UiTranslate {
  /**
   * @param key Key inside the namespace passed to `useUiTranslation`.
   * @param english Source copy. Required, and used verbatim when the key has
   *   no translation in the active locale.
   * @param values Interpolation values for `{{placeholders}}` in the copy.
   */
  (key: string, english: string, values?: Record<string, unknown>): string;
}

export interface UiTranslation {
  t: UiTranslate;
}

function interpolate(template: string, values: Record<string, unknown> | undefined): string {
  if (!values) return template;
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
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

  return useMemo(() => ({ t: translate }), [translate]);
}
