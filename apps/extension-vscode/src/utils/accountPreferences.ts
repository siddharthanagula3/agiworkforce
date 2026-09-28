import type * as vscode from 'vscode';
import { getAccountToken, getCloudWebOrigin } from './api';
import { platformRequestHeaders } from '../platform/platformHeaders';

const PREFERENCES_PATH = '/api/settings/preferences';

export type PreferenceNamespace = Record<string, unknown>;

async function preferencesRequest(
  secrets: vscode.SecretStorage,
  namespace: string,
  method: 'GET' | 'PUT',
  body?: unknown,
): Promise<PreferenceNamespace | undefined> {
  const token = await getAccountToken(secrets);
  if (token === undefined || token === '') return undefined;
  const response = await fetch(
    `${getCloudWebOrigin()}${PREFERENCES_PATH}?namespace=${encodeURIComponent(namespace)}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...platformRequestHeaders(),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  if (!response.ok) throw new Error(`AGI Workforce answered HTTP ${response.status}`);
  const payload = (await response.json()) as { settings?: unknown };
  return method === 'GET' && payload.settings !== null && typeof payload.settings === 'object'
    ? (payload.settings as PreferenceNamespace)
    : {};
}

export function readAccountPreferences(
  secrets: vscode.SecretStorage,
  namespace: string,
): Promise<PreferenceNamespace | undefined> {
  return preferencesRequest(secrets, namespace, 'GET');
}

export async function patchAccountPreferences(
  secrets: vscode.SecretStorage,
  namespace: string,
  patch: PreferenceNamespace,
): Promise<boolean> {
  return (await preferencesRequest(secrets, namespace, 'PUT', { namespace, patch })) !== undefined;
}
