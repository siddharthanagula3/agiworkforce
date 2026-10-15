import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { answerMemoryPolicyQuery, asQuery } from '@/lib/services/__tests__/memory-policy-stub';
import { SAVE_MEMORY_TOOL_NAME, executeMemoryTool, memoryToolDefinitions } from './memory-tools';

type LoggerModule = typeof import('@/lib/logger');

const SENSITIVE_FACT = 'User has type 2 diabetes';

function memoryDb(includeSensitiveTopics: boolean) {
  const query = asQuery(
    vi.fn(
      async (sql: string, _params?: unknown[]) =>
        answerMemoryPolicyQuery(sql, { includeSensitiveTopics }) ??
        (sql.includes('into user_memories') ? [{ outcome: 'inserted', id: 'm1' }] : []),
    ),
  );
  return {
    query,
    context: {
      db: { query },
      userId: 'user-1',
      organizationId: null,
      source: 'web',
      temporaryChat: false,
    },
  };
}

function inserted(query: ReturnType<typeof memoryDb>['query']): boolean {
  return query.mock.calls.some(([sql]) => String(sql).includes('into user_memories'));
}

describe('save_memory and the sensitive-topic opt-in', () => {
  it('refuses a sensitive fact the model chose to save while the opt-in is off', async () => {
    const { query, context } = memoryDb(false);

    const result = await executeMemoryTool(
      SAVE_MEMORY_TOOL_NAME,
      { fact: SENSITIVE_FACT },
      context,
    );

    const body = JSON.parse(result.content) as { saved: boolean; reason?: string };
    expect(result.isError).toBe(false);
    expect(body.saved).toBe(false);
    expect(body.reason).toContain('Include sensitive topics in memory');
    expect(inserted(query)).toBe(false);
  });

  it('saves the same fact once the user has turned the opt-in on', async () => {
    const { query, context } = memoryDb(true);

    const result = await executeMemoryTool(
      SAVE_MEMORY_TOOL_NAME,
      { fact: SENSITIVE_FACT },
      context,
    );

    expect(JSON.parse(result.content)).toMatchObject({ saved: true });
    expect(inserted(query)).toBe(true);
  });

  it('still saves an ordinary fact with the opt-in off', async () => {
    const { context } = memoryDb(false);

    const result = await executeMemoryTool(
      SAVE_MEMORY_TOOL_NAME,
      { fact: 'User prefers metric units' },
      context,
    );

    expect(JSON.parse(result.content)).toMatchObject({ saved: true });
  });

  it('tells the model which topics wait on the opt-in', () => {
    const save = memoryToolDefinitions().find(
      (tool) => tool.function.name === SAVE_MEMORY_TOOL_NAME,
    );

    expect(save?.function.description).toContain('Include sensitive topics in memory');
    expect(save?.function.description).toContain('religious beliefs');
    expect(save?.function.description).toContain('only when the user asks you to remember it');
  });
});
