import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke: vi.fn(),
  isTauriContext: vi.fn(() => false),
}));

vi.mock('../../../utils/localStorage', async (importOriginal) => ({
  ...(await importOriginal<LocalstorageModule>()),
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

vi.mock('../../../api/byok', () => ({
  createByokFork: vi.fn(),
  deleteApiKey: vi.fn(),
  listSavedApiKeys: vi.fn(),
}));

import { createByokFork } from '../../../api/byok';
import { useAppModeStore } from '../../appModeStore';
import { clearIdMappings, useChatStore, uuidToDbId } from '../chatStore';

type TauriMockModule = typeof import('../../../lib/tauri-mock');
type LocalstorageModule = typeof import('../../../utils/localStorage');

function resetConversations() {
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    messagesByConversation: {},
    messages: [],
  });
}

describe('chatStore BYOK conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIdMappings();
    resetConversations();
    useAppModeStore.setState({ mode: 'local' });
  });

  it('creates an empty BYOK conversation by explicit choice and makes it active', () => {
    const id = useChatStore.getState().createByokConversation();
    const state = useChatStore.getState();

    expect(state.activeConversationId).toBe(id);
    expect(state.conversations[0]).toMatchObject({ id, executionMode: 'byok' });
    expect(state.messagesByConversation[id]).toEqual([]);
  });

  it('refuses a BYOK conversation in Managed Cloud mode', () => {
    useAppModeStore.setState({ mode: 'cloud' });

    expect(() => useChatStore.getState().createByokConversation()).toThrow(/Local mode/);
    expect(useChatStore.getState().conversations).toHaveLength(0);
  });

  it('saves a consented fork as its own backend conversation and leaves the source alone', async () => {
    vi.mocked(createByokFork).mockResolvedValue(42);
    const { createConversation, addMessage } = useChatStore.getState();
    const sourceId = createConversation('Local thread');
    addMessage({ role: 'user', content: 'My key is sk-local-secret' });
    addMessage({ role: 'assistant', content: 'Local answer' });
    const sourceMessages = useChatStore.getState().messagesByConversation[sourceId] ?? [];

    const forkId = useChatStore.getState().forkConversationForByok(sourceId, {
      approvedContext: [
        { messageId: sourceMessages[0]!.id, redactedContent: 'My key is [REDACTED]' },
        { messageId: sourceMessages[1]!.id, redactedContent: 'Local answer' },
      ],
    });
    await useChatStore.getState().persistByokFork(forkId!);

    expect(createByokFork).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Local thread (BYOK fork)',
        messages: [
          { role: 'user', content: 'My key is [REDACTED]' },
          { role: 'assistant', content: 'Local answer' },
        ],
      }),
    );
    expect(uuidToDbId(forkId!)).toBe(42);
    const state = useChatStore.getState();
    expect(state.conversations.find((c) => c.id === sourceId)?.executionMode).toBe('local_only');
    expect(state.messagesByConversation[sourceId]?.[0]?.content).toBe('My key is sk-local-secret');
  });

  it('removes the fork when the backend refuses it, so no unsaved BYOK chat lingers', async () => {
    vi.mocked(createByokFork).mockRejectedValue(new Error('database locked'));
    const { createConversation, addMessage } = useChatStore.getState();
    const sourceId = createConversation('Local thread');
    addMessage({ role: 'user', content: 'Question' });
    const messageId = useChatStore.getState().messagesByConversation[sourceId]![0]!.id;
    const forkId = useChatStore.getState().forkConversationForByok(sourceId, {
      approvedContext: [{ messageId, redactedContent: 'Question' }],
    });

    await expect(useChatStore.getState().persistByokFork(forkId!)).rejects.toThrow(
      'database locked',
    );

    const state = useChatStore.getState();
    expect(state.conversations.some((c) => c.id === forkId)).toBe(false);
    expect(state.messagesByConversation[forkId!]).toBeUndefined();
    expect(state.conversations.some((c) => c.id === sourceId)).toBe(true);
  });

  it('will not save a Local conversation through the BYOK path', async () => {
    const id = useChatStore.getState().createConversation('Local thread');

    await expect(useChatStore.getState().persistByokFork(id)).rejects.toThrow(/BYOK fork/);
    expect(createByokFork).not.toHaveBeenCalled();
  });
});
