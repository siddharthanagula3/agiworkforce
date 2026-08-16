'use client';

import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  managedCloudPreferencesNamespacePath,
} from '@agiworkforce/cloud-contracts';

import { addCsrfHeaders } from '@/lib/client/csrf';

export const PREFERENCE_NAMESPACE_SAVED_EVENT = 'agi:preference-namespace-saved';

export interface PreferenceNamespaceSavedDetail {
  namespace: string;
  value: unknown;
}

export async function fetchStoredPreferenceNamespace<T extends object>(
  namespace: string,
): Promise<Partial<T>> {
  const response = await fetch(managedCloudPreferencesNamespacePath(namespace), {
    credentials: 'include',
  });
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

export async function fetchPreferenceNamespace<T extends object>(
  namespace: string,
  fallback: T,
): Promise<T> {
  const stored = await fetchStoredPreferenceNamespace<T>(namespace);
  return { ...fallback, ...stored } as T;
}

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
  const response = await fetch(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
    method: 'PUT',
    headers,
    credentials: 'include',
    body: JSON.stringify({ namespace, value }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? 'Failed to save settings');
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<PreferenceNamespaceSavedDetail>(PREFERENCE_NAMESPACE_SAVED_EVENT, {
        detail: { namespace, value },
      }),
    );
  }
}
