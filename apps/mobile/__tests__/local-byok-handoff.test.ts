jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn().mockRejectedValue(new Error('offline')),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/streaming', () => ({
  streamChat: jest.fn(),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function') {
      store.persist.rehydrate();
    }
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { useChatStore } from '../stores/chatStore';
import { api } from '../services/api';

function resetStore() {
  useChatStore.setState({
    conversations: [
      {
        id: 'local-conv',
        title: 'Local thread',
        updatedAt: '2026-05-21T09:59:00.000Z',
        createdAt: '2026-05-21T09:00:00.000Z',
        messageCount: 2,
        pinned: false,
      },
    ],
    currentConversationId: 'local-conv',
    messages: {
      'local-conv': [
        {
          id: 'msg-user',
          conversationId: 'local-conv',
          role: 'user',
          content: 'Local-only prompt',
          createdAt: '2026-05-21T09:58:00.000Z',
          model: 'llama-local',
        },
        {
          id: 'msg-answer',
          conversationId: 'local-conv',
          role: 'assistant',
          content: 'Local-only answer',
          createdAt: '2026-05-21T09:59:00.000Z',
          model: 'llama-local',
        },
      ],
    },
  });
}

describe('mobile local conversation forks', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  it('creates only a local copy fork and does not create a legacy remote handoff payload', async () => {
    const forkId = await useChatStore.getState().forkConversation('local-conv', {
      title: 'Local copy',
      model: 'llama-local',
    });

    const forkMessages = useChatStore.getState().messages[forkId] ?? [];
    expect(forkMessages).toHaveLength(2);
    expect(forkMessages[0]?.content).toBe('Local-only prompt');
    expect(
      forkMessages.some((message) => String(message.metadata?.kind ?? '').includes('handoff')),
    ).toBe(false);
    expect(useChatStore.getState().messages['local-conv']).toHaveLength(2);
  });

  it('does not touch remote chat APIs while mobile v1 is local-only', async () => {
    const state = useChatStore.getState();

    await state.loadConversations();
    const localId = await state.createConversation('Local only');
    await state.loadMessages(localId);
    await state.renameConversation(localId, 'Renamed local');
    await state.pinConversation(localId);
    await state.deleteConversation(localId);

    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});
