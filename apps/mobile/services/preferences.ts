import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  managedCloudPreferencesNamespacePath,
} from '@agiworkforce/cloud-contracts';

import { api } from '@/services/api';

interface PreferenceReadResponse {
  settings?: unknown;
}

export async function fetchPreferenceNamespace(namespace: string): Promise<unknown> {
  const data = await api.get<PreferenceReadResponse>(
    managedCloudPreferencesNamespacePath(namespace),
  );
  const settings = data?.settings;
  return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
}

export async function savePreferenceNamespace<T extends object>(
  namespace: string,
  value: T,
): Promise<void> {
  await api.put(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, { namespace, value });
}

export async function fetchAccountSettings(): Promise<Record<string, unknown>> {
  const data = await api.get<PreferenceReadResponse>(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH);
  const settings = data?.settings;
  return settings && typeof settings === 'object' && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : {};
}

export async function saveAccountSettings(settings: Record<string, unknown>): Promise<void> {
  await api.put(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, { settings });
}
