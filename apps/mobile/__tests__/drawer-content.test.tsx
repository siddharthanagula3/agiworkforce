/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockCloseDrawer = jest.fn();
let mockPathname = '/chat';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
  usePathname: () => mockPathname,
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

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

jest.mock('react-native-safe-area-context', () => {
  return {
    SafeAreaView: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return {
    Boxes: icon,
    Cloud: icon,
    FolderOpen: icon,
    HelpCircle: icon,
    Info: icon,
    Plus: icon,
    Search: icon,
    Settings: icon,
    Sparkles: icon,
    UserCircle: icon,
    X: icon,
  };
});

jest.mock('@react-navigation/drawer', () => ({}));

jest.mock('../src/shared/components/DesktopCompanionWidget', () => ({
  DesktopCompanionWidget: jest.fn().mockReturnValue(null),
}));

jest.mock('../src/features/cloud-bridge', () => {
  const { View } = require('react-native');
  return {
    InviteCodeModal: ({ open }: { open: boolean }) =>
      open ? <View testID="invite-code-modal" /> : null,
  };
});

import { DrawerContent } from '../src/features/drawer/components/DrawerContent';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../src/features/auth/store';
import { useProjectStore } from '../src/features/projects/store';

function renderDrawer() {
  return render(<DrawerContent {...({ navigation: { closeDrawer: mockCloseDrawer } } as never)} />);
}

describe('DrawerContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/chat';

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

    useProjectStore.setState({
      projects: [
        {
          id: 'proj-1',
          name: 'Launch demo',
          description: '',
          instructions: '',
          sources: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      activeProjectId: null,
    });

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

  it('renders the AGI mobile drawer structure', () => {
    const { getByText, getAllByText, getAllByLabelText, queryByText } = renderDrawer();

    expect(getByText('AGI')).toBeTruthy();
    expect(getAllByText('Projects').length).toBeGreaterThan(0);
    expect(getByText('Artifacts')).toBeTruthy();
    expect(getByText('AGI Agent')).toBeTruthy();
    expect(getByText('Recents')).toBeTruthy();
    expect(getByText('Settings')).toBeTruthy();
    expect(getAllByLabelText('Open profile').length).toBeGreaterThanOrEqual(2);
    expect(queryByText(/byok/i)).toBeNull();
  });

  it('renders projects and recents', () => {
    const { getByText } = renderDrawer();

    expect(getByText('Launch demo')).toBeTruthy();
    expect(getByText('First Chat')).toBeTruthy();
    expect(getByText('Second Chat')).toBeTruthy();
  });

  it('opens invite flow from AGI Agent instead of navigating to a disabled route', () => {
    const { getByLabelText, getByTestId } = renderDrawer();

    fireEvent.press(getByLabelText('AGI Agent. Cloud'));

    expect(mockCloseDrawer).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith('/(app)/agents');
    expect(getByTestId('invite-code-modal')).toBeTruthy();
  });

  it('highlights active projects and settings rows', () => {
    mockPathname = '/projects';
    const projects = renderDrawer();
    expect(projects.getByLabelText('Projects').props.accessibilityState.selected).toBe(true);
    projects.unmount();

    mockPathname = '/settings';
    const settings = renderDrawer();
    expect(settings.getByLabelText('Settings').props.accessibilityState.selected).toBe(true);
  });

  it('creates a new chat from the header button', async () => {
    useChatStore.setState({
      createConversation: jest.fn(async () => 'conv-new'),
    } as never);
    const { getByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('New chat'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/chat/[id]',
        params: { id: 'conv-new' },
      });
    });
  });
});
