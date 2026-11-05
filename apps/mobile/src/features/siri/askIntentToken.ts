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
import {
  assertCloudAccountEpochCurrent,
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useTierStore } from '@/src/features/billing/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { resolveNewConversationModel } from '@/src/features/chat/utils/newConversationModel';
import { useModelStore } from '@/src/features/model-picker/store';

export const ASK_INTENT_KEYCHAIN_SERVICE = 'com.agiworkforce.app.ask-intent';
export const ASK_INTENT_KEYCHAIN_KEY = 'ask_intent_token';
const ENABLED_KEY = 'ask-from-siri-enabled-v1';
const TOKEN_ID_KEY = 'ask-from-siri-token-id-v1';
const PENDING_REVOKE_KEY = 'ask-from-siri-pending-revoke-token-v1';
const SIGN_OUT_REVOKE_ATTEMPTS = 3;
const REVOKE_WHOLE_INSTALL = 'install';

const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: ASK_INTENT_KEYCHAIN_SERVICE,
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

interface OrdinaryOperationOwner {
  account: CloudAccountEpoch | null;
  accountGeneration: number;
  modeGeneration: number;
  lifecycleGeneration: number;
}

let modeGeneration = 0;
let accountGeneration = 0;
let lifecycleGeneration = 0;
let ordinaryTail: Promise<void> | null = null;
let rotationAttempt: OrdinaryOperationOwner | null = null;
let rotatedOwner: OrdinaryOperationOwner | null = null;

subscribeCloudAccountEpochChange(() => {
  accountGeneration += 1;
});

useChatAppModeStore.subscribe((next, previous) => {
  if (next.appMode !== previous.appMode) modeGeneration += 1;
});

function captureOrdinaryOwner(): OrdinaryOperationOwner {
  return {
    account: captureCloudAccountEpoch(),
    accountGeneration,
    modeGeneration,
    lifecycleGeneration,
  };
}

function isOrdinaryOwnerCurrent(owner: OrdinaryOperationOwner): boolean {
  return (
    (owner.account === null
      ? captureCloudAccountEpoch() === null
      : isCloudAccountEpochCurrent(owner.account)) &&
    owner.accountGeneration === accountGeneration &&
    owner.modeGeneration === modeGeneration &&
    owner.lifecycleGeneration === lifecycleGeneration
  );
}

function assertOrdinaryOwnerCurrent(owner: OrdinaryOperationOwner): void {
  if (!isOrdinaryOwnerCurrent(owner)) {
    throw new Error('Ask from Siri account or mode changed while this operation was pending');
  }
}

function enqueueOrdinaryOperation(
  owner: OrdinaryOperationOwner,
  operation: () => Promise<void>,
): Promise<void> {
  const run = async () => {
    assertOrdinaryOwnerCurrent(owner);
    await operation();
  };
  const result = ordinaryTail ? ordinaryTail.then(run) : run();
  const settled = result.then(
    () => {},
    () => {},
  );
  ordinaryTail = settled;
  void settled.then(() => {
    if (ordinaryTail === settled) ordinaryTail = null;
  });
  return result;
}

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

