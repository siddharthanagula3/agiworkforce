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

jest.mock('../src/features/siri/askIntentToken', () => ({
  revokeAskIntentForSignOut: jest.fn(),
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

jest.mock('../src/features/chat/actions/runVideoGenerationTurn', () => ({
  clearCloudVideoGenerationState: jest.fn(),
}));

jest.mock('../stores/chat/chatMessageStore', () => ({
  clearCloudConversationPagination: jest.fn(),
  useChatMessageStore: {
    getState: jest.fn(() => ({ clearCloudConversationSelection: jest.fn() })),
  },
}));

jest.mock('../src/features/model-picker/store', () => ({
  useModelStore: {
    getState: jest.fn(() => ({ selectedModel: 'local-model', setModel: jest.fn() })),
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

import { useAuthStore } from '../src/features/auth/store';
import { act } from '@testing-library/react-native';
import { FEATURES } from '../lib/v1FeatureFlags';
import { revokeAskIntentForSignOut } from '../src/features/siri/askIntentToken';

function getState() {
  return useAuthStore.getState();
}

function resetAuthStore() {
  useAuthStore.setState({
    isLoading: true,
    isInitialized: false,
    isClerkSignedIn: false,
    clerkUserId: null,
  });
}

describe('authStore, secure storage persistence', () => {
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

  it('clears the signed-in account when cloud-session cleanup fails (always-clear guarantee)', async () => {
    mockClearAuthSession.mockRejectedValue(new Error('Network error'));

    useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: 'user-123' });

    await act(async () => {
      await getState().signOut();
    });

    expect(getState().isClerkSignedIn).toBe(false);
    expect(getState().clerkUserId).toBeNull();
  });

  it('signOut resets settings sync cursor and clears personalization (account-B isolation)', async () => {
    useAuthStore.setState({ isClerkSignedIn: true });

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
    useAuthStore.setState({ isClerkSignedIn: true });

    await act(async () => {
      await getState().signOut();
    });

    expect(mockClearAccountEntitlements).toHaveBeenCalledTimes(1);
  });

  it('signOut atomically returns the persisted app mode to Local', async () => {
    useAuthStore.setState({ isClerkSignedIn: true });

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
    useAuthStore.setState({ isClerkSignedIn: true });

    const pendingSignOut = getState().signOut();

    expect(getState().isClerkSignedIn).toBe(false);
    expect(_appModeMock.useChatAppModeStore.setState).toHaveBeenCalledWith({ appMode: 'local' });

    resolveExternalSignOut?.();
    await act(async () => {
      await pendingSignOut;
    });
  });

  it('signOut clears cloud artifacts (account-B isolation)', async () => {
    useAuthStore.setState({ isClerkSignedIn: true });

    await act(async () => {
      await getState().signOut();
    });

    expect(mockClearCloudArtifacts).toHaveBeenCalledTimes(1);
  });

  it('signOut unregisters the device push token (account-B push-notification isolation)', async () => {
    useAuthStore.setState({ isClerkSignedIn: true });

    await act(async () => {
      await getState().signOut();
    });

    expect(_pushTokenCleanupMock.unregisterPushTokenForSignOut).toHaveBeenCalledWith(
      'captured-clerk-jwt',
    );
  });

  it('attempts the authenticated push-token DELETE before clearing Clerk credentials', async () => {
    useAuthStore.setState({ isClerkSignedIn: true });

    await act(async () => {
      await getState().signOut();
    });

    const cleanupOrder =
      _pushTokenCleanupMock.unregisterPushTokenForSignOut.mock.invocationCallOrder[0];
    const clerkClearOrder = mockClearAuthSession.mock.invocationCallOrder[0];
    expect(cleanupOrder).toBeLessThan(clerkClearOrder);
  });

  it('revokes the Siri token with the captured session before clearing Clerk credentials', async () => {
    useAuthStore.setState({ isClerkSignedIn: true });

    await act(async () => {
      await getState().signOut();
    });

    const revoke = jest.mocked(revokeAskIntentForSignOut);
    expect(revoke).toHaveBeenCalledWith('captured-clerk-jwt');
    expect(revoke.mock.invocationCallOrder[0]).toBeLessThan(
      mockClearAuthSession.mock.invocationCallOrder[0],
    );
  });
});
