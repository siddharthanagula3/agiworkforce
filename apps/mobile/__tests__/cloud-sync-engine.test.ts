/**
 * Mobile cloud sync engine (P2 Phase 1).
 *
 * Verifies the managed-only delta-sync loop end-to-end against the REAL cloud +
 * sidecar stores (only `services/api` and MMKV are mocked):
 *   - Local mode is an airtight no-op — zero network I/O.
 *   - Pull applies conversation/message deltas, honors tombstones, advances the cursor.
 *   - Pull applies artifact deltas into cloudArtifacts; tombstones remain as delete overlays.
 *   - Local-mode artifacts are never pushed (mobile is pull-only per design doc §4).
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
import { useArtifactStore } from '../src/features/artifacts/store';
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
  artifacts?: unknown[];
  cursor: string;
  hasMore: boolean;
}

function emptyPull(cursor = '0'): PullPage {
  return { conversations: [], messages: [], artifacts: [], cursor, hasMore: false };
}

/** Build an artifact wire delta (snake_case, as returned by GET /api/chat/sync). */
function artifactDelta(
  id: string,
  serverVersion: string,
  opts: { deletedAt?: string | null; content?: string; artifactType?: string } = {},
) {
  return {
    id,
    conversation_id: 'c-art',
    message_id: 'm-art',
    title: `Artifact ${id}`,
    artifact_type: opts.artifactType ?? 'code',
    language: 'typescript',
    content: opts.content ?? `console.log('${id}')`,
    current_version: 1,
    pinned: false,
    tags: [],
    created_at: T,
    updated_at: T,
    deleted_at: opts.deletedAt ?? null,
    server_version: serverVersion,
  };
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
    input_tokens: 0,
    output_tokens: 0,
    cost_cents: 0,
    metadata: null,
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
  useArtifactStore.getState().clearCloudArtifacts();
  useChatAppModeStore.getState().setAppMode('cloud');
  // Contract-valid empty pulls per endpoint — the engine schema-validates every
  // response, so a chat-shaped page for memory/projects/settings fails the parse.
  mockGet.mockImplementation((async (path: string) => {
    if (path.startsWith('/api/memory/sync')) return { memories: [], cursor: '0', hasMore: false };
    if (path.startsWith('/api/projects/sync')) return { projects: [], cursor: '0', hasMore: false };
    if (path.startsWith('/api/settings/sync')) return { settings: {}, cursor: '0', hasMore: false };
    return emptyPull();
  }) as never);
  // Default: the server ACKS exactly what was posted (a healthy round trip).
  mockPost.mockImplementation((async (
    _path: string,
    body: { conversations?: Array<{ id: string }>; messages?: Array<{ id: string }> },
  ) => ({
    protocolVersion: 2,
    applied: {
      conversations: (body?.conversations ?? []).map((c) => ({ id: c.id, server_version: '1' })),
      messages: (body?.messages ?? []).map((m) => ({ id: m.id, server_version: '1' })),
      artifacts: [],
    },
    conflicts: { conversations: [], messages: [], artifacts: [] },
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
      artifacts: [],
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
      artifacts: [],
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
    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/memory/sync')) {
        return { memories: [], cursor: '0', hasMore: false } as never;
      }
      // First chat call returns page 1, second returns page 2.
      const chatCalls = mockGet.mock.calls.filter((c) =>
        (c[0] as string).startsWith('/api/chat/sync'),
      ).length;
      if (chatCalls <= 1) {
        return {
          conversations: [convDelta('c1', '10')],
          messages: [],
          artifacts: [],
          cursor: '10',
          hasMore: true,
        } as never;
      }
      return {
        conversations: [convDelta('c2', '20')],
        messages: [],
        artifacts: [],
        cursor: '20',
        hasMore: false,
      } as never;
    });

    await syncNow();

    // Chat sync should have been called exactly twice (2 pages); memory sync once.
    const chatCalls = mockGet.mock.calls.filter((c) =>
      (c[0] as string).startsWith('/api/chat/sync'),
    );
    expect(chatCalls).toHaveLength(2);
    expect(chatCalls[0]![0]).toBe('/api/chat/sync?since=0');
    expect(chatCalls[1]![0]).toBe('/api/chat/sync?since=10');
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
        artifacts: [],
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
    expect(body).toMatchObject({ protocolVersion: 2 });
    expect(body.conversations[0]).toMatchObject({ baseVersion: '0' });
    expect(body.conversations[0]).not.toHaveProperty('updatedAt');
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

  it('preserves an edit made while a conversation push is in flight', async () => {
    seedConversation('c1', { title: 'sent', serverVersion: '7' });
    markConversationForSync('c1');
    mockPost.mockImplementationOnce(async () => {
      useChatCloudMessageStore.getState().patchCloudConversation('c1', { title: 'edited later' });
      return {
        protocolVersion: 2,
        applied: {
          conversations: [{ id: 'c1', server_version: '8' }],
          messages: [],
          artifacts: [],
        },
        conflicts: { conversations: [], messages: [], artifacts: [] },
        cursor: '8',
      } as never;
    });

    await syncNow();

    const latest = useChatCloudMessageStore.getState().conversations.find((c) => c.id === 'c1');
    expect(latest).toMatchObject({ title: 'edited later', serverVersion: '8' });
    expect(useCloudSyncStateStore.getState().dirtyConversationIds).toContain('c1');
  });

  it('adopts the deterministic server winner for a stale conversation CAS conflict', async () => {
    seedConversation('c1', { title: 'stale local', serverVersion: '7' });
    markConversationForSync('c1');
    mockPost.mockImplementationOnce(
      async () =>
        ({
          protocolVersion: 2,
          applied: { conversations: [], messages: [], artifacts: [] },
          conflicts: {
            conversations: [{ id: 'c1', current: convDelta('c1', '8') }],
            messages: [],
            artifacts: [],
          },
          cursor: '8',
        }) as never,
    );

    await syncNow();

    expect(
      useChatCloudMessageStore.getState().conversations.find((c) => c.id === 'c1'),
    ).toMatchObject({
      title: 'Chat c1',
      serverVersion: '8',
    });
    expect(useCloudSyncStateStore.getState().dirtyConversationIds).not.toContain('c1');
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
      return {
        protocolVersion: 2,
        applied: { conversations: [], messages: [], artifacts: [] },
        conflicts: { conversations: [], messages: [], artifacts: [] },
        cursor: '0',
      } as never;
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
      protocolVersion: 2,
      applied: { conversations: [], messages: [], artifacts: [] },
      conflicts: { conversations: [], messages: [], artifacts: [] },
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

// ── Artifact pull wiring (migration 0039) ─────────────────────────────────────
//
// Verdict: PULL is ALREADY WIRED in cloudSyncEngine.ts:76 (PullResponse includes
// `artifacts: ArtifactWireDelta[]`) and :185 (applyCloudArtifactDeltas called on
// every page). PUSH is intentionally absent — mobile is pull-only per design doc
// §4: "Web + mobile push NOTHING for now (view-only; all their artifacts are
// re-derivable)." These tests prove the pull wiring and document the intent.

describe('syncNow — artifact pull wiring (migration 0039)', () => {
  it('applies pulled artifacts into cloudArtifacts on the artifact store', async () => {
    mockGet.mockResolvedValueOnce({
      conversations: [],
      messages: [],
      artifacts: [artifactDelta('art1', '7')],
      cursor: '7',
      hasMore: false,
    } as never);

    await syncNow();

    const cloudArts = useArtifactStore.getState().cloudArtifacts;
    expect(cloudArts).toHaveLength(1);
    expect(cloudArts[0]?.id).toBe('art1');
    expect(cloudArts[0]?.type).toBe('code');
    expect(cloudArts[0]?.content).toBe("console.log('art1')");
    // Tombstone field is absent (not deleted).
    expect(cloudArts[0]?.deletedAt ?? null).toBeNull();
  });

  it('upserts a pulled artifact that already exists in cloudArtifacts (LWW — later delta wins)', async () => {
    // Seed an existing cloud artifact.
    useArtifactStore
      .getState()
      .applyCloudArtifactDeltas([artifactDelta('art1', '3', { content: 'old content' })]);
    expect(useArtifactStore.getState().cloudArtifacts[0]?.content).toBe('old content');

    // Pull a newer version of the same artifact.
    mockGet.mockResolvedValueOnce({
      conversations: [],
      messages: [],
      artifacts: [artifactDelta('art1', '11', { content: 'updated content' })],
      cursor: '11',
      hasMore: false,
    } as never);

    await syncNow();

    const cloudArts = useArtifactStore.getState().cloudArtifacts;
    expect(cloudArts).toHaveLength(1);
    expect(cloudArts[0]?.content).toBe('updated content');
  });

  it('retains a cloudArtifact tombstone so a derived copy cannot be resurrected', async () => {
    // Seed an existing cloud artifact.
    useArtifactStore.getState().applyCloudArtifactDeltas([artifactDelta('art1', '5')]);
    expect(useArtifactStore.getState().cloudArtifacts).toHaveLength(1);

    // Pull a tombstone for the same id.
    mockGet.mockResolvedValueOnce({
      conversations: [],
      messages: [],
      artifacts: [artifactDelta('art1', '9', { deletedAt: T })],
      cursor: '9',
      hasMore: false,
    } as never);

    await syncNow();

    // The tombstone remains in the cloud overlay so mergeCloudArtifacts can
    // suppress a locally-derived copy with the same deterministic id.
    expect(useArtifactStore.getState().cloudArtifacts).toEqual([
      expect.objectContaining({ id: 'art1', deletedAt: T }),
    ]);
  });

  it('does NOT push any artifacts in managed cloud mode (mobile is pull-only)', async () => {
    // Even with cloud artifacts in the store, the push body must never include an
    // `artifacts` key (mobile has no dirty-artifact tracking; design doc §4).
    useArtifactStore.getState().applyCloudArtifactDeltas([artifactDelta('art1', '3')]);
    mockGet.mockResolvedValueOnce(emptyPull() as never);

    await syncNow();

    // The only POST calls in a clean cycle are from settings sync (if dirty), not chat.
    const chatSyncPosts = mockPost.mock.calls.filter((c) => c[0] === '/api/chat/sync');
    // No chat push at all (no dirty conversations/messages).
    expect(chatSyncPosts).toHaveLength(0);
    // The artifact store still contains the seeded artifact (pull-only, not cleared).
    expect(useArtifactStore.getState().cloudArtifacts).toHaveLength(1);
  });

  it('does NOT push or pull artifacts in local mode (gate holds)', async () => {
    useChatAppModeStore.getState().setAppMode('local');

    await syncNow();

    // Zero network I/O in local mode — same gate that covers conversations/messages.
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
    // cloudArtifacts untouched.
    expect(useArtifactStore.getState().cloudArtifacts).toHaveLength(0);
  });

  it('applies an empty artifacts array gracefully (no-op, store unchanged)', async () => {
    useArtifactStore.getState().applyCloudArtifactDeltas([artifactDelta('art1', '2')]);

    mockGet.mockResolvedValueOnce({
      conversations: [],
      messages: [],
      artifacts: [],
      cursor: '5',
      hasMore: false,
    } as never);

    await syncNow();

    // cloudArtifacts is unchanged — the empty pull is a no-op.
    expect(useArtifactStore.getState().cloudArtifacts).toHaveLength(1);
  });

  it('applies artifacts across multiple pagination pages', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/memory/sync')) {
        return { memories: [], cursor: '0', hasMore: false } as never;
      }
      if ((path as string).startsWith('/api/projects/sync')) {
        return { projects: [], cursor: '0', hasMore: false } as never;
      }
      if ((path as string).startsWith('/api/settings/sync')) {
        return { settings: {}, cursor: '0', hasMore: false } as never;
      }
      const chatCalls = mockGet.mock.calls.filter((c) =>
        (c[0] as string).startsWith('/api/chat/sync'),
      ).length;
      if (chatCalls <= 1) {
        return {
          conversations: [],
          messages: [],
          artifacts: [artifactDelta('art1', '10')],
          cursor: '10',
          hasMore: true,
        } as never;
      }
      return {
        conversations: [],
        messages: [],
        artifacts: [artifactDelta('art2', '20')],
        cursor: '20',
        hasMore: false,
      } as never;
    });

    await syncNow();

    const cloudArts = useArtifactStore.getState().cloudArtifacts;
    const ids = cloudArts.map((a) => a.id).sort();
    expect(ids).toEqual(['art1', 'art2']);
    expect(useCloudSyncStateStore.getState().cursor).toBe('20');
  });
});
