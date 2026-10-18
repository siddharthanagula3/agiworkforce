const mockWriteLocalMemoryFact = jest.fn();

jest.mock('../src/features/memory/services/localMemoryWriter', () => ({
  writeLocalMemoryFact: (...args: unknown[]) => mockWriteLocalMemoryFact(...args),
}));
jest.mock('../storage/memory', () => ({
  deleteMemoryFact: jest.fn(),
  getMemoryFact: jest.fn(),
  searchMemoryByText: jest.fn(async () => []),
}));
jest.mock('../services/api', () => ({ api: { post: jest.fn() } }));
jest.mock('../services/cloudSyncEngine', () => ({ syncNow: jest.fn(async () => undefined) }));

import { runMemoryCommand } from '../src/features/memory/services/memoryCommands';

const LOCAL_REMEMBER = {
  executionMode: 'local' as const,
  message: 'Remember that I use Vim',
  conversationId: null,
  projectId: null,
  memoryEnabled: true,
};

describe('local explicit remember outcomes', () => {
  beforeEach(() => mockWriteLocalMemoryFact.mockReset());

  it('says the fact was not saved when a pinned memory on the topic outranks it', async () => {
    mockWriteLocalMemoryFact.mockResolvedValue({
      outcome: 'kept_existing',
      fact: null,
      replacedIds: [],
    });

    const reply = await runMemoryCommand(LOCAL_REMEMBER);

    expect(reply?.status).toBe('overruled');
    expect(reply?.message).toContain('pinned memory on the same topic');
    expect(reply?.message).not.toContain('Saved to memory');
  });

  it('confirms a fact that was written and is in force', async () => {
    mockWriteLocalMemoryFact.mockResolvedValue({
      outcome: 'inserted',
      fact: null,
      replacedIds: [],
    });

    const reply = await runMemoryCommand(LOCAL_REMEMBER);

    expect(reply?.status).toBe('stored');
  });
});
