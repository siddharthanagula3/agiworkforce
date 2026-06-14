import {
  createMessageIdSet,
  findNewAssistantResponse,
} from '@/src/features/voice/utils/assistantResponse';
import type { ChatMessage } from '@/types/chat';

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg',
    conversationId: 'conv',
    role: 'assistant',
    content: 'Answer',
    createdAt: '2026-06-11T12:00:00.000Z',
    ...overrides,
  };
}

describe('voice assistant response extraction', () => {
  it('returns only a new completed assistant response', () => {
    const previous = [message({ id: 'old', content: 'Old answer' })];
    const previousIds = createMessageIdSet(previous);

    const response = findNewAssistantResponse(
      [
        ...previous,
        message({ id: 'user', role: 'user', content: 'Question' }),
        message({ id: 'streaming', content: 'Half', isStreaming: true }),
        message({ id: 'new', content: ' Real answer ' }),
      ],
      previousIds,
    );

    expect(response).toBe('Real answer');
  });

  it('returns null instead of fabricating a spoken acknowledgement', () => {
    const previousIds = createMessageIdSet([]);
    const response = findNewAssistantResponse(
      [message({ id: 'user', role: 'user', content: 'Question' })],
      previousIds,
    );

    expect(response).toBeNull();
  });
});
