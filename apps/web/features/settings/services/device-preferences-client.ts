'use client';

import { MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, managedCloudPreferencesNamespacePath } from '@agiworkforce/cloud-contracts';
import {
  invalidatePreferencesSnapshot,
  PREFERENCE_NAMESPACE_SAVED_EVENT,
  type PreferenceNamespaceSavedDetail,
} from '@/app/settings/_lib/preferences-client';
import { addCsrfHeaders } from '@/lib/client/csrf';
import type { RequestAuthority } from '@/lib/identity/request-authority';
import { DEVICE_SIGNIN_SETTINGS_NAMESPACE as NAMESPACE, DEVICE_SIGNIN_SETTING_KEY as KEY } from '../lib/device-signin-preferences';

export interface DevicePreferenceSnapshot {
  stored: Record<string, unknown>;
  version: string | null;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseSnapshot(body: unknown, namespaceOnly = false): DevicePreferenceSnapshot {
  if (!object(body) || !object(body['settings']) ||
      !(body['version'] === null || (typeof body['version'] === 'string' && body['version'].trim()))) {
    throw new Error('Device sign-in setting could not be confirmed');
  }
  const settings = body['settings'];
  const namespace = namespaceOnly ? settings : settings[NAMESPACE];
  if (!namespaceOnly && Object.hasOwn(settings, NAMESPACE) && !object(namespace)) {
    throw new Error('Device sign-in setting could not be confirmed');
  }
  const stored = namespace === undefined ? {} : namespace as Record<string, unknown>;
  if (Object.hasOwn(stored, KEY) && typeof stored[KEY] !== 'boolean') {
    throw new Error('Device sign-in setting could not be confirmed');
  }
  return { stored, version: body['version'] as string | null };
}

export async function readDevicePreferences(authority: RequestAuthority): Promise<DevicePreferenceSnapshot> {
  const response = await authority.fetch(managedCloudPreferencesNamespacePath(NAMESPACE), { cache: 'no-store' });
  if (!response.ok) throw new Error('Device sign-in setting could not be loaded');
  const body: unknown = await response.json();
  authority.assertCurrent();
  return parseSnapshot(body, true);
}

export async function saveDevicePreference(
  authority: RequestAuthority, enabled: boolean,
): Promise<DevicePreferenceSnapshot> {
  authority.assertCurrent();
  const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
  authority.assertCurrent();
  const response = await authority.fetch(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
    method: 'PUT', headers,
    body: JSON.stringify({ namespace: NAMESPACE, patch: { [KEY]: enabled } }),
  });
  if (!response.ok) throw new Error('Device sign-in change was not confirmed');
  const body: unknown = await response.json();
  authority.assertCurrent();
  const receipt = parseSnapshot(body);
  if (receipt.version === null || receipt.stored[KEY] !== enabled) {
    throw new Error('Device sign-in change was not confirmed');
  }
  authority.assertCurrent();
  invalidatePreferencesSnapshot();
  window.dispatchEvent(new CustomEvent<PreferenceNamespaceSavedDetail>(PREFERENCE_NAMESPACE_SAVED_EVENT, {
    detail: { namespace: NAMESPACE, value: receipt.stored },
  }));
  authority.assertCurrent();
  return receipt;
}
