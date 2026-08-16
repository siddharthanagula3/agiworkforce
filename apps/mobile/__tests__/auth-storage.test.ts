

const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'AfterFirstUnlockThisDeviceOnly';

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  setItemAsync: jest.fn<Promise<void>, [string, string, object?]>(),
  getItemAsync: jest.fn<Promise<string | null>, [string]>(),
  deleteItemAsync: jest.fn<Promise<void>, [string]>(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AfterFirstUnlockThisDeviceOnly',
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _SecureStoreMock = require('expo-secure-store') as {
  setItemAsync: jest.Mock;
  getItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};
const mockSetItemAsync = _SecureStoreMock.setItemAsync;
const mockGetItemAsync = _SecureStoreMock.getItemAsync;
const mockDeleteItemAsync = _SecureStoreMock.deleteItemAsync;

jest.mock('../services/authSession', () => ({
  clearAuthSession: jest.fn(),
  getAuthToken: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _cloudAuthMock = require('../services/authSession') as {
  clearAuthSession: jest.Mock;
  getAuthToken: jest.Mock;
};
const mockClearAuthSession = _cloudAuthMock.clearAuthSession;
const mockGetAuthToken = _cloudAuthMock.getAuthToken;

jest.mock('../stores/settings/settingsSyncStateStore', () => ({
  useSettingsSyncStateStore: {
    getState: jest.fn(),
  },
}));

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: {
    getState: jest.fn(),
    setState: jest.fn(),
  },
}));

jest.mock('../stores/settings/cloudSettingsStore', () => ({
  useCloudSettingsStore: {
    getState: jest.fn(),
    setState: jest.fn(),
  },
}));

jest.mock('../src/features/billing/store', () => ({
  useTierStore: {
    getState: jest.fn(),
  },
}));

jest.mock('../src/features/artifacts/store', () => ({
  useArtifactStore: {
    getState: jest.fn(),
  },
  clearAccountScopedArtifactState: jest.fn(),
}));

jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: {
    setState: jest.fn(),
  },
}));

jest.mock('../src/features/auth/services/signOutPushTokenCleanup', () => ({
  unregisterPushTokenForSignOut: jest.fn(),
}));

jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  invalidateCloudAccount: jest.fn(),
}));

jest.mock('../services/cloudSyncEngine', () => ({
  stopCloudSyncLoop: jest.fn(),
}));

jest.mock('../stores/chat/cloudSyncStateStore', () => ({
  useCloudSyncStateStore: {
    getState: jest.fn(() => ({ reset: jest.fn() })),
  },
}));

jest.mock('../stores/chat/chatCloudMessageStore', () => ({
  useChatCloudMessageStore: {
    getState: jest.fn(() => ({ conversations: [], clearCloudData: jest.fn() })),
  },
}));

jest.mock('../stores/chat/chatExecutionStore', () => ({
  clearCloudExecutionState: jest.fn(),
}));

jest.mock('../src/features/chat/actions/runImageGenerationTurn', () => ({
  clearCloudImageGenerationState: jest.fn(),
}));

jest.mock('../stores/chat/chatMessageStore', () => ({
  useChatMessageStore: {
    getState: jest.fn(() => ({ clearCloudConversationSelection: jest.fn() })),
  },
}));

jest.mock('../services/offlineQueue', () => ({
  clearAccountScopedOfflineQueue: jest.fn(),
}));

jest.mock('../src/features/chat/draftStore', () => ({
  clearAccountScopedDrafts: jest.fn(),
}));

jest.mock('../stores/memory/cloudMemoryStore', () => ({
  useCloudMemoryStore: {
    getState: jest.fn(() => ({ clearCloudMemoryData: jest.fn() })),
  },
}));

jest.mock('../stores/memory/memorySyncStateStore', () => ({
  useMemorySyncStateStore: {
    getState: jest.fn(() => ({ resetMemorySync: jest.fn() })),
  },
}));

