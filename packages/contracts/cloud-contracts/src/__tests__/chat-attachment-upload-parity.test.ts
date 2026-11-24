import { describe, expect, it } from 'vitest';
import { validateAttachmentMeta } from '@agiworkforce/types';
import {
  CHAT_ATTACHMENT_MIME_TYPES,
  chatAttachmentAcceptAttribute,
  isSupportedChatAttachment,
  resolveChatAttachmentMimeType,
} from '../chat-attachments';
import chatAttachmentPolicy from '../chat-attachment-policy.json' with { type: 'json' };

const BROWSER_TYPES_FOR_UNKNOWN_FILES = ['', 'application/octet-stream'];

describe('chat attachment types against the upload check', () => {
  it.each([...CHAT_ATTACHMENT_MIME_TYPES])(
    'uploads a file the composer admits as %s',
    (mimeType) => {
      expect(isSupportedChatAttachment('attachment', mimeType)).toBe(true);
      expect(validateAttachmentMeta('attachment', mimeType, 1024)).toEqual({ ok: true });
    },
  );

  it.each([
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.png', 'image/png'],
    ['.gif', 'image/gif'],
    ['.webp', 'image/webp'],
    ['.pdf', 'application/pdf'],
  ])(
    'lists %s in the picker and resolves empty and generic browser types for upload',
    (extension, mime) => {
      const fileName = `attachment${extension.toUpperCase()}`;
      expect(chatAttachmentAcceptAttribute().split(',')).toContain(extension);
      for (const browserType of BROWSER_TYPES_FOR_UNKNOWN_FILES) {
        expect(resolveChatAttachmentMimeType(fileName, browserType)).toBe(mime);
      }
      expect(validateAttachmentMeta(fileName, mime, 1024)).toEqual({ ok: true });
    },
  );

  it('does not turn explicit unsupported types into a supported image', () => {
    expect(resolveChatAttachmentMimeType('attachment.jpg', 'application/x-msdownload')).toBeNull();
    expect(resolveChatAttachmentMimeType('attachment.svg', 'application/octet-stream')).toBeNull();
  });

  describe.each(chatAttachmentPolicy.extensions)('a %s file', (extension) => {
    const fileName = `attachment${extension}`;

    it.each(BROWSER_TYPES_FOR_UNKNOWN_FILES)(
      'uploads when the browser reports %j',
      (browserType) => {
        expect(isSupportedChatAttachment(fileName, browserType)).toBe(true);
        const resolvedType = resolveChatAttachmentMimeType(fileName, browserType);
        expect(resolvedType).not.toBeNull();
        expect(validateAttachmentMeta(fileName, resolvedType ?? '', 1024)).toEqual({ ok: true });
      },
    );
  });
});
