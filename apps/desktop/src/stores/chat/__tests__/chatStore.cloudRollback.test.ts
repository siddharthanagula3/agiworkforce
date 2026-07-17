/**
 * DESKTOP-CLOUDROLLBACK-01 regression guard.
 *
 * When a chat is created in cloud mode and the async `createCloudConversation`
 * rejects (offline / auth failure), the rollback must NOT silently discard a
 * conversation the user has already typed a message into. It may only clean up
 * an EMPTY optimistic conversation. Losing a sent message with no feedback is a
 * production data-loss bug.
 */
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

// Force cloud mode so createConversation takes the cloud-create path.
vi.mock('../appModeStore', () => ({
  useAppModeStore: {
    getState: vi.fn(() => ({ mode: 'cloud' })),
    subscribe: vi.fn(() => () => {}),
  },
  selectPrivacyMode: vi.fn(() => 'managed'),
}));

// createCloudConversation rejects to exercise the rollback `.catch`.
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
    // The user sends a message into the optimistic conversation BEFORE the async
    // cloud-create rejection lands.
    useChatStore.setState({
      messagesByConversation: { [id]: [{ id: 'm1', role: 'user', content: 'hello' } as never] },
    });

    await flushAsync(); // let the rejected promise's `.catch` run

    const state = useChatStore.getState();
    expect(state.messagesByConversation[id]).toBeDefined();
    expect(state.messagesByConversation[id]?.length).toBe(1);
    expect(state.conversations.some((c) => c.id === id)).toBe(true);
  });

  it('still discards an EMPTY optimistic conversation (original cleanup preserved)', async () => {
    const id = useChatStore.getState().createConversation('New chat');
    // No message added → empty optimistic conversation.

    await flushAsync();

    const state = useChatStore.getState();
    expect(state.messagesByConversation[id]).toBeUndefined();
    expect(state.conversations.some((c) => c.id === id)).toBe(false);
  });
});
