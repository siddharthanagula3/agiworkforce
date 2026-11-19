import type { ChatMessage, ConversationSummary } from '@/types/chat';
import {
  getDurableGeneratedImageAssetId,
  getDurableGeneratedImagePath,
} from '@/src/features/image/services/imagegen';

export interface LibraryImage {
  id: string;
  assetId: string;
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
      const assetId = durablePath ? getDurableGeneratedImageAssetId(durablePath) : null;
      if (!durablePath || !assetId) continue;
      images.push({
        id: message.id,
        assetId,
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
