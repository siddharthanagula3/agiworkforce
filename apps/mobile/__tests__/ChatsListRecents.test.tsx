/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockStore = new Map<string, string>();
let mockTemporaryChat = false;
let mockCloudConversations: Array<Record<string, unknown>> = [];
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockOpenDrawer = jest.fn();
let mockSearchParams: Record<string, string> = {};
const mockLoadConversations = jest.fn().mockResolvedValue(undefined);
const mockLoadMoreConversations = jest.fn().mockResolvedValue(undefined);
let mockAppMode: 'local' | 'cloud' = 'local';
let mockIsDark = false;
const mockSearchConversations = jest.fn();
const mockPinConversation = jest.fn();
const mockDeleteConversation = jest.fn();
const mockRenameConversation = jest.fn();
const mockForkConversation = jest.fn();
const mockLoadMessages = jest.fn().mockResolvedValue(undefined);

const mockConversations = Array.from({ length: 10 }, (_, index) => ({
  id: `chat-${index + 1}`,
  title: index === 0 ? 'Launch checklist' : `Local chat ${index + 1}`,
  lastMessage: index === 0 ? 'Ready for release' : `Message ${index + 1}`,
  createdAt: `2026-07-${String(30 - index).padStart(2, '0')}T10:00:00.000Z`,
  updatedAt: `2026-07-${String(30 - index).padStart(2, '0')}T10:00:00.000Z`,
  messageCount: 1,
  pinned: index === 1,
  unread: index === 2,
  executionMode: 'local' as const,
}));

const mockChatState = {
  conversations: mockConversations,
  messages: {
    'chat-1': [
      {
        id: 'message-1',
        conversationId: 'chat-1',
        role: 'user',
        content: 'Review the launch brief',
        createdAt: '2026-07-30T10:00:00.000Z',
        attachments: [
          {
            url: 'file:///documents/launch-brief.pdf',
            mimeType: 'application/pdf',
            fileName: 'launch-brief.pdf',
          },
        ],
      },
    ],
  },
  loadConversations: mockLoadConversations,
  loadMoreConversations: mockLoadMoreConversations,
  isLoadingConversations: false,
  isLoadingMoreConversations: false,
  hasMoreCloudConversations: false,
  conversationLoadError: null as string | null,
  pinConversation: mockPinConversation,
  deleteConversation: mockDeleteConversation,
  renameConversation: mockRenameConversation,
  forkConversation: mockForkConversation,
  loadMessages: mockLoadMessages,
};
const mockViewState = {
  searchConversations: mockSearchConversations,
  searchQuery: 'launch',
  searchResults: [{ conversationId: 'chat-4', messageId: 'message-4', snippet: 'launch detail' }],
  remoteSearchChats: [] as Array<{ id: string; title: string; subtitle: string }>,
  remoteSearchProjects: [] as Array<{ id: string; title: string; subtitle: string }>,
  searchFailed: false,
  isSearching: false,
};
const mockLocalProjects = [
  { id: 'project-1', name: 'Launch project', description: 'Release planning' },
];
const mockArtifacts = [
  {
    id: 'artifact-1',
    title: 'Launch runbook',
    kind: 'document' as const,
    content: 'Deployment checklist',
    ageLabel: 'just now',
    sourceLabel: 'Release chat',
    accentColor: '#fff',
    previewLines: ['Deployment checklist'],
    provenance: { scope: 'local' as const },
  },
];
const mockLibraryImages = [
  {
    id: 'image-1',
    assetId: '11111111-1111-4111-8111-111111111111',
    conversationId: 'chat-1',
    imageUrl: '/api/files/11111111-1111-4111-8111-111111111111',
    prompt: 'Launch poster',
    createdAt: '2026-07-30T10:00:00.000Z',
    sourceLabel: 'Design chat',
  },
];

jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStore.get(key),
    set: (key: string, value: string) => void mockStore.set(key, value),
    delete: (key: string) => void mockStore.delete(key),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  whenMmkvReady: jest.fn(),
  rehydrateWhenMmkvReady: jest.fn(),
}));

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ isTemporaryChat: mockTemporaryChat }),
  },
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ openDrawer: mockOpenDrawer }),
}));

jest.mock('../src/navigation/openNearestDrawer', () => ({
  openNearestDrawer: () => mockOpenDrawer(),
}));

jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: Record<string, unknown>) => (
      <RN.View testID="chats-page-root" {...props}>
        {children as React.ReactNode}
      </RN.View>
    ),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return new Proxy(
    {},
    {
      get: (_target, name) => (name === '__esModule' ? true : Icon),
    },
  );
});

