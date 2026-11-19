import { logger } from '@/lib/logger';
import { isJsonObject, jsonObjectOf } from '@/lib/server/jsonb-object-merge';

export function withObjectMessageMetadata<T extends { id: string; metadata?: unknown }>(
  message: T,
  owner: { userId: string; conversationId: string },
): T {
  const metadata: unknown = message.metadata;
  if (metadata === null || metadata === undefined || isJsonObject(metadata)) return message;
  logger.warn(
    {
      event: 'chat_message_metadata_not_object',
      messageId: message.id,
      conversationId: owner.conversationId,
      userId: owner.userId,
    },
    'A stored message carries metadata that is not an object; it is sent repaired',
  );
  return { ...message, metadata: jsonObjectOf(metadata) };
}
