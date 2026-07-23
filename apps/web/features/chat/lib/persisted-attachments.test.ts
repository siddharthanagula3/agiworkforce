import { describe, expect, it } from 'vitest';
import { buildApiMessageContent, readPersistedAttachments } from './persisted-attachments';

describe('persisted chat attachments', () => {
  it('restores safe descriptors and sends only an owner-scoped asset reference', () => {
    const assetId = '32b71cf4-c0d1-4cc7-b6c4-776ece82f137';
    const attachments = readPersistedAttachments([
      {
        id: assetId,
        assetId,
        type: 'file',
        name: 'notes.txt',
        mimeType: 'text/plain',
        size: 5,
        url: `/api/files/${assetId}`,
        content: 'must-not-survive',
      },
    ]);

    expect(attachments).toEqual([expect.not.objectContaining({ content: expect.anything() })]);
    expect(
      buildApiMessageContent({
        id: 'message-1',
        role: 'user',
        content: 'Read this',
        createdAt: '2026-07-22T00:00:00.000Z',
        attachments,
      }),
    ).toEqual([
      { type: 'text', text: 'Read this' },
      { type: 'file', file: { asset_id: assetId } },
    ]);
  });
});
