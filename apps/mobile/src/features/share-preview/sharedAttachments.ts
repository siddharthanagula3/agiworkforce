import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { stageComposerAttachments } from '@/src/features/chat/composerHandoff';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';

export interface SharedFile {
  uri: string;
  fileName: string;
  mimeType: string;
  byteSize?: number;
}

export function normalizeSharedFile(raw: unknown): SharedFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const file = raw as Record<string, unknown>;
  const uri = typeof file.uri === 'string' ? file.uri.trim() : '';
  const fileName = typeof file.fileName === 'string' ? file.fileName.trim() : '';
  const mimeType = typeof file.mimeType === 'string' ? file.mimeType.trim() : '';
  if (!uri.startsWith('file://') || !fileName) return null;
  const byteSize =
    typeof file.byteSize === 'number' && file.byteSize > 0 ? file.byteSize : undefined;
  return {
    uri,
    fileName,
    mimeType: mimeType || 'application/octet-stream',
    ...(byteSize ? { byteSize } : {}),
  };
}

/**
 * The Android share rewrite carries the files it copied out of the content
 * provider as a JSON array on the deep link, because the read grant on the
 * original content:// URI does not survive the rewrite.
 */
export function parseSharedFilesParam(raw: string | undefined | null): SharedFile[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeSharedFile).filter((file): file is SharedFile => file !== null);
}

export function sharedFilesToAttachments(files: SharedFile[]): Attachment[] {
  return files.map((file) => ({
    id: `share-${uuidv7()}`,
    uri: file.uri,
    mimeType: file.mimeType,
    fileName: file.fileName,
    ...(file.byteSize ? { fileSize: file.byteSize } : {}),
  }));
}

export function stageSharedFileAttachments(files: SharedFile[]): string | null {
  const attachments = sharedFilesToAttachments(files);
  if (attachments.length === 0) return null;
  const key = `share:${uuidv7()}`;
  stageComposerAttachments(key, attachments);
  return key;
}
