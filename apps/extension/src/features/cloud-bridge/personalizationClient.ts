import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  managedCloudPreferencesNamespacePath,
} from '@agiworkforce/cloud-contracts';
import {
  MAX_CUSTOM_INSTRUCTIONS_CHARS,
  normalizeResponseStylePreference,
  type PreferredLength,
  type ResponseStyle,
} from '@agiworkforce/types';
import { platformRequestHeaders } from '../../platformHeaders';
import { FREE_TRIAL_GATEWAY } from './freeTrialClient';

const ACCOUNT_GENERAL_NAMESPACE = 'general';
const ACCOUNT_PERSONALIZATION_NAMESPACE = 'personalization';

export interface AccountInstructions {
  instructions: string;
  instructionsEnabled: boolean;
}

export interface AccountResponseStyle {
  style: ResponseStyle;
  preferredLength: PreferredLength;
}

export type AccountPersonalization = AccountInstructions & AccountResponseStyle;

async function send(token: string, path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${FREE_TRIAL_GATEWAY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...platformRequestHeaders(),
    },
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const error = body?.['error'];
    const message =
      error && typeof error === 'object' ? (error as Record<string, unknown>)['message'] : error;
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message.trim()
        : `Settings request failed (${response.status}).`,
    );
  }
  return body;
}

async function readNamespace(token: string, namespace: string): Promise<Record<string, unknown>> {
  const body = (await send(token, managedCloudPreferencesNamespacePath(namespace), {
    method: 'GET',
  })) as Record<string, unknown> | null;
  const settings = body?.['settings'];
  return settings && typeof settings === 'object' && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : {};
}

async function patchNamespace(
  token: string,
  namespace: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await send(token, MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
    method: 'PUT',
    body: JSON.stringify({ namespace, patch }),
  });
}

export async function fetchAccountPersonalization(token: string): Promise<AccountPersonalization> {
  const [general, personalization] = await Promise.all([
    readNamespace(token, ACCOUNT_GENERAL_NAMESPACE),
    readNamespace(token, ACCOUNT_PERSONALIZATION_NAMESPACE),
  ]);
  const style = normalizeResponseStylePreference(personalization);
  return {
    instructions:
      typeof general['instructions'] === 'string'
        ? general['instructions'].slice(0, MAX_CUSTOM_INSTRUCTIONS_CHARS)
        : '',
    instructionsEnabled: general['instructionsEnabled'] !== false,
    style: style.style,
    preferredLength: style.preferredLength,
  };
}

export async function saveAccountInstructions(
  token: string,
  instructions: AccountInstructions,
): Promise<void> {
  await patchNamespace(token, ACCOUNT_GENERAL_NAMESPACE, {
    instructions: instructions.instructions.slice(0, MAX_CUSTOM_INSTRUCTIONS_CHARS),
    instructionsEnabled: instructions.instructionsEnabled,
  });
}

export async function saveAccountResponseStyle(
  token: string,
  style: AccountResponseStyle,
): Promise<void> {
  await patchNamespace(token, ACCOUNT_PERSONALIZATION_NAMESPACE, {
    style: style.style,
    preferredLength: style.preferredLength,
  });
}
