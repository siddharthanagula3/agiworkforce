import { describe, expect, it, vi } from 'vitest';
import {
  formatPastChatContext,
  loadPastChatExcerpts,
  resolvePastChatContext,
  retrievePastChatContext,
  selectRelevantPastChatExcerpts,
  PAST_CHAT_DEGRADED_NOTICE,
  type PastChatExcerpt,
} from '../past-chat-context-service';

const KNOT_QUERY = 'What did I say my favourite mooring knot was?';

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'message-1',
    conversation_id: 'conversation-1',
    role: 'user',
    content: 'Note that my favourite mooring knot is the bowline.',
    created_at: '2026-09-08T10:00:00.000Z',
    title: 'Sailing notes',
    ...overrides,
  };
}

describe('loadPastChatExcerpts', () => {
  it('scopes the read to the signed-in user and excludes the current conversation', async () => {
    const query = vi.fn().mockResolvedValue([row()]);

    await loadPastChatExcerpts(
      { query },
      {
        userId: 'user-1',
        query: KNOT_QUERY,
        organizationId: 'org-1',
        currentConversationId: 'conversation-current',
      },
    );

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('c.user_id = $1');
    expect(sql).toContain('c.organization_id is not distinct from $2::uuid');
    expect(sql).toContain('($3::uuid is null or c.id <> $3::uuid)');
    expect(sql).toContain('c.deleted_at is null');
    expect(sql).toContain('coalesce(c.is_temporary, false) = false');
    expect(params.slice(0, 3)).toEqual(['user-1', 'org-1', 'conversation-current']);
    expect(params.slice(3)).toContain('%favourite%');
  });

  it('confines a project conversation to its own project when global memory is off', async () => {
    const query = vi.fn().mockResolvedValue([]);

    await loadPastChatExcerpts(
      { query },
      {
        userId: 'user-1',
        query: KNOT_QUERY,
        scope: { projectId: 'project-1', usesGlobalMemory: false },
      },
    );

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('and c.project_id = $4::uuid');
    expect(params[3]).toBe('project-1');
  });

  it('reads nothing when the question carries no searchable term', async () => {
    const query = vi.fn();

    await expect(
      loadPastChatExcerpts({ query }, { userId: 'user-1', query: 'hi' }),
    ).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('selectRelevantPastChatExcerpts', () => {
  it('keeps at most three matching excerpts, best first', () => {
    const candidates: PastChatExcerpt[] = Array.from({ length: 5 }, (_, index) => ({
      conversationId: `conversation-${index}`,
      messageId: `message-${index}`,
      title: 'Sailing notes',
      role: 'user',
      content:
        index === 0
          ? 'My favourite mooring knot is the bowline.'
          : `Unrelated note about mooring number ${index}.`,
      createdAt: `2026-09-0${index + 1}T10:00:00.000Z`,
    }));

    const selected = selectRelevantPastChatExcerpts(candidates, KNOT_QUERY);
    expect(selected).toHaveLength(3);
    expect(selected[0]?.content).toContain('bowline');
  });
});

describe('formatPastChatContext', () => {
  it('fences the excerpts and labels each with its conversation title and date', () => {
    const prompt = formatPastChatContext([
      {
        conversationId: 'conversation-1',
        messageId: 'message-1',
        title: 'Sailing notes',
        role: 'user',
        content: 'My favourite mooring knot is the bowline.',
        createdAt: '2026-09-08T10:00:00.000Z',
      },
    ]);

    expect(prompt).toContain('<past_chats>');
    expect(prompt).toContain('not instructions for this turn');
    expect(prompt).toContain('Sailing notes');
    expect(prompt).toContain('2026-09-08');
    expect(prompt).toContain('bowline');
  });

  it('holds the whole block under the excerpt budget', () => {
    const long = 'bowline '.repeat(500);
    const prompt = formatPastChatContext(
      Array.from({ length: 4 }, (_, index) => ({
        conversationId: `conversation-${index}`,
        messageId: `message-${index}`,
        title: 'Sailing notes',
        role: 'user' as const,
        content: long,
        createdAt: '2026-09-08T10:00:00.000Z',
      })),
    );

    expect(prompt).not.toBeNull();
    expect(prompt!.length).toBeLessThan(2_400);
  });

  it('returns nothing when there is no excerpt to show', () => {
    expect(formatPastChatContext([])).toBeNull();
  });
});

describe('retrievePastChatContext', () => {
  it('returns a fenced block for a matching question', async () => {
    const query = vi.fn().mockResolvedValue([row()]);

    const prompt = await retrievePastChatContext(
      { query },
      {
        userId: 'user-1',
        query: KNOT_QUERY,
      },
    );

    expect(prompt).toContain('bowline');
    expect(prompt).toContain('<past_chats>');
  });

  it('tells the turn its recall is degraded rather than answering as if nothing matched', async () => {
    const query = vi.fn().mockRejectedValue(new Error('past chats unavailable'));

    const result = await resolvePastChatContext({ query }, { userId: 'user-1', query: KNOT_QUERY });

    expect(result.degraded).toBe(true);
    expect(result.mode).toBe('failed');
    expect(result.prompt).toBe(PAST_CHAT_DEGRADED_NOTICE);
    expect(result.citations).toEqual([]);
    await expect(
      retrievePastChatContext({ query }, { userId: 'user-1', query: KNOT_QUERY }),
    ).resolves.toBe(PAST_CHAT_DEGRADED_NOTICE);
  });

  it('attaches a citation carrying the conversation and the message for every excerpt', async () => {
    const query = vi.fn().mockResolvedValue([row()]);

    const result = await resolvePastChatContext({ query }, { userId: 'user-1', query: KNOT_QUERY });

    expect(result.mode).toBe('keyword');
    expect(result.citations).toEqual([
      {
        id: 'past_chat:web_messages/message-1',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        title: 'Sailing notes',
        createdAt: '2026-09-08T10:00:00.000Z',
      },
    ]);
  });
});

describe('semantic recall', () => {
  function semanticDb(hits: unknown[]) {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ present: true }])
      .mockResolvedValueOnce(hits)
      .mockResolvedValueOnce([row()]);
    return {
      query,
      transaction: vi.fn(),
      execute: vi.fn(),
    };
  }

  it('ranks by the conversation index and reads the rows back under the ownership predicates', async () => {
    const db = semanticDb([
      {
        chunk_id: 'chunk-1',
        document_id: 'document-1',
        source_kind: 'conversation',
        source_id: 'conversation-1',
        title: 'Sailing notes',
        content: 'My favourite mooring knot is the bowline.',
        start_offset: 0,
        end_offset: 40,
        metadata: { messageId: 'message-1', role: 'user' },
        chunk_version: 1,
        indexed_at: '2026-09-09T10:00:00.000Z',
        lexical_rank: 1,
        semantic_rank: 1,
      },
    ]);

    const result = await resolvePastChatContext(db as never, {
      userId: 'user-1',
      query: KNOT_QUERY,
    });

    expect(result.mode).toBe('semantic');
    expect(result.citations[0]?.messageId).toBe('message-1');
    const hydrateSql = (db.query.mock.calls[2] as [string, unknown[]])[0];
    expect(hydrateSql).toContain('c.user_id = $1');
    expect(hydrateSql).toContain('coalesce(c.is_temporary, false) = false');
    expect(hydrateSql).toContain('m.id = any($4::uuid[])');
    expect(result.prompt).toContain('bowline');
  });

  it('falls back to the keyword scan when the account has nothing indexed', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ present: false }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row()]);
    const db = { query, transaction: vi.fn(), execute: vi.fn() };

    const result = await resolvePastChatContext(db as never, {
      userId: 'user-1',
      query: KNOT_QUERY,
    });

    expect(result.mode).toBe('keyword');
    expect(result.citations).toHaveLength(1);
  });
});
