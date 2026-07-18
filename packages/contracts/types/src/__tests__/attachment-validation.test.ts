import { describe, expect, it } from 'vitest';
import { isTextAttachmentMeta, validateAttachmentMeta, TEXT_ATTACHMENT_EXTENSIONS } from '../chat';

describe('attachment text classification', () => {
  it('reuses the accepted text-extension roster for generic browser MIME types', () => {
    expect(TEXT_ATTACHMENT_EXTENSIONS).toContain('md');
    expect(validateAttachmentMeta('notes.md', 'application/octet-stream', 10)).toEqual({
      ok: true,
    });
    expect(isTextAttachmentMeta('notes.md', 'application/octet-stream')).toBe(true);
  });

  it('does not decode known binary attachments based on a misleading extension', () => {
    expect(isTextAttachmentMeta('photo.txt', 'image/jpeg')).toBe(false);
    expect(isTextAttachmentMeta('document.txt', 'application/pdf')).toBe(false);
  });
});
