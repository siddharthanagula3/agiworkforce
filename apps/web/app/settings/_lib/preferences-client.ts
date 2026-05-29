'use client';

import { addCsrfHeaders } from '@/lib/client/csrf';

export async function fetchPreferenceNamespace<T extends object>(
  namespace: string,
  fallback: T,
): Promise<T> {
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
  return data.settings && typeof data.settings === 'object'
    ? ({ ...fallback, ...(data.settings as Partial<T>) } as T)
    : fallback;
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
