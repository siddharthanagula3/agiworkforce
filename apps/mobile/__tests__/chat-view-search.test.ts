jest.mock('../lib/mmkv', () => ({
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn(),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

const mockApiGet = jest.fn();
jest.mock('../services/api', () => ({ api: { get: (...a: unknown[]) => mockApiGet(...a) } }));

jest.mock('../src/features/chat/utils/markdownPlainText', () => {
  const actual = jest.requireActual('../src/features/chat/utils/markdownPlainText');
  return { ...actual, answerPlainText: jest.fn(actual.answerPlainText) };
});

import { answerPlainText } from '../src/features/chat/utils/markdownPlainText';
import { useChatViewStore } from '../stores/chat/chatViewStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useAuthStore } from '../src/features/auth/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const flushDebounce = () =>
  act(async () => {
    jest.advanceTimersByTime(350);
    await Promise.resolve();
    await Promise.resolve();
  });

import { act } from '@testing-library/react-native';

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  __resetCloudAccountSessionForTests();
  useChatAppModeStore.getState().setAppMode('local');
  useAuthStore.setState({ isClerkSignedIn: false });
  useChatViewStore.getState().clearCloudSearchState();
  useChatCloudMessageStore.setState({ conversations: [], messages: {} });
  useChatMessageStore.setState({
    conversations: [
      {
        id: 'c1',
        title: 'Rust tips',
        updatedAt: '',
        createdAt: '',
        messageCount: 1,
        pinned: false,
      },
    ],
    messages: {
      c1: [
        {
          id: 'm1',
          conversationId: 'c1',
          role: 'user',
          content: 'how do I borrow in rust',
          createdAt: '',
        },
      ],
    },
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('chatViewStore.searchConversations, mode routing', () => {
  it('local mode searches the on-device store and never calls the server', async () => {
    useChatAppModeStore.getState().setAppMode('local');

    useChatViewStore.getState().searchConversations('rust');
    await flushDebounce();

    expect(mockApiGet).not.toHaveBeenCalled();
    const ids = useChatViewStore.getState().searchResults.map((r) => r.conversationId);
    expect(ids).toContain('c1');
    expect(useChatViewStore.getState().isSearching).toBe(false);
    expect(useChatViewStore.getState().remoteSearchChats).toEqual([]);
    expect(useChatViewStore.getState().remoteSearchProjects).toEqual([]);
  });

  it('cloud mode keeps the server chats and projects the device has not synced', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    useAuthStore.setState({ isClerkSignedIn: true });
    activateCloudAccount('search-user');
    mockApiGet.mockResolvedValue({
      results: [
        { type: 'session', sessionId: 'cloud-1', sessionTitle: 'Rust on the server' },
        { type: 'message', sessionId: 'cloud-1', messageId: 'cm-1', matchedText: 'rust' },
        { type: 'message', sessionId: 'cloud-2', messageId: 'cm-2', matchedText: 'rust' },
      ],
      projects: [{ projectId: 'p-1', projectName: 'Rustacean', content: 'Systems work' }],
    });

    useChatViewStore.getState().searchConversations('rust');
    await flushDebounce();

    expect(useChatViewStore.getState().remoteSearchChats).toEqual([
      { id: 'cloud-1', title: 'Rust on the server', subtitle: 'Matched chat title' },
      { id: 'cloud-2', title: 'Untitled chat', subtitle: 'Matched message content' },
    ]);
    expect(useChatViewStore.getState().remoteSearchProjects).toEqual([
      { id: 'p-1', title: 'Rustacean', subtitle: 'Systems work' },
    ]);
  });

  it('drops the server matches when a cloud search falls back to the device', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    useAuthStore.setState({ isClerkSignedIn: true });
    activateCloudAccount('search-user');
    useChatViewStore.setState({
      remoteSearchChats: [{ id: 'stale', title: 'Stale', subtitle: 'Stale' }],
      remoteSearchProjects: [{ id: 'stale', title: 'Stale', subtitle: 'Stale' }],
    });
    mockApiGet.mockRejectedValue(new Error('network'));

    useChatViewStore.getState().searchConversations('rust');
    await flushDebounce();

    expect(useChatViewStore.getState().remoteSearchChats).toEqual([]);
    expect(useChatViewStore.getState().remoteSearchProjects).toEqual([]);
  });

  it('cloud mode (signed in) calls GET /api/search and maps the results', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    useAuthStore.setState({ isClerkSignedIn: true });
    activateCloudAccount('search-user');
    mockApiGet.mockResolvedValue({
      results: [
        {
          type: 'message',
          sessionId: 'cloud-1',
          messageId: 'cm-1',
          matchedText: 'rust',
          contextBefore: 'I love ',
          contextAfter: ' a lot',
        },
      ],
    });

    useChatViewStore.getState().searchConversations('rust');
    await flushDebounce();

    expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('/api/search?q=rust'));
    const results = useChatViewStore.getState().searchResults;
    expect(results).toHaveLength(1);
    expect(results[0]!.conversationId).toBe('cloud-1');
    expect(results[0]!.messageId).toBe('cm-1');
    expect(results[0]!.snippet).toContain('rust');
  });

  it('cloud mode searches only its account-scoped device cache when the server fails', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    useAuthStore.setState({ isClerkSignedIn: true });
    activateCloudAccount('search-user');
    useChatCloudMessageStore.setState({
      conversations: [
        {
          id: 'cloud-c1',
          title: 'Cloud Rust notes',
          updatedAt: '',
          createdAt: '',
          messageCount: 0,
          pinned: false,
        },
      ],
      messages: {},
    });
    mockApiGet.mockRejectedValue(new Error('network'));

    useChatViewStore.getState().searchConversations('rust');
    await flushDebounce();

    const ids = useChatViewStore.getState().searchResults.map((r) => r.conversationId);
    expect(ids).toContain('cloud-c1');
    expect(ids).not.toContain('c1');
  });

  it('marks a Cloud search that fell back to the device as failed, and clears it on the next attempt', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    useAuthStore.setState({ isClerkSignedIn: true });
    activateCloudAccount('search-user');
    mockApiGet.mockRejectedValueOnce(new Error('network'));

    useChatViewStore.getState().searchConversations('rust');
    expect(useChatViewStore.getState().searchFailed).toBe(false);
    await flushDebounce();

    expect(useChatViewStore.getState().searchFailed).toBe(true);
    expect(useChatViewStore.getState().isSearching).toBe(false);

    mockApiGet.mockResolvedValueOnce({ results: [], projects: [] });
    useChatViewStore.getState().searchConversations('rust');
    expect(useChatViewStore.getState().searchFailed).toBe(false);
    await flushDebounce();

    expect(useChatViewStore.getState().searchFailed).toBe(false);
  });

  it('does not mark a successful Cloud search, or a Local search, as failed', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    useAuthStore.setState({ isClerkSignedIn: true });
    activateCloudAccount('search-user');
    mockApiGet.mockResolvedValue({ results: [], projects: [] });

    useChatViewStore.getState().searchConversations('nothing here');
    await flushDebounce();
    expect(useChatViewStore.getState().searchFailed).toBe(false);

    useChatAppModeStore.getState().setAppMode('local');
    useChatViewStore.getState().searchConversations('nothing here');
    await flushDebounce();
    expect(useChatViewStore.getState().searchFailed).toBe(false);
  });

  it('does not search a cached Cloud account after sign-out', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    activateCloudAccount('signed-out-user');
    useChatCloudMessageStore.setState({
      conversations: [
        {
          id: 'private-chat',
          title: 'Private Rust notes',
          updatedAt: '',
          createdAt: '',
          messageCount: 0,
          pinned: false,
        },
      ],
      messages: {},
    });

    useChatViewStore.getState().searchConversations('rust');
    await flushDebounce();

    expect(mockApiGet).not.toHaveBeenCalled();
    expect(useChatViewStore.getState().searchResults).toEqual([]);
    expect(useChatViewStore.getState().isSearching).toBe(false);
  });

  it('discards a server result after the Cloud account changes', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    useAuthStore.setState({ isClerkSignedIn: true });
    activateCloudAccount('first-user');
    let resolveSearch: (value: unknown) => void = () => undefined;
    mockApiGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );

    useChatViewStore.getState().searchConversations('rust');
    await flushDebounce();
    invalidateCloudAccount();
    useChatViewStore.getState().clearCloudSearchState();
    activateCloudAccount('second-user');
    await act(async () => {
      resolveSearch({ results: [{ type: 'session', sessionId: 'first-user-chat' }] });
      await Promise.resolve();
    });

    expect(useChatViewStore.getState().remoteSearchChats).toEqual([]);
    expect(useChatViewStore.getState().searchResults).toEqual([]);
  });

  it('discards an older response when the user changes query or mode', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    useAuthStore.setState({ isClerkSignedIn: true });
    activateCloudAccount('search-user');
    let resolveSearch: (value: unknown) => void = () => undefined;
    mockApiGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );

    useChatViewStore.getState().searchConversations('rust');
    await flushDebounce();
    useChatViewStore.getState().searchConversations('python');
    expect(useChatViewStore.getState().remoteSearchChats).toEqual([]);
    useChatAppModeStore.getState().setAppMode('local');
    await act(async () => {
      resolveSearch({ results: [{ type: 'session', sessionId: 'stale-chat' }] });
      await Promise.resolve();
    });

    expect(useChatViewStore.getState().remoteSearchChats).toEqual([]);
    expect(useChatViewStore.getState().searchResults).toEqual([]);
  });

  it('clears results on empty query', async () => {
    useChatViewStore.setState({
      searchResults: [{ conversationId: 'x', messageId: '', snippet: 's' }],
    });
    useChatViewStore.getState().searchConversations('   ');
    expect(useChatViewStore.getState().searchResults).toEqual([]);
    expect(useChatViewStore.getState().isSearching).toBe(false);
  });
});

