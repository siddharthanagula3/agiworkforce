import React from 'react';
import { act, render } from '@testing-library/react-native';

jest.mock('../global.css', () => ({}));
jest.mock('../app/error', () => ({ default: () => null }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('expo', () => ({ reloadAppAsync: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-crypto', () => ({ getRandomBytes: jest.fn() }));
jest.mock('expo-linking', () => ({
  getLinkingURL: () => null,
  addEventListener: () => ({ remove: jest.fn() }),
  parse: jest.fn(),
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@agiworkforce/utils/uuidv7', () => ({ setUuidV7RandomSource: jest.fn() }));
jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy({}, { get: () => () => <View /> });
});
jest.mock('expo-router', () => ({
  Slot: () => null,
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useSegments: () => [],
}));

const mockGetToken = jest.fn();
let mockClerk: {
  isLoaded: boolean;
  isSignedIn?: boolean;
  userId?: string | null;
  getToken: jest.Mock;
} = { isLoaded: false, getToken: mockGetToken };
jest.mock('@clerk/expo', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockClerk,
}));
jest.mock('@clerk/expo/token-cache', () => ({ tokenCache: {} }));
jest.mock('../src/integrations/clerk', () => ({
  CLERK_LOAD_SETTLE_MS: 8_000,
  CLERK_NATIVE_AUTH_OPTIONS: {},
  CLERK_PUBLISHABLE_KEY: 'fixture-key',
  holdTokensUntilClerkAnswers: jest.fn(),
  setClerkTokenMinter: jest.fn(),
}));

const mockStored = new Map<string, string>();
jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStored?.get(key),
    set: (key: string, value: string) => mockStored.set(key, value),
    delete: (key: string) => mockStored.delete(key),
  },
  initMmkvEncryption: jest.fn().mockResolvedValue(undefined),
  mmkvStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: (callback: () => void) => callback(),
}));
jest.mock('../src/features/siri/askIntentToken', () => ({
  isAskFromSiriEnabled: () => false,
  disableAskFromSiri: jest.fn().mockResolvedValue(undefined),
  forgetAskFromSiriOnDevice: jest.fn().mockResolvedValue(undefined),
  revokeForgottenAskFromSiri: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/i18n', () => ({
  restoreStoredLanguage: jest.fn().mockResolvedValue({ directionChanged: false }),
}));
jest.mock('../lib/biometricFlagStore', () => ({
  clearBiometricFlag: jest.fn().mockResolvedValue(undefined),
  hydrateBiometricFlag: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/features/auth/hooks/useBiometricGate', () => ({
  useBiometricGate: () => ({
    isUnlocked: true,
    isCovered: false,
    isReady: true,
    authenticate: jest.fn(),
  }),
}));

