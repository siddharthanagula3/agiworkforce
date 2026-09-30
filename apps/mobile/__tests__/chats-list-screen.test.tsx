/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert, Modal } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockOpenDrawer = jest.fn();
let mockSearchParams: Record<string, string> = {};
const mockLoadConversations = jest.fn().mockResolvedValue(undefined);
const mockLoadMoreConversations = jest.fn().mockResolvedValue(undefined);
let mockAppMode: 'local' | 'cloud' = 'local';
const mockSearchConversations = jest.fn();
const mockPinConversation = jest.fn();
const mockDeleteConversation = jest.fn();
const mockRenameConversation = jest.fn();

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
};
const mockViewState = {
  searchConversations: mockSearchConversations,
  searchQuery: 'launch',
  searchResults: [{ conversationId: 'chat-4', messageId: 'message-4', snippet: 'launch detail' }],
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
    conversationId: 'chat-1',
    imageUrl: '/api/files/11111111-1111-4111-8111-111111111111',
    prompt: 'Launch poster',
    createdAt: '2026-07-30T10:00:00.000Z',
    sourceLabel: 'Design chat',
  },
];

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

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

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
  return { useThemeColors: () => actual.lightColors };
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
  ) => selector({ conversations: [], messages: {} }),
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

describe('ChatsListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockAppMode = 'local';
    mockChatState.isLoadingConversations = false;
    mockChatState.isLoadingMoreConversations = false;
    mockChatState.hasMoreCloudConversations = false;
    mockChatState.conversationLoadError = null;
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  it('shows a retryable Cloud history error instead of an empty-account message', () => {
    mockAppMode = 'cloud';
    mockChatState.conversationLoadError =
      'Chats could not be refreshed. Check your connection and try again.';
    const screen = render(<ChatsListScreen />);

    expect(screen.getByText(mockChatState.conversationLoadError)).toBeTruthy();
    expect(screen.queryByText('No chats yet')).toBeNull();
    fireEvent.press(screen.getByLabelText('Retry loading chats'));
    expect(mockLoadConversations).toHaveBeenCalledTimes(2);
  });

  it('refreshes Cloud chats when the list is pulled', () => {
    mockAppMode = 'cloud';
    const screen = render(<ChatsListScreen />);

    act(() => {
      screen.getByTestId('chats-list').props.refreshControl.props.onRefresh();
    });

    expect(mockLoadConversations).toHaveBeenCalledTimes(2);
    expect(mockLoadConversations).toHaveBeenCalledWith({ firstPageOnly: true });
  });

  it('loads older Cloud chats only when the list reaches the end', () => {
    mockAppMode = 'cloud';
    mockChatState.hasMoreCloudConversations = true;
    const screen = render(<ChatsListScreen />);

    expect(mockLoadConversations).toHaveBeenCalledWith({ firstPageOnly: true });
    expect(mockLoadMoreConversations).not.toHaveBeenCalled();
    act(() => {
      screen.getByTestId('chats-list').props.onEndReached();
    });
    expect(mockLoadMoreConversations).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Load older chats')).toBeTruthy();
  });

  it('shows an older-page failure at the list end without automatic retry loops', () => {
    mockAppMode = 'cloud';
    mockChatState.hasMoreCloudConversations = true;
    mockChatState.conversationLoadError = 'Older chats could not be loaded.';
    const screen = render(<ChatsListScreen />);

    expect(screen.getByText('Older chats could not be loaded.')).toBeTruthy();
    act(() => {
      screen.getByTestId('chats-list').props.onEndReached();
    });
    expect(mockLoadMoreConversations).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Load older chats'));
    expect(mockLoadMoreConversations).toHaveBeenCalledTimes(1);
  });

  it('focuses the search field when opened with the drawer search param', () => {
    const unfocused = render(<ChatsListScreen />);
    expect(
      unfocused.getByLabelText('Search chats, projects, files, library, and artifacts').props
        .autoFocus,
    ).toBe(false);
    unfocused.unmount();

    mockSearchParams = { focusSearch: '1' };
    const focused = render(<ChatsListScreen />);
    expect(
      focused.getByLabelText('Search chats, projects, files, library, and artifacts').props
        .autoFocus,
    ).toBe(true);
  });

  it('shows search guidance without chat history on the dedicated search screen', () => {
    const screen = render(<ChatsListScreen searchOnly />);

    expect(screen.getByText('Search your workspace')).toBeTruthy();
    expect(screen.getByText(/Find chats, projects, files/)).toBeTruthy();
    expect(screen.queryByText('Launch checklist')).toBeNull();
    expect(screen.queryByLabelText('New chat')).toBeNull();
    expect(screen.queryByLabelText('Filter chats. All chats')).toBeNull();
    expect(
      screen.getByLabelText('Search chats, projects, files, library, and artifacts').props
        .autoFocus,
    ).toBe(true);

    fireEvent.changeText(
      screen.getByLabelText('Search chats, projects, files, library, and artifacts'),
      'launch',
    );
    expect(screen.getByText('Launch project')).toBeTruthy();
    expect(screen.getByText('Launch poster')).toBeTruthy();
    expect(screen.queryByText('Search your workspace')).toBeNull();

    fireEvent.press(screen.getByLabelText('Close search'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/chats');
  });

  it('renders an unbounded mode-scoped history with filter and New chat controls', () => {
    const { getByLabelText, getByText } = render(<ChatsListScreen />);

    expect(getByText('Chats')).toBeTruthy();
    expect(getByText('Local on this device')).toBeTruthy();
    expect(getByText('Local chat 10')).toBeTruthy();
    expect(getByLabelText('Filter chats. All chats')).toBeTruthy();

    fireEvent.press(getByLabelText('New chat'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/chat');
  });

  it('filters the history to pinned chats', () => {
    const { getByLabelText, getByText, queryByText } = render(<ChatsListScreen />);
    fireEvent.press(getByLabelText('Filter chats. All chats'));

    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    act(() => buttons.find((button) => button.text?.includes('Pinned'))?.onPress?.());

    expect(getByText('Local chat 2')).toBeTruthy();
    expect(queryByText('Launch checklist')).toBeNull();
  });

  it('groups global results and opens the exact Library item', () => {
    const { getAllByText, getByLabelText, getByText } = render(<ChatsListScreen />);

    fireEvent.changeText(
      getByLabelText('Search chats, projects, files, library, and artifacts'),
      'launch',
    );

    expect(getAllByText('Chats')).toHaveLength(2);
    expect(getByText('Projects')).toBeTruthy();
    expect(getByText('Files')).toBeTruthy();
    expect(getByText('Library')).toBeTruthy();
    expect(getByText('Artifacts')).toBeTruthy();
    expect(getByText('Launch project')).toBeTruthy();
    expect(getByText('launch-brief.pdf')).toBeTruthy();
    expect(getByText('Launch poster')).toBeTruthy();
    expect(getByText('Launch runbook')).toBeTruthy();

    fireEvent.press(getByLabelText('Open library: Launch poster'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/library',
      params: { imageId: 'image-1' },
    });
  });

  it('offers the same rename, pin and delete actions the drawer has, on a long press', () => {
    const screen = render(<ChatsListScreen />);
    const { getAllByTestId, getByLabelText, getByTestId, getByText } = screen;

    // The sheet defers each action to the modal's `onDismiss` so an Alert never
    // races a dismissing modal on iOS; nothing fires that prop without a host.
    const dismissSheet = () => {
      const sheet = screen.UNSAFE_getAllByType(Modal).find((node) => node.props.onDismiss);
      act(() => (sheet?.props.onDismiss as () => void)());
    };

    fireEvent(getByLabelText('Open chat: Launch checklist'), 'longPress');

    expect(getAllByTestId(/^conversation-action-/).map((node) => node.props.accessibilityLabel)) //
      .toEqual(['Rename', 'Pin', 'Move to project', 'Mark as unread', 'Delete', 'Cancel']);

    fireEvent.press(getByTestId('conversation-action-pin'));
    dismissSheet();
    expect(mockPinConversation).toHaveBeenCalledWith('chat-1');

    fireEvent(getByLabelText('Open chat: Launch checklist'), 'longPress');
    fireEvent.press(getByTestId('conversation-action-rename'));
    dismissSheet();

    fireEvent.changeText(getByLabelText('Chat title'), 'Launch checklist v2');
    fireEvent(getByLabelText('Chat title'), 'submitEditing');

    expect(mockRenameConversation).toHaveBeenCalledWith('chat-1', 'Launch checklist v2');
    expect(getByText('Launch checklist')).toBeTruthy();
  });

  it('does not offer chat actions on a non-chat search result', () => {
    const { getByLabelText, queryAllByTestId } = render(<ChatsListScreen />);
    fireEvent.changeText(
      getByLabelText('Search chats, projects, files, library, and artifacts'),
      'launch',
    );

    fireEvent(getByLabelText('Open project: Launch project'), 'longPress');

    expect(queryAllByTestId(/^conversation-action-/)).toEqual([]);
  });
});
