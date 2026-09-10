import { describe, expect, it, vi } from 'vitest';
import type { ChatCompletionRequest } from './request-processor';
import {
  collectManagedPromptMaterials,
  enrichManagedMemoryContext,
  enrichPastChatContext,
  isUnreportedToolAssistedTurn,
  prepareManagedAutoMemoryFacts,
} from './request-processor';
import type { ManagedMemoryPolicy } from '@/lib/services/managed-memory-context-service';

const PAST_CHAT_QUERY = 'What did I say my favourite mooring knot was?';

const RECALL_POLICY: ManagedMemoryPolicy = {
  enabled: true,
  generateFromHistory: true,
  allowToolAssistedGeneration: false,
  searchPastChats: true,
};

function makeRecallRequest(): ChatCompletionRequest {
  return {
    model: 'auto',
    messages: [{ role: 'user', content: PAST_CHAT_QUERY }],
    stream: false,
  };
}

function pastChatRow(index: number) {
  return {
    id: `message-${index}`,
    conversation_id: `conversation-${index}`,
    role: 'user',
    content: `My favourite mooring knot is the bowline, note ${index}.`,
    created_at: '2026-09-08T10:00:00.000Z',
    title: `Sailing notes ${index}`,
  };
}

function makeRequest(): ChatCompletionRequest {
  return {
    model: 'auto',
    messages: [{ role: 'user', content: 'Plan my day.' }],
    stream: false,
  };
}

describe('enrichManagedMemoryContext', () => {
  it('loads account memories into the managed prompt before usage accounting', async () => {
    const query = vi
      .fn()
      .mockResolvedValue([
        { content: 'I prefer morning meetings.', category: 'preference', pinned: true },
      ]);
    const chatRequest = makeRequest();

    await enrichManagedMemoryContext({
      db: { query },
      userId: 'user-1',
      chatRequest,
      isTemporary: false,
    });

    expect(chatRequest.messages[0]).toMatchObject({ role: 'system' });
    expect(chatRequest.messages[0]?.content).toContain('I prefer morning meetings.');
    expect(collectManagedPromptMaterials(chatRequest).join('\n')).toContain(
      'I prefer morning meetings.',
    );
  });

  it('keeps memories from a suppressed source out of the managed prompt', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) =>
      sql.includes("settings -> 'memory'") ? [{ memory: { suppressedSources: ['auto'] } }] : [],
    );
    const chatRequest = makeRequest();

    await enrichManagedMemoryContext({
      db: { query: query as never },
      userId: 'user-1',
      chatRequest,
      isTemporary: false,
    });

    const recall = query.mock.calls.find(([sql]) => sql.includes('from user_memories'));
    expect(recall?.[0]).toContain("coalesce(source, 'web') <> all");
    expect(recall?.[1]).toEqual(['user-1', ['auto']]);
  });

  it('does not load or inject account memory for Temporary Chats', async () => {
    const query = vi.fn();
    const chatRequest = makeRequest();

    await enrichManagedMemoryContext({
      db: { query },
      userId: 'user-1',
      chatRequest,
      isTemporary: true,
    });

    expect(query).not.toHaveBeenCalled();
    expect(chatRequest.messages).toEqual([{ role: 'user', content: 'Plan my day.' }]);
  });

  it('does not load or inject account memory when the per-chat Memory toggle is off', async () => {
    const query = vi.fn();
    const chatRequest = { ...makeRequest(), memory_enabled: false };

    await enrichManagedMemoryContext({
      db: { query },
      userId: 'user-1',
      chatRequest,
      isTemporary: false,
    });

    expect(query).not.toHaveBeenCalled();
    expect(chatRequest.messages).toEqual([{ role: 'user', content: 'Plan my day.' }]);
  });
});

