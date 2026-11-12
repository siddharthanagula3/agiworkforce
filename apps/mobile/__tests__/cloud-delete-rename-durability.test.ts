import { Alert } from 'react-native';

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
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
import { useModelStore } from '../src/features/model-picker/store';
import { applyConversationDeltas } from '../services/cloudSyncEngine';
import type { ChatMessage, ConversationSummary } from '../types/chat';
import { requireLocalModel, requireMobileCloudModel } from '../test-utils/modelFixtures';
import { canAccessCloudModelForTier } from '../src/features/model-picker/service';
import * as artifactStore from '../src/features/artifacts/store';
import {
  activateCloudAccount,
  invalidateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

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
  invalidateCloudAccount();
  activateCloudAccount('history-test-owner');
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

describe('cloud conversation star and archive state', () => {
  it('receives a star set on another device and drops a conversation archived there', () => {
    applyConversationDeltas([{ ...convDelta('c1', 'Starred', null), starred: true }]);
    expect(
      useChatCloudMessageStore.getState().conversations.find((c) => c.id === 'c1')?.starred,
    ).toBe(true);

    applyConversationDeltas([
      { ...convDelta('c1', 'Starred', null), starred: false, server_version: '6' },
    ]);
    expect(
      useChatCloudMessageStore.getState().conversations.find((c) => c.id === 'c1')?.starred,
    ).toBe(false);

    applyConversationDeltas([
      { ...convDelta('c1', 'Starred', null), archived: true, server_version: '7' },
    ]);
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

  it('creates a Cloud chat with the model the person picked, not the server default', async () => {
    useModelStore.getState().setModel(CLOUD_MODEL_ID);
    const mockCreate = managedCloudChat.createConversation as jest.MockedFunction<
      typeof managedCloudChat.createConversation
    >;
    mockCreate.mockImplementation(
      async (request) =>
        ({
          id: request.id,
          title: request.title,
          model: request.model ?? 'auto',
          createdAt: T,
          updatedAt: T,
          messageCount: 0,
          pinned: false,
        }) as never,
    );

    const id = await useChatMessageStore.getState().createConversation('Picked model');

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: CLOUD_MODEL_ID }));
    expect(convModel(id)).toBe(CLOUD_MODEL_ID);
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

  it('keeps cached messages and flags the chat when a Cloud load fails, then clears on success', async () => {
    seedCloud('c1');
    const cached: ChatMessage[] = [
      {
        id: 'm-cached',
        conversationId: 'c1',
        role: 'user',
        content: 'Cached question',
        createdAt: '2026-06-20T00:00:01.000Z',
      },
    ];
    useChatCloudMessageStore.getState().setCloudMessages('c1', cached);
    mockGet.mockRejectedValueOnce(new Error('HTTP 503'));

    await useChatMessageStore.getState().loadMessages('c1');

    expect(useChatMessageStore.getState().messageLoadErrorConversationId).toBe('c1');
    expect(useChatCloudMessageStore.getState().messages['c1']).toEqual(cached);

    mockGet.mockResolvedValueOnce({
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
    } as never);

    await useChatMessageStore.getState().loadMessages('c1');

    expect(useChatMessageStore.getState().messageLoadErrorConversationId).toBeNull();
  });
});

describe('cloud history request and leaf ownership', () => {
  type Detail = Awaited<ReturnType<typeof managedCloudChat.getConversation>>;

  function detail(
    id: string,
    leaf: string | null = 'server-leaf',
    messages: Detail['messages'] = [],
  ): Detail {
    return {
      conversation: {
        id,
        title: `Chat ${id}`,
        projectId: null,
        pinned: false,
        starred: false,
        archived: false,
        isTemporary: false,
        activeLeafMessageId: leaf,
        createdAt: T,
        updatedAt: T,
      },
      messages,
      total: messages.length,
      hasMore: false,
    };
  }

  function pendingRead() {
    let resolve!: (value: Detail) => void;
    let reject!: (error: Error) => void;
    mockGet.mockImplementationOnce(
      () =>
        new Promise<Detail>((accept, fail) => {
          resolve = accept;
          reject = fail;
        }),
    );
    return { resolve: (value: Detail) => resolve(value), reject: (error: Error) => reject(error) };
  }

  function leaf(id = 'c1') {
    return useChatCloudMessageStore.getState().conversations.find((c) => c.id === id)
      ?.activeLeafMessageId;
  }

  afterEach(() => jest.restoreAllMocks());

  it.each(['same-value', 'aba', 'different'])(
    'preserves %s explicit leaf intent while accepting messages',
    async (kind) => {
      seedCloud('c1');
      useChatCloudMessageStore
        .getState()
        .patchCloudConversation('c1', { activeLeafMessageId: 'a' });
      const pending = pendingRead();
      const loading = useChatMessageStore.getState().loadMessages('c1');
      if (kind === 'aba')
        useChatCloudMessageStore
          .getState()
          .patchCloudConversation('c1', { activeLeafMessageId: 'b' });
      const intendedLeaf = kind === 'different' ? 'b' : 'a';
      useChatCloudMessageStore
        .getState()
        .patchCloudConversation('c1', { activeLeafMessageId: intendedLeaf });
      const message: Detail['messages'][number] = {
        id: 'm',
        conversationId: 'c1',
        role: 'user',
        content: 'Loaded',
        createdAt: T,
        inputTokens: 0,
        outputTokens: 0,
      };
      pending.resolve(detail('c1', 'server-leaf', [message]));
      await loading;
      expect(leaf()).toBe(intendedLeaf);
      expect(useChatCloudMessageStore.getState().messages['c1']).toEqual([message]);
    },
  );

  it('adopts the remote leaf despite mark-read and an omitted-leaf list refresh', async () => {
    seedCloud('c1');
    const pending = pendingRead();
    const loading = useChatMessageStore.getState().loadMessages('c1');
    useChatMessageStore.getState().markConversationRead('c1');
    useChatCloudMessageStore.getState().setCloudConversations([
      {
        id: 'c1',
        title: 'List title',
        createdAt: T,
        updatedAt: T,
        messageCount: 0,
        pinned: false,
      },
    ]);
    pending.resolve(detail('c1'));
    await loading;
    expect(leaf()).toBe('server-leaf');
    expect(convTitle('c1')).toBe('List title');
  });

  it('does not revive a removed and restored incarnation', async () => {
    seedCloud('c1');
    const original = useChatCloudMessageStore.getState().conversations[0]!;
    const pending = pendingRead();
    const loading = useChatMessageStore.getState().loadMessages('c1');
    useChatCloudMessageStore.getState().removeCloudConversation('c1');
    useChatCloudMessageStore
      .getState()
      .restoreCloudConversation({ ...original, activeLeafMessageId: 'restored' }, 0, []);
    expect(useChatMessageStore.getState().isLoadingMessages).toBe(false);
    pending.resolve(detail('c1'));
    await loading;
    expect(leaf()).toBe('restored');
  });

  it.each(['clear', 'list-remove'])(
    'retires history on %s before a same-ID reinsert',
    async (kind) => {
      seedCloud('c1');
      const pending = pendingRead();
      const loading = useChatMessageStore.getState().loadMessages('c1');
      if (kind === 'clear') useChatCloudMessageStore.getState().clearCloudData();
      else useChatCloudMessageStore.getState().setCloudConversations([]);
      seedCloud('c1', 'Replacement');
      pending.resolve(detail('c1'));
      await loading;
      expect(convTitle('c1')).toBe('Replacement');
      expect(leaf()).toBeUndefined();
      expect(useChatMessageStore.getState().isLoadingMessages).toBe(false);
    },
  );

  it('preserves an explicit null leaf received during pagination', async () => {
    seedCloud('c1');
    const pending = pendingRead();
    const loading = useChatMessageStore.getState().loadMessages('c1');
    useChatCloudMessageStore.getState().setCloudConversations([
      {
        id: 'c1',
        title: 'Chat c1',
        createdAt: T,
        updatedAt: T,
        messageCount: 0,
        pinned: false,
        activeLeafMessageId: null,
      },
    ]);
    pending.resolve(detail('c1'));
    await loading;
    expect(leaf()).toBeNull();
  });

  it('keeps loading true across distinct conversations and ignores older same-ID errors', async () => {
    seedCloud('c1');
    seedCloud('c2');
    const old = pendingRead();
    const oldLoad = useChatMessageStore.getState().loadMessages('c1');
    const other = pendingRead();
    const otherLoad = useChatMessageStore.getState().loadMessages('c2');
    const newest = pendingRead();
    const newestLoad = useChatMessageStore.getState().loadMessages('c1');
    old.reject(new Error('superseded'));
    await oldLoad;
    expect(useChatMessageStore.getState().messageLoadErrorConversationId).toBeNull();
    expect(useChatMessageStore.getState().isLoadingMessages).toBe(true);
    newest.resolve(detail('c1', 'newest'));
    await newestLoad;
    expect(useChatMessageStore.getState().isLoadingMessages).toBe(true);
    other.resolve(detail('c2'));
    await otherLoad;
    expect(useChatMessageStore.getState().isLoadingMessages).toBe(false);
    expect(leaf()).toBe('newest');
  });

  it('retires account work immediately and keeps a new account load owned', async () => {
    seedCloud('c1');
    const old = pendingRead();
    const oldLoad = useChatMessageStore.getState().loadMessages('c1');
    invalidateCloudAccount();
    expect(useChatMessageStore.getState().isLoadingMessages).toBe(false);
    useChatCloudMessageStore.getState().clearCloudData();
    activateCloudAccount('other-history-owner');
    seedCloud('c1');
    const current = pendingRead();
    const currentLoad = useChatMessageStore.getState().loadMessages('c1');
    old.resolve(detail('c1', 'old-owner'));
    await oldLoad;
    expect(leaf()).toBeUndefined();
    expect(useChatMessageStore.getState().isLoadingMessages).toBe(true);
    current.resolve(detail('c1', 'current-owner'));
    await currentLoad;
    expect(leaf()).toBe('current-owner');
  });

  it('ignores an older same-ID success after the newer load commits', async () => {
    seedCloud('c1');
    const older = pendingRead();
    const olderLoad = useChatMessageStore.getState().loadMessages('c1');
    const newer = pendingRead();
    const newerLoad = useChatMessageStore.getState().loadMessages('c1');
    newer.resolve(detail('c1', 'newer-leaf'));
    await newerLoad;
    const staleMessage: Detail['messages'][number] = {
      id: 'stale-message',
      conversationId: 'c1',
      role: 'user',
      content: 'Old history',
      createdAt: T,
      inputTokens: 0,
      outputTokens: 0,
    };
    older.resolve(detail('c1', 'older-leaf', [staleMessage]));
    await olderLoad;
    expect(leaf()).toBe('newer-leaf');
    expect(useChatCloudMessageStore.getState().messages['c1']).toEqual([]);
    expect(useChatMessageStore.getState().isLoadingMessages).toBe(false);
  });

  it('loads both valid pages before committing their messages and final leaf', async () => {
    seedCloud('c1');
    const firstMessage: Detail['messages'][number] = {
      id: 'm1',
      conversationId: 'c1',
      role: 'user',
      content: 'First page',
      createdAt: T,
      inputTokens: 0,
      outputTokens: 0,
    };
    const secondMessage: Detail['messages'][number] = {
      id: 'm2',
      conversationId: 'c1',
      role: 'assistant',
      content: 'Second page',
      createdAt: T,
      inputTokens: 0,
      outputTokens: 0,
    };
    mockGet.mockResolvedValueOnce({
      ...detail('c1', 'm1', [firstMessage]),
      total: 2,
      hasMore: true,
    });
    const second = pendingRead();
    const loading = useChatMessageStore.getState().loadMessages('c1');
    await Promise.resolve();
    expect(mockGet).toHaveBeenNthCalledWith(2, 'c1', { limit: 500, offset: 1 });
    expect(useChatCloudMessageStore.getState().messages['c1']).toEqual([]);
    expect(useChatMessageStore.getState().isLoadingMessages).toBe(true);
    second.resolve({ ...detail('c1', 'm2', [secondMessage]), total: 2 });
    await loading;
    expect(useChatCloudMessageStore.getState().messages['c1']).toEqual([
      firstMessage,
      secondMessage,
    ]);
    expect(leaf()).toBe('m2');
    expect(useChatMessageStore.getState().isLoadingMessages).toBe(false);
  });

  it('admits an unknown remote conversation only to Cloud with Cloud artifacts', async () => {
    const derive = jest.spyOn(artifactStore, 'deriveAndMapToMobileArtifacts').mockReturnValue([]);
    const message: Detail['messages'][number] = {
      id: 'm',
      conversationId: 'unknown',
      role: 'assistant',
      content: 'Answer',
      createdAt: T,
      inputTokens: 0,
      outputTokens: 0,
    };
    mockGet.mockResolvedValueOnce(detail('unknown', 'm', [message]));
    await useChatMessageStore.getState().loadMessages('unknown');
    const admitted = useChatCloudMessageStore
      .getState()
      .conversations.find((c) => c.id === 'unknown');
    expect(admitted?.executionMode).toBe('cloud');
    expect(admitted?.activeLeafMessageId).toBe('m');
    expect(useChatCloudMessageStore.getState().messages['unknown']).toEqual([message]);
    expect(useChatMessageStore.getState().messages['unknown']).toBeUndefined();
    expect(derive).toHaveBeenCalledWith(
      'Answer',
      'unknown',
      'm',
      T,
      'Chat unknown',
      expect.anything(),
      {
        scope: 'cloud',
        ownerId: 'history-test-owner',
      },
    );
  });

  it('does not admit denied or mismatched remote details', async () => {
    mockGet.mockRejectedValueOnce(new Error('HTTP 403'));
    await useChatMessageStore.getState().loadMessages('denied');
    expect(convExists('denied')).toBe(false);
    expect(useChatMessageStore.getState().messageLoadErrorConversationId).toBe('denied');
    mockGet.mockResolvedValueOnce(detail('another-conversation'));
    await useChatMessageStore.getState().loadMessages('requested');
    expect(convExists('requested')).toBe(false);
    expect(convExists('another-conversation')).toBe(false);
  });

  it('stops pagination after account invalidation rather than fetching with a new owner', async () => {
    seedCloud('c1');
    const pending = pendingRead();
    const loading = useChatMessageStore.getState().loadMessages('c1');
    invalidateCloudAccount();
    activateCloudAccount('other-history-owner');
    const firstMessage: Detail['messages'][number] = {
      id: 'm1',
      conversationId: 'c1',
      role: 'user',
      content: 'Valid first page',
      createdAt: T,
      inputTokens: 0,
      outputTokens: 0,
    };
    pending.resolve({ ...detail('c1', 'm1', [firstMessage]), total: 2, hasMore: true });
    await loading;
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(leaf()).toBeUndefined();
  });

  it('does not admit over a Local conversation created during the request', async () => {
    const pending = pendingRead();
    const loading = useChatMessageStore.getState().loadMessages('collision');
    seedLocal('collision');
    const local = useChatMessageStore.getState().conversations[0];
    pending.resolve(detail('collision'));
    await loading;
    expect(convExists('collision')).toBe(false);
    expect(useChatMessageStore.getState().conversations[0]).toBe(local);
    expect(useChatMessageStore.getState().messages['collision']).toEqual([]);
  });

  it('does not duplicate unknown admission when sync inserts the conversation first', async () => {
    const pending = pendingRead();
    const loading = useChatMessageStore.getState().loadMessages('c1');
    seedCloud('c1', 'Synced title');
    pending.resolve(detail('c1'));
    await loading;
    expect(
      useChatCloudMessageStore.getState().conversations.filter((c) => c.id === 'c1'),
    ).toHaveLength(1);
    expect(convTitle('c1')).toBe('Synced title');
    expect(leaf()).toBeUndefined();
  });

  it('re-reads subscriber message changes after leaf publication and derives only committed contents', async () => {
    seedCloud('c1');
    const derive = jest.spyOn(artifactStore, 'deriveAndMapToMobileArtifacts').mockReturnValue([]);
    const server: Detail['messages'][number] = {
      id: 'm',
      conversationId: 'c1',
      role: 'assistant',
      content: 'Server',
      createdAt: T,
      inputTokens: 0,
      outputTokens: 0,
    };
    useChatCloudMessageStore.getState().setCloudMessages('c1', [server]);
    const pending = pendingRead();
    const loading = useChatMessageStore.getState().loadMessages('c1');
    let changed = false;
    const unsubscribe = useChatCloudMessageStore.subscribe((state) => {
      if (
        changed ||
        state.conversations.find((c) => c.id === 'c1')?.activeLeafMessageId !== 'server-leaf'
      )
        return;
      changed = true;
      state.setCloudMessages('c1', [{ ...server, content: 'New local contents' }]);
    });
    pending.resolve(detail('c1', 'server-leaf', [server]));
    await loading;
    unsubscribe();
    expect(useChatCloudMessageStore.getState().messages['c1']?.[0]?.content).toBe(
      'New local contents',
    );
    expect(derive).toHaveBeenCalledWith(
      'New local contents',
      'c1',
      'm',
      T,
      'Chat c1',
      expect.anything(),
      {
        scope: 'cloud',
        ownerId: 'history-test-owner',
      },
    );
    expect(derive).not.toHaveBeenCalledWith(
      'Server',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
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

  it('caps a rename at the title length the server accepts', async () => {
    seedCloud('c1', 'Old');
    mockPut.mockResolvedValueOnce(undefined as never);

    await useChatMessageStore.getState().renameConversation('c1', 'x'.repeat(900));

    expect(convTitle('c1')).toHaveLength(500);
    expect(mockPut).toHaveBeenCalledWith('c1', { title: 'x'.repeat(500) });
  });

  it('keeps an open temporary chat when the list refresh omits it', () => {
    useChatCloudMessageStore.getState().addCloudConversation({
      id: 'temp',
      title: 'Temporary',
      createdAt: T,
      updatedAt: T,
      messageCount: 0,
      pinned: false,
      temporary: true,
    });

    useChatCloudMessageStore.getState().setCloudConversations([]);

    expect(convExists('temp')).toBe(true);
  });

  it('saves a temporary chat through the keep route and marks it permanent', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { api } = require('../services/api') as { api: { post: jest.Mock } };
    api.post.mockResolvedValueOnce({ conversation: { id: 'temp' } });
    useChatCloudMessageStore.getState().addCloudConversation({
      id: 'temp',
      title: 'Plans',
      createdAt: T,
      updatedAt: T,
      messageCount: 2,
      pinned: false,
      temporary: true,
    });
    useChatCloudMessageStore.getState().setCloudMessages('temp', [
      { id: '0190a000-0000-7000-8000-000000000001', role: 'user', content: 'Hi', createdAt: T },
      { id: 'local-2', role: 'assistant', content: 'Hello', createdAt: T, model: 'm' },
      { id: 'local-3', role: 'assistant', content: '', createdAt: T, isStreaming: true },
    ] as never);

    await useChatMessageStore.getState().keepTemporaryConversation('temp');

    expect(api.post).toHaveBeenCalledWith('/api/chat/conversations/temp/keep', {
      title: 'Plans',
      messages: [
        { id: '0190a000-0000-7000-8000-000000000001', role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello', model: 'm' },
      ],
    });
    expect(
      useChatCloudMessageStore.getState().conversations.find((c) => c.id === 'temp')?.temporary,
    ).toBe(false);
  });
});
