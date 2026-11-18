import React from 'react';
import { Alert, Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

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

jest.mock('@clerk/expo', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ isLoaded: false }),
}));
jest.mock('@clerk/expo/token-cache', () => ({ tokenCache: {} }));
jest.mock('../src/integrations/clerk', () => ({
  CLERK_LOAD_SETTLE_MS: 8_000,
  CLERK_NATIVE_AUTH_OPTIONS: {},
  CLERK_PUBLISHABLE_KEY: 'fixture-key',
  holdTokensUntilClerkAnswers: jest.fn(),
  setClerkTokenMinter: jest.fn(),
}));

const mockInitMmkv = jest.fn().mockResolvedValue(undefined);
jest.mock('../lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  storage: { getString: jest.fn() },
  initMmkvEncryption: () => mockInitMmkv(),
}));
jest.mock('../src/i18n', () => ({
  restoreStoredLanguage: jest.fn().mockResolvedValue({ directionChanged: false }),
}));

const mockClearBiometricFlag = jest.fn().mockResolvedValue(undefined);
jest.mock('../lib/biometricFlagStore', () => ({
  clearBiometricFlag: () => mockClearBiometricFlag(),
  hydrateBiometricFlag: jest.fn().mockResolvedValue(undefined),
}));

const mockGate = {
  isUnlocked: false,
  isCovered: false,
  isReady: true,
  authenticate: jest.fn().mockResolvedValue(false),
};
jest.mock('../src/features/auth/hooks/useBiometricGate', () => ({
  useBiometricGate: () => mockGate,
}));

const mockAuthState = {
  isLoading: false,
  isInitialized: false,
  initialize: jest.fn(),
  isClerkSignedIn: false,
  clerkUserId: null,
  isClerkLoaded: false,
  setClerkSignedIn: jest.fn(),
  setClerkUserId: jest.fn(),
  setClerkLoaded: jest.fn(),
};
jest.mock('../src/features/auth/store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
    { getState: () => mockAuthState },
  ),
}));
jest.mock('../src/features/auth/store/termsAcceptanceStore', () => ({
  isTermsAnswerPending: jest.fn(() => false),
  useTermsAcceptanceStore: Object.assign(
    (selector: (state: { status: string; userId: null }) => unknown) =>
      selector({ status: 'unknown', userId: null }),
    { getState: () => ({ reset: jest.fn(), verify: jest.fn() }) },
  ),
}));
jest.mock('../src/features/waitlist/store', () => ({
  useWaitlistStore: Object.assign(
    (selector: (state: { setCloudAccess: jest.Mock }) => unknown) =>
      selector({ setCloudAccess: jest.fn() }),
    { getState: () => ({ setCloudAccess: jest.fn(), cloudUnlocked: false }) },
  ),
}));
jest.mock('../src/features/billing/store', () => ({
  useTierStore: Object.assign(
    (selector: (state: { refreshTier: jest.Mock }) => unknown) =>
      selector({ refreshTier: jest.fn().mockResolvedValue(false) }),
    { getState: () => ({ tier: 'free' }) },
  ),
}));
jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (state: { appMode: 'local' }) => unknown) =>
    selector({ appMode: 'local' }),
}));
jest.mock('../src/features/chat/store/cloudModeDoor', () => ({
  installCloudModeDoor: jest.fn(),
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

const mockInvalidateCloudAccount = jest.fn();
jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  activateCloudAccount: jest.fn(),
  hasCloudAccountOwner: jest.fn(() => false),
  invalidateCloudAccount: () => mockInvalidateCloudAccount(),
  recordedCloudAccountOwnerId: jest.fn(() => null),
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
const mockClearAuthSession = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/authSession', () => ({
  clearAuthSession: () => mockClearAuthSession(),
}));
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

async function renderRootLayout() {
  render(<RootLayout />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('RootLayout app lock at cold launch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGate.isUnlocked = false;
    mockGate.isCovered = false;
    mockGate.isReady = true;
    mockAuthState.isInitialized = false;
    mockAuthState.isLoading = false;
    mockGate.authenticate.mockResolvedValue(false);
  });

  it('shows the lock overlay, not only a spinner, while the gate is locked before initialize', async () => {
    await renderRootLayout();

    expect(screen.getByTestId('app-lock-overlay')).toBeTruthy();
    expect(screen.getByTestId('app-lock-unlock')).toBeTruthy();
    expect(screen.getByTestId('app-lock-reset')).toBeTruthy();
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(mockAuthState.initialize).not.toHaveBeenCalled();
  });

  it('asks for biometrics again when Unlock is pressed after a cancelled prompt', async () => {
    await renderRootLayout();

    fireEvent.press(screen.getByTestId('app-lock-unlock'));
    fireEvent.press(screen.getByTestId('app-lock-unlock'));

    expect(mockGate.authenticate).toHaveBeenCalledTimes(2);
  });

  it('offers the existing reset-and-sign-out path from the cold-launch overlay', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    await renderRootLayout();

    fireEvent.press(screen.getByTestId('app-lock-reset'));

    expect(alert).toHaveBeenCalledWith(
      'Reset app lock and sign out?',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'Reset and sign out' })]),
    );
    expect(mockClearBiometricFlag).not.toHaveBeenCalled();

    const confirm = (alert.mock.calls[0]?.[2] ?? []).find(
      (button) => button.text === 'Reset and sign out',
    );
    await act(async () => {
      confirm?.onPress?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockClearAuthSession).toHaveBeenCalledTimes(1);
    expect(mockClearBiometricFlag).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('keeps the spinner for the unlocked, still-initializing state', async () => {
    mockGate.isUnlocked = true;

    await renderRootLayout();

    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.queryByTestId('app-lock-overlay')).toBeNull();
    expect(mockAuthState.initialize).toHaveBeenCalledTimes(1);
  });

  it('keeps the spinner until the gate has read the lock setting', async () => {
    mockGate.isReady = false;

    await renderRootLayout();

    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.queryByTestId('app-lock-overlay')).toBeNull();
  });
});
