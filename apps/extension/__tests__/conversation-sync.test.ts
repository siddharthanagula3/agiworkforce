/**
 * @vitest-environment jsdom
 *
 * Orchestrator behavior for the account-backed conversation mirror.
 *
 * The cases that matter are the ones a green build cannot show:
 *   • eligible signed-in conversations sync without a preference gate;
 *   • one streamed turn ⇒ two message POSTs, not one per chunk;
 *   • every message body carries `id` (the retry-duplication guard);
 *   • an owner change mid-flight fails before any payload leaves the browser;
 *   • `flushConversation` never rejects, on any branch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getModelMetadataById, getRoutingSlotModel } from '@agiworkforce/types';

const _store: Record<string, unknown> = {};

function selectedValues(key: string | string[] | null): Record<string, unknown> {
  if (key === null) return { ..._store };
  const keys = Array.isArray(key) ? key : [key];
  return Object.fromEntries(keys.map((entry) => [entry, _store[entry]]));
}

const chromeMock = {
  storage: {
    local: {
      get: vi.fn((key: string | string[] | null, cb?: (res: Record<string, unknown>) => void) =>
        cb ? cb(selectedValues(key)) : Promise.resolve(selectedValues(key)),
      ),
      set: vi.fn((items: Record<string, unknown>, cb?: () => void) => {
        for (const [k, v] of Object.entries(items)) _store[k] = v;
        if (cb) {
          cb();
          return undefined;
        }
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[], cb?: () => void) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete _store[key];
        if (cb) {
          cb();
          return undefined;
        }
        return Promise.resolve();
      }),
    },
  },
  runtime: { lastError: undefined as chrome.runtime.LastError | undefined },
};
(globalThis as unknown as Record<string, unknown>).chrome = chromeMock;

const authContext = {
  current: {
    token: 'test-bearer',
    owner: { accountId: 'account-a', authIncarnation: 'session-a' },
  } as { token: string; owner: { accountId: string; authIncarnation: string } } | null,
};
vi.mock('../src/features/cloud-bridge/freeTrialClient', () => ({
  FREE_TRIAL_GATEWAY: 'https://agiworkforce.com',
  getManagedCloudAuthContext: vi.fn(async () => authContext.current),
}));

import {
  flushConversation,
  queueCloudConversationDeletion,
  sweepConversationSync,
  CLOUD_SYNC_TOMBSTONE_KEY,
} from '../src/features/cloud-bridge/conversationSync';
import {
  getConversation,
  upsertConversation,
  type HistoryMessage,
} from '../src/features/background/conversation-history';
import type { ManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';

const OWNER: ManagedCloudOwner = { accountId: 'account-a', authIncarnation: 'session-a' };
const OTHER_OWNER: ManagedCloudOwner = { accountId: 'account-b', authIncarnation: 'session-b' };

interface RecordedRequest {
  url: string;
  method: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

const requests: RecordedRequest[] = [];
let respond: (request: RecordedRequest) => Response = () =>
  new Response(JSON.stringify({ conversation: { id: 'x' } }), { status: 200 });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const CONVERSATION_WIRE = {
  id: '00000000-0000-4000-8000-000000000000',
  organization_id: null,
  title: 'ask',
  model: null,
  project_id: null,
  pinned: false,
  starred: false,
  archived: false,
  is_temporary: false,
  created_at: '2026-08-12T00:00:00.000Z',
  updated_at: '2026-08-12T00:00:00.000Z',
};

function defaultResponder(request: RecordedRequest): Response {
  if (request.url.endsWith('/messages')) {
    return jsonResponse({ message: { id: String(request.body['id'] ?? 'srv') } });
  }
  if (request.method === 'DELETE') return jsonResponse({ success: true });
  return jsonResponse({ conversation: { ...CONVERSATION_WIRE, id: String(request.body['id']) } });
}

function cloudMessages(at: number, assistant = 'answer'): HistoryMessage[] {
  return [
    { role: 'user', content: 'ask', timestamp: at, runtime: 'managed-cloud' },
    { role: 'assistant', content: assistant, timestamp: at + 1, runtime: 'managed-cloud' },
  ];
}

function messagePosts(): RecordedRequest[] {
  return requests.filter((request) => request.url.endsWith('/messages'));
}

function conversationPosts(): RecordedRequest[] {
  return requests.filter(
    (request) => request.method === 'POST' && request.url.endsWith('/api/chat/conversations'),
  );
}

describe('conversation cloud sync', () => {
  beforeEach(() => {
    for (const key of Object.keys(_store)) delete _store[key];
    requests.length = 0;
    respond = defaultResponder;
    authContext.current = { token: 'test-bearer', owner: { ...OWNER } };
    chromeMock.runtime.lastError = undefined;
    vi.clearAllMocks();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const headers = Object.fromEntries(
          Object.entries((init?.headers ?? {}) as Record<string, string>),
        );
        const request: RecordedRequest = {
          url: String(input),
          method: init?.method ?? 'GET',
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
          headers,
        };
        requests.push(request);
        return respond(request);
      }),
    );
  });

  it('creates the conversation with the minted uuid and sends every message with an id', async () => {
    await upsertConversation(OWNER, 'conv-happy', cloudMessages(2_000));

    await flushConversation(OWNER, 'conv-happy');

    expect(conversationPosts()).toHaveLength(1);
    const created = conversationPosts()[0]!;
    expect(created.body['id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/i);
    expect(created.headers['X-AGI-Surface']).toBe('chrome');
    expect(created.headers['Authorization']).toBe('Bearer test-bearer');

    const posts = messagePosts();
    expect(posts).toHaveLength(2);
    for (const post of posts) {
      expect(post.body['id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/i);
      expect(post.body['skipLlm']).toBe(true);
      expect(post.headers['x-agi-organization-id']).toBe('personal');
    }
    expect(posts.map((post) => post.body['content'])).toEqual(['ask', 'answer']);

    const entry = await getConversation(OWNER, 'conv-happy');
    expect(entry?.cloudSync?.state).toBe('idle');
    expect(entry?.messages.every((message) => message.cloudSyncedAt !== undefined)).toBe(true);
  });

  it('mirrors the assistant turn route and durable generated-file metadata', async () => {
    const model = getRoutingSlotModel('general_fast');
    const provider = getModelMetadataById(model)?.provider;
    expect(provider).toBeDefined();
    await upsertConversation(OWNER, 'conv-rich', [
      { role: 'user', content: 'make a file', timestamp: 2_500, runtime: 'managed-cloud' },
      {
        role: 'assistant',
        content: 'Done',
        timestamp: 2_501,
        runtime: 'managed-cloud',
        model,
        provider,
        generatedFiles: [
          {
            id: 'file-1',
            file_name: 'result.csv',
            mime_type: 'text/csv',
            uri: '/api/files/file-1',
            byte_count: 12,
            kind: 'csv',
            surface: 'file',
            previewable: true,
          },
        ],
      },
    ]);

    await flushConversation(OWNER, 'conv-rich');

    const assistantPost = messagePosts().find((post) => post.body['role'] === 'assistant');
    expect(assistantPost?.body['model']).toBe(model);
    expect(assistantPost?.body['metadata']).toMatchObject({
      surface: 'chrome',
      model,
      provider,
      generatedFiles: [
        expect.objectContaining({
          id: 'file-1',
          fileName: 'result.csv',
          uri: '/api/files/file-1',
        }),
      ],
    });

    const accepted = await getConversation(OWNER, 'conv-rich');
    const firstAssistantId = assistantPost?.body['id'];
    await upsertConversation(
      OWNER,
      'conv-rich',
      accepted!.messages.map((message) =>
        message.role === 'assistant'
          ? {
              ...message,
              generatedFiles: [
                ...(message.generatedFiles ?? []),
                {
                  id: 'file-2',
                  file_name: 'summary.md',
                  mime_type: 'text/markdown',
                  uri: '/api/files/file-2',
                  byte_count: 20,
                  kind: 'markdown',
                  surface: 'artifact' as const,
                  previewable: true,
                },
              ],
            }
          : message,
      ),
    );
    await flushConversation(OWNER, 'conv-rich');

    const assistantPosts = messagePosts().filter((post) => post.body['role'] === 'assistant');
    expect(assistantPosts).toHaveLength(2);
    expect(assistantPosts[1]?.body['id']).toBe(firstAssistantId);
    expect(assistantPosts[1]?.body['metadata']).toMatchObject({
      generatedFiles: [
        expect.objectContaining({ id: 'file-1' }),
        expect.objectContaining({ id: 'file-2' }),
      ],
    });
  });

  it('skips the trailing turn while a stream is live, then sends it once settled', async () => {
    await upsertConversation(OWNER, 'conv-stream', cloudMessages(3_000, 'part'));

    for (let index = 0; index < 12; index += 1) {
      await upsertConversation(OWNER, 'conv-stream', cloudMessages(3_000, `part${index}`));
      await flushConversation(OWNER, 'conv-stream', true);
    }
    expect(messagePosts()).toHaveLength(1);
    expect(messagePosts()[0]!.body['content']).toBe('ask');

    await flushConversation(OWNER, 'conv-stream', false);
    expect(messagePosts()).toHaveLength(2);
    expect(messagePosts()[1]!.body['content']).toBe('part11');
  });

  it('persists the create response workspace and pins every later write to it', async () => {
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await upsertConversation(OWNER, 'conv-workspace', cloudMessages(3_250));
    respond = (request) => {
      if (request.url.endsWith('/api/chat/conversations')) {
        return jsonResponse({
          conversation: {
            ...CONVERSATION_WIRE,
            id: String(request.body['id']),
            organization_id: organizationId,
          },
        });
      }
      return defaultResponder(request);
    };

    await flushConversation(OWNER, 'conv-workspace');

    expect(messagePosts()).toHaveLength(2);
    const scopedWrites = requests.filter(
      (request) => !request.url.endsWith('/api/chat/conversations'),
    );
    expect(
      scopedWrites.every((request) => request.headers['x-agi-organization-id'] === organizationId),
    ).toBe(true);
    expect((await getConversation(OWNER, 'conv-workspace'))?.cloudSync).toMatchObject({
      organizationId,
      createAcknowledged: true,
    });
  });

  it('re-sends a grown assistant turn under the SAME cloud message id', async () => {
    await upsertConversation(OWNER, 'conv-grow', cloudMessages(3_500, 'short'));
    await flushConversation(OWNER, 'conv-grow');
    const firstId = messagePosts()[1]!.body['id'];

    await upsertConversation(OWNER, 'conv-grow', cloudMessages(3_500, 'short and then longer'));
    await flushConversation(OWNER, 'conv-grow');

    const grown = messagePosts().filter((post) => post.body['content'] === 'short and then longer');
    expect(grown).toHaveLength(1);
    expect(grown[0]!.body['id']).toBe(firstId);
    expect(conversationPosts()).toHaveLength(1);
  });

  it('blocks on 401 without retrying and leaves the local record intact', async () => {
    await upsertConversation(OWNER, 'conv-401', cloudMessages(4_000));
    respond = (request) =>
      request.url.endsWith('/messages')
        ? jsonResponse({ error: 'Unauthorized' }, 401)
        : defaultResponder(request);

    await expect(flushConversation(OWNER, 'conv-401')).resolves.toBeUndefined();

    expect(messagePosts()).toHaveLength(1);
    const entry = await getConversation(OWNER, 'conv-401');
    expect(entry?.cloudSync?.blockedReason).toBe('auth');
    expect(entry?.messages).toHaveLength(2);
    expect(entry?.messages[0]?.content).toBe('ask');
  });

  it('backs off on 429 without a client retry, and the next flush is a no-op', async () => {
    await upsertConversation(OWNER, 'conv-429', cloudMessages(5_000));
    respond = (request) =>
      request.url.endsWith('/messages')
        ? jsonResponse({ error: 'Too many requests' }, 429)
        : defaultResponder(request);

    await flushConversation(OWNER, 'conv-429');
    expect(messagePosts()).toHaveLength(1);
    const entry = await getConversation(OWNER, 'conv-429');
    expect(entry?.cloudSync?.state).toBe('error');
    expect(entry?.cloudSync?.retryAfter).toBeGreaterThan(Date.now());

    const countBefore = requests.length;
    await flushConversation(OWNER, 'conv-429');
    expect(requests).toHaveLength(countBefore);
  });

  it('retries a 5xx three times with the same message id, then records an error', async () => {
    await upsertConversation(OWNER, 'conv-5xx', cloudMessages(6_000));
    respond = (request) =>
      request.url.endsWith('/messages')
        ? jsonResponse({ error: 'boom' }, 503)
        : defaultResponder(request);

    await expect(flushConversation(OWNER, 'conv-5xx')).resolves.toBeUndefined();

    const posts = messagePosts();
    expect(posts).toHaveLength(3);
    expect(new Set(posts.map((post) => post.body['id'])).size).toBe(1);
    const entry = await getConversation(OWNER, 'conv-5xx');
    expect(entry?.cloudSync?.state).toBe('error');
  }, 10_000);

  it('aborts before egress when the owner rotates mid-flight', async () => {
    await upsertConversation(OWNER, 'conv-rotate', cloudMessages(7_000));

    respond = (request) => {
      authContext.current = { token: 'other-bearer', owner: { ...OTHER_OWNER } };
      return defaultResponder(request);
    };

    await expect(flushConversation(OWNER, 'conv-rotate')).resolves.toBeUndefined();

    expect(messagePosts()).toHaveLength(0);
    expect(
      requests.every((request) => request.headers['Authorization'] === 'Bearer test-bearer'),
    ).toBe(true);
    const entry = await getConversation(OWNER, 'conv-rotate');
    expect(entry?.cloudSync?.state).not.toBe('error');
  });

  it('survives an offline fetch and keeps the work pending for the sweep', async () => {
    await upsertConversation(OWNER, 'conv-offline', cloudMessages(8_000));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await expect(flushConversation(OWNER, 'conv-offline')).resolves.toBeUndefined();
    const entry = await getConversation(OWNER, 'conv-offline');
    expect(entry?.cloudSync?.state).toBe('error');
    expect(entry?.messages.every((message) => message.cloudSyncedAt === undefined)).toBe(true);
  }, 10_000);

  it('sweeps stranded work without any debounce timer firing', async () => {
    await upsertConversation(OWNER, 'conv-sweep', cloudMessages(9_000));

    await sweepConversationSync();

    expect(conversationPosts()).toHaveLength(1);
    expect(messagePosts()).toHaveLength(2);
  });

  it('keeps a deleted binding terminal and never re-creates a partial transcript', async () => {
    await upsertConversation(OWNER, 'conv-deleted', cloudMessages(8_500));
    await flushConversation(OWNER, 'conv-deleted');
    const originalBinding = (await getConversation(OWNER, 'conv-deleted'))?.cloudSync
      ?.conversationId;
    expect(originalBinding).toBeDefined();

    await upsertConversation(OWNER, 'conv-deleted', cloudMessages(8_500, 'answer grew'));
    requests.length = 0;
    respond = (request) =>
      request.url.endsWith('/messages')
        ? jsonResponse({ error: 'Conversation not found' }, 404)
        : defaultResponder(request);

    await flushConversation(OWNER, 'conv-deleted');
    expect(messagePosts()).toHaveLength(1);
    expect(conversationPosts()).toHaveLength(0);
    expect((await getConversation(OWNER, 'conv-deleted'))?.cloudSync).toMatchObject({
      conversationId: originalBinding,
      state: 'blocked',
      blockedReason: 'not-found',
    });

    requests.length = 0;
    await flushConversation(OWNER, 'conv-deleted');
    expect(requests).toHaveLength(0);
  });

  it('drains a queued deletion and treats a 404 as success', async () => {
    const cloudId = '55555555-5555-4555-8555-555555555555';
    respond = () => jsonResponse({ error: 'Not found' }, 404);

    await expect(queueCloudConversationDeletion(OWNER, cloudId, null)).resolves.toBe(true);
    await sweepConversationSync();

    expect(requests.some((request) => request.method === 'DELETE')).toBe(true);
    expect(
      requests.find((request) => request.method === 'DELETE')?.headers['x-agi-organization-id'],
    ).toBe('personal');
    expect(_store[CLOUD_SYNC_TOMBSTONE_KEY]).toEqual([]);
  });

  it('does not expire a pending deletion and refuses capacity overflow without dropping one', async () => {
    const oldCloudId = '66666666-6666-4666-8666-666666666666';
    _store[CLOUD_SYNC_TOMBSTONE_KEY] = [
      {
        accountId: OWNER.accountId,
        cloudConversationId: oldCloudId,
        organizationId: null,
        queuedAt: Date.now() - 30 * 24 * 60 * 60 * 1_000,
      },
    ];

    await sweepConversationSync();
    expect(
      requests.some((request) => request.method === 'DELETE' && request.url.endsWith(oldCloudId)),
    ).toBe(true);

    requests.length = 0;
    _store[CLOUD_SYNC_TOMBSTONE_KEY] = Array.from({ length: 100 }, (_, index) => ({
      accountId: OWNER.accountId,
      cloudConversationId: `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`,
      organizationId: null,
      queuedAt: index + 1,
    }));
    const before = structuredClone(_store[CLOUD_SYNC_TOMBSTONE_KEY]);

    await expect(
      queueCloudConversationDeletion(OWNER, '77777777-7777-4777-8777-777777777777', null),
    ).resolves.toBe(false);
    expect(_store[CLOUD_SYNC_TOMBSTONE_KEY]).toEqual(before);
  });
});
