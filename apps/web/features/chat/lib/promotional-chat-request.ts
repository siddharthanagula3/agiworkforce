import type { ApiContentPart } from './persisted-attachments';

interface RequestMessage {
  role: string;
  content: string | ApiContentPart[];
}

const OMITTED_ATTACHMENT_NOTE =
  '[An attachment in this earlier message is unavailable to this text-only model.]';

export function normalizePromotionalChatHistory<T extends RequestMessage>(messages: T[]): T[] {
  const currentUserIndex = messages.findLastIndex((message) => message.role === 'user');
  return messages.map((message, index) => {
    if (typeof message.content === 'string' || index === currentUserIndex) return message;
    const text = message.content
      .filter((part): part is Extract<ApiContentPart, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
    const omitted = message.content.some((part) => part.type !== 'text');
    return {
      ...message,
      content: omitted ? [text, OMITTED_ATTACHMENT_NOTE].filter(Boolean).join('\n') : text,
    };
  });
}
