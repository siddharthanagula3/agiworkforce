import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatAttachmentHydrationError, hydrateChatAttachments } from './chat-attachment-hydration';

const mocks = vi.hoisted(() => ({
  getMediaAssetById: vi.fn(),
  readStoredMedia: vi.fn(),
}));

vi.mock('@/lib/server/media-assets', () => ({ getMediaAssetById: mocks.getMediaAssetById }));
vi.mock('@/lib/server/media-storage', () => ({ readStoredMedia: mocks.readStoredMedia }));

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
      text: '[attachment unavailable \u2014 brief.pdf could not be read: it was deleted from your Library]',
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
        text: '[attachment unavailable \u2014 attachment-32b71cf4-c0d1-4cc7-b6c4-776ece82f137 could not be read: it was deleted from your Library]',
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

    const part = messages[0]?.content[0] as unknown as {
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

  it('keeps the turn alive when one file\u2019s stored bytes are gone', async () => {
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

    const parts = messages[0]!.content as Array<{
      type: string;
      text?: string;
      file?: { filename?: string; file_data?: string };
    }>;
    expect(parts[0]).toEqual({ type: 'text', text: 'Compare these' });
    expect(parts[1]?.file?.filename).toBe('readable.txt');
    expect(Buffer.from(parts[1]!.file!.file_data!.split(',')[1]!, 'base64').toString()).toBe(
      'usable contents',
    );
    expect(parts[2]?.text).toBe(
      '[attachment unavailable \u2014 missing-bytes.txt could not be read: it is registered but its stored bytes are missing]',
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

    expect((messages[0]!.content as Array<{ text?: string }>)[0]?.text).toBe(
      '[attachment unavailable \u2014 truncated.txt could not be read: it failed its storage integrity check]',
    );
  });
});
