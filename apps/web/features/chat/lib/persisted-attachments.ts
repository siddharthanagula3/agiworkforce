import type { Attachment, Message } from '@/shared/stores/web-chat-store';

type ApiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { asset_id: string } };

export function durableAttachmentDescriptors(
  attachments: Attachment[] | undefined,
): Attachment[] | undefined {
  const durable = (attachments ?? [])
    .filter((attachment) => Boolean(attachment.assetId))
    .map((attachment) => ({
      id: attachment.id,
      assetId: attachment.assetId,
      type: attachment.type,
      name: attachment.name,
      size: attachment.size,
      mimeType: attachment.mimeType,
      url: attachment.url,
    }));
  return durable.length ? durable : undefined;
}

export function readPersistedAttachments(value: unknown): Attachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const attachments: Attachment[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate['id'] !== 'string' ||
      typeof candidate['assetId'] !== 'string' ||
      (candidate['type'] !== 'image' && candidate['type'] !== 'file') ||
      typeof candidate['name'] !== 'string'
    ) {
      continue;
    }
    attachments.push({
      id: candidate['id'],
      assetId: candidate['assetId'],
      type: candidate['type'],
      name: candidate['name'],
      size: typeof candidate['size'] === 'number' ? candidate['size'] : undefined,
      mimeType: typeof candidate['mimeType'] === 'string' ? candidate['mimeType'] : undefined,
      url: typeof candidate['url'] === 'string' ? candidate['url'] : undefined,
    });
  }
  return attachments.length ? attachments : undefined;
}

export function buildApiMessageContent(message: Message): string | ApiContentPart[] {
  if (!message.attachments?.length) return message.content;
  const parts: ApiContentPart[] = [];
  if (message.content.trim()) parts.push({ type: 'text', text: message.content });

  for (const attachment of message.attachments) {
    if (attachment.assetId) {
      parts.push({ type: 'file', file: { asset_id: attachment.assetId } });
    } else if (attachment.type === 'image' && attachment.content) {
      parts.push({ type: 'image_url', image_url: { url: attachment.content } });
    }
  }

  return parts.length ? parts : message.content;
}