function mockNotifyAuth() {
  jest
    .requireMock<{ useAuthStore: { notify: () => void } }>('../src/features/auth/store')
    .useAuthStore.notify();
}
const mockAuthState = {
  isLoading: false,
  isInitialized: true,
  initialize: jest.fn(),
  isClerkSignedIn: false,
  clerkUserId: null as string | null,
  isClerkLoaded: false,
  setClerkSignedIn: (value: boolean) => {
    mockAuthState.isClerkSignedIn = value;
    mockNotifyAuth();
  },
  setClerkUserId: (value: string | null) => {
    mockAuthState.clerkUserId = value;
    mockNotifyAuth();
  },
  setClerkLoaded: (value: boolean) => {
    mockAuthState.isClerkLoaded = value;
  },
};
jest.mock('../src/features/auth/store', () => {
  const listeners = new Set<() => void>();
  return {
    useAuthStore: Object.assign(
      (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
      {
        getState: () => mockAuthState,
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        notify: () => listeners.forEach((listener) => listener()),
      },
    ),
  };
});

let mockTerms: { userId: string | null; status: string } = { userId: null, status: 'idle' };
const mockTermsActions = { reset: jest.fn(), verify: jest.fn() };
jest.mock('../src/features/auth/store/termsAcceptanceStore', () => ({
  isTermsAnswerPending: (terms: { userId: string | null; status: string }, userId: string) =>
    terms.userId !== userId || terms.status === 'idle' || terms.status === 'checking',
  useTermsAcceptanceStore: Object.assign(
    (selector: (state: typeof mockTerms) => unknown) => selector(mockTerms),
    { getState: () => mockTermsActions },
  ),
}));

type MockEligibility = { userId: string | null; status: string };
let mockEligibilityOverride: MockEligibility | null = null;
const mockEligibility = (): MockEligibility =>
  mockEligibilityOverride ?? { userId: mockTerms.userId, status: 'confirmed' };
const mockEligibilityActions = { reset: jest.fn(), verify: jest.fn() };
jest.mock('../src/features/auth/store/adultEligibilityStore', () => ({
  isAdultEligibilityAnswerPending: (eligibility: MockEligibility, userId: string) =>
    eligibility.userId !== userId ||
    eligibility.status === 'idle' ||
    eligibility.status === 'checking',
  isAdultEligibilityConfirmed: (eligibility: MockEligibility, userId: string | null) =>
    Boolean(userId) && eligibility.userId === userId && eligibility.status === 'confirmed',
  adultEligibilityNeedsAnswer: (eligibility: MockEligibility, userId: string | null) =>
    Boolean(userId) &&
    eligibility.userId === userId &&
    ['age_required', 'ineligible', 'error'].includes(eligibility.status),
  useAdultEligibilityStore: Object.assign(
    (selector: (state: MockEligibility) => unknown) => selector(mockEligibility()),
    { getState: () => mockEligibilityActions },
  ),
}));

const mockWaitlistState = { setCloudAccess: jest.fn(), cloudUnlocked: true };
jest.mock('../src/features/waitlist/store', () => ({
  useWaitlistStore: Object.assign(
    (selector: (state: typeof mockWaitlistState) => unknown) => selector(mockWaitlistState),
    { getState: () => mockWaitlistState },
  ),
}));
const mockTierState = { refreshTier: jest.fn().mockResolvedValue(false), tier: 'pro' };
jest.mock('../src/features/billing/store', () => ({
  useTierStore: Object.assign(
    (selector: (state: typeof mockTierState) => unknown) => selector(mockTierState),
    { getState: () => mockTierState },
  ),
}));
jest.mock('../stores/settings/localSettingsStore', () => ({
  useLocalSettingsStore: (selector: (state: Record<string, string>) => unknown) =>
    selector({ themeMode: 'dark', accentColor: 'neutral' }),
}));
jest.mock('../stores/settings/cloudSettingsStore', () => ({
  useCloudSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ themeMode: 'dark', accentColor: 'neutral', notificationsEnabled: false }),
}));
jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { backgroundFetchEnabled: boolean }) => unknown) =>
    selector({ backgroundFetchEnabled: false }),
}));
jest.mock('../src/features/rollout', () => ({
  refreshRolloutRings: jest.fn(),
  useRolloutStore: { getState: () => ({ clear: jest.fn() }) },
}));

