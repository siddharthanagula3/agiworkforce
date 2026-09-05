import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatAttachmentHydrationError,
  hydrateChatAttachments,
  MAX_PARALLEL_ATTACHMENT_FETCHES,
} from './chat-attachment-hydration';

const mocks = vi.hoisted(() => ({
  getMediaAssetById: vi.fn(),
  readStoredMedia: vi.fn(),
  deleteStoredMedia: vi.fn(),
}));

vi.mock('@/lib/server/media-assets', () => ({ getMediaAssetById: mocks.getMediaAssetById }));
vi.mock('@/lib/server/media-storage', () => ({
  readStoredMedia: mocks.readStoredMedia,
  deleteStoredMedia: mocks.deleteStoredMedia,
}));

type TestPart = {
  type: string;
  text?: string;
  file?: { asset_id?: string; filename?: string; file_data?: string };
};

function partsOf(message: { content: string | TestPart[] } | undefined): TestPart[] {
  return message?.content as TestPart[];
}

describe('hydrateChatAttachments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads an owned PDF and replaces the opaque reference with provider wire content', async () => {
    const assetId = '32b71cf4-c0d1-4cc7-b6c4-776ece82f137';
    mocks.getMediaAssetById.mockResolvedValue({
      id: assetId,
      userId: 'user-1',
      kind: 'file',
      mimeType: 'application/pdf',
      byteSize: 4,
      storageUrl: 'https://files.example.test/key',
      storagePathname: 'chat-attachments/user-1/key.pdf',
      metadata: { filename: 'brief.pdf' },
      deletedAt: null,
    });
    mocks.readStoredMedia.mockResolvedValue({
      data: Buffer.from('%PDF'),
      contentType: 'application/pdf',
    });
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Summarize this' },
          { type: 'file', file: { asset_id: assetId } },
        ],
      },
    ];

    await hydrateChatAttachments(messages, 'user-1');

    expect(messages[0]?.content[1]).toEqual({
      type: 'text',
      text: '[attached file: brief.pdf (application/pdf)]',
    });
    expect(messages[0]?.content[2]).toEqual({
      type: 'file',
      file: {
        filename: 'brief.pdf',
        mime_type: 'application/pdf',
        file_data: `data:application/pdf;base64,${Buffer.from('%PDF').toString('base64')}`,
      },
    });
  });

  it('degrades a soft-deleted owned attachment to a placeholder instead of failing the turn', async () => {
    const assetId = '32b71cf4-c0d1-4cc7-b6c4-776ece82f137';
    mocks.getMediaAssetById.mockResolvedValue({
      id: assetId,
      userId: 'user-1',
      kind: 'file',
      mimeType: 'application/pdf',
      storagePathname: 'chat-attachments/user-1/key.pdf',
      metadata: { filename: 'brief.pdf' },
      deletedAt: '2026-07-20T00:00:00.000Z',
    });
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Summarize this' },
          { type: 'file', file: { asset_id: assetId } },
        ],
      },
    ];

    await expect(hydrateChatAttachments(messages, 'user-1')).resolves.toBeUndefined();

    // Named, because a turn can carry several files and the reader has to know
    // which one to re-attach.
    expect(messages[0]?.content[1]).toEqual({
      type: 'text',
      text: '[attachment unavailable: brief.pdf was removed from your Library. Attach it again to include it.]',
    });
    expect(messages[0]?.content[0]).toEqual({ type: 'text', text: 'Summarize this' });
    expect(mocks.readStoredMedia).not.toHaveBeenCalled();
  });

  it('degrades an attachment whose asset row no longer exists', async () => {
    mocks.getMediaAssetById.mockResolvedValue(null);
    const messages = [
      {
        role: 'user',
        content: [{ type: 'file', file: { asset_id: '32b71cf4-c0d1-4cc7-b6c4-776ece82f137' } }],
      },
    ];

    await hydrateChatAttachments(messages, 'user-1');

    expect(messages[0]?.content).toEqual([
      {
        type: 'text',
        text: '[attachment unavailable: attachment-32b71cf4-c0d1-4cc7-b6c4-776ece82f137 was removed from your Library. Attach it again to include it.]',
      },
    ]);
    expect(mocks.readStoredMedia).not.toHaveBeenCalled();
  });

  it('extracts a notebook to text so base64 output images never reach the model', async () => {
    const assetId = '32b71cf4-c0d1-4cc7-b6c4-776ece82f137';
    const imageBlob = 'A'.repeat(2048);
    const notebook = Buffer.from(
      JSON.stringify({
        cells: [
          { cell_type: 'markdown', source: ['# Revenue\n', 'Quarterly rollup.'] },
          {
            cell_type: 'code',
            source: 'df.plot()\n',
            outputs: [
              { output_type: 'stream', text: ['rows: 12\n'] },
              {
                output_type: 'display_data',
                data: { 'image/png': imageBlob, 'text/plain': '<Figure size 640x480>' },
              },
              { output_type: 'error', ename: 'ValueError', evalue: 'bad axis' },
            ],
          },
        ],
      }),
      'utf8',
    );
    mocks.getMediaAssetById.mockResolvedValue({
      id: assetId,
      userId: 'user-1',
      kind: 'file',
      mimeType: 'application/x-ipynb+json',
      byteSize: notebook.byteLength,
      storageUrl: 'https://files.example.test/key',
      storagePathname: 'chat-attachments/user-1/key.ipynb',
      metadata: { filename: 'revenue.ipynb' },
      deletedAt: null,
    });
    mocks.readStoredMedia.mockResolvedValue({
      data: notebook,
      contentType: 'application/x-ipynb+json',
    });
    const messages = [
      {
        role: 'user',
        content: [{ type: 'file', file: { asset_id: assetId } }],
      },
    ];

    await hydrateChatAttachments(messages, 'user-1');

    expect(messages[0]?.content[0]).toEqual({
      type: 'text',
      text: '[attached file: revenue.ipynb (application/x-ipynb+json)]',
    });
    const part = messages[0]?.content[1] as unknown as {
      type: string;
      file: { filename: string; mime_type: string; file_data: string };
    };
    expect(part.type).toBe('file');
    expect(part.file.mime_type).toBe('text/plain');
    const wireText = Buffer.from(part.file.file_data.split(',')[1] ?? '', 'base64').toString(
      'utf8',
    );
    expect(wireText).not.toContain(imageBlob);
    expect(wireText).toContain('# Revenue');
    expect(wireText).toContain('```\ndf.plot()\n```');
    expect(wireText).toContain('Output:\nrows: 12');
    expect(wireText).toContain('Output:\n<Figure size 640x480>');
    expect(wireText).toContain('Error: ValueError: bad axis');
    expect(part.file.file_data.length).toBeLessThan(notebook.byteLength);
  });

  it('rejects an attachment that claims to be a notebook but is not readable', async () => {
    const assetId = '32b71cf4-c0d1-4cc7-b6c4-776ece82f137';
    const bytes = Buffer.from('not a notebook', 'utf8');
    mocks.getMediaAssetById.mockResolvedValue({
      id: assetId,
      userId: 'user-1',
      kind: 'file',
      mimeType: 'application/x-ipynb+json',
      byteSize: bytes.byteLength,
      storageUrl: 'https://files.example.test/key',
      storagePathname: 'chat-attachments/user-1/key.ipynb',
      metadata: { filename: 'broken.ipynb' },
      deletedAt: null,
    });
    mocks.readStoredMedia.mockResolvedValue({
      data: bytes,
      contentType: 'application/x-ipynb+json',
    });
    const messages = [{ role: 'user', content: [{ type: 'file', file: { asset_id: assetId } }] }];

    await expect(hydrateChatAttachments(messages, 'user-1')).rejects.toEqual(
      expect.objectContaining<Partial<ChatAttachmentHydrationError>>({
        status: 400,
        code: 'unreadable_attachment',
      }),
    );
  });

  it('fails closed before reading storage for an asset owned by another user', async () => {
    mocks.getMediaAssetById.mockResolvedValue({
      id: '32b71cf4-c0d1-4cc7-b6c4-776ece82f137',
      userId: 'other-user',
      deletedAt: null,
      storagePathname: 'chat-attachments/other-user/key.pdf',
    });
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            file: { asset_id: '32b71cf4-c0d1-4cc7-b6c4-776ece82f137' },
          },
        ],
      },
    ];

    await expect(hydrateChatAttachments(messages, 'user-1')).rejects.toEqual(
      expect.objectContaining<Partial<ChatAttachmentHydrationError>>({
        status: 404,
        code: 'attachment_not_found',
      }),
    );
    expect(mocks.readStoredMedia).not.toHaveBeenCalled();
  });

  it('keeps the turn alive when one file’s stored bytes are gone', async () => {
    // The audit lost an entire four-file turn to a single unreadable file: the
    // question, the three files that were fine, and any answer at all.
    const goodId = '11111111-1111-4111-8111-111111111111';
    const badId = '22222222-2222-4222-8222-222222222222';
    mocks.getMediaAssetById.mockImplementation(async (id: string) => ({
      id,
      userId: 'user-1',
      kind: 'file',
      mimeType: 'text/plain',
      storagePathname: `chat-attachments/user-1/${id}.txt`,
      metadata: { filename: id === goodId ? 'readable.txt' : 'missing-bytes.txt' },
      deletedAt: null,
    }));
    mocks.readStoredMedia.mockImplementation(async (path: string) =>
      path.includes(goodId) ? { data: Buffer.from('usable contents') } : null,
    );

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Compare these' },
          { type: 'file', file: { asset_id: goodId } },
          { type: 'file', file: { asset_id: badId } },
        ],
      },
    ];

    await expect(hydrateChatAttachments(messages, 'user-1')).resolves.toBeUndefined();

    const parts = partsOf(messages[0]);
    expect(parts[0]).toEqual({ type: 'text', text: 'Compare these' });
    expect(parts[1]).toEqual({ type: 'text', text: '[attached file: readable.txt (text/plain)]' });
    expect(parts[2]?.file?.filename).toBe('readable.txt');
    expect(Buffer.from(parts[2]!.file!.file_data!.split(',')[1]!, 'base64').toString()).toBe(
      'usable contents',
    );
    expect(parts[3]?.text).toBe(
      '[attachment unavailable: missing-bytes.txt could not be loaded. Attach it again to include it.]',
    );
  });

  it('names a file that fails its integrity check rather than failing the turn', async () => {
    const assetId = '33333333-3333-4333-8333-333333333333';
    mocks.getMediaAssetById.mockResolvedValue({
      id: assetId,
      userId: 'user-1',
      kind: 'file',
      mimeType: 'text/plain',
      storagePathname: 'chat-attachments/user-1/truncated.txt',
      metadata: { filename: 'truncated.txt' },
      deletedAt: null,
      byteSize: 4096,
    });
    mocks.readStoredMedia.mockResolvedValue({ data: Buffer.from('short') });

    const messages = [{ role: 'user', content: [{ type: 'file', file: { asset_id: assetId } }] }];

    await expect(hydrateChatAttachments(messages, 'user-1')).resolves.toBeUndefined();

    expect(partsOf(messages[0])[0]?.text).toBe(
      '[attachment unavailable: truncated.txt could not be loaded. Attach it again to include it.]',
    );
  });

  describe('a rotted attachment in history', () => {
    const rottedId = '44444444-4444-4444-8444-444444444444';

    function conversationWithRottedHistory() {
      return [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in these?' },
            { type: 'file', file: { asset_id: rottedId } },
          ],
        },
        { role: 'assistant', content: 'Two screenshots of a stack trace.' },
        {
          role: 'user',
          content: [{ type: 'text', text: 'What could cause this to happen again?' }],
        },
      ];
    }

    beforeEach(() => {
      mocks.getMediaAssetById.mockResolvedValue({
        id: rottedId,
        userId: 'user-1',
        kind: 'image',
        mimeType: 'image/png',
        storagePathname: `chat-attachments/user-1/${rottedId}.png`,
        metadata: { filename: 'IMG_2215.PNG' },
        deletedAt: null,
      });
      mocks.readStoredMedia.mockResolvedValue(null);
    });

    it('lets a later plain-text turn proceed instead of bricking the conversation', async () => {
      const messages = conversationWithRottedHistory();

      await expect(hydrateChatAttachments(messages, 'user-1')).resolves.toBeUndefined();

      expect(partsOf(messages[2])).toEqual([
        { type: 'text', text: 'What could cause this to happen again?' },
      ]);
    });

    it('substitutes a note the model can answer around, naming the file', async () => {
      const messages = conversationWithRottedHistory();

      await hydrateChatAttachments(messages, 'user-1');

      const historyParts = partsOf(messages[0]);
      expect(historyParts[0]).toEqual({ type: 'text', text: 'What is in these?' });
      expect(historyParts[1]).toEqual({
        type: 'text',
        text: '[attachment unavailable: IMG_2215.PNG could not be loaded. Attach it again to include it.]',
      });
    });

    it('says nothing a reader could not act on', async () => {
      const messages = conversationWithRottedHistory();

      await hydrateChatAttachments(messages, 'user-1');

      const note = partsOf(messages[0])[1]?.text ?? '';
      expect(note).toContain('IMG_2215.PNG');
      for (const operatorPhrase of [
        'registered',
        'stored bytes',
        'integrity check',
        'storage',
        'pathname',
        'asset',
      ]) {
        expect(note.toLowerCase()).not.toContain(operatorPhrase);
      }
    });
  });

  it('still fails the turn when the file the reader just attached is unsupported', async () => {
    const assetId = '55555555-5555-4555-8555-555555555555';
    mocks.getMediaAssetById.mockResolvedValue({
      id: assetId,
      userId: 'user-1',
      kind: 'file',
      mimeType: 'application/vnd.ms-excel',
      storagePathname: 'chat-attachments/user-1/sheet.xls',
      metadata: { filename: 'sheet.xls' },
      deletedAt: null,
    });
    const messages = [
      { role: 'user', content: [{ type: 'text', text: 'Older question' }] },
      { role: 'assistant', content: 'Older answer' },
      { role: 'user', content: [{ type: 'file', file: { asset_id: assetId } }] },
    ];

    await expect(hydrateChatAttachments(messages, 'user-1')).rejects.toEqual(
      expect.objectContaining<Partial<ChatAttachmentHydrationError>>({
        status: 400,
        code: 'unsupported_attachment',
      }),
    );
  });

  it('drops the same unsupported file from history without failing the turn', async () => {
    const assetId = '55555555-5555-4555-8555-555555555555';
    mocks.getMediaAssetById.mockResolvedValue({
      id: assetId,
      userId: 'user-1',
      kind: 'file',
      mimeType: 'application/vnd.ms-excel',
      storagePathname: 'chat-attachments/user-1/sheet.xls',
      metadata: { filename: 'sheet.xls' },
      deletedAt: null,
    });
    const messages = [
      { role: 'user', content: [{ type: 'file', file: { asset_id: assetId } }] },
      { role: 'assistant', content: 'Older answer' },
      { role: 'user', content: [{ type: 'text', text: 'Follow-up' }] },
    ];

    await expect(hydrateChatAttachments(messages, 'user-1')).resolves.toBeUndefined();

    expect(partsOf(messages[0])[0]?.text).toBe(
      '[attachment unavailable: sheet.xls is not a file type this chat can read.]',
    );
  });

  it('spends the attachment budget on the turn being sent before spending it on history', async () => {
    // Charging in message order let a long conversation starve the file the
    // reader had just attached, and blamed that file for being too large.
    const historicalId = '66666666-6666-4666-8666-666666666666';
    const attachedNowId = '77777777-7777-4777-8777-777777777777';
    mocks.getMediaAssetById.mockImplementation(async (id: string) => ({
      id,
      userId: 'user-1',
      kind: 'file',
      mimeType: 'text/plain',
      storagePathname: `chat-attachments/user-1/${id}.txt`,
      metadata: { filename: id === historicalId ? 'old-dump.txt' : 'new-notes.txt' },
      deletedAt: null,
    }));
    mocks.readStoredMedia.mockImplementation(async () => ({
      data: Buffer.alloc(10 * 1024 * 1024),
    }));

    const messages = [
      { role: 'user', content: [{ type: 'file', file: { asset_id: historicalId } }] },
      { role: 'assistant', content: 'Read it.' },
      { role: 'user', content: [{ type: 'file', file: { asset_id: attachedNowId } }] },
    ];

    await expect(hydrateChatAttachments(messages, 'user-1')).resolves.toBeUndefined();

    expect(partsOf(messages[2])[1]?.file?.filename).toBe('new-notes.txt');
    expect(partsOf(messages[0])[0]?.text).toBe(
      '[attachment unavailable: old-dump.txt was left out because this conversation has reached its attachment limit.]',
    );
  });

  it('gives every attachment type the same filename-and-type header, so a CSV is named as reliably as a TXT', async () => {
    const txtId = '88888888-8888-4888-8888-888888888888';
    const csvId = '99999999-9999-4999-9999-999999999999';
    mocks.getMediaAssetById.mockImplementation(async (id: string) => ({
      id,
      userId: 'user-1',
      kind: 'file',
      mimeType: id === txtId ? 'text/plain' : 'text/csv',
      storagePathname: `chat-attachments/user-1/${id}`,
      metadata: { filename: id === txtId ? 'notes.txt' : 'report.csv' },
      deletedAt: null,
    }));
    mocks.readStoredMedia.mockResolvedValue({ data: Buffer.from('contents') });

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'name both files' },
          { type: 'file', file: { asset_id: txtId } },
          { type: 'file', file: { asset_id: csvId } },
        ],
      },
    ];

    await hydrateChatAttachments(messages, 'user-1');

    const parts = partsOf(messages[0]);
    expect(parts[1]).toEqual({ type: 'text', text: '[attached file: notes.txt (text/plain)]' });
    expect(parts[2]?.file?.filename).toBe('notes.txt');
    expect(parts[3]).toEqual({ type: 'text', text: '[attached file: report.csv (text/csv)]' });
    expect(parts[4]?.file?.filename).toBe('report.csv');
  });

  it('drops the overflowing history file when a conversation passes the attachment count cap', async () => {
    mocks.getMediaAssetById.mockImplementation(async (id: string) => ({
      id,
      userId: 'user-1',
      kind: 'file',
      mimeType: 'text/plain',
      storagePathname: `chat-attachments/user-1/${id}.txt`,
      metadata: { filename: `file-${id}.txt` },
      deletedAt: null,
    }));
    mocks.readStoredMedia.mockResolvedValue({ data: Buffer.from('x') });

    const history = Array.from({ length: 20 }, (_, index) => ({
      role: 'user',
      content: [{ type: 'file', file: { asset_id: `history-${index}` } }],
    }));
    const messages = [
      ...history,
      { role: 'assistant', content: 'Noted.' },
      { role: 'user', content: [{ type: 'file', file: { asset_id: 'attached-now' } }] },
    ];

    await expect(hydrateChatAttachments(messages, 'user-1')).resolves.toBeUndefined();

    expect(partsOf(messages[21])[1]?.file?.filename).toBe('file-attached-now.txt');
    // No filename here: the cap is reached before the asset row is read, and a
    // fabricated name would read like a real one.
    expect(partsOf(messages[19])[0]?.text).toBe(
      '[an earlier attachment was left out because this conversation has reached its attachment limit]',
    );
  });

  it('overlaps the DB and storage round trips across attachment slots instead of serializing them', async () => {
    const slotCount = MAX_PARALLEL_ATTACHMENT_FETCHES + 2;
    const ids = Array.from({ length: slotCount }, (_, index) => `slot-${index}`);
    const fetchDelayMs = 20;
    const callOrder: string[] = [];
    let inFlight = 0;
    let peakInFlight = 0;

    mocks.getMediaAssetById.mockImplementation(async (id: string) => {
      callOrder.push(`lookup-start:${id}`);
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, fetchDelayMs));
      inFlight -= 1;
      callOrder.push(`lookup-end:${id}`);
      return {
        id,
        userId: 'user-1',
        kind: 'file',
        mimeType: 'text/plain',
        storagePathname: `chat-attachments/user-1/${id}.txt`,
        metadata: { filename: `${id}.txt` },
        deletedAt: null,
      };
    });
    mocks.readStoredMedia.mockResolvedValue({ data: Buffer.from('x') });

    const messages = [
      {
        role: 'user',
        content: ids.map((id) => ({ type: 'file', file: { asset_id: id } })),
      },
    ];

    const startedAt = Date.now();
    await hydrateChatAttachments(messages, 'user-1');
    const elapsedMs = Date.now() - startedAt;

    expect(peakInFlight).toBeGreaterThan(1);
    expect(peakInFlight).toBeLessThanOrEqual(MAX_PARALLEL_ATTACHMENT_FETCHES);
    expect(elapsedMs).toBeLessThan(fetchDelayMs * ids.length);
    expect(callOrder[0]).toBe('lookup-start:slot-0');
    expect(callOrder.filter((entry) => entry.startsWith('lookup-start')).length).toBe(slotCount);
  });

  it('produces the same result for a single attachment whether or not other slots are being fetched concurrently', async () => {
    const assetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    mocks.getMediaAssetById.mockResolvedValue({
      id: assetId,
      userId: 'user-1',
      kind: 'file',
      mimeType: 'text/csv',
      byteSize: 7,
      storagePathname: `chat-attachments/user-1/${assetId}.csv`,
      metadata: { filename: 'report.csv' },
      deletedAt: null,
    });
    mocks.readStoredMedia.mockResolvedValue({ data: Buffer.from('a,b,c\n1') });
    const messages = [{ role: 'user', content: [{ type: 'file', file: { asset_id: assetId } }] }];

    await hydrateChatAttachments(messages, 'user-1');

    expect(partsOf(messages[0])).toEqual([
      { type: 'text', text: '[attached file: report.csv (text/csv)]' },
      {
        type: 'file',
        file: {
          filename: 'report.csv',
          mime_type: 'text/plain',
          file_data: `data:text/plain;base64,${Buffer.from('a,b,c\n1').toString('base64')}`,
        },
      },
    ]);
  });
});
