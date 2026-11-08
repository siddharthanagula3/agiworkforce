import { describe, expect, it } from 'vitest';
import { durableAttachmentDescriptors, readPersistedAttachments } from '../chat-attachments';

describe('durable chat attachment metadata', () => {
  const assetId = '77777777-7777-4777-8777-777777777777';
  it('keeps identity and display metadata without copying bytes', () => {
    const input = {
      id: assetId,
      assetId,
      type: 'file' as const,
      name: 'handoff.txt',
      mimeType: 'text/plain',
      content: 'DO_NOT_STORE_FILE_BYTES',
    };
    const saved = durableAttachmentDescriptors([input]);
    expect(saved).toEqual([
      expect.objectContaining({ id: assetId, assetId, type: 'file', name: 'handoff.txt' }),
    ]);
    expect(JSON.stringify(saved)).not.toContain('DO_NOT_STORE_FILE_BYTES');
    expect(readPersistedAttachments(saved)).toEqual(saved);
  });
  it('does not invent a durable reference for an inline image', () => {
    expect(
      durableAttachmentDescriptors([{ id: 'inline-1', type: 'image', name: 'image.png' }]),
    ).toBeUndefined();
  });
  it('ignores malformed metadata and unknown kinds', () => {
    expect(
      readPersistedAttachments([
        null,
        'file',
        { id: assetId, type: 'file', name: 'missing-asset.txt' },
        { id: assetId, assetId, type: 'unknown', name: 'unknown.txt' },
      ]),
    ).toBeUndefined();
    expect(readPersistedAttachments({ assetId })).toBeUndefined();
  });
});
