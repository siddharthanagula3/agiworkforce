/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getActiveConversation,
  getConversation,
  listConversations,
  pendingCloudMessages,
  rebindAuthenticatedConversationHistory,
  saveActiveConversation,
  upsertConversation,
  type HistoryMessage,
} from '../src/features/background/conversation-history';
import type { ManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';

const store: Record<string, unknown> = {};

(globalThis as unknown as Record<string, unknown>).chrome = {
  storage: {
    local: {
      get: vi.fn((key: string | string[], callback: (result: Record<string, unknown>) => void) => {
        const keys = Array.isArray(key) ? key : [key];
        callback(structuredClone(Object.fromEntries(keys.map((entry) => [entry, store[entry]]))));
      }),
      set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
        Object.assign(store, structuredClone(items));
        callback?.();
      }),
      remove: vi.fn((keys: string | string[], callback?: () => void) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
        callback?.();
      }),
    },
  },
  runtime: { lastError: undefined },
};

const FIRST_SESSION: ManagedCloudOwner = { accountId: 'account-a', authIncarnation: 'sess_a1' };
const NEW_SESSION: ManagedCloudOwner = { accountId: 'account-a', authIncarnation: 'sess_a2' };
const OTHER_ACCOUNT: ManagedCloudOwner = { accountId: 'account-b', authIncarnation: 'sess_b1' };

function turn(content: string): HistoryMessage[] {
  return [
    { role: 'user', content, timestamp: 1_000, runtime: 'managed-cloud' },
    {
      role: 'assistant',
      content: `reply to ${content}`,
      timestamp: 2_000,
      runtime: 'managed-cloud',
    },
  ];
}

const current = () => Promise.resolve(true);

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
});

describe('a new sign-in session for the same account', () => {
  it('keeps the account history the previous session saved', async () => {
    await saveActiveConversation(FIRST_SESSION, turn('quarterly plan'));
    expect(await listConversations(NEW_SESSION)).toEqual([]);

    await expect(rebindAuthenticatedConversationHistory(NEW_SESSION, current)).resolves.toBe(true);

    const chats = await listConversations(NEW_SESSION);
    expect(chats).toHaveLength(1);
    expect(chats[0]?.messages.map((message) => message.content)).toEqual([
      'quarterly plan',
      'reply to quarterly plan',
    ]);
    expect((await getActiveConversation(NEW_SESSION))?.id).toBe(chats[0]?.id);
    expect(await listConversations(FIRST_SESSION)).toEqual([]);
  });

  it('keeps unsent mirror work pending for the new session', async () => {
    await upsertConversation(FIRST_SESSION, 'chat-unsent', turn('draft'));

    await rebindAuthenticatedConversationHistory(NEW_SESSION, current);

    const chat = await getConversation(NEW_SESSION, 'chat-unsent');
    expect(chat).toBeDefined();
    expect(pendingCloudMessages(chat!)).toHaveLength(2);
  });

  it('leaves another account history where it was', async () => {
    await upsertConversation(FIRST_SESSION, 'chat-a', turn('mine'));
    await upsertConversation(OTHER_ACCOUNT, 'chat-b', turn('theirs'));

    await rebindAuthenticatedConversationHistory(NEW_SESSION, current);

    expect((await listConversations(NEW_SESSION)).map((chat) => chat.id)).toEqual(['chat-a']);
    expect((await listConversations(OTHER_ACCOUNT)).map((chat) => chat.id)).toEqual(['chat-b']);
  });

  it('does not rebind for a session that is no longer the signed-in one', async () => {
    await upsertConversation(FIRST_SESSION, 'chat-a', turn('mine'));

    await expect(
      rebindAuthenticatedConversationHistory(NEW_SESSION, () => Promise.resolve(false)),
    ).resolves.toBe(false);

    expect(await listConversations(NEW_SESSION)).toEqual([]);
    expect(await listConversations(FIRST_SESSION)).toHaveLength(1);
  });
});
