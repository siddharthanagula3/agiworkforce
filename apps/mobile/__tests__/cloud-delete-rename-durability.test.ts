/**
 * Mobile cloud conversation delete + rename durability (P2 silent-data-loss fix).
 *
 * Logic-level (not cross-device integration): only services/api and MMKV are
 * mocked; the real chat/cloud/sync-state stores run.
 *
 * Delete: a swallowed failure used to hide a conversation that still existed
 * server-side (privacy loss) and let it resurrect on the next pull. The fix
 * confirms the server delete (with retry) BEFORE hiding it locally, and
 * surfaces a hard failure instead of silently hiding it.
 *
 * Rename: a swallowed PUT failure used to strand the new title in this device's
 * cache, where the next list-replace/pull reverted it. The fix marks the
 * conversation dirty (sync-engine retry) and preserves the dirty title against
 * setCloudConversations / applyConversationDeltas until the push lands — while a
 * remote DELETE still always wins.
 */
import { Alert } from 'react-native';

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

import { api } from '../services/api';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { applyConversationDeltas } from '../services/cloudSyncEngine';
import type { ChatMessage, ConversationSummary } from '../types/chat';

const mockDelete = api.delete as jest.MockedFunction<typeof api.delete>;
const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPut = api.put as jest.MockedFunction<typeof api.put>;
const T = '2026-06-20T00:00:00.000Z';

function seedCloud(id: string, title = `Chat ${id}`): void {
  useChatCloudMessageStore.getState().addCloudConversation({
    id,
    title,
    createdAt: T,
    updatedAt: T,
    messageCount: 0,
    pinned: false,
  });
}

function convTitle(id: string): string | undefined {
  return useChatCloudMessageStore.getState().conversations.find((c) => c.id === id)?.title;
}
function convExists(id: string): boolean {
  return useChatCloudMessageStore.getState().conversations.some((c) => c.id === id);
}
function convDelta(id: string, title: string, deletedAt: string | null) {
  return {
    id,
    title,
    model: null,
    project_id: null,
    pinned: false,
    created_at: T,
    updated_at: T,
    deleted_at: deletedAt,
    server_version: '5',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {}, currentConversationId: null });
  useChatAppModeStore.getState().setAppMode('cloud');
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as never);
});

