/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

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
    SquarePen: icon,
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

jest.mock('../src/features/chat/components/ModeSwitchModal', () => {
  const { View, Pressable } = require('react-native');
  return {
    ModeSwitchModal: ({
      visible,
      onConfirm,
      onCancel,
    }: {
      visible: boolean;
      onConfirm?: () => void;
      onCancel?: () => void;
    }) =>
      visible ? (
        <View testID="mode-switch-modal">
          <Pressable testID="mode-switch-confirm" onPress={onConfirm} />
          <Pressable testID="mode-switch-cancel" onPress={onCancel} />
        </View>
      ) : null,
  };
});

import { DrawerContent } from '../src/features/drawer/components/DrawerContent';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../src/features/auth/store';
import { useProjectStore } from '../src/features/projects/store';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useModelStore } from '../src/features/model-picker/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import {
  DEFAULT_CLOUD_MODEL_ID,
  DEFAULT_LOCAL_MODEL_ID,
} from '../src/features/model-picker/service';

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
          executionMode: 'local',
        },
        {
          id: 'conv-cloud',
          title: 'Cloud Chat',
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          messageCount: 2,
          pinned: false,
          model: DEFAULT_CLOUD_MODEL_ID,
          provider: 'cloud_managed',
          executionMode: 'cloud',
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

    useWaitlistStore.setState({
      joined: false,
      email: undefined,
      country: undefined,
      rank: undefined,
      joinedAt: undefined,
      cloudUnlocked: false,
      inviteId: undefined,
      inviteCode: undefined,
      cloudUnlockedAt: undefined,
    });
    useModelStore.setState({
      selectedModel: DEFAULT_LOCAL_MODEL_ID,
      selectedProvider: 'local',
      recentModels: [],
      favorites: [],
    } as never);
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('renders the AGI mobile drawer structure', () => {
    const { getByText, getAllByText, getAllByLabelText, queryByText } = renderDrawer();

    expect(getByText('AGI')).toBeTruthy();
    expect(getAllByText('Projects').length).toBeGreaterThan(0);
    expect(getByText('Artifacts')).toBeTruthy();
    expect(queryByText('AGI Agent')).toBeNull();
    expect(getByText('Recents')).toBeTruthy();
    expect(getByText('Settings')).toBeTruthy();
    expect(getAllByLabelText('Open profile')).toHaveLength(1);
    expect(queryByText(/byok/i)).toBeNull();
  });

  it('shows AGI Agent only while the drawer is in Cloud mode', () => {
    const local = renderDrawer();
    expect(local.queryByText('AGI Agent')).toBeNull();
    local.unmount();

    useChatAppModeStore.setState({ appMode: 'cloud' });
    const cloud = renderDrawer();

    expect(cloud.getByText('AGI Agent')).toBeTruthy();
    expect(cloud.queryByLabelText('Projects')).toBeNull();
    expect(cloud.queryByText('Launch demo')).toBeNull();
  });

  it('renders projects and recents', () => {
    const { getByText, queryByText } = renderDrawer();

    expect(getByText('Launch demo')).toBeTruthy();
    expect(getByText('First Chat')).toBeTruthy();
    expect(getByText('Second Chat')).toBeTruthy();
    expect(queryByText('Cloud Chat')).toBeNull();
  });

  it('caps visible recents so the drawer footer does not cover chat rows', () => {
    useChatStore.setState({
      conversations: Array.from({ length: 10 }, (_, index) => ({
        id: `local-${index + 1}`,
        title: `Local recent ${index + 1}`,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        messageCount: 1,
        pinned: false,
        executionMode: 'local',
      })),
    });

    const { getByText, queryByText } = renderDrawer();

    expect(getByText('Local recent 1')).toBeTruthy();
    expect(getByText('Local recent 8')).toBeTruthy();
    expect(queryByText('Local recent 9')).toBeNull();
  });

  it('clears drawer search through the visible clear button', () => {
    const { getByLabelText, getByText, queryByText } = renderDrawer();

    fireEvent.changeText(getByLabelText('Search chats and projects'), 'Test');
    expect(getByText('Results')).toBeTruthy();

    fireEvent.press(getByLabelText('Clear search'));

    expect(getByText('Recents')).toBeTruthy();
    expect(queryByText('Results')).toBeNull();
  });

  it('keeps Cloud recents separate from Local recents', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    if (DEFAULT_CLOUD_MODEL_ID) {
      useModelStore.getState().setModel(DEFAULT_CLOUD_MODEL_ID);
    }

    const { getByText, queryByText } = renderDrawer();

    expect(getByText('Cloud Chat')).toBeTruthy();
    expect(queryByText('First Chat')).toBeNull();
    expect(queryByText('Second Chat')).toBeNull();
  });

  it('opens invite flow from AGI Agent while Cloud is locked', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByLabelText, getByTestId } = renderDrawer();

    fireEvent.press(getByLabelText('AGI Agent. Cloud'));

    expect(mockCloseDrawer).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith('/(app)/agents');
    expect(getByTestId('invite-code-modal')).toBeTruthy();
  });

  it('shows consent modal then navigates when AGI Agent is pressed with cloud unlocked', () => {
    // SILENT-SWITCH-FIX: AGI Agent no longer silently sets appMode('cloud').
    // It shows ModeSwitchModal first; navigation only happens after user confirms.
    useWaitlistStore.setState({ cloudUnlocked: true });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByLabelText, getByTestId, queryByTestId } = renderDrawer();

    // Invite modal must not appear (cloud is already unlocked).
    expect(queryByTestId('invite-code-modal')).toBeNull();
    // Mode-switch consent modal must not be visible yet.
    expect(queryByTestId('mode-switch-modal')).toBeNull();

    // Press AGI Agent — should show consent modal, NOT navigate immediately.
    fireEvent.press(getByLabelText('AGI Agent. Cloud'));

    expect(getByTestId('mode-switch-modal')).toBeTruthy();
    expect(mockCloseDrawer).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();

    // Confirm the modal — navigation should now happen.
    fireEvent.press(getByTestId('mode-switch-confirm'));

    expect(queryByTestId('mode-switch-modal')).toBeNull();
    expect(mockCloseDrawer).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/(tabs)/chat');
    if (DEFAULT_CLOUD_MODEL_ID) {
      expect(useModelStore.getState().selectedModel).toBe(DEFAULT_CLOUD_MODEL_ID);
      expect(useModelStore.getState().selectedProvider).toBe('cloud_managed');
      expect(useChatAppModeStore.getState().appMode).toBe('cloud');
    }
  });

  it('cancelling the consent modal keeps current mode unchanged', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useChatAppModeStore.setState({ appMode: 'local' });
    const { getByLabelText, getByTestId, queryByTestId } = renderDrawer();

    // In local mode, AGI Agent is not visible — switch to cloud mode in the store first.
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const {
      getByLabelText: getByLabelText2,
      getByTestId: getByTestId2,
      queryByTestId: queryByTestId2,
    } = renderDrawer();

    fireEvent.press(getByLabelText2('AGI Agent. Cloud'));
    expect(getByTestId2('mode-switch-modal')).toBeTruthy();

    fireEvent.press(getByTestId2('mode-switch-cancel'));

    expect(queryByTestId2('mode-switch-modal')).toBeNull();
    expect(mockCloseDrawer).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
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

  it('opens the new chat composer from the header button', () => {
    const { getByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('New chat'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/(tabs)/chat',
    });
  });
});
