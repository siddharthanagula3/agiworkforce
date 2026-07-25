'use client';

import { addCsrfHeaders } from '@/lib/client/csrf';

/**
 * Read a namespace and return EXACTLY what the server stored — no merge with a
 * client-side fallback.
 *
 * PER-10: `fetchPreferenceNamespace` merges `{...fallback, ...serverSettings}`,
 * so a stored empty string permanently wins over a correct default and there is
 * no way to tell "the user cleared this" from "the server has never been told".
 * Callers whose defaults are DERIVED (a name, an inferred preference) must use
 * this and apply their own precedence.
 */
export async function fetchStoredPreferenceNamespace<T extends object>(
  namespace: string,
): Promise<Partial<T>> {
  const response = await fetch(
    `/api/settings/preferences?namespace=${encodeURIComponent(namespace)}`,
    {
      credentials: 'include',
    },
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(data.error?.message ?? data.message ?? `Failed to load ${namespace} settings`);
  }
  const data = (await response.json()) as { settings?: unknown };
  return data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
    ? (data.settings as Partial<T>)
    : {};
}

/**
 * Read a namespace merged over a static fallback. Safe when every fallback
 * value is a CONSTANT default; see `fetchStoredPreferenceNamespace` when the
 * defaults are derived from user identity.
 */
export async function fetchPreferenceNamespace<T extends object>(
  namespace: string,
  fallback: T,
): Promise<T> {
  const stored = await fetchStoredPreferenceNamespace<T>(namespace);
  return { ...fallback, ...stored } as T;
}

/**
 * PER-8 — write the canonical full name.
 *
 * `profiles.display_name` is the single source of truth for the user's full
 * name, and `PATCH /api/me` is its only writer. Settings used to write the name
 * into a settings namespace and Clerk `unsafeMetadata` instead, neither of
 * which `/api/me` read, so "Full name" could not change the greeting, header or
 * sidebar.
 */
export async function saveDisplayName(displayName: string): Promise<void> {
  const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
  const response = await fetch('/api/me', {
    method: 'PATCH',
    headers,
    credentials: 'include',
    body: JSON.stringify({ display_name: displayName }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(data.error?.message ?? data.message ?? 'Failed to save your name');
  }
}

/**
 * Re-read `/api/me` into both client stores so a profile edit is visible in the
 * greeting, header and sidebar immediately instead of after a hard reload.
 * Lazy imports keep the settings bundle out of these stores' module-init path.
 */
export async function refreshProfileConsumers(): Promise<void> {
  const [{ useBillingStore }, { useAuthStore }] = await Promise.all([
    import('@shared/stores/web-auth-store'),
    import('@shared/stores/authentication-store'),
  ]);
  await Promise.all([
    useBillingStore.getState().refreshUser(),
    useAuthStore.getState().fetchUser(),
  ]);
}

export async function savePreferenceNamespace<T extends object>(
  namespace: string,
  value: T,
): Promise<void> {
  const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
  const response = await fetch('/api/settings/preferences', {
    method: 'PUT',
    headers,
    credentials: 'include',
    body: JSON.stringify({ namespace, value }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? 'Failed to save settings');
  }
}
