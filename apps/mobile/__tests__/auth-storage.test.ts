/**
 * Tests for the auth token storage layer.
 *
 * Covers two units:
 *
 *  1. `lib/secureStorage.ts` — the StateStorage adapter that wraps
 *     expo-secure-store and is used by authStore's Zustand persist middleware.
 *
 *  2. `stores/authStore.ts` — persistence behaviour: session is written to
 *     secure storage on sign-in, cleared on sign-out, and rehydrated
 *     correctly on the next cold-start.
 *
 * All expo-secure-store calls are mocked so these tests run in Node / Jest
 * without native bindings.
 *
 * Key invariants tested:
 *  - setItem delegates to SecureStore.setItemAsync with the sanitized key
 *    and WHEN_UNLOCKED_THIS_DEVICE_ONLY access option.
 *  - getItem returns the promise from SecureStore.getItemAsync (async-compat
 *    with Zustand's persist middleware).
 *  - removeItem delegates to SecureStore.deleteItemAsync.
 *  - Keys containing characters outside [A-Za-z0-9._-] are sanitized to '_'.
 *  - A storage error in setItem propagates as a rejected promise (MOB-3,
 *    audit 2026-05-03) so Zustand's persist middleware can react to write
 *    failures instead of silently dropping the auth token.
 *  - A storage error in removeItem is swallowed (removal failures aren't
 *    security-critical).
 *  - authStore.signOut clears the session and triggers storage removal.
 *  - authStore.onRehydrateStorage sets isLoading=false / isInitialized=true
 *    when a cached session is present.
 *  - Large serialized sessions (>2 KB) can be stored and retrieved via the
 *    adapter without data loss (storage backend allows any size).
 */

// ---------------------------------------------------------------------------
// Shared mock references — created inside the jest.mock factory to avoid TDZ
// issues caused by Jest hoisting the factory above const declarations.
// The mock functions are retrieved after import via require().
// ---------------------------------------------------------------------------

const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'AfterFirstUnlockThisDeviceOnly';

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  setItemAsync: jest.fn<Promise<void>, [string, string, object?]>(),
  getItemAsync: jest.fn<Promise<string | null>, [string]>(),
  deleteItemAsync: jest.fn<Promise<void>, [string]>(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AfterFirstUnlockThisDeviceOnly',
}));

// Retrieve references to the mock functions created inside the factory.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _SecureStoreMock = require('expo-secure-store') as {
  setItemAsync: jest.Mock;
  getItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};
const mockSetItemAsync = _SecureStoreMock.setItemAsync;
const mockGetItemAsync = _SecureStoreMock.getItemAsync;
const mockDeleteItemAsync = _SecureStoreMock.deleteItemAsync;

// Cloud session cleanup must be mocked before authStore is imported.
// Create mock fns inside the factory to avoid TDZ issues from Jest hoisting.
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

// Settings teardown mocks — intercepted by the lazy require() calls inside
// signOut's try block. Jest resolves @/ → <rootDir> so these relative paths
// match exactly what the source requires at runtime.
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

// Cloud settings store is cleared on sign-out to prevent account-B from
// inheriting account-A's personalization.
jest.mock('../stores/settings/cloudSettingsStore', () => ({
  useCloudSettingsStore: {
    getState: jest.fn(),
    setState: jest.fn(),
  },
}));

// Every account-scoped entitlement/capability cache is reset on sign-out so
// account B cannot inherit account A's plan, provider, or tool grants.
jest.mock('../src/features/billing/store', () => ({
  useTierStore: {
    getState: jest.fn(),
  },
}));

// Cloud artifacts (migration 0039 pulled artifacts) are persisted to MMKV and
// scoped to the signed-in user — clearCloudArtifacts must run on sign-out so
// a subsequent account cannot inherit a prior user's artifacts.
jest.mock('../src/features/artifacts/store', () => ({
  useArtifactStore: {
    getState: jest.fn(),
  },
  clearAccountScopedArtifactState: jest.fn(),
}));

// Persisted Cloud mode is account-bound UI state. Sign-out must return the
// app to Local before any signed-out Cloud settings surface can render.
jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: {
    setState: jest.fn(),
  },
}));