let mockRecordedOwner: string | null = null;
jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  activateCloudAccount: jest.fn((ownerId: string) => ({
    ownerId,
    previousOwnerId: ownerId,
    changed: false,
  })),
  hasCloudAccountOwner: () => mockRecordedOwner !== null,
  invalidateCloudAccount: jest.fn(),
  recordedCloudAccountOwnerId: () => mockRecordedOwner,
  subscribeCloudAccountEpochChange: () => () => undefined,
}));
jest.mock('../src/features/auth/services/cloudAccountTeardown', () => ({
  clearLocalCloudAccountState: jest.fn(),
}));
jest.mock('../src/features/auth/services/endedSession', () => ({
  isSignInOwedForEndedSession: jest.fn(() => false),
  oweSignInForEndedSession: jest.fn(),
  settleSignInForEndedSession: jest.fn(),
}));
jest.mock('../src/features/auth/hooks/usePushTokenAccountRegistration', () => ({
  usePushTokenAccountRegistration: jest.fn(),
}));
jest.mock('../src/features/auth/components/AccountSecurityVerificationPrompt', () => ({
  AccountSecurityVerificationPrompt: () => null,
}));
jest.mock('../src/features/auth/services/postAuthIntent', () => ({
  beginCloudPostAuthIntent: jest.fn(),
  clearPendingIntentLink: jest.fn(),
  clearPostAuthIntent: jest.fn(),
  consumePendingIntentLink: jest.fn(),
  consumePostAuthDestination: jest.fn(),
  stagePendingIntentLink: jest.fn(),
}));
jest.mock('../src/features/auth/actions/postAuthIntent', () => ({
  completePendingPostAuthIntentForLoadedSession: jest.fn(),
}));
jest.mock('../src/features/auth/services/ageGate', () => ({ isAgeGateConfirmed: jest.fn() }));
jest.mock('../src/features/auth/services/rootRouting', () => ({
  CLOUD_SIGN_IN_RETURN_PATH: '/',
  resolveRootRedirect: jest.fn(() => null),
}));
jest.mock('../src/features/auth/services/accountAddition', () => ({
  isCloudAccountAdditionOpenFor: jest.fn(() => false),
}));
jest.mock('../src/features/age-assurance/appTransaction', () => ({
  registerAppTransactionForAccount: jest.fn(),
}));
jest.mock('../src/features/share-preview/iosShareInbox', () => ({
  subscribeToIOSShareInbox: jest.fn(),
}));
jest.mock('../src/features/share-preview/sharedAttachments', () => ({
  parseSharedFilesParam: jest.fn(),
  stagedIntentFileUri: jest.fn(),
  stageSharedFileAttachments: jest.fn(),
}));
jest.mock('../src/features/edge-cases/components/OfflineBanner', () => ({
  OfflineBanner: () => null,
}));
jest.mock('../src/features/edge-cases/components/CloudSyncErrorNotice', () => ({
  CloudSyncErrorNotice: () => null,
}));
jest.mock('../src/shared/components/Toast', () => ({ ToastHost: () => null }));
jest.mock('../src/shared/components/TextScaleBoundary', () => ({
  TextScaleBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../src/shared/hooks/useLaunchSplash', () => ({
  holdLaunchSplash: jest.fn(),
  useLaunchSplashRelease: jest.fn(),
}));
jest.mock('../src/features/model-picker/useLocalModelMemoryRelease', () => ({
  useLocalModelMemoryRelease: jest.fn(),
}));
jest.mock('../src/integrations/universalLinks', () => ({
  isAgiWorkforceUniversalLinkHost: jest.fn(() => false),
}));
jest.mock('../src/lib/Capabilities', () => ({
  CapabilityProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../services/cloudSyncEngine', () => ({
  startCloudSyncLoop: jest.fn(),
  stopCloudSyncLoop: jest.fn(),
  syncNow: jest.fn(),
}));
jest.mock('../services/authSession', () => ({ clearAuthSession: jest.fn() }));
jest.mock('../services/notifications', () => ({
  setupNotificationListeners: jest.fn(),
  handleInitialNotification: jest.fn().mockResolvedValue(undefined),
  setNavigatorReady: jest.fn(),
  setPushTypeReceivedListener: jest.fn(),
  setSignedIn: jest.fn(),
}));
jest.mock('../services/backgroundFetch', () => ({
  registerBackgroundFetch: jest.fn(),
  unregisterBackgroundFetch: jest.fn(),
}));

