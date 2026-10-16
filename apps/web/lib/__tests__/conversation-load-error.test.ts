import { describe, expect, it, vi } from 'vitest';
import {
  CONVERSATION_NOT_FOUND_MESSAGE,
  conversationUnavailableToastOptions,
} from '@/lib/conversation-load-error';

describe('conversationUnavailableToastOptions', () => {
  it('offers no Retry for a conversation that does not exist and keeps the notice up long enough to read', () => {
    const retry = vi.fn();
    const options = conversationUnavailableToastOptions(
      CONVERSATION_NOT_FOUND_MESSAGE,
      'missing-chat',
      retry,
    );

    expect(options).toEqual({ id: 'conversation-unavailable-missing-chat', duration: 8_000 });
    expect(options.action).toBeUndefined();
  });

  it('keeps Retry for a load that failed for another reason', () => {
    const retry = vi.fn();
    const options = conversationUnavailableToastOptions(
      "Couldn't load this conversation. Check your connection and try again.",
      'chat-1',
      retry,
    );

    expect(options.id).toBe('conversation-unavailable-chat-1');
    expect(options.duration).toBeUndefined();
    const action = options.action as { label: string; onClick: () => void };
    expect(action.label).toBe('Retry');
    action.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
