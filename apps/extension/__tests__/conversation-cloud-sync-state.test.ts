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
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';
import { projectPublicHistoryMessage } from '../src/features/cloud-bridge/conversationHistoryPull';
import { buildExtensionCloudMessageMetadata } from '../src/features/cloud-bridge/conversationSyncClient';
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
  importManagedCloudConversationHistory,
  cloudMessageSyncFingerprint,
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

  it('protects an unsynced plan cancellation from a stale account refresh', async () => {
    const { message, conversation, incoming } = await activityFixture();
    const before = cloudMessageSyncFingerprint(message);
    expect(cloudMessageSyncFingerprint({ ...message, agiWorkPlanDeclined: false })).toBe(before);
    await upsertConversation(OWNER, CLOUD_CONVERSATION_ID, [
      { ...message, agiWorkPlanDeclined: true },
    ]);
    const entry = (await getConversation(OWNER, CLOUD_CONVERSATION_ID))!;
    expect(pendingCloudMessages(entry)).toHaveLength(1);
    expect(
      await importManagedCloudConversationHistory(
        OWNER,
        null,
        [{ conversation, messages: [incoming] }],
        () => true,
        () => false,
      ),
    ).toBe(0);
    expect(
      (await getConversation(OWNER, CLOUD_CONVERSATION_ID))?.messages[0]?.agiWorkPlanDeclined,
    ).toBe(true);
  });

  it.each([
    ['assistant', true, true],
    ['assistant', false, undefined],
    ['assistant', 'true', undefined],
    ['user', true, undefined],
  ] as const)(
    'projects only a valid assistant plan cancellation (%s, %s)',
    (role, value, expected) => {
      const message = projectPublicHistoryMessage({
        id: '33333333-3333-4333-8333-333333333333',
        conversationId: CLOUD_CONVERSATION_ID,
        role,
        content: 'Plan',
        inputTokens: 0,
        outputTokens: 0,
        createdAt: '2026-11-07T00:00:00.000Z',
        metadata: { agiWorkPlanDeclined: value },
      });
      expect(message?.agiWorkPlanDeclined).toBe(expected);
    },
  );

  async function activityFixture() {
    const cloudMessageId = '33333333-3333-4333-8333-333333333333';
    const runId = '44444444-4444-4444-8444-444444444444';
    const message: HistoryMessage = {
      role: 'assistant',
      content: 'The form is filled.',
      timestamp: Date.now(),
      runtime: 'managed-cloud',
      cloudMessageId,
      browserEvents: [
        {
          schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
          sessionId: 'browser-session',
          turnId: 'browser-turn',
          sequence: 0,
          emittedAtMs: 1_000,
          event: {
            type: 'tool-execution-start',
            toolCallId: 'read-1',
            name: 'browser_read_page',
            category: 'computer-use',
            summary: 'Reading the page',
            input: null,
          },
        },
      ],
      cloudAgentRun: {
        runId,
        runPath: `/api/llm/v1/chat/completions/runs/${runId}`,
        lastSequence: 2,
        state: 'completed',
      },
      durationMs: 2_000,
    };
    message.cloudSyncedAt = Date.now();
    message.cloudSyncedChars = message.content.length;
    message.cloudSyncedFingerprint = cloudMessageSyncFingerprint(message);
    await upsertConversation(OWNER, CLOUD_CONVERSATION_ID, [message]);
    expect(
      (await getConversation(OWNER, CLOUD_CONVERSATION_ID))?.messages[0]?.browserEvents,
    ).toEqual(message.browserEvents);
    await recordCloudSyncState(OWNER, CLOUD_CONVERSATION_ID, {
      conversationId: CLOUD_CONVERSATION_ID,
      organizationId: null,
      createAcknowledged: true,
      state: 'idle',
    });
    const conversation = {
      id: CLOUD_CONVERSATION_ID,
      organizationId: null,
      title: 'Account title',
      projectId: null,
      pinned: false,
      starred: false,
      archived: false,
      isTemporary: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const incoming: HistoryMessage = {
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      runtime: 'managed-cloud',
      cloudMessageId,
    };
    return { message, conversation, incoming };
  }

  it('restores the durable descriptor from an account history message without file bytes or URLs', () => {
    const assetId = '77777777-7777-4777-8777-777777777777';
    const message = {
      id: '33333333-3333-4333-8333-333333333333',
      conversationId: CLOUD_CONVERSATION_ID,
      role: 'user' as const,
      content: 'Read the file.',
      inputTokens: 0,
      outputTokens: 0,
      createdAt: '2026-11-06T12:00:00.000Z',
      metadata: {
        runtime: 'managed-cloud',
        attachments: [
          {
            id: assetId,
            assetId,
            type: 'file',
            name: 'handoff.txt',
            mimeType: 'text/plain',
            content: 'DO_NOT_COPY_FILE_BYTES',
            url: 'https://storage.example/private?signature=fixture',
          },
        ],
      },
    };
    expect(projectPublicHistoryMessage(message)?.attachments).toEqual([
      { kind: 'file', name: 'handoff.txt', mimeType: 'text/plain', assetId },
    ]);
    expect(
      projectPublicHistoryMessage({ ...message, metadata: { attachments: [] } })?.attachments,
    ).toEqual([]);
    expect(projectPublicHistoryMessage({ ...message, metadata: {} })?.attachments).toBeUndefined();
    expect(
      projectPublicHistoryMessage({ ...message, role: 'assistant' })?.attachments,
    ).toBeUndefined();
  });

  it('includes durable user file references in synchronized metadata', () => {
    const assetId = '77777777-7777-4777-8777-777777777777';
    const metadata = buildExtensionCloudMessageMetadata({
      localConversationId: 'local-file-conversation',
      runtime: 'managed-cloud',
      attachments: [{ kind: 'file', name: 'handoff.txt', mimeType: 'text/plain', assetId }],
    });
    expect(metadata['attachments']).toEqual([
      expect.objectContaining({
        id: assetId,
        assetId,
        type: 'file',
        name: 'handoff.txt',
        mimeType: 'text/plain',
      }),
    ]);
  });

  it('detects a changed attachment without requiring the question text to change', () => {
    const message: HistoryMessage = {
      role: 'user',
      content: 'Read this file.',
      runtime: 'managed-cloud',
      timestamp: 1,
    };
    const before = cloudMessageSyncFingerprint(message);
    expect(
      cloudMessageSyncFingerprint({
        ...message,
        attachments: [
          {
            kind: 'file',
            name: 'handoff.txt',
            mimeType: 'text/plain',
            assetId: '77777777-7777-4777-8777-777777777777',
          },
        ],
      }),
    ).not.toBe(before);
  });

  it('retains device activity for the exact owned cloud message on refresh without making it pending for upload', async () => {
    const { message, conversation, incoming } = await activityFixture();
    expect(
      await importManagedCloudConversationHistory(
        OWNER,
        null,
        [{ conversation, messages: [incoming] }],
        () => true,
        () => false,
      ),
    ).toBe(1);
    const entry = (await getConversation(OWNER, CLOUD_CONVERSATION_ID))!;
    expect(entry.messages[0]?.browserEvents).toEqual(message.browserEvents);
    expect(entry.messages[0]?.cloudAgentRun).toEqual(message.cloudAgentRun);
    expect(entry.messages[0]?.durationMs).toBe(2_000);
    expect(pendingCloudMessages(entry)).toEqual([]);
    const metadata = buildExtensionCloudMessageMetadata({
      ...entry.messages[0]!,
      runtime: 'managed-cloud',
      localConversationId: CLOUD_CONVERSATION_ID,
    });
    expect(metadata).not.toHaveProperty('browserEvents');
    expect(metadata).not.toHaveProperty('agentEvents');
  });

  async function activeTitleFixture() {
    const fixture = await activityFixture();
    const existing = (await getConversation(OWNER, CLOUD_CONVERSATION_ID))!;
    await recordCloudSyncState(OWNER, CLOUD_CONVERSATION_ID, {
      syncedTitle: existing.title,
      remoteUpdatedAt: '2026-11-08T00:00:00.000Z',
    });
    return {
      ...fixture,
      existing: (await getConversation(OWNER, CLOUD_CONVERSATION_ID))!,
      conversation: { ...fixture.conversation, updatedAt: '2026-11-09T00:00:00.000Z' },
    };
  }

  it('refreshes only the synced title of an active settled chat without replacing its messages or metadata', async () => {
    const { existing, conversation } = await activeTitleFixture();
    const before = structuredClone(existing);
    expect(
      await importManagedCloudConversationHistory(
        OWNER,
        null,
        [{ conversation, messages: [] }],
        () => true,
        (id) => id === existing.id,
      ),
    ).toBe(1);
    const after = (await getConversation(OWNER, existing.id))!;
    expect(after).toEqual({
      ...before,
      title: conversation.title,
      customTitle: conversation.title,
      cloudSync: {
        ...before.cloudSync,
        syncedTitle: conversation.title,
        remoteUpdatedAt: conversation.updatedAt,
      },
    });
    expect(pendingCloudMessages(after)).toEqual([]);
    expect(
      await importManagedCloudConversationHistory(
        OWNER,
        null,
        [
          {
            conversation: {
              ...conversation,
              title: 'Stale title',
              updatedAt: '2026-11-08T12:00:00.000Z',
            },
          },
        ],
        () => true,
        () => true,
      ),
    ).toBe(0);
    expect(await getConversation(OWNER, existing.id)).toEqual(after);
  });

  it.each([
    'local rename',
    'unsynced message',
    'streaming',
    'cancellation',
    'non-cloud runtime',
    'blocked runtime',
    'unacknowledged',
    'sync in progress',
    'other workspace',
    'stale snapshot',
  ] as const)('preserves an active chat with %s during a title refresh', async (condition) => {
    const { existing, conversation } = await activeTitleFixture();
    if (condition === 'local rename') existing.customTitle = existing.title = 'My new title';
    if (condition === 'unsynced message') existing.messages[0]!.content += ' locally edited';
    if (condition === 'streaming') existing.messages[0]!.streaming = true;
    if (condition === 'cancellation') existing.messages[0]!.streamCancellation = 'pending';
    if (condition === 'non-cloud runtime') existing.messages[0]!.runtime = 'local';
    if (condition === 'blocked runtime') existing.cloudSync!.blockedReason = 'non-cloud-runtime';
    if (condition === 'unacknowledged') existing.cloudSync!.createAcknowledged = false;
    if (condition === 'sync in progress') existing.cloudSync!.state = 'pending';
    if (condition === 'other workspace')
      existing.cloudSync!.organizationId = '66666666-6666-4666-8666-666666666666';
    if (condition === 'stale snapshot')
      existing.cloudSync!.remoteUpdatedAt = '2026-11-10T00:00:00.000Z';
    writeStoreDirect([existing]);
    expect(await getConversation(OWNER, existing.id)).toBeDefined();
    const before = structuredClone(readStoredEntries());
    expect(
      await importManagedCloudConversationHistory(
        OWNER,
        null,
        [{ conversation }],
        () => true,
        () => true,
      ),
    ).toBe(0);
    expect(readStoredEntries()).toEqual(before);
  });

  it('discards an active title refresh when its owner changes before commit', async () => {
    const { existing, conversation } = await activeTitleFixture();
    const before = structuredClone(readStoredEntries());
    const ownerIsCurrent = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(
      await importManagedCloudConversationHistory(
        OWNER,
        null,
        [{ conversation }],
        ownerIsCurrent,
        (id) => id === existing.id,
      ),
    ).toBe(0);
    expect(readStoredEntries()).toEqual(before);
  });

  it('does not update a protected title from another authentication incarnation', async () => {
    const { conversation } = await activeTitleFixture();
    const before = structuredClone(readStoredEntries());
    expect(
      await importManagedCloudConversationHistory(
        { ...OWNER, authIncarnation: 'session-replaced' },
        null,
        [{ conversation }],
        () => true,
        () => true,
      ),
    ).toBe(0);
    expect(readStoredEntries()).toEqual(before);
  });

  it.each(['content', 'role', 'cloudMessageId'] as const)(
    'does not attach activity to changed %s',
    async (field) => {
      const { conversation, incoming } = await activityFixture();
      const changed =
        field === 'content'
          ? { ...incoming, content: 'A different answer' }
          : field === 'role'
            ? { ...incoming, role: 'user' as const }
            : { ...incoming, cloudMessageId: '55555555-5555-4555-8555-555555555555' };
      await importManagedCloudConversationHistory(
        OWNER,
        null,
        [{ conversation, messages: [changed] }],
        () => true,
        () => false,
      );
      expect(
        (await getConversation(OWNER, CLOUD_CONVERSATION_ID))?.messages[0]?.browserEvents,
      ).toBeUndefined();
    },
  );

  it("does not carry another account's activity into an imported account chat", async () => {
    const { conversation, incoming } = await activityFixture();
    const other = { accountId: 'account-b', authIncarnation: 'session-b' };
    await importManagedCloudConversationHistory(
      other,
      null,
      [{ conversation, messages: [incoming] }],
      () => true,
      () => false,
    );
    expect(
      (await getConversation(other, CLOUD_CONVERSATION_ID))?.messages[0]?.browserEvents,
    ).toBeUndefined();
    expect(
      (await getConversation(OWNER, CLOUD_CONVERSATION_ID))?.messages[0]?.browserEvents,
    ).toBeDefined();
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
