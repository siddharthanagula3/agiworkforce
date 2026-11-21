import React from 'react';
import { Platform } from 'react-native';
import { act, render } from '@testing-library/react-native';

jest.mock('../global.css', () => ({}));
jest.mock('../app/error', () => ({ default: () => null }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('expo', () => ({ reloadAppAsync: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-crypto', () => ({ getRandomBytes: jest.fn() }));

let mockLatestUrl: string | null = null;
const mockUrlListeners = new Set<(event: { url: string }) => void>();
jest.mock('expo-linking', () => {
  const { URL: NodeUrl } = jest.requireActual<typeof import('node:url')>('node:url');
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    getLinkingURL: () => mockLatestUrl,
    addEventListener: (_type: 'url', handler: (event: { url: string }) => void) => {
      mockUrlListeners.add(handler);
      return { remove: () => mockUrlListeners.delete(handler) };
    },
    useLinkingURL: () => {
      const [url, setUrl] = react.useState<string | null>(() => mockLatestUrl);
      react.useEffect(() => {
        const listener = (event: { url: string }) => setUrl(event.url);
        mockUrlListeners.add(listener);
        return () => {
          mockUrlListeners.delete(listener);
        };
      }, []);
      return url;
    },
    parse: (url: string) => {
      const parsed = new NodeUrl(url);
      return {
        scheme: parsed.protocol.replace(/:$/, ''),
        hostname: parsed.hostname,
        path: parsed.pathname.replace(/^\//, ''),
        queryParams: Object.fromEntries(parsed.searchParams),
      };
    },
  };
});
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

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: () => false,
};
let mockSegments: string[] = ['(app)', '(tabs)', 'chat'];
jest.mock('expo-router', () => ({
  Slot: () => null,
  useRouter: () => mockRouter,
  useSegments: () => mockSegments,
}));

const mockClerk = {
  isLoaded: true,
  isSignedIn: false,
  userId: null as string | null,
  getToken: jest.fn(),
};
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

let mockOnboardingDone = true;
jest.mock('../lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  storage: {
    getString: (key: string) =>
      key === 'onboarding-done' && mockOnboardingDone ? 'true' : undefined,
  },
  initMmkvEncryption: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/i18n', () => ({
  restoreStoredLanguage: jest.fn().mockResolvedValue({ directionChanged: false }),
}));
jest.mock('../lib/biometricFlagStore', () => ({
  clearBiometricFlag: jest.fn().mockResolvedValue(undefined),
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
  isClerkSignedIn: false,
  clerkUserId: null as string | null,
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
    (selector: (state: { status: string; userId: string | null }) => unknown) =>
      selector({ status: 'accepted', userId: 'user-1' }),
    { getState: () => ({ reset: jest.fn(), verify: jest.fn() }) },
  ),
}));
jest.mock('../src/features/auth/store/adultEligibilityStore', () => ({
  isAdultEligibilityAnswerPending: jest.fn(() => false),
  isAdultEligibilityConfirmed: jest.fn(() => true),
  adultEligibilityNeedsAnswer: jest.fn(() => false),
  useAdultEligibilityStore: Object.assign(
    (selector: (state: { status: string; userId: string | null }) => unknown) =>
      selector({ status: 'confirmed', userId: 'user-1' }),
    { getState: () => ({ reset: jest.fn(), verify: jest.fn() }) },
  ),
}));
const mockSetCloudAccess = jest.fn();
jest.mock('../src/features/waitlist/store', () => ({
  useWaitlistStore: Object.assign(
    (selector: (state: { setCloudAccess: jest.Mock }) => unknown) =>
      selector({ setCloudAccess: mockSetCloudAccess }),
    { getState: () => ({ setCloudAccess: mockSetCloudAccess, cloudUnlocked: false }) },
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
jest.mock('../src/features/chat/store/cloudModeFallback', () => ({
  answerCloudSession: jest.fn(),
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
jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  activateCloudAccount: jest.fn(() => ({ changed: false })),
  hasCloudAccountOwner: jest.fn(() => false),
  invalidateCloudAccount: jest.fn(),
  recordedCloudAccountOwnerId: jest.fn(() => null),
}));
jest.mock('../src/features/auth/services/cloudAccountTeardown', () => ({
  clearLocalCloudAccountState: jest.fn(),
}));
let mockSignInOwed = false;
jest.mock('../src/features/auth/services/endedSession', () => ({
  isSignInOwedForEndedSession: jest.fn(() => mockSignInOwed),
  oweSignInForEndedSession: jest.fn(),
  settleSignInForEndedSession: jest.fn(),
}));
jest.mock('../src/features/auth/hooks/usePushTokenAccountRegistration', () => ({
  usePushTokenAccountRegistration: jest.fn(),
}));
jest.mock('../src/features/auth/components/AccountSecurityVerificationPrompt', () => ({
  AccountSecurityVerificationPrompt: () => null,
}));
jest.mock('../src/features/auth/actions/postAuthIntent', () => ({
  completePendingPostAuthIntentForLoadedSession: jest.fn(),
}));
jest.mock('../src/features/auth/services/ageGate', () => ({
  isAgeGateConfirmed: jest.fn(() => true),
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
jest.mock('../services/authSession', () => ({
  clearAuthSession: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/notifications', () => ({
  setupNotificationListeners: jest.fn(),
  handleInitialNotification: jest.fn().mockResolvedValue(undefined),
  setNavigatorReady: jest.fn(),
  setPushTypeReceivedListener: jest.fn(),
  setSignedIn: jest.fn(),
}));
let mockConversations: { id: string; executionMode: 'local' | 'cloud' }[] = [];
jest.mock('../stores/chat/chatMessageStore', () => ({
  useChatMessageStore: { getState: () => ({ conversations: mockConversations }) },
}));
jest.mock('../services/backgroundFetch', () => ({
  registerBackgroundFetch: jest.fn(),
  unregisterBackgroundFetch: jest.fn(),
}));

import RootLayout from '../app/_layout';
import { isAgiWorkforceUniversalLinkHost } from '../src/integrations/universalLinks';
import { stagedIntentFileUri } from '../src/features/share-preview/sharedAttachments';
import {
  clearPendingIntentLink,
  clearPostAuthIntent,
  stagePostAuthDestination,
  stagePostAuthIntent,
} from '../src/features/auth/services/postAuthIntent';

const IN_APP = ['(app)', '(tabs)', 'chat'];
const ONBOARDING = ['(public)', 'onboarding'];

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderRootLayout() {
  const screen = render(<RootLayout />);
  await settle();
  return screen;
}

async function rerender(screen: ReturnType<typeof render>) {
  screen.rerender(<RootLayout />);
  await settle();
}

async function receive(url: string) {
  await act(async () => {
    mockLatestUrl = url;
    for (const listener of [...mockUrlListeners]) listener({ url });
  });
}

describe('RootLayout intent links', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPendingIntentLink();
    mockUrlListeners.clear();
    mockLatestUrl = null;
    mockSegments = IN_APP;
    mockOnboardingDone = true;
    mockSignInOwed = false;
    mockGate.isUnlocked = true;
    mockClerk.isLoaded = true;
    mockClerk.isSignedIn = false;
    mockClerk.userId = null;
    Object.assign(mockAuthState, {
      isInitialized: true,
      isClerkSignedIn: false,
      clerkUserId: null,
      isClerkLoaded: true,
    });
  });

  it('opens the same link every time it arrives in one session', async () => {
    await renderRootLayout();

    await receive('agiworkforce://intent/camera');
    await receive('agiworkforce://intent/camera');

    expect(mockRouter.push).toHaveBeenCalledTimes(2);
    expect(mockRouter.push).toHaveBeenNthCalledWith(1, '/(app)/camera');
    expect(mockRouter.push).toHaveBeenNthCalledWith(2, '/(app)/camera');
  });

  it('opens the link a cold start carries once, not again on a re-render or a later link', async () => {
    mockLatestUrl = 'agiworkforce://intent/voice';
    const screen = await renderRootLayout();

    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/voice');

    await rerender(screen);
    await rerender(screen);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);

    await receive('agiworkforce://intent/voice');
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });

  it('keeps a link that arrives before onboarding is finished and opens it once afterwards', async () => {
    mockOnboardingDone = false;
    mockSegments = ONBOARDING;
    mockLatestUrl = 'agiworkforce://intent/ask?prompt=hello';
    const screen = await renderRootLayout();

    expect(mockRouter.push).not.toHaveBeenCalled();

    mockOnboardingDone = true;
    mockSegments = ['(app)'];
    await rerender(screen);

    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/share-preview?text=hello');

    mockSegments = [...IN_APP];
    await rerender(screen);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('holds a link until Clerk has answered, then opens it', async () => {
    mockAuthState.isClerkLoaded = false;
    mockLatestUrl = 'agiworkforce://intent/chat';
    const screen = await renderRootLayout();

    expect(mockRouter.push).not.toHaveBeenCalled();

    mockAuthState.isClerkLoaded = true;
    await rerender(screen);

    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/(tabs)/chat');
  });

  it('keeps a link while a sign-in is owed and opens it once the person is back in the app', async () => {
    mockSignInOwed = true;
    mockLatestUrl = 'agiworkforce://intent/chat';
    const screen = await renderRootLayout();

    expect(mockRouter.push).not.toHaveBeenCalled();

    mockSignInOwed = false;
    mockClerk.isSignedIn = true;
    mockClerk.userId = 'user-1';
    Object.assign(mockAuthState, { isClerkSignedIn: true, clerkUserId: 'user-1' });
    await rerender(screen);

    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/(tabs)/chat');
  });

  it('drops a held link when the person signs out', async () => {
    mockOnboardingDone = false;
    mockSegments = ONBOARDING;
    mockClerk.isSignedIn = true;
    mockClerk.userId = 'user-1';
    Object.assign(mockAuthState, { isClerkSignedIn: true, clerkUserId: 'user-1' });
    mockLatestUrl = 'agiworkforce://intent/camera';
    const screen = await renderRootLayout();
    expect(mockRouter.push).not.toHaveBeenCalled();

    mockClerk.isSignedIn = false;
    mockClerk.userId = null;
    Object.assign(mockAuthState, { isClerkSignedIn: false, clerkUserId: null });
    await rerender(screen);

    mockOnboardingDone = true;
    mockSegments = ['(app)'];
    await rerender(screen);

    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  const PRIVATE_FILE = 'file:///data/user/0/com.agiworkforce.app/databases/agi.db';
  const STAGED_FILE = 'file:///caches/AGIIntentFiles/0F8E2C1A-1B2C-4D5E-8F90-123456789ABC.jpg';

  it('opens the scan, image and transcription screens without a file the link names but no App Intent staged', async () => {
    jest.mocked(stagedIntentFileUri).mockReturnValue(undefined);
    await renderRootLayout();
    const named = encodeURIComponent(PRIVATE_FILE);

    await receive(`agiworkforce://intent/scan?imageUri=${named}`);
    await receive(
      `agiworkforce://intent/analyze_image?imageUri=${named}&question=What%20is%20this`,
    );
    await receive(`agiworkforce://intent/transcribe?audioUri=${named}`);

    expect(stagedIntentFileUri).toHaveBeenCalledWith(PRIVATE_FILE);
    expect(mockRouter.push).toHaveBeenNthCalledWith(1, { pathname: '/(app)/scan', params: {} });
    expect(mockRouter.push).toHaveBeenNthCalledWith(2, {
      pathname: '/(app)/camera',
      params: { question: 'What is this' },
    });
    expect(mockRouter.push).toHaveBeenNthCalledWith(3, { pathname: '/(app)/voice', params: {} });
  });

  it('passes on a file the App Intent staged', async () => {
    jest.mocked(stagedIntentFileUri).mockImplementation((uri) => uri);
    await renderRootLayout();

    await receive(`agiworkforce://intent/scan?imageUri=${encodeURIComponent(STAGED_FILE)}`);

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(app)/scan',
      params: { imageUri: STAGED_FILE },
    });
    jest.mocked(stagedIntentFileUri).mockReset();
  });

  describe('the launcher and widget voice link', () => {
    const originalOS = Platform.OS;
    const originalVersion = Platform.Version;
    const runOn = (os: 'ios' | 'android', version: number | string) => {
      Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
      Object.defineProperty(Platform, 'Version', { get: () => version, configurable: true });
    };

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
      Object.defineProperty(Platform, 'Version', {
        get: () => originalVersion,
        configurable: true,
      });
    });

    it('opens the chat tab instead of the voice companion on Android API 32', async () => {
      runOn('android', 32);
      await renderRootLayout();

      await receive('agiworkforce://intent/voice');

      expect(mockRouter.push).toHaveBeenCalledTimes(1);
      expect(mockRouter.push).toHaveBeenCalledWith('/(app)/(tabs)/chat');
      expect(mockRouter.push).not.toHaveBeenCalledWith('/(app)/voice');
    });

    it.each([
      ['Android API 33', 'android', 33],
      ['iOS', 'ios', '18.0'],
    ] as const)('opens the voice companion on %s', async (_label, os, version) => {
      runOn(os, version);
      await renderRootLayout();

      await receive('agiworkforce://intent/voice');

      expect(mockRouter.push).toHaveBeenCalledTimes(1);
      expect(mockRouter.push).toHaveBeenCalledWith('/(app)/voice');
    });
  });
});

describe('RootLayout chat links while signed out', () => {
  const CHAT_SCREEN = ['(app)', 'chat', '[id]'];
  const SIGN_IN_FOR_CLOUD = { pathname: '/(auth)/login', params: { postAuthIntent: 'cloud-chat' } };

  beforeEach(() => {
    jest.clearAllMocks();
    clearPendingIntentLink();
    clearPostAuthIntent();
    mockUrlListeners.clear();
    mockLatestUrl = null;
    mockConversations = [];
    mockSegments = CHAT_SCREEN;
    mockOnboardingDone = true;
    mockSignInOwed = false;
    mockGate.isUnlocked = true;
    mockClerk.isLoaded = true;
    mockClerk.isSignedIn = false;
    mockClerk.userId = null;
    Object.assign(mockAuthState, {
      isInitialized: true,
      isClerkSignedIn: false,
      clerkUserId: null,
      isClerkLoaded: true,
    });
  });

  async function signIn(screen: ReturnType<typeof render>) {
    mockSegments = ['(auth)', 'login'];
    await rerender(screen);
    mockClerk.isSignedIn = true;
    mockClerk.userId = 'user-1';
    Object.assign(mockAuthState, { isClerkSignedIn: true, clerkUserId: 'user-1' });
    stagePostAuthDestination('cloud-chat');
    await rerender(screen);
  }

  it('asks for sign-in on a Cloud chat link and opens that chat once the person is signed in', async () => {
    mockLatestUrl = 'agiworkforce://chat/cloud-chat-7';
    const screen = await renderRootLayout();

    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith(SIGN_IN_FOR_CLOUD);

    mockRouter.replace.mockClear();
    await signIn(screen);

    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: 'cloud-chat-7' },
    });
  });

  it('asks for sign-in on a web chat link from an AGI address', async () => {
    jest.mocked(isAgiWorkforceUniversalLinkHost).mockReturnValue(true);
    await renderRootLayout();

    await receive('https://agiworkforce.com/chat/cloud-chat-8');

    expect(mockRouter.replace).toHaveBeenCalledWith(SIGN_IN_FOR_CLOUD);
    jest.mocked(isAgiWorkforceUniversalLinkHost).mockReturnValue(false);
  });

  it('opens a Local chat on this device without asking for sign-in', async () => {
    mockConversations = [{ id: 'local-chat-3', executionMode: 'local' }];
    mockLatestUrl = 'agiworkforce://chat/local-chat-3';
    await renderRootLayout();

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('leaves a signed-in person on the chat the link opened', async () => {
    mockClerk.isSignedIn = true;
    mockClerk.userId = 'user-1';
    Object.assign(mockAuthState, { isClerkSignedIn: true, clerkUserId: 'user-1' });
    mockLatestUrl = 'agiworkforce://chat/cloud-chat-7';
    await renderRootLayout();

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('does not open the chat after a sign-in that was abandoned and started again', async () => {
    mockLatestUrl = 'agiworkforce://chat/cloud-chat-7';
    const screen = await renderRootLayout();
    expect(mockRouter.replace).toHaveBeenCalledWith(SIGN_IN_FOR_CLOUD);

    clearPostAuthIntent();
    stagePostAuthIntent('cloud-chat');
    mockRouter.replace.mockClear();
    await signIn(screen);

    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/(app)' });
  });
});
