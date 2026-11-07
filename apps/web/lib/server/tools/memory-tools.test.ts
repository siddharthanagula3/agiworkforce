import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { answerMemoryPolicyQuery, asQuery } from '@/lib/services/__tests__/memory-policy-stub';
import { createMemoryCommandPorts } from '@/lib/services/memory-commands';
import { MemoryIneligibleError } from '@/lib/services/managed-memory-context-service';
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

describe('native memory cancellation', () => {
  it('stops a save cancelled during policy admission', async () => {
    const { query, context } = memoryDb(false);
    const controller = new AbortController();
    const reason = new Error('Stopped during policy admission');
    query.mockImplementation(async (sql) => {
      if (sql.includes("settings -> 'capabilities'")) controller.abort(reason);
      return answerMemoryPolicyQuery(sql) ?? [];
    });
    await expect(
      executeMemoryTool(
        SAVE_MEMORY_TOOL_NAME,
        { fact: 'User prefers metric units' },
        {
          ...context,
          signal: controller.signal,
        },
      ),
    ).rejects.toBe(reason);
    expect(inserted(query)).toBe(false);
  });

  it('preserves the successful save when cancellation follows dispatch', async () => {
    const { query, context } = memoryDb(false);
    const controller = new AbortController();
    query.mockImplementation(async (sql) => {
      if (sql.includes('into user_memories')) {
        controller.abort();
        return [{ outcome: 'inserted', id: 'm1' }];
      }
      return answerMemoryPolicyQuery(sql) ?? [];
    });
    const result = await executeMemoryTool(
      SAVE_MEMORY_TOOL_NAME,
      { fact: 'User prefers metric units' },
      {
        ...context,
        signal: controller.signal,
      },
    );
    expect(JSON.parse(result.content)).toMatchObject({ saved: true });
  });
});

describe('memory command mutation admission', () => {
  it('rethrows cancellation reasons even when they are memory refusal errors', async () => {
    const { query, context } = memoryDb(false);
    const controller = new AbortController();
    const reason = new MemoryIneligibleError('user_memory_disabled', 'Stopped');
    query.mockImplementation(async (sql) => {
      if (sql.includes("settings -> 'capabilities'")) controller.abort(reason);
      return answerMemoryPolicyQuery(sql) ?? [];
    });
    const ports = createMemoryCommandPorts(context.db, {
      ...context,
      signal: controller.signal,
    });
    await expect(ports.store({ fact: 'User prefers metric units', category: 'fact' })).rejects.toBe(
      reason,
    );
    expect(inserted(query)).toBe(false);
  });

  it('does not remove memories after cancellation during scope lookup', async () => {
    const { query, context } = memoryDb(false);
    const controller = new AbortController();
    query.mockImplementation(async () => {
      controller.abort();
      return [{ uses_global_memory: true }];
    });
    const ports = createMemoryCommandPorts(context.db, {
      ...context,
      projectId: '11111111-1111-4111-8111-111111111111',
      signal: controller.signal,
    });
    await expect(ports.remove(['22222222-2222-4222-8222-222222222222'])).rejects.toBe(
      controller.signal.reason,
    );
    expect(query.mock.calls.some(([sql]) => sql.includes('update user_memories'))).toBe(false);
  });
});
