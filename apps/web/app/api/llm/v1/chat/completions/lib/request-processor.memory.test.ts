import { describe, expect, it, vi } from 'vitest';
import type { ChatCompletionRequest } from './request-processor';
import {
  applyMemoryToolCapability,
  isUnreportedToolAssistedTurn,
  prepareManagedAutoMemoryFacts,
} from './request-processor';
import type { ManagedMemoryPolicy } from '@/lib/services/managed-memory-context-service';
import { resolveInteractiveTurnContext } from '@/lib/services/turn-context-service';

const PAST_CHAT_QUERY = 'What did I say my favourite mooring knot was?';

const RECALL_POLICY: ManagedMemoryPolicy = {
  enabled: true,
  generateFromHistory: true,
  allowToolAssistedGeneration: false,
  searchPastChats: true,
};

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

const MEMORY_ONLY_POLICY: ManagedMemoryPolicy = { ...RECALL_POLICY, searchPastChats: false };
const RECALL_ONLY_POLICY: ManagedMemoryPolicy = { ...RECALL_POLICY, enabled: false };

function turnContextInput(
  overrides: Partial<Parameters<typeof resolveInteractiveTurnContext>[1]> = {},
): Parameters<typeof resolveInteractiveTurnContext>[1] {
  return {
    turnId: 'turn-1',
    userId: 'user-1',
    organizationId: null,
    projectId: null,
    conversationId: null,
    temporaryChat: false,
    surface: 'web',
    memoryEnabled: undefined,
    policy: MEMORY_ONLY_POLICY,
    query: 'Plan my day.',
    projectContext: null,
    ...overrides,
  };
}

describe('resolveInteractiveTurnContext: account memory', () => {
  it('loads account memories into the managed prompt', async () => {
    const query = vi
      .fn()
      .mockResolvedValue([
        { content: 'I prefer morning meetings.', category: 'preference', pinned: true },
      ]);

    const context = await resolveInteractiveTurnContext({ query }, turnContextInput());

    expect(context.memoryPrompt).toContain('I prefer morning meetings.');
    expect(context.memories).toHaveLength(1);
  });

  it('keeps memories from a suppressed source out of the managed prompt', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) =>
      sql.includes("settings -> 'memory'") ? [{ memory: { suppressedSources: ['auto'] } }] : [],
    );

    await resolveInteractiveTurnContext({ query: query as never }, turnContextInput());

    const recall = query.mock.calls.find(([sql]) => sql.includes('from user_memories'));
    expect(recall?.[0]).toContain("coalesce(source, 'web') <> all");
    expect(recall?.[1]).toEqual(['user-1', ['auto'], null]);
  });

  it('does not load or inject account memory for Temporary Chats', async () => {
    const query = vi.fn();

    const context = await resolveInteractiveTurnContext(
      { query },
      turnContextInput({ temporaryChat: true }),
    );

    expect(query).not.toHaveBeenCalled();
    expect(context.memoryPrompt).toBeNull();
  });

  it('does not load or inject account memory when the per-chat Memory toggle is off', async () => {
    const query = vi.fn();

    const context = await resolveInteractiveTurnContext(
      { query },
      turnContextInput({ memoryEnabled: false }),
    );

    expect(query).not.toHaveBeenCalled();
    expect(context.memoryPrompt).toBeNull();
  });
});

describe('resolveInteractiveTurnContext: past chats', () => {
  const recallInput = (
    overrides: Partial<Parameters<typeof resolveInteractiveTurnContext>[1]> = {},
  ) =>
    turnContextInput({
      policy: RECALL_ONLY_POLICY,
      query: PAST_CHAT_QUERY,
      conversationId: 'conversation-current',
      ...overrides,
    });

  it('injects at most three fenced excerpts from the user own other conversations', async () => {
    const query = vi.fn().mockResolvedValue([0, 1, 2, 3, 4].map(pastChatRow));

    const context = await resolveInteractiveTurnContext({ query }, recallInput());

    expect(context.pastChatSources).toHaveLength(3);
    expect(context.pastChatPrompt).toContain('<past_chats>');
    expect(context.pastChatPrompt).toContain('Sailing notes 0');
    expect(context.pastChatPrompt).not.toContain('Sailing notes 3');
  });

  it('reads only the signed-in user conversations, never the current one', async () => {
    const query = vi.fn().mockResolvedValue([]);

    await resolveInteractiveTurnContext({ query }, recallInput());

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('c.user_id = $1');
    expect(sql).toContain('($3::uuid is null or c.id <> $3::uuid)');
    expect(params[0]).toBe('user-1');
    expect(params[2]).toBe('conversation-current');
  });

  it('recalls nothing when the chat has memory switched off', async () => {
    const query = vi.fn();

    const context = await resolveInteractiveTurnContext(
      { query },
      recallInput({ memoryEnabled: false }),
    );

    expect(context.pastChatSources).toEqual([]);
    expect(context.pastChatPrompt).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('recalls nothing for a Temporary Chat', async () => {
    const query = vi.fn();

    const context = await resolveInteractiveTurnContext(
      { query },
      recallInput({ temporaryChat: true }),
    );

    expect(context.pastChatSources).toEqual([]);
    expect(context.pastChatPrompt).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('recalls nothing when Search past chats is off', async () => {
    const query = vi.fn();

    const context = await resolveInteractiveTurnContext(
      { query },
      recallInput({ policy: { ...RECALL_ONLY_POLICY, searchPastChats: false } }),
    );

    expect(context.pastChatSources).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('recalls nothing on the API surface', async () => {
    const query = vi.fn();

    const context = await resolveInteractiveTurnContext({ query }, recallInput({ surface: 'api' }));

    expect(context.pastChatSources).toEqual([]);
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

describe('applyMemoryToolCapability', () => {
  const MEMORY_TOOLS = ['save_memory', 'search_memory', 'forget_memory'];

  function offeredMemoryTools(
    overrides: Partial<Parameters<typeof applyMemoryToolCapability>[1]> = {},
  ): string[] {
    const request: ChatCompletionRequest = { ...makeRequest(), stream: true };
    applyMemoryToolCapability(request, {
      surface: 'web',
      toolsCapable: true,
      memoryEnabled: true,
      isTemporary: false,
      ambientToolsAllowed: true,
      ...overrides,
    });
    return (request.tools ?? [])
      .map((tool) => (tool as { function?: { name?: string } }).function?.name ?? '')
      .filter((name) => MEMORY_TOOLS.includes(name));
  }

  it('offers the memory tools only on the apps and the Chrome extension, only with Memory on and never in a temporary chat', () => {
    expect(offeredMemoryTools()).toEqual(MEMORY_TOOLS);
    expect(offeredMemoryTools({ surface: 'desktop' })).toEqual(MEMORY_TOOLS);
    expect(offeredMemoryTools({ surface: 'mobile' })).toEqual(MEMORY_TOOLS);
    expect(offeredMemoryTools({ surface: 'chrome' })).toEqual(MEMORY_TOOLS);
    expect(offeredMemoryTools({ surface: 'api' })).toEqual([]);
    expect(offeredMemoryTools({ memoryEnabled: false })).toEqual([]);
    expect(offeredMemoryTools({ isTemporary: true })).toEqual([]);
  });
});