import { Alert } from 'react-native';
import RootLayout from '../app/_layout';
import {
  CLOUD_PROVIDER_CONSENT_ALLOW_LABEL,
  CLOUD_PROVIDER_CONSENT_DECLINE_LABEL,
  CLOUD_PROVIDER_CONSENT_KEY,
  cloudAiProviders,
} from '../services/providerConsent';
import { registerAppTransactionForAccount } from '../src/features/age-assurance/appTransaction';
import { invalidateCloudAccount } from '../src/features/auth/services/cloudAccountSession';
import { clearLocalCloudAccountState } from '../src/features/auth/services/cloudAccountTeardown';
import { refreshRolloutRings } from '../src/features/rollout';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import {
  __resetCloudModeFallbackForTests,
  fallBackToLocalMode,
} from '../src/features/chat/store/cloudModeFallback';

const appMode = () => useChatAppModeStore.getState().appMode;
const mockRegisterAppTransaction = registerAppTransactionForAccount as jest.Mock;
const mockRefreshRolloutRings = refreshRolloutRings as jest.Mock;

function storeSharingRecordFor(ownerId: string) {
  mockStored.set(
    CLOUD_PROVIDER_CONSENT_KEY,
    JSON.stringify({
      accepted: true,
      acceptedAt: '2026-11-01T00:00:00.000Z',
      ownerId,
      providerIds: cloudAiProviders().map((provider) => provider.id),
      surface: 'mobile',
    }),
  );
}

