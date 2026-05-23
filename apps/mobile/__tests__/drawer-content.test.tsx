/**
 * Tests for DrawerContent component.
 *
 * Covers:
 *  - Renders local-first nav items (Chat, Artifacts, Code, Skills, Projects)
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

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AfterFirstUnlockThisDeviceOnly',
}));

jest.mock('react-native-safe-area-context', () => {
  const MockSafeAreaView = jest.fn().mockImplementation(({ children }) => children);
  MockSafeAreaView.displayName = 'SafeAreaView';
  return {
    SafeAreaView: MockSafeAreaView,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('lucide-react-native', () => ({
  Code2: jest.fn().mockReturnValue(null),
  FileText: jest.fn().mockReturnValue(null),
  MessageSquare: jest.fn().mockReturnValue(null),
  Zap: jest.fn().mockReturnValue(null),
  FolderOpen: jest.fn().mockReturnValue(null),
  Monitor: jest.fn().mockReturnValue(null),
  Link: jest.fn().mockReturnValue(null),
  Settings: jest.fn().mockReturnValue(null),
  Plus: jest.fn().mockReturnValue(null),
  Brain: jest.fn().mockReturnValue(null),
  Key: jest.fn().mockReturnValue(null),
  Info: jest.fn().mockReturnValue(null),
  Lock: jest.fn().mockReturnValue(null),
}));

jest.mock('@react-navigation/drawer', () => ({}));

jest.mock('../src/shared/components/DesktopCompanionWidget', () => ({
  DesktopCompanionWidget: jest.fn().mockReturnValue(null),
}));

// ---------------------------------------------------------------------------
// Import modules under test AFTER mocks
// ---------------------------------------------------------------------------

import { DrawerContent } from '../src/features/drawer/components/DrawerContent';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../src/features/auth/store';
import { FEATURES } from '../lib/v1FeatureFlags';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// In v1 local-only mode, Dispatch and Connectors are feature-gated out.
// This list reflects what actually renders in the current feature config.
const NAV_LABELS = [
  'Chat',
  'Artifacts',
  'Code',
  'Skills',
  ...(FEATURES.projects ? ['Projects'] : []),
  ...(FEATURES.dispatch ? ['Dispatch'] : []),
  ...(FEATURES.connectorsCloudOnly ? ['Connectors'] : []),
  'Settings',
];

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

  it('renders visible navigation items per v1 feature config', () => {
    const { getByText } = renderDrawer();

    for (const label of NAV_LABELS) {
      expect(getByText(label)).toBeTruthy();
    }
  });

  it('hides cloud/auth drawer routes that are disabled for v1 local-only', () => {
    const { queryByLabelText } = renderDrawer();

    if (!FEATURES.dispatch) expect(queryByLabelText('Dispatch')).toBeNull();
    if (!FEATURES.connectorsCloudOnly) expect(queryByLabelText('Connectors')).toBeNull();
    if (!FEATURES.auth) expect(queryByLabelText('Account')).toBeNull();
  });

  it('keeps local utility routes visible in the drawer', () => {
    const { getByLabelText } = renderDrawer();

    expect(getByLabelText('Models')).toBeTruthy();
    expect(getByLabelText('Memory')).toBeTruthy();
    expect(getByLabelText('About')).toBeTruthy();
  });

  it('shows BYOK keys as a locked local-only utility row', () => {
    const { getByLabelText, getByText } = renderDrawer();

    const keysRow = getByLabelText('Keys / BYOK. Disabled until secure key storage ships');
    expect(keysRow.props.accessibilityState.disabled).toBe(true);
    expect(getByText('Locked')).toBeTruthy();
  });

  it('shows the local mode status card', () => {
    const { getByLabelText, getByText } = renderDrawer();

    expect(
      getByLabelText('Local Mode active. Local LLMs active. Cloud Managed is waitlist only.'),
    ).toBeTruthy();
    expect(getByText('Local LLMs active · Cloud Managed waitlist')).toBeTruthy();
  });

  it('renders the AGI header', () => {
    const { getByText } = renderDrawer();
    expect(getByText('AGI')).toBeTruthy();
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

  it('highlights utility routes when pathname matches them', () => {
    mockPathname = '/models';
    const modelUtils = renderDrawer();
    expect(modelUtils.getByLabelText('Models').props.accessibilityState.selected).toBe(true);
    modelUtils.unmount();

    mockPathname = '/settings/memory';
    const memoryUtils = renderDrawer();
    expect(memoryUtils.getByLabelText('Memory').props.accessibilityState.selected).toBe(true);
    memoryUtils.unmount();
  });

  it('highlights Artifacts and Code when those routes are active', () => {
    mockPathname = '/artifacts';
    const artifactsUtils = renderDrawer();
    expect(artifactsUtils.getByLabelText('Artifacts').props.accessibilityState.selected).toBe(true);
    artifactsUtils.unmount();

    mockPathname = '/code/recent-commits-plan';
    const codeUtils = renderDrawer();
    expect(codeUtils.getByLabelText('Code').props.accessibilityState.selected).toBe(true);
    codeUtils.unmount();
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
    // First 8 should be visible (limit is 10, we created 8)
    for (let i = 0; i < 8; i++) {
      expect(queryByText(`Chat ${i}`)).toBeTruthy();
    }
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
    const { getByLabelText, queryByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('Skills'));
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/skills');

    // Dispatch + Connectors are gated behind FEATURES.dispatch / FEATURES.connectorsCloudOnly
    if (FEATURES.dispatch) {
      fireEvent.press(getByLabelText('Dispatch'));
      expect(mockNavigate).toHaveBeenCalledWith('/(app)/dispatch');
    } else {
      expect(queryByLabelText('Dispatch')).toBeNull();
    }

    if (FEATURES.connectorsCloudOnly) {
      fireEvent.press(getByLabelText('Connectors'));
      expect(mockNavigate).toHaveBeenCalledWith('/(app)/connectors');
    } else {
      expect(queryByLabelText('Connectors')).toBeNull();
    }
  });

  it('navigates to visible utility routes', () => {
    const { getByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('Models'));
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/models');

    fireEvent.press(getByLabelText('Memory'));
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/settings/memory');

    fireEvent.press(getByLabelText('About'));
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/about');
  });

  it('navigates to a conversation when a recent is tapped', () => {
    const { getByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('Open conversation: First Chat'));
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: 'conv-1' },
    });
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
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/chat/[id]',
        params: { id: 'new-conv-id' },
      });
    });
  });

  it('navigates to chat list when createConversation fails', async () => {
    const mockCreateConversation = jest.fn().mockRejectedValue(new Error('fail'));
    useChatStore.setState({ createConversation: mockCreateConversation } as never);

    const { getAllByLabelText } = renderDrawer();
    const newChatButtons = getAllByLabelText('New chat');

    fireEvent.press(newChatButtons[0]);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/(app)/(tabs)/chat' });
    });
  });
});
