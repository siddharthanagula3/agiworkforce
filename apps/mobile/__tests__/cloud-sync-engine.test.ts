/**
 * Mobile cloud sync engine (P2 Phase 1).
 *
 * Verifies the managed-only delta-sync loop end-to-end against the REAL cloud +
 * sidecar stores (only `services/api` and MMKV are mocked):
 *   - Local mode is an airtight no-op — zero network I/O.
 *   - Pull applies conversation/message deltas, honors tombstones, advances the cursor.
 *   - Push sends dirty rows, skips non-syncable (tool) roles, and clears the queue.
 *   - Pagination follows `hasMore`; a failed round trip surfaces as `error` status.
 */
import type { ChatMessage, ConversationSummary } from '../types/chat';

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
  api: { get: jest.fn(), post: jest.fn() },
}));

import { api } from '../services/api';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import {
  syncNow,
  markConversationForSync,
  markMessageForSync,
  isManagedSyncEnabled,
} from '../services/cloudSyncEngine';

const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;

const T = '2026-06-20T00:00:00.000Z';

interface PullPage {
  conversations: unknown[];
  messages: unknown[];
  cursor: string;
  hasMore: boolean;
}

function emptyPull(cursor = '0'): PullPage {
  return { conversations: [], messages: [], cursor, hasMore: false };
}

function convDelta(id: string, serverVersion: string, deletedAt: string | null = null) {
  return {
    id,
    title: `Chat ${id}`,
    model: null,
    project_id: null,
    pinned: false,
    created_at: T,
    updated_at: T,
    deleted_at: deletedAt,
    server_version: serverVersion,
  };
}

function msgDelta(id: string, conversationId: string, serverVersion: string) {
  return {
    id,
    conversation_id: conversationId,
    role: 'user' as const,
    content: `body ${id}`,
    model: null,
    provider: null,
    created_at: T,
    updated_at: T,
    deleted_at: null,
    server_version: serverVersion,
  };
}

function seedConversation(id: string, extra: Partial<ConversationSummary> = {}): void {
  useChatCloudMessageStore.getState().addCloudConversation({
    id,
    title: `Chat ${id}`,
    createdAt: T,
    updatedAt: T,
    messageCount: 0,
    pinned: false,
    ...extra,
  });
}

function seedMessage(conversationId: string, msg: Partial<ChatMessage> & { id: string }): void {
  const existing = useChatCloudMessageStore.getState().messages[conversationId] ?? [];
  useChatCloudMessageStore
    .getState()
    .setCloudMessages(conversationId, [
      ...existing,
      { role: 'user', content: 'hi', createdAt: T, ...msg } as ChatMessage,
    ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatAppModeStore.getState().setAppMode('cloud');
  mockGet.mockResolvedValue(emptyPull() as never);
  // Default: the server ACKS exactly what was posted (a healthy round trip).
  mockPost.mockImplementation((async (
    _path: string,
    body: { conversations?: Array<{ id: string }>; messages?: Array<{ id: string }> },
  ) => ({
    applied: {
      conversations: (body?.conversations ?? []).map((c) => ({ id: c.id, server_version: '1' })),
      messages: (body?.messages ?? []).map((m) => ({ id: m.id, server_version: '1' })),
    },
    cursor: '1',
  })) as never);
});

describe('isManagedSyncEnabled', () => {
  it('is true only in cloud mode', () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    expect(isManagedSyncEnabled()).toBe(true);
    useChatAppModeStore.getState().setAppMode('local');
    expect(isManagedSyncEnabled()).toBe(false);
  });
});

describe('syncNow — managed gating', () => {
  it('makes ZERO network calls in local mode', async () => {
    useChatAppModeStore.getState().setAppMode('local');
    await syncNow();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
    expect(useCloudSyncStateStore.getState().status).toBe('idle');
  });
});