async function launch() {
  const screen = render(<RootLayout />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return screen;
}

function settleWindowEnds() {
  act(() => {
    jest.advanceTimersByTime(8_000);
  });
}

function chatTabReadsSession() {
  if (appMode() === 'cloud' && mockAuthState.isClerkLoaded && !mockAuthState.isClerkSignedIn) {
    fallBackToLocalMode();
  }
}

function clerkAnswers(
  screen: Awaited<ReturnType<typeof launch>>,
  clerk: { isSignedIn: boolean; userId?: string },
  terms?: { userId: string; status: string },
) {
  mockClerk = { isLoaded: true, getToken: mockGetToken, ...clerk };
  if (terms) mockTerms = terms;
  act(() => {
    screen.rerender(<RootLayout />);
  });
}

describe('a Cloud session that answers after the settle window', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetCloudModeFallbackForTests();
    mockStored.clear();
    mockRecordedOwner = 'person-a';
    storeSharingRecordFor('person-a');
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockClerk = { isLoaded: false, getToken: mockGetToken };
    mockTerms = { userId: null, status: 'idle' };
    mockEligibilityOverride = null;
    mockEligibilityActions.verify.mockClear();
    mockAuthState.isClerkSignedIn = false;
    mockAuthState.clerkUserId = null;
    mockAuthState.isClerkLoaded = false;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('the account’s age answer', () => {
    it('keeps Cloud closed while the age check is out, then opens it once confirmed', async () => {
      mockEligibilityOverride = { userId: 'person-a', status: 'checking' };
      const screen = await launch();

      clerkAnswers(
        screen,
        { isSignedIn: true, userId: 'person-a' },
        { userId: 'person-a', status: 'accepted' },
      );
      expect(mockAuthState.isClerkSignedIn).toBe(false);

      mockEligibilityOverride = { userId: 'person-a', status: 'confirmed' };
      clerkAnswers(screen, { isSignedIn: true, userId: 'person-a' });
      expect(mockAuthState.isClerkSignedIn).toBe(true);
    });

    it.each(['ineligible', 'age_required', 'error'])(
      'keeps Cloud closed for an account whose age answer is %s',
      async (status) => {
        mockEligibilityOverride = { userId: 'person-a', status };
        const screen = await launch();

        clerkAnswers(
          screen,
          { isSignedIn: true, userId: 'person-a' },
          { userId: 'person-a', status: 'accepted' },
        );
        settleWindowEnds();
        chatTabReadsSession();

        expect(mockAuthState.isClerkSignedIn).toBe(false);
        expect(mockWaitlistState.setCloudAccess).not.toHaveBeenLastCalledWith(true);
        expect(appMode()).toBe('local');
      },
    );

    it('runs the check again when the signed-in account changes', async () => {
      mockEligibilityOverride = { userId: 'person-a', status: 'confirmed' };
      const screen = await launch();

      clerkAnswers(
        screen,
        { isSignedIn: true, userId: 'person-a' },
        { userId: 'person-a', status: 'accepted' },
      );
      expect(mockEligibilityActions.verify).not.toHaveBeenCalled();
      expect(mockAuthState.isClerkSignedIn).toBe(true);

      clerkAnswers(
        screen,
        { isSignedIn: true, userId: 'person-b' },
        { userId: 'person-b', status: 'accepted' },
      );

      expect(mockEligibilityActions.verify).toHaveBeenCalledWith('person-b');
      expect(mockAuthState.isClerkSignedIn).toBe(false);
    });

    it('runs the check on every launch, so a new app version checks again', async () => {
      mockEligibilityOverride = { userId: null, status: 'idle' };
      mockClerk = { isLoaded: true, isSignedIn: true, userId: 'person-a', getToken: mockGetToken };
      mockTerms = { userId: 'person-a', status: 'accepted' };

      await launch();

      expect(mockEligibilityActions.verify).toHaveBeenCalledWith('person-a');
      expect(mockAuthState.isClerkSignedIn).toBe(false);
    });
  });

  it('returns to Cloud when Clerk loads late and confirms the same account', async () => {
    const screen = await launch();
    settleWindowEnds();
    expect(mockAuthState).toMatchObject({ isClerkLoaded: true, isClerkSignedIn: false });
    chatTabReadsSession();
    expect(appMode()).toBe('local');

    clerkAnswers(
      screen,
      { isSignedIn: true, userId: 'person-a' },
      { userId: 'person-a', status: 'checking' },
    );
    expect(appMode()).toBe('local');

    clerkAnswers(
      screen,
      { isSignedIn: true, userId: 'person-a' },
      { userId: 'person-a', status: 'accepted' },
    );
    expect(mockAuthState.isClerkSignedIn).toBe(true);
    expect(appMode()).toBe('cloud');
  });

  it('returns to Cloud when a slow Terms answer accepts for the same account', async () => {
    mockClerk = { isLoaded: true, isSignedIn: true, userId: 'person-a', getToken: mockGetToken };
    mockTerms = { userId: 'person-a', status: 'checking' };
    const screen = await launch();
    expect(mockAuthState.isClerkLoaded).toBe(false);
    settleWindowEnds();
    chatTabReadsSession();
    expect(appMode()).toBe('local');

    clerkAnswers(
      screen,
      { isSignedIn: true, userId: 'person-a' },
      { userId: 'person-a', status: 'accepted' },
    );
    expect(appMode()).toBe('cloud');
  });

  it('stays in Local when the person chose a mode during the gap', async () => {
    const screen = await launch();
    settleWindowEnds();
    chatTabReadsSession();
    act(() => useChatAppModeStore.getState().setAppMode('local'));

    clerkAnswers(
      screen,
      { isSignedIn: true, userId: 'person-a' },
      { userId: 'person-a', status: 'accepted' },
    );
    expect(mockAuthState.isClerkSignedIn).toBe(true);
    expect(appMode()).toBe('local');
  });

  it('stays in Local when a different account confirms', async () => {
    const screen = await launch();
    settleWindowEnds();
    chatTabReadsSession();

    clerkAnswers(
      screen,
      { isSignedIn: true, userId: 'person-b' },
      { userId: 'person-b', status: 'accepted' },
    );
    expect(mockAuthState.isClerkSignedIn).toBe(true);
    expect(appMode()).toBe('local');
  });

  it('clears the recorded account when another account answers while its Terms are being checked', async () => {
    (invalidateCloudAccount as jest.Mock).mockClear();
    (clearLocalCloudAccountState as jest.Mock).mockClear();
    mockClerk = { isLoaded: true, isSignedIn: true, userId: 'person-b', getToken: mockGetToken };
    mockTerms = { userId: 'person-b', status: 'checking' };

    await launch();

    expect(mockAuthState.isClerkSignedIn).toBe(false);
    expect(invalidateCloudAccount).toHaveBeenCalled();
    expect(clearLocalCloudAccountState).toHaveBeenCalled();
  });

  it('keeps the recorded account while its own Terms are being checked', async () => {
    (invalidateCloudAccount as jest.Mock).mockClear();
    (clearLocalCloudAccountState as jest.Mock).mockClear();
    mockClerk = { isLoaded: true, isSignedIn: true, userId: 'person-a', getToken: mockGetToken };
    mockTerms = { userId: 'person-a', status: 'checking' };

    await launch();

    expect(invalidateCloudAccount).not.toHaveBeenCalled();
    expect(clearLocalCloudAccountState).not.toHaveBeenCalled();
  });

  it('stays in Local when the late answer is signed out, even after a later sign-in', async () => {
    const screen = await launch();
    settleWindowEnds();
    chatTabReadsSession();

    clerkAnswers(screen, { isSignedIn: false });
    expect(appMode()).toBe('local');

    clerkAnswers(
      screen,
      { isSignedIn: true, userId: 'person-a' },
      { userId: 'person-a', status: 'accepted' },
    );
    expect(appMode()).toBe('local');
  });

  it('stays in Local when the late answer is that Terms are required', async () => {
    const screen = await launch();
    settleWindowEnds();
    chatTabReadsSession();

    clerkAnswers(
      screen,
      { isSignedIn: true, userId: 'person-a' },
      { userId: 'person-a', status: 'required' },
    );
    expect(mockAuthState).toMatchObject({ isClerkLoaded: true, isClerkSignedIn: false });
    expect(appMode()).toBe('local');

    clerkAnswers(
      screen,
      { isSignedIn: true, userId: 'person-a' },
      { userId: 'person-a', status: 'accepted' },
    );
    expect(appMode()).toBe('local');
  });

  it('ends a signed-out start in Local and does not return to Cloud on a later sign-in', async () => {
    mockClerk = { isLoaded: true, isSignedIn: false, getToken: mockGetToken };
    const screen = await launch();
    expect(mockAuthState).toMatchObject({ isClerkLoaded: true, isClerkSignedIn: false });
    chatTabReadsSession();
    expect(appMode()).toBe('local');

    clerkAnswers(
      screen,
      { isSignedIn: true, userId: 'person-a' },
      { userId: 'person-a', status: 'accepted' },
    );
    expect(appMode()).toBe('local');
  });

  describe('when the app tree unmounts and mounts again in the same process', () => {
    async function signedInThenRemounted() {
      mockClerk = { isLoaded: true, isSignedIn: true, userId: 'person-a', getToken: mockGetToken };
      mockTerms = { userId: 'person-a', status: 'accepted' };
      const first = await launch();
      expect(mockAuthState).toMatchObject({ isClerkLoaded: true, isClerkSignedIn: true });
      expect(appMode()).toBe('cloud');

      first.unmount();
      expect(mockAuthState.isClerkLoaded).toBe(false);
      chatTabReadsSession();
      expect(appMode()).toBe('cloud');

      mockClerk = { isLoaded: false, getToken: mockGetToken };
      const second = await launch();
      chatTabReadsSession();
      expect(appMode()).toBe('cloud');
      return second;
    }

    it('stays in Cloud while Clerk reloads and after it confirms the same account', async () => {
      const screen = await signedInThenRemounted();

      clerkAnswers(
        screen,
        { isSignedIn: true, userId: 'person-a' },
        { userId: 'person-a', status: 'accepted' },
      );
      chatTabReadsSession();
      expect(mockAuthState).toMatchObject({ isClerkLoaded: true, isClerkSignedIn: true });
      expect(appMode()).toBe('cloud');
    });

    it('falls back to Local when Clerk answers signed out after the remount', async () => {
      const screen = await signedInThenRemounted();

      clerkAnswers(screen, { isSignedIn: false });
      expect(mockAuthState).toMatchObject({ isClerkLoaded: true, isClerkSignedIn: false });
      chatTabReadsSession();
      expect(appMode()).toBe('local');
    });
  });

  it('does not return to Cloud when no Cloud account was recorded before the fallback', async () => {
    mockRecordedOwner = null;
    const screen = await launch();
    settleWindowEnds();
    chatTabReadsSession();

    clerkAnswers(
      screen,
      { isSignedIn: true, userId: 'person-a' },
      { userId: 'person-a', status: 'accepted' },
    );
    expect(appMode()).toBe('local');
  });
});