function readString(key: string): string | undefined {
  try {
    return storage.getString(key) || undefined;
  } catch {
    return undefined;
  }
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

async function storeFreshToken(owner: OrdinaryOperationOwner): Promise<void> {
  if (useChatAppModeStore.getState().appMode !== 'cloud') {
    throw new Error('Switch to Cloud mode to turn on Ask from Siri');
  }
  const model = defaultModelId();
  const installId = await getDeviceId();
  assertOrdinaryOwnerCurrent(owner);
  const response = MobileIntentTokenIssueResponseSchema.parse(
    await api.post<unknown>(
      MOBILE_INTENT_TOKEN_PATH,
      { installId, ...(model ? { defaultModelId: model } : {}) },
      { accountEpoch: owner.account },
    ),
  );
  assertOrdinaryOwnerCurrent(owner);
  await SecureStore.setItemAsync(ASK_INTENT_KEYCHAIN_KEY, response.token, KEYCHAIN_OPTIONS);
  assertOrdinaryOwnerCurrent(owner);
  storage.set(TOKEN_ID_KEY, response.tokenId);
  storage.delete(PENDING_REVOKE_KEY);
}

async function forgetLocalToken(): Promise<void> {
  storage.set(ENABLED_KEY, false);
  storage.delete(TOKEN_ID_KEY);
  await SecureStore.deleteItemAsync(ASK_INTENT_KEYCHAIN_KEY, KEYCHAIN_OPTIONS);
}

async function revokePath(tokenId: string | undefined): Promise<string> {
  return tokenId && tokenId !== REVOKE_WHOLE_INSTALL
    ? `${MOBILE_INTENT_TOKEN_PATH}?tokenId=${encodeURIComponent(tokenId)}`
    : `${MOBILE_INTENT_TOKEN_PATH}?installId=${encodeURIComponent(await getDeviceId())}`;
}

export async function enableAskFromSiri(): Promise<void> {
  if (!askFromSiriSupported()) return;
  const owner = captureOrdinaryOwner();
  await enqueueOrdinaryOperation(owner, async () => {
    assertCloudAccountEpochCurrent(owner.account);
    await storeFreshToken(owner);
    assertOrdinaryOwnerCurrent(owner);
    storage.set(ENABLED_KEY, true);
  });
}

export async function disableAskFromSiri(): Promise<void> {
  const owner = captureOrdinaryOwner();
  await enqueueOrdinaryOperation(owner, async () => {
    const tokenId = readString(TOKEN_ID_KEY);
    try {
      const path = await revokePath(tokenId);
      assertOrdinaryOwnerCurrent(owner);
      await api.delete<unknown>(path, { accountEpoch: owner.account });
      assertOrdinaryOwnerCurrent(owner);
      storage.delete(PENDING_REVOKE_KEY);
    } catch (error) {
      if (isOrdinaryOwnerCurrent(owner)) {
        storage.set(PENDING_REVOKE_KEY, tokenId ?? REVOKE_WHOLE_INSTALL);
      }
      throw error;
    } finally {
      if (isOrdinaryOwnerCurrent(owner)) await forgetLocalToken();
    }
  });
}

export async function settleAskIntentOnLaunch(): Promise<void> {
  if (!askFromSiriSupported()) return;
  if (rotationAttempt && isOrdinaryOwnerCurrent(rotationAttempt)) return;
  const attempt = captureOrdinaryOwner();
  rotationAttempt = attempt;
  try {
    await enqueueOrdinaryOperation(attempt, async () => {
      assertCloudAccountEpochCurrent(attempt.account);
      const pendingTokenId = readString(PENDING_REVOKE_KEY);
      if (pendingTokenId) {
        const path = await revokePath(pendingTokenId);
        assertOrdinaryOwnerCurrent(attempt);
        await api.delete<unknown>(path, { accountEpoch: attempt.account });
        assertOrdinaryOwnerCurrent(attempt);
        storage.delete(PENDING_REVOKE_KEY);
      }
      if ((rotatedOwner && isOrdinaryOwnerCurrent(rotatedOwner)) || !isAskFromSiriEnabled()) {
        return;
      }
      rotatedOwner = attempt;
      await storeFreshToken(attempt);
    });
  } catch (error) {
    if (rotationAttempt === attempt && isOrdinaryOwnerCurrent(attempt)) {
      if (rotatedOwner === attempt) rotatedOwner = null;
    }
    throw error;
  } finally {
    if (rotationAttempt === attempt) rotationAttempt = null;
  }
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
  lifecycleGeneration += 1;
  rotationAttempt = null;
  rotatedOwner = null;
  const hadToken = isAskFromSiriEnabled() || readString(PENDING_REVOKE_KEY) !== undefined;
  const token = capturedClerkToken.trim();
  try {
    if (hadToken && token && !(await revokeWithCapturedSession(token))) {
      throw new Error('The Ask from Siri token could not be revoked on sign-out');
    }
    storage.delete(PENDING_REVOKE_KEY);
  } finally {
    await forgetLocalToken();
  }
}
