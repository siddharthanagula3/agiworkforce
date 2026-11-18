import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

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
jest.mock('react-native-safe-area-context', () => {
  const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => (
      <MockView testID="safe-area-root">{children}</MockView>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('@agiworkforce/utils/uuidv7', () => ({ setUuidV7RandomSource: jest.fn() }));
jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy({}, { get: () => () => <View /> });
});

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  Slot: () => null,
  useRouter: () => ({
    push: mockRouterPush,
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
  isUnlocked: true,
  isCovered: false,
  isReady: true,
  authenticate: jest.fn().mockResolvedValue(false),
};
jest.mock('../src/features/auth/hooks/useBiometricGate', () => ({
  useBiometricGate: () => mockGate,
}));

const mockAuthState = {
  isLoading: false,
  isInitialized: true,
  initialize: jest.fn(),
  isClerkSignedIn: true,
  clerkUserId: 'user-1',
  isClerkLoaded: true,
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
  beginCloudPostAuthIntentForChat: jest.fn(),
  clearPendingIntentLink: jest.fn(),
  clearPostAuthIntent: jest.fn(),
  consumePendingCloudChat: jest.fn(),
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
import { showActionMenu } from '../src/shared/components/ActionMenuHost';

async function renderRootLayout() {
  render(<RootLayout />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('RootLayout action menu host', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a menu raised from inside answer text, so link and source actions reach Android', async () => {
    const open = jest.fn();
    const copy = jest.fn();
    await renderRootLayout();
    expect(screen.queryByTestId('chat-actions-sheet')).toBeNull();

    act(() => {
      showActionMenu({
        title: 'example.com',
        dismissLabel: 'Dismiss link actions',
        actions: [
          { key: 'open', label: 'Open', run: open },
          { key: 'copy-link', label: 'Copy Link', run: copy },
        ],
      });
    });

    const sheet = within(screen.getByTestId('safe-area-root')).getByTestId('chat-actions-sheet');
    expect(within(sheet).getByText('example.com')).toBeTruthy();
    fireEvent.press(within(sheet).getByLabelText('Open'));

    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(copy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('chat-actions-sheet')).toBeNull();
  });

  it('closes on Cancel without running an action', async () => {
    const open = jest.fn();
    await renderRootLayout();

    act(() => {
      showActionMenu({
        title: 'example.com',
        dismissLabel: 'Dismiss link actions',
        actions: [{ key: 'open', label: 'Open', run: open }],
      });
    });
    fireEvent.press(screen.getByTestId('conversation-action-cancel'));

    expect(screen.queryByTestId('chat-actions-sheet')).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
});
