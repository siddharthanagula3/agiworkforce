import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke: (...args: unknown[]) => mocks.invoke(...args),
  isTauri: true,
  isTauriContext: vi.fn(() => true),
}));

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mocks.toastError(...args), success: vi.fn() },
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

import {
  clearIdMappings,
  dbIdToUuid,
  LOCAL_CONVERSATION_PAGE_SIZE,
  useChatMessageStore,
  useChatStore,
  uuidToDbId,
} from '../chatStore';
import { useAppModeStore } from '../../appModeStore';

type TauriMockModule = typeof import('../../../lib/tauri-mock');
type LocalstorageModule = typeof import('../../../utils/localStorage');

function backendRow(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    user_id: 'local-desktop-user',
    title: `Chat ${id}`,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    execution_mode: 'local_only',
    archived: false,
    pinned: false,
    project_id: null,
    ...extra,
  };
}

function seedSavedConversation(dbId: number, extra: Record<string, unknown> = {}): string {
  const id = dbIdToUuid(dbId);
  useChatStore.setState({
    conversations: [
      {
        id,
        title: `Chat ${dbId}`,
        pinned: false,
        archived: false,
        lastMessage: '',
        updatedAt: new Date(),
        executionMode: 'local_only',
        ...extra,
      },
    ],
    activeConversationId: id,
  });
  return id;
}

