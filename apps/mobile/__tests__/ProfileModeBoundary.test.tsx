import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useUser } from '@clerk/expo';

let mockClerkInstance: Record<string, unknown> | null = null;

jest.mock('@clerk/expo', () => ({
  useUser: jest.fn().mockReturnValue({ user: null, isLoaded: true }),
  getClerkInstance: () => mockClerkInstance,
}));

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    canGoBack: jest.fn().mockReturnValue(false),
    back: mockBack,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return {
    ArrowLeft: icon,
    BarChart3: icon,
    Brain: icon,
    ChevronRight: icon,
    CreditCard: icon,
    Database: icon,
    ExternalLink: icon,
    LogOut: icon,
    MessageSquare: icon,
    Shield: icon,
    Sparkles: icon,
    UserRound: icon,
  };
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store?.persist?.rehydrate) store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

import ProfileScreen from '../app/(app)/profile';
import { useAuthStore } from '../src/features/auth/store';
import * as pushTokenAccountLifecycle from '../src/features/auth/services/pushTokenAccountLifecycle';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatStore } from '../stores/chatStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';

function resetStores() {
  jest.mocked(useUser).mockReturnValue({
    user: null,
    isLoaded: true,
    isSignedIn: false,
  } as ReturnType<typeof useUser>);
  useChatAppModeStore.setState({ appMode: 'local' });
  useLocalSettingsStore.setState({
    personalization: {
      fullName: 'Siddhartha Local',
      nickname: 'Sid',
      occupation: 'Founder',
      instructions: '',
      style: 'default',
      warmth: 50,
      enthusiasm: 50,
      headersLists: 50,
      emoji: 50,
    },
  });
  useCloudSettingsStore.setState({
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
  });
  useAuthStore.setState({
    isLoading: false,
    isInitialized: true,
    isClerkSignedIn: false,
  });
  useChatStore.setState({
    conversations: [
      {
        id: 'local-chat',
        title: 'Local chat',
        createdAt: '2026-06-12T00:00:00.000Z',
        updatedAt: '2026-06-12T00:00:00.000Z',
        messageCount: 4,
        pinned: false,
        executionMode: 'local',
        provider: 'local',
      },
    ],
    messages: {},
    currentConversationId: null,
    loadConversations: jest.fn(async () => undefined),
  });
  useChatCloudMessageStore.setState({ conversations: [], messages: {}, historyStats: null });
}

describe('Profile mode boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClerkInstance = null;
    resetStores();
  });

  it('uses local profile and local stats in Local Mode', () => {
    const { getByText, queryByText } = render(<ProfileScreen />);

    expect(getByText('Sid')).toBeTruthy();
    expect(getByText('Founder')).toBeTruthy();
    expect(getByText('Local settings')).toBeTruthy();
    expect(getByText('4')).toBeTruthy();
    expect(queryByText('AGI Cloud profile')).toBeNull();
  });

  it('does not show local identity, settings, or counts in Cloud Mode', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useChatCloudMessageStore.setState({
      conversations: [
        {
          id: 'cloud-chat',
          title: 'Cloud chat',
          createdAt: '2026-06-12T00:00:00.000Z',
          updatedAt: '2026-06-12T00:00:00.000Z',
          messageCount: 7,
          pinned: false,
          executionMode: 'cloud',
          provider: 'cloud_managed',
        },
      ],
      messages: {},
    });

    const { getByText, queryByText } = render(<ProfileScreen />);

    expect(getByText('AGI Cloud')).toBeTruthy();
    expect(getByText('Sign in required')).toBeTruthy();
    expect(getByText('AGI Cloud profile')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
    expect(queryByText('Sid')).toBeNull();
    expect(queryByText('Founder')).toBeNull();
    expect(queryByText('Local settings')).toBeNull();
    expect(queryByText('4')).toBeNull();
  });

  it('uses server-authoritative Cloud totals instead of paginated conversation rows', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useChatCloudMessageStore.setState({
      conversations: [
        {
          id: 'cloud-chat',
          title: 'Only loaded page row',
          createdAt: '2026-06-12T00:00:00.000Z',
          updatedAt: '2026-06-12T00:00:00.000Z',
          messageCount: 0,
          pinned: false,
          executionMode: 'cloud',
          provider: 'cloud_managed',
        },
      ],
      messages: {},
      historyStats: { conversationCount: 195, messageCount: 842 },
    });

    const { getByText } = render(<ProfileScreen />);

    expect(getByText('195')).toBeTruthy();
    expect(getByText('842')).toBeTruthy();
  });

  it('shows the live Clerk name and email on the first Cloud render', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkSignedIn: true });
    jest.mocked(useUser).mockReturnValue({
      user: {
        fullName: 'Siddhartha Demo',
        firstName: 'Siddhartha',
        username: null,
        primaryEmailAddress: { emailAddress: 'demo@agiworkforce.com' },
      },
      isLoaded: true,
      isSignedIn: true,
    } as unknown as ReturnType<typeof useUser>);

    const { getByText } = render(<ProfileScreen />);

    expect(getByText('Siddhartha Demo')).toBeTruthy();
    expect(getByText('demo@agiworkforce.com')).toBeTruthy();
    expect(getByText('AGI Cloud')).toBeTruthy();
  });

  it('keeps subscription management inside the truthful native billing screen', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkSignedIn: true });

    const { getByText } = render(<ProfileScreen />);
    fireEvent.press(getByText('Subscription'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/cloud-billing');
  });

  it('opens the native Account Security overview from a signed-in Cloud profile', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkSignedIn: true });

    const { getByText } = render(<ProfileScreen />);
    fireEvent.press(getByText('Account Security'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/account-security');
  });

  it('says so when logging out of this account does not finish', async () => {
    const signedIn = (id: string, userId: string) => ({
      id,
      status: 'active',
      user: { id: userId, primaryEmailAddress: { emailAddress: `${userId}@example.com` } },
      publicUserData: { identifier: `${userId}@example.com`, userId },
    });
    const first = signedIn('sess_a', 'user_a');
    const second = signedIn('sess_b', 'user_b');
    const clerk = {
      __internal_environment: { authConfig: { singleSessionMode: false } },
      session: first as typeof first | null,
      client: { signedInSessions: [first, second] },
      setActive: jest.fn(async ({ session }: { session: string }) => {
        clerk.session = session === second.id ? second : first;
      }),
      signOut: jest.fn(async () => {
        throw new Error('session removal failed');
      }),
    };
    mockClerkInstance = clerk;
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: 'user_a' });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const releaseSpy = jest
      .spyOn(pushTokenAccountLifecycle, 'releasePushDeviceForAccountChange')
      .mockResolvedValue(undefined);

    try {
      const { getByText } = render(<ProfileScreen />);
      fireEvent.press(getByText('Log Out'));
      const confirm = (alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[]).find(
        (button) => button.text === 'Log Out',
      )!;
      await act(async () => {
        confirm.onPress?.();
      });

      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith(
          'Log out failed',
          expect.stringMatching(/try again/i),
        ),
      );
      expect(clerk.setActive).toHaveBeenCalledWith({ session: 'sess_b' });
      expect(clerk.signOut).toHaveBeenCalledWith({ sessionId: 'sess_a' });
    } finally {
      alertSpy.mockRestore();
      releaseSpy.mockRestore();
    }
  });
});
