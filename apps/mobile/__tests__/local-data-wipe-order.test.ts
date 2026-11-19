const mockAuthToken = jest.fn();
const mockClearAuthSession = jest.fn();
const mockSecureFetch = jest.fn();
const mockGetDeviceId = jest.fn();
const mockDeleteKeychainItem = jest.fn();
const mockExec = jest.fn();
const mockCloseDb = jest.fn();
const mockDeleteFile = jest.fn();
const mockClearCloudState = jest.fn();
const mockMarkers = new Map<string, string | boolean>();
const mockClearMmkv = jest.fn();
const mockClerkSetActive = jest.fn();
const mockClerkSignOut = jest.fn();
let mockClerkInstance: Record<string, unknown> | null = null;

jest.mock('@clerk/expo', () => ({ getClerkInstance: () => mockClerkInstance }));

jest.mock('../services/authSession', () => ({
  getAuthToken: () => mockAuthToken(),
  clearAuthSession: () => mockClearAuthSession(),
}));
jest.mock('../src/features/auth/services/cloudAccountTeardown', () => ({
  clearLocalCloudAccountState: () => mockClearCloudState(),
}));
jest.mock('../services/secureFetch', () => ({
  secureFetch: (...args: unknown[]) => mockSecureFetch(...args),
}));
jest.mock('../lib/deviceId', () => ({ getDeviceId: () => mockGetDeviceId() }));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock',
  setItemAsync: jest.fn(),
  deleteItemAsync: (...args: unknown[]) => mockDeleteKeychainItem(...args),
}));
jest.mock('../lib/mmkv', () => ({
  storage: {
    getBoolean: (key: string) => mockMarkers.get(key),
    getString: (key: string) => mockMarkers.get(key),
    set: (key: string, value: string | boolean) => mockMarkers.set(key, value),
    delete: (key: string) => mockMarkers.delete(key),
    clearAll: () => mockClearMmkv(),
  },
}));
jest.mock('../services/api', () => ({ api: { post: jest.fn(), delete: jest.fn() } }));
jest.mock('../src/features/billing/store', () => ({ useTierStore: { getState: jest.fn() } }));
jest.mock('../src/features/model-picker/store', () => ({ useModelStore: { getState: jest.fn() } }));
jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: {
    getState: () => ({ appMode: 'local' }),
    subscribe: () => () => {},
  },
}));
jest.mock('../src/features/chat/utils/newConversationModel', () => ({
  resolveNewConversationModel: jest.fn(),
}));
jest.mock('../storage/db', () => ({
  getDb: async () => ({
    withTransactionAsync: async (callback: () => Promise<void>) => callback(),
    execAsync: (...args: unknown[]) => mockExec(...args),
  }),
  closeDb: () => mockCloseDb(),
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  deleteAsync: (...args: unknown[]) => mockDeleteFile(...args),
  writeAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8' },
}));
jest.mock('../services/dsarTemporaryFile', () => ({ withDsarTemporaryFile: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: {} }));
jest.mock('../storage/conversations', () => ({ listConversations: jest.fn() }));
jest.mock('../storage/messages', () => ({ getMessagesForConversation: jest.fn() }));
jest.mock('../storage/memory', () => ({ listMemoryFacts: jest.fn() }));
jest.mock('../storage/customInstructions', () => ({ listCustomInstructions: jest.fn() }));
jest.mock('../storage/settingsDb', () => ({ getAllSettings: jest.fn() }));
jest.mock('../storage/installedModels', () => ({ listInstalledModels: jest.fn() }));
jest.mock('../services/complianceLedger', () => ({
  mmkvDisclosureLedger: { read: jest.fn() },
  mmkvConsentLedger: { getNamedProviderConsent: jest.fn() },
}));
jest.mock('../services/fileCreation', () => ({ EXPORTS_DIR: 'file:///documents/exports/' }));