describe('cloud conversation delete durability', () => {
  it('removes locally only after the server acknowledges the delete', async () => {
    seedCloud('c1');
    mockDelete.mockResolvedValueOnce(undefined as never);

    await useChatMessageStore.getState().deleteConversation('c1');

    expect(convExists('c1')).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('keeps the conversation visible and alerts when the delete keeps failing (no silent privacy loss)', async () => {
    seedCloud('c1');
    mockDelete.mockRejectedValue(new Error('HTTP 500: boom'));

    await useChatMessageStore.getState().deleteConversation('c1');

    // Still present — the user is NOT told it is gone while it persists server-side.
    expect(convExists('c1')).toBe(true);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledTimes(3); // retried transient failures
  });

  it('treats a 404 as an already-deleted success (idempotent, no retry)', async () => {
    seedCloud('c1');
    mockDelete.mockRejectedValue(new Error('HTTP 404: not found'));

    await useChatMessageStore.getState().deleteConversation('c1');

    expect(convExists('c1')).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('recovers from a transient failure via retry', async () => {
    seedCloud('c1');
    mockDelete
      .mockRejectedValueOnce(new Error('HTTP 503: down'))
      .mockResolvedValueOnce(undefined as never);

    await useChatMessageStore.getState().deleteConversation('c1');

    expect(convExists('c1')).toBe(false);
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });
});

describe('cloud conversation rename durability', () => {
  it('marks the conversation dirty so the sync engine retries the rename', async () => {
    seedCloud('c1', 'Old');
    mockPut.mockResolvedValueOnce(undefined as never);

    await useChatMessageStore.getState().renameConversation('c1', 'New');

    expect(convTitle('c1')).toBe('New');
    expect(useCloudSyncStateStore.getState().dirtyConversationIds).toContain('c1');
  });

  it('keeps the rename locally and dirty when the PUT fails', async () => {
    seedCloud('c1', 'Old');
    mockPut.mockRejectedValue(new Error('HTTP 500'));

    await useChatMessageStore.getState().renameConversation('c1', 'New');

    expect(convTitle('c1')).toBe('New');
    expect(useCloudSyncStateStore.getState().dirtyConversationIds).toContain('c1');
  });

  it('setCloudConversations does NOT revert a locally-dirty rename (loadConversations clobber guard)', async () => {
    seedCloud('c1', 'Old');
    mockPut.mockRejectedValue(new Error('HTTP 500'));
    await useChatMessageStore.getState().renameConversation('c1', 'New'); // dirty, local title 'New'

    // loadConversations replaces the cache with a stale server snapshot (old title).
    useChatCloudMessageStore
      .getState()
      .setCloudConversations([
        { id: 'c1', title: 'Old', createdAt: T, updatedAt: T, messageCount: 0, pinned: false },
      ]);

    expect(convTitle('c1')).toBe('New');
  });

  it('setCloudConversations adopts the server title once the conversation is no longer dirty', async () => {
    seedCloud('c1', 'Old');
    mockPut.mockResolvedValueOnce(undefined as never);
    await useChatMessageStore.getState().renameConversation('c1', 'New');

    // A successful push clears the dirty flag.
    useCloudSyncStateStore.getState().clearDirty(['c1'], []);
    useChatCloudMessageStore.getState().setCloudConversations([
      {
        id: 'c1',
        title: 'Server-Renamed',
        createdAt: T,
        updatedAt: T,
        messageCount: 0,
        pinned: false,
      },
    ]);

    expect(convTitle('c1')).toBe('Server-Renamed');
  });

  it('setCloudConversations does not discard a previously observed server revision', () => {
    seedCloud('c1', 'Old');
    useChatCloudMessageStore.getState().patchCloudConversation('c1', { serverVersion: '7' });

    useChatCloudMessageStore.getState().setCloudConversations([
      {
        id: 'c1',
        title: 'Fresh list',
        createdAt: T,
        updatedAt: T,
        messageCount: 0,
        pinned: false,
      },
    ]);

    expect(
      useChatCloudMessageStore
        .getState()
        .conversations.find((conversation) => conversation.id === 'c1')?.serverVersion,
    ).toBe('7');
  });

  it('setCloudConversations preserves a dirty local create absent from the server snapshot', () => {
    seedCloud('c-new', 'Not pushed yet');
    useCloudSyncStateStore.getState().markConversationDirty('c-new');

    useChatCloudMessageStore.getState().setCloudConversations([]);

    expect(convExists('c-new')).toBe(true);
    expect(convTitle('c-new')).toBe('Not pushed yet');
  });

  it('applyConversationDeltas preserves a dirty rename, but a remote DELETE still wins', () => {
    seedCloud('c1', 'Old');
    useCloudSyncStateStore.getState().markConversationDirty('c1');
    useChatCloudMessageStore.getState().patchCloudConversation('c1', { title: 'New' });

    // Stale non-deleted delta with the old title must NOT revert the dirty rename.
    applyConversationDeltas([convDelta('c1', 'Old', null)]);
    expect(convTitle('c1')).toBe('New');

    // A tombstone delta MUST remove it even though it is dirty (delete wins).
    applyConversationDeltas([convDelta('c1', 'Old', T)]);
    expect(convExists('c1')).toBe(false);
  });
});

describe('cloud conversation message-load durability', () => {
  it('does not let a stale initial read erase a turn committed while the request is in flight', async () => {
    seedCloud('c1');
    let resolveRead!: (value: unknown) => void;
    mockGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }) as never,
    );

    const loadPromise = useChatMessageStore.getState().loadMessages('c1');
    await Promise.resolve();

    const optimisticMessages: ChatMessage[] = [
      {
        id: 'm-user',
        conversationId: 'c1',
        role: 'user',
        content: 'Hello from Mobile',
        createdAt: '2026-06-20T00:00:01.000Z',
      },
      {
        id: 'm-assistant',
        conversationId: 'c1',
        role: 'assistant',
        content: 'Streaming reply',
        createdAt: '2026-06-20T00:00:02.000Z',
        isStreaming: true,
      },
    ];
    useChatCloudMessageStore.getState().setCloudMessages('c1', optimisticMessages);
    useCloudSyncStateStore.getState().markMessageDirty('c1', 'm-user');

    resolveRead({
      conversation: {
        id: 'c1',
        title: 'Chat c1',
        model: null,
        project_id: null,
        pinned: false,
        starred: false,
        archived: false,
        is_temporary: false,
        created_at: T,
        updated_at: T,
      },
      messages: [],
      total: 0,
      hasMore: false,
    });
    await loadPromise;

    expect(useChatCloudMessageStore.getState().messages['c1']).toEqual(optimisticMessages);
  });
});

describe('cloud sync payload persistence', () => {
  function persistedCloudState(): {
    conversations: ConversationSummary[];
    messages: Record<string, ChatMessage[]>;
  } {
    const partialize = useChatCloudMessageStore.persist.getOptions().partialize;
    if (!partialize) throw new Error('cloud store persistence must define partialize');
    return partialize(useChatCloudMessageStore.getState()) as {
      conversations: ConversationSummary[];
      messages: Record<string, ChatMessage[]>;
    };
  }

  it('persists a dirty conversation even when it falls outside the clean cache cap', () => {
    for (let index = 0; index <= 200; index += 1) seedCloud(`c-${index}`);
    useCloudSyncStateStore.getState().markConversationDirty('c-0');

    expect(
      persistedCloudState().conversations.some((conversation) => conversation.id === 'c-0'),
    ).toBe(true);
  });

  it('persists a dirty message even when it falls outside the clean per-chat cap', () => {
    seedCloud('c1');
    const messages: ChatMessage[] = Array.from({ length: 101 }, (_, index) => ({
      id: `m-${index}`,
      conversationId: 'c1',
      role: 'user',
      content: `message ${index}`,
      createdAt: new Date(index).toISOString(),
    }));
    useChatCloudMessageStore.getState().setCloudMessages('c1', messages);
    useCloudSyncStateStore.getState().markMessageDirty('c1', 'm-0');

    expect(persistedCloudState().messages['c1']?.some((message) => message.id === 'm-0')).toBe(
      true,
    );
  });
});
