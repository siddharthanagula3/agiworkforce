/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockOpenDrawer = jest.fn();
let mockSearchParams: Record<string, string> = {};
const mockLoadConversations = jest.fn().mockResolvedValue(undefined);
const mockSearchConversations = jest.fn();

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
  useRouter: () => ({ push: mockPush }),
  // The drawer's icon-only search button hands off here with `focusSearch=1`.
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
  // The screen reads insets to keep the bottom search field and the New chat
  // button clear of the home indicator.
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  // A Proxy rather than a fixed list: an icon the screen adds later would
  // otherwise arrive as `undefined`, and the failure surfaces deep inside
  // nativewind's JSX interop reading `.displayName` off it — nowhere near the
  // missing name.
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
    selector: (state: { appMode: 'local'; setAppMode: jest.Mock }) => unknown,
  ) => selector({ appMode: 'local', setAppMode: jest.fn() }),
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
  // Chat rows show a relative-time subtitle, reusing the artifact gallery's
  // formatter rather than carrying a second relative-time implementation.
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
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  // PAR-M06: the drawer's icon-only search button is a hand-off, not a second
  // search implementation, so this screen has to honour the param it arrives
  // with. Without it the button would just dump the user on an unfocused list.
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
});
