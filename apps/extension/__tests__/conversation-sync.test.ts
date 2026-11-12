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
import { SURFACE_REQUEST_HEADER } from '@agiworkforce/cloud-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getModelMetadataById, getRoutingSlotModel } from '@agiworkforce/types';

const _store: Record<string, unknown> = {};
const storageListeners: Array<
  (changes: Record<string, { newValue?: unknown }>, area: string) => void
> = [];

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
    onChanged: {
      addListener: (
        listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
      ) => {
        storageListeners.push(listener);
      },
    },
  },
  runtime: { lastError: undefined as chrome.runtime.LastError | undefined },
  alarms: {
    create: vi.fn(async (name: string, info: { when: number }) => {
      alarms.set(name, { name, scheduledTime: info.when });
    }),
    get: vi.fn(async (name: string) => alarms.get(name)),
    clear: vi.fn(async (name: string) => alarms.delete(name)),
  },
};
const alarms = new Map<string, { name: string; scheduledTime: number }>();
(globalThis as unknown as Record<string, unknown>).chrome = chromeMock;

function setCloudMirroring(enabled: boolean): void {
  _store[CLOUD_MIRRORING_STORAGE_KEY] = enabled;
  for (const listener of storageListeners) {
    listener({ [CLOUD_MIRRORING_STORAGE_KEY]: { newValue: enabled } }, 'local');
  }
}

const authContext = {
  current: {
    token: 'test-bearer',
    owner: { accountId: 'account-a', authIncarnation: 'session-a' },
  } as { token: string; owner: { accountId: string; authIncarnation: string } } | null,
};
vi.mock('../src/features/cloud-bridge/freeTrialClient', async (importOriginal) => ({
  ...(await importOriginal<FreeTrialClientModule>()),
  CODE_EXECUTION_OUTPUT_MAX_CHARS: 16_000,
  FREE_TRIAL_GATEWAY: 'https://agiworkforce.com',
  getManagedCloudAuthContext: vi.fn(async () => authContext.current),
}));

