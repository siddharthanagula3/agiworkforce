import { describe, expect, it, vi } from 'vitest';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { recordManagedAutoMemoryTurn } from '../managed-auto-memory-service';
import { answerMemoryPolicyQuery, asQuery } from './memory-policy-stub';

function processed(autoMemoryFacts: string[]): ProcessedRequest {
  return {
    requestId: 'request-1',
    autoMemoryFacts,
    chatRequest: { messages: [] },
  } as unknown as ProcessedRequest;
}

describe('recordManagedAutoMemoryTurn', () => {
  it('persists prepared facts only for a completed turn', async () => {
    const query = asQuery(
      vi.fn(
        async (sql: string, _params?: unknown[]) =>
          answerMemoryPolicyQuery(sql) ?? [{ id: 'memory-1' }],
      ),
    );

    await recordManagedAutoMemoryTurn({
      db: { query },
      userId: 'user-1',
      processed: processed(['User prefers concise answers']),
      outcome: 'completed',
    });

    const statements = query.mock.calls.map((call) => String(call[0]));
    expect(statements.some((sql) => sql.includes('insert into user_memories'))).toBe(true);
  });

  it('does not write when the per-chat Memory toggle left no facts to persist', async () => {
    const query = vi.fn();

    await recordManagedAutoMemoryTurn({
      db: { query },
      userId: 'user-1',
      processed: processed([]),
      outcome: 'completed',
    });

    expect(query).not.toHaveBeenCalled();
  });

  it.each(['failed', 'cancelled'] as const)('does not write after a %s turn', async (outcome) => {
    const query = vi.fn();

    await recordManagedAutoMemoryTurn({
      db: { query },
      userId: 'user-1',
      processed: processed(['User prefers concise answers']),
      outcome,
    });

    expect(query).not.toHaveBeenCalled();
  });

  it('keeps its facts when tools were offered but the turn ran none', async () => {
    const query = asQuery(
      vi.fn(
        async (sql: string, _params?: unknown[]) =>
          answerMemoryPolicyQuery(sql) ?? [{ id: 'memory-1' }],
      ),
    );

    await recordManagedAutoMemoryTurn({
      db: { query },
      userId: 'user-1',
      processed: {
        ...processed(['User prefers concise answers']),
        autoMemoryFactsRequireToolFreeTurn: true,
      },
      outcome: 'completed',
    });

    const statements = query.mock.calls.map((call) => String(call[0]));
    expect(statements.some((sql) => sql.includes('insert into user_memories'))).toBe(true);
  });

  it('drops its facts when a tool actually ran and the policy forbids it', async () => {
    const query = vi.fn();

    await recordManagedAutoMemoryTurn({
      db: { query },
      userId: 'user-1',
      processed: {
        ...processed(['User prefers concise answers']),
        autoMemoryFactsRequireToolFreeTurn: true,
        toolExecutionObserved: true,
      },
      outcome: 'completed',
    });

    expect(query).not.toHaveBeenCalled();
  });

  it('keeps its facts from a tool-assisted turn the policy allows', async () => {
    const query = asQuery(
      vi.fn(
        async (sql: string, _params?: unknown[]) =>
          answerMemoryPolicyQuery(sql) ?? [{ id: 'memory-1' }],
      ),
    );

    await recordManagedAutoMemoryTurn({
      db: { query },
      userId: 'user-1',
      processed: {
        ...processed(['User prefers concise answers']),
        autoMemoryFactsRequireToolFreeTurn: false,
        toolExecutionObserved: true,
      },
      outcome: 'completed',
    });

    const statements = query.mock.calls.map((call) => String(call[0]));
    expect(statements.some((sql) => sql.includes('insert into user_memories'))).toBe(true);
  });

  it('keeps nothing from a conversation that holds Google user data', async () => {
    const query = asQuery(
      vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('google_user_data_at is not null as marked')) {
          return [{ marked: true, project_id: null }];
        }
        return answerMemoryPolicyQuery(sql) ?? [{ id: 'memory-1' }];
      }),
    );

    await recordManagedAutoMemoryTurn({
      db: { query },
      userId: 'user-1',
      processed: {
        ...processed(['User prefers concise answers']),
        conversationId: '52d14f7e-0b3d-40c7-952d-987e841033c5',
      },
      outcome: 'completed',
    });

    const statements = query.mock.calls.map((call) => String(call[0]));
    expect(statements.some((sql) => sql.includes('insert into user_memories'))).toBe(false);
  });

  it('keeps nothing from a turn whose history shows a Google tool call', async () => {
    const query = asQuery(
      vi.fn(
        async (sql: string, _params?: unknown[]) =>
          answerMemoryPolicyQuery(sql) ?? [{ id: 'memory-1' }],
      ),
    );

    await recordManagedAutoMemoryTurn({
      db: { query },
      userId: 'user-1',
      processed: {
        ...processed(['User prefers concise answers']),
        chatRequest: {
          messages: [
            {
              role: 'assistant',
              tool_calls: [{ id: 'c', function: { name: 'mcp__gmail__search_threads' } }],
            },
          ],
        },
      } as unknown as ProcessedRequest,
      outcome: 'completed',
    });

    const statements = query.mock.calls.map((call) => String(call[0]));
    expect(statements.some((sql) => sql.includes('insert into user_memories'))).toBe(false);
  });

  it('swallows persistence failures so memory cannot break a successful response', async () => {
    const query = vi.fn().mockRejectedValue(new Error('memory unavailable'));

    await expect(
      recordManagedAutoMemoryTurn({
        db: { query },
        userId: 'user-1',
        processed: processed(['User prefers concise answers']),
        outcome: 'completed',
      }),
    ).resolves.toBeUndefined();
  });
});