describe('syncNow — pull', () => {
  it('applies conversation + message deltas and advances the cursor', async () => {
    mockGet.mockResolvedValueOnce({
      conversations: [convDelta('c1', '5')],
      messages: [msgDelta('m1', 'c1', '6')],
      cursor: '6',
      hasMore: false,
    } as never);

    await syncNow();

    const cloud = useChatCloudMessageStore.getState();
    expect(cloud.conversations.map((c) => c.id)).toContain('c1');
    expect((cloud.messages.c1 ?? []).map((m) => m.id)).toEqual(['m1']);

    const sync = useCloudSyncStateStore.getState();
    expect(sync.cursor).toBe('6');
    expect(sync.status).toBe('idle');
    expect(sync.lastSyncAt).not.toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/api/chat/sync?since=0');
  });

  it('removes a conversation when a deleted_at tombstone is pulled', async () => {
    seedConversation('c1');
    mockGet.mockResolvedValueOnce({
      conversations: [convDelta('c1', '9', T)],
      messages: [],
      cursor: '9',
      hasMore: false,
    } as never);

    await syncNow();

    expect(
      useChatCloudMessageStore.getState().conversations.find((c) => c.id === 'c1'),
    ).toBeUndefined();
    expect(useCloudSyncStateStore.getState().cursor).toBe('9');
  });

  it('follows pagination until hasMore is false, ending at the latest cursor', async () => {
    mockGet
      .mockResolvedValueOnce({
        conversations: [convDelta('c1', '10')],
        messages: [],
        cursor: '10',
        hasMore: true,
      } as never)
      .mockResolvedValueOnce({
        conversations: [convDelta('c2', '20')],
        messages: [],
        cursor: '20',
        hasMore: false,
      } as never);

    await syncNow();

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenNthCalledWith(1, '/api/chat/sync?since=0');
    expect(mockGet).toHaveBeenNthCalledWith(2, '/api/chat/sync?since=10');
    expect(useCloudSyncStateStore.getState().cursor).toBe('20');
  });

  it('trusts the server safe cursor and never overshoots to a per-row max', async () => {
    // Saturation page: a message at server_version 99 whose parent conversation is
    // in a LATER page. The server returns a SAFE cursor (10) bounded to the lagging
    // table's frontier. The client must persist 10 — NOT 99 — or the in-gap rows
    // (10..99) would be skipped on the next pull and lost forever.
    mockGet
      .mockResolvedValueOnce({
        conversations: [convDelta('c1', '8')],
        messages: [msgDelta('m1', 'c1', '99')],
        cursor: '10',
        hasMore: true,
      } as never)
      .mockResolvedValueOnce(emptyPull('10') as never);

    await syncNow();

    // The message at sv 99 was applied, but the cursor follows the server (10), not 99.
    expect((useChatCloudMessageStore.getState().messages.c1 ?? []).map((m) => m.id)).toEqual([
      'm1',
    ]);
    expect(useCloudSyncStateStore.getState().cursor).toBe('10');
    expect(mockGet).toHaveBeenNthCalledWith(2, '/api/chat/sync?since=10');
  });
});

describe('syncNow — push', () => {
  it('pushes dirty conversations + messages, then clears the dirty queue', async () => {
    seedConversation('c1', { model: 'gpt-5.4', messageCount: 1 });
    seedMessage('c1', { id: 'm1', role: 'user', content: 'hi there' });
    markConversationForSync('c1');
    markMessageForSync('c1', 'm1');

    await syncNow();

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [path, body] = mockPost.mock.calls[0] as [
      string,
      { conversations: unknown[]; messages: unknown[] },
    ];
    expect(path).toBe('/api/chat/sync');
    expect(body.conversations).toHaveLength(1);
    expect(body.conversations[0]).toMatchObject({ id: 'c1', title: 'Chat c1', model: 'gpt-5.4' });
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toMatchObject({
      id: 'm1',
      conversationId: 'c1',
      role: 'user',
      content: 'hi there',
    });

    const sync = useCloudSyncStateStore.getState();
    expect(sync.dirtyConversationIds).toEqual([]);
    expect(sync.dirtyMessages).toEqual([]);
  });

  it('does not push tool-role messages (and posts nothing when only a tool msg is dirty)', async () => {
    seedConversation('c1');
    seedMessage('c1', { id: 'mt', role: 'tool', content: '{}' });
    markMessageForSync('c1', 'mt');

    await syncNow();

    expect(mockPost).not.toHaveBeenCalled();
    // The non-syncable ref is still cleared so it doesn't wedge the queue forever.
    expect(useCloudSyncStateStore.getState().dirtyMessages).toEqual([]);
  });

  it('runs push before pull so a new conversation exists server-side for its messages', async () => {
    seedConversation('c1', { messageCount: 1 });
    seedMessage('c1', { id: 'm1', role: 'user', content: 'first' });
    markConversationForSync('c1');
    markMessageForSync('c1', 'm1');
    const order: string[] = [];
    mockPost.mockImplementationOnce(async () => {
      order.push('push');
      return { applied: { conversations: [], messages: [] }, cursor: '0' } as never;
    });
    mockGet.mockImplementationOnce(async () => {
      order.push('pull');
      return emptyPull() as never;
    });

    await syncNow();

    expect(order).toEqual(['push', 'pull']);
  });

  it('keeps an un-acked message dirty (parent not on server yet) instead of dropping it', async () => {
    seedConversation('c1', { messageCount: 1 });
    seedMessage('c1', { id: 'm1', role: 'user', content: 'orphan' });
    markMessageForSync('c1', 'm1'); // conversation intentionally NOT marked dirty
    // Server rejects the message (parent missing → EXISTS fails): applied.messages empty.
    mockPost.mockImplementationOnce((async () => ({
      applied: { conversations: [], messages: [] },
      cursor: '0',
    })) as never);

    await syncNow();

    // The ref survives so a later push retries it once the conversation lands — no silent loss.
    expect(useCloudSyncStateStore.getState().dirtyMessages).toEqual([
      { conversationId: 'c1', messageId: 'm1' },
    ]);
  });
});

describe('syncNow — failures', () => {
  it('surfaces a failed pull as error status', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));

    await syncNow();

    const sync = useCloudSyncStateStore.getState();
    expect(sync.status).toBe('error');
    expect(sync.lastError).toContain('network down');
  });
});
