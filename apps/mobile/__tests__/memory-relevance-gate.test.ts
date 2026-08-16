
import type { MemoryFact } from '../storage/types';

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
  insertMemoryFact: jest.fn(),
  deleteMemoryFact: jest.fn(),
  updateMemoryFact: jest.fn(),
  togglePinMemoryFact: jest.fn(),
  updateEmbedding: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid'),
}));

import { retrieveMemoryContext } from '../src/features/memory/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useCloudMemoryStore } from '../stores/memory/cloudMemoryStore';

function makeFact(id: string, fact: string, pinned = false): MemoryFact {
  return {
    id,
    fact,
    source_conversation_id: null,
    pinned,
    created_at: Date.now(),
  };
}

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
    mockFacts = [makeFact('f-irrelevant', 'User prefers dark mode in all apps', false)];
    const result = await retrieveMemoryContext('what is a good recipe for pasta');
    expect(result).toEqual([]);
  });

  it('injects pinned fact even when query has no keyword overlap', async () => {
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
    expect(result.map((f) => f.id)).toEqual(['f-pinned']);
  });

  it('returns text-matched facts even when unrelated pinned facts also exist', async () => {
    mockFacts = [
      makeFact('f-pinned', 'User prefers formal tone', true),
      makeFact('f-match', 'User likes Python programming', false),
    ];
    const result = await retrieveMemoryContext('Python programming');
    expect(result.map((f) => f.id)).toContain('f-match');
  });

  it('respects the k limit on pinned fallback', async () => {
    mockFacts = Array.from({ length: 10 }, (_, i) => makeFact(`p${i}`, `Pinned fact ${i}`, true));
    const result = await retrieveMemoryContext('irrelevant query xyz', 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});

describe('retrieveMemoryContext — cloud mode', () => {
  beforeEach(() => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useCloudMemoryStore.setState({ entries: [] });
  });

  afterAll(() => {
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  function seedCloudEntry(id: string, content: string, pinned = false) {
    useCloudMemoryStore.getState().upsertCloudMemory({
      id,
      content,
      pinned,
      source: 'mobile',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
    } as never);
  }

  it('matches a realistic multi-word question against a short stored fact', async () => {
    seedCloudEntry('f1', 'User prefers Rust over Python');
    const result = await retrieveMemoryContext(
      'Based on your memory what language do i prefer in between rust and python',
    );
    expect(result.map((f) => f.id)).toContain('f1');
  });

  it('ranks the memory with more significant query overlap first', async () => {
    seedCloudEntry('rust-only', 'User writes Rust');
    seedCloudEntry('both', 'User writes Rust and Python');

    const result = await retrieveMemoryContext('compare Rust and Python');

    expect(result.map((fact) => fact.id)).toEqual(['both', 'rust-only']);
  });

  it('does not inject an unrelated unpinned cloud fact', async () => {
    seedCloudEntry('f1', 'User has a cat named Whiskers');
    const result = await retrieveMemoryContext('what language do I prefer, rust or python');
    expect(result).toEqual([]);
  });

  it('falls back to pinned cloud facts when no keyword overlap exists', async () => {
    seedCloudEntry('f1', 'User works in fintech', true);
    const result = await retrieveMemoryContext('unrelated query about cooking');
    expect(result.map((f) => f.id)).toEqual(['f1']);
  });
});
