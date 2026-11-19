const mockStored = new Map<string, unknown>();
const mockSecureFetch = jest.fn();

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/lib/mmkv', () => ({
  storage: {
    getBoolean: (key: string) => mockStored.get(key) as boolean | undefined,
    getString: (key: string) => mockStored.get(key) as string | undefined,
    set: (key: string, value: unknown) => mockStored.set(key, value),
    delete: (key: string) => mockStored.delete(key),
  },
  mmkvStorage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
  rehydrateWhenMmkvReady: () => undefined,
  whenMmkvReady: (callback: () => void) => callback(),
}));
jest.mock('@/lib/deviceId', () => ({ getDeviceId: jest.fn().mockResolvedValue('install-12345') }));
jest.mock('@/services/authSession', () => ({
  getAuthToken: jest.fn(async () => 'session-token'),
  getAuthHeaders: jest.fn(async () => ({ Authorization: 'Bearer session-token' })),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
}));
jest.mock('@/services/secureFetch', () => ({
  secureFetch: (input: unknown, init: unknown) => mockSecureFetch(input, init),
}));
jest.mock('@/services/llmGate', () => ({ ensureCloudSendConsent: jest.fn() }));
jest.mock('@/src/features/billing/store', () => ({
  useTierStore: { getState: () => ({ tier: 'free' }) },
}));
jest.mock('@/src/features/model-picker/store', () => ({
  useModelStore: { getState: () => ({ selectedModel: 'auto' }) },
}));
jest.mock('@/src/features/chat/utils/newConversationModel', () => ({
  resolveNewConversationModel: () => 'auto',
}));

import { MOBILE_INTENT_TOKEN_PATH } from '@agiworkforce/cloud-contracts';
import { API_URL } from '../lib/constants';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import {
  disableAskFromSiri,
  revokeForgottenAskFromSiri,
} from '../src/features/siri/askIntentToken';

const PENDING_REVOKE_KEY = 'ask-from-siri-pending-revoke-token-v1';
const TOKEN_ID = '11111111-1111-4111-8111-111111111111';

function revokeRequest(): { url: string; init: RequestInit } {
  expect(mockSecureFetch).toHaveBeenCalledTimes(1);
  const [url, init] = mockSecureFetch.mock.calls[0] as [string, RequestInit];
  return { url, init };
}

beforeEach(() => {
  mockStored.clear();
  mockSecureFetch.mockReset().mockResolvedValue(
    new Response(JSON.stringify({ revoked: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  __resetCloudAccountSessionForTests();
  activateCloudAccount('person-a');
  useChatAppModeStore.setState({ appMode: 'local' });
});

describe('an Ask from Siri revoke sent from Local Mode, through the real chokepoint', () => {
  it('pays an owed whole-install revoke with the withdrawal control and a Bearer header', async () => {
    mockStored.set(PENDING_REVOKE_KEY, 'install');

    await revokeForgottenAskFromSiri();

    const { url, init } = revokeRequest();
    expect(url).toBe(`${API_URL}${MOBILE_INTENT_TOKEN_PATH}?installId=install-12345`);
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-token');
    expect(mockStored.has(PENDING_REVOKE_KEY)).toBe(false);
  });

  it('sends nothing for a revoke that is not owed', async () => {
    await revokeForgottenAskFromSiri();

    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('turns off Ask from Siri with the withdrawal control and clears the owed marker', async () => {
    mockStored.set('ask-from-siri-enabled-v1', true);
    mockStored.set('ask-from-siri-token-id-v1', TOKEN_ID);

    await disableAskFromSiri();

    const { url, init } = revokeRequest();
    expect(url).toBe(`${API_URL}${MOBILE_INTENT_TOKEN_PATH}?tokenId=${TOKEN_ID}`);
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-token');
    expect(mockStored.has(PENDING_REVOKE_KEY)).toBe(false);
    expect(mockStored.get('ask-from-siri-enabled-v1')).toBe(false);
  });
});