import { wipeAllLocalData } from '../services/dsarExport';
import { useAuthStore } from '../src/features/auth/store';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  __resetCloudAccountSessionForTests,
} from '../src/features/auth/services/cloudAccountSession';
import { ASK_INTENT_KEYCHAIN_KEY } from '../src/features/siri/askIntentToken';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('local wipe cleanup ordering', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    __resetCloudAccountSessionForTests();
    mockMarkers.clear();
    mockMarkers.set('ask-from-siri-enabled-v1', true);
    mockAuthToken.mockResolvedValue('captured-clerk-token');
    mockGetDeviceId.mockResolvedValue('old-install');
    mockSecureFetch.mockResolvedValue({ ok: true });
    mockClearMmkv.mockImplementation(() => mockMarkers.clear());
    useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: 'account-a' });
    mockClerkInstance = null;
  });

  it('ends every account on the phone instead of handing over to a second one', async () => {
    const signedIn = (id: string, userId: string) => ({
      id,
      status: 'active',
      user: { id: userId, primaryEmailAddress: { emailAddress: `${userId}@example.com` } },
      publicUserData: { identifier: `${userId}@example.com`, userId },
    });
    const first = signedIn('sess_a', 'account-a');
    mockClerkInstance = {
      __internal_environment: { authConfig: { singleSessionMode: false } },
      session: first,
      client: { signedInSessions: [first, signedIn('sess_b', 'account-b')] },
      setActive: (...args: unknown[]) => mockClerkSetActive(...args),
      signOut: (...args: unknown[]) => mockClerkSignOut(...args),
    };

    await wipeAllLocalData();

    expect(mockClerkSetActive).not.toHaveBeenCalled();
    expect(mockClerkSignOut).not.toHaveBeenCalled();
    expect(mockClearAuthSession).toHaveBeenCalledTimes(1);
    const unregister = new URL(mockSecureFetch.mock.calls[0]![0] as string);
    expect(unregister.pathname).toBe('/api/mobile/push-token');
    expect(unregister.searchParams.get('release')).toBeNull();
    expect(mockClearAuthSession.mock.invocationCallOrder[0]).toBeLessThan(
      mockClearMmkv.mock.invocationCallOrder[0]!,
    );
  });

  it.each(['enabled', 'pending'])(
    'retains the old identity and %s Siri marker while auth is deferred',
    async (marker) => {
      if (marker === 'pending') {
        mockMarkers.clear();
        mockMarkers.set('ask-from-siri-pending-revoke-token-v1', 'pending-token');
      }
      const token = deferred<string>();
      const authStarted = deferred<void>();
      mockAuthToken.mockImplementation(() => {
        authStarted.resolve(undefined);
        return token.promise;
      });
      activateCloudAccount('account-a');
      const epoch = captureCloudAccountEpoch();
      const resetIdentity = jest.fn(async () => {
        mockGetDeviceId.mockResolvedValue('new-install');
      });
      const wipe = wipeAllLocalData({ afterPersistentWipe: resetIdentity });
      await authStarted.promise;

      expect(useAuthStore.getState().isClerkSignedIn).toBe(false);
      expect(captureCloudAccountEpoch()).not.toEqual(epoch);
      expect(mockClearCloudState).toHaveBeenCalledTimes(1);
      expect(mockExec).not.toHaveBeenCalled();
      expect(mockClearMmkv).not.toHaveBeenCalled();
      expect(resetIdentity).not.toHaveBeenCalled();
      expect(mockMarkers.size).toBe(1);

      token.resolve('captured-clerk-token');
      await wipe;

      expect(mockAuthToken).toHaveBeenCalledTimes(1);
      expect(mockClearAuthSession).toHaveBeenCalledTimes(1);
      expect(mockSecureFetch).toHaveBeenCalledTimes(2);
      const endpoints = mockSecureFetch.mock.calls.map(([url]) => new URL(url));
      expect(endpoints[0].searchParams.get('deviceId')).toBe('old-install');
      expect(endpoints[1].searchParams.get('installId')).toBe('old-install');
      expect(mockSecureFetch.mock.invocationCallOrder[1]).toBeLessThan(
        mockExec.mock.invocationCallOrder[0],
      );
      expect(mockClearAuthSession.mock.invocationCallOrder[0]).toBeLessThan(
        mockClearMmkv.mock.invocationCallOrder[0],
      );
      expect(mockClearMmkv.mock.invocationCallOrder[0]).toBeLessThan(
        resetIdentity.mock.invocationCallOrder[0],
      );
      expect(resetIdentity).toHaveBeenCalledTimes(1);
      expect(mockDeleteKeychainItem).toHaveBeenCalledWith(
        ASK_INTENT_KEYCHAIN_KEY,
        expect.any(Object),
      );
    },
  );

  it('waits for cleanup completion before deleting persistent data', async () => {
    const response = deferred<{ ok: boolean }>();
    const started = deferred<void>();
    mockSecureFetch.mockImplementationOnce(() => {
      started.resolve(undefined);
      return response.promise;
    });
    const wipe = wipeAllLocalData();
    await started.promise;
    expect(mockExec).not.toHaveBeenCalled();
    expect(mockClearMmkv).not.toHaveBeenCalled();
    response.resolve({ ok: true });
    await wipe;
    expect(mockClearMmkv).toHaveBeenCalledTimes(1);
  });

  it('keeps best-effort cleanup failures from blocking the local wipe', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      mockSecureFetch.mockRejectedValue(new Error('network unavailable'));
      const resetIdentity = jest.fn();
      await wipeAllLocalData({ afterPersistentWipe: resetIdentity });
      expect(mockSecureFetch).toHaveBeenCalledTimes(4);
      expect(mockClearAuthSession).toHaveBeenCalledTimes(1);
      expect(mockDeleteKeychainItem).toHaveBeenCalledTimes(1);
      expect(mockClearMmkv).toHaveBeenCalledTimes(1);
      expect(resetIdentity).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('still clears the local Siri token and wipes when no auth token is available', async () => {
    mockAuthToken.mockResolvedValue(null);
    await wipeAllLocalData();
    expect(mockSecureFetch).not.toHaveBeenCalled();
    expect(mockDeleteKeychainItem).toHaveBeenCalledTimes(1);
    expect(mockClearAuthSession).toHaveBeenCalledTimes(1);
    expect(mockClearMmkv).toHaveBeenCalledTimes(1);
  });

  it('propagates persistent deletion failure without clearing identity or reporting completion', async () => {
    mockExec.mockRejectedValueOnce(new Error('database unavailable'));
    const resetIdentity = jest.fn();
    await expect(wipeAllLocalData({ afterPersistentWipe: resetIdentity })).rejects.toThrow(
      'database unavailable',
    );
    expect(mockClearAuthSession).toHaveBeenCalledTimes(1);
    expect(mockClearMmkv).not.toHaveBeenCalled();
    expect(resetIdentity).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('stops before deleting data if sign-out unexpectedly rejects', async () => {
    const signOutAllAccounts = jest
      .spyOn(useAuthStore.getState(), 'signOutAllAccounts')
      .mockRejectedValueOnce(new Error('teardown failure'));
    try {
      await expect(wipeAllLocalData()).rejects.toThrow('teardown failure');
      expect(signOutAllAccounts).toHaveBeenCalledTimes(1);
      expect(mockExec).not.toHaveBeenCalled();
      expect(mockClearMmkv).not.toHaveBeenCalled();
      expect(mockDeleteFile).not.toHaveBeenCalled();
    } finally {
      signOutAllAccounts.mockRestore();
    }
  });

  it('does not repeat logout if resetting defaults fails after persistent deletion', async () => {
    await expect(
      wipeAllLocalData({
        afterPersistentWipe: async () => {
          throw new Error('reset failure');
        },
      }),
    ).rejects.toThrow('reset failure');
    expect(mockAuthToken).toHaveBeenCalledTimes(1);
    expect(mockClearAuthSession).toHaveBeenCalledTimes(1);
    expect(mockClearMmkv).toHaveBeenCalledTimes(1);
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });
});
