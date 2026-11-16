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

jest.mock('../lib/mmkv', () => ({
  storage: { getString: jest.fn() },
  initMmkvEncryption: jest.fn().mockResolvedValue(undefined),
  mmkvStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
  rehydrateWhenMmkvReady: jest.fn(),
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

const mockAuthState = {
  isLoading: false,
  isInitialized: true,
  initialize: jest.fn(),
  isClerkSignedIn: false,
  clerkUserId: null as string | null,
  isClerkLoaded: false,
  setClerkSignedIn: (value: boolean) => {
    mockAuthState.isClerkSignedIn = value;
  },
  setClerkUserId: (value: string | null) => {
    mockAuthState.clerkUserId = value;
  },
  setClerkLoaded: (value: boolean) => {
    mockAuthState.isClerkLoaded = value;
  },
};
jest.mock('../src/features/auth/store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
    { getState: () => mockAuthState },
  ),
}));

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

import RootLayout from '../app/_layout';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import {
  __resetCloudModeFallbackForTests,
  fallBackToLocalMode,
} from '../src/features/chat/store/cloudModeFallback';

const appMode = () => useChatAppModeStore.getState().appMode;

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
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockClerk = { isLoaded: false, getToken: mockGetToken };
    mockTerms = { userId: null, status: 'idle' };
    mockRecordedOwner = 'person-a';
    mockAuthState.isClerkSignedIn = false;
    mockAuthState.clerkUserId = null;
    mockAuthState.isClerkLoaded = false;
  });

  afterEach(() => {
    jest.useRealTimers();
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
