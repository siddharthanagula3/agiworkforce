'use client';

import { MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH } from '@agiworkforce/cloud-contracts';
import {
  invalidatePreferencesSnapshot,
  PREFERENCE_NAMESPACE_SAVED_EVENT,
  type PreferenceNamespaceSavedDetail,
} from '@/app/settings/_lib/preferences-client';
import { addCsrfHeaders } from '@/lib/client/csrf';
import type { RequestAuthority } from '@/lib/identity/request-authority';
import { NOTIFICATION_DEFAULTS, type NotificationPatch } from '../lib/notification-preferences';

export interface NotificationSnapshot {
  stored: NotificationPatch & Record<string, unknown>;
  version: string | null;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseSnapshot(body: unknown): NotificationSnapshot {
  if (
    !object(body) ||
    !object(body['settings']) ||
    !(
      body['version'] === null ||
      (typeof body['version'] === 'string' && body['version'].trim().length > 0)
    )
  ) {
    throw new Error('Notification preferences could not be confirmed');
  }
  const settings = body['settings'];
  const value = settings['notifications'];
  if (Object.hasOwn(settings, 'notifications') && !object(value)) {
    throw new Error('Notification preferences could not be confirmed');
  }
  const stored = value === undefined ? {} : (value as Record<string, unknown>);
  for (const key of Object.keys(NOTIFICATION_DEFAULTS)) {
    if (Object.hasOwn(stored, key) && typeof stored[key] !== 'boolean') {
      throw new Error('Notification preferences could not be confirmed');
    }
  }
  return { stored, version: body['version'] as string | null };
}

export async function readNotificationPreferences(
  authority: RequestAuthority,
): Promise<NotificationSnapshot> {
  const response = await authority.fetch(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Notification preferences could not be loaded');
  const body: unknown = await response.json();
  authority.assertCurrent();
  return parseSnapshot(body);
}

export async function saveNotificationPreferences(
  authority: RequestAuthority,
  patch: NotificationPatch,
): Promise<NotificationSnapshot> {
  authority.assertCurrent();
  const captured = { ...patch };
  const entries = Object.entries(captured);
  if (
    !entries.length ||
    entries.some(
      ([key, value]) => !Object.hasOwn(NOTIFICATION_DEFAULTS, key) || typeof value !== 'boolean',
    )
  ) {
    throw new Error('Invalid notification preference change');
  }
  const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
  authority.assertCurrent();
  const response = await authority.fetch(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ namespace: 'notifications', patch: captured }),
  });
  if (!response.ok) throw new Error('Notification preference write was not confirmed');
  const body: unknown = await response.json();
  authority.assertCurrent();
  const receipt = parseSnapshot(body);
  if (receipt.version === null || entries.some(([key, value]) => receipt.stored[key] !== value)) {
    throw new Error('Notification preference write was not confirmed');
  }
  authority.assertCurrent();
  invalidatePreferencesSnapshot();
  window.dispatchEvent(
    new CustomEvent<PreferenceNamespaceSavedDetail>(PREFERENCE_NAMESPACE_SAVED_EVENT, {
      detail: { namespace: 'notifications', value: receipt.stored },
    }),
  );
  authority.assertCurrent();
  return receipt;
}
