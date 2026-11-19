jest.mock('../lib/mmkv', () => ({
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn(),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

const mockApiGet = jest.fn();
jest.mock('../services/api', () => ({ api: { get: (...a: unknown[]) => mockApiGet(...a) } }));

import { act } from '@testing-library/react-native';
import { useChatViewStore } from '../stores/chat/chatViewStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useAuthStore } from '../src/features/auth/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const ANSWER =
  '## Zebrafish overview\n\nUse the <script> tag and the <style> tag to add behaviour and looks.';

const flushDebounce = () =>
  act(async () => {
    jest.advanceTimersByTime(350);
    await Promise.resolve();
    await Promise.resolve();
  });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  __resetCloudAccountSessionForTests();
  useAuthStore.setState({ isClerkSignedIn: false });
  useChatViewStore.getState().clearCloudSearchState();
  useChatCloudMessageStore.setState({ conversations: [], messages: {} });
  useChatMessageStore.setState({
    conversations: [
      { id: 'c1', title: 'Fish', updatedAt: '', createdAt: '', messageCount: 1, pinned: false },
    ],
    messages: {
      c1: [{ id: 'm1', conversationId: 'c1', role: 'assistant', content: ANSWER, createdAt: '' }],
    },
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('chat search snippets keep tag names an answer mentions', () => {
  it('keeps them in a snippet the phone builds from its own copy', async () => {
    useChatAppModeStore.getState().setAppMode('local');

    useChatViewStore.getState().searchConversations('and the');
    await flushDebounce();

    const [result] = useChatViewStore.getState().searchResults;
    expect(result!.snippet).toContain('Use the <script> tag and the <style> tag');
  });

  it('keeps them in a snippet the server sends', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    useAuthStore.setState({ isClerkSignedIn: true });
    activateCloudAccount('search-user');
    mockApiGet.mockResolvedValue({
      results: [
        {
          type: 'message',
          sessionId: 'cloud-1',
          messageId: 'cm-1',
          matchedText: 'Zebrafish',
          contextBefore: '',
          contextAfter: ' overview Use the <script> tag and the <style> tag',
        },
      ],
    });

    useChatViewStore.getState().searchConversations('Zebrafish');
    await flushDebounce();

    const [result] = useChatViewStore.getState().searchResults;
    expect(result!.snippet).toBe('Zebrafish overview Use the <script> tag and the <style> tag...');
  });
});
