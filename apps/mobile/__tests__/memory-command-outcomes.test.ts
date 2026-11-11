const mockWriteLocalMemoryFact = jest.fn();
const mockDeleteMemoryFact = jest.fn();
const mockGetMemoryFact = jest.fn();
const mockSearchMemoryByText = jest.fn();
const mockApiPost = jest.fn();

jest.mock('../src/features/memory/services/localMemoryWriter', () => ({
  writeLocalMemoryFact: (...args: unknown[]) => mockWriteLocalMemoryFact(...args),
}));
jest.mock('../storage/memory', () => ({
  deleteMemoryFact: (...args: unknown[]) => mockDeleteMemoryFact(...args),
  getMemoryFact: (...args: unknown[]) => mockGetMemoryFact(...args),
  searchMemoryByText: (...args: unknown[]) => mockSearchMemoryByText(...args),
}));
jest.mock('../services/api', () => ({
  api: { post: (...args: unknown[]) => mockApiPost(...args) },
}));
jest.mock('../services/cloudSyncEngine', () => ({ syncNow: jest.fn(async () => undefined) }));

import type { StatusStep } from '../types/chat';
import {
  answerMemoryCommand,
  runMemoryCommand,
} from '../src/features/memory/services/memoryCommands';

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

const CONFIRMED_LOCAL_FORGET = {
  executionMode: 'local' as const,
  message: 'Forget about cedar',
  conversationId: null,
  projectId: null,
  memoryEnabled: true,
  confirmed: true,
};

const CEDAR_FACTS = [
  { id: 'fact-1', fact: 'The cedar workshop starts at nine' },
  { id: 'fact-2', fact: 'The cedar workshop ends at four' },
];

async function answerAndCollect(input: Parameters<typeof answerMemoryCommand>[0]) {
  const steps: StatusStep[] = [];
  const report = await answerMemoryCommand(input, (step) => steps.push(step));
  return { report, steps };
}

describe('confirmed local forget receipts', () => {
  beforeEach(() => {
    mockDeleteMemoryFact.mockReset().mockResolvedValue(undefined);
    mockGetMemoryFact.mockReset();
    mockSearchMemoryByText.mockReset().mockResolvedValue(CEDAR_FACTS);
  });

  it('names the memory already forgotten when storage fails before the next one', async () => {
    mockGetMemoryFact
      .mockResolvedValueOnce(CEDAR_FACTS[0])
      .mockRejectedValueOnce(new Error('database is locked'));

    const { report, steps } = await answerAndCollect(CONFIRMED_LOCAL_FORGET);

    expect(mockDeleteMemoryFact).toHaveBeenCalledTimes(1);
    expect(mockDeleteMemoryFact).toHaveBeenCalledWith('fact-1');
    expect(report).toEqual({ kind: 'forget', status: 'failed' });
    expect(steps).toHaveLength(1);
    expect(steps[0]?.status).toBe('failed');
    expect(steps[0]?.message).toBe(
      'Forgot "The cedar workshop starts at nine", then memory stopped answering, so 1 other memory may still be saved.',
    );
    expect(steps[0]?.message).not.toContain('nothing was changed');
  });

  it('still says nothing changed when storage fails before any memory is deleted', async () => {
    mockGetMemoryFact.mockRejectedValueOnce(new Error('database is locked'));

    const { steps } = await answerAndCollect(CONFIRMED_LOCAL_FORGET);

    expect(mockDeleteMemoryFact).not.toHaveBeenCalled();
    expect(steps[0]?.message).toBe('Memory did not answer, so nothing was changed.');
    expect(steps[0]?.status).toBe('failed');
  });

  it('keeps the receipt of a deletion when a later target has disappeared', async () => {
    mockGetMemoryFact.mockResolvedValueOnce(CEDAR_FACTS[0]).mockResolvedValueOnce(null);

    const { report, steps } = await answerAndCollect(CONFIRMED_LOCAL_FORGET);

    expect(report).toEqual({ kind: 'forget', status: 'forgotten' });
    expect(steps[0]?.message).toContain('The cedar workshop starts at nine');
    expect(steps[0]?.status).toBe('completed');
  });

  it('reports every memory forgotten when the whole confirmed set is deleted', async () => {
    mockGetMemoryFact.mockResolvedValueOnce(CEDAR_FACTS[0]).mockResolvedValueOnce(CEDAR_FACTS[1]);

    const { steps } = await answerAndCollect(CONFIRMED_LOCAL_FORGET);

    expect(mockDeleteMemoryFact).toHaveBeenCalledTimes(2);
    expect(steps[0]?.message).toContain('The cedar workshop starts at nine');
    expect(steps[0]?.message).toContain('The cedar workshop ends at four');
    expect(steps[0]?.status).toBe('completed');
  });
});

describe('cloud memory command receipts without a server answer', () => {
  const CLOUD_FORGET = { ...CONFIRMED_LOCAL_FORGET, executionMode: 'cloud' as const };

  beforeEach(() => mockApiPost.mockReset());

  it('does not claim nothing changed when a confirmed forget loses its response', async () => {
    mockApiPost.mockRejectedValueOnce(new TypeError('Network request failed'));

    const { steps } = await answerAndCollect(CLOUD_FORGET);

    expect(steps[0]?.message).toBe(
      'Memory did not answer, so it is not known whether anything changed. Check Memory in Settings.',
    );
  });

  it('says nothing changed when an unconfirmed lookup fails, since it cannot delete', async () => {
    mockApiPost.mockRejectedValueOnce(new TypeError('Network request failed'));

    const { steps } = await answerAndCollect({ ...CLOUD_FORGET, confirmed: false });

    expect(steps[0]?.message).toBe('Memory did not answer, so nothing was changed.');
  });
});
