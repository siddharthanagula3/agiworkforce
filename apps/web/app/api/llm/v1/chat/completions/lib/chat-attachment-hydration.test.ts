import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatAttachmentHydrationError, hydrateChatAttachments } from './chat-attachment-hydration';

const mocks = vi.hoisted(() => ({
  getMediaAssetById: vi.fn(),
  getObject: vi.fn(),
}));

vi.mock('@/lib/server/media-assets', () => ({ getMediaAssetById: mocks.getMediaAssetById }));
vi.mock('@/lib/server/object-storage', () => ({ getObject: mocks.getObject }));

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
    mocks.getObject.mockResolvedValue({
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

  // PER-27: deleting one Library file used to 404 every subsequent turn in the
  // conversation that referenced it, forever, with no in-product recovery.
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

    expect(messages[0]?.content[1]).toEqual({
      type: 'text',
      text: '[attachment unavailable \u2014 it was deleted from your Library]',
    });
    expect(messages[0]?.content[0]).toEqual({ type: 'text', text: 'Summarize this' });
    expect(mocks.getObject).not.toHaveBeenCalled();
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
      { type: 'text', text: '[attachment unavailable \u2014 it was deleted from your Library]' },
    ]);
    expect(mocks.getObject).not.toHaveBeenCalled();
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
    expect(mocks.getObject).not.toHaveBeenCalled();
  });
});