describe('Local chat history survives a restart and reports failed writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIdMappings();
    useAppModeStore.setState({ mode: 'local' });
    useChatStore.setState({
      conversations: [],
      messagesByConversation: {},
      activeConversationId: null,
      messages: [],
    });
  });

  it('reads archived, pinned and project from SQLite instead of resetting them', async () => {
    mocks.invoke.mockResolvedValueOnce([
      backendRow(1, { archived: true }),
      backendRow(2, { pinned: true, project_id: 'project-7' }),
    ]);

    await useChatStore.getState().loadConversations('local-desktop-user');

    const [first, second] = useChatStore.getState().conversations;
    expect(first).toMatchObject({ archived: true, pinned: false });
    expect(second).toMatchObject({ archived: false, pinned: true, projectId: 'project-7' });
  });

  it('pages past the first page so older chats are listed and addressable', async () => {
    const firstPage = Array.from({ length: LOCAL_CONVERSATION_PAGE_SIZE }, (_, index) =>
      backendRow(index + 1),
    );
    mocks.invoke.mockResolvedValueOnce(firstPage).mockResolvedValueOnce([backendRow(9_999)]);

    await useChatStore.getState().loadConversations('local-desktop-user');

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'chat_get_conversations', {
      userId: 'local-desktop-user',
      appMode: 'local',
      limit: LOCAL_CONVERSATION_PAGE_SIZE,
      offset: 0,
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'chat_get_conversations', {
      userId: 'local-desktop-user',
      appMode: 'local',
      limit: LOCAL_CONVERSATION_PAGE_SIZE,
      offset: LOCAL_CONVERSATION_PAGE_SIZE,
    });
    const conversations = useChatStore.getState().conversations;
    expect(conversations).toHaveLength(LOCAL_CONVERSATION_PAGE_SIZE + 1);
    expect(uuidToDbId(conversations.at(-1)!.id)).toBe(9_999);
  });

  it('keeps a chat that was never saved but drops a stored chat SQLite no longer has', async () => {
    const unsaved = useChatStore.getState().createConversation('Draft');
    const vanished = dbIdToUuid(77);
    useChatStore.setState((state) => ({
      conversations: [
        ...state.conversations,
        {
          id: vanished,
          title: 'Deleted elsewhere',
          pinned: false,
          lastMessage: '',
          updatedAt: new Date(),
          executionMode: 'local_only',
        },
      ],
    }));
    mocks.invoke.mockResolvedValueOnce([backendRow(1)]);

    await useChatStore.getState().loadConversations('local-desktop-user');

    const ids = useChatStore.getState().conversations.map((conversation) => conversation.id);
    expect(ids).toContain(unsaved);
    expect(ids).not.toContain(vanished);
  });

  it('surfaces a failed history load instead of showing an empty sidebar silently', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('database is locked'));

    await expect(useChatStore.getState().loadConversations('local-desktop-user')).rejects.toThrow(
      /database is locked/,
    );
  });

  it('writes a rename through to SQLite and restores the old title when it fails', async () => {
    const id = seedSavedConversation(5);
    mocks.invoke.mockRejectedValueOnce(new Error('disk full'));

    const saved = await useChatStore.getState().renameConversation(id, 'Quarterly plan');

    expect(saved).toBe(false);
    expect(mocks.invoke).toHaveBeenCalledWith('chat_update_conversation_title', {
      conversationId: 5,
      userId: 'local-desktop-user',
      title: 'Quarterly plan',
    });
    expect(useChatStore.getState().conversations[0]?.title).toBe('Chat 5');
    expect(mocks.toastError).toHaveBeenCalledWith('disk full');
  });

  it('keeps a chat in history when the SQLite delete fails', async () => {
    const id = seedSavedConversation(6);
    mocks.invoke.mockRejectedValueOnce(new Error('locked'));

    const deleted = await useChatStore.getState().deleteConversation(id);

    expect(deleted).toBe(false);
    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual([id]);
    expect(uuidToDbId(id)).toBe(6);
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it('removes the chat and its id mapping only after SQLite confirms the delete', async () => {
    const id = seedSavedConversation(8);
    mocks.invoke.mockResolvedValueOnce(undefined);

    const deleted = await useChatStore.getState().deleteConversation(id);

    expect(deleted).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith('chat_delete_conversation', {
      id: 8,
      userId: 'local-desktop-user',
    });
    expect(useChatStore.getState().conversations).toHaveLength(0);
    expect(uuidToDbId(id)).toBeUndefined();
  });

  it('persists a pin and undoes it when SQLite refuses', async () => {
    const id = seedSavedConversation(9);
    mocks.invoke.mockRejectedValueOnce(new Error('nope'));

    useChatStore.getState().togglePinnedConversation(id);
    expect(useChatStore.getState().conversations[0]?.pinned).toBe(true);
    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalled());

    expect(mocks.invoke).toHaveBeenCalledWith('chat_pin_conversation', {
      conversationId: 9,
      userId: 'local-desktop-user',
      pinned: true,
    });
    expect(useChatStore.getState().conversations[0]?.pinned).toBe(false);
  });

  it('restores the archive flag when the SQLite write fails', async () => {
    const id = seedSavedConversation(10);
    mocks.invoke.mockRejectedValueOnce(new Error('nope'));

    useChatStore.getState().archiveConversation(id);
    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalled());

    expect(useChatStore.getState().conversations[0]?.archived).toBe(false);
  });

  it('stores a project move on the conversation row', async () => {
    const id = seedSavedConversation(11);
    mocks.invoke.mockResolvedValueOnce(undefined);

    useChatStore.getState().setConversationProject(id, 'project-2');

    await vi.waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith('chat_set_conversation_project', {
        conversationId: 11,
        userId: 'local-desktop-user',
        projectId: 'project-2',
      }),
    );
    expect(useChatStore.getState().conversations[0]?.projectId).toBe('project-2');
  });

  it('asks for recent chats of the Local owner on the two on-device boundaries only', async () => {
    mocks.invoke.mockResolvedValueOnce([
      {
        conversation_id: 11,
        title: 'Chat 11',
        timestamp: '2026-10-01T10:00:00Z',
        message_count: 2,
      },
    ]);

    const recent = await useChatStore.getState().getRecentConversations(6);

    expect(mocks.invoke).toHaveBeenCalledWith('get_recent_conversations', {
      limit: 6,
      userId: 'local-desktop-user',
      executionModes: ['local_only', 'byok'],
    });
    expect(recent).toHaveLength(1);
  });

  it('never writes messages or temporary chats to renderer storage', () => {
    const kept = useChatStore.getState().createConversation('Kept');
    useChatStore.getState().createConversation('Temporary', { incognito: true });
    useChatStore.setState({
      messagesByConversation: { [kept]: [{ id: 'm1', role: 'user', content: 'hi' } as never] },
    });

    const partialize = useChatMessageStore.persist.getOptions().partialize!;
    const stored = partialize(useChatMessageStore.getState()) as Record<string, unknown> & {
      conversations: Array<{ id: string }>;
      activeConversationId: string | null;
    };

    expect(stored).not.toHaveProperty('messagesByConversation');
    expect(stored.conversations.map((conversation) => conversation.id)).toEqual([kept]);
    expect(stored.activeConversationId).toBeNull();
  });
});
