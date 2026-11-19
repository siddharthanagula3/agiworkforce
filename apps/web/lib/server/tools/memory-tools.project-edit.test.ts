import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { answerMemoryPolicyQuery, asQuery } from '@/lib/services/__tests__/memory-policy-stub';
import {
  FORGET_MEMORY_TOOL_NAME,
  SAVE_MEMORY_TOOL_NAME,
  SEARCH_MEMORY_TOOL_NAME,
  executeProjectMemoryEditTool,
  type ProjectMemoryEditToolContext,
} from './memory-tools';

type LoggerModule = typeof import('@/lib/logger');

const PROJECT_ID = '0195f2a8-7c1d-7e3a-9b4f-2a6c8d0e1f23';

function writtenRow(overrides: Record<string, unknown> = {}) {
  return {
    outcome: 'inserted',
    id: 'memory-new',
    content: 'The deadline is March',
    category: 'fact',
    source: 'mobile',
    pinned: false,
    project_id: PROJECT_ID,
    expires_at: null,
    superseded_by: null,
    superseded_ids: [],
    created_at: '2026-11-16T10:00:00.000Z',
    updated_at: '2026-11-16T10:00:00.000Z',
    ...overrides,
  };
}

function projectContext(answer: (sql: string, params?: unknown[]) => unknown[] | null) {
  const query = asQuery(
    vi.fn(
      async (sql: string, params?: unknown[]) =>
        answerMemoryPolicyQuery(sql) ?? answer(sql, params) ?? [],
    ),
  );
  const context: ProjectMemoryEditToolContext = {
    db: { query },
    userId: 'user-1',
    organizationId: null,
    projectId: PROJECT_ID,
    source: 'mobile',
    changes: [],
    removals: [],
  };
  return { query, context };
}

function sqlOf(query: ReturnType<typeof projectContext>['query']): string[] {
  return query.mock.calls.map(([sql]) => String(sql));
}