describe('chatViewStore.searchConversations, snippets', () => {
  it('shows a message that matches in plain text, without its Markdown, and marks the match', async () => {
    useChatMessageStore.setState({
      conversations: [
        { id: 'c2', title: 'Rivers', updatedAt: '', createdAt: '', messageCount: 1, pinned: false },
      ],
      messages: {
        c2: [
          {
            id: 'm2',
            conversationId: 'c2',
            role: 'assistant',
            content: '# The History of the Nile\n\nThe **river** runs north.',
            createdAt: '',
          },
        ],
      },
    });

    useChatViewStore.getState().searchConversations('nile');
    await flushDebounce();

    const [result] = useChatViewStore.getState().searchResults;
    expect(result!.snippet).toBe('The History of the Nile The river runs north.');
    expect(
      result!.snippet.slice(result!.matchStart, result!.matchStart + result!.matchLength),
    ).toBe('Nile');
  });

  it('finds text that Markdown splits, and ignores the markup itself', async () => {
    useChatMessageStore.setState({
      conversations: [
        { id: 'c3', title: 'Notes', updatedAt: '', createdAt: '', messageCount: 1, pinned: false },
      ],
      messages: {
        c3: [
          {
            id: 'm3',
            conversationId: 'c3',
            role: 'assistant',
            content: 'The **river** runs north.',
            createdAt: '',
          },
        ],
      },
    });

    useChatViewStore.getState().searchConversations('river runs');
    await flushDebounce();
    expect(useChatViewStore.getState().searchResults.map((r) => r.conversationId)).toContain('c3');

    useChatViewStore.getState().searchConversations('**');
    await flushDebounce();
    expect(useChatViewStore.getState().searchResults.map((r) => r.conversationId)).not.toContain(
      'c3',
    );
  });

  it('converts a message to plain text once, however many searches and matches read it', async () => {
    useChatMessageStore.setState({
      conversations: [
        { id: 'c4', title: 'Notes', updatedAt: '', createdAt: '', messageCount: 1, pinned: false },
      ],
      messages: {
        c4: [
          {
            id: 'm4',
            conversationId: 'c4',
            role: 'assistant',
            content: 'The **river** runs north past the delta.',
            createdAt: '',
          },
        ],
      },
    });
    jest.mocked(answerPlainText).mockClear();

    useChatViewStore.getState().searchConversations('river');
    await flushDebounce();
    expect(jest.mocked(answerPlainText)).toHaveBeenCalledTimes(1);

    useChatViewStore.getState().searchConversations('delta');
    await flushDebounce();
    expect(useChatViewStore.getState().searchResults.map((r) => r.conversationId)).toContain('c4');
    expect(jest.mocked(answerPlainText)).toHaveBeenCalledTimes(1);
  });

  it('strips Markdown from a server snippet and keeps the match offsets on the plain text', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    useAuthStore.setState({ isClerkSignedIn: true });
    activateCloudAccount('search-user');
    mockApiGet.mockResolvedValue({
      results: [
        {
          type: 'message',
          sessionId: 'cloud-1',
          messageId: 'cm-1',
          matchedText: 'Nile',
          contextBefore: '# The History of the ',
          contextAfter: '\n\nThe **river** runs north',
        },
      ],
    });

    useChatViewStore.getState().searchConversations('nile');
    await flushDebounce();

    const [result] = useChatViewStore.getState().searchResults;
    expect(result!.snippet).toBe('...The History of the Nile The river runs north...');
    expect(result!.snippet).not.toContain('#');
    expect(
      result!.snippet.slice(result!.matchStart, result!.matchStart + result!.matchLength),
    ).toBe('Nile');
  });

  it('shows a project match as plain text', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    useAuthStore.setState({ isClerkSignedIn: true });
    activateCloudAccount('search-user');
    mockApiGet.mockResolvedValue({
      results: [],
      projects: [
        { projectId: 'p-2', projectName: 'Nile', content: '## Goals\n\n- **Map** the river' },
      ],
    });

    useChatViewStore.getState().searchConversations('nile');
    await flushDebounce();

    expect(useChatViewStore.getState().remoteSearchProjects).toEqual([
      { id: 'p-2', title: 'Nile', subtitle: 'Goals • Map the river' },
    ]);
  });
});
