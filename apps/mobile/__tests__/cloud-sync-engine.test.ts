import type { ChatMessage, ConversationSummary } from '../types/chat';
import type { MessagePushItem } from '@agiworkforce/sync';

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
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
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { SYNTHETIC_IMAGE_MODEL_ID } from '../test-utils/modelFixtures';

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

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

function msgDelta(
  id: string,
  conversationId: string,
  serverVersion: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    conversation_id: conversationId,
    role: 'user' as const,
    content: `body ${id}`,
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    metadata: null,
    created_at: T,
    updated_at: T,
    deleted_at: null,
    server_version: serverVersion,
    ...extra,
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
  __resetCloudAccountSessionForTests();
  activateCloudAccount('sync-test-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useArtifactStore.getState().clearArtifacts();
  useArtifactStore.getState().clearCloudArtifacts();
  useChatAppModeStore.getState().setAppMode('cloud');
  mockGet.mockImplementation((async (path: string) => {
    if (path.startsWith('/api/memory/sync')) return { memories: [], cursor: '0', hasMore: false };
    if (path.startsWith('/api/projects/sync')) return { projects: [], cursor: '0', hasMore: false };
    if (path.startsWith('/api/settings/sync')) return { settings: {}, cursor: '0', hasMore: false };
    return emptyPull();
  }) as never);
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
  it('does not apply an account-A response after a direct switch to account B', async () => {
    const accountAPull = deferred<PullPage>();
    mockGet.mockImplementation((async (path: string) => {
      if (path.startsWith('/api/chat/sync')) return accountAPull.promise;
      if (path.startsWith('/api/memory/sync')) return { memories: [], cursor: '0', hasMore: false };
      if (path.startsWith('/api/projects/sync'))
        return { projects: [], cursor: '0', hasMore: false };
      return { settings: {}, cursor: '0', hasMore: false };
    }) as never);

    const pendingAccountASync = syncNow();
    await Promise.resolve();
    expect(mockGet).toHaveBeenCalledWith('/api/chat/sync?since=0');

    activateCloudAccount('sync-test-user-b');
    useChatCloudMessageStore.getState().clearCloudData();
    useCloudSyncStateStore.getState().reset();
    accountAPull.resolve({
      conversations: [convDelta('account-a-chat', '9')],
      messages: [msgDelta('account-a-message', 'account-a-chat', '10')],
      artifacts: [],
      cursor: '10',
      hasMore: false,
    });
    await pendingAccountASync;

    expect(useChatCloudMessageStore.getState().conversations).toEqual([]);
    expect(useChatCloudMessageStore.getState().messages).toEqual({});
    expect(useCloudSyncStateStore.getState()).toMatchObject({
      cursor: '0',
      status: 'idle',
      lastError: null,
    });
  });

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

  it('threads the branch pointers from a pull into the cloud stores', async () => {
    mockGet.mockResolvedValueOnce({
      conversations: [{ ...convDelta('c1', '5'), active_leaf_message_id: 'm1' }],
      messages: [msgDelta('m1', 'c1', '6', { parent_id: 'm0' })],
      artifacts: [],
      cursor: '6',
      hasMore: false,
    } as never);

    await syncNow();

    const cloud = useChatCloudMessageStore.getState();
    expect(cloud.conversations.find((c) => c.id === 'c1')?.activeLeafMessageId).toBe('m1');
    expect(cloud.messages.c1?.[0]?.parentId).toBe('m0');
  });

  it('applies a null pointer, which a linear conversation on a threading server sends', async () => {
    mockGet.mockResolvedValueOnce({
      conversations: [{ ...convDelta('c1', '5'), active_leaf_message_id: null }],
      messages: [msgDelta('m1', 'c1', '6', { parent_id: null })],
      artifacts: [],
      cursor: '6',
      hasMore: false,
    } as never);

    await syncNow();

    const cloud = useChatCloudMessageStore.getState();
    expect(cloud.conversations.find((c) => c.id === 'c1')).toHaveProperty(
      'activeLeafMessageId',
      null,
    );
    expect(cloud.messages.c1?.[0]).toHaveProperty('parentId', null);
  });

  it('keeps a lineage the transcript fetch learned when the delta carries no parent', async () => {
    seedConversation('c1', { activeLeafMessageId: 'm1' });
    seedMessage('c1', { id: 'm1', parentId: 'm0' });
    mockGet.mockResolvedValueOnce({
      conversations: [convDelta('c1', '5')],
      messages: [msgDelta('m1', 'c1', '6')],
      artifacts: [],
      cursor: '6',
      hasMore: false,
    } as never);

    await syncNow();

    const cloud = useChatCloudMessageStore.getState();
    expect(cloud.conversations.find((c) => c.id === 'c1')?.activeLeafMessageId).toBe('m1');
    expect(cloud.messages.c1?.[0]?.parentId).toBe('m0');
  });

  it('hydrates a pending approval projection from synced metadata after a cold device pull', async () => {
    const runId = '018f6f2a-0000-7000-8000-000000000099';
    mockGet.mockResolvedValueOnce({
      conversations: [convDelta('c1', '5')],
      messages: [
        msgDelta('m1', 'c1', '6', {
          role: 'assistant',
          metadata: {
            cloudAgentRun: {
              runId,
              runPath: `/api/llm/v1/chat/completions/runs/${runId}`,
              lastSequence: 3,
            },
            cloudApproval: {
              schemaVersion: 1,
              runId,
              calls: [
                {
                  toolCallId: 'call-1',
                  name: 'shell',
                  input: '{"command":"pwd"}',
                  approvalDecision: 'approved',
                },
                { toolCallId: 'call-2', name: 'write_file', input: '{"path":"a.txt"}' },
              ],
            },
          },
        }),
      ],
      artifacts: [],
      cursor: '6',
      hasMore: false,
    } as never);

    await syncNow();

    expect(useChatCloudMessageStore.getState().messages.c1?.[0]).toMatchObject({
      serverVersion: '6',
      metadata: { cloudAgentRun: { runId } },
      toolCalls: [
        expect.objectContaining({
          toolCallId: 'call-1',
          name: 'shell',
          requiresApproval: true,
          approvalDecision: 'approved',
        }),
        expect.objectContaining({
          toolCallId: 'call-2',
          name: 'write_file',
          requiresApproval: true,
        }),
      ],
    });
  });

  it('hydrates a durable generated image from synced metadata after a cold device pull', async () => {
    const imageUrl = '/api/files/22222222-2222-4222-8222-222222222222';
    mockGet.mockResolvedValueOnce({
      conversations: [convDelta('c1', '5')],
      messages: [
        msgDelta('m-image', 'c1', '6', {
          role: 'assistant',
          content: 'Generated image',
          model: SYNTHETIC_IMAGE_MODEL_ID,
          metadata: {
            toolType: 'image-generation',
            imageUrl,
            imageGenPrompt: 'A clean enterprise dashboard',
            imageGenModel: SYNTHETIC_IMAGE_MODEL_ID,
            revisedPrompt: 'A polished enterprise dashboard',
          },
        }),
      ],
      artifacts: [],
      cursor: '6',
      hasMore: false,
    } as never);

    await syncNow();

    expect(useChatCloudMessageStore.getState().messages.c1?.[0]).toMatchObject({
      type: 'image',
      imageUrl,
      imageGenPrompt: 'A clean enterprise dashboard',
      revisedPrompt: 'A polished enterprise dashboard',
      imageGenStatus: 'completed',
      imageGenProgress: 100,
      isGeneratingImage: false,
    });
    expect(useArtifactStore.getState().artifacts).toContainEqual(
      expect.objectContaining({
        id: 'generated-image-m-image',
        kind: 'image',
        content: imageUrl,
      }),
    );
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

    const chatCalls = mockGet.mock.calls.filter((c) =>
      (c[0] as string).startsWith('/api/chat/sync'),
    );
    expect(chatCalls).toHaveLength(2);
    expect(chatCalls[0]![0]).toBe('/api/chat/sync?since=0');
    expect(chatCalls[1]![0]).toBe('/api/chat/sync?since=10');
    expect(useCloudSyncStateStore.getState().cursor).toBe('20');
  });

  it('trusts the server safe cursor and never overshoots to a per-row max', async () => {
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

    expect((useChatCloudMessageStore.getState().messages.c1 ?? []).map((m) => m.id)).toEqual([
      'm1',
    ]);
    expect(useCloudSyncStateStore.getState().cursor).toBe('10');
    expect(mockGet).toHaveBeenNthCalledWith(2, '/api/chat/sync?since=10');
  });
});

