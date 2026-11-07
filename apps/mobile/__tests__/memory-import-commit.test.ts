let mockMode: 'local' | 'cloud' = 'local';
const mockPost = jest.fn();
const mockListMemoryFacts = jest.fn();
const mockWriteLocalMemoryFact = jest.fn();
const mockSyncNow = jest.fn();

jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: { getState: () => ({ appMode: mockMode }) },
}));
jest.mock('../lib/mmkv', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));
jest.mock('../services/api', () => ({
  api: { post: (...args: unknown[]) => mockPost(...args), delete: jest.fn() },
}));
jest.mock('../storage/memory', () => ({
  listMemoryFacts: (...args: unknown[]) => mockListMemoryFacts(...args),
  deleteAllMemoryFacts: jest.fn(),
  deleteMemoryFact: jest.fn(),
  updateMemoryFact: jest.fn(),
  togglePinMemoryFact: jest.fn(),
  searchMemoryByText: jest.fn(),
}));
jest.mock('../src/features/memory/services/localMemoryWriter', () => ({
  writeLocalMemoryFact: (...args: unknown[]) => mockWriteLocalMemoryFact(...args),
}));
jest.mock('../stores/memory/cloudMemoryStore', () => ({
  useCloudMemoryStore: { getState: () => ({ entries: [] }) },
}));
jest.mock('../stores/memory/memorySyncStateStore', () => ({
  useMemorySyncStateStore: { getState: () => ({ dirtyMemoryIds: [] }) },
}));
jest.mock('../services/cloudSyncEngine', () => ({
  syncNow: (...args: unknown[]) => mockSyncNow(...args),
  markMemoryForSync: jest.fn(),
}));

import { MAX_IMPORT_ITEMS } from '@agiworkforce/types';
import { useMemoryStore } from '../src/features/memory/store';
import { captureAccountScopedUiState } from '../src/features/auth/services/accountScopedUiState';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import {
  MEMORY_IMPORT_UNCERTAIN_MESSAGE,
  type MemoryImportOperation,
} from '../src/features/memory/services/memoryImportOperation';

function operation(mode: 'local' | 'cloud'): MemoryImportOperation {
  mockMode = mode;
  const scope = captureAccountScopedUiState(mode);
  if (!scope) throw new Error('Fixture requires an active account');
  return { scope, isActive: () => true };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockMode = 'local';
  __resetCloudAccountSessionForTests();
  activateCloudAccount('account-a');
  mockListMemoryFacts.mockResolvedValue([]);
  mockSyncNow.mockResolvedValue(undefined);
  useMemoryStore.getState().resetVisibleState();
});

it('keeps Local duplicate/refused semantics without uploading or syncing', async () => {
  mockWriteLocalMemoryFact
    .mockResolvedValueOnce({ outcome: 'already_known', fact: null, replacedIds: [] })
    .mockResolvedValueOnce({ outcome: 'refused', fact: null, replacedIds: [] });
  await expect(
    useMemoryStore
      .getState()
      .bulkInsert(['Existing memory', 'Prohibited memory'], 'Other', operation('local')),
  ).resolves.toEqual({ inserted: 0, skipped: 2 });
  expect(mockPost).not.toHaveBeenCalled();
  expect(mockSyncNow).not.toHaveBeenCalled();
});

it('stops on a writer failure that may follow an insert and does not claim completion', async () => {
  mockWriteLocalMemoryFact.mockRejectedValue(new Error('Supersession failed after insert'));
  await expect(
    useMemoryStore
      .getState()
      .bulkInsert(['First memory', 'Second memory'], 'Other', operation('local')),
  ).rejects.toThrow(MEMORY_IMPORT_UNCERTAIN_MESSAGE);
  expect(mockWriteLocalMemoryFact).toHaveBeenCalledTimes(1);
  expect(mockPost).not.toHaveBeenCalled();
});

it('does not start Local writes after a scope change during the initial read', async () => {
  let resolve!: (value: unknown[]) => void;
  mockListMemoryFacts.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const pending = useMemoryStore.getState().bulkInsert(['Local fact'], 'Other', operation('local'));
  const rejected = expect(pending).rejects.toThrow();
  mockMode = 'cloud';
  resolve([]);
  await rejected;
  expect(mockWriteLocalMemoryFact).not.toHaveBeenCalled();
  expect(mockPost).not.toHaveBeenCalled();
});

it('does not continue a canceled Local commit after an in-flight write', async () => {
  let active = true;
  mockWriteLocalMemoryFact.mockImplementation(async () => {
    active = false;
    return { outcome: 'inserted', fact: { id: 'saved' }, replacedIds: [] };
  });
  const request = { ...operation('local'), isActive: () => active };
  await expect(
    useMemoryStore.getState().bulkInsert(['First fact', 'Second fact'], 'Other', request),
  ).rejects.toThrow(MEMORY_IMPORT_UNCERTAIN_MESSAGE);
  expect(mockWriteLocalMemoryFact).toHaveBeenCalledTimes(1);
});

it('passes the original Cloud epoch to the commit request', async () => {
  mockPost.mockResolvedValue({ mode: 'commit', insertedCount: 1 });
  const request = operation('cloud');
  await expect(
    useMemoryStore.getState().bulkInsert(['Cloud fact'], 'Claude', request),
  ).resolves.toEqual({ inserted: 1, skipped: 0 });
  expect(mockPost).toHaveBeenCalledWith(
    '/api/memory/import',
    {
      mode: 'commit',
      items: ['Cloud fact'],
      sourceName: 'Claude',
    },
    { accountEpoch: request.scope.scope === 'cloud' ? request.scope.account : undefined },
  );
  expect(mockWriteLocalMemoryFact).not.toHaveBeenCalled();
});

it('never starts a new-owner commit from an old preview', async () => {
  const request = operation('cloud');
  activateCloudAccount('account-b');
  await expect(
    useMemoryStore.getState().bulkInsert(['Cloud fact'], 'Other', request),
  ).rejects.toThrow();
  expect(mockPost).not.toHaveBeenCalled();
});

it('fences defensive multi-batch callers at the original account epoch', async () => {
  const request = operation('cloud');
  mockPost.mockImplementation(async () => {
    activateCloudAccount('account-b');
    return { mode: 'commit', insertedCount: MAX_IMPORT_ITEMS };
  });
  await expect(
    useMemoryStore.getState().bulkInsert(
      Array.from({ length: MAX_IMPORT_ITEMS + 1 }, (_, index) => `Fact ${index}`),
      'Other',
      request,
    ),
  ).rejects.toThrow();
  expect(mockPost).toHaveBeenCalledTimes(1);
  expect(mockSyncNow).not.toHaveBeenCalled();
});
