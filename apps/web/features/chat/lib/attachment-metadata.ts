import { stripImageMetadata } from '@agiworkforce/utils';
import {
  isChatImageMimeType,
  resolveChatAttachmentMimeType,
  unavailableChatAttachmentNote,
  type UnavailableChatAttachment,
} from '@/lib/chat-attachment-policy';

export const PICTURE_METADATA_REFUSAL = 'picture_metadata';

export type ChatDraftRefusal =
  UnavailableChatAttachment | { filename: string; reason: typeof PICTURE_METADATA_REFUSAL };

export type PreparedChatAttachment =
  { status: 'ready'; file: File } | { status: 'refused'; reason: typeof PICTURE_METADATA_REFUSAL };

export function pictureMetadataRefusalNotice(filename: string): string {
  return `"${filename}" was not attached. The location and camera details in a picture are removed before it leaves your device, and this file could not be read well enough to do that. Save a copy from a photo app and attach that instead.`;
}

export function pictureMetadataUploadRefusal(filename: string): string {
  return `"${filename}" was not uploaded. The location and camera details in a picture are removed before it leaves your device, and this file could not be read well enough to do that. Save a copy from a photo app and upload that instead.`;
}

function pictureMetadataRefusalNote(filename: string): string {
  return `[attachment unavailable: ${filename} could not be sent because the location and camera details in it could not be removed.]`;
}

/** The lines a draft's refusals add to the turn, in the order they happened. */
export function chatDraftRefusalNotes(refusals: readonly ChatDraftRefusal[]): string[] {
  return refusals.map((refusal) =>
    refusal.reason === PICTURE_METADATA_REFUSAL
      ? pictureMetadataRefusalNote(refusal.filename)
      : unavailableChatAttachmentNote(refusal.filename, refusal.reason),
  );
}

function readFileBytes(file: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('The picture could not be read.'));
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) resolve(new Uint8Array(result));
      else reject(new Error('The picture could not be read.'));
    };
    reader.readAsArrayBuffer(file);
  });
}

export function carriesPictureMetadata(file: File): boolean {
  return isChatImageMimeType(resolveChatAttachmentMimeType(file.name, file.type) ?? '');
}

/**
 * Every picture the web sends passes here first. Documents are handed back
 * untouched; a picture whose structure will not parse is refused rather than
 * sent carrying whatever was in it.
 */
export async function prepareChatAttachment(file: File): Promise<PreparedChatAttachment> {
  if (!carriesPictureMetadata(file)) return { status: 'ready', file };

  let bytes: Uint8Array;
  try {
    bytes = await readFileBytes(file);
  } catch {
    return { status: 'refused', reason: PICTURE_METADATA_REFUSAL };
  }

  const result = stripImageMetadata(bytes);
  if (result.status !== 'stripped') return { status: 'refused', reason: PICTURE_METADATA_REFUSAL };

  return {
    status: 'ready',
    file: new File([result.bytes], file.name, { type: file.type }),
  };
}

export async function prepareChatAttachments(
  files: readonly File[],
): Promise<{ accepted: File[]; refused: ChatDraftRefusal[] }> {
  const prepared = await Promise.all(files.map((file) => prepareChatAttachment(file)));
  const accepted: File[] = [];
  const refused: ChatDraftRefusal[] = [];
  prepared.forEach((result, index) => {
    if (result.status === 'ready') {
      accepted.push(result.file);
      return;
    }
    refused.push({ filename: files[index]?.name ?? '', reason: PICTURE_METADATA_REFUSAL });
  });
  return { accepted, refused };
}
