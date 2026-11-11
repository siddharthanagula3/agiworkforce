export const EMPTY_KEPT_ASSISTANT_CONTENT = String.fromCharCode(0x200b);

interface KeepableMessage {
  role: string;
  content: string;
  metadata?: object | undefined;
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function hasCompletedMediaResult(metadata: object | undefined): boolean {
  if (!metadata) return false;
  const fields = metadata as Record<string, unknown>;
  if (fields['toolType'] === 'image-generation') return hasText(fields['imageUrl']);
  if (fields['toolType'] === 'video-generation') {
    return fields['videoStatus'] === 'completed' && hasText(fields['videoUrl']);
  }
  return false;
}

export function isKeepableChatMessage(message: KeepableMessage): boolean {
  if (message.content.trim().length > 0) return true;
  return message.role === 'assistant' && hasCompletedMediaResult(message.metadata);
}

export function keptMessageContent(message: KeepableMessage): string {
  const content = message.content.trim();
  return content.length > 0 ? content : EMPTY_KEPT_ASSISTANT_CONTENT;
}
