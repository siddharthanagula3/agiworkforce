import { MAX_CHAT_ATTACHMENT_BYTES, isChatImageMimeType } from '@agiworkforce/cloud-contracts';
import {
  getHarnessMediaInput,
  getModelMetadataById,
  getRegistryRoute,
  listManagedRoutesForModel,
  OFFICE_ATTACHMENT_EXTENSIONS,
  OFFICE_ATTACHMENT_MIME_TYPES,
} from '@agiworkforce/types';
import { isParseableDocument } from '@/services/docParser';
import { isHeicImage } from '@/src/features/media/image-normalization';

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
 * @param destination where the send will put this file, pass the live
 * `appMode`. Defaults to the stricter `'cloud'` ceiling so that a caller which
 * has not resolved its destination is never the reason an unsendable file gets
 * staged. The production caller (ChatInput) always passes it.
 */
function isOfficeDocument(a: ValidatableAttachment): boolean {
  const extension = a.fileName.split('.').pop()?.toLowerCase() ?? '';
  return (
    OFFICE_ATTACHMENT_MIME_TYPES.includes(a.mimeType.toLowerCase()) ||
    OFFICE_ATTACHMENT_EXTENSIONS.includes(extension)
  );
}

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
  if (a.mimeType.startsWith('image/')) {
    if (destination === 'cloud' && !isChatImageMimeType(a.mimeType)) {
      return isHeicImage(a.mimeType, a.fileName)
        ? `“${a.fileName}” is a HEIC photo, which AGI Cloud cannot read. Take the photo again with the in-app camera, or turn on Settings › Camera › Formats › Most Compatible.`
        : `“${a.fileName}” is an image format AGI Cloud cannot read. Attach a JPEG, PNG, GIF, or WebP.`;
    }
    return true;
  }
  if (isParseableDocument(a.uri, a.mimeType)) return true;
  if (destination === 'cloud' && isOfficeDocument(a)) return true;
  return destination === 'cloud'
    ? `“${a.fileName}” isn’t a supported file type. Try an image, PDF, Word, Excel, PowerPoint, text, CSV, Markdown, or code file.`
    : `“${a.fileName}” isn’t a supported file type on this device. Try an image, PDF, text, CSV, Markdown, or code file, or switch to AGI Cloud for Word, Excel and PowerPoint.`;
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

export function maxImagesPerMessage(modelId: string): number | null {
  const override = getModelMetadataById(modelId)?.imageInput?.maxImagesPerRequest;
  if (override !== undefined) return override;
  const route = listManagedRoutesForModel(modelId)[0];
  const harnessId = route ? getRegistryRoute(route.routeId)?.harnessId : undefined;
  return harnessId ? (getHarnessMediaInput(harnessId).maxImagesPerRequest ?? null) : null;
}

export function imageLimitRefusal(
  modelId: string,
  attachments: ReadonlyArray<Pick<ValidatableAttachment, 'mimeType'>> | undefined,
): string | null {
  const limit = maxImagesPerMessage(modelId);
  const count = attachments?.filter((a) => a.mimeType.startsWith('image/')).length ?? 0;
  if (limit === null || count <= limit) return null;
  const excess = count - limit;
  const modelName = getModelMetadataById(modelId)?.name ?? modelId;
  return `${modelName} can read up to ${limit} images in one message. Remove ${excess} ${excess === 1 ? 'image' : 'images'} to send it.`;
}
