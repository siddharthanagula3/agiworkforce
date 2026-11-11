/**
 * @vitest-environment jsdom
 *
 * Startup in a second or third live window seeds a fresh local record from the
 * same account chat, so several clean local records can be bound to one cloud
 * conversation. Archiving that chat must reach every one of them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('../src/features/cloud-bridge/freeTrialClient', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  CODE_EXECUTION_OUTPUT_MAX_CHARS: 16_000,
  FREE_TRIAL_GATEWAY: 'https://agiworkforce.com',
  getManagedCloudAuthContext: vi.fn(async () => authContext.current),
}));

import {
  cloudMessageSyncFingerprint,
  getConversation,
  importManagedCloudConversationHistory,
  pendingCloudMessages,
  type ConversationEntry,
  type HistoryMessage,
} from '../src/features/background/conversation-history';
import { pullCloudConversationFlags } from '../src/features/cloud-bridge/conversationSync';
import type { ManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';

const OWNER: ManagedCloudOwner = { accountId: 'account-a', authIncarnation: 'session-a' };
const BROWSER_STORE_KEY = 'agi_browser_conversations_v2';
const CLOUD_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const REMOTE_UPDATED_AT = '2026-11-08T10:00:00.000Z';
const ALIAS_IDS = ['alias-c', 'alias-b', 'alias-a'];

function syncedMessage(): HistoryMessage {
  const message: HistoryMessage = {
    role: 'user',
    content: 'ask',
    timestamp: 10,
    runtime: 'managed-cloud',
    cloudMessageId: MESSAGE_ID,
  };
  return {
    ...message,
    cloudSyncedAt: 20,
    cloudSyncedChars: message.content.length,
    cloudSyncedFingerprint: cloudMessageSyncFingerprint(message),
  };
}

function alias(id: string, changes: Partial<ConversationEntry> = {}): ConversationEntry {
  return {
    id,
    owner: OWNER,
    title: 'Shared chat',
    savedAt: Date.now(),
    routing: { selectedModel: 'auto' },
    messages: [syncedMessage()],
    pinned: false,
    starred: false,
    archived: false,
    cloudSync: {
      conversationId: CLOUD_ID,
      organizationId: null,
      createAcknowledged: true,
      state: 'idle',
      syncedTitle: 'Shared chat',
      syncedPinned: false,
      syncedStarred: false,
      syncedArchived: false,
      remoteUpdatedAt: '2026-11-08T09:00:00.000Z',
    },
    ...changes,
  };
}

function writeAliases(entries: ConversationEntry[]): void {
  _store[BROWSER_STORE_KEY] = {
    version: 2,
    activeConversationId: null,
    activeOwner: null,
    conversations: entries,
  };
}

function remoteConversation(archived: boolean) {
  return {
    id: CLOUD_ID,
    organizationId: null,
    title: 'Shared chat',
    projectId: null,
    pinned: false,
    starred: false,
    archived,
    isTemporary: false,
    createdAt: '2026-11-08T08:00:00.000Z',
    updatedAt: REMOTE_UPDATED_AT,
  };
}

async function archivedById(): Promise<Record<string, boolean | undefined>> {
  const entries = await Promise.all(ALIAS_IDS.map((id) => getConversation(OWNER, id)));
  return Object.fromEntries(entries.map((entry) => [entry?.id, entry?.archived]));
}

beforeEach(() => {
  for (const key of Object.keys(_store)) delete _store[key];
  chromeMock.runtime.lastError = undefined;
  authContext.current = { token: 'test-bearer', owner: { ...OWNER } };
  vi.clearAllMocks();
});

describe('clean local aliases of one cloud chat', () => {
  it('starts from aliases that carry no pending upload', async () => {
    writeAliases(ALIAS_IDS.map((id) => alias(id)));
    for (const id of ALIAS_IDS) {
      expect(pendingCloudMessages((await getConversation(OWNER, id))!)).toEqual([]);
    }
  });

  it('applies an account refresh archive to every alias', async () => {
    writeAliases(ALIAS_IDS.map((id) => alias(id)));
    await importManagedCloudConversationHistory(
      OWNER,
      null,
      [{ conversation: remoteConversation(true) }],
      () => true,
      () => false,
    );
    expect(await archivedById()).toEqual({
      'alias-c': true,
      'alias-b': true,
      'alias-a': true,
    });
    const middle = (await getConversation(OWNER, 'alias-b'))!;
    expect(middle.cloudSync?.syncedArchived).toBe(true);
    expect(middle.cloudSync?.remoteUpdatedAt).toBe(REMOTE_UPDATED_AT);
  });

  it('keeps an alias with an unsent local pin while still archiving it', async () => {
    writeAliases([alias('alias-c'), alias('alias-b', { pinned: true }), alias('alias-a')]);
    await importManagedCloudConversationHistory(
      OWNER,
      null,
      [{ conversation: remoteConversation(true) }],
      () => true,
      () => false,
    );
    const middle = (await getConversation(OWNER, 'alias-b'))!;
    expect(middle.pinned).toBe(true);
    expect(middle.archived).toBe(true);
    expect(middle.cloudSync?.syncedPinned).toBe(false);
  });

  it('leaves an alias a window is still working in untouched', async () => {
    writeAliases(ALIAS_IDS.map((id) => alias(id)));
    await importManagedCloudConversationHistory(
      OWNER,
      null,
      [{ conversation: remoteConversation(true) }],
      () => true,
      (id) => id === 'alias-b',
    );
    expect(await archivedById()).toEqual({
      'alias-c': true,
      'alias-b': false,
      'alias-a': true,
    });
  });

  it('does not archive an alias bound to another organization', async () => {
    writeAliases([
      alias('alias-c'),
      alias('alias-b', {
        cloudSync: {
          ...alias('alias-b').cloudSync!,
          organizationId: '44444444-4444-4444-8444-444444444444',
        },
      }),
      alias('alias-a'),
    ]);
    await importManagedCloudConversationHistory(
      OWNER,
      null,
      [{ conversation: remoteConversation(true) }],
      () => true,
      () => false,
    );
    expect((await archivedById())['alias-b']).toBe(false);
  });

  describe('delta pull', () => {
    function pullResponse(archived: boolean, deletedAt: string | null = null) {
      return {
        conversations: [
          {
            id: CLOUD_ID,
            title: 'Shared chat',
            model: null,
            project_id: null,
            pinned: false,
            starred: false,
            archived,
            created_at: '2026-11-08T08:00:00.000Z',
            updated_at: REMOTE_UPDATED_AT,
            deleted_at: deletedAt,
            server_version: '7',
          },
        ],
        messages: [],
        artifacts: [],
        cursor: '7',
        hasMore: false,
      };
    }

    function serve(body: unknown): void {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(JSON.stringify(body), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      );
    }

    it('applies a remote archive to every alias', async () => {
      writeAliases(ALIAS_IDS.map((id) => alias(id)));
      serve(pullResponse(true));
      expect(await pullCloudConversationFlags(OWNER)).toBe(true);
      expect(await archivedById()).toEqual({
        'alias-c': true,
        'alias-b': true,
        'alias-a': true,
      });
      for (const id of ALIAS_IDS) {
        expect((await getConversation(OWNER, id))?.cloudSync?.syncedArchived).toBe(true);
      }
    });

    it('keeps an alias with an unsent local pin from being overwritten', async () => {
      writeAliases([alias('alias-c'), alias('alias-b', { pinned: true }), alias('alias-a')]);
      serve(pullResponse(true));
      await pullCloudConversationFlags(OWNER);
      expect(await archivedById()).toEqual({
        'alias-c': true,
        'alias-b': false,
        'alias-a': true,
      });
      expect((await getConversation(OWNER, 'alias-b'))?.pinned).toBe(true);
    });

    it('removes every alias of a chat deleted from the account', async () => {
      writeAliases(ALIAS_IDS.map((id) => alias(id)));
      serve(pullResponse(false, REMOTE_UPDATED_AT));
      expect(await pullCloudConversationFlags(OWNER)).toBe(true);
      for (const id of ALIAS_IDS) {
        expect(await getConversation(OWNER, id)).toBeUndefined();
      }
    });
  });
});

type ImportedModule0 = typeof import('../src/features/cloud-bridge/freeTrialClient');
