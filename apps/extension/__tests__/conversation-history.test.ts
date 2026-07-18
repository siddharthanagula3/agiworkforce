/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  activateConversation,
  createBrowserConversationId,
  getActiveConversation,
  saveConversation,
  saveActiveConversation,
  upsertConversation,
  startNewConversation,
  listConversations,
  getConversation,
  deleteConversation,
  type HistoryMessage,
} from '../src/features/background/conversation-history';

// ─── Chrome storage mock ─────────────────────────────────────────────────────

const _store: Record<string, unknown> = {};

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
const ACTIVE_MESSAGES_KEY = 'agi_side_panel_messages';
const LEGACY_BROWSER_STORE_KEY = 'agi_browser_conversations_v1';
const BROWSER_STORE_KEY = 'agi_browser_conversations_v2';
const RUN_ID = '11111111-1111-4111-8111-111111111111';

function agentEvent(sequence = 0): AgentEventEnvelope {
  return {
    schemaVersion: 3,
    sessionId: 'chrome-session',
    turnId: 'chrome-turn',
    sequence,
    emittedAtMs: 1_000 + sequence,
    event: {
      type: 'progress-update',
      progressId: 'research',
      summary: 'Searching current sources',
      status: 'running',
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('conversation-history', () => {
  beforeEach(() => {
    for (const key of Object.keys(_store)) delete _store[key];
    chromeMock.runtime.lastError = undefined;
    vi.clearAllMocks();
    chromeMock.storage.local.get.mockImplementation(
      (key: string | string[], cb: (res: Record<string, unknown>) => void) => {
        cb(selectedValues(key));
      },
    );
    chromeMock.storage.local.set.mockImplementation(
      (items: Record<string, unknown>, cb?: () => void) => {
        for (const [k, v] of Object.entries(items)) _store[k] = v;
        cb?.();
      },
    );
    chromeMock.storage.local.remove.mockImplementation(
      (keys: string | string[], cb?: () => void) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete _store[key];
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
    const old: import('../src/features/background/conversation-history').ConversationEntry = {
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
    const entries: import('../src/features/background/conversation-history').ConversationEntry[] =
      Array.from({ length: 100 }, (_, i) => ({
        id: `conv-old-${i}`,
        title: `Old ${i}`,
        messages: msgs(2),
        savedAt: Date.now() - (100 - i) * 1000,
      }));
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

  it('persists one active browser conversation instead of duplicating each turn', async () => {
    const first = await saveActiveConversation(msgs(2));
    const second = await saveActiveConversation(msgs(4));

    expect(first?.id).toBe(second?.id);
    expect(await listConversations()).toHaveLength(1);
    expect((await getActiveConversation())?.messages).toHaveLength(4);
  });

  it('persists validated canonical activity and the durable run cursor with an assistant turn', async () => {
    const messages: HistoryMessage[] = [
      { role: 'user', content: 'Research this', timestamp: 1 },
      {
        role: 'assistant',
        content: 'Working result',
        timestamp: 2,
        agentEvents: [agentEvent()],
        cloudAgentRun: {
          runId: RUN_ID,
          runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
          lastSequence: 0,
          state: 'running',
        },
      },
    ];

    const saved = await saveActiveConversation(messages);
    expect(saved?.messages[1]).toMatchObject({
      agentEvents: [expect.objectContaining({ sequence: 0 })],
      cloudAgentRun: expect.objectContaining({ runId: RUN_ID, lastSequence: 0 }),
    });
    expect((await getActiveConversation())?.messages[1]).toMatchObject(saved?.messages[1] ?? {});
  });

  it('drops malformed stored activity and foreign run paths without discarding answer text', async () => {
    _store[BROWSER_STORE_KEY] = {
      version: 2,
      activeConversationId: 'unsafe-activity',
      conversations: [
        {
          id: 'unsafe-activity',
          title: 'Keep answer',
          messages: [
            {
              role: 'assistant',
              content: 'Safe public answer',
              timestamp: 2,
              agentEvents: [{ ...agentEvent(), sequence: -1 }],
              cloudAgentRun: {
                runId: RUN_ID,
                runPath: 'https://attacker.example/run',
                lastSequence: 0,
              },
            },
          ],
          savedAt: Date.now(),
          routing: { selectedModel: 'auto' },
        },
      ],
    };

    const message = (await getActiveConversation())?.messages[0];
    expect(message?.content).toBe('Safe public answer');
    expect(message?.agentEvents).toBeUndefined();
    expect(message?.cloudAgentRun).toBeUndefined();
  });

  it('writes to the explicit conversation owner even when another panel changes the active chat', async () => {
    const panelAConversationId = createBrowserConversationId();
    const panelBConversationId = createBrowserConversationId();

    await upsertConversation(panelAConversationId, msgs(2));
    await upsertConversation(panelBConversationId, msgs(4));
    await activateConversation(panelAConversationId);

    await upsertConversation(panelBConversationId, msgs(6));

    expect((await getConversation(panelAConversationId))?.messages).toHaveLength(2);
    expect((await getConversation(panelBConversationId))?.messages).toHaveLength(6);
  });

  it('rejects malformed explicit conversation owners instead of creating ambiguous records', async () => {
    await expect(upsertConversation('bad\u0000owner', msgs(2))).rejects.toThrow(
      'Invalid browser conversation id',
    );
    expect(await listConversations()).toHaveLength(0);
  });

  it('starts a separate browser conversation without syncing or deleting the prior one', async () => {
    const first = await saveActiveConversation(msgs(2));
    await startNewConversation();
    expect(await getActiveConversation()).toBeUndefined();

    const second = await saveActiveConversation(msgs(4));
    expect(second?.id).not.toBe(first?.id);
    expect(await listConversations()).toHaveLength(2);
  });

  it('restores a saved browser conversation as the active conversation', async () => {
    const first = await saveActiveConversation(msgs(2), {
      selectedModel: 'auto',
      currentModelKey: 'anthropic/claude-current',
      previousTaskType: 'coding',
    });
    await startNewConversation();
    await saveActiveConversation(msgs(4), {
      selectedModel: 'openai/gpt-current',
      currentModelKey: 'openai/gpt-current',
      previousTaskType: 'reasoning',
    });

    const restored = await activateConversation(first!.id);
    expect(restored?.id).toBe(first?.id);
    expect(restored?.routing).toEqual({
      selectedModel: 'auto',
      currentModelKey: 'anthropic/claude-current',
      previousTaskType: 'coding',
    });
    expect((await getActiveConversation())?.id).toBe(first?.id);
  });

  it('migrates a version-one browser store without losing conversations', async () => {
    _store[LEGACY_BROWSER_STORE_KEY] = {
      version: 1,
      activeConversationId: 'legacy-v1',
      conversations: [
        {
          id: 'legacy-v1',
          title: 'Version one',
          messages: msgs(2),
          savedAt: Date.now(),
        },
      ],
    };

    const active = await getActiveConversation();

    expect(active?.id).toBe('legacy-v1');
    expect(active?.routing).toEqual({ selectedModel: 'auto' });
    expect(_store[BROWSER_STORE_KEY]).toMatchObject({ version: 2 });
    expect(_store[LEGACY_BROWSER_STORE_KEY]).toBeUndefined();
  });

  it('drops malformed route continuity without discarding valid messages', async () => {
    _store[BROWSER_STORE_KEY] = {
      version: 2,
      activeConversationId: 'corrupt-route',
      conversations: [
        {
          id: 'corrupt-route',
          title: 'Keep my messages',
          messages: msgs(2),
          savedAt: Date.now(),
          routing: {
            selectedModel: 42,
            currentModelKey: { injected: true },
            previousTaskType: 'not-a-routing-task',
          },
        },
      ],
    };

    const active = await getActiveConversation();

    expect(active?.messages).toHaveLength(2);
    expect(active?.routing).toEqual({ selectedModel: 'auto' });
  });

  it('keeps route continuity isolated across new, restored, and deleted conversations', async () => {
    const first = await saveActiveConversation(msgs(2), {
      selectedModel: 'auto',
      currentModelKey: 'anthropic/claude-current',
      previousTaskType: 'coding',
    });
    await startNewConversation();
    expect(await getActiveConversation()).toBeUndefined();

    const second = await saveActiveConversation(msgs(4), {
      selectedModel: 'openai/gpt-current',
      currentModelKey: 'openai/gpt-current',
      previousTaskType: 'general',
    });
    expect(second?.routing.currentModelKey).toBe('openai/gpt-current');

    expect((await activateConversation(first!.id))?.routing.currentModelKey).toBe(
      'anthropic/claude-current',
    );
    await deleteConversation(first!.id);
    expect(await getActiveConversation()).toBeUndefined();

    expect((await activateConversation(second!.id))?.routing.currentModelKey).toBe(
      'openai/gpt-current',
    );
  });

  it('migrates the legacy live thread and archive into the single browser-owned store', async () => {
    _store[HISTORY_KEY] = [
      {
        id: 'legacy-archive',
        title: 'Archived browser chat',
        messages: msgs(2),
        savedAt: Date.now() - 1_000,
      },
    ];
    _store[ACTIVE_MESSAGES_KEY] = msgs(4);

    const active = await getActiveConversation();
    const all = await listConversations();

    expect(active?.messages).toHaveLength(4);
    expect(all.map((entry) => entry.id)).toContain('legacy-archive');
    expect(_store[BROWSER_STORE_KEY]).toBeDefined();
    expect(_store[HISTORY_KEY]).toBeUndefined();
    expect(_store[ACTIVE_MESSAGES_KEY]).toBeUndefined();
  });

  it('serializes overlapping active saves so the newest turn cannot be lost', async () => {
    const writes: Array<() => void> = [];
    chromeMock.storage.local.set.mockImplementation(
      (items: Record<string, unknown>, cb?: () => void) => {
        writes.push(() => {
          for (const [key, value] of Object.entries(items)) _store[key] = value;
          cb?.();
        });
      },
    );

    const firstSave = saveActiveConversation(msgs(2));
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    writes.shift()!();
    await firstSave;

    const secondSave = saveActiveConversation(msgs(3));
    const finalSave = saveActiveConversation(msgs(4));
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    writes.shift()!();
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    writes.shift()!();
    await Promise.all([secondSave, finalSave]);

    const active = await getActiveConversation();
    expect(active?.messages).toHaveLength(4);
    expect(active?.messages.map((message) => message.content)).toEqual([
      'message 0',
      'message 1',
      'message 2',
      'message 3',
    ]);
    expect(await listConversations()).toHaveLength(1);
  });

  it('uses a cross-document Web Lock before browser-store read-modify-write', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'locks');
    const request = vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback());
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request },
    });

    try {
      await saveActiveConversation(msgs(2));
      expect(request).toHaveBeenCalledWith(
        'agi-browser-conversation-store-v2',
        expect.any(Function),
      );
    } finally {
      if (original) Object.defineProperty(navigator, 'locks', original);
      else delete (navigator as Navigator & { locks?: LockManager }).locks;
    }
  });

  it('fails closed on a storage read error instead of overwriting durable history', async () => {
    chromeMock.runtime.lastError = { message: 'storage unavailable' };

    await expect(saveActiveConversation(msgs(2))).rejects.toThrow('storage unavailable');
    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
  });
});