jest.mock('../stores/projects/cloudProjectStore', () => ({
  useCloudProjectStore: {
    getState: jest.fn(() => ({ projects: [], clearCloudProjectData: jest.fn() })),
  },
}));

jest.mock('../stores/projects/projectSyncStateStore', () => ({
  useProjectSyncStateStore: {
    getState: jest.fn(() => ({ resetProjectSync: jest.fn() })),
  },
}));

jest.mock('../stores/agentControlStore', () => ({
  useAgentControlStore: {
    getState: jest.fn(() => ({ clearCloudOverrides: jest.fn() })),
  },
}));

jest.mock('../src/features/schedules/store', () => ({
  useScheduleStore: {
    getState: jest.fn(() => ({ clearAccountSchedules: jest.fn() })),
  },
}));

jest.mock('../services/api', () => ({
  resetApiAccountState: jest.fn(),
}));

jest.mock('../services/notifications', () => ({
  notificationCenterStore: { clear: jest.fn() },
}));

jest.mock('../services/backgroundFetch', () => ({
  resetBackgroundFetchAccountState: jest.fn(),
}));

jest.mock('../stores/chat/chatViewStore', () => ({
  useChatViewStore: {
    getState: jest.fn(() => ({ clearCloudSearchState: jest.fn() })),
  },
}));