describe('syncNow — push', () => {
  it('pushes dirty conversations + messages, then clears the dirty queue', async () => {
    seedConversation('c1', { model: 'fixture-model', messageCount: 1 });
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
    expect(body.conversations[0]).toMatchObject({
      id: 'c1',
      title: 'Chat c1',
      model: 'fixture-model',
    });
    expect(body).toMatchObject({ protocolVersion: 2 });
    expect(body.conversations[0]).toMatchObject({ baseVersion: '0' });
    expect(body.conversations[0]).not.toHaveProperty('updatedAt');
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toMatchObject({
      id: 'm1',
      conversationId: 'c1',
      role: 'user',
      content: 'hi there',
      baseVersion: '0',
    });

    const sync = useCloudSyncStateStore.getState();
    expect(sync.dirtyConversationIds).toEqual([]);
    expect(sync.dirtyMessages).toEqual([]);
  });

  it('projects only durable generated-image identity and bounded display metadata', async () => {
    const imageUrl = '/api/files/22222222-2222-4222-8222-222222222222';
    seedConversation('c1', { messageCount: 1 });
    seedMessage('c1', {
      id: 'm-image',
      role: 'assistant',
      content: 'Generated image',
      type: 'image',
      imageUrl,
      imageGenPrompt: 'A clean enterprise dashboard',
      revisedPrompt: 'A polished enterprise dashboard',
      model: SYNTHETIC_IMAGE_MODEL_ID,
      metadata: { traceId: 'safe-trace' },
    });
    markMessageForSync('c1', 'm-image');

    await syncNow();

    const [, body] = mockPost.mock.calls[0] as [string, { messages: MessagePushItem[] }];
    expect(body.messages[0]?.metadata).toEqual({
      traceId: 'safe-trace',
      toolType: 'image-generation',
      imageUrl,
      imageGenPrompt: 'A clean enterprise dashboard',
      imageGenModel: SYNTHETIC_IMAGE_MODEL_ID,
      revisedPrompt: 'A polished enterprise dashboard',
    });
  });

  it('strips untrusted generated-image URLs from synced metadata', async () => {
    seedConversation('c1', { messageCount: 1 });
    seedMessage('c1', {
      id: 'm-image',
      role: 'assistant',
      content: 'Generated image',
      type: 'image',
      imageUrl: 'https://evil.example/tracker.png',
      metadata: {
        toolType: 'image-generation',
        imageUrl: 'https://evil.example/tracker.png',
        traceId: 'safe-trace',
      },
    });
    markMessageForSync('c1', 'm-image');

    await syncNow();

    const [, body] = mockPost.mock.calls[0] as [string, { messages: MessagePushItem[] }];
    expect(body.messages[0]?.metadata).toEqual({ traceId: 'safe-trace' });
  });

  it('pushes a versioned approval projection and stores the acknowledged revision', async () => {
    const runId = '018f6f2a-0000-7000-8000-000000000099';
    seedConversation('c1', { messageCount: 1 });
    seedMessage('c1', {
      id: 'm1',
      role: 'assistant',
      content: 'Waiting for approval',
      serverVersion: '7',
      metadata: {
        cloudAgentRun: {
          runId,
          runPath: `/api/llm/v1/chat/completions/runs/${runId}`,
          lastSequence: 3,
        },
      },
      toolCalls: [
        {
          id: 'call-1',
          toolCallId: 'call-1',
          name: 'shell',
          input: '{"command":"pwd"}',
          status: 'running',
          requiresApproval: true,
        },
      ],
    });
    markMessageForSync('c1', 'm1');
    mockPost.mockImplementationOnce(async (_path, body: unknown) => {
      const pushBody = body as { messages: MessagePushItem[] };
      return {
        protocolVersion: 2,
        applied: {
          conversations: [],
          messages: [{ id: pushBody.messages[0].id, server_version: '8' }],
          artifacts: [],
        },
        conflicts: { conversations: [], messages: [], artifacts: [] },
        cursor: '8',
      } as never;
    });

    await syncNow();

    const [, body] = mockPost.mock.calls[0] as [string, { messages: MessagePushItem[] }];
    expect(body.messages[0]).toMatchObject({
      baseVersion: '7',
      metadata: {
        cloudAgentRun: { runId },
        cloudApproval: {
          schemaVersion: 1,
          runId,
          calls: [expect.objectContaining({ toolCallId: 'call-1', name: 'shell' })],
        },
      },
    });
    expect(useChatCloudMessageStore.getState().messages.c1?.[0]?.serverVersion).toBe('8');
  });

  it('pushes an explicit approval clear after a run resumes', async () => {
    const runId = '018f6f2a-0000-7000-8000-000000000099';
    seedConversation('c1', { messageCount: 1 });
    seedMessage('c1', {
      id: 'm1',
      role: 'assistant',
      content: 'Finished',
      serverVersion: '8',
      metadata: {
        cloudAgentRun: {
          runId,
          runPath: `/api/llm/v1/chat/completions/runs/${runId}`,
          lastSequence: 8,
        },
      },
      toolCalls: [
        {
          id: 'call-1',
          toolCallId: 'call-1',
          name: 'shell',
          status: 'completed',
          requiresApproval: false,
        },
      ],
    });
    markMessageForSync('c1', 'm1');

    await syncNow();

    const [, body] = mockPost.mock.calls[0] as [string, { messages: MessagePushItem[] }];
    expect(body.messages[0].metadata).toMatchObject({
      cloudAgentRun: { runId },
      cloudApproval: null,
    });
  });

  it('preserves a message edit made while its CAS push is in flight', async () => {
    seedConversation('c1', { messageCount: 1 });
    seedMessage('c1', {
      id: 'm1',
      role: 'assistant',
      content: 'sent',
      serverVersion: '7',
      metadata: { phase: 'sent' },
    });
    markMessageForSync('c1', 'm1');
    mockPost.mockImplementationOnce(async () => {
      const current = useChatCloudMessageStore.getState().messages.c1 ?? [];
      useChatCloudMessageStore.getState().setCloudMessages(
        'c1',
        current.map((message) =>
          message.id === 'm1'
            ? { ...message, content: 'edited later', metadata: { phase: 'later' } }
            : message,
        ),
      );
      return {
        protocolVersion: 2,
        applied: {
          conversations: [],
          messages: [{ id: 'm1', server_version: '8' }],
          artifacts: [],
        },
        conflicts: { conversations: [], messages: [], artifacts: [] },
        cursor: '8',
      } as never;
    });

    await syncNow();

    expect(useChatCloudMessageStore.getState().messages.c1?.[0]).toMatchObject({
      content: 'edited later',
      metadata: { phase: 'later' },
      serverVersion: '8',
    });
    expect(useCloudSyncStateStore.getState().dirtyMessages).toContainEqual({
      conversationId: 'c1',
      messageId: 'm1',
    });
  });

  it('adopts the deterministic server winner for a stale message CAS conflict', async () => {
    seedConversation('c1', { messageCount: 1 });
    seedMessage('c1', {
      id: 'm1',
      role: 'assistant',
      content: 'stale local',
      serverVersion: '7',
      metadata: { phase: 'local' },
    });
    markMessageForSync('c1', 'm1');
    mockPost.mockImplementationOnce(
      async () =>
        ({
          protocolVersion: 2,
          applied: { conversations: [], messages: [], artifacts: [] },
          conflicts: {
            conversations: [],
            messages: [
              {
                id: 'm1',
                current: msgDelta('m1', 'c1', '8', {
                  role: 'assistant',
                  content: 'server winner',
                  metadata: { phase: 'server' },
                }),
              },
            ],
            artifacts: [],
          },
          cursor: '8',
        }) as never,
    );

    await syncNow();

    expect(useChatCloudMessageStore.getState().messages.c1?.[0]).toMatchObject({
      content: 'server winner',
      metadata: { phase: 'server' },
      serverVersion: '8',
    });
    expect(useCloudSyncStateStore.getState().dirtyMessages).not.toContainEqual({
      conversationId: 'c1',
      messageId: 'm1',
    });
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
    markMessageForSync('c1', 'm1');
    mockPost.mockImplementationOnce((async () => ({
      protocolVersion: 2,
      applied: { conversations: [], messages: [], artifacts: [] },
      conflicts: { conversations: [], messages: [], artifacts: [] },
      cursor: '0',
    })) as never);

    await syncNow();

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
    expect(cloudArts[0]?.deletedAt ?? null).toBeNull();
  });

  it('upserts a pulled artifact that already exists in cloudArtifacts (LWW — later delta wins)', async () => {
    useArtifactStore
      .getState()
      .applyCloudArtifactDeltas(
        [artifactDelta('art1', '3', { content: 'old content' })],
        'sync-test-user',
      );
    expect(useArtifactStore.getState().cloudArtifacts[0]?.content).toBe('old content');

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
    useArtifactStore
      .getState()
      .applyCloudArtifactDeltas([artifactDelta('art1', '5')], 'sync-test-user');
    expect(useArtifactStore.getState().cloudArtifacts).toHaveLength(1);

    mockGet.mockResolvedValueOnce({
      conversations: [],
      messages: [],
      artifacts: [artifactDelta('art1', '9', { deletedAt: T })],
      cursor: '9',
      hasMore: false,
    } as never);

    await syncNow();

    expect(useArtifactStore.getState().cloudArtifacts).toEqual([
      expect.objectContaining({ id: 'art1', deletedAt: T }),
    ]);
  });

  it('does NOT push any artifacts in managed cloud mode (mobile is pull-only)', async () => {
    useArtifactStore
      .getState()
      .applyCloudArtifactDeltas([artifactDelta('art1', '3')], 'sync-test-user');
    mockGet.mockResolvedValueOnce(emptyPull() as never);

    await syncNow();

    const chatSyncPosts = mockPost.mock.calls.filter((c) => c[0] === '/api/chat/sync');
    expect(chatSyncPosts).toHaveLength(0);
    expect(useArtifactStore.getState().cloudArtifacts).toHaveLength(1);
  });

  it('does NOT push or pull artifacts in local mode (gate holds)', async () => {
    useChatAppModeStore.getState().setAppMode('local');

    await syncNow();

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
    expect(useArtifactStore.getState().cloudArtifacts).toHaveLength(0);
  });

  it('applies an empty artifacts array gracefully (no-op, store unchanged)', async () => {
    useArtifactStore
      .getState()
      .applyCloudArtifactDeltas([artifactDelta('art1', '2')], 'sync-test-user');

    mockGet.mockResolvedValueOnce({
      conversations: [],
      messages: [],
      artifacts: [],
      cursor: '5',
      hasMore: false,
    } as never);

    await syncNow();

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