describe('enrichPastChatContext', () => {
  it('injects at most three fenced excerpts from the user own other conversations', async () => {
    const query = vi.fn().mockResolvedValue([0, 1, 2, 3, 4].map(pastChatRow));
    const chatRequest = makeRecallRequest();

    const injected = await enrichPastChatContext({
      db: { query },
      userId: 'user-1',
      chatRequest,
      isTemporary: false,
      surface: 'web',
      policy: RECALL_POLICY,
      conversationId: 'conversation-current',
    });

    expect(injected).toBe(true);
    const prompt = String(chatRequest.messages[0]?.content);
    expect(chatRequest.messages[0]).toMatchObject({ role: 'system' });
    expect(prompt).toContain('<past_chats>');
    expect(prompt).toContain('Sailing notes 0');
    expect(prompt).not.toContain('Sailing notes 3');
  });

  it('reads only the signed-in user conversations, never the current one', async () => {
    const query = vi.fn().mockResolvedValue([]);

    await enrichPastChatContext({
      db: { query },
      userId: 'user-1',
      chatRequest: makeRecallRequest(),
      isTemporary: false,
      surface: 'web',
      policy: RECALL_POLICY,
      conversationId: 'conversation-current',
    });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('c.user_id = $1');
    expect(sql).toContain('($3::uuid is null or c.id <> $3::uuid)');
    expect(params[0]).toBe('user-1');
    expect(params[2]).toBe('conversation-current');
  });

  it('recalls nothing for a Temporary Chat', async () => {
    const query = vi.fn();
    const chatRequest = makeRecallRequest();

    await expect(
      enrichPastChatContext({
        db: { query },
        userId: 'user-1',
        chatRequest,
        isTemporary: true,
        surface: 'web',
        policy: RECALL_POLICY,
      }),
    ).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
    expect(chatRequest.messages).toHaveLength(1);
  });

  it('recalls nothing when Search past chats is off', async () => {
    const query = vi.fn();

    await expect(
      enrichPastChatContext({
        db: { query },
        userId: 'user-1',
        chatRequest: makeRecallRequest(),
        isTemporary: false,
        surface: 'web',
        policy: { ...RECALL_POLICY, searchPastChats: false },
      }),
    ).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('recalls nothing on the API surface', async () => {
    const query = vi.fn();

    await expect(
      enrichPastChatContext({
        db: { query },
        userId: 'user-1',
        chatRequest: makeRecallRequest(),
        isTemporary: false,
        surface: 'api',
        policy: RECALL_POLICY,
      }),
    ).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('prepareManagedAutoMemoryFacts', () => {
  it('extracts conservative facts only for enabled non-API, non-temporary turns', () => {
    expect(
      prepareManagedAutoMemoryFacts({
        message: 'My name is Ada. I prefer morning meetings.',
        isTemporary: false,
        surface: 'web',
        policy: {
          enabled: true,
          generateFromHistory: true,
          allowToolAssistedGeneration: false,
          searchPastChats: false,
        },
      }),
    ).toEqual(["User's name is Ada", 'User prefers morning meetings']);

    expect(
      prepareManagedAutoMemoryFacts({
        message: 'My name is Ada.',
        isTemporary: true,
        surface: 'web',
        policy: {
          enabled: true,
          generateFromHistory: true,
          allowToolAssistedGeneration: false,
          searchPastChats: false,
        },
      }),
    ).toEqual([]);
    expect(
      prepareManagedAutoMemoryFacts({
        message: 'My name is Ada.',
        isTemporary: false,
        surface: 'mobile',
        policy: {
          enabled: false,
          generateFromHistory: true,
          allowToolAssistedGeneration: false,
          searchPastChats: false,
        },
      }),
    ).toEqual([]);
    expect(
      prepareManagedAutoMemoryFacts({
        message: 'My name is Ada.',
        isTemporary: false,
        surface: 'mobile',
        policy: {
          enabled: true,
          generateFromHistory: true,
          allowToolAssistedGeneration: false,
          searchPastChats: false,
        },
      }),
    ).toEqual(["User's name is Ada"]);
    expect(
      prepareManagedAutoMemoryFacts({
        message: 'My name is Ada.',
        isTemporary: false,
        surface: 'api',
        policy: {
          enabled: true,
          generateFromHistory: true,
          allowToolAssistedGeneration: true,
          searchPastChats: false,
        },
      }),
    ).toEqual([]);
  });

  it('does not learn when generation from chat history is disabled', () => {
    expect(
      prepareManagedAutoMemoryFacts({
        message: 'My name is Ada.',
        isTemporary: false,
        surface: 'mobile',
        policy: {
          enabled: true,
          generateFromHistory: false,
          allowToolAssistedGeneration: false,
          searchPastChats: false,
        },
      }),
    ).toEqual([]);
  });

  it('does not learn when the per-chat Memory toggle is off', () => {
    expect(
      prepareManagedAutoMemoryFacts({
        message: 'My name is Ada.',
        isTemporary: false,
        surface: 'mobile',
        policy: {
          enabled: true,
          generateFromHistory: true,
          allowToolAssistedGeneration: false,
          searchPastChats: false,
        },
        memoryEnabled: false,
      }),
    ).toEqual([]);
  });

  it('flags only the turns whose tool use the tool loop cannot report', () => {
    expect(isUnreportedToolAssistedTurn({ ...makeRequest(), research: true })).toBe(true);
    expect(isUnreportedToolAssistedTurn({ ...makeRequest(), work_mode: 'agiwork' })).toBe(true);
    expect(isUnreportedToolAssistedTurn(makeRequest())).toBe(false);
  });

  it('does not call a turn tool-assisted for the composer default search flags', () => {
    expect(
      isUnreportedToolAssistedTurn({ ...makeRequest(), web_search: true, web_fetch: true }),
    ).toBe(false);
  });

  it('does not call a turn tool-assisted because tools were merely offered', () => {
    expect(
      isUnreportedToolAssistedTurn({
        ...makeRequest(),
        tools: [{ type: 'function', function: { name: 'web_search' } }],
      } as ChatCompletionRequest),
    ).toBe(false);
  });
});
