import type { Message } from '@/shared/stores/web-chat-store';

export type ApiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { asset_id: string } };

export {
  durableAttachmentDescriptors,
  readPersistedAttachments,
} from '@agiworkforce/cloud-contracts';

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

const MAX_CREATED_FILE_REFERENCES = 20;
const MAX_CREATED_FILE_NAME_CHARS = 200;

function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_CREATED_FILE_NAME_CHARS);
}

/**
 * Sent as a turn of its own after the reply, never inside the reply's text: a
 * line in the model's own words is one it learns to write into later replies.
 * The model chose each name, so a name travels quoted, as data, inside a turn
 * that otherwise carries the user's authority.
 */
export function createdFilesHistoryTurn(
  message: Message,
): { role: 'user'; content: string } | null {
  if (message.role !== 'assistant') return null;
  const files = message.metadata?.generatedFiles ?? [];
  if (files.length === 0) return null;
  const listed = files.slice(0, MAX_CREATED_FILE_REFERENCES).map((file) => {
    const format = file.kind && file.kind !== 'other' ? file.kind : file.mimeType;
    return `${JSON.stringify(singleLine(file.fileName))} (format: ${singleLine(format)}, file id: ${singleLine(file.id)})`;
  });
  const unlisted = files.length - listed.length;
  if (unlisted > 0) listed.push(`and ${unlisted} more`);
  return {
    role: 'user',
    content: `The previous assistant reply created these files: ${listed.join('; ')}.`,
  };
}
