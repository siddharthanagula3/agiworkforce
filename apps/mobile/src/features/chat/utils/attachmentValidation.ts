import { chatAttachmentMaxBytes, isChatImageMimeType } from '@agiworkforce/cloud-contracts';
import {
  DENIED_ATTACHMENT_EXTENSIONS,
  DENIED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES as MAX_DEVICE_ATTACHMENT_BYTES,
  getHarnessMediaInput,
  getModelMetadataById,
  getRegistryRoute,
  listManagedRoutesForModel,
  OFFICE_ATTACHMENT_EXTENSIONS,
  OFFICE_ATTACHMENT_MIME_TYPES,
} from '@agiworkforce/types';
import { isParseableDocument } from '@/services/docParser';
import { isHeicImage } from '@/src/features/media/image-normalization';
import { currentAttachmentLimits } from '@/src/features/chat/upload/attachmentLimits';
import { formatAttachmentSize } from './attachmentSize';
import { photoSelectionLimitForPlan } from './photoSelectionLimit';

export type AttachmentDestination = 'local' | 'cloud';

/**
 * Local mode parses a document on the phone by reading the whole file into
 * the JavaScript heap (services/docParser), so this ceiling is bounded by
 * device memory rather than by the upload contract.
 */
export const MAX_ATTACHMENT_BYTES = MAX_DEVICE_ATTACHMENT_BYTES;

export interface AttachmentLimits {
  fileBytes: (mimeType: string) => number;
  filesPerMessage: number | null;
  messageBytes: number | null;
}

export function attachmentLimitsFor(
  destination: AttachmentDestination,
  planTier?: string | null,
): AttachmentLimits {
  if (destination === 'local') {
    return { fileBytes: () => MAX_ATTACHMENT_BYTES, filesPerMessage: null, messageBytes: null };
  }
  const limits = currentAttachmentLimits();
  return {
    fileBytes: (mimeType) =>
      Math.min(MAX_ATTACHMENT_BYTES, chatAttachmentMaxBytes(mimeType, limits)),
    filesPerMessage: Math.min(limits.maxFilesPerMessage, photoSelectionLimitForPlan(planTier)),
    messageBytes: limits.maxMessageBytes,
  };
}

export function maxAttachmentBytesFor(destination: AttachmentDestination, mimeType = ''): number {
  return attachmentLimitsFor(destination).fileBytes(mimeType);
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

function isDeniedAttachment(a: ValidatableAttachment): boolean {
  const extension = a.fileName.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = (a.mimeType.split(';', 1)[0] ?? '').trim().toLowerCase();
  return (
    DENIED_ATTACHMENT_MIME_TYPES.includes(mimeType) ||
    DENIED_ATTACHMENT_EXTENSIONS.includes(extension)
  );
}

function isOfficeDocument(a: ValidatableAttachment): boolean {
  const extension = a.fileName.split('.').pop()?.toLowerCase() ?? '';
  return (
    OFFICE_ATTACHMENT_MIME_TYPES.includes(a.mimeType.toLowerCase()) ||
    OFFICE_ATTACHMENT_EXTENSIONS.includes(extension)
  );
}

/**
 * @param destination where the send will put this file, pass the live
 * `appMode`. Defaults to the stricter `'cloud'` ceiling so that a caller which
 * has not resolved its destination is never the reason an unsendable file gets
 * staged. The production caller (ChatInput) always passes it.
 */
export function isAcceptableAttachment(
  a: ValidatableAttachment,
  destination: AttachmentDestination = 'cloud',
): true | string {
  if (a.pastedText != null) return true;
  if (a.fileSize === 0) return `“${a.fileName}” is empty.`;
  const maxBytes = maxAttachmentBytesFor(destination, a.mimeType);
  if (typeof a.fileSize === 'number' && a.fileSize > maxBytes) {
    const limit = formatAttachmentSize(maxBytes);
    if (destination === 'local') return `“${a.fileName}” is too large (max ${limit}).`;
    return a.mimeType.toLowerCase().startsWith('image/')
      ? `“${a.fileName}” is too large for AGI Cloud (images up to ${limit}).`
      : `“${a.fileName}” is too large for AGI Cloud (max ${limit}).`;
  }
  if (isDeniedAttachment(a)) {
    return `“${a.fileName}” isn’t an accepted file type. Attach a JPEG, PNG, GIF, or WebP image instead.`;
  }
  if (a.mimeType.startsWith('image/')) {
    if (destination === 'cloud' && !isChatImageMimeType(a.mimeType)) {
      return isHeicImage(a.mimeType, a.fileName)
        ? `“${a.fileName}” is a HEIC photo AGI Cloud can’t read, so retake it with the in-app camera.`
        : `“${a.fileName}” is an image format AGI Cloud cannot read. Attach a JPEG, PNG, GIF, or WebP.`;
    }
    return true;
  }
  if (isParseableDocument(a.uri, a.mimeType)) return true;
  if (destination === 'cloud' && isOfficeDocument(a)) return true;
  return destination === 'cloud'
    ? `“${a.fileName}” isn’t a supported file type. Try an image, PDF, Word, Excel, PowerPoint, text, CSV, Markdown, or code file.`
    : `“${a.fileName}” isn’t supported on this device; switch to AGI Cloud for Office files.`;
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

export function admitAttachments<T extends ValidatableAttachment>(
  staged: readonly ValidatableAttachment[],
  incoming: readonly T[],
  destination: AttachmentDestination,
  planTier?: string | null,
): AttachmentValidationResult<T> {
  const limits = attachmentLimitsFor(destination, planTier);
  const { accepted: readable, rejected } = validateAttachments([...incoming], destination);
  const counted = staged.filter((item) => item.pastedText == null);
  let files = counted.length;
  let bytes = counted.reduce((total, item) => total + (item.fileSize ?? 0), 0);
  const accepted: T[] = [];
  for (const item of readable) {
    if (item.pastedText != null) {
      accepted.push(item);
      continue;
    }
    if (limits.filesPerMessage !== null && files >= limits.filesPerMessage) {
      rejected.push({
        fileName: item.fileName,
        reason: `“${item.fileName}” was not added. A message can carry up to ${limits.filesPerMessage} files.`,
      });
      continue;
    }
    const size = item.fileSize ?? 0;
    if (limits.messageBytes !== null && bytes + size > limits.messageBytes) {
      rejected.push({
        fileName: item.fileName,
        reason: `“${item.fileName}” was not added. Files in one message can add up to ${formatAttachmentSize(limits.messageBytes)}.`,
      });
      continue;
    }
    files += 1;
    bytes += size;
    accepted.push(item);
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
