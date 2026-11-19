import { resolveGeneratedImageUri } from '@/src/features/image/services/imagegen';
import { formatAttachmentSize } from '@/src/features/chat/utils/attachmentSize';
import type { MessageAttachment, MessageSharedAttachment } from '@/types/chat';
import type { FileViewerSource } from '@/src/features/chat/components/artifact-viewers/viewerKind';

const LOCAL_FILE_URI = /^(file|content):/i;
const ABSOLUTE_HTTP_URL = /^https:\/\//i;
const SPREADSHEET_EXTENSIONS = new Set(['csv', 'tsv', 'xls', 'xlsx', 'numbers']);
const PRESENTATION_EXTENSIONS = new Set(['ppt', 'pptx', 'key']);
const TYPE_WORDS: Readonly<Record<string, string>> = {
  doc: 'Word',
  docx: 'Word',
  xls: 'Excel',
  xlsx: 'Excel',
  ppt: 'PowerPoint',
  pptx: 'PowerPoint',
  txt: 'Text',
  md: 'Markdown',
};

export type SentAttachmentKind = 'spreadsheet' | 'presentation' | 'document';

export type SentAttachmentSource = { kind: 'local'; uri: string } | { kind: 'remote'; url: string };

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

export function sentAttachmentKind(
  attachment: Pick<MessageAttachment, 'fileName'>,
): SentAttachmentKind {
  const extension = extensionOf(attachment.fileName);
  if (SPREADSHEET_EXTENSIONS.has(extension)) return 'spreadsheet';
  if (PRESENTATION_EXTENSIONS.has(extension)) return 'presentation';
  return 'document';
}

export function sentAttachmentDetail(
  attachment: Pick<MessageAttachment, 'fileName' | 'fileSize'>,
): string | null {
  const extension = extensionOf(attachment.fileName);
  const parts = [
    extension ? (TYPE_WORDS[extension] ?? extension.toUpperCase()) : null,
    typeof attachment.fileSize === 'number' && attachment.fileSize > 0
      ? formatAttachmentSize(attachment.fileSize)
      : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function sentAttachmentSource(
  attachment: Pick<MessageAttachment, 'url' | 'assetId'>,
): SentAttachmentSource | null {
  const url = attachment.url.trim();
  if (LOCAL_FILE_URI.test(url)) return { kind: 'local', uri: url };
  const stored =
    resolveGeneratedImageUri(url) ??
    (attachment.assetId ? resolveGeneratedImageUri(`/api/files/${attachment.assetId}`) : null);
  if (stored) return { kind: 'remote', url: stored };
  if (ABSOLUTE_HTTP_URL.test(url)) return { kind: 'remote', url };
  return null;
}

export const SENT_FILE_UNAVAILABLE_MESSAGE = 'This file is no longer available on this device.';

export function sentAttachmentViewerSource(
  attachment: Pick<MessageAttachment, 'url' | 'assetId' | 'fileName' | 'mimeType' | 'fileSize'>,
): FileViewerSource | null {
  const source = sentAttachmentSource(attachment);
  if (!source) return null;
  return {
    title: attachment.fileName,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    url: source.kind === 'local' ? source.uri : source.url,
    ...(typeof attachment.fileSize === 'number' && attachment.fileSize > 0
      ? { byteCount: attachment.fileSize }
      : {}),
  };
}

export function sharedAttachmentsNotCopied(
  metadata: Record<string, unknown> | undefined,
): MessageSharedAttachment[] {
  const value = metadata?.['sharedAttachments'];
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown): MessageSharedAttachment[] => {
    const name =
      entry && typeof entry === 'object' ? (entry as { name?: unknown }).name : undefined;
    return typeof name === 'string' && name.trim() ? [{ name: name.trim() }] : [];
  });
}