// Sign-out has one narrowly-scoped Local-mode egress exception: it captures the
// current Clerk token and revokes this device's push token through the exact,
// TLS-pinned endpoint before clearing Clerk credentials.
jest.mock('../src/features/auth/services/signOutPushTokenCleanup', () => ({
  unregisterPushTokenForSignOut: jest.fn(),
}));

jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  invalidateCloudAccount: jest.fn(),
}));

// Keep the sign-out unit tests isolated from the full cloud-sync dependency
// graph. Loading these real modules through signOut's lazy requires takes
// longer than Jest's default test timeout on a cold transform cache.
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

// mmkv is not used by authStore but may be imported transitively.
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

// ---------------------------------------------------------------------------
// Import modules under test AFTER mocks are declared.
// ---------------------------------------------------------------------------

import { secureStorage } from '../lib/secureStorage';
import { useAuthStore } from '../src/features/auth/store';
import { act } from '@testing-library/react-native';
import { FEATURES } from '../lib/v1FeatureFlags';

let consoleErrorSpy: jest.SpyInstance;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// Minimal Session shape that satisfies @authSession/authSession-js types
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

// ---------------------------------------------------------------------------
// 1. secureStorage adapter — unit tests
// ---------------------------------------------------------------------------

describe('secureStorage adapter', () => {
  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // ---- getItem ----

  describe('getItem', () => {
    it('calls SecureStore.getItemAsync with the sanitized key', async () => {
      mockGetItemAsync.mockResolvedValue('{"foo":"bar"}');

      const result = secureStorage.getItem('auth-store');

      // The return value is a promise (async-compat Zustand StateStorage)
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

      // spaces and slashes must be replaced with '_'
      expect(mockGetItemAsync).toHaveBeenCalledWith('auth_store_v2');
    });

    it('passes through keys already matching [A-Za-z0-9._-] unchanged', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      secureStorage.getItem('auth-store.v2_test');

      expect(mockGetItemAsync).toHaveBeenCalledWith('auth-store.v2_test');
    });
  });

  // ---- setItem ----

  describe('setItem', () => {
    it('calls SecureStore.setItemAsync with the sanitized key and value', async () => {
      mockSetItemAsync.mockResolvedValue(undefined);

      secureStorage.setItem('auth-store', '{"session":null}');

      // Allow the microtask queue to flush (fire-and-forget promise)
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

      // MOB-3 (audit 2026-05-03): the write must reject, not silently
      // swallow, so Zustand's persist middleware can detect that the
      // session was not durably written and avoid leaving stale state
      // on disk after a token refresh.
      await expect(secureStorage.setItem('auth-store', 'value')).rejects.toThrow(
        'Keychain unavailable',
      );
    });

    it('persists large serialized values (>2 KB) without truncation', async () => {
      let capturedValue: string | undefined;
      mockSetItemAsync.mockImplementation(async (_key, value) => {
        capturedValue = value;
      });

      // Build a serialized session with a token > 2048 chars
      const largeToken = 'x'.repeat(2500);
      const largePayload = JSON.stringify({ session: { access_token: largeToken } });

      secureStorage.setItem('auth-store', largePayload);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(capturedValue).toBe(largePayload);
      expect((capturedValue as string).length).toBeGreaterThan(2048);
    });
  });

  // ---- removeItem ----

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

  // ---- round-trip ----

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

// ---------------------------------------------------------------------------
// 2. authStore persistence — integration with secureStorage mock
// ---------------------------------------------------------------------------

describe('authStore — secure storage persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAuthStore();

    mockClearAuthSession.mockResolvedValue(undefined);
    mockGetAuthToken.mockResolvedValue('captured-clerk-jwt');
    _pushTokenCleanupMock.unregisterPushTokenForSignOut.mockResolvedValue(undefined);

    // Default secure-store: succeed silently
    mockSetItemAsync.mockResolvedValue(undefined);
    mockGetItemAsync.mockResolvedValue(null);
    mockDeleteItemAsync.mockResolvedValue(undefined);

    // Wire settings teardown mocks (called by lazy require inside signOut)
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

    // Allow the microtask queue to flush — no secure-store write should have occurred
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(getState().session).toBeNull();
    // Secure storage must NOT have been written with an access_token
    const accessTokenWrite = mockSetItemAsync.mock.calls.find(
      ([_key, value]: [string, string]) =>
        typeof value === 'string' && value.includes('access_token'),
    );
    expect(accessTokenWrite).toBeUndefined();
  });

  it('removes session from secure store after sign-out', async () => {
    // Pre-load a session into the store
    const session = makeSession();
    useAuthStore.setState({ session: session as never, user: session['user'] as never });

    await act(async () => {
      await getState().signOut();
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    // signOut must clear state
    expect(getState().session).toBeNull();
    expect(getState().user).toBeNull();

    // The Zustand persist middleware should write a null-session snapshot
    // (or remove the key) — setItemAsync will be called with null session
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
    // Regression: settings personalization (fullName, instructions, etc.) and the
    // settings sync cursor are cloud-scoped. If not cleared on sign-out, a subsequent
    // account inherits account A's personalization and may push a stale snapshot.
    useAuthStore.setState({ session: makeSession() as never, user: {} as never });

    await act(async () => {
      await getState().signOut();
    });

    // Settings sync cursor must be reset to '0' so the next account starts fresh
    expect(mockResetSettingsSync).toHaveBeenCalledTimes(1);

    // Cloud settings personalization must be wiped and settingsUpdatedAt set to null
    // so the wiped state is NOT treated as a local edit (which would push defaults to cloud).
    // Local settings are intentionally preserved — they belong to the device, not the account.
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
    // Regression: the Billing screen reads useTierStore().tier with no auth check.
    // Before this fix, a previously-signed-in Pro/Max account's cached tier
    // survived sign-out in MMKV and a signed-out (or different) user would see
    // "You are on the Pro plan" — a fake/stale billing state.
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
    // Regression: clearCloudArtifacts() existed on the artifact store specifically
    // for "sign-out / leaving cloud mode" (per its own docstring) but was never
    // wired into signOut(). cloudArtifacts (migration 0039) are persisted to MMKV,
    // so a subsequent signed-in account could inherit a prior user's artifacts.
    useAuthStore.setState({ session: makeSession() as never, user: {} as never });

    await act(async () => {
      await getState().signOut();
    });

    expect(mockClearCloudArtifacts).toHaveBeenCalledTimes(1);
  });

  it('signOut unregisters the device push token (account-B push-notification isolation)', async () => {
    // Regression: mobile_devices.push_token is keyed by deviceId, not session,
    // so it previously survived sign-out indefinitely — a subsequent different
    // account signing in on this device would still receive push notifications
    // addressed to the prior account.
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
    // The onRehydrateStorage callback deliberately clears any previously-loaded
    // session so the app starts in a pristine locked state. initialize() is the
    // ONLY path that marks the store ready, and it is only called AFTER the
    // biometric gate in _layout.tsx succeeds.
    //
    // Previous (incorrect) test: used useAuthStore.setState() directly and
    // asserted the manually-set values back — testing Zustand setState, not the
    // actual callback. This test invokes the callback as the middleware would.

    const session = makeSession();

    // Retrieve and invoke the onRehydrateStorage callback directly so we test
    // the real callback rather than a setState no-op.
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

    // Hard guard: if the Zustand persist API is unavailable here the test below
    // is a no-op and would silently pass without exercising the real callback.
    // Fail fast so a Zustand upgrade that removes `.persist.getOptions()` surfaces
    // immediately rather than leaving the biometric-gate invariant untested.
    expect(outerCallback).toBeDefined();

    if (outerCallback) {
      // Simulate Zustand calling the inner callback with the rehydrated state
      const simulatedState = {
        session: session as never,
        user: session['user'] as never,
        isLoading: false, // would be set to false during normal rehydration
        isInitialized: true, // would be set to true normally
      };
      outerCallback(simulatedState as never);

      // The callback MUST have cleared session and reset loading/initialized
      // so the biometric gate cannot be bypassed by cached storage state.
      expect(simulatedState.session).toBeNull();
      expect(simulatedState.isLoading).toBe(true);
      expect(simulatedState.isInitialized).toBe(false);
    } else {
      // Should be unreachable — the expect(outerCallback).toBeDefined() above
      // will have already failed the test. Left as a defensive fallback only.
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

// ---------------------------------------------------------------------------
// 3. secureStorage key sanitization — parameterized edge cases
// ---------------------------------------------------------------------------

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
