import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { stageComposerAttachments } from '@/src/features/chat/composerHandoff';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import type { IOSPendingShareFile } from './iosShareInbox';

export function sharedFilesToAttachments(files: IOSPendingShareFile[]): Attachment[] {
  return files.map((file) => ({
    id: `share-${uuidv7()}`,
    uri: file.uri,
    mimeType: file.mimeType,
    fileName: file.fileName,
    ...(file.byteSize ? { fileSize: file.byteSize } : {}),
  }));
}

export function stageSharedFileAttachments(files: IOSPendingShareFile[]): string | null {
  const attachments = sharedFilesToAttachments(files);
  if (attachments.length === 0) return null;
  const key = `share:${uuidv7()}`;
  stageComposerAttachments(key, attachments);
  return key;
}
