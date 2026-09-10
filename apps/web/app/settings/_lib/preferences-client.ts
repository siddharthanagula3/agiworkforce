'use client';

import { MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH } from '@agiworkforce/cloud-contracts';

import { addCsrfHeaders } from '@/lib/client/csrf';

export const PREFERENCE_NAMESPACE_SAVED_EVENT = 'agi:preference-namespace-saved';

export interface PreferenceNamespaceSavedDetail {
  namespace: string;
  value: unknown;
}

const PREFERENCES_SNAPSHOT_TTL_MS = 60_000;

let snapshotInFlight: Promise<Record<string, unknown>> | null = null;
let snapshotLoadedAt = 0;
let storedVersion: string | null = null;
let organizationMemoryAllowed = true;

export class PreferenceVersionConflictError extends Error {
  readonly namespace: string;
  readonly settings: unknown;
  readonly version: string | null;

  constructor(params: {
    message: string;
    namespace: string;
    settings: unknown;
    version: string | null;
  }) {
    super(params.message);
    this.name = 'PreferenceVersionConflictError';
    this.namespace = params.namespace;
    this.settings = params.settings;
    this.version = params.version;
  }
}

function readVersion(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

async function requestPreferencesSnapshot(): Promise<Record<string, unknown>> {
  const response = await fetch(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
    credentials: 'include',
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(data.error?.message ?? data.message ?? 'Failed to load settings');
  }
  const data = (await response.json()) as {
    settings?: unknown;
    version?: unknown;
    organizationMemoryAllowed?: unknown;
  };
  storedVersion = readVersion(data.version);
  organizationMemoryAllowed = data.organizationMemoryAllowed !== false;
  return data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
    ? (data.settings as Record<string, unknown>)
    : {};
}

export async function readPreferencesVersion(): Promise<string | null> {
  await loadPreferencesSnapshot();
  return storedVersion;
}

export async function readOrganizationMemoryAllowed(): Promise<boolean> {
  await loadPreferencesSnapshot();
  return organizationMemoryAllowed;
}

function loadPreferencesSnapshot(): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (snapshotInFlight && now - snapshotLoadedAt < PREFERENCES_SNAPSHOT_TTL_MS) {
    return snapshotInFlight;
  }
  snapshotLoadedAt = now;
  snapshotInFlight = requestPreferencesSnapshot().catch((error: unknown) => {
    snapshotInFlight = null;
    snapshotLoadedAt = 0;
    throw error;
  });
  return snapshotInFlight;
}

export function invalidatePreferencesSnapshot(): void {
  snapshotInFlight = null;
  snapshotLoadedAt = 0;
}

export async function fetchStoredPreferenceNamespace<T extends object>(
  namespace: string,
): Promise<Partial<T>> {
  const snapshot = await loadPreferencesSnapshot();
  const value = snapshot[namespace];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<T>) : {};
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

export interface PreferenceSaveOptions {
  /** Merge into the stored namespace instead of replacing it. */
  merge?: boolean;
  /** Refuse the write, with a conflict, if the stored revision moved on. */
  expectedVersion?: string | null;
}

export interface PreferenceSaveResult {
  version: string | null;
}

export async function savePreferenceNamespace<T extends object>(
  namespace: string,
  value: T,
  options?: PreferenceSaveOptions,
): Promise<PreferenceSaveResult> {
  const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
  const response = await fetch(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
    method: 'PUT',
    headers,
    credentials: 'include',
    body: JSON.stringify({
      namespace,
      ...(options?.merge ? { patch: value } : { value }),
      ...(options?.expectedVersion === undefined
        ? {}
        : { expectedVersion: options.expectedVersion }),
    }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      settings?: unknown;
      version?: unknown;
    };
    const message = data.error?.message ?? 'Failed to save settings';
    if (response.status === 412) {
      invalidatePreferencesSnapshot();
      throw new PreferenceVersionConflictError({
        message,
        namespace,
        settings: data.settings,
        version: readVersion(data.version),
      });
    }
    throw new Error(message);
  }

  const data = (await response.json().catch(() => ({}))) as { version?: unknown };
  invalidatePreferencesSnapshot();
  const version = readVersion(data.version);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<PreferenceNamespaceSavedDetail>(PREFERENCE_NAMESPACE_SAVED_EVENT, {
        detail: { namespace, value },
      }),
    );
  }

  return { version };
}
