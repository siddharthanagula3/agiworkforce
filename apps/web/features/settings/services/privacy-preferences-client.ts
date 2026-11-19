'use client';

import { MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH } from '@agiworkforce/cloud-contracts';
import {
  invalidatePreferencesSnapshot,
  PREFERENCE_NAMESPACE_SAVED_EVENT,
  type PreferenceNamespaceSavedDetail,
} from '@/app/settings/_lib/preferences-client';
import { addCsrfHeaders } from '@/lib/client/csrf';
import type { RequestAuthority } from '@/lib/identity/request-authority';

export const PRIVACY_KEYS = [
  'shareTelemetry',
  'keepOutOfProviderTraining',
  'allowChatsForModelImprovement',
  'allowVoiceForModelImprovement',
] as const;
export type PrivacyKey = (typeof PRIVACY_KEYS)[number];
export type PrivacyValues = Record<PrivacyKey, boolean>;
export interface PrivacySnapshot {
  stored: Partial<PrivacyValues> & Record<string, unknown>;
  version: string | null;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseSnapshot(body: unknown): PrivacySnapshot {
  if (
    !object(body) ||
    !object(body['settings']) ||
    !(
      body['version'] === null ||
      (typeof body['version'] === 'string' && body['version'].trim().length > 0)
    )
  ) {
    throw new Error('Privacy settings could not be confirmed');
  }
  const settings = body['settings'];
  const privacy = settings['privacy'];
  if (Object.hasOwn(settings, 'privacy') && !object(privacy)) {
    throw new Error('Privacy settings could not be confirmed');
  }
  const stored = privacy === undefined ? {} : (privacy as Record<string, unknown>);
  for (const key of PRIVACY_KEYS) {
    if (Object.hasOwn(stored, key) && typeof stored[key] !== 'boolean') {
      throw new Error('Privacy settings could not be confirmed');
    }
  }
  return { stored: stored as PrivacySnapshot['stored'], version: body['version'] as string | null };
}

export async function readPrivacyPreferences(
  authority: RequestAuthority,
): Promise<PrivacySnapshot> {
  const response = await authority.fetch(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Privacy settings could not be loaded');
  const body: unknown = await response.json();
  authority.assertCurrent();
  return parseSnapshot(body);
}

export async function savePrivacyPreference(
  authority: RequestAuthority,
  key: PrivacyKey,
  value: boolean,
): Promise<PrivacySnapshot> {
  authority.assertCurrent();
  const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
  authority.assertCurrent();
  const response = await authority.fetch(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ namespace: 'privacy', patch: { [key]: value } }),
  });
  if (!response.ok) throw new Error('Privacy settings write was not confirmed');
  const body: unknown = await response.json();
  authority.assertCurrent();
  const receipt = parseSnapshot(body);
  if (receipt.version === null || receipt.stored[key] !== value) {
    throw new Error('Privacy settings write was not confirmed');
  }
  authority.assertCurrent();
  invalidatePreferencesSnapshot();
  window.dispatchEvent(
    new CustomEvent<PreferenceNamespaceSavedDetail>(PREFERENCE_NAMESPACE_SAVED_EVENT, {
      detail: { namespace: 'privacy', value: receipt.stored },
    }),
  );
  authority.assertCurrent();
  return receipt;
}
