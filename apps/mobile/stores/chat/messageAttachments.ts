import {
  PERSISTED_METADATA_MAX_ATTACHMENTS,
  durableAttachmentDescriptors,
  readPersistedAttachments,
  type DurableChatAttachment,
} from '@agiworkforce/cloud-contracts';
import type { ChatMessage, MessageAttachment } from '@/types/chat';

export function persistedAttachmentMetadata(
  attachments: readonly MessageAttachment[] | undefined,
): DurableChatAttachment[] | undefined {
  const durable = durableAttachmentDescriptors(
    attachments?.map((attachment) => ({
      id: attachment.assetId ?? '',
      assetId: attachment.assetId,
      type: attachment.mimeType.startsWith('image/') ? ('image' as const) : ('file' as const),
      name: attachment.fileName,
      size: attachment.fileSize,
      mimeType: attachment.mimeType,
      url: attachment.url.startsWith('/') ? attachment.url : undefined,
    })),
  );
  return durable?.slice(0, PERSISTED_METADATA_MAX_ATTACHMENTS);
}

export function attachmentsFromPersistedMetadata(
  metadata: unknown,
): MessageAttachment[] | undefined {
  const raw =
    typeof metadata === 'object' && metadata !== null
      ? (metadata as Record<string, unknown>)['attachments']
      : undefined;
  const persisted = readPersistedAttachments(raw);
  if (!persisted) return undefined;
  return persisted.map((attachment) => ({
    url: attachment.url ?? '',
    mimeType:
      attachment.mimeType ?? (attachment.type === 'image' ? 'image/*' : 'application/octet-stream'),
    fileName: attachment.name,
    ...(attachment.size !== undefined ? { fileSize: attachment.size } : {}),
    assetId: attachment.assetId,
  }));
}

export function withPersistedAttachments(message: ChatMessage): ChatMessage {
  if (message.role !== 'user') return message;
  const attachments = attachmentsFromPersistedMetadata(message.metadata);
  return attachments ? { ...message, attachments } : message;
}
