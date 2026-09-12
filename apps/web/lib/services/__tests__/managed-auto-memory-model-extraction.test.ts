import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';

const hoisted = vi.hoisted(() => ({
  after: vi.fn((task: Promise<unknown>) => task),
  extract: vi.fn(),
  enabled: vi.fn(() => false),
}));

vi.mock('next/server', () => ({ after: hoisted.after }));
vi.mock('../model-memory-extraction', () => ({
  extractAutoMemoryFactsWithModel: hoisted.extract,
  isModelMemoryExtractionEnabled: hoisted.enabled,
}));

const { recordManagedAutoMemoryTurn } = await import('../managed-auto-memory-service');

/**
 * The flag is a spend switch, so the two claims worth pinning are that OFF
 * reaches the extractor zero times and writes exactly what the pattern path
 * prepared, and that ON never runs the extraction inside the awaited callback,
 * which is the one the non-streaming response waits on.
 */
function processed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'request-1',
    autoMemoryFacts: ["User's name is Sid"],
    autoMemorySourceText: 'My name is Sid. I just moved to Berlin.',
    ...overrides,
  } as ProcessedRequest;
}

/** The insert ships its rows as one JSON parameter, so read the contents back out of it. */
function insertedCandidates(query: ReturnType<typeof vi.fn>): string[] {
  const insert = query.mock.calls.find((call) =>
    String(call[0]).includes('insert into user_memories'),
  );
  const batch = (insert?.[1] as unknown[] | undefined)?.[1];
  if (typeof batch !== 'string') return [];
  return (JSON.parse(batch) as Array<{ content: string }>).map((row) => row.content);
}

describe('recordManagedAutoMemoryTurn, model extraction flag', () => {
  beforeEach(() => {
    hoisted.after.mockClear();
    hoisted.extract.mockReset();
    hoisted.enabled.mockReset();
    hoisted.enabled.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('with the flag off, never calls the extractor and writes the pattern facts', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 'memory-1' }]);

    await recordManagedAutoMemoryTurn({
      db: { query },
      userId: 'user-1',
      processed: processed(),
      outcome: 'completed',
    });

    expect(hoisted.extract).not.toHaveBeenCalled();
    expect(hoisted.after).not.toHaveBeenCalled();
    expect(insertedCandidates(query)).toContain("User's name is Sid");
  });

  it('with the flag on, persists what the model extractor returned', async () => {
    hoisted.enabled.mockReturnValue(true);
    hoisted.extract.mockResolvedValue(["User's name is Sid", 'User lives in Berlin']);
    const query = vi.fn().mockResolvedValue([{ id: 'memory-1' }]);

    await recordManagedAutoMemoryTurn({
      db: { query },
      userId: 'user-1',
      processed: processed(),
      outcome: 'completed',
    });
    await hoisted.after.mock.calls[0]?.[0];

    expect(hoisted.extract).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'My name is Sid. I just moved to Berlin.' }),
    );
    expect(insertedCandidates(query)).toContain('User lives in Berlin');
  });

  it('runs the extraction after the response, not inside the awaited callback', async () => {
    hoisted.enabled.mockReturnValue(true);
    let settleExtraction: (facts: string[]) => void = () => {};
    hoisted.extract.mockReturnValue(
      new Promise<string[]>((resolve) => {
        settleExtraction = resolve;
      }),
    );
    const query = vi.fn().mockResolvedValue([{ id: 'memory-1' }]);

    await recordManagedAutoMemoryTurn({
      db: { query },
      userId: 'user-1',
      processed: processed(),
      outcome: 'completed',
    });

    expect(query).not.toHaveBeenCalled();
    settleExtraction(['User lives in Berlin']);
    await hoisted.after.mock.calls[0]?.[0];
    expect(query).toHaveBeenCalled();
  });

  it('falls back to the pattern facts when the extractor throws', async () => {
    hoisted.enabled.mockReturnValue(true);
    hoisted.extract.mockRejectedValue(new Error('provider 503'));
    const query = vi.fn().mockResolvedValue([{ id: 'memory-1' }]);

    await recordManagedAutoMemoryTurn({
      db: { query },
      userId: 'user-1',
      processed: processed(),
      outcome: 'completed',
    });
    await hoisted.after.mock.calls[0]?.[0];

    expect(insertedCandidates(query)).toContain("User's name is Sid");
  });

  it('does not forward a zero-data-retention turn to the shared utility route', async () => {
    hoisted.enabled.mockReturnValue(true);
    const query = vi.fn().mockResolvedValue([{ id: 'memory-1' }]);

    await recordManagedAutoMemoryTurn({
      db: { query },
      userId: 'user-1',
      processed: processed({ zeroDataRetentionOnly: true }),
      outcome: 'completed',
    });

    expect(hoisted.extract).not.toHaveBeenCalled();
    expect(insertedCandidates(query)).toContain("User's name is Sid");
  });

  it('does not re-read a turn that was never allowed to learn', async () => {
    hoisted.enabled.mockReturnValue(true);
    const query = vi.fn();

    await recordManagedAutoMemoryTurn({
      db: { query },
      userId: 'user-1',
      processed: processed({ autoMemoryFacts: [], autoMemorySourceText: undefined }),
      outcome: 'completed',
    });

    expect(hoisted.extract).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
