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
import { useTierStore } from '@/src/features/billing/store';
import { resolveNewConversationModel } from '@/src/features/chat/utils/newConversationModel';
import { useModelStore } from '@/src/features/model-picker/store';

export const ASK_INTENT_KEYCHAIN_SERVICE = 'com.agiworkforce.app.ask-intent';
export const ASK_INTENT_KEYCHAIN_KEY = 'ask_intent_token';
const ENABLED_KEY = 'ask-from-siri-enabled-v1';
const PENDING_REVOKE_KEY = 'ask-from-siri-pending-revoke-v1';
const SIGN_OUT_REVOKE_ATTEMPTS = 3;

const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: ASK_INTENT_KEYCHAIN_SERVICE,
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

let rotatedThisLaunch = false;

export function askFromSiriSupported(): boolean {
  return Platform.OS === 'ios';
}

function readFlag(key: string): boolean {
  try {
    return storage.getBoolean(key) === true;
  } catch {
    return false;
  }
}

export function isAskFromSiriEnabled(): boolean {
  return readFlag(ENABLED_KEY);
}

function defaultModelId(): string | undefined {
  return resolveNewConversationModel({
    selectedModel: useModelStore.getState().selectedModel,
    mode: 'cloud',
    subscriptionTier: useTierStore.getState().tier,
    installedModelIds: [],
    readySystemModelIds: [],
    defaultLocalModelDownloading: false,
  });
}

async function storeFreshToken(): Promise<void> {
  const model = defaultModelId();
  const response = MobileIntentTokenIssueResponseSchema.parse(
    await api.post<unknown>(MOBILE_INTENT_TOKEN_PATH, {
      installId: await getDeviceId(),
      ...(model ? { defaultModelId: model } : {}),
    }),
  );
  await SecureStore.setItemAsync(ASK_INTENT_KEYCHAIN_KEY, response.token, KEYCHAIN_OPTIONS);
}

async function forgetLocalToken(): Promise<void> {
  storage.set(ENABLED_KEY, false);
  await SecureStore.deleteItemAsync(ASK_INTENT_KEYCHAIN_KEY, KEYCHAIN_OPTIONS);
}

async function revokePath(): Promise<string> {
  return `${MOBILE_INTENT_TOKEN_PATH}?installId=${encodeURIComponent(await getDeviceId())}`;
}

export async function enableAskFromSiri(): Promise<void> {
  if (!askFromSiriSupported()) return;
  await storeFreshToken();
  storage.set(ENABLED_KEY, true);
}

export async function disableAskFromSiri(): Promise<void> {
  try {
    await api.delete<unknown>(await revokePath());
    storage.set(PENDING_REVOKE_KEY, false);
  } catch (error) {
    storage.set(PENDING_REVOKE_KEY, true);
    throw error;
  } finally {
    await forgetLocalToken();
  }
}

export async function settleAskIntentOnLaunch(): Promise<void> {
  if (!askFromSiriSupported()) return;
  if (readFlag(PENDING_REVOKE_KEY)) {
    await api.delete<unknown>(await revokePath());
    storage.set(PENDING_REVOKE_KEY, false);
  }
  if (rotatedThisLaunch || !isAskFromSiriEnabled()) return;
  rotatedThisLaunch = true;
  await storeFreshToken();
}

async function revokeWithCapturedSession(token: string): Promise<boolean> {
  const endpoint = new URL(MOBILE_INTENT_TOKEN_PATH, API_URL);
  endpoint.searchParams.set('installId', await getDeviceId());
  for (let attempt = 0; attempt < SIGN_OUT_REVOKE_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.SIGN_OUT_CLEANUP);
    try {
      const response = await secureFetch(endpoint.toString(), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'X-Requested-With': 'XMLHttpRequest' },
        signal: controller.signal,
      });
      if (response.ok) return true;
    } catch (error) {
      console.warn('[siri] the Ask token revoke on sign-out failed', error);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return false;
}

export async function revokeAskIntentForSignOut(capturedClerkToken: string): Promise<void> {
  rotatedThisLaunch = false;
  const hadToken = isAskFromSiriEnabled() || readFlag(PENDING_REVOKE_KEY);
  const token = capturedClerkToken.trim();
  try {
    if (hadToken && token && !(await revokeWithCapturedSession(token))) {
      throw new Error('The Ask from Siri token could not be revoked on sign-out');
    }
    storage.set(PENDING_REVOKE_KEY, false);
  } finally {
    await forgetLocalToken();
  }
}
