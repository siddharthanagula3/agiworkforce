import React from 'react';
import { render } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
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
}));

jest.mock('../lib/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
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

jest.mock('../src/features/billing', () => ({
  fetchPortalSessionUrl: jest.fn(async () => 'https://agiworkforce.com/settings/billing'),
}));

import ProfileScreen from '../app/(app)/profile';
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';

function resetStores() {
  useChatAppModeStore.setState({ appMode: 'local' });
  useSettingsStore.setState({
    personalization: {
      fullName: 'Siddhartha Local',
      nickname: 'Sid',
      occupation: 'Founder',
      instructions: '',
      warmth: 50,
      enthusiasm: 50,
      headersLists: 50,
      emoji: 50,
    },
  });
  useAuthStore.setState({
    session: null,
    user: null,
    isLoading: false,
    isInitialized: true,
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
    currentConversationId: null,
  });
}

describe('Profile mode boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    const { getByText, queryByText } = render(<ProfileScreen />);

    expect(getByText('AGI Cloud')).toBeTruthy();
    expect(getByText('Invite required')).toBeTruthy();
    expect(getByText('AGI Cloud profile')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
    expect(queryByText('Sid')).toBeNull();
    expect(queryByText('Founder')).toBeNull();
    expect(queryByText('Local settings')).toBeNull();
    expect(queryByText('4')).toBeNull();
  });
});
