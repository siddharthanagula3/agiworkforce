jest.mock('../lib/mmkv', () => ({
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  rehydrateWhenMmkvReady: jest.fn(),
}));

const mockApiGet = jest.fn();
jest.mock('../services/api', () => ({ api: { get: (...a: unknown[]) => mockApiGet(...a) } }));

import { useChatViewStore } from '../stores/chat/chatViewStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useAuthStore } from '../src/features/auth/store';

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
  useChatViewStore.setState({ searchQuery: '', searchResults: [], isSearching: false });
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
  });

  it('cloud mode (signed in) calls GET /api/search and maps the results', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    useAuthStore.setState({ isClerkSignedIn: true });
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

  it('cloud mode falls back to local search when the server call fails', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    useAuthStore.setState({ isClerkSignedIn: true });
    mockApiGet.mockRejectedValue(new Error('network'));

    useChatViewStore.getState().searchConversations('rust');
    await flushDebounce();

    const ids = useChatViewStore.getState().searchResults.map((r) => r.conversationId);
    expect(ids).toContain('c1');
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
