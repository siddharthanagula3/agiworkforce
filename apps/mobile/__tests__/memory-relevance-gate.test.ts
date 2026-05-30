/**
 * Tests for the relevance gate in retrieveMemoryContext.
 *
 * DoD (P1-MOBILE-MEM):
 *   - An irrelevant unpinned memory must NOT be injected when the query has
 *     no keyword overlap with stored facts.
 *   - A relevant memory (keyword match) IS injected.
 *   - A pinned memory IS injected even without a keyword match (explicitly
 *     user-curated, always relevant).
 *
 * Mock strategy: stub @/storage/memory so tests run without a real SQLite DB.
 * The storage layer is the boundary; retrieveMemoryContext is the unit.
 *
 * Note: Jest hoists jest.mock() factories before variable declarations, so the
 * shared fact store must use a `mock`-prefixed name (Jest permits those in
 * factories) rather than a plain `let`.
 */

import type { MemoryFact } from '../storage/types';

// ---------------------------------------------------------------------------
// Shared in-memory fact store — `mock` prefix is required for jest hoisting.
// ---------------------------------------------------------------------------

let mockFacts: MemoryFact[] = [];

jest.mock('../storage/memory', () => ({
  listMemoryFacts: jest.fn(async (opts?: { pinned?: boolean; limit?: number }) => {
    let result = [...mockFacts];
    if (opts?.pinned !== undefined) {
      result = result.filter((f) => f.pinned === opts.pinned);
    }
    const limit = opts?.limit ?? 100;
    return result.slice(0, limit);
  }),
  searchMemoryByText: jest.fn(async (query: string, k = 10) => {
    const q = query.toLowerCase();
    return mockFacts.filter((f) => f.fact.toLowerCase().includes(q)).slice(0, k);
  }),
  searchMemoryByEmbedding: jest.fn(async () => [] as string[]),
  // Remaining exports unused by retrieveMemoryContext; stubs only.
  insertMemoryFact: jest.fn(),
  deleteMemoryFact: jest.fn(),
  updateMemoryFact: jest.fn(),
  togglePinMemoryFact: jest.fn(),
  updateEmbedding: jest.fn(),
}));

// Stub expo-crypto so the store module can be imported without a native module.
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid'),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { retrieveMemoryContext } from '../src/features/memory/store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFact(id: string, fact: string, pinned = false): MemoryFact {
  return {
    id,
    fact,
    source_conversation_id: null,
    pinned,
    created_at: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockFacts = [];
  jest.clearAllMocks();
});

describe('retrieveMemoryContext — relevance gate', () => {
  it('returns empty array when no facts are stored', async () => {
    const result = await retrieveMemoryContext('tell me something');
    expect(result).toEqual([]);
  });

  it('returns matching fact when query overlaps with stored fact content', async () => {
    mockFacts = [makeFact('f1', 'User prefers dark mode in all apps', false)];
    const result = await retrieveMemoryContext('dark mode');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('f1');
  });

  it('does NOT inject irrelevant unpinned fact when query has no keyword overlap', async () => {
    // Fact is about "dark mode"; query is about cooking — no overlap.
    mockFacts = [makeFact('f-irrelevant', 'User prefers dark mode in all apps', false)];
    const result = await retrieveMemoryContext('what is a good recipe for pasta');
    // No text match, no pinned facts → gate returns empty array.
    expect(result).toEqual([]);
  });

  it('injects pinned fact even when query has no keyword overlap', async () => {
    // Pinned facts are always relevant (user explicitly curated them).
    mockFacts = [makeFact('f-pinned', 'User prefers dark mode in all apps', true)];
    const result = await retrieveMemoryContext('what is a good recipe for pasta');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('f-pinned');
  });

  it('does not inject unpinned non-matching facts alongside pinned ones', async () => {
    mockFacts = [
      makeFact('f-pinned', 'User language preference: Hindi', true),
      makeFact('f-unpinned-1', 'User visited London last year', false),
      makeFact('f-unpinned-2', 'User has a cat named Whiskers', false),
    ];
    const result = await retrieveMemoryContext('translate this to French');
    // "translate" has no keyword match in any fact. Only pinned fact is returned.
    expect(result.map((f) => f.id)).toEqual(['f-pinned']);
  });

  it('returns text-matched facts even when unrelated pinned facts also exist', async () => {
    mockFacts = [
      makeFact('f-pinned', 'User prefers formal tone', true),
      makeFact('f-match', 'User likes Python programming', false),
    ];
    // Query is a substring of the fact text so searchMemoryByText returns f-match,
    // and the function returns text-match results rather than the pinned fallback.
    const result = await retrieveMemoryContext('Python programming');
    expect(result.map((f) => f.id)).toContain('f-match');
  });

  it('respects the k limit on pinned fallback', async () => {
    // 10 pinned facts stored; k=3 must cap the result.
    mockFacts = Array.from({ length: 10 }, (_, i) => makeFact(`p${i}`, `Pinned fact ${i}`, true));
    const result = await retrieveMemoryContext('irrelevant query xyz', 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
