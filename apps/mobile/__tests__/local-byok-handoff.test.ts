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

jest.mock('@/src/features/memory/store', () => ({
  retrieveMemoryContext: jest.fn(async () => []),
}));

jest.mock('@/src/features/memory/services/personalContext', () => ({
  buildPersonalContextBlocks: jest.fn(() => []),
}));

jest.mock('@/src/features/memory/services/pastChatContext', () => ({
  retrievePastChatContext: jest.fn(async () => null),
}));

jest.mock('@/src/features/memory/services/consolidation', () => ({
  consolidateFactsFromTurn: jest.fn(),
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
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useProjectStore } from '../src/features/projects/store';
import { retrieveMemoryContext } from '../src/features/memory/store';
import { buildPersonalContextBlocks } from '../src/features/memory/services/personalContext';
import { consolidateFactsFromTurn } from '../src/features/memory/services/consolidation';

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
        model: 'llama-local',
        provider: 'local',
        executionMode: 'local',
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
  useProjectStore.setState({
    projects: [
      {
        id: 'local-project',
        name: 'Local Project',
        description: '',
        instructions: 'Never leave Local Mode.',
        sources: [],
        createdAt: '2026-05-21T09:00:00.000Z',
        updatedAt: '2026-05-21T09:00:00.000Z',
      },
    ],
    activeProjectId: null,
  });
}

describe('mobile local conversation forks', () => {
  beforeEach(() => {
    resetStore();
    useChatAppModeStore.setState({ appMode: 'local' });
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

  it('keeps a local fork local even when the visible app mode is cloud', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const forkId = await useChatStore.getState().forkConversation('local-conv', {
      title: 'Still local',
      model: 'llama-local',
    });

    const fork = useChatStore
      .getState()
      .conversations.find((conversation) => conversation.id === forkId);
    expect(fork).toMatchObject({
      title: 'Still local',
      model: 'llama-local',
      provider: 'local',
      executionMode: 'local',
    });
    expect(api.post).not.toHaveBeenCalled();
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

  it('does not create a local fallback conversation while Cloud mode is selected', async () => {
    useProjectStore.getState().setActiveProject('local-project');
    useChatAppModeStore.setState({ appMode: 'cloud' });

    // Cloud chat is enabled now, so Cloud mode attempts a real cloud conversation;
    // with no reachable cloud in the test env it fails — but it must NOT silently
    // fall back to a local conversation (the strict Local/Cloud separation invariant).
    await expect(useChatStore.getState().createConversation('Cloud attempt')).rejects.toThrow(
      'AGI Cloud conversation could not be created.',
    );

    expect(
      useChatStore
        .getState()
        .conversations.some((conversation) => conversation.title === 'Cloud attempt'),
    ).toBe(false);
    expect(
      useChatStore
        .getState()
        .conversations.some((conversation) => conversation.projectId === 'local-project'),
    ).toBe(false);
  });

  it('rejects cross-mode sends before reading local memory or personalization', async () => {
    useChatStore.setState((state) => ({
      conversations: [
        ...state.conversations,
        {
          id: 'cloud-conv',
          title: 'Cloud thread',
          updatedAt: '2026-05-21T10:00:00.000Z',
          createdAt: '2026-05-21T10:00:00.000Z',
          messageCount: 0,
          pinned: false,
          provider: 'cloud_managed',
          executionMode: 'cloud',
        },
      ],
      messages: { ...state.messages, 'cloud-conv': [] },
    }));

    await useChatStore.getState().sendMessage('cloud-conv', 'Use my local memory', 'llama-local');

    expect(useChatStore.getState().error).toBe(
      'This is an AGI Cloud chat. Start a separate Local Mode chat to use local models.',
    );
    expect(retrieveMemoryContext).not.toHaveBeenCalled();
    expect(buildPersonalContextBlocks).not.toHaveBeenCalled();
    expect(consolidateFactsFromTurn).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
