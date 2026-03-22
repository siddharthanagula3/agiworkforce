/**
 * Tests for DrawerContent component.
 *
 * Covers:
 *  - Renders all 6 nav items (Chat, Skills, Projects, Dispatch, Connectors, Settings)
 *  - Highlights active item with teal color
 *  - Shows recents section with conversations
 *  - Shows user profile card at bottom
 *  - Tapping nav item calls navigation
 *  - New chat button works
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — avoid React.createElement(RN.*) inside factories to prevent
// NativeWind's CSSInterop Babel transform from injecting out-of-scope vars.
// Use jest.fn().mockReturnValue(null) for icon mocks.
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockNavigate = jest.fn();
let mockPathname = '/chat';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
  usePathname: () => mockPathname,
}));

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
  },
}));

jest.mock('../lib/mmkv', () => ({
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AfterFirstUnlockThisDeviceOnly',
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.fn().mockImplementation(({ children }) => children),
}));

jest.mock('lucide-react-native', () => ({
  MessageSquare: jest.fn().mockReturnValue(null),
  Zap: jest.fn().mockReturnValue(null),
  FolderOpen: jest.fn().mockReturnValue(null),
  Monitor: jest.fn().mockReturnValue(null),
  Link: jest.fn().mockReturnValue(null),
  Settings: jest.fn().mockReturnValue(null),
  Plus: jest.fn().mockReturnValue(null),
}));

jest.mock('@react-navigation/drawer', () => ({}));

// ---------------------------------------------------------------------------
// Import modules under test AFTER mocks
// ---------------------------------------------------------------------------

import { DrawerContent } from '../components/drawer/DrawerContent';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NAV_LABELS = ['Chat', 'Skills', 'Projects', 'Dispatch', 'Connectors', 'Settings'];

function renderDrawer() {
  // DrawerContent receives DrawerContentComponentProps but only uses hooks internally
  return render(<DrawerContent {...({} as never)} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DrawerContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/chat';

    // Seed chat store with a few conversations
    useChatStore.setState({
      conversations: [
        {
          id: 'conv-1',
          title: 'First Chat',
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          messageCount: 3,
          pinned: false,
        },
        {
          id: 'conv-2',
          title: 'Second Chat',
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          messageCount: 1,
          pinned: false,
        },
      ],
      messages: {},
      isStreaming: false,
      streamingContent: '',
      streamingReasoning: '',
      isLoadingConversations: false,
      isLoadingMessages: false,
      error: null,
    });

    // Seed auth store with a user
    useAuthStore.setState({
      session: null,
      user: {
        id: 'user-1',
        email: 'alice@example.com',
        user_metadata: { full_name: 'Alice Smith' },
        app_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as never,
      isLoading: false,
      isInitialized: true,
    });
  });

  // ---- Rendering ----

  it('renders all 6 navigation items', () => {
    const { getByText } = renderDrawer();

    for (const label of NAV_LABELS) {
      expect(getByText(label)).toBeTruthy();
    }
  });

  it('renders the AGI Workforce header', () => {
    const { getByText } = renderDrawer();
    expect(getByText('AGI Workforce')).toBeTruthy();
  });

  it('renders the new chat button with correct accessibility label', () => {
    const { getAllByLabelText } = renderDrawer();
    const buttons = getAllByLabelText('New chat');
    // Header has a "New chat" button, and there is also one in the user profile card
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  // ---- Active state ----

  it('highlights the active nav item when pathname matches /chat', () => {
    mockPathname = '/chat';
    const { getByLabelText } = renderDrawer();

    const chatItem = getByLabelText('Chat');
    expect(chatItem.props.accessibilityState.selected).toBe(true);

    const settingsItem = getByLabelText('Settings');
    expect(settingsItem.props.accessibilityState.selected).toBe(false);
  });

  it('highlights Settings when pathname is /settings', () => {
    mockPathname = '/settings';
    const { getByLabelText } = renderDrawer();

    const settingsItem = getByLabelText('Settings');
    expect(settingsItem.props.accessibilityState.selected).toBe(true);

    const chatItem = getByLabelText('Chat');
    expect(chatItem.props.accessibilityState.selected).toBe(false);
  });

  it('highlights Projects when pathname is /(tabs)/projects', () => {
    mockPathname = '/(tabs)/projects';
    const { getByLabelText } = renderDrawer();

    const projectsItem = getByLabelText('Projects');
    expect(projectsItem.props.accessibilityState.selected).toBe(true);
  });

  // ---- Recents section ----

  it('shows recents section with conversation titles', () => {
    const { getByText } = renderDrawer();

    expect(getByText('Recents')).toBeTruthy();
    expect(getByText('First Chat')).toBeTruthy();
    expect(getByText('Second Chat')).toBeTruthy();
  });

  it('hides recents section when there are no conversations', () => {
    useChatStore.setState({ conversations: [] });

    const { queryByText } = renderDrawer();
    expect(queryByText('Recents')).toBeNull();
  });

  it('limits recents to 5 conversations', () => {
    const manyConvs = Array.from({ length: 8 }, (_, i) => ({
      id: `conv-${i}`,
      title: `Chat ${i}`,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      messageCount: 1,
      pinned: false,
    }));
    useChatStore.setState({ conversations: manyConvs });

    const { queryByText } = renderDrawer();
    // First 5 should be visible
    for (let i = 0; i < 5; i++) {
      expect(queryByText(`Chat ${i}`)).toBeTruthy();
    }
    // 6th, 7th, 8th should not be rendered
    expect(queryByText('Chat 5')).toBeNull();
    expect(queryByText('Chat 6')).toBeNull();
    expect(queryByText('Chat 7')).toBeNull();
  });

  // ---- User profile ----

  it('shows user profile card with display name', () => {
    const { getByText } = renderDrawer();
    expect(getByText('Alice Smith')).toBeTruthy();
  });

  it('shows avatar initial from display name', () => {
    const { getByText } = renderDrawer();
    expect(getByText('A')).toBeTruthy();
  });

  it('falls back to email prefix when full_name is missing', () => {
    useAuthStore.setState({
      user: {
        id: 'user-2',
        email: 'bob@example.com',
        user_metadata: {},
        app_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as never,
    });

    const { getByText } = renderDrawer();
    expect(getByText('bob')).toBeTruthy();
  });

  it('shows "User" when no email or name is available', () => {
    useAuthStore.setState({
      user: {
        id: 'user-3',
        user_metadata: {},
        app_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as never,
    });

    const { getByText } = renderDrawer();
    expect(getByText('User')).toBeTruthy();
  });

  // ---- Navigation interactions ----

  it('navigates to the correct route when a nav item is tapped', () => {
    const { getByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('Skills'));
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/skills');

    fireEvent.press(getByLabelText('Dispatch'));
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/dispatch');

    fireEvent.press(getByLabelText('Connectors'));
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/connectors');
  });

  it('navigates to a conversation when a recent is tapped', () => {
    const { getByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('Open conversation: First Chat'));
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/chat/conv-1');
  });

  // ---- New chat ----

  it('creates a new conversation and navigates when new chat button is tapped', async () => {
    const mockCreateConversation = jest.fn().mockResolvedValue('new-conv-id');
    useChatStore.setState({ createConversation: mockCreateConversation } as never);

    const { getAllByLabelText } = renderDrawer();
    const newChatButtons = getAllByLabelText('New chat');

    fireEvent.press(newChatButtons[0]);

    await waitFor(() => {
      expect(mockCreateConversation).toHaveBeenCalledWith('New Chat');
      expect(mockPush).toHaveBeenCalledWith('/(app)/chat/new-conv-id');
    });
  });

  it('navigates to chat list when createConversation fails', async () => {
    const mockCreateConversation = jest.fn().mockRejectedValue(new Error('fail'));
    useChatStore.setState({ createConversation: mockCreateConversation } as never);

    const { getAllByLabelText } = renderDrawer();
    const newChatButtons = getAllByLabelText('New chat');

    fireEvent.press(newChatButtons[0]);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/chat');
    });
  });
});
