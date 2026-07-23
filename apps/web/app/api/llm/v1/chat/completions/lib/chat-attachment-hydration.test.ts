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
