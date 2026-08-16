/**
 * @vitest-environment jsdom
 *
 * Storage-seam behavior for the account-backed conversation mirror.
 *
 * The highest-value cases here are the negative ones: a corrupt cloud field
 * must NOT destroy a conversation, and quota/TTL eviction must NEVER produce a
 * cloud-deletion handle. Both are failure modes that would silently lose user
 * data, and neither is visible from a green build.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  blockCloudPersistence,
  claimCloudConversationBinding,
  deleteConversation,
  getConversation,
  isCloudPersistenceEligible,
  listConversationsNeedingCloudSync,
  pendingCloudMessages,
  recordCloudMessagesSynced,
  recordCloudSyncState,
  upsertConversation,
  type ConversationEntry,
  type HistoryMessage,
} from '../src/features/background/conversation-history';
import type { ManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';

const _store: Record<string, unknown> = {};
const OWNER: ManagedCloudOwner = { accountId: 'account-a', authIncarnation: 'session-a' };
const BROWSER_STORE_KEY = 'agi_browser_conversations_v2';
const CLOUD_CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';

function selectedValues(key: string | string[]): Record<string, unknown> {
  const keys = Array.isArray(key) ? key : [key];
  return Object.fromEntries(keys.map((entry) => [entry, _store[entry]]));
}

const chromeMock = {
  storage: {
    local: {
      get: vi.fn((key: string | string[], cb: (res: Record<string, unknown>) => void) => {
        cb(selectedValues(key));
      }),
      set: vi.fn((items: Record<string, unknown>, cb?: () => void) => {
        for (const [k, v] of Object.entries(items)) _store[k] = v;
        cb?.();
      }),
      remove: vi.fn((keys: string | string[], cb?: () => void) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete _store[key];
        cb?.();
      }),
    },
  },
  runtime: { lastError: undefined as chrome.runtime.LastError | undefined },
};

(globalThis as unknown as Record<string, unknown>).chrome = chromeMock;

function cloudMessages(at = 1_000): HistoryMessage[] {
  return [
    { role: 'user', content: 'ask', timestamp: at, runtime: 'managed-cloud' },
    { role: 'assistant', content: 'answer', timestamp: at + 1, runtime: 'managed-cloud' },
  ];
}

function readStoredEntries(): ConversationEntry[] {
  const store = _store[BROWSER_STORE_KEY] as { conversations?: ConversationEntry[] } | undefined;
  return store?.conversations ?? [];
}

function writeStoreDirect(conversations: unknown[]): void {
  _store[BROWSER_STORE_KEY] = {
    version: 2,
    activeConversationId: null,
    activeOwner: null,
    conversations,
  };
}

describe('conversation cloud-sync state', () => {
  beforeEach(() => {
    for (const key of Object.keys(_store)) delete _store[key];
    chromeMock.runtime.lastError = undefined;
    vi.clearAllMocks();
  });

  it('round-trips the new cloud fields through normalization without dropping the entry', async () => {
    writeStoreDirect([
      {
        id: 'conv-1',
        owner: OWNER,
        title: 'Kept',
        savedAt: Date.now(),
        routing: { selectedModel: 'auto' },
        cloudSync: {
          conversationId: CLOUD_CONVERSATION_ID,
          organizationId: null,
          createAcknowledged: true,
          syncedTitle: 'Kept',
          state: 'idle',
        },
        messages: [
          {
            role: 'user',
            content: 'ask',
            timestamp: 10,
            runtime: 'managed-cloud',
            cloudMessageId: '33333333-3333-4333-8333-333333333333',
            cloudSyncedAt: 20,
            cloudSyncedChars: 3,
          },
        ],
      },
    ]);

    const entry = await getConversation(OWNER, 'conv-1');
    expect(entry).toBeDefined();
    expect(entry?.cloudSync?.conversationId).toBe(CLOUD_CONVERSATION_ID);
    expect(entry?.cloudSync?.organizationId).toBeNull();
    expect(entry?.cloudSync?.createAcknowledged).toBe(true);
    expect(entry?.messages[0]?.runtime).toBe('managed-cloud');
    expect(entry?.messages[0]?.cloudMessageId).toBe('33333333-3333-4333-8333-333333333333');
    expect(entry?.messages[0]?.cloudSyncedChars).toBe(3);
  });

  it('degrades a corrupt cloudMessageId to unsynced instead of destroying the conversation', async () => {
    writeStoreDirect([
      {
        id: 'conv-corrupt',
        owner: OWNER,
        title: 'Survivor',
        savedAt: Date.now(),
        routing: { selectedModel: 'auto' },
        messages: [
          {
            role: 'user',
            content: 'ask',
            timestamp: 10,
            runtime: 'managed-cloud',
            cloudMessageId: 'not-a-uuid',
          },
        ],
      },
    ]);

    const entry = await getConversation(OWNER, 'conv-corrupt');
    expect(entry).toBeDefined();
    expect(entry?.messages).toHaveLength(1);
    expect(entry?.messages[0]?.cloudMessageId).toBeUndefined();
    expect(entry?.messages[0]?.content).toBe('ask');
  });

  it('carries cloud bookkeeping forward across a panel upsert that omits it', async () => {
    const at = 5_000;
    await upsertConversation(OWNER, 'conv-carry', cloudMessages(at));
    const bound = await claimCloudConversationBinding(
      OWNER,
      'conv-carry',
      () => CLOUD_CONVERSATION_ID,
    );
    const assistantCloudId = bound?.messages[1]?.cloudMessageId;
    expect(assistantCloudId).toMatch(/^[0-9a-f-]{36}$/i);
    await recordCloudMessagesSynced(OWNER, 'conv-carry', [
      {
        cloudMessageId: assistantCloudId!,
        syncedChars: 'answer'.length,
        syncedFingerprint: '1:00000000:00000000',
      },
    ]);

    await upsertConversation(OWNER, 'conv-carry', [
      { role: 'user', content: 'ask', timestamp: at, runtime: 'managed-cloud' },
      {
        role: 'assistant',
        content: 'answer plus more',
        timestamp: at + 1,
        runtime: 'managed-cloud',
      },
    ]);

    const entry = await getConversation(OWNER, 'conv-carry');
    expect(entry?.cloudSync?.conversationId).toBe(CLOUD_CONVERSATION_ID);
    expect(entry?.messages[1]?.cloudMessageId).toBe(assistantCloudId);
    expect(entry?.messages[1]?.cloudSyncedChars).toBe('answer'.length);
    expect(pendingCloudMessages(entry!).map((message) => message.content)).toContain(
      'answer plus more',
    );
  });

  it('is ineligible for an unstamped message, a mixed thread, and after a sticky block', async () => {
    const at = 6_000;
    await upsertConversation(OWNER, 'conv-unstamped', [
      { role: 'user', content: 'ask', timestamp: at },
    ]);
    expect(isCloudPersistenceEligible((await getConversation(OWNER, 'conv-unstamped'))!)).toBe(
      false,
    );

    await upsertConversation(OWNER, 'conv-mixed', [
      { role: 'user', content: 'ask', timestamp: at, runtime: 'managed-cloud' },
      { role: 'assistant', content: 'answer', timestamp: at + 1, runtime: 'local' },
    ]);
    expect(isCloudPersistenceEligible((await getConversation(OWNER, 'conv-mixed'))!)).toBe(false);

    await upsertConversation(OWNER, 'conv-sticky', cloudMessages(at));
    expect(isCloudPersistenceEligible((await getConversation(OWNER, 'conv-sticky'))!)).toBe(true);
    await blockCloudPersistence(OWNER, 'conv-sticky', 'non-cloud-runtime');
    expect(isCloudPersistenceEligible((await getConversation(OWNER, 'conv-sticky'))!)).toBe(false);

    await recordCloudSyncState(OWNER, 'conv-sticky', { state: 'idle', blockedReason: undefined });
    const after = await getConversation(OWNER, 'conv-sticky');
    expect(after?.cloudSync?.blockedReason).toBe('non-cloud-runtime');
    expect(isCloudPersistenceEligible(after!)).toBe(false);
  });

  it('claims a binding idempotently so two flushes cannot create two cloud rows', async () => {
    await upsertConversation(OWNER, 'conv-idem', cloudMessages(7_000));
    const first = await claimCloudConversationBinding(
      OWNER,
      'conv-idem',
      () => CLOUD_CONVERSATION_ID,
    );
    const second = await claimCloudConversationBinding(
      OWNER,
      'conv-idem',
      () => '44444444-4444-4444-8444-444444444444',
    );
    expect(first?.cloudSync?.conversationId).toBe(CLOUD_CONVERSATION_ID);
    expect(first?.cloudSync?.createAcknowledged).toBe(false);
    expect(second?.cloudSync?.conversationId).toBe(CLOUD_CONVERSATION_ID);
  });

  it('refuses to mint a binding for an ineligible thread', async () => {
    await upsertConversation(OWNER, 'conv-local', [
      { role: 'user', content: 'ask', timestamp: 8_000, runtime: 'local' },
    ]);
    const bound = await claimCloudConversationBinding(
      OWNER,
      'conv-local',
      () => CLOUD_CONVERSATION_ID,
    );
    expect(bound).toBeUndefined();
    expect(readStoredEntries()[0]?.cloudSync).toBeUndefined();
  });

  it('returns a cloud handle from deleteConversation only when one was bound', async () => {
    await upsertConversation(OWNER, 'conv-nobind', cloudMessages(9_000));
    await expect(deleteConversation(OWNER, 'conv-nobind')).resolves.toEqual({});

    await upsertConversation(OWNER, 'conv-bound', cloudMessages(9_500));
    await claimCloudConversationBinding(OWNER, 'conv-bound', () => CLOUD_CONVERSATION_ID);
    await recordCloudSyncState(OWNER, 'conv-bound', {
      state: 'idle',
      organizationId: null,
      createAcknowledged: true,
    });
    await expect(deleteConversation(OWNER, 'conv-bound')).resolves.toEqual({
      cloudConversationId: CLOUD_CONVERSATION_ID,
      organizationId: null,
    });

    await expect(deleteConversation(OWNER, 'conv-missing')).resolves.toBeUndefined();
  });

  it('never hands out a cloud-deletion handle for a TTL eviction', async () => {
    writeStoreDirect([
      {
        id: 'conv-expired',
        owner: OWNER,
        title: 'Expired',
        savedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
        routing: { selectedModel: 'auto' },
        cloudSync: { conversationId: CLOUD_CONVERSATION_ID, state: 'idle' },
        messages: cloudMessages(1_000),
      },
    ]);

    expect(await getConversation(OWNER, 'conv-expired')).toBeUndefined();
    expect(await deleteConversation(OWNER, 'conv-expired')).toBeUndefined();
  });

  it('lists only eligible, dirty conversations that are not inside their backoff window', async () => {
    await upsertConversation(OWNER, 'conv-dirty', cloudMessages(10_000));
    await upsertConversation(OWNER, 'conv-backoff', cloudMessages(10_100));
    await recordCloudSyncState(OWNER, 'conv-backoff', {
      state: 'error',
      retryAfter: Date.now() + 60_000,
    });
    await upsertConversation(OWNER, 'conv-local-turn', [
      { role: 'user', content: 'ask', timestamp: 10_200, runtime: 'local' },
    ]);

    const ids = (await listConversationsNeedingCloudSync(OWNER)).map((entry) => entry.id);
    expect(ids).toContain('conv-dirty');
    expect(ids).not.toContain('conv-backoff');
    expect(ids).not.toContain('conv-local-turn');
  });
});