describe('a Cloud start with no permission to share with AI providers', () => {
  type AlertButtons = Parameters<typeof Alert.alert>[2];
  let questionButtons: AlertButtons;
  let alertSpy: jest.SpyInstance;
  let seenModes: string[];
  let stopWatching: () => void;

  beforeEach(() => {
    jest.useFakeTimers();
    __resetCloudModeFallbackForTests();
    mockStored.clear();
    mockRecordedOwner = 'person-a';
    mockClerk = { isLoaded: false, getToken: mockGetToken };
    mockTerms = { userId: null, status: 'idle' };
    mockAuthState.isClerkSignedIn = false;
    mockAuthState.clerkUserId = null;
    mockAuthState.isClerkLoaded = false;
    questionButtons = undefined;
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      questionButtons = buttons;
    });
    seenModes = [];
    stopWatching = useChatAppModeStore.subscribe((state) => seenModes.push(state.appMode));
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  afterEach(() => {
    stopWatching();
    alertSpy.mockRestore();
    act(() => useChatAppModeStore.getState().setAppMode('local'));
    jest.useRealTimers();
  });

  async function answerQuestion(label: string) {
    const button = questionButtons?.find((candidate) => candidate.text === label);
    await act(async () => {
      button?.onPress?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  async function signInConfirmed(screen: Awaited<ReturnType<typeof launch>>) {
    clerkAnswers(
      screen,
      { isSignedIn: true, userId: 'person-a' },
      { userId: 'person-a', status: 'accepted' },
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('opens in Local, asks once the account is confirmed, and Allow enters Cloud', async () => {
    expect(appMode()).toBe('local');
    const screen = await launch();
    expect(alertSpy).not.toHaveBeenCalled();

    await signInConfirmed(screen);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(appMode()).toBe('local');

    await answerQuestion(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
    expect(appMode()).toBe('cloud');
    expect(seenModes.indexOf('cloud')).toBe(seenModes.length - 1);
  });

  it('links the App Store purchase and reads the rollout once Allow opens Cloud', async () => {
    const screen = await launch();
    await signInConfirmed(screen);
    const linkedAtSignIn = mockRegisterAppTransaction.mock.calls.length;
    const ringsAtSignIn = mockRefreshRolloutRings.mock.calls.length;

    await answerQuestion(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);

    expect(appMode()).toBe('cloud');
    expect(mockRegisterAppTransaction.mock.calls.slice(linkedAtSignIn)).toEqual([['person-a']]);
    expect(mockRefreshRolloutRings.mock.calls.length).toBe(ringsAtSignIn + 1);
  });

  it('stays in Local when the person answers Not now', async () => {
    const screen = await launch();
    await signInConfirmed(screen);
    expect(alertSpy).toHaveBeenCalledTimes(1);

    await answerQuestion(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);
    expect(appMode()).toBe('local');
    expect(seenModes).not.toContain('cloud');
    expect(mockStored.has(CLOUD_PROVIDER_CONSENT_KEY)).toBe(false);
  });

  it('does not ask or enter Cloud when a different account confirms', async () => {
    const screen = await launch();
    clerkAnswers(
      screen,
      { isSignedIn: true, userId: 'person-b' },
      { userId: 'person-b', status: 'accepted' },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(seenModes).not.toContain('cloud');
  });
});
