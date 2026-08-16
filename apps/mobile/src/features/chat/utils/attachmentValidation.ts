import { MAX_CHAT_ATTACHMENT_BYTES } from '@agiworkforce/cloud-contracts';
import { isParseableDocument } from '@/services/docParser';

export type AttachmentDestination = 'local' | 'cloud';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const MAX_CLOUD_ATTACHMENT_BYTES = MAX_CHAT_ATTACHMENT_BYTES;

export function maxAttachmentBytesFor(destination: AttachmentDestination): number {
  return destination === 'cloud'
    ? Math.min(MAX_ATTACHMENT_BYTES, MAX_CLOUD_ATTACHMENT_BYTES)
    : MAX_ATTACHMENT_BYTES;
}

export interface ValidatableAttachment {
  fileName: string;
  mimeType: string;
  uri: string;
  fileSize?: number;
  pastedText?: string;
}

export interface AttachmentRejection {
  fileName: string;
  reason: string;
}

export interface AttachmentValidationResult<T> {
  accepted: T[];
  rejected: AttachmentRejection[];
}

/**
 * @param destination where the send will put this file — pass the live
 * `appMode`. Defaults to the stricter `'cloud'` ceiling so that a caller which
 * has not resolved its destination is never the reason an unsendable file gets
 * staged. The production caller (ChatInput) always passes it.
 */
export function isAcceptableAttachment(
  a: ValidatableAttachment,
  destination: AttachmentDestination = 'cloud',
): true | string {
  if (a.pastedText != null) return true;
  const maxBytes = maxAttachmentBytesFor(destination);
  if (typeof a.fileSize === 'number' && a.fileSize > maxBytes) {
    const mb = Math.floor(maxBytes / (1024 * 1024));
    return destination === 'cloud'
      ? `“${a.fileName}” is too large to send to AGI Cloud (max ${mb} MB). Switch to Local Mode to use it on this device, or attach a smaller file.`
      : `“${a.fileName}” is too large (max ${mb} MB).`;
  }
  if (a.mimeType.startsWith('image/')) return true;
  if (isParseableDocument(a.uri, a.mimeType)) return true;
  return `“${a.fileName}” isn’t a supported file type. Try an image, PDF, text, CSV, Markdown, or code file.`;
}

export function validateAttachments<T extends ValidatableAttachment>(
  items: T[],
  destination: AttachmentDestination = 'cloud',
): AttachmentValidationResult<T> {
  const accepted: T[] = [];
  const rejected: AttachmentRejection[] = [];
  for (const item of items) {
    const verdict = isAcceptableAttachment(item, destination);
    if (verdict === true) accepted.push(item);
    else rejected.push({ fileName: item.fileName, reason: verdict });
  }
  return { accepted, rejected };
}
