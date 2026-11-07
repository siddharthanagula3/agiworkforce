import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  managedCloudPreferencesNamespacePath,
} from '@agiworkforce/cloud-contracts';

import { api } from '@/services/api';
import type { CloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';

export interface PreferenceRequestOptions {
  accountEpoch?: CloudAccountEpoch | null;
  signal?: AbortSignal;
}

export interface PreferenceReadOptions extends PreferenceRequestOptions {
  strictSettings?: boolean;
}

interface PreferenceReadResponse {
  settings?: unknown;
  autonomousToolApprovalsAllowed?: unknown;
}

function preferenceSettings(
  data: PreferenceReadResponse | null | undefined,
  strict: boolean,
): Record<string, unknown> {
  const settings = data?.settings;
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    return settings as Record<string, unknown>;
  }
  if (strict) throw new Error('Account preferences returned an invalid settings response');
  return {};
}

function requestOptions(options?: PreferenceReadOptions) {
  if (options === undefined) return undefined;
  const { strictSettings: _strictSettings, ...transport } = options;
  return transport;
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
  options?: PreferenceReadOptions,
): Promise<unknown> {
  const path = managedCloudPreferencesNamespacePath(namespace);
  const data =
    options === undefined
      ? await api.get<PreferenceReadResponse>(path)
      : await api.get<PreferenceReadResponse>(path, requestOptions(options));
  return preferenceSettings(data, options?.strictSettings === true);
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

export async function fetchAccountSettings(
  options?: PreferenceReadOptions,
): Promise<Record<string, unknown>> {
  const data = options === undefined
    ? await api.get<PreferenceReadResponse>(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH)
    : await api.get<PreferenceReadResponse>(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, requestOptions(options));
  return preferenceSettings(data, options?.strictSettings === true);
}

export async function saveAccountSettings(
  settings: Record<string, unknown>,
  options?: PreferenceRequestOptions,
): Promise<void> {
  if (options === undefined) {
    await api.put(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, { settings });
  } else {
    await api.put(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, { settings }, options);
  }
}