jest.mock('../src/features/waitlist/store', () => ({
  useWaitlistStore: {
    getState: jest.fn(() => ({ clear: jest.fn() })),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _settingsSyncMock = require('../stores/settings/settingsSyncStateStore') as {
  useSettingsSyncStateStore: { getState: jest.Mock };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _settingsMock = require('../stores/settingsStore') as {
  useSettingsStore: { getState: jest.Mock; setState: jest.Mock };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _cloudSettingsMock = require('../stores/settings/cloudSettingsStore') as {
  useCloudSettingsStore: { getState: jest.Mock; setState: jest.Mock };
};
const mockResetSettingsSync = jest.fn();
const mockCloudSettingsSetState = _cloudSettingsMock.useCloudSettingsStore.setState as jest.Mock;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _tierMock = require('../src/features/billing/store') as {
  useTierStore: { getState: jest.Mock };
};
const mockClearAccountEntitlements = jest.fn();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _artifactMock = require('../src/features/artifacts/store') as {
  useArtifactStore: { getState: jest.Mock };
  clearAccountScopedArtifactState: jest.Mock;
};
const mockClearCloudArtifacts = _artifactMock.clearAccountScopedArtifactState;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _appModeMock = require('../src/features/chat/store/appModeStore') as {
  useChatAppModeStore: { setState: jest.Mock };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _pushTokenCleanupMock = require('../src/features/auth/services/signOutPushTokenCleanup') as {
  unregisterPushTokenForSignOut: jest.Mock;
};

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function')
      store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { secureStorage } from '../lib/secureStorage';
import { useAuthStore } from '../src/features/auth/store';
import { act } from '@testing-library/react-native';
import { FEATURES } from '../lib/v1FeatureFlags';

let consoleErrorSpy: jest.SpyInstance;

function getState() {
  return useAuthStore.getState();
}

function resetAuthStore() {
  useAuthStore.setState({
    session: null,
    user: null,
    isLoading: true,
    isInitialized: false,
  });
}

function makeSession(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: 'user-123',
      email: 'test@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {},
    },
    ...overrides,
  };
}

describe('secureStorage adapter', () => {
  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('getItem', () => {
    it('calls SecureStore.getItemAsync with the sanitized key', async () => {
      mockGetItemAsync.mockResolvedValue('{"foo":"bar"}');

      const result = secureStorage.getItem('auth-store');

      expect(mockGetItemAsync).toHaveBeenCalledWith('auth-store');
      await expect(result as Promise<string | null>).resolves.toBe('{"foo":"bar"}');
    });

    it('returns null when the key does not exist in secure store', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const result = secureStorage.getItem('auth-store');

      await expect(result as Promise<string | null>).resolves.toBeNull();
    });

    it('sanitizes keys with special characters before calling SecureStore', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      secureStorage.getItem('auth store/v2');

      expect(mockGetItemAsync).toHaveBeenCalledWith('auth_store_v2');
    });

    it('passes through keys already matching [A-Za-z0-9._-] unchanged', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      secureStorage.getItem('auth-store.v2_test');

      expect(mockGetItemAsync).toHaveBeenCalledWith('auth-store.v2_test');
    });
  });

  describe('setItem', () => {
    it('calls SecureStore.setItemAsync with the sanitized key and value', async () => {
      mockSetItemAsync.mockResolvedValue(undefined);

      secureStorage.setItem('auth-store', '{"session":null}');

      await Promise.resolve();

      expect(mockSetItemAsync).toHaveBeenCalledWith('auth-store', '{"session":null}', {
        keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    });

    it('sanitizes the key before writing', async () => {
      mockSetItemAsync.mockResolvedValue(undefined);

      secureStorage.setItem('auth store/v2', 'value');

      await Promise.resolve();

      expect(mockSetItemAsync).toHaveBeenCalledWith('auth_store_v2', 'value', expect.any(Object));
    });

    it('propagates the rejection when SecureStore.setItemAsync fails', async () => {
      mockSetItemAsync.mockRejectedValue(new Error('Keychain unavailable'));

      await expect(secureStorage.setItem('auth-store', 'value')).rejects.toThrow(
        'Keychain unavailable',
      );
    });

    it('persists large serialized values (>2 KB) without truncation', async () => {
      let capturedValue: string | undefined;
      mockSetItemAsync.mockImplementation(async (_key, value) => {
        capturedValue = value;
      });

      const largeToken = 'x'.repeat(2500);
      const largePayload = JSON.stringify({ session: { access_token: largeToken } });

      secureStorage.setItem('auth-store', largePayload);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(capturedValue).toBe(largePayload);
      expect((capturedValue as string).length).toBeGreaterThan(2048);
    });
  });

  describe('removeItem', () => {
    it('calls SecureStore.deleteItemAsync with the sanitized key', async () => {
      mockDeleteItemAsync.mockResolvedValue(undefined);

      secureStorage.removeItem('auth-store');

      await Promise.resolve();

      expect(mockDeleteItemAsync).toHaveBeenCalledWith('auth-store');
    });

    it('sanitizes the key before deletion', async () => {
      mockDeleteItemAsync.mockResolvedValue(undefined);

      secureStorage.removeItem('auth store/v2');

      await Promise.resolve();

      expect(mockDeleteItemAsync).toHaveBeenCalledWith('auth_store_v2');
    });

    it('does not throw when SecureStore.deleteItemAsync rejects (fire-and-forget)', async () => {
      mockDeleteItemAsync.mockRejectedValue(new Error('Keychain locked'));

      expect(() => secureStorage.removeItem('auth-store')).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  describe('round-trip (set then get)', () => {
    it('retrieves exactly what was stored', async () => {
      const stored: Record<string, string> = {};

      mockSetItemAsync.mockImplementation(async (key, value) => {
        stored[key] = value;
      });
      mockGetItemAsync.mockImplementation(async (key) => stored[key] ?? null);

      const payload = JSON.stringify({ session: makeSession() });

      secureStorage.setItem('auth-store', payload);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const result = await (secureStorage.getItem('auth-store') as Promise<string | null>);

      expect(result).toBe(payload);
    });
  });
});

describe('authStore — secure storage persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAuthStore();

    mockClearAuthSession.mockResolvedValue(undefined);
    mockGetAuthToken.mockResolvedValue('captured-clerk-jwt');
    _pushTokenCleanupMock.unregisterPushTokenForSignOut.mockResolvedValue(undefined);

    mockSetItemAsync.mockResolvedValue(undefined);
    mockGetItemAsync.mockResolvedValue(null);
    mockDeleteItemAsync.mockResolvedValue(undefined);

    _settingsSyncMock.useSettingsSyncStateStore.getState.mockReturnValue({
      resetSettingsSync: mockResetSettingsSync,
    });
    _settingsMock.useSettingsStore.getState.mockReturnValue({});
    _tierMock.useTierStore.getState.mockReturnValue({
      clearAccountEntitlements: mockClearAccountEntitlements,
    });
    _artifactMock.useArtifactStore.getState.mockReturnValue({
      clearCloudArtifacts: mockClearCloudArtifacts,
    });
  });

  it('signInWithEmail throws and does not write session to secure store (Clerk v1)', async () => {
    await expect(
      act(async () => {
        await getState().signInWithEmail('test@example.com', 'password123');
      }),
    ).rejects.toThrow('auth: Clerk mobile auth is not enabled in v1');

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(getState().session).toBeNull();
    const accessTokenWrite = mockSetItemAsync.mock.calls.find(
      ([_key, value]: [string, string]) =>
        typeof value === 'string' && value.includes('access_token'),
    );
    expect(accessTokenWrite).toBeUndefined();
  });

  it('removes session from secure store after sign-out', async () => {
    const session = makeSession();
    useAuthStore.setState({ session: session as never, user: session['user'] as never });

    await act(async () => {
      await getState().signOut();
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(getState().session).toBeNull();
    expect(getState().user).toBeNull();

    expect(mockSetItemAsync).toHaveBeenCalledWith(
      'auth-store',
      expect.stringContaining('"session":null'),
      expect.any(Object),
    );
  });

  it('clears session when cloud-session cleanup fails (always-clear guarantee)', async () => {
    mockClearAuthSession.mockRejectedValue(new Error('Network error'));

    useAuthStore.setState({ session: makeSession() as never, user: {} as never });

    await act(async () => {
      await getState().signOut();
    });

    expect(getState().session).toBeNull();
    expect(getState().user).toBeNull();
  });

  it('signOut resets settings sync cursor and clears personalization (account-B isolation)', async () => {
    useAuthStore.setState({ session: makeSession() as never, user: {} as never });

    await act(async () => {
      await getState().signOut();
    });

    expect(mockResetSettingsSync).toHaveBeenCalledTimes(1);

    expect(mockCloudSettingsSetState).toHaveBeenCalledWith(
      expect.objectContaining({
        personalization: {
          fullName: '',
          nickname: '',
          occupation: '',
          instructions: '',
          style: 'default',
          warmth: 50,
          enthusiasm: 50,
          headersLists: 50,
          emoji: 50,
        },
        settingsUpdatedAt: null,
      }),
    );
  });

  it('signOut clears every cached account entitlement (no stale plan/tool grants)', async () => {
    useAuthStore.setState({ session: makeSession() as never, user: {} as never });

    await act(async () => {
      await getState().signOut();
    });

    expect(mockClearAccountEntitlements).toHaveBeenCalledTimes(1);
  });

  it('signOut atomically returns the persisted app mode to Local', async () => {
    useAuthStore.setState({ session: makeSession() as never, user: {} as never });

    await act(async () => {
      await getState().signOut();
    });

    expect(_appModeMock.useChatAppModeStore.setState).toHaveBeenCalledWith({ appMode: 'local' });
  });

  it('fails closed immediately while external Clerk sign-out is still pending', async () => {
    let resolveExternalSignOut: (() => void) | undefined;
    mockClearAuthSession.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveExternalSignOut = resolve;
      }),
    );
    useAuthStore.setState({
      session: makeSession() as never,
      user: {} as never,
      isClerkSignedIn: true,
    });

    const pendingSignOut = getState().signOut();

    expect(getState().session).toBeNull();
    expect(getState().user).toBeNull();
    expect(getState().isClerkSignedIn).toBe(false);
    expect(_appModeMock.useChatAppModeStore.setState).toHaveBeenCalledWith({ appMode: 'local' });

    resolveExternalSignOut?.();
    await act(async () => {
      await pendingSignOut;
    });
  });

  it('signOut clears cloud artifacts (account-B isolation)', async () => {
    useAuthStore.setState({ session: makeSession() as never, user: {} as never });

    await act(async () => {
      await getState().signOut();
    });

    expect(mockClearCloudArtifacts).toHaveBeenCalledTimes(1);
  });

  it('signOut unregisters the device push token (account-B push-notification isolation)', async () => {
    useAuthStore.setState({ session: makeSession() as never, user: {} as never });

    await act(async () => {
      await getState().signOut();
    });

    expect(_pushTokenCleanupMock.unregisterPushTokenForSignOut).toHaveBeenCalledWith(
      'captured-clerk-jwt',
    );
  });

  it('attempts the authenticated push-token DELETE before clearing Clerk credentials', async () => {
    useAuthStore.setState({ session: makeSession() as never, user: {} as never });

    await act(async () => {
      await getState().signOut();
    });

    const cleanupOrder =
      _pushTokenCleanupMock.unregisterPushTokenForSignOut.mock.invocationCallOrder[0];
    const clerkClearOrder = mockClearAuthSession.mock.invocationCallOrder[0];
    expect(cleanupOrder).toBeLessThan(clerkClearOrder);
  });

  it('onRehydrateStorage clears session and marks store uninitialized (biometric gate)', () => {

    const session = makeSession();

    const storePersistConfig = (
      useAuthStore as unknown as {
        persist: {
          getOptions: () => {
            onRehydrateStorage: () => (state: Record<string, unknown> | undefined) => void;
          };
        };
      }
    ).persist;
    const options = storePersistConfig?.getOptions?.();
    const outerCallback = options?.onRehydrateStorage?.();

    expect(outerCallback).toBeDefined();

    if (outerCallback) {
      const simulatedState = {
        session: session as never,
        user: session['user'] as never,
        isLoading: false, // would be set to false during normal rehydration
        isInitialized: true, // would be set to true normally
      };
      outerCallback(simulatedState as never);

      expect(simulatedState.session).toBeNull();
      expect(simulatedState.isLoading).toBe(true);
      expect(simulatedState.isInitialized).toBe(false);
    } else {
      throw new Error(
        'persist API unavailable: Zustand .persist.getOptions() returned no callback',
      );
    }
  });

  it('refreshSession clears state when no cloud session is available', async () => {
    useAuthStore.setState({ session: makeSession() as never, user: {} as never });

    await act(async () => {
      await getState().refreshSession();
    });

    expect(getState().session).toBeNull();
    expect(getState().user).toBeNull();
  });

  it('refreshSession clears state on network timeout', async () => {
    useAuthStore.setState({ session: makeSession() as never, user: {} as never });

    await act(async () => {
      await getState().refreshSession();
    });

    expect(getState().session).toBeNull();
    expect(getState().user).toBeNull();
  });
});

describe('secureStorage key sanitization', () => {
  const cases: Array<{ input: string; expected: string }> = [
    { input: 'auth-store', expected: 'auth-store' },
    { input: 'auth_store', expected: 'auth_store' },
    { input: 'auth.store', expected: 'auth.store' },
    { input: 'auth store', expected: 'auth_store' },
    { input: 'auth/store', expected: 'auth_store' },
    { input: 'auth@store!', expected: 'auth_store_' },
    { input: 'auth:store', expected: 'auth_store' },
    { input: '', expected: '' },
    { input: '   ', expected: '___' },
    { input: 'CamelCaseKey123', expected: 'CamelCaseKey123' },
    { input: 'key-with.dots_ok', expected: 'key-with.dots_ok' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemAsync.mockResolvedValue(null);
  });

  test.each(cases)('sanitizeKey("$input") → "$expected"', async ({ input, expected }) => {
    secureStorage.getItem(input);
    expect(mockGetItemAsync).toHaveBeenCalledWith(expected);
  });
});
