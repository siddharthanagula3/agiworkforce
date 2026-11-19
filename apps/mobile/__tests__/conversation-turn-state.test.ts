import { isImageGenerationChat, turnEndedCleanly } from '../stores/chat/conversationTurnState';
import type { ChatMessage } from '../types/chat';

function answer(extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'a1',
    role: 'assistant',
    content: 'Tulips need a cold winter to flower in spring.',
    createdAt: '2026-11-14T00:00:00.000Z',
    ...extra,
  };
}

describe('whether a turn ended cleanly enough to offer follow-ups', () => {
  it('offers them under a finished answer', () => {
    expect(turnEndedCleanly(answer())).toBe(true);
    expect(turnEndedCleanly(answer({ metadata: { finishReason: 'stop' } }))).toBe(true);
  });

  it.each(['stopped', 'cancelled', 'length', 'refusal', 'content_filter'])(
    'withholds them when the answer ended with %s',
    (finishReason) => {
      expect(turnEndedCleanly(answer({ metadata: { finishReason } }))).toBe(false);
    },
  );

  it('withholds them under a failed answer', () => {
    expect(
      turnEndedCleanly(answer({ metadata: { streamError: { message: 'Something went wrong.' } } })),
    ).toBe(false);
    expect(turnEndedCleanly(answer({ status: 'error' }))).toBe(false);
  });
});

describe('whether a chat is an image-generation chat', () => {
  it('is when every answer is an image', () => {
    expect(
      isImageGenerationChat([
        answer({ id: 'u', role: 'user', content: 'a red fox' }),
        answer({ type: 'image', imageGenStatus: 'completed' }),
      ]),
    ).toBe(true);
  });

  it('is not when any answer is text, or when there is no answer yet', () => {
    expect(isImageGenerationChat([answer({ type: 'image' }), answer({ id: 'a2' })])).toBe(false);
    expect(isImageGenerationChat([answer({ id: 'u', role: 'user' })])).toBe(false);
  });
});
