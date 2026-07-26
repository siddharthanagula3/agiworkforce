import { collectGeneratedImages } from '../src/features/library/collectGeneratedImages';
import type { ChatMessage, ConversationSummary } from '../types/chat';

const conversation: ConversationSummary = {
  id: 'conversation-1',
  title: 'Enterprise launch',
  createdAt: '2026-07-26T10:00:00.000Z',
  updatedAt: '2026-07-26T10:05:00.000Z',
  messageCount: 1,
  pinned: false,
  executionMode: 'cloud',
};

describe('generated-image Library projection', () => {
  it('restores a durable cloud image from a rehydrated transcript', () => {
    const message: ChatMessage = {
      id: 'message-1',
      conversationId: conversation.id,
      role: 'assistant',
      content: 'Generated image',
      createdAt: '2026-07-26T10:04:00.000Z',
      type: 'image',
      imageUrl: '/api/files/22222222-2222-4222-8222-222222222222',
      imageGenPersisted: true,
      imageGenStatus: 'completed',
      imageGenPrompt: 'A polished enterprise launch',
    };

    expect(collectGeneratedImages([conversation], { [conversation.id]: [message] })).toEqual([
      expect.objectContaining({
        id: 'message-1',
        imageUrl: '/api/files/22222222-2222-4222-8222-222222222222',
        prompt: 'A polished enterprise launch',
        sourceLabel: 'Enterprise launch',
      }),
    ]);
  });

  it('never promotes a session-only data URL or external provider URL into Library', () => {
    const ephemeral = (imageUrl: string): ChatMessage => ({
      id: imageUrl,
      conversationId: conversation.id,
      role: 'assistant',
      content: 'Generated image',
      createdAt: '2026-07-26T10:04:00.000Z',
      type: 'image',
      imageUrl,
      imageGenPersisted: false,
      imageGenStatus: 'completed',
    });

    expect(
      collectGeneratedImages([conversation], {
        [conversation.id]: [
          ephemeral('data:image/png;base64,abc123'),
          ephemeral('https://provider.example/image.png'),
        ],
      }),
    ).toEqual([]);
  });
});
