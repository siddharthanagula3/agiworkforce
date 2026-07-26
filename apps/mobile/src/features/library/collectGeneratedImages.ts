/**
 * Derives the list of generated images shown in the Library tab directly from
 * the existing chat message stores — there is no separate generated-image
 * store on mobile, so this reads the same ChatMessage records the chat screen
 * renders (message.type === 'image') rather than persisting a second copy.
 */
import type { ChatMessage, ConversationSummary } from '@/types/chat';
import { getDurableGeneratedImagePath } from '@/src/features/image/services/imagegen';

export interface LibraryImage {
  id: string;
  conversationId: string;
  imageUrl: string;
  prompt?: string;
  createdAt: string;
  sourceLabel: string;
}

export function collectGeneratedImages(
  conversations: ConversationSummary[],
  messagesByConversation: Record<string, ChatMessage[]>,
): LibraryImage[] {
  const conversationTitleById = new Map(conversations.map((c) => [c.id, c.title || 'Chat']));
  const images: LibraryImage[] = [];

  for (const conversation of conversations) {
    const messages = messagesByConversation[conversation.id] ?? [];
    for (const message of messages) {
      if (message.type !== 'image' || !message.imageUrl) continue;
      if (message.imageGenStatus === 'failed') continue;
      const durablePath =
        message.imageGenPersisted === false
          ? null
          : getDurableGeneratedImagePath({ url: message.imageUrl });
      if (!durablePath) continue;
      images.push({
        id: message.id,
        conversationId: conversation.id,
        imageUrl: durablePath,
        prompt: message.imageGenPrompt ?? message.revisedPrompt,
        createdAt: message.createdAt,
        sourceLabel: conversationTitleById.get(conversation.id) ?? 'Chat',
      });
    }
  }

  return images.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