jest.mock('../src/ui/theme', () => {
  const actual = jest.requireActual('../src/ui/theme/tokens');
  return {
    useThemeColors: () => (mockIsDark ? actual.colors : actual.lightColors),
    useTheme: () => ({
      colors: mockIsDark ? actual.colors : actual.lightColors,
      isDark: mockIsDark,
    }),
  };
});

jest.mock('../lib/v1FeatureFlags', () => ({
  FEATURES: { projects: true },
}));

jest.mock('../stores/chatStore', () => ({
  useChatStore: (selector: (state: typeof mockChatState) => unknown) => selector(mockChatState),
}));

jest.mock('../stores/chat/chatCloudMessageStore', () => ({
  useChatCloudMessageStore: (
    selector: (state: { conversations: never[]; messages: Record<string, never[]> }) => unknown,
  ) => selector({ conversations: mockCloudConversations, messages: {} }),
}));

jest.mock('../stores/chat/chatViewStore', () => ({
  useChatViewStore: (selector: (state: typeof mockViewState) => unknown) => selector(mockViewState),
}));

jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (
    selector: (state: { appMode: 'local' | 'cloud'; setAppMode: jest.Mock }) => unknown,
  ) => selector({ appMode: mockAppMode, setAppMode: jest.fn() }),
}));

jest.mock('../src/features/auth/store', () => ({
  useAuthStore: (
    selector: (state: { isClerkSignedIn: boolean; clerkUserId: string | null }) => unknown,
  ) =>
    selector({
      isClerkSignedIn: mockAppMode === 'cloud',
      clerkUserId: mockAppMode === 'cloud' ? 'account-a' : null,
    }),
}));

jest.mock('../src/features/projects/store', () => ({
  useProjectStore: (selector: (state: { projects: typeof mockLocalProjects }) => unknown) =>
    selector({ projects: mockLocalProjects }),
}));

jest.mock('../stores/projects/cloudProjectStore', () => ({
  useCloudProjectStore: (selector: (state: { projects: never[] }) => unknown) =>
    selector({ projects: [] }),
}));

jest.mock('../src/features/artifacts/store', () => ({
  useArtifactStore: (
    selector: (state: {
      artifacts: typeof mockArtifacts;
      cloudArtifacts: never[];
      cloudArtifactsOwnerId: null;
    }) => unknown,
  ) =>
    selector({
      artifacts: mockArtifacts,
      cloudArtifacts: [],
      cloudArtifactsOwnerId: null,
    }),
  mergeMobileArtifactsForGallery: () => mockArtifacts,
  accentColorForKind: () => '#fff',
  formatAgeLabel: () => '2h ago',
}));

jest.mock('../src/features/library/collectGeneratedImages', () => ({
  collectGeneratedImages: () => mockLibraryImages,
}));

import ChatsListScreen from '../src/features/chat/ChatsListScreen';
import { readRecentSearches, recordRecentSearch } from '../src/features/search';

const LOCAL = { mode: 'local' } as const;
const ACCOUNT_A = { mode: 'cloud', ownerId: 'account-a' } as const;
const SEARCH_LABEL = 'Search chats, projects, files, library, and artifacts';

