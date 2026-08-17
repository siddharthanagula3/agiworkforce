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
jest.mock('../services/managedCloudChat', () => ({
  managedCloudChat: {
    listConversations: jest.fn(),
    createConversation: jest.fn(),
    getConversation: jest.fn(),
    updateConversation: jest.fn(),
    deleteConversation: jest.fn(),
  },
}));

import { managedCloudChat } from '../services/managedCloudChat';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useTierStore } from '../src/features/billing/store';
import { applyConversationDeltas } from '../services/cloudSyncEngine';
import type { ChatMessage, ConversationSummary } from '../types/chat';
import { requireLocalModel, requireMobileCloudModel } from '../test-utils/modelFixtures';
import { canAccessCloudModelForTier } from '../src/features/model-picker/service';

const mockDelete = managedCloudChat.deleteConversation as jest.MockedFunction<
  typeof managedCloudChat.deleteConversation
>;
const mockGet = managedCloudChat.getConversation as jest.MockedFunction<
  typeof managedCloudChat.getConversation
>;
const mockPut = managedCloudChat.updateConversation as jest.MockedFunction<
  typeof managedCloudChat.updateConversation
>;
const T = '2026-06-20T00:00:00.000Z';
const CLOUD_MODEL_ID = requireMobileCloudModel().id;
const LOCAL_MODEL_ID = requireLocalModel().id;
const MAX_ONLY_MODEL_ID = requireMobileCloudModel(
  (model) =>
    canAccessCloudModelForTier(model.id, 'max') && !canAccessCloudModelForTier(model.id, 'pro'),
  'Max-only Mobile Cloud model',
).id;

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

function seedLocal(id: string, model = LOCAL_MODEL_ID): void {
  useChatMessageStore.setState({
    conversations: [
      {
        id,
        title: `Chat ${id}`,
        createdAt: T,
        updatedAt: T,
        messageCount: 0,
        pinned: false,
        model,
        provider: 'local',
        executionMode: 'local',
      },
    ],
    messages: { [id]: [] },
  });
}

function convTitle(id: string): string | undefined {
  return useChatCloudMessageStore.getState().conversations.find((c) => c.id === id)?.title;
}
function convExists(id: string): boolean {
  return useChatCloudMessageStore.getState().conversations.some((c) => c.id === id);
}
function convModel(id: string): string | undefined {
  return useChatCloudMessageStore.getState().conversations.find((c) => c.id === id)?.model;
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
  useWaitlistStore.setState({ cloudUnlocked: true });
  useTierStore.setState({ tier: 'max', billingTier: 'max' });
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

    expect(convExists('c1')).toBe(true);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledTimes(3);
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
    await useChatMessageStore.getState().renameConversation('c1', 'New');

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

    applyConversationDeltas([convDelta('c1', 'Old', null)]);
    expect(convTitle('c1')).toBe('New');

    applyConversationDeltas([convDelta('c1', 'Old', T)]);
    expect(convExists('c1')).toBe(false);
  });
});

describe('cloud conversation model durability', () => {
  it('updates the owning conversation and queues the model for cross-device sync', async () => {
    seedCloud('c1');
    mockPut.mockRejectedValue(new Error('HTTP 500'));

    const updated = await useChatMessageStore.getState().setConversationModel('c1', CLOUD_MODEL_ID);

    expect(updated).toBe(true);
    expect(convModel('c1')).toBe(CLOUD_MODEL_ID);
    expect(useCloudSyncStateStore.getState().dirtyConversationIds).toContain('c1');
    expect(mockPut).toHaveBeenCalledWith('c1', expect.objectContaining({ model: CLOUD_MODEL_ID }));
  });

  it('rejects a Local model before mutating or queueing a Cloud conversation', async () => {
    seedCloud('c1');

    const updated = await useChatMessageStore.getState().setConversationModel('c1', LOCAL_MODEL_ID);

    expect(updated).toBe(false);
    expect(convModel('c1')).toBeUndefined();
    expect(useCloudSyncStateStore.getState().dirtyConversationIds).not.toContain('c1');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('rejects a plan-locked Cloud model before mutation or sync', async () => {
    seedCloud('c1');
    useTierStore.setState({ tier: 'pro', billingTier: 'pro' });

    const updated = await useChatMessageStore
      .getState()
      .setConversationModel('c1', MAX_ONLY_MODEL_ID);

    expect(updated).toBe(false);
    expect(convModel('c1')).toBeUndefined();
    expect(useCloudSyncStateStore.getState().dirtyConversationIds).not.toContain('c1');
    expect(mockPut).not.toHaveBeenCalled();
  });
});

describe('local conversation model durability', () => {
  it('persists an eligible Local model without touching Cloud sync', async () => {
    seedLocal('local-1');

    const updated = await useChatMessageStore
      .getState()
      .setConversationModel('local-1', LOCAL_MODEL_ID);

    expect(updated).toBe(true);
    expect(
      useChatMessageStore.getState().conversations.find((item) => item.id === 'local-1')?.model,
    ).toBe(LOCAL_MODEL_ID);
    expect(useCloudSyncStateStore.getState().dirtyConversationIds).toEqual([]);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('rejects a Cloud model before mutating a Local conversation', async () => {
    seedLocal('local-1');

    const updated = await useChatMessageStore
      .getState()
      .setConversationModel('local-1', CLOUD_MODEL_ID);

    expect(updated).toBe(false);
    expect(
      useChatMessageStore.getState().conversations.find((item) => item.id === 'local-1')?.model,
    ).toBe(LOCAL_MODEL_ID);
    expect(useCloudSyncStateStore.getState().dirtyConversationIds).toEqual([]);
    expect(mockPut).not.toHaveBeenCalled();
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
        projectId: null,
        pinned: false,
        createdAt: T,
        updatedAt: T,
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
