/**
 * Attach-time validation for chat attachments (QA 1.3.53 / 2.3.45): reject files
 * the app cannot use — an unsupported type or an oversized file — with a specific
 * reason, up front, instead of silently accepting them and producing an empty
 * "content could not be extracted" stub at send time. Images (handled by
 * OCR / image_url) and any docParser-parseable document (pdf/txt/md/csv/code/
 * text) are accepted.
 */
import { isParseableDocument } from '@/services/docParser';

/** 25 MB — large enough for real documents/images, small enough to avoid reading
 *  a runaway file fully into memory (docParser base64-reads the whole file). */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export interface ValidatableAttachment {
  fileName: string;
  mimeType: string;
  uri: string;
  fileSize?: number;
  /** Pasted-text cards carry inline text and bypass file validation. */
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

export function isAcceptableAttachment(a: ValidatableAttachment): true | string {
  if (a.pastedText != null) return true;
  if (typeof a.fileSize === 'number' && a.fileSize > MAX_ATTACHMENT_BYTES) {
    const mb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
    return `“${a.fileName}” is too large (max ${mb} MB).`;
  }
  if (a.mimeType.startsWith('image/')) return true;
  if (isParseableDocument(a.uri, a.mimeType)) return true;
  return `“${a.fileName}” isn’t a supported file type. Try an image, PDF, text, CSV, Markdown, or code file.`;
}

export function validateAttachments<T extends ValidatableAttachment>(
  items: T[],
): AttachmentValidationResult<T> {
  const accepted: T[] = [];
  const rejected: AttachmentRejection[] = [];
  for (const item of items) {
    const verdict = isAcceptableAttachment(item);
    if (verdict === true) accepted.push(item);
    else rejected.push({ fileName: item.fileName, reason: verdict });
  }
  return { accepted, rejected };
}
