/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  saveConversation,
  listConversations,
  getConversation,
  deleteConversation,
  type HistoryMessage,
} from '../src/conversation-history';

// ─── Chrome storage mock ─────────────────────────────────────────────────────

const _store: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn((key: string, cb: (res: Record<string, unknown>) => void) => {
        cb({ [key]: _store[key] });
      }),
      set: vi.fn((items: Record<string, unknown>, cb?: () => void) => {
        for (const [k, v] of Object.entries(items)) _store[k] = v;
        cb?.();
      }),
    },
  },
  runtime: {
    lastError: undefined as chrome.runtime.LastError | undefined,
  },
};

(globalThis as unknown as Record<string, unknown>).chrome = chromeMock;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function msgs(count: number): HistoryMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `message ${i}`,
    timestamp: Date.now() + i,
  }));
}

const HISTORY_KEY = 'agi_conversation_history';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('conversation-history', () => {
  beforeEach(() => {
    delete _store[HISTORY_KEY];
    chromeMock.runtime.lastError = undefined;
    vi.clearAllMocks();
    chromeMock.storage.local.get.mockImplementation(
      (key: string, cb: (res: Record<string, unknown>) => void) => {
        cb({ [key]: _store[key] });
      },
    );
    chromeMock.storage.local.set.mockImplementation(
      (items: Record<string, unknown>, cb?: () => void) => {
        for (const [k, v] of Object.entries(items)) _store[k] = v;
        cb?.();
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saveConversation returns empty string for empty messages', async () => {
    const id = await saveConversation([]);
    expect(id).toBe('');
  });

  it('saveConversation persists and listConversations returns it', async () => {
    const id = await saveConversation(msgs(2));
    expect(id).toMatch(/^conv-/);
    const list = await listConversations();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
  });

  it('deriveTitle uses first user message (truncated at 60 chars)', async () => {
    const longContent = 'A'.repeat(80);
    await saveConversation([{ role: 'user', content: longContent, timestamp: Date.now() }]);
    const list = await listConversations();
    expect(list[0].title).toHaveLength(60);
    expect(list[0].title.endsWith('...')).toBe(true);
  });

  it('deriveTitle uses first user message verbatim when short', async () => {
    await saveConversation([{ role: 'user', content: 'Hello world', timestamp: Date.now() }]);
    const list = await listConversations();
    expect(list[0].title).toBe('Hello world');
  });

  it('getConversation returns the entry by id', async () => {
    const id = await saveConversation(msgs(4));
    const entry = await getConversation(id);
    expect(entry).toBeDefined();
    expect(entry?.id).toBe(id);
    expect(entry?.messages).toHaveLength(4);
  });

  it('getConversation returns undefined for unknown id', async () => {
    const entry = await getConversation('non-existent');
    expect(entry).toBeUndefined();
  });

  it('deleteConversation removes the entry', async () => {
    const id = await saveConversation(msgs(2));
    await deleteConversation(id);
    const list = await listConversations();
    expect(list).toHaveLength(0);
  });

  it('deleteConversation is a no-op for unknown id', async () => {
    await saveConversation(msgs(2));
    await deleteConversation('non-existent');
    const list = await listConversations();
    expect(list).toHaveLength(1);
  });

  it('pruneExpired removes entries older than 30 days', async () => {
    const THIRTY_ONE_DAYS = 31 * 24 * 60 * 60 * 1000;
    const old: import('../src/conversation-history').ConversationEntry = {
      id: 'old-conv',
      title: 'Old',
      messages: msgs(2),
      savedAt: Date.now() - THIRTY_ONE_DAYS,
    };
    _store[HISTORY_KEY] = [old];
    const list = await listConversations();
    expect(list).toHaveLength(0);
  });

  it('caps at MAX_CONVERSATIONS (100) dropping the last entry', async () => {
    const entries: import('../src/conversation-history').ConversationEntry[] = Array.from(
      { length: 100 },
      (_, i) => ({
        id: `conv-old-${i}`,
        title: `Old ${i}`,
        messages: msgs(2),
        savedAt: Date.now() - (100 - i) * 1000,
      }),
    );
    _store[HISTORY_KEY] = entries;
    const newId = await saveConversation(msgs(2));
    const list = await listConversations();
    expect(list).toHaveLength(100);
    expect(list[0].id).toBe(newId);
    // conv-old-99 (the last element of the old array) is dropped when slicing to 100
    expect(list.find((e) => e.id === 'conv-old-99')).toBeUndefined();
    // conv-old-0 is still present
    expect(list.find((e) => e.id === 'conv-old-0')).toBeDefined();
  });

  it('save/list/get/delete full cycle', async () => {
    const id1 = await saveConversation(msgs(2));
    const id2 = await saveConversation(msgs(4));
    let list = await listConversations();
    expect(list).toHaveLength(2);
    await deleteConversation(id1);
    list = await listConversations();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id2);
    const entry = await getConversation(id2);
    expect(entry?.messages).toHaveLength(4);
  });
});
