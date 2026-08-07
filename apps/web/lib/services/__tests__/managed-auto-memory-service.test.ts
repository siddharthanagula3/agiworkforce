import { describe, expect, it, vi } from 'vitest';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { recordManagedAutoMemoryTurn } from '../managed-auto-memory-service';

function processed(autoMemoryFacts: string[]): ProcessedRequest {
  return {
    requestId: 'request-1',
    autoMemoryFacts,
  } as ProcessedRequest;
}

describe('recordManagedAutoMemoryTurn', () => {
  it('persists prepared facts only for a completed turn', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 'memory-1' }]);

    await recordManagedAutoMemoryTurn({
      db: { query },
      userId: 'user-1',
      processed: processed(['User prefers concise answers']),
      outcome: 'completed',
    });

    // Asserted by INTENT, not by call count: the write path also reads the
    // account's memory exclusions, and a bare `toHaveBeenCalledOnce()` broke
    // the moment that read was added while the behaviour under test — "a
    // completed turn persists" — was unchanged.
    const statements = query.mock.calls.map((call) => String(call[0]));
    expect(statements.some((sql) => sql.includes('insert into user_memories'))).toBe(true);
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
