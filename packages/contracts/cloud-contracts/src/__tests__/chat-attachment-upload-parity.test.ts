import { describe, expect, it } from 'vitest';
import { validateAttachmentMeta } from '@agiworkforce/types';
import {
  CHAT_ATTACHMENT_MIME_TYPES,
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
