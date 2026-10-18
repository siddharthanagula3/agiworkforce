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

beforeEach(() => {
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
      'local',
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
      'local',
    );

    expect(preview.items.map((item) => item.content)).toEqual(['Works in Berlin', 'Uses Vim']);
  });

  it('refuses text over the shared size limit', async () => {
    mockListMemoryFacts.mockResolvedValue([]);

    await expect(
      previewMemoryImport('x'.repeat(MAX_IMPORT_TEXT_CHARS + 1), 'Other', 'local'),
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

    const preview = await previewMemoryImport('Likes dark mode', 'Claude', 'cloud');

    expect(mockPost).toHaveBeenCalledWith(MEMORY_IMPORT_PATH, {
      mode: 'dry-run',
      text: 'Likes dark mode',
      sourceName: 'Claude',
    });
    expect(mockListMemoryFacts).not.toHaveBeenCalled();
    expect(preview.items).toHaveLength(1);
  });
});
