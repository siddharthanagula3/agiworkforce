import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  MOBILE_INTENT_TOKEN_PATH,
  MobileIntentTokenIssueResponseSchema,
} from '@agiworkforce/cloud-contracts';
import { API_URL, TIMEOUTS } from '@/lib/constants';
import { getDeviceId } from '@/lib/deviceId';
import { storage } from '@/lib/mmkv';
import { api } from '@/services/api';
import { secureFetch } from '@/services/secureFetch';

export const ASK_INTENT_KEYCHAIN_SERVICE = 'com.agiworkforce.app.ask-intent';
export const ASK_INTENT_KEYCHAIN_KEY = 'ask_intent_token';
const ENABLED_KEY = 'ask-from-siri-enabled-v1';

const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: ASK_INTENT_KEYCHAIN_SERVICE,
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

let rotatedThisLaunch = false;

export function askFromSiriSupported(): boolean {
  return Platform.OS === 'ios';
}

export function isAskFromSiriEnabled(): boolean {
  try {
    return storage.getBoolean(ENABLED_KEY) === true;
  } catch {
    return false;
  }
}

async function storeFreshToken(): Promise<void> {
  const response = MobileIntentTokenIssueResponseSchema.parse(
    await api.post<unknown>(MOBILE_INTENT_TOKEN_PATH, { installId: await getDeviceId() }),
  );
  await SecureStore.setItemAsync(ASK_INTENT_KEYCHAIN_KEY, response.token, KEYCHAIN_OPTIONS);
}

async function forgetLocalToken(): Promise<void> {
  storage.set(ENABLED_KEY, false);
  await SecureStore.deleteItemAsync(ASK_INTENT_KEYCHAIN_KEY, KEYCHAIN_OPTIONS);
}

export async function enableAskFromSiri(): Promise<void> {
  if (!askFromSiriSupported()) return;
  await storeFreshToken();
  storage.set(ENABLED_KEY, true);
}

export async function disableAskFromSiri(): Promise<void> {
  await forgetLocalToken();
  await api.delete<unknown>(
    `${MOBILE_INTENT_TOKEN_PATH}?installId=${encodeURIComponent(await getDeviceId())}`,
  );
}

export async function rotateAskIntentTokenOnLaunch(): Promise<void> {
  if (rotatedThisLaunch || !askFromSiriSupported() || !isAskFromSiriEnabled()) return;
  rotatedThisLaunch = true;
  await storeFreshToken();
}

export async function revokeAskIntentForSignOut(capturedClerkToken: string): Promise<void> {
  const hadToken = isAskFromSiriEnabled();
  rotatedThisLaunch = false;
  await forgetLocalToken();
  const token = capturedClerkToken.trim();
  if (!hadToken || !token) return;
  const endpoint = new URL(MOBILE_INTENT_TOKEN_PATH, API_URL);
  endpoint.searchParams.set('installId', await getDeviceId());
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.SIGN_OUT_CLEANUP);
  try {
    const response = await secureFetch(endpoint.toString(), {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Ask from Siri sign-out cleanup failed (${response.status})`);
  } finally {
    clearTimeout(timeoutId);
  }
}