describe('ChatsListScreen recent searches and recent chats', () => {
  const allConversations = mockChatState.conversations;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
    mockSearchParams = {};
    mockAppMode = 'local';
    mockIsDark = false;
    mockTemporaryChat = false;
    mockCloudConversations = [];
    mockChatState.conversations = allConversations;
    mockViewState.searchQuery = 'launch';
    mockViewState.searchFailed = false;
    mockViewState.isSearching = false;
    mockViewState.remoteSearchChats = [];
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  afterAll(() => {
    mockChatState.conversations = allConversations;
  });

  it('keeps the empty search prompt when there are no recent searches and no chats', () => {
    mockChatState.conversations = [];
    const screen = render(<ChatsListScreen searchOnly />);

    expect(screen.getByText('Search your workspace')).toBeTruthy();
    expect(screen.queryByText('Recent searches')).toBeNull();
    expect(screen.queryByText('Recent chats')).toBeNull();
  });

  it('lists the last five searches and the five newest chats while the field is empty', () => {
    for (const query of ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot']) {
      recordRecentSearch(LOCAL, query);
    }
    const screen = render(<ChatsListScreen searchOnly />);

    expect(screen.getByText('Recent searches')).toBeTruthy();
    expect(screen.getByText('foxtrot')).toBeTruthy();
    expect(screen.getByText('bravo')).toBeTruthy();
    expect(screen.queryByText('alpha')).toBeNull();
    expect(screen.getByText('Recent chats')).toBeTruthy();
    expect(screen.getByText('Launch checklist')).toBeTruthy();
    expect(screen.getByText('Local chat 5')).toBeTruthy();
    expect(screen.queryByText('Local chat 6')).toBeNull();
    expect(screen.queryByText('Search your workspace')).toBeNull();
  });

  it('shows recent chats alone when nothing has been searched yet', () => {
    const screen = render(<ChatsListScreen searchOnly />);

    expect(screen.queryByText('Recent searches')).toBeNull();
    expect(screen.getByText('Recent chats')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Open chat: Local chat 4'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: 'chat-4' },
    });
    expect(readRecentSearches(LOCAL)).toEqual([]);
  });

  it('fills the field and runs the search when a recent search is tapped', () => {
    recordRecentSearch(LOCAL, 'budget');
    recordRecentSearch(LOCAL, 'roadmap');
    const screen = render(<ChatsListScreen searchOnly />);
    mockSearchConversations.mockClear();

    fireEvent.press(screen.getByLabelText('Search for budget'));

    expect(screen.getByLabelText(SEARCH_LABEL).props.value).toBe('budget');
    expect(mockSearchConversations).toHaveBeenCalledWith('budget');
    expect(screen.queryByText('Recent searches')).toBeNull();
    expect(screen.queryByText('Recent chats')).toBeNull();
    expect(readRecentSearches(LOCAL)).toEqual(['budget', 'roadmap']);
  });

  it('hides both lists as soon as something is typed', () => {
    recordRecentSearch(LOCAL, 'budget');
    const screen = render(<ChatsListScreen searchOnly />);
    expect(screen.getByText('Recent searches')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText(SEARCH_LABEL), 'launch');

    expect(screen.queryByText('Recent searches')).toBeNull();
    expect(screen.queryByText('Recent chats')).toBeNull();
    expect(screen.getByText('Launch project')).toBeTruthy();
  });

  it('asks before Clear and keeps the searches when it is cancelled', () => {
    recordRecentSearch(LOCAL, 'budget');
    const screen = render(<ChatsListScreen searchOnly />);

    fireEvent.press(screen.getByLabelText('Clear recent searches'));

    const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('Clear recent searches?');
    expect(message).toContain('cannot be undone');
    expect(buttons.map((button: { text: string }) => button.text)).toEqual(['Cancel', 'Clear']);
    expect(readRecentSearches(LOCAL)).toEqual(['budget']);
    expect(screen.getByText('budget')).toBeTruthy();

    buttons[0].onPress?.();
    expect(readRecentSearches(LOCAL)).toEqual(['budget']);
    expect(screen.getByText('budget')).toBeTruthy();
  });

  it('empties the searches once Clear is confirmed and leaves the recent chats', () => {
    recordRecentSearch(LOCAL, 'budget');
    recordRecentSearch(ACCOUNT_A, 'account a only');
    const screen = render(<ChatsListScreen searchOnly />);

    fireEvent.press(screen.getByLabelText('Clear recent searches'));
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    act(() => buttons.find((button) => button.text === 'Clear')?.onPress?.());

    expect(screen.queryByText('Recent searches')).toBeNull();
    expect(screen.queryByText('budget')).toBeNull();
    expect(screen.getByText('Recent chats')).toBeTruthy();
    expect(readRecentSearches(LOCAL)).toEqual([]);
    expect(readRecentSearches(ACCOUNT_A)).toEqual(['account a only']);
  });

  it('remembers the query when a result is opened', () => {
    const screen = render(<ChatsListScreen searchOnly />);
    fireEvent.changeText(screen.getByLabelText(SEARCH_LABEL), 'launch');

    fireEvent.press(screen.getByLabelText('Open project: Launch project'));

    expect(readRecentSearches(LOCAL)).toEqual(['launch']);
    expect(readRecentSearches(ACCOUNT_A)).toEqual([]);
  });

  it('keeps Cloud searches under the signed-in account and the Cloud chats in view', () => {
    mockAppMode = 'cloud';
    mockCloudConversations = [
      {
        id: 'cloud-1',
        title: 'Cloud plan',
        lastMessage: '',
        createdAt: '2026-07-30T10:00:00.000Z',
        updatedAt: '2026-07-30T10:00:00.000Z',
        messageCount: 1,
        executionMode: 'cloud',
      },
    ];
    recordRecentSearch(LOCAL, 'on device');
    recordRecentSearch(ACCOUNT_A, 'in the cloud');
    const screen = render(<ChatsListScreen searchOnly />);

    expect(screen.getByText('in the cloud')).toBeTruthy();
    expect(screen.queryByText('on device')).toBeNull();
    expect(screen.getByText('Cloud plan')).toBeTruthy();
    expect(screen.queryByText('Launch checklist')).toBeNull();

    fireEvent.changeText(screen.getByLabelText(SEARCH_LABEL), 'connectors');
    fireEvent.press(screen.getByLabelText('Open destination: Connectors, Go to'));

    expect(readRecentSearches(ACCOUNT_A)).toEqual(['connectors', 'in the cloud']);
    expect(readRecentSearches(LOCAL)).toEqual(['on device']);
  });

  it('names the section of each destination result so screen readers can tell them apart', () => {
    const screen = render(<ChatsListScreen searchOnly />);
    fireEvent.changeText(screen.getByLabelText(SEARCH_LABEL), 'notifications');

    expect(screen.getAllByText('Notifications')).toHaveLength(2);
    expect(screen.getByLabelText('Open destination: Notifications, Go to')).toBeTruthy();
    expect(screen.getByLabelText('Open destination: Notifications, Settings')).toBeTruthy();
    expect(screen.queryByLabelText('Open destination: Notifications')).toBeNull();
  });

  it('records nothing while temporary chat is on', () => {
    mockTemporaryChat = true;
    const screen = render(<ChatsListScreen searchOnly />);
    fireEvent.changeText(screen.getByLabelText(SEARCH_LABEL), 'launch');

    fireEvent.press(screen.getByLabelText('Open project: Launch project'));

    expect(readRecentSearches(LOCAL)).toEqual([]);
    expect(mockStore.size).toBe(0);
  });

  it('does not record a query when a result is opened from the Chats list search', () => {
    const screen = render(<ChatsListScreen />);
    fireEvent.changeText(screen.getByLabelText(SEARCH_LABEL), 'launch');

    fireEvent.press(screen.getByLabelText('Open project: Launch project'));

    expect(readRecentSearches(LOCAL)).toEqual([]);
    expect(mockStore.size).toBe(0);
  });

  it('records nothing when the result opened is a temporary chat', () => {
    mockChatState.conversations = [
      ...allConversations,
      {
        id: 'temporary-1',
        title: 'Scratch pad',
        lastMessage: '',
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
        messageCount: 1,
        executionMode: 'local' as const,
        temporary: true,
      },
    ] as typeof allConversations;
    mockViewState.remoteSearchChats = [
      { id: 'temporary-1', title: 'Scratch pad', subtitle: 'launch notes' },
    ];
    const screen = render(<ChatsListScreen searchOnly />);
    fireEvent.changeText(screen.getByLabelText(SEARCH_LABEL), 'launch');

    fireEvent.press(screen.getByLabelText('Open chat: Scratch pad'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: 'temporary-1' },
    });
    expect(readRecentSearches(LOCAL)).toEqual([]);
  });

  it('remembers the query when the keyboard search key is pressed', () => {
    const screen = render(<ChatsListScreen searchOnly />);
    const field = screen.getByLabelText(SEARCH_LABEL);
    fireEvent.changeText(field, '  launch   notes ');

    fireEvent(field, 'submitEditing');

    expect(readRecentSearches(LOCAL)).toEqual(['launch notes']);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('records nothing when the search key is pressed with an empty field or temporary chat on', () => {
    const screen = render(<ChatsListScreen searchOnly />);
    const field = screen.getByLabelText(SEARCH_LABEL);
    fireEvent.changeText(field, '   ');
    fireEvent(field, 'submitEditing');
    expect(mockStore.size).toBe(0);

    mockTemporaryChat = true;
    fireEvent.changeText(field, 'launch');
    fireEvent(field, 'submitEditing');
    expect(mockStore.size).toBe(0);
  });

  it('does not record a query from the search key in the Chats list search', () => {
    const screen = render(<ChatsListScreen />);
    const field = screen.getByLabelText(SEARCH_LABEL);
    fireEvent.changeText(field, 'launch');

    fireEvent(field, 'submitEditing');

    expect(mockStore.size).toBe(0);
  });

  it('does not add recents to the Chats list', () => {
    recordRecentSearch(LOCAL, 'budget');
    const screen = render(<ChatsListScreen />);

    expect(screen.queryByText('Recent searches')).toBeNull();
    expect(screen.queryByText('Recent chats')).toBeNull();
    expect(screen.queryByText('budget')).toBeNull();
  });
});
