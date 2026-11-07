let mockMode: 'local' | 'cloud' = 'local';
jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: { getState: () => ({ appMode: mockMode }) },
}));
jest.mock('../lib/mmkv', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

const mockPost = jest.fn();
const mockListMemoryFacts = jest.fn();

jest.mock('../services/api', () => ({ api: { post: (...args: unknown[]) => mockPost(...args) } }));
jest.mock('../storage/memory', () => ({
  listMemoryFacts: (...args: unknown[]) => mockListMemoryFacts(...args),
}));

import {
  ImportTextTooLargeError,
  MAX_IMPORT_TEXT_CHARS,
  MEMORY_IMPORT_PATH,
  previewMemoryImport,
} from '../src/features/memory/services/memoryImport';

import { captureAccountScopedUiState } from '../src/features/auth/services/accountScopedUiState';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { MemoryImportOperation } from '../src/features/memory/services/memoryImportOperation';

function operation(mode: 'local' | 'cloud'): MemoryImportOperation {
  mockMode = mode;
  const scope = captureAccountScopedUiState(mode);
  if (!scope) throw new Error('Fixture requires an active account');
  return { scope, isActive: () => true };
}

beforeEach(() => {
  mockMode = 'local';
  __resetCloudAccountSessionForTests();
  activateCloudAccount('account-a');
  mockPost.mockReset();
  mockListMemoryFacts.mockReset();
});

describe('memory import preview, Local mode', () => {
  it('parses pasted lines on the device and marks what memory already holds', async () => {
    mockListMemoryFacts.mockResolvedValue([
      {
        id: 'f1',
        fact: 'Prefers Python',
        source_conversation_id: null,
        pinned: false,
        created_at: 1,
      },
    ]);

    const preview = await previewMemoryImport(
      '- Likes dark mode\n- Prefers Python\n\n',
      'ChatGPT',
      operation('local'),
    );

    expect(mockPost).not.toHaveBeenCalled();
    expect(preview.sourceName).toBe('ChatGPT');
    expect(preview.items.map((item) => [item.content, item.duplicate])).toEqual([
      ['Likes dark mode', false],
      ['Prefers Python', true],
    ]);
  });

  it('reads a JSON list of strings the same way the web does', async () => {
    mockListMemoryFacts.mockResolvedValue([]);

    const preview = await previewMemoryImport(
      '["Works in Berlin", {"text": "Uses Vim"}]',
      'Other',
      operation('local'),
    );

    expect(preview.items.map((item) => item.content)).toEqual(['Works in Berlin', 'Uses Vim']);
  });

  it('refuses text over the shared size limit', async () => {
    mockListMemoryFacts.mockResolvedValue([]);

    await expect(
      previewMemoryImport('x'.repeat(MAX_IMPORT_TEXT_CHARS + 1), 'Other', operation('local')),
    ).rejects.toBeInstanceOf(ImportTextTooLargeError);
  });
});

describe('memory import preview, Cloud mode', () => {
  it('asks the server for a dry-run preview and reads its items', async () => {
    mockPost.mockResolvedValue({
      mode: 'dry-run',
      sourceName: 'Claude',
      sourceValue: 'imported:claude',
      format: 'text',
      items: [{ content: 'Likes dark mode', normalizedKey: 'likes dark mode', duplicate: false }],
      totalCandidates: 1,
      itemsTruncated: false,
    });

    const request = operation('cloud');
    const preview = await previewMemoryImport('Likes dark mode', 'Claude', request);

    expect(mockPost).toHaveBeenCalledWith(MEMORY_IMPORT_PATH, {
      mode: 'dry-run',
      text: 'Likes dark mode',
      sourceName: 'Claude',
    }, { accountEpoch: request.scope.scope === 'cloud' ? request.scope.account : undefined });
    expect(mockListMemoryFacts).not.toHaveBeenCalled();
    expect(preview.items).toHaveLength(1);
  });
});


describe('memory import preview ownership', () => {
  it('does not send Local text after switching to Cloud', async () => {
    const request = operation('local');
    mockMode = 'cloud';
    await expect(previewMemoryImport('Private local draft', 'Other', request)).rejects.toThrow();
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockListMemoryFacts).not.toHaveBeenCalled();
  });

  it('does not send account-A text under account B', async () => {
    const request = operation('cloud');
    activateCloudAccount('account-b');
    await expect(previewMemoryImport('Private cloud draft', 'Other', request)).rejects.toThrow();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('rejects a late Local preview without using the network', async () => {
    let resolve!: (value: unknown[]) => void;
    mockListMemoryFacts.mockReturnValue(new Promise((done) => { resolve = done; }));
    let active = true;
    const request = { ...operation('local'), isActive: () => active };
    const pending = previewMemoryImport('Private local draft', 'Other', request);
    const rejected = expect(pending).rejects.toThrow();
    active = false;
    resolve([]);
    await rejected;
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('rejects a late Cloud preview after the owner changes', async () => {
    let resolve!: (value: unknown) => void;
    mockPost.mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = previewMemoryImport('Private cloud draft', 'Other', operation('cloud'));
    const rejected = expect(pending).rejects.toThrow();
    activateCloudAccount('account-b');
    resolve({ mode: 'dry-run', items: [] });
    await rejected;
  });
});
