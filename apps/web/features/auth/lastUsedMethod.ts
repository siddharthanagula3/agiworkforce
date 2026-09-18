'use client';

import type { AuthMethodId, AuthProviderId } from './authContract';

const STORAGE_KEY = 'agiworkforce-auth-last-method';
const METHOD_PREFIX = 'method:';
const PROVIDER_PREFIX = 'provider:';

export type AuthLastUsed =
  { kind: 'method'; method: AuthMethodId } | { kind: 'provider'; provider: AuthProviderId };

export function serializeLastUsed(value: AuthLastUsed): string {
  return value.kind === 'method'
    ? `${METHOD_PREFIX}${value.method}`
    : `${PROVIDER_PREFIX}${value.provider}`;
}

export function parseLastUsed(raw: string | null): AuthLastUsed | null {
  if (!raw) return null;
  if (raw.startsWith(METHOD_PREFIX)) {
    return { kind: 'method', method: raw.slice(METHOD_PREFIX.length) as AuthMethodId };
  }
  if (raw.startsWith(PROVIDER_PREFIX)) {
    return { kind: 'provider', provider: raw.slice(PROVIDER_PREFIX.length) as AuthProviderId };
  }
  return null;
}

export function readLastUsedAuthMethod(): AuthLastUsed | null {
  try {
    return parseLastUsed(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function rememberAuthMethod(value: AuthLastUsed): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeLastUsed(value));
  } catch {
    return;
  }
}
