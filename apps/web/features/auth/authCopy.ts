'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AUTH_COPY_NAMESPACE,
  AUTH_ERROR_LOCALIZED_COPY,
  AUTH_ERROR_SOURCE_COPY,
  authErrorCopyKey,
  authErrorResourceBundle,
  type AuthCopyLocale,
  type AuthErrorCopy,
} from '@/lib/auth/error-taxonomy.copy';
import type { AuthErrorKind } from '@/lib/auth/error-taxonomy';

const TAXONOMY_ROOT = 'errorTaxonomy';

interface ResourceRegistrar {
  language?: string;
  addResourceBundle?: (
    language: string,
    namespace: string,
    resources: unknown,
    deep?: boolean,
    overwrite?: boolean,
  ) => void;
  hasResourceBundle?: (language: string, namespace: string) => boolean;
}

const registered = new Set<string>();

// The taxonomy strings ship with this surface, so they are merged without
// overwrite: a key already in the shared catalogue always wins.
function registerTaxonomyCopy(instance: ResourceRegistrar): void {
  if (typeof instance.addResourceBundle !== 'function') return;
  for (const locale of Object.keys(AUTH_ERROR_LOCALIZED_COPY) as AuthCopyLocale[]) {
    if (registered.has(locale)) continue;
    registered.add(locale);
    instance.addResourceBundle(
      locale,
      AUTH_COPY_NAMESPACE,
      { [TAXONOMY_ROOT]: authErrorResourceBundle(locale) },
      true,
      false,
    );
  }
}

function localeOf(language: string | undefined): AuthCopyLocale {
  const base = (language ?? '').split('-')[0] ?? '';
  return base in AUTH_ERROR_LOCALIZED_COPY ? (base as AuthCopyLocale) : 'en';
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

function interpolate(value: string, values?: Record<string, string | number>): string {
  if (!values || !value.includes('{{')) return value;
  return value.replace(PLACEHOLDER, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export interface AuthCopy {
  text: (key: string, defaultValue: string, values?: Record<string, string | number>) => string;
  errorCopy: (kind: AuthErrorKind) => AuthErrorCopy;
}

export function useAuthCopy(): AuthCopy {
  const { t, i18n } = useTranslation(AUTH_COPY_NAMESPACE);
  const instance = i18n as ResourceRegistrar | undefined;
  const language = instance?.language;
  if (instance) registerTaxonomyCopy(instance);

  return useMemo(() => {
    const fallback = AUTH_ERROR_LOCALIZED_COPY[localeOf(language)] ?? AUTH_ERROR_SOURCE_COPY;
    // i18next interpolates when it is initialised; this also covers the
    // uninitialised case, where it hands back the raw default.
    const text = (
      key: string,
      defaultValue: string,
      values?: Record<string, string | number>,
    ): string => interpolate(String(t(key, { defaultValue, ...values })), values);
    return {
      text,
      errorCopy: (kind) => ({
        title: text(authErrorCopyKey(kind, 'title'), fallback[kind].title),
        message: text(authErrorCopyKey(kind, 'message'), fallback[kind].message),
        action: text(authErrorCopyKey(kind, 'action'), fallback[kind].action),
      }),
    };
  }, [language, t]);
}