describe('project memory edit tools', () => {
  it('saves into the project and reports the new memory as added', async () => {
    const { query, context } = projectContext((sql) =>
      sql.includes('into user_memories') ? [writtenRow()] : null,
    );

    const result = await executeProjectMemoryEditTool(
      SAVE_MEMORY_TOOL_NAME,
      { fact: 'The deadline is March' },
      context,
    );

    expect(JSON.parse(result.content)).toEqual({ saved: true });
    const insert = query.mock.calls.find(([sql]) => String(sql).includes('into user_memories'));
    expect(insert?.[1]?.[2]).toBe(PROJECT_ID);
    expect(context.changes).toEqual([
      { id: 'memory-new', action: 'added', content: 'The deadline is March' },
    ]);
  });

  it('reports a save that replaced an older memory as updated', async () => {
    const { context } = projectContext((sql) =>
      sql.includes('into user_memories') ? [writtenRow({ superseded_ids: ['memory-old'] })] : null,
    );

    await executeProjectMemoryEditTool(
      SAVE_MEMORY_TOOL_NAME,
      { fact: 'The deadline is March' },
      context,
    );

    expect(context.changes).toEqual([
      { id: 'memory-new', action: 'updated', content: 'The deadline is March' },
    ]);
  });

  it('records nothing when the memory was already known', async () => {
    const { context } = projectContext((sql) =>
      sql.includes('into user_memories') ? [writtenRow({ outcome: 'merged' })] : null,
    );

    const result = await executeProjectMemoryEditTool(
      SAVE_MEMORY_TOOL_NAME,
      { fact: 'The deadline is March' },
      context,
    );

    expect(JSON.parse(result.content)).toEqual({ saved: false, alreadyKnown: true });
    expect(context.changes).toEqual([]);
  });

  it('finds removals only among this project and deletes nothing', async () => {
    const { query, context } = projectContext((sql) =>
      sql.includes('content ilike')
        ? [{ id: 'memory-old', content: 'The deadline is February' }]
        : null,
    );

    const result = await executeProjectMemoryEditTool(
      FORGET_MEMORY_TOOL_NAME,
      { subject: 'deadline' },
      context,
    );

    expect(JSON.parse(result.content)).toEqual({
      awaitingConfirmation: ['The deadline is February'],
    });
    expect(context.removals).toEqual([{ id: 'memory-old', content: 'The deadline is February' }]);
    const find = query.mock.calls.find(([sql]) => String(sql).includes('content ilike'));
    expect(String(find?.[0])).toContain('project_id = $4::uuid');
    expect(String(find?.[0])).not.toContain('project_id is null');
    expect(find?.[1]?.[3]).toBe(PROJECT_ID);
    expect(sqlOf(query).some((sql) => /\bupdate\b|\bdelete\b/i.test(sql))).toBe(false);
  });

  it('collects a memory matched twice only once', async () => {
    const { context } = projectContext((sql) =>
      sql.includes('content ilike')
        ? [{ id: 'memory-old', content: 'The deadline is February' }]
        : null,
    );

    await executeProjectMemoryEditTool(FORGET_MEMORY_TOOL_NAME, { subject: 'deadline' }, context);
    await executeProjectMemoryEditTool(FORGET_MEMORY_TOOL_NAME, { subject: 'February' }, context);

    expect(context.removals).toHaveLength(1);
  });

  it('never proposes removing a memory this request just saved', async () => {
    const projectRows = [
      { id: 'memory-old', content: 'The deadline is February' },
      { id: 'memory-new', content: 'The deadline is March' },
    ];
    const { context } = projectContext((sql, params) => {
      if (sql.includes('into user_memories')) return [writtenRow()];
      if (!sql.includes('content ilike')) return null;
      const excluded = Array.isArray(params?.[4]) ? (params[4] as string[]) : [];
      return projectRows.filter((row) => !excluded.includes(row.id));
    });

    await executeProjectMemoryEditTool(
      SAVE_MEMORY_TOOL_NAME,
      { fact: 'The deadline is March' },
      context,
    );
    const result = await executeProjectMemoryEditTool(
      FORGET_MEMORY_TOOL_NAME,
      { subject: 'deadline' },
      context,
    );

    expect(JSON.parse(result.content)).toEqual({
      awaitingConfirmation: ['The deadline is February'],
    });
    expect(context.removals).toEqual([{ id: 'memory-old', content: 'The deadline is February' }]);
    expect(context.changes).toEqual([
      { id: 'memory-new', action: 'added', content: 'The deadline is March' },
    ]);
  });

  it('drops a proposed removal once a later save has replaced that memory', async () => {
    const { context } = projectContext((sql) => {
      if (sql.includes('into user_memories')) {
        return [writtenRow({ superseded_ids: ['memory-old'] })];
      }
      return sql.includes('content ilike')
        ? [{ id: 'memory-old', content: 'The deadline is February' }]
        : null;
    });

    await executeProjectMemoryEditTool(FORGET_MEMORY_TOOL_NAME, { subject: 'deadline' }, context);
    await executeProjectMemoryEditTool(
      SAVE_MEMORY_TOOL_NAME,
      { fact: 'The deadline is March' },
      context,
    );

    expect(context.removals).toEqual([]);
    expect(context.changes).toEqual([
      { id: 'memory-new', action: 'updated', content: 'The deadline is March' },
    ]);
  });

  it('searches this project alone, never account memories', async () => {
    const { query, context } = projectContext((sql) =>
      sql.includes('from user_memories') && !sql.includes('content ilike')
        ? [
            {
              id: 'memory-old',
              content: 'The deadline is February',
              category: 'fact',
              pinned: false,
              updated_at: '2026-11-01T00:00:00.000Z',
            },
          ]
        : null,
    );

    const result = await executeProjectMemoryEditTool(
      SEARCH_MEMORY_TOOL_NAME,
      { query: 'deadline' },
      context,
    );

    expect(JSON.parse(result.content)).toEqual({ memories: ['The deadline is February'] });
    const read = sqlOf(query).find((sql) => sql.includes('from user_memories'));
    expect(read).toMatch(/project_id = \$\d+::uuid/);
    expect(read).not.toContain('project_id is null');
  });

  it('refuses any tool outside the three memory tools', async () => {
    const { query, context } = projectContext(() => null);

    const result = await executeProjectMemoryEditTool('web_search', { query: 'x' }, context);

    expect(result).toEqual({ content: 'Unknown tool: web_search', isError: true });
    expect(query).not.toHaveBeenCalled();
  });
});