import {
  drainCloudDeletionTombstones,
  flushConversation,
  ensureCloudConversation,
  flushQuestionBeforeTurn,
  queueCloudConversationDeletion,
  saveConversationNow,
  scheduleConversationSync,
  sweepConversationSync,
  CLOUD_SYNC_TOMBSTONE_KEY,
  CONVERSATION_SYNC_RETRY_ALARM,
} from '../src/features/cloud-bridge/conversationSync';
import {
  getConversation,
  pendingCloudMessages,
  recordCloudSyncState,
  upsertConversation,
  type HistoryMessage,
} from '../src/features/background/conversation-history';
import type { ManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';
import {
  CLOUD_MIRRORING_STORAGE_KEY,
  watchCloudMirroringEnabled,
} from '../src/features/privacy/cloudMirroring';

type FreeTrialClientModule = typeof import('../src/features/cloud-bridge/freeTrialClient');

watchCloudMirroringEnabled();

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
    alarms.clear();
    setCloudMirroring(true);
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

  it('uploads a plan cancellation once under its existing assistant message identity', async () => {
    const id = 'plan-cancel-sync';
    await upsertConversation(OWNER, id, cloudMessages(Date.now()));
    await flushConversation(OWNER, id);
    const first = messagePosts().find((post) => post.body['role'] === 'assistant')!;
    const entry = (await getConversation(OWNER, id))!;
    await upsertConversation(
      OWNER,
      id,
      entry.messages.map((message) =>
        message.role === 'assistant' ? { ...message, agiWorkPlanDeclined: true } : message,
      ),
    );
    await flushConversation(OWNER, id);
    const posts = messagePosts().filter((post) => post.body['role'] === 'assistant');
    expect(posts).toHaveLength(2);
    expect(posts[1]?.body['id']).toBe(first.body['id']);
    expect(posts[1]?.body['metadata']).toMatchObject({ agiWorkPlanDeclined: true });
    expect(pendingCloudMessages((await getConversation(OWNER, id))!)).toEqual([]);
    await flushConversation(OWNER, id);
    expect(messagePosts().filter((post) => post.body['role'] === 'assistant')).toHaveLength(2);
  });

  it('sends the durable attachment descriptor with the actual user message POST', async () => {
    const at = Date.now();
    const messages = cloudMessages(at);
    const assetId = '77777777-7777-4777-8777-777777777777';
    messages[0]!.attachments = [
      { kind: 'file', name: 'handoff.txt', mimeType: 'text/plain', assetId },
    ];
    await upsertConversation(OWNER, 'file-sync-case', messages);
    await flushConversation(OWNER, 'file-sync-case');
    const sent = messagePosts().find((request) => request.body['role'] === 'user');
    expect((sent?.body['metadata'] as Record<string, unknown>)['attachments']).toEqual([
      expect.objectContaining({ assetId, name: 'handoff.txt', type: 'file' }),
    ]);
  });

  it('creates the conversation with the minted uuid and sends every message with an id', async () => {
    await upsertConversation(OWNER, 'conv-happy', cloudMessages(2_000));

    await flushConversation(OWNER, 'conv-happy');

    expect(conversationPosts()).toHaveLength(1);
    const created = conversationPosts()[0]!;
    expect(created.body['id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/i);
    expect(created.headers[SURFACE_REQUEST_HEADER]).toBe('chrome');
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

  it('saves the question of a bound chat before its turn starts, without the live answer', async () => {
    await upsertConversation(OWNER, 'conv-bound', cloudMessages(4_000));
    await flushConversation(OWNER, 'conv-bound');
    requests.length = 0;
    await upsertConversation(OWNER, 'conv-bound', [
      ...cloudMessages(4_000),
      { role: 'user', content: 'next question', timestamp: 5_000, runtime: 'managed-cloud' },
      { role: 'assistant', content: '', timestamp: 5_001, runtime: 'managed-cloud' },
    ]);
    scheduleConversationSync(OWNER, 'conv-bound', true);

    await flushQuestionBeforeTurn(OWNER, 'conv-bound');

    expect(messagePosts().map((post) => post.body['content'])).toEqual(['next question']);
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

  it('shows a workspace policy refusal in its own words instead of asking to sign in', async () => {
    const reason =
      'Your workspace administrator has turned off cloud access from the Chrome extension.';
    await upsertConversation(OWNER, 'conv-policy', cloudMessages(4_500));
    respond = (request) =>
      request.url.endsWith('/messages')
        ? jsonResponse(
            {
              error: {
                type: 'organization_policy',
                code: 'surface_sync_disabled',
                message: reason,
              },
            },
            403,
          )
        : defaultResponder(request);

    await flushConversation(OWNER, 'conv-policy');

    const entry = await getConversation(OWNER, 'conv-policy');
    expect(entry?.cloudSync).toMatchObject({
      state: 'blocked',
      blockedReason: 'policy',
      lastError: reason,
    });
    expect(entry?.cloudSync?.retryAfter).toBeGreaterThan(Date.now());
    expect(entry?.messages).toHaveLength(2);
  });

  it('waits only as long as a slow server asks before trying again', async () => {
    await upsertConversation(OWNER, 'conv-503', cloudMessages(4_700));
    respond = (request) =>
      request.url.endsWith('/messages')
        ? new Response(
            JSON.stringify({
              error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
            }),
            { status: 503, headers: { 'Content-Type': 'application/json', 'retry-after': '5' } },
          )
        : defaultResponder(request);

    const startedAt = Date.now();
    await flushConversation(OWNER, 'conv-503');

    const entry = await getConversation(OWNER, 'conv-503');
    expect(entry?.cloudSync?.state).toBe('error');
    expect(entry?.cloudSync?.blockedReason).toBeUndefined();
    expect(entry?.cloudSync?.retryAfter).toBeGreaterThanOrEqual(startedAt + 5_000);
    expect(entry?.cloudSync?.retryAfter).toBeLessThan(Date.now() + 6_000);
    expect(entry?.messages).toHaveLength(2);
  }, 10_000);

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

  it('saves at once when the user asks, even inside the wait an earlier failure set', async () => {
    await upsertConversation(OWNER, 'conv-save-now', cloudMessages(5_100));
    respond = (request) =>
      request.url.endsWith('/messages')
        ? jsonResponse({ error: 'Too many requests' }, 429)
        : defaultResponder(request);
    await flushConversation(OWNER, 'conv-save-now');
    const failed = await getConversation(OWNER, 'conv-save-now');
    expect(failed?.cloudSync?.state).toBe('error');
    expect(failed?.cloudSync?.retryAfter).toBeGreaterThan(Date.now());

    respond = defaultResponder;
    const postsBefore = messagePosts().length;
    await expect(saveConversationNow(OWNER, 'conv-save-now')).resolves.toEqual({
      status: 'saved',
    });

    expect(messagePosts().length).toBeGreaterThan(postsBefore);
    const saved = await getConversation(OWNER, 'conv-save-now');
    expect(saved?.cloudSync?.state).toBe('idle');
    expect(saved?.cloudSync?.retryAfter).toBeUndefined();
    expect(pendingCloudMessages(saved!)).toHaveLength(0);
  });

  it('reports a refused user save with the account reason and does not ask again', async () => {
    const reason = 'Your workspace administrator has turned off saving chats from the extension.';
    await upsertConversation(OWNER, 'conv-save-refused', cloudMessages(5_200));
    respond = (request) =>
      request.url.endsWith('/messages')
        ? jsonResponse(
            {
              error: {
                type: 'organization_policy',
                code: 'surface_sync_disabled',
                message: reason,
              },
            },
            403,
          )
        : defaultResponder(request);

    await expect(saveConversationNow(OWNER, 'conv-save-refused')).resolves.toEqual({
      status: 'refused',
      reason,
    });
    await expect(saveConversationNow(OWNER, 'conv-save-refused')).resolves.toEqual({
      status: 'refused',
      reason,
    });
    expect(messagePosts()).toHaveLength(1);
  });

  it('keeps to the wait a rate limit stated and says until when', async () => {
    await upsertConversation(OWNER, 'conv-save-wait', cloudMessages(5_250));
    respond = (request) =>
      request.url.endsWith('/messages')
        ? new Response(
            JSON.stringify({
              error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' },
            }),
            { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '120' } },
          )
        : defaultResponder(request);
    const startedAt = Date.now();

    const first = await saveConversationNow(OWNER, 'conv-save-wait');
    expect(first).toMatchObject({
      status: 'not-saved',
      reason: expect.stringContaining('Too many'),
    });
    const retryAt = (first as { retryAt?: number }).retryAt!;
    expect(retryAt).toBeGreaterThanOrEqual(startedAt + 120_000);
    expect(retryAt).toBeLessThan(Date.now() + 121_000);
    expect(messagePosts()).toHaveLength(1);

    respond = defaultResponder;
    await expect(saveConversationNow(OWNER, 'conv-save-wait')).resolves.toEqual(first);
    expect(messagePosts()).toHaveLength(1);
  });

  describe('Save changes now after an earlier save was blocked', () => {
    const unauthorized = (request: RecordedRequest): Response =>
      request.url.endsWith('/messages')
        ? jsonResponse({ error: 'Unauthorized' }, 401)
        : defaultResponder(request);

    it('saves for a signed-in owner whose earlier save hit a sign-in block', async () => {
      await upsertConversation(OWNER, 'conv-auth-retry', cloudMessages(5_260));
      respond = unauthorized;
      await flushConversation(OWNER, 'conv-auth-retry');
      expect((await getConversation(OWNER, 'conv-auth-retry'))?.cloudSync).toMatchObject({
        state: 'blocked',
        blockedReason: 'auth',
      });

      respond = defaultResponder;
      const postsBefore = messagePosts().length;
      await expect(saveConversationNow(OWNER, 'conv-auth-retry')).resolves.toEqual({
        status: 'saved',
      });

      expect(messagePosts().length).toBeGreaterThan(postsBefore);
      const saved = await getConversation(OWNER, 'conv-auth-retry');
      expect(saved?.cloudSync?.state).toBe('idle');
      expect(saved?.cloudSync?.blockedReason).toBeUndefined();
      expect(pendingCloudMessages(saved!)).toHaveLength(0);
    });

    it('asks a signed-out user to sign in, without a request', async () => {
      await upsertConversation(OWNER, 'conv-auth-signed-out', cloudMessages(5_265));
      respond = unauthorized;
      await flushConversation(OWNER, 'conv-auth-signed-out');
      authContext.current = null;
      const before = requests.length;

      await expect(saveConversationNow(OWNER, 'conv-auth-signed-out')).resolves.toEqual({
        status: 'refused',
        reason: 'Sign in to save chats to your account.',
      });
      expect(requests).toHaveLength(before);
    });

    it('never tells a signed-in user to sign in when the account turns the token down', async () => {
      await upsertConversation(OWNER, 'conv-auth-again', cloudMessages(5_270));
      respond = unauthorized;

      const outcome = await saveConversationNow(OWNER, 'conv-auth-again');

      expect(outcome).toEqual({ status: 'not-saved' });
      expect(messagePosts()).toHaveLength(1);
    });

    it('tries again once a policy block has waited out its time', async () => {
      await upsertConversation(OWNER, 'conv-policy-over', cloudMessages(5_275));
      respond = (request) =>
        request.url.endsWith('/messages')
          ? jsonResponse(
              { error: { type: 'organization_policy', code: 'surface_sync_disabled' } },
              403,
            )
          : defaultResponder(request);
      await flushConversation(OWNER, 'conv-policy-over');
      expect((await getConversation(OWNER, 'conv-policy-over'))?.cloudSync?.blockedReason).toBe(
        'policy',
      );
      await expect(saveConversationNow(OWNER, 'conv-policy-over')).resolves.toMatchObject({
        status: 'refused',
      });
      expect(messagePosts()).toHaveLength(1);

      await recordCloudSyncState(OWNER, 'conv-policy-over', { retryAfter: Date.now() - 1 });
      respond = defaultResponder;
      await expect(saveConversationNow(OWNER, 'conv-policy-over')).resolves.toEqual({
        status: 'saved',
      });
      expect(messagePosts().length).toBeGreaterThan(1);
    });
  });

  it('does not name a reset time the save will not wait for', async () => {
    await upsertConversation(OWNER, 'conv-two-waits', cloudMessages(5_280));
    const resetAt = new Date(Date.now() + 20 * 60 * 60_000).toISOString();
    respond = (request) =>
      request.url.endsWith('/messages')
        ? new Response(
            JSON.stringify({
              error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests.',
                reset_at: resetAt,
              },
            }),
            { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '120' } },
          )
        : defaultResponder(request);

    const outcome = await saveConversationNow(OWNER, 'conv-two-waits');

    expect(outcome).toMatchObject({ status: 'not-saved' });
    const { reason, retryAt } = outcome as { reason?: string; retryAt?: number };
    expect(retryAt).toBeLessThan(Date.now() + 121_000);
    expect(reason).not.toContain('resets');
    expect(reason).toContain('2 minutes');
  });

  describe('a chat waiting out a wait is retried by the extension itself', () => {
    const rateLimited = (request: RecordedRequest): Response =>
      request.url.endsWith('/messages')
        ? new Response(
            JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many.' } }),
            { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '120' } },
          )
        : defaultResponder(request);

    it('wakes when the earliest wait ends, not every minute', async () => {
      await upsertConversation(OWNER, 'conv-wake', cloudMessages(5_290));
      respond = rateLimited;
      await flushConversation(OWNER, 'conv-wake');
      const retryAfter = (await getConversation(OWNER, 'conv-wake'))?.cloudSync?.retryAfter;
      expect(retryAfter).toBeGreaterThan(Date.now());

      expect(alarms.get(CONVERSATION_SYNC_RETRY_ALARM)?.scheduledTime).toBe(retryAfter);
      expect(await sweepConversationSync()).toBe(false);
      expect(alarms.get(CONVERSATION_SYNC_RETRY_ALARM)?.scheduledTime).toBe(retryAfter);
    });

    it('wakes for the soonest of several waits and drops the wake once none is left', async () => {
      await upsertConversation(OWNER, 'conv-wake-later', cloudMessages(5_291));
      await upsertConversation(OWNER, 'conv-wake-sooner', cloudMessages(5_292));
      respond = rateLimited;
      await flushConversation(OWNER, 'conv-wake-later');
      await flushConversation(OWNER, 'conv-wake-sooner');
      const sooner = Date.now() + 30_000;
      await recordCloudSyncState(OWNER, 'conv-wake-sooner', { retryAfter: sooner });

      await sweepConversationSync();
      expect(alarms.get(CONVERSATION_SYNC_RETRY_ALARM)?.scheduledTime).toBe(sooner);

      respond = defaultResponder;
      await recordCloudSyncState(OWNER, 'conv-wake-later', { retryAfter: Date.now() - 1 });
      await recordCloudSyncState(OWNER, 'conv-wake-sooner', { retryAfter: Date.now() - 1 });
      expect(await sweepConversationSync()).toBe(false);
      expect(alarms.has(CONVERSATION_SYNC_RETRY_ALARM)).toBe(false);
      for (const id of ['conv-wake-later', 'conv-wake-sooner']) {
        expect(pendingCloudMessages((await getConversation(OWNER, id))!)).toHaveLength(0);
      }
    });

    it('does not keep waking the worker for an account that refuses on policy', async () => {
      await upsertConversation(OWNER, 'conv-wake-policy', cloudMessages(5_293));
      respond = (request) =>
        request.url.endsWith('/messages')
          ? jsonResponse(
              { error: { type: 'organization_policy', code: 'surface_sync_disabled' } },
              403,
            )
          : defaultResponder(request);
      await flushConversation(OWNER, 'conv-wake-policy');

      expect(await sweepConversationSync()).toBe(false);
      expect(alarms.has(CONVERSATION_SYNC_RETRY_ALARM)).toBe(false);
    });

    it('saves after the wait from stored state alone, as a restarted worker would', async () => {
      await upsertConversation(OWNER, 'conv-restart', cloudMessages(5_295));
      respond = rateLimited;
      await flushConversation(OWNER, 'conv-restart');
      const retryAfter = (await getConversation(OWNER, 'conv-restart'))!.cloudSync!.retryAfter!;
      const postsBefore = messagePosts().length;

      vi.resetModules();
      const restarted = await import('../src/features/cloud-bridge/conversationSync');
      respond = defaultResponder;
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(retryAfter + 1);
        expect(await restarted.sweepConversationSync()).toBe(false);
      } finally {
        vi.useRealTimers();
      }

      expect(messagePosts().length).toBeGreaterThan(postsBefore);
      const saved = await getConversation(OWNER, 'conv-restart');
      expect(pendingCloudMessages(saved!)).toHaveLength(0);
      expect(alarms.has(CONVERSATION_SYNC_RETRY_ALARM)).toBe(false);
    });
  });

  it('says saving is turned off instead of pretending to save', async () => {
    await upsertConversation(OWNER, 'conv-save-off', cloudMessages(5_300));
    setCloudMirroring(false);

    await expect(saveConversationNow(OWNER, 'conv-save-off')).resolves.toEqual({
      status: 'mirroring-off',
    });
    expect(requests).toHaveLength(0);
  });

  it('never shows a raw transport error as the reason a save failed', async () => {
    await upsertConversation(OWNER, 'conv-save-raw', cloudMessages(5_400));
    respond = (request) =>
      request.url.endsWith('/messages')
        ? jsonResponse({ error: 'internal stack trace at db.query' }, 500)
        : defaultResponder(request);

    const outcome = await saveConversationNow(OWNER, 'conv-save-raw');

    expect(outcome).toEqual({
      status: 'not-saved',
      reason: 'This chat could not be saved to your account. Try again in a few minutes.',
    });
  }, 10_000);

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

  it('sends no message once mirroring is turned off after the create was admitted', async () => {
    await upsertConversation(OWNER, 'conv-mirror-off-create', cloudMessages(7_100));
    respond = (request) => {
      setCloudMirroring(false);
      return defaultResponder(request);
    };

    await expect(flushConversation(OWNER, 'conv-mirror-off-create')).resolves.toBeUndefined();

    expect(conversationPosts()).toHaveLength(1);
    expect(messagePosts()).toHaveLength(0);
    const entry = await getConversation(OWNER, 'conv-mirror-off-create');
    expect(pendingCloudMessages(entry!)).toHaveLength(2);
  });

  it('sends no further message once mirroring is turned off between two messages', async () => {
    await upsertConversation(OWNER, 'conv-mirror-off-between', cloudMessages(7_200));
    respond = (request) => {
      if (request.url.endsWith('/messages')) setCloudMirroring(false);
      return defaultResponder(request);
    };

    await expect(flushConversation(OWNER, 'conv-mirror-off-between')).resolves.toBeUndefined();

    expect(messagePosts()).toHaveLength(1);
    expect(messagePosts()[0]?.body['content']).toBe('ask');
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

  it('keeps retained current-account deletions outstanding without dirty conversations', async () => {
    _store[CLOUD_SYNC_TOMBSTONE_KEY] = [
      {
        accountId: OWNER.accountId,
        cloudConversationId: CONVERSATION_WIRE.id,
        organizationId: null,
        queuedAt: 1,
      },
    ];
    respond = () => jsonResponse({ error: 'Forbidden' }, 403);
    await expect(sweepConversationSync()).resolves.toBe(true);
    expect(_store[CLOUD_SYNC_TOMBSTONE_KEY]).toHaveLength(1);
  });

  it('leaves other-account deletions dormant', async () => {
    _store[CLOUD_SYNC_TOMBSTONE_KEY] = [
      {
        accountId: OTHER_OWNER.accountId,
        cloudConversationId: CONVERSATION_WIRE.id,
        organizationId: null,
        queuedAt: 1,
      },
    ];
    await expect(sweepConversationSync()).resolves.toBe(false);
    expect(requests).toHaveLength(0);
    expect(_store[CLOUD_SYNC_TOMBSTONE_KEY]).toHaveLength(1);
  });

  it('leaves deletions dormant when auth is unavailable', async () => {
    _store[CLOUD_SYNC_TOMBSTONE_KEY] = [
      {
        accountId: OWNER.accountId,
        cloudConversationId: CONVERSATION_WIRE.id,
        organizationId: null,
        queuedAt: 1,
      },
    ];
    authContext.current = null;
    await expect(sweepConversationSync()).resolves.toBe(false);
    expect(requests).toHaveLength(0);
    expect(_store[CLOUD_SYNC_TOMBSTONE_KEY]).toHaveLength(1);
  });

  it('reports initially unavailable auth once without making a request', async () => {
    authContext.current = null;
    const onAuthUnavailable = vi.fn();
    await expect(sweepConversationSync(onAuthUnavailable)).resolves.toBe(false);
    expect(onAuthUnavailable).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(0);
  });

  it('reports auth becoming unavailable during deletion so the same owner can wake later', async () => {
    _store[CLOUD_SYNC_TOMBSTONE_KEY] = [
      {
        accountId: OWNER.accountId,
        cloudConversationId: CONVERSATION_WIRE.id,
        organizationId: null,
        queuedAt: 1,
      },
    ];
    const onAuthUnavailable = vi.fn();
    respond = () => {
      authContext.current = null;
      return jsonResponse({ error: 'Forbidden' }, 403);
    };
    await expect(sweepConversationSync(onAuthUnavailable)).resolves.toBe(false);
    expect(onAuthUnavailable).toHaveBeenCalledTimes(1);
    expect(_store[CLOUD_SYNC_TOMBSTONE_KEY]).toHaveLength(1);
  });

  it('does not keep the old account awake when auth changes during a failed deletion', async () => {
    _store[CLOUD_SYNC_TOMBSTONE_KEY] = [
      {
        accountId: OWNER.accountId,
        cloudConversationId: CONVERSATION_WIRE.id,
        organizationId: null,
        queuedAt: 1,
      },
    ];
    respond = () => {
      authContext.current = { token: 'other-bearer', owner: { ...OTHER_OWNER } };
      return jsonResponse({ error: 'Forbidden' }, 403);
    };
    await expect(sweepConversationSync()).resolves.toBe(false);
    expect(_store[CLOUD_SYNC_TOMBSTONE_KEY]).toHaveLength(1);
  });

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

  it('preserves concurrent enqueues from background handlers', async () => {
    authContext.current = null;
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    expect(
      await Promise.all(ids.map((id) => queueCloudConversationDeletion(OWNER, id, null))),
    ).toEqual([true, true]);
    await drainCloudDeletionTombstones(OWNER);
    expect(_store[CLOUD_SYNC_TOMBSTONE_KEY]).toEqual(
      ids.map((id) =>
        expect.objectContaining({
          cloudConversationId: id,
          generation: expect.any(String),
        }),
      ),
    );
  });

  it.each([
    { organizationId: null, legacy: false },
    { organizationId: '33333333-3333-4333-8333-333333333333', legacy: false },
    { organizationId: null, legacy: true },
    { organizationId: '33333333-3333-4333-8333-333333333333', legacy: true },
  ])(
    'does not settle a same-timestamp replacement ($organizationId, legacy=$legacy)',
    async ({ organizationId, legacy }) => {
      const cloudConversationId = '44444444-4444-4444-8444-444444444444';
      const queuedAt = 1234;
      _store[CLOUD_SYNC_TOMBSTONE_KEY] = [
        {
          accountId: OWNER.accountId,
          cloudConversationId,
          organizationId: null,
          queuedAt,
          ...(legacy ? {} : { generation: '55555555-5555-4555-8555-555555555555' }),
        },
      ];
      let release!: (response: Response) => void;
      let started!: () => void;
      const requestStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          started();
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        }),
      );
      const draining = drainCloudDeletionTombstones(OWNER);
      await requestStarted;
      authContext.current = null;
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(queuedAt);
      try {
        expect(
          await queueCloudConversationDeletion(OWNER, cloudConversationId, organizationId),
        ).toBe(true);
      } finally {
        dateSpy.mockRestore();
      }
      const replacement = structuredClone(_store[CLOUD_SYNC_TOMBSTONE_KEY]);
      release(jsonResponse({ success: true }));
      await draining;
      await drainCloudDeletionTombstones(OWNER);
      expect(_store[CLOUD_SYNC_TOMBSTONE_KEY]).toEqual(replacement);
    },
  );

  it('preserves the queue on a failed read and recovers the serialization tail', async () => {
    authContext.current = null;
    const old = {
      accountId: OWNER.accountId,
      cloudConversationId: '66666666-6666-4666-8666-666666666666',
      organizationId: null,
      queuedAt: 1,
    };
    _store[CLOUD_SYNC_TOMBSTONE_KEY] = [old];
    chromeMock.storage.local.get.mockRejectedValueOnce(new Error('Storage unavailable'));
    expect(
      await queueCloudConversationDeletion(OWNER, '77777777-7777-4777-8777-777777777777', null),
    ).toBe(false);
    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
    expect(_store[CLOUD_SYNC_TOMBSTONE_KEY]).toEqual([old]);
    expect(
      await queueCloudConversationDeletion(OWNER, '77777777-7777-4777-8777-777777777777', null),
    ).toBe(true);
    await drainCloudDeletionTombstones(OWNER);
    expect(_store[CLOUD_SYNC_TOMBSTONE_KEY]).toEqual([
      old,
      expect.objectContaining({
        cloudConversationId: '77777777-7777-4777-8777-777777777777',
      }),
    ]);
  });

  it('does not send a deletion when its snapshot read fails', async () => {
    chromeMock.storage.local.get.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(drainCloudDeletionTombstones(OWNER)).rejects.toThrow('Storage unavailable');
    expect(requests).toHaveLength(0);
    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
  });

  it('retains acknowledged deletions when the settlement read fails, then retries safely', async () => {
    const pending = [
      {
        accountId: OWNER.accountId,
        cloudConversationId: '88888888-8888-4888-8888-888888888888',
        organizationId: null,
        queuedAt: 1,
      },
    ];
    _store[CLOUD_SYNC_TOMBSTONE_KEY] = pending;
    respond = () => {
      chromeMock.storage.local.get.mockRejectedValueOnce(new Error('Storage unavailable'));
      return jsonResponse({ success: true });
    };
    await drainCloudDeletionTombstones(OWNER);
    expect(_store[CLOUD_SYNC_TOMBSTONE_KEY]).toEqual(pending);
    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
    respond = () => jsonResponse({ error: 'Not found' }, 404);
    await drainCloudDeletionTombstones(OWNER);
    expect(_store[CLOUD_SYNC_TOMBSTONE_KEY]).toEqual([]);
  });

  it('settles valid legacy rows without a generation', async () => {
    _store[CLOUD_SYNC_TOMBSTONE_KEY] = [
      {
        accountId: OWNER.accountId,
        cloudConversationId: '88888888-8888-4888-8888-888888888888',
        organizationId: null,
        queuedAt: 1,
      },
    ];
    await drainCloudDeletionTombstones(OWNER);
    expect(_store[CLOUD_SYNC_TOMBSTONE_KEY]).toEqual([]);
  });

  it.each(
    [
      null,
      { unexpected: true },
      [{ accountId: OWNER.accountId }],
      [
        {
          accountId: OWNER.accountId,
          cloudConversationId: '88888888-8888-4888-8888-888888888888',
          organizationId: null,
          queuedAt: 1,
          generation: 'invalid',
        },
      ],
    ].map((malformed) => ({ malformed })),
  )(
    'preserves malformed stored queues without requests or writes: $malformed',
    async ({ malformed }) => {
      const valid = {
        accountId: OWNER.accountId,
        cloudConversationId: '99999999-9999-4999-8999-999999999999',
        organizationId: null,
        queuedAt: 1,
      };
      const stored = Array.isArray(malformed) ? [valid, ...malformed] : malformed;
      _store[CLOUD_SYNC_TOMBSTONE_KEY] = stored;
      expect(await queueCloudConversationDeletion(OWNER, valid.cloudConversationId, null)).toBe(
        false,
      );
      await expect(drainCloudDeletionTombstones(OWNER)).rejects.toThrow();
      expect(_store[CLOUD_SYNC_TOMBSTONE_KEY]).toEqual(stored);
      expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
      expect(requests).toHaveLength(0);
    },
  );

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
  it('files the created cloud conversation under the project the panel selected', async () => {
    respond = (request) => {
      if (request.url.endsWith('/messages')) {
        return jsonResponse({ message: { id: String(request.body['id'] ?? 'srv') } });
      }
      return jsonResponse({
        conversation: {
          ...CONVERSATION_WIRE,
          id: String(request.body['id']),
          project_id: String(request.body['projectId'] ?? ''),
        },
      });
    };

    await upsertConversation(OWNER, 'conv-project', cloudMessages(4_000), undefined, 'project-42');
    await flushConversation(OWNER, 'conv-project');

    expect(conversationPosts()).toHaveLength(1);
    expect(conversationPosts()[0]!.body['projectId']).toBe('project-42');
    // The server's answer is what the chat is filed under, so an accepted
    // binding must not be re-asserted on every later flush.
    expect(requests.filter((request) => 'projectId' in request.body)).toHaveLength(1);
  });

  it('does not acknowledge an existing chat while its new project binding failed to sync', async () => {
    const messages = cloudMessages(5000);
    await upsertConversation(OWNER, 'conv-project-refusal', messages);
    await flushConversation(OWNER, 'conv-project-refusal');
    const original = await getConversation(OWNER, 'conv-project-refusal');
    expect(original?.cloudSync?.createAcknowledged).toBe(true);
    await upsertConversation(
      OWNER,
      'conv-project-refusal',
      messages,
      undefined,
      'selected-project',
    );
    respond = (request) =>
      request.method === 'PUT'
        ? jsonResponse({ error: 'Project update refused' }, 503)
        : defaultResponder(request);
    expect(await ensureCloudConversation(OWNER, 'conv-project-refusal')).toBeNull();
  });

  it('acknowledges both changing and clearing the project on an existing account chat', async () => {
    const messages = cloudMessages(6000);
    let serverId = CONVERSATION_WIRE.id;
    let serverProject: string | null = null;
    respond = (request) => {
      if (request.url.endsWith('/messages')) return defaultResponder(request);
      if (request.method === 'POST') serverId = String(request.body.id);
      if ('projectId' in request.body) serverProject = request.body.projectId as string | null;
      return jsonResponse({
        conversation: { ...CONVERSATION_WIRE, id: serverId, project_id: serverProject },
      });
    };
    await upsertConversation(OWNER, 'conv-project-change', messages);
    await flushConversation(OWNER, 'conv-project-change');
    await upsertConversation(OWNER, 'conv-project-change', messages, undefined, 'selected-project');
    expect(await ensureCloudConversation(OWNER, 'conv-project-change')).toBe(serverId);
    expect((await getConversation(OWNER, 'conv-project-change'))?.cloudSync?.syncedProjectId).toBe(
      'selected-project',
    );
    await upsertConversation(OWNER, 'conv-project-change', messages, undefined, null);
    expect(await ensureCloudConversation(OWNER, 'conv-project-change')).toBe(serverId);
    expect(serverProject).toBeNull();
    expect(
      (await getConversation(OWNER, 'conv-project-change'))?.cloudSync?.syncedProjectId,
    ).toBeNull();
    expect(conversationPosts()).toHaveLength(1);
  });
});
