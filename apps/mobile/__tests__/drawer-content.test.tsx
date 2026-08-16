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

// Proxy, not a hand-listed map: the drawer adding one more lucide glyph should
// not fail every assertion in this suite with "reading 'displayName'".
jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy(
    {},
    {
      get: (_target, name) => (name === '__esModule' ? true : icon),
    },
  );
});

// `jest.mock('@react-navigation/drawer', …)` used to sit here. That package is
// not a dependency of apps/mobile and nothing under src/ or app/ imports it —
// this line was the only reference to it left in the whole surface, from before
// the drawer was rebuilt. jest.mock resolves the module path even when the
// factory replaces it, so the leftover mock threw "Cannot find module" and took
// the entire suite down at load.

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
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useAuthStore } from '../src/features/auth/store';
import { useProjectStore } from '../src/features/projects/store';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useModelStore } from '../src/features/model-picker/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import {
  DEFAULT_CLOUD_MODEL_ID,
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultCloudModelIdForTier,
} from '../src/features/model-picker/service';
import { useTierStore } from '../src/features/billing/store';

function renderDrawer() {
  return render(<DrawerContent {...({ navigation: { closeDrawer: mockCloseDrawer } } as never)} />);
}

describe('DrawerContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/chat';

    // Cloud rows live in useChatCloudMessageStore — that is where
    // loadConversations() writes the server list, and the local store stopped
    // holding cloud conversations at all. Seeding this into the LOCAL store
    // would exercise a path the app no longer has.
    useChatCloudMessageStore.setState({
      conversations: [
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
    } as never);

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
    expect(getByText('Chats')).toBeTruthy();
    expect(getByText('Library')).toBeTruthy();
    expect(getByText('Remote')).toBeTruthy();
    // Artifacts, Skills, Tasks and Notifications were de-listed (founder
    // 2026-08-13): Library already covers generated media, and Notifications
    // lives in Settings. Their ROUTES still exist — only the drawer rows are gone.
    expect(queryByText('Artifacts')).toBeNull();
    expect(queryByText('AGI Agent')).toBeNull();
    expect(getByText('Recents')).toBeTruthy();
    expect(getByText('Settings')).toBeTruthy();
    expect(getAllByLabelText('Open profile')).toHaveLength(1);
    expect(queryByText(/byok/i)).toBeNull();
  });

  it('shows cloud-only drawer items (AGI Work, Schedules, Projects) while in Cloud mode', () => {
    const local = renderDrawer();
    expect(local.queryByText('Schedules')).toBeNull();
    expect(local.queryByText('AGI Work')).toBeNull();
    local.unmount();

    useChatAppModeStore.setState({ appMode: 'cloud' });
    // AGI Work is plan-gated (`agi_work`), so a free tier would hide the row and
    // the assertion below would pass for the wrong reason.
    useTierStore.setState({ tier: 'max' });
    const cloud = renderDrawer();

    // Cloud mode shows Schedules and AGI Work (which replaced the duplicate
    // "Tasks" row — both pointed at the same agent runs) plus synced Projects.
    expect(cloud.getByLabelText('AGI Work. Cloud')).toBeTruthy();
    expect(cloud.getByLabelText('Schedules. Cloud')).toBeTruthy();
    expect(cloud.queryByText('Skills')).toBeNull();
    // Projects nav row is visible in cloud mode (task: unblock cloud projects).
    expect(cloud.getByLabelText('Projects')).toBeTruthy();
    // The local project "Launch demo" should NOT appear in cloud mode
    // (cloud mode reads from cloudProjectStore, not local store).
    expect(cloud.queryByText('Launch demo')).toBeNull();
  });

  it('opens Cloud schedules from the drawer', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('Schedules. Cloud'));

    expect(mockCloseDrawer).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/schedules');
  });

  it('opens Remote as a first-class drawer destination', () => {
    const { getByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('Remote'));

    expect(mockCloseDrawer).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/companion');
  });

  it('opens the durable agent-run list from AGI Work', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useTierStore.setState({ tier: 'max' });
    const { getByLabelText } = renderDrawer();

    // AGI Work NAVIGATES; it no longer flips a session stance. `workMode` is a
    // property of a cloud agent run, so "the AGI Work chats" ARE the runs list.
    fireEvent.press(getByLabelText('AGI Work. Cloud'));

    expect(mockCloseDrawer).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/agents');
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

  it('opens the full global-search and chat-history surface', () => {
    const { getByLabelText } = renderDrawer();

    // The drawer's separate search row was folded into the Chats destination,
    // which owns search for chats, projects, files, library and artifacts.
    fireEvent.press(getByLabelText('Chats'));

    expect(mockCloseDrawer).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/chats');
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

  it('highlights active projects and settings rows', () => {
    mockPathname = '/projects';
    const projects = renderDrawer();
    expect(projects.getByLabelText('Projects').props.accessibilityState.selected).toBe(true);
    projects.unmount();

    mockPathname = '/settings';
    const settings = renderDrawer();
    expect(settings.getByLabelText('Settings').props.accessibilityState.selected).toBe(true);
  });

  it('opens the new chat composer from the compose pill', () => {
    const { getByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('New chat'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/(tabs)/chat',
    });
  });

  // PAR-M06. The founder complained the old drawer search field's placeholder
  // widened it; deleting the entry point outright over-corrected. The
  // replacement is icon-only (so it cannot widen) and hands off to the screen
  // that owns search, with its field already focused.
  it('opens Chats with the search field focused from the icon-only search button', () => {
    const { getByLabelText, queryByPlaceholderText } = renderDrawer();

    // No search input in the drawer: an icon-only button has no placeholder to
    // grow, which is the whole point of the fix.
    expect(queryByPlaceholderText(/search/i)).toBeNull();

    fireEvent.press(getByLabelText('Search'));

    expect(mockCloseDrawer).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/(app)/chats',
      params: { focusSearch: '1' },
    });
  });

  // PAR-M18 originally added a Notifications row here because
  // `app/(app)/notifications` had zero inbound navigation. The row was removed
  // (founder 2026-08-13: "notifications should be in settings") — but the
  // capability must not regress with it, so this asserts the row is gone AND
  // that the centre is still reachable from the header badge in DrawerButton,
  // which is the always-visible half of that entry point.
  it('no longer duplicates Notifications in the drawer', () => {
    const { queryByLabelText } = renderDrawer();

    expect(queryByLabelText('Notifications')).toBeNull();
  });
});
