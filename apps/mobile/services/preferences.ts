import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  managedCloudPreferencesNamespacePath,
} from '@agiworkforce/cloud-contracts';

import { api } from '@/services/api';
import type { CloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';

interface PreferenceRequestOptions {
  accountEpoch?: CloudAccountEpoch | null;
  signal?: AbortSignal;
}

interface PreferenceReadResponse {
  settings?: unknown;
  autonomousToolApprovalsAllowed?: unknown;
}

export async function fetchToolApprovalNamespace(
  namespace: string,
  options?: PreferenceRequestOptions,
): Promise<{ settings: unknown; autonomousToolApprovalsAllowed: boolean }> {
  const path = managedCloudPreferencesNamespacePath(namespace);
  const data =
    options === undefined
      ? await api.get<PreferenceReadResponse>(path)
      : await api.get<PreferenceReadResponse>(path, options);
  const settings = data?.settings;
  return {
    settings: settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {},
    autonomousToolApprovalsAllowed: data?.autonomousToolApprovalsAllowed === true,
  };
}

export async function fetchPreferenceNamespace(
  namespace: string,
  options?: PreferenceRequestOptions,
): Promise<unknown> {
  const path = managedCloudPreferencesNamespacePath(namespace);
  const data =
    options === undefined
      ? await api.get<PreferenceReadResponse>(path)
      : await api.get<PreferenceReadResponse>(path, options);
  const settings = data?.settings;
  return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
}

export async function savePreferenceNamespace<T extends object>(
  namespace: string,
  value: T,
  options?: PreferenceRequestOptions,
): Promise<void> {
  if (options === undefined) {
    await api.put(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, { namespace, value });
  } else {
    await api.put(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, { namespace, value }, options);
  }
}

export async function patchPreferenceNamespace<T extends object>(
  namespace: string,
  patch: T,
  options?: PreferenceRequestOptions,
): Promise<void> {
  if (options === undefined) {
    await api.put(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, { namespace, patch });
  } else {
    await api.put(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, { namespace, patch }, options);
  }
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
