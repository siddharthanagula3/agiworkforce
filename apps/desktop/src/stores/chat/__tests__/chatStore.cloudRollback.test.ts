import { describe, it, expect, vi, beforeEach } from 'vitest';

const localStorageMock = {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

vi.mock('../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  isTauri: false,
  isTauriContext: vi.fn(() => false),
}));

vi.mock('../../utils/localStorage', () => ({
  safeGetJSON: vi.fn().mockReturnValue({ dbIdToUuid: {}, uuidToDbId: {} }),
  safeSetJSON: vi.fn().mockReturnValue(true),
  storageFallback: {
    length: 0,
    clear: vi.fn(),
    getItem: vi.fn().mockReturnValue(null),
    key: vi.fn().mockReturnValue(null),
    removeItem: vi.fn(),
    setItem: vi.fn(),
  },
}));

vi.mock('../appModeStore', () => ({
  useAppModeStore: {
    getState: vi.fn(() => ({ mode: 'cloud' })),
    subscribe: vi.fn(() => () => {}),
  },
  selectPrivacyMode: vi.fn(() => 'managed'),
}));

const createCloudConversation = vi.fn().mockRejectedValue(new Error('offline'));
vi.mock('../../services/cloudChat', () => ({
  createCloudConversation: (...args: unknown[]) => createCloudConversation(...args),
  getCloudConversations: vi.fn(),
  deleteCloudConversation: vi.fn(),
  getCloudMessages: vi.fn(),
}));

import { useChatStore } from '../chatStore';

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('DESKTOP-CLOUDROLLBACK-01: cloud-create failure must not lose a sent message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createCloudConversation.mockRejectedValue(new Error('offline'));
    useChatStore.setState({
      conversations: [],
      messagesByConversation: {},
      activeConversationId: null,
      messages: [],
    });
  });

  it('preserves a conversation that already holds a user message', async () => {
    const id = useChatStore.getState().createConversation('New chat');
    useChatStore.setState({
      messagesByConversation: { [id]: [{ id: 'm1', role: 'user', content: 'hello' } as never] },
    });

    await flushAsync();

    const state = useChatStore.getState();
    expect(state.messagesByConversation[id]).toBeDefined();
    expect(state.messagesByConversation[id]?.length).toBe(1);
    expect(state.conversations.some((c) => c.id === id)).toBe(true);
  });

  it('still discards an EMPTY optimistic conversation (original cleanup preserved)', async () => {
    const id = useChatStore.getState().createConversation('New chat');

    await flushAsync();

    const state = useChatStore.getState();
    expect(state.messagesByConversation[id]).toBeUndefined();
    expect(state.conversations.some((c) => c.id === id)).toBe(false);
  });

  it('seeds an empty Cloud boundary with an explicitly managed conversation', () => {
    useChatStore.getState().ensureActiveConversation();

    const state = useChatStore.getState();
    const active = state.conversations.find(
      (conversation) => conversation.id === state.activeConversationId,
    );
    expect(active?.executionMode).toBe('cloud_managed');
  });

  it('repairs a dangling active draft after concurrent Cloud hydration without losing messages', () => {
    const draftId = 'draft-created-before-the-second-hydration-finished';
    const draftMessage = { id: 'm-draft', role: 'user', content: 'Keep this draft' } as never;
    useChatStore.setState({
      conversations: [],
      activeConversationId: draftId,
      messagesByConversation: { [draftId]: [draftMessage] },
      messages: [],
    });

    useChatStore.getState().ensureActiveConversation();

    const state = useChatStore.getState();
    expect(state.activeConversationId).toBe(draftId);
    expect(state.conversations).toEqual([
      expect.objectContaining({ id: draftId, executionMode: 'cloud_managed' }),
    ]);
    expect(state.messagesByConversation[draftId]).toEqual([draftMessage]);
    expect(state.messages).toEqual([draftMessage]);
  });
});
